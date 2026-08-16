using System.Text.Json;

namespace ERPPrototype.E2ETests;

internal static class Phase9FoundationRunner
{
    public static async Task<int> RunAsync(string[] args)
    {
        E2ETestOptions? options = null;

        try
        {
            options = E2ETestOptions.Parse(args);
            var projectRoot = FindProjectRoot();
            var artifactDirectory =
                E2EArtifactManager.CreateRunDirectory(projectRoot);
            var isPerformanceSuite =
                options.Suite == E2ETestSuite.Performance ||
                options.Suite == E2ETestSuite.OpenPerformance ||
                options.Suite == E2ETestSuite.RealUserPerformance;
            var isLargeDatasetSuite =
                isPerformanceSuite || options.Suite == E2ETestSuite.Torture;
            var rowsPerYear = isLargeDatasetSuite
                ? options.RowsPerYear
                : E2ETestDatabase.DefaultRowsPerYear;

            Console.WriteLine("ERPPrototype browser automation platform");
            Console.WriteLine(
                "A temporary isolated SQL Server database and local web process will be used.");
            Console.WriteLine(
                $"Browser mode: {GetBrowserMode(options)}");
            Console.WriteLine($"Suite: {options.Suite}");
            Console.WriteLine(
                $"Seed: {rowsPerYear:N0} rows per year, " +
                $"{rowsPerYear * 2:N0} total rows");
            Console.WriteLine($"Artifacts: {artifactDirectory}");

            if (options.Suite == E2ETestSuite.Torture)
            {
                Console.WriteLine(
                    "Torture scenario: repeated heavy user operations plus 1,000-row edit/insert/delete persistence checks");
                Console.WriteLine(
                    "Purpose: find freezes, data loss, history corruption, save cliffs, or recovery failures under abuse");
                Console.WriteLine(
                    "Trace: disabled during the neutral torture run; failure screenshot/diagnostics remain enabled");
            }
            else if (isPerformanceSuite)
            {
                if (options.Suite == E2ETestSuite.Performance)
                {
                    Console.WriteLine(
                        $"Performance action: {options.PerformanceAction}");
                }
                else if (options.Suite == E2ETestSuite.OpenPerformance)
                {
                    Console.WriteLine(
                        "Performance scenario: Work Orders open / first usable grid");
                }
                else
                {
                    Console.WriteLine(
                        "Performance scenario: real-user Work Orders actions at Split Screen 100%");
                    Console.WriteLine(
                        "Human acceptance: user must also confirm the visible run feels smooth");
                }

                Console.WriteLine(
                    $"Independent fresh-browser runs: {options.PerformanceRuns}");
                Console.WriteLine(
                    "SlowMo: disabled");
                Console.WriteLine(
                    "Trace: " +
                    (options.PerformanceDiagnostics
                        ? "enabled (diagnostic run; not comparable to neutral baseline)"
                        : "disabled during measurement"));
            }

            Console.WriteLine();

            if (!isPerformanceSuite && options.Suite != E2ETestSuite.Torture)
            {
                var loaderContractTest =
                    new WorkOrdersLoaderContractBrowserTest(
                        projectRoot,
                        options.Headed);

                await loaderContractTest.RunAsync();
                Console.WriteLine(
                    "[PASS] Work Orders loader waits for the complete core runtime");
            }

            await using var database =
                await E2ETestDatabase.CreateAsync(
                    options.KeepDatabase,
                    rowsPerYear);

            Console.WriteLine($"Database: {database.DatabaseName}");

            await using var application =
                await WebApplicationProcess.StartAsync(
                    projectRoot,
                    database.ConnectionString,
                    artifactDirectory);

            Console.WriteLine($"Application: {application.BaseUri}");

            if (options.Suite == E2ETestSuite.Performance)
            {
                return await RunPerformanceAsync(
                    options,
                    database.Seed,
                    application.BaseUri,
                    artifactDirectory);
            }

            if (options.Suite == E2ETestSuite.OpenPerformance)
            {
                return await RunOpenPerformanceAsync(
                    options,
                    database.Seed,
                    application,
                    artifactDirectory);
            }

            if (options.Suite == E2ETestSuite.RealUserPerformance)
            {
                return await RunRealUserPerformanceAsync(
                    options,
                    database.Seed,
                    application.BaseUri,
                    artifactDirectory);
            }

            if (options.Suite == E2ETestSuite.Torture)
            {
                return await RunTortureAsync(
                    options,
                    database.Seed,
                    application.BaseUri,
                    artifactDirectory);
            }

            var browserTest = new Phase9FoundationBrowserTest(
                application.BaseUri,
                database.Seed,
                artifactDirectory,
                options.Headed,
                options.Suite);

            var passedChecks = await browserTest.RunAsync();

            Console.WriteLine();
            Console.WriteLine(
                $"Result: {passedChecks}/{browserTest.ExpectedCheckCount} " +
                "browser checks passed.");
            Console.WriteLine(
                $"Phase 9.2D2 {options.Suite} browser suite: PASS");
            Console.WriteLine(
                "The temporary web process was isolated from the developer database.");

            return 0;
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine();
            Console.Error.WriteLine(
                options?.Suite switch
                {
                    E2ETestSuite.Performance =>
                        "Phase 9.2D2 deep neutral performance baseline: FAIL",
                    E2ETestSuite.OpenPerformance =>
                        "Phase 9.2D2 Work Orders open performance baseline: FAIL",
                    E2ETestSuite.RealUserPerformance =>
                        "Phase 9.2D2 real-user Work Orders performance baseline: FAIL",
                    E2ETestSuite.Torture =>
                        "Phase 9.2D2 Work Orders torture suite: FAIL",
                    _ =>
                        "Phase 9.2D2 browser automation platform: FAIL"
                });
            Console.Error.WriteLine(exception);

            return 1;
        }
    }

