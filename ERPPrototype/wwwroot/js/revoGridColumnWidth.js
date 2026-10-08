const HISTORY_ADAPTER_KEY = "work-orders-column-width";
const MIN_WIDTH = 45;
const MAX_WIDTH = 1000;
const COLUMN_TYPES = Object.freeze(["colPinStart", "rgCol", "colPinEnd"]);
const CORE_DEFAULT_WIDTHS = Object.freeze({
    workOrderNumber: 220,
    workTypeCode: 130,
    assignmentDate: 160,
    workOrderValue: 190,
    partialAmount: 180,
    remainingAmount: 200,
    basket: 330
});

function text(value) {
    return String(value ?? "").trim();
}

function cloneValue(value) {
    if (value === undefined) return undefined;
    if (typeof structuredClone === "function") {
        try { return structuredClone(value); } catch { }
    }
    return JSON.parse(JSON.stringify(value));
}

function boundedWidth(value, fallback = 190) {
    const number = Math.round(Number(value));
    if (!Number.isFinite(number)) return fallback;
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, number));
}

function normalizeRecord(record) {
    const fieldKey = text(record?.fieldKey ?? record?.FieldKey);
    if (!fieldKey) return null;
    return {
        id: Number(record?.id ?? record?.Id) || 0,
        fieldKey,
        width: boundedWidth(record?.width ?? record?.Width),
        rowVersion: text(record?.rowVersion ?? record?.RowVersion)
    };
}

function normalizeRecords(records) {
    const byField = new Map();
    for (const raw of Array.isArray(records) ? records : []) {
        const record = normalizeRecord(raw);
        if (record) byField.set(record.fieldKey, record);
    }
    return byField;
}

function eventPath(originalEvent) {
    return typeof originalEvent?.composedPath === "function"
        ? originalEvent.composedPath()
        : [originalEvent?.target].filter(Boolean);
}

function isResizeHandle(originalEvent) {
    return eventPath(originalEvent).some(item =>
        item instanceof Element && item.classList?.contains("resizable"));
}

