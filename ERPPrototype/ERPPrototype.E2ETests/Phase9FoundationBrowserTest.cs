using System.Diagnostics;
using System.Globalization;
using System.Text.Json;

namespace ERPPrototype.E2ETests;

internal sealed class Phase9FoundationBrowserTest(
    Uri baseUri,
    E2ESeedData seed,
    string artifactDirectory,
    bool headed,
    E2ETestSuite suite)
{
    private const int MaximumExpectedRenderedRows = 150;

    public int ExpectedCheckCount
    {
        get
        {
            var baseCount = suite switch
            {
                E2ETestSuite.Smoke => 11,
                E2ETestSuite.Full => 46,
                E2ETestSuite.Stress => 53,
                _ => throw new ArgumentOutOfRangeException(nameof(suite))
            };

            return baseCount;
        }
    }

    public async Task<int> RunAsync()
    {
        await using var browserSession =
            await E2EBrowserSession.CreateAsync(
                baseUri,
                artifactDirectory,
                headed);

        var checks = new BrowserCheckRecorder();
        var loginPage = new LoginPage(browserSession.Page, baseUri);
        var workOrdersPage = new WorkOrdersPage(browserSession.Page);
        var artifactName =
            $"phase9-current-sheet-{suite.ToString().ToLowerInvariant()}";

        try
        {
            await loginPage.OpenAsync();

            E2ETestAssert.True(
                !await workOrdersPage.IsGridRuntimeLoadedAsync(),
                "The Login page preloaded the Work Orders grid runtime.");

            checks.Pass(
                "Login form is rendered without preloading Work Orders JavaScript");

            var loginToGridStartedAt = Stopwatch.GetTimestamp();

            await loginPage.LoginAsync(seed);
            await workOrdersPage.WaitUntilReadyAsync();

            var loginToGridMilliseconds =
                Stopwatch.GetElapsedTime(loginToGridStartedAt)
                    .TotalMilliseconds;

            E2ETestAssert.Equal(
                "/work-orders",
                workOrdersPage.GetPath(),
                "The employee did not reach the Work Orders page.");

            checks.Pass("Login reaches the employee Work Orders sheet");

            E2ETestAssert.Equal(
                seed.BranchName,
                await workOrdersPage.GetBranchSourceNameAsync(),
                "The employee branch scope did not match the authenticated user.");

            E2ETestAssert.Equal(
                seed.DepartmentName,
                await workOrdersPage.GetDepartmentSourceNameAsync(),
                "The employee department scope did not match the authenticated user.");

            checks.Pass("Employee branch and department scope are visible");

            E2ETestAssert.Equal(
                seed.CurrentYear.ToString(CultureInfo.InvariantCulture),
                await workOrdersPage.GetSelectedYearAsync(),
                "The sheet did not open on the current work year.");

            E2ETestAssert.True(
                await workOrdersPage.IsGridRuntimeLoadedAsync(),
                "The Work Orders route did not lazy-load its grid runtime.");

            E2ETestAssert.True(
                !await workOrdersPage.IsPerformanceRuntimeLoadedAsync(),
                "Normal Work Orders usage loaded the optional performance observatory.");

            checks.Pass(
                "Blazor and route-loaded Tabulator reach an explicit ready state");

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
            await workOrdersPage.WaitForAggregateRowCountAsync(
                "open",
                seed.RowsPerYear);

            var initialYearWorkOrderValueCents =
                await workOrdersPage.GetAggregateAmountCentsAsync(
                    "year",
                    "workOrderValue");
            var initialOpenWorkOrderValueCents =
                await workOrdersPage.GetAggregateAmountCentsAsync(
                    "open",
                    "workOrderValue");
            var initialOpenPartialAmountCents =
                await workOrdersPage.GetAggregateAmountCentsAsync(
                    "open",
                    "partialAmount");
            var initialOpenRemainingAmountCents =
                await workOrdersPage.GetAggregateAmountCentsAsync(
                    "open",
                    "remainingAmount");

            E2ETestAssert.True(
                initialOpenWorkOrderValueCents > 0,
                "The open-work-order summary did not calculate Work Order Value.");

            E2ETestAssert.Equal(
                initialYearWorkOrderValueCents,
                initialOpenWorkOrderValueCents,
                "The initial all-open dataset did not match the year total.");

            E2ETestAssert.Contains(
                "Open Work Orders",
                await workOrdersPage.GetSummaryItemTextAsync(
                    "work-orders-summary-count"),
                "The header did not render the Open Work Orders summary.");
            E2ETestAssert.Contains(
                "Work Order Value",
                await workOrdersPage.GetSummaryItemTextAsync(
                    "work-orders-summary-workOrderValue"),
                "The header did not render Work Order Value.");
            E2ETestAssert.Contains(
                "Partial Amount",
                await workOrdersPage.GetSummaryItemTextAsync(
                    "work-orders-summary-partialAmount"),
                "The header did not render Partial Amount.");
            E2ETestAssert.Contains(
                "Remaining Amount",
                await workOrdersPage.GetSummaryItemTextAsync(
                    "work-orders-summary-remainingAmount"),
                "The header did not render Remaining Amount.");

            await workOrdersPage.WaitForBasketDashboardReadyAsync();

            E2ETestAssert.Equal(
                1,
                await workOrdersPage.GetBasketDashboardCardCountAsync(),
                "The Basket summary should render only the active seeded stage.");

            var dashboardLayout =
                await workOrdersPage.GetBasketDashboardLayoutAsync();

            E2ETestAssert.Equal(
                1,
                dashboardLayout.VisibleCardCount,
                "The active Basket side-panel row was not visible.");
            E2ETestAssert.True(
                !dashboardLayout.HasHorizontalOverflow,
                "The Basket side panel must not require horizontal scrolling.");
            E2ETestAssert.Equal(
                1,
                dashboardLayout.RowCount,
                "One active Basket should occupy one side-panel row.");
            E2ETestAssert.True(
                dashboardLayout.MaximumCardHeightPixels >= 48 &&
                dashboardLayout.MaximumCardHeightPixels <= 90,
                "The Basket side-panel row is outside the approved readable height range.");
            E2ETestAssert.Equal(
                1,
                dashboardLayout.GroupCount,
                "The Basket side panel should render one vertical list.");
            E2ETestAssert.True(
                dashboardLayout.PanelHasVisibleBoundary,
                "The Basket side panel must keep its visible outer boundary.");

            var basketScroll =
                await workOrdersPage.VerifyBasketDashboardVerticalScrollAsync();

            E2ETestAssert.True(
                basketScroll.HadVerticalOverflow,
                "The Basket scroll test could not create vertical overflow.");
            E2ETestAssert.True(
                basketScroll.ScrollTopIncreased,
                "Mouse-wheel input did not move the Basket list.");
            E2ETestAssert.True(
                basketScroll.ReachedBottom,
                "The Basket list could not be scrolled to its final position.");
            E2ETestAssert.True(
                basketScroll.LastCardFullyVisible,
                "The final Basket row was not fully reachable at the bottom.");

            checks.Pass(
                "Basket side panel supports mouse-wheel scrolling to the final row");

            var initialInProgressDashboard =
                await workOrdersPage.GetBasketDashboardEntryAsync(
                    ERPPrototype.Data.WorkOrderBuskets.InProgress);
            var initialCompletedDashboard =
                await workOrdersPage.GetBasketDashboardEntryAsync(
                    ERPPrototype.Data.WorkOrderBuskets.WorkOrderCompleted);

            E2ETestAssert.Equal(
                seed.RowsPerYear,
                initialInProgressDashboard.RowCount,
                "The Basket dashboard did not count the seeded In Progress rows.");
            E2ETestAssert.Equal(
                initialOpenRemainingAmountCents,
                initialInProgressDashboard.RemainingAmountCents,
                "The Basket dashboard did not total Remaining Amount.");
            E2ETestAssert.Equal(
                0,
                initialCompletedDashboard.RowCount,
                "The completed Basket should start empty in the test dataset.");
            E2ETestAssert.True(
                await workOrdersPage.IsBasketDashboardEntryRenderedAsync(
                    ERPPrototype.Data.WorkOrderBuskets.InProgress),
                "The active In Progress Basket was not rendered.");
            E2ETestAssert.True(
                !await workOrdersPage.IsBasketDashboardEntryRenderedAsync(
                    ERPPrototype.Data.WorkOrderBuskets.WorkOrderCompleted),
                "An empty completed Basket should not consume dashboard space.");

            var dashboardText =
                await workOrdersPage.GetBasketDashboardTextAsync();

            E2ETestAssert.Contains(
                "متبقي",
                dashboardText,
                "The Basket dashboard did not label the remaining amount.");
            E2ETestAssert.True(
                !dashboardText.Contains(
                    "Work Order Value",
                    StringComparison.Ordinal),
                "The Basket dashboard must not display Work Order Value.");

            checks.Pass(
                "Basket side panel shows active workflow stages without horizontal overflow");

            var firstRowWorkOrderValueCents = ParseAmountCents(
                await workOrdersPage.GetCellValueAsync(
                    seed.CurrentYearFirstRowId,
                    "workOrderValue"));
            var firstRowPartialAmountCents = ParseAmountCents(
                await workOrdersPage.GetCellValueAsync(
                    seed.CurrentYearFirstRowId,
                    "partialAmount"));
            var firstRowRemainingAmountCents = ParseAmountCents(
                await workOrdersPage.GetCellValueAsync(
                    seed.CurrentYearFirstRowId,
                    "remainingAmount"));

            await workOrdersPage.SetCellValueAsync(
                seed.CurrentYearFirstRowId,
                "basket",
                ERPPrototype.Data.WorkOrderBuskets.WorkOrderCompleted);
            await workOrdersPage.WaitForAggregateRowCountAsync(
                "open",
                seed.RowsPerYear - 1);
            await workOrdersPage.WaitForAggregateAmountCentsAsync(
                "open",
                "workOrderValue",
                initialOpenWorkOrderValueCents -
                firstRowWorkOrderValueCents);
            await workOrdersPage.WaitForAggregateAmountCentsAsync(
                "open",
                "partialAmount",
                initialOpenPartialAmountCents -
                firstRowPartialAmountCents);
            await workOrdersPage.WaitForAggregateAmountCentsAsync(
                "open",
                "remainingAmount",
                initialOpenRemainingAmountCents -
                firstRowRemainingAmountCents);
            await workOrdersPage.WaitForBasketDashboardEntryAsync(
                ERPPrototype.Data.WorkOrderBuskets.InProgress,
                seed.RowsPerYear - 1,
                initialOpenRemainingAmountCents -
                firstRowRemainingAmountCents);
            await workOrdersPage.WaitForBasketDashboardEntryAsync(
                ERPPrototype.Data.WorkOrderBuskets.WorkOrderCompleted,
                1,
                firstRowRemainingAmountCents);
            await workOrdersPage.WaitForBasketDashboardRenderedEntryAsync(
                ERPPrototype.Data.WorkOrderBuskets.WorkOrderCompleted,
                expectedRendered: true);
            E2ETestAssert.Equal(
                2,
                await workOrdersPage.GetBasketDashboardCardCountAsync(),
                "A Basket did not appear when its first work order entered it.");

            E2ETestAssert.Equal(
                seed.RowsPerYear,
                await workOrdersPage.GetAggregateRowCountAsync("year"),
                "Completing one work order changed the year row count.");

            await workOrdersPage.UndoAsync();
            await workOrdersPage.WaitForAggregateRowCountAsync(
                "open",
                seed.RowsPerYear);
            await workOrdersPage.WaitForAggregateAmountCentsAsync(
                "open",
                "workOrderValue",
                initialOpenWorkOrderValueCents);
            await workOrdersPage.WaitForAggregateAmountCentsAsync(
                "open",
                "partialAmount",
                initialOpenPartialAmountCents);
            await workOrdersPage.WaitForAggregateAmountCentsAsync(
                "open",
                "remainingAmount",
                initialOpenRemainingAmountCents);
            await workOrdersPage.WaitForBasketDashboardEntryAsync(
                ERPPrototype.Data.WorkOrderBuskets.InProgress,
                seed.RowsPerYear,
                initialOpenRemainingAmountCents);
            await workOrdersPage.WaitForBasketDashboardEntryAsync(
                ERPPrototype.Data.WorkOrderBuskets.WorkOrderCompleted,
                0,
                0);
            await workOrdersPage.WaitForBasketDashboardRenderedEntryAsync(
                ERPPrototype.Data.WorkOrderBuskets.WorkOrderCompleted,
                expectedRendered: false);
            E2ETestAssert.Equal(
                1,
                await workOrdersPage.GetBasketDashboardCardCountAsync(),
                "A Basket remained visible after its final work order left it.");
            await workOrdersPage.WaitForDirtyRowCountAsync(0);

            checks.Pass(
                "Header summary shows open count and financial totals and excludes completed work orders");

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
                E2ETestAssert.Equal(
                    seed.RowsPerYear,
                    await workOrdersPage.GetAggregateRowCountAsync("open"),
                    "Search changed the fixed open-work-order count.");
                E2ETestAssert.Equal(
                    initialOpenWorkOrderValueCents,
                    await workOrdersPage.GetAggregateAmountCentsAsync(
                        "open",
                        "workOrderValue"),
                    "Search changed the fixed open Work Order Value total.");

                var filteredDashboard =
                    await workOrdersPage.GetBasketDashboardEntryAsync(
                        ERPPrototype.Data.WorkOrderBuskets.InProgress);

                E2ETestAssert.Equal(
                    seed.RowsPerYear,
                    filteredDashboard.RowCount,
                    "Search changed the fixed Basket dashboard count.");
                E2ETestAssert.Equal(
                    initialOpenRemainingAmountCents,
                    filteredDashboard.RemainingAmountCents,
                    "Search changed the fixed Basket dashboard Remaining Amount.");

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
                    "Search changes visible rows while the open-work-order header remains fixed");

                E2ETestAssert.Equal(
                    "workOrderValue:0:1|partialAmount:0:1|" +
                    "remainingAmount:0:1",
                    await workOrdersPage.GetHeaderControlSnapshotAsync(
                        "workOrderValue",
                        "partialAmount",
                        "remainingAmount"),
                    "Financial headers must expose sort controls without filter buttons.");

                checks.Pass(
                    "Financial columns show numeric sorting without filter icons");

                E2ETestAssert.Equal(
                    "workOrderNumber:1:0|workTypeCode:1:0|" +
                    "assignmentDate:1:0|basket:1:0",
                    await workOrdersPage.GetHeaderControlSnapshotAsync(
                        "workOrderNumber",
                        "workTypeCode",
                        "assignmentDate",
                        "basket"),
                    "Every fixed filterable column must expose a filter icon without a sort control.");

                var workTypeOptions =
                    await workOrdersPage.GetValueFilterOptionsAsync(
                        "workTypeCode");
                var basketOptions =
                    await workOrdersPage.GetValueFilterOptionsAsync(
                        "basket");

                E2ETestAssert.True(
                    workTypeOptions.SequenceEqual(
                        new[] { "401", "402", "801", "802" }),
                    "Work Type did not expose the current sheet values in numeric order.");
                E2ETestAssert.True(
                    basketOptions.SequenceEqual(
                        new[]
                        {
                            ERPPrototype.Data.WorkOrderBuskets.InProgress
                        }),
                    "Basket did not expose the current sheet value.");
                checks.Pass(
                    "All fixed filterable columns expose Excel-style filter controls");

                var workOrderNumberMetadata =
                    await workOrdersPage.GetValueFilterMetadataAsync(
                        "workOrderNumber");

                E2ETestAssert.Equal(
                    seed.RowsPerYear,
                    workOrderNumberMetadata.OptionCount,
                    "Work Order Number did not expose every current-year value.");
                E2ETestAssert.True(
                    workOrderNumberMetadata.Virtualized,
                    "The high-cardinality Work Order Number filter must virtualize its checkbox list.");
                E2ETestAssert.True(
                    (await workOrdersPage.SearchValueFilterOptionsAsync(
                        "workOrderNumber",
                        seed.CurrentYearLastWorkOrderNumber))
                    .SequenceEqual(
                        new[] { seed.CurrentYearLastWorkOrderNumber }),
                    "Work Order Number search did not find the exact last value.");

                checks.Pass(
                    "Work Order Number virtualizes its large value list and searches all values");

                await workOrdersPage.ApplyValueFilterAsync(
                    "workOrderNumber",
                    new[] { seed.CurrentYearMiddleWorkOrderNumber },
                    1);

                E2ETestAssert.True(
                    (await workOrdersPage.GetValueFilterOptionsAsync(
                        "workTypeCode"))
                    .SequenceEqual(
                        new[] { seed.CurrentYearMiddleWorkTypeCode }),
                    "Work Type options did not update from the active Work Order Number filter.");

                await workOrdersPage.ClearValueFilterAsync(
                    "workOrderNumber",
                    seed.RowsPerYear);

                var matchingTypeRows = seed.RowsPerYear / 4;

                await workOrdersPage.ApplyValueFilterAsync(
                    "workTypeCode",
                    new[] { seed.CurrentYearMiddleWorkTypeCode },
                    matchingTypeRows);

                var narrowedWorkOrderNumbers =
                    await workOrdersPage.GetValueFilterMetadataAsync(
                        "workOrderNumber");

                E2ETestAssert.Equal(
                    matchingTypeRows,
                    narrowedWorkOrderNumbers.OptionCount,
                    "Work Order Number options did not update from the active Work Type filter.");
                E2ETestAssert.Equal(
                    seed.RowsPerYear,
                    await workOrdersPage.GetAggregateRowCountAsync("open"),
                    "A value filter changed the fixed open-work-order count.");

                await workOrdersPage.ClearValueFilterAsync(
                    "workTypeCode",
                    seed.RowsPerYear);

                checks.Pass(
                    "Value-filter options update in both directions without changing fixed totals");

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
                    "Work Order Value sorts numerically ascending through its dedicated sort icon");

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

                checks.Pass(
                    "Descending Work Order Value sort moves complete rows and replaces the previous direction");

                var partialAmounts =
                    await workOrdersPage.GetActiveAmountCentsAsync(
                        "partialAmount");
                var maximumPartialAmount = partialAmounts.Max();

                await workOrdersPage.SortFinancialColumnAsync(
                    "partialAmount",
                    "desc");

                var descendingPartialAmounts =
                    await workOrdersPage.GetActiveAmountCentsAsync(
                        "partialAmount");
                var firstPartialRow =
                    await workOrdersPage.GetFirstActiveFinancialRowAsync(
                        "partialAmount");

                E2ETestAssert.True(
                    descendingPartialAmounts
                        .Zip(descendingPartialAmounts.Skip(1))
                        .All(pair => pair.First >= pair.Second),
                    "Partial Amount descending sort was not numeric.");
                E2ETestAssert.True(
                    firstPartialRow.EndsWith(
                        $"|{maximumPartialAmount}",
                        StringComparison.Ordinal),
                    "Partial Amount descending sort did not place the maximum paid amount first.");
                E2ETestAssert.Equal(
                    "1|partialAmount|desc",
                    await workOrdersPage.GetSorterSnapshotAsync(),
                    "Partial Amount did not replace the previous financial sorter.");

                checks.Pass(
                    "Partial Amount sorts numerically and keeps blank values outside the paid sequence");

                var remainingAmounts =
                    await workOrdersPage.GetActiveAmountCentsAsync(
                        "remainingAmount");
                var maximumRemainingAmount = remainingAmounts.Max();

                await workOrdersPage.SortFinancialColumnAsync(
                    "remainingAmount",
                    "desc");

                var descendingRemainingAmounts =
                    await workOrdersPage.GetActiveAmountCentsAsync(
                        "remainingAmount");
                var firstRemainingRow =
                    await workOrdersPage.GetFirstActiveFinancialRowAsync(
                        "remainingAmount");

                E2ETestAssert.True(
                    descendingRemainingAmounts
                        .Zip(descendingRemainingAmounts.Skip(1))
                        .All(pair => pair.First >= pair.Second),
                    "Remaining Amount descending sort was not numeric.");
                E2ETestAssert.True(
                    firstRemainingRow.EndsWith(
                        $"|{maximumRemainingAmount}",
                        StringComparison.Ordinal),
                    "Remaining Amount descending sort did not place the maximum remaining amount first.");
                E2ETestAssert.Equal(
                    "1|remainingAmount|desc",
                    await workOrdersPage.GetSorterSnapshotAsync(),
                    "Remaining Amount did not remain a single-column sort.");

                await workOrdersPage.ClearSortAsync();

                checks.Pass(
                    "Remaining Amount sorts numerically and the sheet returns to its natural order");

                var persistedAssignmentDate =
                    $"15/06/{seed.CurrentYear}";

                var editSaveReloadStartedAt = Stopwatch.GetTimestamp();

                await workOrdersPage.SetCellValueAsync(
                    seed.CurrentYearMiddleRowId,
                    "assignmentDate",
                    persistedAssignmentDate);

                await workOrdersPage.WaitForDirtyRowCountAsync(1);

                checks.Pass(
                    "Editing a middle-row cell marks exactly one row dirty");

                await workOrdersPage.SaveAndWaitAsync();
                await workOrdersPage.WaitForDirtyRowCountAsync(0);

                checks.Pass(
                    "Saving a cell edit succeeds on the 1,000-row sheet");

                await workOrdersPage.ReloadAndWaitAsync();
                await workOrdersPage.WaitForActiveRowCountAsync(
                    seed.RowsPerYear);

                E2ETestAssert.Equal(
                    persistedAssignmentDate,
                    await workOrdersPage.GetCellValueAsync(
                        seed.CurrentYearMiddleRowId,
                        "assignmentDate"),
                    "The saved browser edit did not survive a full page reload.");

                editSaveReloadMilliseconds =
                    Stopwatch.GetElapsedTime(editSaveReloadStartedAt)
                        .TotalMilliseconds;

                checks.Pass(
                    "Saved edit persists after reload and the sheet returns to 1,000 rows");

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
                        "open",
                        "workOrderValue");
                var aggregatePartialAmountBefore =
                    await workOrdersPage.GetAggregateAmountCentsAsync(
                        "open",
                        "partialAmount");
                var aggregateRemainingAmountBefore =
                    await workOrdersPage.GetAggregateAmountCentsAsync(
                        "open",
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

                const long editedWorkOrderValueCents = 125_000_057;
                const long editedPartialAmountCents = 25_000_026;
                const long editedRemainingAmountCents = 100_000_031;
                var oldRemainingAmountCents =
                    oldWorkOrderValueCents - oldPartialAmountCents;

                await workOrdersPage.WaitForAggregateAmountCentsAsync(
                    "open",
                    "workOrderValue",
                    aggregateWorkOrderValueBefore -
                    oldWorkOrderValueCents +
                    editedWorkOrderValueCents);
                await workOrdersPage.WaitForAggregateAmountCentsAsync(
                    "open",
                    "partialAmount",
                    aggregatePartialAmountBefore -
                    oldPartialAmountCents +
                    editedPartialAmountCents);
                await workOrdersPage.WaitForAggregateAmountCentsAsync(
                    "open",
                    "remainingAmount",
                    aggregateRemainingAmountBefore -
                    oldRemainingAmountCents +
                    editedRemainingAmountCents);

                checks.Pass(
                    "Open-work-order header updates before Save after edit and paste");

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
                    "open",
                    "partialAmount",
                    aggregatePartialAmountBefore -
                    oldPartialAmountCents);
                await workOrdersPage.WaitForAggregateAmountCentsAsync(
                    "open",
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
                    "open",
                    "partialAmount",
                    aggregatePartialAmountBefore -
                    oldPartialAmountCents +
                    editedPartialAmountCents);
                await workOrdersPage.WaitForAggregateAmountCentsAsync(
                    "open",
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
                    "Selecting 20 rows shows a visible status bar with unique work-order count and financial totals");

                var selectionLayout =
                    await workOrdersPage.GetSelectionSummaryLayoutAsync();

                E2ETestAssert.True(
                    selectionLayout.IsVisible,
                    "The selected totals footer was not visible.");
                E2ETestAssert.True(
                    selectionLayout.IsBelowGridCard,
                    "The selected totals footer still overlaps the grid card.");
                E2ETestAssert.True(
                    selectionLayout.IsWithinViewport,
                    "The selected totals footer fell outside the viewport.");
                E2ETestAssert.True(
                    selectionLayout.DoesNotCoverTableHolder,
                    "The selected totals footer still covers the last visible grid cells.");

                checks.Pass(
                    "Selected totals use a separate reserved footer below the sheet without covering cells");

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

                await workOrdersPage.SelectYearAndWaitForDatasetAsync(
                    seed.PreviousYear,
                    seed.RowsPerYear,
                    seed.PreviousYearLastWorkOrderNumber,
                    seed.CurrentYearFirstWorkOrderNumber);

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
            }

            if (suite == E2ETestSuite.Stress)
            {
                await workOrdersPage.SelectYearAndWaitForDatasetAsync(
                    seed.CurrentYear,
                    seed.RowsPerYear,
                    seed.CurrentYearFirstWorkOrderNumber,
                    seed.PreviousYearFirstWorkOrderNumber);

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
                        seed.RowsPerYear);

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
                    ComparablePerformanceBaseline: false,
                    MeasurementNote:
                        "Functional Stress runs with diagnostic tracing. Use the dedicated Performance suite for quantitative latency and fatigue measurements.",
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
                    "Functional stress timings are captured for diagnostics only");
            }

            if (suite is E2ETestSuite.Full or E2ETestSuite.Stress)
            {
                await workOrdersPage.SelectYearAndWaitForDatasetAsync(
                    seed.CurrentYear,
                    seed.RowsPerYear,
                    seed.CurrentYearFirstWorkOrderNumber,
                    seed.PreviousYearFirstWorkOrderNumber);

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

                var destinationDate =
                    $"01/01/{seed.PreviousYear}";

                await workOrdersPage.SetCellValueAsync(
                    seed.CurrentYearMiddleRowId,
                    "assignmentDate",
                    destinationDate);

                await workOrdersPage.WaitForDirtyRowCountAsync(1);
                checks.Pass(
                    "Changing Assignment Date to another year marks one row dirty");

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

                await workOrdersPage.SelectYearAndWaitForDatasetAsync(
                    seed.PreviousYear,
                    seed.RowsPerYear + 1,
                    seed.CurrentYearMiddleWorkOrderNumber,
                    seed.CurrentYearFirstWorkOrderNumber);

                E2ETestAssert.True(
                    await workOrdersPage.ContainsWorkOrderInDataAsync(
                        seed.CurrentYearMiddleWorkOrderNumber),
                    "The moved work order was not present in the destination year.");

                checks.Pass(
                    "The moved work order appears in the destination year with 1,001 rows");
            }

            browserSession.Diagnostics.AssertNoCriticalErrors();
            checks.Pass(
                "Journey completes without page errors or HTTP 5xx responses");

            E2ETestAssert.Equal(
                ExpectedCheckCount,
                checks.PassedCount,
                "The browser journey did not execute the expected number of checks.");

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
    bool ComparablePerformanceBaseline,
    string MeasurementNote,
    DateTime CapturedAtUtc);
