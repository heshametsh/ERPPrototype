const STYLE_ID = "erp-revogrid-header-selection-style";
const ROW_CELL_CLASS = "erp-revo-selected-row-cell";
const COLUMN_CELL_CLASS = "erp-revo-selected-column-cell";
const ROW_HEADER_CLASS = "erp-revo-selected-row-header";
const COLUMN_HEADER_CLASS = "erp-revo-selected-column-header";
const ROW_POSITION_MAP_THRESHOLD = 64;

function text(value) {
    return String(value ?? "").trim();
}

function composedPath(originalEvent) {
    return typeof originalEvent?.composedPath === "function"
        ? originalEvent.composedPath()
        : [];
}

function isHeaderControlClick(originalEvent) {
    for (const item of composedPath(originalEvent)) {
        if (!(item instanceof Element)) {
            continue;
        }
        if (
            item.hasAttribute("data-erp-filter-prop") ||
            item.hasAttribute("data-erp-sort-prop")
        ) {
            return true;
        }
    }

    const target = originalEvent?.target;
    return target instanceof Element && Boolean(
        target.closest("[data-erp-filter-prop], [data-erp-sort-prop]")
    );
}

function injectStyles() {
    if (document.getElementById(STYLE_ID)) {
        return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        revo-grid .${ROW_CELL_CLASS},
        revo-grid .${COLUMN_CELL_CLASS} {
            background: rgba(33, 150, 243, .14);
        }
        revo-grid .${ROW_HEADER_CLASS},
        revo-grid .${COLUMN_HEADER_CLASS} {
            background: #d9edf9;
            color: #0b5f8a;
            font-weight: 700;
        }
        revo-grid .${ROW_HEADER_CLASS} {
            box-shadow: inset -3px 0 0 #2196f3;
        }
        revo-grid .${COLUMN_HEADER_CLASS} {
            box-shadow: inset 0 -3px 0 #2196f3;
        }
    `;
    document.head.appendChild(style);
}

function contiguousValues(values, anchor, target) {
    const normalized = (Array.isArray(values) ? values : [])
        .map(text)
        .filter(Boolean);
    const anchorIndex = normalized.indexOf(text(anchor));
    const targetIndex = normalized.indexOf(text(target));
    if (anchorIndex < 0 || targetIndex < 0) {
        return targetIndex >= 0 ? [normalized[targetIndex]] : [];
    }

    const start = Math.min(anchorIndex, targetIndex);
    const end = Math.max(anchorIndex, targetIndex);
    return normalized.slice(start, end + 1);
}

function lastValue(values) {
    const array = [...values];
    return array.length > 0 ? array[array.length - 1] : null;
}

function symmetricDifference(left, right) {
    const a = new Set(Array.isArray(left) ? left : []);
    const b = new Set(Array.isArray(right) ? right : []);
    const result = new Set();
    for (const value of a) {
        if (!b.has(value)) {
            result.add(value);
        }
    }
    for (const value of b) {
        if (!a.has(value)) {
            result.add(value);
        }
    }
    return [...result];
}

export function createRevoGridHeaderSelectionModel() {
    let mode = "none";
    let rowAnchorKey = null;
    let rowPrimaryKey = null;
    let columnAnchorProp = null;
    let columnPrimaryProp = null;
    const selectedRowKeys = new Set();
    const selectedColumnProps = new Set();

    function clearRows() {
        selectedRowKeys.clear();
        rowAnchorKey = null;
        rowPrimaryKey = null;
        if (mode === "rows") {
            mode = "none";
        }
    }

    function clearColumns() {
        selectedColumnProps.clear();
        columnAnchorProp = null;
        columnPrimaryProp = null;
        if (mode === "columns") {
            mode = "none";
        }
    }

    function clear() {
        selectedRowKeys.clear();
        selectedColumnProps.clear();
        rowAnchorKey = null;
        rowPrimaryKey = null;
        columnAnchorProp = null;
        columnPrimaryProp = null;
        mode = "none";
    }

    function selectRow(key, visibleKeys, modifiers = {}) {
        const normalized = text(key);
        if (!normalized) {
            return false;
        }

        const before = JSON.stringify(getState());
        selectedColumnProps.clear();
        columnAnchorProp = null;
        columnPrimaryProp = null;
        mode = "rows";

        if (modifiers.shiftKey) {
            const visible = (Array.isArray(visibleKeys) ? visibleKeys : [])
                .map(text)
                .filter(Boolean);
            const effectiveAnchor = visible.includes(rowAnchorKey)
                ? rowAnchorKey
                : visible.includes(rowPrimaryKey)
                    ? rowPrimaryKey
                    : normalized;
            const next = contiguousValues(visible, effectiveAnchor, normalized);
            selectedRowKeys.clear();
            next.forEach(value => selectedRowKeys.add(value));
            rowAnchorKey = effectiveAnchor;
            rowPrimaryKey = normalized;
        } else if (modifiers.ctrlKey || modifiers.metaKey) {
            if (selectedRowKeys.has(normalized)) {
                selectedRowKeys.delete(normalized);
                rowPrimaryKey = lastValue(selectedRowKeys);
            } else {
                selectedRowKeys.add(normalized);
                rowPrimaryKey = normalized;
            }
            rowAnchorKey = rowPrimaryKey;
        } else {
            selectedRowKeys.clear();
            selectedRowKeys.add(normalized);
            rowAnchorKey = normalized;
            rowPrimaryKey = normalized;
        }

        if (selectedRowKeys.size === 0) {
            mode = "none";
            rowAnchorKey = null;
            rowPrimaryKey = null;
        }
        return before !== JSON.stringify(getState());
    }

    function selectColumn(prop, orderedProps, modifiers = {}) {
        const normalized = text(prop);
        if (!normalized) {
            return false;
        }

        const before = JSON.stringify(getState());
        selectedRowKeys.clear();
        rowAnchorKey = null;
        rowPrimaryKey = null;
        mode = "columns";

        if (modifiers.shiftKey) {
            const ordered = (Array.isArray(orderedProps) ? orderedProps : [])
                .map(text)
                .filter(Boolean);
            const effectiveAnchor = ordered.includes(columnAnchorProp)
                ? columnAnchorProp
                : ordered.includes(columnPrimaryProp)
                    ? columnPrimaryProp
                    : normalized;
            const next = contiguousValues(ordered, effectiveAnchor, normalized);
            selectedColumnProps.clear();
            next.forEach(value => selectedColumnProps.add(value));
            columnAnchorProp = effectiveAnchor;
            columnPrimaryProp = normalized;
        } else if (modifiers.ctrlKey || modifiers.metaKey) {
            if (selectedColumnProps.has(normalized)) {
                selectedColumnProps.delete(normalized);
                columnPrimaryProp = lastValue(selectedColumnProps);
            } else {
                selectedColumnProps.add(normalized);
                columnPrimaryProp = normalized;
            }
            columnAnchorProp = columnPrimaryProp;
        } else {
            selectedColumnProps.clear();
            selectedColumnProps.add(normalized);
            columnAnchorProp = normalized;
            columnPrimaryProp = normalized;
        }

        if (selectedColumnProps.size === 0) {
            mode = "none";
            columnAnchorProp = null;
            columnPrimaryProp = null;
        }
        return before !== JSON.stringify(getState());
    }

    function pruneRows(visibleKeys) {
        const visible = new Set(
            (Array.isArray(visibleKeys) ? visibleKeys : []).map(text)
        );
        let changed = false;

        for (const key of [...selectedRowKeys]) {
            if (!visible.has(key)) {
                selectedRowKeys.delete(key);
                changed = true;
            }
        }

        if (rowPrimaryKey && !selectedRowKeys.has(rowPrimaryKey)) {
            rowPrimaryKey = lastValue(selectedRowKeys);
            changed = true;
        }
        if (rowAnchorKey && !selectedRowKeys.has(rowAnchorKey)) {
            rowAnchorKey = rowPrimaryKey;
            changed = true;
        }

        if (mode === "rows" && selectedRowKeys.size === 0) {
            mode = "none";
            rowAnchorKey = null;
            rowPrimaryKey = null;
        }

        return changed;
    }

    function pruneColumns(orderedProps) {
        const existing = new Set(
            (Array.isArray(orderedProps) ? orderedProps : []).map(text)
        );
        let changed = false;

        for (const prop of [...selectedColumnProps]) {
            if (!existing.has(prop)) {
                selectedColumnProps.delete(prop);
                changed = true;
            }
        }

        if (columnPrimaryProp && !selectedColumnProps.has(columnPrimaryProp)) {
            columnPrimaryProp = lastValue(selectedColumnProps);
            changed = true;
        }
        if (columnAnchorProp && !selectedColumnProps.has(columnAnchorProp)) {
            columnAnchorProp = columnPrimaryProp;
            changed = true;
        }

        if (mode === "columns" && selectedColumnProps.size === 0) {
            mode = "none";
            columnAnchorProp = null;
            columnPrimaryProp = null;
        }

        return changed;
    }

    function containsDetail(detail) {
        const key = text(detail?.model?.clientKey ?? detail?.clientKey);
        const prop = text(detail?.prop ?? detail?.column?.prop);
        return mode === "rows"
            ? Boolean(key && selectedRowKeys.has(key))
            : mode === "columns"
                ? Boolean(prop && selectedColumnProps.has(prop))
                : false;
    }

    function getCellProperties(props) {
        const key = text(props?.model?.clientKey);
        const prop = text(props?.prop);
        const rowSelected = mode === "rows" && key && selectedRowKeys.has(key);
        const columnSelected = mode === "columns" && prop && selectedColumnProps.has(prop);
        if (!rowSelected && !columnSelected) {
            return undefined;
        }

        return {
            class: {
                [ROW_CELL_CLASS]: Boolean(rowSelected),
                [COLUMN_CELL_CLASS]: Boolean(columnSelected)
            },
            ...(rowSelected ? {
                "data-erp-row-selected": "true",
                "data-erp-selected-row-key": key
            } : {}),
            ...(columnSelected ? {
                "data-erp-column-selected": "true",
                "data-erp-selected-column-prop": prop
            } : {})
        };
    }

    function getRowHeaderVisualProperties(props) {
        const key = text(props?.model?.clientKey);
        if (mode !== "rows" || !key || !selectedRowKeys.has(key)) {
            return undefined;
        }
        return {
            class: { [ROW_HEADER_CLASS]: true },
            "data-erp-row-header-selected": "true",
            "data-erp-selected-row-key": key
        };
    }

    function getColumnProperties(column) {
        const prop = text(column?.prop);
        if (mode !== "columns" || !prop || !selectedColumnProps.has(prop)) {
            return undefined;
        }
        return {
            class: { [COLUMN_HEADER_CLASS]: true },
            "data-erp-column-header-selected": "true",
            "data-erp-selected-column-prop": prop
        };
    }

    function getState() {
        return {
            kind: mode,
            selectedKeys: [...selectedRowKeys],
            selectedProps: [...selectedColumnProps],
            rowAnchorKey,
            rowPrimaryKey,
            columnAnchorProp,
            columnPrimaryProp
        };
    }

    return Object.freeze({
        clear,
        clearRows,
        clearColumns,
        selectRow,
        selectColumn,
        pruneRows,
        pruneColumns,
        containsDetail,
        getCellProperties,
        getRowHeaderVisualProperties,
        getColumnProperties,
        getState
    });
}

function contiguousPositions(values) {
    const positions = [...new Set((Array.isArray(values) ? values : []).filter(Number.isInteger))]
        .sort((left, right) => left - right);
    if (positions.length === 0) {
        return false;
    }
    for (let index = 1; index < positions.length; index += 1) {
        if (positions[index] !== positions[index - 1] + 1) {
            return false;
        }
    }
    return true;
}

export function createRevoGridHeaderSelectionFeature() {
    const model = createRevoGridHeaderSelectionModel();
    let pluginInstance = null;

    class RevoGridHeaderSelectionPlugin {
        constructor(grid, providers) {
            this.grid = grid;
            this.destroyed = false;
            this.nativeSyncDepth = 0;
            this.nativeProjectionQueue = Promise.resolve(false);
            this.onBeforeHeaderClick = event => this.handleBeforeHeaderClick(event);
            this.onAfterSortingApply = () => {
                queueMicrotask(() => {
                    void this.reapplyNativeRange();
                });
            };

            injectStyles();
            grid.addEventListener("beforeheaderclick", this.onBeforeHeaderClick);
            grid.addEventListener("aftersortingapply", this.onAfterSortingApply);
            pluginInstance = this;
        }


        async visibleRows() {
            const rows = await this.grid.getVisibleSource("rgRow");
            return Array.isArray(rows) ? rows : [];
        }

        async columns() {
            const columns = await this.grid.getColumns();
            return Array.isArray(columns) ? columns : [];
        }

        async orderedColumnProps() {
            return (await this.columns())
                .map(column => text(column?.prop))
                .filter(Boolean);
        }

        async withNativeSync(action) {
            this.nativeSyncDepth += 1;
            try {
                return await action();
            } finally {
                this.nativeSyncDepth -= 1;
            }
        }

        async applyNativeRowRange(state = model.getState()) {
            if (state.kind !== "rows" || state.selectedKeys.length === 0) {
                return false;
            }

            const [rows, columns] = await Promise.all([
                this.visibleRows(),
                this.columns()
            ]);
            const usePositionMap = state.selectedKeys.length >= ROW_POSITION_MAP_THRESHOLD;
            const positionByKey = usePositionMap
                ? new Map(
                    rows
                        .map((row, index) => [text(row?.clientKey), index])
                        .filter(([key]) => Boolean(key))
                )
                : null;
            const findPosition = key => positionByKey
                ? (positionByKey.get(text(key)) ?? -1)
                : rows.findIndex(row => text(row?.clientKey) === text(key));
            const positions = state.selectedKeys
                .map(findPosition)
                .filter(index => index >= 0);
            const regularColumns = columns.filter(
                column => text(column?.pin || "rgCol") === "rgCol"
            );

            if (positions.length === 0 || regularColumns.length === 0) {
                return false;
            }

            let startY;
            let endY;
            if (contiguousPositions(positions)) {
                startY = Math.min(...positions);
                endY = Math.max(...positions);
            } else {
                const primaryKey = text(state.rowPrimaryKey) || text(lastValue(state.selectedKeys));
                const primaryPosition = findPosition(primaryKey);
                const safePosition = primaryPosition >= 0
                    ? primaryPosition
                    : positions[positions.length - 1];
                startY = safePosition;
                endY = safePosition;
            }

            await this.withNativeSync(() => this.grid.setCellsFocus(
                { x: 0, y: startY },
                { x: regularColumns.length - 1, y: endY },
                "rgCol",
                "rgRow"
            ));
            return true;
        }

        async applyNativeColumnRange(state = model.getState()) {
            if (state.kind !== "columns" || state.selectedProps.length === 0) {
                return false;
            }

            const [rows, columns] = await Promise.all([
                this.visibleRows(),
                this.columns()
            ]);
            if (rows.length === 0) {
                return false;
            }

            const selectedColumns = state.selectedProps
                .map(prop => columns.find(column => text(column?.prop) === prop))
                .filter(Boolean);
            if (selectedColumns.length === 0) {
                return false;
            }

            const primaryProp = text(state.columnPrimaryProp) || text(lastValue(state.selectedProps));
            const primaryColumn = columns.find(column => text(column?.prop) === primaryProp) ?? selectedColumns[selectedColumns.length - 1];
            const primaryColType = text(primaryColumn?.pin || "rgCol") || "rgCol";
            const selectedColTypes = new Set(
                selectedColumns.map(column => text(column?.pin || "rgCol") || "rgCol")
            );
            const viewportColumns = columns.filter(
                column => text(column?.pin || "rgCol") === primaryColType
            );
            const positions = state.selectedProps
                .map(prop => viewportColumns.findIndex(column => text(column?.prop) === prop))
                .filter(index => index >= 0);

            let startX;
            let endX;
            if (
                selectedColTypes.size === 1 &&
                positions.length === state.selectedProps.length &&
                contiguousPositions(positions)
            ) {
                startX = Math.min(...positions);
                endX = Math.max(...positions);
            } else {
                const primaryPosition = viewportColumns.findIndex(
                    column => text(column?.prop) === text(primaryColumn?.prop)
                );
                if (primaryPosition < 0) {
                    return false;
                }
                startX = primaryPosition;
                endX = primaryPosition;
            }

            await this.withNativeSync(() => this.grid.setCellsFocus(
                { x: startX, y: 0 },
                { x: endX, y: rows.length - 1 },
                primaryColType,
                "rgRow"
            ));
            return true;
        }

        async reapplyNativeRange() {
            const run = async () => {
                if (this.destroyed) {
                    return false;
                }

                // Header clicks can arrive faster than Revo finishes applying
                // setCellsFocus. Serialize only the native projection so an
                // older async projection can never become the final range.
                const state = model.getState();
                if (state.kind === "rows") {
                    return await this.applyNativeRowRange(state);
                }
                if (state.kind === "columns") {
                    return await this.applyNativeColumnRange(state);
                }
                return false;
            };

            const result = this.nativeProjectionQueue.then(run, run);
            this.nativeProjectionQueue = result.catch(() => false);
            return await result;
        }

        async refreshRows(changedKeys) {
            const keys = [...new Set(
                (Array.isArray(changedKeys) ? changedKeys : [])
                    .map(text)
                    .filter(Boolean)
            )];
            if (keys.length === 0) {
                return;
            }

            // Revo Community's public targeted cell refresh only redraws cell
            // inner content. Semantic row selection is expressed through
            // cellProperties (classes/data attributes), so those properties
            // require the public virtualized row viewport refresh.
            await this.grid.refresh("rgRow");

            // Row headers live in their own lightweight viewport.
            if (this.grid.rowHeaders && typeof this.grid.rowHeaders === "object") {
                this.grid.rowHeaders = { ...this.grid.rowHeaders };
            }
        }

        async refreshColumns(changedProps) {
            const props = new Set(
                (Array.isArray(changedProps) ? changedProps : [])
                    .map(text)
                    .filter(Boolean)
            );
            if (props.size === 0) {
                return;
            }

            const columns = (await this.columns())
                .filter(column => props.has(text(column?.prop)));
            if (columns.length > 0) {
                await this.grid.updateColumns(columns);
            }
        }

        async refreshDiff(before, after) {
            const changedRows = symmetricDifference(
                before.kind === "rows" ? before.selectedKeys : [],
                after.kind === "rows" ? after.selectedKeys : []
            );
            const changedColumns = symmetricDifference(
                before.kind === "columns" ? before.selectedProps : [],
                after.kind === "columns" ? after.selectedProps : []
            );

            const tasks = [];
            if (changedRows.length > 0) {
                tasks.push(this.refreshRows(changedRows));
            }
            if (changedColumns.length > 0) {
                tasks.push(this.refreshColumns(changedColumns));
            }
            await Promise.all(tasks);
        }

        async finishSelectionChange(before) {
            const after = model.getState();
            if (after.kind === "none") {
                await this.withNativeSync(() => this.grid.clearFocus());
            } else {
                await this.reapplyNativeRange();
            }
            await this.refreshDiff(before, after);
            return after;
        }

        async selectRowByKey(key, modifiers = {}) {
            if (this.destroyed) {
                return false;
            }

            const before = model.getState();
            const visibleKeys = modifiers.shiftKey
                ? (await this.visibleRows())
                    .map(row => text(row?.clientKey))
                    .filter(Boolean)
                : [];
            const changed = model.selectRow(key, visibleKeys, modifiers);
            if (!changed) {
                return false;
            }

            await this.finishSelectionChange(before);
            return true;
        }

        async selectRowByVisibleIndex(rowIndex, modifiers = {}) {
            const rows = await this.visibleRows();
            const row = rows[Number(rowIndex)];
            return await this.selectRowByKey(text(row?.clientKey), modifiers);
        }

        async selectColumnByProp(prop, modifiers = {}) {
            if (this.destroyed) {
                return false;
            }

            const before = model.getState();
            const orderedProps = modifiers.shiftKey
                ? await this.orderedColumnProps()
                : [];
            const changed = model.selectColumn(prop, orderedProps, modifiers);
            if (!changed) {
                return false;
            }

            await this.finishSelectionChange(before);
            return true;
        }

        async reconcileVisibleRows() {
            const before = model.getState();
            const rows = await this.visibleRows();
            const changed = model.pruneRows(
                rows.map(row => text(row?.clientKey)).filter(Boolean)
            );
            if (!changed) {
                // Filter/Insert/Delete can move a still-selected row, or change
                // the vertical extent of a whole-column range, without changing
                // semantic selection. Re-project the current selection into
                // Revo so visual meaning and native command range stay aligned.
                await this.reapplyNativeRange();
                return false;
            }

            await this.finishSelectionChange(before);
            return true;
        }

        async reconcileColumns() {
            const before = model.getState();
            const changed = model.pruneColumns(await this.orderedColumnProps());
            if (!changed) {
                // Column workspace changes can move a still-selected column
                // without changing its prop. Keep Revo's native coordinates
                // synchronized with the semantic prop-based selection.
                await this.reapplyNativeRange();
                return false;
            }

            await this.finishSelectionChange(before);
            return true;
        }

        async clear({ refresh = true, clearNative = false } = {}) {
            const before = model.getState();
            if (before.kind === "none") {
                if (clearNative) {
                    await this.withNativeSync(() => this.grid.clearFocus());
                }
                return false;
            }

            model.clear();
            if (clearNative) {
                await this.withNativeSync(() => this.grid.clearFocus());
            }
            if (refresh) {
                await this.refreshDiff(before, model.getState());
            }
            return true;
        }

        clearForNativeFocus() {
            if (this.nativeSyncDepth > 0) {
                return;
            }

            const before = model.getState();
            if (before.kind === "none") {
                return;
            }

            model.clear();
            queueMicrotask(() => {
                void this.refreshDiff(before, model.getState());
            });
        }

        getSnapshot() {
            const state = model.getState();
            if (state.kind === "none") {
                return null;
            }
            return Object.freeze({
                kind: state.kind,
                selectedKeys: Object.freeze([...state.selectedKeys]),
                selectedProps: Object.freeze([...state.selectedProps]),
                rowAnchorKey: state.rowAnchorKey,
                rowPrimaryKey: state.rowPrimaryKey,
                columnAnchorProp: state.columnAnchorProp,
                columnPrimaryProp: state.columnPrimaryProp,
                range: null,
                focused: null
            });
        }

        containsDetail(detail) {
            return model.containsDetail(detail);
        }

        handleRowHeaderPointerDown(props, event) {
            if (this.destroyed || Number(event?.button ?? 0) > 2) {
                return;
            }

            const key = text(props?.model?.clientKey);
            if (!key) {
                return;
            }

            const button = Number(event?.button ?? 0);
            const current = model.getState();
            if (button === 2 && current.kind === "rows" && current.selectedKeys.includes(key)) {
                return;
            }

            if (button !== 2) {
                event?.preventDefault?.();
            }

            const modifiers = button === 2
                ? {}
                : {
                    ctrlKey: Boolean(event?.ctrlKey),
                    metaKey: Boolean(event?.metaKey),
                    shiftKey: Boolean(event?.shiftKey)
                };

            void this.selectRowByKey(key, modifiers);
        }

        handleBeforeHeaderClick(event) {
            if (this.destroyed) {
                return;
            }

            const originalEvent = event.detail?.originalEvent;
            if (isHeaderControlClick(originalEvent)) {
                return;
            }

            const prop = text(event.detail?.column?.prop);
            if (!prop) {
                return;
            }

            const button = Number(originalEvent?.button ?? 0);
            const current = model.getState();
            if (button === 2 && current.kind === "columns" && current.selectedProps.includes(prop)) {
                event.preventDefault();
                return;
            }

            event.preventDefault();
            originalEvent?.preventDefault?.();
            const modifiers = button === 2
                ? {}
                : {
                    ctrlKey: Boolean(originalEvent?.ctrlKey),
                    metaKey: Boolean(originalEvent?.metaKey),
                    shiftKey: Boolean(originalEvent?.shiftKey)
                };

            queueMicrotask(() => {
                void this.selectColumnByProp(prop, modifiers);
            });
        }

        getState() {
            return model.getState();
        }

        destroy() {
            if (this.destroyed) {
                return;
            }
            this.grid.removeEventListener("beforeheaderclick", this.onBeforeHeaderClick);
            this.grid.removeEventListener("aftersortingapply", this.onAfterSortingApply);
            model.clear();
            if (pluginInstance === this) {
                pluginInstance = null;
            }
            this.destroyed = true;
        }
    }

    function rowHeaderCellProperties(props) {
        const visual = model.getRowHeaderVisualProperties(props) ?? {};
        return {
            ...visual,
            onPointerDown: event => pluginInstance?.handleRowHeaderPointerDown(props, event)
        };
    }

    return Object.freeze({
        model,
        Plugin: RevoGridHeaderSelectionPlugin,
        cellProperties: props => model.getCellProperties(props),
        columnProperties: props => model.getColumnProperties(props),
        rowHeaderCellProperties,
        getPlugin: () => pluginInstance
    });
}

export const revoGridHeaderSelectionInternals = Object.freeze({
    contiguousValues,
    symmetricDifference,
    ROW_CELL_CLASS,
    COLUMN_CELL_CLASS,
    ROW_HEADER_CLASS,
    COLUMN_HEADER_CLASS
});
