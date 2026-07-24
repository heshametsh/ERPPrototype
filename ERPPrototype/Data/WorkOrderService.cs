using ERPPrototype.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace ERPPrototype.Data;

public sealed class WorkOrderService(
    IDbContextFactory<ApplicationDbContext> dbFactory,
    ILogger<WorkOrderService> logger)
{
    private const long DisplayOrderStep = 1_000_000_000L;

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
            .OrderBy(workOrder => workOrder.DisplayOrder)
            .ThenBy(workOrder => workOrder.Id)
            .ToListAsync(cancellationToken);

        return new WorkOrderSheetData(
            userScope.DepartmentId,
            userScope.BranchName,
            userScope.DepartmentName,
            workOrders);
    }

    public async Task<WorkOrderSaveResult> SaveChangesAsync(
        string userId,
        IEnumerable<WorkOrder> addedRecords,
        IEnumerable<WorkOrder> changedRecords,
        IEnumerable<WorkOrder> deletedRecords,
        CancellationToken cancellationToken = default)
    {
        // Keep every Id == 0 record. Syncfusion may submit several new rows
        // with Id 0 in one batch, so grouping all new rows by Id would lose data.
        var newRecordCandidates = addedRecords
            .Concat(changedRecords.Where(workOrder => workOrder.Id <= 0))
            .Where(workOrder => !IsCompletelyBlank(workOrder))
            .ToList();

        var newRecords = newRecordCandidates
            .Where(workOrder => workOrder.Id == 0)
            .Concat(
                newRecordCandidates
                    .Where(workOrder => workOrder.Id < 0)
                    .GroupBy(workOrder => workOrder.Id)
                    .Select(group => group.Last()))
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

        var changedIds = existingChangedRecords
            .Select(workOrder => workOrder.Id)
            .ToHashSet();

        var deletedIds = existingDeletedRecords
            .Select(workOrder => workOrder.Id)
            .ToHashSet();

        if (changedIds.Overlaps(deletedIds))
        {
            return WorkOrderSaveResult.ValidationFailure(
                "The same work order cannot be modified and deleted in one save operation.");
        }

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

        var authorizedDepartmentId = await dbContext.Users
            .AsNoTracking()
            .Where(user =>
                user.Id == userId &&
                user.IsActive &&
                user.DepartmentId != null)
            .Select(user => user.DepartmentId)
            .SingleOrDefaultAsync(cancellationToken);

        if (authorizedDepartmentId is null)
        {
            return WorkOrderSaveResult.ScopeFailure(
                "The current user is not authorized to modify work orders.");
        }

        var departmentId = authorizedDepartmentId.Value;

        await using var transaction =
            await dbContext.Database.BeginTransactionAsync(cancellationToken);

        try
        {
            var incomingRecords = newRecords
                .Concat(existingChangedRecords)
                .ToList();

            var duplicateIncomingRecord = incomingRecords
                .GroupBy(workOrder =>
                    CreateDuplicateKey(
                        workOrder.WorkOrderNumber,
                        workOrder.WorkTypeCode))
                .FirstOrDefault(group => group.Count() > 1);

            if (duplicateIncomingRecord is not null)
            {
                var duplicate = duplicateIncomingRecord.First();

                return WorkOrderSaveResult.DuplicateFailure(
                    $"Work Order Number '{duplicate.WorkOrderNumber}' " +
                    $"with Work Type '{duplicate.WorkTypeCode}' " +
                    "is duplicated in the current changes.");
            }

            if (incomingRecords.Count > 0)
            {
                var incomingNumbers = incomingRecords
                    .Select(workOrder => workOrder.WorkOrderNumber)
                    .Distinct()
                    .ToList();

                var possibleConflicts = await dbContext.WorkOrders
                    .AsNoTracking()
                    .Where(workOrder =>
                        workOrder.DepartmentId == departmentId &&
                        incomingNumbers.Contains(workOrder.WorkOrderNumber) &&
                        !changedIds.Contains(workOrder.Id) &&
                        !deletedIds.Contains(workOrder.Id))
                    .Select(workOrder => new
                    {
                        workOrder.WorkOrderNumber,
                        workOrder.WorkTypeCode
                    })
                    .ToListAsync(cancellationToken);

                var existingKeys = possibleConflicts
                    .Select(workOrder =>
                        CreateDuplicateKey(
                            workOrder.WorkOrderNumber,
                            workOrder.WorkTypeCode))
                    .ToHashSet();

                var conflictingRecord = incomingRecords
                    .FirstOrDefault(workOrder =>
                        existingKeys.Contains(
                            CreateDuplicateKey(
                                workOrder.WorkOrderNumber,
                                workOrder.WorkTypeCode)));

                if (conflictingRecord is not null)
                {
                    return WorkOrderSaveResult.DuplicateFailure(
                        $"Work Order Number '{conflictingRecord.WorkOrderNumber}' " +
                        $"with Work Type '{conflictingRecord.WorkTypeCode}' " +
                        "already exists in this department.");
                }
            }

            var utcNow = DateTime.UtcNow;

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
                        "One or more modified work orders are no longer available.");
                }

                var changedById = existingChangedRecords
                    .ToDictionary(workOrder => workOrder.Id);

                foreach (var entity in entitiesToUpdate)
                {
                    ApplyEditableFields(
                        entity,
                        changedById[entity.Id]);

                    entity.UpdatedAt = utcNow;
                    entity.UpdatedBy = userId;
                }
            }

            var nextAppendDisplayOrder =
                await dbContext.WorkOrders
                    .Where(workOrder =>
                        workOrder.DepartmentId == departmentId)
                    .Select(workOrder =>
                        (long?)workOrder.DisplayOrder)
                    .MaxAsync(cancellationToken)
                ?? 0L;

            foreach (var newRecord in newRecords)
            {
                newRecord.Id = 0;
                newRecord.DepartmentId = departmentId;
                newRecord.WorkYear = DateTime.Now.Year;

                // Tabulator supplies the requested position. The temporary
                // Syncfusion fallback page may still submit DisplayOrder = 0,
                // so append those rows safely.
                if (newRecord.DisplayOrder <= 0)
                {
                    nextAppendDisplayOrder += DisplayOrderStep;
                    newRecord.DisplayOrder = nextAppendDisplayOrder;
                }
                else
                {
                    nextAppendDisplayOrder = Math.Max(
                        nextAppendDisplayOrder,
                        newRecord.DisplayOrder);
                }

                newRecord.CreatedAt = utcNow;
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
                "The changes could not be saved. Check for duplicate, linked, or invalid values.");
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

    private static void ApplyEditableFields(
        WorkOrder target,
        WorkOrder source)
    {
        target.WorkOrderNumber = source.WorkOrderNumber;
        target.WorkTypeCode = source.WorkTypeCode;

        if (source.DisplayOrder > 0)
        {
            target.DisplayOrder = source.DisplayOrder;
        }

        target.AssignmentDate = source.AssignmentDate;
        target.Busket = source.Busket;
        target.Status = source.Status;
        target.Notes = source.Notes;
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
        new(
            true,
            WorkOrderSaveFailureType.None,
            string.Empty);

    public static WorkOrderSaveResult ValidationFailure(
        string message) =>
        new(
            false,
            WorkOrderSaveFailureType.Validation,
            message);

    public static WorkOrderSaveResult DuplicateFailure(
        string message) =>
        new(
            false,
            WorkOrderSaveFailureType.Duplicate,
            message);

    public static WorkOrderSaveResult ScopeFailure(
        string message) =>
        new(
            false,
            WorkOrderSaveFailureType.Scope,
            message);

    public static WorkOrderSaveResult DatabaseFailure(
        string message) =>
        new(
            false,
            WorkOrderSaveFailureType.Database,
            message);
}
