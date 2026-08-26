using System.IO.Compression;
using System.Text.Json;
using Microsoft.Playwright;

namespace ERPPrototype.E2ETests;

internal static class Gate5B5TraceRunner
{
    private const int FixedPort = 5265;
    private const string GatePath = "/work-orders-revogrid-gate5b5";
    private const string GridHostId = "revogrid-native-gate5a-grid";

    public static async Task<int> RunAsync()
    {
        var projectRoot = FindProjectRoot();
        var artifactDirectory = E2EArtifactManager.CreateRunDirectory(projectRoot);
        var timelinePath = Path.Combine(
            artifactDirectory,
            "gate5b5-real-browser-journey.json");
        var diagnosticsPath = Path.Combine(
            artifactDirectory,
            "gate5b5-real-browser-diagnostics.txt");
        var notesPath = Path.Combine(
            artifactDirectory,
            "gate5b5-real-browser-notes.txt");
        var steps = new List<JsonElement>();
        Exception? failure = null;

        Console.WriteLine("RevoGrid Gate 5B-5 real browser diagnostic journey");
        Console.WriteLine("The journey uses real browser assertions and returns a failing exit code on regression.");
        Console.WriteLine("The browser will perform real UI actions and preserve a full trace.");
        Console.WriteLine($"Application port: {FixedPort}");
        Console.WriteLine($"Artifacts: {artifactDirectory}");
        Console.WriteLine();

        try
        {
            await using var database = await E2ETestDatabase.CreateAsync(
                keepDatabase: false,
                rowsPerYear: E2ETestDatabase.DefaultRowsPerYear);

            await using var application = await WebApplicationProcess.StartAsync(
                projectRoot,
                database.ConnectionString,
                artifactDirectory,
                fixedPort: FixedPort,
                configuration: "Debug");

            Console.WriteLine($"Application: {application.BaseUri}");
            Console.WriteLine($"Database: {database.DatabaseName}");

            await using var browser = await E2EBrowserSession.CreateAsync(
                application.BaseUri,
                artifactDirectory,
                headed: true,
                traceEnabled: true,
                benchmarkMode: false,
                viewportWidth: 1440,
                viewportHeight: 1000,
                windowWidth: 1500,
                windowHeight: 1050,
                screenWidth: 1920,
                screenHeight: 1080);

            var page = browser.Page;

            try
            {
                var loginPage = new LoginPage(page, application.BaseUri);
            await loginPage.OpenAsync(GatePath);
            await loginPage.LoginAsync(database.Seed);
            await page.WaitForURLAsync(
                $"**{GatePath}*",
                new PageWaitForURLOptions { Timeout = 45_000 });

            await page.GetByTestId("revogrid-native-gate5a").WaitForAsync(
                new LocatorWaitForOptions
                {
                    State = WaitForSelectorState.Visible,
                    Timeout = 45_000
                });

            await page.Locator($"#{GridHostId} revo-grid").WaitForAsync(
                new LocatorWaitForOptions
                {
                    State = WaitForSelectorState.Visible,
                    Timeout = 45_000
                });

            await WaitForRenderedCellAsync(page, 0);
            await InstallEventRecorderAsync(page);
            page.Dialog += AcceptDialog;

            await CaptureStepAsync(page, steps, timelinePath, "01-baseline");
            var baselineCount = await GetSourceCountAsync(page);

            // Range Clear is an employee-facing cell-edit behavior, so it must
            // be proved through the real RevoGrid UI before structural tests.
            // The seeded rows 2..5 include non-blank Partial Amount values and
            // blank values, which also proves that one range operation can mix
            // effective changes with already-empty cells.
            var partialColumnIndex = await GetColumnIndexAsync(page, "partialAmount");
            var remainingColumnIndex = await GetColumnIndexAsync(page, "remainingAmount");
            var rangeClearBaseline = await CaptureRangeClearStateAsync(page, 2, 5);

            await SelectVisibleCellRangeAsync(
                page,
                startVisibleRowIndex: 2,
                startVisibleColumnIndex: partialColumnIndex,
                endVisibleRowIndex: 5,
                endVisibleColumnIndex: partialColumnIndex);
            await AssertSelectedRangeTargetsAsync(
                page,
                expectedFocusedProp: "partialAmount",
                expectedStartColumnIndex: partialColumnIndex,
                expectedEndColumnIndex: partialColumnIndex,
                expectedStartRowIndex: 2,
                expectedEndRowIndex: 5);
            await CaptureStepAsync(page, steps, timelinePath, "RC-01-partial-range-selected");

            await page.Keyboard.PressAsync("Delete");
            await PauseForTraceAsync(page, 700);
            await CaptureStepAsync(page, steps, timelinePath, "RC-02-after-delete");
            var afterRangeDelete = await CaptureRangeClearStateAsync(page, 2, 5);
            AssertRangeClearApplied(rangeClearBaseline, afterRangeDelete, "Delete");

            await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
            await PauseForTraceAsync(page, 500);
            await CaptureStepAsync(page, steps, timelinePath, "RC-03-after-delete-undo");
            AssertRangeClearRestored(
                rangeClearBaseline,
                await CaptureRangeClearStateAsync(page, 2, 5),
                "Undo after Delete");

            await page.Locator("#revogrid-gate5b1-redo").ClickAsync();
            await PauseForTraceAsync(page, 500);
            await CaptureStepAsync(page, steps, timelinePath, "RC-04-after-delete-redo");
            AssertRangeClearApplied(
                rangeClearBaseline,
                await CaptureRangeClearStateAsync(page, 2, 5),
                "Redo after Delete");

            // Return to the original sheet before the Backspace and mixed
            // readonly-selection checks so each command starts from the same
            // deterministic source values.
            await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
            await PauseForTraceAsync(page, 400);
            AssertRangeClearRestored(
                rangeClearBaseline,
                await CaptureRangeClearStateAsync(page, 2, 5),
                "Cleanup Undo before Backspace");

            await SelectVisibleCellRangeAsync(
                page,
                startVisibleRowIndex: 2,
                startVisibleColumnIndex: partialColumnIndex,
                endVisibleRowIndex: 5,
                endVisibleColumnIndex: partialColumnIndex);
            await AssertSelectedRangeTargetsAsync(
                page,
                expectedFocusedProp: "partialAmount",
                expectedStartColumnIndex: partialColumnIndex,
                expectedEndColumnIndex: partialColumnIndex,
                expectedStartRowIndex: 2,
                expectedEndRowIndex: 5);
            await page.Keyboard.PressAsync("Backspace");
            await PauseForTraceAsync(page, 700);
            await CaptureStepAsync(page, steps, timelinePath, "RC-05-after-backspace");
            AssertRangeClearApplied(
                rangeClearBaseline,
                await CaptureRangeClearStateAsync(page, 2, 5),
                "Backspace");

            await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
            await PauseForTraceAsync(page, 400);
            AssertRangeClearRestored(
                rangeClearBaseline,
                await CaptureRangeClearStateAsync(page, 2, 5),
                "Cleanup Undo before readonly range");

            // Mixed editable + readonly selection. Revo may select Remaining
            // Amount visually, but the readonly cells themselves must never be
            // cleared. They may only change through the financial derivation.
            await SelectVisibleCellRangeAsync(
                page,
                startVisibleRowIndex: 2,
                startVisibleColumnIndex: partialColumnIndex,
                endVisibleRowIndex: 5,
                endVisibleColumnIndex: remainingColumnIndex);
            await AssertSelectedRangeTargetsAsync(
                page,
                expectedFocusedProp: "partialAmount",
                expectedStartColumnIndex: partialColumnIndex,
                expectedEndColumnIndex: remainingColumnIndex,
                expectedStartRowIndex: 2,
                expectedEndRowIndex: 5);
            await page.Keyboard.PressAsync("Delete");
            await PauseForTraceAsync(page, 700);
            await CaptureStepAsync(page, steps, timelinePath, "RC-06-after-mixed-readonly-delete");
            var mixedRangeClear = await CaptureRangeClearStateAsync(page, 2, 5);
            AssertRangeClearApplied(rangeClearBaseline, mixedRangeClear, "Delete mixed readonly range");
            AssertRemainingAmountsAreNonBlank(mixedRangeClear);

            await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
            await PauseForTraceAsync(page, 400);
            AssertRangeClearRestored(
                rangeClearBaseline,
                await CaptureRangeClearStateAsync(page, 2, 5),
                "Final Range Clear cleanup Undo");

            // Real UI: Insert Rows... asks for an explicit count. All inserted
            // rows must be one Sheet History action.
            await OpenRowMenuAsync(page, visibleRowIndex: 2);
            await OpenInsertRowsDialogAsync(page);
            await SubmitInsertRowsDialogAsync(page, count: 3, position: "below");
            await WaitForSourceCountAsync(page, baselineCount + 3);
            await PauseForTraceAsync(page);
            await CaptureStepAsync(page, steps, timelinePath, "02-insert-3-rows-dialog");

            await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
            await WaitForSourceCountAsync(page, baselineCount);
            await PauseForTraceAsync(page);
            await CaptureStepAsync(page, steps, timelinePath, "03-undo-insert-3-one-step");

            await page.Locator("#revogrid-gate5b1-redo").ClickAsync();
            await WaitForSourceCountAsync(page, baselineCount + 3);
            await PauseForTraceAsync(page);
            await CaptureStepAsync(page, steps, timelinePath, "04-redo-insert-3-one-step");

            await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
            await WaitForSourceCountAsync(page, baselineCount);
            await PauseForTraceAsync(page);
            await CaptureStepAsync(page, steps, timelinePath, "05-clean-after-batch-insert-undo");

            // Select three real visible rows, then right-click inside that range
            // without left-clicking again. The context menu must preserve the
            // original multi-row range and delete all three in one action.
            await SelectVisibleRowRangeAsync(page, startVisibleRowIndex: 2, endVisibleRowIndex: 4);
            await OpenRowMenuOnCurrentSelectionAsync(page, visibleRowIndex: 3);
            await ClickVisibleRowMenuButtonAsync(page, "Delete Selected Rows");
            await WaitForSourceCountAsync(page, baselineCount - 3);
            await PauseForTraceAsync(page);
            await CaptureStepAsync(page, steps, timelinePath, "06-delete-3-selected-rows");

            await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
            await WaitForSourceCountAsync(page, baselineCount);
            await PauseForTraceAsync(page);
            await CaptureStepAsync(page, steps, timelinePath, "07-undo-delete-3-one-step");

            // Real UI: right-click a rendered cell and insert below it.
            await OpenRowMenuAsync(page, visibleRowIndex: 2);
            await ClickVisibleRowMenuButtonAsync(page, "Insert 1 Row Below");
            await WaitForSourceCountAsync(page, baselineCount + 1);
            await PauseForTraceAsync(page);
            await CaptureStepAsync(page, steps, timelinePath, "02-insert-below-normal");

            // Real UI History buttons. These avoid any ambiguity about keyboard focus
            // while still exercising the same Sheet History coordinator.
            await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
            await WaitForSourceCountAsync(page, baselineCount);
            await PauseForTraceAsync(page);
            await CaptureStepAsync(page, steps, timelinePath, "03-undo-insert-button");

            await page.Locator("#revogrid-gate5b1-redo").ClickAsync();
            await WaitForSourceCountAsync(page, baselineCount + 1);
            await PauseForTraceAsync(page);
            await CaptureStepAsync(page, steps, timelinePath, "04-redo-insert-button");

            // Delete the actual temporary row through the real context menu.
            var tempVisibleIndex = await FindFirstTemporaryVisibleIndexAsync(page);
            if (tempVisibleIndex < 0)
            {
                throw new InvalidOperationException(
                    "The inserted temporary row is not visible after Redo.");
            }

            await OpenRowMenuAsync(page, tempVisibleIndex);
            await ClickVisibleRowMenuButtonAsync(page, "Delete Selected Rows");
            await WaitForSourceCountAsync(page, baselineCount);
            await PauseForTraceAsync(page);
            await CaptureStepAsync(page, steps, timelinePath, "05-delete-temporary-row");

            // Keyboard shortcut path: give focus back to a real grid cell first.
            await ClickVisibleCellAsync(page, 0);
            await page.Keyboard.PressAsync("Control+Z");
            await WaitForSourceCountAsync(page, baselineCount + 1);
            await PauseForTraceAsync(page);
            await CaptureStepAsync(page, steps, timelinePath, "06-undo-delete-keyboard");

            await ClickVisibleCellAsync(page, 0);
            await page.Keyboard.PressAsync("Control+Z");
            await WaitForSourceCountAsync(page, baselineCount);
            await PauseForTraceAsync(page);
            await CaptureStepAsync(page, steps, timelinePath, "07-undo-insert-keyboard-clean");

            // Actual Excel-like filter UI: Work Type = 401.
            await ApplySingleWorkTypeFilterAsync(page, "401");
            await PauseForTraceAsync(page);
            await CaptureStepAsync(page, steps, timelinePath, "08-filter-worktype-401");

            // Delete one visible filtered row, then Undo it.
            var countBeforeFilteredDelete = await GetSourceCountAsync(page);
            await OpenRowMenuAsync(page, visibleRowIndex: 2);
            await ClickVisibleRowMenuButtonAsync(page, "Delete Selected Rows");
            await WaitForSourceCountAsync(page, countBeforeFilteredDelete - 1);
            await PauseForTraceAsync(page);
            await CaptureStepAsync(page, steps, timelinePath, "09-delete-visible-row-under-filter");

            await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
            await WaitForSourceCountAsync(page, countBeforeFilteredDelete);
            await PauseForTraceAsync(page);
            await CaptureStepAsync(page, steps, timelinePath, "10-undo-filtered-delete");

            // Insert under an active filter. Approved ERP behavior keeps the new
            // blank row visible until the employee explicitly applies the filter again.
            var visibleBeforeFilteredInsert = await GetVisibleCountAsync(page);
            await OpenRowMenuAsync(page, visibleRowIndex: 2);
            await ClickVisibleRowMenuButtonAsync(page, "Insert 1 Row Below");
            await WaitForSourceCountAsync(page, baselineCount + 1);
            await WaitForVisibleCountAsync(page, visibleBeforeFilteredInsert + 1);
            await PauseForTraceAsync(page);
            await CaptureStepAsync(page, steps, timelinePath, "11-insert-under-active-filter");

            // Re-open the same filter and press Apply without changing the selected
            // value. This must re-evaluate the current rows, so the blank inserted
            // row is no longer part of the Work Type = 401 result.
            await ReapplyCurrentWorkTypeFilterAsync(page);
            await WaitForVisibleCountAsync(page, visibleBeforeFilteredInsert);
            await PauseForTraceAsync(page);
            await CaptureStepAsync(page, steps, timelinePath, "12-reapply-same-filter-after-insert");

            // The refresh itself is a reversible sheet action. Undo must restore the
            // exact pre-Apply working snapshot (including the still-visible inserted
            // row) without undoing the Insert. Redo must re-apply the refreshed view.
            await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
            await WaitForVisibleCountAsync(page, visibleBeforeFilteredInsert + 1);
            await PauseForTraceAsync(page);
            await CaptureStepAsync(page, steps, timelinePath, "13-undo-filter-refresh-restores-working-snapshot");

            await page.Locator("#revogrid-gate5b1-redo").ClickAsync();
            await WaitForVisibleCountAsync(page, visibleBeforeFilteredInsert);
            await PauseForTraceAsync(page);
            await CaptureStepAsync(page, steps, timelinePath, "14-redo-filter-refresh");

            // Return to an unfiltered view using the real filter UI.
            await ClearWorkTypeFilterAsync(page);
            await PauseForTraceAsync(page);
            await CaptureStepAsync(page, steps, timelinePath, "15-clear-filter");

            // Remove the remaining temporary row so the Sort scenario starts from
            // the original source count. This uses the real row menu again.
            tempVisibleIndex = await FindFirstTemporaryVisibleIndexAsync(page);
            if (tempVisibleIndex >= 0)
            {
                await OpenRowMenuAsync(page, tempVisibleIndex);
                await ClickVisibleRowMenuButtonAsync(page, "Delete Selected Rows");
                await WaitForSourceCountAsync(page, baselineCount);
                await PauseForTraceAsync(page);
                await CaptureStepAsync(page, steps, timelinePath, "16-delete-temp-before-sort");
            }

            // Actual Sort UI + Insert. This captures whether the current snapshot
            // remains stable until the employee changes the sort again.
            await ClickSortButtonAsync(page, "workOrderValue");
            await PauseForTraceAsync(page);
            await CaptureStepAsync(page, steps, timelinePath, "17-sort-value-first-direction");

            await OpenRowMenuAsync(page, visibleRowIndex: 2);
            await ClickVisibleRowMenuButtonAsync(page, "Insert 1 Row Below");
            await WaitForSourceCountAsync(page, baselineCount + 1);
            await PauseForTraceAsync(page);
            await CaptureStepAsync(page, steps, timelinePath, "18-insert-under-active-sort");

            await ClickSortButtonAsync(page, "workOrderValue");
            await PauseForTraceAsync(page);
            await CaptureStepAsync(page, steps, timelinePath, "19-change-sort-with-new-row");

            // Delete a visible row while sorted, then Undo. This is the critical
            // identity-vs-visible-index path that Revo Pro/Community architecture
            // requires us to get right.
            var countBeforeSortedDelete = await GetSourceCountAsync(page);
            await OpenRowMenuAsync(page, visibleRowIndex: 2);
            await ClickVisibleRowMenuButtonAsync(page, "Delete Selected Rows");
            await WaitForSourceCountAsync(page, countBeforeSortedDelete - 1);
            await PauseForTraceAsync(page);
            await CaptureStepAsync(page, steps, timelinePath, "20-delete-visible-row-under-sort");

            await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
            await WaitForSourceCountAsync(page, countBeforeSortedDelete);
            await PauseForTraceAsync(page);
            await CaptureStepAsync(page, steps, timelinePath, "21-undo-sorted-delete");

            await browser.Diagnostics.WriteReportAsync(diagnosticsPath);
            await File.WriteAllTextAsync(
                notesPath,
                BuildNotes(steps));

            await browser.CaptureSuccessAsync(
                "gate5b5-real-browser-journey",
                preserveTrace: true);

            Console.WriteLine();
            Console.WriteLine("REAL BROWSER JOURNEY PASS");
            Console.WriteLine("All asserted Gate 5B-5 browser behaviors completed successfully.");
            Console.WriteLine($"Timeline: {timelinePath}");
            Console.WriteLine($"Browser diagnostics: {diagnosticsPath}");
                Console.WriteLine($"Notes: {notesPath}");
            }
            catch
            {
                await browser.CaptureFailureAsync(
                    "gate5b5-real-browser-journey");
                throw;
            }
        }
        catch (Exception exception)
        {
            failure = exception;
            Console.Error.WriteLine();
            Console.Error.WriteLine("Gate 5B-5 real browser journey stopped unexpectedly.");
            Console.Error.WriteLine(exception);

            try
            {
                await File.AppendAllTextAsync(
                    notesPath,
                    Environment.NewLine + Environment.NewLine +
                    "UNEXPECTED TEST-HARNESS STOP:" + Environment.NewLine +
                    exception + Environment.NewLine);
            }
            catch
            {
            }
        }

        var bundlePath = CreateBundle(artifactDirectory);
        Console.WriteLine();
        Console.WriteLine("READY TO UPLOAD:");
        Console.WriteLine(bundlePath);

        return failure is null ? 0 : 1;
    }

