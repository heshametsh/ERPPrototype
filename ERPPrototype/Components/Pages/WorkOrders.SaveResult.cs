using System.Globalization;
using ERPPrototype.Data;

namespace ERPPrototype.Components.Pages;

public partial class WorkOrders
{
    private static SaveFailurePresentation InterpretSaveFailure(
        WorkOrderSaveResult result,
        IReadOnlyList<TabulatorWorkOrderRow> dirtyRows)
    {
        if (
            result.FailureType ==
                WorkOrderSaveFailureType.Duplicate)
        {
            var duplicateConflicts =
                result.DuplicateConflicts?.ToList() ?? [];

            /*
             * Compatibility fallback for an older service result that
             * contains one duplicate only.
             */
            if (
                duplicateConflicts.Count == 0 &&
                !string.IsNullOrWhiteSpace(result.WorkOrderNumber) &&
                !string.IsNullOrWhiteSpace(result.WorkTypeCode))
            {
                duplicateConflicts.Add(
                    new WorkOrderDuplicateConflict(
                        result.WorkOrderNumber,
                        result.WorkTypeCode,
                        result.ExistingWorkYear,
                        result.ExistingDepartmentName));
            }

            var conflictsByKey = duplicateConflicts
                .GroupBy(conflict =>
                    CreateDuplicateKey(
                        conflict.WorkOrderNumber,
                        conflict.WorkTypeCode))
                .ToDictionary(
                    group => group.Key,
                    group => group.Last(),
                    StringComparer.Ordinal);

            var validationErrors =
                new List<TabulatorValidationError>();

            foreach (var row in dirtyRows
                .OrderBy(row => row.DisplayOrder))
            {
                var rowKey = CreateDuplicateKey(
                    row.WorkOrderNumber,
                    row.WorkTypeCode);

                if (!conflictsByKey.TryGetValue(
                        rowKey,
                        out var conflict))
                {
                    continue;
                }

                var duplicateLocation =
                    conflict.ExistingWorkYear is int existingWorkYear
                        ? string.IsNullOrWhiteSpace(
                            conflict.ExistingDepartmentName)
                            ? $" في سنة {existingWorkYear}"
                            : $" في قسم {conflict.ExistingDepartmentName}، سنة {existingWorkYear}"
                        : " داخل التغييرات الحالية";

                var duplicateMessage =
                    $"رقم أمر العمل {conflict.WorkOrderNumber} " +
                    $"مع النوع {conflict.WorkTypeCode} " +
                    $"مكرر{duplicateLocation}.";

                validationErrors.Add(
                    new TabulatorValidationError
                    {
                        RowId = row.Id,
                        Field = "workOrderNumber",
                        Code = result.ErrorCode,
                        Message = duplicateMessage
                    });

                validationErrors.Add(
                    new TabulatorValidationError
                    {
                        RowId = row.Id,
                        Field = "workTypeCode",
                        Code = result.ErrorCode,
                        Message = duplicateMessage
                    });
            }

            var duplicateIdentityCount = conflictsByKey.Count;

            return new SaveFailurePresentation
            {
                StatusMessage = duplicateIdentityCount == 1
                    ? "فشل الحفظ: يوجد أمر عمل مكرر. تم تحديد الصف المخالف."
                    : $"فشل الحفظ: يوجد {duplicateIdentityCount} أوامر عمل مكررة. تم تحديد جميع الصفوف المخالفة بالترتيب.",
                ValidationErrors = validationErrors
            };
        }

        if (
            result.FailureType ==
                WorkOrderSaveFailureType.Concurrency)
        {
            var conflictMessage =
                "تم تعديل أمر العمل أو نقله أو حذفه من جلسة أخرى بعد فتح الشيت. " +
                "لم يتم حفظ تغييراتك. حدّث الصفحة ثم أعد التعديل.";

            var validationErrors =
                new List<TabulatorValidationError>();

            if (result.WorkOrderId is int conflictId)
            {
                var conflictRow = dirtyRows
                    .FirstOrDefault(row =>
                        row.Id == conflictId);

                if (conflictRow is not null)
                {
                    validationErrors.Add(
                        new TabulatorValidationError
                        {
                            RowId = conflictRow.Id,
                            Field = "workOrderNumber",
                            Code = result.ErrorCode,
                            Message = conflictMessage
                        });
                }
            }

            return new SaveFailurePresentation
            {
                StatusMessage = $"فشل الحفظ: {conflictMessage}",
                ValidationErrors = validationErrors
            };
        }

        return new SaveFailurePresentation
        {
            StatusMessage = $"فشل الحفظ: {result.ErrorMessage}"
        };
    }

