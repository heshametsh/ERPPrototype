import { createRevoGridChangeEngine } from "./revoGridChangeEngine.js";
import {
    normalizeFinancialInput,
    syncWorkOrderDerivedFinancialFields,
    validateFinancialInputs
} from "./workOrderFinancialRules.js?v=20260825-financial-rules-1";

const DATA_CELL_SET_ADAPTER = "data-cell-set";
const FINANCIAL_INPUT_FIELDS = new Set([
    "workOrderValue",
    "partialAmount"
]);

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

function isRangeEditDetail(detail) {
    return Boolean(
        detail &&
        detail.data &&
        typeof detail.data === "object" &&
        detail.models &&
        typeof detail.models === "object"
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

function createIntentId() {
    if (
        globalThis.crypto &&
        typeof globalThis.crypto.randomUUID === "function"
    ) {
        return `paste:${globalThis.crypto.randomUUID()}`;
    }

    return `paste:${Date.now().toString(36)}:${Math.random()
        .toString(36)
        .slice(2)}`;
}

/**
 * Convert RevoGrid's final pre-apply range payload into ERP cell changes.
 * RevoGrid has already clipped the matrix to the available sheet bounds and
 * removed readonly cells before beforerangeedit reaches this bridge.
 */
function buildRangeCaptureChanges(detail) {
    if (!isRangeEditDetail(detail)) {
        return [];
    }

    const changes = [];
    const rowIndexes = Object.keys(detail.data)
        .map(value => Number(value))
        .filter(Number.isInteger)
        .sort((left, right) => left - right);

    for (const rowIndex of rowIndexes) {
        const proposedRow = detail.data[rowIndex] ?? detail.data[String(rowIndex)];
        const model = detail.models[rowIndex] ?? detail.models[String(rowIndex)];

        if (!model) {
            throw new Error(`Paste row ${rowIndex} has no RevoGrid source model.`);
        }

        const clientKey = requireText(model.clientKey, `models[${rowIndex}].clientKey`);
        const fields = Object.keys(proposedRow || {});

        for (const field of fields) {
            if (!field) {
                continue;
            }

            changes.push({
                rowIndex,
                clientKey,
                field,
                before: model[field],
                proposedAfter: proposedRow[field]
            });
        }
    }

    return changes;
}

export function createRevoGridChangeBridge(options) {
    const grid = options?.grid;
    const historyCoordinator = options?.historyCoordinator;
    const allowPaste = Boolean(options?.allowPaste);

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
    let pendingPasteIntent = null;
    const financialErrorsByClientKey = new Map();
    let financialVisualRefreshToken = 0;

    const engine = createRevoGridChangeEngine({ datasetKey });

    const notifyState = () => {
        if (typeof options?.onStateChange === "function") {
            options.onStateChange(getState());
        }
    };

    function refreshFinancialValidation(clientKeys) {
        const keys = clientKeys
            ? new Set(Array.from(clientKeys).map(key => String(key)))
            : new Set(rowByClientKey.keys());

        for (const clientKey of keys) {
            const row = rowByClientKey.get(clientKey);
            if (!row) {
                financialErrorsByClientKey.delete(clientKey);
                continue;
            }

            const errors = validateFinancialInputs(
                row.workOrderValue,
                row.partialAmount
            );

            if (errors.length === 0) {
                financialErrorsByClientKey.delete(clientKey);
            } else {
                financialErrorsByClientKey.set(clientKey, errors);
            }
        }
    }

    async function refreshFinancialVisuals() {
        const token = ++financialVisualRefreshToken;
        const root = grid;

        for (const cell of root.querySelectorAll?.("[data-erp-financial-invalid]") ?? []) {
            cell.removeAttribute("data-erp-financial-invalid");
            cell.removeAttribute("aria-invalid");
            cell.removeAttribute("title");
            cell.style.removeProperty("background-color");
            cell.style.removeProperty("box-shadow");
        }

        if (financialErrorsByClientKey.size === 0) {
            return;
        }

        let visibleRows;
        try {
            visibleRows = await grid.getVisibleSource("rgRow");
        } catch {
            return;
        }

        if (token !== financialVisualRefreshToken) {
            return;
        }

        const columns = Array.isArray(grid.columns)
            ? grid.columns
            : await grid.getColumns?.() ?? [];
        const logicalColumnByField = new Map(
            columns.map((column, index) => [String(column?.prop ?? ""), index])
        );

        for (let rowIndex = 0; rowIndex < (visibleRows?.length ?? 0); rowIndex++) {
            const row = visibleRows[rowIndex];
            const errors = financialErrorsByClientKey.get(String(row?.clientKey));
            if (!errors) {
                continue;
            }

            for (const error of errors) {
                const logicalColumn = logicalColumnByField.get(error.field);
                if (logicalColumn === undefined) {
                    continue;
                }

                const visualColumn = grid.rtl
                    ? columns.length - 1 - logicalColumn
                    : logicalColumn;
                const selector =
                    `[data-rgRow="${rowIndex}"][data-rgCol="${visualColumn}"]`;

                for (const cell of root.querySelectorAll?.(selector) ?? []) {
                    cell.setAttribute("data-erp-financial-invalid", "true");
                    cell.setAttribute("aria-invalid", "true");
                    cell.title = error.message;
                    cell.style.backgroundColor = "#fff1f0";
                    cell.style.boxShadow = "inset 0 0 0 2px #d92d20";
                }
            }
        }
    }

    function scheduleFinancialVisualRefresh() {
        void refreshFinancialVisuals();
    }

    function syncDerivedFinancialFields(operations) {
        const affectedClientKeys = new Set();

        for (const operation of Array.isArray(operations) ? operations : []) {
            if (FINANCIAL_INPUT_FIELDS.has(String(operation?.field ?? ""))) {
                affectedClientKeys.add(
                    requireText(operation?.clientKey, "operation.clientKey")
                );
            }
        }

        let changed = false;

        for (const clientKey of affectedClientKeys) {
            const row = rowByClientKey.get(clientKey);
            if (!row) {
                continue;
            }

            changed =
                syncWorkOrderDerivedFinancialFields(row) || changed;
        }

        refreshFinancialValidation(affectedClientKeys);
        scheduleFinancialVisualRefresh();

        return changed;
    }

    for (const row of rowByClientKey.values()) {
        normalizeFinancialInput(row, "partialAmount");
    }
    refreshFinancialValidation();
    scheduleFinancialVisualRefresh();

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

            syncDerivedFinancialFields(transitions);

            // RevoGrid stays the renderer/state host. Sheet History replay is
            // one controlled data transition; it must not re-enter the user
            // edit capture path as a new action.
            await grid.refresh("rgRow");
            engine.applyExternalChanges(transitions, datasetKey);
            scheduleFinancialVisualRefresh();
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

    function rollbackRecordedChangeSet(changeSet) {
        const reverse = changeSet.operations.map(operation => ({
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

        syncDerivedFinancialFields(reverse);
        engine.applyExternalChanges(reverse, datasetKey);
        void grid.refresh("rgRow");
        notifyState();
    }

    function recordFinalizedChange(result) {
        if (!result?.recorded || !result.changeSet) {
            return;
        }

        const firstOperation = result.changeSet.operations[0];

        try {
            historyCoordinator.record({
                adapterKey: DATA_CELL_SET_ADAPTER,
                kind: result.changeSet.kind,
                label: result.changeSet.label,
                focusTarget: firstOperation
                    ? {
                        clientKey: firstOperation.clientKey,
                        field: firstOperation.field
                    }
                    : null,
                payload: {
                    operations: result.changeSet.operations
                }
            });
        } catch (error) {
            // History is required for every accepted Gate 5B data change. If
            // recording fails, restore the whole transaction rather than leave
            // a silent change the employee cannot Undo.
            rollbackRecordedChangeSet(result.changeSet);
            throw error;
        }
    }

    const beforeEdit = event => {
        if (destroyed || !isCellEditDetail(event.detail)) {
            return;
        }

        if (editLocked || historyCoordinator.getState().replayActive) {
            event.preventDefault();
            return;
        }

        if (activeCapture || pendingPasteIntent) {
            event.preventDefault();
            throw new Error("Another data change is still waiting for its after-event.");
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
            type: "cell-edit",
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

    const clipboardRangePaste = event => {
        if (destroyed) {
            return;
        }

        if (
            !allowPaste ||
            editLocked ||
            historyCoordinator.getState().replayActive ||
            activeCapture ||
            pendingPasteIntent
        ) {
            event.preventDefault();
            return;
        }

        const intentId = createIntentId();
        pendingPasteIntent = { id: intentId };

        // clipboardrangepaste identifies the operation as Paste, but the final
        // data payload is captured later in beforerangeedit. That lets any
        // earlier/later RevoGrid clipboard listener finish its transformation
        // before ERP records old/new values.
        queueMicrotask(() => {
            if (pendingPasteIntent?.id === intentId) {
                pendingPasteIntent = null;
                notifyState();
            }
        });
    };

    const beforeRangeEdit = event => {
        if (destroyed || !isRangeEditDetail(event.detail)) {
            return;
        }

        // Gate 5B-2 qualifies Clipboard Paste only. Autofill and any other
        // range mutation stay blocked until they get their own explicit gate.
        if (
            !allowPaste ||
            !pendingPasteIntent ||
            editLocked ||
            historyCoordinator.getState().replayActive ||
            activeCapture
        ) {
            event.preventDefault();
            return;
        }

        const intent = pendingPasteIntent;
        pendingPasteIntent = null;

        let changes;
        try {
            changes = buildRangeCaptureChanges(event.detail);
        } catch (error) {
            event.preventDefault();
            throw error;
        }

        if (changes.length === 0) {
            return;
        }

        const captureId = engine.captureBefore({
            datasetKey,
            kind: "paste",
            label: "Paste",
            changes: changes.map(change => ({
                clientKey: change.clientKey,
                field: change.field,
                before: change.before,
                proposedAfter: change.proposedAfter
            }))
        });

        activeCapture = {
            type: "paste",
            captureId,
            pasteIntentId: intent.id,
            targets: changes.map(change => ({
                clientKey: change.clientKey,
                field: change.field
            }))
        };

        // If another listener cancels the final Revo range edit after ERP has
        // captured it, discard the capture instead of leaving the engine busy.
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
        if (destroyed) {
            return;
        }

        if (isCellEditDetail(event.detail)) {
            if (!activeCapture || activeCapture.type !== "cell-edit") {
                return;
            }

            const detail = event.detail;
            const clientKey = requireText(
                detail.model.clientKey,
                "model.clientKey"
            );
            const field = requireText(detail.prop, "prop");

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

            normalizeFinancialInput(detail.model, field);

            const result = engine.finalizeAfter(capture.captureId, [{
                clientKey,
                field,
                after: detail.model[field]
            }]);

            const derivedChanged = syncDerivedFinancialFields(
                result?.changeSet?.operations
            );

            recordFinalizedChange(result);

            if (derivedChanged) {
                void grid.refresh("rgRow");
            }

            notifyState();
            return;
        }

        if (!isRangeEditDetail(event.detail)) {
            return;
        }

        if (!activeCapture || activeCapture.type !== "paste") {
            return;
        }

        const capture = activeCapture;
        activeCapture = null;

        for (const target of capture.targets) {
            const row = rowByClientKey.get(target.clientKey);
            if (row) {
                normalizeFinancialInput(row, target.field);
            }
        }

        const applied = capture.targets.map(target => {
            const row = rowByClientKey.get(target.clientKey);
            if (!row) {
                throw new Error(
                    `Row '${target.clientKey}' disappeared before Paste afteredit.`
                );
            }

            return {
                clientKey: target.clientKey,
                field: target.field,
                after: row[target.field]
            };
        });

        const result = engine.finalizeAfter(capture.captureId, applied);
        const derivedChanged = syncDerivedFinancialFields(
            result?.changeSet?.operations
        );

        recordFinalizedChange(result);

        if (derivedChanged) {
            void grid.refresh("rgRow");
        }

        notifyState();
    };

    grid.addEventListener("beforeedit", beforeEdit);
    grid.addEventListener("clipboardrangepaste", clipboardRangePaste);
    grid.addEventListener("beforerangeedit", beforeRangeEdit);
    grid.addEventListener("afteredit", afterEdit);
    grid.addEventListener("viewportscroll", scheduleFinancialVisualRefresh);

    function setEditLocked(locked) {
        editLocked = Boolean(locked);
        notifyState();
    }

    function resetDataset(rows, nextDatasetKey) {
        if (activeCapture || pendingPasteIntent) {
            throw new Error("Dataset cannot change while a data edit is incomplete.");
        }

        const normalizedDatasetKey = requireText(
            nextDatasetKey,
            "datasetKey"
        );
        const nextIndex = buildRowIndex(rows);

        engine.resetDataset(normalizedDatasetKey);
        datasetKey = normalizedDatasetKey;
        rowByClientKey = nextIndex;
        for (const row of rowByClientKey.values()) {
            normalizeFinancialInput(row, "partialAmount");
        }
        financialErrorsByClientKey.clear();
        refreshFinancialValidation();
        editLocked = false;
        scheduleFinancialVisualRefresh();
        notifyState();
    }

    function replaceRowIndex(rows) {
        rowByClientKey = buildRowIndex(rows);
        for (const row of rowByClientKey.values()) {
            normalizeFinancialInput(row, "partialAmount");
        }
        refreshFinancialValidation();
        scheduleFinancialVisualRefresh();
        notifyState();
    }

    function applyRowChanges(changes) {
        const state = engine.applyExternalRowChanges(changes, datasetKey);
        refreshFinancialValidation();
        scheduleFinancialVisualRefresh();
        notifyState();
        return state;
    }

    function getDirtyRows() {
        return engine.getDirtyRows();
    }

    function getState() {
        const financialInvalidRows = Array.from(
            financialErrorsByClientKey.entries()
        ).map(([clientKey, errors]) => ({
            clientKey,
            fields: errors.map(error => error.field),
            messages: errors.map(error => error.message)
        }));

        return {
            ...engine.getState(),
            editLocked,
            pasteEnabled: allowPaste,
            activeDataCapture: Boolean(activeCapture || pendingPasteIntent),
            activeCellCapture: activeCapture?.type === "cell-edit",
            activePasteCapture: activeCapture?.type === "paste" || Boolean(pendingPasteIntent),
            financialInvalidRowCount: financialInvalidRows.length,
            financialInvalidCellCount: financialInvalidRows.reduce(
                (count, row) => count + row.fields.length,
                0
            ),
            financialInvalidRows
        };
    }

    function getDirtyCells() {
        return engine.getDirtyCells();
    }

    function destroy() {
        if (destroyed) {
            return;
        }

        pendingPasteIntent = null;

        if (activeCapture) {
            engine.cancelCapture(activeCapture.captureId);
            activeCapture = null;
        }

        grid.removeEventListener("beforeedit", beforeEdit);
        grid.removeEventListener("clipboardrangepaste", clipboardRangePaste);
        grid.removeEventListener("beforerangeedit", beforeRangeEdit);
        grid.removeEventListener("afteredit", afterEdit);
        grid.removeEventListener("viewportscroll", scheduleFinancialVisualRefresh);
        unregisterDataHistoryAdapter();
        rowByClientKey.clear();
        destroyed = true;
    }

    return Object.freeze({
        setEditLocked,
        resetDataset,
        replaceRowIndex,
        applyRowChanges,
        getState,
        getDirtyCells,
        getDirtyRows,
        destroy
    });
}
