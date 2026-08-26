using System.IO.Compression;
using System.Text.Json;
using Microsoft.Playwright;

namespace ERPPrototype.E2ETests;

internal static class FinancialDiagnosticRunner
{
    private const int FixedPort = 5265;
    private const string DefaultGatePath = "/work-orders-revogrid-gate5b5";
    private const string HostId = "revogrid-native-gate5a-grid";

    public static async Task<int> RunAsync(
        string gatePath = DefaultGatePath,
        bool unifiedValidation = false)
    {
        var projectRoot = FindProjectRoot();
        var artifactDirectory = E2EArtifactManager.CreateRunDirectory(projectRoot);
        var observationsPath = Path.Combine(
            artifactDirectory,
            unifiedValidation
                ? "gate5b6-unified-validation-diagnostic.json"
                : "remaining-amount-financial-diagnostic.json");
        var failure = false;
        var observations = new List<JsonElement>();

        Console.WriteLine(unifiedValidation
            ? "RevoGrid Gate 5B-6 unified validation real-browser diagnostic"
            : "RevoGrid Remaining Amount real-browser financial diagnostic");
        Console.WriteLine($"Application port: {FixedPort}");
        Console.WriteLine($"Artifacts: {artifactDirectory}");

        try
        {
            await using var database = await E2ETestDatabase.CreateAsync(
                keepDatabase: false,
                rowsPerYear: unifiedValidation
                    ? 10_000
                    : E2ETestDatabase.DefaultRowsPerYear);
            await using var application = await WebApplicationProcess.StartAsync(
                projectRoot,
                database.ConnectionString,
                artifactDirectory,
                fixedPort: FixedPort,
                configuration: "Debug");
            await using var browser = await E2EBrowserSession.CreateAsync(
                application.BaseUri,
                artifactDirectory,
                headed: true,
                traceEnabled: true,
                viewportWidth: 1440,
                viewportHeight: 1000,
                windowWidth: 1500,
                windowHeight: 1050,
                screenWidth: 1920,
                screenHeight: 1080);

            var page = browser.Page;

            try
            {
            await page.Context.GrantPermissionsAsync(
                ["clipboard-read", "clipboard-write"],
                new BrowserContextGrantPermissionsOptions
                {
                    Origin = application.BaseUri.ToString().TrimEnd('/')
                });

            var loginPage = new LoginPage(page, application.BaseUri);
            await loginPage.OpenAsync(gatePath);
            await loginPage.LoginAsync(database.Seed);
            await page.WaitForURLAsync(
                $"**{gatePath}*",
                new PageWaitForURLOptions { Timeout = 45_000 });
            await page.Locator($"#{HostId} revo-grid").WaitForAsync(
                new LocatorWaitForOptions
                {
                    State = WaitForSelectorState.Visible,
                    Timeout = 45_000
                });

            await InstallRecorderAsync(page);
            var sourcePayload = await GetSourcePayloadAsync(page);
            if (!TryExtractSourceRows(
                    sourcePayload,
                    out var source,
                    out var sourceEvidenceFailure))
            {
                failure = true;
                await WriteEvidenceFailureAsync(
                    observationsPath,
                    browser,
                    sourcePayload,
                    sourceEvidenceFailure);
                return 1;
            }

            var targetClientKey = GetClientKey(source[0]);
            var secondClientKey = GetClientKey(source[1]);
            var thirdClientKey = GetClientKey(source[2]);
            var workOrderValueColumn =
                await GetVisualColumnIndexAsync(page, "workOrderValue");
            var partialAmountColumn =
                await GetVisualColumnIndexAsync(page, "partialAmount");
            var remainingAmountColumn =
                await GetVisualColumnIndexAsync(page, "remainingAmount");

            // Establish the concrete 100,000-value fixture through real cell edits.
            await EditCellAsync(page, 0, workOrderValueColumn, "100000");
            await EditCellAsync(page, 1, workOrderValueColumn, "100000");
            await EditCellAsync(page, 2, workOrderValueColumn, "100000");

            await EditCellAsync(page, 0, partialAmountColumn, "20000");
            observations.Add(await CaptureAsync(
                page,
                targetClientKey,
                "partial-20000",
                new Dictionary<string, decimal>
                {
                    [targetClientKey] = 80_000m
                }));

            await EditCellAsync(page, 0, partialAmountColumn, "30000");
            observations.Add(await CaptureAsync(
                page,
                targetClientKey,
                "partial-30000",
                new Dictionary<string, decimal>
                {
                    [targetClientKey] = 70_000m
                }));

            await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
            await page.WaitForTimeoutAsync(500);
            observations.Add(await CaptureAsync(
                page,
                targetClientKey,
                "undo",
                new Dictionary<string, decimal>
                {
                    [targetClientKey] = 80_000m
                }));

            await page.Locator("#revogrid-gate5b1-redo").ClickAsync();
            await page.WaitForTimeoutAsync(500);
            observations.Add(await CaptureAsync(
                page,
                targetClientKey,
                "redo",
                new Dictionary<string, decimal>
                {
                    [targetClientKey] = 70_000m
                }));

            await EditCellAsync(page, 0, partialAmountColumn, string.Empty);
            observations.Add(await CaptureAsync(
                page,
                targetClientKey,
                "partial-empty",
                new Dictionary<string, decimal>
                {
                    [targetClientKey] = 100_000m
                }));

            await EditCellAsync(page, 0, partialAmountColumn, "0");
            await AssertFinancialStateAsync(
                page,
                targetClientKey,
                expectedPartial: "",
                expectedRemaining: "100000",
                expectInvalid: false);

            await EditCellAsync(page, 0, partialAmountColumn, "-500");
            await AssertFinancialStateAsync(
                page,
                targetClientKey,
                expectedPartial: "-500",
                expectedRemaining: null,
                expectInvalid: true);

            await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
            await page.WaitForTimeoutAsync(500);
            await AssertFinancialStateAsync(
                page,
                targetClientKey,
                expectedPartial: "",
                expectedRemaining: "100000",
                expectInvalid: false);

            await page.Locator("#revogrid-gate5b1-redo").ClickAsync();
            await page.WaitForTimeoutAsync(500);
            await AssertFinancialStateAsync(
                page,
                targetClientKey,
                expectedPartial: "-500",
                expectedRemaining: null,
                expectInvalid: true);

            await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
            await page.WaitForTimeoutAsync(500);

            await EditCellAsync(page, 1, workOrderValueColumn, "0");
            await AssertFinancialStateAsync(
                page,
                secondClientKey,
                expectedPartial: "",
                expectedRemaining: null,
                expectInvalid: true);

            await EditCellAsync(page, 2, workOrderValueColumn, "-1000");
            await EditCellAsync(page, 2, partialAmountColumn, "20000");
            await AssertFinancialStateAsync(
                page,
                thirdClientKey,
                expectedPartial: "20000",
                expectedRemaining: null,
                expectInvalid: true);

            await EditCellAsync(page, 0, workOrderValueColumn, "100000");
            await EditCellAsync(page, 1, workOrderValueColumn, "100000");
            await EditCellAsync(page, 2, workOrderValueColumn, "100000");
            await EditCellAsync(page, 2, partialAmountColumn, string.Empty);

            await PrepareClipboardAsync(
                page,
                startVisibleRow: 0,
                column: partialAmountColumn,
                "0\n-500\n120000");
            await page.Keyboard.PressAsync("Control+V");
            await page.WaitForTimeoutAsync(750);
            await AssertFinancialStateAsync(
                page,
                targetClientKey,
                expectedPartial: "",
                expectedRemaining: "100000",
                expectInvalid: false);
            await AssertFinancialStateAsync(
                page,
                secondClientKey,
                expectedPartial: "-500",
                expectedRemaining: null,
                expectInvalid: true);
            await AssertFinancialStateAsync(
                page,
                thirdClientKey,
                expectedPartial: "120000",
                expectedRemaining: null,
                expectInvalid: true);
            observations.Add(await CaptureAsync(
                page,
                targetClientKey,
                "paste-partial-three-rows",
                new Dictionary<string, decimal>
                {
                    [targetClientKey] = 100_000m
                }));

            await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
            await page.WaitForTimeoutAsync(500);
            await AssertFinancialStateAsync(
                page,
                targetClientKey,
                expectedPartial: "",
                expectedRemaining: "100000",
                expectInvalid: false);
            await AssertFinancialStateAsync(
                page,
                secondClientKey,
                expectedPartial: "",
                expectedRemaining: "100000",
                expectInvalid: false);
            await AssertFinancialStateAsync(
                page,
                thirdClientKey,
                expectedPartial: "",
                expectedRemaining: "100000",
                expectInvalid: false);

            await page.Locator("#revogrid-gate5b1-redo").ClickAsync();
            await page.WaitForTimeoutAsync(500);
            await AssertFinancialStateAsync(
                page,
                secondClientKey,
                expectedPartial: "-500",
                expectedRemaining: null,
                expectInvalid: true);

            if (unifiedValidation)
            {
                // Put the sheet back into a fully valid state before testing
                // whether identity validation alone blocks Save. Otherwise a
                // pre-existing financial error can make canSave=false and hide
                // a broken identity Save gate.
                await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
                await page.WaitForTimeoutAsync(500);
                await AssertFinancialStateAsync(
                    page,
                    targetClientKey,
                    expectedPartial: "",
                    expectedRemaining: "100000",
                    expectInvalid: false);
                await AssertFinancialStateAsync(
                    page,
                    secondClientKey,
                    expectedPartial: "",
                    expectedRemaining: "100000",
                    expectInvalid: false);
                await AssertFinancialStateAsync(
                    page,
                    thirdClientKey,
                    expectedPartial: "",
                    expectedRemaining: "100000",
                    expectInvalid: false);
                await AssertUnifiedValidationCleanBaselineAsync(page);
            }

            observations.Add(await CaptureReadonlyAttemptAsync(
                page,
                targetClientKey,
                remainingAmountColumn));

            if (unifiedValidation)
            {
                await AssertUnifiedIdentityValidationAsync(
                    page,
                    targetClientKey,
                    secondClientKey);
                await AssertUnifiedDuplicateValidationAsync(
                    page,
                    targetClientKey,
                    secondClientKey);
            }

            var report = new
            {
                generatedAtUtc = DateTime.UtcNow,
                database = database.DatabaseName,
                application = application.BaseUri.ToString(),
                observations,
                browserDiagnostics = await ReadBrowserDiagnosticsAsync(browser.Diagnostics)
            };
            await File.WriteAllTextAsync(
                observationsPath,
                JsonSerializer.Serialize(
                    report,
                    new JsonSerializerOptions { WriteIndented = true }));

            Console.WriteLine($"Financial observations: {observationsPath}");
            Console.WriteLine(
                "First divergence: " +
                FindFirstDivergence(observations));

            try
            {
                browser.Diagnostics.AssertNoCriticalErrors();
            }
            catch (Exception exception)
            {
                failure = true;
                Console.Error.WriteLine(exception.Message);
            }

            await browser.CaptureSuccessAsync(
                unifiedValidation
                    ? "gate5b6-unified-validation-diagnostic"
                    : "remaining-amount-financial-diagnostic",
                preserveTrace: true);
            }
            catch
            {
                await browser.CaptureFailureAsync(
                    unifiedValidation
                        ? "gate5b6-unified-validation-diagnostic"
                        : "remaining-amount-financial-diagnostic");
                throw;
            }
        }
        catch (Exception exception)
        {
            failure = true;
            Console.Error.WriteLine(exception);
            await File.WriteAllTextAsync(
                observationsPath,
                JsonSerializer.Serialize(
                    new
                    {
                        generatedAtUtc = DateTime.UtcNow,
                        observations,
                        failure = exception.ToString()
                    },
                    new JsonSerializerOptions { WriteIndented = true }));
        }

        if (unifiedValidation)
        {
            var desktop = Environment.GetFolderPath(
                Environment.SpecialFolder.DesktopDirectory);
            var bundlePath = Path.Combine(
                desktop,
                $"ERP_REVO_GATE5B6_VALIDATION_{DateTime.Now:yyyyMMdd-HHmmss}.zip");
            if (File.Exists(bundlePath))
            {
                File.Delete(bundlePath);
            }
            ZipFile.CreateFromDirectory(artifactDirectory, bundlePath);
            Console.WriteLine();
            Console.WriteLine("READY TO UPLOAD:");
            Console.WriteLine(bundlePath);
        }

        return failure ? 1 : 0;
    }

