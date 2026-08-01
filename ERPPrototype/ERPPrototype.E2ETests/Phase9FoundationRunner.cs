namespace ERPPrototype.E2ETests;

internal static class Phase9FoundationRunner
{
    public static async Task<int> RunAsync(string[] args)
    {
        try
        {
            var options = E2ETestOptions.Parse(args);
            var projectRoot = FindProjectRoot();
            var artifactDirectory = CreateArtifactDirectory(projectRoot);

            Console.WriteLine("ERPPrototype Phase 9.0 browser foundation test");
            Console.WriteLine("A temporary isolated SQL Server database and local web process will be used.");
            Console.WriteLine($"Browser mode: {(options.Headed ? "headed/visible" : "headless")}");
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
                options.Headed);

            await browserTest.RunAsync();

            Console.WriteLine();
            Console.WriteLine("Result: 4/4 browser checks passed.");
            Console.WriteLine("Phase 9.0 browser automation foundation: PASS");
            Console.WriteLine("The temporary web process was isolated from the developer database.");

            return 0;
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine();
            Console.Error.WriteLine("Phase 9.0 browser automation foundation: FAIL");
            Console.Error.WriteLine(exception);

            return 1;
        }
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

    private static string CreateArtifactDirectory(string projectRoot)
    {
        var directory = Path.Combine(
            projectRoot,
            "ERPPrototype.E2ETests",
            "TestArtifacts",
            DateTime.Now.ToString("yyyyMMdd-HHmmss"));

        Directory.CreateDirectory(directory);
        return directory;
    }
}
