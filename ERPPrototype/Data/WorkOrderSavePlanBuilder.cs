using ERPPrototype.Data.Entities;

namespace ERPPrototype.Data;

/// <summary>
/// Converts browser save inputs into one normalized and validated plan.
/// This class performs no database access and starts no transaction.
/// Database authorization, global duplicate checks, concurrency enforcement,
/// persistence, and commit/rollback remain owned by WorkOrderService.
/// </summary>
public sealed class WorkOrderSavePlanBuilder
{
    public const int MinimumWorkYear = 2000;
    public const int MaximumWorkYear = 2100;

    public WorkOrderSavePlanBuildResult Build(
        int workYear,
        IEnumerable<WorkOrder> addedRecords,
        IEnumerable<WorkOrderChangeSet> changedRecords,
        IEnumerable<WorkOrder> deletedRecords)
    {
        if (!IsValidWorkYear(workYear))
        {
            return WorkOrderSavePlanBuildResult.Failed(
                WorkOrderSaveResult.ValidationFailure(
                    $"Work year must be between {MinimumWorkYear} and {MaximumWorkYear}."));
        }

        var normalizedChangedRecords = changedRecords
            .Select(change => new WorkOrderChangeSet(
                change.Record,
                WorkOrderFieldRegistry.NormalizeChangedFields(
                    change.ChangedFields,
                    defaultToAll: true)))
            .ToList();

        // Keep every Id == 0 record. Several newly inserted rows can share Id 0
        // before saving, so grouping all new rows by Id would lose data.
        var newRecordCandidates = addedRecords
            .Concat(
                normalizedChangedRecords
                    .Where(change => change.Record.Id <= 0)
                    .Select(change => change.Record))
            .Where(workOrder => !IsCompletelyBlank(workOrder))
            .ToList();

        var newRecords = newRecordCandidates
            .Where(workOrder => workOrder.Id == 0)
            .Concat(
                newRecordCandidates
                    .Where(workOrder => workOrder.Id < 0)
                    .GroupBy(workOrder => workOrder.Id)
                    .Select(group => group.Last()))
            .ToList();

        var existingChangedRecords = normalizedChangedRecords
            .Where(change => change.Record.Id > 0)
            .GroupBy(change => change.Record.Id)
            .Select(group => group.Last())
            .ToList();

        var existingDeletedRecords = deletedRecords
            .Where(workOrder => workOrder.Id > 0)
            .GroupBy(workOrder => workOrder.Id)
            .Select(group => group.Last())
            .ToList();

        var changedIds = existingChangedRecords
            .Select(change => change.Record.Id)
            .ToHashSet();

        var deletedIds = existingDeletedRecords
            .Select(workOrder => workOrder.Id)
            .ToHashSet();

        if (changedIds.Overlaps(deletedIds))
        {
            return WorkOrderSavePlanBuildResult.Failed(
                WorkOrderSaveResult.ValidationFailure(
                    "The same work order cannot be modified and deleted in one save operation."));
        }

        foreach (var workOrder in newRecords)
        {
            NormalizeEditableFields(
                workOrder,
                WorkOrderFieldRegistry.EditableFields);
        }

        foreach (var change in existingChangedRecords)
        {
            NormalizeEditableFields(
                change.Record,
                change.ChangedFields);
        }

        var validationError =
            ValidateNewRecords(newRecords) ??
            ValidateChangedRecords(existingChangedRecords);

        if (!string.IsNullOrWhiteSpace(validationError))
        {
            return WorkOrderSavePlanBuildResult.Failed(
                WorkOrderSaveResult.ValidationFailure(validationError));
        }

        var recordWithoutValidRowVersion = existingChangedRecords
            .Select(change => change.Record)
            .Concat(existingDeletedRecords)
            .FirstOrDefault(workOrder =>
                workOrder.RowVersion is null ||
                workOrder.RowVersion.Length != 8);

        if (recordWithoutValidRowVersion is not null)
        {
            return WorkOrderSavePlanBuildResult.Failed(
                WorkOrderSaveResult.ConcurrencyFailure(
                    "The work-order version is missing or outdated. Refresh the sheet before saving.",
                    recordWithoutValidRowVersion.Id,
                    recordWithoutValidRowVersion.WorkOrderNumber,
                    recordWithoutValidRowVersion.WorkTypeCode));
        }

        return WorkOrderSavePlanBuildResult.Success(
            new WorkOrderSavePlan(
                workYear,
                newRecords,
                existingChangedRecords,
                existingDeletedRecords,
                changedIds,
                deletedIds));
    }

