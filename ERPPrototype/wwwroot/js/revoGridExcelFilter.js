const HISTORY_ADAPTER_KEY = "work-orders-filter-state";
const NATIVE_FILTER_TYPE = "erpSelectedValues";
const BLANK_TOKEN = "\u0000ERP_BLANK";
const POPUP_STYLE_ID = "erp-revogrid-excel-filter-style";
const POPUP_CLASS = "erp-revo-excel-filter";
const FILTER_BUTTON_CLASS = "erp-revo-excel-filter-button";
const ACTIVE_FILTER_PROP = "hasFilter";
const FILTER_TRIMMED_TYPE = "filter";
const VIRTUAL_THRESHOLD = 250;
const VIRTUAL_ROW_HEIGHT = 30;
const VIRTUAL_OVERSCAN = 7;

const MONTH_NAMES = Object.freeze([
    "",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
]);

const nativeSelectionSets = new WeakMap();

export function eventTargetsElement(originalEvent, element) {
    if (!originalEvent || !(element instanceof Element)) {
        return false;
    }

    const path = typeof originalEvent.composedPath === "function"
        ? originalEvent.composedPath()
        : [];
    if (path.includes(element)) {
        return true;
    }

    const target = originalEvent.target;
    return target instanceof Node && element.contains(target);
}

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

function normalizeToken(value) {
    if (value === null || value === undefined || value === "") {
        return BLANK_TOKEN;
    }
    return String(value).trim();
}

function displayToken(token) {
    return token === BLANK_TOKEN ? "(Blanks)" : token;
}

function nativeSelectionFilter(cellValue, selectedValues) {
    if (!Array.isArray(selectedValues)) {
        return true;
    }

    let selected = nativeSelectionSets.get(selectedValues);
    if (!selected) {
        selected = new Set(selectedValues.map(normalizeToken));
        nativeSelectionSets.set(selectedValues, selected);
    }

    return selected.has(normalizeToken(cellValue));
}

export function createExcelFilterNativeConfig() {
    return {
        multiFilterItems: {},
        customFilters: {
            [NATIVE_FILTER_TYPE]: {
                // This only registers the native filtering function. The ERP
                // UI is intentionally separate from Revo's condition panel.
                columnFilterType: "string",
                name: "Selected values",
                func: nativeSelectionFilter
            }
        }
    };
}

function funnelIcon(h) {
    return h("svg", {
        viewBox: "0 0 24 24",
        width: "13",
        height: "13",
        "aria-hidden": "true",
        style: {
            display: "block",
            pointerEvents: "none"
        }
    }, [
        h("path", {
            d: "M3 5h18l-7 8v5.2l-4 1.8v-7L3 5z",
            fill: "currentColor"
        })
    ]);
}

export function excelFilterHeaderTemplate(h, column) {
    const active = Boolean(column?.[ACTIVE_FILTER_PROP]);
    const prop = String(column?.prop ?? "");

    return h("span", {
        style: {
            display: "flex",
            alignItems: "center",
            minWidth: "0",
            width: "100%",
            gap: "5px"
        }
    }, [
        h("span", {
            style: {
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: "0",
                flex: "1 1 auto"
            }
        }, String(column?.name ?? prop)),
        h("button", {
            type: "button",
            class: FILTER_BUTTON_CLASS,
            "data-erp-filter-prop": prop,
            "aria-label": `Filter ${String(column?.name ?? prop)}${active ? " (active)" : ""}`,
            "aria-pressed": active ? "true" : "false",
            title: active
                ? `Filter ${String(column?.name ?? prop)} (active)`
                : `Filter ${String(column?.name ?? prop)}`,
            style: {
                display: "inline-grid",
                placeItems: "center",
                width: "20px",
                height: "20px",
                padding: "0",
                border: active ? "1px solid #6aaed6" : "1px solid transparent",
                borderRadius: "3px",
                background: active ? "#d8eefc" : "transparent",
                color: active ? "#0b5f8a" : "currentColor",
                opacity: active ? "1" : ".78",
                cursor: "pointer",
                flex: "0 0 auto"
            }
        }, [funnelIcon(h)])
    ]);
}

export function createExcelFilterColumn(column, kind) {
    return {
        ...column,
        sortable: false,
        // Keep Revo FilterPlugin enabled at grid level, but suppress its
        // condition-panel button for this column. Our header button is only UI;
        // the actual row trimming remains Revo FilterPlugin's native work.
        filter: false,
        erpFilterKind: kind === "date" ? "date" : "values",
        columnTemplate: excelFilterHeaderTemplate
    };
}

function normalizeFilterState(input) {
    const output = {};
    if (!input || typeof input !== "object") {
        return output;
    }

    for (const [field, rawValues] of Object.entries(input)) {
        if (!Array.isArray(rawValues)) {
            continue;
        }

        const unique = [];
        const seen = new Set();
        for (const raw of rawValues) {
            const token = normalizeToken(raw);
            if (seen.has(token)) {
                continue;
            }
            seen.add(token);
            unique.push(token);
        }

        if (unique.length > 0) {
            output[String(field)] = unique;
        }
    }

    return output;
}

function statesEqual(left, right) {
    return JSON.stringify(normalizeFilterState(left)) ===
        JSON.stringify(normalizeFilterState(right));
}

