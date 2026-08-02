using System.Diagnostics;
using System.Globalization;
using System.Text.Json;

namespace ERPPrototype.E2ETests;

internal sealed class Phase9FoundationBrowserTest(
    Uri baseUri,
    E2ESeedData seed,
    string artifactDirectory,
    bool headed,
    bool observe,
    E2ETestSuite suite)
{
    private const int MaximumExpectedRenderedRows = 150;

    public int ExpectedCheckCount => suite switch
    {
        E2ETestSuite.Smoke => 9,
        E2ETestSuite.Full => 40,
        E2ETestSuite.Stress => 47,
        _ => throw new ArgumentOutOfRangeException(nameof(suite))
    };

    public async Task<int> RunAsync()
    {
        await using var browserSession =
            await E2EBrowserSession.CreateAsync(
                baseUri,
                artifactDirectory,
                headed,
                observe);

        var checks = new BrowserCheckRecorder();
        var loginPage = new LoginPage(browserSession.Page, baseUri);
        var workOrdersPage = new WorkOrdersPage(browserSession.Page);
        var artifactName =
            $"phase9-current-sheet-{suite.ToString().ToLowerInvariant()}";

        try
        {
            await loginPage.OpenAsync();
            checks.Pass("Login form is rendered through stable test hooks");
            await browserSession.ObserveAsync(
                "صفحة تسجيل الدخول جاهزة — سيبدأ تسجيل الدخول تلقائيًا");

            var loginToGridStartedAt = Stopwatch.GetTimestamp();

            await loginPage.LoginAsync(seed);
            await workOrdersPage.WaitUntilReadyAsync();

            var loginToGridMilliseconds =
                Stopwatch.GetElapsedTime(loginToGridStartedAt)
                    .TotalMilliseconds;

            E2ETestAssert.Equal(
                "Work Orders",
                await workOrdersPage.GetTitleAsync(),
                "The employee did not reach the Work Orders page.");

            checks.Pass("Login reaches the employee Work Orders sheet");

            var scopeText = await workOrdersPage.GetScopeAsync();

            E2ETestAssert.Contains(
                seed.BranchName,
                scopeText,
                "The employee branch was not shown on the sheet.");

            E2ETestAssert.Contains(
                seed.DepartmentName,
                scopeText,
                "The employee department was not shown on the sheet.");

            checks.Pass("Employee branch and department scope are visible");

            E2ETestAssert.Equal(
                seed.CurrentYear.ToString(CultureInfo.InvariantCulture),
                await workOrdersPage.GetSelectedYearAsync(),
                "The sheet did not open on the current work year.");

            checks.Pass("Blazor and Tabulator reach an explicit ready state");

            await workOrdersPage.WaitForActiveRowCountAsync(
                seed.RowsPerYear);

            E2ETestAssert.Equal(
                seed.RowsPerYear,
                await workOrdersPage.GetActiveRowCountAsync(),
                "The current-year sheet did not load the expected stress dataset.");

            checks.Pass(
                $"Current-year sheet contains {seed.RowsPerYear:N0} active rows");

            await workOrdersPage.WaitForAggregateReadyAsync();
            await workOrdersPage.WaitForAggregateRowCountAsync(
                "year",
                seed.RowsPerYear);
            await workOrdersPage.WaitForAggregateRowCountAsync(
                "visible",
                seed.RowsPerYear);

            var initialYearWorkOrderValueCents =
                await workOrdersPage.GetAggregateAmountCentsAsync(
                    "year",
                    "workOrderValue");

            E2ETestAssert.True(
                initialYearWorkOrderValueCents > 0,
                "The initial financial summary did not calculate Work Order Value.");

            E2ETestAssert.Equal(
                initialYearWorkOrderValueCents,
                await workOrdersPage.GetAggregateAmountCentsAsync(
                    "visible",
                    "workOrderValue"),
                "The unfiltered visible total did not match the year total.");

            checks.Pass(
                "Financial summary loads year and visible totals without scanning rendered DOM rows");

            var renderedRowCount =
                await workOrdersPage.GetRenderedRowCountAsync();

            E2ETestAssert.True(
                renderedRowCount > 0 &&
                renderedRowCount <= MaximumExpectedRenderedRows,
                "Virtual DOM rendered an unexpected number of row elements. " +
                $"Rendered: {renderedRowCount}; expected at most " +
                $"{MaximumExpectedRenderedRows}.");

            checks.Pass(
                "Virtual DOM keeps the rendered row window bounded under 1,000-row load");

            await workOrdersPage.WaitForWorkOrderAsync(
                seed.CurrentYearFirstWorkOrderNumber);

            checks.Pass("First current-year work order is rendered");
            await browserSession.ObserveAsync(
                "تم فتح شيت السنة الحالية وفيه 1000 أمر عمل");

            double lastRowScrollMilliseconds = 0;
            double searchMilliseconds = 0;
            double editSaveReloadMilliseconds = 0;
            BrowserStructureStressMetrics? structureStress = null;

            if (suite is E2ETestSuite.Full or E2ETestSuite.Stress)
            {
                var scrollStartedAt = Stopwatch.GetTimestamp();

                await workOrdersPage.ScrollToRowAsync(
                    seed.CurrentYearLastRowId);

                await workOrdersPage.WaitForWorkOrderAsync(
                    seed.CurrentYearLastWorkOrderNumber);

                lastRowScrollMilliseconds =
                    Stopwatch.GetElapsedTime(scrollStartedAt)
                        .TotalMilliseconds;

                checks.Pass(
                    "The 1,000th current-year row is reachable through virtual scrolling");
                await browserSession.ObserveAsync(
                    "تم الوصول إلى الصف رقم 1000 باستخدام Virtual Scroll");

                var searchStartedAt = Stopwatch.GetTimestamp();

                await workOrdersPage.SearchWorkOrderAsync(
                    seed.CurrentYearLastWorkOrderNumber);

                E2ETestAssert.Equal(
                    1,
                    await workOrdersPage.GetActiveRowCountAsync(),
                    "Searching for a unique work order did not reduce the active data to one row.");

                searchMilliseconds =
                    Stopwatch.GetElapsedTime(searchStartedAt)
                        .TotalMilliseconds;

                checks.Pass(
                    "Search isolates a work order near the end of the 1,000-row sheet");
                await browserSession.ObserveAsync(
                    "البحث عزل أمر عمل واحد قرب نهاية الشيت");

                await workOrdersPage.WaitForAggregateRowCountAsync(
                    "visible",
                    1);

                var filteredRowValueCents = ParseAmountCents(
                    await workOrdersPage.GetCellValueAsync(
                        seed.CurrentYearLastRowId,
                        "workOrderValue"));

                E2ETestAssert.Equal(
                    filteredRowValueCents,
                    await workOrdersPage.GetAggregateAmountCentsAsync(
                        "visible",
                        "workOrderValue"),
                    "The filtered financial summary did not match the isolated row.");

                E2ETestAssert.Equal(
                    initialYearWorkOrderValueCents,
                    await workOrdersPage.GetAggregateAmountCentsAsync(
                        "year",
                        "workOrderValue"),
                    "Filtering changed the fixed year total.");

                await workOrdersPage.ClearSearchAsync(seed.RowsPerYear);

                E2ETestAssert.Equal(
                    seed.RowsPerYear,
                    await workOrdersPage.GetActiveRowCountAsync(),
                    "Clearing search did not restore the complete current-year dataset.");

                checks.Pass(
                    "Clearing search restores all 1,000 current-year rows");

                await workOrdersPage.WaitForAggregateRowCountAsync(
                    "visible",
                    seed.RowsPerYear);
                E2ETestAssert.Equal(
                    initialYearWorkOrderValueCents,
                    await workOrdersPage.GetAggregateAmountCentsAsync(
                        "visible",
                        "workOrderValue"),
                    "Clearing search did not restore the visible financial total.");

                checks.Pass(
                    "Column filtering changes visible totals while preserving fixed year totals");

                const long minimumFilteredValueCents = 6_000_050;
                const long maximumFilteredValueCents = 6_500_075;

                await workOrdersPage.ApplyAmountFilterAsync(
                    "workOrderValue",
                    "60,000.50",
                    "٦٥٬٠٠٠٫٧٥",
                    includeBlank: false,
                    expectedRowCount: 6);

                var rangeFilteredAmounts =
                    await workOrdersPage.GetActiveAmountCentsAsync(
                        "workOrderValue");

                E2ETestAssert.Equal(
                    6,
                    rangeFilteredAmounts.Length,
                    "The Work Order Value range filter did not return the expected six rows.");

                E2ETestAssert.True(
                    rangeFilteredAmounts.All(value =>
                        value >= minimumFilteredValueCents &&
                        value <= maximumFilteredValueCents),
                    "The Work Order Value range filter returned a value outside its inclusive bounds.");

                await workOrdersPage.WaitForAggregateRowCountAsync(
                    "visible",
                    6);

                E2ETestAssert.Equal(
                    rangeFilteredAmounts.Sum(),
                    await workOrdersPage.GetAggregateAmountCentsAsync(
                        "visible",
                        "workOrderValue"),
                    "The visible Work Order Value total did not match the numeric range-filtered rows.");

                E2ETestAssert.Equal(
                    initialYearWorkOrderValueCents,
                    await workOrdersPage.GetAggregateAmountCentsAsync(
                        "year",
                        "workOrderValue"),
                    "The amount range filter changed the fixed year total.");

                checks.Pass(
                    "Financial amount range filter accepts formatted Arabic/English values and uses inclusive bounds");
                await browserSession.ObserveAsync(
                    "تم فلترة قيمة أمر العمل من 60,000.50 إلى 65,000.75 وظهر 6 أوامر فقط");

                await workOrdersPage.ClearAmountFilterAsync(
                    "workOrderValue",
                    seed.RowsPerYear);

                await workOrdersPage.WaitForAggregateRowCountAsync(
                    "visible",
                    seed.RowsPerYear);

                E2ETestAssert.Equal(
                    initialYearWorkOrderValueCents,
                    await workOrdersPage.GetAggregateAmountCentsAsync(
                        "visible",
                        "workOrderValue"),
                    "Clearing the Work Order Value filter did not restore the complete visible total.");

                checks.Pass(
                    "Clearing a financial range filter restores every current-year work order and visible total");

                await workOrdersPage.ApplyAmountFilterAsync(
                    "partialAmount",
                    string.Empty,
                    string.Empty,
                    includeBlank: false,
                    expectedRowCount: seed.RowsPerYear / 3);

                var nonBlankPartialAmounts =
                    await workOrdersPage.GetActiveAmountCentsAsync(
                        "partialAmount");

                E2ETestAssert.Equal(
                    seed.RowsPerYear / 3,
                    nonBlankPartialAmounts.Length,
                    "The Partial Amount nonblank filter did not return every paid row.");

                E2ETestAssert.True(
                    nonBlankPartialAmounts.All(value => value > 0),
                    "The Partial Amount nonblank filter returned a blank or non-positive value.");

                await workOrdersPage.ClearAmountFilterAsync(
                    "partialAmount",
                    seed.RowsPerYear);

                checks.Pass(
                    "Financial filters can exclude blank Partial Amount rows and clear back to the full year");

                await workOrdersPage.SortFinancialColumnAsync(
                    "workOrderValue",
                    "asc");

                var ascendingAmounts =
                    await workOrdersPage.GetActiveAmountCentsAsync(
                        "workOrderValue");
                var firstAscendingRow =
                    await workOrdersPage.GetFirstActiveFinancialRowAsync(
                        "workOrderValue");

                E2ETestAssert.True(
                    ascendingAmounts
                        .Zip(ascendingAmounts.Skip(1))
                        .All(pair => pair.First <= pair.Second),
                    "Work Order Value ascending sort did not order the active rows numerically.");

                E2ETestAssert.True(
                    firstAscendingRow.EndsWith(
                        "|5000000",
                        StringComparison.Ordinal),
                    "Ascending Work Order Value sort did not place the minimum-value work order first.");

                E2ETestAssert.Equal(
                    "1|workOrderValue|asc",
                    await workOrdersPage.GetSorterSnapshotAsync(),
                    "Ascending financial sort did not remain a single-column sort.");

                checks.Pass(
                    "Work Order Value sorts numerically ascending through the column header using one sorter");

                await workOrdersPage.SortFinancialColumnAsync(
                    "workOrderValue",
                    "desc");

                var descendingAmounts =
                    await workOrdersPage.GetActiveAmountCentsAsync(
                        "workOrderValue");
                var firstDescendingRow =
                    await workOrdersPage.GetFirstActiveFinancialRowAsync(
                        "workOrderValue");

                E2ETestAssert.True(
                    descendingAmounts
                        .Zip(descendingAmounts.Skip(1))
                        .All(pair => pair.First >= pair.Second),
                    "Work Order Value descending sort did not order the active rows numerically.");

                E2ETestAssert.True(
                    firstDescendingRow.EndsWith(
                        "|204500075",
                        StringComparison.Ordinal),
                    "Descending Work Order Value sort did not place the maximum-value work order first.");

                E2ETestAssert.True(
                    !string.Equals(
                        firstAscendingRow,
                        firstDescendingRow,
                        StringComparison.Ordinal),
                    "Financial sorting changed the amount order without moving the complete work-order row identity.");

                E2ETestAssert.Equal(
                    "1|workOrderValue|desc",
                    await workOrdersPage.GetSorterSnapshotAsync(),
                    "Descending financial sort did not replace the previous direction as one-column sort.");

                await workOrdersPage.ClearSortAsync();

                checks.Pass(
                    "Descending financial sort moves complete rows and replaces the previous sort direction");
                await browserSession.ObserveAsync(
                    "تم ترتيب قيمة أمر العمل تصاعدي ثم تنازلي وتحرك الصف كاملًا");

                const string persistedNote =
                    "Phase 9.1C browser save persisted under 1,000-row load";

                var editSaveReloadStartedAt = Stopwatch.GetTimestamp();

                await workOrdersPage.SetCellValueAsync(
                    seed.CurrentYearMiddleRowId,
                    "notes",
                    persistedNote);

                await workOrdersPage.WaitForDirtyRowCountAsync(1);

                checks.Pass(
                    "Editing a middle-row cell marks exactly one row dirty");
                await browserSession.ObserveAsync(
                    "تم تعديل ملاحظة في منتصف الألف صف — يوجد صف واحد غير محفوظ");

                await workOrdersPage.SaveAndWaitAsync();
                await workOrdersPage.WaitForDirtyRowCountAsync(0);

                checks.Pass(
                    "Saving a cell edit succeeds on the 1,000-row sheet");

                await workOrdersPage.ReloadAndWaitAsync();
                await workOrdersPage.WaitForActiveRowCountAsync(
                    seed.RowsPerYear);

                E2ETestAssert.Equal(
                    persistedNote,
                    await workOrdersPage.GetCellValueAsync(
                        seed.CurrentYearMiddleRowId,
                        "notes"),
                    "The saved browser edit did not survive a full page reload.");

                editSaveReloadMilliseconds =
                    Stopwatch.GetElapsedTime(editSaveReloadStartedAt)
                        .TotalMilliseconds;

                checks.Pass(
                    "Saved edit persists after reload and the sheet returns to 1,000 rows");
                await browserSession.ObserveAsync(
                    "تم الحفظ ثم Refresh — الملاحظة ما زالت محفوظة في قاعدة البيانات");

                E2ETestAssert.True(
                    !string.IsNullOrWhiteSpace(
                        await workOrdersPage.GetCellValueAsync(
                            seed.CurrentYearMiddleRowId,
                            "workOrderValue")),
                    "The seeded current-year row did not contain Work Order Value.");

                E2ETestAssert.Equal(
                    await workOrdersPage.GetCellValueAsync(
                        seed.CurrentYearMiddleRowId,
                        "workOrderValue"),
                    await workOrdersPage.GetCellValueAsync(
                        seed.CurrentYearMiddleRowId,
                        "remainingAmount"),
                    "A row without Partial Amount did not derive Remaining Amount from Work Order Value.");

                checks.Pass(
                    "Seeded financial values load with a derived Remaining Amount");

                var oldWorkOrderValueCents = ParseAmountCents(
                    await workOrdersPage.GetCellValueAsync(
                        seed.CurrentYearMiddleRowId,
                        "workOrderValue"));
                var oldPartialAmountCents = ParseAmountCents(
                    await workOrdersPage.GetCellValueAsync(
                        seed.CurrentYearMiddleRowId,
                        "partialAmount"));
                var aggregateWorkOrderValueBefore =
                    await workOrdersPage.GetAggregateAmountCentsAsync(
                        "year",
                        "workOrderValue");
                var aggregatePartialAmountBefore =
                    await workOrdersPage.GetAggregateAmountCentsAsync(
                        "year",
                        "partialAmount");
                var aggregateRemainingAmountBefore =
                    await workOrdersPage.GetAggregateAmountCentsAsync(
                        "year",
                        "remainingAmount");

                await workOrdersPage.SetCellValueAsync(
                    seed.CurrentYearMiddleRowId,
                    "workOrderValue",
                    "1250000.565",
                    expectedValue: "1,250,000.57");

                await workOrdersPage.WaitForCellValueAsync(
                    seed.CurrentYearMiddleRowId,
                    "remainingAmount",
                    "1,250,000.57");

                await workOrdersPage.PasteCellValueAsync(
                    seed.CurrentYearMiddleRowId,
                    "partialAmount",
                    "250000.255",
                    expectedValue: "250,000.26");

                await workOrdersPage.WaitForCellValueAsync(
                    seed.CurrentYearMiddleRowId,
                    "remainingAmount",
                    "1,000,000.31");
                await workOrdersPage.WaitForDirtyRowCountAsync(1);

                checks.Pass(
                    "Financial edit and paste round to halalas and update Remaining Amount automatically");
                await browserSession.ObserveAsync(
                    "تم تعديل قيمة أمر العمل والجزئي — المتبقي اتحسب تلقائيًا");

                const long editedWorkOrderValueCents = 125_000_057;
                const long editedPartialAmountCents = 25_000_026;
                const long editedRemainingAmountCents = 100_000_031;
                var oldRemainingAmountCents =
                    oldWorkOrderValueCents - oldPartialAmountCents;

                await workOrdersPage.WaitForAggregateAmountCentsAsync(
                    "year",
                    "workOrderValue",
                    aggregateWorkOrderValueBefore -
                    oldWorkOrderValueCents +
                    editedWorkOrderValueCents);
                await workOrdersPage.WaitForAggregateAmountCentsAsync(
                    "year",
                    "partialAmount",
                    aggregatePartialAmountBefore -
                    oldPartialAmountCents +
                    editedPartialAmountCents);
                await workOrdersPage.WaitForAggregateAmountCentsAsync(
                    "year",
                    "remainingAmount",
                    aggregateRemainingAmountBefore -
                    oldRemainingAmountCents +
                    editedRemainingAmountCents);

                checks.Pass(
                    "Financial summary updates before Save after edit and paste");

                await workOrdersPage.UndoAsync();
                await workOrdersPage.WaitForCellValueAsync(
                    seed.CurrentYearMiddleRowId,
                    "partialAmount",
                    string.Empty);
                await workOrdersPage.WaitForCellValueAsync(
                    seed.CurrentYearMiddleRowId,
                    "remainingAmount",
                    "1,250,000.57");
                await workOrdersPage.WaitForAggregateAmountCentsAsync(
                    "year",
                    "partialAmount",
                    aggregatePartialAmountBefore -
                    oldPartialAmountCents);
                await workOrdersPage.WaitForAggregateAmountCentsAsync(
                    "year",
                    "remainingAmount",
                    aggregateRemainingAmountBefore -
                    oldRemainingAmountCents +
                    editedWorkOrderValueCents);

                await workOrdersPage.RedoAsync();
                await workOrdersPage.WaitForCellValueAsync(
                    seed.CurrentYearMiddleRowId,
                    "partialAmount",
                    "250,000.26");
                await workOrdersPage.WaitForCellValueAsync(
                    seed.CurrentYearMiddleRowId,
                    "remainingAmount",
                    "1,000,000.31");
                await workOrdersPage.WaitForAggregateAmountCentsAsync(
                    "year",
                    "partialAmount",
                    aggregatePartialAmountBefore -
                    oldPartialAmountCents +
                    editedPartialAmountCents);
                await workOrdersPage.WaitForAggregateAmountCentsAsync(
                    "year",
                    "remainingAmount",
                    aggregateRemainingAmountBefore -
                    oldRemainingAmountCents +
                    editedRemainingAmountCents);

                checks.Pass(
                    "Undo and Redo keep calculated values and financial totals consistent");

                await workOrdersPage.SaveAndWaitAsync();
                await workOrdersPage.WaitForDirtyRowCountAsync(0);
                await workOrdersPage.ReloadAndWaitAsync();
                await workOrdersPage.WaitForActiveRowCountAsync(
                    seed.RowsPerYear);

                E2ETestAssert.Equal(
                    "1,250,000.57",
                    await workOrdersPage.GetCellValueAsync(
                        seed.CurrentYearMiddleRowId,
                        "workOrderValue"),
                    "Work Order Value did not persist after reload.");

                E2ETestAssert.Equal(
                    "250,000.26",
                    await workOrdersPage.GetCellValueAsync(
                        seed.CurrentYearMiddleRowId,
                        "partialAmount"),
                    "Partial Amount did not persist after reload.");

                E2ETestAssert.Equal(
                    "1,000,000.31",
                    await workOrdersPage.GetCellValueAsync(
                        seed.CurrentYearMiddleRowId,
                        "remainingAmount"),
                    "Remaining Amount was not derived consistently after reload.");

                checks.Pass(
                    "Saved financial amounts persist and recalculate after reload");
                await browserSession.ObserveAsync(
                    "تم حفظ المبالغ ثم Refresh — القيمة والجزئي والمتبقي ما زالوا صحيحين");

                await workOrdersPage.SelectContiguousRowsAsync(
                    seed.CurrentYearMiddleRowId,
                    20);
                await workOrdersPage.WaitForSelectionAggregateAsync(20);

                E2ETestAssert.True(
                    await workOrdersPage.GetAggregateAmountCentsAsync(
                        "selection",
                        "workOrderValue") > 0,
                    "The selected-row summary did not total Work Order Value.");

                E2ETestAssert.Contains(
                    "20",
                    await workOrdersPage.GetSummaryItemTextAsync(
                        "work-orders-selection-count"),
                    "The selected-row summary did not show 20 unique work orders.");

                checks.Pass(
                    "Selecting 20 rows shows unique work-order count and financial totals");
                await browserSession.ObserveAsync(
                    "تم تحديد 20 صف — ظهر عدد الأوامر ومجموع القيم المحددة");

                await workOrdersPage.ClearSelectionAsync();

                await workOrdersPage.SetCellValueAsync(
                    seed.CurrentYearMiddleRowId,
                    "partialAmount",
                    "2000000",
                    expectedValue: "2,000,000");
                await workOrdersPage.WaitForDirtyRowCountAsync(1);

                var invalidFinancialStatus =
                    await workOrdersPage.SaveAndWaitForFailureAsync(
                        "لا يمكن الحفظ");

                E2ETestAssert.Contains(
                    "لا يمكن الحفظ",
                    invalidFinancialStatus,
                    "A Partial Amount above Work Order Value did not block save.");

                E2ETestAssert.Contains(
                    "المبلغ الجزئي",
                    await workOrdersPage.GetValidationPanelTextAsync(),
                    "Financial validation did not explain the invalid relationship.");

                checks.Pass(
                    "Partial Amount above Work Order Value is rejected in the sheet");

                await workOrdersPage.UndoAsync();
                await workOrdersPage.WaitForCellValueAsync(
                    seed.CurrentYearMiddleRowId,
                    "partialAmount",
                    "250,000.26");
                await workOrdersPage.WaitForCellValueAsync(
                    seed.CurrentYearMiddleRowId,
                    "remainingAmount",
                    "1,000,000.31");
                await workOrdersPage.WaitForDirtyRowCountAsync(0);

                await workOrdersPage.SelectYearAsync(seed.PreviousYear);

                E2ETestAssert.Equal(
                    seed.PreviousYear.ToString(CultureInfo.InvariantCulture),
                    await workOrdersPage.GetSelectedYearAsync(),
                    "The year selector did not settle on the requested year.");

                checks.Pass(
                    "Year selector changes to the previous stress dataset");

                await workOrdersPage.WaitForActiveRowCountAsync(
                    seed.RowsPerYear);

                E2ETestAssert.Equal(
                    seed.RowsPerYear,
                    await workOrdersPage.GetActiveRowCountAsync(),
                    "The previous-year sheet did not load 1,000 rows.");

                checks.Pass(
                    "Previous-year sheet also contains 1,000 active rows");

                await workOrdersPage.ScrollToRowAsync(
                    seed.PreviousYearLastRowId);

                await workOrdersPage.WaitForWorkOrderAsync(
                    seed.PreviousYearLastWorkOrderNumber);

                checks.Pass(
                    "The 1,000th previous-year row is reachable after changing year");

                E2ETestAssert.True(
                    !await workOrdersPage.ContainsWorkOrderInDataAsync(
                        seed.CurrentYearFirstWorkOrderNumber),
                    "Current-year data remained in the active table after changing year.");

                checks.Pass(
                    "Changing year replaces the active 1,000-row dataset without leakage");
                await browserSession.ObserveAsync(
                    "تم تغيير السنة وتحميل 1000 سجل مختلف بدون اختلاط البيانات");
            }

            if (suite == E2ETestSuite.Stress)
            {
                await workOrdersPage.SelectYearAsync(seed.CurrentYear);
                await workOrdersPage.WaitForActiveRowCountAsync(
                    seed.RowsPerYear);

                checks.Pass(
                    "Stress run returns to the clean 1,000-row current-year sheet");

                E2ETestAssert.Equal(
                    0,
                    await workOrdersPage.GetDirtyRowCountAsync(),
                    "The structural stress run did not start from a clean sheet.");

                checks.Pass(
                    "Structural stress begins with no unsaved rows");

                structureStress =
                    await workOrdersPage.RunThousandRowStructureStressAsync(
                        seed.CurrentYearMiddleRowId,
                        seed.RowsPerYear,
                      step => browserSession.ObserveAsync(step));

                checks.Pass(
                    "Bulk insert adds 1,000 rows to a 1,000-row sheet");
                checks.Pass(
                    "Bulk Undo restores the original 1,000 rows and clears dirty state");
                checks.Pass(
                    "Bulk Redo restores all 1,000 inserted rows");
                checks.Pass(
                    "Final Undo returns the browser to a clean 1,000-row baseline");

                E2ETestAssert.Equal(
                    seed.RowsPerYear,
                    structureStress.FinalRowCount,
                    "The final structural stress row count was not restored.");

                E2ETestAssert.Equal(
                    0,
                    structureStress.FinalDirtyRowCount,
                    "The final structural stress dirty state was not cleared.");

                var stressReport = new BrowserStressReport(
                    Suite: suite.ToString(),
                    RowsPerYear: seed.RowsPerYear,
                    TotalSeededRows: seed.RowsPerYear * 2,
                    LoginToGridMilliseconds: loginToGridMilliseconds,
                    LastRowScrollMilliseconds: lastRowScrollMilliseconds,
                    SearchMilliseconds: searchMilliseconds,
                    EditSaveReloadMilliseconds: editSaveReloadMilliseconds,
                    Structure: structureStress,
                    CapturedAtUtc: DateTime.UtcNow);

                var reportPath = Path.Combine(
                    artifactDirectory,
                    "phase9-1000-row-stress-metrics.json");

                await File.WriteAllTextAsync(
                    reportPath,
                    JsonSerializer.Serialize(
                        stressReport,
                        new JsonSerializerOptions
                        {
                            WriteIndented = true
                        }));

                Console.WriteLine(
                    $"1,000-row stress metrics: {reportPath}");

                checks.Pass(
                    "Stress timings are captured as a reusable performance baseline");
            }

            if (suite is E2ETestSuite.Full or E2ETestSuite.Stress)
            {
                await workOrdersPage.SelectYearAsync(seed.CurrentYear);
                await workOrdersPage.WaitForActiveRowCountAsync(
                    seed.RowsPerYear);

                var duplicateTargetType =
                    await workOrdersPage.GetCellValueAsync(
                        seed.CurrentYearLastRowId,
                        "workTypeCode");

                var duplicateSourceType =
                    await workOrdersPage.GetCellValueAsync(
                        seed.CurrentYearFirstRowId,
                        "workTypeCode");

                await workOrdersPage.SetCellValueAsync(
                    seed.CurrentYearLastRowId,
                    "workOrderNumber",
                    seed.CurrentYearFirstWorkOrderNumber);

                await workOrdersPage.SetCellValueAsync(
                    seed.CurrentYearLastRowId,
                    "workTypeCode",
                    duplicateSourceType);

                await workOrdersPage.WaitForDirtyRowCountAsync(1);

                checks.Pass(
                    "Creating a duplicate identity marks only the edited row dirty");
                await browserSession.ObserveAsync(
                    "تم إنشاء رقم أمر عمل مكرر عمدًا — الحفظ التالي يجب أن يُرفض");

                var duplicateStatus =
                    await workOrdersPage.SaveAndWaitForFailureAsync(
                        "لا يمكن الحفظ");

                E2ETestAssert.Contains(
                    "لا يمكن الحفظ",
                    duplicateStatus,
                    "The duplicate edit did not block the save action.");

                E2ETestAssert.True(
                    await workOrdersPage.IsValidationPanelVisibleAsync(),
                    "The duplicate row was rejected without showing the validation navigator.");

                E2ETestAssert.Contains(
                    "مكرر",
                    await workOrdersPage.GetValidationPanelTextAsync(),
                    "The validation navigator did not explain the duplicate identity.");

                checks.Pass(
                    "Duplicate save is rejected and the validation navigator is shown");
                await browserSession.ObserveAsync(
                    "تم رفض الحفظ وظهر تنبيه التكرار على الصف المخالف");

                const string correctedUniqueWorkOrderNumber = "929999999";

                await workOrdersPage.SetCellValueAsync(
                    seed.CurrentYearLastRowId,
                    "workOrderNumber",
                    correctedUniqueWorkOrderNumber);

                await workOrdersPage.SetCellValueAsync(
                    seed.CurrentYearLastRowId,
                    "workTypeCode",
                    duplicateTargetType);

                await workOrdersPage.WaitForDirtyRowCountAsync(1);
                await workOrdersPage.SaveAndWaitAsync();
                await workOrdersPage.WaitForDirtyRowCountAsync(0);
                await workOrdersPage.WaitForActiveRowCountAsync(
                    seed.RowsPerYear);

                E2ETestAssert.True(
                    await workOrdersPage.ContainsWorkOrderInDataAsync(
                        correctedUniqueWorkOrderNumber),
                    "The corrected unique work order was not present after save.");

                checks.Pass(
                    "Correcting the duplicate allows the same row to save cleanly");

                await workOrdersPage.DeleteRowAsync(
                    seed.CurrentYearFirstRowId,
                    expectedRemainingRows: seed.RowsPerYear - 1);

                await workOrdersPage.WaitForDirtyRowCountAsync(1);
                checks.Pass(
                    "Deleting one saved row reduces the 1,000-row sheet and marks one deletion");
                await browserSession.ObserveAsync(
                    "تم حذف صف محفوظ — العدد أصبح 999 قبل الحفظ");

                await workOrdersPage.SaveAndWaitAsync();
                await workOrdersPage.ReloadAndWaitAsync();
                await workOrdersPage.WaitForActiveRowCountAsync(
                    seed.RowsPerYear - 1);

                E2ETestAssert.True(
                    !await workOrdersPage.ContainsWorkOrderInDataAsync(
                        seed.CurrentYearFirstWorkOrderNumber),
                    "The deleted work order returned after reload.");

                checks.Pass(
                    "Saved deletion remains absent after a full page reload");
                await browserSession.ObserveAsync(
                    "تم حفظ الحذف ثم Refresh — الصف المحذوف لم يرجع");

                var destinationDate =
                    $"01/01/{seed.PreviousYear}";

                await workOrdersPage.SetCellValueAsync(
                    seed.CurrentYearMiddleRowId,
                    "assignmentDate",
                    destinationDate);

                await workOrdersPage.WaitForDirtyRowCountAsync(1);
                checks.Pass(
                    "Changing Assignment Date to another year marks one row dirty");
                await browserSession.ObserveAsync(
                    "تم تغيير تاريخ الإسناد إلى السنة السابقة — الصف جاهز للنقل");

                await workOrdersPage.SaveAndWaitAsync();
                await workOrdersPage.WaitForActiveRowCountAsync(
                    seed.RowsPerYear - 2);
                await workOrdersPage.ReloadAndWaitAsync();
                await workOrdersPage.WaitForActiveRowCountAsync(
                    seed.RowsPerYear - 2);

                E2ETestAssert.True(
                    !await workOrdersPage.ContainsWorkOrderInDataAsync(
                        seed.CurrentYearMiddleWorkOrderNumber),
                    "The moved work order remained in the source year after save.");

                checks.Pass(
                    "Saving the year-changing date removes the row from the source year");

                await workOrdersPage.SelectYearAsync(seed.PreviousYear);
                await workOrdersPage.WaitForActiveRowCountAsync(
                    seed.RowsPerYear + 1);

                E2ETestAssert.True(
                    await workOrdersPage.ContainsWorkOrderInDataAsync(
                        seed.CurrentYearMiddleWorkOrderNumber),
                    "The moved work order was not present in the destination year.");

                checks.Pass(
                    "The moved work order appears in the destination year with 1,001 rows");
                await browserSession.ObserveAsync(
                    "تم النقل بنجاح — السنة السابقة أصبحت 1001 صف");
            }

            browserSession.Diagnostics.AssertNoCriticalErrors();
            checks.Pass(
                "Journey completes without page errors or HTTP 5xx responses");

            E2ETestAssert.Equal(
                ExpectedCheckCount,
                checks.PassedCount,
                "The browser journey did not execute the expected number of checks.");

            await browserSession.ObserveAsync(
                $"اكتملت الرحلة بنجاح: {checks.PassedCount}/{ExpectedCheckCount} PASS",
                pauseMilliseconds: 2_000);

            await browserSession.CaptureSuccessAsync(artifactName);
            return checks.PassedCount;
        }
        catch
        {
            await browserSession.CaptureFailureAsync(artifactName);
            throw;
        }
    }

    private static long ParseAmountCents(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return 0;
        }

        var amount = decimal.Parse(
            value,
            NumberStyles.AllowThousands | NumberStyles.AllowDecimalPoint,
            CultureInfo.InvariantCulture);

        return decimal.ToInt64(
            decimal.Round(
                amount * 100m,
                0,
                MidpointRounding.AwayFromZero));
    }
}

internal sealed record BrowserStressReport(
    string Suite,
    int RowsPerYear,
    int TotalSeededRows,
    double LoginToGridMilliseconds,
    double LastRowScrollMilliseconds,
    double SearchMilliseconds,
    double EditSaveReloadMilliseconds,
    BrowserStructureStressMetrics Structure,
    DateTime CapturedAtUtc);