    private static async Task InstallRecorderAsync(IPage page)
    {
        await page.EvaluateAsync(
            """
            () => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                if (!grid) throw new Error('Financial diagnostic could not find RevoGrid.');

                const events = [];
                const refreshes = [];
                const names = [
                    'beforeedit', 'afteredit', 'clipboardrangepaste',
                    'beforerangeedit', 'afterpasteapply',
                    'beforesourceset', 'aftersourceset'
                ];
                const scalar = value =>
                    value === null || value === undefined
                        ? null
                        : ['string', 'number', 'boolean'].includes(typeof value)
                            ? value
                            : null;
                const summarize = detail => ({
                    prop: scalar(detail?.prop ?? detail?.column?.prop),
                    value: scalar(detail?.val ?? detail?.value),
                    rowIndex: scalar(detail?.rowIndex),
                    clientKey: scalar(detail?.model?.clientKey),
                    modelWorkOrderValue: scalar(detail?.model?.workOrderValue),
                    modelPartialAmount: scalar(detail?.model?.partialAmount),
                    modelRemainingAmount: scalar(detail?.model?.remainingAmount)
                });

                for (const name of names) {
                    grid.addEventListener(name, event =>
                        events.push({
                            at: performance.now(),
                            name,
                            detail: summarize(event.detail)
                        }));
                }

                const originalRefresh = grid.refresh?.bind(grid);
                if (originalRefresh) {
                    grid.refresh = async (...args) => {
                        refreshes.push({ at: performance.now(), args });
                        return originalRefresh(...args);
                    };
                }

                window.__erpFinancialDiagnostic = { events, refreshes };
            }
            """);
    }

