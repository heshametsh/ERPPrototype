namespace ERPPrototype.IntegrationTests;

internal static class IntegrationTestRunner
{
    public static async Task<int> RunAsync(string[] args)
    {
        var keepDatabase = args.Any(argument =>
            string.Equals(
                argument,
                "--keep-database",
                StringComparison.OrdinalIgnoreCase));

        var includeStress = args.Any(argument =>
            string.Equals(
                argument,
                "--stress",
                StringComparison.OrdinalIgnoreCase));

        Console.WriteLine(
            "ERPPrototype WorkOrder SQL Server integration tests");
        Console.WriteLine(
            "A temporary isolated database will be created.");
        Console.WriteLine(
            $"Suite: {(includeStress ? "Stress" : "Core")}\n");

        await using var database =
            await IntegrationTestDatabase.CreateAsync(keepDatabase);

        Console.WriteLine($"Database: {database.DatabaseName}\n");

        var planTests = new WorkOrderSavePlanBuilderTests();
        var integrationTests = new WorkOrderSaveIntegrationTests(database);

        var cases = new List<(string Name, Func<Task> Execute)>
        {
            (
                "Save plan normalizes editable fields",
                planTests.NormalizesEditableFieldsAsync),
            (
                "Save plan ignores blank rows and preserves new rows",
                planTests.IgnoresBlankRowsAndPreservesNewRowIdentityAsync),
            (
                "Save plan rejects changed and deleted overlap",
                planTests.RejectsChangedAndDeletedSameRecordAsync),
            (
                "Save plan rejects missing RowVersion",
                planTests.RejectsMissingRowVersionAsync),
            (
                "Employee cannot modify another department",
                integrationTests.EmployeeCannotModifyAnotherDepartmentAsync),
            (
                "Global duplicate identity is rejected across departments and years",
                integrationTests.DuplicateIdentityIsGlobalAcrossYearsAndDepartmentsAsync),
            (
                "Stale RowVersion is rejected",
                integrationTests.StaleRowVersionIsRejectedAsync),
            (
                "AssignmentDate routes the work order to the destination year",
                integrationTests.AssignmentDateMovesWorkOrderToDestinationYearAsync),
            (
                "Add, update, and delete return a consistent result",
                integrationTests.AddUpdateDeleteReturnConsistentResultAsync),
            (
                "Database failure rolls back the whole save",
                integrationTests.DatabaseFailureRollsBackWholeSaveAsync)
        };

        if (includeStress)
        {
            cases.Add(
                (
                    "1,000-row add, update, and delete batch remains consistent",
                    integrationTests.LargeBatchOf1000RowsSupportsAddUpdateDeleteAsync));
        }

        var failures = new List<(string Name, Exception Error)>();

        foreach (var testCase in cases)
        {
            try
            {
                await testCase.Execute();
                Console.WriteLine($"[PASS] {testCase.Name}");
            }
            catch (Exception exception)
            {
                failures.Add((testCase.Name, exception));
                Console.WriteLine($"[FAIL] {testCase.Name}");
                Console.WriteLine($"       {exception.Message}");
            }
        }

        Console.WriteLine();
        Console.WriteLine(
            $"Result: {cases.Count - failures.Count}/{cases.Count} passed.");

        if (failures.Count == 0)
        {
            Console.WriteLine(
                includeStress
                    ? "Phase 9.0C SQL Server stress safety net: PASS"
                    : "Phase 8.8-R2 automated save safety net: PASS");

            return 0;
        }

        Console.WriteLine(
            includeStress
                ? "Phase 9.0C SQL Server stress safety net: FAIL"
                : "Phase 8.8-R2 automated save safety net: FAIL");

        foreach (var failure in failures)
        {
            Console.WriteLine();
            Console.WriteLine($"--- {failure.Name} ---");
            Console.WriteLine(failure.Error);
        }

        return 1;
    }
}
