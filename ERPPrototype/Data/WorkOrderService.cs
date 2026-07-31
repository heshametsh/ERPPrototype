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
        CancellationToken cancellationToken = default,
        ICollection<WorkOrderServicePerformanceStage>? performanceStages = null) =>
        LoadSheetAsync(
            userId,
            DateTime.Now.Year,
            cancellationToken,
            performanceStages);

    public async Task<WorkOrderSheetData?> LoadSheetAsync(
        string userId,
        int workYear,
        CancellationToken cancellationToken = default,
        ICollection<WorkOrderServicePerformanceStage>? performanceStages = null)
    {
        if (!IsValidWorkYear(workYear))
        {
            throw new ArgumentOutOfRangeException(
                nameof(workYear),
                workYear,
                $"Work year must be between {MinimumWorkYear} and {MaximumWorkYear}.");
        }

        var totalStopwatch = Stopwatch.StartNew();
        var totalStartedAt = Stopwatch.GetTimestamp();
        var dbContextStartedAt = Stopwatch.GetTimestamp();

        await using var dbContext =
            await dbFactory.CreateDbContextAsync(cancellationToken);

        RecordPerformanceStage(
            performanceStages,
            "open.server.create-db-context",
            dbContextStartedAt);

        var scopeStopwatch = Stopwatch.StartNew();
        var scopeStartedAt = Stopwatch.GetTimestamp();

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

        RecordPerformanceStage(
            performanceStages,
            "open.server.scope-query",
            scopeStartedAt,
            new
            {
                FoundScope = userScope is not null
            });

        if (userScope is null)
        {
            RecordPerformanceStage(
                performanceStages,
                "open.server.total",
                totalStartedAt,
                new
                {
                    Outcome = "missing-scope",
                    WorkYear = workYear,
                    Rows = 0
                });

            return null;
        }

        var yearsStopwatch = Stopwatch.StartNew();
        var yearsStartedAt = Stopwatch.GetTimestamp();

        var availableYears = await dbContext.WorkOrders
            .AsNoTracking()
            .Where(workOrder =>
                workOrder.DepartmentId == userScope.DepartmentId)
            .Select(workOrder => workOrder.WorkYear)
            .Distinct()
            .ToListAsync(cancellationToken);

        yearsStopwatch.Stop();

        RecordPerformanceStage(
            performanceStages,
            "open.server.available-years-query",
            yearsStartedAt,
            new
            {
                DepartmentId = userScope.DepartmentId,
                DatabaseYearCount = availableYears.Count
            });

        availableYears.Add(DateTime.Now.Year);
        availableYears.Add(workYear);

        availableYears = availableYears
            .Where(IsValidWorkYear)
            .Distinct()
            .OrderByDescending(year => year)
            .ToList();

        var rowsStopwatch = Stopwatch.StartNew();
        var rowsStartedAt = Stopwatch.GetTimestamp();

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

        RecordPerformanceStage(
            performanceStages,
            "open.server.rows-query",
            rowsStartedAt,
            new
            {
                DepartmentId = userScope.DepartmentId,
                WorkYear = workYear,
                Rows = workOrders.Count
            });

        totalStopwatch.Stop();

        RecordPerformanceStage(
            performanceStages,
            "open.server.total",
            totalStartedAt,
            new
            {
                Outcome = "success",
                DepartmentId = userScope.DepartmentId,
                WorkYear = workYear,
                Rows = workOrders.Count,
                AvailableYears = availableYears.Count
            });

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
        CancellationToken cancellationToken = default,
        ICollection<WorkOrderServicePerformanceStage>? performanceStages = null) =>
        SaveChangesAsync(
            userId,
            DateTime.Now.Year,
            addedRecords,
            changedRecords.Select(WorkOrderChangeSet.AllFields),
            deletedRecords,
            cancellationToken,
            performanceStages);

    public Task<WorkOrderSaveResult> SaveChangesAsync(
        string userId,
        int workYear,
        IEnumerable<WorkOrder> addedRecords,
        IEnumerable<WorkOrder> changedRecords,
        IEnumerable<WorkOrder> deletedRecords,
        CancellationToken cancellationToken = default,
        ICollection<WorkOrderServicePerformanceStage>? performanceStages = null) =>
        SaveChangesAsync(
            userId,
            workYear,
            addedRecords,
            changedRecords.Select(WorkOrderChangeSet.AllFields),
            deletedRecords,
            cancellationToken,
            performanceStages);

    public async Task<WorkOrderSaveResult> SaveChangesAsync(
        string userId,
        int workYear,
        IEnumerable<WorkOrder> addedRecords,
        IEnumerable<WorkOrderChangeSet> changedRecords,
        IEnumerable<WorkOrder> deletedRecords,
        CancellationToken cancellationToken = default,
        ICollection<WorkOrderServicePerformanceStage>? performanceStages = null)
    {
        var serviceStartedAt = Stopwatch.GetTimestamp();

        if (!IsValidWorkYear(workYear))
        {
            return WorkOrderSaveResult.ValidationFailure(
                $"Work year must be between {MinimumWorkYear} and {MaximumWorkYear}.");
        }
        var inputPreparationStartedAt = Stopwatch.GetTimestamp();

        var normalizedChangedRecords = changedRecords
            .Select(change => new WorkOrderChangeSet(
                change.Record,
                WorkOrderFieldRegistry.NormalizeChangedFields(
                    change.ChangedFields,
                    defaultToAll: true)))
            .ToList();

        // Keep every Id == 0 record. Several newly inserted rows can share Id 0
        // before saving, so grouping all new rows by Id would lose data.
        var newRecordCandidates = addedRecords
            .Concat(
                normalizedChangedRecords
                    .Where(change => change.Record.Id <= 0)
                    .Select(change => change.Record))
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

        var existingChangedRecords = normalizedChangedRecords
            .Where(change => change.Record.Id > 0)
            .GroupBy(change => change.Record.Id)
            .Select(group => group.Last())
            .ToList();

        var existingChangedWorkOrders = existingChangedRecords
            .Select(change => change.Record)
            .ToList();

        var existingDeletedRecords = deletedRecords
            .Where(workOrder => workOrder.Id > 0)
            .GroupBy(workOrder => workOrder.Id)
            .Select(group => group.Last())
            .ToList();

        var changedIds = existingChangedRecords
            .Select(change => change.Record.Id)
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
            NormalizeEditableFields(
                workOrder,
                WorkOrderFieldRegistry.EditableFields);
        }

        foreach (var change in existingChangedRecords)
        {
            NormalizeEditableFields(
                change.Record,
                change.ChangedFields);
        }

        var validationError =
            ValidateNewRecords(newRecords) ??
            ValidateChangedRecords(existingChangedRecords);

        if (!string.IsNullOrWhiteSpace(validationError))
        {
            return WorkOrderSaveResult.ValidationFailure(validationError);
        }

        var recordWithoutValidRowVersion = existingChangedWorkOrders
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

        RecordPerformanceStage(
            performanceStages,
            "save.server.input-prepare",
            inputPreparationStartedAt,
            new
            {
                AddedRows = newRecords.Count,
                ChangedRows = existingChangedRecords.Count,
                DeletedRows = existingDeletedRecords.Count
            });

        var createDbContextStartedAt = Stopwatch.GetTimestamp();

        await using var dbContext =
            await dbFactory.CreateDbContextAsync(cancellationToken);

        RecordPerformanceStage(
            performanceStages,
            "save.server.create-db-context",
            createDbContextStartedAt);

        var authorizeStartedAt = Stopwatch.GetTimestamp();

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

        RecordPerformanceStage(
            performanceStages,
            "save.server.authorize",
            authorizeStartedAt);

        if (authorizedDepartmentId is null)
        {
            return WorkOrderSaveResult.ScopeFailure(
                "The current user is not authorized to modify work orders.");
        }

        var departmentId = authorizedDepartmentId.Value;

        var beginTransactionStartedAt = Stopwatch.GetTimestamp();

        await using var transaction =
            await dbContext.Database.BeginTransactionAsync(cancellationToken);

        RecordPerformanceStage(
            performanceStages,
            "save.server.begin-transaction",
            beginTransactionStartedAt);

        try
        {
            var duplicateScopeStartedAt = Stopwatch.GetTimestamp();

            /*
             * The client tells the service which fields changed. A global
             * identity lookup is therefore needed only for new rows or rows
             * whose identity fields changed. Editing another field must not
             * make the database re-check thousands of unchanged identities.
             */
            var identityCheckRecords = newRecords
                .Concat(
                    existingChangedRecords
                        .Where(change => WorkOrderFieldRegistry.Affects(
                            change.ChangedFields,
                            WorkOrderFieldRegistry.IdentityFields))
                        .Select(change => change.Record))
                .ToList();

            var identityChangedIds = identityCheckRecords
                .Where(workOrder => workOrder.Id > 0)
                .Select(workOrder => workOrder.Id)
                .ToHashSet();

            RecordPerformanceStage(
                performanceStages,
                "save.server.duplicate-scope",
                duplicateScopeStartedAt,
                new
                {
                    IncomingRows = newRecords.Count + existingChangedRecords.Count,
                    IdentityCheckRows = identityCheckRecords.Count,
                    IdentityChangedRows = identityChangedIds.Count,
                    NewRows = newRecords.Count
                });

            var duplicateInMemoryStartedAt = Stopwatch.GetTimestamp();

            /*
             * Collect every duplicate identity before mutating the database.
             * Only rows in the identity rule scope participate here.
             */
            var duplicateConflictsByKey =
                new Dictionary<string, WorkOrderDuplicateConflict>(
                    StringComparer.Ordinal);

            var incomingKeyOrder = identityCheckRecords
                .Select(workOrder =>
                    CreateDuplicateKey(
                        workOrder.WorkOrderNumber,
                        workOrder.WorkTypeCode))
                .ToList();

            foreach (var group in identityCheckRecords
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

            RecordPerformanceStage(
                performanceStages,
                "save.server.duplicate-inmemory",
                duplicateInMemoryStartedAt,
                new
                {
                    IncomingRows = identityCheckRecords.Count,
                    BatchDuplicateKeys = duplicateConflictsByKey.Count
                });

            if (identityCheckRecords.Count > 0)
            {
                var incomingNumbers = identityCheckRecords
                    .Select(workOrder => workOrder.WorkOrderNumber)
                    .Distinct()
                    .ToList();

                var duplicateQueryStartedAt = Stopwatch.GetTimestamp();

                var possibleConflicts = await dbContext.WorkOrders
                    .AsNoTracking()
                    .Where(workOrder =>
                        incomingNumbers.Contains(workOrder.WorkOrderNumber) &&
                        !identityChangedIds.Contains(workOrder.Id) &&
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

                RecordPerformanceStage(
                    performanceStages,
                    "save.server.duplicate-query",
                    duplicateQueryStartedAt,
                    new
                    {
                        IncomingNumbers = incomingNumbers.Count,
                        PossibleConflicts = possibleConflicts.Count
                    });

                var duplicateEvaluationStartedAt = Stopwatch.GetTimestamp();

                foreach (var incomingRecord in identityCheckRecords)
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

                    duplicateConflictsByKey[incomingKey] =
                        new WorkOrderDuplicateConflict(
                            incomingRecord.WorkOrderNumber,
                            incomingRecord.WorkTypeCode,
                            existingConflict.WorkYear,
                            differentDepartmentName);
                }

                RecordPerformanceStage(
                    performanceStages,
                    "save.server.duplicate-evaluate",
                    duplicateEvaluationStartedAt,
                    new
                    {
                        IncomingRows = identityCheckRecords.Count,
                        ConflictKeys = duplicateConflictsByKey.Count
                    });
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
                    existingChangedRecords
                        .Where(change => WorkOrderFieldRegistry.Affects(
                            change.ChangedFields,
                            WorkOrderFieldRegistry.WorkYearRoutingFields))
                        .Select(change =>
                            ResolveTargetWorkYear(
                                workYear,
                                change.Record.AssignmentDate)))
                .Distinct()
                .ToList();

            var displayOrderQueryStartedAt = Stopwatch.GetTimestamp();

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

            RecordPerformanceStage(
                performanceStages,
                "save.server.display-order-query",
                displayOrderQueryStartedAt,
                new
                {
                    DestinationYears = destinationYears.Count
                });

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
                var loadDeletesStartedAt = Stopwatch.GetTimestamp();

                var entitiesToDelete = await dbContext.WorkOrders
                    .Where(workOrder =>
                        workOrder.DepartmentId == departmentId &&
                        deletedIds.Contains(workOrder.Id))
                    .ToListAsync(cancellationToken);

                RecordPerformanceStage(
                    performanceStages,
                    "save.server.load-deletes",
                    loadDeletesStartedAt,
                    new
                    {
                        RequestedRows = deletedIds.Count,
                        LoadedRows = entitiesToDelete.Count
                    });

                var prepareDeletesStartedAt = Stopwatch.GetTimestamp();

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

                RecordPerformanceStage(
                    performanceStages,
                    "save.server.prepare-deletes",
                    prepareDeletesStartedAt,
                    new
                    {
                        Rows = entitiesToDelete.Count
                    });
            }

            if (changedIds.Count > 0)
            {
                var loadUpdatesStartedAt = Stopwatch.GetTimestamp();

                var entitiesToUpdate = await dbContext.WorkOrders
                    .Where(workOrder =>
                        workOrder.DepartmentId == departmentId &&
                        changedIds.Contains(workOrder.Id))
                    .ToListAsync(cancellationToken);

                RecordPerformanceStage(
                    performanceStages,
                    "save.server.load-updates",
                    loadUpdatesStartedAt,
                    new
                    {
                        RequestedRows = changedIds.Count,
                        LoadedRows = entitiesToUpdate.Count
                    });

                var prepareUpdatesStartedAt = Stopwatch.GetTimestamp();

                if (entitiesToUpdate.Count != changedIds.Count)
                {
                    var missingChangedRecord = existingChangedRecords
                        .FirstOrDefault(change =>
                            entitiesToUpdate.All(entity =>
                                entity.Id != change.Record.Id));
                    var missingWorkOrder = missingChangedRecord?.Record;

                    return WorkOrderSaveResult.ConcurrencyFailure(
                        "One or more modified work orders were changed, moved, or deleted after the sheet was loaded.",
                        missingWorkOrder?.Id,
                        missingWorkOrder?.WorkOrderNumber,
                        missingWorkOrder?.WorkTypeCode);
                }

                var changedById = existingChangedRecords
                    .ToDictionary(change => change.Record.Id);

                foreach (var entity in entitiesToUpdate
                    .OrderBy(entity =>
                        changedById[entity.Id].Record.DisplayOrder))
                {
                    var change = changedById[entity.Id];
                    var changedRecord = change.Record;

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

                    var movesToAnotherYear =
                        WorkOrderFieldRegistry.Affects(
                            change.ChangedFields,
                            WorkOrderFieldRegistry.WorkYearRoutingFields) &&
                        ResolveTargetWorkYear(
                            entity.WorkYear,
                            changedRecord.AssignmentDate) != entity.WorkYear;

                    var destinationYear = movesToAnotherYear
                        ? ResolveTargetWorkYear(
                            entity.WorkYear,
                            changedRecord.AssignmentDate)
                        : entity.WorkYear;

                    ApplyEditableFields(
                        entity,
                        changedRecord,
                        change.ChangedFields);

                    if (movesToAnotherYear)
                    {
                        entity.WorkYear = destinationYear;
                        entity.DisplayOrder =
                            TakeNextDisplayOrder(destinationYear);
                    }

                    entity.UpdatedAt = utcNow;
                    entity.UpdatedBy = userId;
                }

                savedEntities.AddRange(entitiesToUpdate);

                RecordPerformanceStage(
                    performanceStages,
                    "save.server.prepare-updates",
                    prepareUpdatesStartedAt,
                    new
                    {
                        Rows = entitiesToUpdate.Count
                    });
            }

            var prepareAddsStartedAt = Stopwatch.GetTimestamp();

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

            RecordPerformanceStage(
                performanceStages,
                "save.server.prepare-adds",
                prepareAddsStartedAt,
                new
                {
                    Rows = newRecords.Count
                });

            var saveChangesStartedAt = Stopwatch.GetTimestamp();

            await dbContext.SaveChangesAsync(cancellationToken);

            RecordPerformanceStage(
                performanceStages,
                "save.server.save-changes",
                saveChangesStartedAt,
                new
                {
                    AddedRows = newRecords.Count,
                    ChangedRows = existingChangedRecords.Count,
                    DeletedRows = existingDeletedRecords.Count
                });

            var commitStartedAt = Stopwatch.GetTimestamp();

            await transaction.CommitAsync(cancellationToken);

            RecordPerformanceStage(
                performanceStages,
                "save.server.commit",
                commitStartedAt);

            var mapResultStartedAt = Stopwatch.GetTimestamp();

            var savedRecords = savedEntities
                .Select(MapSavedRecord)
                .ToList();

            var deletedRecordIds = deletedIds
                .OrderBy(id => id)
                .ToList();

            RecordPerformanceStage(
                performanceStages,
                "save.server.map-result",
                mapResultStartedAt,
                new
                {
                    SavedRows = savedRecords.Count,
                    DeletedRows = deletedRecordIds.Count
                });

            RecordPerformanceStage(
                performanceStages,
                "save.server.total",
                serviceStartedAt,
                new
                {
                    Outcome = "succeeded",
                    AddedRows = newRecords.Count,
                    ChangedRows = existingChangedRecords.Count,
                    DeletedRows = existingDeletedRecords.Count
                });

            return WorkOrderSaveResult.Success(
                savedRecords,
                deletedRecordIds);
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

    private static void RecordPerformanceStage(
        ICollection<WorkOrderServicePerformanceStage>? stages,
        string name,
        long startedAt,
        object? metadata = null)
    {
        stages?.Add(
            new WorkOrderServicePerformanceStage(
                name,
                Stopwatch.GetElapsedTime(startedAt)
                    .TotalMilliseconds,
                metadata));
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
        WorkOrder source,
        IReadOnlySet<string> changedFields)
    {
        if (changedFields.Contains(WorkOrderFieldRegistry.WorkOrderNumber))
        {
            target.WorkOrderNumber = source.WorkOrderNumber;
        }

        if (changedFields.Contains(WorkOrderFieldRegistry.WorkTypeCode))
        {
            target.WorkTypeCode = source.WorkTypeCode;
        }

        if (
            changedFields.Contains(WorkOrderFieldRegistry.DisplayOrder) &&
            source.DisplayOrder > 0)
        {
            target.DisplayOrder = source.DisplayOrder;
        }

        if (changedFields.Contains(WorkOrderFieldRegistry.AssignmentDate))
        {
            target.AssignmentDate = source.AssignmentDate;
        }

        if (changedFields.Contains(WorkOrderFieldRegistry.Basket))
        {
            target.Busket = source.Busket;
        }

        if (changedFields.Contains(WorkOrderFieldRegistry.Status))
        {
            target.Status = source.Status;
        }

        if (changedFields.Contains(WorkOrderFieldRegistry.Notes))
        {
            target.Notes = source.Notes;
        }
    }

    private static void NormalizeEditableFields(
        WorkOrder workOrder,
        IReadOnlySet<string> fields)
    {
        if (fields.Contains(WorkOrderFieldRegistry.WorkOrderNumber))
        {
            workOrder.WorkOrderNumber =
                NormalizeIdentityDigits(
                    workOrder.WorkOrderNumber?.Trim() ?? string.Empty);
        }

        if (fields.Contains(WorkOrderFieldRegistry.WorkTypeCode))
        {
            workOrder.WorkTypeCode =
                NormalizeIdentityDigits(
                    workOrder.WorkTypeCode?.Trim() ?? string.Empty);
        }

        if (fields.Contains(WorkOrderFieldRegistry.Basket))
        {
            workOrder.Busket =
                workOrder.Busket?.Trim() ?? string.Empty;
        }

        if (fields.Contains(WorkOrderFieldRegistry.Status))
        {
            workOrder.Status =
                workOrder.Status?.Trim() ?? string.Empty;
        }

        if (fields.Contains(WorkOrderFieldRegistry.Notes))
        {
            workOrder.Notes = string.IsNullOrWhiteSpace(workOrder.Notes)
                ? null
                : workOrder.Notes.Trim();
        }
    }

    private static string? ValidateNewRecords(
        IEnumerable<WorkOrder> workOrders)
    {
        foreach (var workOrder in workOrders)
        {
            var validationError = ValidateFields(
                workOrder,
                WorkOrderFieldRegistry.EditableFields);

            if (!string.IsNullOrWhiteSpace(validationError))
            {
                return validationError;
            }
        }

        return null;
    }

    private static string? ValidateChangedRecords(
        IEnumerable<WorkOrderChangeSet> changes)
    {
        foreach (var change in changes)
        {
            var validationError = ValidateFields(
                change.Record,
                change.ChangedFields);

            if (!string.IsNullOrWhiteSpace(validationError))
            {
                return validationError;
            }
        }

        return null;
    }

    private static string? ValidateFields(
        WorkOrder workOrder,
        IReadOnlySet<string> fields)
    {
        if (fields.Contains(WorkOrderFieldRegistry.WorkOrderNumber))
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
        }

        if (fields.Contains(WorkOrderFieldRegistry.WorkTypeCode))
        {
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
        }

        if (fields.Contains(WorkOrderFieldRegistry.Basket))
        {
            if (string.IsNullOrWhiteSpace(workOrder.Busket))
            {
                return "Busket is required.";
            }

            if (!WorkOrderBuskets.All.Contains(workOrder.Busket))
            {
                return "Select a valid value from the Busket list.";
            }
        }

        if (
            fields.Contains(WorkOrderFieldRegistry.AssignmentDate) &&
            workOrder.AssignmentDate is not null &&
            !IsValidWorkYear(
                workOrder.AssignmentDate.Value.Year))
        {
            return $"Assignment Date year must be between {MinimumWorkYear} and {MaximumWorkYear}.";
        }

        if (
            fields.Contains(WorkOrderFieldRegistry.Status) &&
            workOrder.Status?.Length > 150)
        {
            return "Status cannot exceed 150 characters.";
        }

        if (
            fields.Contains(WorkOrderFieldRegistry.Notes) &&
            workOrder.Notes?.Length > 1000)
        {
            return "Notes cannot exceed 1000 characters.";
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

public sealed record WorkOrderServicePerformanceStage(
    string Name,
    double DurationMs,
    object? Metadata = null);

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
