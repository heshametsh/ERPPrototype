import * as nativeGate5A from "./revoGridNativeGate5A.js?v=20260829-gate5b10-header-selection-plugin-1";
import { createRevoGridChangeBridge } from "./revoGridChangeBridge.js?v=20260826-unified-validation-1";
import { createRevoGridHistoryCoordinator } from "./revoGridHistoryCoordinator.js?v=20260821-minimal-reveal-1";
import { createRevoGridHistoryFocus } from "./revoGridHistoryFocus.js?v=20260821-gate5b4-keyboard-sort-1";
import { createRevoGridExcelFilter } from "./revoGridExcelFilter.js?v=20260828-structure-workspace-2";
import { createRevoGridSort } from "./revoGridSort.js?v=20260828-structure-workspace-2";
import { createRevoGridColumnSelection } from "./revoGridColumnSelection.js?v=20260821-gate5b4-keyboard-sort-1";
import { createRevoGridSelectionLifecycle } from "./revoGridSelectionLifecycle.js?v=20260821-gate5b4-keyboard-sort-1";
import { createRevoGridSelectionContext } from "./revoGridSelectionContext.js?v=20260829-gate5b10-header-selection-1";
import { createRevoGridRowStructure } from "./revoGridRowStructure.js?v=20260829-gate5b10-header-selection-1";
import { createRevoGridValidation } from "./revoGridValidation.js?v=20260826-unified-validation-1";
import { createRevoGridPersistenceIdentity } from "./revoGridPersistenceIdentity.js?v=20260826-persistence-identity-1";
import { createRevoGridColumnWorkspace } from "./revoGridColumnWorkspace.js?v=20260829-gate5b10-header-selection-1";
import { createRevoGridStructureMenu } from "./revoGridStructureMenu.js?v=20260828-context-menu-settle-1";
import { createRevoGridStructureCommands } from "./revoGridStructureCommands.js?v=20260829-gate5b10-header-selection-1";
import {
    createRevoGridHeaderSelectionFeature
} from "./revoGridHeaderSelection.js?v=20260829-gate5b10-header-selection-plugin-1";

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

