namespace ContractorERP.Modules.Organization.Domain;

public sealed class Branch
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public required string Name { get; set; }

    public bool IsActive { get; set; } = true;

    public List<Department> Departments { get; } = [];
}
