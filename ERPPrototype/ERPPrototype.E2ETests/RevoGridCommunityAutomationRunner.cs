using System.Diagnostics;
using System.Text.Json;
using Microsoft.Playwright;

namespace ERPPrototype.E2ETests;

internal static class RevoGridCommunityAutomationRunner
{
    private const int ExpectedRows = 50_000;
    private const int ExpectedNeedLicenseRows = 6_250;

    public static async Task<int> RunAsync()
    {
        var projectRoot = FindProjectRoot();
        var artifactDirectory =
            E2EArtifactManager.CreateRunDirectory(projectRoot);

        Console.WriteLine("RevoGrid Community automated Gate 2.3");
        Console.WriteLine("No manual clicks are required.");
        Console.WriteLine($"Artifacts: {artifactDirectory}");
        Console.WriteLine();

        var checks = new List<GateCheck>();

        try
        {
            await using var database =
                await E2ETestDatabase.CreateAsync(
                    keepDatabase: false,
                    rowsPerYear: E2ETestDatabase.DefaultRowsPerYear);

            await using var application =
                await WebApplicationProcess.StartAsync(
                    projectRoot,
                    database.ConnectionString,
                    artifactDirectory);

            Console.WriteLine($"Application: {application.BaseUri}");

            await using var browser =
                await E2EBrowserSession.CreateAsync(
                    application.BaseUri,
                    artifactDirectory,
                    headed: false,
                    traceEnabled: true,
                    benchmarkMode: false,
                    viewportWidth: 1920,
                    viewportHeight: 919);

            var page = browser.Page;

            await page.Context.GrantPermissionsAsync(
                ["clipboard-read", "clipboard-write"],
                new BrowserContextGrantPermissionsOptions
                {
                    Origin = application.BaseUri
                        .GetLeftPart(UriPartial.Authority)
                });

            var pageUri = new Uri(
                application.BaseUri,
                "/grid-shootout/revogrid-gate22.html");

            var readyWatch = Stopwatch.StartNew();

            await page.GotoAsync(
                pageUri.ToString(),
                new PageGotoOptions
                {
                    WaitUntil = WaitUntilState.DOMContentLoaded,
                    Timeout = 60_000
                });

            await page.WaitForFunctionAsync(
                @"() =>
                    document.querySelector('#bench-status')
                        ?.textContent?.includes('جاهز') === true",
                null,
                new PageWaitForFunctionOptions
                {
                    Timeout = 60_000
                });

            readyWatch.Stop();

            checks.Add(
                Pass(
                    "50,000 rows ready",
                    $"{readyWatch.Elapsed.TotalMilliseconds:N1} ms"));

            var selectionWatch = Stopwatch.StartNew();

            var selectionOk = await page.EvaluateAsync<bool>(
                @"async () => {
                    const grid = document.querySelector('revo-grid');
                    if (!grid) return false;

                    await grid.setCellsFocus(
                        { x: 6, y: 0 },
                        { x: 6, y: 49999 });

                    for (let i = 0; i < 500; i++) {
                        const row =
                            (i * 7919) % 50000;
                        await grid.scrollToRow(row);
                    }

                    const r = await grid.getSelectedRange();
                    const x = r?.x ?? r?.start?.x ?? null;
                    const x1 = r?.x1 ?? r?.end?.x ?? x;
                    const y = r?.y ?? r?.start?.y ?? null;
                    const y1 = r?.y1 ?? r?.end?.y ?? y;

                    return x === 6 &&
                           x1 === 6 &&
                           y === 0 &&
                           y1 === 49999;
                }");

            selectionWatch.Stop();

            checks.Add(
                selectionOk
                    ? Pass(
                        "Selection survives 500 virtual jumps",
                        $"{selectionWatch.Elapsed.TotalMilliseconds:N1} ms")
                    : Fail(
                        "Selection survives 500 virtual jumps",
                        "Basket selection changed or disappeared"));

            var filterUiLoaded = await page.EvaluateAsync<bool>(
                @"() =>
                    !!customElements.get('revogr-filter-panel') &&
                    !!document.querySelector('revo-grid')?.filter");

            checks.Add(
                filterUiLoaded
                    ? Pass(
                        "Community filter UI/plugin loaded",
                        "revogr-filter-panel registered")
                    : Fail(
                        "Community filter UI/plugin loaded",
                        "Filter panel/plugin is missing"));

            var filterWatch = Stopwatch.StartNew();

            var filterResult = await page.EvaluateAsync<int[]>(
                @"async () => {
                    const grid = document.querySelector('revo-grid');

                    grid.filter = {
                        collection: {
                            basket: {
                                type: 'eq',
                                value: 'NeedLicense'
                            }
                        }
                    };

                    let visible = [];
                    for (let i = 0; i < 80; i++) {
                        visible = await grid.getVisibleSource();
                        if (visible.length === 6250) break;
                        await new Promise(r => setTimeout(r, 50));
                    }

                    const allNeedLicense =
                        visible.length > 0 &&
                        visible.every(
                            row => row.basket === 'NeedLicense');

                    return [
                        visible.length,
                        allNeedLicense ? 1 : 0
                    ];
                }");

            filterWatch.Stop();

            var filterOk =
                filterResult.Length >= 2 &&
                filterResult[0] == ExpectedNeedLicenseRows &&
                filterResult[1] == 1;

            checks.Add(
                filterOk
                    ? Pass(
                        "Community Equal filter",
                        $"{filterResult[0]:N0} NeedLicense rows; " +
                        $"{filterWatch.Elapsed.TotalMilliseconds:N1} ms")
                    : Fail(
                        "Community Equal filter",
                        $"visible={filterResult.ElementAtOrDefault(0):N0}, " +
                        $"allNeedLicense={filterResult.ElementAtOrDefault(1) == 1}"));

            var clearResult = await page.EvaluateAsync<int>(
                @"async () => {
                    const grid = document.querySelector('revo-grid');

                    grid.filter = {
                        collection: {}
                    };

                    let visible = [];
                    for (let i = 0; i < 80; i++) {
                        visible = await grid.getVisibleSource();
                        if (visible.length === 50000) break;
                        await new Promise(r => setTimeout(r, 50));
                    }

                    return visible.length;
                }");

            checks.Add(
                clearResult == ExpectedRows
                    ? Pass(
                        "Community filter clear",
                        $"{clearResult:N0} rows restored")
                    : Fail(
                        "Community filter clear",
                        $"visible={clearResult:N0}"));

            var pasteWatch = Stopwatch.StartNew();

            await PrepareClipboardPasteAsync(
                page,
                targetRow: 100,
                values: Enumerable
                    .Range(0, 5_000)
                    .Select(index => (910_000_000 + index).ToString())
                    .ToArray());

            await page.Keyboard.PressAsync("Control+V");

            await WaitForPasteAsync(page);

            var pasteMismatches =
                await page.EvaluateAsync<int>(
                    @"async () => {
                        const grid =
                            document.querySelector('revo-grid');
                        const source = await grid.getSource();
                        let mismatches = 0;

                        for (let i = 0; i < 5000; i++) {
                            if (
                                String(
                                    source[100 + i]
                                        ?.workOrderNumber ?? '') !==
                                String(910000000 + i))
                            {
                                mismatches++;
                            }
                        }

                        return mismatches;
                    }");

            pasteWatch.Stop();

            checks.Add(
                pasteMismatches == 0
                    ? Pass(
                        "Native clipboard paste 5,000×1",
                        $"5,000/5,000; " +
                        $"{pasteWatch.Elapsed.TotalMilliseconds:N1} ms")
                    : Fail(
                        "Native clipboard paste 5,000×1",
                        $"mismatches={pasteMismatches:N0}"));

            var endWatch = Stopwatch.StartNew();

            await PrepareClipboardPasteAsync(
                page,
                targetRow: ExpectedRows - 200,
                values: Enumerable
                    .Range(0, 4_000)
                    .Select(index => (910_020_000 + index).ToString())
                    .ToArray());

            await page.Keyboard.PressAsync("Control+V");

            await WaitForPasteAsync(page);

            var endResult = await page.EvaluateAsync<int[]>(
                @"async () => {
                    const grid =
                        document.querySelector('revo-grid');
                    const source = await grid.getSource();

                    let mismatches = 0;
                    for (let i = 0; i < 200; i++) {
                        if (
                            String(
                                source[49800 + i]
                                    ?.workOrderNumber ?? '') !==
                            String(910020000 + i))
                        {
                            mismatches++;
                        }
                    }

                    return [source.length, mismatches];
                }");

            endWatch.Stop();

            var endOk =
                endResult.Length >= 2 &&
                endResult[0] == ExpectedRows &&
                endResult[1] == 0;

            checks.Add(
                endOk
                    ? Pass(
                        "End rule 4,000→200",
                        $"rows={endResult[0]:N0}, pasted=200; " +
                        $"{endWatch.Elapsed.TotalMilliseconds:N1} ms")
                    : Fail(
                        "End rule 4,000→200",
                        $"rows={endResult.ElementAtOrDefault(0):N0}, " +
                        $"mismatches={endResult.ElementAtOrDefault(1):N0}"));

            var report = new
            {
                At = DateTimeOffset.Now,
                Gate = "RevoGrid Community Gate 2.3 Automated",
                Candidate = "RevoGrid Community",
                Version = "4.25.2",
                Rows = ExpectedRows,
                Checks = checks,
                Passed = checks.Count(check => check.Passed),
                Failed = checks.Count(check => !check.Passed)
            };

            var reportPath = Path.Combine(
                artifactDirectory,
                "grid-gate23-revogrid-community-automated.json");

            await File.WriteAllTextAsync(
                reportPath,
                JsonSerializer.Serialize(
                    report,
                    new JsonSerializerOptions
                    {
                        WriteIndented = true
                    }));

            var allPassed = checks.All(check => check.Passed);

            if (allPassed)
            {
                await browser.CaptureSuccessAsync(
                    "grid-gate23-revogrid-community",
                    preserveTrace: false);
            }
            else
            {
                await browser.CaptureFailureAsync(
                    "grid-gate23-revogrid-community");
            }

            Console.WriteLine();
            foreach (var check in checks)
            {
                Console.WriteLine(
                    $"[{(check.Passed ? "PASS" : "FAIL")}] " +
                    $"{check.Name} — {check.Detail}");
            }

            Console.WriteLine();
            Console.WriteLine(
                $"Result: {report.Passed}/{checks.Count} checks passed.");
            Console.WriteLine($"JSON report: {reportPath}");

            return allPassed ? 0 : 1;
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine();
            Console.Error.WriteLine(
                "RevoGrid Community automated Gate 2.3: FAIL");
            Console.Error.WriteLine(exception);
            return 1;
        }
    }

    private static async Task PrepareClipboardPasteAsync(
        IPage page,
        int targetRow,
        string[] values)
    {
        var text = string.Join('\n', values);

        await page.EvaluateAsync(
            @"async ({ targetRow, text }) => {
                const grid =
                    document.querySelector('revo-grid');

                await navigator.clipboard.writeText(text);

                window.__gate23PasteDone = false;

                grid.addEventListener(
                    'afterpasteapply',
                    () => {
                        window.__gate23PasteDone = true;
                    },
                    { once: true });

                await grid.scrollToRow(targetRow);
                await grid.setCellsFocus(
                    { x: 0, y: targetRow },
                    { x: 0, y: targetRow });

                grid.focus({ preventScroll: true });
            }",
            new
            {
                targetRow,
                text
            });

        await page.WaitForFunctionAsync(
            @"() => {
                const grid =
                    document.querySelector('revo-grid');
                return !!grid &&
                       document.activeElement === grid;
            }",
            null,
            new PageWaitForFunctionOptions
            {
                Timeout = 5_000
            });
    }

    private static async Task WaitForPasteAsync(IPage page)
    {
        await page.WaitForFunctionAsync(
            @"() => window.__gate23PasteDone === true",
            null,
            new PageWaitForFunctionOptions
            {
                Timeout = 10_000
            });
    }

    private static GateCheck Pass(
        string name,
        string detail) =>
        new(name, true, detail);

    private static GateCheck Fail(
        string name,
        string detail) =>
        new(name, false, detail);

    private static string FindProjectRoot()
    {
        var directory = new DirectoryInfo(
            AppContext.BaseDirectory);

        while (directory is not null)
        {
            var candidate = Path.Combine(
                directory.FullName,
                "ERPPrototype.csproj");

            if (File.Exists(candidate))
            {
                return directory.FullName;
            }

            directory = directory.Parent;
        }

        throw new DirectoryNotFoundException(
            "Could not find ERPPrototype.csproj from the E2E output directory.");
    }

    private sealed record GateCheck(
        string Name,
        bool Passed,
        string Detail);
}
