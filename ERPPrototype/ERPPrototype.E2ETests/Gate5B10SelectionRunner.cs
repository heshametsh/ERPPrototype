using System.IO.Compression;
using Microsoft.Playwright;

namespace ERPPrototype.E2ETests;

internal static class Gate5B10SelectionRunner
{
    private const int FixedPort = 5265;
    private const string GatePath = "/work-orders-revogrid-gate5b10";
    private const string GridHostId = "revogrid-native-gate5a-grid";

    public static async Task<int> RunAsync()
    {
        var projectRoot = FindProjectRoot();
        var artifactDirectory = E2EArtifactManager.CreateRunDirectory(projectRoot);
        Exception? failure = null;

        Console.WriteLine("RevoGrid Gate 5B-10 Header Selection real-browser journey");
        Console.WriteLine("The journey proves visible row/column Ctrl+Shift selection, identity preservation, Filter pruning, virtualization, and right-click behavior.");
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

                await AssertNativeCellSelectionStillWorksAsync(page);
                Console.WriteLine("[01-native] PASS — ordinary Revo cell focus/range still works");

                await AssertRowPlainCtrlShiftAsync(page);
                Console.WriteLine("[02-rows] PASS — visible Plain/Ctrl/Shift row selection");

                await AssertRowRightClickPreservesSelectionAsync(page);
                Console.WriteLine("[03-row-context] PASS — right-click inside row selection preserves it");

                await AssertSortPreservesSelectedWorkOrderAsync(page);
                Console.WriteLine("[04-sort] PASS — selected ClientKey survives position changes");

                await AssertFilterPrunesSelectionAsync(page);
                Console.WriteLine("[05-filter] PASS — hidden row leaves selection and does not return");

                await AssertRowVirtualizationAsync(page);
                Console.WriteLine("[06-row-scroll] PASS — selected Work Order repaints after virtualization");

                await AssertColumnPlainCtrlShiftAsync(page);
                Console.WriteLine("[07-columns] PASS — visible Plain/Ctrl/Shift column selection");

                await AssertColumnRightClickPreservesSelectionAsync(page);
                Console.WriteLine("[08-column-context] PASS — right-click inside column selection preserves it");

                await AssertDatasetSwitchClearsSelectionAsync(page);
                Console.WriteLine("[09-dataset] PASS — year switch clears semantic selection");

                browser.Diagnostics.AssertNoCriticalErrors();
                await browser.CaptureSuccessAsync(
                    "gate5b10-header-selection-real-browser-journey",
                    preserveTrace: true);
            }
            catch (Exception exception)
            {
                failure = exception;
                await browser.CaptureFailureAsync(
                    "gate5b10-header-selection-real-browser-journey");
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
            Console.WriteLine("Gate 5B-10 Header Selection real-browser journey PASS.");
        }
        else
        {
            Console.Error.WriteLine("Gate 5B-10 Header Selection real-browser journey FAILED.");
            Console.Error.WriteLine(failure);
        }
        Console.WriteLine();
        Console.WriteLine("READY TO UPLOAD:");
        Console.WriteLine(bundle);
        return failure is null ? 0 : 1;
    }

    private static async Task AssertNativeCellSelectionStillWorksAsync(IPage page)
    {
        await DataCell(page, 1, 1).ClickAsync();
        await page.Keyboard.DownAsync("Shift");
        try
        {
            await DataCell(page, 3, 2).ClickAsync();
        }
        finally
        {
            await page.Keyboard.UpAsync("Shift");
        }

        var matches = await page.EvaluateAsync<bool>(
            """
            async () => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const focused = await grid.getFocused();
                const range = await grid.getSelectedRange();
                if (!focused || !range) return false;
                const x0 = Math.min(Number(range.x), Number(range.x1));
                const x1 = Math.max(Number(range.x), Number(range.x1));
                const y0 = Math.min(Number(range.y), Number(range.y1));
                const y1 = Math.max(Number(range.y), Number(range.y1));
                return x0 === 1 && x1 === 2 && y0 === 1 && y1 === 3;
            }
            """);
        E2ETestAssert.True(matches, "B10 changed Revo's ordinary Shift cell-range behavior.");
    }

    private static async Task AssertRowPlainCtrlShiftAsync(IPage page)
    {
        await RowHeader(page, 1).ClickAsync();
        await AssertRowVisualAsync(page, 1, selected: true);
        await AssertRowVisualAsync(page, 2, selected: false);
        await AssertNativeWholeRowRangeAsync(page, 1);

        await WithKeyAsync(page, "Control", () => RowHeader(page, 3).ClickAsync());
        await AssertRowVisualAsync(page, 1, selected: true);
        await AssertRowVisualAsync(page, 3, selected: true);
        await AssertRowVisualAsync(page, 2, selected: false);

        await WithKeyAsync(page, "Control", () => RowHeader(page, 1).ClickAsync());
        await AssertRowVisualAsync(page, 1, selected: false);
        await AssertRowVisualAsync(page, 3, selected: true);

        await RowHeader(page, 1).ClickAsync();
        await WithKeyAsync(page, "Shift", () => RowHeader(page, 4).ClickAsync());
        for (var row = 1; row <= 4; row++)
        {
            await AssertRowVisualAsync(page, row, selected: true);
        }
        await AssertRowVisualAsync(page, 5, selected: false);
        await AssertNativeRowRangeAsync(page, 1, 4);
    }

    private static async Task AssertRowRightClickPreservesSelectionAsync(IPage page)
    {
        await RowHeader(page, 2).ClickAsync();
        await WithKeyAsync(page, "Control", () => RowHeader(page, 4).ClickAsync());
        await DataCell(page, 4, 1).ClickAsync(new LocatorClickOptions { Button = MouseButton.Right });
        await StructureMenu(page).WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });

        await AssertRowVisualAsync(page, 2, selected: true);
        await AssertRowVisualAsync(page, 4, selected: true);
        await page.Keyboard.PressAsync("Escape");
        await page.WaitForTimeoutAsync(100);

        await DataCell(page, 3, 1).ClickAsync(new LocatorClickOptions { Button = MouseButton.Right });
        await StructureMenu(page).WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });
        await page.WaitForFunctionAsync(
            """
            () => document.querySelectorAll('#revogrid-native-gate5a-grid [data-erp-row-selected="true"]').length === 0
            """,
            null,
            new PageWaitForFunctionOptions { Timeout = 10_000 });
        await page.Keyboard.PressAsync("Escape");
    }

    private static async Task AssertSortPreservesSelectedWorkOrderAsync(IPage page)
    {
        var sort = page.Locator(".erp-revo-sort-button[data-erp-sort-prop=\"workOrderValue\"]");
        await sort.WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });

        // Wait for Revo's real aftersortingapply event instead of inferring sort
        // completion from the header label. During sorting getVisibleSource can
        // transiently omit a row, so index == -1 must never count as "moved".
        await ClickSortAndWaitForApplyAsync(page, sort);
        await page.WaitForFunctionAsync(
            """
            () => document
                .querySelector('.erp-revo-sort-button[data-erp-sort-prop="workOrderValue"]')
                ?.getAttribute('aria-label')
                ?.includes('largest to smallest') === true
            """,
            null,
            new PageWaitForFunctionOptions { Timeout = 10_000 });

        await ScrollToRowAsync(page, 0);
        await RowHeader(page, 0).ClickAsync();
        var selectedKey = await GetVisibleClientKeyAsync(page, 0);
        var beforeIndex = await FindVisibleIndexByClientKeyAsync(page, selectedKey);

        await ClickSortAndWaitForApplyAsync(page, sort);
        await page.WaitForFunctionAsync(
            """
            async args => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const rows = await grid.getVisibleSource('rgRow');
                const index = rows.findIndex(
                    row => String(row?.clientKey ?? '') === args.key
                );
                return index >= 0 && index !== args.beforeIndex;
            }
            """,
            new { key = selectedKey, beforeIndex },
            new PageWaitForFunctionOptions { Timeout = 10_000 });

        var afterIndex = await FindVisibleIndexByClientKeyAsync(page, selectedKey);

        E2ETestAssert.True(afterIndex >= 0, "Sort lost the selected Work Order from the current view.");
        E2ETestAssert.True(afterIndex != beforeIndex, "Sort fixture did not move the selected Work Order, so identity preservation was not proven.");
        await ScrollToRowAsync(page, afterIndex);
        await SelectedRowByKey(page, selectedKey).First.WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });
        E2ETestAssert.True(await SelectedRowByKey(page, selectedKey).CountAsync() >= 2,
            "Sort kept semantic state but did not visibly repaint multiple cells for the same ClientKey.");
    }

    private static async Task ClickSortAndWaitForApplyAsync(IPage page, ILocator sortButton)
    {
        var beforeCount = await page.EvaluateAsync<int>(
            """
            () => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                if (!grid) return 0;
                if (!Number.isInteger(grid.__gate5b10SortApplyCount)) {
                    grid.__gate5b10SortApplyCount = 0;
                    grid.addEventListener('aftersortingapply', () => {
                        grid.__gate5b10SortApplyCount += 1;
                    });
                }
                return grid.__gate5b10SortApplyCount;
            }
            """);

        await sortButton.ClickAsync();
        await page.WaitForFunctionAsync(
            """
            expected => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                return Number(grid?.__gate5b10SortApplyCount ?? 0) > expected;
            }
            """,
            beforeCount,
            new PageWaitForFunctionOptions { Timeout = 10_000 });
    }

    private static async Task AssertFilterPrunesSelectionAsync(IPage page)
    {
        var targetIndex = await FindVisibleIndexByWorkTypeAsync(page, "402");
        E2ETestAssert.True(targetIndex >= 0, "Filter fixture could not find a 402 row.");
        await ScrollToRowAsync(page, targetIndex);
        await RowHeader(page, targetIndex).ClickAsync();
        var selectedKey = await GetVisibleClientKeyAsync(page, targetIndex);
        await AssertSelectedKeyVisibleAsync(page, selectedKey, expected: true);

        await ApplySingleWorkTypeFilterAsync(page, "401");
        await page.WaitForFunctionAsync(
            """
            () => document.querySelectorAll('#revogrid-native-gate5a-grid [data-erp-row-selected="true"]').length === 0
            """,
            null,
            new PageWaitForFunctionOptions { Timeout = 10_000 });

        await ClearWorkTypeFilterAsync(page);
        var restoredIndex = await FindVisibleIndexByClientKeyAsync(page, selectedKey);
        E2ETestAssert.True(restoredIndex >= 0, "Clearing Filter did not restore the Work Order to the view.");
        await ScrollToRowAsync(page, restoredIndex);
        await WaitForRenderedCellAsync(page, restoredIndex, 0);
        await AssertSelectedKeyVisibleAsync(page, selectedKey, expected: false);
    }

    private static async Task AssertRowVirtualizationAsync(IPage page)
    {
        await ScrollToRowAsync(page, 0);
        await RowHeader(page, 0).ClickAsync();
        var selectedKey = await GetVisibleClientKeyAsync(page, 0);
        await ScrollToRowAsync(page, 900);
        await WaitForRenderedCellAsync(page, 900, 0);

        var selectedIndex = await FindVisibleIndexByClientKeyAsync(page, selectedKey);
        await ScrollToRowAsync(page, selectedIndex);
        await SelectedRowByKey(page, selectedKey).First.WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });
        E2ETestAssert.True(await SelectedRowByKey(page, selectedKey).CountAsync() >= 2,
            "Virtualization restored the row but not its visible selected state.");
    }

    private static async Task AssertColumnPlainCtrlShiftAsync(IPage page)
    {
        await ScrollToRowAsync(page, 0);

        var workTypeColumn = await GetVisualColumnIndexAsync(page, "workTypeCode");
        var assignmentColumn = await GetVisualColumnIndexAsync(page, "assignmentDate");
        var workOrderValueColumn = await GetVisualColumnIndexAsync(page, "workOrderValue");
        var partialAmountColumn = await GetVisualColumnIndexAsync(page, "partialAmount");
        var remainingAmountColumn = await GetVisualColumnIndexAsync(page, "remainingAmount");
        var workOrderNumberColumn = await GetVisualColumnIndexAsync(page, "workOrderNumber");
        var workOrderBefore = (await DataCell(page, 0, workOrderNumberColumn).InnerTextAsync()).Trim();

        await ColumnHeader(page, workTypeColumn).ClickAsync();
        await AssertColumnVisualAsync(page, workTypeColumn, "workTypeCode", selected: true);
        await AssertColumnVisualAsync(page, assignmentColumn, "assignmentDate", selected: false);
        E2ETestAssert.Equal(
            workOrderBefore,
            (await DataCell(page, 0, workOrderNumberColumn).InnerTextAsync()).Trim(),
            "Whole-column repaint changed RTL column/data alignment.");
        await AssertNativeWholeColumnRangeAsync(page, workTypeColumn);

        await WithKeyAsync(page, "Control", () => ColumnHeader(page, workOrderValueColumn).ClickAsync());
        await AssertColumnVisualAsync(page, workTypeColumn, "workTypeCode", selected: true);
        await AssertColumnVisualAsync(page, workOrderValueColumn, "workOrderValue", selected: true);
        await AssertColumnVisualAsync(page, assignmentColumn, "assignmentDate", selected: false);

        await WithKeyAsync(page, "Control", () => ColumnHeader(page, workTypeColumn).ClickAsync());
        await AssertColumnVisualAsync(page, workTypeColumn, "workTypeCode", selected: false);
        await AssertColumnVisualAsync(page, workOrderValueColumn, "workOrderValue", selected: true);

        await ColumnHeader(page, workTypeColumn).ClickAsync();
        await WithKeyAsync(page, "Shift", () => ColumnHeader(page, partialAmountColumn).ClickAsync());
        await AssertColumnVisualAsync(page, workTypeColumn, "workTypeCode", selected: true);
        await AssertColumnVisualAsync(page, assignmentColumn, "assignmentDate", selected: true);
        await AssertColumnVisualAsync(page, workOrderValueColumn, "workOrderValue", selected: true);
        await AssertColumnVisualAsync(page, partialAmountColumn, "partialAmount", selected: true);
        await AssertColumnVisualAsync(page, remainingAmountColumn, "remainingAmount", selected: false);
        await AssertNativeColumnRangeAsync(page, workTypeColumn, partialAmountColumn);
    }

    private static async Task AssertColumnRightClickPreservesSelectionAsync(IPage page)
    {
        var workTypeColumn = await GetVisualColumnIndexAsync(page, "workTypeCode");
        var assignmentColumn = await GetVisualColumnIndexAsync(page, "assignmentDate");
        var workOrderValueColumn = await GetVisualColumnIndexAsync(page, "workOrderValue");

        await ColumnHeader(page, workTypeColumn).ClickAsync();
        await WithKeyAsync(page, "Control", () => ColumnHeader(page, workOrderValueColumn).ClickAsync());
        await DataCell(page, 2, workOrderValueColumn).ClickAsync(new LocatorClickOptions { Button = MouseButton.Right });
        await StructureMenu(page).WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });

        await AssertColumnVisualAsync(page, workTypeColumn, "workTypeCode", selected: true);
        await AssertColumnVisualAsync(page, workOrderValueColumn, "workOrderValue", selected: true);

        await ClickStructureMenuAsync(page, "Delete Rows...");
        var deleteRows = VisibleDialog(page, "Delete Rows");
        var selectionScope = deleteRows.Locator("input[type=\"radio\"][value=\"selection\"]");
        E2ETestAssert.True(await selectionScope.IsEnabledAsync(),
            "Right-click inside semantic column selection lost the whole-column row scope.");
        E2ETestAssert.True(await selectionScope.IsCheckedAsync(),
            "Rows in Selection was not preserved for semantic whole-column selection.");
        await deleteRows.Locator("button:has-text(\"Cancel\")").ClickAsync();

        await DataCell(page, 2, assignmentColumn).ClickAsync(new LocatorClickOptions { Button = MouseButton.Right });
        await StructureMenu(page).WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });
        await page.WaitForFunctionAsync(
            """
            () => document.querySelectorAll('#revogrid-native-gate5a-grid [data-erp-column-selected="true"]').length === 0
            """,
            null,
            new PageWaitForFunctionOptions { Timeout = 10_000 });
        await page.Keyboard.PressAsync("Escape");
    }

    private static async Task AssertDatasetSwitchClearsSelectionAsync(IPage page)
    {
        await ScrollToRowAsync(page, 0);
        await RowHeader(page, 0).ClickAsync();
        await AssertRowVisualAsync(page, 0, selected: true);

        var yearSelector = page.GetByTestId("gate5a-year-selector");
        var options = await yearSelector.Locator("option").AllAsync();
        E2ETestAssert.True(options.Count >= 2, "Dataset-switch fixture exposes fewer than two Work Years.");
        var current = await yearSelector.InputValueAsync();
        string? next = null;
        foreach (var option in options)
        {
            var value = await option.GetAttributeAsync("value");
            if (!string.IsNullOrWhiteSpace(value) && value != current)
            {
                next = value;
                break;
            }
        }
        E2ETestAssert.True(!string.IsNullOrWhiteSpace(next), "Could not resolve another Work Year for the dataset-switch test.");

        await yearSelector.SelectOptionAsync(next!);
        await page.WaitForFunctionAsync(
            """
            expected => {
                const selector = document.querySelector('[data-testid="gate5a-year-selector"]');
                const loading = document.querySelector('.native-gate5a__loading');
                const status = document.querySelector('.native-gate5a__statusbar')?.textContent ?? '';
                return selector?.value === expected
                    && selector.disabled === false
                    && !loading
                    && status.includes(`Dataset ${expected}`);
            }
            """,
            next,
            new PageWaitForFunctionOptions { Timeout = 30_000 });
        await WaitForRenderedCellAsync(page, 0, 0);
        E2ETestAssert.Equal(0,
            await page.Locator($"#{GridHostId} [data-erp-row-selected=\"true\"], #{GridHostId} [data-erp-column-selected=\"true\"]").CountAsync(),
            "Dataset switch preserved stale header selection.");
    }

    private static async Task AssertRowVisualAsync(IPage page, int row, bool selected)
    {
        await WaitForRenderedCellAsync(page, row, 0);
        var selectedHeader = page.Locator(
            $"#{GridHostId} revogr-row-headers [data-rgRow=\"{row}\"][data-erp-row-header-selected=\"true\"]");
        var selectedCells = page.Locator(
            $"#{GridHostId} revogr-viewport-scroll.rgCol:not([row-header]) [data-rgRow=\"{row}\"][data-erp-row-selected=\"true\"]");

        if (selected)
        {
            await selectedHeader.First.WaitForAsync(new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = 10_000
            });
            E2ETestAssert.True(await selectedCells.CountAsync() >= 2,
                $"Row {row} selection is not visibly painted across multiple rendered cells.");
        }
        else
        {
            E2ETestAssert.Equal(0, await selectedHeader.CountAsync(), $"Row {row} header stayed selected unexpectedly.");
            E2ETestAssert.Equal(0, await selectedCells.CountAsync(), $"Row {row} cells stayed selected unexpectedly.");
        }
    }

    private static async Task AssertColumnVisualAsync(
        IPage page,
        int column,
        string prop,
        bool selected)
    {
        var selectedHeader = page.Locator(
            $"#{GridHostId} .rgHeaderCell[data-rgCol=\"{column}\"]" +
            $"[data-erp-column-header-selected=\"true\"]" +
            $"[data-erp-selected-column-prop=\"{prop}\"]");
        var selectedCells = page.Locator(
            $"#{GridHostId} revogr-viewport-scroll.rgCol:not([row-header]) " +
            $"[data-rgCol=\"{column}\"]" +
            $"[data-erp-column-selected=\"true\"]" +
            $"[data-erp-selected-column-prop=\"{prop}\"]");

        if (selected)
        {
            await selectedHeader.First.WaitForAsync(new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = 10_000
            });
            E2ETestAssert.True(await selectedCells.CountAsync() >= 2,
                $"Column '{prop}' selection is not visibly painted across multiple rendered cells.");
        }
        else
        {
            E2ETestAssert.Equal(0, await selectedHeader.CountAsync(),
                $"Column '{prop}' header stayed selected unexpectedly.");
            E2ETestAssert.Equal(0, await selectedCells.CountAsync(),
                $"Column '{prop}' cells stayed selected unexpectedly.");
        }
    }

    private static async Task AssertNativeWholeRowRangeAsync(IPage page, int row)
    {
        await AssertNativeRowRangeAsync(page, row, row);
    }

    private static async Task AssertNativeRowRangeAsync(IPage page, int startRow, int endRow)
    {
        var matches = await page.EvaluateAsync<bool>(
            """
            async args => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const focused = await grid.getFocused();
                const range = await grid.getSelectedRange();
                if (!focused || !range) return false;
                const y0 = Math.min(Number(range.y), Number(range.y1));
                const y1 = Math.max(Number(range.y), Number(range.y1));
                const x0 = Math.min(Number(range.x), Number(range.x1));
                const x1 = Math.max(Number(range.x), Number(range.x1));
                return y0 === args.startRow && y1 === args.endRow && x1 > x0;
            }
            """,
            new { startRow, endRow });
        E2ETestAssert.True(matches,
            $"Revo native range does not own whole-row selection {startRow}..{endRow}.");
    }

    private static async Task AssertNativeWholeColumnRangeAsync(IPage page, int column)
    {
        await AssertNativeColumnRangeAsync(page, column, column);
    }

    private static async Task AssertNativeColumnRangeAsync(IPage page, int startColumn, int endColumn)
    {
        var matches = await page.EvaluateAsync<bool>(
            """
            async args => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const focused = await grid.getFocused();
                const range = await grid.getSelectedRange();
                const rows = await grid.getVisibleSource('rgRow');
                if (!focused || !range || !Array.isArray(rows) || rows.length === 0) return false;
                const x0 = Math.min(Number(range.x), Number(range.x1));
                const x1 = Math.max(Number(range.x), Number(range.x1));
                const y0 = Math.min(Number(range.y), Number(range.y1));
                const y1 = Math.max(Number(range.y), Number(range.y1));
                const expectedX0 = Math.min(args.startColumn, args.endColumn);
                const expectedX1 = Math.max(args.startColumn, args.endColumn);
                return x0 === expectedX0 && x1 === expectedX1 && y0 === 0 && y1 === rows.length - 1;
            }
            """,
            new { startColumn, endColumn });
        E2ETestAssert.True(matches,
            $"Revo native range does not own whole-column selection {startColumn}..{endColumn}.");
    }

    private static async Task AssertSelectedKeyVisibleAsync(IPage page, string key, bool expected)
    {
        var count = await SelectedRowByKey(page, key).CountAsync();
        if (expected)
        {
            E2ETestAssert.True(count >= 2, "Selected ClientKey is not visibly painted across multiple rendered cells.");
        }
        else
        {
            E2ETestAssert.Equal(0, count, "A filtered-out ClientKey was silently reselected after clearing Filter.");
        }
    }

    private static async Task WithKeyAsync(IPage page, string key, Func<Task> action)
    {
        await page.Keyboard.DownAsync(key);
        try
        {
            await action();
        }
        finally
        {
            await page.Keyboard.UpAsync(key);
        }
    }

    private static ILocator Grid(IPage page) => page.Locator($"#{GridHostId} revo-grid");

    private static ILocator StructureMenu(IPage page) =>
        page.Locator(".erp-revo-structure-menu:not([hidden])");

    private static ILocator VisibleDialog(IPage page, string title) =>
        page.Locator($".erp-revo-structure-dialog:not([hidden]):has(.erp-revo-structure-dialog__title:has-text(\"{title}\"))");

    private static async Task ClickStructureMenuAsync(IPage page, string text)
    {
        await StructureMenu(page).Locator($"button:has-text(\"{text}\")").ClickAsync();
    }

    private static ILocator DataCell(IPage page, int row, int column) =>
        page.Locator(
            $"#{GridHostId} revogr-viewport-scroll.rgCol:not([row-header]) " +
            $"[data-rgRow=\"{row}\"][data-rgCol=\"{column}\"]");

    private static ILocator RowHeader(IPage page, int row) =>
        page.Locator($"#{GridHostId} revogr-row-headers [data-rgRow=\"{row}\"]").First;

    private static async Task<int> GetVisualColumnIndexAsync(IPage page, string prop)
    {
        var index = await page.EvaluateAsync<int>(
            """
            prop => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const columns = Array.isArray(grid?.columns) ? grid.columns : [];
                const logicalIndex = columns.findIndex(
                    column => String(column?.prop ?? '') === prop);
                if (logicalIndex < 0) {
                    return -1;
                }
                return grid?.rtl
                    ? columns.length - 1 - logicalIndex
                    : logicalIndex;
            }
            """,
            prop);

        if (index < 0)
        {
            throw new InvalidOperationException(
                $"RevoGrid column '{prop}' was not found in the real browser runtime.");
        }

        return index;
    }

    private static ILocator ColumnHeader(IPage page, int column) =>
        page.Locator($"#{GridHostId} .rgHeaderCell[data-rgCol=\"{column}\"] .header-content");

    private static ILocator SelectedRowByKey(IPage page, string key) =>
        page.Locator(
            $"#{GridHostId} revogr-viewport-scroll.rgCol:not([row-header]) " +
            $"[data-erp-row-selected=\"true\"][data-erp-selected-row-key=\"{key}\"]");

    private static async Task WaitForRenderedCellAsync(IPage page, int row, int column) =>
        await DataCell(page, row, column).WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 15_000
        });

    private static async Task ScrollToRowAsync(IPage page, int row)
    {
        await page.EvaluateAsync(
            """
            async row => await document.querySelector('#revogrid-native-gate5a-grid revo-grid').scrollToRow(row)
            """,
            row);
        await page.WaitForTimeoutAsync(100);
    }

    private static async Task<string> GetVisibleClientKeyAsync(IPage page, int index) =>
        await page.EvaluateAsync<string>(
            """
            async index => String((await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getVisibleSource('rgRow'))[index]?.clientKey ?? '')
            """,
            index);

    private static async Task<int> FindVisibleIndexByClientKeyAsync(IPage page, string key) =>
        await page.EvaluateAsync<int>(
            """
            async key => (await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getVisibleSource('rgRow'))
                .findIndex(row => String(row?.clientKey ?? '') === key)
            """,
            key);

    private static async Task<int> FindVisibleIndexByWorkTypeAsync(IPage page, string value) =>
        await page.EvaluateAsync<int>(
            """
            async value => (await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getVisibleSource('rgRow'))
                .findIndex(row => String(row?.workTypeCode ?? '') === value)
            """,
            value);

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
        var path = Path.Combine(downloads, $"ERP_REVO_GATE5B10_TRACE_{DateTime.Now:yyyyMMdd-HHmmss}.zip");
        if (File.Exists(path)) File.Delete(path);
        ZipFile.CreateFromDirectory(artifactDirectory, path, CompressionLevel.Optimal, includeBaseDirectory: false);
        return path;
    }

    private static string FindProjectRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            var project = Path.Combine(directory.FullName, "ERPPrototype.csproj");
            if (File.Exists(project)) return directory.FullName;
            directory = directory.Parent;
        }

        throw new DirectoryNotFoundException("Could not locate ERPPrototype.csproj from the E2E runner.");
    }
}
