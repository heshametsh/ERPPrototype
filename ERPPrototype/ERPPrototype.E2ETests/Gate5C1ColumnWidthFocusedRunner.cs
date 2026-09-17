using System.Globalization;
using System.IO.Compression;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Microsoft.Playwright;
using static ERPPrototype.E2ETests.RevoCanonicalTestSurface;

namespace ERPPrototype.E2ETests;

internal static class Gate5C1ColumnWidthFocusedRunner
{
    private const string TargetProp = "workOrderNumber";
    private const string TargetName = "Work Order Number";
    private const string AnchorProp = "basket";

    public static async Task<int> RunAsync()
    {
        var projectRoot = FindProjectRoot();
        var artifactDirectory = E2EArtifactManager.CreateRunDirectory(projectRoot);
        Exception? failure = null;

        Console.WriteLine("Gate 5C-1 focused Column Width browser + SQL suite");
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
                configuration: "Debug");

            await using var browser = await E2EBrowserSession.CreateAsync(
                application.BaseUri,
                artifactDirectory,
                headed: true,
                traceEnabled: true,
                benchmarkMode: false,
                viewportWidth: 1800,
                viewportHeight: 1000,
                windowWidth: 1900,
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
                await WaitForAnyRenderedDataCellAsync(page);
                await WaitForAggregatesAsync(page);

                var modulePath = await AssertRuntimeFreshAsync(page, projectRoot);
                await AssertWidthRuntimeFreshAsync(page, projectRoot);
                var baselineWidth = await GetActualWidthAsync(page, TargetProp);
                var baseline = await CaptureWidthStateAsync(page, modulePath);
                E2ETestAssert.True(!baseline.Dirty && !baseline.ColumnLayoutsChanged,
                    "Width suite did not start from a Clean baseline.");
                E2ETestAssert.True(baselineWidth is >= 45 and <= 1000,
                    "Baseline width is outside the approved bounds.");
                Console.WriteLine($"[W00-runtime] PASS — width owner loaded; baseline={baselineWidth}px");

                await ResizeColumnAsync(page, TargetProp, 40);
                await WaitForWidthDirtyAsync(page, modulePath, baselineWidth);
                await WaitForUndoCountAsync(page, baseline.UndoCount + 1);
                var resizedWidth = await GetActualWidthAsync(page, TargetProp);
                var resized = await CaptureWidthStateAsync(page, modulePath);
                E2ETestAssert.True(resizedWidth != baselineWidth,
                    "Real header drag did not change the column width.");
                E2ETestAssert.True(resized.Dirty && resized.ColumnLayoutsChanged,
                    "Header drag did not make Column Width Dirty.");
                E2ETestAssert.Equal(baseline.UndoCount + 1, resized.UndoCount,
                    "One header drag did not create exactly one History action.");
                Console.WriteLine($"[W01-drag] PASS — native drag {baselineWidth}px -> {resizedWidth}px, Dirty + one History action");

                await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
                await WaitForWidthAsync(page, TargetProp, baselineWidth);
                var undone = await CaptureWidthStateAsync(page, modulePath);
                E2ETestAssert.True(!undone.Dirty && !undone.ColumnLayoutsChanged,
                    "Undo of the only Width action did not restore Clean.");
                await page.Locator("#revogrid-gate5b1-redo").ClickAsync();
                await WaitForWidthAsync(page, TargetProp, resizedWidth);
                var redone = await CaptureWidthStateAsync(page, modulePath);
                E2ETestAssert.True(redone.Dirty && redone.ColumnLayoutsChanged,
                    "Redo did not restore the Width change.");
                Console.WriteLine("[W02-history] PASS — Undo/Redo restores width and Dirty state");

                await SaveButton(page).ClickAsync();
                await WaitForCleanSaveAsync(page);
                var stored = await GetDbLayoutAsync(
                    database.ConnectionString,
                    database.Seed.CurrentYear,
                    TargetProp);
                E2ETestAssert.True(stored is { Id: > 0 } && stored.Width == resizedWidth,
                    "Width-only Save did not persist the exact width in SQL.");
                E2ETestAssert.True(stored!.RowVersion.Length > 0,
                    "Saved Width did not receive a RowVersion.");
                Console.WriteLine("[W03-save] PASS — width-only Save persists to SQL and returns Clean");

                await ReloadGateAsync(page);
                modulePath = await AssertRuntimeFreshAsync(page, projectRoot);
                await WaitForWidthAsync(page, TargetProp, resizedWidth);
                E2ETestAssert.True(!(await CaptureWidthStateAsync(page, modulePath)).Dirty,
                    "Reloaded saved Width did not start Clean.");
                await SwitchYearAsync(page, database.Seed.PreviousYear);
                modulePath = await ResolveActiveModulePathAsync(page);
                await WaitForWidthAsync(page, TargetProp, resizedWidth);
                E2ETestAssert.True(!(await CaptureWidthStateAsync(page, modulePath)).Dirty,
                    "Department width became Dirty after changing Work Year.");
                await SwitchYearAsync(page, database.Seed.CurrentYear);
                modulePath = await ResolveActiveModulePathAsync(page);
                await WaitForWidthAsync(page, TargetProp, resizedWidth);
                Console.WriteLine("[W04-year] PASS — saved width is shared across Work Years and survives column rebuild");

                var narrowBaselineState = await CaptureWidthStateAsync(page, modulePath);
                await ResizeColumnAsync(page, TargetProp, 70 - resizedWidth);
                await WaitForWidthDirtyAsync(page, modulePath, resizedWidth);
                await WaitForUndoCountAsync(page, narrowBaselineState.UndoCount + 1);
                var narrowWidth = await GetActualWidthAsync(page, TargetProp);
                E2ETestAssert.True(narrowWidth < resizedWidth,
                    "Could not create a deliberately narrow saved width before Auto Fit.");
                await SaveButton(page).ClickAsync();
                await WaitForCleanSaveAsync(page);
                await ReloadGateAsync(page);
                modulePath = await AssertRuntimeFreshAsync(page, projectRoot);
                await WaitForWidthAsync(page, TargetProp, narrowWidth);

                var autoFitBaselineState = await CaptureWidthStateAsync(page, modulePath);
                await page.EvaluateAsync(
                    """
                    () => {
                        window.__erpAutoFitRejections = [];
                        window.__erpAutoFitHeaderEvents = [];
                        window.addEventListener('unhandledrejection', event => {
                            window.__erpAutoFitRejections.push(String(
                                event?.reason?.stack ?? event?.reason?.message ?? event?.reason ?? 'unknown'));
                        });
                        const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                        grid.addEventListener('headerdblclick', event => {
                            const original = event?.detail?.originalEvent;
                            const path = typeof original?.composedPath === 'function'
                                ? original.composedPath()
                                : [];
                            window.__erpAutoFitHeaderEvents.push({
                                prop: String(event?.detail?.column?.prop ?? ''),
                                defaultPrevented: Boolean(event.defaultPrevented),
                                originalDefaultPrevented: Boolean(original?.defaultPrevented),
                                targetClass: String(original?.target?.className ?? ''),
                                resizeInPath: path.some(item =>
                                    item instanceof Element && item.classList?.contains('resizable'))
                            });
                        }, true);
                    }
                    """);
                await AutoFitColumnAsync(page, TargetProp);
                await WaitForWidthDirtyAsync(page, modulePath, narrowWidth);
                var autoFitDebug = await page.EvaluateAsync<string>(
                    """
                    async args => JSON.stringify((await import(args.modulePath)).getChangeState(args.gridId))
                    """,
                    new { modulePath, gridId = GridHostId });
                var autoFitActualWidth = await GetActualWidthAsync(page, TargetProp);
                Console.WriteLine($"[W05-debug] narrow={narrowWidth}px actual={autoFitActualWidth}px state={autoFitDebug}");
                var autoFitRejections = await page.EvaluateAsync<string>(
                    "() => JSON.stringify(window.__erpAutoFitRejections ?? [])");
                Console.WriteLine($"[W05-rejections] {autoFitRejections}");
                var autoFitHeaderEvents = await page.EvaluateAsync<string>(
                    "() => JSON.stringify(window.__erpAutoFitHeaderEvents ?? [])");
                Console.WriteLine($"[W05-header-events] {autoFitHeaderEvents}");
                await WaitForUndoCountAsync(page, autoFitBaselineState.UndoCount + 1);
                var autoWidth = await GetActualWidthAsync(page, TargetProp);
                E2ETestAssert.True(autoWidth > narrowWidth,
                    "Native Auto Fit did not grow the deliberately narrow column.");
                await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
                await WaitForWidthAsync(page, TargetProp, narrowWidth);
                E2ETestAssert.True(!(await CaptureWidthStateAsync(page, modulePath)).Dirty,
                    "Undo after Auto Fit did not restore the saved Clean width.");
                await page.Locator("#revogrid-gate5b1-redo").ClickAsync();
                await WaitForWidthAsync(page, TargetProp, autoWidth);
                await SaveButton(page).ClickAsync();
                await WaitForCleanSaveAsync(page);
                var autoStored = await GetDbLayoutAsync(
                    database.ConnectionString,
                    database.Seed.CurrentYear,
                    TargetProp);
                E2ETestAssert.True(autoStored?.Width == autoWidth,
                    "Auto Fit width was not persisted to SQL.");
                await ReloadGateAsync(page);
                await WaitForWidthAsync(page, TargetProp, autoWidth);
                Console.WriteLine($"[W05-autofit] PASS — native grow-only Auto Fit {narrowWidth}px -> {autoWidth}px participates in History + Save + Reload");
                await WaitForRtlLogicalStartAsync(page);
                var assignmentBefore = await GetActualWidthAsync(page, "assignmentDate");
                var typeBefore = await GetActualWidthAsync(page, "workTypeCode");
                var workOrderIndex = await GetVisibleColumnIndexAsync(page, "workOrderNumber");
                var workOrderHeader = page.Locator(
                    $"#{GridHostId} revogr-viewport-scroll.rgCol:not([row-header]) revogr-header [data-rgCol=\"{workOrderIndex}\"]").First;
                var workOrderBeforeBox = await workOrderHeader.BoundingBoxAsync();
                E2ETestAssert.True(workOrderBeforeBox is not null,
                    "Work Order Number header is not visible before native resize.");
                var workOrderRightBefore = workOrderBeforeBox!.X + workOrderBeforeBox.Width;

                async Task<int> DragLeftHandleAsync(
                    string prop,
                    float delta,
                    bool measureRenders = false)
                {
                    var column = await GetVisibleColumnIndexAsync(page, prop);
                    E2ETestAssert.True(column >= 0,
                        $"Could not resolve visible column '{prop}' for RTL resize.");
                    await ScrollToColumnAsync(page, column);
                    var header = page.Locator(
                        $"#{GridHostId} revogr-viewport-scroll.rgCol:not([row-header]) revogr-header [data-rgCol=\"{column}\"]").First;
                    var handle = header.Locator(".resizable-l").First;
                    await handle.WaitForAsync(new LocatorWaitForOptions
                    {
                        State = WaitForSelectorState.Visible,
                        Timeout = 10_000
                    });
                    var box = await handle.BoundingBoxAsync();
                    E2ETestAssert.True(box is not null,
                        "Native left resize handle has no bounding box.");

                    if (measureRenders)
                    {
                        await page.EvaluateAsync(
                            """
                            () => {
                                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                                window.__erpWidthRenderCount = 0;
                                window.__erpWidthRenderHandler = () => window.__erpWidthRenderCount++;
                                grid.addEventListener('aftergridrender', window.__erpWidthRenderHandler);
                            }
                            """);
                    }

                    var x = box!.X + box.Width / 2;
                    var y = box.Y + box.Height / 2;
                    await page.Mouse.MoveAsync(x, y);
                    await page.Mouse.DownAsync();
                    await page.Mouse.MoveAsync(
                        x + delta,
                        y,
                        new MouseMoveOptions { Steps = 20 });
                    var duringRenders = measureRenders
                        ? await page.EvaluateAsync<int>(
                            "() => Number(window.__erpWidthRenderCount ?? 0)")
                        : -1;
                    await page.Mouse.UpAsync();

                    if (measureRenders)
                    {
                        await page.EvaluateAsync(
                            """
                            () => {
                                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                                if (window.__erpWidthRenderHandler) {
                                    grid.removeEventListener('aftergridrender', window.__erpWidthRenderHandler);
                                }
                                delete window.__erpWidthRenderHandler;
                                delete window.__erpWidthRenderCount;
                            }
                            """);
                    }
                    return duringRenders;
                }

                var pairBaselineState = await CaptureWidthStateAsync(page, modulePath);
                var duringDragRenders = await DragLeftHandleAsync("workTypeCode", -40, true);
                await WaitForWidthDirtyAsync(page, modulePath, typeBefore, "workTypeCode");
                await WaitForUndoCountAsync(page, pairBaselineState.UndoCount + 1);
                await WaitForRtlLogicalStartAsync(page);
                var typeGrown = await GetActualWidthAsync(page, "workTypeCode");
                var assignmentAfterGrow = await GetActualWidthAsync(page, "assignmentDate");
                var pairGrowState = await CaptureWidthStateAsync(page, modulePath);
                var workOrderGrowBox = await workOrderHeader.BoundingBoxAsync();
                E2ETestAssert.Equal(0, duringDragRenders,
                    "Native resize caused a full grid render during MouseMove.");
                E2ETestAssert.Equal(typeBefore + 40, typeGrown,
                    "Dragging the divider left did not grow visual-right Work Type.");
                E2ETestAssert.Equal(assignmentBefore, assignmentAfterGrow,
                    "Growing Work Type changed the visual-left Assignment Date width.");
                E2ETestAssert.True(workOrderGrowBox is not null &&
                    Math.Abs((workOrderGrowBox.X + workOrderGrowBox.Width) - workOrderRightBefore) <= 3,
                    "Growing Work Type moved the RTL logical-start Work Order Number.");
                E2ETestAssert.Equal(pairBaselineState.UndoCount + 1, pairGrowState.UndoCount,
                    "One native drag did not create exactly one History action.");
                Console.WriteLine(
                    $"[W06-native-smooth-owner] PASS — 20 MouseMoves, 0 grid renders; Work Type {typeBefore}px -> {typeGrown}px; Assignment Date unchanged");

                await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
                await WaitForWidthAsync(page, "assignmentDate", assignmentBefore);
                await WaitForWidthAsync(page, "workTypeCode", typeBefore);

                var pairShrinkBaseline = await CaptureWidthStateAsync(page, modulePath);
                var farLeftBefore = await GetActualWidthAsync(page, "workOrderValue");
                await DragLeftHandleAsync("workTypeCode", 40);
                await WaitForWidthDirtyAsync(page, modulePath, typeBefore, "workTypeCode");
                await WaitForUndoCountAsync(page, pairShrinkBaseline.UndoCount + 1);
                await WaitForRtlLogicalStartAsync(page);
                var typeShrunk = await GetActualWidthAsync(page, "workTypeCode");
                var assignmentGrown = await GetActualWidthAsync(page, "assignmentDate");
                var farLeftAfter = await GetActualWidthAsync(page, "workOrderValue");
                var pairShrinkState = await CaptureWidthStateAsync(page, modulePath);
                var workOrderShrinkBox = await workOrderHeader.BoundingBoxAsync();
                E2ETestAssert.Equal(typeBefore - 40, typeShrunk,
                    "Dragging the divider right did not shrink visual-right Work Type.");
                E2ETestAssert.Equal(assignmentBefore + 40, assignmentGrown,
                    "Work Type shrink did not grow only immediate visual-left Assignment Date.");
                E2ETestAssert.Equal(typeBefore + assignmentBefore,
                    typeShrunk + assignmentGrown,
                    "RTL pair shrink did not preserve the two-column total width.");
                E2ETestAssert.Equal(farLeftBefore, farLeftAfter,
                    "RTL pair shrink cascaded into a farther-left column.");
                E2ETestAssert.True(workOrderShrinkBox is not null &&
                    Math.Abs((workOrderShrinkBox.X + workOrderShrinkBox.Width) - workOrderRightBefore) <= 3,
                    "RTL pair shrink moved the Work Order Number right edge.");
                E2ETestAssert.Equal(pairShrinkBaseline.UndoCount + 1, pairShrinkState.UndoCount,
                    "RTL pair shrink did not create exactly one History action.");
                Console.WriteLine(
                    $"[W07-rtl-pair-shrink] PASS — Work Type {typeBefore}px -> {typeShrunk}px; Assignment Date {assignmentBefore}px -> {assignmentGrown}px; no cascade");

                await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
                await WaitForWidthAsync(page, "assignmentDate", assignmentBefore);
                await WaitForWidthAsync(page, "workTypeCode", typeBefore);

                var hiddenColumnWidth = await GetActualWidthAsync(page, "workOrderValue");
                await HideColumnAsync(page, "workOrderValue");
                await WaitForPropVisibilityAsync(page, "workOrderValue", false);
                await WaitForRtlLogicalStartAsync(page);
                var hiddenTypeBefore = await GetActualWidthAsync(page, "workTypeCode");
                var hiddenAssignmentBefore = await GetActualWidthAsync(page, "assignmentDate");
                var hiddenBaselineState = await CaptureWidthStateAsync(page, modulePath);

                await DragLeftHandleAsync("workTypeCode", -30);
                await WaitForWidthDirtyAsync(page, modulePath, hiddenTypeBefore, "workTypeCode");
                await WaitForUndoCountAsync(page, hiddenBaselineState.UndoCount + 1);
                var hiddenTypeAfter = await GetActualWidthAsync(page, "workTypeCode");
                var hiddenAssignmentAfter = await GetActualWidthAsync(page, "assignmentDate");
                E2ETestAssert.Equal(hiddenTypeBefore + 30, hiddenTypeAfter,
                    "Resize after Hide targeted the wrong virtual column.");
                E2ETestAssert.Equal(hiddenAssignmentBefore, hiddenAssignmentAfter,
                    "Resize after Hide unexpectedly changed Assignment Date.");

                await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
                await WaitForWidthAsync(page, "workTypeCode", hiddenTypeBefore);
                await UnhideColumnAsync(page, "Work Order Value");
                await WaitForPropVisibilityAsync(page, "workOrderValue", true);
                var restoredHiddenWidth = await GetActualWidthAsync(page, "workOrderValue");
                E2ETestAssert.Equal(hiddenColumnWidth, restoredHiddenWidth,
                    "Hide/Unhide shifted or overwrote the hidden column width.");
                Console.WriteLine(
                    $"[W08-hide-virtual-index] PASS — resize after Hide stayed on Work Type; Work Order Value restored at {restoredHiddenWidth}px");

                var viewportBeforeOverflow = await GetRtlViewportMetricsAsync(page);
                E2ETestAssert.True(viewportBeforeOverflow[1] <= 3,
                    "Focused fixture did not start the overflow proof from underflow.");
                var basketBeforeOverflow = await GetActualWidthAsync(page, "basket");
                var overflowWorkOrderIndex = await GetVisibleColumnIndexAsync(page, "workOrderNumber");
                var overflowWorkOrderHeader = page.Locator(
                    $"#{GridHostId} revogr-viewport-scroll.rgCol:not([row-header]) revogr-header [data-rgCol=\"{overflowWorkOrderIndex}\"]").First;
                var overflowWorkOrderBeforeBox = await overflowWorkOrderHeader.BoundingBoxAsync();
                E2ETestAssert.True(overflowWorkOrderBeforeBox is not null,
                    "Work Order Number is not visible before underflow-to-overflow resize.");
                var overflowRightBefore = overflowWorkOrderBeforeBox!.X + overflowWorkOrderBeforeBox.Width;
                var overflowBaselineState = await CaptureWidthStateAsync(page, modulePath);

                await DragLeftHandleAsync("basket", -600);
                await WaitForWidthDirtyAsync(page, modulePath, basketBeforeOverflow, "basket");
                await WaitForUndoCountAsync(page, overflowBaselineState.UndoCount + 1);
                await WaitForRtlLogicalStartAsync(page);
                var basketAfterOverflow = await GetActualWidthAsync(page, "basket");
                var viewportAfterOverflow = await GetRtlViewportMetricsAsync(page);
                var overflowWorkOrderAfterBox = await overflowWorkOrderHeader.BoundingBoxAsync();
                E2ETestAssert.True(basketAfterOverflow > basketBeforeOverflow,
                    "Basket resize did not create horizontal overflow.");
                E2ETestAssert.True(viewportAfterOverflow[1] > 50,
                    "Basket growth did not cross from underflow into real overflow.");
                E2ETestAssert.True(Math.Abs(viewportAfterOverflow[0] - viewportAfterOverflow[1]) <= 3,
                    "Underflow-to-overflow transition lost the RTL logical-start anchor.");
                E2ETestAssert.True(overflowWorkOrderAfterBox is not null &&
                    Math.Abs((overflowWorkOrderAfterBox.X + overflowWorkOrderAfterBox.Width) - overflowRightBefore) <= 3,
                    "Work Order Number moved during underflow-to-overflow transition.");

                var secondResizeBaseline = await CaptureWidthStateAsync(page, modulePath);
                var secondTypeBefore = await GetActualWidthAsync(page, "workTypeCode");
                await DragLeftHandleAsync("workTypeCode", -30);
                await WaitForWidthDirtyAsync(page, modulePath, secondTypeBefore, "workTypeCode");
                await WaitForUndoCountAsync(page, secondResizeBaseline.UndoCount + 1);
                await WaitForRtlLogicalStartAsync(page);
                var viewportAfterSecondResize = await GetRtlViewportMetricsAsync(page);
                var secondWorkOrderBox = await overflowWorkOrderHeader.BoundingBoxAsync();
                E2ETestAssert.True(Math.Abs(viewportAfterSecondResize[0] - viewportAfterSecondResize[1]) <= 3,
                    "Second resize after overflow lost the RTL logical-start anchor.");
                E2ETestAssert.True(secondWorkOrderBox is not null &&
                    Math.Abs((secondWorkOrderBox.X + secondWorkOrderBox.Width) - overflowRightBefore) <= 3,
                    "Second resize after overflow pushed Work Order Number out of view.");
                Console.WriteLine(
                    $"[W09-overflow-second-resize] PASS — Basket {basketBeforeOverflow}px -> {basketAfterOverflow}px; second resize keeps Work Order anchored");

                var hardStopWorkOrderIndex = await GetVisibleColumnIndexAsync(page, "workOrderNumber");
                var hardStopHeader = page.Locator(
                    $"#{GridHostId} revogr-viewport-scroll.rgCol:not([row-header]) revogr-header [data-rgCol=\"{hardStopWorkOrderIndex}\"]").First;
                E2ETestAssert.Equal(1, await hardStopHeader.Locator(".resizable-l").CountAsync(),
                    "Work Order Number lost its valid left divider handle.");
                E2ETestAssert.Equal(0, await hardStopHeader.Locator(".resizable-r").CountAsync(),
                    "Work Order Number exposes an invalid outer-right resize handle.");
                Console.WriteLine(
                    "[W10-right-hard-stop] PASS — Work Order Number has only the valid left divider; outer-right edge is fixed");
                browser.Diagnostics.AssertNoCriticalErrors();
                await browser.CaptureSuccessAsync(
                    "gate5c1-column-width-focused",
                    preserveTrace: true);
            }
            catch (Exception exception)
            {
                failure = exception;
                Console.Error.WriteLine("[COLUMN-WIDTH-FOCUSED-FAILURE]");
                Console.Error.WriteLine(exception);
                await browser.CaptureFailureAsync("gate5c1-column-width-focused");
            }
        }
        catch (Exception exception)
        {
            failure ??= exception;
            Console.Error.WriteLine("[COLUMN-WIDTH-FOCUSED-STARTUP-FAILURE]");
            Console.Error.WriteLine(exception);
        }

        var bundle = CreateBundle(artifactDirectory);
        Console.WriteLine();
        Console.WriteLine(failure is null
            ? "Gate 5C-1 focused Column Width suite PASS."
            : "Gate 5C-1 focused Column Width suite FAILED.");
        Console.WriteLine("READY TO UPLOAD:");
        Console.WriteLine(bundle);
        return failure is null ? 0 : 1;
    }

    private static async Task<int> GetActualWidthAsync(IPage page, string prop) =>
        await page.EvaluateAsync<int>(
            """
            async prop => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const providers = await grid.getProviders();
                const raw = providers.column.getRawColumns();
                const source = Array.isArray(raw?.rgCol) ? raw.rgCol : [];
                const items = providers.column.stores?.rgCol?.store?.get?.('items');
                const visible = items
                    ? Array.from(items).map(index => source[Number(index)]).filter(Boolean)
                    : source;
                const index = visible.findIndex(column => String(column?.prop ?? '') === prop);
                if (index < 0) return -1;
                const sizes = providers.dimension.stores?.rgCol?.store?.get?.('sizes') ?? {};
                return Math.round(Number(sizes[index] ?? visible[index]?.size ?? 0));
            }
            """,
            prop);

    private static async Task<double[]> GetRtlViewportMetricsAsync(IPage page) =>
        await page.EvaluateAsync<double[]>(
            """
            () => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const scroller = grid?.querySelector('revogr-viewport-scroll.rgCol:not([row-header])');
                if (!scroller) return [-1, -1];
                return [
                    Number(scroller.scrollLeft || 0),
                    Math.max(0, Number(scroller.scrollWidth || 0) - Number(scroller.clientWidth || 0))
                ];
            }
            """);

    private static async Task ResizeColumnAsync(IPage page, string prop, float delta)
    {
        var column = await GetVisibleColumnIndexAsync(page, prop);
        E2ETestAssert.True(column >= 0, $"Could not resolve visible column '{prop}'.");
        await ScrollToColumnAsync(page, column);
        var handle = page.Locator(
            $"#{GridHostId} revogr-header [data-rgCol=\"{column}\"] .resizable").First;
        await handle.WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });
        var box = await handle.BoundingBoxAsync();
        E2ETestAssert.True(box is not null, "Resize handle has no bounding box.");
        var x = box!.X + box.Width / 2;
        var y = box.Y + box.Height / 2;
        var className = await handle.GetAttributeAsync("class") ?? string.Empty;
        var pointerDelta = className.Contains("resizable-l", StringComparison.Ordinal)
            ? -delta
            : delta;
        await page.Mouse.MoveAsync(x, y);
        await page.Mouse.DownAsync();
        await page.Mouse.MoveAsync(x + pointerDelta, y, new MouseMoveOptions { Steps = 8 });
        await page.Mouse.UpAsync();
    }

    private static async Task AutoFitColumnAsync(IPage page, string prop)
    {
        var column = await GetVisibleColumnIndexAsync(page, prop);
        E2ETestAssert.True(column >= 0, $"Could not resolve visible column '{prop}' for Auto Fit.");
        await ScrollToColumnAsync(page, column);
        var handle = page.Locator(
            $"#{GridHostId} revogr-header [data-rgCol=\"{column}\"] .resizable").First;
        await handle.DblClickAsync();
    }

    private static async Task WaitForWidthAsync(IPage page, string prop, int expected) =>
        await page.WaitForFunctionAsync(
            """
            async args => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const providers = await grid.getProviders();
                const raw = providers.column.getRawColumns();
                for (const type of ['colPinStart', 'rgCol', 'colPinEnd']) {
                    const source = Array.isArray(raw?.[type]) ? raw[type] : [];
                    const items = providers.column.stores?.[type]?.store?.get?.('items');
                    const visible = items
                        ? Array.from(items).map(index => source[Number(index)]).filter(Boolean)
                        : source;
                    const index = visible.findIndex(column => String(column?.prop ?? '') === args.prop);
                    if (index < 0) continue;
                    const sizes = providers.dimension.stores?.[type]?.store?.get?.('sizes') ?? {};
                    const width = Math.round(Number(sizes[index] ?? visible[index]?.size ?? 0));
                    return width === args.expected;
                }
                return false;
            }
            """,
            new { prop, expected },
            new PageWaitForFunctionOptions { Timeout = 10_000 });

    private static async Task WaitForWidthDirtyAsync(
        IPage page,
        string modulePath,
        int previousWidth,
        string prop = TargetProp) =>
        await page.WaitForFunctionAsync(
            """
            async args => {
                const state = (await import(args.modulePath)).getChangeState(args.gridId);
                if (state?.columnLayoutsChanged !== true || state?.dirty !== true) return false;
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const providers = await grid.getProviders();
                const raw = providers.column.getRawColumns();
                const source = Array.isArray(raw?.rgCol) ? raw.rgCol : [];
                const items = providers.column.stores?.rgCol?.store?.get?.('items');
                const visible = items
                    ? Array.from(items).map(index => source[Number(index)]).filter(Boolean)
                    : source;
                const index = visible.findIndex(column => String(column?.prop ?? '') === args.prop);
                if (index < 0) return false;
                const sizes = providers.dimension.stores?.rgCol?.store?.get?.('sizes') ?? {};
                const width = Math.round(Number(sizes[index] ?? visible[index]?.size ?? 0));
                return width !== args.previousWidth;
            }
            """,
            new { modulePath, gridId = GridHostId, prop, previousWidth },
            new PageWaitForFunctionOptions { Timeout = 10_000 });

    private static async Task<WidthState> CaptureWidthStateAsync(
        IPage page,
        string modulePath)
    {
        var json = await page.EvaluateAsync<string>(
            """
            async args => JSON.stringify((await import(args.modulePath)).getChangeState(args.gridId))
            """,
            new { modulePath, gridId = GridHostId });
        var root = JsonDocument.Parse(json).RootElement;
        return new WidthState(
            ParseCounter(await page.Locator("#revogrid-gate5b1-undo-count").TextContentAsync()),
            ParseCounter(await page.Locator("#revogrid-gate5b1-redo-count").TextContentAsync()),
            root.GetProperty("dirty").GetBoolean(),
            root.TryGetProperty("columnLayoutsChanged", out var changed) && changed.GetBoolean());
    }

    private static async Task AssertWidthRuntimeFreshAsync(IPage page, string projectRoot)
    {
        var source = await File.ReadAllTextAsync(Path.Combine(
            projectRoot, "wwwroot", "js", "revoGridGate5B1.js"));
        var token = ExtractToken(
            source,
            @"revoGridColumnWidth\.js\?v=([^""']+)",
            "Column Width module token");
        var urls = await page.EvaluateAsync<string[]>(
            """
            () => [...new Set(
                performance.getEntriesByType('resource')
                    .map(entry => String(entry?.name ?? ''))
                    .filter(name => name.includes('/js/revoGridColumnWidth.js'))
            )]
            """);
        E2ETestAssert.Equal(1, urls.Length,
            $"Expected one loaded Column Width module URL, found {urls.Length}.");
        E2ETestAssert.True(urls[0].Contains($"v={token}", StringComparison.Ordinal),
            "Browser loaded a stale Column Width module token.");
    }

    private static async Task<DbLayout?> GetDbLayoutAsync(
        string connectionString,
        int workYear,
        string fieldKey)
    {
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT TOP (1) [Id], [Width], [IsHidden], [RowVersion]
            FROM [DepartmentColumnLayouts]
            WHERE [FieldKey] = @FieldKey
              AND [DepartmentId] = (
                  SELECT TOP (1) [DepartmentId]
                  FROM [WorkOrders]
                  WHERE [WorkYear] = @WorkYear
                  ORDER BY [Id]);
            """;
        command.Parameters.AddWithValue("@WorkYear", workYear);
        command.Parameters.AddWithValue("@FieldKey", fieldKey);
        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) return null;
        return new DbLayout(
            reader.GetInt32(0),
            reader.GetInt32(1),
            reader.GetBoolean(2),
            (byte[])reader[3]);
    }
    private static async Task HideColumnAsync(IPage page, string prop)
    {
        var column = await GetVisibleColumnIndexAsync(page, prop);
        E2ETestAssert.True(column >= 0,
            $"Could not resolve visible column '{prop}' before Hide.");
        await OpenStructureMenuAsync(page, 0, column);
        var button = page.Locator(".erp-revo-structure-menu:not([hidden])")
            .GetByRole(AriaRole.Button, new() { Name = "Hide Column", Exact = true });
        E2ETestAssert.True(!await button.IsDisabledAsync(),
            "Hide Column was unexpectedly disabled for a normal visible column.");
        await button.ClickAsync();
    }

    private static async Task UnhideColumnAsync(IPage page, string columnName)
    {
        var anchor = await GetVisibleColumnIndexAsync(page, AnchorProp);
        E2ETestAssert.True(anchor >= 0,
            "Could not resolve a visible anchor column for Unhide.");
        await OpenStructureMenuAsync(page, 0, anchor);
        var menu = page.Locator(".erp-revo-structure-menu:not([hidden])");
        await menu.Locator("button")
            .Filter(new LocatorFilterOptions { HasTextString = "Unhide Column >" })
            .ClickAsync();
        var item = menu.Locator(".erp-revo-structure-menu__unhide-list:not([hidden]) button")
            .Filter(new LocatorFilterOptions { HasTextString = columnName });
        await item.ClickAsync();
    }
    private static async Task OpenStructureMenuAsync(IPage page, int row, int column)
    {
        await ScrollToRowAsync(page, row);
        await ScrollToColumnAsync(page, column);
        await DataCell(page, row, column).First.WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 30_000
        });
        await DataCell(page, row, column).ClickAsync(
            new LocatorClickOptions { Button = MouseButton.Right });
        await page.Locator(".erp-revo-structure-menu:not([hidden])")
            .WaitForAsync(new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = 10_000
            });
    }

    private static async Task<int> GetVisibleColumnIndexAsync(IPage page, string prop) =>
        await page.EvaluateAsync<int>(
            """
            async prop => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const providers = await grid.getProviders();
                const raw = providers.column.getRawColumns();
                const source = Array.isArray(raw?.rgCol) ? raw.rgCol : [];
                const items = providers.column.stores?.rgCol?.store?.get?.('items');
                const visible = items
                    ? Array.from(items).map(index => source[Number(index)]).filter(Boolean)
                    : source;
                const logical = visible.findIndex(column => String(column?.prop ?? '') === prop);
                if (logical < 0) return -1;
                return logical;
            }
            """,
            prop);

    private static async Task<bool> IsPropVisibleAsync(IPage page, string prop) =>
        await page.EvaluateAsync<bool>(
            """
            async prop => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const providers = await grid.getProviders();
                const raw = providers.column.getRawColumns();
                const source = Array.isArray(raw?.rgCol) ? raw.rgCol : [];
                const items = providers.column.stores?.rgCol?.store?.get?.('items');
                const visible = items
                    ? Array.from(items).map(index => source[Number(index)]).filter(Boolean)
                    : source;
                return visible.some(column => String(column?.prop ?? '') === prop);
            }
            """,
            prop);

    private static async Task WaitForPropVisibilityAsync(
        IPage page,
        string prop,
        bool visible) =>
        await page.WaitForFunctionAsync(
            """
            async args => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const providers = await grid.getProviders();
                const raw = providers.column.getRawColumns();
                const source = Array.isArray(raw?.rgCol) ? raw.rgCol : [];
                const items = providers.column.stores?.rgCol?.store?.get?.('items');
                const projection = items
                    ? Array.from(items).map(index => source[Number(index)]).filter(Boolean)
                    : source;
                const actual = projection.some(column =>
                    String(column?.prop ?? '') === args.prop);
                return actual === args.visible;
            }
            """,
            new { prop, visible },
            new PageWaitForFunctionOptions { Timeout = 10_000 });
    private static async Task<VisibilityState> CaptureStateAsync(
        IPage page,
        string modulePath)
    {
        var json = await page.EvaluateAsync<string>(
            """
            async args => JSON.stringify((await import(args.modulePath)).getChangeState(args.gridId))
            """,
            new { modulePath, gridId = GridHostId });
        var root = JsonDocument.Parse(json).RootElement;
        var hiddenProps = root.GetProperty("hiddenProps")
            .EnumerateArray()
            .Select(item => item.GetString() ?? string.Empty)
            .ToHashSet(StringComparer.Ordinal);
        return new VisibilityState(
            ParseCounter(await page.Locator("#revogrid-gate5b1-undo-count").TextContentAsync()),
            ParseCounter(await page.Locator("#revogrid-gate5b1-redo-count").TextContentAsync()),
            root.GetProperty("dirty").GetBoolean(),
            hiddenProps.Contains(TargetProp));
    }

    private static async Task WaitForHiddenAsync(
        IPage page,
        string modulePath,
        bool hidden)
    {
        await page.WaitForFunctionAsync(
            """
            async args => {
                const state = (await import(args.modulePath)).getChangeState(args.gridId);
                const props = Array.isArray(state?.hiddenProps) ? state.hiddenProps : [];
                return props.includes(args.prop) === args.hidden;
            }
            """,
            new { modulePath, gridId = GridHostId, prop = TargetProp, hidden },
            new PageWaitForFunctionOptions { Timeout = 10_000 });
    }

    private static async Task<bool> HasAggregateAsync(IPage page, string prop)
    {
        await WaitForAggregatesAsync(page);
        return await page.Locator(
            $"#revogrid-gate5c1-visible-aggregates [data-aggregate-field=\"{prop}\"]")
            .CountAsync() > 0;
    }

    private static async Task WaitForAggregatesAsync(IPage page) =>
        await page.WaitForFunctionAsync(
            """
            () => document.querySelector('#revogrid-gate5c1-visible-aggregates')
                ?.dataset?.aggregateReady === 'true'
            """,
            null,
            new PageWaitForFunctionOptions { Timeout = 30_000 });
    private static async Task WaitForCleanSaveAsync(IPage page)
    {
        await page.Locator(".native-gate5a__operation-message")
            .Filter(new LocatorFilterOptions { HasTextString = "تم الحفظ في قاعدة البيانات" })
            .WaitForAsync(new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = 30_000
            });
        await page.WaitForFunctionAsync(
            "() => document.querySelector('#revogrid-gate5b1-change-status')?.textContent?.trim() === 'Clean'",
            null,
            new PageWaitForFunctionOptions { Timeout = 30_000 });
    }

    private static async Task SwitchYearAsync(IPage page, int year)
    {
        var selector = page.GetByTestId("gate5a-year-selector");
        var value = year.ToString(CultureInfo.InvariantCulture);
        if (!StringComparer.Ordinal.Equals(await selector.InputValueAsync(), value))
        {
            await selector.SelectOptionAsync(value);
        }
        await WaitForYearAsync(page, year);
    }

    private static async Task WaitForYearAsync(IPage page, int year)
    {
        await page.WaitForFunctionAsync(
            """
            expected => {
                const selector = document.querySelector('[data-testid="gate5a-year-selector"]');
                const loading = document.querySelector('.native-gate5a__loading');
                const status = document.querySelector('.native-gate5a__statusbar')?.textContent ?? '';
                return selector?.value === String(expected) &&
                    selector.disabled === false && !loading && status.includes(`Dataset ${expected}`);
            }
            """,
            year,
            new PageWaitForFunctionOptions { Timeout = 30_000 });
        await WaitForAnyRenderedDataCellAsync(page);
        await WaitForAggregatesAsync(page);
    }

    private static async Task ReloadGateAsync(IPage page)
    {
        await page.ReloadAsync(new PageReloadOptions { WaitUntil = WaitUntilState.DOMContentLoaded });
        await Grid(page).WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 45_000
        });
        await WaitForAnyRenderedDataCellAsync(page);
        await WaitForAggregatesAsync(page);
    }

    private static async Task<string> AssertRuntimeFreshAsync(IPage page, string projectRoot)
    {
        var razor = await File.ReadAllTextAsync(Path.Combine(
            projectRoot,
            "Components",
            "Pages",
            "WorkOrdersRevoGridNativeGate5A.razor.cs"));
        var gateSource = await File.ReadAllTextAsync(Path.Combine(
            projectRoot,
            "wwwroot",
            "js",
            "revoGridGate5B1.js"));
        var gateToken = ExtractToken(
            razor,
            @"revoGridGate5B1\.js\?v=([^""']+)",
            "Gate module token");
        var visibilityToken = ExtractToken(
            gateSource,
            @"revoGridColumnVisibility\.js\?v=([^""']+)",
            "Visibility module token");

        var gateUrl = await ResolveActiveModulePathAsync(page);
        E2ETestAssert.True(gateUrl.Contains($"v={gateToken}", StringComparison.Ordinal),
            "Browser loaded a stale Gate module token.");
        var visibilityUrls = await page.EvaluateAsync<string[]>(
            """
            () => [...new Set(
                performance.getEntriesByType('resource')
                    .map(entry => String(entry?.name ?? ''))
                    .filter(name => name.includes('/js/revoGridColumnVisibility.js'))
            )]
            """);
        E2ETestAssert.Equal(1, visibilityUrls.Length,
            $"Expected one loaded Visibility module URL, found {visibilityUrls.Length}.");
        E2ETestAssert.True(
            visibilityUrls[0].Contains($"v={visibilityToken}", StringComparison.Ordinal),
            "Browser loaded a stale Visibility module token.");
        return gateUrl;
    }

    private static async Task<string> ResolveActiveModulePathAsync(IPage page)
    {
        var urls = await page.EvaluateAsync<string[]>(
            """
            () => [...new Set(
                performance.getEntriesByType('resource')
                    .map(entry => String(entry?.name ?? ''))
                    .filter(name => /\/js\/revoGridGate5B1\.js(?:\?|$)/.test(name))
            )]
            """);
        E2ETestAssert.Equal(1, urls.Length,
            $"Expected exactly one active Gate module URL, found {urls.Length}.");
        return urls[0];
    }

    private static string ExtractToken(string source, string pattern, string label)
    {
        var match = Regex.Match(source, pattern, RegexOptions.CultureInvariant);
        if (!match.Success || string.IsNullOrWhiteSpace(match.Groups[1].Value))
        {
            throw new InvalidOperationException($"Could not extract {label} from current source.");
        }
        return match.Groups[1].Value;
    }

    private static async Task ScrollToRowAsync(IPage page, int row)
    {
        if (await RenderedRowCell(page, row).IsVisibleAsync())
        {
            return;
        }
        await page.EvaluateAsync(
            "async row => document.querySelector('#revogrid-native-gate5a-grid revo-grid').scrollToRow(row)",
            row);
        await RenderedRowCell(page, row).WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });
    }
    private static async Task ScrollToColumnAsync(IPage page, int column)
    {
        if (await RenderedColumnCell(page, column).IsVisibleAsync())
        {
            return;
        }
        await page.EvaluateAsync(
            "async column => document.querySelector('#revogrid-native-gate5a-grid revo-grid').scrollToColumnIndex(column)",
            column);
        await RenderedColumnCell(page, column).WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });
    }

    private static async Task WaitForAnyRenderedDataCellAsync(IPage page) =>
        await page.Locator(
                $"#{GridHostId} revogr-viewport-scroll.rgCol:not([row-header]) [data-rgRow][data-rgCol]")
            .First.WaitForAsync(new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = 30_000
            });

    private static int ParseCounter(string? text) =>
        int.Parse((text ?? "0").Trim(), CultureInfo.InvariantCulture);

    private static async Task WaitForUndoCountAsync(IPage page, int expected) =>
        await page.WaitForFunctionAsync(
            """
            expected => Number(
                document.querySelector('#revogrid-gate5b1-undo-count')
                    ?.textContent?.trim() ?? '-1') === expected
            """,
            expected,
            new PageWaitForFunctionOptions { Timeout = 10_000 });

    private static async Task WaitForRtlLogicalStartAsync(IPage page) =>
        await page.WaitForFunctionAsync(
            """
            () => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const scroller = grid?.querySelector('revogr-viewport-scroll.rgCol:not([row-header])');
                if (!scroller) return false;
                const max = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
                return Math.abs(scroller.scrollLeft - max) <= 3;
            }
            """,
            null,
            new PageWaitForFunctionOptions { Timeout = 10_000 });
    private static async Task<DbVisibility?> GetDbVisibilityAsync(
        string connectionString,
        int workYear,
        string fieldKey)
    {
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT TOP (1) [Id], [IsHidden], [RowVersion]
            FROM [DepartmentColumnVisibilities]
            WHERE [WorkYear] = @WorkYear
              AND [FieldKey] = @FieldKey
              AND [DepartmentId] = (
                  SELECT TOP (1) [DepartmentId]
                  FROM [WorkOrders]
                  WHERE [WorkYear] = @WorkYear
                  ORDER BY [Id]);
            """;
        command.Parameters.AddWithValue("@WorkYear", workYear);
        command.Parameters.AddWithValue("@FieldKey", fieldKey);
        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return null;
        }
        return new DbVisibility(
            reader.GetInt32(0),
            reader.GetBoolean(1),
            (byte[])reader[2]);
    }
    private static ILocator Grid(IPage page) =>
        page.Locator($"#{GridHostId} revo-grid");

    private static ILocator SaveButton(IPage page) =>
        page.Locator("#revogrid-gate5b11-save");

    private static ILocator RenderedRowCell(IPage page, int row) =>
        page.Locator(
            $"#{GridHostId} revogr-viewport-scroll.rgCol:not([row-header]) [data-rgRow=\"{row}\"][data-rgCol]").First;

    private static ILocator RenderedColumnCell(IPage page, int column) =>
        page.Locator(
            $"#{GridHostId} revogr-viewport-scroll.rgCol:not([row-header]) [data-rgRow][data-rgCol=\"{column}\"]").First;

    private static ILocator DataCell(IPage page, int row, int column) =>
        page.Locator(
            $"#{GridHostId} revogr-viewport-scroll.rgCol:not([row-header]) [data-rgRow=\"{row}\"][data-rgCol=\"{column}\"]");

    private static string CreateBundle(string artifactDirectory)
    {
        var downloads = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            "Downloads");
        Directory.CreateDirectory(downloads);
        var path = Path.Combine(
            downloads,
            $"ERP_COLUMN_WIDTH_FOCUSED_TRACE_{DateTime.Now:yyyyMMdd-HHmmss}.zip");
        if (File.Exists(path))
        {
            File.Delete(path);
        }
        ZipFile.CreateFromDirectory(
            artifactDirectory,
            path,
            CompressionLevel.Optimal,
            includeBaseDirectory: false);
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
        }        throw new DirectoryNotFoundException("Could not locate ERPPrototype.csproj.");
    }

    private sealed record WidthState(int UndoCount, int RedoCount, bool Dirty, bool ColumnLayoutsChanged);

    private sealed record VisibilityState(
        int UndoCount,
        int RedoCount,
        bool Dirty,
        bool Hidden);

    private sealed record DbLayout(int Id, int Width, bool IsHidden, byte[] RowVersion);

    private sealed record DbVisibility(
        int Id,
        bool IsHidden,
        byte[] RowVersion);
}
