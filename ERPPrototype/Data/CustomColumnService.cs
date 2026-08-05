using System.Data;
using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using ERPPrototype.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace ERPPrototype.Data;

/// <summary>
/// Owns department custom-column definitions and the typed values stored in
/// each WorkOrder.CustomValuesJson document. The service validates create,
/// rename, empty-column type changes, and transactional deletion.
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
            CancellationToken cancellationToken = default)
    {
        var definitions = await dbContext.CustomColumnDefinitions
            .AsNoTracking()
            .Where(column => column.DepartmentId == departmentId)
            .OrderBy(column => column.LayoutOrder)
            .ThenBy(column => column.Id)
            .ToListAsync(cancellationToken);

        if (definitions.Count == 0)
        {
            return [];
        }

        var fieldsWithStoredValues =
            await LoadFieldsWithStoredValuesAsync(
                dbContext,
                departmentId,
                cancellationToken);

        return definitions
            .Select(definition => MapDefinition(
                definition,
                fieldsWithStoredValues.Contains(definition.FieldKey)))
            .ToList();
    }

    public static async Task<HashSet<string>>
        LoadFieldsWithStoredValuesAsync(
            ApplicationDbContext dbContext,
            int departmentId,
            CancellationToken cancellationToken = default)
    {
        var result = new HashSet<string>(StringComparer.Ordinal);
        var connection = dbContext.Database.GetDbConnection();
        var shouldClose = connection.State != ConnectionState.Open;

        if (shouldClose)
        {
            await connection.OpenAsync(cancellationToken);
        }

        try
        {
            await using var command = connection.CreateCommand();
            command.Transaction = dbContext.Database.CurrentTransaction
                ?.GetDbTransaction();
            command.CommandText =
                """
                SELECT DISTINCT CAST([entry].[key] AS nvarchar(40))
                FROM [WorkOrders] AS [workOrder]
                CROSS APPLY OPENJSON(
                    CASE
                        WHEN ISJSON([workOrder].[CustomValuesJson]) = 1
                            THEN [workOrder].[CustomValuesJson]
                        ELSE N'{}'
                    END) AS [entry]
                WHERE [workOrder].[DepartmentId] = @departmentId
                  AND NULLIF(
                        LTRIM(RTRIM(CONVERT(nvarchar(max), [entry].[value]))),
                        N'') IS NOT NULL;
                """;

            var parameter = command.CreateParameter();
            parameter.ParameterName = "@departmentId";
            parameter.Value = departmentId;
            command.Parameters.Add(parameter);

            await using var reader =
                await command.ExecuteReaderAsync(cancellationToken);

            while (await reader.ReadAsync(cancellationToken))
            {
                if (!reader.IsDBNull(0))
                {
                    var fieldKey = reader.GetString(0).Trim();

                    if (!string.IsNullOrWhiteSpace(fieldKey))
                    {
                        result.Add(fieldKey);
                    }
                }
            }
        }
        finally
        {
            if (shouldClose)
            {
                await connection.CloseAsync();
            }
        }

        return result;
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
        HashSet<string>? fieldsWithStoredValues = null;
        var utcNow = DateTime.UtcNow;

        foreach (var existingColumn in existing)
        {
            var incomingColumn = incomingExistingById[existingColumn.Id];

            if (
                !string.Equals(
                    incomingColumn.FieldKey?.Trim(),
                    existingColumn.FieldKey,
                    StringComparison.Ordinal) ||
                incomingColumn.LayoutOrder != existingColumn.LayoutOrder ||
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
                fieldsWithStoredValues ??=
                    await LoadFieldsWithStoredValuesAsync(
                        dbContext,
                        departmentId,
                        cancellationToken);

                if (fieldsWithStoredValues.Contains(existingColumn.FieldKey))
                {
                    return CustomColumnPreparationResult.Failed(
                        $"The type of custom column '{existingColumn.Name}' cannot be changed because it already contains saved values.");
                }
            }

            if (!fieldKeys.Add(existingColumn.FieldKey))
            {
                return CustomColumnPreparationResult.Failed(
                    "The same custom column was submitted more than once.");
            }

            if (!layoutOrders.Add(existingColumn.LayoutOrder))
            {
                return CustomColumnPreparationResult.Failed(
                    "Two custom columns cannot occupy the same position.");
            }

            existingColumn.Name = name;
            existingColumn.DataType = dataType;
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
                userId,
                deletedFieldKeys,
                cancellationToken);

        if (deletedFieldKeys.Count > 0)
        {
            var layoutsToDelete = await dbContext.DepartmentColumnLayouts
                .Where(layout =>
                    layout.DepartmentId == departmentId &&
                    deletedFieldKeys.Contains(layout.FieldKey))
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
                $"A column named '{name}' already exists in this department.";
            return false;
        }

        return true;
    }

    private static async Task<List<WorkOrder>> RemoveDeletedValuesAsync(
        ApplicationDbContext dbContext,
        int departmentId,
        string userId,
        IReadOnlySet<string> deletedFieldKeys,
        CancellationToken cancellationToken)
    {
        var candidates = await dbContext.WorkOrders
            .Where(workOrder =>
                workOrder.DepartmentId == departmentId &&
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
        CustomColumnDefinition definition,
        bool hasStoredValues = false) =>
        new(
            definition.Id,
            definition.FieldKey,
            definition.Name,
            definition.DataType.ToString(),
            definition.LayoutOrder,
            Convert.ToBase64String(definition.RowVersion),
            hasStoredValues);

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
    string RowVersion,
    bool HasStoredValues = false);

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
