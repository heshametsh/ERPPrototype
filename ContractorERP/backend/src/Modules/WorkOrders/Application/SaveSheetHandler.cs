using ContractorERP.BuildingBlocks.Results;
using ContractorERP.BuildingBlocks.Security;
using ContractorERP.Modules.WorkOrders.Domain;
using ContractorERP.Modules.WorkOrders.Infrastructure;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace ContractorERP.Modules.WorkOrders.Application;

/// <summary>
/// The only write path for the Work Orders sheet. Order of authority:
/// request shape -> field rules -> department scope -> RowVersion -> company-wide uniqueness -> one transaction.
/// The browser's department/branch is never trusted; scope comes from <see cref="ICurrentUser"/>.
/// </summary>
internal sealed class SaveSheetHandler(WorkOrdersDbContext db, ICurrentUser user, IValidator<SaveSheetRequest> validator)
{
    public async Task<Result<SaveSheetResponse>> HandleAsync(SaveSheetRequest request, CancellationToken cancellationToken)
    {
        if (!user.IsInRole(Roles.Employee) || user.DepartmentId is not { } departmentId || user.BranchId is not { } branchId)
        {
            return Fail(WorkOrderErrors.NotEmployee());
        }

        var shape = await validator.ValidateAsync(request, cancellationToken);
        if (!shape.IsValid)
        {
            return Fail(shape.Errors.Select(e => new Error(ErrorKind.Validation, "invalid_request", e.ErrorMessage)).ToList());
        }

        // 1. Field rules for every new/changed row.
        var errors = new List<Error>();
        var added = request.Added.Select(r => r with { Fields = WorkOrderRules.Normalize(r.Fields) }).ToList();
        var updated = request.Updated.Select(r => r with { Fields = WorkOrderRules.Normalize(r.Fields) }).ToList();
        foreach (var row in added)
        {
            errors.AddRange(FieldErrors(row.ClientKey, row.Fields));
        }

        foreach (var row in updated)
        {
            errors.AddRange(FieldErrors(row.Id.ToString(), row.Fields));
        }

        // 2. Duplicate identity inside this same Save.
        var identities = added.Select(r => (Key: r.ClientKey, r.Fields.Number, r.Fields.WorkTypeCode))
            .Concat(updated.Select(r => (Key: r.Id.ToString(), r.Fields.Number, r.Fields.WorkTypeCode)))
            .ToList();
        errors.AddRange(identities
            .GroupBy(i => (i.Number, i.WorkTypeCode))
            .Where(g => g.Count() > 1)
            .SelectMany(g => g.Select(i => WorkOrderErrors.Duplicate(i.Key))));

        if (errors.Count > 0)
        {
            return Fail(errors);
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        // 3. Load every touched row, but only inside the caller's own department.
        var touchedIds = updated.Select(r => r.Id).Concat(request.Deleted.Select(r => r.Id)).ToList();
        var existing = await db.WorkOrders
            .Where(w => touchedIds.Contains(w.Id) && w.DepartmentId == departmentId)
            .ToDictionaryAsync(w => w.Id, cancellationToken);

        // 4. RowVersion: a stale or missing row means someone else saved first (or it is not ours).
        foreach (var row in updated)
        {
            if (!existing.TryGetValue(row.Id, out var current) || current.Version != row.Version)
            {
                errors.Add(WorkOrderErrors.Stale(row.Id.ToString()));
            }
            else if (current.WorkYear != row.Fields.AssignmentDate.Year && !request.ConfirmYearMoves)
            {
                errors.Add(WorkOrderErrors.YearMoveNeedsConfirmation(row.Id.ToString(), current.WorkYear, row.Fields.AssignmentDate.Year));
            }
        }

        foreach (var row in request.Deleted)
        {
            if (!existing.TryGetValue(row.Id, out var current) || current.Version != row.Version)
            {
                errors.Add(WorkOrderErrors.Stale(row.Id.ToString()));
            }
        }

        // 5. Company-wide uniqueness (all departments, all years), excluding rows this Save changes or deletes.
        var numbers = identities.Select(i => i.Number).Distinct().ToList();
        var taken = await db.WorkOrders.AsNoTracking()
            .Where(w => numbers.Contains(w.Number) && !touchedIds.Contains(w.Id))
            .Select(w => new { w.Number, w.WorkTypeCode })
            .ToListAsync(cancellationToken);
        var takenSet = taken.Select(t => (t.Number, t.WorkTypeCode)).ToHashSet();
        errors.AddRange(identities.Where(i => takenSet.Contains((i.Number, i.WorkTypeCode))).Select(i => WorkOrderErrors.Duplicate(i.Key)));

        if (errors.Count > 0)
        {
            return Fail(errors);
        }

        // 6. Apply. Deletes first so a deleted identity can be re-entered in the same Save.
        foreach (var row in request.Deleted)
        {
            db.WorkOrders.Remove(existing[row.Id]);
        }

        if (request.Deleted.Count > 0 && !await TrySaveAsync(errors, cancellationToken))
        {
            return Fail(errors);
        }

        foreach (var row in updated)
        {
            var entity = existing[row.Id];
            db.Entry(entity).Property(x => x.Version).OriginalValue = row.Version;
            WorkOrderRules.Apply(entity, row.Fields);
            entity.DisplayOrder = row.DisplayOrder;
        }

        var newEntities = added.Select(row =>
        {
            var entity = new WorkOrder { BranchId = branchId, DepartmentId = departmentId, DisplayOrder = row.DisplayOrder };
            WorkOrderRules.Apply(entity, row.Fields);
            db.WorkOrders.Add(entity);
            return (row.ClientKey, entity);
        }).ToList();

        if (!await TrySaveAsync(errors, cancellationToken))
        {
            return Fail(errors);
        }

        await transaction.CommitAsync(cancellationToken);

        return Result<SaveSheetResponse>.Success(new SaveSheetResponse(
            [.. newEntities.Select(n => new SavedRow(n.ClientKey, n.entity.Id, n.entity.Version, n.entity.WorkYear))],
            [.. updated.Select(u => existing[u.Id]).Select(e => new SavedRow(null, e.Id, e.Version, e.WorkYear))],
            [.. request.Deleted.Select(d => d.Id)]));
    }

    private async Task<bool> TrySaveAsync(List<Error> errors, CancellationToken cancellationToken)
    {
        try
        {
            await db.SaveChangesAsync(cancellationToken);
            return true;
        }
        catch (DbUpdateConcurrencyException ex)
        {
            errors.AddRange(ex.Entries.Select(e => WorkOrderErrors.Stale(((WorkOrder)e.Entity).Id.ToString())));
            return false;
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            // A parallel Save took the same identity between our check and our insert; the database index decided.
            errors.Add(new Error(ErrorKind.Conflict, "duplicate_identity", "رقم أمر العمل ونوع العمل اتسجلوا من جلسة تانية دلوقتي"));
            return false;
        }
    }

    private static IEnumerable<Error> FieldErrors(string rowKey, WorkOrderFields fields) =>
        WorkOrderRules.Validate(fields).Select(e => WorkOrderErrors.Field(rowKey, e.Field, e.Code, e.Message));

    private static Result<SaveSheetResponse> Fail(params Error[] errors) => Result<SaveSheetResponse>.Failure(errors);

    private static Result<SaveSheetResponse> Fail(List<Error> errors) => Result<SaveSheetResponse>.Failure(errors);
}