    private static async Task<JsonElement> CaptureAsync(
        IPage page,
        string targetClientKey,
        string label,
        IReadOnlyDictionary<string, decimal> expectedRemaining)
    {
        var json = await page.EvaluateAsync<string>(
            """
            async args => {
                const host = document.getElementById('revogrid-native-gate5a-grid');
                const grid = host?.querySelector('revo-grid');
                const source = await grid.getSource('rgRow');
                const visible = await grid.getVisibleSource('rgRow');
                const module = await import('/js/revoGridGate5B1.js?v=20260826-unified-validation-1');
                const expected = args.expectedRemaining || {};
                const columns = Array.isArray(grid.columns) ? grid.columns : [];
                const remainingLogicalIndex = columns.findIndex(column =>
                    String(column?.prop ?? '') === 'remainingAmount');
                const remainingColumn = grid.rtl
                    ? columns.length - 1 - remainingLogicalIndex
                    : remainingLogicalIndex;
                const rows = Object.entries(expected).map(([clientKey, remainingAmount]) => {
                    const row = source.find(item => String(item?.clientKey) === clientKey);
                    const visibleIndex = visible.findIndex(item => String(item?.clientKey) === clientKey);
                    const cell = visibleIndex < 0
                        ? null
                        : host.querySelector(`[data-rgRow="${visibleIndex}"][data-rgCol="${remainingColumn}"]`);
                    return {
                        clientKey,
                        source: row ? {
                            workOrderValue: row.workOrderValue ?? null,
                            partialAmount: row.partialAmount ?? null,
                            remainingAmount: row.remainingAmount ?? null
                        } : null,
                        renderedRemainingText: cell?.textContent?.trim() ?? null,
                        expectedRemaining: Number(remainingAmount),
                        sourceMatches: row
                            ? Number(row.remainingAmount) === Number(remainingAmount)
                            : false
                    };
                });
                const diagnostics = await module.getDiagnostics('revogrid-native-gate5a-grid');
                const events = window.__erpFinancialDiagnostic?.events ?? [];
                const refreshes = window.__erpFinancialDiagnostic?.refreshes ?? [];
                return JSON.stringify({
                    label: args.label,
                    at: new Date().toISOString(),
                    columns: columns.map((column, logicalIndex) => ({
                        logicalIndex,
                        prop: column?.prop ?? null,
                        visualIndex: grid.rtl
                            ? columns.length - 1 - logicalIndex
                            : logicalIndex
                    })),
                    rtl: Boolean(grid.rtl),
                    rows,
                    aftereditEvents: events.filter(event => event.name === 'afteredit'),
                    relevantEvents: events.slice(-30),
                    refreshes: refreshes.slice(-30),
                    history: diagnostics.changeEngine
                        ? {
                            undoCount: diagnostics.changeEngine.undoCount,
                            redoCount: diagnostics.changeEngine.redoCount,
                            dirty: diagnostics.changeEngine.dirty,
                            dirtyCells: diagnostics.dirtyCells,
                            dirtyRows: diagnostics.dirtyRows
                        }
                        : null,
                    allSourceRows: source.slice(0, 3).map(row => ({
                        clientKey: row?.clientKey ?? null,
                        workOrderValue: row?.workOrderValue ?? null,
                        partialAmount: row?.partialAmount ?? null,
                        remainingAmount: row?.remainingAmount ?? null
                    })),
                    allRowsMatch: rows.every(row => row.sourceMatches)
                });
            }
            """,
            new
            {
                label,
                targetClientKey,
                expectedRemaining
            });

        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }

