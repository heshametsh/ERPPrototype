const HISTORY_ADAPTER_KEY = "work-orders-row-structure";
const MENU_STYLE_ID = "erp-revogrid-row-structure-style";
const MENU_CLASS = "erp-revo-row-menu";
const DISPLAY_ORDER_STEP = 1_000_000_000;
const FILTER_TRIMMED_TYPE = "filter";

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
        basket: ""
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

export function composeViewAfterInsert(view, targetKey, newKey, position) {
    const offset = position === "above" ? 0 : 1;
    const sourceIndex = Math.max(0, view.sourceKeys.indexOf(targetKey) + offset);
    const proxyBase = view.proxyKeys.indexOf(targetKey);
    const visibleBase = view.visibleKeys.indexOf(targetKey);

    if (sourceIndex < 0 || proxyBase < 0 || visibleBase < 0) {
        throw new Error("Insert target is not present in the current Revo view.");
    }

    return {
        sourceKeys: insertAt(view.sourceKeys, sourceIndex, newKey),
        proxyKeys: insertAt(view.proxyKeys, proxyBase + offset, newKey),
        visibleKeys: insertAt(view.visibleKeys, visibleBase + offset, newKey),
        sourceIndex,
        proxyIndex: proxyBase + offset,
        visibleIndex: visibleBase + offset
    };
}

export function composeViewAfterDelete(view, removedKeys) {
    const removed = new Set(removedKeys);
    return {
        sourceKeys: view.sourceKeys.filter(key => !removed.has(key)),
        proxyKeys: view.proxyKeys.filter(key => !removed.has(key)),
        visibleKeys: view.visibleKeys.filter(key => !removed.has(key))
    };
}

