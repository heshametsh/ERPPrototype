using System.Globalization;
using Microsoft.Playwright;

namespace ERPPrototype.E2ETests;

internal sealed class WorkOrdersInitializationRecoveryBrowserTest(
    Uri baseUri,
    E2ESeedData seed,
    string artifactDirectory,
    bool headed)
{
    private const string TableId = "tabulator-test-table";
    private const int NormalTimeoutMs = 45_000;

    public async Task RunAsync()
    {
        await using var browserSession =
            await E2EBrowserSession.CreateAsync(
                baseUri,
                artifactDirectory,
                headed);

        var page = browserSession.Page;
        var loginPage = new LoginPage(page, baseUri);
        var workOrdersPage = new WorkOrdersPage(page);
        const string artifactName = "work-orders-initialization-recovery";

        try
        {
            await loginPage.OpenAsync();
            await loginPage.LoginAsync(seed);
            await workOrdersPage.WaitUntilReadyAsync();

            E2ETestAssert.True(
                await IsInitializationAcknowledgedAsync(page),
                "The initially opened Work Orders grid was visible before initialization was positively acknowledged.");

            await InstallTableBuiltFailurePlanAsync(page, failureCount: 1);

            await workOrdersPage.SelectYearAndWaitForDatasetAsync(
                seed.PreviousYear,
                seed.RowsPerYear,
                seed.PreviousYearFirstWorkOrderNumber,
                seed.CurrentYearFirstWorkOrderNumber);

            E2ETestAssert.Equal(
                2,
                await GetInjectedInitializationCallCountAsync(page),
                "A transient table-build failure was not retried exactly once.");

            E2ETestAssert.True(
                await IsInitializationAcknowledgedAsync(page),
                "The automatic retry exposed a grid before table initialization completed successfully.");

            E2ETestAssert.True(
                !await page.GetByTestId("work-orders-retry-initialize").IsVisibleAsync(),
                "A transient failure exposed manual Retry even though the automatic retry succeeded.");

            await InstallTableBuiltFailurePlanAsync(page, failureCount: 2);

            await page.GetByTestId("work-year-selector").SelectOptionAsync(
                seed.CurrentYear.ToString(CultureInfo.InvariantCulture));

            var retryButton = page.GetByTestId("work-orders-retry-initialize");

            await retryButton.WaitForAsync(
                new LocatorWaitForOptions
                {
                    State = WaitForSelectorState.Visible,
                    Timeout = NormalTimeoutMs
                });

            E2ETestAssert.Equal(
                2,
                await GetInjectedInitializationCallCountAsync(page),
                "Initialization did not stop after the bounded two-attempt recovery policy.");

            var failedRuntime = await GetGridRuntimeSnapshotAsync(page);

            E2ETestAssert.True(
                !failedRuntime.HasTable &&
                !failedRuntime.HasState,
                "A failed initialization left a partial Tabulator instance or stale state behind.");

            await retryButton.ClickAsync();
            await workOrdersPage.WaitUntilReadyAsync();
            await workOrdersPage.WaitForActiveRowCountAsync(seed.RowsPerYear);

            E2ETestAssert.Equal(
                seed.CurrentYear.ToString(CultureInfo.InvariantCulture),
                await workOrdersPage.GetSelectedYearAsync(),
                "Manual Retry restored the wrong work year.");

            E2ETestAssert.True(
                await ActiveRowsContainAsync(
                    page,
                    seed.CurrentYearFirstWorkOrderNumber),
                "Manual Retry did not restore the requested work-year dataset.");

            E2ETestAssert.Equal(
                3,
                await GetInjectedInitializationCallCountAsync(page),
                "Manual Retry did not start one fresh initialization attempt after the bounded failures.");

            E2ETestAssert.True(
                await IsInitializationAcknowledgedAsync(page),
                "Manual Retry returned before the recovered grid positively acknowledged initialization.");

            var recoveredRuntime = await GetGridRuntimeSnapshotAsync(page);

            E2ETestAssert.True(
                recoveredRuntime.HasTable &&
                recoveredRuntime.HasState &&
                recoveredRuntime.TableHolders == 1,
                "Manual Retry did not finish with exactly one live grid instance.");
        }
        catch
        {
            await browserSession.CaptureFailureAsync(artifactName);
            throw;
        }
    }

    private static Task InstallTableBuiltFailurePlanAsync(
        IPage page,
        int failureCount)
    {
        return page.EvaluateAsync(
            """
            failureCount => {
                const api = window.tabulatorTest;

                if (!api || typeof api.initializeAggregates !== 'function') {
                    throw new Error(
                        'Work Orders aggregate initialization API is not available.'
                    );
                }

                const previousPlan = window.__workOrdersInitRecoveryTest;
                const originalInitializeAggregates =
                    previousPlan?.originalInitializeAggregates ??
                    api.initializeAggregates;

                window.__workOrdersInitRecoveryTest = {
                    originalInitializeAggregates,
                    calls: 0,
                    remainingFailures: Number(failureCount) || 0
                };

                api.initializeAggregates = function (...args) {
                    const plan = window.__workOrdersInitRecoveryTest;
                    plan.calls += 1;

                    if (plan.remainingFailures > 0) {
                        plan.remainingFailures -= 1;
                        throw new Error(
                            `Injected table-built failure #${plan.calls}`
                        );
                    }

                    return plan.originalInitializeAggregates.apply(
                        this,
                        args
                    );
                };
            }
            """,
            failureCount);
    }

    private static Task<int> GetInjectedInitializationCallCountAsync(
        IPage page)
    {
        return page.EvaluateAsync<int>(
            """
            () => Number(window.__workOrdersInitRecoveryTest?.calls ?? 0)
            """);
    }

    private static Task<bool> IsInitializationAcknowledgedAsync(IPage page)
    {
        return page.EvaluateAsync<bool>(
            """
            tableId => Boolean(
                window.tabulatorTest?.tables?.[tableId] &&
                window.tabulatorTest?.states?.[tableId]
                    ?.initializationReady === true
            )
            """,
            TableId);
    }

    private static Task<GridRuntimeSnapshot> GetGridRuntimeSnapshotAsync(
        IPage page)
    {
        return page.EvaluateAsync<GridRuntimeSnapshot>(
            """
            tableId => ({
                hasTable: Boolean(window.tabulatorTest?.tables?.[tableId]),
                hasState: Boolean(window.tabulatorTest?.states?.[tableId]),
                tableHolders: document.querySelectorAll(
                    `#${tableId} .tabulator-tableholder`
                ).length
            })
            """,
            TableId);
    }

    private static Task<bool> ActiveRowsContainAsync(
        IPage page,
        string workOrderNumber)
    {
        return page.EvaluateAsync<bool>(
            """
            args => {
                const table = window.tabulatorTest?.tables?.[args.tableId];

                return Boolean(
                    table?.getData('active')?.some(
                        row => String(row.workOrderNumber ?? '') ===
                            args.workOrderNumber
                    )
                );
            }
            """,
            new
            {
                tableId = TableId,
                workOrderNumber
            });
    }

    private sealed class GridRuntimeSnapshot
    {
        public bool HasTable { get; set; }
        public bool HasState { get; set; }
        public int TableHolders { get; set; }
    }
}