    private static async Task AssertFinancialStateAsync(
        IPage page,
        string clientKey,
        string? expectedPartial,
        string? expectedRemaining,
        bool expectInvalid)
    {
        var result = await page.EvaluateAsync<JsonElement>(
            """
            async args => {
                const host = document.getElementById('revogrid-native-gate5a-grid');
                const grid = host?.querySelector('revo-grid');
                const source = await grid.getSource('rgRow');
                const visible = await grid.getVisibleSource('rgRow');
                const row = source.find(item => String(item?.clientKey) === args.clientKey);
                const columns = Array.isArray(grid.columns) ? grid.columns : [];
                const module = await import('/js/revoGridGate5B1.js?v=20260826-unified-validation-1');
                const diagnostics = await module.getDiagnostics('revogrid-native-gate5a-grid');
                const actualPartial = row?.partialAmount === null || row?.partialAmount === undefined
                    ? ''
                    : String(row.partialAmount);
                const actualRemaining = row?.remainingAmount === null || row?.remainingAmount === undefined
                    ? null
                    : String(row.remainingAmount);
                const visibleIndex = visible.findIndex(item =>
                    String(item?.clientKey) === args.clientKey);
                const financialCells = ['workOrderValue', 'partialAmount']
                    .map(property => {
                        const logicalIndex = columns.findIndex(column =>
                            String(column?.prop ?? '') === property);
                        const visualColumn = grid.rtl
                            ? columns.length - 1 - logicalIndex
                            : logicalIndex;
                        return visibleIndex < 0 || logicalIndex < 0
                            ? null
                            : host.querySelector(
                                `[data-rgRow="${visibleIndex}"][data-rgCol="${visualColumn}"]`);
                    });
                const partialMatches = actualPartial === (args.expectedPartial ?? '');
                const remainingMatches = actualRemaining === (args.expectedRemaining ?? null);
                const invalidRows = diagnostics.validation?.financialInvalidRows ??
                    diagnostics.changeEngine?.financialInvalidRows ?? [];
                const rowIsInvalid = invalidRows.some(item =>
                    String(item?.clientKey) === args.clientKey);
                const invalidMatches = rowIsInvalid === args.expectInvalid;
                const visualMatches = financialCells.some(cell =>
                    (cell?.getAttribute('data-erp-financial-invalid') === 'true' ||
                        cell?.getAttribute('data-erp-validation-invalid') === 'true')) === args.expectInvalid;
                return {
                    ok: Boolean(row) && partialMatches && remainingMatches && invalidMatches && visualMatches,
                    actualPartial,
                    actualRemaining,
                    invalidRows: diagnostics.validation?.financialInvalidRowCount ??
                        diagnostics.changeEngine?.financialInvalidRowCount ?? null,
                    rowIsInvalid,
                    visualMatches,
                    expectedPartial: args.expectedPartial ?? '',
                    expectedRemaining: args.expectedRemaining ?? null,
                    expectInvalid: args.expectInvalid
                };
            }
            """,
            new
            {
                clientKey,
                expectedPartial,
                expectedRemaining,
                expectInvalid
            });

        if (!result.GetProperty("ok").GetBoolean())
        {
            throw new InvalidOperationException(
                $"Financial state mismatch for {clientKey}: {result}");
        }
    }

