const CELL_SET = "cell-set";

export class RevoGridChangeEngineError extends Error {
    constructor(code, message, details = null) {
        super(message);
        this.name = "RevoGridChangeEngineError";
        this.code = code;
        this.details = details;
    }
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

    if (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
    ) {
        return value;
    }

    if (value instanceof Date) {
        return new Date(value.getTime());
    }

    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return String(value);
    }
}

function defaultEquals(left, right) {
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

function requireText(value, name) {
    const normalized = String(value ?? "").trim();
    if (!normalized) {
        throw new RevoGridChangeEngineError(
            "INVALID_ARGUMENT",
            `${name} is required.`
        );
    }

    return normalized;
}

function createId(prefix) {
    if (
        globalThis.crypto &&
        typeof globalThis.crypto.randomUUID === "function"
    ) {
        return `${prefix}:${globalThis.crypto.randomUUID()}`;
    }

    return `${prefix}:${Date.now().toString(36)}:${Math.random()
        .toString(36)
        .slice(2)}`;
}

function cellKey(clientKey, field) {
    return `${clientKey.length}:${clientKey}${field}`;
}

function cloneCellOperation(operation) {
    return {
        type: CELL_SET,
        clientKey: operation.clientKey,
        field: operation.field,
        before: cloneValue(operation.before),
        after: cloneValue(operation.after)
    };
}

function normalizeRowState(input, name) {
    const exists = Boolean(input?.exists);
    return {
        exists,
        displayOrder: exists
            ? Number(input?.displayOrder ?? 0)
            : null
    };
}

function rowStatesEqual(left, right) {
    const a = normalizeRowState(left, "left");
    const b = normalizeRowState(right, "right");
    return a.exists === b.exists &&
        (!a.exists || a.displayOrder === b.displayOrder);
}

export function createRevoGridChangeEngine(options = {}) {
    let datasetKey = requireText(
        options.datasetKey ?? "initial",
        "datasetKey"
    );

    const equals =
        typeof options.equals === "function"
            ? options.equals
            : defaultEquals;

    // Change Engine owns only the current server Baseline/Dirty delta.
    // Undo/Redo history is intentionally owned by Sheet History.
    const trackedCells = new Map();
    const dirtyKeys = new Set();
    const trackedRows = new Map();
    const dirtyRowKeys = new Set();
    const pendingCaptures = new Map();

    let pendingSave = null;
    let revision = 0;

    function assertDataset(expectedDatasetKey) {
        if (
            expectedDatasetKey !== undefined &&
            requireText(expectedDatasetKey, "datasetKey") !== datasetKey
        ) {
            throw new RevoGridChangeEngineError(
                "DATASET_MISMATCH",
                `Change belongs to dataset '${expectedDatasetKey}', but engine owns '${datasetKey}'.`
            );
        }
    }

    function normalizeBeforeChange(change, seen) {
        const clientKey = requireText(change?.clientKey, "clientKey");
        const field = requireText(change?.field, "field");
        const key = cellKey(clientKey, field);

        if (seen.has(key)) {
            throw new RevoGridChangeEngineError(
                "DUPLICATE_CELL",
                `Cell '${clientKey}/${field}' appears more than once in the same capture.`
            );
        }

        seen.add(key);

        return {
            type: CELL_SET,
            key,
            clientKey,
            field,
            before: cloneValue(change.before),
            proposedAfter: cloneValue(change.proposedAfter)
        };
    }

    function normalizeAppliedChange(change, seen) {
        const clientKey = requireText(change?.clientKey, "clientKey");
        const field = requireText(change?.field, "field");
        const key = cellKey(clientKey, field);

        if (seen.has(key)) {
            throw new RevoGridChangeEngineError(
                "DUPLICATE_CELL",
                `Cell '${clientKey}/${field}' appears more than once in the applied result.`
            );
        }

        seen.add(key);

        return {
            key,
            clientKey,
            field,
            after: cloneValue(change.after)
        };
    }

    function isKeyPendingSave(key) {
        return Boolean(
            pendingSave?.cells?.some(cell => cell.key === key)
        );
    }

    function isRowPendingSave(clientKey) {
        return Boolean(
            pendingSave?.rows?.some(row => row.clientKey === clientKey)
        );
    }

    function isCellDirtyRelevant(clientKey) {
        const row = trackedRows.get(clientKey);
        if (!row) {
            return true;
        }

        // A new unsaved row is already structurally Dirty as a whole, while a
        // deleted row is not part of the next update payload. Keep cell state
        // available for History replay, but do not double-count it as Dirty.
        return row.baseline.exists && row.current.exists;
    }

    function refreshCellsForRow(clientKey) {
        for (const [key, tracked] of trackedCells.entries()) {
            if (tracked.clientKey === clientKey) {
                refreshDirtyForKey(key);
            }
        }
    }

    function refreshDirtyForRow(clientKey) {
        const tracked = trackedRows.get(clientKey);
        if (!tracked) {
            dirtyRowKeys.delete(clientKey);
            return;
        }

        if (rowStatesEqual(tracked.current, tracked.baseline)) {
            dirtyRowKeys.delete(clientKey);

            // A row whose Baseline is "does not exist" has been completely
            // undone/cancelled. Any cell tracker for that temporary row is now
            // meaningless and must not become Dirty after the row state is
            // released.
            if (!tracked.baseline.exists && !tracked.current.exists) {
                for (const [key, cell] of trackedCells.entries()) {
                    if (cell.clientKey === clientKey && !isKeyPendingSave(key)) {
                        dirtyKeys.delete(key);
                        trackedCells.delete(key);
                    }
                }
            }

            if (!isRowPendingSave(clientKey)) {
                trackedRows.delete(clientKey);
            }
        } else {
            dirtyRowKeys.add(clientKey);
        }

        refreshCellsForRow(clientKey);
    }

    function refreshDirtyForKey(key) {
        const tracked = trackedCells.get(key);
        if (!tracked) {
            dirtyKeys.delete(key);
            return;
        }

        if (!isCellDirtyRelevant(tracked.clientKey)) {
            dirtyKeys.delete(key);
            return;
        }

        if (equals(tracked.current, tracked.baseline)) {
            dirtyKeys.delete(key);

            // A cell that is back at the server Baseline is no longer part of
            // the live Dirty delta. Keep it temporarily only if an in-flight
            // Save snapshot still needs its current value to resolve safely.
            if (!isKeyPendingSave(key)) {
                trackedCells.delete(key);
            }
            return;
        }

        dirtyKeys.add(key);
    }

    function updateCurrent(operation, expectedBefore, nextValue) {
        const key = cellKey(operation.clientKey, operation.field);
        let tracked = trackedCells.get(key);

        if (!tracked) {
            tracked = {
                clientKey: operation.clientKey,
                field: operation.field,
                baseline: cloneValue(expectedBefore),
                current: cloneValue(expectedBefore)
            };
            trackedCells.set(key, tracked);
        } else if (!equals(tracked.current, expectedBefore)) {
            throw new RevoGridChangeEngineError(
                "STALE_CURRENT",
                `Current value for '${operation.clientKey}/${operation.field}' does not match the expected transition start.`,
                {
                    clientKey: operation.clientKey,
                    field: operation.field,
                    engineCurrent: cloneValue(tracked.current),
                    expectedBefore: cloneValue(expectedBefore)
                }
            );
        }

        tracked.current = cloneValue(nextValue);
        refreshDirtyForKey(key);
    }

    function captureBefore(input) {
        assertDataset(input?.datasetKey);

        const rawChanges = Array.isArray(input?.changes)
            ? input.changes
            : [];

        if (rawChanges.length === 0) {
            throw new RevoGridChangeEngineError(
                "EMPTY_CHANGE",
                "At least one cell change is required."
            );
        }

        const seen = new Set();
        const changes = rawChanges.map(change =>
            normalizeBeforeChange(change, seen)
        );

        for (const change of changes) {
            const tracked = trackedCells.get(change.key);
            if (tracked && !equals(tracked.current, change.before)) {
                throw new RevoGridChangeEngineError(
                    "STALE_BEFORE",
                    `Captured old value for '${change.clientKey}/${change.field}' does not match the engine current value.`,
                    {
                        clientKey: change.clientKey,
                        field: change.field,
                        engineCurrent: cloneValue(tracked.current),
                        capturedBefore: cloneValue(change.before)
                    }
                );
            }
        }

        const captureId = createId("capture");
        pendingCaptures.set(captureId, {
            id: captureId,
            datasetKey,
            kind: requireText(input?.kind ?? "edit", "kind"),
            label: String(input?.label ?? "").trim(),
            changes,
            createdAt: new Date().toISOString()
        });

        return captureId;
    }

    function cancelCapture(captureId) {
        return pendingCaptures.delete(String(captureId ?? ""));
    }

    function finalizeAfter(captureId, appliedChanges) {
        const normalizedCaptureId = requireText(captureId, "captureId");
        const capture = pendingCaptures.get(normalizedCaptureId);

        if (!capture) {
            throw new RevoGridChangeEngineError(
                "CAPTURE_NOT_FOUND",
                `Capture '${normalizedCaptureId}' was not found.`
            );
        }

        assertDataset(capture.datasetKey);

        const rawApplied = Array.isArray(appliedChanges)
            ? appliedChanges
            : [];

        const seen = new Set();
        const normalizedApplied = rawApplied.map(change =>
            normalizeAppliedChange(change, seen)
        );

        const capturedByKey = new Map(
            capture.changes.map(change => [change.key, change])
        );

        const operations = [];

        for (const applied of normalizedApplied) {
            const before = capturedByKey.get(applied.key);
            if (!before) {
                throw new RevoGridChangeEngineError(
                    "AFTER_TARGET_MISMATCH",
                    `Applied cell '${applied.clientKey}/${applied.field}' was not present in the before capture.`
                );
            }

            if (equals(before.before, applied.after)) {
                continue;
            }

            operations.push({
                type: CELL_SET,
                clientKey: applied.clientKey,
                field: applied.field,
                before: cloneValue(before.before),
                after: cloneValue(applied.after)
            });
        }

        pendingCaptures.delete(normalizedCaptureId);

        if (operations.length === 0) {
            return {
                recorded: false,
                reason: "no-op",
                changeSet: null
            };
        }

        for (const operation of operations) {
            updateCurrent(operation, operation.before, operation.after);
        }

        revision += 1;

        return {
            recorded: true,
            reason: null,
            changeSet: {
                id: createId("change"),
                datasetKey,
                kind: capture.kind,
                label: capture.label,
                createdAt: new Date().toISOString(),
                operations: operations.map(cloneCellOperation)
            }
        };
    }

    /**
     * Accept a transition that was applied through the official Sheet History
     * replay path (or another controlled grid adapter). This updates only
     * Baseline/Dirty ownership; it does not create or move History entries.
     */
    function applyExternalChanges(changes, expectedDatasetKey = undefined) {
        assertDataset(expectedDatasetKey);

        const rawChanges = Array.isArray(changes) ? changes : [];
        if (rawChanges.length === 0) {
            return getState();
        }

        const seen = new Set();
        const normalized = rawChanges.map(change => {
            const clientKey = requireText(change?.clientKey, "clientKey");
            const field = requireText(change?.field, "field");
            const key = cellKey(clientKey, field);

            if (seen.has(key)) {
                throw new RevoGridChangeEngineError(
                    "DUPLICATE_CELL",
                    `Cell '${clientKey}/${field}' appears more than once in the same external transition.`
                );
            }
            seen.add(key);

            return {
                type: CELL_SET,
                clientKey,
                field,
                before: cloneValue(change.before),
                after: cloneValue(change.after)
            };
        });

        // Validate every transition before mutating engine state.
        for (const operation of normalized) {
            const key = cellKey(operation.clientKey, operation.field);
            const tracked = trackedCells.get(key);
            if (tracked && !equals(tracked.current, operation.before)) {
                throw new RevoGridChangeEngineError(
                    "STALE_CURRENT",
                    `Current value for '${operation.clientKey}/${operation.field}' does not match the expected transition start.`,
                    {
                        clientKey: operation.clientKey,
                        field: operation.field,
                        engineCurrent: cloneValue(tracked.current),
                        expectedBefore: cloneValue(operation.before)
                    }
                );
            }
        }

        for (const operation of normalized) {
            updateCurrent(operation, operation.before, operation.after);
        }

        revision += 1;
        return getState();
    }

    /**
     * Accept a structural row transition applied by the official row adapter.
     * The Change Engine owns only structural Baseline/Dirty state; RevoGrid
     * remains responsible for rendering and visible row projection.
     */
    function applyExternalRowChanges(changes, expectedDatasetKey = undefined) {
        assertDataset(expectedDatasetKey);

        const rawChanges = Array.isArray(changes) ? changes : [];
        if (rawChanges.length === 0) {
            return getState();
        }

        const seen = new Set();
        const normalized = rawChanges.map(change => {
            const clientKey = requireText(change?.clientKey, "clientKey");
            if (seen.has(clientKey)) {
                throw new RevoGridChangeEngineError(
                    "DUPLICATE_ROW",
                    `Row '${clientKey}' appears more than once in the same structural transition.`
                );
            }
            seen.add(clientKey);

            return {
                clientKey,
                before: normalizeRowState(change?.before, "before"),
                after: normalizeRowState(change?.after, "after")
            };
        });

        for (const operation of normalized) {
            const tracked = trackedRows.get(operation.clientKey);
            if (tracked && !rowStatesEqual(tracked.current, operation.before)) {
                throw new RevoGridChangeEngineError(
                    "STALE_ROW_CURRENT",
                    `Current row state for '${operation.clientKey}' does not match the expected transition start.`,
                    {
                        clientKey: operation.clientKey,
                        engineCurrent: cloneValue(tracked.current),
                        expectedBefore: cloneValue(operation.before)
                    }
                );
            }
        }

        for (const operation of normalized) {
            let tracked = trackedRows.get(operation.clientKey);
            if (!tracked) {
                tracked = {
                    clientKey: operation.clientKey,
                    baseline: cloneValue(operation.before),
                    current: cloneValue(operation.before)
                };
                trackedRows.set(operation.clientKey, tracked);
            }

            tracked.current = cloneValue(operation.after);
            refreshDirtyForRow(operation.clientKey);
        }

        revision += 1;
        return getState();
    }

    function getDirtyRows() {
        const result = [];
        for (const clientKey of dirtyRowKeys) {
            const tracked = trackedRows.get(clientKey);
            if (!tracked) {
                continue;
            }
            result.push({
                clientKey,
                baseline: cloneValue(tracked.baseline),
                current: cloneValue(tracked.current)
            });
        }
        return result;
    }

    function getDirtyCells() {
        const result = [];

        for (const key of dirtyKeys) {
            const tracked = trackedCells.get(key);
            if (!tracked) {
                continue;
            }

            result.push({
                clientKey: tracked.clientKey,
                field: tracked.field,
                baseline: cloneValue(tracked.baseline),
                current: cloneValue(tracked.current)
            });
        }

        return result;
    }

    function beginSave() {
        if (pendingSave) {
            throw new RevoGridChangeEngineError(
                "SAVE_ACTIVE",
                "A Save handshake is already active."
            );
        }

        if (pendingCaptures.size > 0) {
            throw new RevoGridChangeEngineError(
                "ENGINE_BUSY",
                "Save cannot start while a user edit is waiting for its after-event."
            );
        }

        const saveId = createId("save");
        const cells = getDirtyCells().map(cell => ({
            key: cellKey(cell.clientKey, cell.field),
            clientKey: cell.clientKey,
            field: cell.field,
            baseline: cloneValue(cell.baseline),
            value: cloneValue(cell.current)
        }));

        const rows = getDirtyRows().map(row => ({
            clientKey: row.clientKey,
            baseline: cloneValue(row.baseline),
            state: cloneValue(row.current)
        }));

        pendingSave = {
            id: saveId,
            datasetKey,
            startedAt: new Date().toISOString(),
            revision,
            cells,
            rows
        };

        return cloneValue(pendingSave);
    }

    function acceptSave(saveId) {
        const normalizedSaveId = requireText(saveId, "saveId");

        if (!pendingSave || pendingSave.id !== normalizedSaveId) {
            throw new RevoGridChangeEngineError(
                "SAVE_NOT_FOUND",
                `Save '${normalizedSaveId}' is not active.`
            );
        }

        assertDataset(pendingSave.datasetKey);

        const accepted = pendingSave;
        pendingSave = null;

        // Server accepted exactly the snapshot sent by beginSave(). If a newer
        // browser edit exists, it remains current and therefore remains Dirty.
        for (const saved of accepted.cells) {
            const key = saved.key;
            let tracked = trackedCells.get(key);

            if (!tracked) {
                tracked = {
                    clientKey: saved.clientKey,
                    field: saved.field,
                    baseline: cloneValue(saved.value),
                    current: cloneValue(saved.value)
                };
                trackedCells.set(key, tracked);
            } else {
                tracked.baseline = cloneValue(saved.value);
            }

            refreshDirtyForKey(key);
        }

        for (const saved of accepted.rows ?? []) {
            let tracked = trackedRows.get(saved.clientKey);
            if (!tracked) {
                tracked = {
                    clientKey: saved.clientKey,
                    baseline: cloneValue(saved.state),
                    current: cloneValue(saved.state)
                };
                trackedRows.set(saved.clientKey, tracked);
            } else {
                tracked.baseline = cloneValue(saved.state);
            }
            refreshDirtyForRow(saved.clientKey);
        }

        revision += 1;
        return cloneValue(accepted);
    }

    function rejectSave(saveId) {
        const normalizedSaveId = requireText(saveId, "saveId");

        if (!pendingSave || pendingSave.id !== normalizedSaveId) {
            return false;
        }

        const rejected = pendingSave;
        pendingSave = null;

        // Cells that returned to the old Baseline while Save was in flight can
        // now be released because no accepted snapshot needs them anymore.
        for (const saved of rejected.cells) {
            refreshDirtyForKey(saved.key);
        }
        for (const saved of rejected.rows ?? []) {
            refreshDirtyForRow(saved.clientKey);
        }

        return true;
    }

    function resetDataset(nextDatasetKey, options = {}) {
        const normalizedDatasetKey = requireText(
            nextDatasetKey,
            "datasetKey"
        );

        if ((dirtyKeys.size > 0 || dirtyRowKeys.size > 0) && options.force !== true) {
            throw new RevoGridChangeEngineError(
                "DIRTY_DATASET",
                "Dataset cannot be replaced while unsaved changes exist."
            );
        }

        if (pendingCaptures.size > 0 || pendingSave) {
            throw new RevoGridChangeEngineError(
                "ENGINE_BUSY",
                "Dataset cannot be replaced while an edit or Save is incomplete."
            );
        }

        datasetKey = normalizedDatasetKey;
        trackedCells.clear();
        dirtyKeys.clear();
        trackedRows.clear();
        dirtyRowKeys.clear();
        pendingCaptures.clear();
        revision += 1;

        return getState();
    }

    function getState() {
        const dirtyCellCount = dirtyKeys.size;
        const dirtyRowCount = dirtyRowKeys.size;
        return {
            datasetKey,
            revision,
            dirty: dirtyCellCount > 0 || dirtyRowCount > 0,
            dirtyCount: dirtyCellCount + dirtyRowCount,
            dirtyCellCount,
            dirtyRowCount,
            trackedCellCount: trackedCells.size,
            trackedRowCount: trackedRows.size,
            pendingCaptureCount: pendingCaptures.size,
            saveActive: Boolean(pendingSave)
        };
    }

    return Object.freeze({
        captureBefore,
        cancelCapture,
        finalizeAfter,
        applyExternalChanges,
        applyExternalRowChanges,
        beginSave,
        acceptSave,
        rejectSave,
        resetDataset,
        getDirtyCells,
        getDirtyRows,
        getState
    });
}
