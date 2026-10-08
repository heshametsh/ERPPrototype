using System.Globalization;
using System.IO.Compression;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Microsoft.Playwright;
using static ERPPrototype.E2ETests.RevoCanonicalTestSurface;

namespace ERPPrototype.E2ETests;

// Accepted Width contract (user, 2026-10-06): the sheet is fixed LTR; the only
// divider is on each column's right edge; a drag resizes the column live while
// its left edge and every column to its left stay put and columns to its right
// shift; release never jumps; a drag never narrows a column below its widest
// value; Escape mid-drag restores the start width and records nothing.
// Persistence (same contract the Tabulator sheet had): a drag makes the sheet
// Dirty with one History action; Ctrl+Z/Ctrl+Y restore old/new width; Save
// stores the width for the department and it survives Refresh and every Work Year.
internal static class Gate5C1ColumnWidthFocusedRunner
{
    private const float Tolerance = 3;

    public static async Task<int> RunAsync()
    {
        var projectRoot = FindProjectRoot();
        var artifactDirectory = E2EArtifactManager.CreateRunDirectory(projectRoot);
        Exception? failure = null;

        Console.WriteLine("Gate 5C-1 focused Column Width browser suite (LTR live + content minimum)");
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

                // W00 — fresh runtime + LTR surface.
                var modulePath = await AssertRuntimeFreshAsync(page, projectRoot);
                await AssertWidthRuntimeFreshAsync(page, projectRoot);
                var baseline = await CaptureWidthStateAsync(page, modulePath);
                E2ETestAssert.True(!baseline.Dirty && !baseline.ColumnLayoutsChanged,
                    "Width suite did not start from a Clean baseline.");
                var surface = await page.EvaluateAsync<string[]>(
                    """
                    () => {
                        const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                        const headers = grid.querySelectorAll('revogr-viewport-scroll.rgCol:not([row-header]) revogr-header [data-rgCol]');
                        return [
                            getComputedStyle(grid).direction,
                            String(headers.length),
                            String(grid.querySelectorAll('revogr-header .resizable-l').length),
                            String([...headers].filter(h => h.querySelector('.resizable-r')).length)
                        ];
                    }
                    """);
                E2ETestAssert.Equal("ltr", surface[0], "Work Orders grid is not LTR.");
                E2ETestAssert.Equal("0", surface[2], "A left (RTL) resize handle is still rendered.");
                E2ETestAssert.Equal(surface[1], surface[3],
                    "Not every rendered header has its right-edge resize handle.");
                E2ETestAssert.Equal(0, await GetVisibleColumnIndexAsync(page, "workOrderNumber"),
                    "Work Order Number is not the first (left-most) column.");
                Console.WriteLine($"[W00-runtime-ltr] PASS — fresh modules; direction=ltr; {surface[1]} headers, all right-edge handles, 0 left handles");

                // P01 — a width drag is an employee change: Dirty + one History action;
                // Ctrl+Z restores the old width (Clean), Ctrl+Y restores the new one.
                var persistProp = await GetVisiblePropAsync(page, 1);
                var persistStart = await GetActualWidthAsync(page, persistProp);
                var persistDrag = await DragRightHandleAsync(page, persistProp, 50);
                AssertLiveDrag(persistDrag, 50, "persist grow");
                var persistWidth = persistStart + 50;
                E2ETestAssert.Equal(persistWidth, await GetActualWidthAsync(page, persistProp),
                    "Store width after the persistence drag does not match the rendered drag.");
                await AssertWidthChangeAsync(page, modulePath, baseline.UndoCount + 1, true, "drag");
                await RenderedRowCell(page, 0).ClickAsync();
                await page.Keyboard.PressAsync("Control+z");
                await WaitForWidthAsync(page, persistProp, persistStart);
                await AssertWidthChangeAsync(page, modulePath, baseline.UndoCount, false, "Ctrl+Z");
                await page.Keyboard.PressAsync("Control+y");
                await WaitForWidthAsync(page, persistProp, persistWidth);
                await AssertWidthChangeAsync(page, modulePath, baseline.UndoCount + 1, true, "Ctrl+Y");
                Console.WriteLine(
                    $"[P01-dirty-history] PASS — {persistProp} {persistStart}px -> {persistWidth}px marks the sheet changed; Ctrl+Z -> {persistStart}px Clean; Ctrl+Y -> {persistWidth}px");

                // P02 — Save persists the exact width for the department.
                await SaveButton(page).ClickAsync();
                await WaitForCleanSaveAsync(page);
                var stored = await GetDbLayoutAsync(
                    database.ConnectionString, database.Seed.CurrentYear, persistProp);
                E2ETestAssert.True(stored is { Id: > 0 } && stored.Width == persistWidth,
                    $"Save did not persist {persistProp}={persistWidth}px in SQL (stored {stored?.Width.ToString() ?? "none"}).");
                Console.WriteLine($"[P02-save] PASS — SQL DepartmentColumnLayouts {persistProp}={stored!.Width}px; sheet Clean");

                // P03 — Refresh and every Work Year show the saved width, Clean.
                await ReloadGateAsync(page);
                modulePath = await AssertRuntimeFreshAsync(page, projectRoot);
                await WaitForWidthAsync(page, persistProp, persistWidth);
                await AssertWidthChangeAsync(page, modulePath, 0, false, "after Refresh");
                await SwitchYearAsync(page, database.Seed.PreviousYear);
                await WaitForWidthAsync(page, persistProp, persistWidth);
                await AssertWidthChangeAsync(page, modulePath, 0, false, "previous Work Year");
                await SwitchYearAsync(page, database.Seed.CurrentYear);
                await WaitForWidthAsync(page, persistProp, persistWidth);
                var rendered = await TryGetGeometryAsync(page, await GetVisibleColumnIndexAsync(page, persistProp));
                E2ETestAssert.True(rendered is not null && Math.Abs(rendered.Width - persistWidth) <= Tolerance,
                    $"Rendered {persistProp} width after Refresh/year switch is {rendered?.Width}px, expected {persistWidth}px.");
                baseline = await CaptureWidthStateAsync(page, modulePath);
                Console.WriteLine(
                    $"[P03-refresh-years] PASS — {persistProp} renders {Px(rendered!.Width)} after Refresh, in {database.Seed.PreviousYear} and back in {database.Seed.CurrentYear}; Clean");

                // W01 — live grow: owner widens during the drag, left edge fixed,
                // left columns fixed, right neighbour shifts with unchanged width.
                var growProp = await GetVisiblePropAsync(page, 2);
                var growStart = await GetActualWidthAsync(page, growProp);
                var grow = await DragRightHandleAsync(page, growProp, 40, measureRenders: true);
                AssertLiveDrag(grow, 40, "grow");
                E2ETestAssert.Equal(growStart + 40, await GetActualWidthAsync(page, growProp),
                    "Store width after grow does not match the rendered drag.");
                await AssertWidthChangeAsync(page, modulePath, baseline.UndoCount + 1, true, "grow");
                Console.WriteLine(
                    $"[W01-live-grow] PASS — {growProp} {Px(grow.Before.Owner.Width)} -> during {Px(grow.During.Owner.Width)} -> after {Px(grow.After.Owner.Width)}; left edge fixed; right neighbour shifted; grid renders during drag={grow.DuringRenders} (diagnostic); one History action");

                // W02 — live shrink back by the same distance.
                var shrink = await DragRightHandleAsync(page, growProp, -40);
                AssertLiveDrag(shrink, -40, "shrink");
                E2ETestAssert.Equal(growStart, await GetActualWidthAsync(page, growProp),
                    "Store width after shrink does not match the rendered drag.");
                await AssertWidthChangeAsync(page, modulePath, baseline.UndoCount + 2, false, "shrink back to the saved width");
                Console.WriteLine(
                    $"[W02-live-shrink] PASS — {growProp} {Px(shrink.Before.Owner.Width)} -> during {Px(shrink.During.Owner.Width)} -> after {Px(shrink.After.Owner.Width)}; right neighbour pulled left, no release jump");

                // W03 — Escape mid-drag restores the start width and cancels the release write.
                var escProp = await GetVisiblePropAsync(page, 3);
                var escStart = await GetActualWidthAsync(page, escProp);
                var escape = await DragRightHandleAsync(page, escProp, 60, pressEscapeBeforeRelease: true);
                E2ETestAssert.True(Math.Abs(escape.During.Owner.Width - (escape.Before.Owner.Width + 60)) <= Tolerance,
                    "Escape probe: the column did not widen live before Escape.");
                E2ETestAssert.True(escape.AfterEscape is not null &&
                    Math.Abs(escape.AfterEscape.Owner.Width - escape.Before.Owner.Width) <= Tolerance,
                    "Escape did not restore the start width while the mouse was still down.");
                E2ETestAssert.True(Math.Abs(escape.After.Owner.Width - escape.Before.Owner.Width) <= Tolerance,
                    "Releasing the mouse after Escape wrote the dragged width.");
                E2ETestAssert.Equal(escStart, await GetActualWidthAsync(page, escProp),
                    "Store width after Escape is not the start width.");
                E2ETestAssert.Equal(baseline.UndoCount + 2, (await CaptureWidthStateAsync(page, modulePath)).UndoCount,
                    "Escape added a History action.");
                Console.WriteLine(
                    $"[W03-escape] PASS — {escProp} {Px(escape.Before.Owner.Width)} -> {Px(escape.During.Owner.Width)} -> Escape {Px(escape.AfterEscape!.Owner.Width)} -> release {Px(escape.After.Owner.Width)}");

                // W04 — scrolled, overflowed viewport: scroll position and the
                // dragged column's left edge stay put; no release jump.
                await page.SetViewportSizeAsync(960, 1000);
                await page.WaitForTimeoutAsync(250);
                await page.EvaluateAsync(
                    "async () => document.querySelector('#revogrid-native-gate5a-grid revo-grid').scrollToCoordinate({ x: 400 })");
                await WaitFramesAsync(page);
                var scrolledIndex = await FindFullyVisibleColumnAsync(page);
                E2ETestAssert.True(scrolledIndex > 0, "No fully visible column after horizontal scroll.");
                var scrollBefore = await GetScrollLeftAsync(page);
                E2ETestAssert.True(scrollBefore > 50, $"Scrolled probe did not scroll (scrollLeft {scrollBefore}).");
                var scrolledProp = await GetVisiblePropAsync(page, scrolledIndex);
                var scrolled = await DragRightHandleAsync(page, scrolledProp, 40, scrollIntoView: false);
                var scrollAfter = await GetScrollLeftAsync(page);
                AssertLiveDrag(scrolled, 40, "scrolled grow");
                E2ETestAssert.True(Math.Abs(scrollAfter - scrollBefore) <= Tolerance,
                    $"Scrolled grow changed scrollLeft {scrollBefore} -> {scrollAfter}.");
                Console.WriteLine(
                    $"[W04-scrolled-grow] PASS — viewport 960, scrollLeft {scrollBefore:F0} kept; {scrolledProp} {Px(scrolled.Before.Owner.Width)} -> {Px(scrolled.After.Owner.Width)} with left edge fixed");

                // W05 — Hide shifts virtual indexes; a drag must hit the column the employee sees.
                var hideProp = await GetVisiblePropAsync(page, 2);
                var hiddenColumnWidth = await GetActualWidthAsync(page, hideProp);
                var hideBaseline = await CaptureWidthStateAsync(page, modulePath);
                await HideColumnAsync(page, hideProp);
                await WaitForPropVisibilityAsync(page, hideProp, false);
                await WaitForUndoCountAsync(page, hideBaseline.UndoCount + 1);
                var shiftedProp = await GetVisiblePropAsync(page, 2);
                var shiftedStart = await GetActualWidthAsync(page, shiftedProp);
                var hiddenDrag = await DragRightHandleAsync(page, shiftedProp, 30);
                AssertLiveDrag(hiddenDrag, 30, "drag after Hide");
                E2ETestAssert.Equal(shiftedStart + 30, await GetActualWidthAsync(page, shiftedProp),
                    "Resize after Hide targeted the wrong virtual column.");
                await WaitForUndoCountAsync(page, hideBaseline.UndoCount + 2);
                // Undo the width drag, then the Hide.
                await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
                await WaitForWidthAsync(page, shiftedProp, shiftedStart);
                await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
                await WaitForPropVisibilityAsync(page, hideProp, true);
                var restoredHiddenWidth = await GetActualWidthAsync(page, hideProp);
                E2ETestAssert.Equal(hiddenColumnWidth, restoredHiddenWidth,
                    "Hide/Unhide shifted or overwrote the hidden column width.");
                var shiftedAfterUnhide = await GetActualWidthAsync(page, shiftedProp);
                Console.WriteLine(
                    $"[W05-hide-virtual-index] PASS — drag after Hide hit {shiftedProp} ({shiftedStart}px -> {shiftedStart + 30}px); {hideProp} restored at {restoredHiddenWidth}px");
                Console.WriteLine(
                    $"[W05-diagnostic] {shiftedProp} width after Unhide = {shiftedAfterUnhide}px (expected {shiftedStart}px after undoing its drag)");

                // W06 — content minimum (runs last: it leaves Work Order Number at its minimum). Independent oracle: the longest Work Order
                // Number in SQL for the loaded year, laid out in a real body cell.
                var minProp = "workOrderNumber";
                // W04 left the viewport scrolled right; Work Order Number body cells
                // must be rendered for the oracle and the overflow check.
                await page.SetViewportSizeAsync(1440, 1000);
                await page.EvaluateAsync(
                    """
                    () => {
                        const scroller = document.querySelector(
                            '#revogrid-native-gate5a-grid revo-grid revogr-viewport-scroll.rgCol:not([row-header])');
                        scroller.scrollLeft = 0;
                        scroller.dispatchEvent(new Event('scroll'));
                    }
                    """);
                await WaitFramesAsync(page);
                await page.WaitForTimeoutAsync(250);
                E2ETestAssert.True(await GetScrollLeftAsync(page) <= Tolerance,
                    "W06 setup: the grid did not scroll back to the first column.");
                E2ETestAssert.Equal(0, await GetVisibleColumnIndexAsync(page, minProp),
                    "W06 setup: Work Order Number is not the first visible column.");
                var minStart = await GetActualWidthAsync(page, minProp);
                var longest = await GetLongestValuesAsync(
                    database.ConnectionString, database.Seed.CurrentYear);
                var oracleMin = await MeasureTextInCellAsync(page, 0, longest);
                E2ETestAssert.True(oracleMin > 30 && oracleMin < minStart,
                    $"Content-minimum fixture is not meaningful (oracle {oracleMin:F1}px, start {minStart}px).");
                var minDrag = await DragRightHandleAsync(page, minProp, -(minStart + 200));
                E2ETestAssert.True(minDrag.During.Owner.Width >= oracleMin - 1,
                    $"During the drag the column went below its content ({Px(minDrag.During.Owner.Width)} < oracle {oracleMin:F1}px).");
                E2ETestAssert.True(Math.Abs(minDrag.After.Owner.Width - minDrag.During.Owner.Width) <= Tolerance,
                    "Release jumped after the content-minimum stop.");
                var minFinal = await GetActualWidthAsync(page, minProp);
                Console.WriteLine("[W06-diagnostic] " + await page.EvaluateAsync<string>(
                    """
                    async () => {
                        const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                        const first = grid.querySelector('.rgCell');
                        const body = grid.querySelector('revogr-viewport-scroll.rgCol:not([row-header]) [data-rgRow][data-rgCol="0"]');
                        const describe = el => {
                            const s = getComputedStyle(el);
                            return `${el.tagName.toLowerCase()}.${el.className} in ${el.parentElement?.tagName.toLowerCase()} font="${s.font}" pad=${s.paddingLeft}/${s.paddingRight}`;
                        };
                        const providers = await grid.getProviders();
                        let longest = '';
                        for (const store of Object.values(providers?.data?.stores ?? {})) {
                            for (const row of store?.store?.get?.('source') ?? []) {
                                const text = String(row?.workOrderNumber ?? '');
                                if (text.length > longest.length) longest = text;
                            }
                        }
                        return `firstRgCell=[${describe(first)}] bodyCell=[${describe(body)}] longestSource="${longest}" bodyText="${body.textContent}"`;
                    }
                    """));
                E2ETestAssert.True(minFinal >= oracleMin - 1 && minFinal <= oracleMin + 6,
                    $"Drag did not stop at the content minimum (final {minFinal}px, oracle {oracleMin:F1}px).");
                E2ETestAssert.True(Math.Abs(minDrag.After.Owner.Left - minDrag.Before.Owner.Left) <= Tolerance,
                    "Left edge of Work Order Number moved during the minimum drag.");
                var overflow = await CountOverflowingCellsAsync(page, 0);
                E2ETestAssert.Equal(0, overflow[0],
                    $"{overflow[0]}/{overflow[1]} rendered Work Order Number cells overflow at the minimum.");
                var afterMin = await CaptureWidthStateAsync(page, modulePath);
                E2ETestAssert.True(afterMin.ColumnLayoutsChanged && afterMin.UndoCount == hideBaseline.UndoCount + 1,
                    "The content-minimum drag did not record exactly one Width change.");
                Console.WriteLine(
                    $"[W06-content-minimum] PASS — far-left drag {minStart}px -> {minFinal}px; SQL oracle (longest of {longest.Length} values) {oracleMin:F1}px; 0/{overflow[1]} rendered cells overflow");

                Console.WriteLine("[NOT COVERED] Auto Fit (double-click divider); Save conflict on a stale width RowVersion.");
                Console.WriteLine("[NOT COVERED] Minimum across filtered-out rows; already-narrower column not forced wider.");
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

    private static string Px(float value) =>
        $"{value.ToString("F0", CultureInfo.InvariantCulture)}px";

    // Rendered DOM geometry is the oracle; the store width is only a cross-check.
    private static void AssertLiveDrag(DragProbe probe, float delta, string label)
    {
        var before = probe.Before;
        var during = probe.During;
        var after = probe.After;
        E2ETestAssert.True(Math.Abs(during.Owner.Width - (before.Owner.Width + delta)) <= Tolerance,
            $"{label}: column did not follow the pointer live (before {Px(before.Owner.Width)}, during {Px(during.Owner.Width)}, expected {Px(before.Owner.Width + delta)}).");
        E2ETestAssert.True(Math.Abs(during.Owner.Left - before.Owner.Left) <= Tolerance &&
            Math.Abs(after.Owner.Left - before.Owner.Left) <= Tolerance,
            $"{label}: the dragged column's left edge moved.");
        E2ETestAssert.True(Math.Abs(probe.DuringDividerX - during.Owner.Right) <= Tolerance,
            $"{label}: the divider separated from the column edge during the drag.");
        E2ETestAssert.True(Math.Abs(after.Owner.Width - during.Owner.Width) <= Tolerance,
            $"{label}: width jumped on release ({Px(during.Owner.Width)} -> {Px(after.Owner.Width)}).");
        if (before.Left is not null)
        {
            E2ETestAssert.True(during.Left is not null && after.Left is not null &&
                Math.Abs(during.Left.Left - before.Left.Left) <= Tolerance &&
                Math.Abs(during.Left.Width - before.Left.Width) <= Tolerance &&
                Math.Abs(after.Left.Width - before.Left.Width) <= Tolerance,
                $"{label}: the column on the left moved or resized.");
        }
        if (before.Right is not null)
        {
            E2ETestAssert.True(during.Right is not null && after.Right is not null &&
                Math.Abs(during.Right.Left - during.Owner.Right) <= Tolerance &&
                Math.Abs(after.Right.Left - after.Owner.Right) <= Tolerance &&
                Math.Abs(after.Right.Width - before.Right.Width) <= Tolerance,
                $"{label}: the right neighbour did not shift with the edge, or changed width.");
        }
    }

    private static async Task AssertWidthChangeAsync(
        IPage page, string modulePath, int undoCount, bool changed, string label)
    {
        try { await WaitForUndoCountAsync(page, undoCount); } catch (TimeoutException) { }
        var state = await CaptureWidthStateAsync(page, modulePath);
        E2ETestAssert.Equal(undoCount, state.UndoCount,
            $"{label}: History count is {state.UndoCount}, expected {undoCount}.");
        E2ETestAssert.Equal(changed, state.ColumnLayoutsChanged,
            $"{label}: Width changed = {state.ColumnLayoutsChanged}, expected {changed}.");
        E2ETestAssert.Equal(changed, state.Dirty,
            $"{label}: sheet Dirty = {state.Dirty}, expected {changed}.");
        var status = (await page.Locator("#revogrid-gate5b1-change-status").TextContentAsync())?.Trim();
        E2ETestAssert.True(changed ? status != "Clean" : status == "Clean",
            $"{label}: employee change status shows '{status}'.");
    }

    private static async Task WaitForWidthAsync(IPage page, string prop, int expected)
    {
        var deadline = DateTime.UtcNow.AddSeconds(10);
        var actual = -1;
        while (DateTime.UtcNow < deadline)
        {
            actual = await GetActualWidthAsync(page, prop);
            if (actual == expected) return;
            await page.WaitForTimeoutAsync(100);
        }
        throw new InvalidOperationException($"{prop} width stayed {actual}px, expected {expected}px.");
    }

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
            SELECT TOP (1) [Id], [Width]
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
        return new DbLayout(reader.GetInt32(0), reader.GetInt32(1));
    }

