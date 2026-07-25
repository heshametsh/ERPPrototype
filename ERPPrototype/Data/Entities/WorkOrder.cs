namespace ERPPrototype.Data.Entities;

public sealed class WorkOrder
{
    public int Id { get; set; }

    public string WorkOrderNumber { get; set; } = string.Empty;

    public string WorkTypeCode { get; set; } = string.Empty;

    public int WorkYear { get; set; }

    public long DisplayOrder { get; set; }

    public DateTime? AssignmentDate { get; set; }

    public string Busket { get; set; } = string.Empty;

    public string Status { get; set; } = string.Empty;

    public string? Notes { get; set; }

    public byte[] RowVersion { get; set; } = [];

    public int DepartmentId { get; set; }

    public Department Department { get; set; } = null!;

    public DateTime CreatedAt { get; set; }

    public string CreatedBy { get; set; } = string.Empty;

    public DateTime? UpdatedAt { get; set; }

    public string? UpdatedBy { get; set; }
}