    private static async Task<int> RunPerformanceAsync(
        E2ETestOptions options,
        E2ESeedData seed,
        Uri baseUri,
        string artifactDirectory)
    {
        var performanceTest = new PerformanceBaselineBrowserTest(
            baseUri,
            seed,
            artifactDirectory,
            options.Headed,
            options.PerformanceDiagnostics,
            options.PerformanceAction,
            options.PerformanceRuns);

        var report = await performanceTest.RunAsync();
        var reportPath = Path.Combine(
            artifactDirectory,
            $"phase9-performance-" +
            $"{options.PerformanceAction.ToString().ToLowerInvariant()}-" +
            $"{seed.RowsPerYear}-rows-baseline.json");

        await File.WriteAllTextAsync(
            reportPath,
            JsonSerializer.Serialize(
                report,
                new JsonSerializerOptions
                {
                    WriteIndented = true
                }));

        Console.WriteLine();
        Console.WriteLine("Deep neutral performance baseline: PASS");
        Console.WriteLine($"Report: {reportPath}");
        Console.WriteLine(
            "Cold aggregate P50/P95: " +
            $"{report.Aggregate.ColdAllSamplesP50Milliseconds:N2}/" +
            $"{report.Aggregate.ColdAllSamplesP95Milliseconds:N2} ms");
        Console.WriteLine(
            "Long-session aggregate P50/P95: " +
            $"{report.Aggregate.LongAllSamplesP50Milliseconds:N2}/" +
            $"{report.Aggregate.LongAllSamplesP95Milliseconds:N2} ms");
        Console.WriteLine(
            "Long vs cold P95: " +
            $"delta={report.Aggregate.LongVsColdP95DeltaMilliseconds:N2} ms; " +
            $"ratio={report.Aggregate.LongVsColdP95Ratio:N2}x");
        Console.WriteLine(
            "No absolute latency budget was enforced. " +
            "This run is a comparison baseline for the same machine and settings.");
        Console.WriteLine(
            "The temporary web process was isolated from the developer database.");

        return 0;
    }

