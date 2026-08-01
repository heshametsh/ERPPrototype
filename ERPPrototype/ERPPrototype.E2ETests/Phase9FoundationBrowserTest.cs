using System.Globalization;

namespace ERPPrototype.E2ETests;

internal sealed class Phase9FoundationBrowserTest(
    Uri baseUri,
    E2ESeedData seed,
    string artifactDirectory,
    bool headed,
    E2ETestSuite suite)
{
    public int ExpectedCheckCount =>
        suite == E2ETestSuite.Smoke ? 5 : 9;

    public async Task<int> RunAsync()
    {
        await using var browserSession =
            await E2EBrowserSession.CreateAsync(
                baseUri,
                artifactDirectory,
                headed);

        var checks = new BrowserCheckRecorder();
        var loginPage = new LoginPage(browserSession.Page, baseUri);
        var workOrdersPage = new WorkOrdersPage(browserSession.Page);
        var artifactName =
            $"phase9-foundation-{suite.ToString().ToLowerInvariant()}";

        try
        {
            await loginPage.OpenAsync();
            checks.Pass("Login form is rendered through stable test hooks");

            await loginPage.LoginAsync(seed);
            await workOrdersPage.WaitUntilReadyAsync();

            E2ETestAssert.Equal(
                "Work Orders",
                await workOrdersPage.GetTitleAsync(),
                "The employee did not reach the Work Orders page.");

            checks.Pass("Login reaches the employee Work Orders sheet");

            var scopeText = await workOrdersPage.GetScopeAsync();

            E2ETestAssert.Contains(
                seed.BranchName,
                scopeText,
                "The employee branch was not shown on the sheet.");

            E2ETestAssert.Contains(
                seed.DepartmentName,
                scopeText,
                "The employee department was not shown on the sheet.");

            checks.Pass("Employee branch and department scope are visible");

            E2ETestAssert.Equal(
                seed.CurrentYear.ToString(CultureInfo.InvariantCulture),
                await workOrdersPage.GetSelectedYearAsync(),
                "The sheet did not open on the current work year.");

            checks.Pass("Blazor and Tabulator reach an explicit ready state");

            await workOrdersPage.WaitForWorkOrderAsync(
                seed.CurrentYearWorkOrderNumber);

            checks.Pass("Current-year work-order data is rendered");

            if (suite == E2ETestSuite.Full)
            {
                await workOrdersPage.SelectYearAsync(seed.PreviousYear);

                E2ETestAssert.Equal(
                    seed.PreviousYear.ToString(CultureInfo.InvariantCulture),
                    await workOrdersPage.GetSelectedYearAsync(),
                    "The year selector did not settle on the requested year.");

                checks.Pass("Year selector changes to the requested year");

                await workOrdersPage.WaitForWorkOrderAsync(
                    seed.PreviousYearWorkOrderNumber);

                checks.Pass("Selected-year work-order data is rendered");

                E2ETestAssert.True(
                    !await workOrdersPage.HasVisibleWorkOrderAsync(
                        seed.CurrentYearWorkOrderNumber),
                    "The current-year row remained visible after switching years.");

                checks.Pass("Rows from the previous selection are removed");

                browserSession.Diagnostics.AssertNoCriticalErrors();
                checks.Pass("Journey completes without page errors or HTTP 5xx responses");
            }

            E2ETestAssert.Equal(
                ExpectedCheckCount,
                checks.PassedCount,
                "The browser journey did not execute the expected number of checks.");

            await browserSession.CaptureSuccessAsync(artifactName);
            return checks.PassedCount;
        }
        catch
        {
            await browserSession.CaptureFailureAsync(artifactName);
            throw;
        }
    }
}
