(function () {
    "use strict";

    const target = window.tabulatorTest;

    if (!target?.registerModule) {
        throw new Error(
            "tabulatorBasketDashboard.js requires tabulatorTest.js first."
        );
    }

    const remainingAmountField = "remainingAmount";

    /*
     * Basket panel width has one runtime owner: this module.
     * Values are visual units so --wo-ui-u can preserve the approved
     * physical size across browser zoom without a second zoom detector.
     */
    const basketPanelDefaultVisualWidth = 184;
    const basketPanelMinVisualWidth = 184;
    const basketPanelMaxVisualWidth = 320;
    const basketPanelMaxWorkspaceRatio = 0.60;
    const basketPanelStorageKey =
        "erp-work-orders-basket-panel-visual-width-v1";

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


        formatBasketSidePanelAmount: function (amountCents) {
            const cents = Number(amountCents) || 0;
            const amount = cents / 100;
            const absolute = Math.abs(amount);

            if (absolute >= 1_000_000_000) {
                return `${(amount / 1_000_000_000).toFixed(2)}B`;
            }

            if (absolute >= 1_000_000) {
                return `${(amount / 1_000_000).toFixed(1)}M`;
            }

            if (absolute >= 1_000) {
                const decimals = absolute >= 100_000 ? 0 : 1;
                return `${(amount / 1_000).toFixed(decimals)}K`;
            }

            return this.formatAmountCents(cents);
        },

        getBasketPanelUiUnit: function (container) {
            /*
             * Do not parse --wo-ui-u text. Its computed custom-property value
             * can still be a clamp(...) expression, so parseFloat would read
             * the leading "1" instead of the browser-resolved CSS length.
             *
             * Prefer the panel's real rendered width divided by the visual
             * width that produced it. That makes the panel and drag preview
             * use the exact same ruler at every browser zoom.
             */
            const renderedWidth = Number(
                container?.getBoundingClientRect?.().width || 0
            );
            const knownVisualWidth = Number(
                container?.dataset?.panelVisualWidth
            );
            const referenceVisualWidth =
                Number.isFinite(knownVisualWidth) && knownVisualWidth > 0
                    ? knownVisualWidth
                    : basketPanelDefaultVisualWidth;
            const inferred = renderedWidth / referenceVisualWidth;

            if (Number.isFinite(inferred) && inferred > 0) {
                return inferred;
            }

            /*
             * Hidden panels have no measurable width. Resolve one visual unit
             * with a short-lived CSS probe instead of introducing a second
             * zoom detector or hard-coded breakpoint table.
             */
            const page = container?.closest(
                ".tabulator-workorders-page"
            );

            if (page) {
                const probe = document.createElement("span");
                probe.setAttribute("aria-hidden", "true");
                probe.style.cssText = [
                    "position:absolute",
                    "visibility:hidden",
                    "pointer-events:none",
                    "width:var(--wo-ui-u)",
                    "height:0",
                    "padding:0",
                    "border:0",
                    "margin:0"
                ].join(";");
                page.appendChild(probe);

                const measured = Number(
                    probe.getBoundingClientRect().width || 0
                );
                probe.remove();

                if (Number.isFinite(measured) && measured > 0) {
                    return measured;
                }
            }

            return 1;
        },

        getBasketPanelWidthBounds: function (container) {
            const workspace = container?.closest(
                ".work-orders-sheet-workspace"
            );
            const unit = this.getBasketPanelUiUnit(container);
            const availableCss = Number(
                workspace?.clientWidth || 0
            );

            if (!(availableCss > 0)) {
                return {
                    unit,
                    minVisual: basketPanelMinVisualWidth,
                    maxVisual: basketPanelMaxVisualWidth
                };
            }

            const availableVisual = availableCss / unit;
            const minVisual = Math.min(
                basketPanelMinVisualWidth,
                availableVisual
            );
            const maxVisual = Math.max(
                minVisual,
                Math.min(
                    basketPanelMaxVisualWidth,
                    availableVisual * basketPanelMaxWorkspaceRatio
                )
            );

            return { unit, minVisual, maxVisual };
        },

        readBasketPanelVisualWidth: function () {
            try {
                const stored = window.localStorage?.getItem(basketPanelStorageKey);
                const value = Number(stored);

                if (stored !== null && Number.isFinite(value)) {
                    return Math.min(
                        basketPanelMaxVisualWidth,
                        Math.max(basketPanelMinVisualWidth, value)
                    );
                }
            } catch {
                // Local storage is optional; use the approved minimum.
            }

            return basketPanelDefaultVisualWidth;
        },

        saveBasketPanelVisualWidth: function (visualWidth) {
            try {
                window.localStorage?.setItem(
                    basketPanelStorageKey,
                    Number(visualWidth).toFixed(1)
                );
            } catch {
                // Private/restricted browser storage must not break the sheet.
            }
        },

        applyBasketPanelVisualWidth: function (
            elementId,
            container,
            requestedVisualWidth,
            persist = false,
            resolvedBounds = null
        ) {
            const state = this.states[elementId];
            const bounds = resolvedBounds
                ?? this.getBasketPanelWidthBounds(container);
            const requested = Number(requestedVisualWidth);
            const fallback = Number.isFinite(
                state?.basketPanelVisualWidth
            )
                ? state.basketPanelVisualWidth
                : this.readBasketPanelVisualWidth();
            const candidate = Number.isFinite(requested)
                ? requested
                : fallback;
            const effective = Math.min(
                bounds.maxVisual,
                Math.max(bounds.minVisual, candidate)
            );
            const widthGrowth = Math.max(
                0,
                effective / basketPanelDefaultVisualWidth - 1
            );
            const contentScale = Math.min(
                1.20,
                1 + widthGrowth * 0.25
            );

            if (state) {
                state.basketPanelVisualWidth = effective;
            }

            container.style.setProperty(
                "--wo-basket-panel-width",
                `calc(${effective.toFixed(2)} * var(--wo-ui-u))`
            );
            container.style.setProperty(
                "--wo-basket-content-scale",
                contentScale.toFixed(4)
            );
            container.dataset.panelVisualWidth =
                effective.toFixed(1);

            const handle = document.getElementById(
                `${elementId}-basket-resize-handle`
            );

            if (handle) {
                handle.setAttribute(
                    "aria-valuemin",
                    String(Math.round(bounds.minVisual))
                );
                handle.setAttribute(
                    "aria-valuemax",
                    String(Math.round(bounds.maxVisual))
                );
                handle.setAttribute(
                    "aria-valuenow",
                    String(Math.round(effective))
                );
            }

            if (persist) {
                this.saveBasketPanelVisualWidth(effective);
            }

            return effective;
        },

        buildBasketPanelResizeHandle: function (
            elementId,
            container
        ) {
            const existing = document.getElementById(
                `${elementId}-basket-resize-handle`
            );

            if (existing) {
                return existing;
            }

            const handle = document.createElement("div");
            handle.id = `${elementId}-basket-resize-handle`;
            handle.className =
                "basket-side-panel-resize-handle";
            handle.dataset.testid =
                "work-orders-basket-resize-handle";
            handle.tabIndex = 0;
            handle.setAttribute("role", "separator");
            handle.setAttribute("aria-orientation", "vertical");
            handle.setAttribute(
                "aria-label",
                "اسحب لتغيير عرض تفاصيل السلال"
            );
            handle.title = "اسحب لتغيير عرض تفاصيل السلال";

            let activePointerId = null;
            let dragStartX = 0;
            let dragStartVisualWidth = basketPanelDefaultVisualWidth;
            let dragUnit = 1;
            let dragBounds = null;
            let dragWorkspace = null;
            let dragPanelRightCss = 0;
            let dragSeparatorHalfCss = 0;
            let pendingVisualWidth = null;
            let previewLine = null;
            let previewFrame = 0;

            const clampPreviewWidth = requested => {
                const bounds = dragBounds
                    ?? this.getBasketPanelWidthBounds(container);
                const numeric = Number(requested);
                const fallback = Number.isFinite(
                    this.states[elementId]?.basketPanelVisualWidth
                )
                    ? this.states[elementId].basketPanelVisualWidth
                    : basketPanelDefaultVisualWidth;
                const candidate = Number.isFinite(numeric)
                    ? numeric
                    : fallback;

                return Math.min(
                    bounds.maxVisual,
                    Math.max(bounds.minVisual, candidate)
                );
            };

            const updatePreviewLine = visualWidth => {
                if (!previewLine || !dragWorkspace) {
                    return;
                }

                const effective = clampPreviewWidth(visualWidth);
                const leftCss = Math.max(
                    0,
                    dragPanelRightCss
                        - effective * dragUnit
                        - dragSeparatorHalfCss
                );

                previewLine.style.transform =
                    `translate3d(${leftCss.toFixed(2)}px, 0, 0)`;
                handle.setAttribute(
                    "aria-valuenow",
                    String(Math.round(effective))
                );
            };

            const schedulePreviewLine = visualWidth => {
                pendingVisualWidth = clampPreviewWidth(visualWidth);

                if (previewFrame) {
                    return;
                }

                previewFrame = window.requestAnimationFrame(() => {
                    previewFrame = 0;
                    updatePreviewLine(pendingVisualWidth);
                });
            };

            const removePreviewLine = () => {
                if (previewFrame) {
                    window.cancelAnimationFrame(previewFrame);
                    previewFrame = 0;
                }

                previewLine?.remove();
                previewLine = null;
                dragWorkspace?.classList.remove(
                    "is-basket-panel-preview-resizing"
                );
            };

            const finishDrag = (event, commit) => {
                if (
                    activePointerId === null ||
                    event.pointerId !== activePointerId
                ) {
                    return;
                }

                const finalVisualWidth = clampPreviewWidth(
                    pendingVisualWidth
                );

                removePreviewLine();

                if (handle.hasPointerCapture?.(event.pointerId)) {
                    handle.releasePointerCapture(event.pointerId);
                }

                activePointerId = null;
                dragBounds = null;
                dragWorkspace = null;
                dragSeparatorHalfCss = 0;
                pendingVisualWidth = null;
                handle.classList.remove("is-resizing");

                if (!commit) {
                    this.applyBasketPanelVisualWidth(
                        elementId,
                        container,
                        this.states[elementId]?.basketPanelVisualWidth
                    );
                    return;
                }

                /*
                 * Commit the real layout once, after the pointer is released.
                 * During drag only the lightweight preview line moves, so the
                 * real Tabulator viewport is not reflowed dozens of times.
                 */
                this.applyBasketPanelVisualWidth(
                    elementId,
                    container,
                    finalVisualWidth,
                    true
                );

                this.scheduleViewportLayoutSync?.(
                    elementId,
                    "basket-side-panel-resized"
                );
            };

            handle.addEventListener("pointerdown", event => {
                if (event.pointerType === "mouse" && event.button !== 0) {
                    return;
                }

                const workspace = container.closest(
                    ".work-orders-sheet-workspace"
                );

                if (!workspace) {
                    return;
                }

                dragBounds = this.getBasketPanelWidthBounds(container);
                const current = clampPreviewWidth(
                    this.states[elementId]?.basketPanelVisualWidth
                        ?? this.readBasketPanelVisualWidth()
                );
                const workspaceRect = workspace.getBoundingClientRect();
                const panelRect = container.getBoundingClientRect();
                const handleRect = handle.getBoundingClientRect();

                activePointerId = event.pointerId;
                dragStartX = event.clientX;
                dragStartVisualWidth = current;
                dragUnit = dragBounds.unit;
                dragWorkspace = workspace;
                dragPanelRightCss = panelRect.right - workspaceRect.left;
                dragSeparatorHalfCss = handleRect.width / 2;
                pendingVisualWidth = current;

                previewLine = document.createElement("div");
                previewLine.className =
                    "basket-side-panel-resize-preview";
                previewLine.setAttribute("aria-hidden", "true");
                workspace.appendChild(previewLine);
                workspace.classList.add(
                    "is-basket-panel-preview-resizing"
                );

                handle.classList.add("is-resizing");
                handle.setPointerCapture?.(event.pointerId);
                updatePreviewLine(current);
                event.preventDefault();
            });

            handle.addEventListener("pointermove", event => {
                if (event.pointerId !== activePointerId) {
                    return;
                }

                const deltaVisual =
                    (dragStartX - event.clientX) / dragUnit;
                schedulePreviewLine(
                    dragStartVisualWidth + deltaVisual
                );
                event.preventDefault();
            });

            handle.addEventListener(
                "pointerup",
                event => finishDrag(event, true)
            );
            handle.addEventListener(
                "pointercancel",
                event => finishDrag(event, false)
            );

            handle.addEventListener("keydown", event => {
                const bounds =
                    this.getBasketPanelWidthBounds(container);
                const current = this.applyBasketPanelVisualWidth(
                    elementId,
                    container,
                    this.states[elementId]?.basketPanelVisualWidth
                );
                let next = null;

                if (event.key === "ArrowLeft") {
                    next = current + 12;
                } else if (event.key === "ArrowRight") {
                    next = current - 12;
                } else if (event.key === "Home") {
                    next = bounds.minVisual;
                } else if (event.key === "End") {
                    next = bounds.maxVisual;
                }

                if (next === null) {
                    return;
                }

                this.applyBasketPanelVisualWidth(
                    elementId,
                    container,
                    next,
                    true
                );
                this.scheduleViewportLayoutSync?.(
                    elementId,
                    "basket-side-panel-keyboard-resized"
                );
                event.preventDefault();
            });

            return handle;
        },

        toggleBasketOverview: function (elementId, trigger) {
            const dashboard = document.getElementById(
                `${elementId}-basket-dashboard`
            );
            const state = this.states[elementId];

            if (!dashboard) {
                return false;
            }

            const expanded = dashboard.hidden;
            dashboard.hidden = !expanded;
            dashboard.setAttribute(
                "aria-hidden",
                String(!expanded)
            );

            const resizeHandle = document.getElementById(
                `${elementId}-basket-resize-handle`
            );

            if (resizeHandle) {
                resizeHandle.hidden = !expanded;
            }

            if (state) {
                state.basketDashboardExpanded = expanded;
            }

            if (trigger) {
                trigger.setAttribute(
                    "aria-expanded",
                    String(expanded)
                );
            }

            this.scheduleViewportLayoutSync?.(
                elementId,
                expanded
                    ? "basket-side-panel-opened"
                    : "basket-side-panel-closed"
            );

            return expanded;
        },

        ensureBasketSidePanelStructure: function (
            elementId,
            container
        ) {
            let panelHeader = container.querySelector(
                ":scope > .basket-side-panel-header"
            );
            let list = container.querySelector(
                ":scope > .basket-side-panel-list"
            );

            if (!panelHeader || !list) {
                panelHeader = document.createElement("header");
                panelHeader.className = "basket-side-panel-header";

                const heading = document.createElement("div");
                heading.className = "basket-side-panel-heading";

                const kicker = document.createElement("span");
                kicker.className = "basket-side-panel-kicker";

                const title = document.createElement("h2");
                title.className = "basket-side-panel-title";
                title.textContent = "تفاصيل السلال";

                heading.append(kicker, title);

                const panelActions = document.createElement("div");
                panelActions.className = "basket-side-panel-actions";

                const closeButton = document.createElement("button");
                closeButton.type = "button";
                closeButton.className = "basket-side-panel-close";
                closeButton.setAttribute(
                    "aria-label",
                    "إغلاق تفاصيل السلال"
                );
                closeButton.textContent = "×";
                closeButton.addEventListener("click", () => {
                    const trigger = document.getElementById(
                        "work-orders-basket-details-trigger"
                    );
                    this.toggleBasketOverview(elementId, trigger);
                });

                panelActions.append(closeButton);
                panelHeader.append(heading, panelActions);

                list = document.createElement("div");
                list.className = "basket-side-panel-list";
                list.setAttribute("role", "list");
                list.setAttribute("aria-label", "السلال النشطة");

                container.replaceChildren(panelHeader, list);
            }

            const resizeHandle = this.buildBasketPanelResizeHandle(
                elementId,
                container
            );

            if (resizeHandle.previousElementSibling !== container) {
                container.after(resizeHandle);
            }

            return {
                panelHeader,
                list,
                resizeHandle,
                kicker: panelHeader.querySelector(
                    ".basket-side-panel-kicker"
                )
            };
        },

        buildBasketSidePanelCard: function (
            entry,
            index,
            totalRemainingAmountCents
        ) {
            const total = Number(totalRemainingAmountCents) || 0;
            const amount = Number(entry?.remainingAmountCents) || 0;
            const rawShare = total > 0
                ? (amount / total) * 100
                : 0;
            const share = Math.max(0, Math.min(100, rawShare));

            const row = document.createElement("article");
            row.className =
                "basket-side-panel-card";
            row.dataset.testid = "work-orders-basket-card";
            row.dataset.basketValue = entry.basket;
            row.dataset.basketIndex = String(index);
            row.setAttribute("role", "listitem");
            row.style.setProperty(
                "--basket-share",
                `${share.toFixed(2)}%`
            );

            const name = document.createElement("div");
            name.className = "basket-side-panel-name";

            const dot = document.createElement("i");
            dot.className = "basket-side-panel-dot";
            dot.setAttribute("aria-hidden", "true");

            const title = document.createElement("strong");
            title.className =
                "basket-side-panel-card-title";
            title.textContent = entry.basket;
            title.title = entry.basket;
            name.append(dot, title);

            const ordersValue = document.createElement("b");
            ordersValue.className =
                "basket-side-panel-count";
            ordersValue.textContent = this.formatAggregateCount(
                entry.rowCount
            );
            ordersValue.dataset.metric = "orders";
            ordersValue.setAttribute(
                "aria-label",
                `Orders: ${ordersValue.textContent}`
            );

            const responsiveMeta = document.createElement("span");
            responsiveMeta.className = "basket-side-panel-meta";

            const remainingValue = document.createElement("strong");
            remainingValue.className =
                "basket-side-panel-amount";
            remainingValue.textContent = this.formatBasketSidePanelAmount(
                entry.remainingAmountCents
            );
            remainingValue.dataset.metric = "remainingAmount";
            const fullRemainingText = this.formatAmountCents(
                entry.remainingAmountCents
            );
            remainingValue.title =
                `Remaining Amount: ${fullRemainingText}`;
            remainingValue.setAttribute(
                "aria-label",
                remainingValue.title
            );

            const remainingLabel = document.createElement("small");
            remainingLabel.className = "basket-side-panel-amount-label";
            remainingLabel.textContent = "متبقي";

            const shareValue = document.createElement("em");
            shareValue.className = "basket-side-panel-share";
            shareValue.textContent = share < 0.1 && share > 0
                ? `${share.toFixed(2)}%`
                : `${share.toFixed(1)}%`;

            responsiveMeta.append(
                remainingValue,
                remainingLabel,
                shareValue
            );

            row.append(name, ordersValue, responsiveMeta);
            return row;
        },

        renderBasketDashboard: function (elementId, snapshot) {
            const container = document.getElementById(
                `${elementId}-basket-dashboard`
            );

            if (!container || !snapshot?.baskets) {
                return;
            }

            const state = this.states[elementId];
            const activeBaskets = snapshot.baskets.filter(
                entry => entry.rowCount > 0
            );
            const totalRemainingAmountCents = activeBaskets.reduce(
                (total, entry) =>
                    total + Number(entry.remainingAmountCents || 0),
                0
            );

            if (
                state &&
                typeof state.basketDashboardExpanded !== "boolean"
            ) {
                state.basketDashboardExpanded = !container.hidden;
            }

            const wasHidden = container.hidden;
            const structure = this.ensureBasketSidePanelStructure(
                elementId,
                container
            );
            const previousScrollTop = structure.list.scrollTop;

            if (structure.kicker) {
                structure.kicker.textContent =
                    `${activeBaskets.length} سلة نشطة من ${snapshot.baskets.length}`;
            }

            const cards = activeBaskets.map((entry, index) =>
                this.buildBasketSidePanelCard(
                    entry,
                    index,
                    totalRemainingAmountCents
                )
            );

            structure.list.replaceChildren(...cards);

            if (previousScrollTop > 0) {
                const maxScrollTop = Math.max(
                    0,
                    structure.list.scrollHeight -
                    structure.list.clientHeight
                );
                structure.list.scrollTop = Math.min(
                    previousScrollTop,
                    maxScrollTop
                );
            }

            const visualWidth = Number.isFinite(
                state?.basketPanelVisualWidth
            )
                ? state.basketPanelVisualWidth
                : this.readBasketPanelVisualWidth();

            this.applyBasketPanelVisualWidth(
                elementId,
                container,
                visualWidth
            );

            const expanded =
                state?.basketDashboardExpanded !== false;
            container.hidden =
                !expanded || activeBaskets.length === 0;
            container.setAttribute(
                "aria-hidden",
                String(container.hidden)
            );
            structure.resizeHandle.hidden = container.hidden;
            container.dataset.dashboardReady = "true";
            container.dataset.dashboardLayout =
                "side-panel-active-baskets";
            container.dataset.dashboardColumns =
                activeBaskets.length > 0 ? "1" : "0";
            container.dataset.dashboardRows = String(
                activeBaskets.length
            );
            container.dataset.activeBasketCount = String(
                activeBaskets.length
            );

            const trigger = document.getElementById(
                "work-orders-basket-details-trigger"
            );
            trigger?.setAttribute(
                "aria-expanded",
                String(!container.hidden)
            );

            /*
             * Only opening/closing the panel changes the grid's available
             * width. Updating Basket cards alone should not force Tabulator
             * to re-measure its viewport.
             */
            if (wasHidden !== container.hidden) {
                this.scheduleViewportLayoutSync?.(
                    elementId,
                    container.hidden
                        ? "basket-side-panel-hidden-after-render"
                        : "basket-side-panel-shown-after-render"
                );
            }
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

            const structure = this.ensureBasketSidePanelStructure(
                elementId,
                container
            );
            const loading = document.createElement("div");
            loading.className = "basket-side-panel-loading";
            loading.textContent = "Calculating Basket totals...";

            structure.list.replaceChildren(loading);
            structure.list.scrollTop = 0;
            container.dataset.dashboardReady = "false";
            container.dataset.dashboardColumns = "0";
            container.dataset.dashboardRows = "0";
            container.dataset.activeBasketCount = "0";
            container.hidden =
                state?.basketDashboardExpanded === false;
            container.setAttribute(
                "aria-hidden",
                String(container.hidden)
            );
            structure.resizeHandle.hidden = container.hidden;

            const trigger = document.getElementById(
                "work-orders-basket-details-trigger"
            );
            trigger?.setAttribute(
                "aria-expanded",
                String(!container.hidden)
            );
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
