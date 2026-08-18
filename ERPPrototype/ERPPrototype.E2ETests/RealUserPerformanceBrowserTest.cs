using System.Diagnostics;
using System.Globalization;
using Microsoft.Playwright;

namespace ERPPrototype.E2ETests;

internal sealed class RealUserPerformanceBrowserTest(
    Uri baseUri,
    E2ESeedData seed,
    string artifactDirectory,
    bool headed,
    int runCount)
{
    private const int SplitViewportWidth = 960;
    private const int SplitViewportHeight = 900;
    private const int SplitWindowWidth = 1000;
    private const int SplitWindowHeight = 980;
    private const int MaximumExpectedRenderedRows = 150;
    private const int BulkPasteRows = 100;
    private const int ObservationPauseMilliseconds = 350;

    public async Task<RealUserPerformanceReport> RunAsync()
    {
        var runs = new List<RealUserPerformanceRunMetrics>(runCount);

        for (var runNumber = 1; runNumber <= runCount; runNumber++)
        {
            var runDirectory = Path.Combine(
                artifactDirectory,
                $"real-user-run-{runNumber:D2}");

            Directory.CreateDirectory(runDirectory);

            Console.WriteLine();
            Console.WriteLine(
                $"==> Real-user run {runNumber}/{runCount}: " +
                $"{seed.RowsPerYear:N0} rows, Split Screen 100%");

            await using var browserSession =
                await E2EBrowserSession.CreateAsync(
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

            try
            {
                var page = browserSession.Page;
                var loginPage = new LoginPage(page, baseUri);
                var workOrdersPage = new WorkOrdersPage(page);
                var actions = new List<RealUserActionMetric>();
                var maximumRenderedRows = 0;

                await loginPage.OpenAsync();

                var loginStartedAt = Stopwatch.GetTimestamp();
                await loginPage.LoginAsync(seed);
                await workOrdersPage.WaitUntilReadyAsync();
                await workOrdersPage.WaitForActiveRowCountAsync(
                    seed.RowsPerYear);
                await WaitForTwoAnimationFramesAsync(page);

                var loginToUsableGridMilliseconds =
                    Stopwatch.GetElapsedTime(loginStartedAt)
                        .TotalMilliseconds;

                var layoutMode = await page.EvaluateAsync<string>(
                    """
                    () => String(
                        window.erpAppLayout?.getMode?.() ??
                        document.documentElement.dataset.layoutMode ??
                        ''
                    )
                    """);
                var layoutRatio = await page.EvaluateAsync<double>(
                    """
                    () => Number(
                        window.erpAppLayout?.viewportToScreenRatio?.() ?? 0
                    )
                    """);
                var outerWidth = await page.EvaluateAsync<double>(
                    "() => Number(window.outerWidth || 0)");
                var screenAvailableWidth = await page.EvaluateAsync<double>(
                    "() => Number(window.screen?.availWidth || 0)");

                E2ETestAssert.Equal(
                    "split",
                    layoutMode,
                    "The real-user performance run did not enter the approved Split layout.");

                E2ETestAssert.Equal(
                    seed.RowsPerYear,
                    await workOrdersPage.GetActiveRowCountAsync(),
                    "The real-user performance run did not load the requested dataset.");

                E2ETestAssert.Equal(
                    0,
                    await workOrdersPage.GetDirtyRowCountAsync(),
                    "The real-user performance run did not start from a clean sheet.");

                await InstallLongTaskObserverAsync(page);
                maximumRenderedRows = Math.Max(
                    maximumRenderedRows,
                    await workOrdersPage.GetRenderedRowCountAsync());

                async Task MeasureAsync(
                    string name,
                    string description,
                    Func<Task> action)
                {
                    var metric = await MeasureActionAsync(
                        page,
                        name,
                        description,
                        action);

                    actions.Add(metric);
                    maximumRenderedRows = Math.Max(
                        maximumRenderedRows,
                        await workOrdersPage.GetRenderedRowCountAsync());

                    Console.WriteLine(
                        $"  {name}: {metric.WallMilliseconds:N2} ms; " +
                        $"long tasks={metric.LongTaskCount}; " +
                        $"worst={metric.MaximumLongTaskMilliseconds:N2} ms");

                    if (headed)
                    {
                        await page.WaitForTimeoutAsync(
                            ObservationPauseMilliseconds);
                    }
                }

                await MeasureAsync(
                    "search",
                    "Search for one Work Order near the end of the 10k sheet.",
                    async () =>
                        await workOrdersPage.SearchWorkOrderAsync(
                            seed.CurrentYearLastWorkOrderNumber));

                await MeasureAsync(
                    "search-clear",
                    "Clear search and restore the full active dataset.",
                    async () =>
                        await workOrdersPage.ClearSearchAsync(
                            seed.RowsPerYear));

                await MeasureAsync(
                    "filter-401",
                    "Apply the Work Type 401 Excel-style value filter.",
                    async () =>
                        await workOrdersPage.ApplyValueFilterAsync(
                            "workTypeCode",
                            ["401"],
                            seed.RowsPerYear / 4));

                await MeasureAsync(
                    "filter-clear",
                    "Clear the Work Type filter and restore all rows.",
                    async () =>
                        await workOrdersPage.ClearValueFilterAsync(
                            "workTypeCode",
                            seed.RowsPerYear));

                await MeasureAsync(
                    "sort-money-desc",
                    "Sort Work Order Value from largest to smallest.",
                    async () =>
                        await workOrdersPage.SortFinancialColumnAsync(
                            "workOrderValue",
                            "desc"));

                await MeasureAsync(
                    "sort-clear",
                    "Return the sheet to its natural row order.",
                    workOrdersPage.ClearSortAsync);

                await workOrdersPage.ScrollToRowAsync(
                    seed.CurrentYearFirstRowId);

                await MeasureAsync(
                    "wheel-scroll",
                    "Use repeated mouse-wheel movement through the virtualized grid.",
                    async () => await PerformWheelScrollAsync(page));

                await workOrdersPage.ActivateCellForNavigationAsync(
                    seed.CurrentYearFirstRowId,
                    "workOrderNumber");
                var keyboardStartRowPosition =
                    await workOrdersPage.GetActiveRangeStartRowPositionAsync();
                E2ETestAssert.True(
                    keyboardStartRowPosition >= 0,
                    "Could not read the logical active-range row before keyboard navigation.");

                await MeasureAsync(
                    "keyboard-40-down",
                    "Move down 40 rows with the keyboard like Excel navigation.",
                    async () =>
                    {
                        for (var index = 0; index < 40; index++)
                        {
                            await page.Keyboard.PressAsync("ArrowDown");
                        }

                        var expectedEndRowPosition =
                            keyboardStartRowPosition + 40;

                        await page.WaitForFunctionAsync(
                            """
                            args => {
                                const api = window.tabulatorTest;
                                const table = api?.tables?.[args.tableId];
                                const range = api?.getActiveRange?.(table);
                                const top = Number(range?.getTopEdge?.());
                                const bottom = Number(range?.getBottomEdge?.());

                                return Number.isInteger(top) &&
                                    Number.isInteger(bottom) &&
                                    top === bottom &&
                                    top === args.expectedRowPosition;
                            }
                            """,
                            new
                            {
                                tableId = "tabulator-test-table",
                                expectedRowPosition = expectedEndRowPosition
                            });

                        var keyboardEndRowPosition =
                            await workOrdersPage.GetActiveRangeStartRowPositionAsync();

                        E2ETestAssert.Equal(
                            expectedEndRowPosition,
                            keyboardEndRowPosition,
                            "Keyboard navigation did not move exactly 40 logical Work Orders rows.");
                    });

                var singleEditValue =
                    (2_900_000m + (runNumber * 100m) + 0.25m)
                        .ToString("0.00", CultureInfo.InvariantCulture);

                await MeasureAsync(
                    "single-cell-edit",
                    "Edit one Work Order Value cell.",
                    async () =>
                    {
                        await workOrdersPage.SetCellValueAsync(
                            seed.CurrentYearMiddleRowId,
                            "workOrderValue",
                            singleEditValue);
                        await workOrdersPage.WaitForDirtyRowCountAsync(1);
                    });

                await MeasureAsync(
                    "small-save",
                    "Save one changed Work Order.",
                    async () =>
                    {
                        await workOrdersPage.SaveAndWaitAsync();
                        await workOrdersPage.WaitForDirtyRowCountAsync(0);
                    });

                var pasteRowIds = await workOrdersPage.GetActiveRowIdsAsync(
                    startIndex: 100,
                    count: BulkPasteRows);

                E2ETestAssert.Equal(
                    BulkPasteRows,
                    pasteRowIds.Length,
                    "The real-user performance run could not select 100 rows for bulk paste.");

                var bulkValues = Enumerable
                    .Range(0, BulkPasteRows)
                    .Select(index =>
                        (3_000_000m +
                         (runNumber * 10_000m) +
                         index +
                         0.25m)
                        .ToString("0.00", CultureInfo.InvariantCulture))
                    .ToArray();

                await MeasureAsync(
                    "paste-100",
                    "Paste 100 Work Order Value cells as one Excel-like operation.",
                    async () =>
                        await workOrdersPage.PasteColumnValuesAsync(
                            pasteRowIds[0],
                            "workOrderValue",
                            bulkValues,
                            expectedDirtyRowCount: BulkPasteRows));

                await MeasureAsync(
                    "undo-100",
                    "Undo the 100-cell paste.",
                    async () =>
                    {
                        await workOrdersPage.UndoAsync();
                        await workOrdersPage.WaitForDirtyRowCountAsync(0);
                    });

                await MeasureAsync(
                    "redo-100",
                    "Redo the 100-cell paste.",
                    async () =>
                    {
                        await workOrdersPage.RedoAsync();
                        await workOrdersPage.WaitForDirtyRowCountAsync(
                            BulkPasteRows);
                    });

                await MeasureAsync(
                    "bulk-save-100",
                    "Save 100 changed Work Orders.",
                    async () =>
                    {
                        await workOrdersPage.SaveAndWaitAsync();
                        await workOrdersPage.WaitForDirtyRowCountAsync(0);
                    });

                await MeasureAsync(
                    "year-switch-previous",
                    "Switch from the current year to the previous 10k-row year.",
                    async () =>
                        await workOrdersPage.SelectYearAndWaitForDatasetAsync(
                            seed.PreviousYear,
                            seed.RowsPerYear,
                            seed.PreviousYearFirstWorkOrderNumber,
                            seed.CurrentYearFirstWorkOrderNumber));

                await MeasureAsync(
                    "year-switch-current",
                    "Switch back to the current 10k-row year.",
                    async () =>
                        await workOrdersPage.SelectYearAndWaitForDatasetAsync(
                            seed.CurrentYear,
                            seed.RowsPerYear,
                            seed.CurrentYearFirstWorkOrderNumber,
                            seed.PreviousYearFirstWorkOrderNumber));

                E2ETestAssert.Equal(
                    seed.RowsPerYear,
                    await workOrdersPage.GetActiveRowCountAsync(),
                    "The real-user performance run ended with the wrong active row count.");

                E2ETestAssert.Equal(
                    0,
                    await workOrdersPage.GetDirtyRowCountAsync(),
                    "The real-user performance run ended with unsaved changes.");

                E2ETestAssert.True(
                    maximumRenderedRows is > 0 and <= MaximumExpectedRenderedRows,
                    "The virtual DOM expanded beyond the expected bounded window during the real-user run. " +
                    $"Maximum rendered rows: {maximumRenderedRows}.");

                browserSession.Diagnostics.AssertNoCriticalErrors();

                runs.Add(
                    new RealUserPerformanceRunMetrics(
                        RunNumber: runNumber,
                        LayoutMode: layoutMode,
                        LayoutRatio: layoutRatio,
                        OuterWidth: outerWidth,
                        ScreenAvailableWidth: screenAvailableWidth,
                        LoginToUsableGridMilliseconds:
                            loginToUsableGridMilliseconds,
                        FinalActiveRowCount:
                            await workOrdersPage.GetActiveRowCountAsync(),
                        FinalDirtyRowCount:
                            await workOrdersPage.GetDirtyRowCountAsync(),
                        MaximumRenderedRows: maximumRenderedRows,
                        Actions: actions));

                if (runNumber == runCount)
                {
                    await browserSession.CaptureSuccessAsync(
                        "phase9-real-user-performance");
                }
            }
            catch
            {
                await browserSession.CaptureFailureAsync(
                    $"phase9-real-user-performance-run-{runNumber:D2}");
                throw;
            }
        }

        return new RealUserPerformanceReport(
            SchemaVersion: "1.0",
            CapturedAtUtc: DateTimeOffset.UtcNow,
            RowsPerYear: seed.RowsPerYear,
            RunCount: runCount,
            Headed: headed,
            ViewportWidth: SplitViewportWidth,
            ViewportHeight: SplitViewportHeight,
            RequiredLayoutMode: "split",
            MeasurementNote:
                "Headed Playwright wall timings approximate user-visible completion on this machine. " +
                "Long-task metrics come from Chromium's main thread. " +
                "Human smoothness acceptance is still required, and final SEC Edge/network validation remains separate.",
            RequiresHumanSmoothnessAcceptance: true,
            Runs: runs,
            Aggregate: BuildAggregate(runs));
    }

    private static async Task<RealUserActionMetric> MeasureActionAsync(
        IPage page,
        string name,
        string description,
        Func<Task> action)
    {
        await page.EvaluateAsync(
            """
            () => {
                if (Array.isArray(window.__erpRealUserLongTasks)) {
                    window.__erpRealUserLongTasks.length = 0;
                }
            }
            """);

        var startedAt = Stopwatch.GetTimestamp();
        await action();
        await WaitForTwoAnimationFramesAsync(page);

        var wallMilliseconds =
            Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds;

        var longTasks = await page.EvaluateAsync<double[]>(
            """
            () => (window.__erpRealUserLongTasks ?? [])
                .map(entry => Number(entry.duration) || 0)
                .filter(Number.isFinite)
            """);

        return new RealUserActionMetric(
            Name: name,
            Description: description,
            WallMilliseconds: wallMilliseconds,
            LongTaskCount: longTasks.Length,
            TotalLongTaskMilliseconds: longTasks.Sum(),
            MaximumLongTaskMilliseconds:
                longTasks.Length == 0 ? 0 : longTasks.Max());
    }

    private static async Task InstallLongTaskObserverAsync(IPage page)
    {
        await page.EvaluateAsync(
            """
            () => {
                window.__erpRealUserLongTasks = [];

                if (window.__erpRealUserLongTaskObserver) {
                    window.__erpRealUserLongTaskObserver.disconnect();
                }

                if (typeof PerformanceObserver !== 'function') {
                    return;
                }

                try {
                    const observer = new PerformanceObserver(list => {
                        for (const entry of list.getEntries()) {
                            window.__erpRealUserLongTasks.push({
                                startTime: Number(entry.startTime) || 0,
                                duration: Number(entry.duration) || 0
                            });
                        }
                    });

                    observer.observe({ type: 'longtask', buffered: false });
                    window.__erpRealUserLongTaskObserver = observer;
                }
                catch {
                    window.__erpRealUserLongTaskObserver = null;
                }
            }
            """);
    }

    private static async Task PerformWheelScrollAsync(IPage page)
    {
        var holder = page.Locator(
            "#tabulator-test-table .tabulator-tableholder");
        var bounds = await holder.BoundingBoxAsync();

        E2ETestAssert.True(
            bounds is not null,
            "Could not locate the Work Orders scroll viewport for the wheel test.");

        var before = await holder.EvaluateAsync<double>(
            "element => Number(element.scrollTop || 0)");

        await page.Mouse.MoveAsync(
            (float)(bounds!.X + (bounds.Width / 2)),
            (float)(bounds.Y + (bounds.Height / 2)));

        for (var index = 0; index < 12; index++)
        {
            await page.Mouse.WheelAsync(0, 420);
        }

        await WaitForTwoAnimationFramesAsync(page);

        var after = await holder.EvaluateAsync<double>(
            "element => Number(element.scrollTop || 0)");

        E2ETestAssert.True(
            after > before,
            "Mouse-wheel input did not move the Work Orders grid.");
    }

    private static async Task WaitForTwoAnimationFramesAsync(IPage page)
    {
        await page.EvaluateAsync(
            """
            () => new Promise(resolve =>
                window.requestAnimationFrame(() =>
                    window.requestAnimationFrame(resolve)
                )
            )
            """);
    }

    private static RealUserPerformanceAggregate BuildAggregate(
        IReadOnlyList<RealUserPerformanceRunMetrics> runs)
    {
        var actionNames = runs
            .SelectMany(run => run.Actions.Select(action => action.Name))
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        var actions = actionNames
            .Select(name =>
            {
                var matching = runs
                    .SelectMany(run => run.Actions)
                    .Where(action => string.Equals(
                        action.Name,
                        name,
                        StringComparison.Ordinal))
                    .ToArray();

                var description = matching
                    .Select(action => action.Description)
                    .FirstOrDefault() ?? string.Empty;

                var wall = matching
                    .Select(action => action.WallMilliseconds)
                    .ToArray();
                var longTaskCounts = matching
                    .Select(action => (double)action.LongTaskCount)
                    .ToArray();
                var worstLongTasks = matching
                    .Select(action => action.MaximumLongTaskMilliseconds)
                    .ToArray();

                return new RealUserActionAggregate(
                    Name: name,
                    Description: description,
                    RunsPresent: matching.Length,
                    MedianWallMilliseconds: Median(wall),
                    MinimumWallMilliseconds:
                        wall.Length == 0 ? 0 : wall.Min(),
                    MaximumWallMilliseconds:
                        wall.Length == 0 ? 0 : wall.Max(),
                    MedianLongTaskCount: Median(longTaskCounts),
                    MedianMaximumLongTaskMilliseconds:
                        Median(worstLongTasks));
            })
            .ToArray();

        return new RealUserPerformanceAggregate(
            MedianLoginToUsableGridMilliseconds:
                Median(runs.Select(run =>
                    run.LoginToUsableGridMilliseconds)),
            Actions: actions);
    }

    private static double Median(IEnumerable<double> values)
    {
        var ordered = values
            .Where(double.IsFinite)
            .OrderBy(value => value)
            .ToArray();

        if (ordered.Length == 0)
        {
            return 0;
        }

        var middle = ordered.Length / 2;

        return ordered.Length % 2 == 0
            ? (ordered[middle - 1] + ordered[middle]) / 2
            : ordered[middle];
    }
}