    private static async Task InstallEventRecorderAsync(IPage page)
    {
        await page.EvaluateAsync<bool>(
            """
            () => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                if (!grid) return false;

                const events = [];
                let sequence = 0;
                const names = [
                    'beforeedit', 'afteredit',
                    'beforepaste', 'afterpaste',
                    'clipboardrangepaste', 'beforerangeedit',
                    'beforefilterapply', 'beforefiltertrimmed', 'afterfilterapply',
                    'beforesorting', 'beforesortingapply', 'aftersortingapply',
                    'beforeheaderclick', 'headerclick',
                    'beforekeydown', 'viewportscroll',
                    'beforetrimmed', 'aftertrimmed',
                    'beforesourceset', 'aftersourceset'
                ];

                const scalar = value => {
                    if (value === null || value === undefined) return null;
                    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                        return value;
                    }
                    return null;
                };

                const range = value => value ? {
                    x: Number(value.x),
                    y: Number(value.y),
                    x1: Number(value.x1),
                    y1: Number(value.y1)
                } : null;

                const dataLookup = data => {
                    const result = {};
                    for (const [rowIndex, row] of Object.entries(data || {})) {
                        result[rowIndex] = {};
                        for (const [prop, cellValue] of Object.entries(row || {})) {
                            result[rowIndex][prop] = scalar(cellValue);
                        }
                    }
                    return result;
                };

                const summarize = (name, detail) => {
                    const summary = {
                        prop: scalar(detail?.prop ?? detail?.column?.prop),
                        type: scalar(detail?.type),
                        order: scalar(detail?.order),
                        trimmedType: scalar(detail?.trimmedType),
                        key: scalar(detail?.original?.key ?? detail?.originalEvent?.key),
                        code: scalar(detail?.original?.code ?? detail?.originalEvent?.code),
                        clientKey: scalar(detail?.model?.clientKey),
                        rowIndex: scalar(detail?.rowIndex),
                        value: scalar(detail?.val ?? detail?.value)
                    };

                    if (
                        name === 'beforerangeedit' ||
                        name === 'afteredit' ||
                        name === 'clipboardrangepaste'
                    ) {
                        summary.oldRange = range(detail?.oldRange ?? detail?.range);
                        summary.newRange = range(detail?.newRange ?? detail?.range);
                        summary.data = dataLookup(detail?.data);
                        summary.models = {};
                        for (const rowIndex of Object.keys(detail?.data || {})) {
                            const model = detail?.models?.[rowIndex];
                            if (!model) continue;
                            summary.models[rowIndex] = {
                                clientKey: scalar(model.clientKey),
                                workOrderNumber: scalar(model.workOrderNumber),
                                workOrderValue: scalar(model.workOrderValue),
                                partialAmount: scalar(model.partialAmount),
                                remainingAmount: scalar(model.remainingAmount)
                            };
                        }
                    }

                    return summary;
                };

                for (const name of names) {
                    grid.addEventListener(name, event => {
                        const recorded = {
                            sequence: ++sequence,
                            at: performance.now(),
                            name,
                            defaultPreventedAtListener: Boolean(event.defaultPrevented),
                            defaultPreventedAfterDispatch: null,
                            detail: summarize(name, event.detail)
                        };
                        events.push(recorded);
                        queueMicrotask(() => {
                            recorded.defaultPreventedAfterDispatch = Boolean(event.defaultPrevented);
                        });
                        if (events.length > 5000) events.shift();
                    });
                }

                window.__erpGate5B5TraceEvents = events;
                return true;
            }
            """);
    }

