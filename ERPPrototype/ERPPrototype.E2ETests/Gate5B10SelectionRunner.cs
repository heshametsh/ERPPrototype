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
        Console.WriteLine("The journey proves visible row/column Ctrl+Shift selection, exact semantic command scope, safe native-range projection after view movement, bounded virtualized repaint, Filter pruning, virtualization, and right-click behavior.");
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

                await AssertRowSelectionUsesBoundedViewportRefreshAsync(page);
                Console.WriteLine("[02-render-contract] PASS — semantic row selection uses bounded rgRow viewport refresh only; no full-grid refresh or source replacement");

                await AssertSelectionStateHasOnePrimaryAsync(page);
                Console.WriteLine("[03-state-shape] PASS — semantic selection uses Selected + Anchor + Primary only; no parallel Active/Lead state");

                await AssertRowPlainCtrlShiftAsync(page);
                Console.WriteLine("[04-rows] PASS — visible Plain/Ctrl/Shift row selection");

                await AssertCtrlRowDeleteUsesExactSemanticKeysAsync(page);
                Console.WriteLine("[05-semantic-delete] PASS — Ctrl-selected rows delete exactly the selected ClientKeys and Undo restores them");

                await AssertRowRightClickPreservesSelectionAsync(page);
                Console.WriteLine("[06-row-context] PASS — right-click inside row selection preserves it");

                await AssertSortPreservesSelectedWorkOrderAsync(page);
                Console.WriteLine("[07-sort] PASS — selected ClientKey survives position changes");

                await AssertShiftSelectionAfterSortNeverBridgesUnselectedRowsAsync(page);
                Console.WriteLine("[08-native-safety] PASS — view movement never projects a fake native range across unselected rows");

                await AssertFilterPrunesSelectionAsync(page);
                Console.WriteLine("[09-filter] PASS — hidden row leaves selection and does not return");

                await AssertFilterRepositionsStillSelectedRowAsync(page);
                Console.WriteLine("[10-filter-native-sync] PASS — a still-visible selected Work Order keeps semantic identity and native range after Filter moves it");

                await AssertInsertPreservesSelectedRowAsync(page);
                Console.WriteLine("[11-insert-native-sync] PASS — Insert Above preserves the same selected Work Order and reprojects Revo to its new row position");

                await AssertRapidCtrlSelectionConvergesAsync(page);
                Console.WriteLine("[12-rapid-ctrl] PASS — rapid Ctrl header clicks converge to one correct semantic/native selection");

                await AssertRowVirtualizationAsync(page);
                Console.WriteLine("[13-row-scroll] PASS — selected Work Order repaints after virtualization");

                await AssertColumnPlainCtrlShiftAsync(page);
                Console.WriteLine("[14-columns] PASS — visible Plain/Ctrl/Shift column selection");

                await AssertCtrlColumnNativeRangeNeverBridgesUnselectedColumnsAsync(page);
                Console.WriteLine("[15-column-native-safety] PASS — Ctrl column selection never projects a fake native range across unselected columns");

                await AssertColumnRightClickPreservesSelectionAsync(page);
                Console.WriteLine("[16-column-context] PASS — right-click inside column selection preserves it");

                await AssertDatasetSwitchClearsSelectionAsync(page);
                Console.WriteLine("[17-dataset] PASS — year switch clears semantic selection");

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

    private static async Task AssertRowSelectionUsesBoundedViewportRefreshAsync(IPage page)
    {
        await ScrollToRowAsync(page, 0);
        await page.EvaluateAsync(
            """
            async () => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                if (!grid || grid.__gate5b10RefreshProbe) return;

                const original = grid.refresh.bind(grid);
                const sourceBefore = await grid.getSource('rgRow');
                const probe = {
                    rgRowCount: 0,
                    allCount: 0,
                    otherCount: 0,
                    original,
                    sourceBefore
                };

                grid.__gate5b10RefreshProbe = probe;
                grid.refresh = async type => {
                    const normalized = String(type ?? 'all');
                    if (normalized === 'rgRow') probe.rgRowCount += 1;
                    else if (normalized === 'all') probe.allCount += 1;
                    else probe.otherCount += 1;
                    return await original(type);
                };
            }
            """);

        try
        {
            await RowHeader(page, 6).ClickAsync();
            await AssertRowVisualAsync(page, 6, selected: true);

            await WithKeyAsync(page, "Control", () => RowHeader(page, 8).ClickAsync());
            await AssertRowVisualAsync(page, 6, selected: true);
            await AssertRowVisualAsync(page, 8, selected: true);

            await DataCell(page, 0, 0).ClickAsync();
            await page.WaitForFunctionAsync(
                """
                () => document.querySelectorAll('#revogrid-native-gate5a-grid [data-erp-row-selected="true"]').length === 0
                """,
                null,
                new PageWaitForFunctionOptions { Timeout = 10_000 });

            var diagnosticsJson = await page.EvaluateAsync<string>(
                """
                async () => {
                    const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                    const probe = grid?.__gate5b10RefreshProbe;
                    const sourceAfter = grid ? await grid.getSource('rgRow') : null;
                    return JSON.stringify({
                        rgRowCount: probe?.rgRowCount ?? -1,
                        allCount: probe?.allCount ?? -1,
                        otherCount: probe?.otherCount ?? -1,
                        sourceSame: Boolean(probe && sourceAfter === probe.sourceBefore)
                    });
                }
                """);

            using var diagnosticsDocument = System.Text.Json.JsonDocument.Parse(diagnosticsJson);
            var diagnostics = diagnosticsDocument.RootElement;
            var rgRowCount = diagnostics.GetProperty("rgRowCount").GetInt32();
            var allCount = diagnostics.GetProperty("allCount").GetInt32();
            var otherCount = diagnostics.GetProperty("otherCount").GetInt32();
            var sourceSame = diagnostics.GetProperty("sourceSame").GetBoolean();

            E2ETestAssert.True(
                rgRowCount > 0 && rgRowCount <= 3,
                $"Selection repaint should be bounded to one virtualized rgRow refresh per semantic change. Actual: {rgRowCount}.");

            E2ETestAssert.Equal(
                0,
                allCount,
                "Semantic row selection requested a full-grid refresh.");

            E2ETestAssert.Equal(
                0,
                otherCount,
                "Semantic row selection requested an unexpected viewport refresh type.");

            E2ETestAssert.True(
                sourceSame,
                "Semantic row selection replaced the rgRow source instead of repainting the existing virtualized viewport.");
        }
        finally
        {
            await page.EvaluateAsync(
                """
                () => {
                    const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                    const probe = grid?.__gate5b10RefreshProbe;
                    if (!grid || !probe) return;
                    grid.refresh = probe.original;
                    delete grid.__gate5b10RefreshProbe;
                }
                """);
        }
    }

    private static async Task AssertSelectionStateHasOnePrimaryAsync(IPage page)
    {
        await ScrollToRowAsync(page, 0);
        await RowHeader(page, 1).ClickAsync();
        await WithKeyAsync(page, "Control", () => RowHeader(page, 3).ClickAsync());

        var shapeIsClean = await page.EvaluateAsync<bool>(
            """
            async () => {
                const module = await import('/js/revoGridGate5B1.js?v=20260830-selection-core-r2');
                const state = await module.getDiagnostics('revogrid-native-gate5a-grid');
                const selection = state?.headerSelection ?? {};
                return String(selection.kind ?? '') === 'rows' &&
                    Array.isArray(selection.selectedKeys) &&
                    selection.selectedKeys.length === 2 &&
                    Boolean(selection.rowAnchorKey) &&
                    Boolean(selection.rowPrimaryKey) &&
                    !Object.prototype.hasOwnProperty.call(selection, 'activeRowKeys') &&
                    !Object.prototype.hasOwnProperty.call(selection, 'rowLeadKey');
            }
            """);

        E2ETestAssert.True(shapeIsClean,
            "Selection state is not the intended Selected + Anchor + Primary shape.");

        await DataCell(page, 0, 0).ClickAsync();
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

    private static async Task AssertCtrlRowDeleteUsesExactSemanticKeysAsync(IPage page)
    {
        await ScrollToRowAsync(page, 0);
        var baselineCount = await GetSourceCountAsync(page);
        var firstKey = await GetVisibleClientKeyAsync(page, 2);
        var middleKey = await GetVisibleClientKeyAsync(page, 3);
        var secondKey = await GetVisibleClientKeyAsync(page, 4);

        await RowHeader(page, 2).ClickAsync();
        await WithKeyAsync(page, "Control", () => RowHeader(page, 4).ClickAsync());
        await DataCell(page, 4, 1).ClickAsync(new LocatorClickOptions { Button = MouseButton.Right });
        await StructureMenu(page).WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });

        await ClickStructureMenuAsync(page, "Delete Rows...");
        var dialog = VisibleDialog(page, "Delete Rows");
        var selectionScope = dialog.Locator("input[type=\"radio\"][value=\"selection\"]");
        E2ETestAssert.True(await selectionScope.IsEnabledAsync(),
            "Ctrl row selection did not expose Rows in Selection.");
        E2ETestAssert.True(await selectionScope.IsCheckedAsync(),
            "Rows in Selection was not the default for Ctrl-selected rows.");
        await dialog.Locator("button:has-text(\"Delete\")").ClickAsync();
        await WaitForSourceCountAsync(page, baselineCount - 2);

        E2ETestAssert.Equal(-1, await FindSourceIndexByClientKeyAsync(page, firstKey),
            "Delete Selection kept the first Ctrl-selected Work Order.");
        E2ETestAssert.Equal(-1, await FindSourceIndexByClientKeyAsync(page, secondKey),
            "Delete Selection kept the second Ctrl-selected Work Order.");
        E2ETestAssert.True(await FindSourceIndexByClientKeyAsync(page, middleKey) >= 0,
            "Delete Selection incorrectly deleted an unselected Work Order between Ctrl selections.");

        await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
        await WaitForSourceCountAsync(page, baselineCount);
        E2ETestAssert.True(await FindSourceIndexByClientKeyAsync(page, firstKey) >= 0,
            "Undo did not restore the first deleted Ctrl-selected Work Order.");
        E2ETestAssert.True(await FindSourceIndexByClientKeyAsync(page, secondKey) >= 0,
            "Undo did not restore the second deleted Ctrl-selected Work Order.");
        E2ETestAssert.True(await FindSourceIndexByClientKeyAsync(page, middleKey) >= 0,
            "Undo disturbed the unselected Work Order between Ctrl selections.");
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

    private static async Task AssertShiftSelectionAfterSortNeverBridgesUnselectedRowsAsync(IPage page)
    {
        var sort = page.Locator(".erp-revo-sort-button[data-erp-sort-prop=\"workOrderValue\"]");
        await EnsureSortClearedAsync(page, sort);

        const int startRow = 399;
        const int endRow = 401;
        await ScrollToRowAsync(page, startRow);
        var selectedKeys = new[]
        {
            await GetVisibleClientKeyAsync(page, startRow),
            await GetVisibleClientKeyAsync(page, startRow + 1),
            await GetVisibleClientKeyAsync(page, endRow)
        };

        await RowHeader(page, startRow).ClickAsync();
        await WithKeyAsync(page, "Shift", () => RowHeader(page, endRow).ClickAsync());
        await AssertNativeRowRangeAsync(page, startRow, endRow);

        int[] positions = Array.Empty<int>();
        var separated = false;
        for (var attempt = 0; attempt < 3 && !separated; attempt++)
        {
            await ClickSortAndWaitForApplyAsync(page, sort);
            positions = new int[selectedKeys.Length];
            for (var index = 0; index < selectedKeys.Length; index++)
            {
                positions[index] = await FindVisibleIndexByClientKeyAsync(page, selectedKeys[index]);
            }

            E2ETestAssert.True(positions.All(position => position >= 0),
                "Sort lost one of the Shift-selected Work Orders from the current view.");
            var ordered = positions.OrderBy(position => position).ToArray();
            separated = ordered.Zip(ordered.Skip(1), (left, right) => right - left)
                .Any(gap => gap > 1);
        }

        E2ETestAssert.True(separated,
            "Sort fixture never separated the originally contiguous Shift selection, so fake-range safety was not proven.");

        var nativeRangeIsSafe = await page.EvaluateAsync<bool>(
            """
            async keys => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const rows = await grid.getVisibleSource('rgRow');
                const range = await grid.getSelectedRange();
                if (!range || !Array.isArray(rows)) return false;
                const y0 = Math.min(Number(range.y), Number(range.y1));
                const y1 = Math.max(Number(range.y), Number(range.y1));
                if (!Number.isInteger(y0) || !Number.isInteger(y1) || y0 < 0 || y1 >= rows.length) return false;
                const selected = new Set(keys.map(value => String(value)));
                const covered = rows.slice(y0, y1 + 1)
                    .map(row => String(row?.clientKey ?? ''));
                return covered.length > 0 && covered.every(key => selected.has(key));
            }
            """,
            selectedKeys);
        E2ETestAssert.True(nativeRangeIsSafe,
            "Revo native range bridged unselected rows after Sort separated a semantic Shift selection.");

        foreach (var key in selectedKeys)
        {
            var index = await FindVisibleIndexByClientKeyAsync(page, key);
            await ScrollToRowAsync(page, index);
            await AssertSelectedKeyVisibleAsync(page, key, expected: true);
        }

        await EnsureSortClearedAsync(page, sort);
        await ScrollToRowAsync(page, 0);
        await DataCell(page, 0, 0).ClickAsync();
    }

    private static async Task EnsureSortClearedAsync(IPage page, ILocator sortButton)
    {
        for (var attempt = 0; attempt < 4; attempt++)
        {
            var label = await sortButton.GetAttributeAsync("aria-label") ?? "";
            if (label.Contains("not sorted", StringComparison.OrdinalIgnoreCase))
            {
                return;
            }
            await ClickSortAndWaitForApplyAsync(page, sortButton);
        }

        throw new InvalidOperationException("Could not return Work Order Value Sort to its clear state.");
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

    private static async Task AssertFilterRepositionsStillSelectedRowAsync(IPage page)
    {
        var fixture = await page.EvaluateAsync<string[]>(
            """
            async () => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const rows = await grid.getVisibleSource('rgRow');
                for (let index = 1; index < rows.length; index += 1) {
                    if (String(rows[index]?.workTypeCode ?? '') !== '401') continue;
                    const hasPriorNonMatch = rows.slice(0, index)
                        .some(row => String(row?.workTypeCode ?? '') !== '401');
                    if (hasPriorNonMatch) {
                        return [String(rows[index]?.clientKey ?? ''), String(index)];
                    }
                }
                return ['', '-1'];
            }
            """);

        var selectedKey = fixture[0];
        var beforeIndex = int.Parse(fixture[1]);
        E2ETestAssert.True(!string.IsNullOrWhiteSpace(selectedKey) && beforeIndex >= 0,
            "Filter movement fixture could not find a 401 Work Order that changes visible position.");

        await ScrollToRowAsync(page, beforeIndex);
        await RowHeader(page, beforeIndex).ClickAsync();
        await AssertNativeWholeRowRangeAsync(page, beforeIndex);

        await ApplySingleWorkTypeFilterAsync(page, "401");
        var filteredIndex = await FindVisibleIndexByClientKeyAsync(page, selectedKey);
        E2ETestAssert.True(filteredIndex >= 0,
            "Filter unexpectedly removed the selected 401 Work Order from the current view.");
        E2ETestAssert.True(filteredIndex != beforeIndex,
            "Filter fixture did not move the selected Work Order, so native re-projection was not proven.");

        await ScrollToRowAsync(page, filteredIndex);
        await AssertSelectedKeyVisibleAsync(page, selectedKey, expected: true);
        await WaitForNativeWholeRowRangeAsync(page, filteredIndex);

        await ClearWorkTypeFilterAsync(page);
        var restoredIndex = await FindVisibleIndexByClientKeyAsync(page, selectedKey);
        E2ETestAssert.True(restoredIndex >= 0,
            "Clearing Filter lost the still-selected Work Order.");
        await ScrollToRowAsync(page, restoredIndex);
        await AssertSelectedKeyVisibleAsync(page, selectedKey, expected: true);
        await WaitForNativeWholeRowRangeAsync(page, restoredIndex);

        await DataCell(page, restoredIndex, 0).ClickAsync();
    }

    private static async Task AssertInsertPreservesSelectedRowAsync(IPage page)
    {
        const int beforeIndex = 8;
        await ScrollToRowAsync(page, beforeIndex);
        var baselineCount = await GetSourceCountAsync(page);
        var selectedKey = await GetVisibleClientKeyAsync(page, beforeIndex);

        await RowHeader(page, beforeIndex).ClickAsync();
        await AssertSelectedKeyVisibleAsync(page, selectedKey, expected: true);
        await AssertNativeWholeRowRangeAsync(page, beforeIndex);

        await DataCell(page, beforeIndex, 0).ClickAsync(
            new LocatorClickOptions { Button = MouseButton.Right });
        await StructureMenu(page).WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });
        await ClickStructureMenuAsync(page, "Insert Rows...");
        var dialog = VisibleDialog(page, "Insert Rows");
        await dialog.Locator("input[type=\"number\"]").FillAsync("1");
        await dialog.Locator("button:has-text(\"Insert Above\")").ClickAsync();
        await WaitForSourceCountAsync(page, baselineCount + 1);

        var movedIndex = await FindVisibleIndexByClientKeyAsync(page, selectedKey);
        E2ETestAssert.Equal(beforeIndex + 1, movedIndex,
            "Insert Above did not move the originally selected Work Order by exactly one visible row.");
        await ScrollToRowAsync(page, movedIndex);
        await AssertSelectedKeyVisibleAsync(page, selectedKey, expected: true);
        await WaitForNativeWholeRowRangeAsync(page, movedIndex);

        await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
        await WaitForSourceCountAsync(page, baselineCount);
        var restoredIndex = await FindVisibleIndexByClientKeyAsync(page, selectedKey);
        E2ETestAssert.Equal(beforeIndex, restoredIndex,
            "Undo Insert did not restore the selected Work Order to its original visible position.");
        await ScrollToRowAsync(page, restoredIndex);
        await AssertSelectedKeyVisibleAsync(page, selectedKey, expected: true);
        await WaitForNativeWholeRowRangeAsync(page, restoredIndex);

        await DataCell(page, restoredIndex, 0).ClickAsync();
    }

    private static async Task AssertRapidCtrlSelectionConvergesAsync(IPage page)
    {
        await ScrollToRowAsync(page, 0);
        await DataCell(page, 0, 0).ClickAsync();

        // Exercise the same sequence through real Playwright clicks rather than
        // dispatching seven synthetic pointerdown events in one JavaScript turn.
        await RowHeader(page, 1).ClickAsync();
        foreach (var row in new[] { 3, 5, 7, 9, 3, 7 })
        {
            await WithKeyAsync(page, "Control", () => RowHeader(page, row).ClickAsync());
            await page.WaitForTimeoutAsync(100);
        }

        await page.WaitForFunctionAsync(
            """
            () => {
                const selected = new Set(
                    [...document.querySelectorAll('#revogrid-native-gate5a-grid [data-erp-row-selected="true"]')]
                        .map(element => element.getAttribute('data-erp-selected-row-key'))
                        .filter(Boolean)
                );
                return selected.size === 3;
            }
            """,
            null,
            new PageWaitForFunctionOptions { Timeout = 10_000 });

        await AssertRowVisualAsync(page, 1, selected: true);
        await AssertRowVisualAsync(page, 3, selected: false);
        await AssertRowVisualAsync(page, 5, selected: true);
        await AssertRowVisualAsync(page, 7, selected: false);
        await AssertRowVisualAsync(page, 9, selected: true);
        await WaitForNativeWholeRowRangeAsync(page, 9);

        await DataCell(page, 0, 0).ClickAsync();
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

    private static async Task AssertCtrlColumnNativeRangeNeverBridgesUnselectedColumnsAsync(IPage page)
    {
        await ScrollToRowAsync(page, 0);
        var firstColumn = await GetVisualColumnIndexAsync(page, "workTypeCode");
        var secondColumn = await GetVisualColumnIndexAsync(page, "workOrderValue");

        await ColumnHeader(page, firstColumn).ClickAsync();
        await WithKeyAsync(page, "Control", () => ColumnHeader(page, secondColumn).ClickAsync());
        await AssertColumnVisualAsync(page, firstColumn, "workTypeCode", selected: true);
        await AssertColumnVisualAsync(page, secondColumn, "workOrderValue", selected: true);

        var nativeRangeIsSafe = await page.EvaluateAsync<bool>(
            """
            async selectedProps => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const range = await grid.getSelectedRange();
                const columns = (await grid.getColumns())
                    .filter(column => String(column?.pin ?? 'rgCol') === String(range?.colType ?? 'rgCol'));
                if (!range || !Array.isArray(columns)) return false;
                const x0 = Math.min(Number(range.x), Number(range.x1));
                const x1 = Math.max(Number(range.x), Number(range.x1));
                if (!Number.isInteger(x0) || !Number.isInteger(x1) || x0 < 0 || x1 >= columns.length) return false;
                const selected = new Set(selectedProps.map(value => String(value)));
                const covered = columns.slice(x0, x1 + 1)
                    .map(column => String(column?.prop ?? ''));
                return covered.length > 0 && covered.every(prop => selected.has(prop));
            }
            """,
            new[] { "workTypeCode", "workOrderValue" });

        E2ETestAssert.True(nativeRangeIsSafe,
            "Revo native column range bridged an unselected column between Ctrl selections.");

        await DataCell(page, 0, 0).ClickAsync();
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

    private static async Task WaitForNativeWholeRowRangeAsync(IPage page, int row)
    {
        await page.WaitForFunctionAsync(
            """
            async expectedRow => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const focused = await grid.getFocused();
                const range = await grid.getSelectedRange();
                if (!focused || !range) return false;
                const y0 = Math.min(Number(range.y), Number(range.y1));
                const y1 = Math.max(Number(range.y), Number(range.y1));
                const x0 = Math.min(Number(range.x), Number(range.x1));
                const x1 = Math.max(Number(range.x), Number(range.x1));
                return y0 === expectedRow && y1 === expectedRow && x1 > x0;
            }
            """,
            row,
            new PageWaitForFunctionOptions { Timeout = 10_000 });
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

    private static async Task<int> GetSourceCountAsync(IPage page) =>
        await page.EvaluateAsync<int>(
            """
            async () => (await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getSource('rgRow')).length
            """);

    private static async Task WaitForSourceCountAsync(IPage page, int expected) =>
        await page.WaitForFunctionAsync(
            """
            async expected => (await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getSource('rgRow')).length === expected
            """,
            expected,
            new PageWaitForFunctionOptions { Timeout = 15_000 });

    private static async Task<int> FindSourceIndexByClientKeyAsync(IPage page, string key) =>
        await page.EvaluateAsync<int>(
            """
            async key => (await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getSource('rgRow'))
                .findIndex(row => String(row?.clientKey ?? '') === key)
            """,
            key);

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