function waitForRender() {
    return new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

export function createRevoGridColumnWidth(options) {
    const grid = options?.grid;
    const historyCoordinator = options?.historyCoordinator;
    const mutationLocked = options?.mutationLocked ?? (() => false);

    if (!grid || typeof grid.getColumns !== "function" ||
        typeof grid.getProviders !== "function") {
        throw new Error("Column Width requires a compatible RevoGrid element.");
    }
    if (!historyCoordinator?.registerAdapter || !historyCoordinator?.record) {
        throw new Error("Column Width requires Sheet History.");
    }

    let baseline = normalizeRecords(options?.columnLayouts);
    let current = normalizeRecords(options?.columnLayouts);
    let allowedProps = new Set();
    let names = new Map();
    let busy = false;
    let destroyed = false;
    let providersPromise = null;

    const defaultWidth = prop =>
        CORE_DEFAULT_WIDTHS[prop] ?? 190;

    function defaultRecord(prop) {
        return {
            id: 0,
            fieldKey: prop,
            width: defaultWidth(prop),
            rowVersion: ""
        };
    }

    function effectiveRecord(map, prop) {
        return map.get(prop) ?? defaultRecord(prop);
    }

    function effectiveWidth(map, prop) {
        return boundedWidth(
            effectiveRecord(map, prop).width,
            defaultWidth(prop));
    }

    function notifyState() {
        options?.onStateChange?.(getState());
    }

    async function providers() {
        providersPromise ??= Promise.resolve(grid.getProviders());
        const value = await providersPromise;
        if (!value?.column?.getRawColumns || !value?.dimension?.setCustomSizes) {
            throw new Error("RevoGrid column/dimension providers are unavailable.");
        }
        return value;
    }

    function visibleEntries(value, type) {
        const raw = value.column.getRawColumns();
        const source = Array.isArray(raw?.[type]) ? raw[type] : [];
        const items = value.column.stores?.[type]?.store?.get?.("items");
        const physicalIndexes = items
            ? Array.from(items).map(Number)
            : source.map((_, index) => index);

        return physicalIndexes
            .map((sourceIndex, visibleIndex) => ({
                type,
                sourceIndex,
                visibleIndex,
                column: source[sourceIndex]
            }))
            .filter(entry => entry.column);
    }

    function findVisibleEntry(value, prop) {
        for (const type of COLUMN_TYPES) {
            const entry = visibleEntries(value, type)
                .find(item => text(item.column?.prop) === prop);
            if (entry) return entry;
        }
        return null;
    }

    async function refreshMetadata() {
        const columns = await grid.getColumns();
        allowedProps = new Set();
        names = new Map();
        for (const column of Array.isArray(columns) ? columns : []) {
            const prop = text(column?.prop);
            if (!prop) continue;
            allowedProps.add(prop);
            names.set(prop, text(column?.name) || prop);
            if (!baseline.has(prop)) baseline.set(prop, defaultRecord(prop));
            if (!current.has(prop)) current.set(prop, cloneValue(baseline.get(prop)));
        }


    }

    async function applyWidths(widths) {
        const value = await providers();
        const grouped = new Map();
        let applied = false;

        for (const [prop, width] of widths) {
            const entry = findVisibleEntry(value, prop);
            if (!entry) continue;
            const sizes = grouped.get(entry.type) ?? {};
            sizes[entry.visibleIndex] = boundedWidth(width, defaultWidth(prop));
            grouped.set(entry.type, sizes);
            applied = true;
        }

        for (const [type, sizes] of grouped) {
            value.dimension.setCustomSizes(type, sizes, true);
        }
        return applied;
    }

    async function applyWidth(prop, width) {
        return applyWidths(new Map([[prop, width]]));
    }

    async function readActualWidth(prop) {
        const value = await providers();
        const entry = findVisibleEntry(value, prop);
        if (!entry) return effectiveWidth(current, prop);
        const sizes = value.dimension.stores?.[entry.type]?.store?.get?.("sizes") ?? {};
        return boundedWidth(
            sizes?.[entry.visibleIndex] ?? entry.column?.size,
            effectiveWidth(current, prop));
    }

    function setCurrentWidth(prop, width) {
        const source = current.get(prop) ?? baseline.get(prop) ?? defaultRecord(prop);
        current.set(prop, {
            ...source,
            fieldKey: prop,
            width: boundedWidth(width, defaultWidth(prop))
        });
    }

    function historyChanges(entry) {
        const explicit = Array.isArray(entry?.payload?.changes)
            ? entry.payload.changes
            : [];
        if (explicit.length > 0) {
            return explicit
                .map(change => ({
                    prop: text(change?.prop),
                    beforeWidth: boundedWidth(change?.beforeWidth),
                    afterWidth: boundedWidth(change?.afterWidth)
                }))
                .filter(change => change.prop);
        }

        const prop = text(entry?.payload?.prop);
        return prop
            ? [{
                prop,
                beforeWidth: boundedWidth(entry?.payload?.beforeWidth),
                afterWidth: boundedWidth(entry?.payload?.afterWidth)
            }]
            : [];
    }

    async function mutate(prop, width, label) {
        const fieldKey = text(prop);
        if (destroyed || busy || mutationLocked() || !allowedProps.has(fieldKey)) {
            return false;
        }

        const beforeWidth = effectiveWidth(current, fieldKey);
        const afterWidth = boundedWidth(width, defaultWidth(fieldKey));
        if (beforeWidth === afterWidth) {
            await applyWidth(fieldKey, afterWidth);
            return false;
        }

        busy = true;
        notifyState();
        setCurrentWidth(fieldKey, afterWidth);
        await applyWidth(fieldKey, afterWidth);

        try {
            historyCoordinator.record({
                adapterKey: HISTORY_ADAPTER_KEY,
                kind: "column-width",
                label,
                focusTarget: null,
                payload: {
                    changes: [{ prop: fieldKey, beforeWidth, afterWidth }]
                }
            });
            return true;
        } catch (error) {
            setCurrentWidth(fieldKey, beforeWidth);
            await applyWidth(fieldKey, beforeWidth);
            throw error;
        } finally {
            busy = false;
            notifyState();
        }
    }

    const unregisterHistoryAdapter = historyCoordinator.registerAdapter(
        HISTORY_ADAPTER_KEY,
        {
            apply: async (entry, direction) => {
                const changes = historyChanges(entry);
                if (changes.length === 0 || changes.some(change =>
                    !allowedProps.has(change.prop))) {
                    throw new Error("Column Width History target is no longer available.");
                }
                const widths = new Map();
                busy = true;
                notifyState();
                try {
                    for (const change of changes) {
                        const width = direction === "undo"
                            ? change.beforeWidth
                            : change.afterWidth;
                        setCurrentWidth(change.prop, width);
                        widths.set(change.prop, width);
                    }
                    await applyWidths(widths);
                } finally {
                    busy = false;
                    notifyState();
                }
            }
        });

    function onBeforeHeaderRender(event) {
        const prop = text(event?.detail?.data?.prop);
        if (!prop || !allowedProps.has(prop)) return;
        event.detail.active = ["r"];
    }

    async function commitNativeResize(prop, candidateWidth) {
        if (destroyed || busy || mutationLocked() || !allowedProps.has(prop)) {
            return false;
        }

        const value = await providers();
        const owner = findVisibleEntry(value, prop);
        if (!owner) return false;

        // Live resize has already written the dragged width into Revo's size
        // store, so the ERP width is the authoritative start of the gesture.
        const ownerStart = effectiveWidth(current, prop);
        const candidate = boundedWidth(candidateWidth, ownerStart);
        const changes = [{
            prop,
            beforeWidth: ownerStart,
            afterWidth: candidate
        }];
        const effectiveChanges = changes.filter(change =>
            change.beforeWidth !== change.afterWidth);
        if (effectiveChanges.length === 0) return false;

        const widths = new Map();
        const rollback = new Map();
        for (const change of effectiveChanges) {
            setCurrentWidth(change.prop, change.afterWidth);
            widths.set(change.prop, change.afterWidth);
            rollback.set(change.prop, change.beforeWidth);
        }

        busy = true;
        notifyState();
        try {
            await applyWidths(widths);
            historyCoordinator.record({
                adapterKey: HISTORY_ADAPTER_KEY,
                kind: "column-width",
                label: `Resize Column ${names.get(prop) ?? prop}`,
                focusTarget: null,
                payload: { changes: effectiveChanges }
            });
            return true;
        } catch (error) {
            for (const change of effectiveChanges) {
                setCurrentWidth(change.prop, change.beforeWidth);
            }
            await applyWidths(rollback);
            throw error;
        } finally {
            busy = false;
            notifyState();
        }
    }

    function onBeforeHeaderResize(event) {
        const candidate = Array.isArray(event?.detail) ? event.detail[0] : null;
        const prop = text(candidate?.prop);
        if (!prop || !allowedProps.has(prop)) return;

        // Revo owns the smooth pointer gesture. ERP owns the committed width
        // policy, so stop only Revo's final dimension write at MouseUp.
        event.preventDefault();
        // Escape already restored the start width; nothing to commit.
        const live = candidate?.erpLiveResize;
        if (live?.cancelled) return;
        if (destroyed || busy || mutationLocked()) {
            // Undo the live drag width that will not be recorded.
            void applyWidth(prop, effectiveWidth(current, prop));
            return;
        }

        void commitNativeResize(prop, live?.width ?? candidate?.size)
            .catch(error => console.error(
                "Column Width native resize commit failed.",
                error));
    }

    async function onHeaderDoubleClick(event) {
        const prop = text(event?.detail?.column?.prop);
        if (!prop || !allowedProps.has(prop)) return;

        const originalEvent = event?.detail?.originalEvent;
        const resizeHandle = isResizeHandle(originalEvent);
        await waitForRender();

        if (!resizeHandle) {
            // Revo Community's AutoSize plugin receives the same headerdblclick
            // event used by our inline Rename. Restore the authoritative width
            // so Rename never causes a hidden width mutation.
            await applyWidth(prop, effectiveWidth(current, prop));
            return;
        }

        const width = await readActualWidth(prop);
        await mutate(
            prop,
            width,
            `Auto Fit Column ${names.get(prop) ?? prop}`);
    }

    grid.addEventListener("beforeheaderrender", onBeforeHeaderRender);
    grid.addEventListener("beforeheaderresize", onBeforeHeaderResize);
    grid.addEventListener("headerdblclick", onHeaderDoubleClick);

    function getState() {
        let changedCount = 0;
        for (const prop of allowedProps) {
            if (effectiveWidth(current, prop) !== effectiveWidth(baseline, prop)) {
                changedCount += 1;
            }
        }
        return {
            columnWidthBusy: busy,
            columnLayoutsChanged: changedCount > 0,
            columnLayoutChangedCount: changedCount
        };
    }

    function getRenderLayouts() {
        // Include retained metadata for temporarily absent/year-specific Custom
        // Columns. Revo applies layouts by stable prop, so unrelated records are
        // harmless and a later rebuild/year switch can restore the saved width.
        const props = new Set([...current.keys(), ...allowedProps]);
        return [...props]
            .map(prop => cloneValue(effectiveRecord(current, prop)))
            .sort((left, right) => left.fieldKey.localeCompare(right.fieldKey));
    }

    function getSaveSnapshot() {
        const changed = [];
        const generationWidths = [];

        for (const prop of allowedProps) {
            const width = effectiveWidth(current, prop);
            generationWidths.push({ fieldKey: prop, width });
            if (width === effectiveWidth(baseline, prop)) continue;

            const identity = current.get(prop) ?? baseline.get(prop) ?? defaultRecord(prop);
            changed.push({
                id: Number(identity.id) || 0,
                fieldKey: prop,
                width,
                rowVersion: text(identity.rowVersion)
            });
        }

        return {
            columnLayoutsChanged: changed.length > 0,
            columnLayouts: changed.sort((a, b) => a.fieldKey.localeCompare(b.fieldKey)),
            generation: {
                widths: generationWidths.sort((a, b) => a.fieldKey.localeCompare(b.fieldKey))
            }
        };
    }

    async function acceptSavedLayouts(savedRecords, generation, { apply = false } = {}) {
        const saved = normalizeRecords(savedRecords);
        const generationWidths = new Map(
            (Array.isArray(generation?.widths) ? generation.widths : [])
                .map(item => [text(item?.fieldKey), boundedWidth(item?.width)])
                .filter(([prop]) => prop));

        const browserWidths = new Map(
            [...allowedProps].map(prop => [prop, effectiveWidth(current, prop)]));
        const nextBaseline = new Map();
        const nextCurrent = new Map();

        for (const prop of allowedProps) {
            const serverRecord = saved.get(prop) ?? defaultRecord(prop);
            nextBaseline.set(prop, cloneValue(serverRecord));

            const browserWidth = browserWidths.get(prop) ?? defaultWidth(prop);
            const snapshotWidth = generationWidths.get(prop) ?? effectiveWidth(baseline, prop);
            nextCurrent.set(
                prop,
                browserWidth === snapshotWidth
                    ? cloneValue(serverRecord)
                    : { ...cloneValue(serverRecord), width: browserWidth });
        }

        baseline = nextBaseline;
        current = nextCurrent;
        if (apply) {
            for (const prop of allowedProps) {
                await applyWidth(prop, effectiveWidth(current, prop));
            }
        }
        notifyState();
    }

    async function resetLayouts(records, { apply = true } = {}) {
        baseline = normalizeRecords(records);
        current = normalizeRecords(records);
        await refreshMetadata();
        if (apply) {
            for (const prop of allowedProps) {
                await applyWidth(prop, effectiveWidth(current, prop));
            }
        }
        notifyState();
    }

    function discardHistoryForMissingColumns() {
        historyCoordinator.discardWhere(entry =>
            entry?.adapterKey === HISTORY_ADAPTER_KEY &&
            historyChanges(entry).some(change =>
                !allowedProps.has(change.prop)));
    }

    async function reconcileColumns({ apply = true } = {}) {
        // Keep width metadata and History for a temporarily deleted Custom
        // Column. Column Workspace Undo can restore the same stable FieldKey
        // before Save; only a successful structural Save makes it disposable.
        await refreshMetadata();
        if (apply) {
            for (const prop of allowedProps) {
                await applyWidth(prop, effectiveWidth(current, prop));
            }
        }
        notifyState();
    }

    function destroy() {
        if (destroyed) return;
        grid.removeEventListener("beforeheaderrender", onBeforeHeaderRender);
        grid.removeEventListener("beforeheaderresize", onBeforeHeaderResize);
        grid.removeEventListener("headerdblclick", onHeaderDoubleClick);
        try { unregisterHistoryAdapter(); } catch { }
        providersPromise = null;
        destroyed = true;
    }

    return Object.freeze({
        getState,
        getRenderLayouts,
        getSaveSnapshot,
        acceptSavedLayouts,
        resetLayouts,
        reconcileColumns,
        discardHistoryForMissingColumns,
        destroy
    });
}

export const revoGridColumnWidthInternals = Object.freeze({
    HISTORY_ADAPTER_KEY,
    MIN_WIDTH,
    MAX_WIDTH,
    CORE_DEFAULT_WIDTHS,
    boundedWidth,
    normalizeRecord,
    normalizeRecords,
    isResizeHandle
});
