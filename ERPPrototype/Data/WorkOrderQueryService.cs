using System.Diagnostics;
using Microsoft.EntityFrameworkCore;

namespace ERPPrototype.Data;

/// <summary>
/// Owns the read-only Work Orders sheet queries.
/// Save validation, transactions, concurrency, and persistence remain in
/// <see cref="WorkOrderService"/> during Phase 8.8-R1.
/// </summary>
public sealed class WorkOrderQueryService(
    IDbContextFactory<ApplicationDbContext> dbFactory,
    ILogger<WorkOrderQueryService> logger)
{
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

        var customColumnsStartedAt = Stopwatch.GetTimestamp();

        var customColumns = await CustomColumnService.LoadDefinitionsAsync(
            dbContext,
            userScope.DepartmentId,
            cancellationToken);

        RecordPerformanceStage(
            performanceStages,
            "open.server.custom-columns-query",
            customColumnsStartedAt,
            new
            {
                DepartmentId = userScope.DepartmentId,
                Columns = customColumns.Count
            });

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
                workOrder.WorkOrderValue,
                workOrder.PartialAmount,
                workOrder.Busket,
                workOrder.Status,
                workOrder.Notes,
                workOrder.CustomValuesJson,
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
            customColumns,
            workOrders);
    }

    private static bool IsValidWorkYear(int workYear) =>
        workYear >= MinimumWorkYear &&
        workYear <= MaximumWorkYear;

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
}