    private static async Task CaptureStepAsync(
        IPage page,
        List<JsonElement> steps,
        string timelinePath,
        string label)
    {
        var json = await page.EvaluateAsync<string>(
            """
            async label => {
                const hostId = 'revogrid-native-gate5a-grid';
                const host = document.getElementById(hostId);
                const grid = host?.querySelector('revo-grid');
                if (!grid) throw new Error('Gate 5B-5 RevoGrid element was not found.');

                const source = await grid.getSource('rgRow');
                const visible = await grid.getVisibleSource('rgRow');
                const store = await grid.getSourceStore('rgRow');
                const focused = await grid.getFocused();
                const selectedRange = await grid.getSelectedRange();
                const runtimeModules = performance.getEntriesByType('resource')
                    .map(entry => entry.name)
                    .filter(name =>
                        name.includes('/js/revoGridGate5B1.js') ||
                        name.includes('/js/revoGridChangeBridge.js'));
                const gateModuleUrl = [...runtimeModules]
                    .reverse()
                    .find(name => name.includes('/js/revoGridGate5B1.js')) ?? null;

                let diagnostics = null;
                let diagnosticsError = null;
                if (gateModuleUrl) {
                    try {
                        const module = await import(gateModuleUrl);
                        diagnostics = await module.getDiagnostics(hostId);
                    } catch (error) {
                        diagnosticsError = String(error?.stack || error?.message || error);
                    }
                } else {
                    diagnosticsError = 'The browser resource list did not contain the loaded revoGridGate5B1 module URL.';
                }

                const row = item => ({
                    clientKey: item?.clientKey ?? null,
                    id: item?.id ?? null,
                    displayOrder: item?.displayOrder ?? null,
                    workOrderNumber: item?.workOrderNumber ?? null,
                    workTypeCode: item?.workTypeCode ?? null,
                    assignmentDate: item?.assignmentDate ?? null,
                    workOrderValue: item?.workOrderValue ?? null,
                    partialAmount: item?.partialAmount ?? null,
                    remainingAmount: item?.remainingAmount ?? null,
                    basket: item?.basket ?? null
                });

                const clientKeys = source.map(item => String(item?.clientKey ?? ''));
                const seen = new Set();
                const duplicateClientKeys = [];
                for (const key of clientKeys) {
                    if (!key) continue;
                    if (seen.has(key)) duplicateClientKeys.push(key);
                    seen.add(key);
                }

                const orderSeen = new Set();
                const duplicateDisplayOrders = [];
                for (const item of source) {
                    const order = Number(item?.displayOrder);
                    if (!Number.isFinite(order)) continue;
                    if (orderSeen.has(order)) duplicateDisplayOrders.push(order);
                    orderSeen.add(order);
                }

                const filterButtons = [...document.querySelectorAll('.erp-revo-excel-filter-button')]
                    .map(button => ({
                        prop: button.getAttribute('data-erp-filter-prop'),
                        active: button.getAttribute('aria-pressed') === 'true'
                    }));
                const sortButtons = [...document.querySelectorAll('.erp-revo-sort-button')]
                    .map(button => ({
                        prop: button.getAttribute('data-erp-sort-prop'),
                        active: button.getAttribute('aria-pressed') === 'true',
                        label: button.getAttribute('aria-label')
                    }));

                return JSON.stringify({
                    label,
                    capturedAt: new Date().toISOString(),
                    pageUrl: location.href,
                    ui: {
                        rowCountText: document.getElementById('revogrid-gate5b-row-count')?.textContent ?? null,
                        dirtyText: document.getElementById('revogrid-gate5b1-change-status')?.textContent ?? null,
                        undoText: document.getElementById('revogrid-gate5b1-undo-count')?.textContent ?? null,
                        redoText: document.getElementById('revogrid-gate5b1-redo-count')?.textContent ?? null,
                        rowMenuOpen: Boolean(document.querySelector('.erp-revo-row-menu:not([hidden])')),
                        insertRowsDialogOpen: Boolean(document.querySelector('.erp-revo-insert-rows-dialog:not([hidden])')),
                        filterPopupOpen: Boolean(document.querySelector('.erp-revo-excel-filter')),
                        filterButtons,
                        sortButtons
                    },
                    counts: {
                        source: source.length,
                        visible: visible.length,
                        proxyItems: store.get('proxyItems')?.length ?? null,
                        items: store.get('items')?.length ?? null,
                        temporaryRows: source.filter(item => String(item?.clientKey ?? '').startsWith('temp:')).length
                    },
                    integrity: {
                        missingClientKeys: clientKeys.filter(key => !key).length,
                        duplicateClientKeys,
                        duplicateDisplayOrders
                    },
                    focused,
                    selectedRange,
                    proxyItems: [...(store.get('proxyItems') ?? [])],
                    items: [...(store.get('items') ?? [])],
                    trimmed: store.get('trimmed') ?? {},
                    source: source.map(row),
                    visible: visible.map(row),
                    runtimeModules,
                    gateModuleUrl,
                    diagnosticsError,
                    diagnostics,
                    revoEvents: [...(window.__erpGate5B5TraceEvents ?? [])]
                });
            }
            """,
            label);

        using var document = JsonDocument.Parse(json);
        var snapshot = document.RootElement.Clone();
        steps.Add(snapshot);

        await File.WriteAllTextAsync(
            timelinePath,
            JsonSerializer.Serialize(
                steps,
                new JsonSerializerOptions { WriteIndented = true }));

        var counts = snapshot.GetProperty("counts");
        var ui = snapshot.GetProperty("ui");
        Console.WriteLine(
            $"[{label}] source={counts.GetProperty("source").GetInt32():N0}, " +
            $"visible={counts.GetProperty("visible").GetInt32():N0}, " +
            $"temp={counts.GetProperty("temporaryRows").GetInt32():N0}, " +
            $"dirty={ui.GetProperty("dirtyText").GetString()}, " +
            $"undo={ui.GetProperty("undoText").GetString()}, " +
            $"redo={ui.GetProperty("redoText").GetString()}");
    }