    private static async Task<JsonElement> CaptureReadonlyAttemptAsync(
        IPage page,
        string targetClientKey,
        int remainingAmountColumn)
    {
        var cell = DataCell(page, 0, remainingAmountColumn);
        await cell.DblClickAsync();
        await page.WaitForTimeoutAsync(300);
        var editorCount = await page.Locator($"#{HostId} input").CountAsync();
        await page.Keyboard.PressAsync("Escape");
        var json = await page.EvaluateAsync<string>(
            """
            async args => {
                const host = document.getElementById('revogrid-native-gate5a-grid');
                const grid = host?.querySelector('revo-grid');
                const row = (await grid.getSource('rgRow'))
                    .find(item => String(item?.clientKey) === args.targetClientKey);
                const events = window.__erpFinancialDiagnostic?.events ?? [];
                return JSON.stringify({
                    label: 'remaining-readonly-attempt',
                    editorCount: args.editorCount,
                    row: row ? {
                        partialAmount: row.partialAmount ?? null,
                        remainingAmount: row.remainingAmount ?? null
                    } : null,
                    remainingAfterEditEvents: events.filter(event =>
                        event.name === 'afteredit' && event.detail?.prop === 'remainingAmount')
                });
            }
            """,
            new { targetClientKey, editorCount });

        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }

    private static async Task AssertUnifiedValidationCleanBaselineAsync(IPage page)
    {
        var state = await page.EvaluateAsync<JsonElement>(
            """
            async () => {
                const module = await import('/js/revoGridGate5B1.js?v=20260826-unified-validation-1');
                const diagnostics = await module.getDiagnostics('revogrid-native-gate5a-grid');
                return {
                    canSave: diagnostics.validation?.canSave ?? null,
                    invalidRows: Number(diagnostics.validation?.validationInvalidRowCount ?? -1),
                    invalidCells: Number(diagnostics.validation?.validationInvalidCellCount ?? -1)
                };
            }
            """);

        if (
            !state.GetProperty("canSave").GetBoolean() ||
            state.GetProperty("invalidRows").GetInt32() != 0 ||
            state.GetProperty("invalidCells").GetInt32() != 0)
        {
            throw new InvalidOperationException(
                $"Unified Validation baseline is not clean before identity checks: {state}");
        }
    }

    private static async Task AssertUnifiedDuplicateValidationAsync(
        IPage page,
        string firstClientKey,
        string secondClientKey)
    {
        var numberColumn = await GetVisualColumnIndexAsync(page, "workOrderNumber");
        var typeColumn = await GetVisualColumnIndexAsync(page, "workTypeCode");
        var identity = await page.EvaluateAsync<JsonElement>(
            """
            async args => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const source = await grid.getSource('rgRow');
                const first = source.find(item => String(item?.clientKey) === args.first);
                const second = source.find(item => String(item?.clientKey) === args.second);
                const used = new Set(source.map(item => String(item?.workOrderNumber ?? '')));
                let unique = 999999999;
                while (used.has(String(unique))) unique -= 1;
                return {
                    firstNumber: String(first?.workOrderNumber ?? ''),
                    firstType: String(first?.workTypeCode ?? ''),
                    secondNumber: String(second?.workOrderNumber ?? ''),
                    secondType: String(second?.workTypeCode ?? ''),
                    uniqueNumber: String(unique)
                };
            }
            """,
            new { first = firstClientKey, second = secondClientKey });

        var firstNumber = identity.GetProperty("firstNumber").GetString() ?? "";
        var firstType = identity.GetProperty("firstType").GetString() ?? "";
        var secondNumber = identity.GetProperty("secondNumber").GetString() ?? "";
        var secondType = identity.GetProperty("secondType").GetString() ?? "";
        var uniqueNumber = identity.GetProperty("uniqueNumber").GetString() ?? "";

        await EditCellAsync(page, 1, numberColumn, firstNumber);
        await EditCellAsync(page, 1, typeColumn, firstType);
        await AssertDuplicateStateAsync(
            page,
            firstClientKey,
            secondClientKey,
            expectDuplicate: true,
            expectCanSave: false);

        await EditCellAsync(page, 1, numberColumn, uniqueNumber);
        await AssertDuplicateStateAsync(
            page,
            firstClientKey,
            secondClientKey,
            expectDuplicate: false,
            expectCanSave: true);

        await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
        await page.WaitForTimeoutAsync(500);
        await AssertDuplicateStateAsync(
            page,
            firstClientKey,
            secondClientKey,
            expectDuplicate: true,
            expectCanSave: false);

        await page.Locator("#revogrid-gate5b1-redo").ClickAsync();
        await page.WaitForTimeoutAsync(500);
        await AssertDuplicateStateAsync(
            page,
            firstClientKey,
            secondClientKey,
            expectDuplicate: false,
            expectCanSave: true);

        await EditCellAsync(page, 1, numberColumn, secondNumber);
        await EditCellAsync(page, 1, typeColumn, secondType);
        await AssertUnifiedValidationCleanBaselineAsync(page);
    }

