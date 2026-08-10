(function () {
    "use strict";

    const target = window.tabulatorTest;

    if (!target?.registerModule) {
        throw new Error(
            "tabulatorAggregates.js requires tabulatorTest.js first."
        );
    }

    const coreAmountFields = Object.freeze([
        {
            field: "workOrderValue",
            label: "Work Order Value"
        },
        {
            field: "partialAmount",
            label: "Partial Amount"
        },
        {
            field: "remainingAmount",
            label: "Remaining Amount"
        }
    ]);

    function syncApplicationLayout() {
        const controller = window.erpAppLayout;

        if (!controller?.sync || !controller?.isSplit) {
            throw new Error(
                "tabulatorAggregates.js requires appLayout.js first."
            );
        }

        controller.sync();
        return controller;
    }

    function compactKpiAmountText(valueText) {
        const numeric = Number(
            String(valueText ?? "").replace(/,/g, "")
        );

        if (!Number.isFinite(numeric)) {
            return String(valueText ?? "");
        }

        const absolute = Math.abs(numeric);

        if (absolute >= 1_000_000_000) {
            return `${(numeric / 1_000_000_000).toFixed(2)}B`;
        }

        if (absolute >= 1_000_000) {
            const decimals = absolute >= 100_000_000 ? 1 : 2;
            return `${(numeric / 1_000_000).toFixed(decimals)}M`;
        }

        return String(valueText ?? "");
    }

    target.registerModule("aggregates", {
        getAggregateAmountFields: function (elementId) {
            const state = this.states[elementId];
            const customFields = Array.isArray(
                state?.customAmountAggregateFields
            )
                ? state.customAmountAggregateFields
                : [];

            const combined = [
                ...coreAmountFields,
                ...customFields
            ];

            const seen = new Set();

            return combined.filter(definition => {
                const field = String(
                    definition?.field ?? ""
                ).trim();

                if (!field || seen.has(field)) {
                    return false;
                }

                seen.add(field);
                return true;
            });
        },

        createEmptyAggregateTotals: function (elementId) {
            const amounts = {};

            for (const definition of
                this.getAggregateAmountFields(elementId)) {
                amounts[definition.field] = 0;
            }

            return {
                rowCount: 0,
                amounts: amounts
            };
        },

        isAggregateWorkOrderRow: function (elementId, rowData) {
            if (!rowData) {
                return false;
            }

            const state = this.states[elementId];
            const rowKey = String(rowData.id ?? "");

            /*
             * A persisted record remains a work order while the user is
             * editing it, even if its required cells are temporarily cleared.
             * Only completely blank newly inserted rows are excluded.
             */
            if (rowKey && state?.originalRows?.has(rowKey)) {
                return true;
            }

            if (typeof this.isCompletelyBlankRowData === "function") {
                return !this.isCompletelyBlankRowData(rowData);
            }

            const fallbackContentFields = [
                "workOrderNumber",
                "workTypeCode",
                "assignmentDate",
                "workOrderValue",
                "partialAmount",
                "basket"
            ];

            return fallbackContentFields.some(field =>
                String(rowData[field] ?? "").trim() !== ""
            );
        },

        isOpenAggregateWorkOrderRow: function (
            elementId,
            rowData
        ) {
            if (!this.isAggregateWorkOrderRow(elementId, rowData)) {
                return false;
            }

            const completedBasket = String(
                this.states[elementId]?.completedBasket ?? ""
            ).trim();

            if (!completedBasket) {
                return true;
            }

            return String(rowData?.basket ?? "").trim() !==
                completedBasket;
        },

        calculateOpenAggregateTotals: function (
            elementId,
            rows
        ) {
            const totals =
                this.createEmptyAggregateTotals(elementId);
            const definitions =
                this.getAggregateAmountFields(elementId);

            for (const row of rows ?? []) {
                const data =
                    typeof row?.getData === "function"
                        ? row.getData()
                        : row;

                if (!this.isOpenAggregateWorkOrderRow(
                    elementId,
                    data
                )) {
                    continue;
                }

                totals.rowCount++;

                for (const definition of definitions) {
                    const parsed = this.parseAmount(
                        data[definition.field]
                    );

                    if (
                        parsed.valid &&
                        !parsed.empty &&
                        Number.isSafeInteger(parsed.cents)
                    ) {
                        totals.amounts[definition.field] +=
                            parsed.cents;
                    }
                }
            }

            return totals;
        },

        doesFieldAffectAggregates: function (field) {
            const definition = this.getFieldDefinition?.(field);

            return Boolean(
                this.isFinancialField?.(field) ||
                definition?.countsAsContent === true
            );
        },

        calculateAggregateTotals: function (
            elementId,
            rows
        ) {
            const totals =
                this.createEmptyAggregateTotals(elementId);
            const definitions =
                this.getAggregateAmountFields(elementId);

            for (const row of rows ?? []) {
                const data =
                    typeof row?.getData === "function"
                        ? row.getData()
                        : row;

                if (!this.isAggregateWorkOrderRow(elementId, data)) {
                    continue;
                }

                totals.rowCount++;

                for (const definition of definitions) {
                    const parsed = this.parseAmount(
                        data[definition.field]
                    );

                    if (
                        parsed.valid &&
                        !parsed.empty &&
                        Number.isSafeInteger(parsed.cents)
                    ) {
                        totals.amounts[definition.field] +=
                            parsed.cents;
                    }
                }
            }

            return totals;
        },

        captureAggregateRowAmounts: function (elementId, rowData) {
            const amounts = {};

            for (const definition of
                this.getAggregateAmountFields(elementId)) {
                const parsed = this.parseAmount(
                    rowData?.[definition.field]
                );

                amounts[definition.field] =
                    parsed.valid &&
                    !parsed.empty &&
                    Number.isSafeInteger(parsed.cents)
                        ? parsed.cents
                        : 0;
            }

            return amounts;
        },

        captureAggregateRowState: function (elementId, rowData) {
            return {
                included: this.isAggregateWorkOrderRow(
                    elementId,
                    rowData
                ),
                openIncluded: this.isOpenAggregateWorkOrderRow(
                    elementId,
                    rowData
                ),
                basket: String(rowData?.basket ?? "").trim(),
                amounts: this.captureAggregateRowAmounts(
                    elementId,
                    rowData
                )
            };
        },

        hasActiveAggregateFilter: function (elementId) {
            const filters =
                this.states[elementId]?.externalFilters;

            return Boolean(
                String(filters?.workOrderNumber ?? "").trim() ||
                (filters?.workTypeCodes ?? []).length ||
                (filters?.assignmentDates ?? []).length ||
                (filters?.basketValues ?? []).length
            );
        },

        applyAggregateRowDelta: function (
            elementId,
            rowId,
            beforeState
        ) {
            const table = this.tables[elementId];
            const state = this.states[elementId];
            const snapshot = state?.aggregateSnapshot;
            const row = table?.getRow(rowId);

            if (
                !table ||
                !state ||
                !snapshot ||
                !row ||
                !beforeState ||
                this.hasActiveAggregateFilter(elementId)
            ) {
                this.scheduleAggregateRefresh(
                    elementId,
                    "cell-edit-fallback"
                );
                return false;
            }

            const afterState =
                this.captureAggregateRowState(
                    elementId,
                    row.getData()
                );

            this.applyBasketDashboardRowDelta?.(
                elementId,
                beforeState,
                afterState
            );

            const definitions =
                this.getAggregateAmountFields(elementId);
            const beforeIncluded = beforeState.included === true;
            const afterIncluded = afterState.included === true;
            const beforeOpenIncluded =
                beforeState.openIncluded === true;
            const afterOpenIncluded =
                afterState.openIncluded === true;
            const rowCountDifference =
                Number(afterIncluded) - Number(beforeIncluded);
            const openRowCountDifference =
                Number(afterOpenIncluded) -
                Number(beforeOpenIncluded);
            const openSnapshot =
                snapshot.open ??
                this.createEmptyAggregateTotals(elementId);
            const nextYearAmounts = {
                ...snapshot.year.amounts
            };
            const nextVisibleAmounts = {
                ...snapshot.visible.amounts
            };
            const nextOpenAmounts = {
                ...openSnapshot.amounts
            };
            let hasAmountDifference = false;
            let hasOpenAmountDifference = false;

            for (const definition of definitions) {
                const field = definition.field;
                const beforeAmount = beforeIncluded
                    ? beforeState.amounts?.[field] ?? 0
                    : 0;
                const afterAmount = afterIncluded
                    ? afterState.amounts?.[field] ?? 0
                    : 0;
                const difference = afterAmount - beforeAmount;
                const beforeOpenAmount = beforeOpenIncluded
                    ? beforeState.amounts?.[field] ?? 0
                    : 0;
                const afterOpenAmount = afterOpenIncluded
                    ? afterState.amounts?.[field] ?? 0
                    : 0;
                const openDifference =
                    afterOpenAmount - beforeOpenAmount;

                if (difference !== 0) {
                    hasAmountDifference = true;
                }

                if (openDifference !== 0) {
                    hasOpenAmountDifference = true;
                }

                nextYearAmounts[field] =
                    (nextYearAmounts[field] ?? 0) + difference;
                nextVisibleAmounts[field] =
                    (nextVisibleAmounts[field] ?? 0) + difference;
                nextOpenAmounts[field] =
                    (nextOpenAmounts[field] ?? 0) + openDifference;
            }

            if (
                rowCountDifference === 0 &&
                openRowCountDifference === 0 &&
                !hasAmountDifference &&
                !hasOpenAmountDifference
            ) {
                return true;
            }

            state.aggregateSnapshot = {
                ...snapshot,
                year: {
                    rowCount:
                        snapshot.year.rowCount + rowCountDifference,
                    amounts: nextYearAmounts
                },
                visible: {
                    rowCount:
                        snapshot.visible.rowCount + rowCountDifference,
                    amounts: nextVisibleAmounts
                },
                open: {
                    rowCount:
                        openSnapshot.rowCount +
                        openRowCountDifference,
                    amounts: nextOpenAmounts
                },
                reason: "cell-edit-delta"
            };

            this.renderAggregateOverview(
                elementId,
                state.aggregateSnapshot
            );
            this.scheduleSelectionAggregateRefresh(
                elementId,
                "cell-edit-delta"
            );

            return true;
        },

        formatAggregateCount: function (value) {
            return Math.max(0, Number(value) || 0)
                .toLocaleString("en-US");
        },

        buildOverviewAggregateItem: function (
            label,
            valueText,
            testId,
            variant,
            compactInSplit = false
        ) {
            const item = document.createElement("article");
            item.className = `kpi-card kpi-card-${variant}`;

            if (testId) {
                item.dataset.testid = testId;
            }

            const metricIcon = document.createElement("div");
            metricIcon.className = "metric-icon";
            metricIcon.setAttribute("aria-hidden", "true");

            const svg = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "svg"
            );
            svg.setAttribute("viewBox", "0 0 24 24");

            const iconMarkup = {
                one: '<rect x="5" y="5" width="14" height="16" rx="2"></rect><path d="M9 5V3h6v2M8 10h8M8 14h8M8 18h5"></path>',
                two: '<ellipse cx="12" cy="6" rx="7" ry="3"></ellipse><path d="M5 6v4c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 10v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4M5 14v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4"></path>',
                three: '<path d="M4 7h14a2 2 0 0 1 2 2v10H6a2 2 0 0 1-2-2zM4 7l2-3h10l2 3"></path><path d="M15 12h7v4h-7a2 2 0 0 1 0-4z"></path>',
                four: '<rect x="5" y="3" width="14" height="18" rx="2"></rect><path d="M8 7h8M8 11h2M12 11h2M16 11h.1M8 15h2M12 15h2M16 15h.1M8 18h2M12 18h2M16 18h.1"></path>'
            }[variant] ?? "";

            svg.innerHTML = iconMarkup;
            metricIcon.appendChild(svg);

            const copy = document.createElement("div");

            const itemLabel = document.createElement("span");
            itemLabel.textContent = label;
            itemLabel.title = label;

            const itemValue = document.createElement("strong");
            const fullValueText = String(valueText ?? "");

            const isSplit = syncApplicationLayout().isSplit();

            itemValue.textContent =
                compactInSplit && isSplit
                    ? compactKpiAmountText(fullValueText)
                    : fullValueText;
            itemValue.title = fullValueText;

            if (compactInSplit) {
                itemValue.dataset.fullValue = fullValueText;
            }

            const underline = document.createElement("i");
            underline.setAttribute("aria-hidden", "true");

            copy.append(itemLabel, itemValue, underline);
            item.append(metricIcon, copy);
            return item;
        },

        buildAggregateItem: function (
            label,
            valueText,
            testId,
            compactInSplit = false
        ) {
            const item = document.createElement("div");
            item.className = "work-orders-summary-item";

            if (testId) {
                item.dataset.testid = testId;
            }

            const itemLabel = document.createElement("span");
            itemLabel.className = "work-orders-summary-label";
            itemLabel.textContent = label;
            itemLabel.title = label;

            const itemValue = document.createElement("strong");
            itemValue.className = "work-orders-summary-value";

            const fullValueText = String(valueText ?? "");
            const isSplit = syncApplicationLayout().isSplit();

            itemValue.textContent =
                compactInSplit && isSplit
                    ? compactKpiAmountText(fullValueText)
                    : fullValueText;
            itemValue.title = fullValueText;

            if (compactInSplit) {
                itemValue.dataset.fullValue = fullValueText;
            }

            item.append(itemLabel, itemValue);
            return item;
        },

        renderAggregateOverview: function (
            elementId,
            snapshot
        ) {
            const container = document.getElementById(
                `${elementId}-summary-overview`
            );

            if (!container || !snapshot?.open) {
                return;
            }

            const definitions = coreAmountFields;
            const fragment = document.createDocumentFragment();

            fragment.appendChild(
                this.buildOverviewAggregateItem(
                    "Open Work Orders",
                    this.formatAggregateCount(
                        snapshot.open.rowCount
                    ),
                    "work-orders-summary-count",
                    "one"
                )
            );

            const variants = ["two", "three", "four"];

            for (let index = 0; index < definitions.length; index++) {
                const definition = definitions[index];
                const openCents =
                    snapshot.open.amounts[definition.field] ?? 0;

                fragment.appendChild(
                    this.buildOverviewAggregateItem(
                        definition.label,
                        this.formatAmountCents(openCents),
                        `work-orders-summary-${definition.field}`,
                        variants[index] ?? "two",
                        true
                    )
                );
            }

            container.replaceChildren(fragment);
            container.dataset.aggregateReady = "true";
        },

        renderSelectionAggregate: function (
            elementId,
            selection
        ) {
            const container = document.getElementById(
                `${elementId}-summary-selection`
            );

            if (!container) {
                return;
            }

            if (!selection || selection.rowCount === 0) {
                container.hidden = true;
                container.replaceChildren();
                return;
            }

            const table = this.tables[elementId];
            const definitions =
                this.getAggregateAmountFields(elementId)
                    .filter(definition =>
                        table?.getColumn?.(definition.field)
                            ?.isVisible?.() !== false
                    );
            const fragment = document.createDocumentFragment();

            fragment.appendChild(
                this.buildAggregateItem(
                    "Selected Work Orders",
                    this.formatAggregateCount(selection.rowCount),
                    "work-orders-selection-count"
                )
            );

            for (const definition of definitions) {
                fragment.appendChild(
                    this.buildAggregateItem(
                        `Selected ${definition.label}`,
                        this.formatAmountCents(
                            selection.amounts[definition.field] ?? 0
                        ),
                        `work-orders-selection-${definition.field}`
                    )
                );
            }

            container.replaceChildren(fragment);
            container.hidden = false;
            container.dataset.aggregateReady = "true";
        },

        refreshAggregateOverview: function (
            elementId,
            reason = "unspecified"
        ) {
            const table = this.tables[elementId];
            const state = this.states[elementId];

            if (!table || !state) {
                return null;
            }

            const startedAt = this.getPerformanceTimestamp();
            const yearRows = table.getData();
            const yearTotals = this.calculateAggregateTotals(
                elementId,
                yearRows
            );
            const openTotals = this.calculateOpenAggregateTotals(
                elementId,
                yearRows
            );
            const hasActiveFilter =
                this.hasActiveAggregateFilter(elementId);
            const visibleRows = hasActiveFilter
                ? table.getData("active")
                : yearRows;
            const visibleTotals = hasActiveFilter
                ? this.calculateAggregateTotals(
                    elementId,
                    visibleRows
                )
                : {
                    rowCount: yearTotals.rowCount,
                    amounts: { ...yearTotals.amounts }
                };
            const snapshot = {
                year: yearTotals,
                visible: visibleTotals,
                open: openTotals,
                selection:
                    state.aggregateSnapshot?.selection ??
                    this.createEmptyAggregateTotals(elementId),
                reason: String(reason ?? "unspecified")
            };

            state.aggregateSnapshot = snapshot;
            this.renderAggregateOverview(
                elementId,
                snapshot
            );
            this.refreshBasketDashboard?.(
                elementId,
                yearRows,
                snapshot.reason
            );

            this.recordPerformanceStage?.(
                elementId,
                "aggregates.refresh-overview",
                startedAt,
                {
                    reason: snapshot.reason,
                    yearRows: snapshot.year.rowCount,
                    visibleRows: snapshot.visible.rowCount,
                    openRows: snapshot.open.rowCount
                }
            );

            return snapshot;
        },

        refreshVisibleAggregateOverview: function (
            elementId,
            reason = "filter"
        ) {
            const table = this.tables[elementId];
            const state = this.states[elementId];
            const snapshot = state?.aggregateSnapshot;

            if (!table || !state || !snapshot) {
                return this.refreshAggregateOverview(
                    elementId,
                    reason
                );
            }

            const visible = this.calculateAggregateTotals(
                elementId,
                table.getData("active")
            );

            state.aggregateSnapshot = {
                ...snapshot,
                visible: visible,
                reason: String(reason ?? "filter")
            };

            this.renderAggregateOverview(
                elementId,
                state.aggregateSnapshot
            );

            return state.aggregateSnapshot;
        },

        refreshSelectionAggregate: function (
            elementId,
            reason = "selection"
        ) {
            const table = this.tables[elementId];
            const state = this.states[elementId];

            if (!table || !state) {
                return null;
            }

            const range = this.getActiveRange(table);

            /*
             * Tabulator 6.5 creates an uninitialized placeholder range
             * after the final real range is removed. Its default bounds
             * point at the first row even though the user has no selection.
             */
            const hasRealSelection =
                range?._range?.initialized === true;

            const uniqueRows = new Map();

            for (
                const row of hasRealSelection
                    ? range.getRows()
                    : []
            ) {
                uniqueRows.set(
                    String(row.getIndex()),
                    row
                );
            }

            const selection = this.calculateAggregateTotals(
                elementId,
                uniqueRows.values()
            );

            const currentSnapshot =
                state.aggregateSnapshot ?? {
                    year: this.createEmptyAggregateTotals(elementId),
                    visible: this.createEmptyAggregateTotals(elementId),
                    open: this.createEmptyAggregateTotals(elementId),
                    selection: this.createEmptyAggregateTotals(elementId),
                    reason: "initial"
                };

            state.aggregateSnapshot = {
                ...currentSnapshot,
                selection: selection,
                selectionReason: String(reason ?? "selection")
            };

            this.renderSelectionAggregate(
                elementId,
                selection
            );

            return selection;
        },

        scheduleAggregateRefresh: function (
            elementId,
            reason = "unspecified",
            scope = "full"
        ) {
            const state = this.states[elementId];

            if (!state) {
                return false;
            }

            state.aggregateRefreshReason = String(
                reason ?? "unspecified"
            );
            state.aggregateRefreshScope =
                state.aggregateRefreshScope === "full" ||
                scope !== "visible"
                    ? "full"
                    : "visible";

            if (state.aggregateRefreshFrame !== null) {
                return true;
            }

            state.aggregateRefreshFrame =
                window.requestAnimationFrame(() => {
                    const currentState =
                        this.states[elementId];

                    if (!currentState) {
                        return;
                    }

                    currentState.aggregateRefreshFrame = null;
                    const latestReason =
                        currentState.aggregateRefreshReason;
                    const latestScope =
                        currentState.aggregateRefreshScope;
                    currentState.aggregateRefreshReason = "";
                    currentState.aggregateRefreshScope = "visible";

                    if (latestScope === "visible") {
                        this.refreshVisibleAggregateOverview(
                            elementId,
                            latestReason
                        );
                    } else {
                        this.refreshAggregateOverview(
                            elementId,
                            latestReason
                        );
                    }
                    this.scheduleSelectionAggregateRefresh(
                        elementId,
                        "overview-refresh"
                    );
                });

            return true;
        },

        scheduleSelectionAggregateRefresh: function (
            elementId,
            reason = "selection"
        ) {
            const state = this.states[elementId];

            if (!state) {
                return false;
            }

            state.selectionAggregateRefreshReason = String(
                reason ?? "selection"
            );

            if (state.selectionAggregateRefreshFrame !== null) {
                return true;
            }

            state.selectionAggregateRefreshFrame =
                window.requestAnimationFrame(() => {
                    const currentState =
                        this.states[elementId];

                    if (!currentState) {
                        return;
                    }

                    currentState.selectionAggregateRefreshFrame = null;
                    const latestReason =
                        currentState.selectionAggregateRefreshReason;
                    currentState.selectionAggregateRefreshReason = "";

                    this.refreshSelectionAggregate(
                        elementId,
                        latestReason
                    );
                });

            return true;
        },

        initializeAggregates: function (elementId) {
            const state = this.states[elementId];

            if (!state) {
                return;
            }

            syncApplicationLayout();
            state.aggregateSnapshot = null;
            this.scheduleAggregateRefresh(
                elementId,
                "table-built"
            );
        },

        resetAggregatesUi: function (elementId) {
            const overview = document.getElementById(
                `${elementId}-summary-overview`
            );
            const selection = document.getElementById(
                `${elementId}-summary-selection`
            );

            if (overview) {
                overview.replaceChildren(
                    this.buildOverviewAggregateItem(
                        "Open Work Orders",
                        "Calculating...",
                        "work-orders-summary-count",
                        "one"
                    )
                );
                overview.dataset.aggregateReady = "false";
            }

            if (selection) {
                selection.hidden = true;
                selection.replaceChildren();
                selection.dataset.aggregateReady = "false";
            }

            this.resetBasketDashboardUi?.(elementId);
        },

        getAggregateSnapshot: function (elementId) {
            const snapshot =
                this.states[elementId]?.aggregateSnapshot;

            if (!snapshot) {
                return null;
            }

            return JSON.parse(JSON.stringify(snapshot));
        }
    });

    window.addEventListener(
        "erp:layoutchange",
        function (event) {
            if (event?.detail?.mode === event?.detail?.previousMode) {
                return;
            }

            for (const [elementId, state] of
                Object.entries(target.states ?? {})) {
                if (!state?.aggregateSnapshot?.open) {
                    continue;
                }

                if (!document.getElementById(
                    `${elementId}-summary-overview`
                )) {
                    continue;
                }

                target.renderAggregateOverview?.(
                    elementId,
                    state.aggregateSnapshot
                );
            }
        }
    );
})();
