using System.Diagnostics;
using System.Globalization;
using System.Text.Json;
using ERPPrototype.Data;
using ERPPrototype.Data.Entities;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.JSInterop;

namespace ERPPrototype.Components.Pages;

public partial class WorkOrders
{
    private const string TableId = "tabulator-test-table";

    // Bounded per-save stream limit. This avoids raising the global SignalR
    // message limit while still supporting large Excel-style bulk edits.
    private const long MaximumSaveDeltaBytes =
        8L * 1024L * 1024L;

    private bool IsLoading = true;
    private bool IsSaving;
    private bool IsYearLoading;
    private bool GridInitialized;

    // Phase 7B5-D1: one correlated measurement journey for the initial sheet open.
    // These values are diagnostics only and do not affect grid or business state.
    private readonly long PageOpenStartedAt = Stopwatch.GetTimestamp();
    private readonly string PageOpenMeasurementId = Guid.NewGuid().ToString("N");
    private readonly List<TabulatorPerformanceStage> PageOpenPerformanceStages = [];
    private bool PageOpenPerformanceStagesRecorded;
    private int GridInitializationAttempt;

    private int SelectedWorkYear = DateTime.Now.Year;
    private int YearSelectorRenderKey;

    private string CurrentUserId = string.Empty;
    private string BranchName = string.Empty;
    private string DepartmentName = string.Empty;
    private string ErrorMessage = string.Empty;

    private List<int> AvailableWorkYears = [DateTime.Now.Year];
    private List<TabulatorWorkOrderRow> Rows = [];

    protected override async Task OnInitializedAsync()
    {
        var onInitializedStartedAt = Stopwatch.GetTimestamp();
        var outcome = "success";

        try
        {
            var authenticationStartedAt = Stopwatch.GetTimestamp();

            var authenticationState =
                await AuthenticationStateProvider
                    .GetAuthenticationStateAsync();

            AddOpenPerformanceStage(
                "open.blazor.authentication-state",
                authenticationStartedAt);

            var userId =
                UserManager.GetUserId(
                    authenticationState.User);

            if (string.IsNullOrWhiteSpace(userId))
            {
                outcome = "missing-user";
                ErrorMessage =
                    "The current user could not be identified.";

                return;
            }

            CurrentUserId = userId;

            var serviceStartedAt = Stopwatch.GetTimestamp();
            var servicePerformanceStages =
                new List<WorkOrderServicePerformanceStage>();

            var sheet =
                await WorkOrderService.LoadSheetAsync(
                    userId,
                    SelectedWorkYear,
                    performanceStages: servicePerformanceStages);

            foreach (var stage in servicePerformanceStages)
            {
                PageOpenPerformanceStages.Add(
                    new TabulatorPerformanceStage
                    {
                        Name = stage.Name,
                        DurationMs = stage.DurationMs,
                        Metadata = stage.Metadata
                    });
            }

            AddOpenPerformanceStage(
                "open.blazor.load-sheet-service-call",
                serviceStartedAt,
                new
                {
                    SelectedWorkYear,
                    Rows = sheet?.WorkOrders.Count ?? 0,
                    FoundSheet = sheet is not null
                });

            if (sheet is null)
            {
                outcome = "missing-department";
                ErrorMessage =
                    "The current user is not assigned to an active department.";

                return;
            }

            var applySheetStartedAt = Stopwatch.GetTimestamp();
            ApplySheet(sheet);

            AddOpenPerformanceStage(
                "open.blazor.apply-sheet",
                applySheetStartedAt,
                new
                {
                    Rows = Rows.Count,
                    AvailableYears = AvailableWorkYears.Count,
                    SelectedWorkYear
                });
        }
        catch (Exception exception)
        {
            outcome = "exception";

            Logger.LogError(
                exception,
                "An error occurred while loading Tabulator work orders.");

            ErrorMessage =
                "An unexpected error occurred while loading work orders.";
        }
        finally
        {
            IsLoading = false;

            AddOpenPerformanceStage(
                "open.blazor.on-initialized-total",
                onInitializedStartedAt,
                new
                {
                    Outcome = outcome,
                    Rows = Rows.Count,
                    SelectedWorkYear,
                    MeasurementId = PageOpenMeasurementId
                });
        }
    }

