using Microsoft.Playwright;

namespace ERPPrototype.E2ETests;

internal sealed class E2EBrowserSession : IAsyncDisposable
{
    private const float HeadedSlowMotionMilliseconds = 90;

    private readonly IPlaywright playwright;
    private readonly IBrowser browser;
    private readonly IBrowserContext context;
    private readonly string artifactDirectory;
    private bool tracingActive;

    private E2EBrowserSession(
        IPlaywright playwright,
        IBrowser browser,
        IBrowserContext context,
        IPage page,
        BrowserDiagnostics diagnostics,
        string artifactDirectory)
    {
        this.playwright = playwright;
        this.browser = browser;
        this.context = context;
        this.artifactDirectory = artifactDirectory;
        Page = page;
        Diagnostics = diagnostics;
        tracingActive = true;
    }

    public IPage Page { get; }

    public BrowserDiagnostics Diagnostics { get; }

    public static async Task<E2EBrowserSession> CreateAsync(
        Uri baseUri,
        string artifactDirectory,
        bool headed)
    {
        var playwright = await Playwright.CreateAsync();
        IBrowser? browser = null;
        IBrowserContext? context = null;

        try
        {
            browser = await LaunchChromiumAsync(playwright, headed);
            context = await browser.NewContextAsync(
                new BrowserNewContextOptions
                {
                    Locale = "ar-SA",
                    ViewportSize = new ViewportSize
                    {
                        Width = 1440,
                        Height = 1000
                    }
                });

            await context.Tracing.StartAsync(
                new TracingStartOptions
                {
                    Screenshots = true,
                    Snapshots = true,
                    Sources = true
                });

            var page = await context.NewPageAsync();
            page.SetDefaultTimeout(30_000);

            var diagnostics = new BrowserDiagnostics();
            diagnostics.Attach(page, baseUri);

            return new E2EBrowserSession(
                playwright,
                browser,
                context,
                page,
                diagnostics,
                artifactDirectory);
        }
        catch
        {
            if (context is not null)
            {
                await context.CloseAsync();
            }

            if (browser is not null)
            {
                await browser.CloseAsync();
            }

            playwright.Dispose();
            throw;
        }
    }

    public async Task CaptureSuccessAsync(string name)
    {
        var screenshotPath = Path.Combine(
            artifactDirectory,
            name + "-pass.png");

        await Page.ScreenshotAsync(
            new PageScreenshotOptions
            {
                Path = screenshotPath,
                FullPage = true
            });

        await StopTracingAsync(path: null);

        Console.WriteLine(
            $"Browser evidence screenshot: {screenshotPath}");
    }

    public async Task CaptureFailureAsync(string name)
    {
        var screenshotPath = Path.Combine(
            artifactDirectory,
            name + "-failure.png");

        var tracePath = Path.Combine(
            artifactDirectory,
            name + "-trace.zip");

        var diagnosticsPath = Path.Combine(
            artifactDirectory,
            name + "-diagnostics.txt");

        await TryCaptureAsync(
            "failure screenshot",
            async () =>
                await Page.ScreenshotAsync(
                    new PageScreenshotOptions
                    {
                        Path = screenshotPath,
                        FullPage = true
                    }));

        await TryCaptureAsync(
            "browser diagnostics",
            async () =>
                await Diagnostics.WriteReportAsync(diagnosticsPath));

        await TryCaptureAsync(
            "Playwright trace",
            async () =>
                await StopTracingAsync(tracePath));

        Console.WriteLine($"Failure screenshot: {screenshotPath}");
        Console.WriteLine($"Playwright trace: {tracePath}");
        Console.WriteLine($"Browser diagnostics: {diagnosticsPath}");
    }

    private async Task StopTracingAsync(string? path)
    {
        if (!tracingActive)
        {
            return;
        }

        tracingActive = false;

        if (path is null)
        {
            await context.Tracing.StopAsync();
            return;
        }

        await context.Tracing.StopAsync(
            new TracingStopOptions
            {
                Path = path
            });
    }

    private static async Task TryCaptureAsync(
        string artifactName,
        Func<Task> capture)
    {
        try
        {
            await capture();
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine(
                $"Warning: could not capture {artifactName}: " +
                exception.Message);
        }
    }

    public async ValueTask DisposeAsync()
    {
        try
        {
            await StopTracingAsync(path: null);
        }
        finally
        {
            await context.CloseAsync();
            await browser.CloseAsync();
            playwright.Dispose();
        }
    }

    private static async Task<IBrowser> LaunchChromiumAsync(
        IPlaywright playwright,
        bool headed)
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
                ["install", "chromium"]);

            if (installExitCode != 0)
            {
                throw new InvalidOperationException(
                    $"Playwright Chromium installation failed with exit code " +
                    $"{installExitCode}.",
                    exception);
            }

            return await playwright.Chromium.LaunchAsync(launchOptions);
        }
    }
}
