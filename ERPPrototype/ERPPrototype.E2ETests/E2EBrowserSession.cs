using Microsoft.Playwright;

namespace ERPPrototype.E2ETests;

internal sealed class E2EBrowserSession : IAsyncDisposable
{
    private const float HeadedSlowMotionMilliseconds = 90;
    private const float ObserveSlowMotionMilliseconds = 650;
    private const int ObservePauseMilliseconds = 1_250;

    private readonly IPlaywright playwright;
    private readonly IBrowser browser;
    private readonly IBrowserContext context;
    private readonly string artifactDirectory;
    private readonly bool observe;
    private bool tracingActive;

    private E2EBrowserSession(
        IPlaywright playwright,
        IBrowser browser,
        IBrowserContext context,
        IPage page,
        BrowserDiagnostics diagnostics,
        string artifactDirectory,
        bool observe)
    {
        this.playwright = playwright;
        this.browser = browser;
        this.context = context;
        this.artifactDirectory = artifactDirectory;
        this.observe = observe;
        Page = page;
        Diagnostics = diagnostics;
        tracingActive = true;
    }

    public IPage Page { get; }

    public BrowserDiagnostics Diagnostics { get; }

    public bool ObserveEnabled => observe;

    public static async Task<E2EBrowserSession> CreateAsync(
        Uri baseUri,
        string artifactDirectory,
        bool headed,
        bool observe)
    {
        var playwright = await Playwright.CreateAsync();
        IBrowser? browser = null;
        IBrowserContext? context = null;

        try
        {
            browser = await LaunchChromiumAsync(
                playwright,
                headed || observe,
                observe);

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
                artifactDirectory,
                observe);
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

    public async Task ObserveAsync(
        string step,
        int pauseMilliseconds = ObservePauseMilliseconds)
    {
        if (!observe)
        {
            return;
        }

        Console.WriteLine($"[OBSERVE] {step}");

        await Page.EvaluateAsync(
            """
            step => {
                const id = 'erp-e2e-observe-banner';
                let banner = document.getElementById(id);

                if (!banner) {
                    banner = document.createElement('div');
                    banner.id = id;
                    banner.style.position = 'fixed';
                    banner.style.top = '14px';
                    banner.style.left = '50%';
                    banner.style.transform = 'translateX(-50%)';
                    banner.style.zIndex = '2147483647';
                    banner.style.maxWidth = '90vw';
                    banner.style.padding = '12px 20px';
                    banner.style.borderRadius = '10px';
                    banner.style.background = 'rgba(15, 35, 55, 0.94)';
                    banner.style.color = '#ffffff';
                    banner.style.fontFamily = 'Segoe UI, Arial, sans-serif';
                    banner.style.fontSize = '18px';
                    banner.style.fontWeight = '700';
                    banner.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.35)';
                    banner.style.direction = 'rtl';
                    banner.style.textAlign = 'center';
                    banner.style.pointerEvents = 'none';
                    document.body.appendChild(banner);
                }

                banner.textContent = step;
            }
            """,
            step);

        await Page.WaitForTimeoutAsync(pauseMilliseconds);
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
        bool headed,
        bool observe)
    {
        var launchOptions = new BrowserTypeLaunchOptions
        {
            Headless = !headed,
            SlowMo = observe
                ? ObserveSlowMotionMilliseconds
                : headed
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
