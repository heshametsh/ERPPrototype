using System.Globalization;
using System.IO.Compression;
using System.Text.Json;
using Microsoft.Playwright;

namespace ERPPrototype.E2ETests;

internal static class Gate5B11SaveHandshakeRunner
{
    private const int FixedPort = 5265;
    private const string GatePath = "/work-orders-revogrid-gate5b11";
    private const string GridHostId = "revogrid-native-gate5a-grid";
    private const string ModulePath = "/js/revoGridGate5B1.js?v=20260830-gate5b11-save-handshake-clean-3";

    public static async Task<int> RunAsync()
    {
        var projectRoot = FindProjectRoot();
        var artifactDirectory = E2EArtifactManager.CreateRunDirectory(projectRoot);
        Exception? failure = null;

        Console.WriteLine("RevoGrid Gate 5B-11 Snapshot-safe Save handshake real-browser journey");
        Console.WriteLine("The journey proves native editor commit-on-close, exact Save snapshots, edit-during-Save Dirty preservation, reject safety, Filter independence, and History after Save.");
        Console.WriteLine($"Application port: {FixedPort}");
        Console.WriteLine($"Artifacts: {artifactDirectory}");
        Console.WriteLine();

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
                benchmarkMode: false,
                viewportWidth: 1440,
                viewportHeight: 1000,
                windowWidth: 1500,
                windowHeight: 1050,
                screenWidth: 1920,
                screenHeight: 1080);

            var page = browser.Page;

