namespace ERPPrototype.E2ETests;

internal sealed record E2ETestOptions(
    bool Headed,
    bool KeepDatabase,
    E2ETestSuite Suite,
    int RowsPerYear,
    PerformanceAction PerformanceAction,
    int PerformanceRuns,
    bool PerformanceDiagnostics)
{
    public const int DefaultRowsPerYear = 1_000;
    public const int DefaultPerformanceRuns = 5;

    public static E2ETestOptions Parse(string[] args)
    {
        var headed = false;
        var keepDatabase = false;
        var suite = E2ETestSuite.Full;
        var rowsPerYear = DefaultRowsPerYear;
        var performanceAction = PerformanceAction.Arrow;
        var performanceRuns = DefaultPerformanceRuns;
        var performanceDiagnostics = false;

        for (var index = 0; index < args.Length; index++)
        {
            var argument = args[index];

            if (string.Equals(
                    argument,
                    "--headed",
                    StringComparison.OrdinalIgnoreCase))
            {
                headed = true;
                continue;
            }

            if (string.Equals(
                    argument,
                    "--keep-database",
                    StringComparison.OrdinalIgnoreCase))
            {
                keepDatabase = true;
                continue;
            }

            if (string.Equals(
                    argument,
                    "--performance-diagnostics",
                    StringComparison.OrdinalIgnoreCase))
            {
                performanceDiagnostics = true;
                continue;
            }

            if (string.Equals(
                    argument,
                    "--smoke",
                    StringComparison.OrdinalIgnoreCase))
            {
                suite = E2ETestSuite.Smoke;
                continue;
            }

            if (string.Equals(
                    argument,
                    "--full",
                    StringComparison.OrdinalIgnoreCase))
            {
                suite = E2ETestSuite.Full;
                continue;
            }

            if (string.Equals(
                    argument,
                    "--stress",
                    StringComparison.OrdinalIgnoreCase))
            {
                suite = E2ETestSuite.Stress;
                continue;
            }

            if (string.Equals(
                    argument,
                    "--performance",
                    StringComparison.OrdinalIgnoreCase))
            {
                suite = E2ETestSuite.Performance;
                continue;
            }

            if (string.Equals(
                    argument,
                    "--open-performance",
                    StringComparison.OrdinalIgnoreCase))
            {
                suite = E2ETestSuite.OpenPerformance;
                continue;
            }

            if (string.Equals(
                    argument,
                    "--real-user-performance",
                    StringComparison.OrdinalIgnoreCase))
            {
                suite = E2ETestSuite.RealUserPerformance;
                continue;
            }

            if (string.Equals(
                    argument,
                    "--torture",
                    StringComparison.OrdinalIgnoreCase))
            {
                suite = E2ETestSuite.Torture;
                continue;
            }

            if (argument.StartsWith(
                    "--suite=",
                    StringComparison.OrdinalIgnoreCase))
            {
                suite = ParseSuite(argument["--suite=".Length..]);
                continue;
            }

            if (string.Equals(
                    argument,
                    "--suite",
                    StringComparison.OrdinalIgnoreCase))
            {
                suite = ParseSuite(
                    ReadRequiredValue(args, ref index, "--suite"));
                continue;
            }

            if (argument.StartsWith(
                    "--rows-per-year=",
                    StringComparison.OrdinalIgnoreCase))
            {
                rowsPerYear = ParseRowsPerYear(
                    argument["--rows-per-year=".Length..]);
                continue;
            }

            if (string.Equals(
                    argument,
                    "--rows-per-year",
                    StringComparison.OrdinalIgnoreCase))
            {
                rowsPerYear = ParseRowsPerYear(
                    ReadRequiredValue(
                        args,
                        ref index,
                        "--rows-per-year"));
                continue;
            }

            if (argument.StartsWith(
                    "--performance-action=",
                    StringComparison.OrdinalIgnoreCase))
            {
                performanceAction = ParsePerformanceAction(
                    argument["--performance-action=".Length..]);
                continue;
            }

            if (string.Equals(
                    argument,
                    "--performance-action",
                    StringComparison.OrdinalIgnoreCase))
            {
                performanceAction = ParsePerformanceAction(
                    ReadRequiredValue(
                        args,
                        ref index,
                        "--performance-action"));
                continue;
            }

            if (argument.StartsWith(
                    "--performance-runs=",
                    StringComparison.OrdinalIgnoreCase))
            {
                performanceRuns = ParsePerformanceRuns(
                    argument["--performance-runs=".Length..]);
                continue;
            }

            if (string.Equals(
                    argument,
                    "--performance-runs",
                    StringComparison.OrdinalIgnoreCase))
            {
                performanceRuns = ParsePerformanceRuns(
                    ReadRequiredValue(
                        args,
                        ref index,
                        "--performance-runs"));
                continue;
            }

            throw new ArgumentException(
                $"Unknown E2E option: {argument}");
        }

        if (
            (suite == E2ETestSuite.Performance ||
             suite == E2ETestSuite.OpenPerformance ||
             suite == E2ETestSuite.RealUserPerformance) &&
            !performanceDiagnostics &&
            performanceRuns < 3)
        {
            throw new ArgumentException(
                "A neutral Performance baseline requires at least 3 independent runs.");
        }

        return new E2ETestOptions(
            Headed: headed,
            KeepDatabase: keepDatabase,
            Suite: suite,
            RowsPerYear: rowsPerYear,
            PerformanceAction: performanceAction,
            PerformanceRuns: performanceRuns,
            PerformanceDiagnostics: performanceDiagnostics);
    }

    private static string ReadRequiredValue(
        string[] args,
        ref int index,
        string optionName)
    {
        if (index + 1 >= args.Length)
        {
            throw new ArgumentException(
                $"The {optionName} option requires a value.");
        }

        return args[++index];
    }

    private static E2ETestSuite ParseSuite(string value)
    {
        if (Enum.TryParse<E2ETestSuite>(
                value,
                ignoreCase: true,
                out var suite))
        {
            return suite;
        }

        throw new ArgumentException(
            $"Unknown E2E suite '{value}'. Use Smoke, Full, Stress, Performance, OpenPerformance, RealUserPerformance, or Torture.");
    }

    private static PerformanceAction ParsePerformanceAction(string value)
    {
        if (Enum.TryParse<PerformanceAction>(
                value,
                ignoreCase: true,
                out var action))
        {
            return action;
        }

        throw new ArgumentException(
            $"Unknown performance action '{value}'. Use Arrow, Enter, or Wheel.");
    }

    private static int ParseRowsPerYear(string value)
    {
        if (!int.TryParse(value, out var rowsPerYear) ||
            rowsPerYear is < 1_000 or > 10_000)
        {
            throw new ArgumentException(
                "Rows per year must be an integer from 1,000 through 10,000.");
        }

        return rowsPerYear;
    }

    private static int ParsePerformanceRuns(string value)
    {
        if (!int.TryParse(value, out var runs) || runs is < 1 or > 10)
        {
            throw new ArgumentException(
                "Performance runs must be an integer from 1 through 10.");
        }

        return runs;
    }
}
