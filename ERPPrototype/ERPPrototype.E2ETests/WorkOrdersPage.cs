using System.Diagnostics;
using System.Globalization;
using Microsoft.Playwright;

namespace ERPPrototype.E2ETests;

internal sealed class WorkOrdersPage(IPage page)
{
    private const string TableId = "tabulator-test-table";
    private const int NormalTimeoutMs = 45_000;
    private const int StressTimeoutMs = 180_000;

    private ILocator PageRoot => page.GetByTestId("work-orders-page");
    private ILocator Title => page.GetByTestId("work-orders-title");
    private ILocator Scope => page.GetByTestId("work-orders-scope");
    private ILocator YearSelector => page.GetByTestId("work-year-selector");
    private ILocator Grid => page.GetByTestId("work-orders-grid");
    private ILocator Search => page.GetByTestId("work-orders-search");
    private ILocator SaveButton => page.GetByTestId("work-orders-save");
    private ILocator DeleteButton => page.GetByTestId("work-orders-delete");
    private ILocator Status => page.GetByTestId("work-orders-status");
    private ILocator ValidationPanel => page.GetByTestId("work-orders-validation");

    public async Task WaitUntilReadyAsync()
    {
        await PageRoot.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = NormalTimeoutMs
            });

        await Title.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible
            });

        await Scope.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible
            });

        await YearSelector.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible
            });

        await Grid.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible
            });

        await page.WaitForFunctionAsync(
            """
            tableId => {
                const testApi = window.tabulatorTest;
                const host = document.getElementById(tableId);
                const table = testApi?.tables?.[tableId];
                const state = testApi?.states?.[tableId];

                return Boolean(
                    host &&
                    host.classList.contains('tabulator') &&
                    host.querySelector('.tabulator-tableholder') &&
                    table &&
                    state
                );
            }
            """,
            TableId,
            new PageWaitForFunctionOptions
            {
                Timeout = NormalTimeoutMs
            });
    }

    public async Task<string> GetTitleAsync() =>
        (await Title.InnerTextAsync()).Trim();

    public async Task<string> GetScopeAsync() =>
        (await Scope.InnerTextAsync()).Trim();

    public Task<string> GetSelectedYearAsync() =>
        YearSelector.InputValueAsync();

    public async Task SelectYearAsync(int year)
    {
        var expectedYear = year.ToString(CultureInfo.InvariantCulture);

        await YearSelector.SelectOptionAsync(expectedYear);

        await page.WaitForFunctionAsync(
            """
            expected => {
                const selector = document.querySelector(
                    '[data-testid="work-year-selector"]'
                );

                const table =
                    window.tabulatorTest?.tables?.['tabulator-test-table'];

                const state =
                    window.tabulatorTest?.states?.['tabulator-test-table'];

                return Boolean(
                    selector &&
                    selector.value === String(expected) &&
                    !selector.disabled &&
                    table &&
                    state &&
                    !state.bulkStructureMutationActive
                );
            }
            """,
            expectedYear,
            new PageWaitForFunctionOptions
            {
                Timeout = NormalTimeoutMs
            });
    }

    public async Task<int> GetActiveRowCountAsync()
    {
        return await page.EvaluateAsync<int>(
            """
            tableId => {
                const table = window.tabulatorTest?.tables?.[tableId];
                return table ? table.getDataCount('active') : -1;
            }
            """,
            TableId);
    }

    public async Task<int> GetRenderedRowCountAsync()
    {
        return await page.EvaluateAsync<int>(
            """
            tableId => document.querySelectorAll(
                `#${tableId} .tabulator-row`
            ).length
            """,
            TableId);
    }

    public async Task<int> GetDirtyRowCountAsync()
    {
        return await page.EvaluateAsync<int>(
            """
            tableId => {
                const state = window.tabulatorTest?.states?.[tableId];
                if (!state) {
                    return -1;
                }

                return (
                    (state.dirtyRowIds?.size ?? 0) +
                    (state.deletedOriginalRowIds?.size ?? 0)
                );
            }
            """,
            TableId);
    }

    public async Task WaitForActiveRowCountAsync(
        int expected,
        int timeoutMs = NormalTimeoutMs)
    {
        await page.WaitForFunctionAsync(
            """
            args => {
                const table =
                    window.tabulatorTest?.tables?.[args.tableId];

                return Boolean(
                    table &&
                    table.getDataCount('active') === args.expected
                );
            }
            """,
            new
            {
                tableId = TableId,
                expected
            },
            new PageWaitForFunctionOptions
            {
                Timeout = timeoutMs
            });
    }

    public async Task WaitForDirtyRowCountAsync(
        int expected,
        int timeoutMs = NormalTimeoutMs)
    {
        await page.WaitForFunctionAsync(
            """
            args => {
                const state =
                    window.tabulatorTest?.states?.[args.tableId];

                if (!state || state.bulkStructureMutationActive) {
                    return false;
                }

                const dirty =
                    (state.dirtyRowIds?.size ?? 0) +
                    (state.deletedOriginalRowIds?.size ?? 0);

                return dirty === args.expected;
            }
            """,
            new
            {
                tableId = TableId,
                expected
            },
            new PageWaitForFunctionOptions
            {
                Timeout = timeoutMs
            });
    }

    public async Task ScrollToRowAsync(int rowId)
    {
        var found = await page.EvaluateAsync<bool>(
            """
            async args => {
                const table =
                    window.tabulatorTest?.tables?.[args.tableId];

                const row = table?.getRow(args.rowId);

                if (!table || !row) {
                    return false;
                }

                await table.scrollToRow(row, 'center', true);
                return true;
            }
            """,
            new
            {
                tableId = TableId,
                rowId
            });

        E2ETestAssert.True(
            found,
            $"Tabulator could not locate row Id {rowId}.");
    }

    public async Task WaitForWorkOrderAsync(string workOrderNumber)
    {
        await page.WaitForFunctionAsync(
            """
            expected => Array.from(
                document.querySelectorAll(
                    '#tabulator-test-table .tabulator-cell[tabulator-field="workOrderNumber"]'
                )
            ).some(cell => (cell.textContent || '').trim() === expected)
            """,
            workOrderNumber,
            new PageWaitForFunctionOptions
            {
                Timeout = NormalTimeoutMs
            });
    }

    public async Task<bool> HasVisibleWorkOrderAsync(
        string workOrderNumber)
    {
        return await page.EvaluateAsync<bool>(
            """
            expected => Array.from(
                document.querySelectorAll(
                    '#tabulator-test-table .tabulator-cell[tabulator-field="workOrderNumber"]'
                )
            ).some(cell => (cell.textContent || '').trim() === expected)
            """,
            workOrderNumber);
    }

    public async Task<bool> ContainsWorkOrderInDataAsync(
        string workOrderNumber)
    {
        return await page.EvaluateAsync<bool>(
            """
            args => {
                const table =
                    window.tabulatorTest?.tables?.[args.tableId];

                return Boolean(
                    table &&
                    table.getData('active').some(
                        row => String(row.workOrderNumber ?? '') ===
                            args.workOrderNumber
                    )
                );
            }
            """,
            new
            {
                tableId = TableId,
                workOrderNumber
            });
    }

    public async Task SearchWorkOrderAsync(string workOrderNumber)
    {
        await Search.FillAsync(workOrderNumber);
        await WaitForActiveRowCountAsync(1);
        await WaitForWorkOrderAsync(workOrderNumber);
    }

    public async Task ClearSearchAsync(int expectedRowCount)
    {
        await Search.FillAsync(string.Empty);
        await WaitForActiveRowCountAsync(expectedRowCount);
    }

    public async Task SetCellValueAsync(
        int rowId,
        string field,
        string value)
    {
        var targetToken = $"e2e-cell-{Guid.NewGuid():N}";

        var targetIsReady = await page.EvaluateAsync<bool>(
            """
            async args => {
                const table =
                    window.tabulatorTest?.tables?.[args.tableId];

                const row = table?.getRow(args.rowId);

                if (!table || !row) {
                    return false;
                }

                await table.scrollToRow(row, 'center', true);

                for (let attempt = 0; attempt < 60; attempt += 1) {
                    const cell = row.getCell(args.field);
                    const element = cell?.getElement?.();

                    if (
                        cell &&
                        element &&
                        element !== false &&
                        element.isConnected
                    ) {
                        element.setAttribute(
                            'data-e2e-cell-token',
                            args.targetToken
                        );

                        return true;
                    }

                    await new Promise(
                        resolve => window.requestAnimationFrame(resolve)
                    );
                }

                return false;
            }
            """,
            new
            {
                tableId = TableId,
                rowId,
                field,
                targetToken
            });

        E2ETestAssert.True(
            targetIsReady,
            $"Could not render field '{field}' on row Id {rowId}.");

        var targetCell = page.Locator(
            $"[data-e2e-cell-token='{targetToken}']");

        await targetCell.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = StressTimeoutMs
            });

        await targetCell.DblClickAsync();

        var editor = targetCell.Locator(
            "input:not([type='hidden']), textarea");

        await editor.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = NormalTimeoutMs
            });

        await editor.FillAsync(value);
        await editor.PressAsync("Enter");

        await page.WaitForFunctionAsync(
            """
            args => {
                const table =
                    window.tabulatorTest?.tables?.[args.tableId];

                const row = table?.getRow(args.rowId);
                const cell = row?.getCell(args.field);

                return Boolean(
                    cell &&
                    String(cell.getValue() ?? '') === args.value
                );
            }
            """,
            new
            {
                tableId = TableId,
                rowId,
                field,
                value
            },
            new PageWaitForFunctionOptions
            {
                Timeout = NormalTimeoutMs
            });
    }

    public async Task<string> GetCellValueAsync(
        int rowId,
        string field)
    {
        return await page.EvaluateAsync<string>(
            """
            args => {
                const table =
                    window.tabulatorTest?.tables?.[args.tableId];

                const row = table?.getRow(args.rowId);
                const cell = row?.getCell(args.field);
                return String(cell?.getValue() ?? '');
            }
            """,
            new
            {
                tableId = TableId,
                rowId,
                field
            });
    }

    public async Task SaveAndWaitAsync()
    {
        await SaveButton.ClickAsync();

        await page.WaitForFunctionAsync(
            """
            () => {
                const status = document.querySelector(
                    '[data-testid="work-orders-status"]'
                );

                const save = document.querySelector(
                    '[data-testid="work-orders-save"]'
                );

                return Boolean(
                    status &&
                    save &&
                    !save.disabled &&
                    (status.textContent || '').includes('تم حفظ')
                );
            }
            """,
            null,
            new PageWaitForFunctionOptions
            {
                Timeout = StressTimeoutMs
            });
    }


    public async Task<string> SaveAndWaitForFailureAsync(
        string expectedText)
    {
        await SaveButton.ClickAsync();

        await page.WaitForFunctionAsync(
            """
            expected => {
                const status = document.querySelector(
                    '[data-testid="work-orders-status"]'
                );

                const save = document.querySelector(
                    '[data-testid="work-orders-save"]'
                );

                return Boolean(
                    status &&
                    save &&
                    !save.disabled &&
                    (status.textContent || '').includes(expected)
                );
            }
            """,
            expectedText,
            new PageWaitForFunctionOptions
            {
                Timeout = StressTimeoutMs
            });

        return (await Status.InnerTextAsync()).Trim();
    }

    public async Task<bool> IsValidationPanelVisibleAsync()
    {
        return await ValidationPanel.IsVisibleAsync();
    }

    public async Task<string> GetValidationPanelTextAsync()
    {
        return (await ValidationPanel.InnerTextAsync()).Trim();
    }

    public async Task DeleteRowAsync(
        int rowId,
        int expectedRemainingRows)
    {
        await ClickCellAsync(rowId, "workOrderNumber");

        EventHandler<IDialog> dialogHandler =
            async (_, dialog) => await dialog.AcceptAsync();

        page.Dialog += dialogHandler;

        try
        {
            await DeleteButton.ClickAsync();
        }
        finally
        {
            page.Dialog -= dialogHandler;
        }

        await WaitForActiveRowCountAsync(
            expectedRemainingRows,
            StressTimeoutMs);
    }

    private async Task ClickCellAsync(
        int rowId,
        string field)
    {
        var targetToken = $"e2e-click-cell-{Guid.NewGuid():N}";

        var targetIsReady = await page.EvaluateAsync<bool>(
            """
            async args => {
                const table =
                    window.tabulatorTest?.tables?.[args.tableId];

                const row = table?.getRow(args.rowId);

                if (!table || !row) {
                    return false;
                }

                await table.scrollToRow(row, 'center', true);

                for (let attempt = 0; attempt < 60; attempt += 1) {
                    const cell = row.getCell(args.field);
                    const element = cell?.getElement?.();

                    if (
                        cell &&
                        element &&
                        element !== false &&
                        element.isConnected
                    ) {
                        element.setAttribute(
                            'data-e2e-click-cell-token',
                            args.targetToken
                        );

                        return true;
                    }

                    await new Promise(
                        resolve => window.requestAnimationFrame(resolve)
                    );
                }

                return false;
            }
            """,
            new
            {
                tableId = TableId,
                rowId,
                field,
                targetToken
            });

        E2ETestAssert.True(
            targetIsReady,
            $"Could not render field '{field}' on row Id {rowId} for selection.");

        var targetCell = page.Locator(
            $"[data-e2e-click-cell-token='{targetToken}']");

        await targetCell.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = StressTimeoutMs
            });

        await targetCell.ClickAsync();
    }

    public async Task ReloadAndWaitAsync()
    {
        await page.ReloadAsync(
            new PageReloadOptions
            {
                WaitUntil = WaitUntilState.DOMContentLoaded,
                Timeout = StressTimeoutMs
            });

        await WaitUntilReadyAsync();
    }

    public async Task<BrowserStructureStressMetrics>
        RunThousandRowStructureStressAsync(
            int anchorRowId,
            int originalRowCount,
            Func<string, Task>? observeAsync = null)
    {
        await SelectActiveRowAsync(anchorRowId);

        var insertMs = await MeasureAsync(
            async () =>
            {
                await page.EvaluateAsync<bool>(
                    """
                    async tableId => {
                        await window.tabulatorTest.insertRows(
                            tableId,
                            1000,
                            'below'
                        );
                        return true;
                    }
                    """,
                    TableId);

                await WaitForActiveRowCountAsync(
                    originalRowCount + 1_000,
                    StressTimeoutMs);

                await WaitForDirtyRowCountAsync(
                    1_000,
                    StressTimeoutMs);

                if (observeAsync is not null)
                {
                    await observeAsync(
                        "تم إدراج 1000 صف — العدد الظاهر أصبح 2000");
                }
            });

        var undoMs = await MeasureAsync(
            async () =>
            {
                await page.EvaluateAsync<bool>(
                    """
                    async tableId => {
                        await window.tabulatorTest.undo(tableId);
                        return true;
                    }
                    """,
                    TableId);

                await WaitForActiveRowCountAsync(
                    originalRowCount,
                    StressTimeoutMs);

                await WaitForDirtyRowCountAsync(
                    0,
                    StressTimeoutMs);

                if (observeAsync is not null)
                {
                    await observeAsync(
                        "Undo أعاد الشيت إلى 1000 صف وحالة نظيفة");
                }
            });

        var redoMs = await MeasureAsync(
            async () =>
            {
                await page.EvaluateAsync<bool>(
                    """
                    async tableId => {
                        await window.tabulatorTest.redo(tableId);
                        return true;
                    }
                    """,
                    TableId);

                await WaitForActiveRowCountAsync(
                    originalRowCount + 1_000,
                    StressTimeoutMs);

                await WaitForDirtyRowCountAsync(
                    1_000,
                    StressTimeoutMs);

                if (observeAsync is not null)
                {
                    await observeAsync(
                        "Redo أعاد 1000 صف مدرج — العدد أصبح 2000 مرة أخرى");
                }
            });

        var finalUndoMs = await MeasureAsync(
            async () =>
            {
                await page.EvaluateAsync<bool>(
                    """
                    async tableId => {
                        await window.tabulatorTest.undo(tableId);
                        return true;
                    }
                    """,
                    TableId);

                await WaitForActiveRowCountAsync(
                    originalRowCount,
                    StressTimeoutMs);

                await WaitForDirtyRowCountAsync(
                    0,
                    StressTimeoutMs);

                if (observeAsync is not null)
                {
                    await observeAsync(
                        "Undo النهائي أعاد الشيت إلى baseline نظيف من 1000 صف");
                }
            });

        return new BrowserStructureStressMetrics(
            ExistingRows: originalRowCount,
            InsertedRows: 1_000,
            InsertMilliseconds: insertMs,
            UndoMilliseconds: undoMs,
            RedoMilliseconds: redoMs,
            FinalUndoMilliseconds: finalUndoMs,
            FinalRowCount: await GetActiveRowCountAsync(),
            FinalDirtyRowCount: await GetDirtyRowCountAsync());
    }

    private async Task SelectActiveRowAsync(int rowId)
    {
        var selected = await page.EvaluateAsync<bool>(
            """
            async args => {
                const api = window.tabulatorTest;
                const table = api?.tables?.[args.tableId];
                const state = api?.states?.[args.tableId];
                const row = table?.getRow(args.rowId);
                const cell = row?.getCell('workOrderNumber');

                if (!table || !state || !row || !cell) {
                    return false;
                }

                await table.scrollToRow(row, 'center', true);
                api.clearTableRanges(args.tableId);
                state.activeCell = {
                    rowId: row.getIndex(),
                    field: cell.getField()
                };

                return true;
            }
            """,
            new
            {
                tableId = TableId,
                rowId
            });

        E2ETestAssert.True(
            selected,
            $"Could not select row Id {rowId} for structural stress.");
    }

    private static async Task<double> MeasureAsync(Func<Task> action)
    {
        var startedAt = Stopwatch.GetTimestamp();
        await action();
        return Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds;
    }
}

internal sealed record BrowserStructureStressMetrics(
    int ExistingRows,
    int InsertedRows,
    double InsertMilliseconds,
    double UndoMilliseconds,
    double RedoMilliseconds,
    double FinalUndoMilliseconds,
    int FinalRowCount,
    int FinalDirtyRowCount);
