namespace ERPPrototype.IntegrationTests;

internal static class Program
{
    public static Task<int> Main(string[] args) =>
        IntegrationTestRunner.RunAsync(args);
}
