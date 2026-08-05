namespace ERPPrototype.Data.Entities;

public sealed class DepartmentColumnLayout
{
    public int Id { get; set; }

    public int DepartmentId { get; set; }

    public Department Department { get; set; } = null!;

    public string FieldKey { get; set; } = string.Empty;

    public int Width { get; set; }

    public DateTime UpdatedAt { get; set; }

    public string UpdatedBy { get; set; } = string.Empty;

    public byte[] RowVersion { get; set; } = [];
}
