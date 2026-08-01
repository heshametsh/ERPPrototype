using System.Globalization;
using Microsoft.Playwright;

namespace ERPPrototype.E2ETests;

internal sealed class WorkOrdersPage(IPage page)
{
    private const string TableId = "tabulator-test-table";

    private ILocator PageRoot => page.GetByTestId("work-orders-page");
    private ILocator Title => page.GetByTestId("work-orders-title");
    private ILocator Scope => page.GetByTestId("work-orders-scope");
    private ILocator YearSelector => page.GetByTestId("work-year-selector");
    private ILocator Grid => page.GetByTestId("work-orders-grid");

    public async Task WaitUntilReadyAsync()
    {
        await PageRoot.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = 45_000
            });

        await Title.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible
            });

        await Scope.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible
            });

        await YearSelector.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible
            });

        await Grid.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible
            });

        await page.WaitForFunctionAsync(
            """
            tableId => {
                const testApi = window.tabulatorTest;
                const host = document.getElementById(tableId);
                const table = testApi?.tables?.[tableId];
                const state = testApi?.states?.[tableId];

                return Boolean(
                host &&
                host.classList.contains('tabulator') &&
                host.querySelector('.tabulator-tableholder') &&
                table &&
                state
            );
            }
            """,
            TableId,
            new PageWaitForFunctionOptions
            {
                Timeout = 45_000
            });
    }

    public async Task<string> GetTitleAsync() =>
        (await Title.InnerTextAsync()).Trim();

    public async Task<string> GetScopeAsync() =>
        (await Scope.InnerTextAsync()).Trim();

    public Task<string> GetSelectedYearAsync() =>
        YearSelector.InputValueAsync();

    public async Task SelectYearAsync(int year)
    {
        var expectedYear = year.ToString(CultureInfo.InvariantCulture);

        await YearSelector.SelectOptionAsync(expectedYear);

        await page.WaitForFunctionAsync(
            """
            expected => {
                const selector = document.querySelector(
                    '[data-testid="work-year-selector"]'
                );

                return Boolean(
                    selector &&
                    selector.value === String(expected) &&
                    !selector.disabled &&
                    window.tabulatorTest?.tables?.['tabulator-test-table']
                );
            }
            """,
            expectedYear,
            new PageWaitForFunctionOptions
            {
                Timeout = 45_000
            });
    }

    public async Task WaitForWorkOrderAsync(string workOrderNumber)
    {
        await page.WaitForFunctionAsync(
            """
            expected => Array.from(
                document.querySelectorAll(
                    '#tabulator-test-table .tabulator-cell[tabulator-field="workOrderNumber"]'
                )
            ).some(cell => (cell.textContent || '').trim() === expected)
            """,
            workOrderNumber,
            new PageWaitForFunctionOptions
            {
                Timeout = 45_000
            });
    }

    public async Task<bool> HasVisibleWorkOrderAsync(
        string workOrderNumber)
    {
        return await page.EvaluateAsync<bool>(
            """
            expected => Array.from(
                document.querySelectorAll(
                    '#tabulator-test-table .tabulator-cell[tabulator-field="workOrderNumber"]'
                )
            ).some(cell => (cell.textContent || '').trim() === expected)
            """,
            workOrderNumber);
    }
}
