using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using ERPPrototype.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace ERPPrototype.Data;

/// <summary>
/// Owns department custom-column definitions and the typed values stored in
/// each WorkOrder.CustomValuesJson document. Phase 9.3A supports creation only;
/// rename, delete, type changes, and width changes remain separate operations.
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
            "Basket",
            "Status",
            "Notes"
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
            7_000_000_000_000L,
            8_000_000_000_000L,
            9_000_000_000_000L
        };

    public static async Task<List<CustomColumnDefinitionData>>
        LoadDefinitionsAsync(
            ApplicationDbContext dbContext,
            int departmentId,
            CancellationToken cancellationToken = default)
    {
        var definitions = await dbContext.CustomColumnDefinitions
            .AsNoTracking()
            .Where(column => column.DepartmentId == departmentId)
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
            string userId,
            IReadOnlyCollection<CustomColumnDefinitionInput>? incomingColumns,
            bool configurationChanged,
            CancellationToken cancellationToken = default)
    {
        var existing = await dbContext.CustomColumnDefinitions
            .Where(column => column.DepartmentId == departmentId)
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

        var existingById = existing.ToDictionary(column => column.Id);
        var incomingExistingById = incoming
            .Where(column => column.Id > 0)
            .GroupBy(column => column.Id)
            .ToDictionary(group => group.Key, group => group.Last());

        if (
            incomingExistingById.Count != existingById.Count ||
            existingById.Keys.Any(id => !incomingExistingById.ContainsKey(id)))
        {
            return CustomColumnPreparationResult.Failed(
                "The custom-column layout changed in another session. Refresh the sheet and try again.");
        }

        foreach (var existingColumn in existing)
        {
            var incomingColumn = incomingExistingById[existingColumn.Id];

            if (
                !string.Equals(
                    incomingColumn.FieldKey,
                    existingColumn.FieldKey,
                    StringComparison.Ordinal) ||
                !string.Equals(
                    incomingColumn.Name?.Trim(),
                    existingColumn.Name,
                    StringComparison.Ordinal) ||
                !TryParseDataType(
                    incomingColumn.DataType,
                    out var incomingDataType) ||
                incomingDataType != existingColumn.DataType ||
                incomingColumn.LayoutOrder != existingColumn.LayoutOrder)
            {
                return CustomColumnPreparationResult.Failed(
                    "Phase 9.3A allows adding custom columns only. Refresh the sheet before changing an existing column.");
            }
        }

        var names = new HashSet<string>(
            ExistingColumnNames,
            StringComparer.OrdinalIgnoreCase);

        names.UnionWith(existing.Select(column => column.Name));

        var fieldKeys = new HashSet<string>(
            existing.Select(column => column.FieldKey),
            StringComparer.Ordinal);

        var layoutOrders = new HashSet<long>(
            existing.Select(column => column.LayoutOrder));

        var added = new List<CustomColumnDefinition>();
        var utcNow = DateTime.UtcNow;

        foreach (var incomingColumn in incoming.Where(column => column.Id <= 0))
        {
            var name = incomingColumn.Name?.Trim() ?? string.Empty;
            var fieldKey = incomingColumn.FieldKey?.Trim() ?? string.Empty;

            if (string.IsNullOrWhiteSpace(name))
            {
                return CustomColumnPreparationResult.Failed(
                    "Custom column name is required.");
            }

            if (name.Length > MaximumNameLength)
            {
                return CustomColumnPreparationResult.Failed(
                    $"Custom column name cannot exceed {MaximumNameLength} characters.");
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

            if (!names.Add(name))
            {
                return CustomColumnPreparationResult.Failed(
                    $"A custom column named '{name}' already exists in this department.");
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
                FieldKey = fieldKey,
                Name = name,
                DataType = dataType,
                LayoutOrder = incomingColumn.LayoutOrder,
                CreatedAt = utcNow,
                CreatedBy = userId
            };

            dbContext.CustomColumnDefinitions.Add(entity);
            existing.Add(entity);
            added.Add(entity);
        }

        return CustomColumnPreparationResult.Success(existing, added);
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
                "The sheet contains a custom column that no longer belongs to this department. Refresh the page.";
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
    string RowVersion = "");

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
    List<CustomColumnDefinition> AddedDefinitions)
{
    public static CustomColumnPreparationResult Success(
        IEnumerable<CustomColumnDefinition> definitions,
        IEnumerable<CustomColumnDefinition>? addedDefinitions = null) =>
        new(
            true,
            string.Empty,
            definitions
                .OrderBy(column => column.LayoutOrder)
                .ThenBy(column => column.Id)
                .ToList(),
            (addedDefinitions ?? [])
                .OrderBy(column => column.LayoutOrder)
                .ToList());

    public static CustomColumnPreparationResult Failed(string message) =>
        new(false, message, [], []);
}