function compileFilterState(filterState) {
    const compiled = new Map();
    for (const [field, values] of Object.entries(normalizeFilterState(filterState))) {
        compiled.set(field, new Set(values));
    }
    return compiled;
}

function rowMatchesOtherFilters(row, compiled, excludedField) {
    for (const [field, selected] of compiled.entries()) {
        if (field === excludedField) {
            continue;
        }
        if (!selected.has(normalizeToken(row?.[field]))) {
            return false;
        }
    }
    return true;
}

function rowClientKey(row) {
    const key = String(row?.clientKey ?? "").trim();
    return key || null;
}

function normalizeFilterViewDelta(input) {
    const uniqueKeys = values => {
        const output = [];
        const seen = new Set();
        for (const value of Array.isArray(values) ? values : []) {
            const key = String(value ?? "").trim();
            if (!key || seen.has(key)) {
                continue;
            }
            seen.add(key);
            output.push(key);
        }
        return output;
    };

    const forceVisible = uniqueKeys(input?.forceVisible);
    const visibleSet = new Set(forceVisible);
    const forceHidden = uniqueKeys(input?.forceHidden)
        .filter(key => !visibleSet.has(key));

    return { forceVisible, forceHidden };
}

function hasFilterViewDelta(input) {
    const delta = normalizeFilterViewDelta(input);
    return delta.forceVisible.length > 0 || delta.forceHidden.length > 0;
}

function compareTokens(left, right) {
    if (left === BLANK_TOKEN) {
        return right === BLANK_TOKEN ? 0 : 1;
    }
    if (right === BLANK_TOKEN) {
        return -1;
    }

    const leftNumber = Number(left);
    const rightNumber = Number(right);
    const bothNumeric = Number.isFinite(leftNumber) && Number.isFinite(rightNumber);
    if (bothNumeric) {
        return leftNumber - rightNumber;
    }

    return left.localeCompare(right, undefined, {
        numeric: true,
        sensitivity: "base"
    });
}

export function collectFilterCandidates(rows, filterState, field, kind) {
    const normalizedField = requireText(field, "field");
    const compiled = compileFilterState(filterState);
    const seen = new Set();
    const values = [];

    for (const row of Array.isArray(rows) ? rows : []) {
        if (!rowMatchesOtherFilters(row, compiled, normalizedField)) {
            continue;
        }

        const token = normalizeToken(row?.[normalizedField]);
        if (kind === "date" && token === BLANK_TOKEN) {
            continue;
        }
        if (seen.has(token)) {
            continue;
        }

        seen.add(token);
        values.push(token);
    }

    values.sort(kind === "date"
        ? (a, b) => dateTokenTime(a) - dateTokenTime(b) || compareTokens(a, b)
        : compareTokens);

    return values;
}

function parseDateToken(token) {
    if (!token || token === BLANK_TOKEN) {
        return null;
    }

    const text = String(token).trim();
    let day;
    let month;
    let year;

    let match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
    if (match) {
        day = Number(match[1]);
        month = Number(match[2]);
        year = Number(match[3]);
    } else {
        match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
        if (!match) {
            return null;
        }
        year = Number(match[1]);
        month = Number(match[2]);
        day = Number(match[3]);
    }

    if (
        !Number.isInteger(year) ||
        !Number.isInteger(month) || month < 1 || month > 12 ||
        !Number.isInteger(day) || day < 1 || day > 31
    ) {
        return null;
    }

    const utc = Date.UTC(year, month - 1, day);
    const date = new Date(utc);
    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        return null;
    }

    return { year, month, day, time: utc };
}

function dateTokenTime(token) {
    return parseDateToken(token)?.time ?? Number.MAX_SAFE_INTEGER;
}

function buildDateGroups(values) {
    const groups = new Map();
    const unparsed = [];

    for (const value of values) {
        const parsed = parseDateToken(value);
        if (!parsed) {
            unparsed.push(value);
            continue;
        }

        if (!groups.has(parsed.year)) {
            groups.set(parsed.year, new Map());
        }
        const months = groups.get(parsed.year);
        if (!months.has(parsed.month)) {
            months.set(parsed.month, []);
        }
        months.get(parsed.month).push({ value, ...parsed });
    }

    return { groups, unparsed };
}

