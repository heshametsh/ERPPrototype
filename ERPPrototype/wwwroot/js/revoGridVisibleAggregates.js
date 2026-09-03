import { parseAmountToCents } from "./workOrderFinancialRules.js?v=20260825-financial-rules-1";

const CORE_MONEY_COLUMNS = Object.freeze([
    { field: "workOrderValue", label: "قيمة الأعمال", custom: false },
    { field: "partialAmount", label: "المبلغ الجزئي", custom: false },
    { field: "remainingAmount", label: "المتبقي", custom: false }
]);

const CORE_CONTENT_FIELDS = Object.freeze([
    "workOrderNumber",
    "workTypeCode",
    "assignmentDate",
    "workOrderValue",
    "partialAmount",
    "basket"
]);

const DATA_HISTORY_ADAPTER = "data-cell-set";
const FILTER_HISTORY_ADAPTER = "work-orders-filter-state";
const ROW_HISTORY_ADAPTER = "work-orders-row-structure";
const COLUMN_HISTORY_ADAPTER = "work-orders-column-workspace";
const AFTER_HISTORY_REPLAY_EVENT = "erpaftersheethistoryreplay";

function text(value) {
    return String(value ?? "").trim();
}

function isBlankValue(value) {
    return value === null ||
        value === undefined ||
        text(value) === "";
}

function normalizeCustomColumn(column) {
    return {
        fieldKey: text(column?.fieldKey ?? column?.FieldKey),
        name: text(column?.name ?? column?.Name),
        dataType: text(column?.dataType ?? column?.DataType ?? "Text"),
        layoutOrder: Number(column?.layoutOrder ?? column?.LayoutOrder ?? 0) || 0
    };
}

function normalizeCustomColumns(columns) {
    return (Array.isArray(columns) ? columns : [])
        .map(normalizeCustomColumn)
        .filter(column => column.fieldKey && column.name)
        .sort((left, right) =>
            left.layoutOrder - right.layoutOrder ||
            left.fieldKey.localeCompare(right.fieldKey));
}

function buildMoneyDefinitions(customColumns) {
    const customMoney = normalizeCustomColumns(customColumns)
        .filter(column =>
            column.dataType.toLowerCase() === "money")
        .map(column => ({
            field: column.fieldKey,
            label: column.name,
            custom: true
        }));

    return [...CORE_MONEY_COLUMNS, ...customMoney];
}

function isPersistedRow(row) {
    const id = Number(row?.id ?? 0);
    return Number.isFinite(id) && id > 0;
}

function isAggregateWorkOrderRow(row, customColumns) {
    if (!row) {
        return false;
    }

    if (isPersistedRow(row)) {
        return true;
    }

    for (const field of CORE_CONTENT_FIELDS) {
        if (!isBlankValue(row?.[field])) {
            return true;
        }
    }

    for (const column of normalizeCustomColumns(customColumns)) {
        if (!isBlankValue(row?.[column.fieldKey])) {
            return true;
        }
    }

    return false;
}

function isCellEditDetail(detail) {
    return Boolean(
        detail &&
        detail.model &&
        typeof detail.prop === "string" &&
        Number.isInteger(detail.rowIndex)
    );
}

function isRangeEditDetail(detail) {
    return Boolean(
        detail &&
        detail.data &&
        typeof detail.data === "object" &&
        detail.models &&
        typeof detail.models === "object"
    );
}

function formatCents(cents) {
    const value = typeof cents === "bigint" ? cents : BigInt(cents ?? 0);
    const negative = value < 0n;
    const absolute = negative ? -value : value;
    const whole = absolute / 100n;
    const fraction = absolute % 100n;
    const wholeText = new Intl.NumberFormat("en-US").format(whole);
    const fractionText = fraction === 0n
        ? ""
        : `.${fraction.toString().padStart(2, "0")}`;

    return `${negative ? "-" : ""}${wholeText}${fractionText}`;
}

function createAmountItem(definition, cents) {
    const item = document.createElement("span");
    item.className = "native-gate5a__aggregate-item";
    item.dataset.aggregateField = definition.field;
    item.dataset.totalCents = cents.toString();

    const label = document.createElement("span");
    label.textContent = definition.label;

    const value = document.createElement("strong");
    value.textContent = formatCents(cents);

    item.append(label, value);
    return item;
}

