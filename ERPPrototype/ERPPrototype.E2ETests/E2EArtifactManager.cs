namespace ERPPrototype.E2ETests;

internal static class E2EArtifactManager
{
    private const int RetainedRunDirectories = 10;

    public static string CreateRunDirectory(string projectRoot)
    {
        var root = Path.Combine(
            projectRoot,
            "ERPPrototype.E2ETests",
            "TestArtifacts");

        Directory.CreateDirectory(root);
        RemoveOldRuns(root);

        var runDirectory = Path.Combine(
            root,
            $"{DateTime.Now:yyyyMMdd-HHmmss-fff}-{Environment.ProcessId}");

        Directory.CreateDirectory(runDirectory);
        return runDirectory;
    }

    private static void RemoveOldRuns(string root)
    {
        var oldRuns = new DirectoryInfo(root)
            .EnumerateDirectories()
            .OrderByDescending(directory => directory.CreationTimeUtc)
            .Skip(RetainedRunDirectories - 1)
            .ToList();

        foreach (var oldRun in oldRuns)
        {
            try
            {
                oldRun.Delete(recursive: true);
            }
            catch (Exception exception)
            {
                Console.Error.WriteLine(
                    $"Warning: could not remove old E2E artifacts at " +
                    $"{oldRun.FullName}: {exception.Message}");
            }
        }
    }
}
