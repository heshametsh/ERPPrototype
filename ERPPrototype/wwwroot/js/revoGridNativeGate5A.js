import { defineCustomElement as defineRevoGrid } from "https://cdn.jsdelivr.net/npm/@revolist/revogrid@4.25.2/standalone/revo-grid.js/+esm";
import { defineCustomElement as defineFilterPanel } from "https://cdn.jsdelivr.net/npm/@revolist/revogrid@4.25.2/standalone/revogr-filter-panel.js/+esm";
import {
    createExcelFilterColumn,
    createExcelFilterNativeConfig
} from "./revoGridExcelFilter.js?v=20260911-rename-1";
import { createSortOnlyColumn } from "./revoGridSort.js?v=20260911-rename-1";

const VERSION = "4.25.2";
const COLUMN_LAYOUT_STEP = 1_000_000_000_000;
const CORE_LAYOUT_ORDERS = Object.freeze({
    workOrderNumber: 1 * COLUMN_LAYOUT_STEP,
    workTypeCode: 2 * COLUMN_LAYOUT_STEP,
    assignmentDate: 3 * COLUMN_LAYOUT_STEP,
    workOrderValue: 4 * COLUMN_LAYOUT_STEP,
    partialAmount: 5 * COLUMN_LAYOUT_STEP,
    remainingAmount: 6 * COLUMN_LAYOUT_STEP,
    basket: 7 * COLUMN_LAYOUT_STEP
});
const states = new Map();
const initializationCounts = new Map();

if (!customElements.get("revo-grid")) {
    defineRevoGrid();
}

if (!customElements.get("revogr-filter-panel")) {
    defineFilterPanel();
}

function value(source, camelName, pascalName, fallback = null) {
    if (source && source[camelName] !== undefined) {
        return source[camelName];
    }

    if (source && source[pascalName] !== undefined) {
        return source[pascalName];
    }

    return fallback;
}

function normalizeCustomColumn(column) {
    return {
        fieldKey: String(value(column, "fieldKey", "FieldKey", "")).trim(),
        name: String(value(column, "name", "Name", "")).trim(),
        dataType: String(value(column, "dataType", "DataType", "Text")),
        layoutOrder: Number(value(column, "layoutOrder", "LayoutOrder", 0)) || 0
    };
}

function customFilterType(dataType) {
    const normalized = String(dataType || "").toLowerCase();
    return normalized === "number" || normalized === "money"
        ? "number"
        : "string";
}


function mergeOrderedColumns(core, customDefinitions, customColumns) {
    const customByProp = new Map(
        (Array.isArray(customColumns) ? customColumns : [])
            .map(normalizeCustomColumn)
            .filter(column => column.fieldKey)
            .map(column => [column.fieldKey, column])
    );

    const decoratedCore = core.map(column => ({
        ...column,
        erpLayoutOrder:
            CORE_LAYOUT_ORDERS[String(column?.prop ?? "")] ??
            Number.MAX_SAFE_INTEGER,
        erpCustomColumn: false
    }));

    const decoratedCustom = customDefinitions.map(column => {
        const definition = customByProp.get(String(column?.prop ?? ""));
        return {
            ...column,
            erpLayoutOrder:
                Number(definition?.layoutOrder) || Number.MAX_SAFE_INTEGER,
            erpCustomColumn: true,
            erpCustomColumnType: String(definition?.dataType ?? "Text")
        };
    });

    return [...decoratedCore, ...decoratedCustom]
        .sort((left, right) =>
            Number(left.erpLayoutOrder) - Number(right.erpLayoutOrder) ||
            String(left.prop).localeCompare(String(right.prop))
        );
}

