using System.Text.Json;
using Microsoft.Playwright;

namespace ERPPrototype.E2ETests;

internal static class FinancialDiagnosticRunner
{
    private const int FixedPort = 5265;
    private const string GatePath = "/work-orders-revogrid-gate5b5";
    private const string HostId = "revogrid-native-gate5a-grid";

    public static async Task<int> RunAsync()
    {
        var projectRoot = FindProjectRoot();
        var artifactDirectory = E2EArtifactManager.CreateRunDirectory(projectRoot);
        var observationsPath = Path.Combine(
            artifactDirectory,
            "remaining-amount-financial-diagnostic.json");
        var failure = false;
        var observations = new List<JsonElement>();

        Console.WriteLine("RevoGrid Remaining Amount real-browser financial diagnostic");
        Console.WriteLine($"Application port: {FixedPort}");
        Console.WriteLine($"Artifacts: {artifactDirectory}");

        try
        {
            await using var database = await E2ETestDatabase.CreateAsync(
                keepDatabase: false,
                rowsPerYear: E2ETestDatabase.DefaultRowsPerYear);
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
            await page.Context.GrantPermissionsAsync(
                ["clipboard-read", "clipboard-write"],
                new BrowserContextGrantPermissionsOptions
                {
                    Origin = application.BaseUri.ToString().TrimEnd('/')
                });

            var loginPage = new LoginPage(page, application.BaseUri);
            await loginPage.OpenAsync(GatePath);
            await loginPage.LoginAsync(database.Seed);
            await page.WaitForURLAsync(
                $"**{GatePath}*",
                new PageWaitForURLOptions { Timeout = 45_000 });
            await page.Locator($"#{HostId} revo-grid").WaitForAsync(
                new LocatorWaitForOptions
                {
                    State = WaitForSelectorState.Visible,
                    Timeout = 45_000
                });

            await InstallRecorderAsync(page);
            var source = await GetSourceAsync(page);
            var targetClientKey = source[0].GetProperty("clientKey").GetString()!;

            // Establish the concrete 100,000-value fixture through real cell edits.
            await EditCellAsync(page, 0, 3, "100000");
            await EditCellAsync(page, 1, 3, "100000");
            await EditCellAsync(page, 2, 3, "100000");

            await EditCellAsync(page, 0, 4, "20000");
            observations.Add(await CaptureAsync(
                page,
                targetClientKey,
                "partial-20000",
                new Dictionary<string, decimal>
                {
                    [targetClientKey] = 80_000m
                }));

            await EditCellAsync(page, 0, 4, "30000");
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

            await EditCellAsync(page, 0, 4, string.Empty);
            observations.Add(await CaptureAsync(
                page,
                targetClientKey,
                "partial-empty",
                new Dictionary<string, decimal>
                {
                    [targetClientKey] = 100_000m
                }));

            await PrepareClipboardAsync(
                page,
                startVisibleRow: 0,
                column: 4,
                "10000\n20000\n30000");
            await page.Keyboard.PressAsync("Control+V");
            await page.WaitForTimeoutAsync(750);
            observations.Add(await CaptureAsync(
                page,
                targetClientKey,
                "paste-partial-three-rows",
                new Dictionary<string, decimal>
                {
                    [targetClientKey] = 90_000m,
                    [source[1].GetProperty("clientKey").GetString()!] = 80_000m,
                    [source[2].GetProperty("clientKey").GetString()!] = 70_000m
                }));

            observations.Add(await CaptureReadonlyAttemptAsync(page, targetClientKey));

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
                "remaining-amount-financial-diagnostic",
                preserveTrace: true);
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
                const module = await import('/js/revoGridGate5B1.js?v=20260822-remaining-sync-1');
                const expected = args.expectedRemaining || {};
                const rows = Object.entries(expected).map(([clientKey, remainingAmount]) => {
                    const row = source.find(item => String(item?.clientKey) === clientKey);
                    const visibleIndex = visible.findIndex(item => String(item?.clientKey) === clientKey);
                    const cell = visibleIndex < 0
                        ? null
                        : host.querySelector(`[data-rgRow="${visibleIndex}"][data-rgCol="5"]`);
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

    private static async Task<JsonElement> CaptureReadonlyAttemptAsync(
        IPage page,
        string targetClientKey)
    {
        var cell = DataCell(page, 0, 5);
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

        await page.WaitForFunctionAsync(
            "() => document.activeElement?.tagName?.toLowerCase() === 'revo-grid'",
            null,
            new PageWaitForFunctionOptions { Timeout = 5_000 });
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

    private static async Task<JsonElement[]> GetSourceAsync(IPage page)
    {
        return await page.EvaluateAsync<JsonElement[]>(
            """
            async () => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                return await grid.getSource('rgRow');
            }
            """);
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
