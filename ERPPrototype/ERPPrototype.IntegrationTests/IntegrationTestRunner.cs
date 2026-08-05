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
                "Save plan normalizes and calculates financial amounts",
                planTests.NormalizesAndValidatesFinancialAmountsAsync),
            (
                "Save plan rejects missing or inconsistent financial amounts",
                planTests.RejectsInvalidFinancialAmountsAsync),
            (
                "Unrelated nonfinancial edits do not execute financial rules",
                planTests.UnrelatedNonFinancialEditDoesNotRunFinancialRulesAsync),
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
                "Financial amounts save with consistent rounding and remaining value",
                integrationTests.FinancialAmountsSaveAndRemainConsistentAsync),
            (
                "Partial Amount above Work Order Value is rejected without persistence",
                integrationTests.PartialAmountAboveValueIsRejectedWithoutChangingDatabaseAsync),
            (
                "SQL Server constraints reject impossible financial amounts",
                integrationTests.DatabaseConstraintRejectsImpossibleFinancialAmountsAsync),
            (
                "Add, update, and delete return a consistent result",
                integrationTests.AddUpdateDeleteReturnConsistentResultAsync),
            (
                "Database failure rolls back the whole save",
                integrationTests.DatabaseFailureRollsBackWholeSaveAsync),
            (
                "Legacy Status and Notes columns are removed",
                integrationTests.LegacyStatusAndNotesColumnsAreRemovedAsync),
            (
                "Custom columns persist across years and remain department-scoped",
                integrationTests.CustomColumnsPersistAcrossYearsAndRemainDepartmentScopedAsync),
            (
                "Custom Number rejects decimals atomically",
                integrationTests.DecimalCustomNumberIsRejectedAtomicallyAsync),
            (
                "Custom column rename and empty type change persist",
                integrationTests.CustomColumnRenameAndEmptyTypeChangePersistAsync),
            (
                "Custom column type change is rejected after values exist",
                integrationTests.CustomColumnTypeChangeIsRejectedAfterValuesExistAsync),
            (
                "Custom column deletion removes values across department years",
                integrationTests.CustomColumnDeletionRemovesValuesAcrossDepartmentYearsAsync),
            (
                "Column widths persist across years and remain department-scoped",
                integrationTests.ColumnWidthsPersistAcrossYearsAndRemainDepartmentScopedAsync),
            (
                "Invalid column width is rejected atomically",
                integrationTests.InvalidColumnWidthIsRejectedAtomicallyAsync),
            (
                "Concurrent appends receive distinct DisplayOrder values",
                integrationTests.ConcurrentAppendsReceiveDistinctDisplayOrdersAsync)
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
                "Phase 9.3D legacy-column removal gate: PASS");

            return 0;
        }

        Console.WriteLine(
            "Phase 9.3D legacy-column removal gate: FAIL");

        foreach (var failure in failures)
        {
            Console.WriteLine();
            Console.WriteLine($"--- {failure.Name} ---");
            Console.WriteLine(failure.Error);
        }

        return 1;
    }
}
