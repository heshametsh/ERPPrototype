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
                "basket",
                "status",
                "notes"
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

        buildAggregateItem: function (
            label,
            valueText,
            testId
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
            itemValue.textContent = valueText;
            itemValue.title = valueText;

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
                this.buildAggregateItem(
                    "Open Work Orders",
                    this.formatAggregateCount(
                        snapshot.open.rowCount
                    ),
                    "work-orders-summary-count"
                )
            );

            for (const definition of definitions) {
                const openCents =
                    snapshot.open.amounts[definition.field] ?? 0;

                fragment.appendChild(
                    this.buildAggregateItem(
                        `Open ${definition.label}`,
                        this.formatAmountCents(openCents),
                        `work-orders-summary-${definition.field}`
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

            const definitions =
                this.getAggregateAmountFields(elementId);
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
                    this.buildAggregateItem(
                        "Open Work Orders",
                        "Calculating...",
                        "work-orders-summary-count"
                    )
                );
                overview.dataset.aggregateReady = "false";
            }

            if (selection) {
                selection.hidden = true;
                selection.replaceChildren();
                selection.dataset.aggregateReady = "false";
            }
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
})();
