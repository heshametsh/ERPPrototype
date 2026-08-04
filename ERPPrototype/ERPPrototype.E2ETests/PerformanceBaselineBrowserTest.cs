using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.Playwright;

namespace ERPPrototype.E2ETests;

internal sealed class PerformanceBaselineBrowserTest(
    Uri baseUri,
    E2ESeedData seed,
    string artifactDirectory,
    bool headed,
    bool diagnosticsEnabled,
    PerformanceAction action,
    int runCount)
{
    private const string TableId = "tabulator-test-table";
    private const int MaximumExpectedRenderedRows = 150;
    private const int NormalTimeoutMilliseconds = 45_000;
    private const float WheelDeltaY = 48f;

    private readonly JsonSerializerOptions jsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public async Task<PerformanceBaselineReport> RunAsync()
    {
        var protocol = GetProtocol(action, seed.RowsPerYear);
        var runs = new List<PerformanceRunMetrics>(runCount);
        PerformanceEnvironmentSnapshot? environment = null;

        for (var runNumber = 1; runNumber <= runCount; runNumber++)
        {
            var runDirectory = Path.Combine(
                artifactDirectory,
                $"performance-run-{runNumber:D2}");

            Directory.CreateDirectory(runDirectory);

            Console.WriteLine();
            Console.WriteLine(
                $"==> Performance run {runNumber}/{runCount}: " +
                $"{action}, {seed.RowsPerYear:N0} rows");

            await using var browserSession =
                await E2EBrowserSession.CreateAsync(
                    baseUri,
                    runDirectory,
                    headed,
                    traceEnabled: diagnosticsEnabled,
                    benchmarkMode: true);

            try
            {
                var page = browserSession.Page;
                var loginPage = new LoginPage(page, baseUri);
                var workOrdersPage = new WorkOrdersPage(page);

                await loginPage.OpenAsync();

                var loginStartedAt = Stopwatch.GetTimestamp();
                await loginPage.LoginAsync(seed);
                await workOrdersPage.WaitUntilReadyAsync();
                await workOrdersPage.WaitForActiveRowCountAsync(
                    seed.RowsPerYear);

                var loginToGridMilliseconds =
                    Stopwatch.GetElapsedTime(loginStartedAt)
                        .TotalMilliseconds;

                E2ETestAssert.Equal(
                    seed.RowsPerYear,
                    await workOrdersPage.GetActiveRowCountAsync(),
                    "The Performance suite did not load the requested dataset.");

                E2ETestAssert.Equal(
                    0,
                    await workOrdersPage.GetDirtyRowCountAsync(),
                    "The Performance suite did not start from a clean sheet.");

                await WaitForTwoAnimationFramesAsync(page);
                await page.WaitForTimeoutAsync(250);

                environment ??=
                    await ReadEnvironmentAsync(page);

                await PrepareActionAsync(page, action);
                await InstallNeutralProbeAsync(
                    page,
                    action,
                    diagnosticsEnabled);

                await RunUnmeasuredActionsAsync(
                    page,
                    action,
                    protocol.WarmupActions);

                var cold = await RunMeasuredSegmentAsync(
                    page,
                    action,
                    label: "cold",
                    actionCount: protocol.ColdMeasuredActions);

                var fatigue = await RunDeepContinuationAsync(
                    page,
                    action,
                    seed.RowsPerYear,
                    protocol.MinimumContinuationActions,
                    protocol.LongMeasuredActions);

                var longSession = await RunMeasuredSegmentAsync(
                    page,
                    action,
                    label: "long-session",
                    actionCount: protocol.LongMeasuredActions);

                var reachedNearEnd = action == PerformanceAction.Wheel
                    ? await IsWheelNearEndAsync(page)
                    : longSession.PositionAfter >= seed.RowsPerYear - 1;

                E2ETestAssert.True(
                    reachedNearEnd,
                    "The deep performance run did not reach the end region " +
                    $"of the sheet. Final position: {longSession.PositionAfter:N0}; " +
                    $"rows: {seed.RowsPerYear:N0}.");

                await DisposeNeutralProbeAsync(page);

                var finalActiveRowCount =
                    await workOrdersPage.GetActiveRowCountAsync();
                var finalDirtyRowCount =
                    await workOrdersPage.GetDirtyRowCountAsync();

                var maximumRenderedRows = new[]
                {
                    cold.RenderedRowsBefore,
                    cold.RenderedRowsAfter,
                    fatigue.RenderedRowsBefore,
                    fatigue.RenderedRowsAfter,
                    longSession.RenderedRowsBefore,
                    longSession.RenderedRowsAfter
                }.Max();

                var movementWasValid =
                    IsMovementValid(action, cold) &&
                    IsMovementValid(action, longSession) &&
                    IsContinuationMovementValid(action, fatigue);

                E2ETestAssert.Equal(
                    protocol.ColdMeasuredActions,
                    cold.CapturedSamples,
                    "The cold segment did not capture one browser sample per action.");

                E2ETestAssert.Equal(
                    protocol.LongMeasuredActions,
                    longSession.CapturedSamples,
                    "The long-session segment did not capture one browser sample per action.");

                E2ETestAssert.True(
                    movementWasValid,
                    "The measured action did not move through the sheet as expected.");

                E2ETestAssert.Equal(
                    seed.RowsPerYear,
                    finalActiveRowCount,
                    "The Performance suite changed the active row count.");

                E2ETestAssert.Equal(
                    0,
                    finalDirtyRowCount,
                    "The Performance suite left unsaved changes.");

                E2ETestAssert.True(
                    maximumRenderedRows is > 0 and <= MaximumExpectedRenderedRows,
                    "The virtual DOM expanded beyond the expected bounded window. " +
                    $"Maximum rendered rows: {maximumRenderedRows}.");

                browserSession.Diagnostics.AssertNoCriticalErrors();

                var run = new PerformanceRunMetrics(
                    RunNumber: runNumber,
                    LoginToGridMilliseconds: loginToGridMilliseconds,
                    Cold: cold,
                    Fatigue: fatigue,
                    LongSession: longSession,
                    FinalActiveRowCount: finalActiveRowCount,
                    FinalDirtyRowCount: finalDirtyRowCount,
                    MaximumRenderedRows: maximumRenderedRows,
                    MovementWasValid: movementWasValid,
                    ReachedNearEnd: reachedNearEnd);

                runs.Add(run);

                Console.WriteLine(
                    $"Run {runNumber}: cold P50/P95=" +
                    $"{cold.InputToPaintP50Milliseconds:N2}/" +
                    $"{cold.InputToPaintP95Milliseconds:N2} ms; " +
                    $"long P50/P95=" +
                    $"{longSession.InputToPaintP50Milliseconds:N2}/" +
                    $"{longSession.InputToPaintP95Milliseconds:N2} ms; " +
                    $"heap Δ={longSession.UsedJsHeapDeltaMegabytes:N2} MB; " +
                    $"deep actions={fatigue.RequestedActions:N0}; " +
                    "end region reached.");

                if (runNumber == runCount)
                {
                    await browserSession.CaptureSuccessAsync(
                        $"phase9-performance-{action.ToString().ToLowerInvariant()}",
                        preserveTrace: diagnosticsEnabled);
                }
            }
            catch
            {
                await browserSession.CaptureFailureAsync(
                    $"phase9-performance-{action.ToString().ToLowerInvariant()}-run-{runNumber:D2}");
                throw;
            }
        }

        var aggregate = BuildAggregate(runs);

        return new PerformanceBaselineReport(
            SchemaVersion: "1.2",
            CapturedAtUtc: DateTimeOffset.UtcNow,
            Action: action.ToString(),
            RowsPerYear: seed.RowsPerYear,
            RunCount: runCount,
            Headed: headed,
            DiagnosticsEnabled: diagnosticsEnabled,
            ComparableBaseline: !diagnosticsEnabled,
            Protocol: protocol,
            Environment: environment ??
                throw new InvalidOperationException(
                    "Performance environment was not captured."),
            Runs: runs,
            Aggregate: aggregate);
    }

    private static PerformanceProtocolSnapshot GetProtocol(
        PerformanceAction measuredAction,
        int rowsPerYear)
    {
        return measuredAction switch
        {
            PerformanceAction.Wheel => new PerformanceProtocolSnapshot(
                WarmupActions: 20,
                ColdMeasuredActions: 80,
                MinimumContinuationActions: Math.Max(240, rowsPerYear / 4),
                LongMeasuredActions: 80,
                WheelDeltaY: WheelDeltaY,
                ContinuationStrategy:
                    "Continue on the same sheet until the viewport is close enough to the bottom for the final measured segment to finish in the end region.",
                MeasurementMethod:
                    "Capture-phase input event to double requestAnimationFrame",
                Notes:
                    "Fresh browser per run; no Refresh or year change; the deep continuation uses the real scroll range and records its actual action count."),
            _ => new PerformanceProtocolSnapshot(
                WarmupActions: 30,
                ColdMeasuredActions: 120,
                MinimumContinuationActions: Math.Max(500, rowsPerYear / 2),
                LongMeasuredActions: 120,
                WheelDeltaY: 0,
                ContinuationStrategy:
                    "Continue on the same sheet to the row immediately before the final measured segment, so that segment finishes at the last row.",
                MeasurementMethod:
                    "Capture-phase keydown to double requestAnimationFrame",
                Notes:
                    "Fresh browser per run; no Refresh or year change; 1,000, 5,000, and 10,000-row runs traverse the real dataset to its end region.")
        };
    }

    private static async Task PrepareActionAsync(
        IPage page,
        PerformanceAction measuredAction)
    {
        if (measuredAction == PerformanceAction.Wheel)
        {
            var prepared = await page.EvaluateAsync<bool>(
                """
                async tableId => {
                    const table = window.tabulatorTest?.tables?.[tableId];
                    const rows = table?.getRows?.('active') ?? [];
                    const firstRow = rows[0];
                    const holder = document.querySelector(
                        `#${tableId} .tabulator-tableholder`
                    );

                    if (!table || !firstRow || !holder) {
                        return false;
                    }

                    await table.scrollToRow(firstRow, 'top', true);
                    holder.scrollTop = 0;
                    return true;
                }
                """,
                TableId);

            E2ETestAssert.True(
                prepared,
                "Could not prepare the table holder for Wheel measurement.");

            var holder = page.Locator(
                $"#{TableId} .tabulator-tableholder");
            var box = await holder.BoundingBoxAsync();

            E2ETestAssert.True(
                box is not null,
                "The table holder did not expose a visible bounding box.");

            await page.Mouse.MoveAsync(
                box!.X + (box.Width / 2),
                box.Y + (box.Height / 2));

            await WaitForTwoAnimationFramesAsync(page);
            return;
        }

        var targetToken =
            $"e2e-neutral-performance-cell-{Guid.NewGuid():N}";

        var keyboardPrepared = await page.EvaluateAsync<bool>(
            """
            async args => {
                const api = window.tabulatorTest;
                const table = api?.tables?.[args.tableId];
                const rows = table?.getRows?.('active') ?? [];
                const row = rows[0];

                if (!api || !table || !row) {
                    return false;
                }

                await table.scrollToRow(row, 'top', true);

                for (let attempt = 0; attempt < 60; attempt += 1) {
                    const cell = row.getCell(args.field);
                    const element = cell?.getElement?.();

                    if (element && element !== false && element.isConnected) {
                        element.setAttribute(
                            'data-e2e-neutral-performance-cell',
                            args.targetToken
                        );
                        return true;
                    }

                    await new Promise(resolve =>
                        window.requestAnimationFrame(resolve)
                    );
                }

                return false;
            }
            """,
            new
            {
                tableId = TableId,
                field = "workOrderNumber",
                targetToken
            });

        E2ETestAssert.True(
            keyboardPrepared,
            "Could not prepare the first active cell for keyboard measurement.");

        var targetCell = page.Locator(
            $"[data-e2e-neutral-performance-cell='{targetToken}']");

        await targetCell.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = NormalTimeoutMilliseconds
            });

        await targetCell.ClickAsync();

        await page.WaitForFunctionAsync(
            """
            args => {
                const api = window.tabulatorTest;
                const table = api?.tables?.[args.tableId];
                const state = api?.states?.[args.tableId];
                const rows = table?.getRows?.('active') ?? [];
                const firstRowId = rows[0]?.getIndex?.();

                return Boolean(
                    state?.activeCell &&
                    String(state.activeCell.rowId) === String(firstRowId) &&
                    state.activeCell.field === args.field
                );
            }
            """,
            new
            {
                tableId = TableId,
                field = "workOrderNumber"
            },
            new PageWaitForFunctionOptions
            {
                Timeout = NormalTimeoutMilliseconds
            });

        await WaitForTwoAnimationFramesAsync(page);
    }

    private static async Task InstallNeutralProbeAsync(
        IPage page,
        PerformanceAction measuredAction,
        bool collectLongTasks)
    {
        var installed = await page.EvaluateAsync<bool>(
            """
            args => {
                window.__erpNeutralPerformanceProbe?.dispose?.();

                const holder = document.querySelector(
                    `#${args.tableId} .tabulator-tableholder`
                );
                const isWheel = args.action === 'Wheel';
                const target = isWheel ? holder : document;
                const eventName = isWheel ? 'wheel' : 'keydown';
                const expectedKey = args.action === 'Enter'
                    ? 'Enter'
                    : 'ArrowDown';

                if (!target) {
                    return false;
                }

                const state = {
                    recording: false,
                    armed: false,
                    inFlight: false,
                    completed: 0,
                    samples: [],
                    longTasks: [],
                    observer: null
                };

                const matches = event => isWheel || event.key === expectedKey;

                const handler = event => {
                    if (
                        !state.recording ||
                        !state.armed ||
                        state.inFlight ||
                        !matches(event)
                    ) {
                        return;
                    }

                    state.armed = false;
                    state.inFlight = true;
                    const startedAt = performance.now();

                    window.requestAnimationFrame(() => {
                        window.requestAnimationFrame(() => {
                            state.samples.push(
                                performance.now() - startedAt
                            );
                            state.completed += 1;
                            state.inFlight = false;
                        });
                    });
                };

                target.addEventListener(
                    eventName,
                    handler,
                    isWheel
                        ? { capture: true, passive: true }
                        : true
                );

                if (
                    args.collectLongTasks &&
                    typeof PerformanceObserver === 'function'
                ) {
                    try {
                        state.observer = new PerformanceObserver(list => {
                            if (!state.recording) {
                                return;
                            }

                            for (const entry of list.getEntries()) {
                                state.longTasks.push(entry.duration);
                            }
                        });

                        state.observer.observe({
                            type: 'longtask',
                            buffered: false
                        });
                    }
                    catch {
                        state.observer = null;
                    }
                }

                window.__erpNeutralPerformanceProbe = {
                    start() {
                        state.samples = [];
                        state.longTasks = [];
                        state.completed = 0;
                        state.armed = false;
                        state.inFlight = false;
                        state.recording = true;
                    },
                    arm() {
                        if (!state.recording || state.armed || state.inFlight) {
                            return -1;
                        }

                        state.armed = true;
                        return state.completed + 1;
                    },
                    stop() {
                        state.recording = false;
                        state.armed = false;

                        return {
                            samples: [...state.samples],
                            longTasks: [...state.longTasks]
                        };
                    },
                    get completed() {
                        return state.completed;
                    },
                    dispose() {
                        state.recording = false;
                        state.armed = false;
                        state.observer?.disconnect?.();
                        target.removeEventListener(
                            eventName,
                            handler,
                            true
                        );
                        delete window.__erpNeutralPerformanceProbe;
                    }
                };

                return true;
            }
            """,
            new
            {
                tableId = TableId,
                action = measuredAction.ToString(),
                collectLongTasks
            });

        E2ETestAssert.True(
            installed,
            "The neutral browser performance probe could not be installed.");
    }

    private async Task<PerformanceSegmentMetrics> RunMeasuredSegmentAsync(
        IPage page,
        PerformanceAction measuredAction,
        string label,
        int actionCount)
    {
        await page.EvaluateAsync(
            "() => window.__erpNeutralPerformanceProbe.start()");

        var positionBefore =
            await GetPositionAsync(page, measuredAction);
        var renderedRowsBefore =
            await GetRenderedRowCountAsync(page);
        var heapBefore = await GetUsedHeapMegabytesAsync(page);

        var startedAt = Stopwatch.GetTimestamp();

        for (var index = 0; index < actionCount; index++)
        {
            var expectedCompleted = await page.EvaluateAsync<int>(
                "() => window.__erpNeutralPerformanceProbe.arm()");

            E2ETestAssert.True(
                expectedCompleted > 0,
                "The neutral probe could not arm for the next action.");

            await PerformActionAsync(page, measuredAction);

            await page.WaitForFunctionAsync(
                """
                expected =>
                    window.__erpNeutralPerformanceProbe?.completed >= expected
                """,
                expectedCompleted,
                new PageWaitForFunctionOptions
                {
                    Timeout = NormalTimeoutMilliseconds
                });
        }

        var wallClockMilliseconds =
            Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds;

        var snapshotJson = await page.EvaluateAsync<string>(
            """
            () => JSON.stringify(
                window.__erpNeutralPerformanceProbe.stop()
            )
            """);

        var snapshot = JsonSerializer.Deserialize<ProbeSnapshot>(
                snapshotJson,
                jsonOptions) ??
            throw new InvalidOperationException(
                "The neutral performance probe returned no snapshot.");

        await WaitForTwoAnimationFramesAsync(page);

        var positionAfter =
            await GetPositionAsync(page, measuredAction);
        var renderedRowsAfter =
            await GetRenderedRowCountAsync(page);
        var heapAfter = await GetUsedHeapMegabytesAsync(page);

        var samples = snapshot.Samples
            .Where(double.IsFinite)
            .ToArray();
        var longTasks = snapshot.LongTasks
            .Where(double.IsFinite)
            .ToArray();

        if (samples.Length == 0)
        {
            throw new InvalidOperationException(
                "The measured segment did not produce browser samples.");
        }

        return new PerformanceSegmentMetrics(
            Label: label,
            RequestedActions: actionCount,
            CapturedSamples: samples.Length,
            PositionBefore: positionBefore,
            PositionAfter: positionAfter,
            PositionDelta: positionAfter - positionBefore,
            PositionUnit: measuredAction == PerformanceAction.Wheel
                ? "scrollTop-pixels"
                : "active-row-index",
            WallClockMilliseconds: wallClockMilliseconds,
            AverageWallClockPerActionMilliseconds:
                wallClockMilliseconds / actionCount,
            InputToPaintP50Milliseconds: Percentile(samples, 0.50),
            InputToPaintP95Milliseconds: Percentile(samples, 0.95),
            InputToPaintMaximumMilliseconds: samples.Max(),
            UsedJsHeapBeforeMegabytes: heapBefore,
            UsedJsHeapAfterMegabytes: heapAfter,
            UsedJsHeapDeltaMegabytes: Difference(heapAfter, heapBefore),
            RenderedRowsBefore: renderedRowsBefore,
            RenderedRowsAfter: renderedRowsAfter,
            LongTaskCount: longTasks.Length,
            LongTaskTotalMilliseconds: longTasks.Sum(),
            LongTaskMaximumMilliseconds:
                longTasks.Length == 0 ? 0 : longTasks.Max(),
            InputToPaintSamplesMilliseconds: samples);
    }

    private static async Task<PerformanceContinuationMetrics>
        RunDeepContinuationAsync(
            IPage page,
            PerformanceAction measuredAction,
            int rowsPerYear,
            int minimumActionCount,
            int finalMeasuredActionCount)
    {
        var positionBefore =
            await GetPositionAsync(page, measuredAction);
        var renderedRowsBefore =
            await GetRenderedRowCountAsync(page);
        var heapBefore = await GetUsedHeapMegabytesAsync(page);

        var startedAt = Stopwatch.GetTimestamp();
        int actionCount;

        if (measuredAction == PerformanceAction.Wheel)
        {
            var scrollRange = await GetWheelScrollRangeAsync(page);
            var reservedPixels =
                WheelDeltaY * (finalMeasuredActionCount + 10);
            var targetScrollTop = Math.Max(
                positionBefore + (minimumActionCount * WheelDeltaY),
                scrollRange.MaximumScrollTop - reservedPixels);

            targetScrollTop = Math.Clamp(
                targetScrollTop,
                positionBefore,
                scrollRange.MaximumScrollTop);

            actionCount = 0;
            var targetReached = false;
            var estimatedActions = (int)Math.Ceiling(
                Math.Max(0, targetScrollTop - positionBefore) /
                WheelDeltaY);
            var maximumActions = Math.Max(
                minimumActionCount + 200,
                estimatedActions + 400);

            while (actionCount < maximumActions)
            {
                const int batchSize = 5;

                for (var batchIndex = 0;
                     batchIndex < batchSize &&
                     actionCount < maximumActions;
                     batchIndex++)
                {
                    await PerformActionAsync(page, measuredAction);
                    actionCount++;

                    if (actionCount % 5 == 0)
                    {
                        await WaitForTwoAnimationFramesAsync(page);
                    }
                }

                var currentPosition =
                    await GetPositionAsync(page, measuredAction);

                if (
                    actionCount >= minimumActionCount &&
                    currentPosition >= targetScrollTop)
                {
                    targetReached = true;
                    break;
                }
            }

            E2ETestAssert.True(
                targetReached,
                "Wheel continuation could not reach the near-end target.");

            await WaitForTwoAnimationFramesAsync(page);
        }
        else
        {
            var targetPosition = Math.Max(
                1,
                rowsPerYear - finalMeasuredActionCount);

            actionCount = Math.Max(
                0,
                (int)Math.Round(targetPosition - positionBefore));

            E2ETestAssert.True(
                actionCount >= minimumActionCount,
                "The dataset is too small for the requested deep keyboard continuation.");

            await RunUnmeasuredActionsAsync(
                page,
                measuredAction,
                actionCount);
        }

        var wallClockMilliseconds =
            Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds;

        var positionAfter =
            await GetPositionAsync(page, measuredAction);
        var renderedRowsAfter =
            await GetRenderedRowCountAsync(page);
        var heapAfter = await GetUsedHeapMegabytesAsync(page);

        return new PerformanceContinuationMetrics(
            RequestedActions: actionCount,
            PositionBefore: positionBefore,
            PositionAfter: positionAfter,
            PositionDelta: positionAfter - positionBefore,
            PositionUnit: measuredAction == PerformanceAction.Wheel
                ? "scrollTop-pixels"
                : "active-row-index",
            WallClockMilliseconds: wallClockMilliseconds,
            AverageWallClockPerActionMilliseconds:
                actionCount > 0
                    ? wallClockMilliseconds / actionCount
                    : 0,
            UsedJsHeapBeforeMegabytes: heapBefore,
            UsedJsHeapAfterMegabytes: heapAfter,
            UsedJsHeapDeltaMegabytes: Difference(heapAfter, heapBefore),
            RenderedRowsBefore: renderedRowsBefore,
            RenderedRowsAfter: renderedRowsAfter);
    }

    private static async Task<bool> IsWheelNearEndAsync(IPage page)
    {
        var scrollRange = await GetWheelScrollRangeAsync(page);
        return
            scrollRange.MaximumScrollTop - scrollRange.ScrollTop <=
            WheelDeltaY * 10;
    }

    private static async Task<WheelScrollRange>
        GetWheelScrollRangeAsync(IPage page)
    {
        var values = await page.EvaluateAsync<double[]>(
            """
            tableId => {
                const holder = document.querySelector(
                    `#${tableId} .tabulator-tableholder`
                );

                if (!holder) {
                    return [-1, -1];
                }

                return [
                    Number(holder.scrollTop),
                    Number(Math.max(
                        0,
                        holder.scrollHeight - holder.clientHeight
                    ))
                ];
            }
            """,
            TableId);

        E2ETestAssert.True(
            values.Length == 2 && values[0] >= 0 && values[1] >= 0,
            "The table holder did not expose a valid wheel scroll range.");

        return new WheelScrollRange(
            ScrollTop: values[0],
            MaximumScrollTop: values[1]);
    }

    private static async Task RunUnmeasuredActionsAsync(
        IPage page,
        PerformanceAction measuredAction,
        int actionCount)
    {
        for (var index = 0; index < actionCount; index++)
        {
            await PerformActionAsync(page, measuredAction);

            if (measuredAction == PerformanceAction.Wheel)
            {
                if ((index + 1) % 5 == 0)
                {
                    await WaitForTwoAnimationFramesAsync(page);
                }
            }
            else
            {
                await WaitForOneAnimationFrameAsync(page);
            }
        }

        await WaitForTwoAnimationFramesAsync(page);
    }

    private static Task PerformActionAsync(
        IPage page,
        PerformanceAction measuredAction)
    {
        return measuredAction switch
        {
            PerformanceAction.Arrow =>
                page.Keyboard.PressAsync("ArrowDown"),
            PerformanceAction.Enter =>
                page.Keyboard.PressAsync("Enter"),
            PerformanceAction.Wheel =>
                page.Mouse.WheelAsync(0, WheelDeltaY),
            _ => throw new ArgumentOutOfRangeException(
                nameof(measuredAction))
        };
    }

    private static async Task<double> GetPositionAsync(
        IPage page,
        PerformanceAction measuredAction)
    {
        if (measuredAction == PerformanceAction.Wheel)
        {
            return await page.EvaluateAsync<double>(
                """
                tableId => Number(
                    document.querySelector(
                        `#${tableId} .tabulator-tableholder`
                    )?.scrollTop ?? -1
                )
                """,
                TableId);
        }

        return await page.EvaluateAsync<double>(
            """
            tableId => {
                const table = window.tabulatorTest?.tables?.[tableId];
                const ranges = table?.getRanges?.() ?? [];
                const activeRange = ranges.length > 0
                    ? ranges[ranges.length - 1]
                    : null;
                const bottomEdge = activeRange?.getBottomEdge?.();

                return Number.isFinite(bottomEdge)
                    ? bottomEdge + 1
                    : -1;
            }
            """,
            TableId);
    }

    private static async Task<int> GetRenderedRowCountAsync(IPage page)
    {
        return await page.EvaluateAsync<int>(
            """
            tableId => document.querySelectorAll(
                `#${tableId} .tabulator-row`
            ).length
            """,
            TableId);
    }

    private static async Task<double?> GetUsedHeapMegabytesAsync(
        IPage page)
    {
        var value = await page.EvaluateAsync<double>(
            """
            () => {
                const bytes = window.performance?.memory?.usedJSHeapSize;
                return Number.isFinite(bytes)
                    ? bytes / 1024 / 1024
                    : -1;
            }
            """);

        return value >= 0 && double.IsFinite(value)
            ? value
            : null;
    }

    private static async Task<PerformanceEnvironmentSnapshot>
        ReadEnvironmentAsync(IPage page)
    {
        var userAgent = await page.EvaluateAsync<string>(
            "() => navigator.userAgent");
        var hardwareConcurrency = await page.EvaluateAsync<int>(
            "() => Number(navigator.hardwareConcurrency ?? 0)");
        var deviceMemory = await page.EvaluateAsync<double>(
            """
            () => Number.isFinite(navigator.deviceMemory)
                ? Number(navigator.deviceMemory)
                : -1
            """);

        return new PerformanceEnvironmentSnapshot(
            UserAgent: userAgent,
            HardwareConcurrency: hardwareConcurrency,
            DeviceMemoryGigabytes:
                deviceMemory >= 0 ? deviceMemory : null,
            ViewportWidth: 1440,
            ViewportHeight: 1000,
            OperatingSystem: RuntimeInformation.OSDescription,
            ProcessArchitecture:
                RuntimeInformation.ProcessArchitecture.ToString(),
            FrameworkDescription:
                RuntimeInformation.FrameworkDescription);
    }

    private static async Task DisposeNeutralProbeAsync(IPage page)
    {
        await page.EvaluateAsync(
            "() => window.__erpNeutralPerformanceProbe?.dispose?.()");
    }


    private static async Task WaitForOneAnimationFrameAsync(IPage page)
    {
        await page.EvaluateAsync(
            """
            () => new Promise(resolve =>
                window.requestAnimationFrame(resolve)
            )
            """);
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


    private sealed record WheelScrollRange(
        double ScrollTop,
        double MaximumScrollTop);

    private static bool IsMovementValid(
        PerformanceAction measuredAction,
        PerformanceSegmentMetrics segment)
    {
        if (measuredAction == PerformanceAction.Wheel)
        {
            return segment.PositionDelta > 0;
        }

        return segment.PositionDelta == segment.RequestedActions;
    }

    private static bool IsContinuationMovementValid(
        PerformanceAction measuredAction,
        PerformanceContinuationMetrics segment)
    {
        if (measuredAction == PerformanceAction.Wheel)
        {
            return segment.PositionDelta > 0;
        }

        return segment.PositionDelta == segment.RequestedActions;
    }

    private static PerformanceAggregateMetrics BuildAggregate(
        IReadOnlyList<PerformanceRunMetrics> runs)
    {
        var coldSamples = runs
            .SelectMany(run =>
                run.Cold.InputToPaintSamplesMilliseconds)
            .ToArray();
        var longSamples = runs
            .SelectMany(run =>
                run.LongSession.InputToPaintSamplesMilliseconds)
            .ToArray();

        var coldP95 = Percentile(coldSamples, 0.95);
        var longP95 = Percentile(longSamples, 0.95);
        var heapDeltas = runs
            .Select(run => Difference(
                run.LongSession.UsedJsHeapAfterMegabytes,
                run.Cold.UsedJsHeapBeforeMegabytes))
            .Where(value => value is not null)
            .Select(value => value!.Value)
            .ToArray();

        return new PerformanceAggregateMetrics(
            ColdRunP50MedianMilliseconds: Median(
                runs.Select(run =>
                    run.Cold.InputToPaintP50Milliseconds)),
            ColdRunP95MedianMilliseconds: Median(
                runs.Select(run =>
                    run.Cold.InputToPaintP95Milliseconds)),
            ColdAllSamplesP50Milliseconds:
                Percentile(coldSamples, 0.50),
            ColdAllSamplesP95Milliseconds: coldP95,
            LongRunP50MedianMilliseconds: Median(
                runs.Select(run =>
                    run.LongSession.InputToPaintP50Milliseconds)),
            LongRunP95MedianMilliseconds: Median(
                runs.Select(run =>
                    run.LongSession.InputToPaintP95Milliseconds)),
            LongAllSamplesP50Milliseconds:
                Percentile(longSamples, 0.50),
            LongAllSamplesP95Milliseconds: longP95,
            LongVsColdP95DeltaMilliseconds: longP95 - coldP95,
            LongVsColdP95Ratio:
                coldP95 > 0 ? longP95 / coldP95 : 0,
            MedianRunHeapDeltaMegabytes:
                heapDeltas.Length == 0
                    ? null
                    : Median(heapDeltas),
            MaximumRenderedRows:
                runs.Max(run => run.MaximumRenderedRows),
            EveryRunCapturedAllSamples:
                runs.All(run =>
                    run.Cold.CapturedSamples ==
                        run.Cold.RequestedActions &&
                    run.LongSession.CapturedSamples ==
                        run.LongSession.RequestedActions),
            EveryRunPreservedSheetState:
                runs.All(run =>
                    run.FinalActiveRowCount > 0 &&
                    run.FinalDirtyRowCount == 0 &&
                    run.MovementWasValid &&
                    run.ReachedNearEnd),
            InterpretationNote:
                "This baseline intentionally enforces no absolute latency budget. " +
                "Each run traverses the same sheet to its end region before the " +
                "long-session sample. Compare JSON reports only on the same machine, " +
                "build, dataset size, action, browser mode, and diagnostics setting.");
    }

    private static double Percentile(
        IEnumerable<double> values,
        double percentile)
    {
        var sorted = values
            .Where(double.IsFinite)
            .OrderBy(value => value)
            .ToArray();

        if (sorted.Length == 0)
        {
            throw new InvalidOperationException(
                "Cannot calculate a percentile from an empty sample set.");
        }

        var rank = Math.Clamp(
            (int)Math.Ceiling(percentile * sorted.Length) - 1,
            0,
            sorted.Length - 1);

        return sorted[rank];
    }

    private static double Median(IEnumerable<double> values) =>
        Percentile(values, 0.50);

    private static double? Difference(
        double? after,
        double? before)
    {
        return after is not null && before is not null
            ? after.Value - before.Value
            : null;
    }

    private sealed record ProbeSnapshot(
        double[] Samples,
        double[] LongTasks);
}
