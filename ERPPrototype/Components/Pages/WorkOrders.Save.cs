using System.Diagnostics;
using System.Text.Json;
using ERPPrototype.Data;
using Microsoft.JSInterop;

namespace ERPPrototype.Components.Pages;

public partial class WorkOrders
{
    // Bounded per-save stream limit. This avoids raising the global SignalR
    // message limit while still supporting large Excel-style bulk edits.
    private const long MaximumSaveDeltaBytes =
        8L * 1024L * 1024L;

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

            var prepareRequestStartedAt =
                Stopwatch.GetTimestamp();

            var preparation = PrepareSaveRequest(
                saveDelta,
                SelectedWorkYear);

            if (!preparation.HasChanges)
            {
                saveOutcome = "no-changes";

                await SetGridStatusAsync(
                    "لا توجد تغييرات للحفظ.");

                return;
            }

            if (preparation.Request is null)
            {
                saveOutcome = "client-validation-failed";

                await SetGridStatusAsync(
                    preparation.ValidationMessage!);

                return;
            }

            var request = preparation.Request;

            addedRowCount = request.AddedWorkOrders.Count;
            changedRowCount = request.ChangedWorkOrders.Count;
            deletedRowCount = request.DeletedWorkOrders.Count;

            AddSavePerformanceStage(
                savePerformanceStages,
                "save.prepare-request",
                prepareRequestStartedAt,
                new
                {
                    AddedRows = addedRowCount,
                    ChangedRows = changedRowCount,
                    DeletedRows = deletedRowCount,
                    MovedToOtherYears =
                        request.MovedToOtherYearsCount
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
                    request.AddedWorkOrders,
                    request.ChangedWorkOrders,
                    request.DeletedWorkOrders,
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

                var failure = InterpretSaveFailure(
                    result,
                    request.DirtyRows);

                if (failure.ValidationErrors.Count > 0)
                {
                    await JSRuntime.InvokeVoidAsync(
                        "tabulatorTest.applyExternalValidationErrors",
                        TableId,
                        failure.ValidationErrors,
                        true);
                }

                await SetGridStatusAsync(
                    failure.StatusMessage);

                return;
            }

            var prepareClientDeltaStartedAt =
                Stopwatch.GetTimestamp();

            var preparedResult =
                PrepareSuccessfulSaveResult(
                    result,
                    request,
                    SelectedWorkYear,
                    AvailableWorkYears,
                    Rows,
                    DateTime.Now.Year);

            AvailableWorkYears =
                preparedResult.AvailableWorkYears;

            Rows = preparedResult.Rows;

            AddSavePerformanceStage(
                savePerformanceStages,
                "save.prepare-client-delta",
                prepareClientDeltaStartedAt,
                new
                {
                    SavedRows =
                        preparedResult.SavedRowsInCurrentYear.Count,
                    SavedMappings =
                        preparedResult.SavedRowMappings.Count,
                    RemovedRows =
                        preparedResult.RemovedRowIds.Count
                });

            var applyClientDeltaStartedAt =
                Stopwatch.GetTimestamp();

            await JSRuntime.InvokeVoidAsync(
                "tabulatorTest.applySavedDelta",
                TableId,
                preparedResult.SavedRowsInCurrentYear,
                preparedResult.SavedRowMappings,
                preparedResult.RemovedRowIds.ToList());

            AddSavePerformanceStage(
                savePerformanceStages,
                "save.client-apply-delta",
                applyClientDeltaStartedAt,
                new
                {
                    SavedRows =
                        preparedResult.SavedRowsInCurrentYear.Count,
                    SavedMappings =
                        preparedResult.SavedRowMappings.Count,
                    RemovedRows =
                        preparedResult.RemovedRowIds.Count
                });

            saveOutcome = "succeeded";

            await SetGridStatusAsync(
                preparedResult.StatusMessage);
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
}
