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
            var rowsPerYear = options.Suite == E2ETestSuite.Performance
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

            if (options.Suite == E2ETestSuite.Performance)
            {
                Console.WriteLine(
                    $"Performance action: {options.PerformanceAction}");
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
                options?.Suite == E2ETestSuite.Performance
                    ? "Phase 9.2D2 deep neutral performance baseline: FAIL"
                    : "Phase 9.2D2 browser automation platform: FAIL");
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

    private static string GetBrowserMode(E2ETestOptions options)
    {
        if (options.Suite == E2ETestSuite.Performance)
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
