const HISTORY_ADAPTER_KEY =
    "work-orders-column-visibility";

function text(value) {
    return String(value ?? "").trim();
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

    return JSON.parse(JSON.stringify(value));
}

function normalizeRecord(record) {
    return {
        id: Number(record?.id ?? record?.Id ?? 0) || 0,
        fieldKey: text(
            record?.fieldKey ?? record?.FieldKey
        ),
        isHidden: Boolean(
            record?.isHidden ?? record?.IsHidden ?? false
        ),
        rowVersion: text(
            record?.rowVersion ?? record?.RowVersion
        )
    };
}

function normalizeRecords(records) {
    const byField = new Map();

    for (const raw of Array.isArray(records)
        ? records
        : []) {
        const record = normalizeRecord(raw);
        if (record.fieldKey) {
            byField.set(record.fieldKey, record);
        }
    }

    return [...byField.values()]
        .sort((left, right) =>
            left.fieldKey.localeCompare(right.fieldKey));
}

function recordMap(records) {
    return new Map(
        normalizeRecords(records)
            .map(record => [
                record.fieldKey,
                record
            ])
    );
}

function isHidden(map, fieldKey) {
    return map.get(fieldKey)?.isHidden === true;
}

export function createRevoGridColumnVisibility(options) {
    const adapter = options?.adapter;
    const columnWorkspace = options?.columnWorkspace;
    const historyCoordinator = options?.historyCoordinator;
    const clearSelection = options?.clearSelection;
    const mutationLocked =
        options?.mutationLocked ?? (() => false);
    const afterApply = options?.afterApply;

    if (
        !adapter?.applyHiddenProps ||
        !adapter?.getAllColumns
    ) {
        throw new Error(
            "Column Visibility requires the Revo visibility adapter."
        );
    }

    if (!columnWorkspace?.getOrderedProps) {
        throw new Error(
            "Column Visibility requires Column Workspace."
        );
    }

    if (
        !historyCoordinator?.registerAdapter ||
        !historyCoordinator?.record
    ) {
        throw new Error(
            "Column Visibility requires Sheet History."
        );
    }

    let current =
        normalizeRecords(options?.columnVisibilities);
    let baseline = cloneValue(current);
    let busy = false;
    let destroyed = false;

    function allowedProps() {
        return (
            columnWorkspace.getOrderedProps?.() ?? []
        )
            .map(text)
            .filter(Boolean);
    }

    function allowedSet() {
        return new Set(allowedProps());
    }

    function hiddenProps(records = current) {
        const map = recordMap(records);

        return allowedProps()
            .filter(prop => isHidden(map, prop));
    }

    function hiddenSet(records = current) {
        return new Set(hiddenProps(records));
    }

    function visibilityChanged() {
        const before = hiddenSet(baseline);
        const after = hiddenSet(current);
        const props = allowedProps();

        return props.some(prop =>
            before.has(prop) !== after.has(prop)
        );
    }

    function notifyState() {
        options?.onStateChange?.(getState());
    }

    function nextRecordsForHiddenState(
        records,
        prop,
        hidden
    ) {
        const map = recordMap(records);
        const base = recordMap(baseline);
        const existing = map.get(prop);

        if (existing) {
            if (
                hidden === false &&
                existing.id <= 0 &&
                !base.has(prop)
            ) {
                map.delete(prop);
            } else {
                map.set(prop, {
                    ...existing,
                    isHidden: hidden
                });
            }
        } else if (hidden) {
            map.set(prop, {
                id: 0,
                fieldKey: prop,
                isHidden: true,
                rowVersion: ""
            });
        }

        return normalizeRecords([...map.values()]);
    }

    async function applyRecords(
        records,
        { clearCurrentSelection = false } = {}
    ) {
        if (
            clearCurrentSelection &&
            typeof clearSelection === "function"
        ) {
            await clearSelection();
        }

        const next = normalizeRecords(records);
        await adapter.applyHiddenProps(
            hiddenProps(next)
        );
        if (typeof afterApply === 'function') {
            await afterApply();
        }
        current = next;
        notifyState();
    }

    async function applySemanticState(
        prop,
        hidden,
        { clearCurrentSelection = true } = {}
    ) {
        const fieldKey = text(prop);

        if (!allowedSet().has(fieldKey)) {
            throw new Error(
                "The column is no longer available."
            );
        }

        const beforeMap = recordMap(current);
        if (isHidden(beforeMap, fieldKey) === hidden) {
            return false;
        }

        const next = nextRecordsForHiddenState(
            current,
            fieldKey,
            hidden
        );

        await applyRecords(next, {
            clearCurrentSelection
        });

        return true;
    }

    const unregisterHistoryAdapter =
        historyCoordinator.registerAdapter(
            HISTORY_ADAPTER_KEY,
            {
                apply: async (entry, direction) => {
                    const prop =
                        text(entry?.payload?.prop);
                    const hidden = direction === "undo"
                        ? entry?.payload?.beforeHidden === true
                        : entry?.payload?.afterHidden === true;

                    if (!prop) {
                        throw new Error(
                            "Column Visibility History prop is missing."
                        );
                    }

                    busy = true;
                    notifyState();

                    try {
                        await applySemanticState(
                            prop,
                            hidden,
                            {
                                clearCurrentSelection: true
                            }
                        );
                    } finally {
                        busy = false;
                        notifyState();
                    }
                }
            }
        );

    async function mutate(prop, hidden, label) {
        if (
            destroyed ||
            busy ||
            mutationLocked()
        ) {
            return false;
        }

        const fieldKey = text(prop);
        if (!allowedSet().has(fieldKey)) {
            throw new Error(
                "Choose an available data column."
            );
        }

        const beforeHidden =
            hiddenSet(current).has(fieldKey);

        if (beforeHidden === hidden) {
            return false;
        }

        busy = true;
        notifyState();

        try {
            const changed =
                await applySemanticState(
                    fieldKey,
                    hidden,
                    {
                        clearCurrentSelection: true
                    }
                );

            if (!changed) {
                return false;
            }

            try {
                historyCoordinator.record({
                    adapterKey: HISTORY_ADAPTER_KEY,
                    kind: "column-visibility",
                    label,
                    focusTarget: null,
                    payload: {
                        prop: fieldKey,
                        beforeHidden,
                        afterHidden: hidden
                    }
                });
            } catch (error) {
                await applySemanticState(
                    fieldKey,
                    beforeHidden,
                    {
                        clearCurrentSelection: false
                    }
                );
                throw error;
            }

            return true;
        } finally {
            busy = false;
            notifyState();
        }
    }

    async function columnName(prop) {
        const fieldKey = text(prop);
        const columns =
            await adapter.getAllColumns("all");
        return text(
            columns.find(column =>
                text(column?.prop) === fieldKey
            )?.name
        ) || fieldKey;
    }

    async function hideColumn(prop) {
        const fieldKey = text(prop);
        const allowed = allowedProps();

        if (
            !fieldKey ||
            !allowed.includes(fieldKey)
        ) {
            throw new Error(
                "Choose a visible data column to hide."
            );
        }

        const hidden = hiddenSet();

        if (hidden.has(fieldKey)) {
            return false;
        }

        const visibleCount =
            allowed.filter(item =>
                !hidden.has(item)
            ).length;

        if (visibleCount <= 1) {
            throw new Error(
                "At least one data column must remain visible."
            );
        }

        return mutate(
            fieldKey,
            true,
            `Hide Column ${await columnName(fieldKey)}`
        );
    }

    async function unhideColumn(prop) {
        const fieldKey = text(prop);

        if (
            !fieldKey ||
            !allowedSet().has(fieldKey)
        ) {
            throw new Error(
                "The hidden column is no longer available."
            );
        }

        if (!hiddenSet().has(fieldKey)) {
            return false;
        }

        return mutate(
            fieldKey,
            false,
            `Unhide Column ${await columnName(fieldKey)}`
        );
    }

    async function describeContext(targetProp) {
        const props = allowedProps();
        const allowed = new Set(props);
        const hidden = hiddenSet();
        const prop = text(targetProp);

        const columns =
            await adapter.getAllColumns("all");
        const nameByProp = new Map(
            columns.map(column => [
                text(column?.prop),
                text(column?.name) ||
                    text(column?.prop)
            ])
        );

        const hiddenColumns = props
            .filter(item => hidden.has(item))
            .map(item => ({
                prop: item,
                name:
                    nameByProp.get(item) ||
                    item
            }));

        const targetExists =
            Boolean(prop && allowed.has(prop));
        const targetHidden =
            Boolean(
                targetExists &&
                hidden.has(prop)
            );
        const visibleCount =
            props.filter(item =>
                !hidden.has(item)
            ).length;

        return {
            enabled: targetExists,
            targetProp:
                targetExists ? prop : null,
            targetHidden,
            canHide:
                targetExists &&
                !targetHidden &&
                visibleCount > 1,
            hideReason:
                targetExists &&
                !targetHidden &&
                visibleCount <= 1
                    ? "At least one data column must remain visible."
                    : "",
            hiddenColumns,
            visibleCount
        };
    }

    function getSaveSnapshot() {
        const before = recordMap(baseline);
        const after = recordMap(current);
        const changed = [];

        for (const fieldKey of allowedProps()) {
            const beforeHidden =
                isHidden(before, fieldKey);
            const afterHidden =
                isHidden(after, fieldKey);

            if (beforeHidden === afterHidden) {
                continue;
            }

            const identity =
                after.get(fieldKey) ??
                before.get(fieldKey);

            changed.push({
                id: Number(identity?.id ?? 0) || 0,
                fieldKey,
                isHidden: afterHidden,
                rowVersion:
                    text(identity?.rowVersion)
            });
        }

        return {
            columnVisibilitiesChanged:
                changed.length > 0,
            columnVisibilities:
                changed.sort((left, right) =>
                    left.fieldKey.localeCompare(
                        right.fieldKey
                    )),
            generation: {
                hiddenProps: hiddenProps(current)
            }
        };
    }

    async function acceptSavedVisibility(
        savedRecords,
        generation
    ) {
        const props = allowedProps();
        const saved =
            normalizeRecords(savedRecords);
        const savedMap = recordMap(saved);

        const currentBefore = hiddenSet(current);
        const generationHidden = new Set(
            (
                Array.isArray(generation?.hiddenProps)
                    ? generation.hiddenProps
                    : []
            )
                .map(text)
                .filter(Boolean)
        );

        const nextMap = new Map(savedMap);

        for (const prop of props) {
            const browserHidden =
                currentBefore.has(prop);
            const snapshotHidden =
                generationHidden.has(prop);

            // Same semantic state as the frozen Save generation: accept the
            // server state/identity exactly. Different state means the employee
            // changed visibility while SQL was in flight; keep that newer
            // semantic intent but rebase it onto the server Id/RowVersion.
            if (browserHidden === snapshotHidden) {
                continue;
            }

            const serverRecord =
                savedMap.get(prop);

            if (serverRecord) {
                nextMap.set(prop, {
                    ...serverRecord,
                    isHidden: browserHidden
                });
            } else if (browserHidden) {
                nextMap.set(prop, {
                    id: 0,
                    fieldKey: prop,
                    isHidden: true,
                    rowVersion: ""
                });
            } else {
                nextMap.delete(prop);
            }
        }

        const nextBaseline = saved;
        const nextCurrent =
            normalizeRecords([...nextMap.values()]);

        const beforeVisual =
            JSON.stringify(hiddenProps(current));
        const afterVisual =
            JSON.stringify(hiddenProps(nextCurrent));

        if (
            beforeVisual !== afterVisual &&
            typeof clearSelection === "function"
        ) {
            await clearSelection();
        }

        if (beforeVisual !== afterVisual) {
            await adapter.applyHiddenProps(
                hiddenProps(nextCurrent)
            );
        }

        baseline = cloneValue(nextBaseline);
        current = nextCurrent;
        notifyState();
    }

    function discardHistoryForMissingColumns() {
        const allowed = allowedSet();

        historyCoordinator.discardWhere(entry =>
            entry?.adapterKey ===
                HISTORY_ADAPTER_KEY &&
            !allowed.has(
                text(entry?.payload?.prop)
            )
        );
    }

    async function resetDataset(
        records,
        { apply = true } = {}
    ) {
        current = normalizeRecords(records);
        baseline = cloneValue(current);

        if (apply) {
            await adapter.applyHiddenProps(
                hiddenProps(current)
            );
        }

        notifyState();
    }

    async function reapply() {
        if (destroyed) {
            return;
        }

        await adapter.applyHiddenProps(
            hiddenProps(current)
        );
        notifyState();
    }

    async function reconcileColumns() {
        // Keep metadata for a temporarily deleted Custom Column in browser
        // memory. Undo can restore the same stable FieldKey before Save.
        // hiddenProps() filters by the currently authored prop set.
        await reapply();
    }

    function getState() {
        const hidden = hiddenProps();

        return {
            columnVisibilityBusy: busy,
            columnVisibilitiesChanged:
                visibilityChanged(),
            hiddenProps: [...hidden],
            hiddenCount: hidden.length,
            visibleCount: Math.max(
                0,
                allowedProps().length -
                    hidden.length
            )
        };
    }

    function getDatasetRecords() {
        return cloneValue(current);
    }

    function destroy() {
        if (destroyed) {
            return;
        }

        try {
            unregisterHistoryAdapter();
        } catch {
        }

        destroyed = true;
    }

    return Object.freeze({
        hideColumn,
        unhideColumn,
        describeContext,
        getState,
        getDatasetRecords,
        getSaveSnapshot,
        acceptSavedVisibility,
        discardHistoryForMissingColumns,
        resetDataset,
        reapply,
        reconcileColumns,
        destroy
    });
}

export const revoGridColumnVisibilityInternals =
    Object.freeze({
        HISTORY_ADAPTER_KEY,
        normalizeRecord,
        normalizeRecords
    });