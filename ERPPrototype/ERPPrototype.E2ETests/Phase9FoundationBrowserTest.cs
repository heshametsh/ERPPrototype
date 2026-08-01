using System.Globalization;
using Microsoft.Playwright;

namespace ERPPrototype.E2ETests;

internal sealed class Phase9FoundationBrowserTest(
    Uri baseUri,
    E2ESeedData seed,
    string artifactDirectory,
    bool headed)
{
    private const float HeadedSlowMotionMilliseconds = 90;

    public async Task RunAsync()
    {
        using var playwright = await Playwright.CreateAsync();
        var browser = await LaunchChromiumAsync(playwright);

        try
        {
            var context = await browser.NewContextAsync(
                new BrowserNewContextOptions
                {
                    Locale = "ar-SA",
                    ViewportSize = new ViewportSize
                    {
                        Width = 1440,
                        Height = 1000
                    }
                });

            try
            {
                await context.Tracing.StartAsync(
                    new TracingStartOptions
                    {
                        Screenshots = true,
                        Snapshots = true,
                        Sources = true
                    });

                var page = await context.NewPageAsync();
                page.SetDefaultTimeout(30_000);

                try
                {
                    await RunJourneyAsync(page);

                    var successScreenshot = Path.Combine(
                        artifactDirectory,
                        "phase9-foundation-pass.png");

                    await page.ScreenshotAsync(
                        new PageScreenshotOptions
                        {
                            Path = successScreenshot,
                            FullPage = true
                        });

                    await context.Tracing.StopAsync();

                    Console.WriteLine(
                        $"Browser evidence screenshot: {successScreenshot}");
                }
                catch
                {
                    var failureScreenshot = Path.Combine(
                        artifactDirectory,
                        "phase9-foundation-failure.png");

                    var tracePath = Path.Combine(
                        artifactDirectory,
                        "phase9-foundation-trace.zip");

                    try
                    {
                        await page.ScreenshotAsync(
                            new PageScreenshotOptions
                            {
                                Path = failureScreenshot,
                                FullPage = true
                            });
                    }
                    catch
                    {
                    }

                    await context.Tracing.StopAsync(
                        new TracingStopOptions
                        {
                            Path = tracePath
                        });

                    Console.WriteLine(
                        $"Failure screenshot: {failureScreenshot}");
                    Console.WriteLine($"Playwright trace: {tracePath}");

                    throw;
                }
            }
            finally
            {
                await context.CloseAsync();
            }
        }
        finally
        {
            await browser.CloseAsync();
        }
    }

    private async Task RunJourneyAsync(IPage page)
    {
        var loginUri = new Uri(
            baseUri,
            "/Account/Login?ReturnUrl=%2Fwork-orders");

        await page.GotoAsync(
            loginUri.ToString(),
            new PageGotoOptions
            {
                WaitUntil = WaitUntilState.DOMContentLoaded
            });

        await page.Locator("#Input\\.UserName").FillAsync(seed.UserName);
        await page.Locator("#Input\\.Password").FillAsync(seed.Password);
        await page.Locator("button.login-button").ClickAsync();

        await page.WaitForURLAsync(
            "**/work-orders",
            new PageWaitForURLOptions
            {
                Timeout = 45_000
            });

        await page.Locator("h1").WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible
            });

        E2ETestAssert.Equal(
            "Work Orders",
            (await page.Locator("h1").InnerTextAsync()).Trim(),
            "The employee did not reach the Work Orders page.");

        var subtitle = page.Locator(".page-subtitle");
        await subtitle.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible
            });

        var subtitleText = (await subtitle.InnerTextAsync()).Trim();

        E2ETestAssert.Contains(
            seed.BranchName,
            subtitleText,
            "The employee branch was not shown on the sheet.");

        E2ETestAssert.Contains(
            seed.DepartmentName,
            subtitleText,
            "The employee department was not shown on the sheet.");

        var yearSelector = page.Locator("select.work-year-select");
        await yearSelector.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible
            });

        E2ETestAssert.Equal(
            seed.CurrentYear.ToString(CultureInfo.InvariantCulture),
            await yearSelector.InputValueAsync(),
            "The sheet did not open on the current work year.");

        await WaitForWorkOrderAsync(
            page,
            seed.CurrentYearWorkOrderNumber);

        await yearSelector.SelectOptionAsync(
            seed.PreviousYear.ToString(CultureInfo.InvariantCulture));

        await page.WaitForFunctionAsync(
            """
            expectedYear => {
                const selector = document.querySelector('select.work-year-select');
                return selector && selector.value === String(expectedYear) && !selector.disabled;
            }
            """,
            seed.PreviousYear);

        await WaitForWorkOrderAsync(
            page,
            seed.PreviousYearWorkOrderNumber);

        E2ETestAssert.True(
            !await HasVisibleWorkOrderAsync(
                page,
                seed.CurrentYearWorkOrderNumber),
            "The current-year row remained visible after switching to the previous year.");

        Console.WriteLine("[PASS] Login reaches the employee Work Orders sheet");
        Console.WriteLine("[PASS] Employee branch and department scope are visible");
        Console.WriteLine("[PASS] Current-year work-order data is rendered");
        Console.WriteLine("[PASS] Changing the year renders the selected year's data");
    }

    private static async Task WaitForWorkOrderAsync(
        IPage page,
        string workOrderNumber)
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

    private static async Task<bool> HasVisibleWorkOrderAsync(
        IPage page,
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

    private async Task<IBrowser> LaunchChromiumAsync(IPlaywright playwright)
    {
        var launchOptions = new BrowserTypeLaunchOptions
        {
            Headless = !headed,
            SlowMo = headed
                ? HeadedSlowMotionMilliseconds
                : 0
        };

        try
        {
            return await playwright.Chromium.LaunchAsync(launchOptions);
        }
        catch (PlaywrightException exception)
            when (exception.Message.Contains(
                "Executable doesn't exist",
                StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine(
                "Playwright Chromium is not installed. " +
                "Installing it once in the user browser cache...");

            var installExitCode = Microsoft.Playwright.Program.Main(
                new[] { "install", "chromium" });

            if (installExitCode != 0)
            {
                throw new InvalidOperationException(
                    $"Playwright Chromium installation failed with exit code {installExitCode}.",
                    exception);
            }

            return await playwright.Chromium.LaunchAsync(launchOptions);
        }
    }
}
