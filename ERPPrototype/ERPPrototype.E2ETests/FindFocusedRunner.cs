using System.Text.Json;
using Microsoft.Playwright;
using static ERPPrototype.E2ETests.RevoCanonicalTestSurface;

namespace ERPPrototype.E2ETests;

/*
 * Work Order Find modification gate (frozen Expected, user 2026-10-06).
 *
 * Oracle: real keyboard/mouse input, then the RENDERED active cell: the
 * visible Revo focus box, the data cell under it, that cell's column header
 * text (bound to prop through the column name) and its on-screen geometry
 * inside the scroll viewport. Diagnostics are used only for setup checks.
 */
internal static class FindFocusedRunner
{
    private const string FindInput = "gate5a-find-input";
    private const string FindStatus = "gate5a-find-status";
    private const string FindAction = "gate5a-find-action";
    private const string DirtyYearRefusal = "احفظ أو ارجع التعديلات أولًا قبل تغيير السنة.";

    public static async Task<int> SeedManualDatabaseAsync()
    {
        await using var database = await E2ETestDatabase.CreateAsync(
            keepDatabase: true,
            rowsPerYear: E2ETestDatabase.DefaultRowsPerYear,
            findScenario: true);

        var find = database.Seed.Find!;
        Console.WriteLine("Find manual database ready (kept).");
        Console.WriteLine($"ConnectionString: {database.ConnectionString}");
        Console.WriteLine($"Years: {database.Seed.CurrentYear}, {database.Seed.PreviousYear}, {find.OldestYear}");
        Console.WriteLine($"Login user: {database.Seed.UserName}");
        return 0;
    }

