using System.Diagnostics;
using System.Globalization;
using System.Text.Json;
using ERPPrototype.Data;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.JSInterop;

namespace ERPPrototype.Components.Pages;

public partial class WorkOrdersRevoGridNativeGate5A
{
    private const string GridElementId = "revogrid-native-gate5a-grid";
    private const string ChangeStatusElementId = "revogrid-gate5b1-change-status";
    private const string UndoCountElementId = "revogrid-gate5b1-undo-count";
    private const string RedoCountElementId = "revogrid-gate5b1-redo-count";
    private const string UndoButtonId = "revogrid-gate5b1-undo";
    private const string RedoButtonId = "revogrid-gate5b1-redo";
    private const string FinancialErrorElementId = "revogrid-gate5b-financial-errors";
    private const string RowCountElementId = "revogrid-gate5b-row-count";
    private const string SaveButtonId = "revogrid-gate5b11-save";
    private const string SaveStatusElementId = "revogrid-gate5b11-save-status";
    private const string VisibleAggregateElementId = "revogrid-gate5c1-visible-aggregates";

    [Parameter]
    public bool EnableChangeEngine { get; set; }

    [Parameter]
    public bool EnablePaste { get; set; }

    [Parameter]
    public bool EnableRangeClear { get; set; }

    [Parameter]
    public bool EnableExcelFilter { get; set; }

    [Parameter]
    public bool EnableHeaderActions { get; set; }

    [Parameter]
    public bool EnableRowStructure { get; set; }

    [Parameter]
    public bool EnableUnifiedValidation { get; set; }

    [Parameter]
    public bool EnablePersistenceIdentity { get; set; }

    [Parameter]
    public bool EnableSelectionContext { get; set; }

    [Parameter]
    public bool EnableStructureWorkspace { get; set; }

    [Parameter]
    public bool EnableHeaderMultiSelection { get; set; }

    [Parameter]
    public bool EnableClipboardRangeFill { get; set; }

    [Parameter]
    public bool EnableSaveHandshake { get; set; }

    [Parameter]
    public bool EnableRealDbSave { get; set; }

    [Parameter]
    public bool EnableVisibleAggregates { get; set; }

    // Saudi Arabia is UTC+3 all year. The page always opens on the
    // current Saudi business year and does not persist the last selected year.
    private static int CurrentBusinessYear =>
        DateTimeOffset.UtcNow
            .ToOffset(TimeSpan.FromHours(3))
            .Year;

    private bool IsLoading = true;
    private bool IsYearLoading;
    private bool GridInitialized;
    private bool GridInitializationInProgress;
    private bool IsSaveHandshakeInFlight;
    private bool SimulateSaveHandshakeFailure;

    private string CurrentUserId = string.Empty;
    private string BranchName = string.Empty;
    private string DepartmentName = string.Empty;
    private string ErrorMessage = string.Empty;
    private string OperationMessage = string.Empty;

    private int SelectedWorkYear = CurrentBusinessYear;
    private double ServerLoadMilliseconds;
    private int DisplayedRowCount;

    private List<int> AvailableWorkYears = [CurrentBusinessYear];
    private List<NativeGate5ARow> Rows = [];
    private List<CustomColumnDefinitionData> CustomColumns = [];

    private IJSObjectReference? GridModule;
    private NativeGate5ADiagnostics? Diagnostics;

    protected override async Task OnInitializedAsync()
    {
        try
        {
            // Every component open starts from the current business year.
            // No browser/local/server persistence of a previously selected year.
            SelectedWorkYear = CurrentBusinessYear;
            AvailableWorkYears = [SelectedWorkYear];

            var authenticationState =
                await AuthenticationStateProvider.GetAuthenticationStateAsync();

            var userId = UserManager.GetUserId(authenticationState.User);

            if (string.IsNullOrWhiteSpace(userId))
            {
                ErrorMessage = "تعذر تحديد المستخدم الحالي.";
                return;
            }

            CurrentUserId = userId;

            var snapshot =
                await LoadSheetSnapshotAsync(SelectedWorkYear);

            ApplySnapshot(snapshot);
        }
        catch (Exception exception)
        {
            Logger.LogError(
                exception,
                "Native RevoGrid Gate 5A failed while loading real Work Orders data.");

            ErrorMessage = "حدث خطأ أثناء تحميل بيانات Work Orders.";
        }
        finally
        {
            IsLoading = false;
        }
    }

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (
            IsLoading ||
            IsYearLoading ||
            GridInitializationInProgress ||
            !string.IsNullOrWhiteSpace(ErrorMessage))
        {
            return;
        }

