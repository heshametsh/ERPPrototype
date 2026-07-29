using ERPPrototype.Data.Entities;
using System.Diagnostics;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace ERPPrototype.Data;

public sealed class WorkOrderService(
    IDbContextFactory<ApplicationDbContext> dbFactory,
    ILogger<WorkOrderService> logger)
{
    private const long DisplayOrderStep = 1_000_000_000L;
    private const int MinimumWorkYear = 2000;
    private const int MaximumWorkYear = 2100;

    public Task<WorkOrderSheetData?> LoadSheetAsync(
        string userId,
        CancellationToken cancellationToken = default) =>
        LoadSheetAsync(
            userId,
            DateTime.Now.Year,
            cancellationToken);

    public async Task<WorkOrderSheetData?> LoadSheetAsync(
        string userId,
        int workYear,
        CancellationToken cancellationToken = default)
    {
        if (!IsValidWorkYear(workYear))
        {
            throw new ArgumentOutOfRangeException(
                nameof(workYear),
                workYear,
                $"Work year must be between {MinimumWorkYear} and {MaximumWorkYear}.");
        }

        var totalStopwatch = Stopwatch.StartNew();

        await using var dbContext =
            await dbFactory.CreateDbContextAsync(cancellationToken);

        var scopeStopwatch = Stopwatch.StartNew();

        var userScope = await (
            from user in dbContext.Users.AsNoTracking()
            join userRole in dbContext.UserRoles.AsNoTracking()
                on user.Id equals userRole.UserId
            join role in dbContext.Roles.AsNoTracking()
                on userRole.RoleId equals role.Id
            where
                user.Id == userId &&
                user.IsActive &&
                !user.MustChangePassword &&
                user.DepartmentId != null &&
                role.Name == AppRoles.Employee
            select new
            {
                DepartmentId = user.DepartmentId!.Value,
                BranchName = user.Department!.Branch.Name,
                DepartmentName = user.Department.DepartmentType.Name
            })
            .SingleOrDefaultAsync(cancellationToken);

        scopeStopwatch.Stop();

        if (userScope is null)
        {
            return null;
        }

        var yearsStopwatch = Stopwatch.StartNew();

        var availableYears = await dbContext.WorkOrders
            .AsNoTracking()
            .Where(workOrder =>
                workOrder.DepartmentId == userScope.DepartmentId)
            .Select(workOrder => workOrder.WorkYear)
            .Distinct()
            .ToListAsync(cancellationToken);

        yearsStopwatch.Stop();

        availableYears.Add(DateTime.Now.Year);
        availableYears.Add(workYear);

        availableYears = availableYears
            .Where(IsValidWorkYear)
            .Distinct()
            .OrderByDescending(year => year)
            .ToList();

        var rowsStopwatch = Stopwatch.StartNew();

        var workOrders = await dbContext.WorkOrders
            .AsNoTracking()
            .Where(workOrder =>
                workOrder.DepartmentId == userScope.DepartmentId &&
                workOrder.WorkYear == workYear)
            .OrderBy(workOrder => workOrder.DisplayOrder)
            .ThenBy(workOrder => workOrder.Id)
            .Select(workOrder => new WorkOrderSheetRow(
                workOrder.Id,
                workOrder.DisplayOrder,
                workOrder.WorkOrderNumber,
                workOrder.WorkTypeCode,
                workOrder.AssignmentDate,
                workOrder.Busket,
                workOrder.Status,
                workOrder.Notes,
                workOrder.RowVersion))
            .ToListAsync(cancellationToken);

        rowsStopwatch.Stop();
        totalStopwatch.Stop();

        logger.LogInformation(
            "Loaded {WorkOrderCount} work orders for department {DepartmentId}, year {WorkYear}. " +
            "Scope: {ScopeMilliseconds} ms; years: {YearsMilliseconds} ms; rows: {RowsMilliseconds} ms; total: {TotalMilliseconds} ms.",
            workOrders.Count,
            userScope.DepartmentId,
            workYear,
            scopeStopwatch.ElapsedMilliseconds,
            yearsStopwatch.ElapsedMilliseconds,
            rowsStopwatch.ElapsedMilliseconds,
            totalStopwatch.ElapsedMilliseconds);

        return new WorkOrderSheetData(
            userScope.DepartmentId,
            userScope.BranchName,
            userScope.DepartmentName,
            workYear,
            availableYears,
            workOrders);
    }

    public Task<WorkOrderSaveResult> SaveChangesAsync(
        string userId,
        IEnumerable<WorkOrder> addedRecords,
        IEnumerable<WorkOrder> changedRecords,
        IEnumerable<WorkOrder> deletedRecords,
        CancellationToken cancellationToken = default) =>
        SaveChangesAsync(
            userId,
            DateTime.Now.Year,
            addedRecords,
            changedRecords,
            deletedRecords,
            cancellationToken);

    public async Task<WorkOrderSaveResult> SaveChangesAsync(
        string userId,
        int workYear,
        IEnumerable<WorkOrder> addedRecords,
        IEnumerable<WorkOrder> changedRecords,
        IEnumerable<WorkOrder> deletedRecords,
        CancellationToken cancellationToken = default)
    {
        if (!IsValidWorkYear(workYear))
        {
            return WorkOrderSaveResult.ValidationFailure(
                $"Work year must be between {MinimumWorkYear} and {MaximumWorkYear}.");
        }
        // Keep every Id == 0 record. Several newly inserted rows can share Id 0
        // before saving, so grouping all new rows by Id would lose data.
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

        var recordWithoutValidRowVersion = existingChangedRecords
            .Concat(existingDeletedRecords)
            .FirstOrDefault(workOrder =>
                workOrder.RowVersion is null ||
                workOrder.RowVersion.Length != 8);

        if (recordWithoutValidRowVersion is not null)
        {
            return WorkOrderSaveResult.ConcurrencyFailure(
                "The work-order version is missing or outdated. Refresh the sheet before saving.",
                recordWithoutValidRowVersion.Id,
                recordWithoutValidRowVersion.WorkOrderNumber,
                recordWithoutValidRowVersion.WorkTypeCode);
        }

        await using var dbContext =
            await dbFactory.CreateDbContextAsync(cancellationToken);

        var authorizedDepartmentId = await (
            from user in dbContext.Users.AsNoTracking()
            join userRole in dbContext.UserRoles.AsNoTracking()
                on user.Id equals userRole.UserId
            join role in dbContext.Roles.AsNoTracking()
                on userRole.RoleId equals role.Id
            where
                user.Id == userId &&
                user.IsActive &&
                !user.MustChangePassword &&
                user.DepartmentId != null &&
                role.Name == AppRoles.Employee
            select user.DepartmentId)
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

            /*
             * Collect every duplicate identity before mutating the database.
             * The previous implementation returned after the first match,
             * which forced the user to save repeatedly and made validation
             * jump backwards between rows.
             */
            var duplicateConflictsByKey =
                new Dictionary<string, WorkOrderDuplicateConflict>(
                    StringComparer.Ordinal);

            var incomingKeyOrder = incomingRecords
                .Select(workOrder =>
                    CreateDuplicateKey(
                        workOrder.WorkOrderNumber,
                        workOrder.WorkTypeCode))
                .ToList();

            foreach (var group in incomingRecords
                .GroupBy(workOrder =>
                    CreateDuplicateKey(
                        workOrder.WorkOrderNumber,
                        workOrder.WorkTypeCode))
                .Where(group => group.Count() > 1))
            {
                var duplicate = group.First();

                duplicateConflictsByKey[group.Key] =
                    new WorkOrderDuplicateConflict(
                        duplicate.WorkOrderNumber,
                        duplicate.WorkTypeCode);
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
                        incomingNumbers.Contains(workOrder.WorkOrderNumber) &&
                        !changedIds.Contains(workOrder.Id) &&
                        !deletedIds.Contains(workOrder.Id))
                    .Select(workOrder => new
                    {
                        workOrder.WorkOrderNumber,
                        workOrder.WorkTypeCode,
                        workOrder.WorkYear,
                        workOrder.DepartmentId,
                        DepartmentName = workOrder.Department.DepartmentType.Name
                    })
                    .ToListAsync(cancellationToken);

                foreach (var incomingRecord in incomingRecords)
                {
                    var incomingKey = CreateDuplicateKey(
                        incomingRecord.WorkOrderNumber,
                        incomingRecord.WorkTypeCode);

                    var existingConflict = possibleConflicts
                        .FirstOrDefault(workOrder =>
                            CreateDuplicateKey(
                                workOrder.WorkOrderNumber,
                                workOrder.WorkTypeCode) == incomingKey);

                    if (existingConflict is null)
                    {
                        continue;
                    }

                    var differentDepartmentName =
                        existingConflict.DepartmentId == departmentId
                            ? null
                            : existingConflict.DepartmentName;

                    /*
                     * Prefer the database location when the same key is also
                     * duplicated inside the current batch. That gives the user
                     * the most useful company-wide location information.
                     */
                    duplicateConflictsByKey[incomingKey] =
                        new WorkOrderDuplicateConflict(
                            incomingRecord.WorkOrderNumber,
                            incomingRecord.WorkTypeCode,
                            existingConflict.WorkYear,
                            differentDepartmentName);
                }
            }

            if (duplicateConflictsByKey.Count > 0)
            {
                var orderedConflicts = incomingKeyOrder
                    .Distinct(StringComparer.Ordinal)
                    .Where(duplicateConflictsByKey.ContainsKey)
                    .Select(key => duplicateConflictsByKey[key])
                    .ToList();

                var firstConflict = orderedConflicts[0];

                return WorkOrderSaveResult.DuplicateFailure(
                    orderedConflicts.Count == 1
                        ? "A duplicate work-order identity was found."
                        : $"{orderedConflicts.Count} duplicate work-order identities were found.",
                    firstConflict.WorkOrderNumber,
                    firstConflict.WorkTypeCode,
                    firstConflict.ExistingWorkYear,
                    firstConflict.ExistingDepartmentName,
                    orderedConflicts);
            }

            var utcNow = DateTime.UtcNow;

            var destinationYears = newRecords
                .Select(workOrder =>
                    ResolveTargetWorkYear(
                        workYear,
                        workOrder.AssignmentDate))
                .Concat(
                    existingChangedRecords.Select(workOrder =>
                        ResolveTargetWorkYear(
                            workYear,
                            workOrder.AssignmentDate)))
                .Distinct()
                .ToList();

            var nextAppendDisplayOrders = destinationYears.Count == 0
                ? new Dictionary<int, long>()
                : await dbContext.WorkOrders
                    .AsNoTracking()
                    .Where(workOrder =>
                        workOrder.DepartmentId == departmentId &&
                        destinationYears.Contains(workOrder.WorkYear))
                    .GroupBy(workOrder => workOrder.WorkYear)
                    .Select(group => new
                    {
                        WorkYear = group.Key,
                        MaximumDisplayOrder = group.Max(workOrder =>
                            workOrder.DisplayOrder)
                    })
                    .ToDictionaryAsync(
                        item => item.WorkYear,
                        item => item.MaximumDisplayOrder,
                        cancellationToken);

            foreach (var destinationYear in destinationYears)
            {
                nextAppendDisplayOrders.TryAdd(destinationYear, 0L);
            }

            long TakeNextDisplayOrder(int destinationYear)
            {
                var nextDisplayOrder =
                    nextAppendDisplayOrders[destinationYear] +
                    DisplayOrderStep;

                nextAppendDisplayOrders[destinationYear] =
                    nextDisplayOrder;

                return nextDisplayOrder;
            }

            var savedEntities = new List<WorkOrder>();

            if (deletedIds.Count > 0)
            {
                var entitiesToDelete = await dbContext.WorkOrders
                    .Where(workOrder =>
                        workOrder.DepartmentId == departmentId &&
                        deletedIds.Contains(workOrder.Id))
                    .ToListAsync(cancellationToken);

                if (entitiesToDelete.Count != deletedIds.Count)
                {
                    var missingDeletedRecord = existingDeletedRecords
                        .FirstOrDefault(record =>
                            entitiesToDelete.All(entity =>
                                entity.Id != record.Id));

                    return WorkOrderSaveResult.ConcurrencyFailure(
                        "One or more selected work orders were changed, moved, or deleted after the sheet was loaded.",
                        missingDeletedRecord?.Id,
                        missingDeletedRecord?.WorkOrderNumber,
                        missingDeletedRecord?.WorkTypeCode);
                }

                var deletedById = existingDeletedRecords
                    .ToDictionary(workOrder => workOrder.Id);

                foreach (var entity in entitiesToDelete)
                {
                    var deletedRecord = deletedById[entity.Id];

                    if (entity.WorkYear != workYear)
                    {
                        return WorkOrderSaveResult.ConcurrencyFailure(
                            "A selected work order moved to another year after the sheet was loaded.",
                            entity.Id,
                            entity.WorkOrderNumber,
                            entity.WorkTypeCode);
                    }

                    dbContext.Entry(entity)
                        .Property(workOrder => workOrder.RowVersion)
                        .OriginalValue = deletedRecord.RowVersion;
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
                    var missingChangedRecord = existingChangedRecords
                        .FirstOrDefault(record =>
                            entitiesToUpdate.All(entity =>
                                entity.Id != record.Id));

                    return WorkOrderSaveResult.ConcurrencyFailure(
                        "One or more modified work orders were changed, moved, or deleted after the sheet was loaded.",
                        missingChangedRecord?.Id,
                        missingChangedRecord?.WorkOrderNumber,
                        missingChangedRecord?.WorkTypeCode);
                }

                var changedById = existingChangedRecords
                    .ToDictionary(workOrder => workOrder.Id);

                foreach (var entity in entitiesToUpdate
                    .OrderBy(entity =>
                        changedById[entity.Id].DisplayOrder))
                {
                    var changedRecord = changedById[entity.Id];

                    if (entity.WorkYear != workYear)
                    {
                        return WorkOrderSaveResult.ConcurrencyFailure(
                            "A modified work order moved to another year after the sheet was loaded.",
                            entity.Id,
                            entity.WorkOrderNumber,
                            entity.WorkTypeCode);
                    }

                    dbContext.Entry(entity)
                        .Property(workOrder => workOrder.RowVersion)
                        .OriginalValue = changedRecord.RowVersion;

                    var destinationYear = ResolveTargetWorkYear(
                        entity.WorkYear,
                        changedRecord.AssignmentDate);
                    var movedToAnotherYear =
                        destinationYear != entity.WorkYear;

                    ApplyEditableFields(
                        entity,
                        changedRecord);

                    if (movedToAnotherYear)
                    {
                        entity.WorkYear = destinationYear;
                        entity.DisplayOrder =
                            TakeNextDisplayOrder(destinationYear);
                    }

                    entity.UpdatedAt = utcNow;
                    entity.UpdatedBy = userId;
                }

                savedEntities.AddRange(entitiesToUpdate);
            }

            foreach (var newRecord in newRecords)
            {
                var destinationYear = ResolveTargetWorkYear(
                    workYear,
                    newRecord.AssignmentDate);

                newRecord.Id = 0;
                newRecord.DepartmentId = departmentId;
                newRecord.WorkYear = destinationYear;

                // A row without an assignment date stays in the open sheet.
                // A row whose assignment date belongs to another year is
                // appended to that year's sheet instead of reusing a position
                // that came from the currently open sheet.
                if (
                    destinationYear != workYear ||
                    newRecord.DisplayOrder <= 0)
                {
                    newRecord.DisplayOrder =
                        TakeNextDisplayOrder(destinationYear);
                }
                else
                {
                    nextAppendDisplayOrders[destinationYear] = Math.Max(
                        nextAppendDisplayOrders[destinationYear],
                        newRecord.DisplayOrder);
                }

                newRecord.CreatedAt = utcNow;
                newRecord.CreatedBy = userId;
                newRecord.UpdatedAt = null;
                newRecord.UpdatedBy = null;

                dbContext.WorkOrders.Add(newRecord);
                savedEntities.Add(newRecord);
            }

            await dbContext.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            var savedRecords = savedEntities
                .Select(MapSavedRecord)
                .ToList();

            return WorkOrderSaveResult.Success(
                savedRecords,
                deletedIds
                    .OrderBy(id => id)
                    .ToList());
        }
        catch (DbUpdateConcurrencyException exception)
        {
            await transaction.RollbackAsync(cancellationToken);

            var conflictingWorkOrder = exception.Entries
                .Select(entry => entry.Entity)
                .OfType<WorkOrder>()
                .FirstOrDefault();

            logger.LogWarning(
                exception,
                "A work-order concurrency conflict occurred for department {DepartmentId} and year {WorkYear}.",
                departmentId,
                workYear);

            return WorkOrderSaveResult.ConcurrencyFailure(
                "The work order was changed, moved, or deleted by another session after the sheet was loaded.",
                conflictingWorkOrder?.Id,
                conflictingWorkOrder?.WorkOrderNumber,
                conflictingWorkOrder?.WorkTypeCode);
        }
        catch (DbUpdateException exception)
        {
            await transaction.RollbackAsync(cancellationToken);

            logger.LogError(
                exception,
                "A database error occurred while saving work orders for department {DepartmentId} and year {WorkYear}.",
                departmentId,
                workYear);

            if (IsUniqueConstraintViolation(exception))
            {
                return WorkOrderSaveResult.DuplicateFailure(
                    "The same Work Order Number and Work Type already exist in the company.");
            }

            return WorkOrderSaveResult.DatabaseFailure(
                "The changes could not be saved. Check for duplicate, linked, or invalid values.");
        }
    }

    private static WorkOrderSavedRecord MapSavedRecord(
        WorkOrder workOrder) =>
        new(
            workOrder.Id,
            workOrder.WorkOrderNumber,
            workOrder.WorkTypeCode,
            workOrder.WorkYear,
            workOrder.DisplayOrder,
            workOrder.AssignmentDate,
            workOrder.Busket,
            workOrder.Status,
            workOrder.Notes,
            workOrder.RowVersion);

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
            NormalizeIdentityDigits(
                workOrder.WorkOrderNumber?.Trim() ?? string.Empty);

        workOrder.WorkTypeCode =
            NormalizeIdentityDigits(
                workOrder.WorkTypeCode?.Trim() ?? string.Empty);

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

            if (!IsExactAsciiDigits(
                    workOrder.WorkOrderNumber,
                    9))
            {
                return "Work Order Number must contain exactly 9 digits.";
            }

            if (string.IsNullOrWhiteSpace(workOrder.WorkTypeCode))
            {
                return "Work Type is required.";
            }

            if (!IsExactAsciiDigits(
                    workOrder.WorkTypeCode,
                    3))
            {
                return "Work Type must contain exactly 3 digits.";
            }

            if (string.IsNullOrWhiteSpace(workOrder.Busket))
            {
                return "Busket is required.";
            }

            if (!WorkOrderBuskets.All.Contains(workOrder.Busket))
            {
                return "Select a valid value from the Busket list.";
            }

            if (
                workOrder.AssignmentDate is not null &&
                !IsValidWorkYear(
                    workOrder.AssignmentDate.Value.Year))
            {
                return $"Assignment Date year must be between {MinimumWorkYear} and {MaximumWorkYear}.";
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

    private static string NormalizeIdentityDigits(string value)
    {
        return new string(
            value.Select(character =>
                character switch
                {
                    >= '\u0660' and <= '\u0669' =>
                        (char)('0' + character - '\u0660'),

                    >= '\u06F0' and <= '\u06F9' =>
                        (char)('0' + character - '\u06F0'),

                    _ => character
                })
            .ToArray());
    }

    private static bool IsExactAsciiDigits(
        string value,
        int requiredLength)
    {
        return
            value.Length == requiredLength &&
            value.All(character =>
                character >= '0' &&
                character <= '9');
    }

    private static int ResolveTargetWorkYear(
        int fallbackWorkYear,
        DateTime? assignmentDate) =>
        assignmentDate?.Year ?? fallbackWorkYear;

    private static bool IsValidWorkYear(int workYear) =>
        workYear >= MinimumWorkYear &&
        workYear <= MaximumWorkYear;

    private static bool IsUniqueConstraintViolation(
        DbUpdateException exception)
    {
        return exception.InnerException is SqlException sqlException &&
            (sqlException.Number == 2601 ||
             sqlException.Number == 2627);
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
    int WorkYear,
    List<int> AvailableYears,
    List<WorkOrderSheetRow> WorkOrders);

public sealed record WorkOrderSheetRow(
    int Id,
    long DisplayOrder,
    string WorkOrderNumber,
    string WorkTypeCode,
    DateTime? AssignmentDate,
    string Busket,
    string Status,
    string? Notes,
    byte[] RowVersion);

public enum WorkOrderSaveFailureType
{
    None,
    Validation,
    Duplicate,
    Scope,
    Concurrency,
    Database
}

public sealed record WorkOrderSavedRecord(
    int Id,
    string WorkOrderNumber,
    string WorkTypeCode,
    int WorkYear,
    long DisplayOrder,
    DateTime? AssignmentDate,
    string Busket,
    string Status,
    string? Notes,
    byte[] RowVersion);

public sealed record WorkOrderDuplicateConflict(
    string WorkOrderNumber,
    string WorkTypeCode,
    int? ExistingWorkYear = null,
    string? ExistingDepartmentName = null);

public sealed record WorkOrderSaveResult(
    bool Succeeded,
    WorkOrderSaveFailureType FailureType,
    string ErrorMessage,
    string ErrorCode = "",
    string? WorkOrderNumber = null,
    string? WorkTypeCode = null,
    int? ExistingWorkYear = null,
    string? ExistingDepartmentName = null,
    int? WorkOrderId = null,
    IReadOnlyList<WorkOrderSavedRecord>? SavedRecords = null,
    IReadOnlyList<int>? DeletedRecordIds = null,
    IReadOnlyList<WorkOrderDuplicateConflict>? DuplicateConflicts = null)
{
    public static WorkOrderSaveResult Success(
        IReadOnlyList<WorkOrderSavedRecord> savedRecords,
        IReadOnlyList<int> deletedRecordIds) =>
        new(
            true,
            WorkOrderSaveFailureType.None,
            string.Empty,
            SavedRecords: savedRecords,
            DeletedRecordIds: deletedRecordIds);

    public static WorkOrderSaveResult ValidationFailure(
        string message) =>
        new(
            false,
            WorkOrderSaveFailureType.Validation,
            message,
            "validation_error");

    public static WorkOrderSaveResult DuplicateFailure(
        string message,
        string? workOrderNumber = null,
        string? workTypeCode = null,
        int? existingWorkYear = null,
        string? existingDepartmentName = null,
        IReadOnlyList<WorkOrderDuplicateConflict>? duplicateConflicts = null) =>
        new(
            false,
            WorkOrderSaveFailureType.Duplicate,
            message,
            "duplicate_identity",
            workOrderNumber,
            workTypeCode,
            existingWorkYear,
            existingDepartmentName,
            DuplicateConflicts: duplicateConflicts);

    public static WorkOrderSaveResult ScopeFailure(
        string message) =>
        new(
            false,
            WorkOrderSaveFailureType.Scope,
            message,
            "scope_error");

    public static WorkOrderSaveResult ConcurrencyFailure(
        string message,
        int? workOrderId = null,
        string? workOrderNumber = null,
        string? workTypeCode = null) =>
        new(
            false,
            WorkOrderSaveFailureType.Concurrency,
            message,
            "concurrency_conflict",
            workOrderNumber,
            workTypeCode,
            null,
            null,
            workOrderId);

    public static WorkOrderSaveResult DatabaseFailure(
        string message) =>
        new(
            false,
            WorkOrderSaveFailureType.Database,
            message,
            "database_error");
}
