using Microsoft.Playwright;
using static ERPPrototype.E2ETests.RevoCanonicalTestSurface;

namespace ERPPrototype.E2ETests;

internal static class LiveResizeV2ProbeRunner
{
    private const string LabPath = "/work-orders-revogrid-live-resize-lab";
    private const string TargetProp = "workTypeCode";

    public static async Task<int> RunAsync()
    {
        var root = FindProjectRoot();
        var artifacts = E2EArtifactManager.CreateRunDirectory(root);
        Console.WriteLine($"Artifacts: {artifacts}");

        await using var db = await E2ETestDatabase.CreateAsync(
            keepDatabase: false,
            rowsPerYear: E2ETestDatabase.DefaultRowsPerYear);
        await using var app = await WebApplicationProcess.StartAsync(
            root, db.ConnectionString, artifacts, configuration: "Debug");
        await using var browser = await E2EBrowserSession.CreateAsync(
            app.BaseUri, artifacts, headed: false, traceEnabled: false,
            benchmarkMode: false, viewportWidth: 1800, viewportHeight: 1000,
            windowWidth: 1900, windowHeight: 1050,
            screenWidth: 1920, screenHeight: 1080);

        var page = browser.Page;
        var login = new LoginPage(page, app.BaseUri);
        await login.OpenAsync(LabPath);
        await login.LoginAsync(db.Seed);
        await page.WaitForURLAsync($"**{LabPath}*",
            new PageWaitForURLOptions { Timeout = 45_000 });

        await WaitReadyAsync(page);
        Console.WriteLine("--- WIDE V2 ---");
        await ProbeAsync(page, 45, 10);

        await page.SetViewportSizeAsync(960, 1000);
        await page.GotoAsync(
            new Uri(app.BaseUri, LabPath).ToString(),
            new PageGotoOptions { WaitUntil = WaitUntilState.DOMContentLoaded });
        await WaitReadyAsync(page);
        Console.WriteLine("--- SPLIT V2 ---");
        await ProbeAsync(page, 20, 10);

        Console.WriteLine("LIVE_RESIZE_V2_PROBE_PASS");
        return 0;
    }

    private static async Task WaitReadyAsync(IPage page)
    {
        await page.WaitForSelectorAsync(
            "#revogrid-native-gate5a-grid revo-grid[data-live-resize-lab=ready]",
            new PageWaitForSelectorOptions { Timeout = 45_000 });
        await page.WaitForTimeoutAsync(200);
    }

    private static Task<int> RawIndexAsync(IPage page, string prop) =>
        page.EvaluateAsync<int>(
            """
            async prop => {
                const grid = document.querySelector(
                    '#revogrid-native-gate5a-grid revo-grid');
                const providers = await grid.getProviders();
                const raw = providers.column.getRawColumns()?.rgCol ?? [];
                return raw.findIndex(c => String(c?.prop ?? '') === prop);
            }
            """,
            prop);

