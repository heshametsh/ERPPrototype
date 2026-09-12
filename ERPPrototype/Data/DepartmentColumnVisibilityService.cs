using ERPPrototype.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace ERPPrototype.Data;

/// <summary>
/// Owns persisted Revo column visibility for one Department + Work Year.
/// Width remains owned separately by DepartmentColumnLayoutService.
/// Missing visibility records mean visible.
/// </summary>
public static class DepartmentColumnVisibilityService
{
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

    public static async Task<List<DepartmentColumnVisibilityData>>
        LoadVisibilityAsync(
            ApplicationDbContext dbContext,
            int departmentId,
            int workYear,
            CancellationToken cancellationToken = default)
    {
        var rows = await dbContext.DepartmentColumnVisibilities
            .AsNoTracking()
            .Where(item =>
                item.DepartmentId == departmentId &&
                item.WorkYear == workYear)
            .OrderBy(item => item.FieldKey)
            .ToListAsync(cancellationToken);

        return rows
            .Select(MapVisibility)
            .ToList();
    }

    public static async Task<DepartmentColumnVisibilityPreparationResult>
        PrepareVisibilityAsync(
            ApplicationDbContext dbContext,
            int departmentId,
            int workYear,
            string userId,
            IReadOnlyCollection<DepartmentColumnVisibilityInput>? incomingVisibility,
            bool visibilityChanged,
            IReadOnlyCollection<CustomColumnDefinition> customColumns,
            CancellationToken cancellationToken = default)
    {
        var existing = await dbContext.DepartmentColumnVisibilities
            .Where(item =>
                item.DepartmentId == departmentId &&
                item.WorkYear == workYear)
            .OrderBy(item => item.FieldKey)
            .ToListAsync(cancellationToken);

        var allowedFields = new HashSet<string>(
            CoreFieldKeys,
            StringComparer.Ordinal);

        allowedFields.UnionWith(
            customColumns
                .Where(column => column.WorkYear == workYear)
                .Select(column => column.FieldKey));

        var existingByField = existing.ToDictionary(
            item => item.FieldKey,
            StringComparer.Ordinal);

        if (!visibilityChanged)
        {
            return ValidateVisibleColumnExists(
                allowedFields,
                existingByField,
                existing);
        }

        var incoming = incomingVisibility ?? [];

        var duplicateField = incoming
            .GroupBy(
                item => item.FieldKey?.Trim() ?? string.Empty,
                StringComparer.Ordinal)
            .FirstOrDefault(group => group.Count() > 1);

        if (duplicateField is not null)
        {
            return DepartmentColumnVisibilityPreparationResult.Failed(
                "The same column visibility was submitted more than once. Refresh the sheet and try again.");
        }

        var utcNow = DateTime.UtcNow;

        foreach (var input in incoming)
        {
            var fieldKey = input.FieldKey?.Trim() ?? string.Empty;

            if (!allowedFields.Contains(fieldKey))
            {
                return DepartmentColumnVisibilityPreparationResult.Failed(
                    "The column visibility belongs to an unknown field. Refresh the sheet and try again.");
            }

            if (existingByField.TryGetValue(fieldKey, out var stored))
            {
                if (
                    input.Id != stored.Id ||
                    !RowVersionMatches(input.RowVersion, stored.RowVersion))
                {
                    return DepartmentColumnVisibilityPreparationResult.Failed(
                        "The column visibility was changed in another session. Refresh the sheet and try again.");
                }

                if (stored.IsHidden != input.IsHidden)
                {
                    stored.IsHidden = input.IsHidden;
                    stored.UpdatedAt = utcNow;
                    stored.UpdatedBy = userId;
                }

                continue;
            }

            if (input.Id > 0 || !string.IsNullOrWhiteSpace(input.RowVersion))
            {
                return DepartmentColumnVisibilityPreparationResult.Failed(
                    "The column visibility is stale. Refresh the sheet and try again.");
            }

            var added = new DepartmentColumnVisibility
            {
                DepartmentId = departmentId,
                WorkYear = workYear,
                FieldKey = fieldKey,
                IsHidden = input.IsHidden,
                UpdatedAt = utcNow,
                UpdatedBy = userId
            };

            dbContext.DepartmentColumnVisibilities.Add(added);
            existing.Add(added);
            existingByField[fieldKey] = added;
        }

        return ValidateVisibleColumnExists(
            allowedFields,
            existingByField,
            existing);
    }

    private static DepartmentColumnVisibilityPreparationResult
        ValidateVisibleColumnExists(
            IReadOnlySet<string> allowedFields,
            IReadOnlyDictionary<string, DepartmentColumnVisibility> visibilityByField,
            IEnumerable<DepartmentColumnVisibility> visibility)
    {
        var allDataColumnsHidden =
            allowedFields.Count > 0 &&
            allowedFields.All(fieldKey =>
                visibilityByField.TryGetValue(fieldKey, out var item) &&
                item.IsHidden);

        return allDataColumnsHidden
            ? DepartmentColumnVisibilityPreparationResult.Failed(
                "At least one data column must remain visible.")
            : DepartmentColumnVisibilityPreparationResult.Success(visibility);
    }

    public static DepartmentColumnVisibilityData MapVisibility(
        DepartmentColumnVisibility visibility) =>
        new(
            visibility.Id,
            visibility.FieldKey,
            visibility.IsHidden,
            Convert.ToBase64String(visibility.RowVersion));

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

public sealed record DepartmentColumnVisibilityInput(
    int Id,
    string FieldKey,
    bool IsHidden,
    string RowVersion = "");

public sealed record DepartmentColumnVisibilityData(
    int Id,
    string FieldKey,
    bool IsHidden,
    string RowVersion);

public sealed record DepartmentColumnVisibilityPreparationResult(
    bool Succeeded,
    string ErrorMessage,
    List<DepartmentColumnVisibility> Visibility)
{
    public static DepartmentColumnVisibilityPreparationResult Success(
        IEnumerable<DepartmentColumnVisibility> visibility) =>
        new(
            true,
            string.Empty,
            visibility
                .OrderBy(item => item.FieldKey)
                .ToList());

    public static DepartmentColumnVisibilityPreparationResult Failed(
        string message) =>
        new(false, message, []);
}