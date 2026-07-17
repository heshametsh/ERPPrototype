namespace ERPPrototype.Data.Entities;

public sealed class DepartmentType
{
    public int Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public ICollection<Department> Departments { get; set; }
        = new List<Department>();
}