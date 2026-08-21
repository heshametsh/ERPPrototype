namespace ERPPrototype.E2ETests;

internal static class Program
{
    public static async Task<int> Main(string[] args)
    {
        if (args.Any(
                argument =>
                    string.Equals(
                        argument,
                        "--revo-gate5b5-trace",
                        StringComparison.OrdinalIgnoreCase)))
        {
            return await Gate5B5TraceRunner.RunAsync();
        }

        if (args.Any(
                argument =>
                    string.Equals(
                        argument,
                        "--grid-community",
                        StringComparison.OrdinalIgnoreCase)))
        {
            return await RevoGridCommunityAutomationRunner.RunAsync();
        }

        return await Phase9FoundationRunner.RunAsync(args);
    }
}
