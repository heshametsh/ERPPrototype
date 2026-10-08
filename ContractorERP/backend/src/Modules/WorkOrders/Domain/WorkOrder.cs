namespace ContractorERP.Modules.WorkOrders.Domain;

/// <summary>
/// The shared Work Order. Created once by the Master Work Orders department; specialist modules link to it
/// by <see cref="Id"/> and never copy it.
/// Identity: <see cref="Number"/> + <see cref="WorkTypeCode"/>, unique across the whole company and all years.
/// </summary>
public sealed class WorkOrder
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid BranchId { get; set; }

    public Guid DepartmentId { get; set; }

    /// <summary>Always derived from <see cref="AssignmentDate"/> by the server.</summary>
    public int WorkYear { get; private set; }

    public string Number { get; set; } = "";

    public string WorkTypeCode { get; set; } = "";

    public DateOnly AssignmentDate
    {
        get => assignmentDate;
        set
        {
            assignmentDate = value;
            WorkYear = value.Year;
        }
    }

    public decimal Value { get; set; }

    /// <summary>One-time partial invoice. Zero is stored as null (approved rule).</summary>
    public decimal? PartialAmount { get; set; }

    /// <summary>Final invoice amount = Value - Partial. Derived, never stored, never edited.</summary>
    public decimal RemainingAmount => Value - (PartialAmount ?? 0m);

    public string Basket { get; set; } = "";

    /// <summary>Order of the row in the department sheet.</summary>
    public int DisplayOrder { get; set; }

    /// <summary>Optimistic concurrency token (PostgreSQL xmin). A stale value means someone else saved first.</summary>
    public uint Version { get; set; }

    private DateOnly assignmentDate;
}
