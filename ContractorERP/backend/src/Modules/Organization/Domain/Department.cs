namespace ContractorERP.Modules.Organization.Domain;

/// <summary>
/// A department inside a branch. <see cref="Kind"/> is data, not a hard-coded enum, so new department
/// types can be added without code changes (lesson from the prototype's fixed four departments).
/// </summary>
public sealed class Department
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid BranchId { get; set; }

    public required string Name { get; set; }

    public required string Kind { get; set; }

    public bool IsActive { get; set; } = true;
}
