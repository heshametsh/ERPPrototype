const STYLE_ID = "erp-revogrid-header-selection-style";
const ROW_CELL_CLASS = "erp-revo-selected-row-cell";
const COLUMN_CELL_CLASS = "erp-revo-selected-column-cell";
const ROW_HEADER_CLASS = "erp-revo-selected-row-header";
const COLUMN_HEADER_CLASS = "erp-revo-selected-column-header";

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
    let columnAnchorProp = null;
    let activeRowKeys = [];
    let activeColumnProps = [];
    const selectedRowKeys = new Set();
    const selectedColumnProps = new Set();

    function clearRows() {
        selectedRowKeys.clear();
        rowAnchorKey = null;
        activeRowKeys = [];
        if (mode === "rows") {
            mode = "none";
        }
    }

    function clearColumns() {
        selectedColumnProps.clear();
        columnAnchorProp = null;
        activeColumnProps = [];
        if (mode === "columns") {
            mode = "none";
        }
    }

    function clear() {
        selectedRowKeys.clear();
        selectedColumnProps.clear();
        rowAnchorKey = null;
        columnAnchorProp = null;
        activeRowKeys = [];
        activeColumnProps = [];
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
        activeColumnProps = [];
        mode = "rows";

        if (modifiers.shiftKey) {
            const next = contiguousValues(
                visibleKeys,
                rowAnchorKey || normalized,
                normalized
            );
            selectedRowKeys.clear();
            next.forEach(value => selectedRowKeys.add(value));
            activeRowKeys = [...next];
            if (!rowAnchorKey || !next.includes(rowAnchorKey)) {
                rowAnchorKey = normalized;
            }
        } else if (modifiers.ctrlKey || modifiers.metaKey) {
            if (selectedRowKeys.has(normalized)) {
                selectedRowKeys.delete(normalized);
                const fallback = lastValue(selectedRowKeys);
                activeRowKeys = fallback ? [fallback] : [];
            } else {
                selectedRowKeys.add(normalized);
                activeRowKeys = [normalized];
            }
            rowAnchorKey = normalized;
        } else {
            selectedRowKeys.clear();
            selectedRowKeys.add(normalized);
            activeRowKeys = [normalized];
            rowAnchorKey = normalized;
        }

        if (selectedRowKeys.size === 0) {
            mode = "none";
            rowAnchorKey = null;
            activeRowKeys = [];
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
        activeRowKeys = [];
        mode = "columns";

        if (modifiers.shiftKey) {
            const next = contiguousValues(
                orderedProps,
                columnAnchorProp || normalized,
                normalized
            );
            selectedColumnProps.clear();
            next.forEach(value => selectedColumnProps.add(value));
            activeColumnProps = [...next];
            if (!columnAnchorProp || !next.includes(columnAnchorProp)) {
                columnAnchorProp = normalized;
            }
        } else if (modifiers.ctrlKey || modifiers.metaKey) {
            if (selectedColumnProps.has(normalized)) {
                selectedColumnProps.delete(normalized);
                const fallback = lastValue(selectedColumnProps);
                activeColumnProps = fallback ? [fallback] : [];
            } else {
                selectedColumnProps.add(normalized);
                activeColumnProps = [normalized];
            }
            columnAnchorProp = normalized;
        } else {
            selectedColumnProps.clear();
            selectedColumnProps.add(normalized);
            activeColumnProps = [normalized];
            columnAnchorProp = normalized;
        }

        if (selectedColumnProps.size === 0) {
            mode = "none";
            columnAnchorProp = null;
            activeColumnProps = [];
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

        const nextActive = activeRowKeys.filter(key => visible.has(key));
        if (nextActive.length !== activeRowKeys.length) {
            activeRowKeys = nextActive;
            changed = true;
        }

        if (rowAnchorKey && !visible.has(rowAnchorKey)) {
            rowAnchorKey = null;
            changed = true;
        }

        if (mode === "rows" && selectedRowKeys.size === 0) {
            mode = "none";
            activeRowKeys = [];
        } else if (mode === "rows" && activeRowKeys.length === 0) {
            const fallback = lastValue(selectedRowKeys);
            activeRowKeys = fallback ? [fallback] : [];
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

        const nextActive = activeColumnProps.filter(prop => existing.has(prop));
        if (nextActive.length !== activeColumnProps.length) {
            activeColumnProps = nextActive;
            changed = true;
        }

        if (columnAnchorProp && !existing.has(columnAnchorProp)) {
            columnAnchorProp = null;
            changed = true;
        }

        if (mode === "columns" && selectedColumnProps.size === 0) {
            mode = "none";
            activeColumnProps = [];
        } else if (mode === "columns" && activeColumnProps.length === 0) {
            const fallback = lastValue(selectedColumnProps);
            activeColumnProps = fallback ? [fallback] : [];
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
            activeRowKeys: [...activeRowKeys],
            activeColumnProps: [...activeColumnProps],
            rowAnchorKey,
            columnAnchorProp
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

export function createRevoGridHeaderSelectionFeature() {
    const model = createRevoGridHeaderSelectionModel();
    let pluginInstance = null;

    class RevoGridHeaderSelectionPlugin {
        constructor(grid, providers) {
            this.grid = grid;
            this.providers = providers;
            this.destroyed = false;
            this.nativeSyncDepth = 0;
            this.selectionContext = null;
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

        setSelectionContext(selectionContext) {
            this.selectionContext = selectionContext ?? null;
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
            if (state.kind !== "rows" || state.activeRowKeys.length === 0) {
                return false;
            }

            const [rows, columns] = await Promise.all([
                this.visibleRows(),
                this.columns()
            ]);
            const positions = state.activeRowKeys
                .map(key => rows.findIndex(row => text(row?.clientKey) === key))
                .filter(index => index >= 0);
            const regularColumns = columns.filter(
                column => text(column?.pin || "rgCol") === "rgCol"
            );

            if (positions.length === 0 || regularColumns.length === 0) {
                return false;
            }

            const startY = Math.min(...positions);
            const endY = Math.max(...positions);
            await this.withNativeSync(() => this.grid.setCellsFocus(
                { x: 0, y: startY },
                { x: regularColumns.length - 1, y: endY },
                "rgCol",
                "rgRow"
            ));
            return true;
        }

        async applyNativeColumnRange(state = model.getState()) {
            if (state.kind !== "columns" || state.activeColumnProps.length === 0) {
                return false;
            }

            const [rows, columns] = await Promise.all([
                this.visibleRows(),
                this.columns()
            ]);
            if (rows.length === 0) {
                return false;
            }

            const activeColumns = state.activeColumnProps
                .map(prop => columns.find(column => text(column?.prop) === prop))
                .filter(Boolean);
            if (activeColumns.length === 0) {
                return false;
            }

            const colType = text(activeColumns[activeColumns.length - 1]?.pin || "rgCol") || "rgCol";
            const viewportColumns = columns.filter(
                column => text(column?.pin || "rgCol") === colType
            );
            const positions = state.activeColumnProps
                .map(prop => viewportColumns.findIndex(column => text(column?.prop) === prop))
                .filter(index => index >= 0);
            if (positions.length === 0) {
                return false;
            }

            const startX = Math.min(...positions);
            const endX = Math.max(...positions);
            await this.withNativeSync(() => this.grid.setCellsFocus(
                { x: startX, y: 0 },
                { x: endX, y: rows.length - 1 },
                colType,
                "rgRow"
            ));
            return true;
        }

        async reapplyNativeRange() {
            if (this.destroyed) {
                return false;
            }

            const state = model.getState();
            if (state.kind === "rows") {
                return await this.applyNativeRowRange(state);
            }
            if (state.kind === "columns") {
                return await this.applyNativeColumnRange(state);
            }
            return false;
        }

        async refreshRows() {
            await this.grid.refresh("rgRow");
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
            const rowsChanged = before.kind === "rows" || after.kind === "rows"
                ? JSON.stringify(before.selectedKeys) !== JSON.stringify(after.selectedKeys) || before.kind !== after.kind
                : false;
            const changedColumns = symmetricDifference(
                before.kind === "columns" ? before.selectedProps : [],
                after.kind === "columns" ? after.selectedProps : []
            );

            const tasks = [];
            if (rowsChanged) {
                tasks.push(this.refreshRows());
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
                return false;
            }

            await this.finishSelectionChange(before);
            return true;
        }

        async reconcileColumns() {
            const before = model.getState();
            const changed = model.pruneColumns(await this.orderedColumnProps());
            if (!changed) {
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
                columnAnchorProp: state.columnAnchorProp,
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
