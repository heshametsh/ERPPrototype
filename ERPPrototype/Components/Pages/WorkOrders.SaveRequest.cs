using System.Globalization;
using System.Text.Json;
using ERPPrototype.Data;
using ERPPrototype.Data.Entities;

namespace ERPPrototype.Components.Pages;

public partial class WorkOrders
{
    private static SaveRequestPreparation PrepareSaveRequest(
        TabulatorSaveDelta saveDelta,
        int selectedWorkYear)
    {
        var dirtyRows = saveDelta.DirtyRows ?? [];
        var deletedRows = saveDelta.DeletedRows ?? [];
        var customColumns = saveDelta.CustomColumns ?? [];
        var customColumnsChanged = saveDelta.CustomColumnsChanged;

        if (
            dirtyRows.Count == 0 &&
            deletedRows.Count == 0 &&
            !customColumnsChanged)
        {
            return new SaveRequestPreparation
            {
                DirtyRows = dirtyRows,
                DeletedRows = deletedRows,
                CustomColumns = customColumns,
                CustomColumnsChanged = customColumnsChanged
            };
        }

        var blankAddedRow = dirtyRows
            .FirstOrDefault(row =>
                row.Id <= 0 &&
                IsCompletelyBlank(row));

        if (blankAddedRow is not null)
        {
            return new SaveRequestPreparation
            {
                DirtyRows = dirtyRows,
                DeletedRows = deletedRows,
                ValidationMessage =
                    "تعذر الحفظ: أكمل بيانات الصفوف الجديدة أو احذف الصفوف الفارغة أولًا."
            };
        }

        var addedWorkOrders = new List<WorkOrder>();
        var changedWorkOrders = new List<WorkOrderChangeSet>();
        var addedRowMappings = new List<PendingAddedRowMapping>();
        var movedToOtherYearsCount = 0;
        var destinationYears = new HashSet<int>();

        foreach (var row in dirtyRows)
        {
            var rawChangedFields = row.ChangedFields ?? [];
            var changedFields = new HashSet<string>(
                WorkOrderFieldRegistry.NormalizeChangedFields(
                    rawChangedFields,
                    defaultToAll: rawChangedFields.Count == 0),
                StringComparer.Ordinal);

            if (rawChangedFields.Any(field =>
                field?.StartsWith("custom_", StringComparison.Ordinal) == true))
            {
                changedFields.Add(WorkOrderFieldRegistry.CustomValues);
            }

            if (!TryParseAssignmentDate(
                    row.AssignmentDate,
                    out var assignmentDate))
            {
                return new SaveRequestPreparation
                {
                    DirtyRows = dirtyRows,
                    DeletedRows = deletedRows,
                    ValidationMessage =
                        $"تعذر الحفظ: تاريخ الإسناد غير صحيح في أمر العمل {row.WorkOrderNumber}."
                };
            }

            if (!TryParseAmount(
                    row.WorkOrderValue,
                    out var workOrderValue))
            {
                return new SaveRequestPreparation
                {
                    DirtyRows = dirtyRows,
                    DeletedRows = deletedRows,
                    ValidationMessage =
                        $"تعذر الحفظ: قيمة أمر العمل غير صحيحة في أمر العمل {row.WorkOrderNumber}."
                };
            }

            if (!TryParseAmount(
                    row.PartialAmount,
                    out var partialAmount))
            {
                return new SaveRequestPreparation
                {
                    DirtyRows = dirtyRows,
                    DeletedRows = deletedRows,
                    ValidationMessage =
                        $"تعذر الحفظ: المبلغ الجزئي غير صحيح في أمر العمل {row.WorkOrderNumber}."
                };
            }

            var destinationYear =
                assignmentDate?.Year ?? selectedWorkYear;

            if (
                destinationYear != selectedWorkYear &&
                (
                    row.Id <= 0 ||
                    changedFields.Contains(
                        WorkOrderFieldRegistry.AssignmentDate)
                ))
            {
                movedToOtherYearsCount++;
                destinationYears.Add(destinationYear);
            }

            var workOrder = new WorkOrder
            {
                Id = row.Id,
                RowVersion = DecodeRowVersion(row.RowVersion),
                WorkYear = destinationYear,
                DisplayOrder = row.DisplayOrder,
                WorkOrderNumber = row.WorkOrderNumber ?? string.Empty,
                WorkTypeCode = row.WorkTypeCode ?? string.Empty,
                AssignmentDate = assignmentDate,
                WorkOrderValue = workOrderValue,
                PartialAmount = partialAmount,
                Busket = row.Basket ?? string.Empty,
                Status = row.Status ?? string.Empty,
                Notes = row.Notes,
                CustomValuesJson = BuildCustomValuesJson(
                    row,
                    customColumns)
            };

            if (row.Id <= 0)
            {
                addedWorkOrders.Add(workOrder);

                addedRowMappings.Add(
                    new PendingAddedRowMapping
                    {
                        ClientKey = row.ClientKey,
                        TemporaryId = row.Id,
                        WorkOrder = workOrder
                    });
            }
            else
            {
                changedWorkOrders.Add(
                    new WorkOrderChangeSet(
                        workOrder,
                        changedFields));
            }
        }

        var deletedWorkOrders = deletedRows
            .Where(row => row.Id > 0)
            .Select(row => new WorkOrder
            {
                Id = row.Id,
                RowVersion = DecodeRowVersion(row.RowVersion),
                WorkYear = selectedWorkYear
            })
            .ToList();

        return new SaveRequestPreparation
        {
            DirtyRows = dirtyRows,
            DeletedRows = deletedRows,
            CustomColumns = customColumns,
            CustomColumnsChanged = customColumnsChanged,
            Request = new PreparedWorkOrderSaveRequest
            {
                DirtyRows = dirtyRows,
                AddedWorkOrders = addedWorkOrders,
                ChangedWorkOrders = changedWorkOrders,
                DeletedWorkOrders = deletedWorkOrders,
                AddedRowMappings = addedRowMappings,
                MovedToOtherYearsCount = movedToOtherYearsCount,
                DestinationYears = destinationYears,
                CustomColumns = customColumns,
                CustomColumnsChanged = customColumnsChanged
            }
        };
    }