    protected override async Task OnAfterRenderAsync(
        bool firstRender)
    {
        if (
            GridInitialized ||
            IsLoading ||
            IsYearLoading ||
            !string.IsNullOrWhiteSpace(ErrorMessage))
        {
            return;
        }

        GridInitialized = true;
        var initializationAttempt = ++GridInitializationAttempt;

        try
        {
            AddOpenPerformanceStage(
                "open.blazor.component-to-grid-init-start",
                PageOpenStartedAt,
                new
                {
                    Rows = Rows.Count,
                    SelectedWorkYear,
                    InitializationAttempt = initializationAttempt,
                    MeasurementId = PageOpenMeasurementId
                });

            var initializationStartedAt = Stopwatch.GetTimestamp();

            await JSRuntime.InvokeVoidAsync(
                "tabulatorTest.initialize",
                TableId,
                Rows,
                WorkOrderBuskets.All,
                new
                {
                    MeasurementId = PageOpenMeasurementId,
                    InitializationAttempt = initializationAttempt,
                    ExpectedRows = Rows.Count,
                    SelectedWorkYear,
                    InitialPageOpen = !PageOpenPerformanceStagesRecorded
                });

            AddOpenPerformanceStage(
                "open.blazor.js-interop-initialize-call",
                initializationStartedAt,
                new
                {
                    Rows = Rows.Count,
                    SelectedWorkYear,
                    InitializationAttempt = initializationAttempt,
                    MeasurementId = PageOpenMeasurementId
                });

            Logger.LogInformation(
                "Transferred and initialized {WorkOrderCount} Tabulator rows. Measurement {MeasurementId}, attempt {InitializationAttempt}.",
                Rows.Count,
                PageOpenMeasurementId,
                initializationAttempt);

            if (!PageOpenPerformanceStagesRecorded)
            {
                PageOpenPerformanceStagesRecorded = true;

                await JSRuntime.InvokeVoidAsync(
                    "tabulatorTest.recordExternalPerformanceStages",
                    TableId,
                    PageOpenPerformanceStages);
            }
        }
        catch (Exception exception)
        {
            GridInitialized = false;

            Logger.LogError(
                exception,
                "An error occurred while initializing Tabulator.");

            ErrorMessage =
                "The work-order sheet could not be initialized.";

            StateHasChanged();
        }
    }