            try
            {
                var loginPage = new LoginPage(page, application.BaseUri);
                await loginPage.OpenAsync(GatePath);
                await loginPage.LoginAsync(database.Seed);
                await page.WaitForURLAsync(
                    $"**{GatePath}*",
                    new PageWaitForURLOptions { Timeout = 45_000 });
                await Grid(page).WaitForAsync(new LocatorWaitForOptions
                {
                    State = WaitForSelectorState.Visible,
                    Timeout = 45_000
                });
                await WaitForRenderedCellAsync(page, 0, 0);

                var fixture = await ResolveFinancialFixtureAsync(page);
                await ScrollToRowAsync(page, fixture.VisibleRow);

                await AssertOpenEditorIsIncludedInSnapshotAsync(page, fixture);
                Console.WriteLine("[01-editor] PASS — clicking Save commits the active Revo editor before snapshot");

                await AssertEditDuringSaveRemainsDirtyAsync(page, fixture);
                Console.WriteLine("[02-generation] PASS — accepted snapshot advances Baseline only to the sent generation");

                await AssertSecondSaveAndDatasetSwitchAreBlockedAsync(page);
                Console.WriteLine("[03-active] PASS — second Save and dataset switch are blocked while snapshot is active");

                await WaitForHandshakeResultAsync(page, "newer changes remain Dirty");
                await AssertDirtyTransitionAsync(page, fixture.ClientKey, fixture.ValueB, fixture.ValueC);
                Console.WriteLine("[04-accept] PASS — newer browser edit remains Dirty after earlier snapshot acceptance");

                await ClickSaveAndWaitForCleanAsync(page);
                Console.WriteLine("[05-resave] PASS — next snapshot accepts the newer generation and returns row engine to Clean");

                await AssertRejectKeepsDirtyAsync(page, fixture);
                Console.WriteLine("[06-reject] PASS — rejected snapshot does not falsely mark work Clean");

                await ClickSaveAndWaitForCleanAsync(page);
                await AssertHistoryAfterSaveAsync(page, fixture, fixture.ValueC, fixture.ValueD);
                Console.WriteLine("[07-history] PASS — Undo/Redo after accepted Save derives Dirty from the accepted Baseline");

                await AssertFilterAfterSaveStartDoesNotDropSnapshotAsync(page, fixture);
                Console.WriteLine("[08-filter] PASS — Filter hiding the row after Save start does not remove it from the accepted snapshot");

                await AssertPersistedDeleteSnapshotAsync(page);
                Console.WriteLine("[09-delete] PASS — persisted delete snapshot carries exact Id/RowVersion and structural History remains valid");

                browser.Diagnostics.AssertNoCriticalErrors();
                await browser.CaptureSuccessAsync(
                    "gate5b11-save-handshake-real-browser-journey",
                    preserveTrace: true);
            }
            catch (Exception exception)
            {
                failure = exception;
                await browser.CaptureFailureAsync(
                    "gate5b11-save-handshake-real-browser-journey");
            }
        }
        catch (Exception exception)
        {
            failure ??= exception;
        }

        var bundle = CreateBundle(artifactDirectory);
        Console.WriteLine();
        if (failure is null)
        {
            Console.WriteLine("Gate 5B-11 Snapshot-safe Save handshake real-browser journey PASS.");
        }
        else
        {
            Console.Error.WriteLine("Gate 5B-11 Snapshot-safe Save handshake real-browser journey FAILED.");
            Console.Error.WriteLine(failure);
        }
        Console.WriteLine();
        Console.WriteLine("READY TO UPLOAD:");
        Console.WriteLine(bundle);
        return failure is null ? 0 : 1;
    }

    private static async Task AssertOpenEditorIsIncludedInSnapshotAsync(
        IPage page,
        FinancialFixture fixture)
    {
        var cell = DataCell(page, fixture.VisibleRow, fixture.VisualColumn);
        await cell.DblClickAsync();
        var editor = page.Locator($"#{GridHostId} input").Last;
        await editor.WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });
        await editor.FillAsync(Format(fixture.ValueB));

        await SaveButton(page).ClickAsync();
        await WaitForSaveActiveAsync(page);

        var diagnostics = await GetSaveDiagnosticsAsync(page);
        var contract = diagnostics.GetProperty("contract");
        var cells = contract.GetProperty("cells").EnumerateArray().ToList();
        var savedCell = cells.Single(cellValue =>
            cellValue.GetProperty("clientKey").GetString() == fixture.ClientKey &&
            cellValue.GetProperty("field").GetString() == "partialAmount");
        E2ETestAssert.True(
            DecimalEquals(savedCell.GetProperty("value"), fixture.ValueB),
            "The active editor value was not included in the exact Save snapshot.");

        var changedRecords = contract.GetProperty("changedRecords").EnumerateArray().ToList();
        var record = changedRecords.Single(value =>
            value.GetProperty("clientKey").GetString() == fixture.ClientKey);
        E2ETestAssert.True(
            DecimalEquals(record.GetProperty("row").GetProperty("partialAmount"), fixture.ValueB),
            "The Save contract row payload does not match the exact editor generation.");
    }

    private static async Task AssertEditDuringSaveRemainsDirtyAsync(
        IPage page,
        FinancialFixture fixture)
    {
        var cell = DataCell(page, fixture.VisibleRow, fixture.VisualColumn);
        await cell.DblClickAsync();
        var editor = page.Locator($"#{GridHostId} input").Last;
        await editor.WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });
        await editor.FillAsync(Format(fixture.ValueC));
        await editor.PressAsync("Enter");

        await page.WaitForFunctionAsync(
            """
            async args => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const source = await grid.getSource('rgRow');
                const row = source.find(item => String(item?.clientKey ?? '') === args.clientKey);
                return Number(row?.partialAmount) === args.value;
            }
            """,
            new { fixture.ClientKey, value = fixture.ValueC },
            new PageWaitForFunctionOptions { Timeout = 10_000 });
    }

    private static async Task AssertSecondSaveAndDatasetSwitchAreBlockedAsync(IPage page)
    {
        E2ETestAssert.True(await SaveButton(page).IsDisabledAsync(),
            "Save button remained enabled while a Save snapshot was active.");

        var result = await page.EvaluateAsync<string>(
            $$"""
            async () => {
                const module = await import('{{ModulePath}}');
                const second = await module.beginSaveHandshake('{{GridHostId}}');
                const switchDecision = await module.beginDatasetSwitch('{{GridHostId}}');
                return JSON.stringify({ second, switchDecision });
            }
            """);
        using var document = JsonDocument.Parse(result);
        E2ETestAssert.Equal("save-active",
            document.RootElement.GetProperty("second").GetProperty("reason").GetString(),
            "A second Save handshake was not rejected while one was active.");
        E2ETestAssert.Equal("busy",
            document.RootElement.GetProperty("switchDecision").GetProperty("reason").GetString(),
            "Dataset switch was not blocked while Save was active.");
    }

    private static async Task AssertDirtyTransitionAsync(
        IPage page,
        string clientKey,
        decimal expectedBaseline,
        decimal expectedCurrent)
    {
        var state = await GetChangeStateAsync(page);
        E2ETestAssert.True(state.GetProperty("dirty").GetBoolean(),
            "Accepting the older snapshot incorrectly marked the newer edit Clean.");

        var cells = await GetDirtyCellsAsync(page);
        var target = cells.EnumerateArray().Single(cell =>
            cell.GetProperty("clientKey").GetString() == clientKey &&
            cell.GetProperty("field").GetString() == "partialAmount");
        E2ETestAssert.True(DecimalEquals(target.GetProperty("baseline"), expectedBaseline),
            "Accepted Save Baseline does not match the sent snapshot generation.");
        E2ETestAssert.True(DecimalEquals(target.GetProperty("current"), expectedCurrent),
            "Newer edit was not preserved as the current Dirty value.");
    }

    private static async Task ClickSaveAndWaitForCleanAsync(IPage page)
    {
        await SaveButton(page).ClickAsync();
        await WaitForSaveActiveAsync(page);
        await page.WaitForFunctionAsync(
            """
            () => document.querySelector('#revogrid-gate5b1-change-status')?.dataset?.dirty === 'false'
                && document.querySelector('#revogrid-gate5b11-save-status')?.dataset?.saveActive === 'false'
            """,
            null,
            new PageWaitForFunctionOptions { Timeout = 10_000 });
    }

    private static async Task AssertRejectKeepsDirtyAsync(
        IPage page,
        FinancialFixture fixture)
    {
        await EditCellAsync(page, fixture.VisibleRow, fixture.VisualColumn, fixture.ValueD);
        await page.GetByTestId("gate5b11-reject-toggle").CheckAsync();
        await SaveButton(page).ClickAsync();
        await WaitForSaveActiveAsync(page);
        await WaitForHandshakeResultAsync(page, "Snapshot rejected");

        var state = await GetChangeStateAsync(page);
        E2ETestAssert.True(state.GetProperty("dirty").GetBoolean(),
            "Rejected Save incorrectly marked the row Change Engine Clean.");

        var cells = await GetDirtyCellsAsync(page);
        var target = cells.EnumerateArray().Single(cell =>
            cell.GetProperty("clientKey").GetString() == fixture.ClientKey &&
            cell.GetProperty("field").GetString() == "partialAmount");
        E2ETestAssert.True(DecimalEquals(target.GetProperty("baseline"), fixture.ValueC),
            "Reject changed the accepted Baseline.");
        E2ETestAssert.True(DecimalEquals(target.GetProperty("current"), fixture.ValueD),
            "Reject lost the current browser value.");

        await page.GetByTestId("gate5b11-reject-toggle").UncheckAsync();
    }

    private static async Task AssertFilterAfterSaveStartDoesNotDropSnapshotAsync(
        IPage page,
        FinancialFixture fixture)
    {
        var valueE = fixture.ValueE;
        await EditCellAsync(page, fixture.VisibleRow, fixture.VisualColumn, valueE);
        await SaveButton(page).ClickAsync();
        await WaitForSaveActiveAsync(page);

        var workType = await page.EvaluateAsync<string>(
            """
            async key => String((await document.querySelector('#revogrid-native-gate5a-grid revo-grid')
                .getSource('rgRow')).find(row => String(row?.clientKey ?? '') === key)?.workTypeCode ?? '')
            """,
            fixture.ClientKey);
        var keepValue = workType == "401" ? "402" : "401";
        await ApplySingleWorkTypeFilterAsync(page, keepValue);

        await page.WaitForFunctionAsync(
            """
            () => document.querySelector('#revogrid-gate5b1-change-status')?.dataset?.dirty === 'false'
                && document.querySelector('#revogrid-gate5b11-save-status')?.dataset?.saveActive === 'false'
            """,
            null,
            new PageWaitForFunctionOptions { Timeout = 10_000 });

        await ClearWorkTypeFilterAsync(page);
        var restoredIndex = await FindVisibleIndexByClientKeyAsync(page, fixture.ClientKey);
        E2ETestAssert.True(restoredIndex >= 0, "Filtered Save fixture did not return after clearing Filter.");
        await ScrollToRowAsync(page, restoredIndex);

        var actual = await GetRowPartialAmountAsync(page, fixture.ClientKey);
        E2ETestAssert.True(actual == valueE,
            "Filter after Save start changed or dropped the accepted row value.");
    }

    private static async Task AssertHistoryAfterSaveAsync(
        IPage page,
        FinancialFixture fixture,
        decimal previousValue,
        decimal acceptedValue)
    {
        var undo = page.Locator("#revogrid-gate5b1-undo");
        var redo = page.Locator("#revogrid-gate5b1-redo");

        await undo.ClickAsync();
        await page.WaitForFunctionAsync(
            """
            () => document.querySelector('#revogrid-gate5b1-change-status')?.dataset?.dirty === 'true'
            """,
            null,
            new PageWaitForFunctionOptions { Timeout = 10_000 });
        E2ETestAssert.True(
            await GetRowPartialAmountAsync(page, fixture.ClientKey) == previousValue,
            "Undo after accepted Save did not restore the previous browser generation.");

        await redo.ClickAsync();
        await page.WaitForFunctionAsync(
            """
            () => document.querySelector('#revogrid-gate5b1-change-status')?.dataset?.dirty === 'false'
            """,
            null,
            new PageWaitForFunctionOptions { Timeout = 10_000 });
        E2ETestAssert.True(
            await GetRowPartialAmountAsync(page, fixture.ClientKey) == acceptedValue,
            "Redo after accepted Save did not return to the accepted Baseline.");
    }

    private static async Task AssertPersistedDeleteSnapshotAsync(IPage page)
    {
        await ScrollToRowAsync(page, 1);
        var identityJson = await page.EvaluateAsync<string>(
            """
            async () => {
                const rows = await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getVisibleSource('rgRow');
                const row = rows[1];
                return JSON.stringify({
                    clientKey: String(row?.clientKey ?? ''),
                    id: Number(row?.id ?? 0),
                    rowVersion: String(row?.rowVersion ?? '')
                });
            }
            """);
        using var identityDocument = JsonDocument.Parse(identityJson);
        var identity = identityDocument.RootElement;
        var clientKey = identity.GetProperty("clientKey").GetString() ?? string.Empty;
        var id = identity.GetProperty("id").GetInt32();
        var rowVersion = identity.GetProperty("rowVersion").GetString() ?? string.Empty;
        E2ETestAssert.True(clientKey.Length > 0 && id > 0 && rowVersion.Length > 0,
            "Delete fixture is missing persisted identity.");

        var sourceCount = await page.EvaluateAsync<int>(
            """async () => (await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getSource('rgRow')).length""");

        await RowHeader(page, 1).ClickAsync();
        await DataCell(page, 1, 0).ClickAsync(new LocatorClickOptions { Button = MouseButton.Right });
        await page.Locator(".erp-revo-structure-menu:not([hidden])").WaitForAsync(
            new LocatorWaitForOptions { State = WaitForSelectorState.Visible, Timeout = 10_000 });
        await ClickStructureMenuAsync(page, "Delete Rows...");
        var dialog = VisibleDialog(page, "Delete Rows");
        await dialog.WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });
        await dialog.Locator("button:has-text(\"Delete\")").ClickAsync();
        await page.WaitForFunctionAsync(
            """
            expected => document.querySelector('#revogrid-native-gate5a-grid revo-grid')
                .getSource('rgRow').then(rows => rows.length === expected)
            """,
            sourceCount - 1,
            new PageWaitForFunctionOptions { Timeout = 10_000 });

        await SaveButton(page).ClickAsync();
        await WaitForSaveActiveAsync(page);
        var diagnostics = await GetSaveDiagnosticsAsync(page);
        var contract = diagnostics.GetProperty("contract");
        var deleted = contract.GetProperty("deletedRecords").EnumerateArray().ToList();
        var record = deleted.Single(value => value.GetProperty("clientKey").GetString() == clientKey);
        E2ETestAssert.Equal(id, record.GetProperty("id").GetInt32(),
            "Delete Save snapshot lost the persisted database Id.");
        E2ETestAssert.Equal(rowVersion, record.GetProperty("rowVersion").GetString(),
            "Delete Save snapshot lost the persisted RowVersion.");

        await page.WaitForFunctionAsync(
            """
            () => document.querySelector('#revogrid-gate5b1-change-status')?.dataset?.dirty === 'false'
                && document.querySelector('#revogrid-gate5b11-save-status')?.dataset?.saveActive === 'false'
            """,
            null,
            new PageWaitForFunctionOptions { Timeout = 10_000 });

        await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
        await page.WaitForFunctionAsync(
            """
            expected => document.querySelector('#revogrid-native-gate5a-grid revo-grid')
                .getSource('rgRow').then(rows => rows.length === expected)
            """,
            sourceCount,
            new PageWaitForFunctionOptions { Timeout = 10_000 });
        E2ETestAssert.True((await GetChangeStateAsync(page)).GetProperty("dirty").GetBoolean(),
            "Undo after accepted delete did not become Dirty against the accepted deleted Baseline.");

        await page.Locator("#revogrid-gate5b1-redo").ClickAsync();
        await page.WaitForFunctionAsync(
            """
            expected => document.querySelector('#revogrid-native-gate5a-grid revo-grid')
                .getSource('rgRow').then(rows => rows.length === expected)
            """,
            sourceCount - 1,
            new PageWaitForFunctionOptions { Timeout = 10_000 });
        E2ETestAssert.True(!(await GetChangeStateAsync(page)).GetProperty("dirty").GetBoolean(),
            "Redo after accepted delete did not return to the accepted deleted Baseline.");
    }

    private static async Task<FinancialFixture> ResolveFinancialFixtureAsync(IPage page)
    {
        var json = await page.EvaluateAsync<string>(
            """
            async () => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const rows = await grid.getVisibleSource('rgRow');
                const columns = Array.isArray(grid.columns) ? grid.columns : await grid.getColumns();
                const logical = columns.findIndex(column => String(column?.prop ?? '') === 'partialAmount');
                const visual = grid.rtl ? columns.length - 1 - logical : logical;
                const rowIndex = rows.findIndex(row => Number(row?.workOrderValue ?? 0) >= 100);
                const row = rows[rowIndex];
                return JSON.stringify({ rowIndex, visual, row });
            }
            """);
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        var rowIndex = root.GetProperty("rowIndex").GetInt32();
        var visual = root.GetProperty("visual").GetInt32();
        E2ETestAssert.True(rowIndex >= 0 && visual >= 0,
            "Could not resolve a valid Gate 5B-11 financial fixture.");

        var row = root.GetProperty("row");
        var clientKey = row.GetProperty("clientKey").GetString() ?? string.Empty;
        var workOrderValue = row.GetProperty("workOrderValue").GetDecimal();
        var original = row.TryGetProperty("partialAmount", out var partial) && partial.ValueKind != JsonValueKind.Null
            ? partial.GetDecimal()
            : 0m;

        var candidates = new[]
        {
            Math.Round(workOrderValue * 0.21m, 2),
            Math.Round(workOrderValue * 0.31m, 2),
            Math.Round(workOrderValue * 0.41m, 2),
            Math.Round(workOrderValue * 0.51m, 2)
        };
        var values = candidates.Where(value => value != original).Distinct().Take(4).ToArray();
        E2ETestAssert.Equal(4, values.Length, "Save fixture could not produce four distinct valid values.");

        return new FinancialFixture(
            rowIndex,
            visual,
            clientKey,
            values[0],
            values[1],
            values[2],
            values[3]);
    }

    private static async Task EditCellAsync(IPage page, int row, int column, decimal value)
    {
        var cell = DataCell(page, row, column);
        await cell.DblClickAsync();
        var editor = page.Locator($"#{GridHostId} input").Last;
        await editor.WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });
        await editor.FillAsync(Format(value));
        await editor.PressAsync("Enter");
        await page.WaitForTimeoutAsync(100);
    }

    private static async Task<JsonElement> GetSaveDiagnosticsAsync(IPage page)
    {
        var json = await page.EvaluateAsync<string>(
            $$"""
            async () => JSON.stringify((await import('{{ModulePath}}')).getSaveHandshakeDiagnostics('{{GridHostId}}'))
            """);
        return JsonDocument.Parse(json).RootElement.Clone();
    }

    private static async Task<JsonElement> GetChangeStateAsync(IPage page)
    {
        var json = await page.EvaluateAsync<string>(
            $$"""
            async () => JSON.stringify((await import('{{ModulePath}}')).getChangeState('{{GridHostId}}'))
            """);
        return JsonDocument.Parse(json).RootElement.Clone();
    }

    private static async Task<JsonElement> GetDirtyCellsAsync(IPage page)
    {
        var json = await page.EvaluateAsync<string>(
            $$"""
            async () => JSON.stringify((await import('{{ModulePath}}')).getDirtyCells('{{GridHostId}}'))
            """);
        return JsonDocument.Parse(json).RootElement.Clone();
    }

    private static async Task<decimal> GetRowPartialAmountAsync(IPage page, string clientKey) =>
        await page.EvaluateAsync<decimal>(
            """
            async key => Number((await document.querySelector('#revogrid-native-gate5a-grid revo-grid')
                .getSource('rgRow')).find(row => String(row?.clientKey ?? '') === key)?.partialAmount ?? 0)
            """,
            clientKey);

    private static async Task WaitForSaveActiveAsync(IPage page) =>
        await page.WaitForFunctionAsync(
            """
            () => document.querySelector('#revogrid-gate5b11-save-status')?.dataset?.saveActive === 'true'
            """,
            null,
            new PageWaitForFunctionOptions { Timeout = 10_000 });

    private static async Task WaitForHandshakeResultAsync(IPage page, string text) =>
        await page.Locator(".native-gate5a__operation-message")
            .Filter(new LocatorFilterOptions { HasTextString = text })
            .WaitForAsync(new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = 10_000
            });

    private static async Task ApplySingleWorkTypeFilterAsync(IPage page, string value)
    {
        await page.Locator(".erp-revo-excel-filter-button[data-erp-filter-prop=\"workTypeCode\"]").ClickAsync();
        var popup = page.Locator(".erp-revo-excel-filter");
        await popup.WaitForAsync(new LocatorWaitForOptions { State = WaitForSelectorState.Visible });
        var selectAll = popup.Locator(".erp-revo-excel-filter__select-all input[type=\"checkbox\"]");
        if (await selectAll.IsCheckedAsync())
        {
            await selectAll.ClickAsync();
        }
        await popup.Locator($".erp-revo-excel-filter__body label:has-text(\"{value}\") input[type=\"checkbox\"]").First.ClickAsync();
        await popup.Locator(".erp-revo-excel-filter__actions button[data-primary=\"true\"]").ClickAsync();
        await popup.WaitForAsync(new LocatorWaitForOptions { State = WaitForSelectorState.Detached });
    }

    private static async Task ClearWorkTypeFilterAsync(IPage page)
    {
        await page.Locator(".erp-revo-excel-filter-button[data-erp-filter-prop=\"workTypeCode\"]").ClickAsync();
        var popup = page.Locator(".erp-revo-excel-filter");
        await popup.WaitForAsync(new LocatorWaitForOptions { State = WaitForSelectorState.Visible });
        await popup.Locator(".erp-revo-excel-filter__actions button:has-text(\"Clear Filter\")").ClickAsync();
        await popup.WaitForAsync(new LocatorWaitForOptions { State = WaitForSelectorState.Detached });
    }

    private static async Task<int> FindVisibleIndexByClientKeyAsync(IPage page, string clientKey) =>
        await page.EvaluateAsync<int>(
            """
            async key => (await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getVisibleSource('rgRow'))
                .findIndex(row => String(row?.clientKey ?? '') === key)
            """,
            clientKey);

    private static async Task ScrollToRowAsync(IPage page, int row) =>
        await page.EvaluateAsync(
            """
            async row => document.querySelector('#revogrid-native-gate5a-grid revo-grid').scrollToRow(row)
            """,
            row);

    private static async Task WaitForRenderedCellAsync(IPage page, int row, int column) =>
        await DataCell(page, row, column).First.WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 30_000
        });

    private static ILocator RowHeader(IPage page, int row) =>
        page.Locator($"#{GridHostId} revogr-row-headers [data-rgRow=\"{row}\"]").First;

    private static async Task ClickStructureMenuAsync(IPage page, string label)
    {
        var menu = page.Locator(".erp-revo-structure-menu:not([hidden])");
        await menu.Locator($"button:has-text(\"{label}\")").ClickAsync();
    }

    private static ILocator VisibleDialog(IPage page, string title) =>
        page.Locator($".erp-revo-structure-dialog:not([hidden]):has(h3:has-text(\"{title}\"))");

    private static ILocator Grid(IPage page) =>
        page.Locator($"#{GridHostId} revo-grid");

    private static ILocator SaveButton(IPage page) =>
        page.Locator("#revogrid-gate5b11-save");

    private static ILocator DataCell(IPage page, int row, int column) =>
        page.Locator(
            $"#{GridHostId} revogr-viewport-scroll.rgCol:not([row-header]) " +
            $"[data-rgRow=\"{row}\"][data-rgCol=\"{column}\"]");

    private static bool DecimalEquals(JsonElement value, decimal expected)
    {
        if (value.ValueKind == JsonValueKind.Number)
        {
            return value.GetDecimal() == expected;
        }
        return decimal.TryParse(value.GetString(), NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed)
            && parsed == expected;
    }

    private static string Format(decimal value) =>
        value.ToString("0.##", CultureInfo.InvariantCulture);

    private static string CreateBundle(string artifactDirectory)
    {
        var downloads = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            "Downloads");
        Directory.CreateDirectory(downloads);
        var path = Path.Combine(downloads, $"ERP_REVO_GATE5B11_TRACE_{DateTime.Now:yyyyMMdd-HHmmss}.zip");
        if (File.Exists(path))
        {
            File.Delete(path);
        }
        ZipFile.CreateFromDirectory(artifactDirectory, path, CompressionLevel.Optimal, includeBaseDirectory: false);
        return path;
    }

    private static string FindProjectRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            var project = Path.Combine(directory.FullName, "ERPPrototype.csproj");
            if (File.Exists(project))
            {
                return directory.FullName;
            }
            directory = directory.Parent;
        }
        throw new DirectoryNotFoundException("Could not locate ERPPrototype.csproj.");
    }

    private sealed record FinancialFixture(
        int VisibleRow,
        int VisualColumn,
        string ClientKey,
        decimal ValueB,
        decimal ValueC,
        decimal ValueD,
        decimal ValueE);
}