    private static bool IsCompletelyBlank(
        TabulatorWorkOrderRow row)
    {
        return
            string.IsNullOrWhiteSpace(row.WorkOrderNumber) &&
            string.IsNullOrWhiteSpace(row.WorkTypeCode) &&
            string.IsNullOrWhiteSpace(row.AssignmentDate) &&
            string.IsNullOrWhiteSpace(row.WorkOrderValue) &&
            string.IsNullOrWhiteSpace(row.PartialAmount) &&
            string.IsNullOrWhiteSpace(row.Basket) &&
            string.IsNullOrWhiteSpace(row.Status) &&
            string.IsNullOrWhiteSpace(row.Notes) &&
            !row.CustomFields.Values.Any(value =>
                !string.IsNullOrWhiteSpace(
                    value.ValueKind == JsonValueKind.String
                        ? value.GetString()
                        : value.ToString()));
    }

    private static string BuildCustomValuesJson(
        TabulatorWorkOrderRow row,
        IReadOnlyCollection<CustomColumnDefinitionInput> customColumns)
    {
        var values = new Dictionary<string, string>(StringComparer.Ordinal);

        foreach (var column in customColumns)
        {
            if (!row.CustomFields.TryGetValue(column.FieldKey, out var rawValue))
            {
                continue;
            }

            var value = rawValue.ValueKind == JsonValueKind.String
                ? rawValue.GetString() ?? string.Empty
                : rawValue.ToString();

            if (!string.IsNullOrWhiteSpace(value))
            {
                values[column.FieldKey] = value;
            }
        }

        return JsonSerializer.Serialize(values);
    }