    private static async Task ProbeAsync(
        IPage page, int steps, float stepPx)
    {
        var index = await RawIndexAsync(page, TargetProp);
        E2ETestAssert.True(index >= 0, "Target column missing.");

        var header = page.Locator(
            "#revogrid-native-gate5a-grid " +
            "revogr-viewport-scroll.rgCol:not([row-header]) " +
            $"revogr-header [data-rgCol=\"{index}\"]").First;
        var handle = header.Locator(".resizable-l").First;
        var box = await handle.BoundingBoxAsync();
        E2ETestAssert.True(box is not null, "Resize handle missing.");

        var start = await SnapshotAsync(page, index);
        var right = start.AnchorRight;
        var x = box!.X + box.Width / 2;
        var y = box.Y + box.Height / 2;

        await page.Mouse.MoveAsync(x, y);
        await page.Mouse.DownAsync();

        var maxAnchorError = 0d;
        var maxGuideError = 0d;
        var missed = 0;

        for (var step = 1; step <= steps; step++)
        {
            await page.Mouse.MoveAsync(x - step * stepPx, y);
            await page.WaitForTimeoutAsync(12);

            var snap = await SnapshotAsync(page, index);
            var expectedWidth = start.Width + step * stepPx;
            var widthError = Math.Abs(snap.Width - expectedWidth);
            var anchorError = Math.Abs(snap.AnchorRight - right);
            var guideError = Math.Abs(snap.HandleLeft - snap.HeaderLeft);

            if (widthError > 2.5) missed++;
            maxAnchorError = Math.Max(maxAnchorError, anchorError);
            maxGuideError = Math.Max(maxGuideError, guideError);

            Console.WriteLine(
                $"s={step} w={snap.Width:0.#} wErr={widthError:0.#} " +
                $"anchorErr={anchorError:0.#} guideErr={guideError:0.#} " +
                $"scroll={snap.ScrollLeft:0.#}/{snap.MaxScroll:0.#}");
        }

        await page.Mouse.UpAsync();
        await page.WaitForTimeoutAsync(80);

        var end = await SnapshotAsync(page, index);
        var diag = await page.EvaluateAsync<Diagnostics>(
            """
            async () => {
                const m = await import(
                    '/js/revoGridLiveResizeLab.js?v=20260918-live-resize-lab-2');
                return m.getDiagnostics('revogrid-native-gate5a-grid');
            }
            """);

        Console.WriteLine(
            $"diag down={diag?.DownEvents} move={diag?.MoveEvents} " +
            $"updates={diag?.UpdateCount} avg={diag?.AverageUpdateMs:0.###} " +
            $"max={diag?.MaxUpdateMs:0.###} keepRight={diag?.KeepRight} " +
            $"startScroll={diag?.StartScrollLeft:0.##}/{diag?.StartMaxScroll:0.##}");

        E2ETestAssert.True(missed == 0,
            $"Live width missed {missed} samples.");
        E2ETestAssert.True(maxGuideError <= 1.5,
            $"Blue guide drifted {maxGuideError:0.##} px from real edge.");
        E2ETestAssert.True(maxAnchorError <= 2.5,
            $"Right anchor drifted {maxAnchorError:0.##} px.");
        E2ETestAssert.True(
            Math.Abs(end.ScrollLeft - end.MaxScroll) <= 1.5,
            $"Final viewport is not right anchored: {end.ScrollLeft}/{end.MaxScroll}.");

        Console.WriteLine(
            $"maxGuideError={maxGuideError:0.##} " +
            $"maxAnchorError={maxAnchorError:0.##} " +
            $"avgUpdateMs={diag?.AverageUpdateMs:0.###} " +
            $"maxUpdateMs={diag?.MaxUpdateMs:0.###}");
    }

    private static Task<Snapshot> SnapshotAsync(IPage page, int index) =>
        page.EvaluateAsync<Snapshot>(
            """
            async args => {
                const grid = document.querySelector(
                    '#revogrid-native-gate5a-grid revo-grid');
                const viewport = grid.querySelector(
                    'revogr-viewport-scroll.rgCol:not([row-header])');
                const header = viewport.querySelector(
                    'revogr-header [data-rgCol="' + args.index + '"]');
                const handle = header?.querySelector('.resizable-l');
                const headers = Array.from(viewport.querySelectorAll(
                    'revogr-header [data-rgCol]'));
                const hr = header.getBoundingClientRect();
                const rr = handle.getBoundingClientRect();
                const anchorRight = Math.max(
                    ...headers.map(h => h.getBoundingClientRect().right));
                return {
                    width: hr.width,
                    headerLeft: hr.left,
                    handleLeft: rr.left,
                    anchorRight,
                    scrollLeft: viewport.scrollLeft,
                    maxScroll: Math.max(
                        0, viewport.scrollWidth - viewport.clientWidth)
                };
            }
            """,
            new { index });

    private sealed class Snapshot
    {
        public double Width { get; set; }
        public double HeaderLeft { get; set; }
        public double HandleLeft { get; set; }
        public double AnchorRight { get; set; }
        public double ScrollLeft { get; set; }
        public double MaxScroll { get; set; }
    }

    private sealed class Diagnostics
    {
        public double AverageUpdateMs { get; set; }
        public double MaxUpdateMs { get; set; }
        public int UpdateCount { get; set; }
        public int DownEvents { get; set; }
        public int MoveEvents { get; set; }
        public bool KeepRight { get; set; }
        public double StartScrollLeft { get; set; }
        public double StartMaxScroll { get; set; }
    }
}