function buildLegacyGateColumns(customColumns) {
    const core = [
        { name: "Work Order Number", prop: "workOrderNumber", size: 220, sortable: true, filter: "string", autoSize: true },
        { name: "Work Type", prop: "workTypeCode", size: 130, sortable: true, filter: "string", autoSize: true },
        { name: "Assignment Date", prop: "assignmentDate", size: 160, sortable: true, filter: "string", autoSize: true },
        { name: "Work Order Value", prop: "workOrderValue", size: 190, sortable: true, filter: "number", autoSize: true },
        { name: "Partial Amount", prop: "partialAmount", size: 180, sortable: true, filter: "number", autoSize: true },
        { name: "Remaining Amount", prop: "remainingAmount", size: 200, sortable: true, filter: "number", readonly: true, autoSize: true },
        { name: "Basket", prop: "basket", size: 330, sortable: true, filter: "string", autoSize: true }
    ];

    const custom = (Array.isArray(customColumns) ? customColumns : [])
        .map(normalizeCustomColumn)
        .filter(column => column.fieldKey && column.name)
        .sort((a, b) =>
            a.layoutOrder - b.layoutOrder ||
            a.fieldKey.localeCompare(b.fieldKey))
        .map(column => ({
            name: column.name,
            prop: column.fieldKey,
            size: 190,
            sortable: true,
            filter: customFilterType(column.dataType),
            autoSize: true
        }));

    return mergeOrderedColumns(core, custom, customColumns);
}

function buildExcelFilterGateColumns(customColumns, enableHeaderActions) {
    // Gate 5B-3 restores the approved Work Orders capability split:
    // filter-only fields get the Excel-like ERP button, money fields are
    // sort-only, and no column exposes Revo's condition-panel button.
    const core = [
        createExcelFilterColumn(
            { name: "Work Order Number", prop: "workOrderNumber", size: 220, autoSize: true },
            "values"),
        createExcelFilterColumn(
            { name: "Work Type", prop: "workTypeCode", size: 130, autoSize: true },
            "values"),
        createExcelFilterColumn(
            { name: "Assignment Date", prop: "assignmentDate", size: 160, autoSize: true },
            "date"),
        enableHeaderActions
            ? createSortOnlyColumn({ name: "Work Order Value", prop: "workOrderValue", size: 190, autoSize: true }, "number")
            : { name: "Work Order Value", prop: "workOrderValue", size: 190, sortable: true, filter: false, autoSize: true },
        enableHeaderActions
            ? createSortOnlyColumn({ name: "Partial Amount", prop: "partialAmount", size: 180, autoSize: true }, "number")
            : { name: "Partial Amount", prop: "partialAmount", size: 180, sortable: true, filter: false, autoSize: true },
        enableHeaderActions
            ? createSortOnlyColumn({ name: "Remaining Amount", prop: "remainingAmount", size: 200, readonly: true, autoSize: true }, "number")
            : { name: "Remaining Amount", prop: "remainingAmount", size: 200, sortable: true, filter: false, readonly: true, autoSize: true },
        createExcelFilterColumn(
            { name: "Basket", prop: "basket", size: 330, autoSize: true },
            "values")
    ];

    const custom = (Array.isArray(customColumns) ? customColumns : [])
        .map(normalizeCustomColumn)
        .filter(column => column.fieldKey && column.name)
        .sort((a, b) =>
            a.layoutOrder - b.layoutOrder ||
            a.fieldKey.localeCompare(b.fieldKey))
        .map(column => {
            const normalizedType = String(column.dataType || "").toLowerCase();
            if (normalizedType === "money") {
                const definition = {
                    name: column.name,
                    prop: column.fieldKey,
                    size: 190,
                    autoSize: true
                };
                return enableHeaderActions
                    ? createSortOnlyColumn(definition, "number")
                    : {
                        ...definition,
                        sortable: true,
                        filter: false
                    };
            }

            return createExcelFilterColumn(
                {
                    name: column.name,
                    prop: column.fieldKey,
                    size: 190,
                    autoSize: true
                },
                normalizedType === "date" ? "date" : "values");
        });

    return mergeOrderedColumns(core, custom, customColumns);
}

function mergeRenderProperties(existing, extra) {
    if (!existing) return extra;
    if (!extra) return existing;

    const normalizeClass = value => typeof value === "string"
        ? { [value]: true }
        : (value ?? {});

    return {
        ...existing,
        ...extra,
        ...(existing.class || extra.class ? {
            class: {
                ...normalizeClass(existing.class),
                ...normalizeClass(extra.class)
            }
        } : {}),
        ...(existing.style || extra.style ? {
            style: {
                ...(existing.style ?? {}),
                ...(extra.style ?? {})
            }
        } : {})
    };
}

function attachCellProperties(columns, provider) {
    if (typeof provider !== "function") {
        return columns;
    }

    return columns.map(column => {
        const existing = column.cellProperties;
        return {
            ...column,
            cellProperties: props => mergeRenderProperties(
                typeof existing === "function" ? existing(props) : undefined,
                provider(props)
            )
        };
    });
}