    private static bool TryParseAssignmentDate(
        string? value,
        out DateTime? assignmentDate)
    {
        assignmentDate = null;

        if (string.IsNullOrWhiteSpace(value))
        {
            return true;
        }

        if (!DateTime.TryParseExact(
                value.Trim(),
                "dd/MM/yyyy",
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out var parsedDate))
        {
            return false;
        }

        assignmentDate = parsedDate.Date;
        return true;
    }


    private static bool TryParseAmount(
        string? value,
        out decimal? amount)
    {
        amount = null;

        if (string.IsNullOrWhiteSpace(value))
        {
            return true;
        }

        var normalized = NormalizeAmountText(value);

        if (!decimal.TryParse(
                normalized,
                NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint,
                CultureInfo.InvariantCulture,
                out var parsedAmount))
        {
            return false;
        }

        amount = WorkOrderFinancialRules.NormalizeAmount(parsedAmount);
        return true;
    }

    private static string NormalizeAmountText(string value)
    {
        var characters = value
            .Trim()
            .Select(character =>
                character switch
                {
                    >= '\u0660' and <= '\u0669' =>
                        (char)('0' + character - '\u0660'),

                    >= '\u06F0' and <= '\u06F9' =>
                        (char)('0' + character - '\u06F0'),

                    '\u066B' => '.',
                    _ => character
                })
            .Where(character =>
                character != ',' &&
                character != '\u066C' &&
                character != ' ' &&
                character != '\u00A0' &&
                character != '\u202F')
            .ToArray();

        return new string(characters);
    }

    private static byte[] DecodeRowVersion(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return [];
        }

        try
        {
            return Convert.FromBase64String(value);
        }
        catch (FormatException)
        {
            return [];
        }
    }

    private sealed class SaveRequestPreparation
    {
        public List<TabulatorWorkOrderRow> DirtyRows { get; init; } = [];
        public List<TabulatorDeletedRow> DeletedRows { get; init; } = [];
        public List<CustomColumnDefinitionInput> CustomColumns { get; init; } = [];
        public bool CustomColumnsChanged { get; init; }
        public PreparedWorkOrderSaveRequest? Request { get; init; }
        public string? ValidationMessage { get; init; }

        public bool HasChanges =>
            DirtyRows.Count > 0 ||
            DeletedRows.Count > 0 ||
            CustomColumnsChanged;
    }

    private sealed class PreparedWorkOrderSaveRequest
    {
        public List<TabulatorWorkOrderRow> DirtyRows { get; init; } = [];
        public List<WorkOrder> AddedWorkOrders { get; init; } = [];
        public List<WorkOrderChangeSet> ChangedWorkOrders { get; init; } = [];
        public List<WorkOrder> DeletedWorkOrders { get; init; } = [];
        public List<PendingAddedRowMapping> AddedRowMappings { get; init; } = [];
        public int MovedToOtherYearsCount { get; init; }
        public HashSet<int> DestinationYears { get; init; } = [];
        public List<CustomColumnDefinitionInput> CustomColumns { get; init; } = [];
        public bool CustomColumnsChanged { get; init; }
    }

    private sealed class TabulatorSaveDelta
    {
        public TabulatorSaveDelta()
        {
        }

        public List<TabulatorWorkOrderRow>? DirtyRows { get; set; }
        public List<TabulatorDeletedRow>? DeletedRows { get; set; }
        public List<CustomColumnDefinitionInput>? CustomColumns { get; set; }
        public bool CustomColumnsChanged { get; set; }
    }

    private sealed class TabulatorDeletedRow
    {
        public TabulatorDeletedRow()
        {
        }

        public int Id { get; set; }
        public string RowVersion { get; set; } = string.Empty;
    }

    private sealed class PendingAddedRowMapping
    {
        public string ClientKey { get; set; } = string.Empty;
        public int TemporaryId { get; set; }
        public WorkOrder WorkOrder { get; set; } = new();
    }
}
