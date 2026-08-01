namespace ERPPrototype.E2ETests;

internal sealed class BrowserCheckRecorder
{
    public int PassedCount { get; private set; }

    public void Pass(string description)
    {
        PassedCount++;
        Console.WriteLine($"[PASS] {description}");
    }
}
