import * as nativeGate5A from "./revoGridNativeGate5A.js?v=20260821-gate5b5-filter-refresh-1";
import { createRevoGridChangeBridge } from "./revoGridChangeBridge.js?v=20260821-gate5b5-row-structure-2";
import { createRevoGridHistoryCoordinator } from "./revoGridHistoryCoordinator.js?v=20260821-minimal-reveal-1";
import { createRevoGridHistoryFocus } from "./revoGridHistoryFocus.js?v=20260821-gate5b4-keyboard-sort-1";
import { createRevoGridExcelFilter } from "./revoGridExcelFilter.js?v=20260821-gate5b5-filter-refresh-1";
import { createRevoGridSort } from "./revoGridSort.js?v=20260821-gate5b5-row-structure-2";
import { createRevoGridColumnSelection } from "./revoGridColumnSelection.js?v=20260821-gate5b4-keyboard-sort-1";
import { createRevoGridSelectionLifecycle } from "./revoGridSelectionLifecycle.js?v=20260821-gate5b4-keyboard-sort-1";
import { createRevoGridRowStructure } from "./revoGridRowStructure.js?v=20260821-gate5b5-row-structure-2";

const bindings = new Map();

function value(source, camelName, pascalName, fallback = null) {
    if (source && source[camelName] !== undefined) {
        return source[camelName];
    }

    if (source && source[pascalName] !== undefined) {
        return source[pascalName];
    }

    return fallback;
}

function datasetKey(workYear) {
    return `work-orders:${Number(workYear) || 0}`;
}

function validateClientKeys(rows) {
    const seen = new Set();

    for (const row of Array.isArray(rows) ? rows : []) {
        const clientKey = String(row?.clientKey ?? "").trim();
        if (!clientKey) {
            throw new Error("Every Gate 5B-1 row requires a ClientKey.");
        }
        if (seen.has(clientKey)) {
            throw new Error(`Duplicate ClientKey '${clientKey}'.`);
        }
        seen.add(clientKey);
    }
}

function findElement(id) {
    return id ? document.getElementById(id) : null;
}

function combinedState(state) {
    return {
        ...state.changeBridge.getState(),
        ...state.historyCoordinator.getState()
    };
}

function renderState(state) {
    const current = combinedState(state);
    const filterBusy = Boolean(state.excelFilter?.getState().filterBusy);
    const sortBusy = Boolean(state.sortController?.getState().sortBusy);
    const structureBusy = Boolean(state.rowStructure?.getState().structureBusy);

    if (state.statusElement) {
        state.statusElement.textContent = current.dirty
            ? `Dirty ${current.dirtyCount ?? current.dirtyCellCount}`
            : "Clean";
        state.statusElement.dataset.dirty = current.dirty ? "true" : "false";
    }

    if (state.undoCountElement) {
        state.undoCountElement.textContent = String(current.undoCount);
    }

    if (state.redoCountElement) {
        state.redoCountElement.textContent = String(current.redoCount);
    }

    if (state.rowCountElement && state.rowStructure) {
        state.rowCountElement.textContent = Number(
            state.rowStructure.getState().rowCount ?? 0
        ).toLocaleString();
    }

    if (state.undoButton) {
        state.undoButton.disabled =
            state.datasetSwitchActive ||
            filterBusy ||
            sortBusy ||
            structureBusy ||
            current.editLocked ||
            current.replayActive ||
            current.undoCount === 0;
    }

    if (state.redoButton) {
        state.redoButton.disabled =
            state.datasetSwitchActive ||
            filterBusy ||
            sortBusy ||
            structureBusy ||
            current.editLocked ||
            current.replayActive ||
            current.redoCount === 0;
    }
}

function addListener(state, target, type, handler, options) {
    target?.addEventListener(type, handler, options);
    if (target) {
        state.removers.push(() =>
            target.removeEventListener(type, handler, options));
    }
}

async function destroyBinding(elementId) {
    const state = bindings.get(elementId);
    if (!state) {
        return;
    }

    for (const remove of state.removers.splice(0)) {
        try {
            remove();
        } catch {
        }
    }

    try {
        state.changeBridge.destroy();
    } catch {
    }

    try {
        state.excelFilter?.destroy();
    } catch {
    }

    try {
        state.sortController?.destroy();
    } catch {
    }

    try {
        state.columnSelection?.destroy();
    } catch {
    }

    try {
        state.rowStructure?.destroy();
    } catch {
    }

    try {
        state.historyCoordinator.destroy();
    } catch {
    }

    bindings.delete(elementId);
}

