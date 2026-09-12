namespace ERPPrototype.Data.Entities;

public sealed class DepartmentColumnVisibility
{
    public int Id { get; set; }

    public int DepartmentId { get; set; }

    public Department Department { get; set; } = null!;

    public int WorkYear { get; set; }

    public string FieldKey { get; set; } = string.Empty;

    public bool IsHidden { get; set; }

    public DateTime UpdatedAt { get; set; }

    public string UpdatedBy { get; set; } = string.Empty;

    public byte[] RowVersion { get; set; } = [];
}