    private static async Task<int> GetSourceCountAsync(IPage page)
    {
        return await page.EvaluateAsync<int>(
            """
            async () => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                return (await grid.getSource('rgRow')).length;
            }
            """);
    }

    private static async Task<int> GetVisibleCountAsync(IPage page)
    {
        return await page.EvaluateAsync<int>(
            """
            async () => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                return (await grid.getVisibleSource('rgRow')).length;
            }
            """);
    }

    private static async Task<int> FindFirstTemporaryVisibleIndexAsync(IPage page)
    {
        return await page.EvaluateAsync<int>(
            """
            async () => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const visible = await grid.getVisibleSource('rgRow');
                return visible.findIndex(row => String(row?.clientKey ?? '').startsWith('temp:'));
            }
            """);
    }

    private static async Task WaitForSourceCountAsync(IPage page, int expected)
    {
        await page.WaitForFunctionAsync(
            """
            async expected => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                if (!grid) return false;
                return (await grid.getSource('rgRow')).length === expected;
            }
            """,
            expected,
            new PageWaitForFunctionOptions { Timeout = 15_000 });
    }

    private static async Task WaitForVisibleCountAsync(IPage page, int expected)
    {
        await page.WaitForFunctionAsync(
            """
            async expected => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                if (!grid) return false;
                return (await grid.getVisibleSource('rgRow')).length === expected;
            }
            """,
            expected,
            new PageWaitForFunctionOptions { Timeout = 15_000 });
    }

