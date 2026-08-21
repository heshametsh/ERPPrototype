import { createRevoGridChangeEngine } from "./revoGridChangeEngine.js";

const DATA_CELL_SET_ADAPTER = "data-cell-set";

function requireText(value, name) {
    const normalized = String(value ?? "").trim();
    if (!normalized) {
        throw new Error(`${name} is required.`);
    }

    return normalized;
}

function isCellEditDetail(detail) {
    return Boolean(
        detail &&
        detail.model &&
        typeof detail.prop === "string" &&
        detail.prop.length > 0 &&
        Number.isInteger(detail.rowIndex)
    );
}

function buildRowIndex(rows) {
    const index = new Map();

    for (const row of Array.isArray(rows) ? rows : []) {
        const clientKey = requireText(row?.clientKey, "row.clientKey");
        if (index.has(clientKey)) {
            throw new Error(`Duplicate ClientKey '${clientKey}'.`);
        }

        index.set(clientKey, row);
    }

    return index;
}

function valuesEqual(left, right) {
    if (Object.is(left, right)) {
        return true;
    }

    if (
        (left === null || left === undefined) &&
        (right === null || right === undefined)
    ) {
        return true;
    }

    if (
        typeof left !== "object" ||
        typeof right !== "object" ||
        left === null ||
        right === null
    ) {
        return false;
    }

    try {
        return JSON.stringify(left) === JSON.stringify(right);
    } catch {
        return false;
    }
}