export function createRevoGridRowStructure(options) {
    const grid = options?.grid;
    const historyCoordinator = options?.historyCoordinator;
    const changeBridge = options?.changeBridge;
    const excelFilter = options?.excelFilter;

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
    let menuContext = null;
    const removers = [];

    const menu = document.createElement("div");
    menu.className = MENU_CLASS;
    menu.hidden = true;

    const hideMenu = () => {
        menu.hidden = true;
        menuContext = null;
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

    function rowTransitionsForInsert(row, adjustments, direction) {
        const transitions = adjustments.map(item => ({
            clientKey: item.clientKey,
            before: { exists: true, displayOrder: direction === "forward" ? item.before : item.after },
            after: { exists: true, displayOrder: direction === "forward" ? item.after : item.before }
        }));

        transitions.push({
            clientKey: rowKey(row),
            before: direction === "forward" ? rowState(row, false) : rowState(row, true),
            after: direction === "forward" ? rowState(row, true) : rowState(row, false)
        });
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
        const row = cloneValue(payload.row);
        const key = rowKey(row);
        const targetKey = requireText(payload.targetKey, "targetKey");

        if (direction === "undo") {
            const currentSource = view.source;
            const removed = currentSource.find(item => rowKey(item) === key);
            if (!removed) {
                throw new Error(`Inserted row '${key}' is not present for Undo.`);
            }

            const nextRows = currentSource
                .filter(item => rowKey(item) !== key)
                .map(item => {
                    const adjustment = payload.adjustments.find(
                        candidate => candidate.clientKey === rowKey(item)
                    );
                    return adjustment
                        ? { ...item, displayOrder: adjustment.before }
                        : item;
                });
            const nextView = composeViewAfterDelete(view, [key]);
            await applyView(nextRows, nextView.proxyKeys, nextView.visibleKeys);
            changeBridge.applyRowChanges(
                rowTransitionsForInsert(row, payload.adjustments, "reverse")
            );
            await grid.clearFocus();
            return;
        }

        if (view.sourceKeys.includes(key)) {
            throw new Error(`Inserted row '${key}' already exists for Redo.`);
        }

        const nextView = composeViewAfterInsert(
            view,
            targetKey,
            key,
            payload.position
        );
        let nextRows = insertAt(view.source, nextView.sourceIndex, row);
        nextRows = nextRows.map(item => {
            const adjustment = payload.adjustments.find(
                candidate => candidate.clientKey === rowKey(item)
            );
            return adjustment
                ? { ...item, displayOrder: adjustment.after }
                : item;
        });
        await applyView(nextRows, nextView.proxyKeys, nextView.visibleKeys);
        changeBridge.applyRowChanges(
            rowTransitionsForInsert(row, payload.adjustments, "forward")
        );
        await grid.clearFocus();
    }

    async function applyDeletePayload(payload, direction) {
        const records = Array.isArray(payload?.records) ? payload.records : [];
        const keys = records.map(record => rowKey(record.row));
        const view = await captureView();

        if (direction === "redo") {
            const nextRows = view.source.filter(row => !keys.includes(rowKey(row)));
            const nextView = composeViewAfterDelete(view, keys);
            await applyView(nextRows, nextView.proxyKeys, nextView.visibleKeys);
            changeBridge.applyRowChanges(
                rowTransitionsForDelete(records.map(record => record.row), "forward")
            );
            await grid.clearFocus();
            return;
        }

        let sourceKeys = [...view.sourceKeys];
        let proxyKeys = [...view.proxyKeys];
        let visibleKeys = [...view.visibleKeys];
        let nextRows = [...view.source];

        for (const record of [...records].sort((a, b) => a.sourceIndex - b.sourceIndex)) {
            const row = cloneValue(record.row);
            const key = rowKey(row);
            if (sourceKeys.includes(key)) {
                throw new Error(`Deleted row '${key}' is already present for Undo.`);
            }
            const sourceIndex = Math.max(0, Math.min(nextRows.length, record.sourceIndex));
            nextRows.splice(sourceIndex, 0, row);
            sourceKeys.splice(sourceIndex, 0, key);
        }

        for (const record of [...records].sort((a, b) => a.proxyIndex - b.proxyIndex)) {
            proxyKeys.splice(
                Math.max(0, Math.min(proxyKeys.length, record.proxyIndex)),
                0,
                rowKey(record.row)
            );
        }
        for (const record of [...records].sort((a, b) => a.visibleIndex - b.visibleIndex)) {
            visibleKeys.splice(
                Math.max(0, Math.min(visibleKeys.length, record.visibleIndex)),
                0,
                rowKey(record.row)
            );
        }

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

    async function resolveMenuContext() {
        const visible = await grid.getVisibleSource("rgRow");
        const focused = await grid.getFocused();
        const range = await grid.getSelectedRange();

        const focusedKey = String(focused?.model?.clientKey ?? "").trim();
        let targetKey = focusedKey || null;

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

        if (targetKey && selectedKeys.length > 0 && !selectedKeys.includes(targetKey)) {
            return { targetKey, selectedKeys: [targetKey] };
        }
        if (!targetKey && selectedKeys.length > 0) {
            targetKey = selectedKeys[0];
        }

        return {
            targetKey,
            selectedKeys: [...new Set(selectedKeys.length ? selectedKeys : targetKey ? [targetKey] : [])]
        };
    }

    async function insertRelative(position) {
        if (busy || !menuContext?.targetKey) {
            return false;
        }
        const context = menuContext;
        busy = true;
        notifyState();
        hideMenu();

        try {
            const view = await captureView();
            const targetKey = context.targetKey;
            const targetIndex = view.sourceKeys.indexOf(targetKey);
            if (targetIndex < 0 || !view.visibleKeys.includes(targetKey)) {
                throw new Error("Insert target is no longer visible.");
            }

            const insertIndex = targetIndex + (position === "above" ? 0 : 1);
            const plan = planDisplayOrderInsertion(view.source, insertIndex);
            const row = createBlankRow(plan.newOrder);
            const key = rowKey(row);
            const nextView = composeViewAfterInsert(view, targetKey, key, position);

            const adjustedRows = view.source.map(item => {
                const adjustment = plan.adjustments.find(
                    candidate => candidate.clientKey === rowKey(item)
                );
                return adjustment
                    ? { ...item, displayOrder: adjustment.after }
                    : item;
            });
            const nextRows = insertAt(adjustedRows, nextView.sourceIndex, row);

            await applyView(nextRows, nextView.proxyKeys, nextView.visibleKeys);
            changeBridge.applyRowChanges(
                rowTransitionsForInsert(row, plan.adjustments, "forward")
            );

            try {
                historyCoordinator.record({
                    adapterKey: HISTORY_ADAPTER_KEY,
                    kind: "row-insert",
                    label: position === "above" ? "Insert Row Above" : "Insert Row Below",
                    focusTarget: null,
                    payload: {
                        action: "insert",
                        position,
                        targetKey,
                        row: cloneValue(row),
                        adjustments: cloneValue(plan.adjustments)
                    }
                });
            } catch (error) {
                await applyInsertPayload({
                    action: "insert",
                    position,
                    targetKey,
                    row,
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

    async function deleteSelection() {
        if (busy || !menuContext) {
            return false;
        }
        const context = menuContext;
        hideMenu();
        const keys = context.selectedKeys;
        if (keys.length === 0) {
            return false;
        }

        const confirmed = window.confirm(
            keys.length === 1
                ? "هل تريد حذف الصف المحدد؟"
                : `هل تريد حذف ${keys.length.toLocaleString()} صفوف محددة؟`
        );
        if (!confirmed) {
            return false;
        }

        busy = true;
        notifyState();
        try {
            const view = await captureView();
            const removedSet = new Set(keys);
            const records = [];

            for (const key of keys) {
                const sourceIndex = view.sourceKeys.indexOf(key);
                const proxyIndex = view.proxyKeys.indexOf(key);
                const visibleIndex = view.visibleKeys.indexOf(key);
                if (sourceIndex < 0 || proxyIndex < 0 || visibleIndex < 0) {
                    throw new Error(`Selected row '${key}' is no longer visible.`);
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

    menu.append(
        createMenuButton("Insert 1 Row Above", () => void insertRelative("above")),
        createMenuButton("Insert 1 Row Below", () => void insertRelative("below"))
    );
    const separator = document.createElement("div");
    separator.className = `${MENU_CLASS}__separator`;
    menu.append(separator);
    menu.append(
        createMenuButton("Delete Selected Rows", () => void deleteSelection(), true)
    );
    document.body.appendChild(menu);

    const onContextMenu = event => {
        event.preventDefault();
        const x = event.clientX;
        const y = event.clientY;
        void resolveMenuContext().then(context => {
            if (destroyed || !context.targetKey) {
                hideMenu();
                return;
            }
            menuContext = context;
            positionMenu(menu, x, y);
        });
    };

    const onDocumentPointerDown = event => {
        if (menu.hidden) {
            return;
        }
        const path = typeof event.composedPath === "function"
            ? event.composedPath()
            : [];
        if (!path.includes(menu)) {
            hideMenu();
        }
    };

    addListener(grid, "contextmenu", onContextMenu);
    addListener(grid, "viewportscroll", hideMenu);
    addListener(document, "pointerdown", onDocumentPointerDown, true);
    addListener(window, "resize", hideMenu, { passive: true });

    async function resetDataset(nextRows, nextDatasetKey) {
        hideMenu();
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
            menuOpen: !menu.hidden
        };
    }

    function destroy() {
        if (destroyed) {
            return;
        }
        hideMenu();
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
        destroyed = true;
    }

    return Object.freeze({
        resetDataset,
        getState,
        destroy
    });
}

export const revoGridRowStructureInternals = Object.freeze({
    HISTORY_ADAPTER_KEY,
    DISPLAY_ORDER_STEP,
    FILTER_TRIMMED_TYPE
});
