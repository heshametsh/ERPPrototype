namespace ERPPrototype.E2ETests;

internal sealed record E2ETestOptions(
    bool Headed,
    bool KeepDatabase)
{
    public static E2ETestOptions Parse(string[] args)
    {
        var unknownArguments = args
            .Where(argument =>
                !string.Equals(argument, "--headed", StringComparison.OrdinalIgnoreCase) &&
                !string.Equals(argument, "--keep-database", StringComparison.OrdinalIgnoreCase))
            .ToList();

        if (unknownArguments.Count > 0)
        {
            throw new ArgumentException(
                "Unknown E2E option(s): " +
                string.Join(", ", unknownArguments));
        }

        return new E2ETestOptions(
            Headed: args.Any(argument =>
                string.Equals(argument, "--headed", StringComparison.OrdinalIgnoreCase)),
            KeepDatabase: args.Any(argument =>
                string.Equals(argument, "--keep-database", StringComparison.OrdinalIgnoreCase)));
    }
}
