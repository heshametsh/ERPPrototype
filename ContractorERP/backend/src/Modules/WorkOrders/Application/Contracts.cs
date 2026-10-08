using ContractorERP.Modules.WorkOrders.Domain;

namespace ContractorERP.Modules.WorkOrders.Application;

public sealed record WorkOrderRow(
    Guid Id,
    string Number,
    string WorkTypeCode,
    DateOnly AssignmentDate,
    decimal Value,
    decimal? PartialAmount,
    decimal RemainingAmount,
    string Basket,
    int DisplayOrder,
    uint Version);

public sealed record SheetResponse(int Year, IReadOnlyList<int> AvailableYears, IReadOnlyList<WorkOrderRow> Rows);

/// <summary>A row created in the browser. <see cref="ClientKey"/> is the browser's temporary identity.</summary>
public sealed record AddedRow(string ClientKey, WorkOrderFields Fields, int DisplayOrder);

public sealed record UpdatedRow(Guid Id, uint Version, WorkOrderFields Fields, int DisplayOrder);

public sealed record DeletedRow(Guid Id, uint Version);

/// <summary>
/// One explicit Save = one database transaction. Either everything is saved or nothing is.
/// <see cref="ConfirmYearMoves"/> must be true when an edited Assignment Date moves a row to another year.
/// </summary>
public sealed record SaveSheetRequest(
    IReadOnlyList<AddedRow> Added,
    IReadOnlyList<UpdatedRow> Updated,
    IReadOnlyList<DeletedRow> Deleted,
    bool ConfirmYearMoves = false);

public sealed record SavedRow(string? ClientKey, Guid Id, uint Version, int WorkYear);

public sealed record SaveSheetResponse(IReadOnlyList<SavedRow> Added, IReadOnlyList<SavedRow> Updated, IReadOnlyList<Guid> Deleted);
