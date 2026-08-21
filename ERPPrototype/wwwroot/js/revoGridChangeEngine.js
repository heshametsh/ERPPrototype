const DEFAULT_MAX_HISTORY_BYTES = 32 * 1024 * 1024;
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

function estimateBytes(value) {
    try {
        const json = JSON.stringify(value);
        return json ? json.length * 2 : 0;
    } catch {
        return 512;
    }
}

function cloneCellChange(change) {
    return {
        type: CELL_SET,
        clientKey: change.clientKey,
        field: change.field,
        before: cloneValue(change.before),
        after: cloneValue(change.after)
    };
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

    const maxHistoryBytes = Math.max(
        1024,
        Number(options.maxHistoryBytes) || DEFAULT_MAX_HISTORY_BYTES
    );

    const trackedCells = new Map();
    const dirtyKeys = new Set();
    const pendingCaptures = new Map();
    const undoStack = [];
    const redoStack = [];

    let pendingReplay = null;
    let pendingSave = null;
    let historyBytes = 0;
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

    function refreshDirtyForKey(key) {
        const tracked = trackedCells.get(key);
        if (!tracked) {
            dirtyKeys.delete(key);
            return;
        }

        if (equals(tracked.current, tracked.baseline)) {
            dirtyKeys.delete(key);
        } else {
            dirtyKeys.add(key);
        }
    }

    function updateCurrent(change, value) {
        const key = cellKey(change.clientKey, change.field);
        let tracked = trackedCells.get(key);

        if (!tracked) {
            tracked = {
                clientKey: change.clientKey,
                field: change.field,
                baseline: cloneValue(change.before),
                current: cloneValue(change.before)
            };
            trackedCells.set(key, tracked);
        }

        tracked.current = cloneValue(value);
        refreshDirtyForKey(key);
    }

    function applyTransactionState(transaction, direction) {
        const useAfter = direction === "redo";

        for (const operation of transaction.operations) {
            if (operation.type !== CELL_SET) {
                throw new RevoGridChangeEngineError(
                    "UNSUPPORTED_OPERATION",
                    `Unsupported operation type '${operation.type}'.`
                );
            }

            updateCurrent(
                operation,
                useAfter ? operation.after : operation.before
            );
        }

        revision += 1;
    }

    function removeTransactionBytes(transaction) {
        historyBytes = Math.max(
            0,
            historyBytes - Number(transaction.estimatedBytes || 0)
        );
    }

    function addTransactionBytes(transaction) {
        historyBytes += Number(transaction.estimatedBytes || 0);
    }

    function clearRedo() {
        for (const transaction of redoStack) {
            removeTransactionBytes(transaction);
        }
        redoStack.length = 0;
    }

    function enforceHistoryBudget() {
        // Keep the newest transaction even when a single large Paste exceeds
        // the configured budget. It is better to keep that action undoable
        // than to silently record an action the employee cannot undo.
        while (
            historyBytes > maxHistoryBytes &&
            undoStack.length > 1
        ) {
            const removed = undoStack.shift();
            removeTransactionBytes(removed);
        }
    }

    function buildTransaction(capture, operations) {
        const transaction = {
            id: createId("tx"),
            datasetKey,
            kind: capture.kind,
            label: capture.label,
            createdAt: new Date().toISOString(),
            operations: operations.map(cloneCellChange)
        };

        transaction.estimatedBytes = estimateBytes(transaction);
        return transaction;
    }

    function captureBefore(input) {
        if (pendingReplay) {
            throw new RevoGridChangeEngineError(
                "REPLAY_ACTIVE",
                "A new user change cannot be captured while an Undo/Redo replay is active."
            );
        }

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
                transaction: null
            };
        }

        // A real user edit after Undo creates a new branch, so Redo history
        // is invalid from this point, matching spreadsheet behavior.
        clearRedo();

        const transaction = buildTransaction(capture, operations);

        for (const operation of transaction.operations) {
            updateCurrent(operation, operation.after);
        }

        undoStack.push(transaction);
        addTransactionBytes(transaction);
        enforceHistoryBudget();
        revision += 1;

        return {
            recorded: true,
            reason: null,
            transaction: cloneValue(transaction)
        };
    }

    function createReplayPlan(direction) {
        if (pendingReplay) {
            throw new RevoGridChangeEngineError(
                "REPLAY_ACTIVE",
                "Another Undo/Redo replay is already active."
            );
        }

        if (pendingCaptures.size > 0) {
            throw new RevoGridChangeEngineError(
                "CAPTURE_ACTIVE",
                "Undo/Redo cannot start while a user edit is waiting for its after-event."
            );
        }

        const stack = direction === "undo" ? undoStack : redoStack;
        const transaction = stack.at(-1);

        if (!transaction) {
            return null;
        }

        const replayId = createId("replay");
        const operations = transaction.operations.map(operation => ({
            type: CELL_SET,
            clientKey: operation.clientKey,
            field: operation.field,
            value: cloneValue(
                direction === "undo"
                    ? operation.before
                    : operation.after
            )
        }));

        pendingReplay = {
            id: replayId,
            direction,
            transactionId: transaction.id,
            transaction
        };

        return {
            replayId,
            direction,
            transactionId: transaction.id,
            operations
        };
    }

    function planUndo() {
        return createReplayPlan("undo");
    }

    function planRedo() {
        return createReplayPlan("redo");
    }

    function commitReplay(replayId) {
        const normalizedReplayId = requireText(replayId, "replayId");

        if (!pendingReplay || pendingReplay.id !== normalizedReplayId) {
            throw new RevoGridChangeEngineError(
                "REPLAY_NOT_FOUND",
                `Replay '${normalizedReplayId}' is not active.`
            );
        }

        const { direction, transaction } = pendingReplay;
        const from = direction === "undo" ? undoStack : redoStack;
        const to = direction === "undo" ? redoStack : undoStack;
        const currentTop = from.at(-1);

        if (!currentTop || currentTop.id !== transaction.id) {
            throw new RevoGridChangeEngineError(
                "HISTORY_CHANGED",
                "History changed while Undo/Redo was being applied."
            );
        }

        from.pop();
        to.push(transaction);
        applyTransactionState(transaction, direction);
        pendingReplay = null;

        return cloneValue(transaction);
    }

    function cancelReplay(replayId) {
        const normalizedReplayId = requireText(replayId, "replayId");

        if (!pendingReplay || pendingReplay.id !== normalizedReplayId) {
            return false;
        }

        pendingReplay = null;
        return true;
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

        if (pendingCaptures.size > 0 || pendingReplay) {
            throw new RevoGridChangeEngineError(
                "ENGINE_BUSY",
                "Save cannot start while an edit or Undo/Redo replay is incomplete."
            );
        }

        const saveId = createId("save");
        const cells = getDirtyCells().map(cell => ({
            clientKey: cell.clientKey,
            field: cell.field,
            baseline: cloneValue(cell.baseline),
            value: cloneValue(cell.current)
        }));

        pendingSave = {
            id: saveId,
            datasetKey,
            startedAt: new Date().toISOString(),
            revision,
            cells
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

        // The server accepted exactly the snapshot sent at beginSave(). If the
        // employee changed a cell while the request was in flight, current stays
        // newer than the accepted baseline and therefore remains Dirty.
        for (const saved of pendingSave.cells) {
            const key = cellKey(saved.clientKey, saved.field);
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

        const accepted = pendingSave;
        pendingSave = null;
        revision += 1;

        return cloneValue(accepted);
    }

    function rejectSave(saveId) {
        const normalizedSaveId = requireText(saveId, "saveId");

        if (!pendingSave || pendingSave.id !== normalizedSaveId) {
            return false;
        }

        pendingSave = null;
        return true;
    }

    function resetDataset(nextDatasetKey, options = {}) {
        const normalizedDatasetKey = requireText(
            nextDatasetKey,
            "datasetKey"
        );

        if (dirtyKeys.size > 0 && options.force !== true) {
            throw new RevoGridChangeEngineError(
                "DIRTY_DATASET",
                "Dataset cannot be replaced while unsaved changes exist."
            );
        }

        if (pendingCaptures.size > 0 || pendingReplay || pendingSave) {
            throw new RevoGridChangeEngineError(
                "ENGINE_BUSY",
                "Dataset cannot be replaced while an edit, replay, or Save is incomplete."
            );
        }

        datasetKey = normalizedDatasetKey;
        trackedCells.clear();
        dirtyKeys.clear();
        pendingCaptures.clear();
        undoStack.length = 0;
        redoStack.length = 0;
        historyBytes = 0;
        revision += 1;

        return getState();
    }

    function getState() {
        return {
            datasetKey,
            revision,
            dirty: dirtyKeys.size > 0,
            dirtyCellCount: dirtyKeys.size,
            undoCount: undoStack.length,
            redoCount: redoStack.length,
            historyBytes,
            maxHistoryBytes,
            historyOverBudget:
                historyBytes > maxHistoryBytes,
            pendingCaptureCount: pendingCaptures.size,
            replayActive: Boolean(pendingReplay),
            saveActive: Boolean(pendingSave)
        };
    }

    function getHistorySnapshot() {
        return {
            undo: undoStack.map(transaction => cloneValue(transaction)),
            redo: redoStack.map(transaction => cloneValue(transaction))
        };
    }

    function isReplayActive() {
        return Boolean(pendingReplay);
    }

    return Object.freeze({
        captureBefore,
        cancelCapture,
        finalizeAfter,
        planUndo,
        planRedo,
        commitReplay,
        cancelReplay,
        beginSave,
        acceptSave,
        rejectSave,
        resetDataset,
        getDirtyCells,
        getState,
        getHistorySnapshot,
        isReplayActive
    });
}