function attachColumnProperties(columns, provider) {
    if (typeof provider !== "function") {
        return columns;
    }

    return columns.map(column => {
        const existing = column.columnProperties;
        return {
            ...column,
            columnProperties: props => mergeRenderProperties(
                typeof existing === "function" ? existing(props) : undefined,
                provider(props)
            )
        };
    });
}

function buildColumns(
    customColumns,
    enableExcelFilter,
    enableHeaderActions,
    cellPropertiesProvider = null,
    columnPropertiesProvider = null
) {
    const columns = enableExcelFilter
        ? buildExcelFilterGateColumns(customColumns, enableHeaderActions)
        : buildLegacyGateColumns(customColumns);

    return attachColumnProperties(
        attachCellProperties(columns, cellPropertiesProvider),
        columnPropertiesProvider
    );
}

function addListener(state, target, type, handler, options) {
    target.addEventListener(type, handler, options);
    state.removers.push(() => target.removeEventListener(type, handler, options));
}

function startLongTaskObserver(state) {
    if (typeof PerformanceObserver !== "function") {
        return;
    }

    try {
        const observer = new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
                state.longTasks += 1;
                state.longTaskMaxMs = Math.max(state.longTaskMaxMs, entry.duration);
            }
        });

        observer.observe({ type: "longtask", buffered: false });
        state.observer = observer;
    } catch {
    }
}

function rangeText(range) {
    if (!range) {
        return "—";
    }

    const x = range.x ?? range.start?.x ?? "?";
    const y = range.y ?? range.start?.y ?? "?";
    const x1 = range.x1 ?? range.end?.x ?? x;
    const y1 = range.y1 ?? range.end?.y ?? y;

    return `${x},${y} → ${x1},${y1}`;
}

export async function initialize(elementId, rows, customColumns, options) {
    await destroy(elementId);

    const host = document.getElementById(elementId);
    if (!host) {
        throw new Error(`Native RevoGrid host '${elementId}' was not found.`);
    }

    await customElements.whenDefined("revo-grid");
    await customElements.whenDefined("revogr-filter-panel");

    const source = Array.isArray(rows) ? rows : [];
    const enableExcelFilter = Boolean(
        value(options, "enableExcelFilter", "EnableExcelFilter", false)
    );
    const enableHeaderActions = Boolean(
        value(options, "enableHeaderActions", "EnableHeaderActions", false)
    );
    const columns = buildColumns(
        customColumns,
        enableExcelFilter,
        enableHeaderActions,
        value(options, "validationCellProperties", "ValidationCellProperties", null),
        value(options, "columnPropertiesProvider", "ColumnPropertiesProvider", null)
    );
    const startedAt = performance.now();

    const grid = document.createElement("revo-grid");
    grid.style.width = "100%";
    grid.style.height = "100%";

    grid.source = source;
    grid.columns = columns;
    const plugins = value(options, "plugins", "Plugins", []);
    grid.plugins = Array.isArray(plugins) ? plugins : [];

    grid.range = true;
    grid.resize = true;
    grid.applyOnClose = Boolean(
        value(options, "applyOnClose", "ApplyOnClose", false)
    );
    const rowHeaderCellProperties = value(
        options,
        "rowHeaderCellProperties",
        "RowHeaderCellProperties",
        null
    );
    grid.rowHeaders = typeof rowHeaderCellProperties === "function"
        ? { cellProperties: rowHeaderCellProperties }
        : true;
    grid.filter = enableExcelFilter
        ? createExcelFilterNativeConfig()
        : true;
    grid.useClipboard = Boolean(
        value(options, "enableClipboardRangeFill", "EnableClipboardRangeFill", false)
    )
        ? { rangeFill: true }
        : true;
    grid.rtl = Boolean(value(options, "rtl", "Rtl", true));
    grid.autoSizeColumn = true;
    grid.stretch = true;

    const state = {
        grid,
        sourceRows: source.length,
        columns: columns.length,
        workYear: Number(value(options, "workYear", "WorkYear", 0)) || 0,
        readyMs: 0,
        scrollEvents: 0,
        editEvents: 0,
        pasteEvents: 0,
        datasetSwitches: 0,
        longTasks: 0,
        longTaskMaxMs: 0,
        removers: [],
        observer: null,
        initializationCount: (initializationCounts.get(elementId) || 0) + 1,
        version: String(value(options, "version", "Version", VERSION) || VERSION),
        excelFilterEnabled: enableExcelFilter,
        headerActionsEnabled: enableHeaderActions,
        validationCellProperties:
            value(options, "validationCellProperties", "ValidationCellProperties", null),
        columnPropertiesProvider:
            value(options, "columnPropertiesProvider", "ColumnPropertiesProvider", null),
        customColumns: (Array.isArray(customColumns) ? customColumns : [])
            .map(normalizeCustomColumn)
    };

    addListener(state, grid, "viewportscroll", () => {
        state.scrollEvents += 1;
    });

    addListener(state, grid, "afteredit", () => {
        state.editEvents += 1;
    });

    addListener(state, grid, "afterpasteapply", () => {
        state.pasteEvents += 1;
    });

    initializationCounts.set(elementId, state.initializationCount);
    startLongTaskObserver(state);

    host.replaceChildren(grid);

    await new Promise(resolve =>
        requestAnimationFrame(() =>
            requestAnimationFrame(resolve)));

    state.readyMs = performance.now() - startedAt;
    states.set(elementId, state);
}

