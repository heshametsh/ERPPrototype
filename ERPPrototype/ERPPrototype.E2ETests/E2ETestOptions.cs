namespace ERPPrototype.E2ETests;

internal sealed record E2ETestOptions(
    bool Headed,
    bool Observe,
    bool KeepDatabase,
    E2ETestSuite Suite)
{
    public static E2ETestOptions Parse(string[] args)
    {
        var headed = false;
        var observe = false;
        var keepDatabase = false;
        var suite = E2ETestSuite.Full;

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
                    "--observe",
                    StringComparison.OrdinalIgnoreCase))
            {
                observe = true;
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
                if (index + 1 >= args.Length)
                {
                    throw new ArgumentException(
                        "The --suite option requires Smoke, Full, or Stress.");
                }

                suite = ParseSuite(args[++index]);
                continue;
            }

            throw new ArgumentException(
                $"Unknown E2E option: {argument}");
        }

        return new E2ETestOptions(
            Headed: headed,
            Observe: observe,
            KeepDatabase: keepDatabase,
            Suite: suite);
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
            $"Unknown E2E suite '{value}'. Use Smoke, Full, or Stress.");
    }
}
