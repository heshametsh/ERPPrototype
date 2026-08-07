(function () {
    "use strict";

    const target = window.tabulatorTest;

    if (!target?.registerModule) {
        throw new Error(
            "tabulatorLifecycle.js requires tabulatorTest.js first."
        );
    }

    target.registerModule("lifecycle", {
        /*
         * نعتمد على نوع جهاز الإدخال بدل عرض النافذة.
         * تصغير نافذة الكمبيوتر لا يحول الصفحة إلى وضع الموبايل،
         * بينما الهاتف/التابلت يظل له التمرير الطبيعي.
         */
        usesDesktopPointer: function () {
            return window.matchMedia(
                "(hover: hover) and (pointer: fine)"
            ).matches;
        },

        /*
         * صفحة أوامر العمل تستخدم شريط تمرير واحد فقط: شريط الجدول.
         * نحسب ارتفاعًا رقميًا ثابتًا من المساحة المتاحة في الشاشة،
         * بدل height: 100% الذي كان يسبب إعادة رسم محرر الخلية.
         */
        calculateViewportTableHeight: function (element) {
            const minimumTableHeight = 320;
            const reservedFooterHeight = 50;
            const shellGap = 6;
            const cardChrome = 2;
            const bottomGap = 10;
            const viewportHeight =
                window.visualViewport?.height || window.innerHeight;
            const shell = document.getElementById(
                `${element.id}-shell`
            );
            const selectionSummaryHost = document.getElementById(
                `${element.id}-summary-host`
            );
            const shellTop =
                shell?.getBoundingClientRect().top ??
                element.getBoundingClientRect().top;
            const measuredFooterHeight =
                selectionSummaryHost?.getBoundingClientRect().height ?? 0;
            const footerHeight = Math.max(
                reservedFooterHeight,
                Math.ceil(measuredFooterHeight)
            );
            const minimumShellHeight =
                minimumTableHeight + footerHeight + shellGap + cardChrome;
            const availableShellHeight = Math.max(
                minimumShellHeight,
                Math.floor(
                    viewportHeight - shellTop - bottomGap
                )
            );

            if (shell) {
                shell.style.height = `${availableShellHeight}px`;
                shell.style.setProperty(
                    "--work-orders-selected-footer-height",
                    `${footerHeight}px`
                );
            }

            return Math.max(
                minimumTableHeight,
                availableShellHeight -
                    footerHeight -
                    shellGap -
                    cardChrome
            );
        },

        syncViewportTableHeight: function (elementId, reason = "layout") {
            const table = this.tables[elementId];
            const state = this.states[elementId];
            const element = document.getElementById(elementId);

            if (
                !table ||
                !state ||
                !element ||
                !state.viewportLockApplied ||
                !this.usesDesktopPointer()
            ) {
                return false;
            }

            const viewportPosition =
                this.captureTableViewportPosition?.(table) ?? null;
            const targetHeight =
                this.calculateViewportTableHeight(element);
            const currentHeight = Math.round(
                table.element?.getBoundingClientRect?.().height ?? 0
            );

            state.lastViewportLayoutReason = String(
                reason ?? "layout"
            );

            if (Math.abs(currentHeight - targetHeight) <= 1) {
                return false;
            }

            table.setHeight(`${targetHeight}px`);

            if (viewportPosition) {
                this.scheduleTableViewportPositionRestore?.(
                    elementId,
                    viewportPosition,
                    6
                );
            }

            return true;
        },

        scheduleViewportLayoutSync: function (
            elementId,
            reason = "layout"
        ) {
            const state = this.states[elementId];

            if (!state) {
                return false;
            }

            state.viewportLayoutSyncReason = String(
                reason ?? "layout"
            );

            if (state.viewportLayoutSyncFrame !== null) {
                return true;
            }

            /*
             * Basket cards are rendered after Tabulator receives its first
             * height. Wait for two paint frames so the dashboard's final
             * two-row height and the shell's new top position are measurable.
             */
            state.viewportLayoutSyncFrame =
                window.requestAnimationFrame(() => {
                    const currentState = this.states[elementId];

                    if (!currentState) {
                        return;
                    }

                    currentState.viewportLayoutSyncFrame =
                        window.requestAnimationFrame(() => {
                            const latestState =
                                this.states[elementId];

                            if (!latestState) {
                                return;
                            }

                            latestState.viewportLayoutSyncFrame = null;
                            const latestReason =
                                latestState.viewportLayoutSyncReason;
                            latestState.viewportLayoutSyncReason = "";

                            this.syncViewportTableHeight(
                                elementId,
                                latestReason
                            );
                        });
                });

            return true;
        },

        applyViewportLock: function (state) {
            if (
                !state ||
                !this.usesDesktopPointer()
            ) {
                return false;
            }

            window.scrollTo({
                top: 0,
                left: 0,
                behavior: "auto"
            });

            state.previousDocumentOverflow =
                document.documentElement.style.overflow;
            state.previousBodyOverflow =
                document.body.style.overflow;

            document.documentElement.style.overflow = "hidden";
            document.body.style.overflow = "hidden";
            state.viewportLockApplied = true;

            return true;
        },

        releaseViewportLock: function (state) {
            if (!state?.viewportLockApplied) {
                return;
            }

            document.documentElement.style.overflow =
                state.previousDocumentOverflow || "";
            document.body.style.overflow =
                state.previousBodyOverflow || "";

            state.viewportLockApplied = false;
        },

        /*
         * Central owner for one Tabulator instance lifecycle.
         * Reinitialization and final disposal must use the same cleanup path so
         * listeners, timers, animation frames, popups and viewport locks cannot
         * diverge between year switching and final component disposal.
         */
        detachLifecycleEventHandlers: function (table, state) {
            if (!state) {
                return;
            }

            const documentHandlers = [
                ["keydown", state.keyDownHandler],
                ["copy", state.copyHandler],
                ["paste", state.pasteHandler],
                ["pointerdown", state.pointerDownHandler]
            ];

            documentHandlers.forEach(function ([eventName, handler]) {
                if (!handler) {
                    return;
                }

                document.removeEventListener(
                    eventName,
                    handler,
                    true
                );
            });

            if (state.rightClickRangeGuardHandler) {
                table?.element?.removeEventListener(
                    "mousedown",
                    state.rightClickRangeGuardHandler,
                    true
                );
            }

            if (state.resizeHandler) {
                window.removeEventListener(
                    "resize",
                    state.resizeHandler
                );
            }
        },

        cancelLifecycleAsyncWork: function (state) {
            if (!state) {
                return;
            }

            if (state.resizeTimer) {
                window.clearTimeout(state.resizeTimer);
                state.resizeTimer = null;
            }

            state.resizePendingViewportPosition = null;

            if (
                state.resizeViewportRestoreFrame !== null &&
                state.resizeViewportRestoreFrame !== undefined
            ) {
                window.cancelAnimationFrame(
                    state.resizeViewportRestoreFrame
                );
                state.resizeViewportRestoreFrame = null;
                state.resizeViewportRestoreFramesRemaining = 0;
                state.resizeViewportRestoreGeneration += 1;
                state.resizeViewportPosition = null;
            }

            if (
                state.arrowUpCorrectionFrame !== null &&
                state.arrowUpCorrectionFrame !== undefined
            ) {
                window.cancelAnimationFrame(
                    state.arrowUpCorrectionFrame
                );
                state.arrowUpCorrectionFrame = null;
                state.arrowUpCorrectionFramesRemaining = 0;
            }

            if (
                state.verticalNavigationFrame !== null &&
                state.verticalNavigationFrame !== undefined
            ) {
                window.cancelAnimationFrame(
                    state.verticalNavigationFrame
                );
                state.verticalNavigationFrame = null;
            }

            if (
                state.viewportLayoutSyncFrame !== null &&
                state.viewportLayoutSyncFrame !== undefined
            ) {
                window.cancelAnimationFrame(
                    state.viewportLayoutSyncFrame
                );
                state.viewportLayoutSyncFrame = null;
                state.viewportLayoutSyncReason = "";
            }

            if (
                state.aggregateRefreshFrame !== null &&
                state.aggregateRefreshFrame !== undefined
            ) {
                window.cancelAnimationFrame(
                    state.aggregateRefreshFrame
                );
                state.aggregateRefreshFrame = null;
            }

            if (
                state.selectionAggregateRefreshFrame !== null &&
                state.selectionAggregateRefreshFrame !== undefined
            ) {
                window.cancelAnimationFrame(
                    state.selectionAggregateRefreshFrame
                );
                state.selectionAggregateRefreshFrame = null;
            }
        },

        disposeTableInstance: function (elementId) {
            const table = this.tables[elementId];
            const state = this.states[elementId];

            window.tabulatorFilters?.closeActivePopup?.(elementId);
            window.tabulatorRangeAutoScroll?.detach?.(elementId);
            this.disposeColumnLayoutsUi?.(elementId, state);
            this.disposeCustomColumnsUi?.(elementId, state);
            this.resetAggregatesUi?.(elementId);

            this.detachLifecycleEventHandlers(table, state);
            this.cancelLifecycleAsyncWork(state);
            this.releaseViewportLock(state);

            if (table) {
                table.destroy();
            }

            delete this.tables[elementId];
            delete this.states[elementId];
        },

        /*
         * Creates all mutable state owned by one grid instance.
         * Keeping state construction in one place makes lifecycle changes auditable
         * without mixing them into Tabulator configuration or event binding.
         * This extraction intentionally preserves every existing default value.
         */
        createGridState: function (data, baskets) {
            const minimumExistingId = data.reduce(
                function (minimum, row) {
                    const id = Number(row?.id);

                    return Number.isFinite(id)
                        ? Math.min(minimum, id)
                        : minimum;
                },
                0
            );

            return {
                undoStack: [],
                redoStack: [],

                nextTemporaryId:
                    minimumExistingId <= 0
                        ? minimumExistingId - 1
                        : -1,

                activeCell: null,

                ...window.tabulatorTest.createDirtyState(data),

                applyingHistory: false,
                pendingEdit: null,

                /*
                 * Quick mode: الكتابة المباشرة ثم الأسهم تنقل بين الخلايا.
                 * Text mode: Double Click يسمح بتحريك المؤشر داخل النص.
                 */
                nextEditMode: null,
                currentEditMode: null,
                currentEditingCell: null,

                /*
                 * أثناء مسح نطاق، Tabulator يطلق cellEdited لكل خلية.
                 * نجمع هذه التعديلات هنا ثم نسجلها Transaction واحدة.
                 */

                lastStatusMessage: "",

                validationErrors: new Map(),
                validationRowIds: new Set(),
                validationOrder: [],
                activeValidationIndex: -1,

                /*
                 * Identity lookup is built once from the SQL result, then updated
                 * only for rows whose number/type changed. This keeps duplicate
                 * checks proportional to changed rows instead of the whole sheet.
                 */
                identityRows: new Map(),
                rowIdentityKeys: new Map(),

                basketValues: new Set(baskets),

                maxTransactions: 100,

                isSaving: false,
                bulkStructureMutationActive: false,
                bulkFieldMutationActive: false,
                isActive: false,
                keyDownHandler: null,
                copyHandler: null,
                pasteHandler: null,
                pointerDownHandler: null,
                rightClickRangeGuardHandler: null,
                resizeHandler: null,
                resizeTimer: null,
                resizeViewportRestoreFrame: null,
                resizeViewportRestoreFramesRemaining: 0,
                resizeViewportRestoreGeneration: 0,
                resizeViewportPosition: null,
                resizePendingViewportPosition: null,

                /*
                 * ArrowUp viewport correction is single-flight:
                 * at most one requestAnimationFrame chain may exist.
                 * Repeated keys only refresh the remaining settle frames.
                 */
                arrowUpCorrectionFrame: null,
                arrowUpCorrectionFramesRemaining: 0,

                /*
                 * Browser key-repeat events can accumulate while Tabulator is
                 * still painting a Virtual DOM boundary. Keep one shared gate
                 * for both vertical directions so ArrowUp and ArrowDown use the
                 * same repeat policy and the same central state.
                 */
                verticalNavigationFrame: null,

                viewportLayoutSyncFrame: null,
                viewportLayoutSyncReason: "",
                lastViewportLayoutReason: "",

                aggregateRefreshFrame: null,
                aggregateRefreshReason: "",
                aggregateRefreshScope: "visible",
                selectionAggregateRefreshFrame: null,
                selectionAggregateRefreshReason: "",
                aggregateSnapshot: null,
                customAmountAggregateFields: [],

                viewportLockApplied: false,
                previousDocumentOverflow: "",
                previousBodyOverflow: "",

                externalFilters: {
                    workOrderNumber: "",
                    workOrderNumbers: [],
                    workTypeCodes: [],
                    assignmentDates: [],
                    basketValues: [],
                    workOrderValueAmount: null,
                    partialAmountAmount: null,
                    remainingAmountAmount: null,
                    customValues: {}
                }
            };
        },

        destroy: function (elementId) {
            this.disposeTableInstance(elementId);
        }
    });
})();
