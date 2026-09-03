const HISTORY_ADAPTER_KEY = "work-orders-row-structure";
const MENU_STYLE_ID = "erp-revogrid-row-structure-style";
const MENU_CLASS = "erp-revo-row-menu";
const INSERT_DIALOG_CLASS = "erp-revo-insert-rows-dialog";
const DISPLAY_ORDER_STEP = 1_000_000_000;
const FILTER_TRIMMED_TYPE = "filter";
const MAX_INSERT_ROWS = 1000;

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

function createClientKey() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
        return `temp:${globalThis.crypto.randomUUID()}`;
    }
    return `temp:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

function rowKey(row) {
    return requireText(row?.clientKey, "row.clientKey");
}

function displayOrderOf(row) {
    const value = Number(row?.displayOrder ?? 0);
    return Number.isFinite(value) ? Math.trunc(value) : 0;
}

function rowState(row, exists = true) {
    return exists
        ? { exists: true, displayOrder: displayOrderOf(row) }
        : { exists: false, displayOrder: null };
}

function createBlankRow(displayOrder) {
    return {
        clientKey: createClientKey(),
        id: 0,
        displayOrder,
        workOrderNumber: "",
        workTypeCode: "",
        assignmentDate: "",
        workOrderValue: null,
        partialAmount: null,
        remainingAmount: null,
        basket: "",
        rowVersion: ""
    };
}

/**
 * Allocate one integer DisplayOrder. In the normal case it simply uses the
 * midpoint between neighboring rows. If that tiny local gap is exhausted,
 * only a bounded neighborhood is redistributed; the entire sheet is touched
 * only as a last resort.
 */
export function planDisplayOrderInsertion(rows, insertIndex, step = DISPLAY_ORDER_STEP) {
    const source = Array.isArray(rows) ? rows : [];
    const index = Math.max(0, Math.min(source.length, Number(insertIndex) || 0));

    const previous = index > 0 ? displayOrderOf(source[index - 1]) : 0;
    const next = index < source.length ? displayOrderOf(source[index]) : null;

    if (next === null) {
        return {
            newOrder: previous + step,
            adjustments: []
        };
    }

    if (next - previous > 1) {
        return {
            newOrder: previous + Math.floor((next - previous) / 2),
            adjustments: []
        };
    }

    // Expand around the exhausted gap until there is enough integer space to
    // redistribute the local block plus the new row.
    for (let radius = 1; radius <= source.length + 1; radius *= 2) {
        const left = Math.max(0, index - radius);
        const right = Math.min(source.length, index + radius);
        const leftBoundary = left > 0 ? displayOrderOf(source[left - 1]) : 0;
        const rightBoundary = right < source.length
            ? displayOrderOf(source[right])
            : null;
        const existingCount = right - left;
        const slots = existingCount + 1;

        let interval;
        if (rightBoundary === null) {
            interval = step;
        } else {
            const available = rightBoundary - leftBoundary;
            interval = Math.floor(available / (slots + 1));
            if (interval < 1) {
                if (left === 0 && right === source.length) {
                    // Full-sheet fallback. With a 1e9 step this still remains
                    // safely inside JS integer precision for our 100k-row gate.
                    interval = step;
                } else {
                    continue;
                }
            }
        }

        const orderedKeys = [];
        for (let i = left; i < index; i += 1) {
            orderedKeys.push(rowKey(source[i]));
        }
        orderedKeys.push(null); // the new row
        for (let i = index; i < right; i += 1) {
            orderedKeys.push(rowKey(source[i]));
        }

        const adjustments = [];
        let newOrder = null;
        orderedKeys.forEach((key, offset) => {
            const order = leftBoundary + interval * (offset + 1);
            if (key === null) {
                newOrder = order;
                return;
            }
            const original = source.find(row => rowKey(row) === key);
            const before = displayOrderOf(original);
            if (before !== order) {
                adjustments.push({
                    clientKey: key,
                    before,
                    after: order
                });
            }
        });

        return { newOrder, adjustments };
    }

    throw new Error("Unable to allocate DisplayOrder for the new row.");
}


export function planDisplayOrderBatchInsertion(
    rows,
    insertIndex,
    requestedCount,
    step = DISPLAY_ORDER_STEP
) {
    const source = Array.isArray(rows) ? rows : [];
    const index = Math.max(0, Math.min(source.length, Number(insertIndex) || 0));
    const count = Number(requestedCount);

    if (!Number.isInteger(count) || count < 1 || count > MAX_INSERT_ROWS) {
        throw new Error(`Insert row count must be between 1 and ${MAX_INSERT_ROWS}.`);
    }

    const previous = index > 0 ? displayOrderOf(source[index - 1]) : 0;
    const next = index < source.length ? displayOrderOf(source[index]) : null;

    if (next === null) {
        return {
            newOrders: Array.from(
                { length: count },
                (_, offset) => previous + step * (offset + 1)
            ),
            adjustments: []
        };
    }

    const directInterval = Math.floor((next - previous) / (count + 1));
    if (directInterval >= 1) {
        return {
            newOrders: Array.from(
                { length: count },
                (_, offset) => previous + directInterval * (offset + 1)
            ),
            adjustments: []
        };
    }

    const orderByKey = new Map(
        source.map(row => [rowKey(row), displayOrderOf(row)])
    );

    for (let radius = 1; radius <= source.length + 1; radius *= 2) {
        const left = Math.max(0, index - radius);
        const right = Math.min(source.length, index + radius);
        const leftBoundary = left > 0 ? displayOrderOf(source[left - 1]) : 0;
        const rightBoundary = right < source.length
            ? displayOrderOf(source[right])
            : null;
        const existingCount = right - left;
        const slots = existingCount + count;

        let interval;
        if (rightBoundary === null) {
            interval = step;
        } else {
            const available = rightBoundary - leftBoundary;
            interval = Math.floor(available / (slots + 1));
            if (interval < 1) {
                if (left === 0 && right === source.length) {
                    interval = step;
                } else {
                    continue;
                }
            }
        }

        const sequence = [];
        for (let i = left; i < index; i += 1) {
            sequence.push({ kind: "existing", key: rowKey(source[i]) });
        }
        for (let i = 0; i < count; i += 1) {
            sequence.push({ kind: "new", newIndex: i });
        }
        for (let i = index; i < right; i += 1) {
            sequence.push({ kind: "existing", key: rowKey(source[i]) });
        }

        const newOrders = new Array(count);
        const adjustments = [];
        sequence.forEach((item, offset) => {
            const order = leftBoundary + interval * (offset + 1);
            if (item.kind === "new") {
                newOrders[item.newIndex] = order;
                return;
            }

            const before = orderByKey.get(item.key);
            if (before !== order) {
                adjustments.push({
                    clientKey: item.key,
                    before,
                    after: order
                });
            }
        });

        return { newOrders, adjustments };
    }

    throw new Error("Unable to allocate DisplayOrder values for the new rows.");
}

function injectStyles() {
    if (document.getElementById(MENU_STYLE_ID)) {
        return;
    }

    const style = document.createElement("style");
    style.id = MENU_STYLE_ID;
    style.textContent = `
        .${MENU_CLASS} {
            position: fixed;
            z-index: 5000;
            width: 220px;
            padding: 6px;
            border: 1px solid #b9c8d4;
            border-radius: 9px;
            background: #fff;
            box-shadow: 0 14px 34px rgba(15, 42, 70, .20);
            font-family: "Segoe UI", Tahoma, Arial, sans-serif;
        }
        .${MENU_CLASS}[hidden] { display: none; }
        .${MENU_CLASS} button {
            display: block;
            width: 100%;
            padding: 9px 11px;
            border: 0;
            border-radius: 6px;
            background: transparent;
            color: #173047;
            text-align: left;
            font: inherit;
            font-size: .88rem;
            font-weight: 650;
            cursor: pointer;
        }
        .${MENU_CLASS} button:hover { background: #eef7fc; color: #0b5f95; }
        .${MENU_CLASS} button[data-danger="true"] { color: #a52a2a; }
        .${MENU_CLASS}__separator { height: 1px; margin: 5px 3px; background: #dce5eb; }
        .${INSERT_DIALOG_CLASS} {
            position: fixed;
            inset: 0;
            z-index: 5100;
            display: grid;
            place-items: center;
            background: rgba(15, 42, 70, .18);
            font-family: "Segoe UI", Tahoma, Arial, sans-serif;
        }
        .${INSERT_DIALOG_CLASS}[hidden] { display: none; }
        .${INSERT_DIALOG_CLASS}__card {
            width: min(360px, calc(100vw - 32px));
            padding: 16px;
            border: 1px solid #b9c8d4;
            border-radius: 10px;
            background: #fff;
            box-shadow: 0 18px 42px rgba(15, 42, 70, .22);
        }
        .${INSERT_DIALOG_CLASS}__title {
            margin: 0 0 12px;
            color: #173047;
            font-size: 1rem;
            font-weight: 700;
        }
        .${INSERT_DIALOG_CLASS} label {
            display: block;
            margin-bottom: 6px;
            color: #40596d;
            font-size: .84rem;
            font-weight: 650;
        }
        .${INSERT_DIALOG_CLASS} input {
            box-sizing: border-box;
            width: 100%;
            padding: 8px 10px;
            border: 1px solid #aebfcb;
            border-radius: 7px;
            font: inherit;
        }
        .${INSERT_DIALOG_CLASS}__error {
            min-height: 18px;
            margin-top: 6px;
            color: #a52a2a;
            font-size: .78rem;
        }
        .${INSERT_DIALOG_CLASS}__actions {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            justify-content: flex-end;
            margin-top: 10px;
        }
        .${INSERT_DIALOG_CLASS}__actions button {
            padding: 8px 12px;
            border: 1px solid #b9c8d4;
            border-radius: 7px;
            background: #fff;
            color: #173047;
            font: inherit;
            font-size: .84rem;
            font-weight: 650;
            cursor: pointer;
        }
        .${INSERT_DIALOG_CLASS}__actions button[data-primary="true"] {
            border-color: #0b78b5;
            background: #0b78b5;
            color: #fff;
        }
    `;
    document.head.appendChild(style);
}

function createMenuButton(label, action, danger = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    if (danger) {
        button.dataset.danger = "true";
    }
    button.addEventListener("click", action);
    return button;
}

function waitForContextMenuFocusToSettle() {
    return new Promise(resolve => {
        if (typeof window.requestAnimationFrame !== "function") {
            window.setTimeout(resolve, 0);
            return;
        }

        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(resolve);
        });
    });
}

function positionMenu(menu, x, y) {
    menu.hidden = false;
    const margin = 8;
    const rect = menu.getBoundingClientRect();
    const left = Math.max(
        margin,
        Math.min(Number(x) || margin, window.innerWidth - rect.width - margin)
    );
    const top = Math.max(
        margin,
        Math.min(Number(y) || margin, window.innerHeight - rect.height - margin)
    );
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
}

function insertAt(array, index, item) {
    const output = [...array];
    output.splice(Math.max(0, Math.min(output.length, index)), 0, item);
    return output;
}

function withoutKeys(keys, removed) {
    const removedSet = new Set(removed);
    return keys.filter(key => !removedSet.has(key));
}

function physicalMap(rows) {
    const result = new Map();
    rows.forEach((row, index) => result.set(rowKey(row), index));
    return result;
}

function keysFromPhysical(source, indexes) {
    const result = [];
    for (const index of Array.isArray(indexes) ? indexes : []) {
        const row = source[index];
        if (row) {
            result.push(rowKey(row));
        }
    }
    return result;
}

export function composeViewAfterInsertMany(view, targetKey, newKeys, position) {
    const keys = Array.isArray(newKeys) ? newKeys : [];
    if (keys.length === 0) {
        throw new Error("At least one inserted row key is required.");
    }

    const targetSourceIndex = view.sourceKeys.indexOf(targetKey);
    const proxyBase = view.proxyKeys.indexOf(targetKey);
    const visibleBase = view.visibleKeys.indexOf(targetKey);
    if (targetSourceIndex < 0 || proxyBase < 0 || visibleBase < 0) {
        throw new Error("Insert target is not present in the current Revo view.");
    }

    const offset = position === "above" ? 0 : 1;
    const sourceIndex = targetSourceIndex + offset;
    const proxyIndex = proxyBase + offset;
    const visibleIndex = visibleBase + offset;

    const sourceKeys = [...view.sourceKeys];
    sourceKeys.splice(sourceIndex, 0, ...keys);
    const proxyKeys = [...view.proxyKeys];
    proxyKeys.splice(proxyIndex, 0, ...keys);
    const visibleKeys = [...view.visibleKeys];
    visibleKeys.splice(visibleIndex, 0, ...keys);

    return {
        sourceKeys,
        proxyKeys,
        visibleKeys,
        sourceIndex,
        proxyIndex,
        visibleIndex
    };
}

export function composeViewAfterInsert(view, targetKey, newKey, position) {
    return composeViewAfterInsertMany(view, targetKey, [newKey], position);
}

export function composeViewAfterDelete(view, removedKeys) {
    const removed = new Set(removedKeys);
    return {
        sourceKeys: view.sourceKeys.filter(key => !removed.has(key)),
        proxyKeys: view.proxyKeys.filter(key => !removed.has(key)),
        visibleKeys: view.visibleKeys.filter(key => !removed.has(key))
    };
}

export function restoreDeletedItemsByIndex(existingItems, records, indexProperty, valueSelector) {
    const current = Array.isArray(existingItems) ? existingItems : [];
    const removed = Array.isArray(records) ? records : [];
    if (removed.length === 0) {
        return [...current];
    }

    const totalLength = current.length + removed.length;
    const restoredAt = new Map();
    for (const record of removed) {
        const index = Number(record?.[indexProperty]);
        if (!Number.isInteger(index) || index < 0 || index >= totalLength || restoredAt.has(index)) {
            throw new Error(`Invalid deleted-row restore index '${indexProperty}'.`);
        }
        restoredAt.set(index, valueSelector(record));
    }

    const result = new Array(totalLength);
    let currentIndex = 0;
    for (let index = 0; index < totalLength; index += 1) {
        if (restoredAt.has(index)) {
            result[index] = restoredAt.get(index);
            continue;
        }
        if (currentIndex >= current.length) {
            throw new Error(`Deleted-row restore '${indexProperty}' no longer matches the current view.`);
        }
        result[index] = current[currentIndex++];
    }

    if (currentIndex !== current.length) {
        throw new Error(`Deleted-row restore '${indexProperty}' left unmatched current items.`);
    }
    return result;
}

export function createRevoGridRowStructure(options) {
    const grid = options?.grid;
    const historyCoordinator = options?.historyCoordinator;
    const changeBridge = options?.changeBridge;
    const excelFilter = options?.excelFilter;
    const persistenceIdentity = options?.persistenceIdentity ?? null;
    const selectionContext = options?.selectionContext ?? null;

    if (!grid || typeof grid.getSource !== "function") {
        throw new Error("A compatible RevoGrid element is required.");
    }
    if (!historyCoordinator || typeof historyCoordinator.registerAdapter !== "function") {
        throw new Error("Sheet History coordinator is required.");
    }
    if (!changeBridge || typeof changeBridge.applyRowChanges !== "function") {
        throw new Error("Change Engine bridge with row support is required.");
    }

    injectStyles();

    let datasetKey = requireText(options?.datasetKey, "datasetKey");
    let destroyed = false;
    let busy = false;
    let rowCount = Array.isArray(options?.rows) ? options.rows.length : 0;
    const externalMenu = Boolean(options?.externalMenu);
    let menuContext = null;
    let insertDialogContext = null;
    let pendingRightClickContext = null;
    let contextMenuSequence = 0;
    const removers = [];

    const menu = document.createElement("div");
    menu.className = MENU_CLASS;
    menu.hidden = true;

    const insertDialog = document.createElement("div");
    insertDialog.className = INSERT_DIALOG_CLASS;
    insertDialog.hidden = true;
    insertDialog.innerHTML = `
        <div class="${INSERT_DIALOG_CLASS}__card" role="dialog" aria-modal="true" aria-labelledby="erp-revo-insert-rows-title">
            <h3 class="${INSERT_DIALOG_CLASS}__title" id="erp-revo-insert-rows-title">Insert Rows</h3>
            <label for="erp-revo-insert-rows-count">Number of rows</label>
            <input id="erp-revo-insert-rows-count" type="number" min="1" max="1000" step="1" value="1" inputmode="numeric" />
            <div class="${INSERT_DIALOG_CLASS}__error" aria-live="polite"></div>
            <div class="${INSERT_DIALOG_CLASS}__actions">
                <button type="button" data-action="cancel">Cancel</button>
                <button type="button" data-action="above" data-primary="true">Insert Above</button>
                <button type="button" data-action="below" data-primary="true">Insert Below</button>
            </div>
        </div>
    `;
    const insertCountInput = insertDialog.querySelector("input");
    const insertDialogError = insertDialog.querySelector(`.${INSERT_DIALOG_CLASS}__error`);

    const hideMenu = () => {
        menu.hidden = true;
        menuContext = null;
    };

    const hideInsertDialog = () => {
        insertDialog.hidden = true;
        insertDialogContext = null;
        if (insertDialogError) {
            insertDialogError.textContent = "";
        }
    };

    const addListener = (target, type, handler, listenerOptions) => {
        target?.addEventListener(type, handler, listenerOptions);
        if (target) {
            removers.push(() => target.removeEventListener(type, handler, listenerOptions));
        }
    };

    const notifyState = () => {
        if (typeof options?.onStateChange === "function") {
            options.onStateChange(getState());
        }
    };

    async function captureView() {
        const source = await grid.getSource("rgRow");
        const store = await grid.getSourceStore("rgRow");
        const proxyItems = store.get("proxyItems");
        const items = store.get("items");

        return {
            source,
            sourceKeys: source.map(rowKey),
            proxyKeys: keysFromPhysical(source, proxyItems),
            visibleKeys: keysFromPhysical(source, items)
        };
    }

    async function applyView(nextRows, proxyKeys, visibleKeys) {
        const providers = await grid.getProviders();
        if (!providers?.data || typeof providers.data.setData !== "function") {
            throw new Error("RevoGrid DataProvider is not available.");
        }

        // Use Revo Community's own DataProvider so viewport/dimensions stay in
        // sync, but deliberately bypass the grid.source watcher. That watcher
        // would re-run Filter/Sort automatically and violate the approved ERP
        // snapshot behavior while the employee is editing/adding rows.
        providers.data.setData(
            nextRows,
            "rgRow",
            Boolean(grid.disableVirtualY)
        );

        const store = await grid.getSourceStore("rgRow");
        const indexByKey = physicalMap(nextRows);
        const nextProxy = proxyKeys
            .map(key => indexByKey.get(key))
            .filter(Number.isInteger);
        const visibleSet = new Set(visibleKeys);
        const hidden = {};

        nextProxy.forEach(index => {
            const key = rowKey(nextRows[index]);
            if (!visibleSet.has(key)) {
                hidden[index] = true;
            }
        });

        // proxyItems is Revo's row-order projection; the filter trim is Revo's
        // visible-row projection. We restore both snapshots by ClientKey, not by
        // stale visible row numbers.
        store.set("proxyItems", nextProxy);
        providers.data.setTrimmed({ [FILTER_TRIMMED_TYPE]: hidden }, "rgRow");
        await grid.refresh("rgRow");

        rowCount = nextRows.length;
        changeBridge.replaceRowIndex(nextRows);
        excelFilter?.replaceRows?.(nextRows);
    }

    function rowTransitionsForInsert(rows, adjustments, direction) {
        const insertedRows = Array.isArray(rows) ? rows : [rows];
        const transitions = adjustments.map(item => ({
            clientKey: item.clientKey,
            before: { exists: true, displayOrder: direction === "forward" ? item.before : item.after },
            after: { exists: true, displayOrder: direction === "forward" ? item.after : item.before }
        }));

        for (const row of insertedRows) {
            transitions.push({
                clientKey: rowKey(row),
                before: direction === "forward" ? rowState(row, false) : rowState(row, true),
                after: direction === "forward" ? rowState(row, true) : rowState(row, false)
            });
        }
        return transitions;
    }

    function rowTransitionsForDelete(rows, direction) {
        return rows.map(row => ({
            clientKey: rowKey(row),
            before: direction === "forward" ? rowState(row, true) : rowState(row, false),
            after: direction === "forward" ? rowState(row, false) : rowState(row, true)
        }));
    }

    async function applyInsertPayload(payload, direction) {
        const view = await captureView();
        const rows = Array.isArray(payload?.rows)
            ? payload.rows.map(row => persistenceIdentity?.prepareRowForReplay
                ? persistenceIdentity.prepareRowForReplay(row)
                : cloneValue(row))
            : payload?.row
                ? [persistenceIdentity?.prepareRowForReplay
                    ? persistenceIdentity.prepareRowForReplay(payload.row)
                    : cloneValue(payload.row)]
                : [];
        if (rows.length === 0) {
            throw new Error("Inserted row payload is empty.");
        }

        const keys = rows.map(rowKey);
        const targetKey = requireText(payload.targetKey, "targetKey");
        const adjustments = Array.isArray(payload?.adjustments)
            ? payload.adjustments
            : [];

        if (direction === "undo") {
            const currentKeys = new Set(view.sourceKeys);
            for (const key of keys) {
                if (!currentKeys.has(key)) {
                    throw new Error(`Inserted row '${key}' is not present for Undo.`);
                }
            }

            const removedSet = new Set(keys);
            const nextRows = view.source
                .filter(item => !removedSet.has(rowKey(item)))
                .map(item => {
                    const adjustment = adjustments.find(
                        candidate => candidate.clientKey === rowKey(item)
                    );
                    return adjustment
                        ? { ...item, displayOrder: adjustment.before }
                        : item;
                });
            const nextView = composeViewAfterDelete(view, keys);
            await applyView(nextRows, nextView.proxyKeys, nextView.visibleKeys);
            changeBridge.applyRowChanges(
                rowTransitionsForInsert(rows, adjustments, "reverse")
            );
            await grid.clearFocus();
            return;
        }

        const currentKeys = new Set(view.sourceKeys);
        for (const key of keys) {
            if (currentKeys.has(key)) {
                throw new Error(`Inserted row '${key}' already exists for Redo.`);
            }
        }

        const nextView = composeViewAfterInsertMany(
            view,
            targetKey,
            keys,
            payload.position
        );
        const adjustedRows = view.source.map(item => {
            const adjustment = adjustments.find(
                candidate => candidate.clientKey === rowKey(item)
            );
            return adjustment
                ? { ...item, displayOrder: adjustment.after }
                : item;
        });
        const nextRows = [...adjustedRows];
        nextRows.splice(nextView.sourceIndex, 0, ...rows);

        await applyView(nextRows, nextView.proxyKeys, nextView.visibleKeys);
        changeBridge.applyRowChanges(
            rowTransitionsForInsert(rows, adjustments, "forward")
        );
        await grid.clearFocus();
    }

    async function applyDeletePayload(payload, direction) {
        const records = Array.isArray(payload?.records) ? payload.records : [];
        const keys = records.map(record => rowKey(record.row));
        const view = await captureView();

        if (direction === "redo") {
            const removed = new Set(keys);
            const nextRows = view.source.filter(row => !removed.has(rowKey(row)));
            const nextView = composeViewAfterDelete(view, keys);
            await applyView(nextRows, nextView.proxyKeys, nextView.visibleKeys);
            changeBridge.applyRowChanges(
                rowTransitionsForDelete(records.map(record => record.row), "forward")
            );
            await grid.clearFocus();
            return;
        }

        const currentKeys = new Set(view.sourceKeys);
        const replayRows = new Map();
        for (const record of records) {
            const row = persistenceIdentity?.prepareRowForReplay
                ? persistenceIdentity.prepareRowForReplay(record.row)
                : cloneValue(record.row);
            const key = rowKey(row);
            if (currentKeys.has(key) || replayRows.has(key)) {
                throw new Error(`Deleted row '${key}' is already present for Undo.`);
            }
            replayRows.set(key, row);
        }

        // A large displayed-scope delete can contain all 10k rows. Restore the
        // three arrays from their captured original indices in one linear pass
        // instead of thousands of splice/includes operations.
        const nextRows = restoreDeletedItemsByIndex(
            view.source,
            records,
            "sourceIndex",
            record => replayRows.get(rowKey(record.row))
        );
        const proxyKeys = restoreDeletedItemsByIndex(
            view.proxyKeys,
            records,
            "proxyIndex",
            record => rowKey(record.row)
        );
        const visibleKeys = restoreDeletedItemsByIndex(
            view.visibleKeys,
            records,
            "visibleIndex",
            record => rowKey(record.row)
        );

        await applyView(nextRows, proxyKeys, visibleKeys);
        changeBridge.applyRowChanges(
            rowTransitionsForDelete(records.map(record => record.row), "reverse")
        );
        await grid.clearFocus();
    }

    const unregisterHistoryAdapter = historyCoordinator.registerAdapter(
        HISTORY_ADAPTER_KEY,
        {
            apply: async (entry, direction) => {
                const kind = String(entry?.payload?.action ?? "");
                if (kind === "insert") {
                    await applyInsertPayload(entry.payload, direction);
                    return;
                }
                if (kind === "delete") {
                    await applyDeletePayload(entry.payload, direction);
                    return;
                }
                throw new Error(`Unsupported row History action '${kind}'.`);
            }
        }
    );

    function visibleCellFromPointerEvent(event) {
        const path = typeof event?.composedPath === "function"
            ? event.composedPath()
            : [];
        let rowIndex = null;
        let colIndex = null;

        for (const node of path) {
            if (rowIndex === null) {
                const rawRow = node?.dataset?.rgrow ?? node?.dataset?.rgRow;
                if (rawRow !== undefined) {
                    const value = Number(rawRow);
                    if (Number.isInteger(value) && value >= 0) {
                        rowIndex = value;
                    }
                }
            }

            if (colIndex === null) {
                const rawCol = node?.dataset?.rgcol ?? node?.dataset?.rgCol;
                if (rawCol !== undefined) {
                    const value = Number(rawCol);
                    if (Number.isInteger(value) && value >= 0) {
                        colIndex = value;
                    }
                }
            }

            if (rowIndex !== null && colIndex !== null) {
                break;
            }
        }

        return rowIndex === null
            ? null
            : {
                rowIndex,
                colIndex,
                colType: "rgCol",
                rowType: "rgRow"
            };
    }

    async function resolveMenuContext(clickedCell = null, explicitSnapshot = null) {
        const visible = await grid.getVisibleSource("rgRow");
        const snapshot = explicitSnapshot ?? (selectionContext?.getSnapshot
            ? await selectionContext.getSnapshot()
            : null);
        const focused = snapshot?.focused ?? await grid.getFocused();
        const range = snapshot?.range ?? await grid.getSelectedRange();
        const selectionKind = snapshot?.kind ?? "range";

        const focusedKey = String(focused?.model?.clientKey ?? "").trim();
        const clickedVisibleIndex = Number(clickedCell?.rowIndex);
        const clickedRow = Number.isInteger(clickedVisibleIndex)
            ? visible[clickedVisibleIndex]
            : null;
        const clickedKey = clickedRow ? rowKey(clickedRow) : null;
        const clickedInsideSelection = Boolean(
            clickedCell &&
            range &&
            (selectionContext?.containsCell
                ? selectionContext.containsCell(snapshot, clickedCell)
                : clickedVisibleIndex >= Math.min(range.y, range.y1) &&
                  clickedVisibleIndex <= Math.max(range.y, range.y1))
        );

        let targetKey = clickedKey || focusedKey || null;

        if (selectionKind === "rows") {
            const visibleKeySet = new Set(visible.map(rowKey));
            const selectedKeys = [...new Set(
                (Array.isArray(snapshot?.selectedKeys) ? snapshot.selectedKeys : [])
                    .map(value => String(value ?? "").trim())
                    .filter(key => key && visibleKeySet.has(key))
            )];
            const clickedInsideSelection = Boolean(
                clickedKey && selectedKeys.includes(clickedKey)
            );

            if (clickedKey && !clickedInsideSelection) {
                return {
                    targetKey: clickedKey,
                    selectedKeys: [clickedKey],
                    selectionKind: "cell",
                    deleteRowsAllowed: true
                };
            }

            targetKey = clickedKey || selectedKeys[0] || targetKey;
            return {
                targetKey,
                selectedKeys,
                selectionKind: selectedKeys.length ? "rows" : (targetKey ? "cell" : "none"),
                deleteRowsAllowed: selectedKeys.length > 0 || Boolean(targetKey)
            };
        }

        // A whole-column selection is not a row selection. Preserve the column
        // context when the employee right-clicks inside it, but never turn its
        // thousands of visible cells into thousands of row-delete targets.
        if (selectionKind === "column" || selectionKind === "columns") {
            let clickedInsideColumnSelection = clickedInsideSelection;

            // Native B9 whole-column selection has a Revo range, while B10
            // semantic multi-column selection intentionally does not. Resolve
            // the clicked column by prop so the Structure menu still knows a
            // right-click happened inside the selected columns.
            if (selectionKind === "columns" && clickedCell) {
                const columns = await grid.getColumns();
                const clickedColumnIndex = Number(clickedCell.colIndex);
                const clickedProp = Number.isInteger(clickedColumnIndex)
                    ? String(columns[clickedColumnIndex]?.prop ?? "").trim()
                    : "";
                const selectedProps = new Set(
                    (Array.isArray(snapshot?.selectedProps) ? snapshot.selectedProps : [])
                        .map(value => String(value ?? "").trim())
                        .filter(Boolean)
                );
                clickedInsideColumnSelection = Boolean(
                    clickedProp && selectedProps.has(clickedProp)
                );
            }

            if (clickedKey && clickedInsideColumnSelection) {
                return {
                    targetKey: clickedKey,
                    selectedKeys: [],
                    selectionKind,
                    deleteRowsAllowed: false
                };
            }

            return {
                targetKey: clickedKey || targetKey,
                selectedKeys: clickedKey ? [clickedKey] : [],
                selectionKind: clickedKey ? "cell" : "none",
                deleteRowsAllowed: Boolean(clickedKey)
            };
        }

        const selectedKeys = [];
        if (range && Number.isInteger(range.y) && Number.isInteger(range.y1)) {
            const start = Math.max(0, Math.min(range.y, range.y1));
            const end = Math.min(visible.length - 1, Math.max(range.y, range.y1));
            for (let index = start; index <= end; index += 1) {
                const row = visible[index];
                if (row) {
                    selectedKeys.push(rowKey(row));
                }
            }
        }

        const uniqueSelected = [...new Set(selectedKeys)];

        // Spreadsheet-style context: secondary-click inside the current range
        // preserves it. A click outside the range targets only the clicked row.
        if (clickedKey) {
            if (uniqueSelected.length > 0 && clickedInsideSelection) {
                return {
                    targetKey: clickedKey,
                    selectedKeys: uniqueSelected,
                    selectionKind,
                    deleteRowsAllowed: true,
                    preserveRange: {
                        x: range.x,
                        y: range.y,
                        x1: range.x1,
                        y1: range.y1,
                        colType: range.colType ?? "rgCol",
                        rowType: range.rowType ?? "rgRow"
                    }
                };
            }
            return {
                targetKey: clickedKey,
                selectedKeys: [clickedKey],
                selectionKind: "cell",
                deleteRowsAllowed: true
            };
        }

        if (targetKey && uniqueSelected.length > 0 && !uniqueSelected.includes(targetKey)) {
            return { targetKey, selectedKeys: [targetKey], selectionKind: "cell", deleteRowsAllowed: true };
        }
        if (!targetKey && uniqueSelected.length > 0) {
            targetKey = uniqueSelected[0];
        }

        return {
            targetKey,
            selectedKeys: uniqueSelected.length
                ? uniqueSelected
                : targetKey
                    ? [targetKey]
                    : [],
            selectionKind,
            deleteRowsAllowed: uniqueSelected.length > 0 || Boolean(targetKey)
        };
    }

    async function insertRelative(position, requestedCount = 1, explicitContext = null) {
        const count = Number(requestedCount);
        const context = explicitContext ?? menuContext;

        if (busy || !context?.targetKey) {
            return false;
        }
        if (!Number.isInteger(count) || count < 1 || count > MAX_INSERT_ROWS) {
            throw new Error(`Insert row count must be between 1 and ${MAX_INSERT_ROWS}.`);
        }

        busy = true;
        notifyState();
        hideMenu();
        hideInsertDialog();

        try {
            const view = await captureView();
            const targetKey = context.targetKey;
            const targetIndex = view.sourceKeys.indexOf(targetKey);
            if (targetIndex < 0 || !view.visibleKeys.includes(targetKey)) {
                throw new Error("Insert target is no longer visible.");
            }

            const insertIndex = targetIndex + (position === "above" ? 0 : 1);
            const plan = planDisplayOrderBatchInsertion(
                view.source,
                insertIndex,
                count
            );
            const rows = plan.newOrders.map(order => createBlankRow(order));
            const keys = rows.map(rowKey);
            const nextView = composeViewAfterInsertMany(
                view,
                targetKey,
                keys,
                position
            );

            const adjustedRows = view.source.map(item => {
                const adjustment = plan.adjustments.find(
                    candidate => candidate.clientKey === rowKey(item)
                );
                return adjustment
                    ? { ...item, displayOrder: adjustment.after }
                    : item;
            });
            const nextRows = [...adjustedRows];
            nextRows.splice(nextView.sourceIndex, 0, ...rows);

            await applyView(nextRows, nextView.proxyKeys, nextView.visibleKeys);
            changeBridge.applyRowChanges(
                rowTransitionsForInsert(rows, plan.adjustments, "forward")
            );

            const label = count === 1
                ? position === "above"
                    ? "Insert Row Above"
                    : "Insert Row Below"
                : `Insert ${count} Rows ${position === "above" ? "Above" : "Below"}`;

            try {
                historyCoordinator.record({
                    adapterKey: HISTORY_ADAPTER_KEY,
                    kind: count === 1 ? "row-insert" : "row-insert-batch",
                    label,
                    focusTarget: null,
                    payload: {
                        action: "insert",
                        position,
                        targetKey,
                        rows: cloneValue(rows),
                        adjustments: cloneValue(plan.adjustments)
                    }
                });
            } catch (error) {
                await applyInsertPayload({
                    action: "insert",
                    position,
                    targetKey,
                    rows,
                    adjustments: plan.adjustments
                }, "undo");
                throw error;
            }

            await grid.clearFocus();
            return true;
        } finally {
            busy = false;
            notifyState();
        }
    }

    async function deleteKeys(requestedKeys, options = {}) {
        if (busy) {
            return false;
        }

        const keys = [...new Set(
            (Array.isArray(requestedKeys) ? requestedKeys : [])
                .map(value => String(value ?? "").trim())
                .filter(Boolean)
        )];
        if (keys.length === 0) {
            return false;
        }

        if (options.confirm !== false) {
            const confirmed = window.confirm(
                keys.length === 1
                    ? "هل تريد حذف الصف المحدد؟"
                    : `هل تريد حذف ${keys.length.toLocaleString()} صفوف محددة؟`
            );
            if (!confirmed) {
                return false;
            }
        }

        busy = true;
        notifyState();
        try {
            const view = await captureView();
            const removedSet = new Set(keys);
            const records = [];

            // Structural delete may now target the entire displayed filter result
            // (up to the full 10k dataset). Build the three lookup maps once so
            // this remains O(n + k) instead of repeatedly scanning 10k arrays
            // for every row covered by a large Selection-scoped structural delete.
            const sourceIndexByKey = new Map(
                view.sourceKeys.map((key, index) => [key, index])
            );
            const proxyIndexByKey = new Map(
                view.proxyKeys.map((key, index) => [key, index])
            );
            const visibleIndexByKey = new Map(
                view.visibleKeys.map((key, index) => [key, index])
            );

            for (const key of keys) {
                const sourceIndex = sourceIndexByKey.get(key) ?? -1;
                const proxyIndex = proxyIndexByKey.get(key) ?? -1;
                const visibleIndex = visibleIndexByKey.get(key) ?? -1;
                if (sourceIndex < 0 || proxyIndex < 0 || visibleIndex < 0) {
                    throw new Error(`Selected row '${key}' is no longer displayed.`);
                }
                records.push({
                    row: cloneValue(view.source[sourceIndex]),
                    sourceIndex,
                    proxyIndex,
                    visibleIndex
                });
            }

            const nextRows = view.source.filter(row => !removedSet.has(rowKey(row)));
            const nextView = composeViewAfterDelete(view, keys);
            await applyView(nextRows, nextView.proxyKeys, nextView.visibleKeys);
            changeBridge.applyRowChanges(
                rowTransitionsForDelete(records.map(record => record.row), "forward")
            );

            try {
                historyCoordinator.record({
                    adapterKey: HISTORY_ADAPTER_KEY,
                    kind: "row-delete",
                    label: keys.length === 1 ? "Delete Row" : `Delete ${keys.length} Rows`,
                    focusTarget: null,
                    payload: {
                        action: "delete",
                        records
                    }
                });
            } catch (error) {
                await applyDeletePayload({ action: "delete", records }, "undo");
                throw error;
            }

            await grid.clearFocus();
            return true;
        } finally {
            busy = false;
            notifyState();
        }
    }

    async function deleteSelection() {
        if (!menuContext || menuContext.deleteRowsAllowed === false) {
            return false;
        }

        const context = menuContext;
        hideMenu();
        return deleteKeys(context.selectedKeys, { confirm: true });
    }

    async function getDisplayedKeys() {
        const visible = await grid.getVisibleSource("rgRow");
        return (Array.isArray(visible) ? visible : []).map(rowKey);
    }

    async function getContext(clickedCell = null, selectionSnapshot = null) {
        return resolveMenuContext(clickedCell, selectionSnapshot);
    }

    async function insertRows({ targetKey, position, count = 1 } = {}) {
        return insertRelative(position, count, {
            targetKey: String(targetKey ?? "").trim(),
            selectedKeys: []
        });
    }

    async function deleteRows(keys) {
        return deleteKeys(keys, { confirm: false });
    }

    // Persistence acceptance is not a new employee edit. Remove rows that the
    // server has already deleted or moved to another year without creating a
    // second History/Dirty operation. The existing view adapter preserves the
    // current Sort/Filter projections by ClientKey.
    async function removeAcceptedRows(keys) {
        const keySet = new Set((Array.isArray(keys) ? keys : [])
            .map(key => String(key ?? "").trim())
            .filter(Boolean));
        if (keySet.size === 0) {
            return { removed: 0, rowCount };
        }
        if (busy) {
            throw new Error("Row Structure is busy.");
        }

        busy = true;
        notifyState();
        try {
            const view = await captureView();
            const nextRows = view.source.filter(row => !keySet.has(rowKey(row)));
            const removed = view.source.length - nextRows.length;
            if (removed === 0) {
                return { removed: 0, rowCount };
            }

            await applyView(
                nextRows,
                view.proxyKeys.filter(key => !keySet.has(key)),
                view.visibleKeys.filter(key => !keySet.has(key))
            );
            return { removed, rowCount };
        } finally {
            busy = false;
            notifyState();
        }
    }

    function openInsertRowsDialog() {
        if (busy || !menuContext?.targetKey) {
            return;
        }
        insertDialogContext = {
            targetKey: menuContext.targetKey,
            selectedKeys: [...menuContext.selectedKeys]
        };
        hideMenu();
        if (insertCountInput) {
            insertCountInput.value = "1";
        }
        if (insertDialogError) {
            insertDialogError.textContent = "";
        }
        insertDialog.hidden = false;
        queueMicrotask(() => {
            insertCountInput?.focus();
            insertCountInput?.select();
        });
    }

    async function submitInsertRows(position) {
        const raw = String(insertCountInput?.value ?? "").trim();
        const count = Number(raw);
        if (!Number.isInteger(count) || count < 1 || count > MAX_INSERT_ROWS) {
            if (insertDialogError) {
                insertDialogError.textContent = `Enter a whole number from 1 to ${MAX_INSERT_ROWS}.`;
            }
            insertCountInput?.focus();
            return;
        }

        const context = insertDialogContext;
        try {
            await insertRelative(position, count, context);
        } catch (error) {
            if (insertDialogError) {
                insertDialogError.textContent = error?.message || "Unable to insert rows.";
            }
            insertDialog.hidden = false;
            insertDialogContext = context;
            throw error;
        }
    }

    menu.append(
        createMenuButton("Insert 1 Row Above", () => void insertRelative("above")),
        createMenuButton("Insert 1 Row Below", () => void insertRelative("below")),
        createMenuButton("Insert Rows...", openInsertRowsDialog)
    );
    const separator = document.createElement("div");
    separator.className = `${MENU_CLASS}__separator`;
    menu.append(separator);
    const deleteRowsButton = createMenuButton(
        "Delete Selected Rows",
        () => void deleteSelection(),
        true
    );
    menu.append(deleteRowsButton);
    if (!externalMenu) {
        document.body.append(menu);
        document.body.appendChild(insertDialog);
    }

    insertDialog.querySelector('[data-action="cancel"]')?.addEventListener(
        "click",
        hideInsertDialog
    );
    insertDialog.querySelector('[data-action="above"]')?.addEventListener(
        "click",
        () => void submitInsertRows("above")
    );
    insertDialog.querySelector('[data-action="below"]')?.addEventListener(
        "click",
        () => void submitInsertRows("below")
    );
    insertDialog.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            event.preventDefault();
            hideInsertDialog();
        }
    });

    const onGridPointerDown = event => {
        if (event.button !== 2) {
            pendingRightClickContext = null;
            return;
        }

        const clickedCell = visibleCellFromPointerEvent(event);
        // pointerdown precedes Revo's mousedown focus handling. Capture the
        // semantic selection here. The shared Selection Context distinguishes
        // a deliberate whole-column selection from a normal vertical range.
        pendingRightClickContext = resolveMenuContext(clickedCell)
            .catch(() => null);
    };

    const onContextMenu = event => {
        event.preventDefault();
        const x = event.clientX;
        const y = event.clientY;
        const clickedCell = visibleCellFromPointerEvent(event);
        const captured = pendingRightClickContext;
        const sequence = ++contextMenuSequence;
        pendingRightClickContext = null;

        void Promise.resolve(captured)
            .then(context => context ?? resolveMenuContext(clickedCell))
            .then(async context => {
                if (destroyed || sequence !== contextMenuSequence || !context?.targetKey) {
                    hideMenu();
                    return;
                }

                if (context.preserveRange && typeof grid.setCellsFocus === "function") {
                    await grid.setCellsFocus(
                        {
                            x: context.preserveRange.x,
                            y: context.preserveRange.y
                        },
                        {
                            x: context.preserveRange.x1,
                            y: context.preserveRange.y1
                        },
                        context.preserveRange.colType,
                        context.preserveRange.rowType
                    );
                }

                // Revo can finish a secondary-click focus move after the native
                // contextmenu event. That focus may emit viewportscroll and close
                // a menu opened too early. Wait until the visual focus settles,
                // then show the menu if no newer pointer action superseded it.
                await waitForContextMenuFocusToSettle();
                if (destroyed || sequence !== contextMenuSequence) {
                    return;
                }

                menuContext = context;
                deleteRowsButton.disabled = context.deleteRowsAllowed === false;
                deleteRowsButton.title = context.deleteRowsAllowed === false
                    ? "تحديد العمود ليس تحديد صفوف."
                    : "";
                positionMenu(menu, x, y);
            });
    };

    const onDocumentPointerDown = event => {
        const path = typeof event.composedPath === "function"
            ? event.composedPath()
            : [];

        if (!path.includes(menu)) {
            contextMenuSequence += 1;
            if (!menu.hidden) {
                hideMenu();
            }
        }
        if (!insertDialog.hidden && !path.includes(insertDialog)) {
            // The dialog owns its backdrop, so clicks on the backdrop itself do
            // not silently choose a row action.
            return;
        }
    };

    if (!externalMenu) {
        const onViewportScroll = () => {
            if (!menu.hidden) {
                contextMenuSequence += 1;
                hideMenu();
            }
        };
        const onResize = () => {
            contextMenuSequence += 1;
            hideMenu();
        };

        addListener(grid, "pointerdown", onGridPointerDown, true);
        addListener(grid, "contextmenu", onContextMenu);
        addListener(grid, "viewportscroll", onViewportScroll);
        addListener(document, "pointerdown", onDocumentPointerDown, true);
        addListener(window, "resize", onResize, { passive: true });
    }

    async function resetDataset(nextRows, nextDatasetKey) {
        hideMenu();
        hideInsertDialog();
        pendingRightClickContext = null;
        datasetKey = requireText(nextDatasetKey, "datasetKey");
        rowCount = Array.isArray(nextRows) ? nextRows.length : 0;
        busy = false;
        notifyState();
    }

    function getState() {
        return {
            datasetKey,
            structureBusy: busy,
            rowCount,
            menuOpen: !menu.hidden,
            insertDialogOpen: !insertDialog.hidden
        };
    }

    function destroy() {
        if (destroyed) {
            return;
        }
        contextMenuSequence += 1;
        hideMenu();
        hideInsertDialog();
        pendingRightClickContext = null;
        for (const remove of removers.splice(0)) {
            try {
                remove();
            } catch {
            }
        }
        try {
            unregisterHistoryAdapter();
        } catch {
        }
        menu.remove();
        insertDialog.remove();
        destroyed = true;
    }

    return Object.freeze({
        resetDataset,
        getState,
        getContext,
        getDisplayedKeys,
        insertRows,
        deleteRows,
        removeAcceptedRows,
        destroy
    });
}

export const revoGridRowStructureInternals = Object.freeze({
    HISTORY_ADAPTER_KEY,
    DISPLAY_ORDER_STEP,
    FILTER_TRIMMED_TYPE,
    INSERT_DIALOG_CLASS,
    MAX_INSERT_ROWS
});
