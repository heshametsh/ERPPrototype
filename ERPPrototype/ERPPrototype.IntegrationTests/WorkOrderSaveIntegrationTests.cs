using System.Diagnostics;
using System.Text.Json;
using ERPPrototype.Data;
using ERPPrototype.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace ERPPrototype.IntegrationTests;

internal sealed class WorkOrderSaveIntegrationTests(
    IntegrationTestDatabase database)
{
    private static readonly IReadOnlySet<string> BasketOnly =
        new HashSet<string>(StringComparer.Ordinal)
        {
            WorkOrderFieldRegistry.Basket
        };

    private static readonly IReadOnlySet<string> AssignmentDateOnly =
        new HashSet<string>(StringComparer.Ordinal)
        {
            WorkOrderFieldRegistry.AssignmentDate
        };

    private static readonly IReadOnlySet<string> FinancialFields =
        new HashSet<string>(StringComparer.Ordinal)
        {
            WorkOrderFieldRegistry.WorkOrderValue,
            WorkOrderFieldRegistry.PartialAmount
        };

    private static readonly IReadOnlySet<string> CustomValuesOnly =
        new HashSet<string>(StringComparer.Ordinal)
        {
            WorkOrderFieldRegistry.CustomValues
        };

    public async Task EmployeeCannotModifyAnotherDepartmentAsync()
    {
        var foreignWorkOrder = await database.SeedWorkOrderAsync(
            database.DepartmentBId,
            database.EmployeeBId,
            "810000001",
            "401",
            2026,
            "foreign-original");

        var attemptedChange = IntegrationTestDatabase.Clone(
            foreignWorkOrder);
        attemptedChange.Busket = WorkOrderBuskets.InspectionBusket;

        var result = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            2026,
            addedRecords: [],
            changedRecords:
            [
                new WorkOrderChangeSet(
                    attemptedChange,
                    BasketOnly)
            ],
            deletedRecords: []);

        TestAssert.False(
            result.Succeeded,
            "A department employee modified another department's work order.");

        TestAssert.True(
            result.FailureType is
                WorkOrderSaveFailureType.Scope or
                WorkOrderSaveFailureType.Concurrency,
            "The cross-department update should be rejected by the server scope boundary.");

        var stored = await database.ReadWorkOrderAsync(
            foreignWorkOrder.Id);

        TestAssert.NotNull(
            stored,
            "The foreign work order disappeared unexpectedly.");

        TestAssert.Equal(
            WorkOrderBuskets.InProgress,
            stored!.Busket,
            "The foreign work order was modified despite the scope check.");
    }

    public async Task DuplicateIdentityIsGlobalAcrossYearsAndDepartmentsAsync()
    {
        await database.SeedWorkOrderAsync(
            database.DepartmentBId,
            database.EmployeeBId,
            "810000002",
            "402",
            2025,
            "existing-global-identity");

        var duplicate = CreateNewRecord(
            -2002,
            "810000002",
            "402",
            2026,
            "duplicate-attempt");

        var result = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            2026,
            addedRecords: [duplicate],
            changedRecords: Array.Empty<WorkOrderChangeSet>(),
            deletedRecords: []);

        TestAssert.False(
            result.Succeeded,
            "A globally duplicated work-order identity was saved.");

        TestAssert.Equal(
            WorkOrderSaveFailureType.Duplicate,
            result.FailureType,
            "The duplicated identity should return Duplicate failure.");

        TestAssert.Equal(
            1,
            result.DuplicateConflicts?.Count ?? 0,
            "The duplicate result should identify the conflicting pair.");

        TestAssert.Equal(
            2025,
            result.DuplicateConflicts![0].ExistingWorkYear ?? -1,
            "The duplicate result should report the existing year.");

        TestAssert.Equal(
            1,
            await database.CountIdentityAsync(
                "810000002",
                "402"),
            "The failed duplicate save inserted another record.");
    }

    public async Task StaleRowVersionIsRejectedAsync()
    {
        var original = await database.SeedWorkOrderAsync(
            database.DepartmentAId,
            database.EmployeeAId,
            "810000003",
            "403",
            2026,
            "original-before-concurrency");

        var staleAttempt = IntegrationTestDatabase.Clone(original);

        await database.UpdateBasketDirectlyAsync(
            original.Id,
            WorkOrderBuskets.EngineeringBusket);

        staleAttempt.Busket = WorkOrderBuskets.InspectionBusket;

        var result = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            2026,
            addedRecords: [],
            changedRecords:
            [
                new WorkOrderChangeSet(
                    staleAttempt,
                    BasketOnly)
            ],
            deletedRecords: []);

        TestAssert.False(
            result.Succeeded,
            "A stale RowVersion update succeeded.");

        TestAssert.Equal(
            WorkOrderSaveFailureType.Concurrency,
            result.FailureType,
            "A stale RowVersion should return Concurrency failure.");

        var stored = await database.ReadWorkOrderAsync(original.Id);

        TestAssert.NotNull(
            stored,
            "The concurrently changed work order disappeared.");

        TestAssert.Equal(
            WorkOrderBuskets.EngineeringBusket,
            stored!.Busket,
            "The stale update overwrote the newer database value.");
    }

    public async Task AssignmentDateMovesWorkOrderToDestinationYearAsync()
    {
        var original = await database.SeedWorkOrderAsync(
            database.DepartmentAId,
            database.EmployeeAId,
            "810000004",
            "404",
            2026,
            "move-year-test");

        var moveAttempt = IntegrationTestDatabase.Clone(original);
        moveAttempt.AssignmentDate = new DateTime(2027, 2, 15);

        var result = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            2026,
            addedRecords: [],
            changedRecords:
            [
                new WorkOrderChangeSet(
                    moveAttempt,
                    AssignmentDateOnly)
            ],
            deletedRecords: []);

        TestAssert.True(
            result.Succeeded,
            $"Moving the work order to 2027 failed: {result.ErrorMessage}");

        var stored = await database.ReadWorkOrderAsync(original.Id);

        TestAssert.NotNull(
            stored,
            "The moved work order was not found.");

        TestAssert.Equal(
            2027,
            stored!.WorkYear,
            "AssignmentDate did not route the work order to 2027.");

        TestAssert.Equal(
            new DateTime(2027, 2, 15),
            stored.AssignmentDate!.Value,
            "The destination AssignmentDate was not saved.");

        TestAssert.True(
            stored.DisplayOrder > 0,
            "The moved work order did not receive a destination display order.");
    }

    public async Task FinancialAmountsSaveAndRemainConsistentAsync()
    {
        var original = await database.SeedWorkOrderAsync(
            database.DepartmentAId,
            database.EmployeeAId,
            "810000022",
            "422",
            2026,
            "financial-save",
            workOrderValue: 100_000m);

        var change = IntegrationTestDatabase.Clone(original);
        change.WorkOrderValue = 1_250_000.565m;
        change.PartialAmount = 250_000.255m;

        var result = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            2026,
            addedRecords: [],
            changedRecords:
            [
                new WorkOrderChangeSet(
                    change,
                    FinancialFields)
            ],
            deletedRecords: []);

        TestAssert.True(
            result.Succeeded,
            $"Saving valid financial amounts failed: {result.ErrorMessage}");

        var stored = await database.ReadWorkOrderAsync(original.Id);
        TestAssert.NotNull(stored, "The financial test row disappeared.");

        TestAssert.Equal(
            (decimal?)1_250_000.57m,
            stored!.WorkOrderValue,
            "Work Order Value was not persisted with the approved rounding rule.");

        TestAssert.Equal(
            (decimal?)250_000.26m,
            stored.PartialAmount,
            "Partial Amount was not persisted with the approved rounding rule.");

        TestAssert.Equal(
            (decimal?)1_000_000.31m,
            WorkOrderFinancialRules.CalculateRemainingAmount(
                stored.WorkOrderValue,
                stored.PartialAmount),
            "Remaining Amount was inconsistent after the database save.");
    }

    public async Task PartialAmountAboveValueIsRejectedWithoutChangingDatabaseAsync()
    {
        var original = await database.SeedWorkOrderAsync(
            database.DepartmentAId,
            database.EmployeeAId,
            "810000023",
            "423",
            2026,
            "financial-rejection",
            workOrderValue: 100_000m,
            partialAmount: 20_000m);

        var invalid = IntegrationTestDatabase.Clone(original);
        invalid.PartialAmount = 100_000.01m;

        var result = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            2026,
            addedRecords: [],
            changedRecords:
            [
                new WorkOrderChangeSet(
                    invalid,
                    FinancialFields)
            ],
            deletedRecords: []);

        TestAssert.False(
            result.Succeeded,
            "A Partial Amount above Work Order Value was saved.");

        TestAssert.Equal(
            WorkOrderSaveFailureType.Validation,
            result.FailureType,
            "The invalid financial relationship should fail validation.");

        var stored = await database.ReadWorkOrderAsync(original.Id);
        TestAssert.NotNull(stored, "The rejected financial row disappeared.");

        TestAssert.Equal(
            (decimal?)20_000m,
            stored!.PartialAmount,
            "The rejected financial change modified the database.");
    }

    public async Task DatabaseConstraintRejectsImpossibleFinancialAmountsAsync()
    {
        await using var dbContext =
            await database.Factory.CreateDbContextAsync();

        dbContext.WorkOrders.Add(
            new WorkOrder
            {
                DepartmentId = database.DepartmentAId,
                WorkOrderNumber = "810000024",
                WorkTypeCode = "424",
                WorkYear = 2026,
                DisplayOrder = 24_000_000_000L,
                AssignmentDate = null,
                WorkOrderValue = 100_000m,
                PartialAmount = 100_000.01m,
                Busket = WorkOrderBuskets.InProgress,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = database.EmployeeAId
            });

        var rejected = false;

        try
        {
            await dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            rejected = true;
        }

        TestAssert.True(
            rejected,
            "SQL Server accepted a Partial Amount above Work Order Value.");

        TestAssert.Equal(
            0,
            await database.CountIdentityAsync("810000024", "424"),
            "The database constraint failure left an invalid financial row behind.");
    }

    public async Task AddUpdateDeleteReturnConsistentResultAsync()
    {
        var updateTarget = await database.SeedWorkOrderAsync(
            database.DepartmentAId,
            database.EmployeeAId,
            "810000005",
            "405",
            2026,
            "before-update");

        var deleteTarget = await database.SeedWorkOrderAsync(
            database.DepartmentAId,
            database.EmployeeAId,
            "810000006",
            "406",
            2026,
            "before-delete");

        var updateAttempt = IntegrationTestDatabase.Clone(updateTarget);
        updateAttempt.Busket = WorkOrderBuskets.InspectionBusket;

        var deleteAttempt = IntegrationTestDatabase.Clone(deleteTarget);

        var addedRecord = CreateNewRecord(
            -2007,
            "810000007",
            "407",
            2026,
            "new-row");

        var result = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            2026,
            addedRecords: [addedRecord],
            changedRecords:
            [
                new WorkOrderChangeSet(
                    updateAttempt,
                    BasketOnly)
            ],
            deletedRecords: [deleteAttempt]);

        TestAssert.True(
            result.Succeeded,
            $"The mixed add/update/delete save failed: {result.ErrorMessage}");

        TestAssert.Equal(
            2,
            result.SavedRecords?.Count ?? 0,
            "The mixed save should return one added and one updated record.");

        TestAssert.Contains(
            result.DeletedRecordIds ?? [],
            deleteTarget.Id,
            "The mixed save result did not include the deleted Id.");

        var storedUpdate = await database.ReadWorkOrderAsync(
            updateTarget.Id);

        TestAssert.NotNull(
            storedUpdate,
            "The updated work order disappeared.");

        TestAssert.Equal(
            WorkOrderBuskets.InspectionBusket,
            storedUpdate!.Busket,
            "The changed work order was not updated.");

        TestAssert.True(
            await database.ReadWorkOrderAsync(deleteTarget.Id) is null,
            "The selected work order was not deleted.");

        TestAssert.Equal(
            1,
            await database.CountIdentityAsync(
                "810000007",
                "407"),
            "The added work order was not persisted exactly once.");

        var addedResult = result.SavedRecords!
            .Single(record =>
                record.WorkOrderNumber == "810000007" &&
                record.WorkTypeCode == "407");

        TestAssert.True(
            addedResult.Id > 0,
            "The added row did not receive a database Id.");

        TestAssert.Equal(
            database.DepartmentAId,
            (await database.ReadWorkOrderAsync(addedResult.Id))!.DepartmentId,
            "The new work order was not scoped to the employee's department.");
    }

    public async Task DatabaseFailureRollsBackWholeSaveAsync()
    {
        var firstTarget = await database.SeedWorkOrderAsync(
            database.DepartmentAId,
            database.EmployeeAId,
            "810000008",
            "408",
            2026,
            "rollback-first-original");

        var failingTarget = await database.SeedWorkOrderAsync(
            database.DepartmentAId,
            database.EmployeeAId,
            "810000009",
            "409",
            2026,
            "rollback-second-original");

        await database.InstallForcedFailureConstraintAsync();

        var firstAttempt = IntegrationTestDatabase.Clone(firstTarget);
        firstAttempt.Busket = WorkOrderBuskets.InspectionBusket;

        var failingAttempt = IntegrationTestDatabase.Clone(failingTarget);
        failingAttempt.Busket = WorkOrderBuskets.EngineeringBusket;

        var addedDuringFailedSave = CreateNewRecord(
            -2012,
            "810000012",
            "412",
            2026,
            "this-add-must-roll-back");

        var result = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            2026,
            addedRecords: [addedDuringFailedSave],
            changedRecords:
            [
                new WorkOrderChangeSet(firstAttempt, BasketOnly),
                new WorkOrderChangeSet(failingAttempt, BasketOnly)
            ],
            deletedRecords: []);

        TestAssert.False(
            result.Succeeded,
            "The forced database failure unexpectedly succeeded.");

        TestAssert.Equal(
            WorkOrderSaveFailureType.Database,
            result.FailureType,
            "The forced SQL constraint failure should return Database failure.");

        var storedFirst = await database.ReadWorkOrderAsync(firstTarget.Id);
        var storedFailing = await database.ReadWorkOrderAsync(failingTarget.Id);

        TestAssert.NotNull(
            storedFirst,
            "The first rollback target disappeared.");
        TestAssert.NotNull(
            storedFailing,
            "The second rollback target disappeared.");

        TestAssert.Equal(
            WorkOrderBuskets.InProgress,
            storedFirst!.Busket,
            "The first update was committed despite the later failure.");

        TestAssert.Equal(
            WorkOrderBuskets.InProgress,
            storedFailing!.Busket,
            "The failing update left a partial database value.");

        TestAssert.Equal(
            0,
            await database.CountIdentityAsync(
                "810000012",
                "412"),
            "The new row was committed despite the failed transaction.");
    }

    public async Task LegacyStatusAndNotesColumnsAreRemovedAsync()
    {
        TestAssert.Equal(
            0,
            await database.CountLegacyWorkOrderColumnsAsync(),
            "The legacy Status or Notes column still exists in WorkOrders.");
    }

    public async Task CustomColumnsPersistAcrossYearsAndRemainDepartmentScopedAsync()
    {
        const int workYear = 2026;

        var original = await database.SeedWorkOrderAsync(
            database.DepartmentAId,
            database.EmployeeAId,
            "810000029",
            "429",
            workYear,
            "custom-columns-persistence");

        var customColumns = new List<CustomColumnDefinitionInput>
        {
            new(
                0,
                "custom_11111111111111111111111111111111",
                "Permit Reference",
                "Text",
                2_500_000_000_000L),
            new(
                0,
                "custom_22222222222222222222222222222222",
                "Additional Cost",
                "Money",
                3_500_000_000_000L),
            new(
                0,
                "custom_33333333333333333333333333333333",
                "Inspection Date",
                "Date",
                6_500_000_000_000L),
            new(
                0,
                "custom_44444444444444444444444444444444",
                "Meter Count",
                "Number",
                7_500_000_000_000L)
        };

        var changed = IntegrationTestDatabase.Clone(original);
        changed.CustomValuesJson = JsonSerializer.Serialize(
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                [customColumns[0].FieldKey] = "  permit received  ",
                [customColumns[1].FieldKey] = "1,234.567",
                [customColumns[2].FieldKey] = "04/08/2026",
                [customColumns[3].FieldKey] = "0042"
            });

        var result = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            workYear,
            addedRecords: [],
            changedRecords:
            [
                new WorkOrderChangeSet(
                    changed,
                    CustomValuesOnly)
            ],
            deletedRecords: [],
            customColumns: customColumns,
            customColumnsChanged: true);

        TestAssert.True(
            result.Succeeded,
            $"Saving custom columns failed: {result.ErrorMessage}");

        TestAssert.Equal(
            4,
            result.SavedCustomColumns?.Count ?? 0,
            "The save result did not return all custom-column definitions.");

        TestAssert.True(
            result.SavedCustomColumns!.All(column =>
                column.Id > 0 &&
                !string.IsNullOrWhiteSpace(column.RowVersion)),
            "Saved custom-column definitions are missing database identities or RowVersions.");

        var stored = await database.ReadWorkOrderAsync(original.Id);

        TestAssert.NotNull(
            stored,
            "The work order with custom values was not persisted.");

        var storedValues = CustomColumnService.DeserializeValues(
            stored!.CustomValuesJson);

        TestAssert.Equal(
            "permit received",
            storedValues[customColumns[0].FieldKey],
            "The Text custom value was not normalized and persisted.");

        TestAssert.Equal(
            "1234.57",
            storedValues[customColumns[1].FieldKey],
            "The Money custom value was not rounded consistently.");

        TestAssert.Equal(
            "04/08/2026",
            storedValues[customColumns[2].FieldKey],
            "The Date custom value was not persisted as day/month/year.");

        TestAssert.Equal(
            "42",
            storedValues[customColumns[3].FieldKey],
            "The Number custom value was not persisted as a whole number.");

        var sameDepartmentOtherYear =
            await database.Service.LoadSheetAsync(
                database.EmployeeAId,
                2025);

        TestAssert.NotNull(
            sameDepartmentOtherYear,
            "The other-year sheet could not be loaded.");

        TestAssert.Equal(
            0,
            sameDepartmentOtherYear!.CustomColumns.Count,
            "A 2026 custom column leaked into the 2025 sheet.");

        var otherDepartmentSheet =
            await database.Service.LoadSheetAsync(
                database.EmployeeBId,
                workYear);

        TestAssert.NotNull(
            otherDepartmentSheet,
            "The comparison department sheet could not be loaded.");

        TestAssert.Equal(
            0,
            otherDepartmentSheet!.CustomColumns.Count,
            "Custom columns leaked into another department.");
    }

    public async Task CustomColumnLayoutOrderCanRebalanceWithRowVersionProtectionAsync()
    {
        const int workYear = 2026;
        const string firstFieldKey = "custom_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab";
        const string secondFieldKey = "custom_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaac";

        var sheet = await database.Service.LoadSheetAsync(
            database.EmployeeAId,
            workYear);

        TestAssert.NotNull(
            sheet,
            "The sheet could not be loaded before the custom-column rebalance test.");

        var createInputs = sheet!.CustomColumns
            .Select(ToCustomColumnInput)
            .Append(new CustomColumnDefinitionInput(
                0,
                firstFieldKey,
                "Rebalance First",
                "Text",
                5_000_000_000_001L))
            .Append(new CustomColumnDefinitionInput(
                0,
                secondFieldKey,
                "Rebalance Second",
                "Number",
                5_000_000_000_002L))
            .ToList();

        var createResult = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            workYear,
            addedRecords: [],
            changedRecords: Array.Empty<WorkOrderChangeSet>(),
            deletedRecords: [],
            customColumns: createInputs,
            customColumnsChanged: true);

        TestAssert.True(
            createResult.Succeeded,
            $"Creating tightly packed custom columns failed: {createResult.ErrorMessage}");

        var created = createResult.SavedCustomColumns!;
        var rebalanceInputs = created
            .Select(column => new CustomColumnDefinitionInput(
                column.Id,
                column.FieldKey,
                column.Name,
                column.DataType,
                column.FieldKey switch
                {
                    firstFieldKey => 5_333_333_333_333L,
                    secondFieldKey => 5_666_666_666_666L,
                    _ => column.LayoutOrder
                },
                column.RowVersion))
            .ToList();

        var rebalanceResult = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            workYear,
            addedRecords: [],
            changedRecords: Array.Empty<WorkOrderChangeSet>(),
            deletedRecords: [],
            customColumns: rebalanceInputs,
            customColumnsChanged: true);

        TestAssert.True(
            rebalanceResult.Succeeded,
            $"Rebalancing persisted custom-column positions failed: {rebalanceResult.ErrorMessage}");

        var rebalanced = rebalanceResult.SavedCustomColumns!;
        TestAssert.Equal(
            5_333_333_333_333L,
            rebalanced.Single(column => column.FieldKey == firstFieldKey).LayoutOrder,
            "The first persisted custom column did not accept its rebalanced position.");
        TestAssert.Equal(
            5_666_666_666_666L,
            rebalanced.Single(column => column.FieldKey == secondFieldKey).LayoutOrder,
            "The second persisted custom column did not accept its rebalanced position.");

        var staleInputs = rebalanceInputs
            .Select(input => input with
            {
                LayoutOrder = input.FieldKey == firstFieldKey
                    ? 5_250_000_000_000L
                    : input.LayoutOrder
            })
            .ToList();

        var staleResult = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            workYear,
            addedRecords: [],
            changedRecords: Array.Empty<WorkOrderChangeSet>(),
            deletedRecords: [],
            customColumns: staleInputs,
            customColumnsChanged: true);

        TestAssert.False(
            staleResult.Succeeded,
            "A stale Custom Column RowVersion was allowed to move a persisted column.");
        TestAssert.True(
            staleResult.ErrorMessage.Contains("another session", StringComparison.OrdinalIgnoreCase),
            "The stale custom-column move failed for a reason other than RowVersion protection.");
    }

    public async Task DecimalCustomNumberIsRejectedAtomicallyAsync()
    {
        const int workYear = 2026;
        const string fieldKey =
            "custom_55555555555555555555555555555555";

        var original = await database.SeedWorkOrderAsync(
            database.DepartmentAId,
            database.EmployeeAId,
            "810000030",
            "430",
            workYear,
            "custom-number-validation");

        var sheet = await database.Service.LoadSheetAsync(
            database.EmployeeAId,
            workYear);

        TestAssert.NotNull(
            sheet,
            "The sheet could not be loaded before custom Number validation.");

        var customColumns = sheet!.CustomColumns
            .Select(column => new CustomColumnDefinitionInput(
                column.Id,
                column.FieldKey,
                column.Name,
                column.DataType,
                column.LayoutOrder,
                column.RowVersion))
            .Append(new CustomColumnDefinitionInput(
                0,
                fieldKey,
                "Invalid Decimal Number",
                "Number",
                8_500_000_000_000L))
            .ToList();

        var changed = IntegrationTestDatabase.Clone(original);
        changed.CustomValuesJson = JsonSerializer.Serialize(
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                [fieldKey] = "12.5"
            });

        var result = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            workYear,
            addedRecords: [],
            changedRecords:
            [
                new WorkOrderChangeSet(
                    changed,
                    CustomValuesOnly)
            ],
            deletedRecords: [],
            customColumns: customColumns,
            customColumnsChanged: true);

        TestAssert.False(
            result.Succeeded,
            "A decimal value was accepted by a Number custom column.");

        TestAssert.Equal(
            WorkOrderSaveFailureType.Validation,
            result.FailureType,
            "A decimal Number should return a validation failure.");

        var stored = await database.ReadWorkOrderAsync(original.Id);

        TestAssert.NotNull(
            stored,
            "The work order disappeared after custom Number validation failed.");

        TestAssert.Equal(
            "{}",
            stored!.CustomValuesJson,
            "The invalid custom value was partially persisted.");

        var reloadedSheet = await database.Service.LoadSheetAsync(
            database.EmployeeAId,
            workYear);

        TestAssert.False(
            reloadedSheet!.CustomColumns.Any(column =>
                column.FieldKey == fieldKey),
            "The custom column definition was persisted even though its row value failed validation.");
    }

    public async Task CustomColumnRenamePersistsAsync()
    {
        const int workYear = 2026;
        const string fieldKey =
            "custom_66666666666666666666666666666666";

        var sheet = await database.Service.LoadSheetAsync(
            database.EmployeeAId,
            workYear);

        TestAssert.NotNull(
            sheet,
            "The sheet could not be loaded before adding the custom column.");

        var withNewColumn = sheet!.CustomColumns
            .Select(ToCustomColumnInput)
            .Append(new CustomColumnDefinitionInput(
                0,
                fieldKey,
                "Temporary Text",
                "Text",
                1_500_000_000_000L))
            .ToList();

        var addResult = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            workYear,
            addedRecords: [],
            changedRecords: Array.Empty<WorkOrderChangeSet>(),
            deletedRecords: [],
            customColumns: withNewColumn,
            customColumnsChanged: true);

        TestAssert.True(
            addResult.Succeeded,
            $"Adding the custom column failed: {addResult.ErrorMessage}");

        var renamedColumns = addResult.SavedCustomColumns!
            .Select(column => new CustomColumnDefinitionInput(
                column.Id,
                column.FieldKey,
                column.FieldKey == fieldKey
                    ? "Permit Reference Renamed"
                    : column.Name,
                column.DataType,
                column.LayoutOrder,
                column.RowVersion))
            .ToList();

        var updateResult = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            workYear,
            addedRecords: [],
            changedRecords: Array.Empty<WorkOrderChangeSet>(),
            deletedRecords: [],
            customColumns: renamedColumns,
            customColumnsChanged: true);

        TestAssert.True(
            updateResult.Succeeded,
            $"Renaming the custom column failed: {updateResult.ErrorMessage}");

        var updatedColumn = updateResult.SavedCustomColumns!
            .Single(column => column.FieldKey == fieldKey);

        TestAssert.Equal(
           "Permit Reference Renamed",
            updatedColumn.Name,
            "The custom column rename was not persisted.");

        TestAssert.Equal(
            "Text",
            updatedColumn.DataType,
            "Renaming the custom column changed its immutable type.");

        var otherYear = await database.Service.LoadSheetAsync(
            database.EmployeeAId,
            2025);

        TestAssert.NotNull(
            otherYear,
            "The other-year sheet could not be loaded after the custom column rename.");

        TestAssert.False(
            otherYear!.CustomColumns.Any(column => column.FieldKey == fieldKey),
            "Renaming a 2026 custom column changed the 2025 catalogue.");
    }

    public async Task CustomColumnTypeIsImmutableAfterCreationAsync()
    {
        const int workYear = 2026;
        const string fieldKey =
            "custom_77777777777777777777777777777777";

        var sheet = await database.Service.LoadSheetAsync(
            database.EmployeeAId,
            workYear);

        TestAssert.NotNull(
            sheet,
            "The sheet could not be loaded before immutable type validation.");

        var columns = sheet!.CustomColumns
            .Select(ToCustomColumnInput)
            .Append(new CustomColumnDefinitionInput(
                0,
                fieldKey,
                "Immutable Text",
                "Text",
                4_500_000_000_000L))
            .ToList();

        var initialSave = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            workYear,
            addedRecords: [],
            changedRecords: Array.Empty<WorkOrderChangeSet>(),
            deletedRecords: [],
            customColumns: columns,
            customColumnsChanged: true);

        TestAssert.True(
            initialSave.Succeeded,
            $"Saving the custom column failed: {initialSave.ErrorMessage}");

        var attemptedTypeChange = initialSave.SavedCustomColumns!
            .Select(column => new CustomColumnDefinitionInput(
                column.Id,
                column.FieldKey,
                column.Name,
                column.FieldKey == fieldKey
                    ? "Number"
                    : column.DataType,
                column.LayoutOrder,
                column.RowVersion))
            .ToList();

        var rejected = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            workYear,
            addedRecords: [],
            changedRecords: Array.Empty<WorkOrderChangeSet>(),
            deletedRecords: [],
            customColumns: attemptedTypeChange,
            customColumnsChanged: true);

        TestAssert.False(
            rejected.Succeeded,
            "A custom column was allowed to change its type after creation.");

        TestAssert.Equal(
            WorkOrderSaveFailureType.Validation,
            rejected.FailureType,
            "An immutable custom-column type change should return a validation failure.");

        var reloaded = await database.Service.LoadSheetAsync(
            database.EmployeeAId,
            workYear);

        TestAssert.NotNull(
            reloaded,
            "The sheet could not be reloaded after the rejected type change.");

        TestAssert.Equal(
            "Text",
            reloaded!.CustomColumns
                .Single(column => column.FieldKey == fieldKey)
                .DataType,
            "The rejected type change partially modified the definition.");
    }

    public async Task CustomColumnDeletionRemovesValuesAcrossDepartmentYearsAsync()
    {
        const string fieldKey =
            "custom_88888888888888888888888888888888";

        var currentYearOrder = await database.SeedWorkOrderAsync(
            database.DepartmentAId,
            database.EmployeeAId,
            "810000032",
            "432",
            2026,
            "custom-delete-current-year");
        var previousYearOrder = await database.SeedWorkOrderAsync(
            database.DepartmentAId,
            database.EmployeeAId,
            "810000033",
            "433",
            2025,
            "custom-delete-previous-year");

        var currentSheet = await database.Service.LoadSheetAsync(
            database.EmployeeAId,
            2026);

        TestAssert.NotNull(
            currentSheet,
            "The current-year sheet could not be loaded before custom deletion.");

        var columns = currentSheet!.CustomColumns
            .Select(ToCustomColumnInput)
            .Append(new CustomColumnDefinitionInput(
                0,
                fieldKey,
                "Temporary Across Years",
                "Text",
                5_500_000_000_000L))
            .ToList();
        var currentChanged = IntegrationTestDatabase.Clone(currentYearOrder);
        currentChanged.CustomValuesJson = JsonSerializer.Serialize(
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                [fieldKey] = "current"
            });

        var createResult = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            2026,
            addedRecords: [],
            changedRecords:
            [
                new WorkOrderChangeSet(
                    currentChanged,
                    CustomValuesOnly)
            ],
            deletedRecords: [],
            customColumns: columns,
            customColumnsChanged: true,
            columnLayouts:
            [
                new DepartmentColumnLayoutInput(
                    0,
                    fieldKey,
                    230)
            ],
            columnLayoutsChanged: true);

        TestAssert.True(
            createResult.Succeeded,
            $"Creating the deletable custom column failed: {createResult.ErrorMessage}");

        var previousSheet = await database.Service.LoadSheetAsync(
            database.EmployeeAId,
            2025);

        TestAssert.NotNull(
            previousSheet,
            "The previous-year sheet could not be loaded before custom deletion.");

        var previousChanged = IntegrationTestDatabase.Clone(previousYearOrder);
        previousChanged.CustomValuesJson = JsonSerializer.Serialize(
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                [fieldKey] = "previous"
            });

        var previousSave = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            2025,
            addedRecords: [],
            changedRecords:
            [
                new WorkOrderChangeSet(
                    previousChanged,
                    CustomValuesOnly)
            ],
            deletedRecords: [],
            customColumns: previousSheet!.CustomColumns
                .Select(ToCustomColumnInput)
                .Append(new CustomColumnDefinitionInput(
                    0,
                    fieldKey,
                    "Temporary Across Years",
                    "Text",
                    5_500_000_000_000L))
                .ToList(),
            customColumnsChanged: true,
            columnLayouts: previousSheet.ColumnLayouts
                .Select(layout => new DepartmentColumnLayoutInput(
                    layout.Id,
                    layout.FieldKey,
                    layout.Width,
                    layout.RowVersion))
                .ToList(),
            columnLayoutsChanged: false);

        TestAssert.True(
            previousSave.Succeeded,
            $"Saving the previous-year custom value failed: {previousSave.ErrorMessage}");

        var deleteInputs = createResult.SavedCustomColumns!
            .Select(column => new CustomColumnDefinitionInput(
                column.Id,
                column.FieldKey,
                column.Name,
                column.DataType,
                column.LayoutOrder,
                column.RowVersion,
                IsDeleted: column.FieldKey == fieldKey))
            .ToList();

        var deleteResult = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            2026,
            addedRecords: [],
            changedRecords: Array.Empty<WorkOrderChangeSet>(),
            deletedRecords: [],
            customColumns: deleteInputs,
            customColumnsChanged: true,
            columnLayouts: [],
            columnLayoutsChanged: false);

        TestAssert.True(
            deleteResult.Succeeded,
            $"Deleting the custom column failed: {deleteResult.ErrorMessage}");

        TestAssert.False(
            deleteResult.SavedCustomColumns!.Any(column =>
                column.FieldKey == fieldKey),
            "The deleted custom-column definition remained in the save result.");

        TestAssert.True(
            deleteResult.SavedColumnLayouts!.Any(layout =>
                layout.FieldKey == fieldKey),
            "The 2025 column lost its shared layout when 2026 was deleted.");

        var storedCurrent = await database.ReadWorkOrderAsync(
            currentYearOrder.Id);
        var storedPrevious = await database.ReadWorkOrderAsync(
            previousYearOrder.Id);

        TestAssert.False(
            CustomColumnService.DeserializeValues(
                storedCurrent!.CustomValuesJson)
                .ContainsKey(fieldKey),
            "Deleting the custom column did not remove its current-year value.");

        TestAssert.Equal(
            "previous",
            CustomColumnService.DeserializeValues(
                storedPrevious!.CustomValuesJson)[fieldKey],
            "Deleting the 2026 custom column removed a 2025 value.");

        var currentAfterDelete = await database.Service.LoadSheetAsync(
            database.EmployeeAId,
            2026);
        var previousAfterDelete = await database.Service.LoadSheetAsync(
            database.EmployeeAId,
            2025);

        TestAssert.False(
            currentAfterDelete!.CustomColumns.Any(column =>
                column.FieldKey == fieldKey),
            "The deleted custom column remained in the current-year sheet.");

        TestAssert.True(
            previousAfterDelete!.CustomColumns.Any(column =>
                column.FieldKey == fieldKey),
            "Deleting the 2026 definition removed the 2025 definition.");
    }


    public async Task DeletingTwoValuedCustomColumnsReturnsImplicitlyAffectedRowAsync()
    {
        const int workYear = 2088;
        const string firstFieldKey = "custom_44444444444444444444444444444444";
        const string secondFieldKey = "custom_55555555555555555555555555555555";

        var workOrder = await database.SeedWorkOrderAsync(
            database.DepartmentAId,
            database.EmployeeAId,
            "810000888",
            "888",
            workYear,
            "two-valued-custom-column-delete");

        var withValues = IntegrationTestDatabase.Clone(workOrder);
        withValues.CustomValuesJson = JsonSerializer.Serialize(
            new Dictionary<string, string>
            {
                [firstFieldKey] = "first-delete-value",
                [secondFieldKey] = "second-delete-value"
            });

        var prepared = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            workYear,
            [],
            [new WorkOrderChangeSet(withValues, CustomValuesOnly)],
            [],
            [
                new CustomColumnDefinitionInput(
                    0,
                    firstFieldKey,
                    "Delete Pair First",
                    "Text",
                    8_880_000_000_000L),
                new CustomColumnDefinitionInput(
                    0,
                    secondFieldKey,
                    "Delete Pair Second",
                    "Text",
                    8_890_000_000_000L)
            ],
            true);

        TestAssert.True(
            prepared.Succeeded,
            $"Preparing the two-valued delete fixture failed: {prepared.ErrorMessage}");

        var persistedBeforeDelete = await database.ReadWorkOrderAsync(workOrder.Id);
        TestAssert.NotNull(
            persistedBeforeDelete,
            "The two-valued delete fixture Work Order disappeared before Delete.");

        var deleteInputs = prepared.SavedCustomColumns!
            .Select(column => new CustomColumnDefinitionInput(
                column.Id,
                column.FieldKey,
                column.Name,
                column.DataType,
                column.LayoutOrder,
                column.RowVersion,
                IsDeleted: column.FieldKey == firstFieldKey ||
                    column.FieldKey == secondFieldKey))
            .ToList();

        var deleted = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            workYear,
            addedRecords: [],
            changedRecords: Array.Empty<WorkOrderChangeSet>(),
            deletedRecords: [],
            customColumns: deleteInputs,
            customColumnsChanged: true,
            columnLayouts: [],
            columnLayoutsChanged: false);

        TestAssert.True(
            deleted.Succeeded,
            $"Deleting two valued Custom Columns failed: {deleted.ErrorMessage}");

        TestAssert.False(
            deleted.SavedCustomColumns!.Any(column =>
                column.FieldKey == firstFieldKey ||
                column.FieldKey == secondFieldKey),
            "One of the deleted Custom Column definitions remained in the Save result.");

        var returnedAffectedRow = deleted.SavedRecords!
            .Single(record => record.Id == workOrder.Id);
        var returnedValues = CustomColumnService.DeserializeValues(
            returnedAffectedRow.CustomValuesJson);

        TestAssert.False(
            returnedValues.ContainsKey(firstFieldKey) ||
            returnedValues.ContainsKey(secondFieldKey),
            "The Save result returned stale values for a row implicitly changed by Custom Column cleanup.");

        var storedAfterDelete = await database.ReadWorkOrderAsync(workOrder.Id);
        TestAssert.NotNull(
            storedAfterDelete,
            "Deleting Custom Columns unexpectedly deleted the owning Work Order.");

        var storedValues = CustomColumnService.DeserializeValues(
            storedAfterDelete!.CustomValuesJson);
        TestAssert.False(
            storedValues.ContainsKey(firstFieldKey) ||
            storedValues.ContainsKey(secondFieldKey),
            "SQL retained a value from one of the two deleted Custom Columns.");

        TestAssert.True(
            !storedAfterDelete.RowVersion.SequenceEqual(
                persistedBeforeDelete!.RowVersion),
            "Deleting two valued Custom Columns did not advance the affected Work Order RowVersion.");
        TestAssert.True(
            returnedAffectedRow.RowVersion.SequenceEqual(
                storedAfterDelete.RowVersion),
            "The Save result did not return the authoritative RowVersion for the implicitly affected Work Order.");
    }


    public async Task MovedWorkOrderCreatesDestinationColumnsAndRemapsValuesAsync()
    {
        const string fieldKey = "custom_99999999999999999999999999999999";
        const string columnName = "Move Permit Reference 810000099";
        var source = await database.SeedWorkOrderAsync(
            database.DepartmentAId, database.EmployeeAId,
            "810000099", "499", 2026, "custom-column-move");
        var sourceColumn = new CustomColumnDefinitionInput(
            0, fieldKey, columnName, "Text", 8_000_000_000_000L);
        var sourceSheet = await database.Service.LoadSheetAsync(
            database.EmployeeAId,
            2026);

        TestAssert.NotNull(
            sourceSheet,
            "The source-year sheet could not be loaded before preparing the move.");

        var sourceColumns = sourceSheet!.CustomColumns
            .Select(ToCustomColumnInput)
            .Append(sourceColumn)
            .ToList();
        var withValue = IntegrationTestDatabase.Clone(source);
        withValue.CustomValuesJson = JsonSerializer.Serialize(
            new Dictionary<string, string> { [fieldKey] = "permit-99" });

        var created = await database.Service.SaveChangesAsync(
            database.EmployeeAId, 2026, [],
            [new WorkOrderChangeSet(withValue, CustomValuesOnly)], [],
            sourceColumns, true);
        TestAssert.True(created.Succeeded, $"Source custom value failed: {created.ErrorMessage}");

        var move = IntegrationTestDatabase.Clone((await database.ReadWorkOrderAsync(source.Id))!);
        move.AssignmentDate = new DateTime(2025, 3, 1);
        var moved = await database.Service.SaveChangesAsync(
            database.EmployeeAId, 2026, [],
            [new WorkOrderChangeSet(move, AssignmentDateOnly)], []);
        TestAssert.True(moved.Succeeded, $"Moving custom value failed: {moved.ErrorMessage}");

        var destination = await database.Service.LoadSheetAsync(database.EmployeeAId, 2025);
        TestAssert.True(destination!.CustomColumns.Any(column =>
            column.Name == columnName && column.DataType == "Text"),
            "The destination custom column was not created.");
        var stored = await database.ReadWorkOrderAsync(source.Id);
        var destinationFieldKey = destination.CustomColumns.Single(column =>
            column.Name == columnName && column.DataType == "Text").FieldKey;
        TestAssert.Equal("permit-99", CustomColumnService.DeserializeValues(
            stored!.CustomValuesJson)[destinationFieldKey],
            "The moved custom value was not remapped to the destination field.");
    }

    public async Task MovedWorkOrderCreatesColumnWhenDestinationYearHasNoCustomDefinitionsAsync()
    {
        const int sourceYear = 2099;
        const int destinationYear = 2098;
        const string fieldKey = "custom_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

        var source = await database.SeedWorkOrderAsync(
            database.DepartmentAId,
            database.EmployeeAId,
            "810000199",
            "599",
            sourceYear,
            "custom-column-empty-destination");

        var sourceColumn = new CustomColumnDefinitionInput(
            0,
            fieldKey,
            "Empty Destination Permit",
            "Text",
            8_100_000_000_000L);

        var withValue = IntegrationTestDatabase.Clone(source);
        withValue.CustomValuesJson = JsonSerializer.Serialize(
            new Dictionary<string, string>
            {
                [fieldKey] = "permit-empty-year"
            });

        var created = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            sourceYear,
            [],
            [new WorkOrderChangeSet(withValue, CustomValuesOnly)],
            [],
            [sourceColumn],
            true);

        TestAssert.True(
            created.Succeeded,
            $"Preparing the empty-destination move failed: {created.ErrorMessage}");

        var destinationBeforeMove = await database.Service.LoadSheetAsync(
            database.EmployeeAId,
            destinationYear);

        TestAssert.Equal(
            0,
            destinationBeforeMove!.CustomColumns.Count,
            "The break test requires a destination year with no custom definitions.");

        var move = IntegrationTestDatabase.Clone(
            (await database.ReadWorkOrderAsync(source.Id))!);
        move.AssignmentDate = new DateTime(destinationYear, 3, 1);

        var moved = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            sourceYear,
            [],
            [new WorkOrderChangeSet(move, AssignmentDateOnly)],
            []);

        TestAssert.True(
            moved.Succeeded,
            $"Moving into a year with no custom definitions failed: {moved.ErrorMessage}");

        var destinationAfterMove = await database.Service.LoadSheetAsync(
            database.EmployeeAId,
            destinationYear);
        var destinationColumn = destinationAfterMove!.CustomColumns.Single(column =>
            column.Name == "Empty Destination Permit" &&
            column.DataType == "Text");
        var stored = await database.ReadWorkOrderAsync(source.Id);

        TestAssert.Equal(
            sourceColumn.LayoutOrder,
            destinationColumn.LayoutOrder,
            "A column auto-created in an empty destination year did not preserve its source-year position.");

        TestAssert.Equal(
            "permit-empty-year",
            CustomColumnService.DeserializeValues(
                stored!.CustomValuesJson)[destinationColumn.FieldKey],
            "The value was not preserved when the destination year started with no custom definitions.");
    }

    public async Task MovedRowsReuseSingleDestinationColumnWhenNameTypeConflictsAsync()
    {
        const int sourceYear = 2097;
        const int destinationYear = 2096;
        const string sourceFieldKey = "custom_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
        const string conflictFieldKey = "custom_cccccccccccccccccccccccccccccccc";

        var destinationConflict = new CustomColumnDefinitionInput(
            0,
            conflictFieldKey,
            "Permit Reference",
            "Money",
            8_200_000_000_000L);

        var conflictCreated = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            destinationYear,
            [],
            [],
            [],
            [destinationConflict],
            true);

        TestAssert.True(
            conflictCreated.Succeeded,
            $"Preparing the destination type conflict failed: {conflictCreated.ErrorMessage}");

        var first = await database.SeedWorkOrderAsync(
            database.DepartmentAId,
            database.EmployeeAId,
            "810000297",
            "697",
            sourceYear,
            "custom-column-conflict-batch-1");
        var second = await database.SeedWorkOrderAsync(
            database.DepartmentAId,
            database.EmployeeAId,
            "810000397",
            "797",
            sourceYear,
            "custom-column-conflict-batch-2");

        var sourceColumn = new CustomColumnDefinitionInput(
            0,
            sourceFieldKey,
            "Permit Reference",
            "Text",
            8_300_000_000_000L);
        var firstWithValue = IntegrationTestDatabase.Clone(first);
        firstWithValue.CustomValuesJson = JsonSerializer.Serialize(
            new Dictionary<string, string>
            {
                [sourceFieldKey] = "permit-first"
            });
        var secondWithValue = IntegrationTestDatabase.Clone(second);
        secondWithValue.CustomValuesJson = JsonSerializer.Serialize(
            new Dictionary<string, string>
            {
                [sourceFieldKey] = "permit-second"
            });

        var sourcePrepared = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            sourceYear,
            [],
            [
                new WorkOrderChangeSet(firstWithValue, CustomValuesOnly),
                new WorkOrderChangeSet(secondWithValue, CustomValuesOnly)
            ],
            [],
            [sourceColumn],
            true);

        TestAssert.True(
            sourcePrepared.Succeeded,
            $"Preparing the source batch failed: {sourcePrepared.ErrorMessage}");

        var firstMove = IntegrationTestDatabase.Clone(
            (await database.ReadWorkOrderAsync(first.Id))!);
        firstMove.AssignmentDate = new DateTime(destinationYear, 4, 1);
        var secondMove = IntegrationTestDatabase.Clone(
            (await database.ReadWorkOrderAsync(second.Id))!);
        secondMove.AssignmentDate = new DateTime(destinationYear, 4, 2);

        var moved = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            sourceYear,
            [],
            [
                new WorkOrderChangeSet(firstMove, AssignmentDateOnly),
                new WorkOrderChangeSet(secondMove, AssignmentDateOnly)
            ],
            []);

        TestAssert.True(
            moved.Succeeded,
            $"Moving the conflicting batch failed: {moved.ErrorMessage}");

        var destination = await database.Service.LoadSheetAsync(
            database.EmployeeAId,
            destinationYear);
        var safeTextColumns = destination!.CustomColumns
            .Where(column =>
                column.DataType == "Text" &&
                column.Name.StartsWith(
                    $"Permit Reference ({sourceYear})",
                    StringComparison.OrdinalIgnoreCase))
            .ToList();

        TestAssert.Equal(
            1,
            safeTextColumns.Count,
            "A multi-row move resolved the same destination column more than once.");
        TestAssert.Equal(
            sourceColumn.LayoutOrder,
            safeTextColumns.Single().LayoutOrder,
            "A name/type conflict changed the source column's layout position even though that position was free.");

        var sharedFieldKey = safeTextColumns.Single().FieldKey;
        var storedFirst = await database.ReadWorkOrderAsync(first.Id);
        var storedSecond = await database.ReadWorkOrderAsync(second.Id);

        TestAssert.Equal(
            "permit-first",
            CustomColumnService.DeserializeValues(
                storedFirst!.CustomValuesJson)[sharedFieldKey],
            "The first moved row did not use the shared destination column.");
        TestAssert.Equal(
            "permit-second",
            CustomColumnService.DeserializeValues(
                storedSecond!.CustomValuesJson)[sharedFieldKey],
            "The second moved row did not use the shared destination column.");
    }

    private static CustomColumnDefinitionInput ToCustomColumnInput(
        CustomColumnDefinitionData column) =>
        new(
            column.Id,
            column.FieldKey,
            column.Name,
            column.DataType,
            column.LayoutOrder,
            column.RowVersion);

    public async Task MovedWorkOrderReusesCompatibleDestinationColumnAsync()
    {
        const int sourceYear = 2095;
        const int destinationYear = 2094;
        const string sourceFieldKey = "custom_dddddddddddddddddddddddddddddddd";
        const string destinationFieldKey = "custom_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
        const string columnName = "Reusable Permit Reference";

        var destinationCreated = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            destinationYear,
            [],
            [],
            [],
            [
                new CustomColumnDefinitionInput(
                    0,
                    destinationFieldKey,
                    columnName,
                    "Text",
                    8_400_000_000_000L)
            ],
            true);

        TestAssert.True(
            destinationCreated.Succeeded,
            $"Preparing the compatible destination column failed: {destinationCreated.ErrorMessage}");

        var source = await database.SeedWorkOrderAsync(
            database.DepartmentAId,
            database.EmployeeAId,
            "810000495",
            "895",
            sourceYear,
            "custom-column-compatible-reuse");

        var withValue = IntegrationTestDatabase.Clone(source);
        withValue.CustomValuesJson = JsonSerializer.Serialize(
            new Dictionary<string, string>
            {
                [sourceFieldKey] = "permit-reused"
            });

        var sourcePrepared = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            sourceYear,
            [],
            [new WorkOrderChangeSet(withValue, CustomValuesOnly)],
            [],
            [
                new CustomColumnDefinitionInput(
                    0,
                    sourceFieldKey,
                    columnName,
                    "Text",
                    8_500_000_000_000L)
            ],
            true);

        TestAssert.True(
            sourcePrepared.Succeeded,
            $"Preparing the source compatible column failed: {sourcePrepared.ErrorMessage}");

        var move = IntegrationTestDatabase.Clone(
            (await database.ReadWorkOrderAsync(source.Id))!);
        move.AssignmentDate = new DateTime(destinationYear, 5, 1);

        var moved = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            sourceYear,
            [],
            [new WorkOrderChangeSet(move, AssignmentDateOnly)],
            []);

        TestAssert.True(
            moved.Succeeded,
            $"Moving into a compatible destination column failed: {moved.ErrorMessage}");

        var destination = await database.Service.LoadSheetAsync(
            database.EmployeeAId,
            destinationYear);
        var compatibleColumns = destination!.CustomColumns
            .Where(column =>
                column.Name == columnName &&
                column.DataType == "Text")
            .ToList();

        TestAssert.Equal(
            1,
            compatibleColumns.Count,
            "The move created a duplicate instead of reusing the compatible destination column.");
        TestAssert.Equal(
            destinationFieldKey,
            compatibleColumns.Single().FieldKey,
            "The move did not reuse the existing compatible destination field.");
        TestAssert.Equal(
            8_400_000_000_000L,
            compatibleColumns.Single().LayoutOrder,
            "Reusing a compatible destination column unexpectedly moved its existing layout position.");

        var stored = await database.ReadWorkOrderAsync(source.Id);
        var values = CustomColumnService.DeserializeValues(
            stored!.CustomValuesJson);

        TestAssert.Equal(
            "permit-reused",
            values[destinationFieldKey],
            "The moved value was not remapped into the compatible destination column.");
        TestAssert.False(
            values.ContainsKey(sourceFieldKey),
            "The moved row retained the source-year field key after compatible reuse.");
    }

    public async Task MovedCustomColumnsPreserveRelativeOrderWhenDestinationPositionIsOccupiedAsync()
    {
        const int sourceYear = 2091;
        const int destinationYear = 2090;
        const long firstSourceOrder = 8_700_000_000_000L;
        const long secondSourceOrder = 8_800_000_000_000L;
        const string firstSourceFieldKey = "custom_11111111111111111111111111111111";
        const string secondSourceFieldKey = "custom_22222222222222222222222222222222";
        const string blockingFieldKey = "custom_33333333333333333333333333333333";
        const string firstColumnName = "Moved Layout First";
        const string secondColumnName = "Moved Layout Second";
        const string blockingColumnName = "Destination Existing Slot";

        var destinationPrepared = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            destinationYear,
            [],
            [],
            [],
            [
                new CustomColumnDefinitionInput(
                    0,
                    blockingFieldKey,
                    blockingColumnName,
                    "Text",
                    firstSourceOrder)
            ],
            true);

        TestAssert.True(
            destinationPrepared.Succeeded,
            $"Preparing the occupied destination position failed: {destinationPrepared.ErrorMessage}");

        var source = await database.SeedWorkOrderAsync(
            database.DepartmentAId,
            database.EmployeeAId,
            "810000691",
            "091",
            sourceYear,
            "custom-column-layout-order-collision");

        var sourceWithValues = IntegrationTestDatabase.Clone(source);
        sourceWithValues.CustomValuesJson = JsonSerializer.Serialize(
            new Dictionary<string, string>
            {
                [firstSourceFieldKey] = "first-layout-value",
                [secondSourceFieldKey] = "second-layout-value"
            });

        var sourcePrepared = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            sourceYear,
            [],
            [new WorkOrderChangeSet(sourceWithValues, CustomValuesOnly)],
            [],
            [
                new CustomColumnDefinitionInput(
                    0,
                    firstSourceFieldKey,
                    firstColumnName,
                    "Text",
                    firstSourceOrder),
                new CustomColumnDefinitionInput(
                    0,
                    secondSourceFieldKey,
                    secondColumnName,
                    "Text",
                    secondSourceOrder)
            ],
            true);

        TestAssert.True(
            sourcePrepared.Succeeded,
            $"Preparing the source layout-order move failed: {sourcePrepared.ErrorMessage}");

        var move = IntegrationTestDatabase.Clone(
            (await database.ReadWorkOrderAsync(source.Id))!);
        move.AssignmentDate = new DateTime(destinationYear, 7, 1);

        var moved = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            sourceYear,
            [],
            [new WorkOrderChangeSet(move, AssignmentDateOnly)],
            []);

        TestAssert.True(
            moved.Succeeded,
            $"Moving custom columns into an occupied destination position failed: {moved.ErrorMessage}");

        var destination = await database.Service.LoadSheetAsync(
            database.EmployeeAId,
            destinationYear);
        var blockingColumn = destination!.CustomColumns.Single(column =>
            column.Name == blockingColumnName);
        var firstMovedColumn = destination.CustomColumns.Single(column =>
            column.Name == firstColumnName);
        var secondMovedColumn = destination.CustomColumns.Single(column =>
            column.Name == secondColumnName);

        TestAssert.Equal(
            firstSourceOrder,
            blockingColumn.LayoutOrder,
            "Resolving a moved-column position changed the existing destination column.");
        TestAssert.True(
            firstMovedColumn.LayoutOrder != firstSourceOrder,
            "The moved column reused an occupied destination layout position.");
        TestAssert.Equal(
            secondSourceOrder,
            secondMovedColumn.LayoutOrder,
            "The second moved column did not preserve its free source-year position.");
        TestAssert.True(
            firstMovedColumn.LayoutOrder < secondMovedColumn.LayoutOrder,
            "Two auto-created moved columns did not preserve their source-year relative order.");

        var stored = await database.ReadWorkOrderAsync(source.Id);
        var storedValues = CustomColumnService.DeserializeValues(
            stored!.CustomValuesJson);

        TestAssert.Equal(
            "first-layout-value",
            storedValues[firstMovedColumn.FieldKey],
            "The first moved value was not remapped after resolving the occupied layout position.");
        TestAssert.Equal(
            "second-layout-value",
            storedValues[secondMovedColumn.FieldKey],
            "The second moved value was not remapped after resolving the occupied layout position.");
    }

    public async Task BlankMovedCustomValueDoesNotCreateDestinationColumnAsync()
    {
        const int sourceYear = 2093;
        const int destinationYear = 2092;
        const string fieldKey = "custom_ffffffffffffffffffffffffffffffff";
        const string columnName = "Blank Move Permit";

        var source = await database.SeedWorkOrderAsync(
            database.DepartmentAId,
            database.EmployeeAId,
            "810000593",
            "993",
            sourceYear,
            "custom-column-blank-move");

        var sourceColumnCreated = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            sourceYear,
            [],
            [],
            [],
            [
                new CustomColumnDefinitionInput(
                    0,
                    fieldKey,
                    columnName,
                    "Text",
                    8_600_000_000_000L)
            ],
            true);

        TestAssert.True(
            sourceColumnCreated.Succeeded,
            $"Preparing the blank-value source column failed: {sourceColumnCreated.ErrorMessage}");

        var destinationBeforeMove = await database.Service.LoadSheetAsync(
            database.EmployeeAId,
            destinationYear);

        TestAssert.Equal(
            0,
            destinationBeforeMove!.CustomColumns.Count,
            "The blank-value break test requires an empty destination catalogue.");

        var move = IntegrationTestDatabase.Clone(
            (await database.ReadWorkOrderAsync(source.Id))!);
        move.AssignmentDate = new DateTime(destinationYear, 6, 1);

        var moved = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            sourceYear,
            [],
            [new WorkOrderChangeSet(move, AssignmentDateOnly)],
            []);

        TestAssert.True(
            moved.Succeeded,
            $"Moving a row with blank custom values failed: {moved.ErrorMessage}");

        var destinationAfterMove = await database.Service.LoadSheetAsync(
            database.EmployeeAId,
            destinationYear);

        TestAssert.False(
            destinationAfterMove!.CustomColumns.Any(column =>
                column.Name == columnName ||
                column.FieldKey == fieldKey),
            "A blank custom value created an unnecessary destination column.");

        var stored = await database.ReadWorkOrderAsync(source.Id);

        TestAssert.Equal(
            destinationYear,
            stored!.WorkYear,
            "The blank-value row did not move to the destination year.");
        TestAssert.Equal(
            0,
            CustomColumnService.DeserializeValues(
                stored.CustomValuesJson).Count,
            "The blank-value row gained custom data during the move.");
    }
    public async Task YearScopedColumnVisibilityIsIndependentFromLegacyLayoutAsync()
    {
        const int currentYear = 2026;
        const int previousYear = 2025;

        var currentSheet =
            await database.Service.LoadSheetAsync(
                database.EmployeeAId,
                currentYear);

        TestAssert.NotNull(
            currentSheet,
            "The current-year sheet could not be loaded before preparing the legacy visibility fixture.");

        var currentBasketLayout = currentSheet!.ColumnLayouts
            .SingleOrDefault(layout => layout.FieldKey == "basket");
        var legacyLayout = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            currentYear,
            addedRecords: [],
            changedRecords: Array.Empty<WorkOrderChangeSet>(),
            deletedRecords: [],
            customColumns: [],
            customColumnsChanged: false,
            columnLayouts:
            [
                new DepartmentColumnLayoutInput(
                    currentBasketLayout?.Id ?? 0,
                    "basket",
                    320,
                    currentBasketLayout?.RowVersion ?? string.Empty,
                    IsHidden: true)
            ],
            columnLayoutsChanged: true);

        TestAssert.True(
            legacyLayout.Succeeded,
            $"Preparing the legacy hidden-state fixture failed: {legacyLayout.ErrorMessage}");

        await using (var dbContext =
            await database.Factory.CreateDbContextAsync())
        {
            var currentBefore =
                await DepartmentColumnVisibilityService.LoadVisibilityAsync(
                    dbContext,
                    database.DepartmentAId,
                    currentYear);
            var previousBefore =
                await DepartmentColumnVisibilityService.LoadVisibilityAsync(
                    dbContext,
                    database.DepartmentAId,
                    previousYear);

            TestAssert.Equal(
                0,
                currentBefore.Count,
                "Legacy DepartmentColumnLayout.IsHidden leaked into the new Revo visibility source.");
            TestAssert.Equal(
                0,
                previousBefore.Count,
                "The new visibility source did not start all-visible in the previous year.");
        }

        await using (var dbContext =
            await database.Factory.CreateDbContextAsync())
        {
            var prepared =
                await DepartmentColumnVisibilityService.PrepareVisibilityAsync(
                    dbContext,
                    database.DepartmentAId,
                    currentYear,
                    database.EmployeeAId,
                    [
                        new DepartmentColumnVisibilityInput(
                            0,
                            "basket",
                            true)
                    ],
                    visibilityChanged: true,
                    customColumns: []);

            TestAssert.True(
                prepared.Succeeded,
                $"Preparing current-year visibility failed: {prepared.ErrorMessage}");

            await dbContext.SaveChangesAsync();
        }

        await using (var dbContext =
            await database.Factory.CreateDbContextAsync())
        {
            var currentAfter =
                await DepartmentColumnVisibilityService.LoadVisibilityAsync(
                    dbContext,
                    database.DepartmentAId,
                    currentYear);
            var previousAfter =
                await DepartmentColumnVisibilityService.LoadVisibilityAsync(
                    dbContext,
                    database.DepartmentAId,
                    previousYear);

            TestAssert.Equal(
                1,
                currentAfter.Count,
                "The current-year visibility record was not persisted.");
            TestAssert.True(
                currentAfter.Single().IsHidden,
                "Basket was not hidden in the current-year visibility source.");
            TestAssert.Equal(
                "basket",
                currentAfter.Single().FieldKey,
                "The persisted visibility record targeted the wrong field.");
            TestAssert.True(
                currentAfter.Single().Id > 0 &&
                !string.IsNullOrWhiteSpace(currentAfter.Single().RowVersion),
                "The visibility record did not receive database identity and RowVersion.");

            TestAssert.Equal(
                0,
                previousAfter.Count,
                "Hiding Basket in 2026 leaked into 2025.");
        }

        var legacyPreviousYear =
            await database.Service.LoadSheetAsync(
                database.EmployeeAId,
                previousYear);

        TestAssert.True(
            legacyPreviousYear!.ColumnLayouts.Single(layout =>
                layout.FieldKey == "basket").IsHidden,
            "The compatibility slice unexpectedly rewrote the legacy layout record.");
    }

    public async Task YearScopedColumnVisibilityRejectsHideAllAndStaleRowVersionAsync()
    {
        const int workYear = 2027;

        var allCoreFields = new[]
        {
            "workOrderNumber",
            "workTypeCode",
            "assignmentDate",
            "workOrderValue",
            "partialAmount",
            "remainingAmount",
            "basket"
        };

        await using (var dbContext =
            await database.Factory.CreateDbContextAsync())
        {
            var hideAll =
                await DepartmentColumnVisibilityService.PrepareVisibilityAsync(
                    dbContext,
                    database.DepartmentAId,
                    workYear,
                    database.EmployeeAId,
                    allCoreFields
                        .Select(fieldKey =>
                            new DepartmentColumnVisibilityInput(
                                0,
                                fieldKey,
                                true))
                        .ToList(),
                    visibilityChanged: true,
                    customColumns: []);

            TestAssert.False(
                hideAll.Succeeded,
                "The new visibility owner allowed every data column to be hidden.");
        }

        DepartmentColumnVisibilityData firstSaved;

        await using (var dbContext =
            await database.Factory.CreateDbContextAsync())
        {
            var prepared =
                await DepartmentColumnVisibilityService.PrepareVisibilityAsync(
                    dbContext,
                    database.DepartmentAId,
                    workYear,
                    database.EmployeeAId,
                    [
                        new DepartmentColumnVisibilityInput(
                            0,
                            "basket",
                            true)
                    ],
                    visibilityChanged: true,
                    customColumns: []);

            TestAssert.True(
                prepared.Succeeded,
                $"Preparing the visibility RowVersion fixture failed: {prepared.ErrorMessage}");

            await dbContext.SaveChangesAsync();

            firstSaved = DepartmentColumnVisibilityService.MapVisibility(
                prepared.Visibility.Single(item =>
                    item.FieldKey == "basket"));
        }

        await using (var dbContext =
            await database.Factory.CreateDbContextAsync())
        {
            var updated =
                await DepartmentColumnVisibilityService.PrepareVisibilityAsync(
                    dbContext,
                    database.DepartmentAId,
                    workYear,
                    database.EmployeeAId,
                    [
                        new DepartmentColumnVisibilityInput(
                            firstSaved.Id,
                            firstSaved.FieldKey,
                            false,
                            firstSaved.RowVersion)
                    ],
                    visibilityChanged: true,
                    customColumns: []);

            TestAssert.True(
                updated.Succeeded,
                $"Updating the visibility fixture failed: {updated.ErrorMessage}");

            await dbContext.SaveChangesAsync();
        }

        await using (var dbContext =
            await database.Factory.CreateDbContextAsync())
        {
            var stale =
                await DepartmentColumnVisibilityService.PrepareVisibilityAsync(
                    dbContext,
                    database.DepartmentAId,
                    workYear,
                    database.EmployeeAId,
                    [
                        new DepartmentColumnVisibilityInput(
                            firstSaved.Id,
                            firstSaved.FieldKey,
                            true,
                            firstSaved.RowVersion)
                    ],
                    visibilityChanged: true,
                    customColumns: []);

            TestAssert.False(
                stale.Succeeded,
                "A stale visibility RowVersion was accepted.");
        }
    }

    public async Task ColumnLayoutPersistsAcrossYearsAndRemainsDepartmentScopedAsync()
    {
        const int workYear = 2026;

        var result = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            workYear,
            addedRecords: [],
            changedRecords: Array.Empty<WorkOrderChangeSet>(),
            deletedRecords: [],
            customColumns: [],
            customColumnsChanged: false,
            columnLayouts:
            [
                new DepartmentColumnLayoutInput(
                    0,
                    "workOrderNumber",
                    240),
                new DepartmentColumnLayoutInput(
                    0,
                    "basket",
                    320,
                    IsHidden: true)
            ],
            columnLayoutsChanged: true);

        TestAssert.True(
            result.Succeeded,
            $"Saving column layout failed: {result.ErrorMessage}");

        var targetedLayouts = result.SavedColumnLayouts!
            .Where(layout =>
                layout.FieldKey == "workOrderNumber" ||
                layout.FieldKey == "basket")
            .ToList();

        TestAssert.Equal(
            2,
            targetedLayouts.Count,
            "The save result did not return both layouts owned by this test.");

        TestAssert.True(
            targetedLayouts.All(layout =>
                layout.Id > 0 &&
                !string.IsNullOrWhiteSpace(layout.RowVersion)),
            "The layouts owned by this test are missing database identities or RowVersions.");

        TestAssert.True(
            result.SavedColumnLayouts!.Single(layout =>
                layout.FieldKey == "basket").IsHidden,
            "The Basket hidden state was not returned after save.");

        var sameDepartmentOtherYear =
            await database.Service.LoadSheetAsync(
                database.EmployeeAId,
                2025);

        TestAssert.NotNull(
            sameDepartmentOtherYear,
            "The other-year sheet could not be loaded after saving layout.");

        TestAssert.Equal(
            240,
            sameDepartmentOtherYear!.ColumnLayouts.Single(layout =>
                layout.FieldKey == "workOrderNumber").Width,
            "Work Order Number width did not persist across years.");

        var hiddenBasket = sameDepartmentOtherYear.ColumnLayouts.Single(
            layout => layout.FieldKey == "basket");

        TestAssert.Equal(
            320,
            hiddenBasket.Width,
            "Basket width did not persist across years.");

        TestAssert.True(
            hiddenBasket.IsHidden,
            "Basket visibility did not persist across years.");

        var otherDepartmentSheet =
            await database.Service.LoadSheetAsync(
                database.EmployeeBId,
                workYear);

        TestAssert.NotNull(
            otherDepartmentSheet,
            "The comparison department sheet could not be loaded.");

        TestAssert.Equal(
            0,
            otherDepartmentSheet!.ColumnLayouts.Count,
            "Column layout leaked into another department.");

        var currentYearFieldKeys = new HashSet<string>(
            new[]
            {
                "workOrderNumber",
                "workTypeCode",
                "assignmentDate",
                "workOrderValue",
                "partialAmount",
                "remainingAmount",
                "basket"
            },
            StringComparer.Ordinal);
        currentYearFieldKeys.UnionWith(
            result.SavedCustomColumns!
                .Select(column => column.FieldKey));

        var unhiddenLayouts = result.SavedColumnLayouts!
            .Where(layout => currentYearFieldKeys.Contains(layout.FieldKey))
            .Select(layout => new DepartmentColumnLayoutInput(
                layout.Id,
                layout.FieldKey,
                layout.Width,
                layout.RowVersion,
                IsHidden: false))
            .ToList();

        var unhideResult = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            workYear,
            addedRecords: [],
            changedRecords: Array.Empty<WorkOrderChangeSet>(),
            deletedRecords: [],
            customColumns: [],
            customColumnsChanged: false,
            columnLayouts: unhiddenLayouts,
            columnLayoutsChanged: true);

        TestAssert.True(
            unhideResult.Succeeded,
            $"Unhiding the column failed: {unhideResult.ErrorMessage}");

        TestAssert.False(
            unhideResult.SavedColumnLayouts!.Single(layout =>
                layout.FieldKey == "basket").IsHidden,
            "The Basket column remained hidden after the unhide save.");

        var persistedByField = unhideResult.SavedColumnLayouts!
            .ToDictionary(layout => layout.FieldKey, StringComparer.Ordinal);
        var allDataFields = new[]
        {
            "workOrderNumber",
            "workTypeCode",
            "assignmentDate",
            "workOrderValue",
            "partialAmount",
            "remainingAmount",
            "basket"
        }
            .Concat(
                unhideResult.SavedCustomColumns!
                    .Select(column => column.FieldKey))
            .Distinct(StringComparer.Ordinal)
            .ToList();
        var hideEveryColumn = allDataFields
            .Select(fieldKey =>
            {
                persistedByField.TryGetValue(fieldKey, out var persisted);

                return new DepartmentColumnLayoutInput(
                    persisted?.Id ?? 0,
                    fieldKey,
                    persisted?.Width ?? 180,
                    persisted?.RowVersion ?? string.Empty,
                    IsHidden: true);
            })
            .ToList();

        var hideAllResult = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            workYear,
            addedRecords: [],
            changedRecords: Array.Empty<WorkOrderChangeSet>(),
            deletedRecords: [],
            customColumns: [],
            customColumnsChanged: false,
            columnLayouts: hideEveryColumn,
            columnLayoutsChanged: true);

        TestAssert.False(
            hideAllResult.Succeeded,
            "The server allowed every data column to be hidden.");

        TestAssert.Equal(
            WorkOrderSaveFailureType.Validation,
            hideAllResult.FailureType,
            "Hiding every data column should return a validation failure.");
    }

    public async Task InvalidColumnWidthIsRejectedAtomicallyAsync()
    {
        const int workYear = 2026;

        var sheetBeforeFailure = await database.Service.LoadSheetAsync(
            database.EmployeeAId,
            workYear);

        TestAssert.NotNull(
            sheetBeforeFailure,
            "The sheet could not be loaded before width validation.");

        var basketLayoutBeforeFailure = sheetBeforeFailure!.ColumnLayouts
            .SingleOrDefault(layout => layout.FieldKey == "basket");

        var addedRecord = CreateNewRecord(
            -2031,
            "810000034",
            "434",
            workYear,
            "invalid-column-width");

        var result = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            workYear,
            addedRecords: [addedRecord],
            changedRecords: Array.Empty<WorkOrderChangeSet>(),
            deletedRecords: [],
            customColumns: [],
            customColumnsChanged: false,
            columnLayouts:
            [
                new DepartmentColumnLayoutInput(
                    0,
                    "basket",
                    DepartmentColumnLayoutService.MinimumWidth - 1)
            ],
            columnLayoutsChanged: true);

        TestAssert.False(
            result.Succeeded,
            "A column width below the allowed minimum was accepted.");

        TestAssert.Equal(
            WorkOrderSaveFailureType.Validation,
            result.FailureType,
            "An invalid column width should return a validation failure.");

        TestAssert.Equal(
            0,
            await database.CountIdentityAsync("810000034", "434"),
            "The work order was partially persisted after width validation failed.");

        var reloadedSheet = await database.Service.LoadSheetAsync(
            database.EmployeeAId,
            workYear);

        TestAssert.NotNull(
            reloadedSheet,
            "The sheet could not be reloaded after width validation failed.");

        var basketLayoutAfterFailure = reloadedSheet!.ColumnLayouts
            .SingleOrDefault(layout => layout.FieldKey == "basket");

        TestAssert.Equal(
            basketLayoutBeforeFailure?.Id,
            basketLayoutAfterFailure?.Id,
            "The invalid width changed the persisted layout identity.");

        TestAssert.Equal(
            basketLayoutBeforeFailure?.Width,
            basketLayoutAfterFailure?.Width,
            "The invalid width was partially persisted.");

        TestAssert.Equal(
            basketLayoutBeforeFailure?.RowVersion,
            basketLayoutAfterFailure?.RowVersion,
            "The invalid width changed the persisted layout RowVersion.");

        TestAssert.Equal(
            basketLayoutBeforeFailure?.IsHidden,
            basketLayoutAfterFailure?.IsHidden,
            "The invalid width changed the persisted visibility state.");
    }

    public async Task ConcurrentAppendsReceiveDistinctDisplayOrdersAsync()
    {
        const int workYear = 2030;

        await database.SeedWorkOrderAsync(
            database.DepartmentAId,
            database.EmployeeAId,
            "810000026",
            "426",
            workYear,
            "display-order-baseline",
            displayOrder: 10_000_000_000L);

        var barrier = new DisplayOrderQueryBarrierInterceptor(
            participantCount: 2);

        var concurrentService =
            database.CreateServiceWithInterceptors(barrier);

        const long requestedAppendDisplayOrder =
            11_000_000_000L;

        var firstRecord = CreateNewRecord(
            -2027,
            "810000027",
            "427",
            workYear,
            "concurrent-display-order-a");
        firstRecord.DisplayOrder = requestedAppendDisplayOrder;

        var secondRecord = CreateNewRecord(
            -2028,
            "810000028",
            "428",
            workYear,
            "concurrent-display-order-b");
        secondRecord.DisplayOrder = requestedAppendDisplayOrder;

        var results = await Task.WhenAll(
            concurrentService.SaveChangesAsync(
                database.EmployeeAId,
                workYear,
                addedRecords: [firstRecord],
                changedRecords: Array.Empty<WorkOrderChangeSet>(),
                deletedRecords: []),
            concurrentService.SaveChangesAsync(
                database.EmployeeAId,
                workYear,
                addedRecords: [secondRecord],
                changedRecords: Array.Empty<WorkOrderChangeSet>(),
                deletedRecords: []));

        TestAssert.True(
            results.All(result => result.Succeeded),
            "One of the synchronized concurrent saves failed before DisplayOrder uniqueness could be verified.");

        await using var dbContext =
            await database.Factory.CreateDbContextAsync();

        var storedRows = await dbContext.WorkOrders
            .AsNoTracking()
            .Where(workOrder =>
                workOrder.DepartmentId == database.DepartmentAId &&
                workOrder.WorkYear == workYear &&
                (workOrder.WorkOrderNumber == "810000027" ||
                 workOrder.WorkOrderNumber == "810000028"))
            .Select(workOrder => new
            {
                workOrder.WorkOrderNumber,
                workOrder.DisplayOrder
            })
            .OrderBy(workOrder => workOrder.WorkOrderNumber)
            .ToListAsync();

        TestAssert.Equal(
            2,
            storedRows.Count,
            "The two concurrent work orders were not both persisted.");

        var storedDisplayOrders = storedRows
            .Select(workOrder => workOrder.DisplayOrder)
            .Order()
            .ToArray();

        TestAssert.Equal(
            2,
            storedDisplayOrders.Distinct().Count(),
            "Concurrent appends received the same DisplayOrder inside one department and year.");

        TestAssert.Equal(
            requestedAppendDisplayOrder,
            storedDisplayOrders[0],
            "The first available append position was not preserved.");

        TestAssert.Equal(
            requestedAppendDisplayOrder + 1_000_000_000L,
            storedDisplayOrders[1],
            "The second concurrent append was not advanced to the next available position.");
    }

    public async Task LargeBatchOf1000RowsSupportsAddUpdateDeleteAsync()
    {
        const int rowCount = 1_000;
        var currentYear = DateTime.Now.Year;

        var addedRecords = Enumerable.Range(1, rowCount)
            .Select(index =>
                CreateNewRecord(
                    temporaryId: -30_000 - index,
                    workOrderNumber:
                        (830_000_000 + index).ToString("D9"),
                    workTypeCode: "401",
                    workYear: currentYear,
                    scenarioTag: $"stress-add-{index:D4}"))
            .ToArray();

        var addStartedAt = Stopwatch.GetTimestamp();

        var addResult = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            currentYear,
            addedRecords: addedRecords,
            changedRecords: Array.Empty<WorkOrderChangeSet>(),
            deletedRecords: []);

        var addMilliseconds =
            Stopwatch.GetElapsedTime(addStartedAt).TotalMilliseconds;

        TestAssert.True(
            addResult.Succeeded,
            $"Adding 1,000 rows failed: {addResult.ErrorMessage}");

        TestAssert.Equal(
            rowCount,
            addResult.SavedRecords?.Count ?? 0,
            "The 1,000-row add did not return every saved record.");

        TestAssert.Equal(
            rowCount,
            await database.CountWorkOrdersByNumberPrefixAsync("830"),
            "The database did not persist exactly 1,000 stress rows.");

        var changedRecords = addResult.SavedRecords!
            .Select((saved, index) =>
            {
                var record = MapSavedRecord(saved);
                record.Busket = WorkOrderBuskets.InspectionBusket;

                return new WorkOrderChangeSet(
                    record,
                    BasketOnly);
            })
            .ToArray();

        var updateStartedAt = Stopwatch.GetTimestamp();

        var updateResult = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            currentYear,
            addedRecords: [],
            changedRecords: changedRecords,
            deletedRecords: []);

        var updateMilliseconds =
            Stopwatch.GetElapsedTime(updateStartedAt).TotalMilliseconds;

        TestAssert.True(
            updateResult.Succeeded,
            $"Updating 1,000 rows failed: {updateResult.ErrorMessage}");

        TestAssert.Equal(
            rowCount,
            updateResult.SavedRecords?.Count ?? 0,
            "The 1,000-row update did not return every saved record.");

        var deletedRecords = updateResult.SavedRecords!
            .Select(MapSavedRecord)
            .ToArray();

        var deleteStartedAt = Stopwatch.GetTimestamp();

        var deleteResult = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            currentYear,
            addedRecords: [],
            changedRecords: Array.Empty<WorkOrderChangeSet>(),
            deletedRecords: deletedRecords);

        var deleteMilliseconds =
            Stopwatch.GetElapsedTime(deleteStartedAt).TotalMilliseconds;

        TestAssert.True(
            deleteResult.Succeeded,
            $"Deleting 1,000 rows failed: {deleteResult.ErrorMessage}");

        TestAssert.Equal(
            rowCount,
            deleteResult.DeletedRecordIds?.Count ?? 0,
            "The 1,000-row delete did not return every deleted Id.");

        TestAssert.Equal(
            0,
            await database.CountWorkOrdersByNumberPrefixAsync("830"),
            "The stress rows remained after the 1,000-row delete.");

        Console.WriteLine(
            $"       1,000-row service timings: " +
            $"add={addMilliseconds:N1} ms, " +
            $"update={updateMilliseconds:N1} ms, " +
            $"delete={deleteMilliseconds:N1} ms");
    }

    private static WorkOrder MapSavedRecord(
        WorkOrderSavedRecord saved) =>
        new()
        {
            Id = saved.Id,
            WorkOrderNumber = saved.WorkOrderNumber,
            WorkTypeCode = saved.WorkTypeCode,
            WorkYear = saved.WorkYear,
            DisplayOrder = saved.DisplayOrder,
            AssignmentDate = saved.AssignmentDate,
            WorkOrderValue = saved.WorkOrderValue,
            PartialAmount = saved.PartialAmount,
            Busket = saved.Busket,
            CustomValuesJson = saved.CustomValuesJson,
            RowVersion = saved.RowVersion.ToArray()
        };

    private static WorkOrder CreateNewRecord(
        int temporaryId,
        string workOrderNumber,
        string workTypeCode,
        int workYear,
        string scenarioTag) =>
        new()
        {
            Id = temporaryId,
            WorkOrderNumber = workOrderNumber,
            WorkTypeCode = workTypeCode,
            WorkYear = workYear,
            DisplayOrder = 0,
            AssignmentDate = null,
            WorkOrderValue = 125_000m,
            PartialAmount = null,
            Busket = WorkOrderBuskets.InProgress,
            CreatedBy = scenarioTag
        };
}
