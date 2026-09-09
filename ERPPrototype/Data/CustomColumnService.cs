using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using ERPPrototype.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace ERPPrototype.Data;

/// <summary>
/// Owns work-year custom-column definitions and the typed values stored in
/// each WorkOrder.CustomValuesJson document. The service validates create,
/// rename, immutable types, saved positions, and transactional deletion.
/// </summary>
public static partial class CustomColumnService
{
    public const int MaximumNameLength = 150;
    public const int MaximumTextLength = 250;

    private static readonly IReadOnlySet<string> ExistingColumnNames =
        new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "Work Order Number",
            "Work Type",
            "Assignment Date",
            "Work Order Value",
            "Partial Amount",
            "Remaining Amount",
            "Basket"
        };

    private static readonly IReadOnlySet<long> CoreLayoutOrders =
        new HashSet<long>
        {
            1_000_000_000_000L,
            2_000_000_000_000L,
            3_000_000_000_000L,
            4_000_000_000_000L,
            5_000_000_000_000L,
            6_000_000_000_000L,
            7_000_000_000_000L
        };

    public static async Task<List<CustomColumnDefinitionData>>
        LoadDefinitionsAsync(
            ApplicationDbContext dbContext,
            int departmentId,
            int workYear,
            CancellationToken cancellationToken = default)
    {
        var definitions = await dbContext.CustomColumnDefinitions
            .AsNoTracking()
            .Where(column =>
                column.DepartmentId == departmentId &&
                column.WorkYear == workYear)
            .OrderBy(column => column.LayoutOrder)
            .ThenBy(column => column.Id)
            .ToListAsync(cancellationToken);

        return definitions
            .Select(MapDefinition)
            .ToList();
    }

    public static async Task<CustomColumnPreparationResult>
        PrepareDefinitionsAsync(
            ApplicationDbContext dbContext,
            int departmentId,
            int workYear,
            string userId,
            IReadOnlyCollection<CustomColumnDefinitionInput>? incomingColumns,
            bool configurationChanged,
            CancellationToken cancellationToken = default)
    {
        var existing = await dbContext.CustomColumnDefinitions
            .Where(column =>
                column.DepartmentId == departmentId &&
                column.WorkYear == workYear)
            .OrderBy(column => column.LayoutOrder)
            .ThenBy(column => column.Id)
            .ToListAsync(cancellationToken);

        if (!configurationChanged)
        {
            return CustomColumnPreparationResult.Success(existing);
        }

        var incoming = (incomingColumns ?? [])
            .OrderBy(column => column.LayoutOrder)
            .ThenBy(column => column.Id)
            .ToList();

        var duplicateExistingId = incoming
            .Where(column => column.Id > 0)
            .GroupBy(column => column.Id)
            .FirstOrDefault(group => group.Count() > 1);

        if (duplicateExistingId is not null)
        {
            return CustomColumnPreparationResult.Failed(
                "The same custom column was submitted more than once. Refresh the sheet and try again.");
        }

        var existingById = existing.ToDictionary(column => column.Id);
        var incomingExistingById = incoming
            .Where(column => column.Id > 0)
            .ToDictionary(column => column.Id);

        if (
            incomingExistingById.Count != existingById.Count ||
            incomingExistingById.Keys.Any(id => !existingById.ContainsKey(id)))
        {
            return CustomColumnPreparationResult.Failed(
                "The custom-column layout changed in another session. Refresh the sheet and try again.");
        }

        var names = new HashSet<string>(
            ExistingColumnNames,
            StringComparer.OrdinalIgnoreCase);
        var fieldKeys = new HashSet<string>(StringComparer.Ordinal);
        var layoutOrders = new HashSet<long>();
        var activeDefinitions = new List<CustomColumnDefinition>();
        var added = new List<CustomColumnDefinition>();
        var deleted = new List<CustomColumnDefinition>();
        var utcNow = DateTime.UtcNow;

        foreach (var existingColumn in existing)
        {
            var incomingColumn = incomingExistingById[existingColumn.Id];

            if (
                !string.Equals(
                    incomingColumn.FieldKey?.Trim(),
                    existingColumn.FieldKey,
                    StringComparison.Ordinal) ||
                !RowVersionMatches(
                    incomingColumn.RowVersion,
                    existingColumn.RowVersion))
            {
                return CustomColumnPreparationResult.Failed(
                    "A custom column was changed in another session. Refresh the sheet and try again.");
            }

            if (incomingColumn.IsDeleted)
            {
                deleted.Add(existingColumn);
                continue;
            }

            if (
                incomingColumn.LayoutOrder <= 0 ||
                CoreLayoutOrders.Contains(incomingColumn.LayoutOrder))
            {
                return CustomColumnPreparationResult.Failed(
                    "The custom column position is invalid.");
            }

            var name = incomingColumn.Name?.Trim() ?? string.Empty;

            if (!TryValidateName(name, names, out var nameError))
            {
                return CustomColumnPreparationResult.Failed(nameError);
            }

            if (!TryParseDataType(incomingColumn.DataType, out var dataType))
            {
                return CustomColumnPreparationResult.Failed(
                    "Select a valid custom column type: Text, Money, Date, or Number.");
            }

            if (dataType != existingColumn.DataType)
            {
                return CustomColumnPreparationResult.Failed(
                    $"The type of custom column '{existingColumn.Name}' cannot be changed after the column is created.");
            }

            if (!fieldKeys.Add(existingColumn.FieldKey))
            {
                return CustomColumnPreparationResult.Failed(
                    "The same custom column was submitted more than once.");
            }

            if (!layoutOrders.Add(incomingColumn.LayoutOrder))
            {
                return CustomColumnPreparationResult.Failed(
                    "Two custom columns cannot occupy the same position.");
            }

            existingColumn.Name = name;
            existingColumn.LayoutOrder = incomingColumn.LayoutOrder;
            activeDefinitions.Add(existingColumn);
        }

        foreach (var incomingColumn in incoming.Where(column => column.Id <= 0))
        {
            if (incomingColumn.IsDeleted)
            {
                continue;
            }

            var name = incomingColumn.Name?.Trim() ?? string.Empty;
            var fieldKey = incomingColumn.FieldKey?.Trim() ?? string.Empty;

            if (!TryValidateName(name, names, out var nameError))
            {
                return CustomColumnPreparationResult.Failed(nameError);
            }

            if (!CustomFieldKeyPattern().IsMatch(fieldKey))
            {
                return CustomColumnPreparationResult.Failed(
                    "The custom column field key is invalid. Refresh the sheet and add the column again.");
            }

            if (!TryParseDataType(incomingColumn.DataType, out var dataType))
            {
                return CustomColumnPreparationResult.Failed(
                    "Select a valid custom column type: Text, Money, Date, or Number.");
            }

            if (
                incomingColumn.LayoutOrder <= 0 ||
                CoreLayoutOrders.Contains(incomingColumn.LayoutOrder))
            {
                return CustomColumnPreparationResult.Failed(
                    "The custom column position is invalid.");
            }

            if (!fieldKeys.Add(fieldKey))
            {
                return CustomColumnPreparationResult.Failed(
                    "The same custom column was added more than once.");
            }

            if (!layoutOrders.Add(incomingColumn.LayoutOrder))
            {
                return CustomColumnPreparationResult.Failed(
                    "Two custom columns cannot occupy the same position.");
            }

            var entity = new CustomColumnDefinition
            {
                DepartmentId = departmentId,
                WorkYear = workYear,
                FieldKey = fieldKey,
                Name = name,
                DataType = dataType,
                LayoutOrder = incomingColumn.LayoutOrder,
                CreatedAt = utcNow,
                CreatedBy = userId
            };

            dbContext.CustomColumnDefinitions.Add(entity);
            activeDefinitions.Add(entity);
            added.Add(entity);
        }

        var deletedFieldKeys = deleted
            .Select(column => column.FieldKey)
            .ToHashSet(StringComparer.Ordinal);
        var affectedWorkOrders = deletedFieldKeys.Count == 0
            ? []
            : await RemoveDeletedValuesAsync(
                dbContext,
                departmentId,
                workYear,
                userId,
                deletedFieldKeys,
                cancellationToken);

        if (deletedFieldKeys.Count > 0)
        {
            var fieldKeysUsedByOtherYears = await dbContext.CustomColumnDefinitions
                .Where(column =>
                    column.DepartmentId == departmentId &&
                    column.WorkYear != workYear &&
                    deletedFieldKeys.Contains(column.FieldKey))
                .Select(column => column.FieldKey)
                .ToListAsync(cancellationToken);

            var layoutsToDelete = await dbContext.DepartmentColumnLayouts
                .Where(layout =>
                    layout.DepartmentId == departmentId &&
                    deletedFieldKeys.Contains(layout.FieldKey) &&
                    !fieldKeysUsedByOtherYears.Contains(layout.FieldKey))
                .ToListAsync(cancellationToken);

            dbContext.DepartmentColumnLayouts.RemoveRange(layoutsToDelete);
            dbContext.CustomColumnDefinitions.RemoveRange(deleted);
        }

        return CustomColumnPreparationResult.Success(
            activeDefinitions,
            added,
            deleted,
            affectedWorkOrders);
    }

    private static bool TryValidateName(
        string name,
        ISet<string> usedNames,
        out string errorMessage)
    {
        errorMessage = string.Empty;

        if (string.IsNullOrWhiteSpace(name))
        {
            errorMessage = "Custom column name is required.";
            return false;
        }

        if (name.Length > MaximumNameLength)
        {
            errorMessage =
                $"Custom column name cannot exceed {MaximumNameLength} characters.";
            return false;
        }

        if (!usedNames.Add(name))
        {
            errorMessage =
                $"A column named '{name}' already exists in this work year.";
            return false;
        }

        return true;
    }

    private static async Task<List<WorkOrder>> RemoveDeletedValuesAsync(
        ApplicationDbContext dbContext,
        int departmentId,
        int workYear,
        string userId,
        IReadOnlySet<string> deletedFieldKeys,
        CancellationToken cancellationToken)
    {
        var candidates = await dbContext.WorkOrders
            .Where(workOrder =>
                workOrder.DepartmentId == departmentId &&
                workOrder.WorkYear == workYear &&
                workOrder.CustomValuesJson != "{}")
            .ToListAsync(cancellationToken);
        var affected = new List<WorkOrder>();
        var utcNow = DateTime.UtcNow;

        foreach (var workOrder in candidates)
        {
            var values = DeserializeValues(workOrder.CustomValuesJson)
                .ToDictionary(
                    entry => entry.Key,
                    entry => entry.Value,
                    StringComparer.Ordinal);
            var changed = false;

            foreach (var fieldKey in deletedFieldKeys)
            {
                changed |= values.Remove(fieldKey);
            }

            if (!changed)
            {
                continue;
            }

            workOrder.CustomValuesJson = JsonSerializer.Serialize(
                values
                    .OrderBy(entry => entry.Key, StringComparer.Ordinal)
                    .ToDictionary(
                        entry => entry.Key,
                        entry => entry.Value,
                        StringComparer.Ordinal));
            workOrder.UpdatedAt = utcNow;
            workOrder.UpdatedBy = userId;
            affected.Add(workOrder);
        }

        return affected;
    }

    public static string? NormalizeWorkOrderValues(
        IEnumerable<WorkOrder> newRecords,
        IEnumerable<WorkOrderChangeSet> changedRecords,
        IReadOnlyCollection<CustomColumnDefinition> definitions)
    {
        foreach (var workOrder in newRecords)
        {
            workOrder.CustomValuesJson = NormalizeValuesJson(
                workOrder.CustomValuesJson,
                definitions,
                out var validationError);

            if (!string.IsNullOrWhiteSpace(validationError))
            {
                return validationError;
            }
        }

        foreach (var change in changedRecords.Where(change =>
            change.ChangedFields.Contains(
                WorkOrderFieldRegistry.CustomValues)))
        {
            change.Record.CustomValuesJson = NormalizeValuesJson(
                change.Record.CustomValuesJson,
                definitions,
                out var validationError);

            if (!string.IsNullOrWhiteSpace(validationError))
            {
                return validationError;
            }
        }

        return null;
    }

    /// <summary>
    /// Moves non-empty custom values from one year's field namespace to the
    /// destination year's namespace. Missing destination definitions are
    /// created in the caller's transaction, so a row can never move without
    /// the definitions required to read its values.
    /// </summary>
    public static async Task<string?> RemapMovedWorkOrderValuesAsync(
        ApplicationDbContext dbContext,
        int departmentId,
        int sourceWorkYear,
        string userId,
        IReadOnlyCollection<CustomColumnDefinition> sourceDefinitions,
        IEnumerable<WorkOrder> movedWorkOrders,
        CancellationToken cancellationToken = default)
    {
        var moved = movedWorkOrders
            .Where(workOrder => workOrder.WorkYear != sourceWorkYear)
            .ToList();

        if (moved.Count == 0)
        {
            return null;
        }

        var sourceByFieldKey = sourceDefinitions.ToDictionary(
            column => column.FieldKey,
            StringComparer.Ordinal);
        var destinationYears = moved
            .Select(workOrder => workOrder.WorkYear)
            .Distinct()
            .ToList();
        var destinationDefinitions = await dbContext.CustomColumnDefinitions
            .Where(column =>
                column.DepartmentId == departmentId &&
                destinationYears.Contains(column.WorkYear))
            .OrderBy(column => column.LayoutOrder)
            .ThenBy(column => column.Id)
            .ToListAsync(cancellationToken);
        var definitionsByYear = destinationYears.ToDictionary(
            year => year,
            year => destinationDefinitions
                .Where(column => column.WorkYear == year)
                .ToList());
        var resolvedDestinations =
            new Dictionary<(int WorkYear, string SourceFieldKey), CustomColumnDefinition>();
        var utcNow = DateTime.UtcNow;

        foreach (var workOrder in moved)
        {
            var values = DeserializeValues(workOrder.CustomValuesJson)
                .Where(entry => !string.IsNullOrWhiteSpace(entry.Value))
                .OrderBy(entry =>
                    sourceByFieldKey.TryGetValue(entry.Key, out var source)
                        ? source.LayoutOrder
                        : long.MaxValue)
                .ThenBy(entry => entry.Key, StringComparer.Ordinal)
                .ToList();

            if (values.Count == 0)
            {
                workOrder.CustomValuesJson = "{}";
                continue;
            }

            var destinationColumns = definitionsByYear[workOrder.WorkYear];
            var remapped = new SortedDictionary<string, string>(
                StringComparer.Ordinal);

            foreach (var (sourceFieldKey, value) in values)
            {
                if (!sourceByFieldKey.TryGetValue(sourceFieldKey, out var source))
                {
                    return "The moved work order contains a custom column that no longer belongs to its source year. Refresh the sheet and try again.";
                }

                var resolutionKey = (workOrder.WorkYear, sourceFieldKey);

                if (!resolvedDestinations.TryGetValue(
                        resolutionKey,
                        out var destination))
                {
                    destination = destinationColumns.FirstOrDefault(column =>
                        string.Equals(
                            column.Name,
                            source.Name,
                            StringComparison.OrdinalIgnoreCase) &&
                        column.DataType == source.DataType);

                    if (destination is null)
                    {
                        var destinationName = ResolveDestinationName(
                            source.Name,
                            sourceWorkYear,
                            destinationColumns);
                        var destinationFieldKey = destinationColumns.Any(column =>
                            string.Equals(
                                column.FieldKey,
                                source.FieldKey,
                                StringComparison.Ordinal))
                            ? $"custom_{Guid.NewGuid():N}"
                            : source.FieldKey;

                        destination = new CustomColumnDefinition
                        {
                            DepartmentId = departmentId,
                            WorkYear = workOrder.WorkYear,
                            FieldKey = destinationFieldKey,
                            Name = destinationName,
                            DataType = source.DataType,
                            LayoutOrder = ResolveMovedLayoutOrder(
                                source.LayoutOrder,
                                destinationColumns),
                            CreatedAt = utcNow,
                            CreatedBy = userId
                        };
                        dbContext.CustomColumnDefinitions.Add(destination);
                        destinationColumns.Add(destination);
                    }

                    resolvedDestinations[resolutionKey] = destination;
                }

                remapped[destination.FieldKey] = value;
            }

            workOrder.CustomValuesJson = JsonSerializer.Serialize(remapped);
        }

        return null;
    }

    private static string ResolveDestinationName(
        string sourceName,
        int sourceWorkYear,
        IEnumerable<CustomColumnDefinition> destinationColumns)
    {
        var usedNames = destinationColumns
            .Select(column => column.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        if (!usedNames.Contains(sourceName))
        {
            return sourceName;
        }

        var yearSuffix = $" ({sourceWorkYear})";
        var baseName = sourceName.Length + yearSuffix.Length <= MaximumNameLength
            ? sourceName + yearSuffix
            : sourceName[..(MaximumNameLength - yearSuffix.Length)] + yearSuffix;
        var candidate = baseName;
        var suffix = 2;
        while (usedNames.Contains(candidate))
        {
            var numericSuffix = $" {suffix}";
            candidate = baseName.Length + numericSuffix.Length <= MaximumNameLength
                ? baseName + numericSuffix
                : baseName[..(MaximumNameLength - numericSuffix.Length)] + numericSuffix;
            suffix++;
        }

        return candidate;
    }

    private static long ResolveMovedLayoutOrder(
        long sourceLayoutOrder,
        IReadOnlyCollection<CustomColumnDefinition> destinationColumns)
    {
        var occupied = destinationColumns
            .Select(column => column.LayoutOrder)
            .ToHashSet();

        foreach (var coreLayoutOrder in CoreLayoutOrders)
        {
            occupied.Add(coreLayoutOrder);
        }

        if (sourceLayoutOrder > 0 && !occupied.Contains(sourceLayoutOrder))
        {
            return sourceLayoutOrder;
        }

        var desiredOrder = Math.Max(sourceLayoutOrder, 1L);
        var lowerCoreBoundary = CoreLayoutOrders
            .Where(order => order < desiredOrder)
            .DefaultIfEmpty(0)
            .Max();
        var upperCoreBoundary = CoreLayoutOrders
            .Where(order => order > desiredOrder)
            .DefaultIfEmpty(long.MaxValue)
            .Min();
        var maximumProbe = occupied.Count + 2;

        for (var offset = 1; offset <= maximumProbe; offset++)
        {
            if (desiredOrder <= long.MaxValue - offset)
            {
                var upperCandidate = desiredOrder + offset;

                if (
                    upperCandidate < upperCoreBoundary &&
                    !occupied.Contains(upperCandidate))
                {
                    return upperCandidate;
                }
            }

            if (desiredOrder > offset)
            {
                var lowerCandidate = desiredOrder - offset;

                if (
                    lowerCandidate > lowerCoreBoundary &&
                    !occupied.Contains(lowerCandidate))
                {
                    return lowerCandidate;
                }
            }
        }

        throw new InvalidOperationException(
            "No safe custom-column position is available near the source-year position.");
    }

    public static string NormalizeValuesJson(
        string? json,
        IReadOnlyCollection<CustomColumnDefinition> definitions,
        out string? validationError)
    {
        validationError = null;

        Dictionary<string, JsonElement>? rawValues;

        try
        {
            rawValues = string.IsNullOrWhiteSpace(json)
                ? []
                : JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json);
        }
        catch (JsonException)
        {
            validationError = "Custom column values are not valid JSON.";
            return "{}";
        }

        rawValues ??= [];

        var definitionsByField = definitions.ToDictionary(
            definition => definition.FieldKey,
            StringComparer.Ordinal);

        var unknownField = rawValues.Keys.FirstOrDefault(
            key => !definitionsByField.ContainsKey(key));

        if (!string.IsNullOrWhiteSpace(unknownField))
        {
            validationError =
                "The sheet contains a custom column that no longer belongs to this work year. Refresh the page.";
            return "{}";
        }

        var normalized = new SortedDictionary<string, string>(
            StringComparer.Ordinal);

        foreach (var definition in definitions.OrderBy(column => column.LayoutOrder))
        {
            if (!rawValues.TryGetValue(definition.FieldKey, out var rawValue))
            {
                continue;
            }

            if (
                rawValue.ValueKind is JsonValueKind.Object or
                    JsonValueKind.Array)
            {
                validationError =
                    $"The value in custom column '{definition.Name}' is invalid.";
                return "{}";
            }

            var text = rawValue.ValueKind == JsonValueKind.String
                ? rawValue.GetString() ?? string.Empty
                : rawValue.ToString();

            if (!TryNormalizeValue(definition, text, out var normalizedValue, out validationError))
            {
                return "{}";
            }

            if (!string.IsNullOrEmpty(normalizedValue))
            {
                normalized[definition.FieldKey] = normalizedValue;
            }
        }

        return JsonSerializer.Serialize(normalized);
    }

    public static IReadOnlyDictionary<string, string> DeserializeValues(
        string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return new Dictionary<string, string>();
        }

        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, string>>(json)
                ?? new Dictionary<string, string>();
        }
        catch (JsonException)
        {
            return new Dictionary<string, string>();
        }
    }

    public static bool HasAnyValue(string? json) =>
        DeserializeValues(json).Values.Any(value =>
            !string.IsNullOrWhiteSpace(value));

    public static CustomColumnDefinitionData MapDefinition(
        CustomColumnDefinition definition) =>
        new(
            definition.Id,
            definition.FieldKey,
            definition.Name,
            definition.DataType.ToString(),
            definition.LayoutOrder,
            Convert.ToBase64String(definition.RowVersion));

    private static bool TryNormalizeValue(
        CustomColumnDefinition definition,
        string? value,
        out string normalizedValue,
        out string? validationError)
    {
        normalizedValue = string.Empty;
        validationError = null;
        var text = value?.Trim() ?? string.Empty;

        if (text.Length == 0)
        {
            return true;
        }

        switch (definition.DataType)
        {
            case CustomColumnDataType.Text:
                if (text.Length > MaximumTextLength)
                {
                    validationError =
                        $"Custom column '{definition.Name}' cannot exceed {MaximumTextLength} characters.";
                    return false;
                }

                normalizedValue = text;
                return true;

            case CustomColumnDataType.Money:
                if (!decimal.TryParse(
                        NormalizeNumericText(text),
                        NumberStyles.AllowLeadingSign |
                            NumberStyles.AllowDecimalPoint,
                        CultureInfo.InvariantCulture,
                        out var money))
                {
                    validationError =
                        $"Enter a valid money value in custom column '{definition.Name}'.";
                    return false;
                }

                money = decimal.Round(money, 2, MidpointRounding.AwayFromZero);
                normalizedValue = money == decimal.Truncate(money)
                    ? money.ToString("0", CultureInfo.InvariantCulture)
                    : money.ToString("0.00", CultureInfo.InvariantCulture);
                return true;

            case CustomColumnDataType.Date:
                if (!DateTime.TryParseExact(
                        text,
                        "dd/MM/yyyy",
                        CultureInfo.InvariantCulture,
                        DateTimeStyles.None,
                        out var date))
                {
                    validationError =
                        $"Enter a valid date in custom column '{definition.Name}' using day/month/year.";
                    return false;
                }

                normalizedValue = date.ToString(
                    "dd/MM/yyyy",
                    CultureInfo.InvariantCulture);
                return true;

            case CustomColumnDataType.Number:
                if (!int.TryParse(
                        NormalizeIntegerText(text),
                        NumberStyles.AllowLeadingSign,
                        CultureInfo.InvariantCulture,
                        out var number))
                {
                    validationError =
                        $"Enter a whole number without decimals in custom column '{definition.Name}'.";
                    return false;
                }

                normalizedValue = number.ToString(CultureInfo.InvariantCulture);
                return true;

            default:
                validationError =
                    $"Custom column '{definition.Name}' has an unsupported type.";
                return false;
        }
    }


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

    private static bool TryParseDataType(
        string? value,
        out CustomColumnDataType dataType) =>
        Enum.TryParse(value?.Trim(), ignoreCase: true, out dataType) &&
        Enum.IsDefined(typeof(CustomColumnDataType), dataType);

    private static string NormalizeNumericText(string value)
    {
        var characters = value
            .Select(NormalizeDigit)
            .Where(character =>
                character != ',' &&
                character != '\u066C' &&
                character != ' ' &&
                character != '\u00A0' &&
                character != '\u202F')
            .Select(character => character == '\u066B' ? '.' : character)
            .ToArray();

        return new string(characters);
    }

    private static string NormalizeIntegerText(string value) =>
        new string(value.Select(NormalizeDigit).ToArray());

    private static char NormalizeDigit(char character) =>
        character switch
        {
            >= '\u0660' and <= '\u0669' =>
                (char)('0' + character - '\u0660'),
            >= '\u06F0' and <= '\u06F9' =>
                (char)('0' + character - '\u06F0'),
            _ => character
        };

    [GeneratedRegex("^custom_[a-f0-9]{32}$", RegexOptions.CultureInvariant)]
    private static partial Regex CustomFieldKeyPattern();
}