    private async Task SaveChangesAsync()
    {
        if (
            IsSaving ||
            IsYearLoading ||
            string.IsNullOrWhiteSpace(CurrentUserId))
        {
            return;
        }

        var canSave =
            await JSRuntime.InvokeAsync<bool>(
                "tabulatorTest.validateBeforeSave",
                TableId);

        if (!canSave)
        {
            return;
        }

        IsSaving = true;

        var savePerformanceStages =
            new List<TabulatorPerformanceStage>();
        var saveStartedAt = Stopwatch.GetTimestamp();
        var saveOutcome = "started";
        var saveFailureStage = "before-stream";
        var dirtyRowCount = 0;
        var addedRowCount = 0;
        var changedRowCount = 0;
        var deletedRowCount = 0;

        try
        {
            await JSRuntime.InvokeVoidAsync(
                "tabulatorTest.setSaving",
                TableId,
                true);

            var collectClientDeltaStartedAt =
                Stopwatch.GetTimestamp();

            saveFailureStage = "get-stream-reference";
            var streamReferenceStartedAt =
                Stopwatch.GetTimestamp();

            await using var saveDeltaReference =
                await JSRuntime.InvokeAsync<IJSStreamReference>(
                    "tabulatorTest.getSaveDeltaStream",
                    TableId);

            AddSavePerformanceStage(
                savePerformanceStages,
                "save.stream-reference",
                streamReferenceStartedAt);

            saveFailureStage = "open-stream";
            var streamOpenStartedAt =
                Stopwatch.GetTimestamp();

            await using var saveDeltaStream =
                await saveDeltaReference.OpenReadStreamAsync(
                    MaximumSaveDeltaBytes);

            AddSavePerformanceStage(
                savePerformanceStages,
                "save.stream-open",
                streamOpenStartedAt);

            saveFailureStage = "deserialize-stream";
            var streamDeserializeStartedAt =
                Stopwatch.GetTimestamp();

            var saveDelta =
                await JsonSerializer.DeserializeAsync<TabulatorSaveDelta>(
                    saveDeltaStream,
                    new JsonSerializerOptions(
                        JsonSerializerDefaults.Web)) ??
                new TabulatorSaveDelta();

            AddSavePerformanceStage(
                savePerformanceStages,
                "save.stream-deserialize",
                streamDeserializeStartedAt);

            saveFailureStage = "prepare-save";

            var dirtyRows = saveDelta.DirtyRows ?? [];
            var deletedRows = saveDelta.DeletedRows ?? [];

            dirtyRowCount = dirtyRows.Count;
            deletedRowCount = deletedRows.Count(row => row.Id > 0);

            AddSavePerformanceStage(
                savePerformanceStages,
                "save.collect-client-delta",
                collectClientDeltaStartedAt,
                new
                {
                    DirtyRows = dirtyRowCount,
                    DeletedRows = deletedRowCount
                });

            if (dirtyRows.Count == 0 && deletedRows.Count == 0)
            {
                saveOutcome = "no-changes";

                await SetGridStatusAsync(
                    "لا توجد تغييرات للحفظ.");

                return;
            }

            var prepareRequestStartedAt =
                Stopwatch.GetTimestamp();

            var blankAddedRow = dirtyRows
                .FirstOrDefault(row =>
                    row.Id <= 0 &&
                    IsCompletelyBlank(row));

            if (blankAddedRow is not null)
            {
                saveOutcome = "client-validation-failed";

                await SetGridStatusAsync(
                    "تعذر الحفظ: أكمل بيانات الصفوف الجديدة أو احذف الصفوف الفارغة أولًا.");

                return;
            }

            var addedWorkOrders =
                new List<WorkOrder>();

            var changedWorkOrders =
                new List<WorkOrderChangeSet>();

            var addedRowMappings =
                new List<PendingAddedRowMapping>();
            var movedToOtherYearsCount = 0;
            var destinationYears = new HashSet<int>();

            foreach (var row in dirtyRows)
            {
                var changedFields =
                    WorkOrderFieldRegistry.NormalizeChangedFields(
                        row.ChangedFields,
                        defaultToAll: true);

                if (!TryParseAssignmentDate(
                        row.AssignmentDate,
                        out var assignmentDate))
                {
                    saveOutcome = "client-validation-failed";

                    await SetGridStatusAsync(
                        $"تعذر الحفظ: تاريخ الإسناد غير صحيح في أمر العمل {row.WorkOrderNumber}.");

                    return;
                }

                var destinationYear =
                    assignmentDate?.Year ?? SelectedWorkYear;

                if (
                    destinationYear != SelectedWorkYear &&
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
                    Busket = row.Basket ?? string.Empty,
                    Status = row.Status ?? string.Empty,
                    Notes = row.Notes
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
                    WorkYear = SelectedWorkYear
                })
                .ToList();

            addedRowCount = addedWorkOrders.Count;
            changedRowCount = changedWorkOrders.Count;
            deletedRowCount = deletedWorkOrders.Count;

            AddSavePerformanceStage(
                savePerformanceStages,
                "save.prepare-request",
                prepareRequestStartedAt,
                new
                {
                    AddedRows = addedRowCount,
                    ChangedRows = changedRowCount,
                    DeletedRows = deletedRowCount,
                    MovedToOtherYears = movedToOtherYearsCount
                });

            await SetGridStatusAsync(
                "جارٍ حفظ التغييرات...");

            var serverServiceStartedAt =
                Stopwatch.GetTimestamp();

            var serverPerformanceStages =
                new List<WorkOrderServicePerformanceStage>();

            saveFailureStage = "server-service";

            var result =
                await WorkOrderService.SaveChangesAsync(
                    CurrentUserId,
                    SelectedWorkYear,
                    addedWorkOrders,
                    changedWorkOrders,
                    deletedWorkOrders,
                    performanceStages: serverPerformanceStages);

            foreach (var stage in serverPerformanceStages)
            {
                savePerformanceStages.Add(
                    new TabulatorPerformanceStage
                    {
                        Name = stage.Name,
                        DurationMs = stage.DurationMs,
                        Metadata = stage.Metadata
                    });
            }

            AddSavePerformanceStage(
                savePerformanceStages,
                "save.server-service",
                serverServiceStartedAt,
                new
                {
                    AddedRows = addedRowCount,
                    ChangedRows = changedRowCount,
                    DeletedRows = deletedRowCount,
                    result.Succeeded,
                    FailureType = result.FailureType.ToString()
                });

            if (!result.Succeeded)
            {
                saveOutcome =
                    $"server-{result.FailureType}";

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

                    static string CreateDuplicateKey(
                        string? workOrderNumber,
                        string? workTypeCode) =>
                        string.Concat(
                            workOrderNumber?.Trim() ?? string.Empty,
                            "\u001F",
                            workTypeCode?.Trim() ?? string.Empty);

                    var conflictsByKey = duplicateConflicts
                        .GroupBy(conflict =>
                            CreateDuplicateKey(
                                conflict.WorkOrderNumber,
                                conflict.WorkTypeCode))
                        .ToDictionary(
                            group => group.Key,
                            group => group.Last(),
                            StringComparer.Ordinal);

                    var validationErrors = new List<TabulatorValidationError>();

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

                    if (validationErrors.Count > 0)
                    {
                        await JSRuntime.InvokeVoidAsync(
                            "tabulatorTest.applyExternalValidationErrors",
                            TableId,
                            validationErrors,
                            true);
                    }

                    var duplicateIdentityCount = conflictsByKey.Count;

                    await SetGridStatusAsync(
                        duplicateIdentityCount == 1
                            ? "فشل الحفظ: يوجد أمر عمل مكرر. تم تحديد الصف المخالف."
                            : $"فشل الحفظ: يوجد {duplicateIdentityCount} أوامر عمل مكررة. تم تحديد جميع الصفوف المخالفة بالترتيب.");

                    return;
                }

                if (
                    result.FailureType ==
                        WorkOrderSaveFailureType.Concurrency)
                {
                    var conflictMessage =
                        "تم تعديل أمر العمل أو نقله أو حذفه من جلسة أخرى بعد فتح الشيت. " +
                        "لم يتم حفظ تغييراتك. حدّث الصفحة ثم أعد التعديل.";

                    if (result.WorkOrderId is int conflictId)
                    {
                        var conflictRow = dirtyRows
                            .FirstOrDefault(row =>
                                row.Id == conflictId);

                        if (conflictRow is not null)
                        {
                            await JSRuntime.InvokeVoidAsync(
                                "tabulatorTest.applyExternalValidationErrors",
                                TableId,
                                new[]
                                {
                                    new TabulatorValidationError
                                    {
                                        RowId = conflictRow.Id,
                                        Field = "workOrderNumber",
                                        Code = result.ErrorCode,
                                        Message = conflictMessage
                                    }
                                },
                                true);
                        }
                    }

                    await SetGridStatusAsync(
                        $"فشل الحفظ: {conflictMessage}");

                    return;
                }

                await SetGridStatusAsync(
                    $"فشل الحفظ: {result.ErrorMessage}");

                return;
            }

            var prepareClientDeltaStartedAt =
                Stopwatch.GetTimestamp();

            var savedRecords =
                result.SavedRecords ??
                Array.Empty<WorkOrderSavedRecord>();

            var savedRowMappings = addedRowMappings
                .Select(mapping =>
                    new TabulatorSavedRowMapping
                    {
                        ClientKey = mapping.ClientKey,
                        TemporaryId = mapping.TemporaryId,
                        DatabaseId = mapping.WorkOrder.Id
                    })
                .ToList();

            var clientKeyByDatabaseId = dirtyRows
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
                    record.WorkYear == SelectedWorkYear)
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
                    record.WorkYear != SelectedWorkYear))
            {
                removedRowIds.Add(
                    temporaryIdByDatabaseId.GetValueOrDefault(
                        movedRecord.Id,
                        movedRecord.Id));
            }

            AvailableWorkYears = AvailableWorkYears
                .Concat(savedRecords.Select(record =>
                    record.WorkYear))
                .Append(DateTime.Now.Year)
                .Append(SelectedWorkYear)
                .Distinct()
                .OrderByDescending(year => year)
                .ToList();

            Rows = MergeRowsAfterSave(
                Rows,
                savedRowsInCurrentYear,
                removedRowIds);

            AddSavePerformanceStage(
                savePerformanceStages,
                "save.prepare-client-delta",
                prepareClientDeltaStartedAt,
                new
                {
                    SavedRows = savedRowsInCurrentYear.Count,
                    SavedMappings = savedRowMappings.Count,
                    RemovedRows = removedRowIds.Count
                });

            var applyClientDeltaStartedAt =
                Stopwatch.GetTimestamp();

            await JSRuntime.InvokeVoidAsync(
                "tabulatorTest.applySavedDelta",
                TableId,
                savedRowsInCurrentYear,
                savedRowMappings,
                removedRowIds.ToList());

            AddSavePerformanceStage(
                savePerformanceStages,
                "save.client-apply-delta",
                applyClientDeltaStartedAt,
                new
                {
                    SavedRows = savedRowsInCurrentYear.Count,
                    SavedMappings = savedRowMappings.Count,
                    RemovedRows = removedRowIds.Count
                });

            saveOutcome = "succeeded";

            var savedCount =
                dirtyRows.Count + deletedWorkOrders.Count;

            if (movedToOtherYearsCount > 0)
            {
                var destinationYearsText = string.Join(
                    "، ",
                    destinationYears
                        .OrderByDescending(year => year));

                await SetGridStatusAsync(
                    $"تم حفظ {savedCount} صف بنجاح، وتم توزيع {movedToOtherYearsCount} صف حسب سنة تاريخ الإسناد إلى: {destinationYearsText}.");
            }
            else
            {
                await SetGridStatusAsync(
                    $"تم حفظ {savedCount} صف بنجاح.");
            }
        }
        catch (JSDisconnectedException)
        {
            saveOutcome = "browser-disconnected";

            Logger.LogWarning(
                "The browser disconnected while saving Tabulator work orders.");
        }
        catch (Exception exception)
        {
            saveOutcome = "unexpected-error";

            var baseException = exception.GetBaseException();

            savePerformanceStages.Add(
                new TabulatorPerformanceStage
                {
                    Name = "save.exception",
                    DurationMs = 0,
                    Metadata = new
                    {
                        Stage = saveFailureStage,
                        ExceptionType =
                            exception.GetType().FullName ??
                            exception.GetType().Name,
                        ExceptionMessage = exception.Message,
                        BaseExceptionType =
                            baseException.GetType().FullName ??
                            baseException.GetType().Name,
                        BaseExceptionMessage = baseException.Message,
                        exception.HResult
                    }
                });

            Logger.LogError(
                exception,
                "An unexpected error occurred while saving Tabulator work orders at stage {SaveFailureStage}.",
                saveFailureStage);

            try
            {
                await SetGridStatusAsync(
                    "حدث خطأ غير متوقع أثناء الحفظ.");
            }
            catch (JSDisconnectedException)
            {
            }
        }
        finally
        {
            AddSavePerformanceStage(
                savePerformanceStages,
                "save.active-total",
                saveStartedAt,
                new
                {
                    Outcome = saveOutcome,
                    DirtyRows = dirtyRowCount,
                    AddedRows = addedRowCount,
                    ChangedRows = changedRowCount,
                    DeletedRows = deletedRowCount
                });

            IsSaving = false;

            try
            {
                await JSRuntime.InvokeVoidAsync(
                    "tabulatorTest.setSaving",
                    TableId,
                    false);
            }
            catch (JSDisconnectedException)
            {
            }

            try
            {
                await JSRuntime.InvokeVoidAsync(
                    "tabulatorTest.recordExternalPerformanceStages",
                    TableId,
                    savePerformanceStages);
            }
            catch (JSDisconnectedException)
            {
            }
            catch (JSException exception)
            {
                Logger.LogDebug(
                    exception,
                    "Save performance stages could not be recorded.");
            }
        }
    }

    private async Task ChangeWorkYearAsync(ChangeEventArgs args)
    {
        if (
            IsSaving ||
            IsYearLoading ||
            string.IsNullOrWhiteSpace(CurrentUserId) ||
            !int.TryParse(
                args.Value?.ToString(),
                NumberStyles.None,
                CultureInfo.InvariantCulture,
                out var requestedYear) ||
            requestedYear == SelectedWorkYear)
        {
            return;
        }

        if (GridInitialized)
        {
            var hasUnsavedChanges =
                await JSRuntime.InvokeAsync<bool>(
                    "tabulatorTest.hasUnsavedChanges",
                    TableId);

            if (hasUnsavedChanges)
            {
                YearSelectorRenderKey++;

                await SetGridStatusAsync(
                    "احفظ التغييرات الحالية أو استخدم Undo قبل الانتقال إلى سنة أخرى.");

                StateHasChanged();
                return;
            }
        }

        await LoadWorkYearAsync(requestedYear);
    }

    private async Task LoadWorkYearAsync(int workYear)
    {
        IsYearLoading = true;
        StateHasChanged();

        try
        {
            var sheet =
                await WorkOrderService.LoadSheetAsync(
                    CurrentUserId,
                    workYear);

            if (sheet is null)
            {
                YearSelectorRenderKey++;

                await SetGridStatusAsync(
                    "تعذر تحميل سنة العمل المطلوبة.");

                return;
            }

            if (GridInitialized)
            {
                await JSRuntime.InvokeVoidAsync(
                    "tabulatorTest.destroy",
                    TableId);

                GridInitialized = false;
            }

            ApplySheet(sheet);
            YearSelectorRenderKey++;
        }
        catch (JSDisconnectedException)
        {
            Logger.LogWarning(
                "The browser disconnected while changing the work-order year.");
        }
        catch (Exception exception)
        {
            Logger.LogError(
                exception,
                "An error occurred while loading work-order year {WorkYear}.",
                workYear);

            YearSelectorRenderKey++;

            await SetGridStatusAsync(
                "حدث خطأ أثناء تحميل سنة العمل المطلوبة.");
        }
        finally
        {
            IsYearLoading = false;
            StateHasChanged();
        }
    }

    private void ApplySheet(WorkOrderSheetData sheet)
    {
        BranchName = sheet.BranchName;
        DepartmentName = sheet.DepartmentName;
        SelectedWorkYear = sheet.WorkYear;
        AvailableWorkYears = sheet.AvailableYears;
        Rows = MapRows(sheet.WorkOrders);
    }

    private async Task SetGridStatusAsync(string message)
    {
        await JSRuntime.InvokeVoidAsync(
            "tabulatorTest.setStatus",
            TableId,
            message);
    }

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

    private static List<TabulatorWorkOrderRow> MapRows(
        IEnumerable<WorkOrderSheetRow> workOrders)
    {
        return workOrders
            .Select(workOrder =>
                new TabulatorWorkOrderRow
                {
                    Id = workOrder.Id,
                    DisplayOrder = workOrder.DisplayOrder,
                    WorkOrderNumber = workOrder.WorkOrderNumber,
                    WorkTypeCode = workOrder.WorkTypeCode,
                    AssignmentDate =
                        workOrder.AssignmentDate?.ToString(
                            "dd/MM/yyyy",
                            CultureInfo.InvariantCulture)
                        ?? string.Empty,
                    Basket = workOrder.Busket,
                    Status = workOrder.Status,
                    Notes = workOrder.Notes ?? string.Empty,
                    RowVersion = Convert.ToBase64String(
                        workOrder.RowVersion)
                })
            .ToList();
    }

    private static bool IsCompletelyBlank(
        TabulatorWorkOrderRow row)
    {
        return
            string.IsNullOrWhiteSpace(row.WorkOrderNumber) &&
            string.IsNullOrWhiteSpace(row.WorkTypeCode) &&
            string.IsNullOrWhiteSpace(row.AssignmentDate) &&
            string.IsNullOrWhiteSpace(row.Basket) &&
            string.IsNullOrWhiteSpace(row.Status) &&
            string.IsNullOrWhiteSpace(row.Notes);
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

    private void AddOpenPerformanceStage(
        string name,
        long startedAt,
        object? metadata = null)
    {
        PageOpenPerformanceStages.Add(
            new TabulatorPerformanceStage
            {
                Name = name,
                DurationMs =
                    Stopwatch.GetElapsedTime(startedAt)
                        .TotalMilliseconds,
                Metadata = metadata
            });
    }

    private static void AddSavePerformanceStage(
        ICollection<TabulatorPerformanceStage> stages,
        string name,
        long startedAt,
        object? metadata = null)
    {
        stages.Add(
            new TabulatorPerformanceStage
            {
                Name = name,
                DurationMs =
                    Stopwatch.GetElapsedTime(startedAt)
                        .TotalMilliseconds,
                Metadata = metadata
            });
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

    public async ValueTask DisposeAsync()
    {
        if (!GridInitialized)
        {
            return;
        }

        try
        {
            await JSRuntime.InvokeVoidAsync(
                "tabulatorTest.destroy",
                TableId);
        }
        catch (JSDisconnectedException)
        {
        }
        catch (InvalidOperationException)
        {
        }

        GridInitialized = false;
    }

    private sealed class TabulatorPerformanceStage
    {
        public string Name { get; set; } = string.Empty;
        public double DurationMs { get; set; }
        public object? Metadata { get; set; }
    }

    private sealed class TabulatorSaveDelta
    {
        public TabulatorSaveDelta()
        {
        }

        public List<TabulatorWorkOrderRow>? DirtyRows { get; set; }
        public List<TabulatorDeletedRow>? DeletedRows { get; set; }
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

    private sealed class TabulatorWorkOrderRow
    {
        public TabulatorWorkOrderRow()
        {
        }

        public int Id { get; set; }
        public string ClientKey { get; set; } = string.Empty;
        public long DisplayOrder { get; set; }
        public string WorkOrderNumber { get; set; } = string.Empty;
        public string WorkTypeCode { get; set; } = string.Empty;
        public string AssignmentDate { get; set; } = string.Empty;
        public string Basket { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public string Notes { get; set; } = string.Empty;
        public string RowVersion { get; set; } = string.Empty;
        public List<string>? ChangedFields { get; set; }
    }
}
