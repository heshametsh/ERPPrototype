namespace ERPPrototype.E2ETests;

internal static class Gate5B9ToB11RegressionRunner
{
    public static async Task<int> RunAsync()
    {
        Console.WriteLine("============================================================");
        Console.WriteLine("RevoGrid B9 -> B11 Full Regression");
        Console.WriteLine("One command runs Structure, Selection, and Save journeys together.");
        Console.WriteLine("============================================================");
        Console.WriteLine();

        var failures = new List<string>();

        Console.WriteLine("SCENARIO 1/3 - Structure + History + Selection scope");
        Console.WriteLine("Purpose: prove row/column structural commands still respect Selection and Undo/Redo.");
        var b9 = await Gate5B9StructureRunner.RunAsync();
        if (b9 != 0) failures.Add("B9 Structure");

        Console.WriteLine();
        Console.WriteLine("SCENARIO 2/3 - Selection + Sort + Filter + Virtualization");
        Console.WriteLine("Purpose: prove selected Work Orders survive view movement and obey Filter policy.");
        var b10 = await Gate5B10SelectionRunner.RunAsync();
        if (b10 != 0) failures.Add("B10 Selection");

        Console.WriteLine();
        Console.WriteLine("SCENARIO 3/3 - Save + Editor + History + Filter + Delete identity");
        Console.WriteLine("Purpose: prove Save snapshots coexist with editing, Undo/Redo, Filter, and persisted identity.");
        var b11 = await Gate5B11SaveHandshakeRunner.RunAsync();
        if (b11 != 0) failures.Add("B11 Save handshake");

        Console.WriteLine();
        Console.WriteLine("============================================================");
        if (failures.Count == 0)
        {
            Console.WriteLine("FULL B9 -> B11 REGRESSION: PASS");
            Console.WriteLine("Structure + Selection + Save are compatible in the accepted workflow.");
            Console.WriteLine("============================================================");
            return 0;
        }

        Console.Error.WriteLine("FULL B9 -> B11 REGRESSION: FAILED");
        Console.Error.WriteLine("Failed areas: " + string.Join(", ", failures));
        Console.WriteLine("============================================================");
        return 1;
    }
}