    private static async Task<int> RunOpenPerformanceAsync(
        E2ETestOptions options,
        E2ESeedData seed,
        WebApplicationProcess application,
        string artifactDirectory)
    {
        var performanceTest = new OpenPerformanceBaselineBrowserTest(
            application.BaseUri,
            seed,
            artifactDirectory,
            options.Headed,
            options.PerformanceRuns);

        var report = await performanceTest.RunAsync();
        var reportPath = Path.Combine(
            artifactDirectory,
            $"phase9-performance-open-{seed.RowsPerYear}-rows-baseline.json");

        await File.WriteAllTextAsync(
            reportPath,
            JsonSerializer.Serialize(
                report,
                new JsonSerializerOptions
                {
                    WriteIndented = true
                }));

        var serverTotal = GetOpenStageAggregate(
            report,
            "open.server.total");
        var rowsQuery = GetOpenStageAggregate(
            report,
            "open.server.rows-query");
        var blazorInitialized = GetOpenStageAggregate(
            report,
            "open.blazor.on-initialized-total");
        var jsInteropInitialize = GetOpenStageAggregate(
            report,
            "open.blazor.js-interop-initialize-call");
        var browserInitialize = GetOpenStageAggregate(
            report,
            "initialize.total");
        var gridBuilt = GetOpenStageAggregate(
            report,
            "open.grid.table-built");

        Console.WriteLine();
        Console.WriteLine("Work Orders open performance baseline: PASS");
        Console.WriteLine($"Report: {reportPath}");
        Console.WriteLine(
            "Median login→usable grid: " +
            $"{report.Aggregate.MedianLoginToGridWallMilliseconds:N2} ms");
        Console.WriteLine(
            "Median server sheet load: " +
            $"{(serverTotal?.MedianMilliseconds ?? 0):N2} ms");
        Console.WriteLine(
            "Median SQL rows query: " +
            $"{(rowsQuery?.MedianMilliseconds ?? 0):N2} ms");
        Console.WriteLine(
            "Median Blazor component initialization: " +
            $"{(blazorInitialized?.MedianMilliseconds ?? 0):N2} ms");
        Console.WriteLine(
            "Median Blazor→browser initialize call: " +
            $"{(jsInteropInitialize?.MedianMilliseconds ?? 0):N2} ms");
        Console.WriteLine(
            "Median browser initialize function: " +
            $"{(browserInitialize?.MedianMilliseconds ?? 0):N2} ms");
        Console.WriteLine(
            "Median browser grid built from initialize start: " +
            $"{(gridBuilt?.MedianMilliseconds ?? 0):N2} ms");
        Console.WriteLine(
            "Median browser first usable from initialize: " +
            $"{report.Aggregate.MedianGridFirstUsableFromInitializeMilliseconds:N2} ms");
        Console.WriteLine(
            "Median approximate grid data: " +
            $"{report.Aggregate.MedianApproximateGridDataKilobytes:N1} KB");
        Console.WriteLine(
            "Median static-resource transfer: " +
            $"{report.Aggregate.MedianResourceTransferKilobytes:N1} KB");
        Console.WriteLine(
            "No stage durations were added together because several stages overlap.");
        Console.WriteLine(
            "This is a same-machine loopback baseline, not SEC-network latency.");
        Console.WriteLine(
            "The temporary web process was isolated from the developer database.");

        return 0;
    }