    private static async Task AssertDuplicateStateAsync(
        IPage page,
        string firstClientKey,
        string secondClientKey,
        bool expectDuplicate,
        bool expectCanSave)
    {
        var state = await page.EvaluateAsync<JsonElement>(
            """
            async args => {
                const module = await import('/js/revoGridGate5B1.js?v=20260826-unified-validation-1');
                const diagnostics = await module.getDiagnostics('revogrid-native-gate5a-grid');
                const invalidRows = diagnostics.validation?.validationInvalidRows ?? [];
                const summarize = clientKey => {
                    const errors = invalidRows.find(item =>
                        String(item?.clientKey) === clientKey)?.errors ?? [];
                    return {
                        workOrderNumber: errors.some(error =>
                            error.field === 'workOrderNumber' && error.code === 'duplicate'),
                        workTypeCode: errors.some(error =>
                            error.field === 'workTypeCode' && error.code === 'duplicate')
                    };
                };
                return {
                    first: summarize(args.first),
                    second: summarize(args.second),
                    canSave: diagnostics.validation?.canSave ?? null
                };
            }
            """,
            new { first = firstClientKey, second = secondClientKey });

        var first = state.GetProperty("first");
        var second = state.GetProperty("second");
        var duplicateMatches =
            first.GetProperty("workOrderNumber").GetBoolean() == expectDuplicate &&
            first.GetProperty("workTypeCode").GetBoolean() == expectDuplicate &&
            second.GetProperty("workOrderNumber").GetBoolean() == expectDuplicate &&
            second.GetProperty("workTypeCode").GetBoolean() == expectDuplicate;

        if (
            !duplicateMatches ||
            state.GetProperty("canSave").GetBoolean() != expectCanSave)
        {
            throw new InvalidOperationException(
                $"Unified duplicate validation mismatch: {state}");
        }
    }

