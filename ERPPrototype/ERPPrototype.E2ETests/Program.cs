namespace ERPPrototype.E2ETests;

internal static class Program
{
    public static async Task<int> Main(string[] args)
    {
        if (args.Any(
                argument =>
                    string.Equals(
                        argument,
                        "--live-resize-v2-probe",
                        StringComparison.OrdinalIgnoreCase)))
        {
            return await LiveResizeV2ProbeRunner.RunAsync();
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
                    string.Equals(                        argument,
                        "--revo-gate5c1-column-width-focused",
                        StringComparison.OrdinalIgnoreCase)))
        {
            return await Gate5C1ColumnWidthFocusedRunner.RunAsync();
        }

        if (args.Any(
                argument =>
                    string.Equals(
                        argument,
                        "--revo-gate5c1-visibility-focused",
                        StringComparison.OrdinalIgnoreCase)))
        {
            return await Gate5C1VisibilityFocusedRunner.RunAsync();
        }

        if (args.Any(
                argument =>
                    string.Equals(
                        argument,
                        "--revo-empty-sheet",
                        StringComparison.OrdinalIgnoreCase)))
        {
            return await EmptySheetLifecycleRunner.RunAsync();
        }

        if (args.Any(                argument =>
                    string.Equals(
                        argument,
                        "--admin-security-boundary",
                        StringComparison.OrdinalIgnoreCase)))
        {
            return await AdminSecurityBoundaryRunner.RunAsync();
        }

        if (args.Any(
                argument =>
                    string.Equals(
                        argument,
                        "--atomic-year-switch-focused",
                        StringComparison.OrdinalIgnoreCase)))
        {
            return await AtomicYearSwitchFocusedRunner.RunAsync();
        }

        if (args.Any(
                argument =>
                    string.Equals(
                        argument,
                        "--revo-find-focused",
                        StringComparison.OrdinalIgnoreCase)))
        {
            return await FindFocusedRunner.RunAsync();
        }

        if (args.Any(
                argument =>
                    string.Equals(
                        argument,
                        "--revo-open-kpi-focused",
                        StringComparison.OrdinalIgnoreCase)))
        {
            return await OpenKpiFocusedRunner.RunAsync();
        }

        if (args.Any(
                argument =>
                    string.Equals(
                        argument,
                        "--find-seed-manual",
                        StringComparison.OrdinalIgnoreCase)))
        {
            return await FindFocusedRunner.SeedManualDatabaseAsync();
        }

        if (args.Any(
                argument =>
                    string.Equals(
                        argument,
                        "--startup-security",
                        StringComparison.OrdinalIgnoreCase)))
        {
            return await StartupSecurityRunner.RunAsync();
        }

        if (args.Any(                argument =>
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
