using ERPPrototype.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace ERPPrototype.Data;

/// <summary>
/// Owns persisted column width and visibility for one department. Layouts are
/// shared by all years and cover both core and custom work-order fields.
/// </summary>
public static class DepartmentColumnLayoutService
{
    public const int MinimumWidth = 45;
    public const int MaximumWidth = 1000;

    private static readonly IReadOnlySet<string> CoreFieldKeys =
        new HashSet<string>(StringComparer.Ordinal)
        {
            "workOrderNumber",
            "workTypeCode",
            "assignmentDate",
            "workOrderValue",
            "partialAmount",
            "remainingAmount",
            "basket"
        };

    public static async Task<List<DepartmentColumnLayoutData>>
        LoadLayoutsAsync(
            ApplicationDbContext dbContext,
            int departmentId,
            CancellationToken cancellationToken = default)
    {
        var layouts = await dbContext.DepartmentColumnLayouts
            .AsNoTracking()
            .Where(layout => layout.DepartmentId == departmentId)
            .OrderBy(layout => layout.FieldKey)
            .ToListAsync(cancellationToken);

        return layouts
            .Select(MapLayout)
            .ToList();
    }

    public static async Task<DepartmentColumnLayoutPreparationResult>
        PrepareLayoutsAsync(
            ApplicationDbContext dbContext,
            int departmentId,
            string userId,
            IReadOnlyCollection<DepartmentColumnLayoutInput>? incomingLayouts,
            bool configurationChanged,
            IReadOnlyCollection<CustomColumnDefinition> customColumns,
            CancellationToken cancellationToken = default)
    {
        var existing = await dbContext.DepartmentColumnLayouts
            .Where(layout => layout.DepartmentId == departmentId)
            .OrderBy(layout => layout.FieldKey)
            .ToListAsync(cancellationToken);

        existing = existing
            .Where(layout =>
                dbContext.Entry(layout).State != EntityState.Deleted)
            .ToList();

        var allowedFields = new HashSet<string>(
            CoreFieldKeys,
            StringComparer.Ordinal);

        allowedFields.UnionWith(customColumns.Select(column => column.FieldKey));

        var existingByField = existing.ToDictionary(
            layout => layout.FieldKey,
            StringComparer.Ordinal);

        if (!configurationChanged)
        {
            return ValidateVisibleColumnExists(
                allowedFields,
                existingByField,
                existing);
        }

        var incoming = incomingLayouts ?? [];
        var duplicateField = incoming
            .GroupBy(layout => layout.FieldKey?.Trim() ?? string.Empty,
                StringComparer.Ordinal)
            .FirstOrDefault(group => group.Count() > 1);

        if (duplicateField is not null)
        {
            return DepartmentColumnLayoutPreparationResult.Failed(
                "The same column layout was submitted more than once. Refresh the sheet and try again.");
        }

        var utcNow = DateTime.UtcNow;

        foreach (var input in incoming)
        {
            var fieldKey = input.FieldKey?.Trim() ?? string.Empty;

            if (!allowedFields.Contains(fieldKey))
            {
                return DepartmentColumnLayoutPreparationResult.Failed(
                    "The column layout belongs to an unknown field. Refresh the sheet and try again.");
            }

            if (input.Width is < MinimumWidth or > MaximumWidth)
            {
                return DepartmentColumnLayoutPreparationResult.Failed(
                    $"Column width must be between {MinimumWidth} and {MaximumWidth} pixels.");
            }

            if (existingByField.TryGetValue(fieldKey, out var existingLayout))
            {
                if (
                    input.Id != existingLayout.Id ||
                    !RowVersionMatches(input.RowVersion, existingLayout.RowVersion))
                {
                    return DepartmentColumnLayoutPreparationResult.Failed(
                        "The column layout was changed in another session. Refresh the sheet and try again.");
                }

                if (
                    existingLayout.Width != input.Width ||
                    existingLayout.IsHidden != input.IsHidden)
                {
                    existingLayout.Width = input.Width;
                    existingLayout.IsHidden = input.IsHidden;
                    existingLayout.UpdatedAt = utcNow;
                    existingLayout.UpdatedBy = userId;
                }

                continue;
            }

            if (input.Id > 0 || !string.IsNullOrWhiteSpace(input.RowVersion))
            {
                return DepartmentColumnLayoutPreparationResult.Failed(
                    "The column layout is stale. Refresh the sheet and try again.");
            }

            var added = new DepartmentColumnLayout
            {
                DepartmentId = departmentId,
                FieldKey = fieldKey,
                Width = input.Width,
                IsHidden = input.IsHidden,
                UpdatedAt = utcNow,
                UpdatedBy = userId
            };

            dbContext.DepartmentColumnLayouts.Add(added);
            existing.Add(added);
            existingByField[fieldKey] = added;
        }

        return ValidateVisibleColumnExists(
            allowedFields,
            existingByField,
            existing);
    }

    private static DepartmentColumnLayoutPreparationResult
        ValidateVisibleColumnExists(
            IReadOnlySet<string> allowedFields,
            IReadOnlyDictionary<string, DepartmentColumnLayout> layoutsByField,
            IEnumerable<DepartmentColumnLayout> layouts)
    {
        var allDataColumnsHidden = allowedFields.Count > 0 &&
            allowedFields.All(fieldKey =>
                layoutsByField.TryGetValue(fieldKey, out var layout) &&
                layout.IsHidden);

        return allDataColumnsHidden
            ? DepartmentColumnLayoutPreparationResult.Failed(
                "At least one data column must remain visible.")
            : DepartmentColumnLayoutPreparationResult.Success(layouts);
    }

    public static DepartmentColumnLayoutData MapLayout(
        DepartmentColumnLayout layout) =>
        new(
            layout.Id,
            layout.FieldKey,
            layout.Width,
            Convert.ToBase64String(layout.RowVersion),
            layout.IsHidden);

    private static bool RowVersionMatches(string? encoded, byte[] current)
    {
        if (string.IsNullOrWhiteSpace(encoded))
        {
            return false;
        }

        try
        {
            return Convert.FromBase64String(encoded)
                .AsSpan()
                .SequenceEqual(current);
        }
        catch (FormatException)
        {
            return false;
        }
    }
}

public sealed record DepartmentColumnLayoutInput(
    int Id,
    string FieldKey,
    int Width,
    string RowVersion = "",
    bool IsHidden = false);

public sealed record DepartmentColumnLayoutData(
    int Id,
    string FieldKey,
    int Width,
    string RowVersion,
    bool IsHidden = false);

public sealed record DepartmentColumnLayoutPreparationResult(
    bool Succeeded,
    string ErrorMessage,
    List<DepartmentColumnLayout> Layouts)
{
    public static DepartmentColumnLayoutPreparationResult Success(
        IEnumerable<DepartmentColumnLayout> layouts) =>
        new(
            true,
            string.Empty,
            layouts
                .OrderBy(layout => layout.FieldKey)
                .ToList());

    public static DepartmentColumnLayoutPreparationResult Failed(
        string message) =>
        new(false, message, []);
}
