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

        buildBasketDashboardCard: function (entry, index) {
            const card = document.createElement("article");
            card.className = "work-orders-basket-dashboard-card";
            card.classList.add(
                entry.rowCount > 0 ? "has-data" : "is-empty"
            );
            card.dataset.testid = "work-orders-basket-card";
            card.dataset.basketValue = entry.basket;
            card.dataset.basketIndex = String(index);
            card.setAttribute("role", "listitem");

            const title = document.createElement("h3");
            title.className = "work-orders-basket-dashboard-card-title";
            title.textContent = entry.basket;
            title.title = entry.basket;

            const metrics = document.createElement("div");
            metrics.className = "work-orders-basket-dashboard-metrics";

            const orders = document.createElement("div");
            orders.className = "work-orders-basket-dashboard-metric";

            const ordersLabel = document.createElement("span");
            ordersLabel.textContent = "Orders";

            const ordersValue = document.createElement("strong");
            ordersValue.textContent = this.formatAggregateCount(
                entry.rowCount
            );
            ordersValue.dataset.metric = "orders";

            orders.append(ordersLabel, ordersValue);

            const remaining = document.createElement("div");
            remaining.className = "work-orders-basket-dashboard-metric";

            const remainingLabel = document.createElement("span");
            remainingLabel.textContent = "Remaining Amount";

            const remainingValue = document.createElement("strong");
            remainingValue.textContent = this.formatAmountCents(
                entry.remainingAmountCents
            );
            remainingValue.dataset.metric = "remainingAmount";

            remaining.append(remainingLabel, remainingValue);
            metrics.append(orders, remaining);
            card.append(title, metrics);

            return card;
        },

        renderBasketDashboard: function (elementId, snapshot) {
            const container = document.getElementById(
                `${elementId}-basket-dashboard`
            );

            if (!container || !snapshot?.baskets) {
                return;
            }

            const track = document.createElement("div");
            track.className = "work-orders-basket-dashboard-track";
            track.setAttribute("role", "list");

            snapshot.baskets.forEach((entry, index) => {
                track.appendChild(
                    this.buildBasketDashboardCard(entry, index)
                );
            });

            container.replaceChildren(track);
            container.dataset.dashboardReady = "true";
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
