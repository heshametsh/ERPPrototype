namespace ERPPrototype.Data.Entities;

public enum CustomColumnDataType
{
    Text = 1,
    Money = 2,
    Date = 3,
    Number = 4
}

public sealed class CustomColumnDefinition
{
    public int Id { get; set; }

    public int DepartmentId { get; set; }

    public Department Department { get; set; } = null!;

    public string FieldKey { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public CustomColumnDataType DataType { get; set; }

    public long LayoutOrder { get; set; }

    public DateTime CreatedAt { get; set; }

    public string CreatedBy { get; set; } = string.Empty;

    public byte[] RowVersion { get; set; } = [];
}