function mergeRenderProperties(existing, extra) {
    if (!existing) return extra;
    if (!extra) return existing;

    const normalizeClass = value => typeof value === "string"
        ? { [value]: true }
        : (value ?? {});

    return {
        ...existing,
        ...extra,
        ...(existing.class || extra.class ? {
            class: {
                ...normalizeClass(existing.class),
                ...normalizeClass(extra.class)
            }
        } : {}),
        ...(existing.style || extra.style ? {
            style: {
                ...(existing.style ?? {}),
                ...(extra.style ?? {})
            }
        } : {})
    };
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

function cloneValue(value) {
    if (value === undefined) {
        return undefined;
    }

    if (typeof structuredClone === "function") {
        try {
            return structuredClone(value);
        } catch {
        }
    }

    return JSON.parse(JSON.stringify(value));
}

function combinedState(state) {
    const changeState = state.changeBridge.getState();
    const columnState = state.columnWorkspace?.getState?.() ?? {};
    const columnDirty = columnState.customColumnsChanged === true;
    return {
        ...changeState,
        ...state.historyCoordinator.getState(),
        ...(state.validationOwner?.getSummaryState?.() ?? {}),
        ...columnState,
        dirty: Boolean(changeState.dirty || columnDirty),
        dirtyCount: Number(changeState.dirtyCount ?? 0) + (columnDirty ? 1 : 0)
    };
}

function renderState(state) {
    const current = combinedState(state);
    const filterBusy = Boolean(state.excelFilter?.getState().filterBusy);
    const sortBusy = Boolean(state.sortController?.getState().sortBusy);
    const structureBusy = Boolean(
        state.rowStructure?.getState().structureBusy ||
        state.columnWorkspace?.getState().columnWorkspaceBusy
    );

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

    if (state.financialErrorElement) {
        const unified = Boolean(state.validationOwner);
        const invalidRows = Number(unified
            ? current.validationInvalidRowCount ?? 0
            : current.financialInvalidRowCount ?? 0);
        const invalidCells = Number(unified
            ? current.validationInvalidCellCount ?? 0
            : current.financialInvalidCellCount ?? 0);
        state.financialErrorElement.textContent = invalidCells > 0
            ? unified
                ? `Validation errors ${invalidCells} in ${invalidRows} rows — Save blocked`
                : `Financial errors ${invalidCells} in ${invalidRows} rows — Save blocked`
            : unified
                ? "Validation valid"
                : "Financial inputs valid";
        state.financialErrorElement.dataset.invalid = invalidCells > 0
            ? "true"
            : "false";
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

    if (state.saveButton) {
        const rowDirty = Boolean(state.changeBridge.getState().dirty);
        const invalidCells = Number(current.validationInvalidCellCount ?? 0);
        const columnDirty = current.customColumnsChanged === true;
        // Keep Save clickable while the grid is otherwise available.
        // An active Revo editor can contain the user's newest value before the
        // Change Engine is Dirty. Clicking Save moves focus away from the editor;
        // applyOnClose commits that value through Revo's native edit lifecycle,
        // then beginSaveHandshake decides whether there is anything to save.
        state.saveButton.disabled =
            !state.enableSaveHandshake ||
            state.datasetSwitchActive ||
            filterBusy ||
            sortBusy ||
            structureBusy ||
            current.editLocked ||
            current.replayActive ||
            current.saveActive ||
            invalidCells > 0 ||
            columnDirty;
    }

    if (state.saveStatusElement) {
        const rowState = state.changeBridge.getState();
        const invalidCells = Number(current.validationInvalidCellCount ?? 0);
        const columnDirty = current.customColumnsChanged === true;

        state.saveStatusElement.textContent = current.saveActive
            ? "Snapshot in flight"
            : columnDirty
                ? "Row Save blocked by pending Custom Column changes"
                : invalidCells > 0
                    ? "Save blocked by validation"
                    : rowState.dirty
                        ? `Ready — ${rowState.dirtyCount} row/cell changes`
                        : "No row changes";
        state.saveStatusElement.dataset.saveActive = current.saveActive
            ? "true"
            : "false";
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
        state.headerSelection?.destroy();
    } catch {
    }

    try {
        state.structureMenu?.destroy();
    } catch {
    }

    try {
        state.columnWorkspace?.destroy();
    } catch {
    }

    try {
        state.rowStructure?.destroy();
    } catch {
    }

    try {
        state.selectionContext?.destroy();
    } catch {
    }

    try {
        state.historyCoordinator.destroy();
    } catch {
    }

    try {
        state.validationOwner?.destroy();
    } catch {
    }

    try {
        state.persistenceIdentity?.destroy();
    } catch {
    }

    bindings.delete(elementId);
}

export async function initialize(elementId, rows, customColumns, options) {
    await destroyBinding(elementId);
    validateClientKeys(rows);

    const enableUnifiedValidation = Boolean(
        value(options, "enableUnifiedValidation", "EnableUnifiedValidation", false)
    );
    const enableHeaderMultiSelection = Boolean(
        value(options, "enableHeaderMultiSelection", "EnableHeaderMultiSelection", false)
    );
    const enableSaveHandshake = Boolean(
        value(options, "enableSaveHandshake", "EnableSaveHandshake", false)
    );
    const headerSelectionFeature = enableHeaderMultiSelection
        ? createRevoGridHeaderSelectionFeature()
        : null;
    const headerSelectionModel = headerSelectionFeature?.model ?? null;
    const validationOwner = enableUnifiedValidation
        ? createRevoGridValidation({
            rows,
            customColumns,
            basketValues: value(options, "basketValues", "BasketValues", [])
        })
        : null;
    const configuredPlugins = value(options, "plugins", "Plugins", []);
    const nativeOptions = {
        ...options,
        ...(validationOwner || headerSelectionFeature ? {
            validationCellProperties: props => mergeRenderProperties(
                validationOwner?.getCellProperties?.(props),
                headerSelectionFeature?.cellProperties?.(props)
            )
        } : {}),
        ...(enableSaveHandshake ? {
            applyOnClose: true
        } : {}),
        ...(headerSelectionFeature ? {
            columnPropertiesProvider: props =>
                headerSelectionFeature.columnProperties(props),
            rowHeaderCellProperties: props =>
                headerSelectionFeature.rowHeaderCellProperties(props),
            plugins: [
                ...(Array.isArray(configuredPlugins) ? configuredPlugins : []),
                headerSelectionFeature.Plugin
            ]
        } : {})
    };

    try {
        await nativeGate5A.initialize(
            elementId,
            rows,
            customColumns,
            nativeOptions
        );
    } catch (error) {
        validationOwner?.destroy();
        throw error;
    }

    const host = document.getElementById(elementId);
    const grid = host?.querySelector("revo-grid");
    if (!grid) {
        validationOwner?.destroy();
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
        headerSelectionModel,
        headerSelectionFeature,
        headerSelection: null,
        selectionLifecycle: null,
        selectionContext: null,
        rowStructure: null,
        columnWorkspace: null,
        structureCommands: null,
        structureMenu: null,
        validationOwner,
        persistenceIdentity: Boolean(value(options, "enablePersistenceIdentity", "EnablePersistenceIdentity", false))
            ? createRevoGridPersistenceIdentity({ rows })
            : null,
        enableSaveHandshake,
        activeSaveContract: null,
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
        financialErrorElement: findElement(
            value(options, "financialErrorElementId", "FinancialErrorElementId", "")
        ),
        rowCountElement: findElement(
            value(options, "rowCountElementId", "RowCountElementId", "")
        ),
        saveButton: findElement(
            value(options, "saveButtonId", "SaveButtonId", "")
        ),
        saveStatusElement: findElement(
            value(options, "saveStatusElementId", "SaveStatusElementId", "")
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
        allowRangeClear: Boolean(
            value(options, "enableRangeClear", "EnableRangeClear", false)
        ),
        validationOwner: state.validationOwner,
        onStateChange: () => renderState(state)
    });

    state.selectionLifecycle = createRevoGridSelectionLifecycle({ grid });
    if (Boolean(value(options, "enableSelectionContext", "EnableSelectionContext", false))) {
        state.selectionContext = createRevoGridSelectionContext({ grid });
    }

    if (state.headerSelectionFeature) {
        if (!state.selectionContext) {
            throw new Error("Header multi-selection requires Selection Context.");
        }

        const providers = await grid.getProviders();
        state.headerSelection =
            providers?.plugins?.getByClass?.(state.headerSelectionFeature.Plugin) ??
            state.headerSelectionFeature.getPlugin();
        if (!state.headerSelection) {
            throw new Error("Header Selection plugin was not registered by RevoGrid.");
        }

        state.headerSelection.setSelectionContext?.(state.selectionContext);
        state.selectionContext.setSemanticSelectionProvider(state.headerSelection);
    }

    if (Boolean(value(options, "enableExcelFilter", "EnableExcelFilter", false))) {
        state.excelFilter = createRevoGridExcelFilter({
            grid,
            rows,
            datasetKey: activeDatasetKey,
            historyCoordinator: state.historyCoordinator,
            selectionLifecycle: state.selectionLifecycle,
            onStateChange: filterState => {
                renderState(state);
                if (state.headerSelection && filterState?.filterBusy === false) {
                    void state.headerSelection.reconcileVisibleRows();
                }
            }
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
        if (!state.headerSelection) {
            state.columnSelection = createRevoGridColumnSelection({
                grid,
                selectionContext: state.selectionContext
            });
        }
    }

    const enableStructureWorkspace = Boolean(
        value(options, "enableStructureWorkspace", "EnableStructureWorkspace", false)
    );

    if (Boolean(value(options, "enableRowStructure", "EnableRowStructure", false))) {
        state.rowStructure = createRevoGridRowStructure({
            grid,
            rows,
            datasetKey: activeDatasetKey,
            historyCoordinator: state.historyCoordinator,
            changeBridge: state.changeBridge,
            excelFilter: state.excelFilter,
            sortController: state.sortController,
            persistenceIdentity: state.persistenceIdentity,
            selectionContext: state.selectionContext,
            externalMenu: enableStructureWorkspace,
            onStateChange: rowState => {
                renderState(state);
                if (state.headerSelection && rowState?.structureBusy === false) {
                    void state.headerSelection.reconcileVisibleRows();
                }
            }
        });
    }

    if (enableStructureWorkspace) {
        if (!state.rowStructure || !state.selectionContext) {
            throw new Error("Structure Workspace requires Row Structure and Selection Context.");
        }

        state.columnWorkspace = createRevoGridColumnWorkspace({
            grid,
            customColumns,
            historyCoordinator: state.historyCoordinator,
            validationOwner: state.validationOwner,
            selectionContext: state.selectionContext,
            excelFilter: state.excelFilter,
            sortController: state.sortController,
            replaceColumns: nextColumns =>
                nativeGate5A.replaceCustomColumns(elementId, nextColumns),
            onStateChange: columnState => {
                renderState(state);
                if (state.headerSelection && columnState?.columnWorkspaceBusy === false) {
                    void state.headerSelection.reconcileColumns();
                }
            }
        });

        state.structureCommands = createRevoGridStructureCommands({
            rowStructure: state.rowStructure,
            columnWorkspace: state.columnWorkspace,
            selectionContext: state.selectionContext
        });

        state.structureMenu = createRevoGridStructureMenu({
            grid,
            structureCommands: state.structureCommands
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

    // Busy operations take precedence over Dirty. During a Save handshake the
    // user may already have newer unsaved edits, so both saveActive and dirty
    // can be true at the same time. A dataset switch must report the active
    // Save as the blocking reason instead of telling the user to save again.
    if (
        current.activeDataCapture ||
        current.replayActive ||
        current.saveActive ||
        state.excelFilter?.getState().filterBusy ||
        state.sortController?.getState().sortBusy ||
        state.rowStructure?.getState().structureBusy ||
        state.columnWorkspace?.getState().columnWorkspaceBusy
    ) {
        return { allowed: false, reason: "busy" };
    }

    if (current.dirty) {
        return { allowed: false, reason: "dirty" };
    }

    // A year switch replaces the entire Work Orders dataset. Selection never
    // crosses that boundary: clear semantic selection plus Revo focus/range
    // before the source starts changing.
    state.selectionContext?.clearExplicitSelection?.();
    await state.headerSelection?.clear?.({ refresh: false });
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
        state.persistenceIdentity?.replaceRows?.(rows);
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

async function settleNativeEditorBeforeSave(state) {
    // Gate 5B-11 enables Revo's public applyOnClose contract. Clicking the
    // external Save button therefore closes an active editor through Revo's
    // own lifecycle before the Change Engine snapshot is taken.
    await new Promise(resolve => requestAnimationFrame(() => resolve()));
    await new Promise(resolve => requestAnimationFrame(() => resolve()));

    const deadline = performance.now() + 1_500;
    while (state.changeBridge.getState().activeDataCapture) {
        if (performance.now() >= deadline) {
            throw new Error("The active Revo edit did not settle before Save.");
        }
        await new Promise(resolve => setTimeout(resolve, 10));
    }
}

function buildSaveContractSnapshot(state, engineSnapshot, sourceRows) {
    const rowsByClientKey = new Map();
    for (const row of Array.isArray(sourceRows) ? sourceRows : []) {
        const clientKey = String(row?.clientKey ?? "").trim();
        if (clientKey) {
            rowsByClientKey.set(clientKey, cloneValue(row));
        }
    }

    const changedFieldsByClientKey = new Map();
    for (const cell of engineSnapshot.cells ?? []) {
        const clientKey = String(cell?.clientKey ?? "").trim();
        const field = String(cell?.field ?? "").trim();
        if (!clientKey || !field) {
            continue;
        }
        if (!changedFieldsByClientKey.has(clientKey)) {
            changedFieldsByClientKey.set(clientKey, new Set());
        }
        changedFieldsByClientKey.get(clientKey).add(field);
    }

    const rowStateByClientKey = new Map(
        (engineSnapshot.rows ?? []).map(row => [
            String(row?.clientKey ?? "").trim(),
            cloneValue(row)
        ])
    );

    const changedClientKeys = new Set([
        ...changedFieldsByClientKey.keys(),
        ...Array.from(rowStateByClientKey.entries())
            .filter(([, row]) => row?.state?.exists)
            .map(([clientKey]) => clientKey)
    ]);

    const changedRecords = [];
    for (const clientKey of changedClientKeys) {
        const row = rowsByClientKey.get(clientKey);
        if (!row) {
            throw new Error(`Save snapshot row '${clientKey}' is not present in Revo source.`);
        }

        changedRecords.push({
            clientKey,
            identity: state.persistenceIdentity?.getIdentity?.(clientKey) ?? null,
            changedFields: Array.from(changedFieldsByClientKey.get(clientKey) ?? []).sort(),
            rowState: rowStateByClientKey.get(clientKey) ?? null,
            row
        });
    }

    const structuralRows = (engineSnapshot.rows ?? []).map(row => ({
        clientKey: row.clientKey,
        baseline: cloneValue(row.baseline),
        current: cloneValue(row.state)
    }));

    const deletedRecords = state.persistenceIdentity?.getDeletedRecords?.(structuralRows) ?? [];

    return {
        id: engineSnapshot.id,
        datasetKey: engineSnapshot.datasetKey,
        startedAt: engineSnapshot.startedAt,
        revision: engineSnapshot.revision,
        cells: cloneValue(engineSnapshot.cells ?? []),
        rows: cloneValue(engineSnapshot.rows ?? []),
        changedRecords,
        deletedRecords
    };
}

export async function beginSaveHandshake(elementId) {
    const state = bindings.get(elementId);
    if (!state || !state.enableSaveHandshake) {
        return { allowed: false, reason: "not-enabled" };
    }

    await settleNativeEditorBeforeSave(state);

    const current = combinedState(state);
    const changeState = state.changeBridge.getState();
    const filterBusy = Boolean(state.excelFilter?.getState().filterBusy);
    const sortBusy = Boolean(state.sortController?.getState().sortBusy);
    const structureBusy = Boolean(
        state.rowStructure?.getState().structureBusy ||
        state.columnWorkspace?.getState().columnWorkspaceBusy
    );

    if (current.saveActive || state.activeSaveContract) {
        return { allowed: false, reason: "save-active" };
    }
    if (state.datasetSwitchActive || current.replayActive || changeState.activeDataCapture || filterBusy || sortBusy || structureBusy) {
        return { allowed: false, reason: "busy" };
    }
    if (Number(current.validationInvalidCellCount ?? 0) > 0) {
        return { allowed: false, reason: "validation" };
    }
    if (current.customColumnsChanged === true) {
        return { allowed: false, reason: "custom-columns-pending" };
    }
    if (!changeState.dirty) {
        return { allowed: false, reason: "clean" };
    }
    if (!state.persistenceIdentity) {
        throw new Error("Save handshake requires Persistence Identity.");
    }

    // Clone Revo source immediately before beginSave. No await occurs between
    // this clone and engine.beginSave(), so the row payload and change
    // generation represent the same browser moment.
    const sourceRows = cloneValue(await state.grid.getSource("rgRow"));
    let snapshot = null;
    try {
        snapshot = state.changeBridge.beginSave();
        const contract = buildSaveContractSnapshot(state, snapshot, sourceRows);
        state.activeSaveContract = contract;
        renderState(state);
        return {
            allowed: true,
            reason: null,
            saveId: contract.id,
            revision: contract.revision,
            dirtyCellCount: contract.cells.length,
            dirtyRowCount: contract.rows.length,
            changedRecordCount: contract.changedRecords.length,
            deletedRecordCount: contract.deletedRecords.length
        };
    } catch (error) {
        if (snapshot?.id) {
            state.changeBridge.rejectSave(snapshot.id);
        }
        state.activeSaveContract = null;
        renderState(state);
        throw error;
    }
}

export function acceptSaveHandshake(elementId, saveId) {
    const state = bindings.get(elementId);
    if (!state || !state.activeSaveContract) {
        throw new Error("No Save handshake is active.");
    }
    if (state.activeSaveContract.id !== String(saveId ?? "")) {
        throw new Error("Save handshake id does not match the active snapshot.");
    }

    const accepted = state.changeBridge.acceptSave(saveId);
    state.activeSaveContract = null;
    renderState(state);
    const current = combinedState(state);
    return {
        saveId: accepted.id,
        dirty: Boolean(current.dirty),
        dirtyCount: Number(current.dirtyCount ?? 0),
        saveActive: Boolean(current.saveActive)
    };
}

export function rejectSaveHandshake(elementId, saveId) {
    const state = bindings.get(elementId);
    if (!state || !state.activeSaveContract) {
        return false;
    }
    if (state.activeSaveContract.id !== String(saveId ?? "")) {
        return false;
    }

    const rejected = state.changeBridge.rejectSave(saveId);
    state.activeSaveContract = null;
    renderState(state);
    return rejected;
}

export function getSaveHandshakeDiagnostics(elementId) {
    const state = bindings.get(elementId);
    if (!state) {
        throw new Error(`Gate 5B state '${elementId}' was not found.`);
    }

    return {
        enabled: state.enableSaveHandshake,
        active: Boolean(state.activeSaveContract),
        contract: cloneValue(state.activeSaveContract),
        changeState: state.changeBridge.getState(),
        combinedState: combinedState(state)
    };
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
        rowStructure: state?.rowStructure?.getState?.() ?? null,
        columnWorkspace: state?.columnWorkspace?.getState?.() ?? null,
        structureCommands: Boolean(state?.structureCommands),
        structureMenu: state?.structureMenu?.getState?.() ?? null,
        headerSelection: state?.headerSelection?.getState?.() ?? null,
        validation: state?.validationOwner?.getState?.() ?? null,
        persistence: state?.persistenceIdentity
            ? {
                ...state.persistenceIdentity.getState(),
                deletedRecords: state.persistenceIdentity.getDeletedRecords(
                    state.changeBridge.getDirtyRows()
                )
            }
            : null,
        saveHandshake: state
            ? {
                enabled: state.enableSaveHandshake,
                active: Boolean(state.activeSaveContract),
                contract: cloneValue(state.activeSaveContract)
            }
            : null
    };
}

export async function destroy(elementId) {
    await destroyBinding(elementId);
    await nativeGate5A.destroy(elementId);
}
