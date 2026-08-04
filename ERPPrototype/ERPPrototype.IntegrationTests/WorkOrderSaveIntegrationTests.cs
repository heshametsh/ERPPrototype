using System.Diagnostics;
using System.Text.Json;
using ERPPrototype.Data;
using ERPPrototype.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace ERPPrototype.IntegrationTests;

internal sealed class WorkOrderSaveIntegrationTests(
    IntegrationTestDatabase database)
{
    private static readonly IReadOnlySet<string> NotesOnly =
        new HashSet<string>(StringComparer.Ordinal)
        {
            WorkOrderFieldRegistry.Notes
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
        attemptedChange.Notes = "unauthorized-change";

        var result = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            2026,
            addedRecords: [],
            changedRecords:
            [
                new WorkOrderChangeSet(
                    attemptedChange,
                    NotesOnly)
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
            "foreign-original",
            stored!.Notes,
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

        await database.UpdateNotesDirectlyAsync(
            original.Id,
            "changed-by-another-session");

        staleAttempt.Notes = "stale-user-change";

        var result = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            2026,
            addedRecords: [],
            changedRecords:
            [
                new WorkOrderChangeSet(
                    staleAttempt,
                    NotesOnly)
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
            "changed-by-another-session",
            stored!.Notes,
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
                Status = "تحت التنفيذ",
                Notes = "direct-database-constraint",
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
        updateAttempt.Notes = "after-update";

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
                    NotesOnly)
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
            "after-update",
            storedUpdate!.Notes,
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
        firstAttempt.Notes = "this-change-must-roll-back";

        var failingAttempt = IntegrationTestDatabase.Clone(failingTarget);
        failingAttempt.Notes = "__FORCE_DB_FAILURE__";

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
                new WorkOrderChangeSet(firstAttempt, NotesOnly),
                new WorkOrderChangeSet(failingAttempt, NotesOnly)
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
            "rollback-first-original",
            storedFirst!.Notes,
            "The first update was committed despite the later failure.");

        TestAssert.Equal(
            "rollback-second-original",
            storedFailing!.Notes,
            "The failing update left a partial database value.");

        TestAssert.Equal(
            0,
            await database.CountIdentityAsync(
                "810000012",
                "412"),
            "The new row was committed despite the failed transaction.");
    }

    public async Task BlankStatusIsAcceptedAndPersistedAsync()
    {
        var addedRecord = CreateNewRecord(
            -2025,
            "810000025",
            "425",
            2026,
            "blank-status-policy");

        addedRecord.Status = string.Empty;

        var result = await database.Service.SaveChangesAsync(
            database.EmployeeAId,
            2026,
            addedRecords: [addedRecord],
            changedRecords: Array.Empty<WorkOrderChangeSet>(),
            deletedRecords: []);

        TestAssert.True(
            result.Succeeded,
            $"Saving a work order with blank Status failed: {result.ErrorMessage}");

        var savedRecord = result.SavedRecords!
            .Single(record =>
                record.WorkOrderNumber == "810000025" &&
                record.WorkTypeCode == "425");

        var stored = await database.ReadWorkOrderAsync(savedRecord.Id);

        TestAssert.NotNull(
            stored,
            "The work order with blank Status was not persisted.");

        TestAssert.Equal(
            string.Empty,
            stored!.Status,
            "Blank Status was replaced with an unexpected value.");
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
                "Permit Notes",
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
            4,
            sameDepartmentOtherYear!.CustomColumns.Count,
            "Custom columns did not remain available across years in the same department.");

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
                    notes: $"stress-add-{index:D4}"))
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
                record.Notes = $"stress-update-{index + 1:D4}";

                return new WorkOrderChangeSet(
                    record,
                    NotesOnly);
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
            Status = saved.Status,
            Notes = saved.Notes,
            CustomValuesJson = saved.CustomValuesJson,
            RowVersion = saved.RowVersion.ToArray()
        };

    private static WorkOrder CreateNewRecord(
        int temporaryId,
        string workOrderNumber,
        string workTypeCode,
        int workYear,
        string notes) =>
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
            Status = "تحت التنفيذ",
            Notes = notes
        };
}
