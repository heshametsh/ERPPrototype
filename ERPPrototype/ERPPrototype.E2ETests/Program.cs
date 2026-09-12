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
                        "--revo-gate5b10-selection",
                        StringComparison.OrdinalIgnoreCase)))
        {
            return await Gate5B10SelectionRunner.RunAsync();
        }

        if (args.Any(
                argument =>
                    string.Equals(
                        argument,
                        "--revo-gate5b11-save",
                        StringComparison.OrdinalIgnoreCase)))
        {
            return await Gate5B11SaveHandshakeRunner.RunAsync();
        }

        if (args.Any(
                argument =>
                    string.Equals(
                        argument,
                        "--revo-b9-b11-full-regression",
                        StringComparison.OrdinalIgnoreCase)))
        {
            return await Gate5B9ToB11RegressionRunner.RunAsync();
        }

        if (args.Any(
                argument =>
                    string.Equals(
                        argument,
                        "--revo-gate5b12-real-db",
                        StringComparison.OrdinalIgnoreCase)))
        {
            return await Gate5B12RealDbSaveRunner.RunAsync();
        }

        if (args.Any(
                argument =>
                    string.Equals(
                        argument,
                        "--revo-gate5c1-rename-focused",
                        StringComparison.OrdinalIgnoreCase)))
        {
            return await Gate5C1RenameFocusedRunner.RunAsync();
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

        if (args.Any(
                argument =>
                    string.Equals(
                        argument,
                        "--revo-employee-real-workday",
                        StringComparison.OrdinalIgnoreCase)))
        {
            return await EmployeeRealWorkdayRunner.RunAsync();
        }
        return await Phase9FoundationRunner.RunAsync(args);
    }
}

