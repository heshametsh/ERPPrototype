const HISTORY_ADAPTER_KEY = "work-orders-column-workspace";
const COLUMN_LAYOUT_STEP = 1_000_000_000_000;
const MAX_INSERT_COLUMNS = 1000;
const VALID_TYPES = new Set(["Text", "Money", "Date", "Number"]);

const CORE_COLUMNS = Object.freeze([
    { prop: "workOrderNumber", name: "Work Order Number", layoutOrder: 1 * COLUMN_LAYOUT_STEP },
    { prop: "workTypeCode", name: "Work Type", layoutOrder: 2 * COLUMN_LAYOUT_STEP },
    { prop: "assignmentDate", name: "Assignment Date", layoutOrder: 3 * COLUMN_LAYOUT_STEP },
    { prop: "workOrderValue", name: "Work Order Value", layoutOrder: 4 * COLUMN_LAYOUT_STEP },
    { prop: "partialAmount", name: "Partial Amount", layoutOrder: 5 * COLUMN_LAYOUT_STEP },
    { prop: "remainingAmount", name: "Remaining Amount", layoutOrder: 6 * COLUMN_LAYOUT_STEP },
    { prop: "basket", name: "Basket", layoutOrder: 7 * COLUMN_LAYOUT_STEP }
]);

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

function normalizeCustomColumn(column) {
    return {
        id: Number(column?.id ?? column?.Id) || 0,
        fieldKey: String(column?.fieldKey ?? column?.FieldKey ?? "").trim(),
        name: String(column?.name ?? column?.Name ?? "").trim(),
        dataType: String(column?.dataType ?? column?.DataType ?? "Text").trim(),
        layoutOrder: Number(column?.layoutOrder ?? column?.LayoutOrder) || 0,
        rowVersion: String(column?.rowVersion ?? column?.RowVersion ?? "")
    };
}

function normalizeCustomColumns(columns) {
    return (Array.isArray(columns) ? columns : [])
        .map(normalizeCustomColumn)
        .filter(column => column.fieldKey && column.name)
        .sort((left, right) =>
            left.layoutOrder - right.layoutOrder ||
            left.fieldKey.localeCompare(right.fieldKey)
        );
}

function normalizeCustomColumnsInInputOrder(columns) {
    return (Array.isArray(columns) ? columns : [])
        .map(normalizeCustomColumn)
        .filter(column => column.fieldKey && column.name);
}

function logicalInsertionPosition(visualPosition, rtl) {
    const position = String(visualPosition ?? "").trim().toLowerCase();
    if (position !== "left" && position !== "right") {
        throw new Error("Insert column position must be left or right.");
    }
    if (!rtl) {
        return position;
    }
    return position === "left" ? "right" : "left";
}

function additionsForLogicalPosition(additions, logicalPosition) {
    const ordered = normalizeCustomColumnsInInputOrder(additions);
    return logicalPosition === "left"
        ? [...ordered].reverse()
        : ordered;
}

function serializeColumns(columns) {
    return JSON.stringify(normalizeCustomColumns(columns));
}

