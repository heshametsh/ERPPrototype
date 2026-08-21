import { defineCustomElement as defineRevoGrid } from "https://cdn.jsdelivr.net/npm/@revolist/revogrid@4.25.2/standalone/revo-grid.js/+esm";
import { defineCustomElement as defineFilterPanel } from "https://cdn.jsdelivr.net/npm/@revolist/revogrid@4.25.2/standalone/revogr-filter-panel.js/+esm";

const VERSION = "4.25.2";
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

function buildColumns(customColumns) {
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

    return core.concat(custom);
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


const SOURCE_REFERENCE = Object.freeze({
    requestedTag: "v4.25.2",
    checkoutHead: "d06ea5b",
    packageJsonVersionInsideTag: "4.25.1",
    runtimeImportVersion: VERSION,
    filesReviewed: [
        "src/components/revoGrid/revo-grid.tsx:1057-1090",
        "src/components/overlay/revogr-overlay-selection.tsx:854-879",
        "src/components/overlay/selection.utils.ts:31-42",
        "src/services/data.provider.ts:124-147",
        "src/components/clipboard/revogr-clipboard.tsx:98-146"
    ]
});

function primitive(value) {
    if (
        value === null ||
        value === undefined ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
    ) {
        return value ?? null;
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return String(value);
    }
}

function sameValue(a, b) {
    if (a === b) {
        return true;
    }

    if (a === null || a === undefined || b === null || b === undefined) {
        return a == b;
    }

    return String(a) === String(b);
}

function rowIdentity(model) {
    if (!model || typeof model !== "object") {
        return {
            id: null,
            workOrderNumber: null
        };
    }

    return {
        id: primitive(model.id),
        workOrderNumber: primitive(model.workOrderNumber)
    };
}

function rangeShape(range) {
    if (!range) {
        return null;
    }

    return {
        x: range.x ?? null,
        y: range.y ?? null,
        x1: range.x1 ?? null,
        y1: range.y1 ?? null
    };
}

function summarizeCell(detail, phase) {
    const model = detail?.model ?? null;
    const prop = detail?.prop ?? null;
    const identity = rowIdentity(model);

    return {
        phase,
        kind: "cell",
        rowIndex: detail?.rowIndex ?? null,
        colIndex: detail?.colIndex ?? null,
        rowType: detail?.type ?? null,
        prop,
        rowId: identity.id,
        workOrderNumber: identity.workOrderNumber,
        modelValueAtEvent:
            prop && model
                ? primitive(model[prop])
                : null,
        proposedValue: primitive(detail?.val)
    };
}

function summarizeRange(detail, phase) {
    const data = detail?.data && typeof detail.data === "object"
        ? detail.data
        : {};
    const models = detail?.models && typeof detail.models === "object"
        ? detail.models
        : {};

    const cells = [];

    for (const rowKey of Object.keys(data)) {
        const patch = data[rowKey] && typeof data[rowKey] === "object"
            ? data[rowKey]
            : {};
        const model = models[rowKey] ?? null;
        const identity = rowIdentity(model);

        for (const prop of Object.keys(patch)) {
            cells.push({
                rowIndex: Number(rowKey),
                rowId: identity.id,
                workOrderNumber: identity.workOrderNumber,
                prop,
                modelValueAtEvent:
                    model
                        ? primitive(model[prop])
                        : null,
                proposedValue: primitive(patch[prop])
            });
        }
    }

    return {
        phase,
        kind: "range",
        rowType: detail?.type ?? null,
        oldRange: rangeShape(detail?.oldRange),
        newRange: rangeShape(detail?.newRange),
        cells
    };
}

function createProbe() {
    return {
        startedAt: new Date().toISOString(),
        events: [],
        cell: {
            status: "WAITING",
            detail: "لم يتم تعديل خلية بعد.",
            pending: null,
            result: null
        },
        paste: {
            status: "WAITING",
            detail: "لم يتم Paste بعد.",
            active: null,
            result: null
        }
    };
}

function appendProbeEvent(state, name, payload = null) {
    state.probe.events.push({
        index: state.probe.events.length + 1,
        name,
        atMs: Math.round(performance.now() * 1000) / 1000,
        payload
    });

    if (state.probe.events.length > 80) {
        state.probe.events.splice(0, state.probe.events.length - 80);
    }

    renderProbe(state);
}

function setStatus(element, status) {
    if (!element) {
        return;
    }

    element.textContent = status;
    element.classList.remove(
        "event-probe__pass",
        "event-probe__fail",
        "event-probe__waiting"
    );
    element.classList.add(
        status === "PASS"
            ? "event-probe__pass"
            : status === "FAIL"
                ? "event-probe__fail"
                : "event-probe__waiting"
    );
}

function renderProbe(state) {
    const cellStatus = document.getElementById("event-probe-cell-status");
    const pasteStatus = document.getElementById("event-probe-paste-status");
    const cellDetail = document.getElementById("event-probe-cell-detail");
    const pasteDetail = document.getElementById("event-probe-paste-detail");
    const count = document.getElementById("event-probe-event-count");
    const sequence = document.getElementById("event-probe-sequence");
    const log = document.getElementById("event-probe-log");

    setStatus(cellStatus, state.probe.cell.status);
    setStatus(pasteStatus, state.probe.paste.status);

    if (cellDetail) {
        cellDetail.textContent = state.probe.cell.detail;
    }

    if (pasteDetail) {
        pasteDetail.textContent = state.probe.paste.detail;
    }

    if (count) {
        count.textContent = String(state.probe.events.length);
    }

    if (sequence) {
        sequence.textContent =
            state.probe.events
                .slice(-12)
                .map(event => event.name)
                .join(" → ") || "—";
    }

    if (log) {
        const compact =
            state.probe.events
                .slice(-12)
                .map(event =>
                    `${event.index}. ${event.name}\n${JSON.stringify(event.payload, null, 2)}`)
                .join("\n\n");

        log.textContent = compact || "لا توجد أحداث بعد.";
    }
}

function resetProbeState(state) {
    state.probe = createProbe();
    renderProbe(state);
}

function evaluateCellEdit(state, after) {
    const before = state.probe.cell.pending;

    if (!before) {
        state.probe.cell.status = "FAIL";
        state.probe.cell.detail = "وصل afteredit بدون beforeedit مطابق.";
        return;
    }

    const sameTarget =
        before.rowIndex === after.rowIndex &&
        before.prop === after.prop &&
        before.rowId === after.rowId;

    const oldCaptured =
        before.prop !== null &&
        before.modelValueAtEvent !== undefined;

    const proposedApplied =
        sameValue(after.modelValueAtEvent, before.proposedValue);

    const changed =
        !sameValue(before.modelValueAtEvent, after.modelValueAtEvent);

    const pass =
        sameTarget &&
        oldCaptured &&
        proposedApplied &&
        changed;

    state.probe.cell.status = pass ? "PASS" : "FAIL";
    state.probe.cell.detail = pass
        ? `Revo أعطانا قبل/بعد لنفس الصف والحقل، والقيمة القديمة اتاخدت قبل التغيير. Row ID=${before.rowId ?? "—"}`
        : `النتيجة غير مطابقة: target=${sameTarget}, applied=${proposedApplied}, changed=${changed}`;

    state.probe.cell.result = {
        pass,
        before,
        after,
        checks: {
            sameTarget,
            oldCaptured,
            proposedApplied,
            changed
        }
    };

    state.probe.cell.pending = null;
}

function startPaste(state, payload) {
    state.probe.paste.active = {
        sequence: ["beforepaste"],
        clipboard: payload,
        beforeRange: null,
        afterRange: null
    };
}

function trackPaste(state, name, payload = null) {
    if (!state.probe.paste.active) {
        state.probe.paste.active = {
            sequence: [],
            clipboard: null,
            beforeRange: null,
            afterRange: null
        };
    }

    state.probe.paste.active.sequence.push(name);

    if (name === "beforerangeedit") {
        state.probe.paste.active.beforeRange = payload;
    }

    if (name === "afteredit:range") {
        state.probe.paste.active.afterRange = payload;
    }
}

function evaluatePaste(state) {
    const active = state.probe.paste.active;

    if (!active) {
        state.probe.paste.status = "FAIL";
        state.probe.paste.detail = "لم نجد عملية Paste كاملة.";
        return;
    }

    const before = active.beforeRange;
    const after = active.afterRange;
    const sequence = active.sequence;

    const required = [
        "beforepaste",
        "beforepasteapply",
        "beforerangeedit",
        "afteredit:range",
        "afterpasteapply"
    ];

    let cursor = -1;
    const ordered = required.every(name => {
        cursor = sequence.indexOf(name, cursor + 1);
        return cursor >= 0;
    });

    const beforeCells = before?.cells ?? [];
    const afterCells = after?.cells ?? [];

    const oldCaptured =
        beforeCells.length > 0 &&
        beforeCells.every(cell =>
            Object.prototype.hasOwnProperty.call(cell, "modelValueAtEvent"));

    const identitiesCaptured =
        beforeCells.length > 0 &&
        beforeCells.every(cell => cell.rowId !== null);

    const afterMap = new Map(
        afterCells.map(cell => [
            `${cell.rowIndex}|${String(cell.prop)}`,
            cell
        ])
    );

    const applied =
        beforeCells.length > 0 &&
        beforeCells.every(cell => {
            const afterCell =
                afterMap.get(`${cell.rowIndex}|${String(cell.prop)}`);

            return Boolean(afterCell) &&
                sameValue(
                    afterCell.modelValueAtEvent,
                    cell.proposedValue
                );
        });

    const pass =
        ordered &&
        oldCaptured &&
        identitiesCaptured &&
        applied;

    state.probe.paste.status = pass ? "PASS" : "FAIL";
    state.probe.paste.detail = pass
        ? `Paste مر بمسار قبل/بعد واحد، وتم التقاط ${beforeCells.length} خلية قبل التغيير مع Row ID ثابت.`
        : `النتيجة غير مطابقة: ordered=${ordered}, old=${oldCaptured}, identity=${identitiesCaptured}, applied=${applied}`;

    state.probe.paste.result = {
        pass,
        sequence: [...sequence],
        beforeRange: before,
        afterRange: after,
        checks: {
            ordered,
            oldCaptured,
            identitiesCaptured,
            applied
        }
    };

    state.probe.paste.active = null;
}

function buildProbeReport(state) {
    return {
        generatedAt: new Date().toISOString(),
        sourceReference: SOURCE_REFERENCE,
        runtime: {
            version: state.version,
            workYear: state.workYear,
            rows: state.sourceRows,
            columns: state.columns
        },
        result: {
            cell: state.probe.cell.result,
            paste: state.probe.paste.result
        },
        events: state.probe.events
    };
}

function downloadProbeReport(state) {
    const report = buildProbeReport(state);
    const blob = new Blob(
        [JSON.stringify(report, null, 2)],
        { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const stamp = new Date()
        .toISOString()
        .replaceAll(":", "")
        .replaceAll("-", "")
        .replace(/\.\d{3}Z$/, "Z");

    anchor.href = url;
    anchor.download = `RevoGrid-4.25.2-EventProbe-${stamp}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

function attachProbeListeners(state) {
    const grid = state.grid;

    addListener(state, grid, "beforeedit", event => {
        const snapshot = summarizeCell(event.detail, "before");

        state.probe.cell.pending = snapshot;
        appendProbeEvent(state, "beforeedit", snapshot);
    });

    addListener(state, grid, "afteredit", event => {
        const detail = event.detail;

        if (detail && detail.data && detail.models) {
            const snapshot = summarizeRange(detail, "after");
            trackPaste(state, "afteredit:range", snapshot);
            appendProbeEvent(state, "afteredit:range", snapshot);
            return;
        }

        const snapshot = summarizeCell(detail, "after");
        appendProbeEvent(state, "afteredit:cell", snapshot);
        evaluateCellEdit(state, snapshot);
        renderProbe(state);
    });

    addListener(state, grid, "beforepaste", event => {
        const payload = {
            rawLength: String(event.detail?.raw ?? "").length,
            dataTextLength: String(event.detail?.dataText ?? "").length,
            isHTML: Boolean(event.detail?.isHTML)
        };

        startPaste(state, payload);
        appendProbeEvent(state, "beforepaste", payload);
    });

    addListener(state, grid, "beforepasteapply", event => {
        const parsed = Array.isArray(event.detail?.parsed)
            ? event.detail.parsed
            : [];

        const payload = {
            rows: parsed.length,
            maxColumns: parsed.reduce(
                (max, row) =>
                    Math.max(
                        max,
                        Array.isArray(row) ? row.length : 0
                    ),
                0
            )
        };

        trackPaste(state, "beforepasteapply", payload);
        appendProbeEvent(state, "beforepasteapply", payload);
    });

    addListener(state, grid, "clipboardrangepaste", event => {
        const payload = summarizeRange(
            {
                ...event.detail,
                oldRange: event.detail?.range ?? null,
                newRange: event.detail?.range ?? null
            },
            "clipboard-range"
        );

        trackPaste(state, "clipboardrangepaste", payload);
        appendProbeEvent(state, "clipboardrangepaste", payload);
    });

    addListener(state, grid, "beforerangeedit", event => {
        const snapshot = summarizeRange(event.detail, "before");
        trackPaste(state, "beforerangeedit", snapshot);
        appendProbeEvent(state, "beforerangeedit", snapshot);
    });

    addListener(state, grid, "afterpasteapply", event => {
        const parsed = Array.isArray(event.detail?.parsed)
            ? event.detail.parsed
            : [];

        const payload = {
            rows: parsed.length,
            maxColumns: parsed.reduce(
                (max, row) =>
                    Math.max(
                        max,
                        Array.isArray(row) ? row.length : 0
                    ),
                0
            )
        };

        trackPaste(state, "afterpasteapply", payload);
        appendProbeEvent(state, "afterpasteapply", payload);
        evaluatePaste(state);
        renderProbe(state);
    });

    const reset = document.getElementById("event-probe-reset");
    const download = document.getElementById("event-probe-download");

    if (reset) {
        addListener(state, reset, "click", () => {
            resetProbeState(state);
        });
    }

    if (download) {
        addListener(state, download, "click", () => {
            downloadProbeReport(state);
        });
    }

    renderProbe(state);
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
    const columns = buildColumns(customColumns);
    const startedAt = performance.now();

    const grid = document.createElement("revo-grid");
    grid.style.width = "100%";
    grid.style.height = "100%";

    grid.source = source;
    grid.columns = columns;

    grid.range = true;
    grid.resize = true;
    grid.rowHeaders = true;
    grid.filter = true;
    grid.useClipboard = true;
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
        probe: createProbe()
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

    attachProbeListeners(state);

    initializationCounts.set(elementId, state.initializationCount);
    startLongTaskObserver(state);

    host.replaceChildren(grid);

    await new Promise(resolve =>
        requestAnimationFrame(() =>
            requestAnimationFrame(resolve)));

    state.readyMs = performance.now() - startedAt;
    states.set(elementId, state);
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
    resetProbeState(state);

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
        longTaskMaxMs: state.longTaskMaxMs
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
