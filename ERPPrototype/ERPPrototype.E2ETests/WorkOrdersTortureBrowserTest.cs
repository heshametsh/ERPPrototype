using System.Diagnostics;
using System.Globalization;
using Microsoft.Playwright;

namespace ERPPrototype.E2ETests;

internal sealed class WorkOrdersTortureBrowserTest(
    Uri baseUri,
    E2ESeedData seed,
    string artifactDirectory,
    bool headed)
{
    private const int SplitViewportWidth = 960;
    private const int SplitViewportHeight = 900;
    private const int SplitWindowWidth = 1000;
    private const int SplitWindowHeight = 980;
    private const int BulkRows = 1_000;
    private const int MaximumExpectedRenderedRows = 180;

    public async Task<WorkOrdersTortureReport> RunAsync()
    {
        var runDirectory = Path.Combine(artifactDirectory, "work-orders-torture");
        Directory.CreateDirectory(runDirectory);

        await using var browserSession = await E2EBrowserSession.CreateAsync(
            baseUri,
            runDirectory,
            headed,
            traceEnabled: false,
            benchmarkMode: true,
            viewportWidth: SplitViewportWidth,
            viewportHeight: SplitViewportHeight,
            windowWidth: SplitWindowWidth,
            windowHeight: SplitWindowHeight,
            screenWidth: 1920,
            screenHeight: 1080);

        var page = browserSession.Page;
        var loginPage = new LoginPage(page, baseUri);
        var workOrdersPage = new WorkOrdersPage(page);
        var metrics = new List<WorkOrdersTorturePhaseMetric>();
        var maximumRenderedRows = 0;

        try
        {
            await loginPage.OpenAsync();
            await loginPage.LoginAsync(seed);
            await workOrdersPage.WaitUntilReadyAsync();
            await workOrdersPage.WaitForActiveRowCountAsync(seed.RowsPerYear);
            await WaitForTwoAnimationFramesAsync(page);

            E2ETestAssert.Equal(
                seed.RowsPerYear,
                await workOrdersPage.GetActiveRowCountAsync(),
                "Torture run did not start with the requested Work Orders dataset.");
            E2ETestAssert.Equal(
                0,
                await workOrdersPage.GetDirtyRowCountAsync(),
                "Torture run did not start from a clean Work Orders sheet.");

            await InstallLongTaskObserverAsync(page);

            async Task MeasureAsync(string name, string description, Func<Task> action)
            {
                await ResetLongTasksAsync(page);
                var startedAt = Stopwatch.GetTimestamp();
                await action();
                await WaitForTwoAnimationFramesAsync(page);
                var wallMs = Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds;
                var longTasks = await ReadLongTasksAsync(page);
                var renderedRows = await workOrdersPage.GetRenderedRowCountAsync();
                maximumRenderedRows = Math.Max(maximumRenderedRows, renderedRows);

                var metric = new WorkOrdersTorturePhaseMetric(
                    name,
                    description,
                    wallMs,
                    longTasks.Length,
                    longTasks.Sum(),
                    longTasks.Length == 0 ? 0 : longTasks.Max(),
                    renderedRows,
                    await workOrdersPage.GetActiveRowCountAsync(),
                    await workOrdersPage.GetDirtyRowCountAsync());
                metrics.Add(metric);

                Console.WriteLine(
                    $"  {name}: {wallMs:N2} ms; " +
                    $"long tasks={metric.LongTaskCount}; " +
                    $"worst={metric.MaximumLongTaskMilliseconds:N2} ms; " +
                    $"active={metric.ActiveRowCount:N0}; dirty={metric.DirtyRowCount:N0}");
            }

            var searchTargets = await GetSearchTargetsAsync(workOrdersPage);

            await MeasureAsync(
                "search-clear-storm-10",
                "Ten search/clear cycles across distant rows in the 10k sheet.",
                async () =>
                {
                    for (var cycle = 0; cycle < 10; cycle++)
                    {
                        var target = searchTargets[cycle % searchTargets.Length];
                        await workOrdersPage.SearchWorkOrderAsync(target);
                        await workOrdersPage.ClearSearchAsync(seed.RowsPerYear);
                    }
                });

            await MeasureAsync(
                "filter-clear-storm-10",
                "Ten Work Type filter/clear cycles over the full 10k dataset.",
                async () =>
                {
                    for (var cycle = 0; cycle < 10; cycle++)
                    {
                        await workOrdersPage.ApplyValueFilterAsync(
                            "workTypeCode",
                            ["401"],
                            seed.RowsPerYear / 4);
                        await workOrdersPage.ClearValueFilterAsync(
                            "workTypeCode",
                            seed.RowsPerYear);
                    }
                });

            await MeasureAsync(
                "sort-storm-6",
                "Six full-sheet financial sorts with direction changes and final clear.",
                async () =>
                {
                    for (var cycle = 0; cycle < 3; cycle++)
                    {
                        await workOrdersPage.SortFinancialColumnAsync(
                            "workOrderValue",
                            "desc");
                        await workOrdersPage.SortFinancialColumnAsync(
                            "workOrderValue",
                            "asc");
                    }
                    await workOrdersPage.ClearSortAsync();
                });

            await MeasureAsync(
                "wheel-scroll-storm",
                "Aggressive wheel scrolling down and back up through the virtualized grid.",
                async () => await PerformWheelStormAsync(page));

            await MeasureAsync(
                "keyboard-storm-1000",
                "One thousand rapid keyboard row-navigation actions with periodic render yields.",
                async () => await PerformKeyboardStormAsync(page, workOrdersPage));

            await MeasureAsync(
                "range-keyboard-storm-240",
                "Expand and shrink a logical cell range across Virtual DOM boundaries while verifying rendered selection continuity.",
                async () => await PerformRangeKeyboardStormAsync(page, workOrdersPage));

            await MeasureAsync(
                "navigation-after-structure-changes",
                "Verify vertical navigation uses the current row order after insert/delete and their Undo/Redo cycles.",
                async () => await PerformNavigationAfterStructuralChangesAsync(
                    page,
                    workOrdersPage,
                    seed.RowsPerYear));

            var editRowIds = await workOrdersPage.GetActiveRowIdsAsync(1_000, BulkRows);
            E2ETestAssert.Equal(BulkRows, editRowIds.Length,
                "Could not obtain 1,000 existing rows for the edit torture phase.");

            var editValues = Enumerable.Range(0, BulkRows)
                .Select(index =>
                    (5_000_000m + index + 0.25m)
                        .ToString("0.00", CultureInfo.InvariantCulture))
                .ToArray();

            await MeasureAsync(
                "edit-1000-paste",
                "Change Work Order Value on 1,000 existing rows in one Excel-like paste.",
                async () =>
                {
                    await workOrdersPage.PasteColumnValuesAsync(
                        editRowIds[0],
                        "workOrderValue",
                        editValues,
                        BulkRows);
                });

            await MeasureAsync(
                "dirty-interaction-storm",
                "Search, filter and sort while 1,000 edited rows are still unsaved.",
                async () =>
                {
                    await workOrdersPage.SearchWorkOrderAsync(searchTargets[0]);
                    await workOrdersPage.ClearSearchAsync(seed.RowsPerYear);
                    await workOrdersPage.ApplyValueFilterAsync(
                        "workTypeCode", ["401"], seed.RowsPerYear / 4);
                    await workOrdersPage.ClearValueFilterAsync(
                        "workTypeCode", seed.RowsPerYear);
                    await workOrdersPage.SortFinancialColumnAsync(
                        "workOrderValue", "desc");
                    await workOrdersPage.ClearSortAsync();
                    await workOrdersPage.WaitForDirtyRowCountAsync(BulkRows);
                });

            var undoStepsToReachBulkEdit = 0;

            await MeasureAsync(
                "undo-through-dirty-interactions",
                "Undo later search/filter history until the 1,000-row edit transaction itself is undone.",
                async () =>
                {
                    const int maximumUndoSteps = 12;

                    while (
                        await workOrdersPage.GetDirtyRowCountAsync() != 0 &&
                        undoStepsToReachBulkEdit < maximumUndoSteps)
                    {
                        await workOrdersPage.UndoAsync();
                        undoStepsToReachBulkEdit++;
                    }

                    E2ETestAssert.Equal(
                        0,
                        await workOrdersPage.GetDirtyRowCountAsync(),
                        $"Undo did not reach the 1,000-row edit transaction within {maximumUndoSteps} steps.");
                });

            Console.WriteLine(
                $"    Undo steps required to reach the 1,000-row paste: {undoStepsToReachBulkEdit}");

            await MeasureAsync(
                "redo-through-dirty-interactions",
                "Redo the same history steps and restore the exact dirty state that existed before Undo.",
                async () =>
                {
                    for (var step = 0; step < undoStepsToReachBulkEdit; step++)
                    {
                        await workOrdersPage.RedoAsync();
                    }

                    await workOrdersPage.WaitForDirtyRowCountAsync(BulkRows);
                });

            await MeasureAsync(
                "save-1000-edits",
                "Persist 1,000 changed existing Work Orders in one Save.",
                async () =>
                {
                    await workOrdersPage.SaveAndWaitAsync();
                    await workOrdersPage.WaitForDirtyRowCountAsync(0);
                });

            await MeasureAsync(
                "reload-verify-1000-edits",
                "Reload after the 1,000-row Save and verify first/middle/last edited values.",
                async () =>
                {
                    await workOrdersPage.ReloadAndWaitAsync();
                    await workOrdersPage.WaitForActiveRowCountAsync(seed.RowsPerYear);
                    await VerifySampleValuesAsync(
                        workOrdersPage,
                        editRowIds,
                        editValues,
                        "workOrderValue");
                });

            await MeasureAsync(
                "insert-1000-blank",
                "Insert 1,000 rows below a real Work Order.",
                async () =>
                {
                    await workOrdersPage.InsertRowsAsync(
                        seed.CurrentYearFirstRowId,
                        BulkRows,
                        "below",
                        seed.RowsPerYear + BulkRows);
                    await workOrdersPage.WaitForDirtyRowCountAsync(BulkRows);
                });

            await MeasureAsync(
                "undo-redo-insert-1000",
                "Undo and redo a 1,000-row structural insert before filling the new rows.",
                async () =>
                {
                    await workOrdersPage.UndoAsync();
                    await workOrdersPage.WaitForActiveRowCountAsync(seed.RowsPerYear);
                    await workOrdersPage.WaitForDirtyRowCountAsync(0);
                    await workOrdersPage.RedoAsync();
                    await workOrdersPage.WaitForActiveRowCountAsync(seed.RowsPerYear + BulkRows);
                    await workOrdersPage.WaitForDirtyRowCountAsync(BulkRows);
                });

            var temporaryRows = await workOrdersPage.GetTemporaryRowIdsAsync();
            E2ETestAssert.Equal(BulkRows, temporaryRows.Length,
                "The 1,000 inserted rows were not present as 1,000 temporary rows.");

            var insertedWorkOrderNumbers = Enumerable.Range(1, BulkRows)
                .Select(index => (930_000_000 + index).ToString("D9"))
                .ToArray();
            var insertedMatrix = Enumerable.Range(0, BulkRows)
                .Select(index => new[]
                {
                    insertedWorkOrderNumbers[index],
                    index % 2 == 0 ? "401" : "402",
                    $"15/08/{seed.CurrentYear}",
                    (6_000_000m + index + 0.25m)
                        .ToString("0.00", CultureInfo.InvariantCulture)
                })
                .ToArray();

            var insertedBasketMatrix = Enumerable.Range(0, BulkRows)
                .Select(_ => new[] { ERPPrototype.Data.WorkOrderBuskets.InProgress })
                .ToArray();

            await MeasureAsync(
                "fill-1000-new-rows",
                "Paste all required business data, including Basket, into all 1,000 newly inserted rows.",
                async () =>
                {
                    await workOrdersPage.PasteMatrixAsync(
                        temporaryRows[0],
                        "workOrderNumber",
                        insertedMatrix,
                        BulkRows);
                    await workOrdersPage.PasteMatrixAsync(
                        temporaryRows[0],
                        "basket",
                        insertedBasketMatrix,
                        BulkRows);

                    foreach (var index in SampleIndexes(BulkRows))
                    {
                        E2ETestAssert.Equal(
                            ERPPrototype.Data.WorkOrderBuskets.InProgress,
                            await workOrdersPage.GetCellValueAsync(
                                temporaryRows[index],
                                "basket"),
                            $"Inserted row sample {index} did not receive the required Basket before Save.");
                    }
                });

            await MeasureAsync(
                "save-1000-new-rows",
                "Persist all 1,000 newly created Work Orders in one Save.",
                async () =>
                {
                    await workOrdersPage.SaveAndWaitAsync();
                    await workOrdersPage.WaitForDirtyRowCountAsync(0);
                    await workOrdersPage.WaitForActiveRowCountAsync(seed.RowsPerYear + BulkRows);
                });

            await MeasureAsync(
                "reload-verify-1000-inserts",
                "Reload and prove first/middle/last of the 1,000 new Work Orders still exist.",
                async () =>
                {
                    await workOrdersPage.ReloadAndWaitAsync();
                    await workOrdersPage.WaitForActiveRowCountAsync(seed.RowsPerYear + BulkRows);
                    foreach (var index in SampleIndexes(BulkRows))
                    {
                        E2ETestAssert.True(
                            await workOrdersPage.ContainsWorkOrderInDataAsync(
                                insertedWorkOrderNumbers[index]),
                            $"Inserted Work Order {insertedWorkOrderNumbers[index]} was lost after reload.");
                    }
                });

            var deleteRowIds = await workOrdersPage.GetActiveRowIdsAsync(6_000, BulkRows);
            E2ETestAssert.Equal(BulkRows, deleteRowIds.Length,
                "Could not obtain 1,000 rows for the delete torture phase.");
            var deletedWorkOrderSamples = new List<string>();
            foreach (var index in SampleIndexes(BulkRows))
            {
                deletedWorkOrderSamples.Add(
                    await workOrdersPage.GetCellValueAsync(
                        deleteRowIds[index],
                        "workOrderNumber"));
            }

            await MeasureAsync(
                "select-delete-1000",
                "Select and delete 1,000 contiguous Work Orders in one structural action.",
                async () =>
                {
                    await workOrdersPage.SelectContiguousRowsAsync(
                        deleteRowIds[0], BulkRows);
                    await workOrdersPage.WaitForSelectionAggregateAsync(BulkRows, 180_000);
                    await workOrdersPage.DeleteSelectedRowsAsync(
                        seed.RowsPerYear,
                        BulkRows);
                });

            await MeasureAsync(
                "undo-redo-delete-1000",
                "Undo and redo the 1,000-row deletion before Save.",
                async () =>
                {
                    await workOrdersPage.UndoAsync();
                    await workOrdersPage.WaitForActiveRowCountAsync(seed.RowsPerYear + BulkRows);
                    await workOrdersPage.WaitForDirtyRowCountAsync(0);
                    await workOrdersPage.RedoAsync();
                    await workOrdersPage.WaitForActiveRowCountAsync(seed.RowsPerYear);
                    await workOrdersPage.WaitForDirtyRowCountAsync(BulkRows);
                });

            await MeasureAsync(
                "save-1000-deletes",
                "Persist 1,000 deleted Work Orders in one Save.",
                async () =>
                {
                    await workOrdersPage.SaveAndWaitAsync();
                    await workOrdersPage.WaitForDirtyRowCountAsync(0);
                });

            await MeasureAsync(
                "reload-verify-1000-deletes",
                "Reload and prove sampled deleted Work Orders did not return.",
                async () =>
                {
                    await workOrdersPage.ReloadAndWaitAsync();
                    await workOrdersPage.WaitForActiveRowCountAsync(seed.RowsPerYear);
                    foreach (var workOrderNumber in deletedWorkOrderSamples)
                    {
                        E2ETestAssert.True(
                            !await workOrdersPage.ContainsWorkOrderInDataAsync(workOrderNumber),
                            $"Deleted Work Order {workOrderNumber} returned after reload.");
                    }
                });

            var mixedEditRowIds = await workOrdersPage.GetActiveRowIdsAsync(1_500, 250);
            var mixedEditValues = Enumerable.Range(0, 250)
                .Select(index =>
                    (7_000_000m + index + 0.25m)
                        .ToString("0.00", CultureInfo.InvariantCulture))
                .ToArray();

            await MeasureAsync(
                "mixed-save-edit-250",
                "Prepare 250 changed existing rows for a mixed Save.",
                async () =>
                    await workOrdersPage.PasteColumnValuesAsync(
                        mixedEditRowIds[0],
                        "workOrderValue",
                        mixedEditValues,
                        250));

            await MeasureAsync(
                "mixed-save-insert-250",
                "Add 250 new rows while 250 existing edits are still dirty.",
                async () =>
                {
                    await workOrdersPage.InsertRowsAsync(
                        seed.CurrentYearFirstRowId,
                        250,
                        "below",
                        seed.RowsPerYear + 250);
                    await workOrdersPage.WaitForDirtyRowCountAsync(500);
                });

            var mixedTempRows = await workOrdersPage.GetTemporaryRowIdsAsync();
            E2ETestAssert.Equal(250, mixedTempRows.Length,
                "Mixed Save did not contain exactly 250 temporary inserted rows.");
            var mixedInsertedNumbers = Enumerable.Range(1, 250)
                .Select(index => (931_000_000 + index).ToString("D9"))
                .ToArray();
            var mixedInsertMatrix = Enumerable.Range(0, 250)
                .Select(index => new[]
                {
                    mixedInsertedNumbers[index],
                    index % 2 == 0 ? "801" : "802",
                    $"16/08/{seed.CurrentYear}",
                    (8_000_000m + index + 0.25m)
                        .ToString("0.00", CultureInfo.InvariantCulture)
                })
                .ToArray();

            var mixedBasketMatrix = Enumerable.Range(0, 250)
                .Select(_ => new[] { ERPPrototype.Data.WorkOrderBuskets.InProgress })
                .ToArray();

            await MeasureAsync(
                "mixed-save-fill-250-new",
                "Fill the 250 new rows, including required Basket values, while the 250 existing edits remain dirty.",
                async () =>
                {
                    await workOrdersPage.PasteMatrixAsync(
                        mixedTempRows[0],
                        "workOrderNumber",
                        mixedInsertMatrix,
                        500);
                    await workOrdersPage.PasteMatrixAsync(
                        mixedTempRows[0],
                        "basket",
                        mixedBasketMatrix,
                        500);

                    foreach (var index in SampleIndexes(250))
                    {
                        E2ETestAssert.Equal(
                            ERPPrototype.Data.WorkOrderBuskets.InProgress,
                            await workOrdersPage.GetCellValueAsync(
                                mixedTempRows[index],
                                "basket"),
                            $"Mixed Save inserted row sample {index} did not receive the required Basket before Save.");
                    }
                });

            var mixedDeleteRowIds = await workOrdersPage.GetActiveRowIdsAsync(7_000, 250);
            var mixedDeletedSamples = new List<string>();
            foreach (var index in SampleIndexes(250))
            {
                mixedDeletedSamples.Add(
                    await workOrdersPage.GetCellValueAsync(
                        mixedDeleteRowIds[index],
                        "workOrderNumber"));
            }

            await MeasureAsync(
                "mixed-save-delete-250",
                "Delete 250 other rows so one Save contains inserts + edits + deletes together.",
                async () =>
                {
                    await workOrdersPage.SelectContiguousRowsAsync(
                        mixedDeleteRowIds[0], 250);
                    await workOrdersPage.DeleteSelectedRowsAsync(
                        seed.RowsPerYear,
                        750);
                });

            await MeasureAsync(
                "mixed-save-750-dirty",
                "Persist 250 edits + 250 inserts + 250 deletes in one Save.",
                async () =>
                {
                    await workOrdersPage.SaveAndWaitAsync();
                    await workOrdersPage.WaitForDirtyRowCountAsync(0);
                    await workOrdersPage.WaitForActiveRowCountAsync(seed.RowsPerYear);
                });

            await MeasureAsync(
                "reload-verify-mixed-save",
                "Reload and verify all three kinds of mixed Save changes survived correctly.",
                async () =>
                {
                    await workOrdersPage.ReloadAndWaitAsync();
                    await workOrdersPage.WaitForActiveRowCountAsync(seed.RowsPerYear);
                    await VerifySampleValuesAsync(
                        workOrdersPage,
                        mixedEditRowIds,
                        mixedEditValues,
                        "workOrderValue");
                    foreach (var index in SampleIndexes(250))
                    {
                        E2ETestAssert.True(
                            await workOrdersPage.ContainsWorkOrderInDataAsync(
                                mixedInsertedNumbers[index]),
                            $"Mixed Save inserted Work Order {mixedInsertedNumbers[index]} was lost.");
                    }
                    foreach (var workOrderNumber in mixedDeletedSamples)
                    {
                        E2ETestAssert.True(
                            !await workOrdersPage.ContainsWorkOrderInDataAsync(workOrderNumber),
                            $"Mixed Save deleted Work Order {workOrderNumber} returned after reload.");
                    }
                });

            await MeasureAsync(
                "year-switch-storm-10",
                "Switch between current and previous 10k-row years ten times.",
                async () =>
                {
                    for (var cycle = 0; cycle < 5; cycle++)
                    {
                        await workOrdersPage.SelectYearAndWaitForDatasetAsync(
                            seed.PreviousYear,
                            seed.RowsPerYear,
                            seed.PreviousYearFirstWorkOrderNumber,
                            seed.CurrentYearFirstWorkOrderNumber);
                        await workOrdersPage.SelectYearAndWaitForDatasetAsync(
                            seed.CurrentYear,
                            seed.RowsPerYear,
                            seed.CurrentYearFirstWorkOrderNumber,
                            seed.PreviousYearFirstWorkOrderNumber);
                    }
                });

            await MeasureAsync(
                "final-post-torture-interaction",
                "After all heavy mutations, search, filter, sort and scroll again to prove recovery.",
                async () =>
                {
                    await workOrdersPage.SearchWorkOrderAsync(seed.CurrentYearFirstWorkOrderNumber);
                    await workOrdersPage.ClearSearchAsync(seed.RowsPerYear);
                    var current401Count = await workOrdersPage.CountActiveRowsByFieldValueAsync(
                        "workTypeCode", "401");
                    await workOrdersPage.ApplyValueFilterAsync(
                        "workTypeCode", ["401"], current401Count);
                    await workOrdersPage.ClearValueFilterAsync("workTypeCode", seed.RowsPerYear);
                    await workOrdersPage.SortFinancialColumnAsync("workOrderValue", "desc");
                    await workOrdersPage.ClearSortAsync();
                    await PerformWheelStormAsync(page);
                });

            E2ETestAssert.Equal(seed.RowsPerYear,
                await workOrdersPage.GetActiveRowCountAsync(),
                "Torture run ended with the wrong current-year row count.");
            E2ETestAssert.Equal(0,
                await workOrdersPage.GetDirtyRowCountAsync(),
                "Torture run ended with unsaved Work Orders.");
            E2ETestAssert.True(
                maximumRenderedRows is > 0 and <= MaximumExpectedRenderedRows,
                $"Virtual DOM expanded beyond the expected bounded window. Max rendered rows={maximumRenderedRows}.");

            browserSession.Diagnostics.AssertNoCriticalErrors();
            await browserSession.CaptureSuccessAsync("phase9-work-orders-torture");

            return new WorkOrdersTortureReport(
                SchemaVersion: "1.0",
                CapturedAtUtc: DateTimeOffset.UtcNow,
                RowsPerYear: seed.RowsPerYear,
                BulkMutationRows: BulkRows,
                Headed: headed,
                MaximumRenderedRows: maximumRenderedRows,
                FinalActiveRowCount: await workOrdersPage.GetActiveRowCountAsync(),
                FinalDirtyRowCount: await workOrdersPage.GetDirtyRowCountAsync(),
                Phases: metrics);
        }
        catch
        {
            await browserSession.CaptureFailureAsync("phase9-work-orders-torture");
            throw;
        }
    }

    private static async Task<string[]> GetSearchTargetsAsync(WorkOrdersPage page)
    {
        var ids = await page.GetActiveRowIdsAsync(0, 10_000);
        E2ETestAssert.True(ids.Length >= 10,
            "Torture run could not collect enough rows for search cycling.");

        var indexes = new[] { 0, ids.Length / 9, ids.Length / 5, ids.Length / 3, ids.Length / 2, (ids.Length * 2) / 3, (ids.Length * 4) / 5, ids.Length - 3, ids.Length - 2, ids.Length - 1 };
        var values = new List<string>(indexes.Length);
        foreach (var index in indexes)
        {
            values.Add(await page.GetCellValueAsync(ids[index], "workOrderNumber"));
        }
        return values.ToArray();
    }

    private static int[] SampleIndexes(int count) => [0, count / 2, count - 1];

    private static async Task VerifySampleValuesAsync(
        WorkOrdersPage page,
        IReadOnlyList<int> rowIds,
        IReadOnlyList<string> values,
        string field)
    {
        foreach (var index in SampleIndexes(rowIds.Count))
        {
            var actual = await page.GetCellValueAsync(rowIds[index], field);
            var expectedComparable = values[index].Replace(",", string.Empty, StringComparison.Ordinal);
            var actualComparable = actual.Replace(",", string.Empty, StringComparison.Ordinal);
            E2ETestAssert.Equal(expectedComparable, actualComparable,
                $"Saved value mismatch for {field} on sample row {index} after reload.");
        }
    }

    private static async Task PerformWheelStormAsync(IPage page)
    {
        var holder = page.Locator("#tabulator-test-table .tabulator-tableholder");
        var bounds = await holder.BoundingBoxAsync();
        E2ETestAssert.True(bounds is not null,
            "Could not locate the Work Orders table holder for wheel torture.");

        await page.Mouse.MoveAsync(
            (float)(bounds!.X + bounds.Width / 2),
            (float)(bounds.Y + bounds.Height / 2));

        for (var cycle = 0; cycle < 6; cycle++)
        {
            for (var index = 0; index < 20; index++)
            {
                await page.Mouse.WheelAsync(0, 650);
            }
            for (var index = 0; index < 20; index++)
            {
                await page.Mouse.WheelAsync(0, -650);
            }
        }
    }

    private static async Task PerformKeyboardStormAsync(IPage page, WorkOrdersPage workOrdersPage)
    {
        var ids = await workOrdersPage.GetActiveRowIdsAsync(4_000, 1);
        E2ETestAssert.Equal(1, ids.Length,
            "Could not choose the keyboard torture anchor row.");

        await workOrdersPage.ActivateCellForNavigationAsync(ids[0], "workOrderNumber");

        var startRowPosition =
            await workOrdersPage.GetActiveRangeStartRowPositionAsync();
        E2ETestAssert.True(startRowPosition >= 0,
            "Keyboard torture could not read the logical active-range row.");

        for (var index = 0; index < 500; index++)
        {
            await page.Keyboard.PressAsync("ArrowDown");
            if (index % 25 == 24)
            {
                await WaitForOneAnimationFrameAsync(page);

                E2ETestAssert.Equal(
                    startRowPosition + index + 1,
                    await workOrdersPage.GetActiveRangeStartRowPositionAsync(),
                    $"ArrowDown did not move exactly one logical row near navigation step {index + 1}.");

                E2ETestAssert.True(
                    await workOrdersPage.IsActiveRangeCellVisiblySelectedAsync(),
                    $"ArrowDown lost the visible active-cell selection near navigation step {index + 1}.");
            }
        }

        await WaitForTwoAnimationFramesAsync(page);
        E2ETestAssert.Equal(
            startRowPosition + 500,
            await workOrdersPage.GetActiveRangeStartRowPositionAsync(),
            "ArrowDown torture did not finish exactly 500 logical rows below its anchor.");
        E2ETestAssert.True(
            await workOrdersPage.IsActiveRangeCellVisiblySelectedAsync(),
            "ArrowDown torture moved beyond the rendered window but lost the visible active-cell selection.");

        for (var index = 0; index < 500; index++)
        {
            await page.Keyboard.PressAsync("ArrowUp");
            if (index % 25 == 24)
            {
                await WaitForOneAnimationFrameAsync(page);

                E2ETestAssert.Equal(
                    startRowPosition + 500 - index - 1,
                    await workOrdersPage.GetActiveRangeStartRowPositionAsync(),
                    $"ArrowUp did not move exactly one logical row near navigation step {index + 1}.");

                E2ETestAssert.True(
                    await workOrdersPage.IsActiveRangeCellVisiblySelectedAsync(),
                    $"ArrowUp lost the visible active-cell selection near navigation step {index + 1}.");
            }
        }

        await WaitForTwoAnimationFramesAsync(page);
        E2ETestAssert.Equal(
            startRowPosition,
            await workOrdersPage.GetActiveRangeStartRowPositionAsync(),
            "Keyboard torture did not return to its original logical row after 500 Down + 500 Up movements.");
        E2ETestAssert.True(
            await workOrdersPage.IsActiveRangeCellVisiblySelectedAsync(),
            "ArrowUp torture moved beyond the rendered window but lost the visible active-cell selection.");
    }

    private static async Task PerformNavigationAfterStructuralChangesAsync(
        IPage page,
        WorkOrdersPage workOrdersPage,
        int originalRowCount)
    {
        var ids = await workOrdersPage.GetActiveRowIdsAsync(2_500, 4);
        E2ETestAssert.Equal(4, ids.Length,
            "Could not choose stable rows for the structure/navigation compatibility test.");

        var anchorRowId = ids[0];
        var originalNextRowId = ids[1];
        var rowAfterDeletedRowId = ids[2];

        async Task AssertDownUpRoundTripAsync(
            int expectedDownRowId,
            string phase)
        {
            await workOrdersPage.ActivateCellForNavigationAsync(
                anchorRowId,
                "workOrderNumber");

            var startPosition =
                await workOrdersPage.GetActiveRangeStartRowPositionAsync();
            E2ETestAssert.True(startPosition >= 0,
                $"{phase}: could not read the anchor logical row position.");
            E2ETestAssert.Equal(
                anchorRowId,
                await workOrdersPage.GetActiveRangeStartRowIdAsync(),
                $"{phase}: navigation did not start from the expected anchor row.");

            await page.Keyboard.PressAsync("ArrowDown");
            await WaitForOneAnimationFrameAsync(page);

            E2ETestAssert.Equal(
                startPosition + 1,
                await workOrdersPage.GetActiveRangeStartRowPositionAsync(),
                $"{phase}: ArrowDown did not move exactly one logical row.");
            E2ETestAssert.Equal(
                expectedDownRowId,
                await workOrdersPage.GetActiveRangeStartRowIdAsync(),
                $"{phase}: ArrowDown used a stale row order after the structural change.");
            E2ETestAssert.True(
                await workOrdersPage.IsActiveRangeCellVisiblySelectedAsync(),
                $"{phase}: ArrowDown lost the visible active-cell selection.");

            await page.Keyboard.PressAsync("ArrowUp");
            await WaitForOneAnimationFrameAsync(page);

            E2ETestAssert.Equal(
                startPosition,
                await workOrdersPage.GetActiveRangeStartRowPositionAsync(),
                $"{phase}: ArrowUp did not return to the anchor logical row.");
            E2ETestAssert.Equal(
                anchorRowId,
                await workOrdersPage.GetActiveRangeStartRowIdAsync(),
                $"{phase}: ArrowUp did not return to the expected anchor row.");
            E2ETestAssert.True(
                await workOrdersPage.IsActiveRangeCellVisiblySelectedAsync(),
                $"{phase}: ArrowUp lost the visible active-cell selection.");
        }

        await AssertDownUpRoundTripAsync(
            originalNextRowId,
            "before structural changes");

        await workOrdersPage.InsertRowsAsync(
            anchorRowId,
            1,
            "below",
            originalRowCount + 1);
        await workOrdersPage.WaitForDirtyRowCountAsync(1);

        var insertedRows = await workOrdersPage.GetTemporaryRowIdsAsync();
        E2ETestAssert.Equal(1, insertedRows.Length,
            "Single-row insert did not create exactly one temporary row.");

        await AssertDownUpRoundTripAsync(
            insertedRows[0],
            "after insert");

        await workOrdersPage.UndoAsync();
        await workOrdersPage.WaitForActiveRowCountAsync(originalRowCount);
        await workOrdersPage.WaitForDirtyRowCountAsync(0);
        await AssertDownUpRoundTripAsync(
            originalNextRowId,
            "after undo insert");

        await workOrdersPage.RedoAsync();
        await workOrdersPage.WaitForActiveRowCountAsync(originalRowCount + 1);
        await workOrdersPage.WaitForDirtyRowCountAsync(1);

        insertedRows = await workOrdersPage.GetTemporaryRowIdsAsync();
        E2ETestAssert.Equal(1, insertedRows.Length,
            "Redo insert did not restore exactly one temporary row.");
        await AssertDownUpRoundTripAsync(
            insertedRows[0],
            "after redo insert");

        await workOrdersPage.UndoAsync();
        await workOrdersPage.WaitForActiveRowCountAsync(originalRowCount);
        await workOrdersPage.WaitForDirtyRowCountAsync(0);
        await AssertDownUpRoundTripAsync(
            originalNextRowId,
            "after final undo insert");

        await workOrdersPage.DeleteRowAsync(
            originalNextRowId,
            originalRowCount - 1);
        await workOrdersPage.WaitForDirtyRowCountAsync(1);
        await AssertDownUpRoundTripAsync(
            rowAfterDeletedRowId,
            "after delete");

        await workOrdersPage.UndoAsync();
        await workOrdersPage.WaitForActiveRowCountAsync(originalRowCount);
        await workOrdersPage.WaitForDirtyRowCountAsync(0);
        await AssertDownUpRoundTripAsync(
            originalNextRowId,
            "after undo delete");

        await workOrdersPage.RedoAsync();
        await workOrdersPage.WaitForActiveRowCountAsync(originalRowCount - 1);
        await workOrdersPage.WaitForDirtyRowCountAsync(1);
        await AssertDownUpRoundTripAsync(
            rowAfterDeletedRowId,
            "after redo delete");

        await workOrdersPage.UndoAsync();
        await workOrdersPage.WaitForActiveRowCountAsync(originalRowCount);
        await workOrdersPage.WaitForDirtyRowCountAsync(0);
        await AssertDownUpRoundTripAsync(
            originalNextRowId,
            "after final undo delete");
    }

    private static async Task PerformRangeKeyboardStormAsync(
        IPage page,
        WorkOrdersPage workOrdersPage)
    {
        var ids = await workOrdersPage.GetActiveRowIdsAsync(4_000, 1);
        E2ETestAssert.Equal(1, ids.Length,
            "Could not choose the range-keyboard torture anchor row.");

        await workOrdersPage.ActivateCellForNavigationAsync(
            ids[0],
            "workOrderNumber");

        for (var index = 0; index < 120; index++)
        {
            await page.Keyboard.PressAsync("Shift+ArrowDown");

            if (index % 20 == 19)
            {
                await WaitForOneAnimationFrameAsync(page);
                E2ETestAssert.True(
                    await workOrdersPage.IsRenderedRangeSelectionConsistentAsync(),
                    $"Shift+ArrowDown produced stale rendered range styling near step {index + 1}.");
            }
        }

        await WaitForTwoAnimationFramesAsync(page);
        E2ETestAssert.Equal(
            121,
            await workOrdersPage.GetActiveRangeRowCountAsync(),
            "Shift+ArrowDown did not preserve the full logical 121-row range.");
        E2ETestAssert.True(
            await workOrdersPage.IsRenderedRangeSelectionConsistentAsync(),
            "Expanded logical range and rendered Virtual DOM selection diverged.");

        for (var index = 0; index < 120; index++)
        {
            await page.Keyboard.PressAsync("Shift+ArrowUp");

            if (index % 20 == 19)
            {
                await WaitForOneAnimationFrameAsync(page);
                E2ETestAssert.True(
                    await workOrdersPage.IsRenderedRangeSelectionConsistentAsync(),
                    $"Shift+ArrowUp produced stale rendered range styling near step {index + 1}.");
            }
        }

        await WaitForTwoAnimationFramesAsync(page);
        E2ETestAssert.Equal(
            1,
            await workOrdersPage.GetActiveRangeRowCountAsync(),
            "Shift range did not collapse back to one logical row.");
        E2ETestAssert.True(
            await workOrdersPage.IsActiveRangeCellVisiblySelectedAsync(),
            "Collapsed Shift range lost the visible active-cell selection.");
    }


    private static async Task InstallLongTaskObserverAsync(IPage page)
    {
        await page.EvaluateAsync(
            """
            () => {
                window.__erpTortureLongTasks = [];
                if (window.__erpTortureLongTaskObserver) {
                    window.__erpTortureLongTaskObserver.disconnect();
                }
                if (typeof PerformanceObserver !== 'function') return;
                try {
                    const observer = new PerformanceObserver(list => {
                        for (const entry of list.getEntries()) {
                            window.__erpTortureLongTasks.push(Number(entry.duration) || 0);
                        }
                    });
                    observer.observe({ type: 'longtask', buffered: false });
                    window.__erpTortureLongTaskObserver = observer;
                } catch {
                    window.__erpTortureLongTaskObserver = null;
                }
            }
            """);
    }

    private static Task ResetLongTasksAsync(IPage page) =>
        page.EvaluateAsync("() => { if (Array.isArray(window.__erpTortureLongTasks)) window.__erpTortureLongTasks.length = 0; }");

    private static async Task<double[]> ReadLongTasksAsync(IPage page) =>
        await page.EvaluateAsync<double[]>(
            "() => (window.__erpTortureLongTasks ?? []).map(Number).filter(Number.isFinite)");

    private static Task WaitForOneAnimationFrameAsync(IPage page) =>
        page.EvaluateAsync("() => new Promise(resolve => requestAnimationFrame(resolve))");

    private static Task WaitForTwoAnimationFramesAsync(IPage page) =>
        page.EvaluateAsync("() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
}

internal sealed record WorkOrdersTorturePhaseMetric(
    string Name,
    string Description,
    double WallMilliseconds,
    int LongTaskCount,
    double TotalLongTaskMilliseconds,
    double MaximumLongTaskMilliseconds,
    int RenderedRowCount,
    int ActiveRowCount,
    int DirtyRowCount);

internal sealed record WorkOrdersTortureReport(
    string SchemaVersion,
    DateTimeOffset CapturedAtUtc,
    int RowsPerYear,
    int BulkMutationRows,
    bool Headed,
    int MaximumRenderedRows,
    int FinalActiveRowCount,
    int FinalDirtyRowCount,
    IReadOnlyList<WorkOrdersTorturePhaseMetric> Phases);