function injectPopupStyles() {
    if (document.getElementById(POPUP_STYLE_ID)) {
        return;
    }

    const style = document.createElement("style");
    style.id = POPUP_STYLE_ID;
    style.textContent = `
.${POPUP_CLASS} {
    position: fixed;
    z-index: 2147483000;
    width: min(300px, calc(100vw - 20px));
    max-height: min(470px, calc(100vh - 20px));
    display: grid;
    grid-template-rows: auto auto auto minmax(120px, 1fr) auto;
    overflow: hidden;
    direction: ltr;
    color: #213547;
    background: #fff;
    border: 1px solid #aebdca;
    border-radius: 5px;
    box-shadow: 0 8px 24px rgb(20 42 62 / .18);
    font: 12px/1.35 Arial, sans-serif;
}
.${POPUP_CLASS} * { box-sizing: border-box; }
.${POPUP_CLASS}__title {
    padding: 8px 10px 5px;
    font-weight: 700;
}
.${POPUP_CLASS}__search {
    margin: 0 9px 7px;
    height: 31px;
    padding: 5px 8px;
    border: 1px solid #b8c5d1;
    border-radius: 4px;
    outline: none;
    font: inherit;
}
.${POPUP_CLASS}__search:focus { border-color: #4f83ad; }
.${POPUP_CLASS}__select-all {
    display: flex;
    align-items: center;
    gap: 7px;
    min-height: 34px;
    padding: 6px 9px;
    border-top: 1px solid #dce4eb;
    border-bottom: 1px solid #dce4eb;
    background: #f7f9fb;
    cursor: pointer;
    user-select: none;
}
.${POPUP_CLASS}__body {
    min-height: 120px;
    overflow: auto;
    position: relative;
    background: #fff;
}
.${POPUP_CLASS}__option {
    display: flex;
    align-items: center;
    gap: 7px;
    min-height: 30px;
    padding: 5px 9px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
}
.${POPUP_CLASS}__option:hover { background: #f2f6f9; }
.${POPUP_CLASS}__option > span {
    overflow: hidden;
    text-overflow: ellipsis;
}
.${POPUP_CLASS}__virtual-canvas { position: relative; width: 100%; }
.${POPUP_CLASS}__virtual-row {
    position: absolute;
    left: 0;
    right: 0;
    height: ${VIRTUAL_ROW_HEIGHT}px;
}
.${POPUP_CLASS}__empty { padding: 18px 10px; color: #667788; text-align: center; }
.${POPUP_CLASS}__actions {
    display: flex;
    justify-content: flex-end;
    gap: 7px;
    padding: 8px 9px;
    border-top: 1px solid #dce4eb;
    background: #fafbfc;
}
.${POPUP_CLASS}__actions button {
    min-width: 78px;
    height: 31px;
    padding: 0 10px;
    border-radius: 4px;
    border: 1px solid #aebdca;
    background: #fff;
    color: #24425b;
    cursor: pointer;
    font: inherit;
}
.${POPUP_CLASS}__actions button[data-primary="true"] {
    border-color: #2f76a8;
    background: #2f76a8;
    color: #fff;
}
.${POPUP_CLASS}__date-group { border-bottom: 1px solid #edf1f4; }
.${POPUP_CLASS}__date-summary {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 31px;
    padding: 4px 8px;
    cursor: pointer;
    list-style: none;
    font-weight: 600;
}
.${POPUP_CLASS}__date-summary::-webkit-details-marker { display: none; }
.${POPUP_CLASS}__date-summary::before {
    content: "+";
    display: inline-grid;
    place-items: center;
    width: 15px;
    height: 15px;
    border: 1px solid #aebdca;
    border-radius: 2px;
    color: #4b6275;
    font-size: 11px;
    line-height: 1;
}
.${POPUP_CLASS} details[open] > .${POPUP_CLASS}__date-summary::before { content: "−"; }
.${POPUP_CLASS}__date-month { margin-left: 18px; }
.${POPUP_CLASS}__date-day { padding-left: 48px; }
`;

    document.head.appendChild(style);
}

function findFilterButton(originalEvent) {
    const path = typeof originalEvent?.composedPath === "function"
        ? originalEvent.composedPath()
        : [];

    for (const item of path) {
        if (
            item instanceof Element &&
            item.classList.contains(FILTER_BUTTON_CLASS)
        ) {
            return item;
        }
    }

    const target = originalEvent?.target;
    return target instanceof Element
        ? target.closest(`.${FILTER_BUTTON_CLASS}`)
        : null;
}

function createCheckboxLabel(text, className) {
    const label = document.createElement("label");
    label.className = className;

    const input = document.createElement("input");
    input.type = "checkbox";

    const span = document.createElement("span");
    span.textContent = text;

    label.append(input, span);
    return { label, input, span };
}

function syncCheckbox(checkbox, values, selected) {
    let count = 0;
    for (const value of values) {
        if (selected.has(value)) {
            count += 1;
        }
    }

    checkbox.checked = values.length > 0 && count === values.length;
    checkbox.indeterminate = count > 0 && count < values.length;
}

function normalizeSearchQuery(value) {
    return String(value ?? "").trim().toLocaleLowerCase();
}

function dateTokenMatchesSearch(value, query) {
    const parsed = parseDateToken(value);
    if (!parsed) {
        return displayToken(value).toLocaleLowerCase().includes(query);
    }

    return String(value).toLocaleLowerCase().includes(query) ||
        String(parsed.year).includes(query) ||
        String(parsed.month).includes(query) ||
        String(parsed.day).includes(query) ||
        String(parsed.day).padStart(2, "0").includes(query) ||
        MONTH_NAMES[parsed.month].toLocaleLowerCase().includes(query);
}

function collectSearchMatches(candidates, kind, rawQuery) {
    const query = normalizeSearchQuery(rawQuery);
    if (!query) {
        return candidates;
    }

    return candidates.filter(value => kind === "date"
        ? dateTokenMatchesSearch(value, query)
        : displayToken(value).toLocaleLowerCase().includes(query));
}

