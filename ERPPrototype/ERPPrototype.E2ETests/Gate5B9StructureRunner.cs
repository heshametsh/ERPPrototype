using System.IO.Compression;
using System.Text.Json;
using Microsoft.Playwright;

namespace ERPPrototype.E2ETests;

internal static class Gate5B9StructureRunner
{
    private const int FixedPort = 5265;
    private const string GatePath = "/work-orders-revogrid-gate5b9";
    private const string GridHostId = "revogrid-native-gate5a-grid";

    public static async Task<int> RunAsync()
    {
        var projectRoot = FindProjectRoot();
        var artifactDirectory = E2EArtifactManager.CreateRunDirectory(projectRoot);
        Exception? failure = null;

        Console.WriteLine("RevoGrid Gate 5B-9 Structure Workspace real-browser journey");
        Console.WriteLine("The journey proves the shared Rows/Columns menu, Selection-scoped structural delete, column History, and range-fill Paste.");
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
                await page.Locator($"#{GridHostId} revo-grid").WaitForAsync(
                    new LocatorWaitForOptions
                    {
                        State = WaitForSelectorState.Visible,
                        Timeout = 45_000
                    });

                await WaitForRenderedCellAsync(page, 0, 0);
                var baselineCount = await GetSourceCountAsync(page);
                Console.WriteLine($"[01-baseline] source={baselineCount:N0}");

                await AssertNeutralStructureMenuAsync(page);
                Console.WriteLine("[02-menu] PASS — rows/columns only");

                await AssertSelectionContextSurvivesStructureMenuAsync(page);
                Console.WriteLine("[03-selection] PASS — right-click preserves whole-column intent and row-range scope");

                await AssertInsertRowsDialogAsync(page, baselineCount);
                Console.WriteLine("[04-insert-rows] PASS — explicit count, one Undo/Redo action");

                await AssertWholeColumnDeleteSelectionScopeAsync(page, baselineCount);
                Console.WriteLine("[05-delete-selection] PASS — whole-column Selection deletes displayed rows only");

                await AssertColumnWorkspaceAsync(page);
                Console.WriteLine("[06-columns] PASS — batch insert/delete + one-step History");

                await AssertRangeFillPasteAsync(page);
                Console.WriteLine("[07-range-fill] PASS — one copied cell fills selected range and one Undo restores it");

                browser.Diagnostics.AssertNoCriticalErrors();
                await browser.CaptureSuccessAsync(
                    "gate5b9-structure-workspace-real-browser-journey",
                    preserveTrace: true);
            }
            catch (Exception exception)
            {
                failure = exception;
                await browser.CaptureFailureAsync(
                    "gate5b9-structure-workspace-real-browser-journey");
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
            Console.WriteLine("Gate 5B-9 Structure Workspace real-browser journey PASS.");
        }
        else
        {
            Console.Error.WriteLine("Gate 5B-9 Structure Workspace real-browser journey FAILED.");
            Console.Error.WriteLine(failure);
        }
        Console.WriteLine();
        Console.WriteLine("READY TO UPLOAD:");
        Console.WriteLine(bundle);
        return failure is null ? 0 : 1;
    }

    private static async Task AssertNeutralStructureMenuAsync(IPage page)
    {
        var partial = await GetColumnIndexAsync(page, "partialAmount");
        await DataCell(page, 2, partial).ClickAsync(
            new LocatorClickOptions { Button = MouseButton.Right });
        var menu = page.Locator(".erp-revo-structure-menu:not([hidden])");
        await menu.WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });

        var labels = await menu.Locator("button").AllTextContentsAsync();
        var expected = new[]
        {
            "Insert Rows...",
            "Delete Rows...",
            "Insert Columns...",
            "Delete Columns..."
        };
        E2ETestAssert.Equal(expected.Length, labels.Count, "Structure menu exposed unexpected extra commands.");
        foreach (var item in expected)
        {
            E2ETestAssert.True(labels.Contains(item), $"Structure menu is missing '{item}'.");
        }
        E2ETestAssert.True(
            !labels.Any(label => label.Contains("Copy", StringComparison.OrdinalIgnoreCase) ||
                                 label.Contains("Paste", StringComparison.OrdinalIgnoreCase) ||
                                 label.Contains("Clear", StringComparison.OrdinalIgnoreCase)),
            "Copy/Paste/Clear leaked into the structural context menu.");

        await page.Locator(".native-gate5a__header").ClickAsync();
    }

    private static async Task AssertSelectionContextSurvivesStructureMenuAsync(IPage page)
    {
        var partialIndex = await GetColumnIndexAsync(page, "partialAmount");
        var visibleRowCount = await GetVisibleCountAsync(page);
        var header = page.Locator(
            $"#{GridHostId} .rgHeaderCell[data-rgCol=\"{partialIndex}\"] .header-content");
        await header.ClickAsync();
        await page.WaitForTimeoutAsync(200);

        E2ETestAssert.True(
            await IsWholeColumnSelectedAsync(page, partialIndex, visibleRowCount),
            "Whole-column selection was not established before the Structure Menu test.");

        await DataCell(page, 3, partialIndex).ClickAsync(
            new LocatorClickOptions { Button = MouseButton.Right });
        await page.Locator(".erp-revo-structure-menu:not([hidden])").WaitForAsync(
            new LocatorWaitForOptions { State = WaitForSelectorState.Visible, Timeout = 10_000 });

        E2ETestAssert.True(
            await IsWholeColumnSelectedAsync(page, partialIndex, visibleRowCount),
            "Right-click inside a whole-column selection collapsed the employee selection.");
        await page.Locator(".native-gate5a__header").ClickAsync();

        await DataCell(page, 2, 0).ClickAsync();
        await page.Keyboard.DownAsync("Shift");
        try
        {
            await DataCell(page, 4, 0).ClickAsync();
        }
        finally
        {
            await page.Keyboard.UpAsync("Shift");
        }
        await page.WaitForTimeoutAsync(150);

        await DataCell(page, 3, 0).ClickAsync(
            new LocatorClickOptions { Button = MouseButton.Right });
        await page.Locator(".erp-revo-structure-menu:not([hidden])").WaitForAsync(
            new LocatorWaitForOptions { State = WaitForSelectorState.Visible, Timeout = 10_000 });
        E2ETestAssert.True(
            await IsNativeRangeSelectedAsync(page, 0, 2, 0, 4),
            "Right-click inside a three-row Selection visually collapsed the blue range to one cell.");
        await ClickStructureMenuAsync(page, "Delete Rows...");
        var dialog = VisibleDialog(page, "Delete Rows");
        await dialog.WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });
        E2ETestAssert.True(
            await dialog.Locator("input[type=\"radio\"][value=\"selection\"]").IsEnabledAsync(),
            "Right-click inside a three-row range lost the pre-click Selection scope.");
        E2ETestAssert.True(
            await dialog.Locator("input[type=\"radio\"][value=\"selection\"]").IsCheckedAsync(),
            "Rows in Selection was not the safe default for a multi-row Selection.");
        await dialog.Locator("button:has-text(\"Cancel\")").ClickAsync();
    }

    private static async Task<bool> IsNativeRangeSelectedAsync(
        IPage page,
        int x,
        int y,
        int x1,
        int y1) =>
        await page.EvaluateAsync<bool>(
            """
            async args => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const range = await grid.getSelectedRange();
                if (!range) return false;
                return Number(range.x) === args.x &&
                    Number(range.y) === args.y &&
                    Number(range.x1) === args.x1 &&
                    Number(range.y1) === args.y1;
            }
            """,
            new { x, y, x1, y1 });

    private static async Task<bool> IsWholeColumnSelectedAsync(
        IPage page,
        int expectedColumnIndex,
        int visibleRowCount) =>
        await page.EvaluateAsync<bool>(
            """
            async args => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const focused = await grid.getFocused();
                const range = await grid.getSelectedRange();
                const matches = candidate => candidate &&
                    Number(candidate.x) === args.column &&
                    Number(candidate.x1) === args.column &&
                    Number(candidate.y) === 0 &&
                    Number(candidate.y1) === args.rows - 1;
                if (focused?.column?.prop) return false;
                if (matches(range)) return true;
                const providers = await grid.getProviders();
                return Object.values(providers?.selection?.columnStores ?? {})
                    .some(selectionStore => matches(selectionStore?.store?.get?.('range')));
            }
            """,
            new { column = expectedColumnIndex, rows = visibleRowCount });

    private static async Task AssertInsertRowsDialogAsync(IPage page, int baselineCount)
    {
        await OpenStructureMenuAsync(page, 2, 0);
        await ClickStructureMenuAsync(page, "Insert Rows...");
        var dialog = VisibleDialog(page, "Insert Rows");
        await dialog.Locator("input[type=\"number\"]").FillAsync("3");
        await dialog.Locator("button:has-text(\"Insert Below\")").ClickAsync();
        await WaitForSourceCountAsync(page, baselineCount + 3);

        await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
        await WaitForSourceCountAsync(page, baselineCount);
        await page.Locator("#revogrid-gate5b1-redo").ClickAsync();
        await WaitForSourceCountAsync(page, baselineCount + 3);
        await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
        await WaitForSourceCountAsync(page, baselineCount);
    }

    private static async Task AssertWholeColumnDeleteSelectionScopeAsync(IPage page, int baselineCount)
    {
        await ApplySingleWorkTypeFilterAsync(page, "401");
        var displayed = await GetVisibleCountAsync(page);
        E2ETestAssert.True(displayed > 0 && displayed < baselineCount,
            $"Filter fixture did not produce a proper subset. Displayed={displayed}, source={baselineCount}.");

        var partialIndex = await GetColumnIndexAsync(page, "partialAmount");
        var header = page.Locator(
            $"#{GridHostId} .rgHeaderCell[data-rgCol=\"{partialIndex}\"] .header-content");
        await header.ClickAsync();
        await page.WaitForTimeoutAsync(150);
        E2ETestAssert.True(
            await IsWholeColumnSelectedAsync(page, partialIndex, displayed),
            "Whole-column selection was not established under the active filter.");

        await DataCell(page, 1, partialIndex).ClickAsync(
            new LocatorClickOptions { Button = MouseButton.Right });
        await page.Locator(".erp-revo-structure-menu:not([hidden])").WaitForAsync(
            new LocatorWaitForOptions { State = WaitForSelectorState.Visible, Timeout = 10_000 });
        await ClickStructureMenuAsync(page, "Delete Rows...");
        var dialog = VisibleDialog(page, "Delete Rows");
        var selectionScope = dialog.Locator("input[type=\"radio\"][value=\"selection\"]");
        E2ETestAssert.True(await selectionScope.IsEnabledAsync(),
            "Whole-column selection did not expose Rows in Selection.");
        E2ETestAssert.True(await selectionScope.IsCheckedAsync(),
            "Rows in Selection was not the default for a whole-column selection.");
        E2ETestAssert.Equal(0,
            await dialog.Locator("input[type=\"radio\"][value=\"displayed\"]").CountAsync(),
            "Delete Rows still exposes the removed All Displayed Rows scope.");

        await dialog.Locator("button:has-text(\"Delete\")").ClickAsync();
        await WaitForSourceCountAsync(page, baselineCount - displayed);
        E2ETestAssert.Equal(
            baselineCount - displayed,
            await GetSourceCountAsync(page),
            "Whole-column Rows in Selection touched rows outside the current filter result.");

        await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
        await WaitForSourceCountAsync(page, baselineCount);
        await ClearWorkTypeFilterAsync(page);
        await WaitForVisibleCountAsync(page, baselineCount);
    }

    private static async Task AssertColumnWorkspaceAsync(IPage page)
    {
        var partialIndex = await GetColumnIndexAsync(page, "partialAmount");
        await OpenStructureMenuAsync(page, 2, partialIndex);
        await ClickStructureMenuAsync(page, "Insert Columns...");
        var dialog = VisibleDialog(page, "Insert Columns");
        var count = dialog.Locator("input[type=\"number\"]").First;
        await count.FillAsync("2");
        await count.PressAsync("Tab");
        await page.WaitForTimeoutAsync(100);

        var specs = dialog.Locator(".erp-revo-structure-dialog__column-spec");
        E2ETestAssert.Equal(2, await specs.CountAsync(), "Insert Columns did not render two definitions.");
        await specs.Nth(0).Locator("input[type=\"text\"]").FillAsync("Gate Column A");
        await specs.Nth(0).Locator("select").SelectOptionAsync("Text");
        await specs.Nth(1).Locator("input[type=\"text\"]").FillAsync("Gate Column B");
        await specs.Nth(1).Locator("select").SelectOptionAsync("Number");
        await dialog.Locator("button:has-text(\"Insert Right\")").ClickAsync();

        await WaitForColumnNamesAsync(page, ["Gate Column A", "Gate Column B"]);
        var orderedNames = await GetColumnNamesAsync(page);
        var partialPosition = orderedNames.IndexOf("Partial Amount");
        var aPosition = orderedNames.IndexOf("Gate Column A");
        var bPosition = orderedNames.IndexOf("Gate Column B");
        var workOrderValuePosition = orderedNames.IndexOf("Work Order Value");
        E2ETestAssert.True(
            partialPosition >= 0 &&
            partialPosition < aPosition &&
            aPosition < bPosition &&
            bPosition < workOrderValuePosition,
            "Insert Right did not place Column 1 then Column 2 on the employee-visible right side of the RTL anchor.");

        await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
        await WaitForColumnNamesAbsentAsync(page, ["Gate Column A", "Gate Column B"]);
        await page.Locator("#revogrid-gate5b1-redo").ClickAsync();
        await WaitForColumnNamesAsync(page, ["Gate Column A", "Gate Column B"]);

        // A right-click outside a preserved whole-column Selection must target
        // the clicked column, not retain a stale destructive scope from the old one.
        var selectedAIndex = await GetColumnIndexByNameAsync(page, "Gate Column A");
        var targetBIndex = await GetColumnIndexByNameAsync(page, "Gate Column B");
        var selectedAHeader = page.Locator(
            $"#{GridHostId} .rgHeaderCell[data-rgCol=\"{selectedAIndex}\"] .header-content");
        await selectedAHeader.ClickAsync();
        await page.WaitForTimeoutAsync(120);
        await DataCell(page, 2, targetBIndex).ClickAsync(
            new LocatorClickOptions { Button = MouseButton.Right });
        var outsideStructureMenu = page.Locator(".erp-revo-structure-menu:not([hidden])");
        await outsideStructureMenu.WaitForAsync(
            new LocatorWaitForOptions { State = WaitForSelectorState.Visible, Timeout = 10_000 });
        await page.WaitForTimeoutAsync(200);
        E2ETestAssert.True(
            await outsideStructureMenu.IsVisibleAsync(),
            "Right-click outside a previous Selection opened the Structure Menu only briefly before Revo focus scrolling closed it.");
        await ClickStructureMenuAsync(page, "Delete Columns...");
        var outsideDeleteDialog = VisibleDialog(page, "Delete Columns");
        var outsideSelectionScope = outsideDeleteDialog.Locator(
            "input[type=\"radio\"][value=\"selection\"]");
        E2ETestAssert.True(await outsideSelectionScope.IsCheckedAsync(),
            "Right-click outside a prior column Selection did not retarget the Selection scope to the clicked column.");
        await outsideDeleteDialog.Locator("button:has-text(\"Delete\")").ClickAsync();
        await WaitForColumnNamesAbsentAsync(page, ["Gate Column B"]);
        E2ETestAssert.True((await GetColumnNamesAsync(page)).Contains("Gate Column A"),
            "Right-click outside a prior column Selection deleted the stale selected column instead of the clicked column.");
        await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
        await WaitForColumnNamesAsync(page, ["Gate Column A", "Gate Column B"]);

        var currentIndex = await GetColumnIndexByNameAsync(page, "Gate Column A");
        await OpenStructureMenuAsync(page, 2, currentIndex);
        await ClickStructureMenuAsync(page, "Delete Columns...");
        var deleteDialog = VisibleDialog(page, "Delete Columns");
        E2ETestAssert.Equal(0,
            await deleteDialog.Locator("input[type=\"radio\"][value=\"all\"]").CountAsync(),
            "Delete Columns still exposes the removed All Custom Columns scope.");
        await deleteDialog.Locator("input[type=\"radio\"][value=\"current\"]").CheckAsync();
        await deleteDialog.Locator("button:has-text(\"Delete\")").ClickAsync();
        await WaitForColumnNamesAbsentAsync(page, ["Gate Column A"]);
        E2ETestAssert.True((await GetColumnNamesAsync(page)).Contains("Gate Column B"),
            "Deleting Current Column also removed another Custom Column.");

        await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
        await WaitForColumnNamesAsync(page, ["Gate Column A", "Gate Column B"]);

        // Left/Right are employee-visible directions. Revo reverses the rendered
        // column order in RTL, so verify the opposite side explicitly too.
        partialIndex = await GetColumnIndexAsync(page, "partialAmount");
        await OpenStructureMenuAsync(page, 2, partialIndex);
        await ClickStructureMenuAsync(page, "Insert Columns...");
        var leftDialog = VisibleDialog(page, "Insert Columns");
        await leftDialog.Locator("input[type=\"number\"]").First.FillAsync("1");
        await leftDialog.Locator("input[type=\"number\"]").First.PressAsync("Tab");
        await page.WaitForTimeoutAsync(100);
        var leftSpec = leftDialog.Locator(".erp-revo-structure-dialog__column-spec").First;
        await leftSpec.Locator("input[type=\"text\"]").FillAsync("Gate Column Left");
        await leftSpec.Locator("select").SelectOptionAsync("Text");
        await leftDialog.Locator("button:has-text(\"Insert Left\")").ClickAsync();

        await WaitForColumnNamesAsync(page, ["Gate Column Left"]);
        orderedNames = await GetColumnNamesAsync(page);
        var remainingPosition = orderedNames.IndexOf("Remaining Amount");
        var leftPosition = orderedNames.IndexOf("Gate Column Left");
        partialPosition = orderedNames.IndexOf("Partial Amount");
        E2ETestAssert.True(
            remainingPosition >= 0 &&
            remainingPosition < leftPosition &&
            leftPosition < partialPosition,
            "Insert Left did not place the new column on the employee-visible left side of the RTL anchor.");

        await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
        await WaitForColumnNamesAbsentAsync(page, ["Gate Column Left"]);
    }

    private static async Task AssertRangeFillPasteAsync(IPage page)
    {
        var workTypeIndex = await GetColumnIndexAsync(page, "workTypeCode");
        var sourceValue = await GetCellValueAsync(page, 0, "workTypeCode");
        var before = await GetColumnValuesAsync(page, "workTypeCode", 10, 13);

        await DataCell(page, 0, workTypeIndex).ClickAsync();
        await page.Keyboard.PressAsync("Control+C");
        await page.WaitForTimeoutAsync(150);

        await DataCell(page, 10, workTypeIndex).ClickAsync();
        await page.Keyboard.DownAsync("Shift");
        try
        {
            await DataCell(page, 13, workTypeIndex).ClickAsync();
        }
        finally
        {
            await page.Keyboard.UpAsync("Shift");
        }
        await page.Keyboard.PressAsync("Control+V");

        await page.WaitForFunctionAsync(
            """
            async args => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const rows = await grid.getVisibleSource('rgRow');
                for (let i = args.start; i <= args.end; i++) {
                    if (String(rows[i]?.workTypeCode ?? '') !== args.value) return false;
                }
                return true;
            }
            """,
            new { start = 10, end = 13, value = sourceValue },
            new PageWaitForFunctionOptions { Timeout = 15_000 });

        await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
        await page.WaitForTimeoutAsync(250);
        var afterUndo = await GetColumnValuesAsync(page, "workTypeCode", 10, 13);
        E2ETestAssert.Equal(
            string.Join("\u001F", before),
            string.Join("\u001F", afterUndo),
            "Range-fill Paste did not Undo as one complete operation.");
        var columnsAfterUndo = await GetColumnNamesAsync(page);
        E2ETestAssert.True(
            columnsAfterUndo.Contains("Gate Column A") && columnsAfterUndo.Contains("Gate Column B"),
            "Undoing one range-fill Paste also rewound an earlier column History action.");
    }

    private static ILocator VisibleDialog(IPage page, string title) =>
        page.Locator($".erp-revo-structure-dialog:not([hidden]):has(.erp-revo-structure-dialog__title:has-text(\"{title}\"))");

    private static async Task OpenStructureMenuAsync(IPage page, int row, int column)
    {
        await WaitForRenderedCellAsync(page, row, column);
        await DataCell(page, row, column).ClickAsync(
            new LocatorClickOptions { Button = MouseButton.Right });
        await page.Locator(".erp-revo-structure-menu:not([hidden])").WaitForAsync(
            new LocatorWaitForOptions { State = WaitForSelectorState.Visible, Timeout = 10_000 });
    }

    private static async Task ClickStructureMenuAsync(IPage page, string text)
    {
        await page.Locator(".erp-revo-structure-menu:not([hidden])")
            .Locator($"button:has-text(\"{text}\")")
            .ClickAsync();
    }

    private static ILocator DataCell(IPage page, int row, int column) =>
        page.Locator(
            $"#{GridHostId} revogr-viewport-scroll.rgCol:not([row-header]) " +
            $"[data-rgRow=\"{row}\"][data-rgCol=\"{column}\"]");

    private static async Task WaitForRenderedCellAsync(IPage page, int row, int column)
    {
        await DataCell(page, row, column).WaitForAsync(
            new LocatorWaitForOptions { State = WaitForSelectorState.Visible, Timeout = 15_000 });
    }

    private static async Task<int> GetSourceCountAsync(IPage page) =>
        await page.EvaluateAsync<int>(
            """
            async () => (await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getSource('rgRow')).length
            """);

    private static async Task<int> GetVisibleCountAsync(IPage page) =>
        await page.EvaluateAsync<int>(
            """
            async () => (await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getVisibleSource('rgRow')).length
            """);

    private static async Task WaitForSourceCountAsync(IPage page, int expected) =>
        await page.WaitForFunctionAsync(
            """
            async expected => (await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getSource('rgRow')).length === expected
            """,
            expected,
            new PageWaitForFunctionOptions { Timeout = 15_000 });

    private static async Task WaitForVisibleCountAsync(IPage page, int expected) =>
        await page.WaitForFunctionAsync(
            """
            async expected => (await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getVisibleSource('rgRow')).length === expected
            """,
            expected,
            new PageWaitForFunctionOptions { Timeout = 15_000 });

    private static async Task<int> GetColumnIndexAsync(IPage page, string prop) =>
        await page.EvaluateAsync<int>(
            """
            async prop => (await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getColumns())
                .findIndex(column => String(column?.prop ?? '') === prop)
            """,
            prop);

    private static async Task<int> GetColumnIndexByNameAsync(IPage page, string name) =>
        await page.EvaluateAsync<int>(
            """
            async name => (await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getColumns())
                .findIndex(column => String(column?.name ?? '') === name)
            """,
            name);

    private static async Task<List<string>> GetColumnNamesAsync(IPage page)
    {
        var json = await page.EvaluateAsync<string>(
            """
            async () => JSON.stringify(
                (await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getColumns())
                    .map(column => String(column?.name ?? '')))
            """);

        return JsonSerializer.Deserialize<List<string>>(json) ?? [];
    }

    private static async Task WaitForColumnNamesAsync(IPage page, string[] names) =>
        await page.WaitForFunctionAsync(
            """
            async names => {
                const columns = await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getColumns();
                const current = new Set(columns.map(column => String(column?.name ?? '')));
                return names.every(name => current.has(name));
            }
            """,
            names,
            new PageWaitForFunctionOptions { Timeout = 15_000 });

    private static async Task WaitForColumnNamesAbsentAsync(IPage page, string[] names) =>
        await page.WaitForFunctionAsync(
            """
            async names => {
                const columns = await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getColumns();
                const current = new Set(columns.map(column => String(column?.name ?? '')));
                return names.every(name => !current.has(name));
            }
            """,
            names,
            new PageWaitForFunctionOptions { Timeout = 15_000 });

    private static async Task<string> GetCellValueAsync(IPage page, int visibleIndex, string prop) =>
        await page.EvaluateAsync<string>(
            """
            async args => String((await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getVisibleSource('rgRow'))[args.index]?.[args.prop] ?? '')
            """,
            new { index = visibleIndex, prop });

    private static async Task<List<string>> GetColumnValuesAsync(IPage page, string prop, int start, int end)
    {
        var json = await page.EvaluateAsync<string>(
            """
            async args => {
                const rows = await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getVisibleSource('rgRow');
                return JSON.stringify(
                    rows.slice(args.start, args.end + 1).map(row => String(row?.[args.prop] ?? '')));
            }
            """,
            new { prop, start, end });

        return JsonSerializer.Deserialize<List<string>>(json) ?? [];
    }

    private static async Task ApplySingleWorkTypeFilterAsync(IPage page, string value)
    {
        await page.Locator(".erp-revo-excel-filter-button[data-erp-filter-prop=\"workTypeCode\"]").ClickAsync();
        var popup = page.Locator(".erp-revo-excel-filter");
        await popup.WaitForAsync(new LocatorWaitForOptions { State = WaitForSelectorState.Visible });
        var selectAll = popup.Locator(".erp-revo-excel-filter__select-all input[type=\"checkbox\"]");
        if (await selectAll.IsCheckedAsync()) await selectAll.ClickAsync();
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

    private static string CreateBundle(string artifactDirectory)
    {
        var downloads = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            "Downloads");
        Directory.CreateDirectory(downloads);
        var path = Path.Combine(downloads, $"ERP_REVO_GATE5B9_TRACE_{DateTime.Now:yyyyMMdd-HHmmss}.zip");
        if (File.Exists(path)) File.Delete(path);
        ZipFile.CreateFromDirectory(artifactDirectory, path, CompressionLevel.Optimal, includeBaseDirectory: false);
        return path;
    }

    private static string FindProjectRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            var candidate = Path.Combine(directory.FullName, "ERPPrototype.csproj");
            if (File.Exists(candidate)) return directory.FullName;
            directory = directory.Parent;
        }
        throw new DirectoryNotFoundException("ERPPrototype.csproj was not found.");
    }
}