public sealed record CustomColumnDefinitionInput(
    int Id,
    string FieldKey,
    string Name,
    string DataType,
    long LayoutOrder,
    string RowVersion = "",
    bool IsDeleted = false);

public sealed record CustomColumnDefinitionData(
    int Id,
    string FieldKey,
    string Name,
    string DataType,
    long LayoutOrder,
    string RowVersion);

public sealed record CustomColumnPreparationResult(
    bool Succeeded,
    string ErrorMessage,
    List<CustomColumnDefinition> Definitions,
    List<CustomColumnDefinition> AddedDefinitions,
    List<CustomColumnDefinition> DeletedDefinitions,
    List<WorkOrder> AffectedWorkOrders)
{
    public static CustomColumnPreparationResult Success(
        IEnumerable<CustomColumnDefinition> definitions,
        IEnumerable<CustomColumnDefinition>? addedDefinitions = null,
        IEnumerable<CustomColumnDefinition>? deletedDefinitions = null,
        IEnumerable<WorkOrder>? affectedWorkOrders = null) =>
        new(
            true,
            string.Empty,
            definitions
                .OrderBy(column => column.LayoutOrder)
                .ThenBy(column => column.Id)
                .ToList(),
            (addedDefinitions ?? [])
                .OrderBy(column => column.LayoutOrder)
                .ToList(),
            (deletedDefinitions ?? [])
                .OrderBy(column => column.LayoutOrder)
                .ToList(),
            (affectedWorkOrders ?? [])
                .OrderBy(workOrder => workOrder.WorkYear)
                .ThenBy(workOrder => workOrder.DisplayOrder)
                .ThenBy(workOrder => workOrder.Id)
                .ToList());

    public static CustomColumnPreparationResult Failed(string message) =>
        new(false, message, [], [], [], []);
}
