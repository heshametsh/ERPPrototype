namespace ERPPrototype.E2ETests;

internal sealed record E2ETestOptions(
    bool Headed,
    bool KeepDatabase,
    E2ETestSuite Suite)
{
    public static E2ETestOptions Parse(string[] args)
    {
        var headed = false;
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
                        "The --suite option requires Smoke or Full.");
                }

                suite = ParseSuite(args[++index]);
                continue;
            }

            throw new ArgumentException(
                $"Unknown E2E option: {argument}");
        }

        return new E2ETestOptions(
            Headed: headed,
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
            $"Unknown E2E suite '{value}'. Use Smoke or Full.");
    }
}
