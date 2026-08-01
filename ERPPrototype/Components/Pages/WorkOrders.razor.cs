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
                    WorkOrderValue = FormatAmount(workOrder.WorkOrderValue),
                    PartialAmount = FormatAmount(workOrder.PartialAmount),
                    RemainingAmount = FormatAmount(
                        WorkOrderFinancialRules.CalculateRemainingAmount(
                            workOrder.WorkOrderValue,
                            workOrder.PartialAmount)),
                    Basket = workOrder.Busket,
                    Status = workOrder.Status,
                    Notes = workOrder.Notes ?? string.Empty,
                    RowVersion = Convert.ToBase64String(
                        workOrder.RowVersion)
                })
            .ToList();
    }


    private static string FormatAmount(decimal? value)
    {
        if (value is null)
        {
            return string.Empty;
        }

        var normalized =
    WorkOrderFinancialRules.NormalizeAmount(value)
    ?? throw new InvalidOperationException(
        "A non-null amount could not be normalized.");

        return normalized == decimal.Truncate(normalized)
            ? normalized.ToString("#,0", CultureInfo.InvariantCulture)
            : normalized.ToString("#,0.00", CultureInfo.InvariantCulture);
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
        public string WorkOrderValue { get; set; } = string.Empty;
        public string PartialAmount { get; set; } = string.Empty;
        public string RemainingAmount { get; set; } = string.Empty;
        public string Basket { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public string Notes { get; set; } = string.Empty;
        public string RowVersion { get; set; } = string.Empty;
        public List<string>? ChangedFields { get; set; }
    }
}