    private static async Task<int> RunRealUserPerformanceAsync(
        E2ETestOptions options,
        E2ESeedData seed,
        Uri baseUri,
        string artifactDirectory)
    {
        var performanceTest = new RealUserPerformanceBrowserTest(
            baseUri,
            seed,
            artifactDirectory,
            options.Headed,
            options.PerformanceRuns);

        var report = await performanceTest.RunAsync();
        var reportPath = Path.Combine(
            artifactDirectory,
            $"phase9-performance-real-user-{seed.RowsPerYear}-rows-baseline.json");

        await File.WriteAllTextAsync(
            reportPath,
            JsonSerializer.Serialize(
                report,
                new JsonSerializerOptions
                {
                    WriteIndented = true
                }));

        Console.WriteLine();
        Console.WriteLine("Real-user Work Orders performance baseline: AUTOMATED PASS");
        Console.WriteLine($"Report: {reportPath}");
        Console.WriteLine(
            "Median login→usable grid: " +
            $"{report.Aggregate.MedianLoginToUsableGridMilliseconds:N2} ms");

        foreach (var action in report.Aggregate.Actions)
        {
            Console.WriteLine(
                $"{action.Name}: median={action.MedianWallMilliseconds:N2} ms; " +
                $"range={action.MinimumWallMilliseconds:N2}–{action.MaximumWallMilliseconds:N2} ms; " +
                $"median long tasks={action.MedianLongTaskCount:N0}; " +
                $"median worst long task={action.MedianMaximumLongTaskMilliseconds:N2} ms");
        }

        Console.WriteLine(
            "Automated correctness/measurement passed, but Performance acceptance is NOT closed yet.");
        Console.WriteLine(
            "The visible headed run must also feel smooth to the user; final SEC Edge/network validation remains separate.");
        Console.WriteLine(
            "The temporary web process was isolated from the developer database.");

        return 0;
    }

    private static async Task<int> RunTortureAsync(
        E2ETestOptions options,
        E2ESeedData seed,
        Uri baseUri,
        string artifactDirectory)
    {
        var tortureTest = new WorkOrdersTortureBrowserTest(
            baseUri,
            seed,
            artifactDirectory,
            options.Headed);

        var report = await tortureTest.RunAsync();
        var reportPath = Path.Combine(
            artifactDirectory,
            $"phase9-work-orders-torture-{seed.RowsPerYear}-rows.json");

        await File.WriteAllTextAsync(
            reportPath,
            JsonSerializer.Serialize(
                report,
                new JsonSerializerOptions
                {
                    WriteIndented = true
                }));

        Console.WriteLine();
        Console.WriteLine("Work Orders torture suite: PASS");
        Console.WriteLine($"Report: {reportPath}");
        Console.WriteLine(
            $"Dataset: {report.RowsPerYear:N0} rows/year; " +
            $"bulk mutations: {report.BulkMutationRows:N0} rows each for edit/insert/delete.");

        foreach (var phase in report.Phases)
        {
            Console.WriteLine(
                $"{phase.Name}: {phase.WallMilliseconds:N2} ms; " +
                $"long tasks={phase.LongTaskCount}; " +
                $"worst={phase.MaximumLongTaskMilliseconds:N2} ms");
        }

        Console.WriteLine(
            $"Final state: active={report.FinalActiveRowCount:N0}; " +
            $"dirty={report.FinalDirtyRowCount:N0}; " +
            $"max rendered DOM rows={report.MaximumRenderedRows:N0}.");
        Console.WriteLine(
            "PASS means the sheet survived the abuse without data loss or browser/server errors; " +
            "large latency/long-task values are still performance findings, not acceptance." );

        return 0;
    }

    private static OpenPerformanceStageAggregate? GetOpenStageAggregate(
        OpenPerformanceBaselineReport report,
        string name)
    {
        return report.Aggregate.Stages.FirstOrDefault(stage =>
            string.Equals(
                stage.Name,
                name,
                StringComparison.Ordinal));
    }

    private static string GetBrowserMode(E2ETestOptions options)
    {
        if (
            options.Suite == E2ETestSuite.Performance ||
            options.Suite == E2ETestSuite.OpenPerformance ||
            options.Suite == E2ETestSuite.RealUserPerformance)
        {
            return options.Headed
                ? "headed/visible/no-slowmo"
                : "headless/no-slowmo";
        }

        return options.Headed
            ? "headed/visible/no-slowmo"
            : "headless/no-slowmo";
    }

    private static string FindProjectRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);

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
            "Could not locate ERPPrototype.csproj from the E2E runner output directory.");
    }
}