    private static PreparedSaveResult PrepareSuccessfulSaveResult(
        WorkOrderSaveResult result,
        PreparedWorkOrderSaveRequest request,
        int selectedWorkYear,
        IEnumerable<int> availableWorkYears,
        IEnumerable<TabulatorWorkOrderRow> currentRows,
        int currentYear)
    {
        var savedRecords =
            result.SavedRecords ??
            Array.Empty<WorkOrderSavedRecord>();

        var savedRowMappings = request.AddedRowMappings
            .Select(mapping =>
                new TabulatorSavedRowMapping
                {
                    ClientKey = mapping.ClientKey,
                    TemporaryId = mapping.TemporaryId,
                    DatabaseId = mapping.WorkOrder.Id
                })
            .ToList();

        var clientKeyByDatabaseId = request.DirtyRows
            .Where(row => row.Id > 0)
            .GroupBy(row => row.Id)
            .ToDictionary(
                group => group.Key,
                group => group.Last().ClientKey);

        foreach (var mapping in savedRowMappings)
        {
            if (mapping.DatabaseId > 0)
            {
                clientKeyByDatabaseId[mapping.DatabaseId] =
                    mapping.ClientKey;
            }
        }

        var savedRowsInCurrentYear = savedRecords
            .Where(record =>
                record.WorkYear == selectedWorkYear)
            .Select(record =>
                MapSavedRow(
                    record,
                    clientKeyByDatabaseId.GetValueOrDefault(
                        record.Id,
                        $"db:{record.Id}")))
            .ToList();

        var temporaryIdByDatabaseId = savedRowMappings
            .Where(mapping => mapping.DatabaseId > 0)
            .ToDictionary(
                mapping => mapping.DatabaseId,
                mapping => mapping.TemporaryId);

        var removedRowIds = new HashSet<int>(
            result.DeletedRecordIds ??
            Array.Empty<int>());

        // Remove every temporary client row that has just received a
        // database Id. Without this, the Blazor-side Rows collection can
        // retain both the negative temporary Id and the saved database Id.
        foreach (var mapping in savedRowMappings)
        {
            removedRowIds.Add(mapping.TemporaryId);
        }

        foreach (var movedRecord in savedRecords
            .Where(record =>
                record.WorkYear != selectedWorkYear))
        {
            removedRowIds.Add(
                temporaryIdByDatabaseId.GetValueOrDefault(
                    movedRecord.Id,
                    movedRecord.Id));
        }

        var updatedAvailableWorkYears = availableWorkYears
            .Concat(savedRecords.Select(record =>
                record.WorkYear))
            .Append(currentYear)
            .Append(selectedWorkYear)
            .Distinct()
            .OrderByDescending(year => year)
            .ToList();

        var mergedRows = MergeRowsAfterSave(
            currentRows,
            savedRowsInCurrentYear,
            removedRowIds);

        var savedCount =
            request.DirtyRows.Count +
            request.DeletedWorkOrders.Count;

        string statusMessage;

        if (request.MovedToOtherYearsCount > 0)
        {
            var destinationYearsText = string.Join(
                "، ",
                request.DestinationYears
                    .OrderByDescending(year => year));

            statusMessage =
                $"تم حفظ {savedCount} صف بنجاح، وتم توزيع {request.MovedToOtherYearsCount} صف حسب سنة تاريخ الإسناد إلى: {destinationYearsText}.";
        }
        else
        {
            statusMessage =
                $"تم حفظ {savedCount} صف بنجاح.";
        }

        return new PreparedSaveResult
        {
            SavedRowsInCurrentYear = savedRowsInCurrentYear,
            SavedRowMappings = savedRowMappings,
            RemovedRowIds = removedRowIds,
            AvailableWorkYears = updatedAvailableWorkYears,
            Rows = mergedRows,
            StatusMessage = statusMessage
        };
    }

    private static string CreateDuplicateKey(
        string? workOrderNumber,
        string? workTypeCode) =>
        string.Concat(
            workOrderNumber?.Trim() ?? string.Empty,
            "\u001F",
            workTypeCode?.Trim() ?? string.Empty);

    private static TabulatorWorkOrderRow MapSavedRow(
        WorkOrderSavedRecord record,
        string clientKey) =>
        new()
        {
            Id = record.Id,
            ClientKey = clientKey,
            DisplayOrder = record.DisplayOrder,
            WorkOrderNumber = record.WorkOrderNumber,
            WorkTypeCode = record.WorkTypeCode,
            AssignmentDate =
                record.AssignmentDate?.ToString(
                    "dd/MM/yyyy",
                    CultureInfo.InvariantCulture)
                ?? string.Empty,
            Basket = record.Busket,
            Status = record.Status,
            Notes = record.Notes ?? string.Empty,
            RowVersion = Convert.ToBase64String(
                record.RowVersion)
        };

    private static List<TabulatorWorkOrderRow> MergeRowsAfterSave(
        IEnumerable<TabulatorWorkOrderRow> currentRows,
        IEnumerable<TabulatorWorkOrderRow> savedRows,
        IReadOnlySet<int> removedRowIds)
    {
        var mergedRows = currentRows
            .Where(row => !removedRowIds.Contains(row.Id))
            .ToDictionary(row => row.Id);

        foreach (var savedRow in savedRows)
        {
            mergedRows[savedRow.Id] = savedRow;
        }

        return mergedRows.Values
            .OrderBy(row => row.DisplayOrder)
            .ThenBy(row => row.Id)
            .ToList();
    }

    private sealed class SaveFailurePresentation
    {
        public string StatusMessage { get; init; } = string.Empty;
        public List<TabulatorValidationError> ValidationErrors { get; init; } = [];
    }

    private sealed class PreparedSaveResult
    {
        public List<TabulatorWorkOrderRow> SavedRowsInCurrentYear { get; init; } = [];
        public List<TabulatorSavedRowMapping> SavedRowMappings { get; init; } = [];
        public HashSet<int> RemovedRowIds { get; init; } = [];
        public List<int> AvailableWorkYears { get; init; } = [];
        public List<TabulatorWorkOrderRow> Rows { get; init; } = [];
        public string StatusMessage { get; init; } = string.Empty;
    }

    private sealed class TabulatorSavedRowMapping
    {
        public string ClientKey { get; set; } = string.Empty;
        public int TemporaryId { get; set; }
        public int DatabaseId { get; set; }
    }

    private sealed class TabulatorValidationError
    {
        public int RowId { get; set; }
        public string Field { get; set; } = string.Empty;
        public string Code { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
    }
}
