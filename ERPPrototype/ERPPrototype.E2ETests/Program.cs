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
                        "--revo-gate5b6-regression",
                        StringComparison.OrdinalIgnoreCase)))
        {
            return await Gate5B5TraceRunner.RunAsync(
                "/work-orders-revogrid-gate5b6",
                "Gate 5B-6",
                "gate5b6");
        }

        if (args.Any(
                argument =>
                    string.Equals(
                        argument,
                        "--revo-gate5b7-persistence",
                        StringComparison.OrdinalIgnoreCase)))
        {
            return await Gate5B5TraceRunner.RunAsync(
                "/work-orders-revogrid-gate5b7",
                "Gate 5B-7",
                "gate5b7",
                assertPersistenceIdentity: true);
        }

        if (args.Any(
                argument =>
                    string.Equals(
                        argument,
                        "--revo-gate5b8-selection",
                        StringComparison.OrdinalIgnoreCase)))
        {
            return await Gate5B5TraceRunner.RunAsync(
                "/work-orders-revogrid-gate5b8",
                "Gate 5B-8",
                "gate5b8",
                assertPersistenceIdentity: true,
                assertSelectionContext: true);
        }

        if (args.Any(
                argument =>
                    string.Equals(
                        argument,
                        "--revo-gate5b9-structure",
                        StringComparison.OrdinalIgnoreCase)))
        {
            return await Gate5B9StructureRunner.RunAsync();
        }

        if (args.Any(
                argument =>
                    string.Equals(
                        argument,
                        "--revo-gate5b6-validation",
                        StringComparison.OrdinalIgnoreCase)))
        {
            return await FinancialDiagnosticRunner.RunAsync(
                "/work-orders-revogrid-gate5b6",
                unifiedValidation: true);
        }

        if (args.Any(
                argument =>
                    string.Equals(
                        argument,
                        "--revo-gate5b5-financial-diagnostic",
                        StringComparison.OrdinalIgnoreCase)))
        {
            return await FinancialDiagnosticRunner.RunAsync();
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