    public static async Task<int> RunAsync()
    {
        var projectRoot = FindProjectRoot();
        var artifacts = E2EArtifactManager.CreateRunDirectory(projectRoot);
        Console.WriteLine("Work Order Find modification gate");
        Console.WriteLine($"Artifacts: {artifacts}");

        try
        {
            await using var database = await E2ETestDatabase.CreateAsync(
                keepDatabase: false,
                rowsPerYear: E2ETestDatabase.DefaultRowsPerYear,
                findScenario: true);
            await using var application = await WebApplicationProcess.StartAsync(
                projectRoot,
                database.ConnectionString,
                artifacts,
                configuration: "Debug");
            await using var browser = await E2EBrowserSession.CreateAsync(
                application.BaseUri,
                artifacts,
                headed: false,
                traceEnabled: true,
                benchmarkMode: false,
                viewportWidth: 1440,
                viewportHeight: 900,
                windowWidth: 1500,
                windowHeight: 950,
                screenWidth: 1920,
                screenHeight: 1080);

            var page = browser.Page;
            var seed = database.Seed;
            var find = seed.Find!;

            var login = new LoginPage(page, application.BaseUri);
            await login.OpenAsync(GatePath);
            await login.LoginAsync(seed);
            await page.WaitForURLAsync($"**{GatePath}*", new() { Timeout = 45_000 });
            await WaitForYearAsync(page, seed.CurrentYear);

            await AssertOracleSelfCheckAsync(page);
            Pass("O00-oracle-real-click", "rendered active cell oracle reads a real mouse click.");

            // ---- Control presence (the RED boundary on the current Product) ----
            var input = page.GetByTestId(FindInput);
            await input.WaitForAsync(new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = 10_000
            });
            Pass("F00-control", "Find box is visible on the canonical sheet.");

            // ---- Typing alone does not move the sheet ----
            // Baseline after the click: Revo's own outside-click focus clearing
            // is pre-existing and not part of the typing contract.
            await input.ClickAsync();
            await page.WaitForTimeoutAsync(200);
            var beforeTyping = await ReadViewportAsync(page);
            await input.PressSequentiallyAsync(find.DuplicateTypesNumber, new() { Delay = 40 });
            await page.WaitForTimeoutAsync(500);
            var afterTyping = await ReadViewportAsync(page);
            E2ETestAssert.Equal(beforeTyping, afterTyping,
                "Typing without Enter moved the sheet or the active cell.");
            Pass("F01-no-jump-while-typing", "typing alone kept scroll and active cell.");

            // ---- 9 digits, same number with two Work Types, Enter cycles and wraps ----
            await input.PressAsync("Enter");
            var first = await WaitForActiveAsync(page, find.DuplicateTypesNumber);
            await WaitForStatusAsync(page, "1 من 2");
            await input.PressAsync("Enter");
            var second = await WaitForActiveAsync(page, find.DuplicateTypesNumber);
            await WaitForStatusAsync(page, "2 من 2");
            E2ETestAssert.True(first.WorkType != second.WorkType,
                $"Enter did not move to the other Work Type ({first.WorkType} -> {second.WorkType}).");
            E2ETestAssert.True(
                new[] { first.WorkType, second.WorkType }.OrderBy(value => value).SequenceEqual(["401", "402"]),
                $"Exact search visited Work Types {first.WorkType}/{second.WorkType} instead of 401/402.");
            await input.PressAsync("Enter");
            var wrapped = await WaitForActiveAsync(page, find.DuplicateTypesNumber);
            await WaitForStatusAsync(page, "1 من 2");
            E2ETestAssert.Equal(first.WorkType, wrapped.WorkType, "Enter after the last match did not wrap to the first.");
            Pass("F02-exact-types-cycle", "9-digit search cycles 1 من 2 -> 2 من 2 -> wraps, on the Work Order Number cell.");

            // ---- Fewer than 9 digits: starts-with, open year + own department only ----
            await SearchAsync(page, find.PrefixQuery);
            var visited = new List<string>();
            for (var index = 1; index <= find.PrefixOpenYearMatches.Count; index++)
            {
                if (index > 1)
                {
                    await input.PressAsync("Enter");
                }

                await WaitForStatusAsync(page, $"{index} من {find.PrefixOpenYearMatches.Count}");
                var active = await WaitForActiveWhereAsync(page,
                    value => value.StartsWith(find.PrefixQuery, StringComparison.Ordinal) && !visited.Contains(value));
                visited.Add(active.Number);
            }

            E2ETestAssert.Equal(
                string.Join(",", find.PrefixOpenYearMatches.OrderBy(value => value)),
                string.Join(",", visited.OrderBy(value => value)),
                "Prefix search did not visit exactly the open-year own-department matches.");
            Pass("F03-prefix-open-year", $"'{find.PrefixQuery}' visited the 5 open-year matches only (excluded other year / other department).");

            // ---- Completed basket rows are searchable ----
            await SearchAsync(page, find.CompletedBasketNumber);
            await WaitForActiveAsync(page, find.CompletedBasketNumber);
            await WaitForStatusAsync(page, "1 من 1");
            Pass("F04-completed-basket", "a completed-basket Work Order is found.");

            // ---- Not found: unknown and other-department numbers ----
            foreach (var hidden in new[] { find.NotFoundNumber, find.OtherDepartmentNumber })
            {
                await ClickFindAsync(page);
                var before = await ReadViewportAsync(page);
                await SearchAsync(page, hidden);
                await WaitForStatusAsync(page, "غير موجود");
                E2ETestAssert.True(!await page.GetByTestId(FindAction).IsVisibleAsync(),
                    $"'{hidden}' offered an action although nothing may be revealed.");
                E2ETestAssert.Equal(before, await ReadViewportAsync(page),
                    $"Not-found search '{hidden}' moved the sheet.");
            }
            Pass("F05-not-found", "unknown and other-department numbers report غير موجود and move nothing.");

            // ---- Found in the open year AND reported in another year ----
            await SearchAsync(page, find.CurrentAndPreviousNumber);
            await WaitForActiveAsync(page, find.CurrentAndPreviousNumber);
            await WaitForStatusAsync(page, "1 من 1");
            await WaitForStatusAsync(page, seed.PreviousYear.ToString());
            Pass("F06-also-other-year", "open-year match is selected and the other year is reported.");

            // ---- Match hidden by the active Filter: never targeted silently ----
            await ApplySingleWorkTypeFilterAsync(page, "401");
            var undoBefore = await ReadUndoCountAsync(page);
            await ClickFindAsync(page);
            var beforeHidden = await ReadViewportAsync(page);
            await SearchAsync(page, find.FilterHiddenNumber);
            await WaitForStatusAsync(page, "الفلتر");
            E2ETestAssert.Equal(beforeHidden, await ReadViewportAsync(page),
                "A filter-hidden match moved the sheet before the employee chose to clear the Filter.");
            var clearFilter = page.GetByTestId(FindAction);
            await clearFilter.WaitForAsync(new LocatorWaitForOptions { State = WaitForSelectorState.Visible, Timeout = 10_000 });
            await clearFilter.ClickAsync();
            var revealed = await WaitForActiveAsync(page, find.FilterHiddenNumber);
            E2ETestAssert.Equal(find.FilterHiddenWorkTypeCode, revealed.WorkType, "Clear-filter jump landed on the wrong Work Type.");
            await WaitForAllRowsVisibleAsync(page);
            E2ETestAssert.Equal(undoBefore + 1, await ReadUndoCountAsync(page),
                "Clearing the Filter from Find was not exactly one Sheet History step.");
            Pass("F07-filter-hidden", "filter-hidden match: message + clear-filter button; one History step; lands on the cell.");

            // ---- Dirty sheet: unsaved value is searchable; other-year jump is refused ----
            var editedNumber = "938888888";
            var numberColumn = await ColumnIndexAsync(page, "workOrderNumber");
            await page.EvaluateAsync(
                "async () => await document.querySelector('#revogrid-native-gate5a-grid revo-grid').scrollToRow(0)");
            await EditCellAsync(page, 0, numberColumn, editedNumber);
            await WaitForDirtyAsync(page, true);
            await SearchAsync(page, editedNumber);
            await WaitForActiveAsync(page, editedNumber);
            await SearchAsync(page, find.PreviousYearOnlyNumber);
            await WaitForStatusAsync(page, seed.PreviousYear.ToString());
            await page.GetByTestId(FindAction).ClickAsync();
            await page.GetByText(DirtyYearRefusal).First.WaitForAsync(
                new LocatorWaitForOptions { State = WaitForSelectorState.Visible, Timeout = 10_000 });
            await WaitForYearAsync(page, seed.CurrentYear);
            await WaitForDirtyAsync(page, true);
            Pass("F08-dirty-refusal", "unsaved value is found; other-year jump refused while Dirty, nothing lost.");

            await DataCell(page, 0, numberColumn).ClickAsync();
            await page.Keyboard.PressAsync("Control+z");
            await WaitForDirtyAsync(page, false);

            // ---- Other year only: message + open-year button, lands on the cell ----
            await SearchAsync(page, find.PreviousYearOnlyNumber);
            await WaitForStatusAsync(page, seed.PreviousYear.ToString());
            await page.GetByTestId(FindAction).ClickAsync();
            await WaitForYearAsync(page, seed.PreviousYear);
            await WaitForActiveAsync(page, find.PreviousYearOnlyNumber);
            Pass("F09-open-previous-year", $"opened {seed.PreviousYear} and landed on the Work Order Number cell.");

            await SearchAsync(page, find.OldestYearOnlyNumber);
            await WaitForStatusAsync(page, find.OldestYear.ToString());
            await page.GetByTestId(FindAction).ClickAsync();
            await WaitForYearAsync(page, find.OldestYear);
            await WaitForActiveAsync(page, find.OldestYearOnlyNumber);
            Pass("F10-open-oldest-year", $"opened {find.OldestYear} and landed on the Work Order Number cell.");

            // ---- Security: other-department number in another year stays invisible ----
            await SearchAsync(page, find.OtherDepartmentPreviousYearNumber);
            await WaitForStatusAsync(page, "غير موجود");
            E2ETestAssert.True(!await page.GetByTestId(FindAction).IsVisibleAsync(),
                "An other-department Work Order in another year was revealed.");
            Pass("F11-other-department-other-year", "cross-year lookup does not reveal another department.");

            Console.WriteLine("WORK ORDER FIND GATE: PASS");
            return 0;
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine("WORK ORDER FIND GATE: RED");
            Console.Error.WriteLine(exception);
            return 1;
        }
    }

    private static void Pass(string id, string text) =>
        Console.WriteLine($"[{id}] PASS - {text}");

    private sealed record ActiveCell(string Number, string WorkType);

    private static async Task ClickFindAsync(IPage page)
    {
        await page.GetByTestId(FindInput).ClickAsync();
        await page.WaitForTimeoutAsync(200);
    }

    private static async Task SearchAsync(IPage page, string query)
    {
        var input = page.GetByTestId(FindInput);
        await input.ClickAsync();
        await input.FillAsync(string.Empty);
        await input.PressSequentiallyAsync(query, new() { Delay = 20 });
        await input.PressAsync("Enter");
    }

    private static async Task WaitForStatusAsync(IPage page, string text) =>
        await page.GetByTestId(FindStatus)
            .Filter(new LocatorFilterOptions { HasTextString = text })
            .WaitForAsync(new LocatorWaitForOptions { State = WaitForSelectorState.Visible, Timeout = 30_000 });

    private static async Task<ActiveCell> WaitForActiveAsync(IPage page, string number) =>
        await WaitForActiveWhereAsync(page, value => value == number);

    private static async Task<ActiveCell> WaitForActiveWhereAsync(IPage page, Func<string, bool> accept)
    {
        var deadline = DateTime.UtcNow.AddSeconds(30);
        JsonElement last = default;
        while (DateTime.UtcNow < deadline)
        {
            last = await ReadRenderedActiveAsync(page);
            if (last.GetProperty("ok").GetBoolean())
            {
                var number = last.GetProperty("number").GetString() ?? string.Empty;
                if (accept(number))
                {
                    return new ActiveCell(number, last.GetProperty("workType").GetString() ?? string.Empty);
                }
            }

            await page.WaitForTimeoutAsync(100);
        }

        throw new InvalidOperationException(
            $"Rendered active cell did not reach the expected Work Order. Last oracle read: {last.GetRawText()}");
    }

    // Independent rendered oracle: visible focus box -> data cell under it ->
    // its header text must be the Work Order Number column name -> cell must be
    // fully inside the scroll viewport. Work Type is read from the same rendered row.
    private static async Task<JsonElement> ReadRenderedActiveAsync(IPage page) =>
        await page.EvaluateAsync<JsonElement>(
            """
            async () => {
                const host = document.getElementById('revogrid-native-gate5a-grid');
                const grid = host?.querySelector('revo-grid');
                if (!grid) return { ok: false, reason: 'no grid' };
                const columns = await grid.getColumns();
                const nameOf = prop => String(columns.find(c => c?.prop === prop)?.name ?? '');
                const numberName = nameOf('workOrderNumber');
                const typeName = nameOf('workTypeCode');
                const focus = [...host.querySelectorAll('revogr-focus.focused-cell')]
                    .map(el => el.getBoundingClientRect())
                    .find(r => r.width > 2 && r.height > 2);
                if (!focus) return { ok: false, reason: 'no rendered focus box' };
                const cx = focus.left + focus.width / 2;
                const cy = focus.top + focus.height / 2;
                const cell = document.elementsFromPoint(cx, cy)
                    .find(el => el.matches?.('[data-rgRow][data-rgCol]') && !el.closest('revogr-header') && !el.closest('[row-header]'));
                if (!cell) return {
                    ok: false,
                    reason: 'no data cell under focus box',
                    focusBoxes: [...host.querySelectorAll('revogr-focus.focused-cell')]
                        .map(el => `${el.tagName}.${el.className}@${JSON.stringify(el.getBoundingClientRect())}`),
                    underPoint: document.elementsFromPoint(cx, cy).slice(0, 8)
                        .map(el => `${el.tagName}.${String(el.className)}[${[...el.attributes].map(a => a.name).join(',')}]`)
                };
                const viewport = cell.closest('revogr-viewport-scroll');
                const headerText = col => (viewport?.querySelector(`revogr-header [data-rgCol="${col}"]`)?.textContent ?? '').trim();
                const header = headerText(cell.dataset.rgcol);
                if (!numberName || !header.includes(numberName))
                    return { ok: false, reason: `focus is on column '${header}', not '${numberName}'` };
                const box = cell.getBoundingClientRect();
                const vp = viewport.getBoundingClientRect();
                if (box.top < vp.top - 1 || box.bottom > vp.bottom + 1 || box.left < vp.left - 1 || box.right > vp.right + 1)
                    return { ok: false, reason: 'active cell is not fully inside the viewport' };
                const rowCells = [...viewport.querySelectorAll(`[data-rgRow="${cell.dataset.rgrow}"][data-rgCol]`)]
                    .filter(el => !el.closest('revogr-header'));
                const typeCell = rowCells.find(el => headerText(el.dataset.rgcol).includes(typeName));
                return {
                    ok: true,
                    number: (cell.textContent ?? '').trim(),
                    workType: (typeCell?.textContent ?? '').trim()
                };
            }
            """);

    private static async Task AssertOracleSelfCheckAsync(IPage page)
    {
        var numberColumn = await ColumnIndexAsync(page, "workOrderNumber");
        var cell = DataCell(page, 2, numberColumn).First;
        await cell.WaitForAsync(new LocatorWaitForOptions { State = WaitForSelectorState.Visible, Timeout = 30_000 });
        var expected = (await cell.TextContentAsync() ?? string.Empty).Trim();
        await cell.ClickAsync();
        await WaitForActiveAsync(page, expected);
    }

    private static async Task<string> ReadViewportAsync(IPage page) =>
        (await page.EvaluateAsync<JsonElement>(
            """
            () => {
                const host = document.getElementById('revogrid-native-gate5a-grid');
                const scrolls = [...host.querySelectorAll('revogr-scroll-virtual, .rgCol .inner-content-table, revogr-viewport-scroll')]
                    .map(el => `${Math.round(el.scrollTop)}:${Math.round(el.scrollLeft)}`);
                const focus = [...host.querySelectorAll('revogr-focus.focused-cell')]
                    .map(el => el.getBoundingClientRect())
                    .find(r => r.width > 2 && r.height > 2);
                return { scrolls: scrolls.join('|'), focus: focus ? `${Math.round(focus.left)},${Math.round(focus.top)}` : 'none' };
            }
            """)).GetRawText();

    internal static async Task<int> ColumnIndexAsync(IPage page, string prop) =>
        await page.EvaluateAsync<int>(
            """
            async prop => {
                const columns = await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getColumns();
                return columns.filter(c => !c.pin).findIndex(c => c?.prop === prop);
            }
            """,
            prop);

    private static async Task<JsonElement> DiagnosticsAsync(IPage page) =>
        await page.EvaluateAsync<JsonElement>(
            """
            async () => {
                const moduleUrl = performance.getEntriesByType('resource')
                    .map(entry => String(entry?.name ?? ''))
                    .filter(name => name.includes('/js/revoGridGate5B1.js?'))
                    .at(-1);
                const gate = await import(moduleUrl);
                const d = await gate.getDiagnostics('revogrid-native-gate5a-grid');
                return {
                    dirty: Boolean(d?.changeEngine?.dirty),
                    undoCount: Number(d?.changeEngine?.undoCount ?? 0)
                };
            }
            """);

    private static async Task<int> ReadUndoCountAsync(IPage page) =>
        (await DiagnosticsAsync(page)).GetProperty("undoCount").GetInt32();

    private static async Task WaitForDirtyAsync(IPage page, bool expected)
    {
        var deadline = DateTime.UtcNow.AddSeconds(15);
        while (DateTime.UtcNow < deadline)
        {
            if ((await DiagnosticsAsync(page)).GetProperty("dirty").GetBoolean() == expected)
            {
                return;
            }

            await page.WaitForTimeoutAsync(100);
        }

        throw new InvalidOperationException($"Sheet Dirty did not become {expected}.");
    }

    private static async Task WaitForAllRowsVisibleAsync(IPage page) =>
        await page.WaitForFunctionAsync(
            """
            async () => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                return (await grid.getVisibleSource('rgRow')).length === (await grid.getSource('rgRow')).length;
            }
            """,
            null,
            new PageWaitForFunctionOptions { Timeout = 15_000 });

    internal static async Task EditCellAsync(IPage page, int row, int column, string value)
    {
        var cell = DataCell(page, row, column).First;
        await cell.WaitForAsync(new LocatorWaitForOptions { State = WaitForSelectorState.Visible, Timeout = 30_000 });
        await cell.DblClickAsync();
        var editor = page.Locator($"#{GridHostId} input").Last;
        await editor.WaitForAsync(new LocatorWaitForOptions { State = WaitForSelectorState.Visible, Timeout = 10_000 });
        await editor.FillAsync(value);
        await editor.PressAsync("Enter");
        await page.WaitForTimeoutAsync(120);
    }

    internal static async Task ApplySingleWorkTypeFilterAsync(IPage page, string value)
    {
        await page.Locator(".erp-revo-excel-filter-button[data-erp-filter-prop=\"workTypeCode\"]").ClickAsync();
        var popup = page.Locator(".erp-revo-excel-filter");
        await popup.WaitForAsync(new LocatorWaitForOptions { State = WaitForSelectorState.Visible, Timeout = 10_000 });
        var selectAll = popup.Locator(".erp-revo-excel-filter__select-all input[type=\"checkbox\"]");
        if (await selectAll.IsCheckedAsync())
        {
            await selectAll.ClickAsync();
        }
        await popup.Locator($".erp-revo-excel-filter__body label:has-text(\"{value}\") input[type=\"checkbox\"]").First.ClickAsync();
        await popup.Locator(".erp-revo-excel-filter__actions button[data-primary=\"true\"]").ClickAsync();
        await popup.WaitForAsync(new LocatorWaitForOptions { State = WaitForSelectorState.Detached, Timeout = 10_000 });
    }

    internal static async Task WaitForYearAsync(IPage page, int year)
    {
        await page.WaitForFunctionAsync(
            """
            expected => {
                const selector = document.querySelector('[data-testid="gate5a-year-selector"]');
                const loading = document.querySelector('.native-gate5a__loading');
                const status = document.querySelector('.native-gate5a__statusbar')?.textContent ?? '';
                return selector?.value === String(expected) &&
                    selector.disabled === false &&
                    !loading &&
                    status.includes(`Dataset ${expected}`);
            }
            """,
            year,
            new PageWaitForFunctionOptions { Timeout = 30_000 });
        // Any rendered data row: Find may already have scrolled to its target.
        await page.Locator($"#{GridHostId} revogr-viewport-scroll.rgCol:not([row-header]) [data-rgRow][data-rgCol]").First.WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 30_000
        });
    }
}
