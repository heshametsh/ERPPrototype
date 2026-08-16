using Microsoft.Playwright;

namespace ERPPrototype.E2ETests;

internal sealed class E2EBrowserSession : IAsyncDisposable
{
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
        string artifactDirectory,
        bool tracingActive)
    {
        this.playwright = playwright;
        this.browser = browser;
        this.context = context;
        this.artifactDirectory = artifactDirectory;
        Page = page;
        Diagnostics = diagnostics;
        this.tracingActive = tracingActive;
    }

    public IPage Page { get; }

    public BrowserDiagnostics Diagnostics { get; }

    public static async Task<E2EBrowserSession> CreateAsync(
        Uri baseUri,
        string artifactDirectory,
        bool headed,
        bool traceEnabled = true,
        bool benchmarkMode = false,
        int viewportWidth = 1440,
        int viewportHeight = 1000,
        int? windowWidth = null,
        int? windowHeight = null,
        int? screenWidth = null,
        int? screenHeight = null)
    {
        var playwright = await Playwright.CreateAsync();
        IBrowser? browser = null;
        IBrowserContext? context = null;

        try
        {
            browser = await LaunchChromiumAsync(
                playwright,
                headed,
                benchmarkMode,
                windowWidth,
                windowHeight);

            context = await browser.NewContextAsync(
                new BrowserNewContextOptions
                {
                    Locale = "ar-SA",
                    ViewportSize = new ViewportSize
                    {
                        Width = viewportWidth,
                        Height = viewportHeight
                    },
                    ScreenSize =
                        screenWidth.HasValue && screenHeight.HasValue
                            ? new ScreenSize
                            {
                                Width = screenWidth.Value,
                                Height = screenHeight.Value
                            }
                            : null
                });

            if (traceEnabled)
            {
                await context.Tracing.StartAsync(
                    new TracingStartOptions
                    {
                        Screenshots = true,
                        Snapshots = true,
                        Sources = true
                    });
            }

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
                traceEnabled);
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

    public async Task CaptureSuccessAsync(
        string name,
        bool preserveTrace = false)
    {
        var screenshotPath = Path.Combine(
            artifactDirectory,
            name + "-pass.png");

        var tracePath = Path.Combine(
            artifactDirectory,
            name + "-trace.zip");

        await Page.ScreenshotAsync(
            new PageScreenshotOptions
            {
                Path = screenshotPath,
                FullPage = true
            });

        var traceWasActive = tracingActive;

        await StopTracingAsync(
            preserveTrace && traceWasActive
                ? tracePath
                : null);

        Console.WriteLine(
            $"Browser evidence screenshot: {screenshotPath}");

        if (preserveTrace && traceWasActive)
        {
            Console.WriteLine($"Playwright trace: {tracePath}");
        }
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

        var traceWasActive = tracingActive;

        if (traceWasActive)
        {
            await TryCaptureAsync(
                "Playwright trace",
                async () =>
                    await StopTracingAsync(tracePath));
        }

        Console.WriteLine($"Failure screenshot: {screenshotPath}");
        Console.WriteLine(
            traceWasActive
                ? $"Playwright trace: {tracePath}"
                : "Playwright trace: disabled for neutral benchmark mode");
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

    internal static async Task<IBrowser> LaunchChromiumAsync(
        IPlaywright playwright,
        bool headed,
        bool benchmarkMode,
        int? windowWidth = null,
        int? windowHeight = null)
    {
        var arguments = new List<string>();

        if (benchmarkMode)
        {
            arguments.Add("--enable-precise-memory-info");
        }

        if (windowWidth.HasValue && windowHeight.HasValue)
        {
            arguments.Add(
                $"--window-size={windowWidth.Value},{windowHeight.Value}");
        }

        var launchOptions = new BrowserTypeLaunchOptions
        {
            Headless = !headed,
            Args = arguments.Count > 0 ? arguments : null,
            SlowMo = 0
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
