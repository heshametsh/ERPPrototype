namespace ERPPrototype.IntegrationTests;

internal static class TestAssert
{
    public static void True(bool condition, string message)
    {
        if (!condition)
        {
            throw new IntegrationTestAssertionException(message);
        }
    }

    public static void False(bool condition, string message) =>
        True(!condition, message);

    public static void Equal<T>(T expected, T actual, string message)
    {
        if (!EqualityComparer<T>.Default.Equals(expected, actual))
        {
            throw new IntegrationTestAssertionException(
                $"{message} Expected: {expected}; actual: {actual}.");
        }
    }

    public static void NotNull<T>(T? value, string message)
        where T : class
    {
        if (value is null)
        {
            throw new IntegrationTestAssertionException(message);
        }
    }

    public static void Contains<T>(
        IEnumerable<T> values,
        T expected,
        string message)
    {
        if (!values.Contains(expected))
        {
            throw new IntegrationTestAssertionException(message);
        }
    }
}

internal sealed class IntegrationTestAssertionException(string message)
    : Exception(message);
