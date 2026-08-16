using Microsoft.Playwright;

namespace ERPPrototype.E2ETests;

internal sealed class WorkOrdersLoaderContractBrowserTest(
    string projectRoot,
    bool headed)
{
    public async Task RunAsync()
    {
        var loaderPath = Path.Combine(
            projectRoot,
            "wwwroot",
            "js",
            "workOrdersLoader.js");

        var loaderSource = await File.ReadAllTextAsync(loaderPath);
        var coreThreeRequested = new TaskCompletionSource<bool>(
            TaskCreationOptions.RunContinuationsAsynchronously);
        var releaseCoreThree = new TaskCompletionSource<bool>(
            TaskCreationOptions.RunContinuationsAsynchronously);

        using var playwright = await Playwright.CreateAsync();
        await using var browser =
            await E2EBrowserSession.LaunchChromiumAsync(
                playwright,
                headed,
                benchmarkMode: false);

        await using var context = await browser.NewContextAsync();
        var page = await context.NewPageAsync();
        page.SetDefaultTimeout(30_000);

        await page.RouteAsync(
            "https://loader.test/**",
            async route =>
            {
                var path = new Uri(route.Request.Url).AbsolutePath;

                switch (path)
                {
                    case "/loader-test":
                        await route.FulfillAsync(
                            new RouteFulfillOptions
                            {
                                Status = 200,
                                ContentType = "text/html",
                                Body = """
                                    <!doctype html>
                                    <html>
                                    <body>
                                        <script
                                            src="/workOrdersLoader.js"
                                            data-core-01="/core-01.js"
                                            data-core-02="/core-02.js"
                                            data-core-03="/core-03.js">
                                        </script>
                                    </body>
                                    </html>
                                    """
                            });
                        break;

                    case "/workOrdersLoader.js":
                        await route.FulfillAsync(
                            new RouteFulfillOptions
                            {
                                Status = 200,
                                ContentType = "application/javascript",
                                Body = loaderSource
                            });
                        break;

                    case "/core-01.js":
                        await route.FulfillAsync(
                            new RouteFulfillOptions
                            {
                                Status = 200,
                                ContentType = "application/javascript",
                                Body = "window.Tabulator = function Tabulator() {};"
                            });
                        break;

                    case "/core-02.js":
                        await route.FulfillAsync(
                            new RouteFulfillOptions
                            {
                                Status = 200,
                                ContentType = "application/javascript",
                                Body = "window.tabulatorTest = { initialize() { return true; } };"
                            });
                        break;

                    case "/core-03.js":
                        coreThreeRequested.TrySetResult(true);
                        await releaseCoreThree.Task;

                        await route.FulfillAsync(
                            new RouteFulfillOptions
                            {
                                Status = 200,
                                ContentType = "application/javascript",
                                Body = "window.tabulatorTest.ensureStructureUi = function () { return true; };"
                            });
                        break;

                    default:
                        await route.FulfillAsync(
                            new RouteFulfillOptions
                            {
                                Status = 404,
                                Body = "Not found"
                            });
                        break;
                }
            });

        try
        {
            await page.GotoAsync(
                "https://loader.test/loader-test",
                new PageGotoOptions
                {
                    WaitUntil = WaitUntilState.Load
                });

            await page.EvaluateAsync(
                """
                () => {
                    window.__erpFirstLoaderPromise =
                        window.workOrdersLoader.ensureLoaded();
                }
                """);

            await coreThreeRequested.Task.WaitAsync(
                TimeSpan.FromSeconds(10));

            await page.WaitForFunctionAsync(
                "() => typeof window.tabulatorTest?.initialize === 'function'");

            await page.EvaluateAsync(
                """
                () => {
                    window.__erpSecondLoaderResolved = false;
                    window.__erpSecondLoaderPromise =
                        window.workOrdersLoader.ensureLoaded().then(() => {
                            window.__erpSecondLoaderResolved = true;
                        });
                }
                """);

            await Task.Delay(100);

            var resolvedBeforeFullCoreLoad =
                await page.EvaluateAsync<bool>(
                    "() => window.__erpSecondLoaderResolved === true");

            E2ETestAssert.True(
                !resolvedBeforeFullCoreLoad,
                "The Work Orders loader reported ready while a required core script was still loading.");

            releaseCoreThree.TrySetResult(true);

            await page.EvaluateAsync(
                """
                () => Promise.all([
                    window.__erpFirstLoaderPromise,
                    window.__erpSecondLoaderPromise
                ])
                """);

            var fullApiAvailable = await page.EvaluateAsync<bool>(
                "() => typeof window.tabulatorTest?.ensureStructureUi === 'function'");

            E2ETestAssert.True(
                fullApiAvailable,
                "The Work Orders loader completed without the delayed core API.");
        }
        finally
        {
            releaseCoreThree.TrySetResult(true);
        }
    }
}
