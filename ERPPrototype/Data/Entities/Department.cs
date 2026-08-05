namespace ERPPrototype.Data.Entities;

public sealed class Department
{
    public int Id { get; set; }

    public int BranchId { get; set; }

    public Branch Branch { get; set; } = null!;

    public int DepartmentTypeId { get; set; }

    public DepartmentType DepartmentType { get; set; } = null!;

    public ICollection<WorkOrder> WorkOrders { get; set; }
        = new List<WorkOrder>();

    public ICollection<CustomColumnDefinition> CustomColumnDefinitions { get; set; }
        = new List<CustomColumnDefinition>();

    public ICollection<DepartmentColumnLayout> ColumnLayouts { get; set; }
        = new List<DepartmentColumnLayout>();
}