    public static bool IsCompletelyBlank(WorkOrder workOrder)
    {
        return
            string.IsNullOrWhiteSpace(workOrder.WorkOrderNumber) &&
            string.IsNullOrWhiteSpace(workOrder.WorkTypeCode) &&
            workOrder.AssignmentDate is null &&
            workOrder.WorkOrderValue is null &&
            workOrder.PartialAmount is null &&
            string.IsNullOrWhiteSpace(workOrder.Busket) &&
            string.IsNullOrWhiteSpace(workOrder.Status) &&
            string.IsNullOrWhiteSpace(workOrder.Notes) &&
            !CustomColumnService.HasAnyValue(workOrder.CustomValuesJson);
    }

    public static int ResolveTargetWorkYear(
        int fallbackWorkYear,
        DateTime? assignmentDate) =>
        assignmentDate?.Year ?? fallbackWorkYear;

    private static void NormalizeEditableFields(
        WorkOrder workOrder,
        IReadOnlySet<string> fields)
    {
        if (fields.Contains(WorkOrderFieldRegistry.WorkOrderNumber))
        {
            workOrder.WorkOrderNumber =
                NormalizeIdentityDigits(
                    workOrder.WorkOrderNumber?.Trim() ?? string.Empty);
        }

        if (fields.Contains(WorkOrderFieldRegistry.WorkTypeCode))
        {
            workOrder.WorkTypeCode =
                NormalizeIdentityDigits(
                    workOrder.WorkTypeCode?.Trim() ?? string.Empty);
        }

        if (WorkOrderFieldRegistry.Affects(
                fields,
                WorkOrderFieldRegistry.FinancialFields))
        {
            WorkOrderFinancialRules.Normalize(workOrder);
        }

        if (fields.Contains(WorkOrderFieldRegistry.Basket))
        {
            workOrder.Busket =
                workOrder.Busket?.Trim() ?? string.Empty;
        }

        if (fields.Contains(WorkOrderFieldRegistry.Status))
        {
            workOrder.Status =
                workOrder.Status?.Trim() ?? string.Empty;
        }

        if (fields.Contains(WorkOrderFieldRegistry.Notes))
        {
            workOrder.Notes = string.IsNullOrWhiteSpace(workOrder.Notes)
                ? null
                : workOrder.Notes.Trim();
        }

        if (fields.Contains(WorkOrderFieldRegistry.CustomValues))
        {
            workOrder.CustomValuesJson =
                string.IsNullOrWhiteSpace(workOrder.CustomValuesJson)
                    ? "{}"
                    : workOrder.CustomValuesJson;
        }
    }

    private static string? ValidateNewRecords(
        IEnumerable<WorkOrder> workOrders)
    {
        foreach (var workOrder in workOrders)
        {
            var validationError = ValidateFields(
                workOrder,
                WorkOrderFieldRegistry.EditableFields);

            if (!string.IsNullOrWhiteSpace(validationError))
            {
                return validationError;
            }
        }

        return null;
    }

    private static string? ValidateChangedRecords(
        IEnumerable<WorkOrderChangeSet> changes)
    {
        foreach (var change in changes)
        {
            var validationError = ValidateFields(
                change.Record,
                change.ChangedFields);

            if (!string.IsNullOrWhiteSpace(validationError))
            {
                return validationError;
            }
        }

        return null;
    }

