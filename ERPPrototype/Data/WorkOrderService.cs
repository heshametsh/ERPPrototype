using ERPPrototype.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace ERPPrototype.Data;

public sealed class WorkOrderService(
    IDbContextFactory<ApplicationDbContext> dbFactory,
    ILogger<WorkOrderService> logger)
{
    public async Task<WorkOrderSheetData?> LoadSheetAsync(
     string userId,
     CancellationToken cancellationToken = default)
    {
        await using var dbContext =
            await dbFactory.CreateDbContextAsync(cancellationToken);

        var userScope = await dbContext.Users
            .AsNoTracking()
            .Where(user =>
                user.Id == userId &&
                user.IsActive &&
                user.DepartmentId != null)
            .Select(user => new
            {
                DepartmentId = user.DepartmentId!.Value,
                BranchName = user.Department!.Branch.Name,
                DepartmentName = user.Department.DepartmentType.Name
            })
            .SingleOrDefaultAsync(cancellationToken);

        if (userScope is null)
        {
            return null;
        }

        var workOrders = await dbContext.WorkOrders
            .AsNoTracking()
            .Where(workOrder =>
                workOrder.DepartmentId == userScope.DepartmentId)
            .OrderBy(workOrder => workOrder.Id)
            .ToListAsync(cancellationToken);

        return new WorkOrderSheetData(
            userScope.DepartmentId,
            userScope.BranchName,
            userScope.DepartmentName,
            workOrders);
    }

    public async Task<WorkOrderSaveResult> SaveChangesAsync(
        int departmentId,
        string userId,
        IEnumerable<WorkOrder> addedRecords,
        IEnumerable<WorkOrder> changedRecords,
        IEnumerable<WorkOrder> deletedRecords,
        CancellationToken cancellationToken = default)
    {
        var newRecords = addedRecords
            .Concat(changedRecords.Where(workOrder => workOrder.Id <= 0))
            .Where(workOrder => !IsCompletelyBlank(workOrder))
            .GroupBy(workOrder => workOrder.Id)
            .Select(group => group.Last())
            .ToList();

        var existingChangedRecords = changedRecords
            .Where(workOrder => workOrder.Id > 0)
            .GroupBy(workOrder => workOrder.Id)
            .Select(group => group.Last())
            .ToList();

        var existingDeletedRecords = deletedRecords
            .Where(workOrder => workOrder.Id > 0)
            .GroupBy(workOrder => workOrder.Id)
            .Select(group => group.Last())
            .ToList();

        foreach (var workOrder in newRecords)
        {
            NormalizeEditableFields(workOrder);
        }

        foreach (var workOrder in existingChangedRecords)
        {
            NormalizeEditableFields(workOrder);
        }

        var validationError = ValidateRecords(
            newRecords.Concat(existingChangedRecords));

        if (!string.IsNullOrWhiteSpace(validationError))
        {
            return WorkOrderSaveResult.ValidationFailure(validationError);
        }

        await using var dbContext =
            await dbFactory.CreateDbContextAsync(cancellationToken);

        await using var transaction =
            await dbContext.Database.BeginTransactionAsync(cancellationToken);

        try
        {
            var deletedIds = existingDeletedRecords
                .Select(workOrder => workOrder.Id)
                .ToHashSet();

            var databaseRows = await dbContext.WorkOrders
                .AsNoTracking()
                .Where(workOrder =>
                    workOrder.DepartmentId == departmentId)
                .Select(workOrder => new WorkOrderKeySnapshot
                {
                    Id = workOrder.Id,
                    WorkOrderNumber = workOrder.WorkOrderNumber,
                    WorkTypeCode = workOrder.WorkTypeCode
                })
                .ToListAsync(cancellationToken);

            var finalRows = databaseRows
                .Where(workOrder => !deletedIds.Contains(workOrder.Id))
                .ToList();

            foreach (var changedRecord in existingChangedRecords)
            {
                var existingSnapshot = finalRows
                    .SingleOrDefault(workOrder =>
                        workOrder.Id == changedRecord.Id);

                if (existingSnapshot is null)
                {
                    return WorkOrderSaveResult.ScopeFailure(
                        "A modified work order could not be found in this department.");
                }

                existingSnapshot.WorkOrderNumber =
                    changedRecord.WorkOrderNumber;

                existingSnapshot.WorkTypeCode =
                    changedRecord.WorkTypeCode;
            }

            var temporarySnapshotId = -1;

            foreach (var newRecord in newRecords)
            {
                finalRows.Add(new WorkOrderKeySnapshot
                {
                    Id = temporarySnapshotId--,
                    WorkOrderNumber = newRecord.WorkOrderNumber,
                    WorkTypeCode = newRecord.WorkTypeCode
                });
            }

            var duplicateGroup = finalRows
                .GroupBy(workOrder =>
                    CreateDuplicateKey(
                        workOrder.WorkOrderNumber,
                        workOrder.WorkTypeCode))
                .FirstOrDefault(group => group.Count() > 1);

            if (duplicateGroup is not null)
            {
                var duplicate = duplicateGroup.First();

                return WorkOrderSaveResult.DuplicateFailure(
                    $"Work Order Number '{duplicate.WorkOrderNumber}' " +
                    $"with Work Type '{duplicate.WorkTypeCode}' " +
                    "already exists in this department.");
            }

            if (deletedIds.Count > 0)
            {
                var entitiesToDelete = await dbContext.WorkOrders
                    .Where(workOrder =>
                        workOrder.DepartmentId == departmentId &&
                        deletedIds.Contains(workOrder.Id))
                    .ToListAsync(cancellationToken);

                if (entitiesToDelete.Count != deletedIds.Count)
                {
                    return WorkOrderSaveResult.ScopeFailure(
                        "One or more selected work orders do not belong to this department.");
                }

                dbContext.WorkOrders.RemoveRange(entitiesToDelete);
            }

            var changedIds = existingChangedRecords
                .Select(workOrder => workOrder.Id)
                .ToHashSet();

            if (changedIds.Count > 0)
            {
                var entitiesToUpdate = await dbContext.WorkOrders
                    .Where(workOrder =>
                        workOrder.DepartmentId == departmentId &&
                        changedIds.Contains(workOrder.Id))
                    .ToListAsync(cancellationToken);

                if (entitiesToUpdate.Count != changedIds.Count)
                {
                    return WorkOrderSaveResult.ScopeFailure(
                        "One or more modified work orders do not belong to this department.");
                }

                var changedById = existingChangedRecords
                    .ToDictionary(workOrder => workOrder.Id);

                foreach (var entity in entitiesToUpdate)
                {
                    var changedRecord = changedById[entity.Id];

                    entity.WorkOrderNumber = changedRecord.WorkOrderNumber;
                    entity.WorkTypeCode = changedRecord.WorkTypeCode;
                    entity.AssignmentDate = changedRecord.AssignmentDate;
                    entity.Busket = changedRecord.Busket;
                    entity.Status = changedRecord.Status;
                    entity.Notes = changedRecord.Notes;
                    entity.UpdatedAt = DateTime.UtcNow;
                    entity.UpdatedBy = userId;
                }
            }

            foreach (var newRecord in newRecords)
            {
                newRecord.Id = 0;
                newRecord.DepartmentId = departmentId;
                newRecord.WorkYear = DateTime.Now.Year;
                newRecord.CreatedAt = DateTime.UtcNow;
                newRecord.CreatedBy = userId;
                newRecord.UpdatedAt = null;
                newRecord.UpdatedBy = null;

                dbContext.WorkOrders.Add(newRecord);
            }

            await dbContext.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            return WorkOrderSaveResult.Success();
        }
        catch (DbUpdateException exception)
        {
            logger.LogError(
                exception,
                "A database error occurred while saving work orders for department {DepartmentId}.",
                departmentId);

            return WorkOrderSaveResult.DatabaseFailure(
                "The changes could not be saved. Check for duplicate or invalid values.");
        }
    }

    public static bool IsCompletelyBlank(WorkOrder workOrder)
    {
        return
            string.IsNullOrWhiteSpace(workOrder.WorkOrderNumber) &&
            string.IsNullOrWhiteSpace(workOrder.WorkTypeCode) &&
            workOrder.AssignmentDate is null &&
            string.IsNullOrWhiteSpace(workOrder.Busket) &&
            string.IsNullOrWhiteSpace(workOrder.Status) &&
            string.IsNullOrWhiteSpace(workOrder.Notes);
    }

    private static void NormalizeEditableFields(WorkOrder workOrder)
    {
        workOrder.WorkOrderNumber =
            workOrder.WorkOrderNumber?.Trim() ?? string.Empty;

        workOrder.WorkTypeCode =
            workOrder.WorkTypeCode?.Trim() ?? string.Empty;

        workOrder.Busket =
            workOrder.Busket?.Trim() ?? string.Empty;

        workOrder.Status =
            workOrder.Status?.Trim() ?? string.Empty;

        workOrder.Notes = string.IsNullOrWhiteSpace(workOrder.Notes)
            ? null
            : workOrder.Notes.Trim();
    }

    private static string? ValidateRecords(
        IEnumerable<WorkOrder> workOrders)
    {
        foreach (var workOrder in workOrders)
        {
            if (string.IsNullOrWhiteSpace(workOrder.WorkOrderNumber))
            {
                return "Work Order Number is required.";
            }

            if (workOrder.WorkOrderNumber.Length > 50)
            {
                return "Work Order Number cannot exceed 50 characters.";
            }

            if (string.IsNullOrWhiteSpace(workOrder.WorkTypeCode))
            {
                return "Work Type is required.";
            }

            if (workOrder.WorkTypeCode.Length > 20)
            {
                return "Work Type cannot exceed 20 characters.";
            }

            if (string.IsNullOrWhiteSpace(workOrder.Busket))
            {
                return "Busket is required.";
            }

            if (!WorkOrderBuskets.All.Contains(workOrder.Busket))
            {
                return "Select a valid value from the Busket list.";
            }

            if (workOrder.Status?.Length > 150)
            {
                return "Status cannot exceed 150 characters.";
            }

            if (workOrder.Notes?.Length > 1000)
            {
                return "Notes cannot exceed 1000 characters.";
            }
        }

        return null;
    }

    private static string CreateDuplicateKey(
        string workOrderNumber,
        string workTypeCode)
    {
        return string.Concat(
            workOrderNumber.Trim().ToUpperInvariant(),
            "\u001F",
            workTypeCode.Trim().ToUpperInvariant());
    }

    private sealed class WorkOrderKeySnapshot
    {
        public int Id { get; init; }
        public string WorkOrderNumber { get; set; } = string.Empty;
        public string WorkTypeCode { get; set; } = string.Empty;
    }
}

public sealed record WorkOrderSheetData(
    int DepartmentId,
    string BranchName,
    string DepartmentName,
    List<WorkOrder> WorkOrders);

public enum WorkOrderSaveFailureType
{
    None,
    Validation,
    Duplicate,
    Scope,
    Database
}

public sealed record WorkOrderSaveResult(
    bool Succeeded,
    WorkOrderSaveFailureType FailureType,
    string ErrorMessage)
{
    public static WorkOrderSaveResult Success() =>
        new(true, WorkOrderSaveFailureType.None, string.Empty);

    public static WorkOrderSaveResult ValidationFailure(string message) =>
        new(false, WorkOrderSaveFailureType.Validation, message);

    public static WorkOrderSaveResult DuplicateFailure(string message) =>
        new(false, WorkOrderSaveFailureType.Duplicate, message);

    public static WorkOrderSaveResult ScopeFailure(string message) =>
        new(false, WorkOrderSaveFailureType.Scope, message);

    public static WorkOrderSaveResult DatabaseFailure(string message) =>
        new(false, WorkOrderSaveFailureType.Database, message);
}
