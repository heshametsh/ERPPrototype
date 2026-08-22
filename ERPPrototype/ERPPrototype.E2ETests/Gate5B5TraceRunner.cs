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
        Console.WriteLine("This is not a PASS/FAIL state lab.");
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
            Console.WriteLine("REAL BROWSER JOURNEY COMPLETE");
            Console.WriteLine("No PASS/FAIL verdict was assigned to the row behavior.");
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
                const names = [
                    'beforeedit', 'afteredit',
                    'beforepaste', 'afterpaste',
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

                const summarize = detail => ({
                    prop: scalar(detail?.prop ?? detail?.column?.prop),
                    type: scalar(detail?.type),
                    order: scalar(detail?.order),
                    trimmedType: scalar(detail?.trimmedType),
                    key: scalar(detail?.original?.key ?? detail?.originalEvent?.key),
                    code: scalar(detail?.original?.code ?? detail?.originalEvent?.code),
                    clientKey: scalar(detail?.model?.clientKey),
                    rowIndex: scalar(detail?.rowIndex),
                    value: scalar(detail?.val ?? detail?.value)
                });

                for (const name of names) {
                    grid.addEventListener(name, event => {
                        events.push({
                            at: performance.now(),
                            name,
                            defaultPrevented: Boolean(event.defaultPrevented),
                            detail: summarize(event.detail)
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
                const module = await import('/js/revoGridGate5B1.js?v=20260822-gate5b5-multirow-1');
                const diagnostics = await module.getDiagnostics(hostId);

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
        return page.Locator(
            $"#{GridHostId} revogr-viewport-scroll.rgCol:not([row-header]) " +
            $"[data-rgRow=\"{visibleRowIndex}\"][data-rgCol=\"0\"]");
    }

    private static async Task ClickVisibleCellAsync(IPage page, int visibleRowIndex)
    {
        await WaitForRenderedCellAsync(page, visibleRowIndex);
        await DataCell(page, visibleRowIndex).ClickAsync();
        await PauseForTraceAsync(page, 150);
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
            "This file intentionally does not declare PASS/FAIL for row behavior.",
            "Each recorded step was performed against the real Gate 5B-5 page through browser UI.",
            "",
            "Important review target:",
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
