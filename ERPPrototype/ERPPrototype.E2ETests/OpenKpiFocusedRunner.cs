using System.Globalization;
using Microsoft.Data.SqlClient;
using Microsoft.Playwright;
using static ERPPrototype.E2ETests.RevoCanonicalTestSurface;

namespace ERPPrototype.E2ETests;

/*
 * Open Work Orders KPI modification gate (frozen Expected, user 2026-10-06).
 *
 * Oracle: rendered card values (full value on the card) against SQL for the
 * employee's department and Work Year, and independent arithmetic for live
 * unsaved edits. The KPI owner's internal state is never read.
 */
internal static class OpenKpiFocusedRunner
{
    private const string CompletedBasket = "انتهاء امر العمل";
    private const string UndoButton = "#revogrid-gate5b1-undo";

    private sealed record Totals(int Count, decimal Value, decimal Partial)
    {
        public decimal Remaining => Value - Partial;

        public override string ToString() =>
            $"count={Count} value={Value} partial={Partial} remaining={Remaining}";
    }

    public static async Task<int> RunAsync()
    {
        var projectRoot = FindProjectRoot();
        var artifacts = E2EArtifactManager.CreateRunDirectory(projectRoot);
        Console.WriteLine("Open Work Orders KPI modification gate");
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
            var sql = database.ConnectionString;

            var login = new LoginPage(page, application.BaseUri);
            await login.OpenAsync(GatePath);
            await login.LoginAsync(seed);
            await page.WaitForURLAsync($"**{GatePath}*", new() { Timeout = 45_000 });
            await FindFocusedRunner.WaitForYearAsync(page, seed.CurrentYear);

            // ---- K01: whole open year from SQL (completed + other department excluded) ----
            var baseline = await SqlOpenTotalsAsync(sql, seed.UserName, seed.CurrentYear);
            await WaitForCardsAsync(page, baseline, "K01 initial open year");
            Pass("K01-open-year", $"cards equal SQL open totals for {seed.CurrentYear} ({baseline}).");

            // ---- K02: Filter does not change the cards; filtered line only while filtering ----
            E2ETestAssert.True(!await VisibleFilterLineShownAsync(page),
                "The filtered totals line is shown without an active Filter.");
            await FindFocusedRunner.ApplySingleWorkTypeFilterAsync(page, "401");
            var filteredCount = await SqlYearTypeCountAsync(sql, seed.UserName, seed.CurrentYear, "401");
            await WaitForVisibleFilterLineAsync(page, filteredCount);
            await WaitForCardsAsync(page, baseline, "K02 cards under Filter");
            await page.Locator(UndoButton).ClickAsync();
            await page.WaitForFunctionAsync(
                "async () => { const g = document.querySelector('#revogrid-native-gate5a-grid revo-grid'); return (await g.getVisibleSource('rgRow')).length === (await g.getSource('rgRow')).length; }",
                null,
                new PageWaitForFunctionOptions { Timeout = 15_000 });
            await WaitForFilterLineHiddenAsync(page);
            Pass("K02-filter-independent", $"Filter 401 kept the cards; filtered line showed {filteredCount} rows and hid after Undo.");

            // ---- K03: live unsaved money edit ----
            var first = await SqlFirstOpenRowAsync(sql, seed.UserName, seed.CurrentYear);
            var valueColumn = await FindFocusedRunner.ColumnIndexAsync(page, "workOrderValue");
            await page.EvaluateAsync(
                "async () => await document.querySelector('#revogrid-native-gate5a-grid revo-grid').scrollToRow(0)");
            await FindFocusedRunner.EditCellAsync(page, 0, valueColumn,
                (first.Value + 1000m).ToString("0.##", CultureInfo.InvariantCulture));
            await WaitForCardsAsync(page, baseline with { Value = baseline.Value + 1000m }, "K03 value +1000");
            await page.Locator(UndoButton).ClickAsync();
            await WaitForCardsAsync(page, baseline, "K03 undo");
            Pass("K03-live-money-edit", "unsaved value edit moved Value/Remaining by 1000 immediately; Undo restored.");

            // ---- K04: basket to completed removes the row; Undo returns it ----
            var basketColumn = await FindFocusedRunner.ColumnIndexAsync(page, "basket");
            await FindFocusedRunner.EditCellAsync(page, 0, basketColumn, CompletedBasket);
            await WaitForCardsAsync(page,
                new Totals(baseline.Count - 1, baseline.Value - first.Value, baseline.Partial - first.Partial),
                "K04 basket completed");
            await page.Locator(UndoButton).ClickAsync();
            await WaitForCardsAsync(page, baseline, "K04 undo");
            Pass("K04-basket-completed", $"moving row 1 to '{CompletedBasket}' removed it from the cards; Undo returned it.");

            // ---- K05: blank new row is not counted; filling it counts ----
            await DataCell(page, 0, 0).First.ClickAsync(new LocatorClickOptions { Button = MouseButton.Right });
            await page.Locator(".erp-revo-structure-menu:not([hidden])")
                .Locator("button:has-text(\"Insert Rows...\")").ClickAsync();
            var insertDialog = VisibleDialog(page, "Insert Rows");
            await insertDialog.Locator("input[type=\"number\"]").FillAsync("1");
            await insertDialog.Locator("button:has-text(\"Insert Below\")").ClickAsync();
            await page.WaitForTimeoutAsync(400);
            await WaitForCardsAsync(page, baseline, "K05 blank new row");
            await FindFocusedRunner.EditCellAsync(page, 1, valueColumn, "1000");
            await WaitForCardsAsync(page,
                new Totals(baseline.Count + 1, baseline.Value + 1000m, baseline.Partial),
                "K05 filled new row");
            await page.Locator(UndoButton).ClickAsync();
            await page.Locator(UndoButton).ClickAsync();
            await WaitForCardsAsync(page, baseline, "K05 undo");
            Pass("K05-new-row", "blank inserted row not counted; typing a value counted it; Undo restored.");

            // ---- K06: year switch recomputes for each year ----
            foreach (var year in new[] { seed.PreviousYear, find.OldestYear })
            {
                await page.GetByTestId("gate5a-year-selector").SelectOptionAsync(year.ToString(CultureInfo.InvariantCulture));
                await FindFocusedRunner.WaitForYearAsync(page, year);
                var expected = await SqlOpenTotalsAsync(sql, seed.UserName, year);
                await WaitForCardsAsync(page, expected, $"K06 year {year}");
                Pass($"K06-year-{year}", $"cards equal SQL open totals for {year} ({expected}).");
            }

            Console.WriteLine("OPEN WORK ORDERS KPI GATE: PASS");
            return 0;
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine("OPEN WORK ORDERS KPI GATE: RED");
            Console.Error.WriteLine(exception);
            return 1;
        }
    }

    private static void Pass(string id, string text) =>
        Console.WriteLine($"[{id}] PASS - {text}");

    private static async Task WaitForCardsAsync(IPage page, Totals expected, string step)
    {
        var deadline = DateTime.UtcNow.AddSeconds(20);
        string last = "cards not rendered";
        while (DateTime.UtcNow < deadline)
        {
            var rendered = await ReadCardsAsync(page);
            if (rendered is not null)
            {
                last = rendered.ToString();
                if (rendered == expected)
                {
                    return;
                }
            }

            await page.WaitForTimeoutAsync(150);
        }

        throw new InvalidOperationException(
            $"{step}: rendered cards did not reach the expected totals. Expected {expected}; last rendered {last}.");
    }

    // Rendered card text: the card's full value (title) and the visible text
    // must agree (visible text is either the full value or its compact form).
    private static async Task<Totals?> ReadCardsAsync(IPage page)
    {
        var values = await page.EvaluateAsync<string[]?>(
            """
            () => {
                const ids = ['count', 'workOrderValue', 'partialAmount', 'remainingAmount'];
                const out = [];
                for (const id of ids) {
                    const strong = document.querySelector(`[data-testid="open-kpi-${id}"] strong`);
                    if (!strong || strong.offsetParent === null) return null;
                    const full = (strong.getAttribute('title') || '').trim();
                    const shown = (strong.textContent || '').trim();
                    if (!full || !(shown === full || /^-?[0-9.]+[MB]$/.test(shown))) return null;
                    out.push(full);
                }
                return out;
            }
            """);

        if (values is null)
        {
            return null;
        }

        static decimal Parse(string text) =>
            decimal.Parse(text.Replace(",", string.Empty), NumberStyles.Number, CultureInfo.InvariantCulture);

        var remaining = Parse(values[3]);
        var totals = new Totals((int)Parse(values[0]), Parse(values[1]), Parse(values[2]));
        return totals.Remaining == remaining ? totals : totals with { Partial = decimal.MinValue };
    }

    private static async Task<bool> VisibleFilterLineShownAsync(IPage page) =>
        await page.GetByTestId("gate5c1-visible-aggregates").IsVisibleAsync();

    private static async Task WaitForVisibleFilterLineAsync(IPage page, int expectedRows) =>
        await page.WaitForFunctionAsync(
            """
            expected => {
                const host = document.querySelector('[data-testid="gate5c1-visible-aggregates"]');
                return !!host && host.offsetParent !== null &&
                    Number(host.dataset.visibleRowCount ?? NaN) === expected;
            }
            """,
            expectedRows,
            new PageWaitForFunctionOptions { Timeout = 15_000 });

    private static async Task WaitForFilterLineHiddenAsync(IPage page) =>
        await page.WaitForFunctionAsync(
            "() => { const h = document.querySelector('[data-testid=\"gate5c1-visible-aggregates\"]'); return !h || h.offsetParent === null; }",
            null,
            new PageWaitForFunctionOptions { Timeout = 15_000 });

    private const string DepartmentScope =
        "[DepartmentId] = (SELECT [DepartmentId] FROM [AspNetUsers] WHERE [UserName] = @User)";

    private static async Task<Totals> SqlOpenTotalsAsync(string connectionString, string userName, int year)
    {
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText =
            "SELECT COUNT(*), ISNULL(SUM([WorkOrderValue]), 0), ISNULL(SUM(ISNULL([PartialAmount], 0)), 0) " +
            $"FROM [WorkOrders] WHERE {DepartmentScope} AND [WorkYear] = @Year AND [Busket] <> @Completed;";
        command.Parameters.AddWithValue("@User", userName);
        command.Parameters.AddWithValue("@Year", year);
        command.Parameters.AddWithValue("@Completed", CompletedBasket);
        await using var reader = await command.ExecuteReaderAsync();
        await reader.ReadAsync();
        return new Totals(reader.GetInt32(0), reader.GetDecimal(1), reader.GetDecimal(2));
    }

    private static async Task<Totals> SqlFirstOpenRowAsync(string connectionString, string userName, int year)
    {
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText =
            "SELECT TOP 1 [WorkOrderValue], ISNULL([PartialAmount], 0), [Busket] " +
            $"FROM [WorkOrders] WHERE {DepartmentScope} AND [WorkYear] = @Year ORDER BY [DisplayOrder], [Id];";
        command.Parameters.AddWithValue("@User", userName);
        command.Parameters.AddWithValue("@Year", year);
        await using var reader = await command.ExecuteReaderAsync();
        await reader.ReadAsync();
        E2ETestAssert.True(reader.GetString(2) != CompletedBasket, "Fixture: first sheet row must be open.");
        return new Totals(1, reader.GetDecimal(0), reader.GetDecimal(1));
    }

    private static async Task<int> SqlYearTypeCountAsync(string connectionString, string userName, int year, string workType)
    {
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText =
            $"SELECT COUNT(*) FROM [WorkOrders] WHERE {DepartmentScope} AND [WorkYear] = @Year AND [WorkTypeCode] = @Type;";
        command.Parameters.AddWithValue("@User", userName);
        command.Parameters.AddWithValue("@Year", year);
        command.Parameters.AddWithValue("@Type", workType);
        return Convert.ToInt32(await command.ExecuteScalarAsync(), CultureInfo.InvariantCulture);
    }
}