export async function initialize(elementId, rows, customColumns, options) {
    await destroyBinding(elementId);
    validateClientKeys(rows);
    await nativeGate5A.initialize(elementId, rows, customColumns, options);

    const host = document.getElementById(elementId);
    const grid = host?.querySelector("revo-grid");
    if (!grid) {
        await nativeGate5A.destroy(elementId);
        throw new Error(`RevoGrid '${elementId}' was not created.`);
    }

    const activeDatasetKey = datasetKey(
        value(options, "workYear", "WorkYear", 0)
    );

    const state = {
        grid,
        historyCoordinator: null,
        changeBridge: null,
        excelFilter: null,
        sortController: null,
        columnSelection: null,
        selectionLifecycle: null,
        rowStructure: null,
        datasetSwitchActive: false,
        handledHistoryKeyEvents: new WeakSet(),
        removers: [],
        statusElement: findElement(
            value(options, "changeStatusElementId", "ChangeStatusElementId", "")
        ),
        undoCountElement: findElement(
            value(options, "undoCountElementId", "UndoCountElementId", "")
        ),
        redoCountElement: findElement(
            value(options, "redoCountElementId", "RedoCountElementId", "")
        ),
        undoButton: findElement(
            value(options, "undoButtonId", "UndoButtonId", "")
        ),
        redoButton: findElement(
            value(options, "redoButtonId", "RedoButtonId", "")
        ),
        rowCountElement: findElement(
            value(options, "rowCountElementId", "RowCountElementId", "")
        )
    };

    const historyFocus = createRevoGridHistoryFocus({ grid });

    state.historyCoordinator = createRevoGridHistoryCoordinator({
        grid,
        datasetKey: activeDatasetKey,
        focusTarget: target => historyFocus.focusTarget(target),
        onStateChange: () => renderState(state)
    });

    state.changeBridge = createRevoGridChangeBridge({
        grid,
        rows,
        datasetKey: activeDatasetKey,
        historyCoordinator: state.historyCoordinator,
        allowPaste: Boolean(value(options, "enablePaste", "EnablePaste", false)),
        onStateChange: () => renderState(state)
    });

    state.selectionLifecycle = createRevoGridSelectionLifecycle({ grid });

    if (Boolean(value(options, "enableExcelFilter", "EnableExcelFilter", false))) {
        state.excelFilter = createRevoGridExcelFilter({
            grid,
            rows,
            datasetKey: activeDatasetKey,
            historyCoordinator: state.historyCoordinator,
            selectionLifecycle: state.selectionLifecycle,
            onStateChange: () => renderState(state)
        });
    }

    if (Boolean(value(options, "enableHeaderActions", "EnableHeaderActions", false))) {
        state.sortController = createRevoGridSort({
            grid,
            datasetKey: activeDatasetKey,
            historyCoordinator: state.historyCoordinator,
            selectionLifecycle: state.selectionLifecycle,
            onStateChange: () => renderState(state)
        });
        state.columnSelection = createRevoGridColumnSelection({ grid });
    }

    if (Boolean(value(options, "enableRowStructure", "EnableRowStructure", false))) {
        state.rowStructure = createRevoGridRowStructure({
            grid,
            rows,
            datasetKey: activeDatasetKey,
            historyCoordinator: state.historyCoordinator,
            changeBridge: state.changeBridge,
            excelFilter: state.excelFilter,
            sortController: state.sortController,
            onStateChange: () => renderState(state)
        });
    }

    addListener(state, state.undoButton, "click", async () => {
        await state.historyCoordinator.undo();
    });

    addListener(state, state.redoButton, "click", async () => {
        await state.historyCoordinator.redo();
    });

    const beforeKeyDown = event => {
        const detail = event.detail;
        const original = detail?.original;

        if (!original) {
            return;
        }

        // The Excel-like filter popup is an external text UI. RevoGrid 4.25.2
        // has several overlay-selection instances listening to document keydown.
        // Cancel each Revo proxy event, but deliberately DO NOT preventDefault()
        // on the original KeyboardEvent so the employee can type normally into
        // Search/checkbox controls without editing the selected sheet cell.
        if (state.excelFilter?.ownsKeyboardEvent?.(original)) {
            event.preventDefault();
            return;
        }

        if (!(original.ctrlKey || original.metaKey)) {
            return;
        }

        // KeyboardEvent.code is layout-independent. On an Arabic Windows
        // keyboard, event.key is not "z"/"y" for the same physical shortcut.
        const code = String(original.code || "");
        const key = String(original.key || "").toLowerCase();
        const isZ = code === "KeyZ" || key === "z" || key === "ئ";
        const isY = code === "KeyY" || key === "y" || key === "غ";
        const wantsUndo = isZ && !original.shiftKey;
        const wantsRedo = isY || (isZ && original.shiftKey);

        if (!wantsUndo && !wantsRedo) {
            return;
        }

        // RevoGrid 4.25.2 has multiple overlay-selection instances. They can
        // emit more than one beforekeydown for one physical key press.
        if (state.handledHistoryKeyEvents.has(original)) {
            event.preventDefault();
            return;
        }
        state.handledHistoryKeyEvents.add(original);

        // While the text editor itself is open, keep Ctrl+Z/Ctrl+Y owned by
        // the editor. Sheet History begins after the cell edit is committed.
        if (state.datasetSwitchActive || detail?.edit) {
            return;
        }

        // A second physical shortcut while one replay is still applying must
        // not start another history move or leak to the browser.
        if (state.historyCoordinator.getState().replayActive) {
            event.preventDefault();
            original.preventDefault();
            return;
        }

        event.preventDefault();
        original.preventDefault();

        void (wantsUndo
            ? state.historyCoordinator.undo()
            : state.historyCoordinator.redo());
    };

    addListener(state, grid, "beforekeydown", beforeKeyDown);

    bindings.set(elementId, state);
    renderState(state);
}

