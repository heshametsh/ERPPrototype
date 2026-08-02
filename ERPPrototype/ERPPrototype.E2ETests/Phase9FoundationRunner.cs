namespace ERPPrototype.E2ETests;

internal static class Phase9FoundationRunner
{
    public static async Task<int> RunAsync(string[] args)
    {
        try
        {
            var options = E2ETestOptions.Parse(args);
            var projectRoot = FindProjectRoot();
            var artifactDirectory =
                E2EArtifactManager.CreateRunDirectory(projectRoot);

            Console.WriteLine("ERPPrototype browser automation platform");
            Console.WriteLine(
                "A temporary isolated SQL Server database and local web process will be used.");
            Console.WriteLine(
                $"Browser mode: {GetBrowserMode(options)}");
            Console.WriteLine($"Suite: {options.Suite}");
            Console.WriteLine(
                $"Seed: {E2ETestDatabase.RowsPerYear:N0} rows per year, " +
                $"{E2ETestDatabase.RowsPerYear * 2:N0} total rows");
            Console.WriteLine($"Artifacts: {artifactDirectory}");
            Console.WriteLine();

            await using var database =
                await E2ETestDatabase.CreateAsync(options.KeepDatabase);

            Console.WriteLine($"Database: {database.DatabaseName}");

            await using var application =
                await WebApplicationProcess.StartAsync(
                    projectRoot,
                    database.ConnectionString,
                    artifactDirectory);

            Console.WriteLine($"Application: {application.BaseUri}");

            var browserTest = new Phase9FoundationBrowserTest(
                application.BaseUri,
                database.Seed,
                artifactDirectory,
                options.Headed,
                options.Observe,
                options.Suite);

            var passedChecks = await browserTest.RunAsync();

            Console.WriteLine();
            Console.WriteLine(
                $"Result: {passedChecks}/{browserTest.ExpectedCheckCount} " +
                "browser checks passed.");
            Console.WriteLine(
                $"Phase 9.1D1 {options.Suite} browser suite: PASS");
            Console.WriteLine(
                "The temporary web process was isolated from the developer database.");

            return 0;
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine();
            Console.Error.WriteLine(
                "Phase 9.1D1 browser automation platform: FAIL");
            Console.Error.WriteLine(exception);

            return 1;
        }
    }


    private static string GetBrowserMode(E2ETestOptions options)
    {
        if (options.Observe)
        {
            return "observe/visible/slow";
        }

        return options.Headed
            ? "headed/visible"
            : "headless";
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
