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
    private ILocator Scope => page.GetByTestId("work-orders-scope");
    private ILocator BranchScopeValue => Scope.Locator(".scope-branch strong");
    private ILocator DepartmentScopeValue =>
        Scope.Locator(".scope-department strong");
    private ILocator YearSelector => page.GetByTestId("work-year-selector");
    private ILocator Grid => page.GetByTestId("work-orders-grid");
    private ILocator Search => page.GetByTestId("work-orders-search");
    private ILocator SaveButton => page.GetByTestId("work-orders-save");
    private ILocator DeleteButton => page.GetByTestId("work-orders-delete");
    private ILocator CommandsMenu => page.Locator("details.sheet-commands-menu");
    private ILocator Status => page.GetByTestId("work-orders-status");
    private ILocator ValidationPanel => page.GetByTestId("work-orders-validation");
    private ILocator Summary => page.GetByTestId("work-orders-summary");
    private ILocator BasketDashboard =>
        page.GetByTestId("work-orders-basket-dashboard");
    private ILocator SelectionSummary =>
        page.GetByTestId("work-orders-selection-summary");

    public async Task WaitUntilReadyAsync()
    {
        await PageRoot.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = NormalTimeoutMs
            });

        await Scope.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = NormalTimeoutMs
            });

        await YearSelector.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = NormalTimeoutMs
            });

        await Grid.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = NormalTimeoutMs
            });

        await Summary.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = NormalTimeoutMs
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

    public string GetPath() =>
        new Uri(page.Url).AbsolutePath;

    public Task<bool> IsGridRuntimeLoadedAsync() =>
        page.EvaluateAsync<bool>(
            """
            () => Boolean(
                typeof window.Tabulator !== 'undefined' &&
                typeof window.tabulatorTest?.initialize === 'function'
            )
            """);

    public Task<bool> IsPerformanceRuntimeLoadedAsync() =>
        page.EvaluateAsync<bool>(
            """
            () => typeof window.tabulatorPerformance !== 'undefined'
            """);

    public async Task<string> GetBranchSourceNameAsync() =>
        ((await BranchScopeValue.GetAttributeAsync("title")) ?? string.Empty)
            .Trim();

    public async Task<string> GetDepartmentSourceNameAsync() =>
        ((await DepartmentScopeValue.GetAttributeAsync("title")) ?? string.Empty)
            .Trim();

    public Task<string> GetSelectedYearAsync() =>
        YearSelector.InputValueAsync();

    public async Task SelectYearAndWaitForDatasetAsync(
        int year,
        int expectedRowCount,
        string expectedWorkOrderNumber,
        string? excludedWorkOrderNumber = null)
    {
        var expectedYear = year.ToString(CultureInfo.InvariantCulture);

        await YearSelector.SelectOptionAsync(expectedYear);

        await page.WaitForFunctionAsync(
            """
            args => {
                const selector = document.querySelector(
                    '[data-testid="work-year-selector"]'
                );
                const host = document.getElementById(args.tableId);
                const table =
                    window.tabulatorTest?.tables?.[args.tableId];
                const state =
                    window.tabulatorTest?.states?.[args.tableId];
                const summary = document.getElementById(
                    `${args.tableId}-summary-overview`
                );
                const basketDashboard = document.getElementById(
                    `${args.tableId}-basket-dashboard`
                );
                const lifecycleIdle =
                    state &&
                    state.aggregateRefreshFrame === null &&
                    state.selectionAggregateRefreshFrame === null &&
                    state.viewportLayoutSyncFrame === null &&
                    state.resizeViewportRestoreFrame === null &&
                    (state.resizeViewportRestoreFramesRemaining ?? 0) === 0 &&
                    state.resizeViewportPosition === null &&
                    state.resizePendingViewportPosition === null &&
                    state.resizeTimer === null;

                if (
                    !selector ||
                    selector.value !== String(args.expectedYear) ||
                    selector.disabled ||
                    !host?.classList?.contains('tabulator') ||
                    !host.querySelector('.tabulator-tableholder') ||
                    !table ||
                    !state ||
                    state.bulkStructureMutationActive ||
                    summary?.dataset?.aggregateReady !== 'true' ||
                    basketDashboard?.dataset?.dashboardReady !== 'true' ||
                    !lifecycleIdle ||
                    table.getDataCount('active') !== args.expectedRowCount
                ) {
                    return false;
                }

                const rows = table.getData('active');
                const containsExpected = rows.some(
                    row => String(row.workOrderNumber ?? '') ===
                        args.expectedWorkOrderNumber
                );
                const containsExcluded =
                    Boolean(args.excludedWorkOrderNumber) &&
                    rows.some(
                        row => String(row.workOrderNumber ?? '') ===
                            args.excludedWorkOrderNumber
                    );

                return containsExpected && !containsExcluded;
            }
            """,
            new
            {
                tableId = TableId,
                expectedYear,
                expectedRowCount,
                expectedWorkOrderNumber,
                excludedWorkOrderNumber
            },
            new PageWaitForFunctionOptions
            {
                Timeout = StressTimeoutMs
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
        await page.WaitForFunctionAsync(
            """
            async args => {
                const testApi = window.tabulatorTest;
                const table = testApi?.tables?.[args.tableId];
                const state = testApi?.states?.[args.tableId];
                const holder = table?.element?.querySelector(
                    '.tabulator-tableholder'
                );
                const row = table?.getRow(args.rowId);

                const isLifecycleIdle = currentState =>
                    currentState &&
                    currentState.viewportLayoutSyncFrame === null &&
                    currentState.resizeViewportRestoreFrame === null &&
                    (
                        currentState
                            .resizeViewportRestoreFramesRemaining ?? 0
                    ) === 0 &&
                    currentState.resizeViewportPosition === null &&
                    currentState.resizePendingViewportPosition === null &&
                    currentState.resizeTimer === null;

                if (
                    !table ||
                    !state ||
                    !holder ||
                    !row ||
                    state.bulkStructureMutationActive ||
                    !isLifecycleIdle(state)
                ) {
                    return false;
                }

                try {
                    await table.scrollToRow(
                        row,
                        'center',
                        false
                    );
                } catch {
                    return false;
                }

                /*
                 * scrollToRow can resolve before later callbacks in the same
                 * paint restore the old viewport. Cross the paint-to-task
                 * boundary twice before accepting the rendered row.
                 */
                const waitForCompletedPaint = () =>
                    new Promise(resolve =>
                        window.requestAnimationFrame(() =>
                            window.setTimeout(resolve, 0)
                        )
                    );

                await waitForCompletedPaint();
                await waitForCompletedPaint();

                const currentTable =
                    testApi?.tables?.[args.tableId];
                const currentState =
                    testApi?.states?.[args.tableId];
                const currentHolder =
                    currentTable?.element?.querySelector(
                        '.tabulator-tableholder'
                    );
                const currentRow =
                    currentTable?.getRow(args.rowId);
                const rowElement =
                    currentRow?.getElement?.();

                if (
                    !currentTable ||
                    !currentState ||
                    !currentHolder ||
                    !rowElement?.isConnected ||
                    !isLifecycleIdle(currentState)
                ) {
                    return false;
                }

                const holderBounds =
                    currentHolder.getBoundingClientRect();
                const rowBounds =
                    rowElement.getBoundingClientRect();

                return (
                    rowBounds.bottom > holderBounds.top + 1 &&
                    rowBounds.top < holderBounds.bottom - 1
                );
            }
            """,
            new
            {
                tableId = TableId,
                rowId
            },
            new PageWaitForFunctionOptions
            {
                Timeout = NormalTimeoutMs
            });
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
        string value,
        string? expectedValue = null)
    {
        await ActivateCellAsync(
            rowId,
            field,
            doubleClick: true);

        var editorCell = page.Locator(
            $"#{TableId} .tabulator-cell.tabulator-editing" +
            $"[tabulator-field='{field}']");

        var editor = editorCell.Locator(
            "input:not([type='hidden']), textarea");

        await editor.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = NormalTimeoutMs
            });

        if (string.Equals(
            field,
            "basket",
            StringComparison.Ordinal))
        {
            var option =
                page
                    .Locator(".tabulator-edit-list")
                    .GetByText(
                        value,
                        new LocatorGetByTextOptions
                        {
                            Exact = true
                        });

            await option.WaitForAsync(
                new LocatorWaitForOptions
                {
                    State = WaitForSelectorState.Visible,
                    Timeout = NormalTimeoutMs
                });

            await option.ClickAsync();
        }
        else
        {
            await editor.FillAsync(value);
            await editor.PressAsync("Enter");
        }

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
                value = expectedValue ?? value
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

    public async Task PasteCellValueAsync(
        int rowId,
        string field,
        string clipboardText,
        string expectedValue)
    {
        await page.EvaluateAsync(
            """
            tableId => {
                window.tabulatorTest?.clearTableRanges(tableId);
            }
            """,
            TableId);

        await ClickCellAsync(rowId, field);

        await page.WaitForFunctionAsync(
            """
            args => {
                const api = window.tabulatorTest;
                const table = api?.tables?.[args.tableId];
                const range = api?.getActiveRange?.(table);
                const matrix = range?.getStructuredCells?.();
                const cell = matrix?.[0]?.[0];

                return Boolean(
                    Array.isArray(matrix) &&
                    matrix.length === 1 &&
                    matrix[0].length === 1 &&
                    cell &&
                    cell.getRow().getIndex() === args.rowId &&
                    cell.getField() === args.field
                );
            }
            """,
            new
            {
                tableId = TableId,
                rowId,
                field
            },
            new PageWaitForFunctionOptions
            {
                Timeout = NormalTimeoutMs
            });

        var pasted = await page.EvaluateAsync<bool>(
            """
            async args => {
                return await window.tabulatorTest.pasteClipboardText(
                    args.tableId,
                    args.clipboardText
                );
            }
            """,
            new
            {
                tableId = TableId,
                clipboardText
            });

        E2ETestAssert.True(
            pasted,
            $"Could not paste into field '{field}' on row Id {rowId}.");

        await WaitForCellValueAsync(
            rowId,
            field,
            expectedValue);
    }

    public async Task<int[]> GetActiveRowIdsAsync(
        int startIndex,
        int count)
    {
        return await page.EvaluateAsync<int[]>(
            """
            args => {
                const table =
                    window.tabulatorTest?.tables?.[args.tableId];

                if (!table) {
                    return [];
                }

                return table
                    .getRows('active')
                    .slice(args.startIndex, args.startIndex + args.count)
                    .map(row => Number(row.getIndex()))
                    .filter(Number.isFinite);
            }
            """,
            new
            {
                tableId = TableId,
                startIndex,
                count
            });
    }

    public async Task PasteColumnValuesAsync(
        int startRowId,
        string field,
        IReadOnlyList<string> values,
        int expectedDirtyRowCount)
    {
        E2ETestAssert.True(
            values.Count > 0,
            "Bulk paste requires at least one value.");

        await page.EvaluateAsync(
            """
            tableId => {
                window.tabulatorTest?.clearTableRanges(tableId);
            }
            """,
            TableId);

        await ClickCellAsync(startRowId, field);

        var clipboardText = string.Join("\n", values);

        var pasted = await page.EvaluateAsync<bool>(
            """
            async args => {
                return await window.tabulatorTest.pasteClipboardText(
                    args.tableId,
                    args.clipboardText
                );
            }
            """,
            new
            {
                tableId = TableId,
                clipboardText
            });

        E2ETestAssert.True(
            pasted,
            $"Could not bulk paste {values.Count:N0} values into field '{field}'.");

        await WaitForDirtyRowCountAsync(
            expectedDirtyRowCount,
            StressTimeoutMs);
    }

    public async Task WaitForCellValueAsync(
        int rowId,
        string field,
        string expectedValue,
        int timeoutMs = NormalTimeoutMs)
    {
        await page.WaitForFunctionAsync(
            """
            args => {
                const table =
                    window.tabulatorTest?.tables?.[args.tableId];
                const row = table?.getRow(args.rowId);
                const cell = row?.getCell(args.field);

                return Boolean(
                    cell &&
                    String(cell.getValue() ?? '') === args.expectedValue
                );
            }
            """,
            new
            {
                tableId = TableId,
                rowId,
                field,
                expectedValue
            },
            new PageWaitForFunctionOptions
            {
                Timeout = timeoutMs
            });
    }

    public async Task UndoAsync()
    {
        await page.EvaluateAsync<bool>(
            """
            async tableId => {
                await window.tabulatorTest.undo(tableId);
                return true;
            }
            """,
            TableId);
    }

    public async Task RedoAsync()
    {
        await page.EvaluateAsync<bool>(
            """
            async tableId => {
                await window.tabulatorTest.redo(tableId);
                return true;
            }
            """,
            TableId);
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
                    (status.title || '').includes('تم حفظ')
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
                    (status.title || '').includes(expected)
                );
            }
            """,
            expectedText,
            new PageWaitForFunctionOptions
            {
                Timeout = StressTimeoutMs
            });

        return (await Status.GetAttributeAsync("title") ?? string.Empty).Trim();
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
            await CommandsMenu.EvaluateAsync(
                "element => { element.open = true; }");
            await DeleteButton.ClickAsync();
        }
        finally
        {
            page.Dialog -= dialogHandler;
        }

        await WaitForActiveRowCountAsync(
            expectedRemainingRows,
            StressTimeoutMs);
        await WaitForAggregateRowCountAsync(
            "visible",
            expectedRemainingRows,
            StressTimeoutMs);
    }

    public Task ActivateCellForNavigationAsync(
        int rowId,
        string field) =>
        ClickCellAsync(rowId, field);

    public async Task<int> GetActiveCellRowIdAsync()
    {
        return await page.EvaluateAsync<int>(
            """
            tableId => {
                const state = window.tabulatorTest?.states?.[tableId];
                const rowId = Number(state?.activeCell?.rowId);
                return Number.isFinite(rowId) ? rowId : -1;
            }
            """,
            TableId);
    }

    private async Task ClickCellAsync(
        int rowId,
        string field)
    {
        await ActivateCellAsync(
            rowId,
            field,
            doubleClick: false);
    }

    private async Task ActivateCellAsync(
        int rowId,
        string field,
        bool doubleClick)
    {
        await ScrollToRowAsync(rowId);

        var activated = await page.EvaluateAsync<bool>(
            """
            args => {
                const api = window.tabulatorTest;
                const table = api?.tables?.[args.tableId];
                const state = api?.states?.[args.tableId];
                const holder = table?.element?.querySelector(
                    '.tabulator-tableholder'
                );
                const row = table?.getRow(args.rowId);
                const cell = row?.getCell(args.field);
                const element = cell?.getElement?.();

                if (
                    !state ||
                    !holder ||
                    !cell ||
                    !element ||
                    element === false ||
                    !element.isConnected
                ) {
                    return false;
                }

                const holderBounds =
                    holder.getBoundingClientRect();
                const cellBounds =
                    element.getBoundingClientRect();

                if (
                    cellBounds.bottom <= holderBounds.top + 1 ||
                    cellBounds.top >= holderBounds.bottom - 1
                ) {
                    return false;
                }

                const eventOptions = {
                    bubbles: true,
                    cancelable: true,
                    composed: true,
                    view: window,
                    button: 0,
                    buttons: 1,
                    clientX:
                        cellBounds.left + (cellBounds.width / 2),
                    clientY:
                        cellBounds.top + (cellBounds.height / 2)
                };

                element.focus({ preventScroll: true });
                element.dispatchEvent(
                    new MouseEvent('mousedown', eventOptions)
                );

                if (args.doubleClick) {
                    cell.edit();

                    return Boolean(
                        element.isConnected &&
                        element.classList.contains(
                            'tabulator-editing'
                        ) &&
                        element.querySelector(
                            "input:not([type='hidden']), textarea, select"
                        )
                    );
                }

                element.dispatchEvent(
                    new MouseEvent(
                        'mouseup',
                        {
                            ...eventOptions,
                            buttons: 0
                        }
                    )
                );
                element.dispatchEvent(
                    new MouseEvent(
                        'click',
                        {
                            ...eventOptions,
                            buttons: 0,
                            detail: 1
                        }
                    )
                );

                return Boolean(
                    state.isActive &&
                    String(state.activeCell?.rowId ?? '') ===
                        String(args.rowId) &&
                    state.activeCell?.field === args.field
                );
            }
            """,
            new
            {
                tableId = TableId,
                rowId,
                field,
                doubleClick
            });

        E2ETestAssert.True(
            activated,
            $"Could not activate field '{field}' on row Id {rowId} " +
            "after the virtualized viewport became stable.");
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

    public async Task WaitForAggregateReadyAsync()
    {
        await page.WaitForFunctionAsync(
            """
            tableId => {
                const overview = document.getElementById(
                    `${tableId}-summary-overview`
                );

                return Boolean(
                    overview?.dataset?.aggregateReady === 'true' &&
                    window.tabulatorTest?.getAggregateSnapshot?.(tableId)
                );
            }
            """,
            TableId,
            new PageWaitForFunctionOptions
            {
                Timeout = NormalTimeoutMs
            });
    }

    public async Task WaitForAggregateRowCountAsync(
        string scope,
        int expectedCount,
        int timeoutMs = NormalTimeoutMs)
    {
        await page.WaitForFunctionAsync(
            """
            args => {
                const snapshot =
                    window.tabulatorTest?.getAggregateSnapshot?.(
                        args.tableId
                    );

                return Number(
                    snapshot?.[args.scope]?.rowCount ?? -1
                ) === args.expectedCount;
            }
            """,
            new
            {
                tableId = TableId,
                scope,
                expectedCount
            },
            new PageWaitForFunctionOptions
            {
                Timeout = timeoutMs
            });
    }

    public async Task<int> GetAggregateRowCountAsync(string scope)
    {
        return await page.EvaluateAsync<int>(
            """
            args => Number(
                window.tabulatorTest
                    ?.getAggregateSnapshot?.(args.tableId)
                    ?.[args.scope]
                    ?.rowCount ?? 0
            )
            """,
            new
            {
                tableId = TableId,
                scope
            });
    }

    public async Task<long> GetAggregateAmountCentsAsync(
        string scope,
        string field)
    {
        return await page.EvaluateAsync<long>(
            """
            args => Number(
                window.tabulatorTest
                    ?.getAggregateSnapshot?.(args.tableId)
                    ?.[args.scope]
                    ?.amounts
                    ?.[args.field] ?? 0
            )
            """,
            new
            {
                tableId = TableId,
                scope,
                field
            });
    }

    public async Task WaitForAggregateAmountCentsAsync(
        string scope,
        string field,
        long expectedCents,
        int timeoutMs = NormalTimeoutMs)
    {
        await page.WaitForFunctionAsync(
            """
            args => {
                const snapshot =
                    window.tabulatorTest?.getAggregateSnapshot?.(
                        args.tableId
                    );

                return Number(
                    snapshot?.[args.scope]?.amounts?.[args.field] ?? 0
                ) === args.expectedCents;
            }
            """,
            new
            {
                tableId = TableId,
                scope,
                field,
                expectedCents
            },
            new PageWaitForFunctionOptions
            {
                Timeout = timeoutMs
            });
    }

    public async Task<string> GetSummaryItemTextAsync(string testId)
    {
        return (
            await page.GetByTestId(testId).InnerTextAsync()
        ).Trim();
    }

    public async Task WaitForBasketDashboardReadyAsync(
        int timeoutMs = NormalTimeoutMs)
    {
        await BasketDashboard.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = timeoutMs
            });

        await page.WaitForFunctionAsync(
            """
            tableId => {
                const dashboard = document.getElementById(
                    `${tableId}-basket-dashboard`
                );

                return Boolean(
                    dashboard?.dataset?.dashboardReady === 'true' &&
                    window.tabulatorTest
                        ?.getBasketDashboardSnapshot?.(tableId)
                );
            }
            """,
            TableId,
            new PageWaitForFunctionOptions
            {
                Timeout = timeoutMs
            });
    }

    public async Task<int> GetBasketDashboardCardCountAsync()
    {
        return await BasketDashboard
            .Locator("[data-testid='work-orders-basket-card']")
            .CountAsync();
    }

    public async Task<BasketDashboardLayoutSnapshot>
        GetBasketDashboardLayoutAsync()
    {
        var values = await page.EvaluateAsync<int[]>(
            """
            tableId => {
                const dashboard = document.getElementById(
                    `${tableId}-basket-dashboard`
                );
                const track = dashboard?.querySelector(
                    '.basket-side-panel-list'
                );
                const cards = Array.from(
                    track?.querySelectorAll(
                        '[data-testid="work-orders-basket-card"]'
                    ) ?? []
                );

                if (!dashboard || !track) {
                    return [-1, -1, 1, -1, -1, -1, -1];
                }

                const dashboardRect = dashboard.getBoundingClientRect();
                const tolerance = 2;
                const visibleCards = cards.filter(card => {
                    const rect = card.getBoundingClientRect();

                    return Boolean(
                        rect.width > 0 &&
                        rect.height > 0 &&
                        rect.left >= dashboardRect.left - tolerance &&
                        rect.right <= dashboardRect.right + tolerance &&
                        rect.top >= dashboardRect.top - tolerance &&
                        rect.bottom <= dashboardRect.bottom + tolerance
                    );
                });

                const rowTops = new Set(
                    cards.map(card =>
                        Math.round(card.getBoundingClientRect().top)
                    )
                );

                const maximumCardHeight = cards.length > 0
                    ? Math.max(
                        ...cards.map(card =>
                            card.getBoundingClientRect().height
                        )
                    )
                    : 0;

                const groups = [track];
                const panelStyle = getComputedStyle(dashboard);
                const panelBorderWidths = [
                    panelStyle.borderTopWidth,
                    panelStyle.borderRightWidth,
                    panelStyle.borderBottomWidth,
                    panelStyle.borderLeftWidth
                ].map(value => Number.parseFloat(value) || 0);
                const panelHasVisibleBoundary = Boolean(
                    panelBorderWidths.every(width => width >= 1) &&
                    panelStyle.borderTopStyle !== 'none' &&
                    panelStyle.borderRightStyle !== 'none' &&
                    panelStyle.borderBottomStyle !== 'none' &&
                    panelStyle.borderLeftStyle !== 'none'
                );

                return [
                    cards.length,
                    visibleCards.length,
                    track.scrollWidth > track.clientWidth + tolerance
                        ? 1
                        : 0,
                    rowTops.size,
                    Math.round(maximumCardHeight),
                    groups.length,
                    panelHasVisibleBoundary ? 1 : 0
                ];
            }
            """,
            TableId);

        return new BasketDashboardLayoutSnapshot(
            CardCount: values[0],
            VisibleCardCount: values[1],
            HasHorizontalOverflow: values[2] == 1,
            RowCount: values[3],
            MaximumCardHeightPixels: values[4],
            GroupCount: values[5],
            PanelHasVisibleBoundary: values[6] == 1);
    }

    public async Task<BasketVerticalScrollSnapshot>
        VerifyBasketDashboardVerticalScrollAsync()
    {
        var prepared = await page.EvaluateAsync<double[]>(
            """
            tableId => {
                const dashboard = document.getElementById(
                    `${tableId}-basket-dashboard`
                );
                const list = dashboard?.querySelector(
                    '.basket-side-panel-list'
                );
                const sourceCard = list?.querySelector(
                    '[data-testid="work-orders-basket-card"]'
                );

                if (!list || !sourceCard) {
                    return [-1, -1, -1];
                }

                list.querySelectorAll(
                    '[data-e2e-basket-scroll-clone="true"]'
                ).forEach(element => element.remove());

                list.scrollTop = 0;

                for (let index = 0; index < 24; index++) {
                    const clone = sourceCard.cloneNode(true);
                    clone.removeAttribute('data-testid');
                    clone.dataset.e2eBasketScrollClone = 'true';
                    clone.querySelectorAll('[id]').forEach(
                        element => element.removeAttribute('id')
                    );
                    list.appendChild(clone);
                }

                const rect = list.getBoundingClientRect();
                const maximumScrollTop =
                    Math.max(0, list.scrollHeight - list.clientHeight);

                return [
                    rect.left + (rect.width / 2),
                    rect.top + Math.min(rect.height / 2, 40),
                    maximumScrollTop
                ];
            }
            """,
            TableId);

        if (prepared[2] <= 0)
        {
            await RemoveBasketScrollTestClonesAsync();

            return new BasketVerticalScrollSnapshot(
                HadVerticalOverflow: false,
                ScrollTopIncreased: false,
                ReachedBottom: false,
                LastCardFullyVisible: false);
        }

        try
        {
            await page.Mouse.MoveAsync(
                (float)prepared[0],
                (float)prepared[1]);

            for (var attempt = 0; attempt < 8; attempt++)
            {
                await page.Mouse.WheelAsync(0, 1200);
                await page.WaitForTimeoutAsync(40);

                var reachedBottom = await page.EvaluateAsync<bool>(
                    """
                    tableId => {
                        const list = document
                            .getElementById(`${tableId}-basket-dashboard`)
                            ?.querySelector('.basket-side-panel-list');

                        if (!list) {
                            return false;
                        }

                        const maximum = Math.max(
                            0,
                            list.scrollHeight - list.clientHeight
                        );

                        return list.scrollTop >= maximum - 2;
                    }
                    """,
                    TableId);

                if (reachedBottom)
                {
                    break;
                }
            }

            var values = await page.EvaluateAsync<int[]>(
                """
                tableId => {
                    const list = document
                        .getElementById(`${tableId}-basket-dashboard`)
                        ?.querySelector('.basket-side-panel-list');
                    const clones = list?.querySelectorAll(
                        '[data-e2e-basket-scroll-clone="true"]'
                    );
                    const lastCard = clones?.[clones.length - 1];

                    if (!list || !lastCard) {
                        return [0, 0, 0, 0];
                    }

                    const maximum = Math.max(
                        0,
                        list.scrollHeight - list.clientHeight
                    );
                    const listRect = list.getBoundingClientRect();
                    const cardRect = lastCard.getBoundingClientRect();
                    const tolerance = 2;

                    return [
                        maximum > 0 ? 1 : 0,
                        list.scrollTop > tolerance ? 1 : 0,
                        list.scrollTop >= maximum - tolerance ? 1 : 0,
                        cardRect.top >= listRect.top - tolerance &&
                        cardRect.bottom <= listRect.bottom + tolerance
                            ? 1
                            : 0
                    ];
                }
                """,
                TableId);

            return new BasketVerticalScrollSnapshot(
                HadVerticalOverflow: values[0] == 1,
                ScrollTopIncreased: values[1] == 1,
                ReachedBottom: values[2] == 1,
                LastCardFullyVisible: values[3] == 1);
        }
        finally
        {
            await RemoveBasketScrollTestClonesAsync();
        }
    }

    private async Task RemoveBasketScrollTestClonesAsync()
    {
        await page.EvaluateAsync(
            """
            tableId => {
                const list = document
                    .getElementById(`${tableId}-basket-dashboard`)
                    ?.querySelector('.basket-side-panel-list');

                if (!list) {
                    return;
                }

                list.querySelectorAll(
                    '[data-e2e-basket-scroll-clone="true"]'
                ).forEach(element => element.remove());

                list.scrollTop = 0;
            }
            """,
            TableId);
    }

    public async Task<BasketDashboardEntrySnapshot>
        GetBasketDashboardEntryAsync(string basket)
    {
        var values = await page.EvaluateAsync<long[]>(
            """
            args => {
                const snapshot = window.tabulatorTest
                    ?.getBasketDashboardSnapshot?.(args.tableId);
                const entry = snapshot?.baskets?.find(
                    item => item.basket === args.basket
                );

                return entry
                    ? [
                        Number(entry.rowCount ?? 0),
                        Number(entry.remainingAmountCents ?? 0)
                    ]
                    : [-1, -1];
            }
            """,
            new
            {
                tableId = TableId,
                basket
            });

        return new BasketDashboardEntrySnapshot(
            RowCount: checked((int)values[0]),
            RemainingAmountCents: values[1]);
    }

    public async Task<bool> IsBasketDashboardEntryRenderedAsync(
        string basket)
    {
        return await page.EvaluateAsync<bool>(
            """
            args => {
                const dashboard = document.getElementById(
                    `${args.tableId}-basket-dashboard`
                );
                const rows = Array.from(
                    dashboard?.querySelectorAll(
                        '[data-testid="work-orders-basket-card"]'
                    ) ?? []
                );

                return rows.some(row =>
                    row.dataset.basketValue === args.basket &&
                    row.getClientRects().length > 0
                );
            }
            """,
            new
            {
                tableId = TableId,
                basket
            });
    }

    public async Task WaitForBasketDashboardRenderedEntryAsync(
        string basket,
        bool expectedRendered,
        int timeoutMs = NormalTimeoutMs)
    {
        await page.WaitForFunctionAsync(
            """
            args => {
                const dashboard = document.getElementById(
                    `${args.tableId}-basket-dashboard`
                );
                const rows = Array.from(
                    dashboard?.querySelectorAll(
                        '[data-testid="work-orders-basket-card"]'
                    ) ?? []
                );
                const rendered = rows.some(row =>
                    row.dataset.basketValue === args.basket &&
                    row.getClientRects().length > 0
                );

                return rendered === args.expectedRendered;
            }
            """,
            new
            {
                tableId = TableId,
                basket,
                expectedRendered
            },
            new PageWaitForFunctionOptions
            {
                Timeout = timeoutMs
            });
    }

    public async Task WaitForBasketDashboardEntryAsync(
        string basket,
        int expectedRowCount,
        long expectedRemainingAmountCents,
        int timeoutMs = NormalTimeoutMs)
    {
        await page.WaitForFunctionAsync(
            """
            args => {
                const snapshot = window.tabulatorTest
                    ?.getBasketDashboardSnapshot?.(args.tableId);
                const entry = snapshot?.baskets?.find(
                    item => item.basket === args.basket
                );

                return Boolean(
                    entry &&
                    Number(entry.rowCount ?? -1) ===
                        args.expectedRowCount &&
                    Number(entry.remainingAmountCents ?? -1) ===
                        args.expectedRemainingAmountCents
                );
            }
            """,
            new
            {
                tableId = TableId,
                basket,
                expectedRowCount,
                expectedRemainingAmountCents
            },
            new PageWaitForFunctionOptions
            {
                Timeout = timeoutMs
            });
    }

    public async Task<string> GetBasketDashboardTextAsync()
    {
        return (await BasketDashboard.InnerTextAsync()).Trim();
    }

    public async Task<string[]> GetValueFilterOptionsAsync(
        string field)
    {
        var popup = await OpenValueFilterPopupAsync(field);

        var values = await popup
            .Locator(
                ".excel-filter-option[data-filter-value] > span")
            .AllInnerTextsAsync();

        await CloseValueFilterPopupAsync(field, popup);

        return values
            .Select(value => value.Trim())
            .ToArray();
    }

    public async Task<(int OptionCount, bool Virtualized)>
        GetValueFilterMetadataAsync(string field)
    {
        var popup = await OpenValueFilterPopupAsync(field);

        var optionCountText =
            await popup.GetAttributeAsync("data-filter-option-count") ?? "0";
        var virtualizedText =
            await popup.GetAttributeAsync("data-filter-virtualized") ?? "false";

        await CloseValueFilterPopupAsync(field, popup);

        return (
            int.Parse(
                optionCountText,
                CultureInfo.InvariantCulture),
            string.Equals(
                virtualizedText,
                "true",
                StringComparison.OrdinalIgnoreCase));
    }

    public async Task<string[]> SearchValueFilterOptionsAsync(
        string field,
        string query)
    {
        var popup = await OpenValueFilterPopupAsync(field);
        var search = popup.Locator(
            "[data-filter-role=\"search\"]");

        await search.FillAsync(query);

        await page.WaitForFunctionAsync(
            """
            args => {
                const popup = document.querySelector(
                    `.excel-filter-popup[data-filter-field="${args.field}"]` +
                    `[data-filter-type="value"]`);

                return popup?.dataset.filterVisibleOptionCount ===
                    String(args.expectedCount);
            }
            """,
            new
            {
                field,
                expectedCount = 1
            },
            new PageWaitForFunctionOptions
            {
                Timeout = NormalTimeoutMs
            });

        var values = await popup
            .Locator(
                ".excel-filter-option[data-filter-value] > span")
            .AllInnerTextsAsync();

        await CloseValueFilterPopupAsync(field, popup);

        return values
            .Select(value => value.Trim())
            .ToArray();
    }

    public async Task ApplyValueFilterAsync(
        string field,
        IReadOnlyCollection<string> displayValues,
        int expectedRowCount)
    {
        var popup = await OpenValueFilterPopupAsync(field);

        await popup
            .Locator("[data-filter-role=\"select-all\"]")
            .SetCheckedAsync(false);

        var search = popup.Locator(
            "[data-filter-role=\"search\"]");

        foreach (var displayValue in displayValues)
        {
            await search.FillAsync(displayValue);

            await page.WaitForFunctionAsync(
                """
                args => {
                    const popup = document.querySelector(
                        `.excel-filter-popup[data-filter-field="${args.field}"]` +
                        `[data-filter-type="value"]`);

                    return popup?.dataset.filterVisibleOptionCount === "1";
                }
                """,
                new { field },
                new PageWaitForFunctionOptions
                {
                    Timeout = NormalTimeoutMs
                });

            var option = popup
                .Locator(
                    ".excel-filter-option[data-filter-value]")
                .Filter(
                    new LocatorFilterOptions
                    {
                        HasTextString = displayValue
                    });

            E2ETestAssert.Equal(
                1,
                await option.CountAsync(),
                $"Value filter '{field}' did not expose exactly one '{displayValue}' option.");

            await option
                .Locator("input[type=\"checkbox\"]")
                .SetCheckedAsync(true);
        }

        await popup
            .Locator("[data-filter-role=\"apply\"]")
            .ClickAsync();

        await WaitForActiveRowCountAsync(expectedRowCount);
        await WaitForValueFilterStateAsync(field, true);
    }

    public async Task ClearValueFilterAsync(
        string field,
        int expectedRowCount)
    {
        var popup = await OpenValueFilterPopupAsync(field);

        await popup
            .Locator("[data-filter-role=\"clear\"]")
            .ClickAsync();

        await WaitForActiveRowCountAsync(expectedRowCount);
        await WaitForValueFilterStateAsync(field, false);
    }

    public async Task ApplyAmountFilterAsync(
        string field,
        string minimum,
        string maximum,
        bool includeBlank,
        int expectedRowCount)
    {
        var popup = await OpenAmountFilterPopupAsync(field);

        await popup
            .Locator("[data-filter-role=\"min\"]")
            .FillAsync(minimum);

        await popup
            .Locator("[data-filter-role=\"max\"]")
            .FillAsync(maximum);

        await popup
            .Locator("[data-filter-role=\"include-blank\"]")
            .SetCheckedAsync(includeBlank);

        await popup
            .Locator("[data-filter-role=\"apply\"]")
            .ClickAsync();

        await WaitForActiveRowCountAsync(expectedRowCount);
        await WaitForAmountFilterStateAsync(field, true);
    }

    public async Task ClearAmountFilterAsync(
        string field,
        int expectedRowCount)
    {
        var popup = await OpenAmountFilterPopupAsync(field);

        await popup
            .Locator("[data-filter-role=\"clear\"]")
            .ClickAsync();

        await WaitForActiveRowCountAsync(expectedRowCount);
        await WaitForAmountFilterStateAsync(field, false);
    }

    public async Task<long[]> GetActiveAmountCentsAsync(string field)
    {
        return await page.EvaluateAsync<long[]>(
            """
            args => {
                const api = window.tabulatorTest;
                const table = api?.tables?.[args.tableId];

                if (!api || !table) {
                    return [];
                }

                return table.getRows('active').map(row => {
                    const parsed = api.parseAmount(
                        row.getData()?.[args.field]
                    );

                    return parsed.valid && !parsed.empty
                        ? parsed.cents
                        : null;
                }).filter(value => value !== null);
            }
            """,
            new
            {
                tableId = TableId,
                field
            });
    }

    public async Task<string> GetHeaderControlSnapshotAsync(
        params string[] fields)
    {
        return await page.EvaluateAsync<string>(
            """
            args => {
                const api = window.tabulatorTest;
                const table = api?.tables?.[args.tableId];

                if (!table) {
                    return '';
                }

                return args.fields.map(field => {
                    const element = table
                        .getColumn(field)
                        ?.getElement?.();

                    return [
                        field,
                        element?.querySelectorAll(
                            '.tabulator-header-popup-button'
                        ).length ?? -1,
                        element?.querySelectorAll(
                            '.tabulator-col-sorter-element'
                        ).length ?? -1
                    ].join(':');
                }).join('|');
            }
            """,
            new
            {
                tableId = TableId,
                fields
            });
    }

    public async Task SortFinancialColumnAsync(
        string field,
        string direction)
    {
        var sorted = await page.EvaluateAsync<bool>(
            """
            async args => {
                const api = window.tabulatorTest;
                const table = api?.tables?.[args.tableId];
                const column = table?.getColumn(args.field);
                const title = column
                    ?.getElement?.()
                    ?.querySelector('.tabulator-col-sorter-element');

                if (!table || !column || !title) {
                    return false;
                }

                const readSorter = () => {
                    const sorters = table.getSorters();
                    const sorter = sorters[0];

                    return {
                        count: sorters.length,
                        field:
                            sorter?.field ??
                            sorter?.column?.getField?.() ??
                            '',
                        direction: sorter?.dir ?? ''
                    };
                };

                for (let attempt = 0; attempt < 4; attempt++) {
                    const current = readSorter();

                    if (
                        current.count === 1 &&
                        current.field === args.field &&
                        current.direction === args.direction
                    ) {
                        return true;
                    }

                    title.dispatchEvent(
                        new MouseEvent('click', {
                            bubbles: true,
                            cancelable: true,
                            view: window
                        })
                    );

                    await new Promise(resolve =>
                        window.requestAnimationFrame(() =>
                            window.requestAnimationFrame(resolve)
                        )
                    );
                }

                const finalSorter = readSorter();

                return (
                    finalSorter.count === 1 &&
                    finalSorter.field === args.field &&
                    finalSorter.direction === args.direction
                );
            }
            """,
            new
            {
                tableId = TableId,
                field,
                direction
            });

        E2ETestAssert.True(
            sorted,
            $"Could not sort financial column '{field}' {direction} through its header.");
    }

    public async Task ClearSortAsync()
    {
        await page.EvaluateAsync(
            """
            tableId => {
                window.tabulatorTest
                    ?.tables?.[tableId]
                    ?.clearSort?.();
            }
            """,
            TableId);

        await page.WaitForFunctionAsync(
            """
            tableId => {
                const table =
                    window.tabulatorTest?.tables?.[tableId];

                return (table?.getSorters?.().length ?? -1) === 0;
            }
            """,
            TableId,
            new PageWaitForFunctionOptions
            {
                Timeout = NormalTimeoutMs
            });
    }

    public async Task<string> GetFirstActiveFinancialRowAsync(
        string field)
    {
        return await page.EvaluateAsync<string>(
            """
            args => {
                const api = window.tabulatorTest;
                const table = api?.tables?.[args.tableId];
                const row = table?.getRows('active')?.[0];
                const data = row?.getData?.();
                const parsed = api?.parseAmount?.(
                    data?.[args.field]
                );

                if (!data || !parsed?.valid || parsed.empty) {
                    return '';
                }

                return [
                    data.id,
                    data.workOrderNumber,
                    data.workTypeCode,
                    parsed.cents
                ].join('|');
            }
            """,
            new
            {
                tableId = TableId,
                field
            });
    }

    public async Task<string> GetSorterSnapshotAsync()
    {
        return await page.EvaluateAsync<string>(
            """
            tableId => {
                const table = window.tabulatorTest?.tables?.[tableId];
                const sorters = table?.getSorters?.() ?? [];
                const sorter = sorters[0];
                const field =
                    sorter?.field ??
                    sorter?.column?.getField?.() ??
                    '';

                return [
                    sorters.length,
                    field,
                    sorter?.dir ?? ''
                ].join('|');
            }
            """,
            TableId);
    }

    private async Task<ILocator> OpenValueFilterPopupAsync(
        string field)
    {
        var opened = await page.EvaluateAsync<bool>(
            """
            args => {
                const api = window.tabulatorTest;
                const table = api?.tables?.[args.tableId];
                const button = table
                    ?.getColumn?.(args.field)
                    ?.getElement?.()
                    ?.querySelector(
                        '.tabulator-header-popup-button');

                if (!button) {
                    return false;
                }

                /*
                 * Dispatch from the page instead of Playwright ClickAsync.
                 * Browser auto-scroll on a header-only element can move the
                 * header independently from the Tabulator body while the
                 * popup is being mounted.
                 */
                button.dispatchEvent(
                    new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    })
                );

                return true;
            }
            """,
            new
            {
                tableId = TableId,
                field
            });

        E2ETestAssert.True(
            opened,
            $"Value filter header button '{field}' was not found.");

        var popup = page.Locator(
            $".excel-filter-popup[data-filter-field='{field}']" +
            "[data-filter-type='value']");

        await popup.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = NormalTimeoutMs
            });

        await popup
            .Locator("[data-filter-role=\"search\"]")
            .WaitForAsync(
                new LocatorWaitForOptions
                {
                    State = WaitForSelectorState.Visible,
                    Timeout = NormalTimeoutMs
                });

        return popup;
    }

    private async Task CloseValueFilterPopupAsync(
        string field,
        ILocator popup)
    {
        var closed = await page.EvaluateAsync<bool>(
            """
            tableId =>
                window.tabulatorFilters
                    ?.closeActivePopup?.(tableId) === true
            """,
            TableId);

        E2ETestAssert.True(
            closed,
            $"Value filter popup '{field}' could not be closed.");

        await popup.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Detached,
                Timeout = NormalTimeoutMs
            });
    }

    private async Task WaitForValueFilterStateAsync(
        string field,
        bool expectedActive)
    {
        await page.WaitForFunctionAsync(
            """
            args => {
                const api = window.tabulatorTest;
                const table = api?.tables?.[args.tableId];
                const state = api?.states?.[args.tableId];
                const definition =
                    window.tabulatorFilters?.getDefinition?.(args.field);
                const values = definition
                    ? state?.externalFilters?.[definition.stateKey]
                    : null;
                const active =
                    Array.isArray(values) && values.length > 0;
                const button = table
                    ?.getColumn?.(args.field)
                    ?.getElement?.()
                    ?.querySelector(
                        '.tabulator-header-popup-button');

                return Boolean(
                    active === args.expectedActive &&
                    button &&
                    button.classList.contains('is-filtered') ===
                        args.expectedActive
                );
            }
            """,
            new
            {
                tableId = TableId,
                field,
                expectedActive
            },
            new PageWaitForFunctionOptions
            {
                Timeout = NormalTimeoutMs
            });
    }

    private async Task<ILocator> OpenAmountFilterPopupAsync(
        string field)
    {
        var headerButton = Grid.Locator(
            $".tabulator-col[tabulator-field='{field}'] " +
            ".tabulator-header-popup-button");

        await headerButton.ClickAsync(
            new LocatorClickOptions
            {
                Force = true
            });

        var popup = page.Locator(
            $".excel-amount-filter-popup[data-filter-field='{field}']");

        await popup.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = NormalTimeoutMs
            });

        return popup;
    }

    private async Task WaitForAmountFilterStateAsync(
        string field,
        bool expectedActive)
    {
        await page.WaitForFunctionAsync(
            """
            args => {
                const api = window.tabulatorTest;
                const table = api?.tables?.[args.tableId];
                const state = api?.states?.[args.tableId];
                const definition =
                    window.tabulatorFilters?.getDefinition?.(args.field);
                const value = definition
                    ? state?.externalFilters?.[definition.stateKey]
                    : null;
                const active =
                    window.tabulatorFilters
                        ?.isAmountFilterActive?.(value) === true;
                const button = table
                    ?.getColumn?.(args.field)
                    ?.getElement?.()
                    ?.querySelector(
                        '.tabulator-header-popup-button'
                    );

                return (
                    active === args.expectedActive &&
                    Boolean(
                        button?.classList.contains('is-filtered')
                    ) === args.expectedActive
                );
            }
            """,
            new
            {
                tableId = TableId,
                field,
                expectedActive
            },
            new PageWaitForFunctionOptions
            {
                Timeout = NormalTimeoutMs
            });
    }

    public async Task SelectContiguousRowsAsync(
        int anchorRowId,
        int rowCount)
    {
        var selected = await page.EvaluateAsync<bool>(
            """
            async args => {
                const api = window.tabulatorTest;
                const table = api?.tables?.[args.tableId];
                const rows = table?.getRows('active') ?? [];
                const anchorIndex = rows.findIndex(
                    row => row.getIndex() === args.anchorRowId
                );

                if (
                    !api ||
                    !table ||
                    anchorIndex < 0 ||
                    args.rowCount < 1
                ) {
                    return false;
                }

                const maximumStart = Math.max(
                    0,
                    rows.length - args.rowCount
                );
                const startIndex = Math.min(
                    anchorIndex,
                    maximumStart
                );
                const endIndex = Math.min(
                    rows.length - 1,
                    startIndex + args.rowCount - 1
                );
                const startRow = rows[startIndex];
                const endRow = rows[endIndex];

                await table.scrollToRow(startRow, 'top', true);

                const startCell = startRow.getCell('basket');
                const endCell = endRow.getCell('basket');

                if (!startCell || !endCell) {
                    return false;
                }

                api.clearTableRanges(args.tableId);
                table.addRange(startCell, endCell);

                await new Promise(
                    resolve => window.requestAnimationFrame(resolve)
                );

                return true;
            }
            """,
            new
            {
                tableId = TableId,
                anchorRowId,
                rowCount
            });

        E2ETestAssert.True(
            selected,
            $"Could not select {rowCount} contiguous rows from row Id {anchorRowId}.");
    }

    public async Task WaitForSelectionAggregateAsync(
        int expectedRowCount,
        int timeoutMs = NormalTimeoutMs)
    {
        await page.WaitForFunctionAsync(
            """
            args => {
                const snapshot =
                    window.tabulatorTest?.getAggregateSnapshot?.(
                        args.tableId
                    );
                const selection = document.getElementById(
                    `${args.tableId}-summary-selection`
                );

                const isExpectedState = Boolean(
                    snapshot?.selection?.rowCount ===
                        args.expectedRowCount &&
                    (
                        args.expectedRowCount === 0
                            ? selection?.hidden === true
                            : selection?.hidden === false
                    )
                );

                if (!isExpectedState || args.expectedRowCount === 0) {
                    return isExpectedState;
                }

                const rect = selection.getBoundingClientRect();

                return Boolean(
                    rect.width > 0 &&
                    rect.height > 0 &&
                    rect.bottom > 0 &&
                    rect.top < window.innerHeight &&
                    rect.right > 0 &&
                    rect.left < window.innerWidth
                );
            }
            """,
            new
            {
                tableId = TableId,
                expectedRowCount
            },
            new PageWaitForFunctionOptions
            {
                Timeout = timeoutMs
            });
    }

    public async Task<SelectionSummaryLayoutSnapshot>
        GetSelectionSummaryLayoutAsync()
    {
        var values = await page.EvaluateAsync<int[]>(
            """
            tableId => {
                const summary = document.getElementById(
                    `${tableId}-summary-selection`
                );
                const host = document.getElementById(
                    `${tableId}-summary-host`
                );
                const grid = document.getElementById(tableId);
                const card = grid?.closest('.tabulator-card');
                const holder = grid?.querySelector(
                    '.tabulator-tableholder'
                );

                if (!summary || !host || !card || !holder) {
                    return [0, 0, 0, 0];
                }

                const summaryRect = summary.getBoundingClientRect();
                const hostRect = host.getBoundingClientRect();
                const cardRect = card.getBoundingClientRect();
                const holderRect = holder.getBoundingClientRect();
                const tolerance = 2;

                return [
                    summary.hidden === false ? 1 : 0,
                    summaryRect.top >= cardRect.bottom - tolerance
                        ? 1
                        : 0,
                    summaryRect.bottom <= window.innerHeight + tolerance &&
                    summaryRect.top >= -tolerance
                        ? 1
                        : 0,
                    host.contains(summary) &&
                    holderRect.bottom <= summaryRect.top + tolerance
                        ? 1
                        : 0
                ];
            }
            """,
            TableId);

        return new SelectionSummaryLayoutSnapshot(
            IsVisible: values[0] == 1,
            IsBelowGridCard: values[1] == 1,
            IsWithinViewport: values[2] == 1,
            DoesNotCoverTableHolder: values[3] == 1);
    }

    public async Task ClearSelectionAsync()
    {
        await page.EvaluateAsync(
            """
            tableId => {
                window.tabulatorTest?.clearTableRanges?.(tableId);
            }
            """,
            TableId);

        await WaitForSelectionAggregateAsync(0);
    }



    public async Task<int> CountActiveRowsByFieldValueAsync(
        string field,
        string value)
    {
        return await page.EvaluateAsync<int>(
            """
            args => {
                const table = window.tabulatorTest?.tables?.[args.tableId];
                if (!table) return -1;

                return table
                    .getRows('active')
                    .filter(row => String(row.getData()?.[args.field] ?? '') === args.value)
                    .length;
            }
            """,
            new
            {
                tableId = TableId,
                field,
                value
            });
    }

    public async Task InsertRowsAsync(
        int anchorRowId,
        int count,
        string position,
        int expectedRowCount)
    {
        await SelectActiveRowAsync(anchorRowId);

        await page.EvaluateAsync<bool>(
            """
            async args => {
                await window.tabulatorTest.insertRows(
                    args.tableId,
                    args.count,
                    args.position
                );
                return true;
            }
            """,
            new
            {
                tableId = TableId,
                count,
                position
            });

        await WaitForActiveRowCountAsync(expectedRowCount, StressTimeoutMs);
    }

    public async Task<int[]> GetTemporaryRowIdsAsync()
    {
        return await page.EvaluateAsync<int[]>(
            """
            tableId => {
                const table = window.tabulatorTest?.tables?.[tableId];
                if (!table) return [];

                return table
                    .getRows('active')
                    .map(row => Number(row.getIndex()))
                    .filter(rowId => Number.isFinite(rowId) && rowId < 0);
            }
            """,
            TableId);
    }

    public async Task PasteMatrixAsync(
        int startRowId,
        string startField,
        IReadOnlyList<string[]> rows,
        int expectedDirtyRowCount)
    {
        E2ETestAssert.True(rows.Count > 0,
            "Matrix paste requires at least one row.");
        E2ETestAssert.True(rows.All(row => row.Length > 0),
            "Matrix paste rows must contain at least one cell.");

        await page.EvaluateAsync(
            """
            tableId => {
                window.tabulatorTest?.clearTableRanges(tableId);
            }
            """,
            TableId);

        await ClickCellAsync(startRowId, startField);

        var clipboardText = string.Join(
            "\n",
            rows.Select(row => string.Join("\t", row)));

        var pasted = await page.EvaluateAsync<bool>(
            """
            async args => await window.tabulatorTest.pasteClipboardText(
                args.tableId,
                args.clipboardText
            )
            """,
            new
            {
                tableId = TableId,
                clipboardText
            });

        E2ETestAssert.True(
            pasted,
            $"Could not paste {rows.Count:N0} rows starting at '{startField}'.");

        await WaitForDirtyRowCountAsync(
            expectedDirtyRowCount,
            StressTimeoutMs);
    }

    public async Task DeleteSelectedRowsAsync(
        int expectedRemainingRows,
        int expectedDirtyRows)
    {
        EventHandler<IDialog> dialogHandler =
            async (_, dialog) => await dialog.AcceptAsync();

        page.Dialog += dialogHandler;
        try
        {
            await page.EvaluateAsync<bool>(
                """
                async tableId => {
                    await window.tabulatorTest.deleteSelectedRows(tableId);
                    return true;
                }
                """,
                TableId);
        }
        finally
        {
            page.Dialog -= dialogHandler;
        }

        await WaitForActiveRowCountAsync(
            expectedRemainingRows,
            StressTimeoutMs);
        await WaitForDirtyRowCountAsync(
            expectedDirtyRows,
            StressTimeoutMs);
    }

    public async Task<BrowserStructureStressMetrics>
        RunThousandRowStructureStressAsync(
            int anchorRowId,
            int originalRowCount)
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
                await WaitForAggregateRowCountAsync(
                    "visible",
                    originalRowCount,
                    StressTimeoutMs);

                await WaitForDirtyRowCountAsync(
                    1_000,
                    StressTimeoutMs);
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
                await WaitForAggregateRowCountAsync(
                    "visible",
                    originalRowCount,
                    StressTimeoutMs);

                await WaitForDirtyRowCountAsync(
                    0,
                    StressTimeoutMs);
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
                await WaitForAggregateRowCountAsync(
                    "visible",
                    originalRowCount,
                    StressTimeoutMs);

                await WaitForDirtyRowCountAsync(
                    1_000,
                    StressTimeoutMs);
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
                await WaitForAggregateRowCountAsync(
                    "visible",
                    originalRowCount,
                    StressTimeoutMs);

                await WaitForDirtyRowCountAsync(
                    0,
                    StressTimeoutMs);
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

internal sealed record BasketVerticalScrollSnapshot(
    bool HadVerticalOverflow,
    bool ScrollTopIncreased,
    bool ReachedBottom,
    bool LastCardFullyVisible);

internal sealed record BasketDashboardEntrySnapshot(
    int RowCount,
    long RemainingAmountCents);

internal sealed record BasketDashboardLayoutSnapshot(
    int CardCount,
    int VisibleCardCount,
    bool HasHorizontalOverflow,
    int RowCount,
    int MaximumCardHeightPixels,
    int GroupCount,
    bool PanelHasVisibleBoundary);

internal sealed record SelectionSummaryLayoutSnapshot(
    bool IsVisible,
    bool IsBelowGridCard,
    bool IsWithinViewport,
    bool DoesNotCoverTableHolder);


internal sealed record BrowserStructureStressMetrics(
    int ExistingRows,
    int InsertedRows,
    double InsertMilliseconds,
    double UndoMilliseconds,
    double RedoMilliseconds,
    double FinalUndoMilliseconds,
    int FinalRowCount,
    int FinalDirtyRowCount);
