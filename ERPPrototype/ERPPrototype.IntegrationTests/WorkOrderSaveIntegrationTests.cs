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
            Busket = WorkOrderBuskets.InProgress,
            Status = "تحت التنفيذ",
            Notes = notes
        };
}
