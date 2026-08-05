using ERPPrototype.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace ERPPrototype.Data;

/// <summary>
/// Owns persisted column widths for one department. Widths are shared by all
/// years of that department and cover both core and custom work-order fields.
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

        if (!configurationChanged)
        {
            return DepartmentColumnLayoutPreparationResult.Success(existing);
        }

        var incoming = incomingLayouts ?? [];
        var duplicateField = incoming
            .GroupBy(layout => layout.FieldKey?.Trim() ?? string.Empty,
                StringComparer.Ordinal)
            .FirstOrDefault(group => group.Count() > 1);

        if (duplicateField is not null)
        {
            return DepartmentColumnLayoutPreparationResult.Failed(
                "The same column width was submitted more than once. Refresh the sheet and try again.");
        }

        var allowedFields = new HashSet<string>(
            CoreFieldKeys,
            StringComparer.Ordinal);

        allowedFields.UnionWith(customColumns.Select(column => column.FieldKey));

        var existingByField = existing.ToDictionary(
            layout => layout.FieldKey,
            StringComparer.Ordinal);
        var utcNow = DateTime.UtcNow;

        foreach (var input in incoming)
        {
            var fieldKey = input.FieldKey?.Trim() ?? string.Empty;

            if (!allowedFields.Contains(fieldKey))
            {
                return DepartmentColumnLayoutPreparationResult.Failed(
                    "The column width belongs to an unknown field. Refresh the sheet and try again.");
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
                        "The column width was changed in another session. Refresh the sheet and try again.");
                }

                if (existingLayout.Width != input.Width)
                {
                    existingLayout.Width = input.Width;
                    existingLayout.UpdatedAt = utcNow;
                    existingLayout.UpdatedBy = userId;
                }

                continue;
            }

            if (input.Id > 0 || !string.IsNullOrWhiteSpace(input.RowVersion))
            {
                return DepartmentColumnLayoutPreparationResult.Failed(
                    "The column width layout is stale. Refresh the sheet and try again.");
            }

            var added = new DepartmentColumnLayout
            {
                DepartmentId = departmentId,
                FieldKey = fieldKey,
                Width = input.Width,
                UpdatedAt = utcNow,
                UpdatedBy = userId
            };

            dbContext.DepartmentColumnLayouts.Add(added);
            existing.Add(added);
            existingByField[fieldKey] = added;
        }

        return DepartmentColumnLayoutPreparationResult.Success(existing);
    }

    public static DepartmentColumnLayoutData MapLayout(
        DepartmentColumnLayout layout) =>
        new(
            layout.Id,
            layout.FieldKey,
            layout.Width,
            Convert.ToBase64String(layout.RowVersion));

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
    string RowVersion = "");

public sealed record DepartmentColumnLayoutData(
    int Id,
    string FieldKey,
    int Width,
    string RowVersion);

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
