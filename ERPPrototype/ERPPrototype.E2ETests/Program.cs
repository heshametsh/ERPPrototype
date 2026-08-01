namespace ERPPrototype.E2ETests;

internal static class Program
{
    public static async Task<int> Main(string[] args) =>
        await Phase9FoundationRunner.RunAsync(args);
}
