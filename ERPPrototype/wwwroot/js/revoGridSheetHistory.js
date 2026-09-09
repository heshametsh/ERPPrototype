const DEFAULT_MAX_HISTORY_BYTES = 32 * 1024 * 1024;

export class RevoGridSheetHistoryError extends Error {
    constructor(code, message, details = null) {
        super(message);
        this.name = "RevoGridSheetHistoryError";
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

function requireText(value, name) {
    const normalized = String(value ?? "").trim();
    if (!normalized) {
        throw new RevoGridSheetHistoryError(
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

function estimateBytes(value) {
    try {
        const json = JSON.stringify(value);
        return json ? json.length * 2 : 0;
    } catch {
        return 512;
    }
}

function normalizeFocusTarget(target) {
    if (!target) {
        return null;
    }

    const clientKey = requireText(target.clientKey, "focusTarget.clientKey");
    const field = requireText(target.field, "focusTarget.field");

    return { clientKey, field };
}

export function createRevoGridSheetHistory(options = {}) {
    let datasetKey = requireText(
        options.datasetKey ?? "initial",
        "datasetKey"
    );

    const maxHistoryBytes = Math.max(
        1024,
        Number(options.maxHistoryBytes) || DEFAULT_MAX_HISTORY_BYTES
    );

    const undoStack = [];
    const redoStack = [];

    let pendingReplay = null;
    let historyBytes = 0;
    let revision = 0;

    function removeBytes(entry) {
        historyBytes = Math.max(
            0,
            historyBytes - Number(entry?.estimatedBytes || 0)
        );
    }

    function addBytes(entry) {
        historyBytes += Number(entry?.estimatedBytes || 0);
    }

    function clearRedo() {
        for (const entry of redoStack) {
            removeBytes(entry);
        }
        redoStack.length = 0;
    }

    function enforceBudget() {
        // Preserve the newest action even when one large Paste exceeds the
        // configured budget. Losing the most recent Undo would be surprising.
        while (
            historyBytes > maxHistoryBytes &&
            undoStack.length > 1
        ) {
            const removed = undoStack.shift();
            removeBytes(removed);
        }
    }

    function record(input) {
        if (pendingReplay) {
            throw new RevoGridSheetHistoryError(
                "REPLAY_ACTIVE",
                "A new history entry cannot be recorded while Undo/Redo replay is active."
            );
        }

        const entryDatasetKey = requireText(
            input?.datasetKey ?? datasetKey,
            "datasetKey"
        );
        if (entryDatasetKey !== datasetKey) {
            throw new RevoGridSheetHistoryError(
                "DATASET_MISMATCH",
                `History entry belongs to '${entryDatasetKey}', but History owns '${datasetKey}'.`
            );
        }

        const entry = {
            id: createId("history"),
            datasetKey,
            adapterKey: requireText(input?.adapterKey, "adapterKey"),
            kind: requireText(input?.kind ?? "action", "kind"),
            label: String(input?.label ?? "").trim(),
            createdAt: new Date().toISOString(),
            focusTarget: normalizeFocusTarget(input?.focusTarget),
            payload: cloneValue(input?.payload ?? null)
        };

        entry.estimatedBytes = estimateBytes(entry);

        clearRedo();
        undoStack.push(entry);
        addBytes(entry);
        enforceBudget();
        revision += 1;

        return cloneValue(entry);
    }

    function createReplayPlan(direction) {
        if (pendingReplay) {
            throw new RevoGridSheetHistoryError(
                "REPLAY_ACTIVE",
                "Another Undo/Redo replay is already active."
            );
        }

        const stack = direction === "undo" ? undoStack : redoStack;
        const entry = stack.at(-1);
        if (!entry) {
            return null;
        }

        const replayId = createId("replay");
        pendingReplay = {
            id: replayId,
            direction,
            entryId: entry.id,
            entry
        };

        return {
            replayId,
            direction,
            entry: cloneValue(entry)
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
            throw new RevoGridSheetHistoryError(
                "REPLAY_NOT_FOUND",
                `Replay '${normalizedReplayId}' is not active.`
            );
        }

        const { direction, entry } = pendingReplay;
        const from = direction === "undo" ? undoStack : redoStack;
        const to = direction === "undo" ? redoStack : undoStack;
        const currentTop = from.at(-1);

        if (!currentTop || currentTop.id !== entry.id) {
            throw new RevoGridSheetHistoryError(
                "HISTORY_CHANGED",
                "History changed while Undo/Redo was being applied."
            );
        }

        from.pop();
        to.push(entry);
        pendingReplay = null;
        revision += 1;

        return cloneValue(entry);
    }

    function cancelReplay(replayId) {
        const normalizedReplayId = requireText(replayId, "replayId");
        if (!pendingReplay || pendingReplay.id !== normalizedReplayId) {
            return false;
        }

        pendingReplay = null;
        return true;
    }

    function resetDataset(nextDatasetKey) {
        if (pendingReplay) {
            throw new RevoGridSheetHistoryError(
                "REPLAY_ACTIVE",
                "Dataset cannot change while Undo/Redo replay is active."
            );
        }

        datasetKey = requireText(nextDatasetKey, "datasetKey");
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
            undoCount: undoStack.length,
            redoCount: redoStack.length,
            historyBytes,
            maxHistoryBytes,
            historyOverBudget: historyBytes > maxHistoryBytes,
            replayActive: Boolean(pendingReplay)
        };
    }

    function getSnapshot() {
        return {
            undo: undoStack.map(entry => cloneValue(entry)),
            redo: redoStack.map(entry => cloneValue(entry))
        };
    }

    function discardWhere(predicate) {
        if (pendingReplay) {
            throw new RevoGridSheetHistoryError(
                "REPLAY_ACTIVE",
                "History cannot be reconciled while Undo/Redo replay is active."
            );
        }
        if (typeof predicate !== "function") {
            throw new RevoGridSheetHistoryError("INVALID_ARGUMENT", "predicate is required.");
        }

        const discard = stack => {
            for (let index = stack.length - 1; index >= 0; index -= 1) {
                if (!predicate(cloneValue(stack[index]))) continue;
                removeBytes(stack[index]);
                stack.splice(index, 1);
            }
        };
        discard(undoStack);
        discard(redoStack);
        revision += 1;
        return getState();
    }

    return Object.freeze({
        record,
        planUndo,
        planRedo,
        commitReplay,
        cancelReplay,
        resetDataset,
        getState,
        getSnapshot,
        discardWhere
    });
}