    private static async Task AssertUnifiedIdentityValidationAsync(
        IPage page,
        string clientKey,
        string secondClientKey)
    {
        var column = await GetVisualColumnIndexAsync(page, "workOrderNumber");
        var original = await page.EvaluateAsync<string>(
            """
            async clientKey => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const row = (await grid.getSource('rgRow'))
                    .find(item => String(item?.clientKey) === clientKey);
                return String(row?.workOrderNumber ?? '');
            }
            """,
            clientKey);
        var rowsValidatedBefore = await page.EvaluateAsync<int>(
            """
            async () => {
                const module = await import('/js/revoGridGate5B1.js?v=20260826-unified-validation-1');
                const diagnostics = await module.getDiagnostics('revogrid-native-gate5a-grid');
                return Number(diagnostics.validation?.rowsValidated ?? -1);
            }
            """);

        await EditCellAsync(page, 0, column, "123");
        var invalid = await page.EvaluateAsync<JsonElement>(
            """
            async args => {
                const host = document.getElementById('revogrid-native-gate5a-grid');
                const grid = host?.querySelector('revo-grid');
                const source = await grid.getSource('rgRow');
                const visible = await grid.getVisibleSource('rgRow');
                const row = source.find(item => String(item?.clientKey) === args.clientKey);
                const visibleIndex = visible.findIndex(item =>
                    String(item?.clientKey) === args.clientKey);
                const columns = Array.isArray(grid.columns) ? grid.columns : [];
                const logicalIndex = columns.findIndex(column =>
                    String(column?.prop ?? '') === 'workOrderNumber');
                const visualColumn = grid.rtl
                    ? columns.length - 1 - logicalIndex
                    : logicalIndex;
                const cell = host.querySelector(
                    `[data-rgRow="${visibleIndex}"][data-rgCol="${visualColumn}"]`);
                const module = await import('/js/revoGridGate5B1.js?v=20260826-unified-validation-1');
                const diagnostics = await module.getDiagnostics('revogrid-native-gate5a-grid');
                const invalidRows = diagnostics.validation?.validationInvalidRows ?? [];
                const rowErrors = invalidRows.find(item =>
                    String(item?.clientKey) === args.clientKey)?.errors ?? [];
                return {
                    value: String(row?.workOrderNumber ?? ''),
                    hasIdentityError: rowErrors.some(error =>
                        error.field === 'workOrderNumber'),
                    canSave: diagnostics.validation?.canSave ?? null,
                    rowsValidated: Number(diagnostics.validation?.rowsValidated ?? -1),
                    visualInvalid: cell?.getAttribute('data-erp-validation-invalid') === 'true'
                };
            }
            """,
            new { clientKey });

        if (
            invalid.GetProperty("value").GetString() != "123" ||
            !invalid.GetProperty("hasIdentityError").GetBoolean() ||
            invalid.GetProperty("canSave").GetBoolean() ||
            !invalid.GetProperty("visualInvalid").GetBoolean() ||
            invalid.GetProperty("rowsValidated").GetInt32() - rowsValidatedBefore > 3)
        {
            throw new InvalidOperationException(
                $"Unified Validation did not preserve/mark invalid identity: {invalid}");
        }

        await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
        await page.WaitForTimeoutAsync(500);
        var afterUndo = await page.EvaluateAsync<JsonElement>(
            """
            async args => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const row = (await grid.getSource('rgRow'))
                    .find(item => String(item?.clientKey) === args.clientKey);
                const module = await import('/js/revoGridGate5B1.js?v=20260826-unified-validation-1');
                const diagnostics = await module.getDiagnostics('revogrid-native-gate5a-grid');
                const invalidRows = diagnostics.validation?.validationInvalidRows ?? [];
                const rowErrors = invalidRows.find(item =>
                    String(item?.clientKey) === args.clientKey)?.errors ?? [];
                return {
                    value: String(row?.workOrderNumber ?? ''),
                    hasIdentityError: rowErrors.some(error =>
                        error.field === 'workOrderNumber')
                };
            }
            """,
            new { clientKey });

        if (
            afterUndo.GetProperty("value").GetString() != original ||
            afterUndo.GetProperty("hasIdentityError").GetBoolean())
        {
            throw new InvalidOperationException(
                $"Undo did not restore Unified Validation state: {afterUndo}");
        }

        await page.Locator("#revogrid-gate5b1-redo").ClickAsync();
        await page.WaitForTimeoutAsync(500);
        var afterRedo = await page.EvaluateAsync<JsonElement>(
            """
            async args => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const row = (await grid.getSource('rgRow'))
                    .find(item => String(item?.clientKey) === args.clientKey);
                const module = await import('/js/revoGridGate5B1.js?v=20260826-unified-validation-1');
                const diagnostics = await module.getDiagnostics('revogrid-native-gate5a-grid');
                const invalidRows = diagnostics.validation?.validationInvalidRows ?? [];
                const rowErrors = invalidRows.find(item =>
                    String(item?.clientKey) === args.clientKey)?.errors ?? [];
                return {
                    value: String(row?.workOrderNumber ?? ''),
                    hasIdentityError: rowErrors.some(error =>
                        error.field === 'workOrderNumber')
                };
            }
            """,
            new { clientKey });

        if (
            afterRedo.GetProperty("value").GetString() != "123" ||
            !afterRedo.GetProperty("hasIdentityError").GetBoolean())
        {
            throw new InvalidOperationException(
                $"Redo did not restore Unified Validation state: {afterRedo}");
        }

        await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
        await page.WaitForTimeoutAsync(500);

        var rangeBaseline = await page.EvaluateAsync<JsonElement>(
            """
            async args => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const source = await grid.getSource('rgRow');
                const rows = [args.first, args.second].map(clientKey => {
                    const row = source.find(item => String(item?.clientKey) === clientKey);
                    return {
                        clientKey,
                        value: String(row?.workOrderNumber ?? '')
                    };
                });
                await grid.setCellsFocus(
                    { x: args.column, y: 0 },
                    { x: args.column, y: 1 });
                grid.focus({ preventScroll: true });
                return rows;
            }
            """,
            new { first = clientKey, second = secondClientKey, column });
        await page.Keyboard.PressAsync("Delete");
        await page.WaitForTimeoutAsync(600);

        var afterClear = await page.EvaluateAsync<JsonElement>(
            """
            async args => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const source = await grid.getSource('rgRow');
                const module = await import('/js/revoGridGate5B1.js?v=20260826-unified-validation-1');
                const diagnostics = await module.getDiagnostics('revogrid-native-gate5a-grid');
                const invalidRows = diagnostics.validation?.validationInvalidRows ?? [];
                return [args.first, args.second].map(clientKey => {
                    const row = source.find(item => String(item?.clientKey) === clientKey);
                    const errors = invalidRows.find(item =>
                        String(item?.clientKey) === clientKey)?.errors ?? [];
                    return {
                        clientKey,
                        value: String(row?.workOrderNumber ?? ''),
                        required: errors.some(error =>
                            error.field === 'workOrderNumber' && error.code === 'required')
                    };
                });
            }
            """,
            new { first = clientKey, second = secondClientKey });

        foreach (var row in afterClear.EnumerateArray())
        {
            if (
                row.GetProperty("value").GetString() != string.Empty ||
                !row.GetProperty("required").GetBoolean())
            {
                throw new InvalidOperationException(
                    $"Range Clear did not preserve/mark required validation: {afterClear}");
            }
        }

        await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
        await page.WaitForTimeoutAsync(500);
        var restored = await page.EvaluateAsync<JsonElement>(
            """
            async args => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const source = await grid.getSource('rgRow');
                return [args.first, args.second].map(clientKey => {
                    const row = source.find(item => String(item?.clientKey) === clientKey);
                    return {
                        clientKey,
                        value: String(row?.workOrderNumber ?? '')
                    };
                });
            }
            """,
            new { first = clientKey, second = secondClientKey });

        var expected = rangeBaseline.EnumerateArray().ToArray();
        var actual = restored.EnumerateArray().ToArray();
        for (var index = 0; index < expected.Length; index++)
        {
            if (
                actual[index].GetProperty("value").GetString() !=
                expected[index].GetProperty("value").GetString())
            {
                throw new InvalidOperationException(
                    $"Undo did not restore required-field Range Clear: {restored}");
            }
        }

        await AssertUnifiedValidationCleanBaselineAsync(page);
    }

    private static async Task PrepareClipboardAsync(
        IPage page,
        int startVisibleRow,
        int column,
        string text)
    {
        await page.EvaluateAsync(
            """
            async args => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                await navigator.clipboard.writeText(args.text);
                await grid.setCellsFocus(
                    { x: args.column, y: args.startVisibleRow },
                    { x: args.column, y: args.startVisibleRow });
                grid.focus({ preventScroll: true });
            }
            """,
            new { startVisibleRow, column, text });

        await page.WaitForTimeoutAsync(100);
    }

    private static async Task<int> GetVisualColumnIndexAsync(
        IPage page,
        string property)
    {
        return await page.EvaluateAsync<int>(
            """
            property => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const columns = Array.isArray(grid?.columns) ? grid.columns : [];
                const logicalIndex = columns.findIndex(column =>
                    String(column?.prop ?? '') === property);
                if (logicalIndex < 0) {
                    throw new Error(`Column '${property}' was not found.`);
                }
                return grid.rtl
                    ? columns.length - 1 - logicalIndex
                    : logicalIndex;
            }
            """,
            property);
    }