export function createRevoGridVisibleAggregates(options) {
    const grid = options?.grid;
    const host = options?.host;

    if (!grid || typeof grid.getVisibleSource !== "function") {
        throw new Error("Visible Aggregates require a RevoGrid element.");
    }
    if (!(host instanceof HTMLElement)) {
        throw new Error("Visible Aggregates require a host element.");
    }

    const getCustomColumns = typeof options?.getCustomColumns === "function"
        ? options.getCustomColumns
        : () => options?.customColumns ?? [];

    const hasActiveFilters = typeof options?.hasActiveFilters === "function"
        ? options.hasActiveFilters
        : () => false;

    let destroyed = false;
    let scheduled = false;
    let scheduledReason = "initialize";
    let refreshToken = 0;
    let revision = 0;
    let pendingCell = null;
    let pendingRange = null;
    let lastState = {
        ready: false,
        revision: 0,
        visibleRowCount: 0,
        totals: {},
        reason: "not-ready"
    };

    const removers = [];

    function currentCustomColumns() {
        return normalizeCustomColumns(getCustomColumns());
    }

    function currentMoneyDefinitions() {
        return buildMoneyDefinitions(currentCustomColumns());
    }

    function moneyFieldSet() {
        return new Set(
            currentMoneyDefinitions().map(definition => definition.field)
        );
    }

    function render(state, definitions) {
        if (destroyed) {
            return;
        }

        host.replaceChildren();
        host.dataset.aggregateReady = "true";
        host.dataset.aggregateRevision = String(state.revision);
        host.dataset.visibleRowCount = String(state.visibleRowCount);
        host.dataset.aggregateReason = state.reason;

        const count = document.createElement("span");
        count.className = "native-gate5a__aggregate-item native-gate5a__aggregate-count";
        count.dataset.aggregateKind = "visible-count";

        const countLabel = document.createElement("span");
        countLabel.textContent = "الظاهر";

        const countValue = document.createElement("strong");
        countValue.textContent = new Intl.NumberFormat("en-US")
            .format(state.visibleRowCount);

        const countUnit = document.createElement("span");
        countUnit.textContent = "أمر";

        count.append(countLabel, countValue, countUnit);
        host.append(count);

        const core = definitions.filter(definition => !definition.custom);
        const custom = definitions.filter(definition => definition.custom);

        for (const definition of core) {
            host.append(
                createAmountItem(
                    definition,
                    BigInt(state.totals[definition.field] ?? "0")
                )
            );
        }

        const inlineCustom = custom.slice(0, 2);
        const extraCustom = custom.slice(2);

        for (const definition of inlineCustom) {
            host.append(
                createAmountItem(
                    definition,
                    BigInt(state.totals[definition.field] ?? "0")
                )
            );
        }

        if (extraCustom.length > 0) {
            const details = document.createElement("details");
            details.className = "native-gate5a__aggregate-more";

            const summary = document.createElement("summary");
            summary.textContent = `مبالغ أخرى (${extraCustom.length})`;
            details.append(summary);

            const content = document.createElement("span");
            content.className = "native-gate5a__aggregate-more-content";

            for (const definition of extraCustom) {
                content.append(
                    createAmountItem(
                        definition,
                        BigInt(state.totals[definition.field] ?? "0")
                    )
                );
            }

            details.append(content);
            host.append(details);
        }
    }

    async function refreshVisible(reason = "refresh") {
        if (destroyed) {
            return lastState;
        }

        const token = ++refreshToken;
        const customColumns = currentCustomColumns();
        const definitions = buildMoneyDefinitions(customColumns);
        const rows = await grid.getVisibleSource("rgRow");

        if (destroyed || token !== refreshToken) {
            return lastState;
        }

        const totals = Object.fromEntries(
            definitions.map(definition => [definition.field, 0n])
        );

        let visibleRowCount = 0;

        for (const row of Array.isArray(rows) ? rows : []) {
            if (!isAggregateWorkOrderRow(row, customColumns)) {
                continue;
            }

            visibleRowCount++;

            for (const definition of definitions) {
                const parsed = parseAmountToCents(row?.[definition.field]);

                if (
                    parsed.valid &&
                    !parsed.empty &&
                    Number.isSafeInteger(parsed.cents)
                ) {
                    totals[definition.field] += BigInt(parsed.cents);
                }
            }
        }

        revision++;
        lastState = {
            ready: true,
            revision,
            visibleRowCount,
            totals: Object.fromEntries(
                Object.entries(totals)
                    .map(([field, cents]) => [field, cents.toString()])
            ),
            reason: String(reason || "refresh")
        };

        render(lastState, definitions);
        return lastState;
    }

    function scheduleRefresh(reason = "refresh") {
        if (destroyed) {
            return;
        }

        scheduledReason = String(reason || "refresh");

        if (scheduled) {
            return;
        }

        scheduled = true;
        queueMicrotask(() => {
            scheduled = false;
            void refreshVisible(scheduledReason);
        });
    }

    function captureNewRowInclusion(model) {
        if (isPersistedRow(model)) {
            return null;
        }

        return {
            clientKey: text(model?.clientKey),
            included: isAggregateWorkOrderRow(
                model,
                currentCustomColumns()
            )
        };
    }

    const beforeEdit = event => {
        if (destroyed || !isCellEditDetail(event.detail)) {
            return;
        }

        const detail = event.detail;
        const field = text(detail.prop);
        const newRow = captureNewRowInclusion(detail.model);

        pendingCell = {
            clientKey: text(detail.model?.clientKey),
            field,
            money: moneyFieldSet().has(field),
            newRow
        };
    };

    const beforeRangeEdit = event => {
        if (destroyed || !isRangeEditDetail(event.detail)) {
            return;
        }

        const detail = event.detail;
        const moneyFields = moneyFieldSet();
        const newRows = new Map();
        let money = false;

        for (const [rowIndexText, proposed] of Object.entries(detail.data)) {
            const model =
                detail.models[rowIndexText] ??
                detail.models[Number(rowIndexText)];

            if (!model) {
                continue;
            }

            for (const field of Object.keys(proposed ?? {})) {
                if (moneyFields.has(field)) {
                    money = true;
                }
            }

            const newRow = captureNewRowInclusion(model);
            if (newRow?.clientKey) {
                newRows.set(newRow.clientKey, newRow.included);
            }
        }

        pendingRange = { money, newRows };
    };

    const afterEdit = event => {
        if (destroyed) {
            return;
        }

        if (isCellEditDetail(event.detail)) {
            const capture = pendingCell;
            pendingCell = null;

            if (!capture) {
                return;
            }

            if (capture.money) {
                scheduleRefresh("money-edit");
                return;
            }

            // When a Filter is active, an ordinary text/date edit can change
            // whether the row belongs to the employee's current visible view.
            // Re-read Revo's actual visible source; do not invent a second
            // Filter engine inside Aggregates.
            if (hasActiveFilters()) {
                scheduleRefresh("filtered-edit");
                return;
            }

            if (capture.newRow?.clientKey) {
                const included = isAggregateWorkOrderRow(
                    event.detail.model,
                    currentCustomColumns()
                );

                if (included !== capture.newRow.included) {
                    scheduleRefresh("new-row-inclusion");
                }
            }

            return;
        }

        if (!isRangeEditDetail(event.detail)) {
            return;
        }

        const capture = pendingRange;
        pendingRange = null;

        if (!capture) {
            return;
        }

        if (capture.money) {
            scheduleRefresh("money-range-edit");
            return;
        }

        if (hasActiveFilters()) {
            scheduleRefresh("filtered-range-edit");
            return;
        }

        if (capture.newRows.size === 0) {
            return;
        }

        for (const model of Object.values(event.detail.models ?? {})) {
            const key = text(model?.clientKey);
            if (!capture.newRows.has(key)) {
                continue;
            }

            const included = isAggregateWorkOrderRow(
                model,
                currentCustomColumns()
            );

            if (included !== capture.newRows.get(key)) {
                scheduleRefresh("new-row-inclusion");
                return;
            }
        }
    };

    const afterHistoryReplay = event => {
        if (destroyed) {
            return;
        }

        const entry = event.detail?.entry;
        const adapterKey = text(entry?.adapterKey);

        if (
            adapterKey === FILTER_HISTORY_ADAPTER ||
            adapterKey === ROW_HISTORY_ADAPTER ||
            adapterKey === COLUMN_HISTORY_ADAPTER
        ) {
            scheduleRefresh(`history-${entry?.kind ?? adapterKey}`);
            return;
        }

        if (adapterKey !== DATA_HISTORY_ADAPTER) {
            return;
        }

        const operations = Array.isArray(entry?.payload?.operations)
            ? entry.payload.operations
            : [];

        const moneyFields = moneyFieldSet();

        if (operations.some(operation =>
            moneyFields.has(text(operation?.field)))) {
            scheduleRefresh("history-money");
            return;
        }

        if (hasActiveFilters()) {
            scheduleRefresh("history-filtered-edit");
            return;
        }

        const clientKeys = new Set(
            operations
                .map(operation => text(operation?.clientKey))
                .filter(Boolean)
        );

        if (clientKeys.size === 0) {
            return;
        }

        void grid.getSource("rgRow").then(source => {
            if (destroyed) {
                return;
            }

            const hasNewTarget = (Array.isArray(source) ? source : [])
                .some(row =>
                    clientKeys.has(text(row?.clientKey)) &&
                    !isPersistedRow(row));

            if (hasNewTarget) {
                scheduleRefresh("history-new-row");
            }
        });
    };

    grid.addEventListener("beforeedit", beforeEdit);
    grid.addEventListener("beforerangeedit", beforeRangeEdit);
    grid.addEventListener("afteredit", afterEdit);
    grid.addEventListener(AFTER_HISTORY_REPLAY_EVENT, afterHistoryReplay);

    removers.push(
        () => grid.removeEventListener("beforeedit", beforeEdit),
        () => grid.removeEventListener("beforerangeedit", beforeRangeEdit),
        () => grid.removeEventListener("afteredit", afterEdit),
        () => grid.removeEventListener(
            AFTER_HISTORY_REPLAY_EVENT,
            afterHistoryReplay
        )
    );

    function getState() {
        return {
            ...lastState,
            totals: { ...lastState.totals }
        };
    }

    function destroy() {
        if (destroyed) {
            return;
        }

        destroyed = true;
        refreshToken++;

        for (const remove of removers.splice(0)) {
            try {
                remove();
            } catch {
            }
        }
    }

    void refreshVisible("initialize");

    return Object.freeze({
        refreshVisible,
        scheduleRefresh,
        getState,
        destroy
    });
}
