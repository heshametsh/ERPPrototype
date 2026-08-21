import * as nativeGate5A from "./revoGridNativeGate5A.js?v=20260821-explicit-year-final-1";
import { createRevoGridChangeBridge } from "./revoGridChangeBridge.js";

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

function renderState(state) {
    const engineState = state.bridge.getState();

    if (state.statusElement) {
        state.statusElement.textContent = engineState.dirty
            ? `Dirty ${engineState.dirtyCellCount}`
            : "Clean";
        state.statusElement.dataset.dirty = engineState.dirty ? "true" : "false";
    }

    if (state.undoCountElement) {
        state.undoCountElement.textContent = String(engineState.undoCount);
    }

    if (state.redoCountElement) {
        state.redoCountElement.textContent = String(engineState.redoCount);
    }

    if (state.undoButton) {
        state.undoButton.disabled =
            state.datasetSwitchActive ||
            engineState.editLocked ||
            engineState.undoCount === 0;
    }

    if (state.redoButton) {
        state.redoButton.disabled =
            state.datasetSwitchActive ||
            engineState.editLocked ||
            engineState.redoCount === 0;
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
        state.bridge.destroy();
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

    const state = {
        grid,
        bridge: null,
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
        )
    };

    state.bridge = createRevoGridChangeBridge({
        grid,
        rows,
        datasetKey: datasetKey(value(options, "workYear", "WorkYear", 0)),
        onStateChange: () => renderState(state)
    });

    addListener(state, state.undoButton, "click", async () => {
        await state.bridge.undo();
    });

    addListener(state, state.redoButton, "click", async () => {
        await state.bridge.redo();
    });

    // Gate 5B-1 qualifies Cell Edit only. Range mutations (including Paste)
    // must not bypass the Change Engine and create an invisible unsaved state.
    addListener(state, grid, "beforerangeedit", event => {
        event.preventDefault();
    });

    const beforeKeyDown = event => {
        const detail = event.detail;
        const original = detail?.original;

        if (
            !original ||
            !(original.ctrlKey || original.metaKey)
        ) {
            return;
        }

        // KeyboardEvent.code is layout-independent. On an Arabic Windows
        // keyboard, event.key is not "z"/"y" even though the physical
        // Ctrl+Z / Ctrl+Y shortcut was pressed.
        const code = String(original.code || "");
        const key = String(original.key || "").toLowerCase();
        const isZ = code === "KeyZ" || key === "z" || key === "ئ";
        const isY = code === "KeyY" || key === "y" || key === "غ";
        const wantsUndo = isZ && !original.shiftKey;
        const wantsRedo = isY || (isZ && original.shiftKey);

        if (!wantsUndo && !wantsRedo) {
            return;
        }

        // RevoGrid 4.25.2 renders more than one overlay-selection instance.
        // Every overlay listens to the same document KeyboardEvent and emits
        // its own beforekeydown event. One physical Ctrl+Z can therefore reach
        // this binding multiple times. De-duplicate by the original browser
        // KeyboardEvent so one key press replays exactly one transaction.
        if (state.handledHistoryKeyEvents.has(original)) {
            event.preventDefault();
            return;
        }
        state.handledHistoryKeyEvents.add(original);

        // While the text editor itself is open, leave Ctrl+Z/Ctrl+Y to the
        // editor. Grid history starts after the cell edit has been committed.
        if (state.datasetSwitchActive || detail?.edit) {
            return;
        }

        // RevoGrid checks defaultPrevented immediately after beforekeydown,
        // so prevent synchronously and run our replay afterward.
        event.preventDefault();
        original.preventDefault();

        void (wantsUndo
            ? state.bridge.undo()
            : state.bridge.redo());
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

    const engineState = state.bridge.getState();

    if (engineState.dirty) {
        return { allowed: false, reason: "dirty" };
    }

    if (
        engineState.activeCellCapture ||
        engineState.replayActive ||
        engineState.saveActive
    ) {
        return { allowed: false, reason: "busy" };
    }

    state.datasetSwitchActive = true;
    state.bridge.setEditLocked(true);
    renderState(state);

    return { allowed: true, reason: null };
}

export function cancelDatasetSwitch(elementId) {
    const state = bindings.get(elementId);
    if (!state) {
        return;
    }

    state.datasetSwitchActive = false;
    state.bridge.setEditLocked(false);
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

    try {
        validateClientKeys(rows);
        await nativeGate5A.replaceDataset(elementId, rows, workYear);
        state.bridge.resetDataset(rows, datasetKey(workYear));
    } finally {
        state.datasetSwitchActive = false;
        state.bridge.setEditLocked(false);
        renderState(state);
    }
}

export function getChangeState(elementId) {
    const state = bindings.get(elementId);
    if (!state) {
        throw new Error(`Gate 5B-1 state '${elementId}' was not found.`);
    }

    return state.bridge.getState();
}

export function getDirtyCells(elementId) {
    const state = bindings.get(elementId);
    if (!state) {
        throw new Error(`Gate 5B-1 state '${elementId}' was not found.`);
    }

    return state.bridge.getDirtyCells();
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
        changeEngine: state?.bridge.getState() ?? null
    };
}

export async function destroy(elementId) {
    await destroyBinding(elementId);
    await nativeGate5A.destroy(elementId);
}
