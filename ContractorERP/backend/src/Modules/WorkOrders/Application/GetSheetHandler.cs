using ContractorERP.BuildingBlocks.Results;
using ContractorERP.BuildingBlocks.Security;
using ContractorERP.BuildingBlocks.Time;
using ContractorERP.Modules.WorkOrders.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace ContractorERP.Modules.WorkOrders.Application;

internal sealed class GetSheetHandler(WorkOrdersDbContext db, ICurrentUser user, IBusinessClock clock)
{
    public async Task<Result<SheetResponse>> HandleAsync(int? year, CancellationToken cancellationToken)
    {
        if (!user.IsInRole(Roles.Employee) || user.DepartmentId is not { } departmentId)
        {
            return Result<SheetResponse>.Failure(WorkOrderErrors.NotEmployee());
        }

        var selectedYear = year ?? clock.CurrentYear;

        var years = await db.WorkOrders.AsNoTracking()
            .Where(w => w.DepartmentId == departmentId)
            .Select(w => w.WorkYear)
            .Distinct()
            .ToListAsync(cancellationToken);
        years.Add(clock.CurrentYear);
        years.Add(selectedYear);

        var rows = await db.WorkOrders.AsNoTracking()
            .Where(w => w.DepartmentId == departmentId && w.WorkYear == selectedYear)
            .OrderBy(w => w.DisplayOrder)
            .Select(w => new WorkOrderRow(w.Id, w.Number, w.WorkTypeCode, w.AssignmentDate, w.Value, w.PartialAmount,
                w.Value - (w.PartialAmount ?? 0m), w.Basket, w.DisplayOrder, w.Version))
            .ToListAsync(cancellationToken);

        return Result<SheetResponse>.Success(new SheetResponse(selectedYear, [.. years.Distinct().Order()], rows));
    }
}