    private static ILocator SaveButton(IPage page) =>
        page.Locator("#revogrid-gate5b11-save");

    private static async Task<DragProbe> DragRightHandleAsync(
        IPage page,
        string prop,
        float delta,
        bool measureRenders = false,
        bool pressEscapeBeforeRelease = false,
        bool scrollIntoView = true)
    {
        var index = await GetVisibleColumnIndexAsync(page, prop);
        E2ETestAssert.True(index >= 0, $"Could not resolve visible column '{prop}'.");
        if (scrollIntoView) await ScrollToColumnAsync(page, index);
        await WaitFramesAsync(page);
        var header = HeaderCell(page, index);
        var handle = header.Locator(".resizable-r").First;
        await handle.WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });
        var before = await CaptureNeighbourhoodAsync(page, index);
        var box = await handle.BoundingBoxAsync();
        E2ETestAssert.True(box is not null, "Right resize handle has no bounding box.");

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
        await page.Mouse.MoveAsync(x + delta, y, new MouseMoveOptions { Steps = 20 });
        await WaitFramesAsync(page);
        var during = await CaptureNeighbourhoodAsync(page, index);
        var handleDuring = await handle.BoundingBoxAsync();
        E2ETestAssert.True(handleDuring is not null, "Resize handle disappeared during drag.");
        var duringRenders = measureRenders
            ? await page.EvaluateAsync<int>("() => Number(window.__erpWidthRenderCount ?? 0)")
            : -1;

        Neighbourhood? afterEscape = null;
        if (pressEscapeBeforeRelease)
        {
            await page.Keyboard.PressAsync("Escape");
            await WaitFramesAsync(page);
            afterEscape = await CaptureNeighbourhoodAsync(page, index);
        }

        await page.Mouse.UpAsync();
        await WaitFramesAsync(page);
        var after = await CaptureNeighbourhoodAsync(page, index);

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

        return new DragProbe(
            before,
            during,
            afterEscape,
            after,
            handleDuring!.X + handleDuring.Width / 2,
            duringRenders);
    }

    private static async Task<Neighbourhood> CaptureNeighbourhoodAsync(IPage page, int index) =>
        new(
            index > 0 ? await TryGetGeometryAsync(page, index - 1) : null,
            await TryGetGeometryAsync(page, index)
                ?? throw new InvalidOperationException($"Column {index} is not rendered."),
            await TryGetGeometryAsync(page, index + 1));

    // Header and body cell must agree; a header-only resize is not a resize.
    private static async Task<RenderedColumnGeometry?> TryGetGeometryAsync(IPage page, int index)
    {
        var header = HeaderCell(page, index);
        var cell = RenderedColumnCell(page, index);
        if (await header.CountAsync() == 0 || await cell.CountAsync() == 0) return null;
        var headerBox = await header.BoundingBoxAsync();
        var cellBox = await cell.BoundingBoxAsync();
        if (headerBox is null || cellBox is null) return null;
        E2ETestAssert.True(Math.Abs(headerBox.X - cellBox.X) <= 2 &&
            Math.Abs(headerBox.Width - cellBox.Width) <= 2,
            $"Rendered header/body mismatch at column {index} (header {headerBox.X:F0}+{headerBox.Width:F0}, body {cellBox.X:F0}+{cellBox.Width:F0}).");
        return new RenderedColumnGeometry(headerBox.X, headerBox.X + headerBox.Width, headerBox.Width);
    }

    private static async Task WaitFramesAsync(IPage page) =>
        await page.EvaluateAsync(
            "() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))))");

    private static async Task<double> GetScrollLeftAsync(IPage page) =>
        await page.EvaluateAsync<double>(
            """
            () => Number(document.querySelector(
                '#revogrid-native-gate5a-grid revo-grid revogr-viewport-scroll.rgCol:not([row-header])')?.scrollLeft ?? -1)
            """);

    private static async Task<int> FindFullyVisibleColumnAsync(IPage page) =>
        await page.EvaluateAsync<int>(
            """
            () => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const scroller = grid.querySelector('revogr-viewport-scroll.rgCol:not([row-header])');
                const view = scroller.getBoundingClientRect();
                const headers = [...scroller.querySelectorAll('revogr-header [data-rgCol]')]
                    .map(h => ({ index: Number(h.getAttribute('data-rgCol')), box: h.getBoundingClientRect() }))
                    .filter(h => h.index > 0 && h.box.left >= view.left + 40 && h.box.right + 120 <= view.right)
                    .sort((a, b) => a.index - b.index);
                return headers.length ? headers[0].index : -1;
            }
            """);

    private static async Task<int[]> CountOverflowingCellsAsync(IPage page, int index) =>
        await page.EvaluateAsync<int[]>(
            """
            index => {
                const cells = [...document.querySelectorAll(
                    `#revogrid-native-gate5a-grid revogr-viewport-scroll.rgCol:not([row-header]) [data-rgRow][data-rgCol="${index}"]`)];
                return [cells.filter(cell => cell.scrollWidth > cell.clientWidth + 1).length, cells.length];
            }
            """,
            index);

    // Lays each value out in a hidden copy of a real body cell (same classes,
    // font and padding) and returns the widest border-box width.
    private static async Task<float> MeasureTextInCellAsync(IPage page, int index, string[] values) =>
        await page.EvaluateAsync<float>(
            """
            args => {
                const cell = document.querySelector(
                    `#revogrid-native-gate5a-grid revogr-viewport-scroll.rgCol:not([row-header]) [data-rgRow][data-rgCol="${args.index}"]`);
                const probe = cell.cloneNode(false);
                probe.removeAttribute('data-rgRow');
                probe.removeAttribute('data-rgCol');
                Object.assign(probe.style, {
                    position: 'absolute', visibility: 'hidden', left: '0', top: '0',
                    width: 'auto', minWidth: '0', maxWidth: 'none', whiteSpace: 'nowrap'
                });
                cell.parentElement.appendChild(probe);
                let widest = 0;
                for (const value of args.values) {
                    probe.textContent = value;
                    widest = Math.max(widest, probe.getBoundingClientRect().width);
                }
                probe.remove();
                return widest;
            }
            """,
            new { index, values });

    private static async Task<string[]> GetLongestValuesAsync(string connectionString, int workYear)
    {
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT TOP (200) [WorkOrderNumber]
            FROM [WorkOrders]
            WHERE [WorkYear] = @WorkYear
            ORDER BY LEN([WorkOrderNumber]) DESC;
            """;
        command.Parameters.AddWithValue("@WorkYear", workYear);
        var values = new List<string>();
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync()) values.Add(reader.GetString(0));
        E2ETestAssert.True(values.Count > 0, "No Work Order Numbers in SQL for the loaded year.");
        return values.ToArray();
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
            root.GetProperty("dirty").GetBoolean(),
            root.TryGetProperty("columnLayoutsChanged", out var changed) && changed.GetBoolean());
    }

    // The live resize lives in revoGridNativeGate5A.js; the (disabled) owner
    // module is still imported, so both tokens must be current.
    private static async Task AssertWidthRuntimeFreshAsync(IPage page, string projectRoot)
    {
        var source = await File.ReadAllTextAsync(Path.Combine(
            projectRoot, "wwwroot", "js", "revoGridGate5B1.js"));
        foreach (var (module, label) in new[]
        {
            ("revoGridColumnWidth", "Column Width module"),
            ("revoGridNativeGate5A", "Native live-resize module")
        })
        {
            var token = ExtractToken(source, module + @"\.js\?v=([^""']+)", label + " token");
            var urls = await page.EvaluateAsync<string[]>(
                """
                name => [...new Set(
                    performance.getEntriesByType('resource')
                        .map(entry => String(entry?.name ?? ''))
                        .filter(url => url.includes('/js/' + name + '.js'))
                )]
                """,
                module);
            E2ETestAssert.True(urls.Any(url => url.Contains($"v={token}", StringComparison.Ordinal)),
                $"Browser did not load the current {label} token {token}. Loaded: {string.Join(", ", urls)}");
        }
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
                return visible.findIndex(column => String(column?.prop ?? '') === prop);
            }
            """,
            prop);

    private static async Task<string> GetVisiblePropAsync(IPage page, int index)
    {
        var prop = await page.EvaluateAsync<string>(
            """
            async index => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const providers = await grid.getProviders();
                const raw = providers.column.getRawColumns();
                const source = Array.isArray(raw?.rgCol) ? raw.rgCol : [];
                const items = providers.column.stores?.rgCol?.store?.get?.('items');
                const visible = items
                    ? Array.from(items).map(item => source[Number(item)]).filter(Boolean)
                    : source;
                return String(visible[index]?.prop ?? '');
            }
            """,
            index);
        E2ETestAssert.True(!string.IsNullOrEmpty(prop), $"No visible column at index {index}.");
        return prop;
    }

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

    private static async Task WaitForAggregatesAsync(IPage page) =>
        await page.WaitForFunctionAsync(
            """
            () => document.querySelector('#revogrid-gate5c1-visible-aggregates')
                ?.dataset?.aggregateReady === 'true'
            """,
            null,
            new PageWaitForFunctionOptions { Timeout = 30_000 });

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

    private static ILocator Grid(IPage page) =>
        page.Locator($"#{GridHostId} revo-grid");

    private static ILocator HeaderCell(IPage page, int column) =>
        page.Locator(
            $"#{GridHostId} revogr-viewport-scroll.rgCol:not([row-header]) revogr-header [data-rgCol=\"{column}\"]").First;

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
        }
        throw new DirectoryNotFoundException("Could not locate ERPPrototype.csproj.");
    }

    private sealed record RenderedColumnGeometry(float Left, float Right, float Width);

    private sealed record Neighbourhood(
        RenderedColumnGeometry? Left,
        RenderedColumnGeometry Owner,
        RenderedColumnGeometry? Right);

    private sealed record DragProbe(
        Neighbourhood Before,
        Neighbourhood During,
        Neighbourhood? AfterEscape,
        Neighbourhood After,
        float DuringDividerX,
        int DuringRenders);

    private sealed record WidthState(int UndoCount, bool Dirty, bool ColumnLayoutsChanged);

    private sealed record DbLayout(int Id, int Width);
}