export async function replaceCustomColumns(elementId, customColumns) {
    const state = states.get(elementId);
    if (!state) {
        throw new Error(`Native RevoGrid state '${elementId}' was not found.`);
    }

    const normalized = (Array.isArray(customColumns) ? customColumns : [])
        .map(normalizeCustomColumn)
        .filter(column => column.fieldKey && column.name);

    const columns = buildColumns(
        normalized,
        state.excelFilterEnabled,
        state.headerActionsEnabled,
        state.validationCellProperties,
        state.columnPropertiesProvider
    );

    state.grid.columns = columns;
    state.customColumns = normalized;
    state.columns = columns.length;

    // RevoGrid v4.25.2 watches the public columns property and reapplies the
    // column collection. refresh() is a row-data viewport API and does not
    // accept "rgCol"; header rendering stays owned by the column definition.
    await new Promise(resolve =>
        requestAnimationFrame(() =>
            requestAnimationFrame(resolve)));
}

// RevoGrid's documented integration rule is to replace source when the
// dataset itself changes. A Work Orders year switch is exactly that case.
// The grid instance, plugins and native viewport are not recreated.
export async function replaceDataset(elementId, rows, workYear) {
    const state = states.get(elementId);
    if (!state) {
        throw new Error(`Native RevoGrid state '${elementId}' was not found.`);
    }

    const source = Array.isArray(rows) ? rows : [];

    // One operation owns the dataset replacement.
    state.grid.source = source;
    state.sourceRows = source.length;
    state.workYear = Number(workYear) || 0;
    state.datasetSwitches += 1;

    await new Promise(resolve =>
        requestAnimationFrame(() =>
            requestAnimationFrame(resolve)));
}

export async function getDiagnostics(elementId) {
    const state = states.get(elementId);

    if (!state) {
        throw new Error(`Native RevoGrid state '${elementId}' was not found.`);
    }

    let selectedRange = null;

    try {
        selectedRange = await state.grid.getSelectedRange();
    } catch {
    }

    const heapMb = performance.memory
        ? performance.memory.usedJSHeapSize / 1024 / 1024
        : null;

    return {
        version: state.version,
        workYear: state.workYear,
        readyMs: state.readyMs,
        sourceRows: state.sourceRows,
        columns: state.columns,
        scrollEvents: state.scrollEvents,
        editEvents: state.editEvents,
        pasteEvents: state.pasteEvents,
        datasetSwitches: state.datasetSwitches,
        selection: rangeText(selectedRange),
        heapMb,
        domNodes: document.getElementsByTagName("*").length,
        initializationCount: state.initializationCount,
        longTasks: state.longTasks,
        longTaskMaxMs: state.longTaskMaxMs,
        excelFilterEnabled: state.excelFilterEnabled
    };
}

export async function destroy(elementId) {
    const state = states.get(elementId);

    if (!state) {
        document.getElementById(elementId)?.replaceChildren();
        return;
    }

    for (const remove of state.removers.splice(0)) {
        try {
            remove();
        } catch {
        }
    }

    try {
        state.observer?.disconnect();
    } catch {
    }

    try {
        state.grid?.remove();
    } catch {
    }

    document.getElementById(elementId)?.replaceChildren();
    states.delete(elementId);
}
