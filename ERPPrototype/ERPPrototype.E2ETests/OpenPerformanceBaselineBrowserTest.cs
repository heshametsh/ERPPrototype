using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.Playwright;

namespace ERPPrototype.E2ETests;

internal sealed class OpenPerformanceBaselineBrowserTest(
    Uri baseUri,
    E2ESeedData seed,
    string artifactDirectory,
    bool headed,
    int runCount)
{
    private const string TableId = "tabulator-test-table";

    private static readonly string[] RequiredOpenStages =
    [
        "open.server.create-db-context",
        "open.server.scope-query",
        "open.server.available-years-query",
        "open.server.custom-columns-query",
        "open.server.column-layouts-query",
        "open.server.rows-query",
        "open.server.total",
        "open.blazor.authentication-state",
        "open.blazor.load-sheet-service-call",
        "open.blazor.apply-sheet",
        "open.blazor.on-initialized-total",
        "open.blazor.component-to-grid-init-start",
        "open.blazor.js-interop-initialize-call",
        "initialize.total",
        "open.grid.table-built"
    ];

    public async Task<OpenPerformanceBaselineReport> RunAsync()
    {
        var runs = new List<OpenPerformanceRunMetrics>(runCount);
        PerformanceEnvironmentSnapshot? environment = null;

        for (var runNumber = 1; runNumber <= runCount; runNumber++)
        {
            var runDirectory = Path.Combine(
                artifactDirectory,
                $"open-performance-run-{runNumber:D2}");

            Directory.CreateDirectory(runDirectory);

            Console.WriteLine();
            Console.WriteLine(
                $"==> Open performance run {runNumber}/{runCount}: " +
                $"{seed.RowsPerYear:N0} rows");

            await using var browserSession =
                await E2EBrowserSession.CreateAsync(
                    baseUri,
                    runDirectory,
                    headed,
                    traceEnabled: false,
                    benchmarkMode: true);

            try
            {
                var page = browserSession.Page;
                var loginPage = new LoginPage(page, baseUri);
                var workOrdersPage = new WorkOrdersPage(page);

                await loginPage.OpenAsync(
                    "/work-orders?perf=baseline");

                var loginStartedAt = Stopwatch.GetTimestamp();

                await loginPage.LoginAsync(seed);
                await workOrdersPage.WaitUntilReadyAsync();
                await workOrdersPage.WaitForActiveRowCountAsync(
                    seed.RowsPerYear);

                var loginToGridMilliseconds =
                    Stopwatch.GetElapsedTime(loginStartedAt)
                        .TotalMilliseconds;

                E2ETestAssert.Equal(
                    seed.RowsPerYear,
                    await workOrdersPage.GetActiveRowCountAsync(),
                    "The Open Performance suite did not load the requested dataset.");

                E2ETestAssert.Equal(
                    0,
                    await workOrdersPage.GetDirtyRowCountAsync(),
                    "The Open Performance suite did not start from a clean sheet.");

                await page.WaitForFunctionAsync(
                    """
                    tableId => {
                        const session =
                            window.tabulatorPerformance?.sessions?.get?.(tableId);

                        return Boolean(
                            session?.durations?.has?.(
                                'open.blazor.js-interop-initialize-call'
                            ) &&
                            session?.durations?.has?.(
                                'open.grid.table-built'
                            )
                        );
                    }
                    """,
                    TableId,
                    new PageWaitForFunctionOptions
                    {
                        Timeout = 45_000
                    });

                await WaitForTwoAnimationFramesAsync(page);

                environment ??= await ReadEnvironmentAsync(page);

                var observatoryJson = await page.EvaluateAsync<string?>(
                    """
                    tableId => {
                        const profiler = window.tabulatorPerformance;

                        if (
                            !profiler ||
                            typeof profiler.buildReport !== 'function'
                        ) {
                            return null;
                        }

                        const report = profiler.buildReport(tableId);
                        profiler.stop(false);

                        return report
                            ? JSON.stringify(report)
                            : null;
                    }
                    """,
                    TableId);

                E2ETestAssert.True(
                    !string.IsNullOrWhiteSpace(observatoryJson),
                    "The Work Orders Performance Observatory did not return an open report.");

                var parsed = ParseObservatoryReport(
                    observatoryJson!);

                E2ETestAssert.Equal(
                    "baseline",
                    parsed.Mode,
                    "The open performance report did not run in baseline mode.");

                E2ETestAssert.Equal(
                    seed.RowsPerYear,
                    parsed.Rows,
                    "The open performance report captured a different row count.");

                var stageNames = parsed.Stages
                    .Select(stage => stage.Name)
                    .ToHashSet(StringComparer.Ordinal);

                foreach (var requiredStage in RequiredOpenStages)
                {
                    E2ETestAssert.True(
                        stageNames.Contains(requiredStage),
                        $"The open performance report is missing required stage '{requiredStage}'.");
                }

                E2ETestAssert.True(
                    parsed.GridFirstUsableFromInitializeMilliseconds is >= 0,
                    "The open performance report did not capture first-usable grid timing.");

                var resources =
                    await ReadRelevantResourcesAsync(page);

                var approximateGridDataKilobytes =
                    await MeasureApproximateGridDataKilobytesAsync(page);

                var resourceTransferKilobytes = resources
                    .Where(resource => resource.TransferKilobytes.HasValue)
                    .Sum(resource => resource.TransferKilobytes!.Value);

                var longestResource = resources
                    .OrderByDescending(resource => resource.DurationMilliseconds)
                    .FirstOrDefault();

                var run = new OpenPerformanceRunMetrics(
                    RunNumber: runNumber,
                    LoginToGridWallMilliseconds:
                        loginToGridMilliseconds,
                    GridFirstUsableFromInitializeMilliseconds:
                        parsed.GridFirstUsableFromInitializeMilliseconds,
                    GridFirstUsableFromProfilerStartMilliseconds:
                        parsed.GridFirstUsableFromProfilerStartMilliseconds,
                    ApproximateGridDataKilobytes:
                        approximateGridDataKilobytes,
                    ResourceTransferKilobytes:
                        resourceTransferKilobytes,
                    LongestResourceMilliseconds:
                        longestResource?.DurationMilliseconds ?? 0,
                    LongestResourceName:
                        longestResource?.Name,
                    BrowserUsedJsHeapStartMegabytes:
                        parsed.BrowserUsedJsHeapStartMegabytes,
                    BrowserUsedJsHeapEndMegabytes:
                        parsed.BrowserUsedJsHeapEndMegabytes,
                    BrowserUsedJsHeapDeltaMegabytes:
                        Difference(
                            parsed.BrowserUsedJsHeapEndMegabytes,
                            parsed.BrowserUsedJsHeapStartMegabytes),
                    ProfilerMeasuredHookMilliseconds:
                        parsed.ProfilerMeasuredHookMilliseconds,
                    ProfilerMeasuredHookRatioPercent:
                        parsed.ProfilerMeasuredHookRatioPercent,
                    Stages: parsed.Stages,
                    Resources: resources);

                runs.Add(run);

                browserSession.Diagnostics.AssertNoCriticalErrors();

                Console.WriteLine(
                    $"Run {runNumber}: login→grid=" +
                    $"{loginToGridMilliseconds:N2} ms; " +
                    $"server total={GetStageMilliseconds(run, "open.server.total"):N2} ms; " +
                    $"rows query={GetStageMilliseconds(run, "open.server.rows-query"):N2} ms; " +
                    $"grid init={GetStageMilliseconds(run, "open.grid.table-built"):N2} ms; " +
                    $"data≈{approximateGridDataKilobytes:N1} KB; " +
                    $"resources={resourceTransferKilobytes:N1} KB.");

                if (runNumber == runCount)
                {
                    await browserSession.CaptureSuccessAsync(
                        "phase9-performance-open",
                        preserveTrace: false);
                }
            }
            catch
            {
                await browserSession.CaptureFailureAsync(
                    $"phase9-performance-open-run-{runNumber:D2}");
                throw;
            }
        }

        var aggregate = BuildAggregate(runs);

        return new OpenPerformanceBaselineReport(
            SchemaVersion: "1.0",
            CapturedAtUtc: DateTimeOffset.UtcNow,
            RowsPerYear: seed.RowsPerYear,
            RunCount: runCount,
            Headed: headed,
            Environment: environment ??
                throw new InvalidOperationException(
                    "Open performance environment was not captured."),
            Runs: runs,
            Aggregate: aggregate,
            InterpretationNote:
                "Open-stage durations overlap and must not be added together. " +
                "This is a local loopback baseline: it separates SQL/server/browser " +
                "work on the same machine, but it is not a production or SEC-network latency measurement. " +
                "Approximate grid-data KB is measured after the timed open and is not the actual Blazor wire payload.");
    }

    private static ParsedOpenObservatoryReport ParseObservatoryReport(
        string json)
    {
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;

        var mode = ReadString(root, "mode") ?? string.Empty;
        var rows = ReadInt(root, "rows") ?? 0;
        var stages = new List<OpenPerformanceStageMetric>();

        if (
            root.TryGetProperty("operations", out var operations) &&
            operations.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in operations.EnumerateArray())
            {
                var name = ReadString(item, "name");

                if (string.IsNullOrWhiteSpace(name))
                {
                    continue;
                }

                stages.Add(
                    new OpenPerformanceStageMetric(
                        Name: name,
                        Count: ReadInt(item, "count") ?? 0,
                        TotalMilliseconds:
                            ReadDouble(item, "totalMs") ?? 0,
                        AverageMilliseconds:
                            ReadDouble(item, "averageMs") ?? 0,
                        MaximumMilliseconds:
                            ReadDouble(item, "maxMs") ?? 0,
                        LastMilliseconds:
                            ReadDouble(item, "lastMs") ?? 0));
            }
        }

        double? firstUsableFromInitialize = null;
        double? firstUsableFromSessionStart = null;

        if (root.TryGetProperty("grid", out var grid))
        {
            firstUsableFromInitialize =
                ReadDouble(grid, "firstUsableMsFromInitialize");
            firstUsableFromSessionStart =
                ReadDouble(grid, "firstUsableMsFromSessionStart");
        }

        double? heapStart = null;
        double? heapEnd = null;

        if (root.TryGetProperty("memory", out var memory))
        {
            if (memory.TryGetProperty("start", out var start))
            {
                heapStart = ReadDouble(start, "usedJsHeapMb");
            }

            if (memory.TryGetProperty("end", out var end))
            {
                heapEnd = ReadDouble(end, "usedJsHeapMb");
            }
        }

        double profilerHookMilliseconds = 0;
        double? profilerHookRatioPercent = null;

        if (
            root.TryGetProperty(
                "measurementValidity",
                out var measurementValidity))
        {
            profilerHookMilliseconds =
                ReadDouble(
                    measurementValidity,
                    "profilerMeasuredHookTimeMs") ?? 0;
            profilerHookRatioPercent =
                ReadDouble(
                    measurementValidity,
                    "profilerMeasuredHookRatioPercent");
        }

        return new ParsedOpenObservatoryReport(
            Mode: mode,
            Rows: rows,
            GridFirstUsableFromInitializeMilliseconds:
                firstUsableFromInitialize,
            GridFirstUsableFromProfilerStartMilliseconds:
                firstUsableFromSessionStart,
            BrowserUsedJsHeapStartMegabytes: heapStart,
            BrowserUsedJsHeapEndMegabytes: heapEnd,
            ProfilerMeasuredHookMilliseconds:
                profilerHookMilliseconds,
            ProfilerMeasuredHookRatioPercent:
                profilerHookRatioPercent,
            Stages: stages);
    }

    private static OpenPerformanceAggregateMetrics BuildAggregate(
        IReadOnlyList<OpenPerformanceRunMetrics> runs)
    {
        var stageNames = runs
            .SelectMany(run => run.Stages.Select(stage => stage.Name))
            .Distinct(StringComparer.Ordinal)
            .OrderBy(name => name, StringComparer.Ordinal)
            .ToArray();

        var stages = stageNames
            .Select(name =>
            {
                var values = runs
                    .SelectMany(run => run.Stages)
                    .Where(stage => string.Equals(
                        stage.Name,
                        name,
                        StringComparison.Ordinal))
                    .Select(stage => stage.LastMilliseconds)
                    .Where(double.IsFinite)
                    .ToArray();

                return new OpenPerformanceStageAggregate(
                    Name: name,
                    RunsPresent: values.Length,
                    MedianMilliseconds: Median(values),
                    MinimumMilliseconds:
                        values.Length == 0 ? 0 : values.Min(),
                    MaximumMilliseconds:
                        values.Length == 0 ? 0 : values.Max());
            })
            .ToArray();

        return new OpenPerformanceAggregateMetrics(
            MedianLoginToGridWallMilliseconds:
                Median(runs.Select(run =>
                    run.LoginToGridWallMilliseconds)),
            MedianGridFirstUsableFromInitializeMilliseconds:
                Median(runs
                    .Select(run =>
                        run.GridFirstUsableFromInitializeMilliseconds)
                    .Where(value => value.HasValue)
                    .Select(value => value!.Value)),
            MedianApproximateGridDataKilobytes:
                Median(runs.Select(run =>
                    run.ApproximateGridDataKilobytes)),
            MedianResourceTransferKilobytes:
                Median(runs.Select(run =>
                    run.ResourceTransferKilobytes)),
            MedianProfilerMeasuredHookRatioPercent:
                Median(runs
                    .Select(run =>
                        run.ProfilerMeasuredHookRatioPercent)
                    .Where(value => value.HasValue)
                    .Select(value => value!.Value)),
            Stages: stages);
    }

    private static double GetStageMilliseconds(
        OpenPerformanceRunMetrics run,
        string name)
    {
        return run.Stages
            .FirstOrDefault(stage => string.Equals(
                stage.Name,
                name,
                StringComparison.Ordinal))
            ?.LastMilliseconds ?? 0;
    }

    private static async Task<IReadOnlyList<OpenPerformanceResourceMetric>>
        ReadRelevantResourcesAsync(IPage page)
    {
        var json = await page.EvaluateAsync<string>(
            """
            () => JSON.stringify(
                (performance.getEntriesByType?.('resource') ?? [])
                    .filter(entry =>
                        /tabulator|blazor|ERPPrototype|workOrders|\.js(?:\?|$)|\.css(?:\?|$)/i
                            .test(entry.name)
                    )
                    .map(entry => ({
                        name: entry.name.split('/').at(-1),
                        durationMs: Number(entry.duration) || 0,
                        transferKb: Number.isFinite(entry.transferSize)
                            ? entry.transferSize / 1024
                            : null,
                        decodedKb: Number.isFinite(entry.decodedBodySize)
                            ? entry.decodedBodySize / 1024
                            : null
                    }))
            )
            """);

        using var document = JsonDocument.Parse(json);
        var resources = new List<OpenPerformanceResourceMetric>();

        foreach (var item in document.RootElement.EnumerateArray())
        {
            var name = ReadString(item, "name");

            if (string.IsNullOrWhiteSpace(name))
            {
                continue;
            }

            resources.Add(
                new OpenPerformanceResourceMetric(
                    Name: name,
                    DurationMilliseconds:
                        ReadDouble(item, "durationMs") ?? 0,
                    TransferKilobytes:
                        ReadDouble(item, "transferKb"),
                    DecodedKilobytes:
                        ReadDouble(item, "decodedKb")));
        }

        return resources;
    }

    private static async Task<double> MeasureApproximateGridDataKilobytesAsync(
        IPage page)
    {
        return await page.EvaluateAsync<double>(
            """
            tableId => {
                const table = window.tabulatorTest?.tables?.[tableId];
                const data = table?.getData?.() ?? [];
                const json = JSON.stringify(data);
                return new TextEncoder().encode(json).byteLength / 1024;
            }
            """,
            TableId);
    }

    private static async Task<PerformanceEnvironmentSnapshot>
        ReadEnvironmentAsync(IPage page)
    {
        var userAgent = await page.EvaluateAsync<string>(
            "() => navigator.userAgent");
        var hardwareConcurrency = await page.EvaluateAsync<int>(
            "() => Number(navigator.hardwareConcurrency ?? 0)");
        var deviceMemory = await page.EvaluateAsync<double>(
            """
            () => Number.isFinite(navigator.deviceMemory)
                ? Number(navigator.deviceMemory)
                : -1
            """);

        return new PerformanceEnvironmentSnapshot(
            UserAgent: userAgent,
            HardwareConcurrency: hardwareConcurrency,
            DeviceMemoryGigabytes:
                deviceMemory >= 0 ? deviceMemory : null,
            ViewportWidth: 1440,
            ViewportHeight: 1000,
            OperatingSystem: RuntimeInformation.OSDescription,
            ProcessArchitecture:
                RuntimeInformation.ProcessArchitecture.ToString(),
            FrameworkDescription:
                RuntimeInformation.FrameworkDescription);
    }

    private static async Task WaitForTwoAnimationFramesAsync(IPage page)
    {
        await page.EvaluateAsync(
            """
            () => new Promise(resolve =>
                window.requestAnimationFrame(() =>
                    window.requestAnimationFrame(resolve)
                )
            )
            """);
    }

    private static double Median(IEnumerable<double> values)
    {
        var ordered = values
            .Where(double.IsFinite)
            .OrderBy(value => value)
            .ToArray();

        if (ordered.Length == 0)
        {
            return 0;
        }

        var middle = ordered.Length / 2;

        return ordered.Length % 2 == 0
            ? (ordered[middle - 1] + ordered[middle]) / 2
            : ordered[middle];
    }

    private static double? Difference(
        double? after,
        double? before)
    {
        return after.HasValue && before.HasValue
            ? after.Value - before.Value
            : null;
    }

    private static string? ReadString(
        JsonElement element,
        string propertyName)
    {
        return element.TryGetProperty(propertyName, out var value) &&
               value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;
    }

    private static int? ReadInt(
        JsonElement element,
        string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var value))
        {
            return null;
        }

        return value.ValueKind == JsonValueKind.Number &&
               value.TryGetInt32(out var number)
            ? number
            : null;
    }

    private static double? ReadDouble(
        JsonElement element,
        string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var value))
        {
            return null;
        }

        if (
            value.ValueKind == JsonValueKind.Number &&
            value.TryGetDouble(out var number) &&
            double.IsFinite(number))
        {
            return number;
        }

        return null;
    }

    private sealed record ParsedOpenObservatoryReport(
        string Mode,
        int Rows,
        double? GridFirstUsableFromInitializeMilliseconds,
        double? GridFirstUsableFromProfilerStartMilliseconds,
        double? BrowserUsedJsHeapStartMegabytes,
        double? BrowserUsedJsHeapEndMegabytes,
        double ProfilerMeasuredHookMilliseconds,
        double? ProfilerMeasuredHookRatioPercent,
        IReadOnlyList<OpenPerformanceStageMetric> Stages);
}