export function createRevoGridChangeBridge(options) {
    const grid = options?.grid;
    const historyCoordinator = options?.historyCoordinator;

    if (!grid || typeof grid.addEventListener !== "function") {
        throw new Error("A RevoGrid element is required.");
    }
    if (
        !historyCoordinator ||
        typeof historyCoordinator.record !== "function" ||
        typeof historyCoordinator.registerAdapter !== "function"
    ) {
        throw new Error("A Sheet History coordinator is required.");
    }

    let datasetKey = requireText(options?.datasetKey, "datasetKey");
    let rowByClientKey = buildRowIndex(options?.rows);
    let editLocked = false;
    let destroyed = false;
    let activeCapture = null;

    const engine = createRevoGridChangeEngine({ datasetKey });

    const notifyState = () => {
        if (typeof options?.onStateChange === "function") {
            options.onStateChange(getState());
        }
    };

    async function applyDataHistoryEntry(entry, direction) {
        const operations = Array.isArray(entry?.payload?.operations)
            ? entry.payload.operations
            : [];

        if (operations.length === 0) {
            return;
        }

        const transitions = operations.map(operation => ({
            clientKey: requireText(operation?.clientKey, "operation.clientKey"),
            field: requireText(operation?.field, "operation.field"),
            before: direction === "undo"
                ? operation.after
                : operation.before,
            after: direction === "undo"
                ? operation.before
                : operation.after
        }));

        const backups = [];

        // Validate the complete replay first. One history transaction must
        // either apply as a whole or not apply at all.
        for (const transition of transitions) {
            const row = rowByClientKey.get(transition.clientKey);
            if (!row) {
                throw new Error(
                    `Row '${transition.clientKey}' is not present in the active dataset.`
                );
            }

            if (!valuesEqual(row[transition.field], transition.before)) {
                throw new Error(
                    `Row '${transition.clientKey}/${transition.field}' no longer matches the expected History state.`
                );
            }
        }

        try {
            for (const transition of transitions) {
                const row = rowByClientKey.get(transition.clientKey);
                backups.push({
                    row,
                    field: transition.field,
                    value: row[transition.field]
                });
                row[transition.field] = transition.after;
            }

            // Keep RevoGrid as the renderer/state host. We do not replace the
            // full source and we do not synthesize a fake user edit. The Sheet
            // History coordinator emits one explicit replay lifecycle that
            // future ERP adapters can observe without recursively recording it.
            await grid.refresh("rgRow");
            engine.applyExternalChanges(transitions, datasetKey);
            notifyState();
        } catch (error) {
            for (const backup of backups) {
                backup.row[backup.field] = backup.value;
            }

            try {
                await grid.refresh("rgRow");
            } catch {
            }

            notifyState();
            throw error;
        }
    }

    const unregisterDataHistoryAdapter =
        historyCoordinator.registerAdapter(DATA_CELL_SET_ADAPTER, {
            apply: applyDataHistoryEntry
        });

    const beforeEdit = event => {
        if (destroyed || !isCellEditDetail(event.detail)) {
            return;
        }

        if (editLocked || historyCoordinator.getState().replayActive) {
            event.preventDefault();
            return;
        }

        if (activeCapture) {
            event.preventDefault();
            throw new Error("A previous cell edit is still waiting for afteredit.");
        }

        const detail = event.detail;
        const clientKey = requireText(
            detail.model.clientKey,
            "model.clientKey"
        );
        const field = requireText(detail.prop, "prop");
        const before = detail.model[field];

        const captureId = engine.captureBefore({
            datasetKey,
            kind: "cell-edit",
            label: field,
            changes: [{
                clientKey,
                field,
                before,
                proposedAfter: detail.val
            }]
        });

        activeCapture = {
            captureId,
            clientKey,
            field
        };

        // RevoGrid dispatches beforeedit synchronously, then applies the model
        // after its own event pipeline. If another listener cancels the edit,
        // remove our pending capture before it can block a later Save/switch.
        queueMicrotask(() => {
            if (
                event.defaultPrevented &&
                activeCapture?.captureId === captureId
            ) {
                engine.cancelCapture(captureId);
                activeCapture = null;
                notifyState();
            }
        });
    };

    const afterEdit = event => {
        if (destroyed || !isCellEditDetail(event.detail)) {
            return;
        }

        const detail = event.detail;
        const clientKey = requireText(
            detail.model.clientKey,
            "model.clientKey"
        );
        const field = requireText(detail.prop, "prop");

        if (!activeCapture) {
            return;
        }

        if (
            activeCapture.clientKey !== clientKey ||
            activeCapture.field !== field
        ) {
            const staleCapture = activeCapture;
            activeCapture = null;
            engine.cancelCapture(staleCapture.captureId);
            throw new Error(
                `afteredit target '${clientKey}/${field}' does not match pending capture '${staleCapture.clientKey}/${staleCapture.field}'.`
            );
        }

        const capture = activeCapture;
        activeCapture = null;

        const result = engine.finalizeAfter(capture.captureId, [{
            clientKey,
            field,
            after: detail.model[field]
        }]);

        if (result.recorded && result.changeSet) {
            try {
                historyCoordinator.record({
                    adapterKey: DATA_CELL_SET_ADAPTER,
                    kind: result.changeSet.kind,
                    label: result.changeSet.label,
                    focusTarget: { clientKey, field },
                    payload: {
                        operations: result.changeSet.operations
                    }
                });
            } catch (error) {
                // History is a required part of an accepted user edit. If it
                // cannot be recorded, restore both the visible row and Dirty
                // state rather than leave an un-undoable silent change.
                const reverse = result.changeSet.operations.map(operation => ({
                    clientKey: operation.clientKey,
                    field: operation.field,
                    before: operation.after,
                    after: operation.before
                }));

                for (const operation of reverse) {
                    const row = rowByClientKey.get(operation.clientKey);
                    if (row) {
                        row[operation.field] = operation.after;
                    }
                }
                engine.applyExternalChanges(reverse, datasetKey);
                void grid.refresh("rgRow");
                notifyState();
                throw error;
            }
        }

        notifyState();
    };

    grid.addEventListener("beforeedit", beforeEdit);
    grid.addEventListener("afteredit", afterEdit);

    function setEditLocked(locked) {
        editLocked = Boolean(locked);
        notifyState();
    }

    function resetDataset(rows, nextDatasetKey) {
        if (activeCapture) {
            throw new Error("Dataset cannot change while a cell edit is incomplete.");
        }

        const normalizedDatasetKey = requireText(
            nextDatasetKey,
            "datasetKey"
        );
        const nextIndex = buildRowIndex(rows);

        engine.resetDataset(normalizedDatasetKey);
        datasetKey = normalizedDatasetKey;
        rowByClientKey = nextIndex;
        editLocked = false;
        notifyState();
    }

    function getState() {
        return {
            ...engine.getState(),
            editLocked,
            activeCellCapture: Boolean(activeCapture)
        };
    }

    function getDirtyCells() {
        return engine.getDirtyCells();
    }

    function destroy() {
        if (destroyed) {
            return;
        }

        if (activeCapture) {
            engine.cancelCapture(activeCapture.captureId);
            activeCapture = null;
        }

        grid.removeEventListener("beforeedit", beforeEdit);
        grid.removeEventListener("afteredit", afterEdit);
        unregisterDataHistoryAdapter();
        rowByClientKey.clear();
        destroyed = true;
    }

    return Object.freeze({
        setEditLocked,
        resetDataset,
        getState,
        getDirtyCells,
        destroy
    });
}