function syncPopupSelectionUi(ui, visibleValues, selected) {
    syncCheckbox(ui.selectAll, visibleValues, selected);
    ui.apply.disabled = selected.size === 0;
}

function replaceSelectionFromSearch(selected, candidates, kind, rawQuery) {
    if (!normalizeSearchQuery(rawQuery)) {
        return false;
    }

    selected.clear();
    collectSearchMatches(candidates, kind, rawQuery)
        .forEach(value => selected.add(value));
    return true;
}

function setVisibleSelection(selected, visibleValues, checked) {
    for (const value of visibleValues) {
        if (checked) {
            selected.add(value);
        } else {
            selected.delete(value);
        }
    }
}

function positionPopup(popup, anchor) {
    const rect = anchor.getBoundingClientRect();
    const margin = 8;
    const width = Math.min(300, window.innerWidth - margin * 2);
    const maxHeight = Math.min(470, window.innerHeight - margin * 2);

    popup.style.width = `${Math.max(250, width)}px`;
    popup.style.maxHeight = `${Math.max(280, maxHeight)}px`;

    // Mount before measuring actual height.
    const popupRect = popup.getBoundingClientRect();
    let left = rect.left;
    if (left + popupRect.width > window.innerWidth - margin) {
        left = window.innerWidth - popupRect.width - margin;
    }
    left = Math.max(margin, left);

    let top = rect.bottom + 3;
    if (top + popupRect.height > window.innerHeight - margin) {
        top = rect.top - popupRect.height - 3;
    }
    top = Math.max(margin, Math.min(top, window.innerHeight - popupRect.height - margin));

    popup.style.left = `${Math.round(left)}px`;
    popup.style.top = `${Math.round(top)}px`;
}

function buildNativeFilterItems(filterState) {
    const items = {};
    let id = 1;

    for (const [field, selectedValues] of Object.entries(normalizeFilterState(filterState))) {
        items[field] = [{
            id: id++,
            type: NATIVE_FILTER_TYPE,
            value: [...selectedValues],
            relation: "and",
            hidden: true
        }];
    }

    return items;
}

function waitForFilterApply(grid, trigger) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const timer = window.setTimeout(() => {
            if (settled) {
                return;
            }
            settled = true;
            grid.removeEventListener("afterfilterapply", handler);
            reject(new Error("RevoGrid native filter did not finish in time."));
        }, 5000);

        const handler = () => {
            if (settled) {
                return;
            }
            settled = true;
            window.clearTimeout(timer);
            grid.removeEventListener("afterfilterapply", handler);
            resolve();
        };

        grid.addEventListener("afterfilterapply", handler);
        try {
            trigger();
        } catch (error) {
            settled = true;
            window.clearTimeout(timer);
            grid.removeEventListener("afterfilterapply", handler);
            reject(error);
        }
    });
}

function getFilterColumns(grid) {
    const result = new Map();
    for (const column of Array.isArray(grid?.columns) ? grid.columns : []) {
        if (!column?.erpFilterKind) {
            continue;
        }
        result.set(String(column.prop), {
            field: String(column.prop),
            title: String(column.name ?? column.prop),
            kind: column.erpFilterKind === "date" ? "date" : "values"
        });
    }
    return result;
}

function createBasePopup(title, kind) {
    const popup = document.createElement("section");
    popup.className = POPUP_CLASS;
    popup.dataset.filterKind = kind;

    const heading = document.createElement("div");
    heading.className = `${POPUP_CLASS}__title`;
    heading.textContent = `Filter ${title}`;

    const search = document.createElement("input");
    search.className = `${POPUP_CLASS}__search`;
    search.type = "search";
    search.autocomplete = "off";
    search.placeholder = kind === "date" ? "Search dates..." : "Search values...";

    const selectAllUi = createCheckboxLabel(
        "Select All",
        `${POPUP_CLASS}__select-all`
    );

    const body = document.createElement("div");
    body.className = `${POPUP_CLASS}__body`;

    const actions = document.createElement("div");
    actions.className = `${POPUP_CLASS}__actions`;

    const clear = document.createElement("button");
    clear.type = "button";
    clear.textContent = "Clear Filter";

    const apply = document.createElement("button");
    apply.type = "button";
    apply.textContent = "Apply";
    apply.dataset.primary = "true";

    actions.append(clear, apply);
    popup.append(heading, search, selectAllUi.label, body, actions);

    return {
        popup,
        search,
        selectAll: selectAllUi.input,
        body,
        clear,
        apply
    };
}

