(function () {
    "use strict";

    const target = window.tabulatorTest;

    if (!target?.registerModule) {
        throw new Error(
            "tabulatorBasketDashboard.js requires tabulatorTest.js first."
        );
    }

    const remainingAmountField = "remainingAmount";

    target.registerModule("basketDashboard", {
        getBasketDashboardOrder: function (elementId) {
            const values = this.states[elementId]?.basketValues;

            return values instanceof Set
                ? Array.from(values)
                : [];
        },

        createEmptyBasketDashboardSnapshot: function (elementId) {
            return {
                baskets: this.getBasketDashboardOrder(elementId)
                    .map(basket => ({
                        basket: basket,
                        rowCount: 0,
                        remainingAmountCents: 0
                    })),
                reason: "initial"
            };
        },

        getBasketDashboardEntry: function (snapshot, basket) {
            const normalizedBasket = String(basket ?? "").trim();

            return snapshot?.baskets?.find(
                entry => entry.basket === normalizedBasket
            ) ?? null;
        },

        calculateBasketDashboard: function (
            elementId,
            rows,
            reason = "unspecified"
        ) {
            const snapshot =
                this.createEmptyBasketDashboardSnapshot(elementId);
            const entries = new Map(
                snapshot.baskets.map(entry => [entry.basket, entry])
            );

            for (const row of rows ?? []) {
                const data =
                    typeof row?.getData === "function"
                        ? row.getData()
                        : row;

                if (!this.isAggregateWorkOrderRow?.(elementId, data)) {
                    continue;
                }

                const basket = String(data?.basket ?? "").trim();
                const entry = entries.get(basket);

                /*
                 * A new incomplete row has no valid Basket yet, so it does
                 * not belong to a dashboard stage until the employee chooses
                 * one. Persisted work orders always have a valid Basket.
                 */
                if (!entry) {
                    continue;
                }

                const parsed = this.parseAmount?.(
                    data?.[remainingAmountField]
                );

                entry.rowCount++;

                if (
                    parsed?.valid === true &&
                    parsed.empty !== true &&
                    Number.isSafeInteger(parsed.cents)
                ) {
                    entry.remainingAmountCents += parsed.cents;
                }
            }

            snapshot.reason = String(reason ?? "unspecified");
            return snapshot;
        },


        getBasketDashboardColumnCount: function (activeBasketCount) {
            const count = Math.max(0, Number(activeBasketCount) || 0);

            if (count === 0) {
                return 0;
            }

            if (count <= 4) {
                return count;
            }

            if (count <= 8) {
                return 4;
            }

            return Math.min(7, Math.ceil(count / 2));
        },

        buildBasketDashboardCard: function (entry, index) {
            const row = document.createElement("div");
            row.className =
                "work-orders-basket-dashboard-card " +
                "work-orders-basket-dashboard-row";
            row.classList.add(
                entry.rowCount > 0 ? "has-data" : "is-empty"
            );
            row.dataset.testid = "work-orders-basket-card";
            row.dataset.basketValue = entry.basket;
            row.dataset.basketIndex = String(index);
            row.setAttribute("role", "listitem");

            const title = document.createElement("span");
            title.className =
                "work-orders-basket-dashboard-card-title " +
                "work-orders-basket-dashboard-row-title";
            title.textContent = entry.basket;
            title.title = entry.basket;

            const ordersValue = document.createElement("strong");
            ordersValue.className =
                "work-orders-basket-dashboard-row-value " +
                "work-orders-basket-dashboard-row-orders";
            ordersValue.textContent = this.formatAggregateCount(
                entry.rowCount
            );
            ordersValue.dataset.metric = "orders";
            ordersValue.setAttribute(
                "aria-label",
                `Orders: ${ordersValue.textContent}`
            );

            const remainingValue = document.createElement("strong");
            remainingValue.className =
                "work-orders-basket-dashboard-row-value " +
                "work-orders-basket-dashboard-row-remaining";
            remainingValue.textContent = this.formatAmountCents(
                entry.remainingAmountCents
            );
            remainingValue.dataset.metric = "remainingAmount";
            remainingValue.setAttribute(
                "aria-label",
                `Remaining Amount: ${remainingValue.textContent}`
            );

            row.append(title, ordersValue, remainingValue);
            return row;
        },

        buildBasketDashboardColumn: function (
            items,
            columnIndex
        ) {
            const column = document.createElement("section");
            column.className = "work-orders-basket-dashboard-list";
            column.dataset.basketColumn = String(columnIndex);
            column.setAttribute("role", "group");
            column.setAttribute(
                "aria-label",
                `Basket summary group ${columnIndex + 1}`
            );

            const header = document.createElement("div");
            header.className = "work-orders-basket-dashboard-list-header";
            header.setAttribute("aria-hidden", "true");

            const basketHeader = document.createElement("span");
            basketHeader.textContent = "السلة";

            const ordersHeader = document.createElement("span");
            ordersHeader.textContent = "العدد";

            const remainingHeader = document.createElement("span");
            remainingHeader.textContent = "المتبقي";

            header.append(
                basketHeader,
                ordersHeader,
                remainingHeader
            );
            column.appendChild(header);

            items.forEach(item => {
                column.appendChild(
                    this.buildBasketDashboardCard(
                        item.entry,
                        item.index
                    )
                );
            });

            return column;
        },

        splitBasketDashboardEntries: function (entries, columnCount) {
            const safeEntries = Array.isArray(entries) ? entries : [];
            const safeColumnCount = Math.max(
                1,
                Math.min(columnCount, safeEntries.length || 1)
            );
            const groups = Array.from(
                { length: safeColumnCount },
                () => ({ items: [] })
            );

            /*
             * Fill the visual rows from right to left in workflow order.
             * Example with 9 active stages and 5 columns:
             * row 1 = stages 1..5, row 2 = stages 6..9.
             */
            safeEntries.forEach((entry, index) => {
                groups[index % safeColumnCount].items.push({
                    entry: entry,
                    index: index
                });
            });

            return groups;
        },

        renderBasketDashboard: function (elementId, snapshot) {
            const container = document.getElementById(
                `${elementId}-basket-dashboard`
            );

            if (!container || !snapshot?.baskets) {
                return;
            }

            const activeBaskets = snapshot.baskets.filter(
                entry => entry.rowCount > 0
            );

            const accessibleLabel = document.createElement("span");
            accessibleLabel.className =
                "work-orders-basket-dashboard-accessible-label";
            accessibleLabel.textContent = "Remaining Amount";

            const track = document.createElement("div");
            track.className =
                "work-orders-basket-dashboard-track " +
                "work-orders-basket-dashboard-lists";
            track.setAttribute("role", "list");

            /*
             * Empty workflow stages do not consume permanent sheet space.
             * Keep at most two visual rows on a wide desktop and rebalance
             * the columns when a ninth, eleventh, or thirteenth active stage
             * appears. Workflow order is preserved across each visual row.
             */
            const columnCount = this.getBasketDashboardColumnCount(
                activeBaskets.length
            );
            const groups = this.splitBasketDashboardEntries(
                activeBaskets,
                columnCount
            );

            track.style.setProperty(
                "--basket-summary-columns",
                String(groups.length)
            );

            groups.forEach((group, columnIndex) => {
                track.appendChild(
                    this.buildBasketDashboardColumn(
                        group.items,
                        columnIndex
                    )
                );
            });

            container.replaceChildren(accessibleLabel, track);
            container.hidden = activeBaskets.length === 0;
            container.dataset.dashboardReady = "true";
            container.dataset.dashboardLayout =
                "active-baskets-compact-matrix";
            container.dataset.dashboardColumns = String(groups.length);
            container.dataset.dashboardRows = String(
                groups.length > 0
                    ? Math.ceil(activeBaskets.length / groups.length)
                    : 0
            );
            container.dataset.activeBasketCount = String(
                activeBaskets.length
            );

            /*
             * Recalculate the viewport-owned grid shell after the list
             * layout settles so the Selected totals row remains visible.
             */
            this.scheduleViewportLayoutSync?.(
                elementId,
                "basket-dashboard-rendered"
            );
        },

        refreshBasketDashboard: function (
            elementId,
            rows,
            reason = "unspecified"
        ) {
            const state = this.states[elementId];

            if (!state) {
                return null;
            }

            const startedAt = this.getPerformanceTimestamp?.();
            const snapshot = this.calculateBasketDashboard(
                elementId,
                rows,
                reason
            );

            state.basketDashboardSnapshot = snapshot;
            this.renderBasketDashboard(elementId, snapshot);

            if (startedAt !== undefined) {
                this.recordPerformanceStage?.(
                    elementId,
                    "dashboard.refresh-baskets",
                    startedAt,
                    {
                        reason: snapshot.reason,
                        baskets: snapshot.baskets.length,
                        rows: snapshot.baskets.reduce(
                            (total, entry) => total + entry.rowCount,
                            0
                        )
                    }
                );
            }

            return snapshot;
        },

        applyBasketDashboardRowDelta: function (
            elementId,
            beforeState,
            afterState
        ) {
            const state = this.states[elementId];
            const snapshot = state?.basketDashboardSnapshot;

            if (!state || !snapshot?.baskets) {
                return false;
            }

            const nextBaskets = snapshot.baskets.map(entry => ({
                ...entry
            }));
            const entries = new Map(
                nextBaskets.map(entry => [entry.basket, entry])
            );

            const applyState = (rowState, direction) => {
                if (rowState?.included !== true) {
                    return;
                }

                const basket = String(
                    rowState?.basket ?? ""
                ).trim();
                const entry = entries.get(basket);

                if (!entry) {
                    return;
                }

                entry.rowCount += direction;
                entry.remainingAmountCents +=
                    direction *
                    (rowState.amounts?.[remainingAmountField] ?? 0);
            };

            applyState(beforeState, -1);
            applyState(afterState, 1);

            state.basketDashboardSnapshot = {
                baskets: nextBaskets,
                reason: "cell-edit-delta"
            };

            this.renderBasketDashboard(
                elementId,
                state.basketDashboardSnapshot
            );

            return true;
        },

        resetBasketDashboardUi: function (elementId) {
            const container = document.getElementById(
                `${elementId}-basket-dashboard`
            );

            const state = this.states[elementId];

            if (state) {
                state.basketDashboardSnapshot = null;
            }

            if (!container) {
                return;
            }

            const loading = document.createElement("div");
            loading.className = "work-orders-basket-dashboard-loading";
            loading.textContent = "Calculating Basket totals...";

            container.replaceChildren(loading);
            container.dataset.dashboardReady = "false";
        },

        getBasketDashboardSnapshot: function (elementId) {
            const snapshot =
                this.states[elementId]?.basketDashboardSnapshot;

            return snapshot
                ? JSON.parse(JSON.stringify(snapshot))
                : null;
        }
    });
})();
