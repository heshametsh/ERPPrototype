import * as nativeGate5A from "./revoGridNativeGate5A.js?v=20260911-rename-lifecycle-1";
import { createRevoGridChangeBridge } from "./revoGridChangeBridge.js?v=20260826-unified-validation-1";
import { createRevoGridHistoryCoordinator } from "./revoGridHistoryCoordinator.js?v=20260821-minimal-reveal-1";
import { createRevoGridHistoryFocus } from "./revoGridHistoryFocus.js?v=20260821-gate5b4-keyboard-sort-1";
import { createRevoGridExcelFilter } from "./revoGridExcelFilter.js?v=20260912-rename-noselect-1";
import { createRevoGridSort } from "./revoGridSort.js?v=20260912-rename-noselect-1";
import { createRevoGridColumnSelection } from "./revoGridColumnSelection.js?v=20260821-gate5b4-keyboard-sort-1";
import { createRevoGridSelectionLifecycle } from "./revoGridSelectionLifecycle.js?v=20260821-gate5b4-keyboard-sort-1";
import { createRevoGridSelectionContext } from "./revoGridSelectionContext.js?v=20260829-gate5b10-header-selection-1";
import { createRevoGridRowStructure } from "./revoGridRowStructure.js?v=20260829-gate5b10-header-selection-1";
import { createRevoGridValidation } from "./revoGridValidation.js?v=20260826-unified-validation-1";
import { createRevoGridPersistenceIdentity } from "./revoGridPersistenceIdentity.js?v=20260826-persistence-identity-1";
import { createRevoGridColumnWorkspace } from "./revoGridColumnWorkspace.js?v=20260911-rename-1";
import { createRevoGridColumnRename } from "./revoGridColumnRename.js?v=20260912-rename-noselect-4";
import { createRevoGridStructureMenu } from "./revoGridStructureMenu.js?v=20260828-context-menu-settle-1";
import { createRevoGridStructureCommands } from "./revoGridStructureCommands.js?v=20260829-gate5b10-header-selection-1";
import {
    createRevoGridHeaderSelectionFeature
} from "./revoGridHeaderSelection.js?v=20260830-selection-core-r2";
import {
    encodeRevoGridPersistenceProjection,
    REVO_GRID_PERSISTENCE_SCHEMA_VERSION
} from "./revoGridPersistenceProjection.js?v=20260901-b12-stream-1";

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
            invalidCells > 0;
    }

    if (state.saveStatusElement) {
        const rowState = state.changeBridge.getState();
        const invalidCells = Number(current.validationInvalidCellCount ?? 0);
        const columnDirty = current.customColumnsChanged === true;

        state.saveStatusElement.textContent = current.saveActive
            ? "Snapshot in flight"
            : columnDirty
                ? "Ready — Custom Column changes included"
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
        state.columnRename?.destroy();
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
    try {
        state.visibleAggregates?.destroy();
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
    const enableVisibleAggregates = Boolean(
        value(options, "enableVisibleAggregates", "EnableVisibleAggregates", false)
    );
    const headerSelectionFeature = enableHeaderMultiSelection
        ? createRevoGridHeaderSelectionFeature()
        : null;
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
        headerSelectionFeature,
        headerSelection: null,
        selectionLifecycle: null,
        selectionContext: null,
        rowStructure: null,
        columnWorkspace: null,
        structureCommands: null,
        structureMenu: null,
        visibleAggregates: null,
        validationOwner,
        persistenceIdentity: Boolean(value(options, "enablePersistenceIdentity", "EnablePersistenceIdentity", false))
            ? createRevoGridPersistenceIdentity({ rows })
            : null,
        enableSaveHandshake,
        activeSaveContract: null,
        crossYearSaveLocked: false,
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
        ),
        visibleAggregateElement: findElement(
            value(options, "visibleAggregateElementId", "VisibleAggregateElementId", "")
        )
    };

    const historyFocus = createRevoGridHistoryFocus({ grid });

    state.historyCoordinator = createRevoGridHistoryCoordinator({
        grid,
        datasetKey: activeDatasetKey,
        canReplay: entry => !state.activeSaveContract ||
            entry?.adapterKey !== "work-orders-column-workspace",
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
                if (filterState?.filterBusy === false) {
                    state.visibleAggregates?.scheduleRefresh?.("filter");
                }
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
                if (rowState?.structureBusy === false) {
                    state.visibleAggregates?.scheduleRefresh?.("row-structure");
                }
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
            structureLocked: () => Boolean(state.activeSaveContract),
            replaceColumns: nextColumns =>
                nativeGate5A.replaceCustomColumns(elementId, nextColumns),
            onStateChange: columnState => {
                renderState(state);
                if (columnState?.columnWorkspaceBusy === false) {
                    state.visibleAggregates?.scheduleRefresh?.("column-workspace");
                }
                if (state.headerSelection && columnState?.columnWorkspaceBusy === false) {
                    void state.headerSelection.reconcileColumns();
                }
            }
        });

        state.columnRename = createRevoGridColumnRename({
            grid,
            columnWorkspace: state.columnWorkspace,
            clearColumnSelection: async () => {
                const headerState = state.headerSelection?.getState?.();
                if (headerState?.kind === "columns") {
                    await state.headerSelection.clear({ clearNative: true });
                    return;
                }

                const snapshot = state.selectionContext?.getSnapshot
                    ? await state.selectionContext.getSnapshot()
                    : null;
                if (snapshot?.kind === "column" || snapshot?.kind === "columns") {
                    state.selectionContext?.clearExplicitSelection?.();
                    await grid.clearFocus();
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

    if (enableVisibleAggregates) {
        if (!state.visibleAggregateElement) {
            throw new Error("Visible Aggregates require their route-owned UI host.");
        }

        const aggregateModule =
            await import("./revoGridVisibleAggregates.js?v=20260902-gate5c1-v3");

        state.visibleAggregates =
            aggregateModule.createRevoGridVisibleAggregates({
                grid,
                host: state.visibleAggregateElement,
                customColumns,
                getCustomColumns: () =>
                    state.columnWorkspace?.getState?.().customColumns ??
                    customColumns,
                hasActiveFilters: () =>
                    Number(
                        state.excelFilter?.getState?.().activeFilterCount ?? 0
                    ) > 0
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

        // Inline Rename is an external text editor. Keep Enter/Escape and
        // ordinary typing owned by its input; Revo must not also interpret
        // those events as sheet keyboard actions.
        if (state.columnRename?.ownsKeyboardEvent?.(original)) {
            event.preventDefault();
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

export async function replaceDataset(elementId, rows, customColumns, workYear) {
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

        // A Work Year owns both its rows and its Custom Column definitions.
        // The old reconnect path replaced rows only, leaving Column Workspace
        // current/baseline on the previous year. That leaked one year's
        // columns into another year and produced false RowVersion/layout
        // conflicts on Delete/Save. Reset the year-owned column baseline
        // before restoring the destination year's Filter/Sort view state.
        if (state.columnWorkspace) {
            await state.columnWorkspace.resetColumns(
                customColumns,
                { preserveViewState: false }
            );
        } else {
            await nativeGate5A.replaceCustomColumns(elementId, customColumns);
            state.excelFilter?.refreshColumns?.();
            state.sortController?.refreshColumns?.();
            if (state.validationOwner?.resetDataset) {
                state.validationOwner.resetDataset(rows, customColumns);
                await state.grid.refresh("rgRow");
            }
        }

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
        await state.visibleAggregates?.refreshVisible?.("dataset-switch");
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
            // Keep only a lightweight lookup over Revo source. The exact
            // changed rows are cloned below, synchronously in the same event
            // turn as Change Engine beginSave(). This preserves B11 snapshot
            // semantics without deep-cloning the whole sheet.
            rowsByClientKey.set(clientKey, row);
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
            row: cloneValue(row)
        });
    }

    const structuralRows = (engineSnapshot.rows ?? []).map(row => ({
        clientKey: row.clientKey,
        baseline: cloneValue(row.baseline),
        current: cloneValue(row.state)
    }));

    const deletedRecords = state.persistenceIdentity?.getDeletedRecords?.(structuralRows) ?? [];

    const columnSnapshot = state.columnWorkspace?.getSaveSnapshot?.() ?? {
        customColumnsChanged: false,
        customColumns: []
    };
    return {
        id: engineSnapshot.id,
        datasetKey: engineSnapshot.datasetKey,
        startedAt: engineSnapshot.startedAt,
        revision: engineSnapshot.revision,
        cells: cloneValue(engineSnapshot.cells ?? []),
        rows: cloneValue(engineSnapshot.rows ?? []),
        changedRecords,
        deletedRecords,
        customColumnsChanged: columnSnapshot.customColumnsChanged === true,
        customColumns: cloneValue(columnSnapshot.customColumns ?? [])
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
    if (!changeState.dirty && current.customColumnsChanged !== true) {
        return { allowed: false, reason: "clean" };
    }
    if (!state.persistenceIdentity) {
        throw new Error("Save handshake requires Persistence Identity.");
    }

    // Fetch the source reference, then freeze the Change Engine generation and
    // clone only the rows that belong to that generation. There is no await
    // between beginSave() and contract construction, so user input cannot
    // interleave and the B11 exact-generation invariant is preserved.
    const handshakeStartedAt = performance.now();
    const sourceFetchStartedAt = performance.now();
    const sourceRows = await state.grid.getSource("rgRow");
    const sourceFetchMs = performance.now() - sourceFetchStartedAt;
    const sourceCloneMs = 0;

    let snapshot = null;
    try {
        const engineBeginStartedAt = performance.now();
        snapshot = state.changeBridge.beginSave();
        const engineBeginMs = performance.now() - engineBeginStartedAt;

        const contractBuildStartedAt = performance.now();
        const contract = buildSaveContractSnapshot(state, snapshot, sourceRows);
        const contractBuildMs = performance.now() - contractBuildStartedAt;

        state.lastSavePerformance = {
            saveId: contract.id,
            sourceRowCount: Array.isArray(sourceRows) ? sourceRows.length : 0,
            dirtyCellCount: contract.cells.length,
            dirtyRowCount: contract.rows.length,
            changedRecordCount: contract.changedRecords.length,
            deletedRecordCount: contract.deletedRecords.length,
            sourceFetchMs,
            sourceCloneMs,
            engineBeginMs,
            contractBuildMs,
            handshakeTotalMs: performance.now() - handshakeStartedAt
        };

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

export function lockCrossYearSave(elementId, saveId, clientKeys) {
    const state = bindings.get(elementId);
    if (!state || !state.activeSaveContract) {
        throw new Error("No Save handshake is active.");
    }
    if (state.activeSaveContract.id !== String(saveId ?? "")) {
        throw new Error("Save handshake id does not match the active snapshot.");
    }

    const targetKeys = new Set((Array.isArray(clientKeys) ? clientKeys : [])
        .map(key => String(key ?? "").trim())
        .filter(Boolean));

    state.changeBridge.setEditLocked(true);
    state.crossYearSaveLocked = true;

    const savedCells = new Map(
        (state.activeSaveContract.cells ?? [])
            .filter(cell => targetKeys.has(String(cell?.clientKey ?? "").trim()))
            .map(cell => [`${cell.clientKey}\u0000${cell.field}`, cell.value])
    );
    const savedRows = new Map(
        (state.activeSaveContract.rows ?? [])
            .filter(row => targetKeys.has(String(row?.clientKey ?? "").trim()))
            .map(row => [row.clientKey, row.state])
    );

    const newerCell = state.changeBridge.getDirtyCells().some(cell => {
        if (!targetKeys.has(String(cell?.clientKey ?? "").trim())) {
            return false;
        }
        const key = `${cell.clientKey}\u0000${cell.field}`;
        return savedCells.has(key) && JSON.stringify(cell.current) !== JSON.stringify(savedCells.get(key));
    });

    const newerRow = state.changeBridge.getDirtyRows().some(row =>
        targetKeys.has(String(row?.clientKey ?? "").trim()) &&
        savedRows.has(row.clientKey) &&
        JSON.stringify(row.current) !== JSON.stringify(savedRows.get(row.clientKey))
    );

    if (newerCell || newerRow) {
        state.crossYearSaveLocked = false;
        state.changeBridge.setEditLocked(false);
        renderState(state);
        return { allowed: false, reason: "newer-cross-year-edit" };
    }

    renderState(state);
    return { allowed: true, reason: null };
}

export function getActiveSaveContractMetrics(elementId, saveId) {
    const state = bindings.get(elementId);
    if (!state || !state.activeSaveContract) {
        throw new Error("No Save handshake is active.");
    }
    if (state.activeSaveContract.id !== String(saveId ?? "")) {
        throw new Error("Save handshake id does not match the active snapshot.");
    }

    const jsonMeasureStartedAt = performance.now();
    const encoder = typeof TextEncoder === "function" ? new TextEncoder() : null;
    const measureJson = value => {
        const json = JSON.stringify(value);
        return {
            chars: json.length,
            bytes: encoder ? encoder.encode(json).length : json.length
        };
    };

    const contractSize = measureJson(state.activeSaveContract);
    const cellsSize = measureJson(state.activeSaveContract.cells ?? []);
    const rowsSize = measureJson(state.activeSaveContract.rows ?? []);
    const changedRecordsSize = measureJson(state.activeSaveContract.changedRecords ?? []);
    const deletedRecordsSize = measureJson(state.activeSaveContract.deletedRecords ?? []);
    const jsonMeasureMs = performance.now() - jsonMeasureStartedAt;

    return cloneValue({
        ...(state.lastSavePerformance ?? {
            saveId: state.activeSaveContract.id
        }),
        jsonMeasureMs,
        contractJsonChars: contractSize.chars,
        contractJsonBytes: contractSize.bytes,
        cellsJsonBytes: cellsSize.bytes,
        rowsJsonBytes: rowsSize.bytes,
        changedRecordsJsonBytes: changedRecordsSize.bytes,
        deletedRecordsJsonBytes: deletedRecordsSize.bytes
    });
}

/**
 * Return the frozen B11 generation as a bounded JS stream. The full B11
 * contract stays browser-local for Accept/Reject reconciliation; C# receives
 * only the persistence projection needed by WorkOrderService.
 *
 * This projection is also the future offline-sync boundary: it has a schema
 * version and stable ClientKey/Id/RowVersion identity, but no IndexedDB or
 * server idempotency semantics are introduced in B12.
 */
export function getActiveSavePersistenceStream(elementId, saveId) {
    const state = bindings.get(elementId);
    if (!state || !state.activeSaveContract) {
        throw new Error("No Save handshake is active.");
    }
    if (state.activeSaveContract.id !== String(saveId ?? "")) {
        throw new Error("Save handshake id does not match the active snapshot.");
    }

    const startedAt = performance.now();
    const { projection, bytes } =
        encodeRevoGridPersistenceProjection(state.activeSaveContract);

    state.lastPersistenceProjectionMetrics = {
        saveId: projection.id,
        schemaVersion: projection.schemaVersion,
        changedRecordCount: projection.changedRecords.length,
        deletedRecordCount: projection.deletedRecords.length,
        bytes: bytes.byteLength,
        buildMs: performance.now() - startedAt
    };

    return bytes;
}

export function getActiveSaveId(elementId) {
    const state = bindings.get(elementId);
    return state?.activeSaveContract?.id ?? null;
}

export function getActiveSavePersistenceMetrics(elementId, saveId) {
    const state = bindings.get(elementId);
    if (!state || !state.activeSaveContract) {
        throw new Error("No Save handshake is active.");
    }
    if (state.activeSaveContract.id !== String(saveId ?? "")) {
        throw new Error("Save handshake id does not match the active snapshot.");
    }

    return cloneValue(state.lastPersistenceProjectionMetrics ?? {
        saveId: state.activeSaveContract.id,
        schemaVersion: REVO_GRID_PERSISTENCE_SCHEMA_VERSION,
        changedRecordCount: 0,
        deletedRecordCount: 0,
        bytes: 0,
        buildMs: 0
    });
}

export function getActiveSaveContract(elementId, saveId) {
    const state = bindings.get(elementId);
    if (!state || !state.activeSaveContract) {
        throw new Error("No Save handshake is active.");
    }
    if (state.activeSaveContract.id !== String(saveId ?? "")) {
        throw new Error("Save handshake id does not match the active snapshot.");
    }
    return cloneValue(state.activeSaveContract);
}

export async function acceptRealDbSaveResult(elementId, saveId, result = {}) {
    const state = bindings.get(elementId);
    if (!state || !state.activeSaveContract) {
        throw new Error("No Save handshake is active.");
    }
    if (state.activeSaveContract.id !== String(saveId ?? "")) {
        throw new Error("Save handshake id does not match the active snapshot.");
    }

    const contract = state.activeSaveContract;
    const savedCustomColumns = Array.isArray(result.savedCustomColumns)
        ? result.savedCustomColumns
        : [];
    const savedRows = Array.isArray(result.savedRows) ? result.savedRows : [];
    const removedClientKeys = (Array.isArray(result.removedClientKeys) ? result.removedClientKeys : [])
        .map(key => String(key ?? "").trim())
        .filter(Boolean);
    const changedByKey = new Map(
        (contract.changedRecords ?? []).map(record => [String(record?.clientKey ?? "").trim(), record])
    );

    const source = await state.grid.getSource("rgRow");
    const sourceRows = Array.isArray(source) ? source : [];
    const sourceByKey = new Map(
        sourceRows.map(row => [String(row?.clientKey ?? "").trim(), row])
    );
    const sourceByDatabaseId = new Map(
        sourceRows
            .map(row => [Number(row?.id ?? 0), row])
            .filter(([id]) => Number.isInteger(id) && id > 0)
    );

    // The server owns database Id/RowVersion, while ClientKey is browser-owned.
    // A Custom Column delete can update rows only because their custom JSON was
    // cleaned. Those implicit rows are intentionally absent from the compact
    // changedRecords projection, so resolve their ClientKey locally by Id.
    const resolvedSavedRows = savedRows.map(saved => {
        const id = Number(saved?.id ?? 0);
        const clientKey = String(saved?.clientKey ?? "").trim() ||
            String(sourceByDatabaseId.get(id)?.clientKey ?? "").trim();
        if (!clientKey) {
            throw new Error(`Could not resolve ClientKey for saved database row '${id}'.`);
        }
        return { ...saved, clientKey };
    });

    const acceptedCells = [];
    const acceptedRows = [];

    for (const saved of resolvedSavedRows) {
        const clientKey = saved.clientKey;
        const currentRow = sourceByKey.get(clientKey);
        const snapshotRow = changedByKey.get(clientKey)?.row;
        if (!currentRow) {
            continue;
        }

        // Persistence identity is server-authoritative even when a newer edit
        // happened while SQL was running. This also advances RowVersion for a
        // row changed implicitly by Custom Column value cleanup.
        currentRow.id = Number(saved.id ?? currentRow.id ?? 0);
        currentRow.rowVersion = String(saved.rowVersion ?? currentRow.rowVersion ?? "");

        // Implicit server-side cleanup rows were not Dirty in this Save
        // generation. Do not accept/overwrite their business cells; only their
        // persistence identity needed reconciliation.
        if (!snapshotRow) {
            continue;
        }

        const fields = new Set(changedByKey.get(clientKey)?.changedFields ?? []);
        fields.add("displayOrder");
        for (const field of fields) {
            if (!(field in saved) || !(field in snapshotRow)) {
                continue;
            }
            const serverValue = cloneValue(saved[field]);
            acceptedCells.push({ clientKey, field, value: serverValue });
            if (JSON.stringify(currentRow[field]) === JSON.stringify(snapshotRow[field])) {
                currentRow[field] = cloneValue(serverValue);
            }
        }

        // Custom fields are returned as normal custom_xxx properties. They may
        // not be present in changedFields after server mapping to CustomValues,
        // so reconcile every custom property that existed in the snapshot.
        for (const [field, snapshotValue] of Object.entries(snapshotRow)) {
            if (!field.startsWith("custom_") || !(field in saved)) {
                continue;
            }
            const serverValue = cloneValue(saved[field]);
            acceptedCells.push({ clientKey, field, value: serverValue });
            if (JSON.stringify(currentRow[field]) === JSON.stringify(snapshotValue)) {
                currentRow[field] = cloneValue(serverValue);
            }
        }

        acceptedRows.push({
            clientKey,
            state: { exists: true, displayOrder: Number(saved.displayOrder ?? snapshotRow.displayOrder ?? 0) }
        });
    }

    const deletedByKey = new Map(
        (contract.deletedRecords ?? []).map(record => [
            String(record?.clientKey ?? "").trim(),
            record
        ])
    );
    const removedDatabaseIds = removedClientKeys
        .map(clientKey => {
            const changedId = Number(changedByKey.get(clientKey)?.row?.id ?? 0);
            const deletedId = Number(deletedByKey.get(clientKey)?.id ?? 0);
            const identityId = Number(state.persistenceIdentity?.getIdentity?.(clientKey)?.id ?? 0);
            return changedId > 0 ? changedId : deletedId > 0 ? deletedId : identityId;
        })
        .filter(id => Number.isInteger(id) && id > 0);

    state.persistenceIdentity?.acceptSaveResult?.({
        savedRows: resolvedSavedRows,
        savedRowMappings: resolvedSavedRows
            .filter(row => Number(row?.id ?? 0) > 0)
            .map(row => ({ clientKey: row.clientKey, databaseId: row.id })),
        removedRowIds: removedDatabaseIds
    });

    // A persisted Delete can be undone while its older Save generation is in
    // flight. Once SQL accepts that older Delete, the deleted ClientKey owns no
    // database identity anymore. A row already restored in the browser must be
    // rebased to Id=0/RowVersion=""; a later Undo will get the same temporary
    // identity through Row Structure's prepareRowForReplay hook.
    const deletedSnapshotKeys = new Set(deletedByKey.keys());
    if (deletedSnapshotKeys.size > 0) {
        const sourceAfterIdentityAcceptance = await state.grid.getSource("rgRow");
        for (const currentRow of Array.isArray(sourceAfterIdentityAcceptance)
            ? sourceAfterIdentityAcceptance
            : []) {
            const clientKey = String(currentRow?.clientKey ?? "").trim();
            if (!deletedSnapshotKeys.has(clientKey)) {
                continue;
            }
            const reconciled = state.persistenceIdentity?.prepareRowForReplay?.(currentRow);
            currentRow.id = Number(reconciled?.id ?? 0);
            currentRow.rowVersion = String(reconciled?.rowVersion ?? "");
        }
    }

    // A normal Delete was already removed by the employee action that created
    // the snapshot, so never remove its ClientKey again during acceptance: an
    // in-flight Undo may have legitimately restored it. Cross-year rows were
    // not structurally deleted by the employee and therefore must be removed
    // from the source dataset after the confirmed server move succeeds.
    const keysToRemoveFromSource = removedClientKeys
        .filter(clientKey => !deletedSnapshotKeys.has(clientKey));

    // Complete all potentially failing Revo/view work before accepting the
    // Change Engine generation. If this stage fails after SQL commit, the same
    // server result can be applied again without executing SQL a second time.
    if (keysToRemoveFromSource.length > 0) {
        await state.rowStructure?.removeAcceptedRows?.(keysToRemoveFromSource);
        await state.headerSelection?.reconcileVisibleRows?.();
    } else {
        await state.grid.refresh("rgRow");
    }
    await state.visibleAggregates?.refreshVisible?.("save-reconcile");

    if (contract.customColumnsChanged === true) {
        state.columnWorkspace?.acceptSavedColumns?.(savedCustomColumns);
        state.historyCoordinator.discardWhere(entry =>
            entry?.adapterKey === "work-orders-column-workspace"
        );
    }

    const accepted = state.changeBridge.acceptSave(saveId, {
        cells: acceptedCells,
        rows: acceptedRows
    });
    state.activeSaveContract = null;
    state.lastPersistenceProjectionMetrics = null;

    if (state.crossYearSaveLocked) {
        state.crossYearSaveLocked = false;
        state.changeBridge.setEditLocked(false);
    }
    renderState(state);
    const current = combinedState(state);
    return {
        saveId: accepted.id,
        dirty: Boolean(current.dirty),
        dirtyCount: Number(current.dirtyCount ?? 0),
        saveActive: Boolean(current.saveActive),
        removedRowCount: removedClientKeys.length,
        rowCount: Number(state.rowStructure?.getState?.().rowCount ?? source.length)
    };
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
    state.lastPersistenceProjectionMetrics = null;
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
    state.lastPersistenceProjectionMetrics = null;
    if (state.crossYearSaveLocked) {
        state.crossYearSaveLocked = false;
        state.changeBridge.setEditLocked(false);
    }
    renderState(state);
    return rejected;
}

export function clearSheetHistory(elementId) {
    const state = bindings.get(elementId);
    if (!state) {
        throw new Error(`Gate 5B state '${elementId}' was not found.`);
    }
    state.historyCoordinator.resetDataset(state.changeBridge.getState().datasetKey);
    renderState(state);
    return state.historyCoordinator.getState();
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