        if (!GridInitialized)
        {
            await InitializeGridAsync();
            return;
        }

        if (EnableChangeEngine && GridModule is not null)
        {
            try
            {
                await GridModule.InvokeVoidAsync(
                    "refreshChangeStateUi",
                    GridElementId);
            }
            catch (JSDisconnectedException)
            {
            }
        }
    }

    private async Task<NativeGate5ASheetSnapshot> LoadSheetSnapshotAsync(
        int workYear)
    {
        var startedAt = Stopwatch.GetTimestamp();

        var sheet =
            await WorkOrderService.LoadSheetAsync(
                CurrentUserId,
                workYear);

        var elapsedMilliseconds =
            Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds;

        if (sheet is null)
        {
            throw new InvalidOperationException(
                "The current employee is not assigned to an active department.");
        }

        // Hard guard: the server result must identify itself as the exact
        // dataset that was requested. A mismatch is not allowed to reach the UI.
        if (sheet.WorkYear != workYear)
        {
            throw new InvalidOperationException(
                $"Requested Work Year {workYear}, but the server returned {sheet.WorkYear}.");
        }

        var customColumns = sheet.CustomColumns
            .OrderBy(column => column.LayoutOrder)
            .ThenBy(column => column.Id)
            .ToList();

        var rows = MapRows(
            sheet.WorkOrders,
            customColumns,
            EnableChangeEngine);

        var availableYears = sheet.AvailableYears
            .Append(CurrentBusinessYear)
            .Append(sheet.WorkYear)
            .Distinct()
            .OrderByDescending(year => year)
            .ToList();

        return new NativeGate5ASheetSnapshot
        {
            BranchName = sheet.BranchName,
            DepartmentName = sheet.DepartmentName,
            WorkYear = sheet.WorkYear,
            AvailableWorkYears = availableYears,
            Rows = rows,
            CustomColumns = customColumns,
            ServerLoadMilliseconds = elapsedMilliseconds
        };
    }

    private void ApplySnapshot(NativeGate5ASheetSnapshot snapshot)
    {
        BranchName = snapshot.BranchName;
        DepartmentName = snapshot.DepartmentName;
        SelectedWorkYear = snapshot.WorkYear;
        AvailableWorkYears = snapshot.AvailableWorkYears;
        Rows = snapshot.Rows;
        DisplayedRowCount = snapshot.Rows.Count;
        CustomColumns = snapshot.CustomColumns;
        ServerLoadMilliseconds = snapshot.ServerLoadMilliseconds;
    }

    private async Task InitializeGridAsync()
    {
        if (GridInitializationInProgress)
        {
            return;
        }

        GridInitializationInProgress = true;

        try
        {
            var gridModulePath = EnableChangeEngine
                ? EnableSaveHandshake
                    ? "./js/revoGridGate5B1.js?v=20260912-revo-rename-6"
                    : EnableHeaderMultiSelection
                    ? "./js/revoGridGate5B1.js?v=20260830-selection-core-r2"
                    : EnableStructureWorkspace
                    ? "./js/revoGridGate5B1.js?v=20260828-structure-workspace-5"
                    : EnableSelectionContext
                    ? "./js/revoGridGate5B1.js?v=20260827-selection-context-1"
                    : EnablePersistenceIdentity
                        ? "./js/revoGridGate5B1.js?v=20260826-persistence-identity-1"
                        : "./js/revoGridGate5B1.js?v=20260826-unified-validation-1"
                : "./js/revoGridNativeGate5A.js?v=20260821-gate5b5-filter-refresh-1";

            GridModule ??=
                await JSRuntime.InvokeAsync<IJSObjectReference>(
                    "import",
                    gridModulePath);

            await GridModule.InvokeVoidAsync(
                "initialize",
                GridElementId,
                Rows,
                CustomColumns,
                new
                {
                    Version = "4.25.2",
                    WorkYear = SelectedWorkYear,
                    Rtl = true,
                    EnablePaste,
                    EnableRangeClear,
                    EnableExcelFilter,
                    EnableHeaderActions,
                    EnableRowStructure,
                    EnableUnifiedValidation,
                    EnablePersistenceIdentity,
                    EnableSelectionContext,
                    EnableStructureWorkspace,
                    EnableHeaderMultiSelection,
                    EnableClipboardRangeFill,
                    EnableSaveHandshake,
                    EnableVisibleAggregates,
                    BasketValues = WorkOrderBuskets.All,
                    RowCountElementId,
                    ChangeStatusElementId,
                    UndoCountElementId,
                    RedoCountElementId,
                    UndoButtonId,
                    RedoButtonId,
                    FinancialErrorElementId,
                    SaveButtonId,
                    SaveStatusElementId,
                    VisibleAggregateElementId
                });

            GridInitialized = true;

            Diagnostics =
                await GridModule.InvokeAsync<NativeGate5ADiagnostics>(
                    "getDiagnostics",
                    GridElementId);
        }
        catch (JSDisconnectedException)
        {
        }
        catch (Exception exception)
        {
            Logger.LogError(
                exception,
                "Native RevoGrid Gate 5A failed to initialize for year {WorkYear}.",
                SelectedWorkYear);

            ErrorMessage =
                "تم تحميل البيانات من السيرفر، لكن تعذر تشغيل RevoGrid.";
        }
        finally
        {
            GridInitializationInProgress = false;
            StateHasChanged();
        }
    }

    private async Task HandleSaveHandshakeAsync()
    {
        if (EnableRealDbSave)
        {
            await HandleRealDbSaveAsync();
            return;
        }

        if (
            !EnableSaveHandshake ||
            IsSaveHandshakeInFlight ||
            !GridInitialized ||
            GridModule is null)
        {
            return;
        }

        NativeGate5B11BeginSaveDecision? decision = null;
        IsSaveHandshakeInFlight = true;
        OperationMessage = string.Empty;
        StateHasChanged();

        try
        {
            decision =
                await GridModule.InvokeAsync<NativeGate5B11BeginSaveDecision>(
                    "beginSaveHandshake",
                    GridElementId);

            if (!decision.Allowed || string.IsNullOrWhiteSpace(decision.SaveId))
            {
                OperationMessage = decision.Reason switch
                {
                    "clean" => "No row changes to save.",
                    "validation" => "Save blocked by validation.",
                    "custom-columns-pending" => "Row Save is blocked while Custom Column changes are pending.",
                    "save-active" => "A Save handshake is already running.",
                    _ => "Save is temporarily unavailable while the sheet is busy."
                };
                return;
            }

            OperationMessage =
                $"Saving snapshot r{decision.Revision}: " +
                $"{decision.DirtyCellCount} cell changes, " +
                $"{decision.DirtyRowCount} row changes. No database write.";
            StateHasChanged();

            // Gate 5B-11 intentionally leaves the grid editable while the
            // accepted snapshot is in flight. This delay is a stand-in for the
            // real server call that Gate R4 will connect later.
            await Task.Delay(2_500);

            if (SimulateSaveHandshakeFailure)
            {
                await GridModule.InvokeVoidAsync(
                    "rejectSaveHandshake",
                    GridElementId,
                    decision.SaveId);
                OperationMessage =
                    "Snapshot rejected. Pending work remains Dirty. No database write.";
                return;
            }

            var result =
                await GridModule.InvokeAsync<NativeGate5B11AcceptSaveResult>(
                    "acceptSaveHandshake",
                    GridElementId,
                    decision.SaveId);

            OperationMessage = result.Dirty
                ? $"Snapshot accepted; {result.DirtyCount} newer changes remain Dirty. No database write."
                : "Snapshot accepted; row Change Engine is Clean. No database write.";
        }
        catch (JSDisconnectedException)
        {
        }
        catch (Exception exception)
        {
            if (!string.IsNullOrWhiteSpace(decision?.SaveId) && GridModule is not null)
            {
                try
                {
                    await GridModule.InvokeVoidAsync(
                        "rejectSaveHandshake",
                        GridElementId,
                        decision.SaveId);
                }
                catch
                {
                }
            }

            Logger.LogError(exception, "Gate 5B-11 Save handshake failed.");
            OperationMessage = "Save handshake failed; pending work remains Dirty.";
        }
        finally
        {
            IsSaveHandshakeInFlight = false;
            StateHasChanged();
        }
    }

    private async Task HandleYearChangedAsync(ChangeEventArgs eventArgs)
    {
        if (
            IsLoading ||
            IsYearLoading ||
            string.IsNullOrWhiteSpace(CurrentUserId) ||
            !int.TryParse(
                Convert.ToString(
                    eventArgs.Value,
                    CultureInfo.InvariantCulture),
                NumberStyles.Integer,
                CultureInfo.InvariantCulture,
                out var requestedYear) ||
            requestedYear == SelectedWorkYear)
        {
            return;
        }

        var previousYear = SelectedWorkYear;
        var datasetSwitchStarted = false;

        if (EnableChangeEngine && GridInitialized && GridModule is not null)
        {
            var decision =
                await GridModule.InvokeAsync<NativeGate5B1DatasetSwitchDecision>(
                    "beginDatasetSwitch",
                    GridElementId);

            if (!decision.Allowed)
            {
                OperationMessage = decision.Reason == "dirty"
                    ? "احفظ أو ارجع التعديلات أولًا قبل تغيير السنة."
                    : "انتظر اكتمال التعديل الحالي ثم غيّر السنة.";
                StateHasChanged();
                return;
            }

            datasetSwitchStarted = true;
        }

        // This is the exact ownership model proven in the isolated lab:
        // C# stores the year selected by the employee and every option renders
        // its explicit `selected` state from this single value.
        SelectedWorkYear = requestedYear;
        IsYearLoading = true;
        OperationMessage = string.Empty;
        StateHasChanged();

        try
        {
            // One server load only.
            var snapshot =
                await LoadSheetSnapshotAsync(requestedYear);

            // A year change is a dataset change, not a new grid instance.
            if (GridInitialized && GridModule is not null)
            {
                await GridModule.InvokeVoidAsync(
                    "replaceDataset",
                    GridElementId,
                    snapshot.Rows,
                    snapshot.CustomColumns,
                    snapshot.WorkYear);
            }

            ApplySnapshot(snapshot);

            if (GridInitialized && GridModule is not null)
            {
                Diagnostics =
                    await GridModule.InvokeAsync<NativeGate5ADiagnostics>(
                        "getDiagnostics",
                        GridElementId);
            }
        }
        catch (JSDisconnectedException)
        {
            SelectedWorkYear = previousYear;

            if (datasetSwitchStarted)
            {
                await CancelDatasetSwitchAsync();
            }
        }
        catch (Exception exception)
        {
            SelectedWorkYear = previousYear;

            if (datasetSwitchStarted)
            {
                await CancelDatasetSwitchAsync();
            }

            Logger.LogError(
                exception,
                "Native RevoGrid Gate 5A failed while switching from year {PreviousWorkYear} to {RequestedWorkYear}.",
                previousYear,
                requestedYear);

            OperationMessage =
                $"تعذر تحميل سنة {requestedYear}. ما زال الشيت على سنة {previousYear}.";
        }
        finally
        {
            IsYearLoading = false;
            StateHasChanged();
        }
    }

    private async Task CancelDatasetSwitchAsync()
    {
        if (!EnableChangeEngine || GridModule is null)
        {
            return;
        }

        try
        {
            await GridModule.InvokeVoidAsync(
                "cancelDatasetSwitch",
                GridElementId);
        }
        catch (JSDisconnectedException)
        {
        }
        catch (InvalidOperationException)
        {
        }
    }

    private async Task RefreshDiagnosticsAsync()
    {
        if (!GridInitialized || GridModule is null)
        {
            return;
        }

        try
        {
            Diagnostics =
                await GridModule.InvokeAsync<NativeGate5ADiagnostics>(
                    "getDiagnostics",
                    GridElementId);
        }
        catch (JSDisconnectedException)
        {
        }
    }

    private async Task DestroyGridAsync()
    {
        if (GridModule is null)
        {
            GridInitialized = false;
            return;
        }

        try
        {
            await GridModule.InvokeVoidAsync(
                "destroy",
                GridElementId);
        }
        catch (JSDisconnectedException)
        {
        }
        catch (InvalidOperationException)
        {
        }
        finally
        {
            GridInitialized = false;
        }
    }

    public async ValueTask DisposeAsync()
    {
        await DestroyGridAsync();

        if (GridModule is not null)
        {
            try
            {
                await GridModule.DisposeAsync();
            }
            catch (JSDisconnectedException)
            {
            }
        }
    }

    private static List<NativeGate5ARow> MapRows(
        IEnumerable<WorkOrderSheetRow> workOrders,
        IReadOnlyCollection<CustomColumnDefinitionData> customColumns,
        bool includeClientKey)
    {
        _ = customColumns;

        return workOrders
            .Select(workOrder =>
            {
                var row = new NativeGate5ARow
                {
                    ClientKey = includeClientKey
                        ? $"row:{Guid.NewGuid():N}"
                        : null,
                    Id = workOrder.Id,
                    DisplayOrder = workOrder.DisplayOrder,
                    WorkOrderNumber = workOrder.WorkOrderNumber,
                    WorkTypeCode = workOrder.WorkTypeCode,
                    AssignmentDate =
                        workOrder.AssignmentDate?.ToString(
                            "dd/MM/yyyy",
                            CultureInfo.InvariantCulture)
                        ?? string.Empty,
                    WorkOrderValue = workOrder.WorkOrderValue,
                    PartialAmount = workOrder.PartialAmount,
                    RemainingAmount =
                        WorkOrderFinancialRules.CalculateRemainingAmount(
                            workOrder.WorkOrderValue,
                            workOrder.PartialAmount),
                    Basket = workOrder.Busket,
                    RowVersion = Convert.ToBase64String(workOrder.RowVersion)
                };

                foreach (var pair in CustomColumnService.DeserializeValues(
                    workOrder.CustomValuesJson))
                {
                    row.CustomFields[pair.Key] =
                        JsonSerializer.SerializeToElement(pair.Value);
                }

                return row;
            })
            .ToList();
    }

    private static string DisplayOrDash(string value) =>
        string.IsNullOrWhiteSpace(value)
            ? "—"
            : value;

    private static string FormatMilliseconds(double value) =>
        value <= 0
            ? "—"
            : $"{value:N1} ms";

    private static string FormatMegabytes(double? value) =>
        value is null
            ? "n/a"
            : $"{value.Value:N1} MB";

    private sealed class NativeGate5ASheetSnapshot
    {
        public string BranchName { get; set; } = string.Empty;
        public string DepartmentName { get; set; } = string.Empty;
        public int WorkYear { get; set; }
        public List<int> AvailableWorkYears { get; set; } = [];
        public List<NativeGate5ARow> Rows { get; set; } = [];
        public List<CustomColumnDefinitionData> CustomColumns { get; set; } = [];
        public double ServerLoadMilliseconds { get; set; }
    }

    private sealed class NativeGate5ARow
    {
        [System.Text.Json.Serialization.JsonIgnore(
            Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
        public string? ClientKey { get; set; }

        public int Id { get; set; }
        public long DisplayOrder { get; set; }
        public string WorkOrderNumber { get; set; } = string.Empty;
        public string WorkTypeCode { get; set; } = string.Empty;
        public string AssignmentDate { get; set; } = string.Empty;
        public decimal? WorkOrderValue { get; set; }
        public decimal? PartialAmount { get; set; }
        public decimal? RemainingAmount { get; set; }
        public string Basket { get; set; } = string.Empty;
        public string RowVersion { get; set; } = string.Empty;

        [System.Text.Json.Serialization.JsonExtensionData]
        public Dictionary<string, JsonElement> CustomFields { get; set; } =
            new(StringComparer.Ordinal);
    }

    private sealed class NativeGate5B11BeginSaveDecision
    {
        public bool Allowed { get; set; }
        public string? Reason { get; set; }
        public string? SaveId { get; set; }
        public long Revision { get; set; }
        public int DirtyCellCount { get; set; }
        public int DirtyRowCount { get; set; }
        public int ChangedRecordCount { get; set; }
        public int DeletedRecordCount { get; set; }
    }

    private sealed class NativeGate5B11AcceptSaveResult
    {
        public string SaveId { get; set; } = string.Empty;
        public bool Dirty { get; set; }
        public int DirtyCount { get; set; }
        public bool SaveActive { get; set; }
        public int RowCount { get; set; }
    }

    private sealed class NativeGate5B1DatasetSwitchDecision
    {
        public bool Allowed { get; set; }
        public string? Reason { get; set; }
    }

    private sealed class NativeGate5ADiagnostics
    {
        public string Version { get; set; } = string.Empty;
        public int WorkYear { get; set; }
        public double ReadyMs { get; set; }
        public int SourceRows { get; set; }
        public int Columns { get; set; }
        public int ScrollEvents { get; set; }
        public int EditEvents { get; set; }
        public int PasteEvents { get; set; }
        public int DatasetSwitches { get; set; }
        public string Selection { get; set; } = "—";
        public double? HeapMb { get; set; }
        public int DomNodes { get; set; }
        public int InitializationCount { get; set; }
        public int LongTasks { get; set; }
        public double LongTaskMaxMs { get; set; }
    }
}