function renderValueList(ui, candidates, selected) {
    const visible = collectSearchMatches(candidates, "values", ui.search.value);

    const createRow = (value, index = null) => {
        const option = createCheckboxLabel(
            displayToken(value),
            `${POPUP_CLASS}__option${Number.isInteger(index) ? ` ${POPUP_CLASS}__virtual-row` : ""}`
        );
        option.input.checked = selected.has(value);
        option.label.title = displayToken(value);
        if (Number.isInteger(index)) {
            option.label.style.top = `${index * VIRTUAL_ROW_HEIGHT}px`;
        }
        option.input.addEventListener("change", () => {
            if (option.input.checked) {
                selected.add(value);
            } else {
                selected.delete(value);
            }
            syncPopupSelectionUi(ui, visible, selected);
        });
        return option.label;
    };

    const renderVirtualRows = () => {
        if (visible.length === 0) {
            ui.body.innerHTML = `<div class="${POPUP_CLASS}__empty">No matching values.</div>`;
            return;
        }

        let canvas = ui.body.querySelector(`.${POPUP_CLASS}__virtual-canvas`);
        if (!canvas) {
            canvas = document.createElement("div");
            canvas.className = `${POPUP_CLASS}__virtual-canvas`;
            ui.body.replaceChildren(canvas);
        }
        canvas.style.height = `${visible.length * VIRTUAL_ROW_HEIGHT}px`;

        const start = Math.max(
            0,
            Math.floor(ui.body.scrollTop / VIRTUAL_ROW_HEIGHT) - VIRTUAL_OVERSCAN
        );
        const count = Math.ceil(ui.body.clientHeight / VIRTUAL_ROW_HEIGHT) + VIRTUAL_OVERSCAN * 2;
        const end = Math.min(visible.length, start + count);
        const fragment = document.createDocumentFragment();
        for (let index = start; index < end; index += 1) {
            fragment.appendChild(createRow(visible[index], index));
        }
        canvas.replaceChildren(fragment);
    };

    if (visible.length > VIRTUAL_THRESHOLD) {
        ui.body.onscroll = renderVirtualRows;
        renderVirtualRows();
        return;
    }

    ui.body.onscroll = null;
    if (visible.length === 0) {
        const empty = document.createElement("div");
        empty.className = `${POPUP_CLASS}__empty`;
        empty.textContent = "No matching values.";
        ui.body.replaceChildren(empty);
        return;
    }

    const fragment = document.createDocumentFragment();
    visible.forEach(value => fragment.appendChild(createRow(value)));
    ui.body.replaceChildren(fragment);
}

function renderDateTree(ui, candidates, selected, expandedYears, expandedMonths) {
    const query = normalizeSearchQuery(ui.search.value);
    const visible = collectSearchMatches(candidates, "date", query);
    const { groups, unparsed } = buildDateGroups(visible);
    const fragment = document.createDocumentFragment();
    let rendered = 0;

    const allValuesForMonth = items => items.map(item => item.value);

    for (const year of Array.from(groups.keys()).sort((a, b) => a - b)) {
        const months = groups.get(year);
        const yearValues = [];
        for (const items of months.values()) {
            yearValues.push(...allValuesForMonth(items));
        }

        const yearDetails = document.createElement("details");
        yearDetails.className = `${POPUP_CLASS}__date-group`;
        yearDetails.open = expandedYears.has(year) || Boolean(query);
        yearDetails.addEventListener("toggle", () => {
            if (yearDetails.open) {
                expandedYears.add(year);
            } else {
                expandedYears.delete(year);
            }
        });

        const yearSummary = document.createElement("summary");
        yearSummary.className = `${POPUP_CLASS}__date-summary`;
        const yearCheckbox = document.createElement("input");
        yearCheckbox.type = "checkbox";
        yearCheckbox.addEventListener("click", event => event.stopPropagation());
        syncCheckbox(yearCheckbox, yearValues, selected);
        yearCheckbox.addEventListener("change", () => {
            for (const value of yearValues) {
                if (yearCheckbox.checked) {
                    selected.add(value);
                } else {
                    selected.delete(value);
                }
            }
            renderDateTree(ui, candidates, selected, expandedYears, expandedMonths);
        });
        const yearText = document.createElement("span");
        yearText.textContent = String(year);
        yearSummary.append(yearCheckbox, yearText);
        yearDetails.appendChild(yearSummary);

        for (const month of Array.from(months.keys()).sort((a, b) => a - b)) {
            const items = months.get(month).slice().sort((a, b) => a.day - b.day);
            const monthValues = allValuesForMonth(items);

            const monthKey = `${year}-${month}`;
            const monthDetails = document.createElement("details");
            monthDetails.className = `${POPUP_CLASS}__date-month`;
            monthDetails.open = expandedMonths.has(monthKey) || Boolean(query);
            monthDetails.addEventListener("toggle", () => {
                if (monthDetails.open) {
                    expandedMonths.add(monthKey);
                } else {
                    expandedMonths.delete(monthKey);
                }
            });

            const monthSummary = document.createElement("summary");
            monthSummary.className = `${POPUP_CLASS}__date-summary`;
            const monthCheckbox = document.createElement("input");
            monthCheckbox.type = "checkbox";
            monthCheckbox.addEventListener("click", event => event.stopPropagation());
            syncCheckbox(monthCheckbox, monthValues, selected);
            monthCheckbox.addEventListener("change", () => {
                for (const value of monthValues) {
                    if (monthCheckbox.checked) {
                        selected.add(value);
                    } else {
                        selected.delete(value);
                    }
                }
                renderDateTree(ui, candidates, selected, expandedYears, expandedMonths);
            });
            const monthText = document.createElement("span");
            monthText.textContent = MONTH_NAMES[month];
            monthSummary.append(monthCheckbox, monthText);
            monthDetails.appendChild(monthSummary);

            for (const item of items) {
                const dayOption = createCheckboxLabel(
                    String(item.day).padStart(2, "0"),
                    `${POPUP_CLASS}__option ${POPUP_CLASS}__date-day`
                );
                dayOption.input.checked = selected.has(item.value);
                dayOption.label.title = item.value;
                dayOption.input.addEventListener("change", () => {
                    if (dayOption.input.checked) {
                        selected.add(item.value);
                    } else {
                        selected.delete(item.value);
                    }
                    syncPopupSelectionUi(ui, visible, selected);
                    syncCheckbox(monthCheckbox, monthValues, selected);
                    syncCheckbox(yearCheckbox, yearValues, selected);
                });
                monthDetails.appendChild(dayOption.label);
                rendered += 1;
            }

            yearDetails.appendChild(monthDetails);
        }

        fragment.appendChild(yearDetails);
    }

    for (const value of unparsed) {
        const option = createCheckboxLabel(
            displayToken(value),
            `${POPUP_CLASS}__option`
        );
        option.input.checked = selected.has(value);
        option.input.addEventListener("change", () => {
            if (option.input.checked) {
                selected.add(value);
            } else {
                selected.delete(value);
            }
            syncPopupSelectionUi(ui, visible, selected);
        });
        fragment.appendChild(option.label);
        rendered += 1;
    }

    if (rendered === 0) {
        const empty = document.createElement("div");
        empty.className = `${POPUP_CLASS}__empty`;
        empty.textContent = "No matching dates.";
        fragment.appendChild(empty);
    }

    syncPopupSelectionUi(ui, visible, selected);
    ui.body.replaceChildren(fragment);
}