export async function beginDatasetSwitch(elementId) {
    const state = bindings.get(elementId);
    if (!state) {
        return { allowed: false, reason: "not-initialized" };
    }

    const current = combinedState(state);

    if (current.dirty) {
        return { allowed: false, reason: "dirty" };
    }

    if (
        current.activeDataCapture ||
        current.replayActive ||
        current.saveActive ||
        state.excelFilter?.getState().filterBusy ||
        state.sortController?.getState().sortBusy ||
        state.rowStructure?.getState().structureBusy
    ) {
        return { allowed: false, reason: "busy" };
    }

    // A year switch replaces the entire Work Orders dataset. Selection never
    // crosses that boundary: clear cell/range/column selection before the
    // source starts changing.
    await state.grid.clearFocus();

    state.datasetSwitchActive = true;
    state.changeBridge.setEditLocked(true);
    renderState(state);

    return { allowed: true, reason: null };
}

export function cancelDatasetSwitch(elementId) {
    const state = bindings.get(elementId);
    if (!state) {
        return;
    }

    state.datasetSwitchActive = false;
    state.changeBridge.setEditLocked(false);
    renderState(state);
}

export async function replaceDataset(elementId, rows, workYear) {
    const state = bindings.get(elementId);
    if (!state) {
        throw new Error(`Gate 5B-1 state '${elementId}' was not found.`);
    }

    if (!state.datasetSwitchActive) {
        throw new Error("Dataset replacement requires beginDatasetSwitch first.");
    }

    const nextDatasetKey = datasetKey(workYear);

    let filterSuspended = false;
    let sortSuspended = false;

    try {
        validateClientKeys(rows);

        if (state.excelFilter) {
            await state.excelFilter.suspendForDatasetSwitch();
            filterSuspended = true;
        }

        if (state.sortController) {
            await state.sortController.suspendForDatasetSwitch();
            sortSuspended = true;
        }

        await nativeGate5A.replaceDataset(elementId, rows, workYear);

        // Each year remains a separate History dataset. Filter view state is
        // independent: first visit starts clean, while returning to a year in
        // this page session restores that year's filter without restoring its
        // old Undo stack.
        state.changeBridge.resetDataset(rows, nextDatasetKey);
        state.historyCoordinator.resetDataset(nextDatasetKey);

        if (state.excelFilter) {
            await state.excelFilter.resetDataset(rows, nextDatasetKey);
            filterSuspended = false;
        }

        if (state.sortController) {
            await state.sortController.resetDataset(nextDatasetKey);
            sortSuspended = false;
        }

        if (state.rowStructure) {
            await state.rowStructure.resetDataset(rows, nextDatasetKey);
        }
    } catch (error) {
        if (filterSuspended && state.excelFilter) {
            try {
                await state.excelFilter.resumeCurrentDataset();
            } catch {
            }
        }
        if (sortSuspended && state.sortController) {
            try {
                await state.sortController.resumeCurrentDataset();
            } catch {
            }
        }
        throw error;
    } finally {
        state.datasetSwitchActive = false;
        state.changeBridge.setEditLocked(false);
        renderState(state);
    }
}

export function getChangeState(elementId) {
    const state = bindings.get(elementId);
    if (!state) {
        throw new Error(`Gate 5B-1 state '${elementId}' was not found.`);
    }

    return combinedState(state);
}

export function getDirtyCells(elementId) {
    const state = bindings.get(elementId);
    if (!state) {
        throw new Error(`Gate 5B-1 state '${elementId}' was not found.`);
    }

    return state.changeBridge.getDirtyCells();
}

export function getDirtyRows(elementId) {
    const state = bindings.get(elementId);
    if (!state) {
        throw new Error(`Gate 5B state '${elementId}' was not found.`);
    }

    return state.changeBridge.getDirtyRows();
}

export function refreshChangeStateUi(elementId) {
    const state = bindings.get(elementId);
    if (!state) {
        return;
    }

    renderState(state);
}

export async function getDiagnostics(elementId) {
    const native = await nativeGate5A.getDiagnostics(elementId);
    const state = bindings.get(elementId);

    return {
        ...native,
        changeEngine: state ? combinedState(state) : null,
        dirtyRows: state ? state.changeBridge.getDirtyRows() : [],
        dirtyCells: state ? state.changeBridge.getDirtyCells() : [],
        filter: state?.excelFilter?.getState?.() ?? null,
        sort: state?.sortController?.getState?.() ?? null,
        rowStructure: state?.rowStructure?.getState?.() ?? null
    };
}

export async function destroy(elementId) {
    await destroyBinding(elementId);
    await nativeGate5A.destroy(elementId);
}
