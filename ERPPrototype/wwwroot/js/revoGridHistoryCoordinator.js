import { createRevoGridSheetHistory } from "./revoGridSheetHistory.js";

const BEFORE_REPLAY_EVENT = "erpbeforesheethistoryreplay";
const AFTER_REPLAY_EVENT = "erpaftersheethistoryreplay";

function requireText(value, name) {
    const normalized = String(value ?? "").trim();
    if (!normalized) {
        throw new Error(`${name} is required.`);
    }
    return normalized;
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
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return value;
    }
}

export function createRevoGridHistoryCoordinator(options) {
    const grid = options?.grid;
    if (!grid || typeof grid.dispatchEvent !== "function") {
        throw new Error("A RevoGrid element is required.");
    }

    let datasetKey = requireText(options?.datasetKey, "datasetKey");
    const adapters = new Map();
    const history = createRevoGridSheetHistory({
        datasetKey,
        maxHistoryBytes: options?.maxHistoryBytes
    });

    let destroyed = false;

    function notifyState() {
        if (typeof options?.onStateChange === "function") {
            options.onStateChange(getState());
        }
    }

    function registerAdapter(adapterKey, adapter) {
        const key = requireText(adapterKey, "adapterKey");
        if (!adapter || typeof adapter.apply !== "function") {
            throw new Error(`History adapter '${key}' requires an apply function.`);
        }
        if (adapters.has(key)) {
            throw new Error(`History adapter '${key}' is already registered.`);
        }

        adapters.set(key, adapter);
        return () => {
            if (adapters.get(key) === adapter) {
                adapters.delete(key);
            }
        };
    }

    function record(entry) {
        if (destroyed) {
            throw new Error("History coordinator is destroyed.");
        }

        const recorded = history.record({
            ...entry,
            datasetKey
        });
        notifyState();
        return recorded;
    }

    async function focusTarget(target) {
        if (!target || destroyed) {
            return false;
        }

        try {
            const visibleRows = await grid.getVisibleSource();
            const y = Array.isArray(visibleRows)
                ? visibleRows.findIndex(row =>
                    String(row?.clientKey ?? "") === target.clientKey)
                : -1;

            if (y < 0) {
                return false;
            }

            const columns = await grid.getColumns();
            const column = Array.isArray(columns)
                ? columns.find(item => String(item?.prop ?? "") === target.field)
                : null;

            if (!column) {
                return false;
            }

            const colType = column.pin || "rgCol";
            const sameTypeColumns = columns.filter(item =>
                (item.pin || "rgCol") === colType);
            const x = sameTypeColumns.findIndex(item =>
                String(item?.prop ?? "") === target.field);

            if (x < 0) {
                return false;
            }

            await grid.scrollToRow(y);
            await grid.scrollToColumnProp(target.field, colType);
            await grid.setCellsFocus(
                { x, y },
                { x, y },
                colType,
                "rgRow"
            );
            return true;
        } catch {
            // Focus is feedback only. A successful data/state Undo must not be
            // rolled back just because a target is currently not focusable.
            return false;
        }
    }

    async function replay(direction) {
        if (destroyed) {
            return false;
        }

        if (history.getState().replayActive) {
            return false;
        }

        const plan = direction === "undo"
            ? history.planUndo()
            : history.planRedo();

        if (!plan) {
            return false;
        }

        // Disable repeat Undo/Redo input while this one action is replaying.
        notifyState();

        const adapter = adapters.get(plan.entry.adapterKey);
        if (!adapter) {
            history.cancelReplay(plan.replayId);
            throw new Error(
                `No Sheet History adapter is registered for '${plan.entry.adapterKey}'.`
            );
        }

        const detail = {
            direction,
            entry: cloneValue(plan.entry)
        };

        const beforeEvent = new CustomEvent(BEFORE_REPLAY_EVENT, {
            detail,
            cancelable: true
        });
        grid.dispatchEvent(beforeEvent);

        if (beforeEvent.defaultPrevented) {
            history.cancelReplay(plan.replayId);
            notifyState();
            return false;
        }

        try {
            await adapter.apply(plan.entry, direction);
            history.commitReplay(plan.replayId);
            notifyState();

            grid.dispatchEvent(new CustomEvent(AFTER_REPLAY_EVENT, {
                detail: {
                    direction,
                    entry: cloneValue(plan.entry)
                }
            }));

            await focusTarget(plan.entry.focusTarget);
            return true;
        } catch (error) {
            history.cancelReplay(plan.replayId);
            notifyState();
            throw error;
        }
    }

    async function undo() {
        return replay("undo");
    }

    async function redo() {
        return replay("redo");
    }

    function resetDataset(nextDatasetKey) {
        datasetKey = requireText(nextDatasetKey, "datasetKey");
        history.resetDataset(datasetKey);
        notifyState();
    }

    function getState() {
        return history.getState();
    }

    function destroy() {
        if (destroyed) {
            return;
        }

        adapters.clear();
        destroyed = true;
    }

    return Object.freeze({
        registerAdapter,
        record,
        undo,
        redo,
        resetDataset,
        getState,
        destroy
    });
}

export const revoGridSheetHistoryEvents = Object.freeze({
    beforeReplay: BEFORE_REPLAY_EVENT,
    afterReplay: AFTER_REPLAY_EVENT
});