    private static string? ValidateFields(
        WorkOrder workOrder,
        IReadOnlySet<string> fields)
    {
        if (fields.Contains(WorkOrderFieldRegistry.WorkOrderNumber))
        {
            if (string.IsNullOrWhiteSpace(workOrder.WorkOrderNumber))
            {
                return "Work Order Number is required.";
            }

            if (!IsExactAsciiDigits(
                    workOrder.WorkOrderNumber,
                    9))
            {
                return "Work Order Number must contain exactly 9 digits.";
            }
        }

        if (fields.Contains(WorkOrderFieldRegistry.WorkTypeCode))
        {
            if (string.IsNullOrWhiteSpace(workOrder.WorkTypeCode))
            {
                return "Work Type is required.";
            }

            if (!IsExactAsciiDigits(
                    workOrder.WorkTypeCode,
                    3))
            {
                return "Work Type must contain exactly 3 digits.";
            }
        }

        if (WorkOrderFieldRegistry.Affects(
                fields,
                WorkOrderFieldRegistry.FinancialFields))
        {
            var financialError = WorkOrderFinancialRules.Validate(
                workOrder,
                requireWorkOrderValue: true);

            if (!string.IsNullOrWhiteSpace(financialError))
            {
                return financialError;
            }
        }

        if (fields.Contains(WorkOrderFieldRegistry.Basket))
        {
            if (string.IsNullOrWhiteSpace(workOrder.Busket))
            {
                return "Busket is required.";
            }

            if (!WorkOrderBuskets.All.Contains(workOrder.Busket))
            {
                return "Select a valid value from the Busket list.";
            }
        }

        if (
            fields.Contains(WorkOrderFieldRegistry.AssignmentDate) &&
            workOrder.AssignmentDate is not null &&
            !IsValidWorkYear(
                workOrder.AssignmentDate.Value.Year))
        {
            return $"Assignment Date year must be between {MinimumWorkYear} and {MaximumWorkYear}.";
        }

        if (
            fields.Contains(WorkOrderFieldRegistry.Status) &&
            workOrder.Status?.Length > 150)
        {
            return "Status cannot exceed 150 characters.";
        }

        if (
            fields.Contains(WorkOrderFieldRegistry.Notes) &&
            workOrder.Notes?.Length > 1000)
        {
            return "Notes cannot exceed 1000 characters.";
        }

        return null;
    }

    private static string NormalizeIdentityDigits(string value)
    {
        return new string(
            value.Select(character =>
                character switch
                {
                    >= '\u0660' and <= '\u0669' =>
                        (char)('0' + character - '\u0660'),

                    >= '\u06F0' and <= '\u06F9' =>
                        (char)('0' + character - '\u06F0'),

                    _ => character
                })
            .ToArray());
    }

    private static bool IsExactAsciiDigits(
        string value,
        int requiredLength)
    {
        return
            value.Length == requiredLength &&
            value.All(character =>
                character >= '0' &&
                character <= '9');
    }

    private static bool IsValidWorkYear(int workYear) =>
        workYear >= MinimumWorkYear &&
        workYear <= MaximumWorkYear;
}

public sealed record WorkOrderSavePlan(
    int WorkYear,
    List<WorkOrder> NewRecords,
    List<WorkOrderChangeSet> ExistingChangedRecords,
    List<WorkOrder> ExistingDeletedRecords,
    HashSet<int> ChangedIds,
    HashSet<int> DeletedIds);

public sealed record WorkOrderSavePlanBuildResult(
    WorkOrderSavePlan? Plan,
    WorkOrderSaveResult? Failure)
{
    public bool Succeeded => Plan is not null;

    public static WorkOrderSavePlanBuildResult Success(
        WorkOrderSavePlan plan) =>
        new(plan, null);

    public static WorkOrderSavePlanBuildResult Failed(
        WorkOrderSaveResult failure) =>
        new(null, failure);
}