    private static async Task WaitForRenderedCellAsync(IPage page, int visibleRowIndex)
    {
        await DataCell(page, visibleRowIndex).WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = 30_000
            });
    }

    private static ILocator DataCell(IPage page, int visibleRowIndex)
    {
        return DataCell(page, visibleRowIndex, 0);
    }

    private static ILocator DataCell(
        IPage page,
        int visibleRowIndex,
        int visibleColumnIndex)
    {
        return page.Locator(
            $"#{GridHostId} revogr-viewport-scroll.rgCol:not([row-header]) " +
            $"[data-rgRow=\"{visibleRowIndex}\"][data-rgCol=\"{visibleColumnIndex}\"]");
    }

    private static async Task ClickVisibleCellAsync(IPage page, int visibleRowIndex)
    {
        await WaitForRenderedCellAsync(page, visibleRowIndex);
        await DataCell(page, visibleRowIndex).ClickAsync();
        await PauseForTraceAsync(page, 150);
    }

    private static async Task<int> GetColumnIndexAsync(IPage page, string prop)
    {
        var index = await page.EvaluateAsync<int>(
            """
            prop => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const columns = Array.isArray(grid?.columns) ? grid.columns : [];
                const logicalIndex = columns.findIndex(
                    column => String(column?.prop ?? '') === prop);
                if (logicalIndex < 0) {
                    return -1;
                }

                // RevoGrid keeps grid.columns in logical source order, while
                // data-rgCol in the rendered rgCol viewport follows the visual
                // order. In RTL those orders are reversed. Browser tests must
                // address what the employee can actually click, not assume the
                // logical index is also the rendered coordinate.
                return grid?.rtl
                    ? columns.length - 1 - logicalIndex
                    : logicalIndex;
            }
            """,
            prop);

        if (index < 0)
        {
            throw new InvalidOperationException(
                $"RevoGrid column '{prop}' was not found in the real browser runtime.");
        }

        return index;
    }

    private static async Task AssertSelectedRangeTargetsAsync(
        IPage page,
        string expectedFocusedProp,
        int expectedStartColumnIndex,
        int expectedEndColumnIndex,
        int expectedStartRowIndex,
        int expectedEndRowIndex)
    {
        var json = await page.EvaluateAsync<string>(
            """
            async () => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                if (!grid) {
                    return JSON.stringify({ error: 'grid-not-found' });
                }

                const focused = await grid.getFocused?.();
                const selectedRange = await grid.getSelectedRange?.();
                return JSON.stringify({
                    focusedProp: String(focused?.column?.prop ?? ''),
                    focusedCell: focused?.cell ?? null,
                    selectedRange: selectedRange ?? null
                });
            }
            """);

        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        E2ETestAssert.True(
            !root.TryGetProperty("error", out _),
            $"Range selection safety check failed before editing: {json}");

        var focusedProp = root.GetProperty("focusedProp").GetString() ?? string.Empty;
        E2ETestAssert.True(
            string.Equals(focusedProp, expectedFocusedProp, StringComparison.Ordinal),
            $"Range selection targeted '{focusedProp}' instead of '{expectedFocusedProp}'. " +
            "The browser harness will not press Delete on the wrong RevoGrid column.");

        var range = root.GetProperty("selectedRange");
        var expectedMinColumn = Math.Min(expectedStartColumnIndex, expectedEndColumnIndex);
        var expectedMaxColumn = Math.Max(expectedStartColumnIndex, expectedEndColumnIndex);
        E2ETestAssert.True(
            range.ValueKind == JsonValueKind.Object &&
            range.GetProperty("x").GetInt32() == expectedMinColumn &&
            range.GetProperty("x1").GetInt32() == expectedMaxColumn &&
            range.GetProperty("y").GetInt32() == expectedStartRowIndex &&
            range.GetProperty("y1").GetInt32() == expectedEndRowIndex,
            $"Range selection coordinates did not match the intended target. Actual: {json}");
    }

    private static async Task SelectVisibleCellRangeAsync(
        IPage page,
        int startVisibleRowIndex,
        int startVisibleColumnIndex,
        int endVisibleRowIndex,
        int endVisibleColumnIndex)
    {
        var startCell = DataCell(
            page,
            startVisibleRowIndex,
            startVisibleColumnIndex);
        var endCell = DataCell(
            page,
            endVisibleRowIndex,
            endVisibleColumnIndex);

        await startCell.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = 30_000
            });
        await endCell.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = 30_000
            });

        await startCell.ClickAsync();
        await PauseForTraceAsync(page, 150);

        await page.Keyboard.DownAsync("Shift");
        try
        {
            await endCell.ClickAsync();
        }
        finally
        {
            await page.Keyboard.UpAsync("Shift");
        }

        await PauseForTraceAsync(page, 250);
    }

    private static async Task<JsonElement> CaptureRangeClearStateAsync(
        IPage page,
        int startRowIndex,
        int endRowIndex)
    {
        var json = await page.EvaluateAsync<string>(
            """
            async ({ startRowIndex, endRowIndex }) => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                if (!grid) throw new Error('Gate 5B-5 RevoGrid element was not found.');
                const source = await grid.getSource('rgRow');
                const rows = [];
                for (let rowIndex = startRowIndex; rowIndex <= endRowIndex; rowIndex++) {
                    const row = source[rowIndex];
                    rows.push({
                        rowIndex,
                        clientKey: row?.clientKey ?? null,
                        workOrderNumber: row?.workOrderNumber ?? null,
                        workOrderValue: row?.workOrderValue ?? null,
                        partialAmount: row?.partialAmount ?? null,
                        remainingAmount: row?.remainingAmount ?? null
                    });
                }

                return JSON.stringify({
                    sourceCount: source.length,
                    selectedRange: await grid.getSelectedRange(),
                    dirtyText: document.getElementById('revogrid-gate5b1-change-status')?.textContent ?? null,
                    undoCount: Number(document.getElementById('revogrid-gate5b1-undo-count')?.textContent ?? 0),
                    redoCount: Number(document.getElementById('revogrid-gate5b1-redo-count')?.textContent ?? 0),
                    rows
                });
            }
            """,
            new
            {
                startRowIndex,
                endRowIndex
            });

        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }

    private static void AssertRangeClearApplied(
        JsonElement baseline,
        JsonElement actual,
        string action)
    {
        E2ETestAssert.True(
            baseline.GetProperty("sourceCount").GetInt32() ==
                actual.GetProperty("sourceCount").GetInt32(),
            $"{action} Range Clear changed the row count.");

        var beforeRows = baseline.GetProperty("rows").EnumerateArray().ToArray();
        var afterRows = actual.GetProperty("rows").EnumerateArray().ToArray();
        E2ETestAssert.True(
            beforeRows.Length == afterRows.Length,
            $"{action} Range Clear changed the selected row set.");

        var effectiveChanges = 0;
        for (var index = 0; index < beforeRows.Length; index++)
        {
            var beforePartial = beforeRows[index].GetProperty("partialAmount");
            var afterPartial = afterRows[index].GetProperty("partialAmount");
            if (!IsBlankJsonValue(beforePartial))
            {
                effectiveChanges++;
            }

            E2ETestAssert.True(
                IsBlankJsonValue(afterPartial),
                $"{action} did not clear Partial Amount for row " +
                $"{afterRows[index].GetProperty("workOrderNumber").GetString()}. " +
                $"Actual: {afterPartial.GetRawText()}");

            var workOrderValue = JsonNumber(afterRows[index].GetProperty("workOrderValue"));
            var remainingAmount = JsonNumber(afterRows[index].GetProperty("remainingAmount"));
            E2ETestAssert.True(
                workOrderValue.HasValue &&
                remainingAmount.HasValue &&
                Math.Abs(workOrderValue.Value - remainingAmount.Value) < 0.005m,
                $"{action} did not recalculate Remaining Amount for row " +
                $"{afterRows[index].GetProperty("workOrderNumber").GetString()}.");
        }

        E2ETestAssert.True(
            effectiveChanges > 0,
            $"{action} Range Clear test did not include any originally non-blank Partial Amount value.");
        E2ETestAssert.True(
            actual.GetProperty("undoCount").GetInt32() == 1,
            $"{action} Range Clear was not recorded as exactly one Sheet History operation. " +
            $"Undo count: {actual.GetProperty("undoCount").GetInt32()}.");
    }

    private static void AssertRangeClearRestored(
        JsonElement baseline,
        JsonElement actual,
        string action)
    {
        E2ETestAssert.True(
            baseline.GetProperty("sourceCount").GetInt32() ==
                actual.GetProperty("sourceCount").GetInt32(),
            $"{action} changed the row count.");

        var beforeRows = baseline.GetProperty("rows").EnumerateArray().ToArray();
        var afterRows = actual.GetProperty("rows").EnumerateArray().ToArray();
        E2ETestAssert.True(
            beforeRows.Length == afterRows.Length,
            $"{action} changed the selected row set.");

        for (var index = 0; index < beforeRows.Length; index++)
        {
            E2ETestAssert.True(
                JsonValuesEquivalent(
                    beforeRows[index].GetProperty("partialAmount"),
                    afterRows[index].GetProperty("partialAmount")),
                $"{action} did not restore Partial Amount for row " +
                $"{afterRows[index].GetProperty("workOrderNumber").GetString()}.");
            E2ETestAssert.True(
                JsonValuesEquivalent(
                    beforeRows[index].GetProperty("remainingAmount"),
                    afterRows[index].GetProperty("remainingAmount")),
                $"{action} did not restore Remaining Amount for row " +
                $"{afterRows[index].GetProperty("workOrderNumber").GetString()}.");
        }
    }

    private static void AssertRemainingAmountsAreNonBlank(JsonElement actual)
    {
        foreach (var row in actual.GetProperty("rows").EnumerateArray())
        {
            E2ETestAssert.True(
                !IsBlankJsonValue(row.GetProperty("remainingAmount")),
                "Readonly Remaining Amount became blank during a mixed Range Clear selection.");
        }
    }

    private static bool IsBlankJsonValue(JsonElement value)
    {
        return value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined ||
            (value.ValueKind == JsonValueKind.String &&
             string.IsNullOrEmpty(value.GetString()));
    }

    private static decimal? JsonNumber(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.Number &&
            value.TryGetDecimal(out var number))
        {
            return number;
        }

        if (value.ValueKind == JsonValueKind.String &&
            decimal.TryParse(
                value.GetString(),
                System.Globalization.NumberStyles.Number,
                System.Globalization.CultureInfo.InvariantCulture,
                out number))
        {
            return number;
        }

        return null;
    }

    private static bool JsonValuesEquivalent(JsonElement left, JsonElement right)
    {
        if (IsBlankJsonValue(left) && IsBlankJsonValue(right))
        {
            return true;
        }

        var leftNumber = JsonNumber(left);
        var rightNumber = JsonNumber(right);
        if (leftNumber.HasValue && rightNumber.HasValue)
        {
            return Math.Abs(leftNumber.Value - rightNumber.Value) < 0.005m;
        }

        return string.Equals(
            left.ToString(),
            right.ToString(),
            StringComparison.Ordinal);
    }

    private static async Task OpenRowMenuAsync(IPage page, int visibleRowIndex)
    {
        await ClickVisibleCellAsync(page, visibleRowIndex);
        await DataCell(page, visibleRowIndex).ClickAsync(
            new LocatorClickOptions { Button = MouseButton.Right });

        await page.Locator(".erp-revo-row-menu:not([hidden])").WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = 10_000
            });
    }

    private static async Task ClickVisibleRowMenuButtonAsync(IPage page, string text)
    {
        var menu = page.Locator(".erp-revo-row-menu:not([hidden])");
        await menu.Locator($"button:has-text(\"{text}\")").ClickAsync();
    }

    private static async Task SelectVisibleRowRangeAsync(
        IPage page,
        int startVisibleRowIndex,
        int endVisibleRowIndex)
    {
        await ClickVisibleCellAsync(page, startVisibleRowIndex);
        await WaitForRenderedCellAsync(page, endVisibleRowIndex);

        await page.Keyboard.DownAsync("Shift");
        try
        {
            await DataCell(page, endVisibleRowIndex).ClickAsync();
        }
        finally
        {
            await page.Keyboard.UpAsync("Shift");
        }

        await PauseForTraceAsync(page, 200);
    }

    private static async Task OpenRowMenuOnCurrentSelectionAsync(
        IPage page,
        int visibleRowIndex)
    {
        await WaitForRenderedCellAsync(page, visibleRowIndex);
        await DataCell(page, visibleRowIndex).ClickAsync(
            new LocatorClickOptions { Button = MouseButton.Right });

        await page.Locator(".erp-revo-row-menu:not([hidden])").WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = 10_000
            });
    }

    private static async Task OpenInsertRowsDialogAsync(IPage page)
    {
        await ClickVisibleRowMenuButtonAsync(page, "Insert Rows...");
        await page.Locator(".erp-revo-insert-rows-dialog:not([hidden])").WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = 10_000
            });
    }

    private static async Task SubmitInsertRowsDialogAsync(
        IPage page,
        int count,
        string position)
    {
        var dialog = page.Locator(".erp-revo-insert-rows-dialog:not([hidden])");
        var input = dialog.Locator("input[type=\"number\"]");
        await input.FillAsync(count.ToString());

        var buttonText = string.Equals(position, "above", StringComparison.OrdinalIgnoreCase)
            ? "Insert Above"
            : "Insert Below";
        await dialog.Locator($"button:has-text(\"{buttonText}\")").ClickAsync();

        await dialog.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Hidden,
                Timeout = 10_000
            });
    }

    private static async Task ApplySingleWorkTypeFilterAsync(IPage page, string value)
    {
        await page.Locator(
            ".erp-revo-excel-filter-button[data-erp-filter-prop=\"workTypeCode\"]")
            .ClickAsync();

        var popup = page.Locator(".erp-revo-excel-filter");
        await popup.WaitForAsync(
            new LocatorWaitForOptions { State = WaitForSelectorState.Visible });

        var selectAll = popup.Locator(
            ".erp-revo-excel-filter__select-all input[type=\"checkbox\"]");
        if (await selectAll.IsCheckedAsync())
        {
            await selectAll.ClickAsync();
        }

        var wanted = popup.Locator(
            $".erp-revo-excel-filter__body label:has-text(\"{value}\") input[type=\"checkbox\"]")
            .First;
        await wanted.ClickAsync();

        await popup.Locator(
            ".erp-revo-excel-filter__actions button[data-primary=\"true\"]")
            .ClickAsync();

        await popup.WaitForAsync(
            new LocatorWaitForOptions { State = WaitForSelectorState.Detached });
    }

    private static async Task ReapplyCurrentWorkTypeFilterAsync(IPage page)
    {
        await page.Locator(
            ".erp-revo-excel-filter-button[data-erp-filter-prop=\"workTypeCode\"]")
            .ClickAsync();

        var popup = page.Locator(".erp-revo-excel-filter");
        await popup.WaitForAsync(
            new LocatorWaitForOptions { State = WaitForSelectorState.Visible });
        await popup.Locator(
            ".erp-revo-excel-filter__actions button[data-primary=\"true\"]")
            .ClickAsync();
        await popup.WaitForAsync(
            new LocatorWaitForOptions { State = WaitForSelectorState.Detached });
    }

    private static async Task ClearWorkTypeFilterAsync(IPage page)
    {
        await page.Locator(
            ".erp-revo-excel-filter-button[data-erp-filter-prop=\"workTypeCode\"]")
            .ClickAsync();

        var popup = page.Locator(".erp-revo-excel-filter");
        await popup.WaitForAsync(
            new LocatorWaitForOptions { State = WaitForSelectorState.Visible });
        await popup.Locator(
            ".erp-revo-excel-filter__actions button:has-text(\"Clear Filter\")")
            .ClickAsync();
        await popup.WaitForAsync(
            new LocatorWaitForOptions { State = WaitForSelectorState.Detached });
    }

    private static async Task ClickSortButtonAsync(IPage page, string field)
    {
        var button = page.Locator(
            $".erp-revo-sort-button[data-erp-sort-prop=\"{field}\"]");
        await button.ScrollIntoViewIfNeededAsync();
        await button.ClickAsync();
        await PauseForTraceAsync(page, 300);
    }

    private static async Task PauseForTraceAsync(IPage page, int milliseconds = 500)
    {
        await page.WaitForTimeoutAsync(milliseconds);
    }

    private static async void AcceptDialog(object? sender, IDialog dialog)
    {
        try
        {
            await dialog.AcceptAsync();
        }
        catch
        {
        }
    }

    private static string BuildNotes(IReadOnlyList<JsonElement> steps)
    {
        var lines = new List<string>
        {
            "Gate 5B-5 real browser diagnostic journey",
            "",
            "PASS means every asserted browser behavior completed; any assertion or runtime failure returns exit code 1.",
            "Each recorded step was performed against the real Gate 5B-5 page through browser UI.",
            "",
            "Important review target:",
            "- RC-01..RC-06 execute real multi-cell Delete/Backspace, one-step Undo/Redo, financial Remaining synchronization, and a mixed readonly selection before row-structure checks.",
            "- The trace records beforerangeedit/afteredit payloads and whether the range event was prevented, so a failed Range Clear shows where the browser path stopped.",
            "- Step 02 uses the real Insert Rows... dialog to add 3 rows in one command.",
            "- Step 03 Undo removes all 3 rows in one History action; Step 04 Redo restores all 3.",
            "- Step 06 right-clicks inside a 3-row selection and Delete must remove all 3 selected rows.",
            "- Step 07 Undo restores all 3 deleted rows in one History action.",
            "- Later filtered Insert keeps a blank row visible until the employee reapplies the filter.",
            "- Step 12 presses Apply again without changing the filter selection; the blank row must disappear.",
            "- Step 13 Undo restores the exact pre-Apply working snapshot without undoing the Insert.",
            "- Step 14 Redo hides the non-matching inserted row again.",
            "",
            "Recorded steps:"
        };

        foreach (var step in steps)
        {
            var label = step.GetProperty("label").GetString();
            var counts = step.GetProperty("counts");
            var ui = step.GetProperty("ui");
            lines.Add(
                $"- {label}: source={counts.GetProperty("source").GetInt32()}, " +
                $"visible={counts.GetProperty("visible").GetInt32()}, " +
                $"temp={counts.GetProperty("temporaryRows").GetInt32()}, " +
                $"dirty={ui.GetProperty("dirtyText").GetString()}, " +
                $"undo={ui.GetProperty("undoText").GetString()}, " +
                $"redo={ui.GetProperty("redoText").GetString()}");
        }

        return string.Join(Environment.NewLine, lines);
    }

    private static string CreateBundle(string artifactDirectory)
    {
        var desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        var bundlePath = Path.Combine(
            desktop,
            $"ERP_REVO_GATE5B5_TRACE_{DateTime.Now:yyyyMMdd-HHmmss}.zip");

        if (File.Exists(bundlePath))
        {
            File.Delete(bundlePath);
        }

        ZipFile.CreateFromDirectory(
            artifactDirectory,
            bundlePath,
            CompressionLevel.Optimal,
            includeBaseDirectory: false);

        return bundlePath;
    }

    private static string FindProjectRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);

        while (directory is not null)
        {
            var candidate = Path.Combine(
                directory.FullName,
                "ERPPrototype.csproj");

            if (File.Exists(candidate))
            {
                return directory.FullName;
            }

            directory = directory.Parent;
        }

        throw new DirectoryNotFoundException(
            "Could not locate ERPPrototype.csproj from the E2E runner output directory.");
    }
}
