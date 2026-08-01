using ERPPrototype.Data.Entities;

namespace ERPPrototype.Data;

/// <summary>
/// Central contract for persisted work-order field keys.
/// UI code, save DTOs, validation dependencies and EF updates use the same keys.
/// Future custom columns use their own stable field ids without scattering
/// column-name checks across save, paste and validation code.
/// </summary>
public static class WorkOrderFieldRegistry
{
    public const string DisplayOrder = "displayOrder";
    public const string WorkOrderNumber = "workOrderNumber";
    public const string WorkTypeCode = "workTypeCode";
    public const string AssignmentDate = "assignmentDate";
    public const string WorkOrderValue = "workOrderValue";
    public const string PartialAmount = "partialAmount";
    public const string Basket = "basket";
    public const string Status = "status";
    public const string Notes = "notes";

    public static readonly IReadOnlySet<string> EditableFields =
        new HashSet<string>(StringComparer.Ordinal)
        {
            DisplayOrder,
            WorkOrderNumber,
            WorkTypeCode,
            AssignmentDate,
            WorkOrderValue,
            PartialAmount,
            Basket,
            Status,
            Notes
        };

    public static readonly IReadOnlySet<string> IdentityFields =
        new HashSet<string>(StringComparer.Ordinal)
        {
            WorkOrderNumber,
            WorkTypeCode
        };

    public static readonly IReadOnlySet<string> FinancialFields =
        new HashSet<string>(StringComparer.Ordinal)
        {
            WorkOrderValue,
            PartialAmount
        };

    public static readonly IReadOnlySet<string> WorkYearRoutingFields =
        new HashSet<string>(StringComparer.Ordinal)
        {
            AssignmentDate
        };

    public static readonly IReadOnlySet<string> RequiredOnNewRowFields =
        new HashSet<string>(StringComparer.Ordinal)
        {
            WorkOrderNumber,
            WorkTypeCode,
            WorkOrderValue,
            Basket
        };

    public static IReadOnlySet<string> NormalizeChangedFields(
        IEnumerable<string>? fields,
        bool defaultToAll)
    {
        var normalized = (fields ?? [])
            .Select(field => field?.Trim())
            .Where(field =>
                !string.IsNullOrWhiteSpace(field) &&
                EditableFields.Contains(field))
            .Select(field => field!)
            .ToHashSet(StringComparer.Ordinal);

        if (normalized.Count == 0 && defaultToAll)
        {
            return new HashSet<string>(
                EditableFields,
                StringComparer.Ordinal);
        }

        return normalized;
    }

    public static bool Affects(
        IReadOnlySet<string> changedFields,
        IReadOnlySet<string> dependencyFields) =>
        changedFields.Overlaps(dependencyFields);
}

public sealed record WorkOrderChangeSet(
    WorkOrder Record,
    IReadOnlySet<string> ChangedFields)
{
    public static WorkOrderChangeSet AllFields(WorkOrder record) =>
        new(
            record,
            WorkOrderFieldRegistry.NormalizeChangedFields(
                fields: null,
                defaultToAll: true));
}
