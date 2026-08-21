import { createRevoGridChangeEngine } from "./revoGridChangeEngine.js";

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

export function createRevoGridChangeBridge(options) {
    const grid = options?.grid;
    if (!grid || typeof grid.addEventListener !== "function") {
        throw new Error("A RevoGrid element is required.");
    }

    let datasetKey = requireText(options?.datasetKey, "datasetKey");
    let rowByClientKey = buildRowIndex(options?.rows);
    let editLocked = false;
    let destroyed = false;
    let activeCapture = null;

    const engine = createRevoGridChangeEngine({
        datasetKey,
        maxHistoryBytes: options?.maxHistoryBytes
    });

    const notifyState = () => {
        if (typeof options?.onStateChange === "function") {
            options.onStateChange(getState());
        }
    };

    const beforeEdit = event => {
        if (destroyed || !isCellEditDetail(event.detail)) {
            return;
        }

        if (editLocked) {
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
        // remove our pending capture before it can block Undo/Save later.
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

        engine.finalizeAfter(capture.captureId, [{
            clientKey,
            field,
            after: detail.model[field]
        }]);

        notifyState();
    };

    grid.addEventListener("beforeedit", beforeEdit);
    grid.addEventListener("afteredit", afterEdit);

    async function replay(direction) {
        if (destroyed || editLocked) {
            return false;
        }

        const plan = direction === "undo"
            ? engine.planUndo()
            : engine.planRedo();

        if (!plan) {
            return false;
        }

        const backups = [];

        try {
            for (const operation of plan.operations) {
                const row = rowByClientKey.get(operation.clientKey);
                if (!row) {
                    throw new Error(
                        `Row '${operation.clientKey}' is not present in the active dataset.`
                    );
                }

                backups.push({
                    row,
                    field: operation.field,
                    value: row[operation.field]
                });

                row[operation.field] = operation.value;
            }

            // RevoGrid's source array keeps the same row object references.
            // Refresh redraws the viewport without replacing the full source,
            // so Sort/Filter ownership remains inside RevoGrid.
            await grid.refresh("rgRow");
            engine.commitReplay(plan.replayId);
            notifyState();
            return true;
        } catch (error) {
            for (const backup of backups) {
                backup.row[backup.field] = backup.value;
            }

            engine.cancelReplay(plan.replayId);

            try {
                await grid.refresh("rgRow");
            } catch {
            }

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
        rowByClientKey.clear();
        destroyed = true;
    }

    return Object.freeze({
        undo,
        redo,
        setEditLocked,
        resetDataset,
        getState,
        getDirtyCells,
        destroy
    });
}