    private static async Task EditCellAsync(
        IPage page,
        int visibleRow,
        int column,
        string value)
    {
        var cell = DataCell(page, visibleRow, column);
        await cell.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = 30_000
            });
        await cell.DblClickAsync();

        var editor = page.Locator($"#{HostId} input").Last;
        await editor.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = 10_000
            });
        await editor.FillAsync(value);
        await editor.PressAsync("Enter");
        await page.WaitForTimeoutAsync(600);
    }

    private static ILocator DataCell(IPage page, int visibleRow, int column)
    {
        return page.Locator(
            $"#{HostId} revogr-viewport-scroll.rgCol:not([row-header]) " +
            $"[data-rgRow=\"{visibleRow}\"][data-rgCol=\"{column}\"]");
    }

    private static async Task<JsonElement> GetSourcePayloadAsync(IPage page)
    {
        var raw = await page.EvaluateAsync<string>(
            """
            async () => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const source = await grid.getSource('rgRow');
                return JSON.stringify(source ?? null);
            }
            """);

        using var document = JsonDocument.Parse(raw ?? "null");
        return document.RootElement.Clone();
    }

    private static bool TryExtractSourceRows(
        JsonElement payload,
        out JsonElement[] rows,
        out string failure)
    {
        rows = Array.Empty<JsonElement>();
        failure = string.Empty;

        JsonElement candidate = payload;
        if (candidate.ValueKind == JsonValueKind.Object)
        {
            if (!TryGetPropertyIgnoreCase(candidate, "rows", out candidate)
                && !TryGetPropertyIgnoreCase(candidate, "source", out candidate))
            {
                failure = $"Source payload was an object without rows/source. ValueKind={payload.ValueKind}.";
                return false;
            }
        }

        if (candidate.ValueKind != JsonValueKind.Array)
        {
            failure = $"Source payload was not an array. ValueKind={candidate.ValueKind}.";
            return false;
        }

        rows = candidate.EnumerateArray().ToArray();
        if (rows.Length < 3)
        {
            failure = $"Source payload contained {rows.Length} rows; at least 3 are required for the diagnostic.";
            return false;
        }

        for (var index = 0; index < 3; index++)
        {
            if (rows[index].ValueKind != JsonValueKind.Object
                || string.IsNullOrWhiteSpace(GetClientKey(rows[index])))
            {
                failure =
                    $"Source row {index} was missing an object/clientKey. " +
                    $"ValueKind={rows[index].ValueKind}.";
                return false;
            }
        }

        return true;
    }

    private static string GetClientKey(JsonElement row)
    {
        if (!TryGetPropertyIgnoreCase(row, "clientKey", out var value))
        {
            return string.Empty;
        }

        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString() ?? string.Empty,
            JsonValueKind.Number => value.ToString(),
            _ => string.Empty
        };
    }

    private static bool TryGetPropertyIgnoreCase(
        JsonElement element,
        string propertyName,
        out JsonElement value)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in element.EnumerateObject())
            {
                if (string.Equals(
                        property.Name,
                        propertyName,
                        StringComparison.OrdinalIgnoreCase))
                {
                    value = property.Value;
                    return true;
                }
            }
        }

        value = default;
        return false;
    }

    private static async Task WriteEvidenceFailureAsync(
        string observationsPath,
        E2EBrowserSession browser,
        JsonElement sourcePayload,
        string failure)
    {
        var browserDiagnostics = await ReadBrowserDiagnosticsAsync(browser.Diagnostics);
        await File.WriteAllTextAsync(
            observationsPath,
            JsonSerializer.Serialize(
                new
                {
                    generatedAtUtc = DateTime.UtcNow,
                    failureKind = "DIAGNOSTIC_EVIDENCE_MISSING",
                    failure,
                    rawSourcePayload = sourcePayload.GetRawText(),
                    browserDiagnostics
                },
                new JsonSerializerOptions { WriteIndented = true }));

        try
        {
            await browser.CaptureFailureAsync("remaining-amount-financial-diagnostic");
        }
        catch (Exception captureException)
        {
            Console.Error.WriteLine(
                $"Could not capture diagnostic evidence failure: {captureException.Message}");
        }

        Console.Error.WriteLine($"Financial diagnostic evidence failure: {failure}");
    }

    private static string FindProjectRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            if (File.Exists(Path.Combine(directory.FullName, "ERPPrototype.csproj")))
            {
                return directory.FullName;
            }

            directory = directory.Parent;
        }

        throw new DirectoryNotFoundException(
            "Could not locate the ERPPrototype project root.");
    }

    private static string FindFirstDivergence(IReadOnlyList<JsonElement> observations)
    {
        foreach (var observation in observations)
        {
            if (observation.TryGetProperty("allRowsMatch", out var matches)
                && !matches.GetBoolean())
            {
                return observation.GetProperty("label").GetString() ?? "unknown";
            }
        }

        return "none observed in captured source values";
    }

    private static async Task<string> ReadBrowserDiagnosticsAsync(
        BrowserDiagnostics diagnostics)
    {
        var path = Path.Combine(
            Path.GetTempPath(),
            $"erp-financial-diagnostics-{Guid.NewGuid():N}.txt");
        await diagnostics.WriteReportAsync(path);
        return await File.ReadAllTextAsync(path);
    }
}