export function createRevoGridExcelFilter(options) {
    const grid = options?.grid;
    const historyCoordinator = options?.historyCoordinator;
    const selectionLifecycle = options?.selectionLifecycle;
    if (!grid || typeof grid.addEventListener !== "function") {
        throw new Error("A RevoGrid element is required.");
    }
    if (
        !historyCoordinator ||
        typeof historyCoordinator.registerAdapter !== "function" ||
        typeof historyCoordinator.record !== "function"
    ) {
        throw new Error("Sheet History coordinator is required.");
    }

    injectPopupStyles();

    let rows = Array.isArray(options?.rows) ? options.rows : [];
    let datasetKey = requireText(options?.datasetKey, "datasetKey");
    let activeState = {};
    let destroyed = false;
    let applying = false;
    let popupState = null;
    const ownedKeyboardEvents = new WeakSet();
    const viewStateByDataset = new Map([[datasetKey, {}]]);
    const filterColumns = getFilterColumns(grid);
    const removers = [];

    function notifyState() {
        if (typeof options?.onStateChange === "function") {
            options.onStateChange(getState());
        }
    }

    function addListener(target, type, handler, listenerOptions) {
        target.addEventListener(type, handler, listenerOptions);
        removers.push(() => target.removeEventListener(type, handler, listenerOptions));
    }

    function closePopup() {
        if (!popupState) {
            return;
        }
        popupState.ui.popup.remove();
        popupState = null;
    }

    async function captureFilterViewDelta(filterState) {
        const source = await grid.getSource("rgRow");
        const store = await grid.getSourceStore("rgRow");
        const currentFilterTrim = store.get("trimmed")?.[FILTER_TRIMMED_TYPE] ?? {};
        const compiled = compileFilterState(filterState);
        const forceVisible = [];
        const forceHidden = [];

        source.forEach((row, index) => {
            const key = rowClientKey(row);
            if (!key) {
                return;
            }

            const nativeVisible = rowMatchesOtherFilters(row, compiled, null);
            const snapshotVisible = !Boolean(currentFilterTrim[index]);

            if (snapshotVisible && !nativeVisible) {
                forceVisible.push(key);
            } else if (!snapshotVisible && nativeVisible) {
                forceHidden.push(key);
            }
        });

        return normalizeFilterViewDelta({ forceVisible, forceHidden });
    }

    async function restoreFilterViewDelta(filterState, viewDelta) {
        const delta = normalizeFilterViewDelta(viewDelta);
        if (!hasFilterViewDelta(delta)) {
            return;
        }

        const providers = await grid.getProviders();
        if (!providers?.data || typeof providers.data.setTrimmed !== "function") {
            throw new Error("RevoGrid DataProvider is not available for filter History replay.");
        }

        const source = await grid.getSource("rgRow");
        const compiled = compileFilterState(filterState);
        const forceVisible = new Set(delta.forceVisible);
        const forceHidden = new Set(delta.forceHidden);
        const hidden = {};

        source.forEach((row, index) => {
            const key = rowClientKey(row);
            let visible = rowMatchesOtherFilters(row, compiled, null);

            if (key && forceVisible.has(key)) {
                visible = true;
            }
            if (key && forceHidden.has(key)) {
                visible = false;
            }
            if (!visible) {
                hidden[index] = true;
            }
        });

        // Revo still owns the filter trimmed store. History only restores the
        // small identity delta needed to recreate the employee's previous
        // working snapshot; it never stores or replaces the whole dataset.
        providers.data.setTrimmed({ [FILTER_TRIMMED_TYPE]: hidden }, "rgRow");
        await grid.refresh("rgRow");
    }

    async function applyNativeState(
        nextState,
        { remember = true, preserveSelection = true, viewDelta = null } = {}
    ) {
        if (destroyed) {
            return;
        }

        const normalized = normalizeFilterState(nextState);
        applying = true;
        notifyState();
        try {
            const applyFilter = async () => {
                await waitForFilterApply(grid, () => {
                    // RevoGrid 4.25.2 FilterPlugin watches this property and runs
                    // its own runFiltering -> setTrimmed path. We only provide the
                    // selected-value criteria; we never replace its filter engine.
                    grid.filter = {
                        multiFilterItems: buildNativeFilterItems(normalized)
                    };
                });

                if (hasFilterViewDelta(viewDelta)) {
                    await restoreFilterViewDelta(normalized, viewDelta);
                }
            };

            if (
                preserveSelection &&
                typeof selectionLifecycle?.runWithPreservedCellSelection === "function"
            ) {
                await selectionLifecycle.runWithPreservedCellSelection(applyFilter);
            } else {
                await applyFilter();
            }

            activeState = normalized;
            if (remember) {
                viewStateByDataset.set(datasetKey, cloneValue(activeState));
            }
        } finally {
            applying = false;
            notifyState();
        }
    }

    async function commitUserState(nextState, label) {
        const before = normalizeFilterState(activeState);
        const after = normalizeFilterState(nextState);
        const beforeViewDelta = await captureFilterViewDelta(before);

        // Pressing Apply with the same checkbox selection is still a real action
        // when Edit/Paste/Insert changed which rows currently belong to that
        // filter. If the working snapshot already matches the native result, it
        // remains a no-op and does not pollute Undo History.
        if (statesEqual(before, after) && !hasFilterViewDelta(beforeViewDelta)) {
            closePopup();
            return false;
        }

        await applyNativeState(after);
        const afterViewDelta = await captureFilterViewDelta(after);

        try {
            historyCoordinator.record({
                adapterKey: HISTORY_ADAPTER_KEY,
                kind: "filter",
                label,
                focusTarget: null,
                payload: {
                    before,
                    after,
                    beforeViewDelta,
                    afterViewDelta
                }
            });
        } catch (error) {
            await applyNativeState(before, { viewDelta: beforeViewDelta });
            throw error;
        }

        closePopup();
        return true;
    }

    const unregisterHistoryAdapter = historyCoordinator.registerAdapter(
        HISTORY_ADAPTER_KEY,
        {
            apply: async (entry, direction) => {
                const isUndo = direction === "undo";
                const target = isUndo
                    ? entry?.payload?.before
                    : entry?.payload?.after;
                const viewDelta = isUndo
                    ? entry?.payload?.beforeViewDelta
                    : entry?.payload?.afterViewDelta;
                await applyNativeState(target ?? {}, { viewDelta });
            }
        }
    );

    function openPopup(field, anchor) {
        const definition = filterColumns.get(field);
        if (!definition) {
            return;
        }

        closePopup();

        const candidates = collectFilterCandidates(
            rows,
            activeState,
            field,
            definition.kind
        );
        const activeValues = activeState[field];
        const candidateSet = new Set(candidates);
        const pending = new Set(
            Array.isArray(activeValues) && activeValues.length > 0
                ? activeValues.filter(value => candidateSet.has(value))
                : candidates
        );

        const ui = createBasePopup(definition.title, definition.kind);

        // RevoGrid intentionally clears cell focus when mouseup/touchend
        // finishes outside the grid. The ERP filter popup lives in document.body,
        // so mark interactions inside that popup as handled. This preserves the
        // employee's selected cell until the filter result itself decides whether
        // that logical Work Order is still visible.
        const keepGridSelection = event => event.preventDefault();
        ui.popup.addEventListener("mouseup", keepGridSelection);
        ui.popup.addEventListener("touchend", keepGridSelection, { passive: false });

        const expandedYears = new Set();
        const expandedMonths = new Set();
        popupState = {
            field,
            definition,
            candidates,
            pending,
            anchor,
            ui,
            expandedYears,
            expandedMonths
        };

        const render = () => {
            const visible = collectSearchMatches(
                candidates,
                definition.kind,
                ui.search.value
            );
            syncPopupSelectionUi(ui, visible, pending);
            if (definition.kind === "date") {
                renderDateTree(
                    ui,
                    candidates,
                    pending,
                    expandedYears,
                    expandedMonths
                );
            } else {
                renderValueList(ui, candidates, pending);
            }
        };

        ui.search.addEventListener("input", () => {
            // Excel-like ERP behavior: search is a pending selection shortcut,
            // not a live grid filter. While text is present, the matched popup
            // options become the pending selection automatically. The actual
            // RevoGrid filter is still applied only when the employee presses
            // Apply, preserving the approved snapshot behavior.
            replaceSelectionFromSearch(
                pending,
                candidates,
                definition.kind,
                ui.search.value
            );
            ui.body.scrollTop = 0;
            render();
        });
        ui.selectAll.addEventListener("change", () => {
            const visible = collectSearchMatches(
                candidates,
                definition.kind,
                ui.search.value
            );
            setVisibleSelection(pending, visible, ui.selectAll.checked);
            render();
        });

        ui.clear.addEventListener("click", () => {
            const next = normalizeFilterState(activeState);
            delete next[field];
            void commitUserState(next, `Clear Filter ${definition.title}`);
        });

        ui.apply.addEventListener("click", () => {
            const next = normalizeFilterState(activeState);
            const selected = candidates.filter(value => pending.has(value));
            if (selected.length === candidates.length) {
                delete next[field];
            } else {
                next[field] = selected;
            }
            void commitUserState(next, `Filter ${definition.title}`);
        });

        document.body.appendChild(ui.popup);
        render();
        positionPopup(ui.popup, anchor);
        window.requestAnimationFrame(() => ui.search.focus({ preventScroll: true }));
    }

    const onHeaderClick = event => {
        const button = findFilterButton(event.detail?.originalEvent);
        if (!button) {
            return;
        }

        const field = String(
            button.getAttribute("data-erp-filter-prop") ??
            event.detail?.prop ??
            event.detail?.column?.prop ??
            ""
        );
        if (!filterColumns.has(field)) {
            return;
        }

        event.preventDefault();
        event.detail?.originalEvent?.preventDefault?.();
        openPopup(field, button);
    };

    const onDocumentPointerDown = event => {
        if (!popupState) {
            return;
        }
        const path = typeof event.composedPath === "function"
            ? event.composedPath()
            : [];
        if (path.includes(popupState.ui.popup)) {
            return;
        }
        if (path.some(item =>
            item instanceof Element &&
            item.classList.contains(FILTER_BUTTON_CLASS))) {
            return;
        }
        closePopup();
    };

    const onDocumentKeyDown = event => {
        // RevoGrid listens for keyboard input at document level. The filter
        // popup intentionally lives outside the grid, so mark its keyboard
        // events before Revo's overlay proxies see them. We block only Revo's
        // proxy event later; the original KeyboardEvent is left untouched so
        // normal typing, Backspace, arrows, Enter, etc. still work in the popup.
        if (popupState && eventTargetsElement(event, popupState.ui.popup)) {
            ownedKeyboardEvents.add(event);
        }

        if (event.key === "Escape") {
            closePopup();
        }
    };

    // ERP filter semantics are intentionally snapshot-based. Edits, Paste and
    // row Insert/Delete do not re-run the active filter underneath the employee.
    // RevoGrid evaluates current row values only when the employee explicitly
    // applies/clears a filter again (or History replays a filter action).

    addListener(grid, "headerclick", onHeaderClick);
    addListener(grid, "viewportscroll", closePopup);
    addListener(document, "pointerdown", onDocumentPointerDown, true);
    addListener(document, "keydown", onDocumentKeyDown, true);
    addListener(window, "resize", closePopup, { passive: true });

    async function suspendForDatasetSwitch() {
        closePopup();
        // Keep the old year's remembered state, but clear native filter items
        // before Revo receives the next year's source. This prevents one year's
        // filter from being transiently applied to another dataset.
        const remembered = cloneValue(activeState);
        await applyNativeState({}, { remember: false, preserveSelection: false });
        activeState = remembered;
    }

    async function resetDataset(nextRows, nextDatasetKey) {
        rows = Array.isArray(nextRows) ? nextRows : [];
        datasetKey = requireText(nextDatasetKey, "datasetKey");
        const restored = viewStateByDataset.has(datasetKey)
            ? cloneValue(viewStateByDataset.get(datasetKey))
            : {};
        if (!viewStateByDataset.has(datasetKey)) {
            viewStateByDataset.set(datasetKey, {});
        }
        await applyNativeState(restored, { preserveSelection: false });
    }

    async function resumeCurrentDataset() {
        await applyNativeState(activeState);
    }

    function ownsKeyboardEvent(originalEvent) {
        if (!originalEvent) {
            return false;
        }

        // WeakSet keeps ownership true for the whole physical key event even
        // if Escape closes the popup before all Revo overlay proxies run.
        if (ownedKeyboardEvents.has(originalEvent)) {
            return true;
        }

        return Boolean(
            popupState &&
            eventTargetsElement(originalEvent, popupState.ui.popup)
        );
    }

    function replaceRows(nextRows) {
        rows = Array.isArray(nextRows) ? nextRows : [];
    }

    function getState() {
        return {
            datasetKey,
            filterBusy: applying,
            activeFilterCount: Object.keys(activeState).length,
            popupOpen: Boolean(popupState)
        };
    }

    function getFilterState() {
        return cloneValue(activeState);
    }

    function destroy() {
        if (destroyed) {
            return;
        }
        closePopup();
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
        destroyed = true;
    }

    return Object.freeze({
        suspendForDatasetSwitch,
        resetDataset,
        resumeCurrentDataset,
        replaceRows,
        getState,
        getFilterState,
        ownsKeyboardEvent,
        destroy
    });
}

export const revoGridExcelFilterInternals = Object.freeze({
    HISTORY_ADAPTER_KEY,
    NATIVE_FILTER_TYPE,
    BLANK_TOKEN,
    normalizeToken,
    normalizeFilterState,
    statesEqual,
    normalizeFilterViewDelta,
    hasFilterViewDelta,
    parseDateToken,
    buildNativeFilterItems,
    collectSearchMatches,
    replaceSelectionFromSearch,
    setVisibleSelection
});
