namespace ERPPrototype.E2ETests;

internal static class E2ETestAssert
{
    public static void True(bool condition, string message)
    {
        if (!condition)
        {
            throw new InvalidOperationException(message);
        }
    }

    public static void Equal<T>(T expected, T actual, string message)
    {
        if (!EqualityComparer<T>.Default.Equals(expected, actual))
        {
            throw new InvalidOperationException(
                $"{message} Expected: {expected}; actual: {actual}.");
        }
    }

    public static void Contains(
        string expectedSubstring,
        string actual,
        string message)
    {
        if (!actual.Contains(expectedSubstring, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                $"{message} Expected to find '{expectedSubstring}' in '{actual}'.");
        }
    }
}