function createFieldKey() {
    if (globalThis.crypto?.randomUUID) {
        return `custom_${globalThis.crypto.randomUUID().replaceAll("-", "").toLowerCase()}`;
    }

    const bytes = new Uint8Array(16);
    globalThis.crypto?.getRandomValues?.(bytes);
    const token = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("") ||
        `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
    return `custom_${token.toLowerCase()}`;
}

function buildOrderedEntries(customColumns) {
    const core = CORE_COLUMNS.map(column => ({
        prop: column.prop,
        name: column.name,
        layoutOrder: column.layoutOrder,
        custom: false
    }));
    const custom = normalizeCustomColumns(customColumns).map(column => ({
        prop: column.fieldKey,
        name: column.name,
        layoutOrder: column.layoutOrder,
        custom: true
    }));

    return [...core, ...custom].sort((left, right) =>
        left.layoutOrder - right.layoutOrder ||
        left.prop.localeCompare(right.prop)
    );
}

function validateInsertionRequest(anchorProp, position, requestedCount) {
    const prop = String(anchorProp ?? "").trim();
    const count = Number(requestedCount);
    if (!prop) {
        throw new Error("Insert column anchor is required.");
    }
    if (!Number.isInteger(count) || count < 1 || count > MAX_INSERT_COLUMNS) {
        throw new Error(`Insert column count must be between 1 and ${MAX_INSERT_COLUMNS}.`);
    }
    if (position !== "left" && position !== "right") {
        throw new Error("Insert column position must be left or right.");
    }
    return { prop, count };
}

function directInsertionOrders(customColumns, anchorProp, position, requestedCount) {
    const { prop, count } = validateInsertionRequest(anchorProp, position, requestedCount);
    const ordered = buildOrderedEntries(customColumns);
    const anchorIndex = ordered.findIndex(column => column.prop === prop);
    if (anchorIndex < 0) {
        throw new Error(`Column '${prop}' is no longer available.`);
    }

    const anchorOrder = ordered[anchorIndex].layoutOrder;
    let lower;
    let upper;

    if (position === "left") {
        lower = anchorIndex > 0 ? ordered[anchorIndex - 1].layoutOrder : 0;
        upper = anchorOrder;
    } else {
        lower = anchorOrder;
        upper = anchorIndex < ordered.length - 1
            ? ordered[anchorIndex + 1].layoutOrder
            : anchorOrder + COLUMN_LAYOUT_STEP;
    }

    const interval = Math.floor((upper - lower) / (count + 1));
    if (interval < 1) {
        return null;
    }

    return Array.from({ length: count }, (_, index) =>
        lower + interval * (index + 1)
    );
}

export function planColumnBatchInsertion(customColumns, anchorProp, position, requestedCount) {
    const orders = directInsertionOrders(
        customColumns,
        anchorProp,
        position,
        requestedCount
    );
    if (!orders) {
        throw new Error("Column positions require rebalancing before this insertion can be applied.");
    }
    return orders;
}

function rebalanceOrderedEntries(entries) {
    const insertedIndexes = entries
        .map((entry, index) => entry.inserted ? index : -1)
        .filter(index => index >= 0);
    if (insertedIndexes.length === 0) {
        throw new Error("Column rebalance requires at least one inserted column.");
    }

    let start = Math.min(...insertedIndexes);
    let end = Math.max(...insertedIndexes);
    while (start > 0 && entries[start - 1].custom) {
        start -= 1;
    }
    while (end < entries.length - 1 && entries[end + 1].custom) {
        end += 1;
    }

    const previousCore = start > 0 ? entries[start - 1] : null;
    const nextCore = end < entries.length - 1 ? entries[end + 1] : null;
    const lower = previousCore?.custom === false
        ? Number(previousCore.layoutOrder)
        : 0;
    const upper = nextCore?.custom === false
        ? Number(nextCore.layoutOrder)
        : lower + COLUMN_LAYOUT_STEP;
    const segment = entries.slice(start, end + 1);
    const interval = Math.floor((upper - lower) / (segment.length + 1));
    if (interval < 1) {
        throw new Error("Too many Custom Columns are packed into the same section of the sheet.");
    }

    const rebalancedByProp = new Map(
        segment.map((entry, index) => [
            entry.prop,
            lower + interval * (index + 1)
        ])
    );

    return normalizeCustomColumns(
        entries
            .filter(entry => entry.custom)
            .map(entry => ({
                ...entry.column,
                layoutOrder: rebalancedByProp.get(entry.prop) ?? entry.column.layoutOrder
            }))
    );
}

export function planColumnWorkspaceInsertion(customColumns, anchorProp, position, addedColumns) {
    const additions = normalizeCustomColumnsInInputOrder(addedColumns);
    const { prop } = validateInsertionRequest(anchorProp, position, additions.length);
    const current = normalizeCustomColumns(customColumns);
    const directOrders = directInsertionOrders(current, prop, position, additions.length);

    if (directOrders) {
        return {
            rebalanced: false,
            columns: normalizeCustomColumns([
                ...current,
                ...additions.map((column, index) => ({
                    ...column,
                    layoutOrder: directOrders[index]
                }))
            ])
        };
    }

    const currentByProp = new Map(current.map(column => [column.fieldKey, column]));
    const ordered = buildOrderedEntries(current).map(entry => ({
        ...entry,
        column: entry.custom ? currentByProp.get(entry.prop) : null,
        inserted: false
    }));
    const anchorIndex = ordered.findIndex(entry => entry.prop === prop);
    if (anchorIndex < 0) {
        throw new Error(`Column '${prop}' is no longer available.`);
    }

    const insertionEntries = additions.map(column => ({
        prop: column.fieldKey,
        name: column.name,
        layoutOrder: 0,
        custom: true,
        column,
        inserted: true
    }));
    const insertionIndex = position === "left" ? anchorIndex : anchorIndex + 1;
    ordered.splice(insertionIndex, 0, ...insertionEntries);

    return {
        rebalanced: true,
        columns: rebalanceOrderedEntries(ordered)
    };
}

function validateSpecifications(specifications, existingColumns) {
    const specs = Array.isArray(specifications) ? specifications : [];
    if (specs.length < 1 || specs.length > MAX_INSERT_COLUMNS) {
        throw new Error(`Insert column count must be between 1 and ${MAX_INSERT_COLUMNS}.`);
    }

    const usedNames = new Set(
        buildOrderedEntries(existingColumns)
            .map(column => column.name.trim().toLocaleLowerCase())
    );

    return specs.map((specification, index) => {
        const name = String(specification?.name ?? "").trim();
        const dataType = String(specification?.dataType ?? "Text").trim();
        if (!name) {
            throw new Error(`Column ${index + 1}: name is required.`);
        }
        if (name.length > 150) {
            throw new Error(`Column ${index + 1}: name cannot exceed 150 characters.`);
        }
        if (!VALID_TYPES.has(dataType)) {
            throw new Error(`Column ${index + 1}: select a valid type.`);
        }
        const key = name.toLocaleLowerCase();
        if (usedNames.has(key)) {
            throw new Error(`Column ${index + 1}: '${name}' already exists.`);
        }
        usedNames.add(key);
        return { name, dataType };
    });
}

export function createRevoGridColumnWorkspace(options) {
    const grid = options?.grid;
    const historyCoordinator = options?.historyCoordinator;
    const validationOwner = options?.validationOwner ?? null;
    const selectionContext = options?.selectionContext ?? null;
    const excelFilter = options?.excelFilter ?? null;
    const sortController = options?.sortController ?? null;
    const replaceColumns = options?.replaceColumns;

    if (!grid || typeof grid.getColumns !== "function" || typeof grid.getSource !== "function") {
        throw new Error("A compatible RevoGrid element is required.");
    }
    if (!historyCoordinator || typeof historyCoordinator.registerAdapter !== "function") {
        throw new Error("Sheet History coordinator is required.");
    }
    if (typeof replaceColumns !== "function") {
        throw new Error("Column Workspace requires a replaceColumns callback.");
    }

    let current = normalizeCustomColumns(options?.customColumns);
    let baseline = cloneValue(current);
    let busy = false;
    let destroyed = false;

    function notifyState() {
        if (typeof options?.onStateChange === "function") {
            options.onStateChange(getState());
        }
    }

    function getViewState() {
        return {
            filterState: excelFilter?.getFilterState?.() ?? {},
            sortState: sortController?.getSortState?.() ?? null
        };
    }

    function sanitizeViewState(viewState, nextColumns) {
        const allowed = new Set(buildOrderedEntries(nextColumns).map(column => column.prop));
        const nextFilter = {};
        for (const [field, values] of Object.entries(viewState?.filterState ?? {})) {
            if (allowed.has(field)) {
                nextFilter[field] = cloneValue(values);
            }
        }
        const sort = viewState?.sortState;
        const nextSort = sort && allowed.has(String(sort.field ?? ""))
            ? cloneValue(sort)
            : null;
        return { filterState: nextFilter, sortState: nextSort };
    }

    async function applyWorkspaceSnapshot(snapshot) {
        const normalized = normalizeCustomColumns(snapshot?.columns ?? snapshot);
        const desiredView = sanitizeViewState(
            {
                filterState: snapshot?.filterState ?? excelFilter?.getFilterState?.() ?? {},
                sortState: snapshot?.sortState ?? sortController?.getSortState?.() ?? null
            },
            normalized
        );

        selectionContext?.clearExplicitSelection?.();
        await grid.clearFocus();
        await replaceColumns(normalized);
        current = normalized;

        excelFilter?.refreshColumns?.();
        sortController?.refreshColumns?.();

        if (excelFilter?.setFilterState) {
            await excelFilter.setFilterState(desiredView.filterState, {
                remember: true,
                preserveSelection: false
            });
        }
        if (sortController?.setSortState) {
            await sortController.setSortState(desiredView.sortState, {
                remember: true,
                preserveSelection: false
            });
        }

        if (validationOwner?.resetDataset) {
            const rows = await grid.getSource("rgRow");
            validationOwner.resetDataset(rows, current);
            await grid.refresh("rgRow");
        }
        notifyState();
    }

    const unregisterHistoryAdapter = historyCoordinator.registerAdapter(
        HISTORY_ADAPTER_KEY,
        {
            apply: async (entry, direction) => {
                const snapshot = direction === "undo"
                    ? entry?.payload?.before
                    : entry?.payload?.after;
                if (!snapshot || !Array.isArray(snapshot.columns)) {
                    throw new Error("Column Workspace History snapshot is missing.");
                }
                busy = true;
                notifyState();
                try {
                    await applyWorkspaceSnapshot(snapshot);
                } finally {
                    busy = false;
                    notifyState();
                }
            }
        }
    );

    async function mutate(label, mutator) {
        if (busy) {
            return false;
        }

        const before = {
            columns: cloneValue(current),
            ...getViewState()
        };
        const afterColumns = normalizeCustomColumns(mutator(cloneValue(current)));
        const after = {
            columns: cloneValue(afterColumns),
            ...sanitizeViewState(before, afterColumns)
        };
        if (serializeColumns(before.columns) === serializeColumns(after.columns)) {
            return false;
        }

        busy = true;
        notifyState();
        try {
            await applyWorkspaceSnapshot(after);
            try {
                historyCoordinator.record({
                    adapterKey: HISTORY_ADAPTER_KEY,
                    kind: "column-workspace",
                    label,
                    focusTarget: null,
                    payload: { before, after: cloneValue(after) }
                });
            } catch (error) {
                await applyWorkspaceSnapshot(before);
                throw error;
            }
            return true;
        } finally {
            busy = false;
            notifyState();
        }
    }

    async function insertColumns({ anchorProp, position, specifications } = {}) {
        const specs = validateSpecifications(specifications, current);
        const visualPosition = String(position ?? "").trim().toLowerCase();
        const logicalPosition = logicalInsertionPosition(visualPosition, Boolean(grid.rtl));
        const added = additionsForLogicalPosition(
            specs.map(specification => ({
                id: 0,
                fieldKey: createFieldKey(),
                name: specification.name,
                dataType: specification.dataType,
                layoutOrder: 0,
                rowVersion: ""
            })),
            logicalPosition
        );
        const plan = planColumnWorkspaceInsertion(
            current,
            anchorProp,
            logicalPosition,
            added
        );

        return mutate(
            specs.length === 1
                ? `Insert Column ${visualPosition}`
                : `Insert ${specs.length} Columns ${visualPosition}`,
            () => plan.columns
        );
    }

    async function deleteColumns(props) {
        const requested = new Set(
            (Array.isArray(props) ? props : [])
                .map(value => String(value ?? "").trim())
                .filter(Boolean)
        );
        const deletable = current.filter(column => requested.has(column.fieldKey));
        if (deletable.length === 0) {
            return false;
        }
        const deletedKeys = new Set(deletable.map(column => column.fieldKey));
        return mutate(
            deletable.length === 1 ? `Delete Column ${deletable[0].name}` : `Delete ${deletable.length} Columns`,
            columns => columns.filter(column => !deletedKeys.has(column.fieldKey))
        );
    }

    async function resolveContext(clickedCell, selectionSnapshot = null) {
        const columns = await grid.getColumns();
        const targetIndex = Number(clickedCell?.colIndex);
        const target = Number.isInteger(targetIndex) ? columns[targetIndex] : null;
        const targetProp = String(target?.prop ?? "").trim() || null;
        const snapshot = selectionSnapshot ??
            (selectionContext?.getSnapshot ? await selectionContext.getSnapshot() : null);
        const range = snapshot?.range;
        const selectedProps = [];
        const clickedInsideSelectedColumns = Boolean(
            Number.isInteger(targetIndex) &&
            range &&
            Number.isInteger(range.x) &&
            Number.isInteger(range.x1) &&
            targetIndex >= Math.min(range.x, range.x1) &&
            targetIndex <= Math.max(range.x, range.x1)
        );

        // Same spreadsheet rule as Row Structure: right-click inside the
        // employee's current column/range Selection preserves it. Right-click
        // outside it targets only the clicked column so stale Selection state
        // can never make a destructive command operate on a different column.
        if (targetProp && !clickedInsideSelectedColumns) {
            selectedProps.push(targetProp);
        } else if (range && Number.isInteger(range.x) && Number.isInteger(range.x1)) {
            const start = Math.max(0, Math.min(range.x, range.x1));
            const end = Math.min(columns.length - 1, Math.max(range.x, range.x1));
            for (let index = start; index <= end; index += 1) {
                const prop = String(columns[index]?.prop ?? "").trim();
                if (prop) {
                    selectedProps.push(prop);
                }
            }
        } else if (snapshot?.kind === "column" && snapshot?.prop) {
            selectedProps.push(String(snapshot.prop));
        } else if (targetProp) {
            selectedProps.push(targetProp);
        }

        const customKeys = new Set(current.map(column => column.fieldKey));
        return {
            targetProp,
            targetCustom: Boolean(targetProp && customKeys.has(targetProp)),
            selectedProps: [...new Set(selectedProps)],
            selectedCustomProps: [...new Set(selectedProps.filter(prop => customKeys.has(prop)))],
            allCustomProps: current.map(column => column.fieldKey),
            customColumnCount: current.length,
            selectionKind: snapshot?.kind ?? "none"
        };
    }

    function getState() {
        return {
            columnWorkspaceBusy: busy,
            customColumnCount: current.length,
            customColumnsChanged: serializeColumns(current) !== serializeColumns(baseline),
            customColumns: cloneValue(current)
        };
    }

    function getOrderedProps() {
        return buildOrderedEntries(current).map(column => column.prop);
    }

    function getSaveSnapshot() {
        const state = getState();
        return {
            customColumnsChanged: state.customColumnsChanged,
            customColumns: state.customColumns
        };
    }

    async function resetColumns(nextColumns) {
        busy = true;
        notifyState();
        try {
            current = normalizeCustomColumns(nextColumns);
            baseline = cloneValue(current);
            await applyWorkspaceSnapshot({
                columns: current,
                ...getViewState()
            });
        } finally {
            busy = false;
            notifyState();
        }
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
        insertColumns,
        deleteColumns,
        resolveContext,
        getState,
        getOrderedProps,
        getSaveSnapshot,
        resetColumns,
        destroy
    });
}

export const revoGridColumnWorkspaceInternals = Object.freeze({
    HISTORY_ADAPTER_KEY,
    COLUMN_LAYOUT_STEP,
    MAX_INSERT_COLUMNS,
    VALID_TYPES,
    CORE_COLUMNS,
    normalizeCustomColumns,
    normalizeCustomColumnsInInputOrder,
    logicalInsertionPosition,
    additionsForLogicalPosition,
    buildOrderedEntries,
    validateSpecifications,
    directInsertionOrders,
    rebalanceOrderedEntries
});
