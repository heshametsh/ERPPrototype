(function () {
    "use strict";

    const target = window.tabulatorTest;

    if (!target?.registerModule) {
        throw new Error(
            "tabulatorInteractions.js requires tabulatorTest.js first."
        );
    }

    target.registerModule("interactions", {
        /*
         * Owns the surface-level interactions attached directly to the grid
         * container or browser window. Lifecycle cleanup removes these exact
         * handlers through the references stored on state.
         */
        bindGridSurfaceInteractions: function (
            elementId,
            table,
            state,
            element
        ) {
            state.rightClickRangeGuardHandler = function (event) {
                window.tabulatorTest.ensureRangeBeforeRightClick(
                    elementId,
                    event
                );
            };

            element.addEventListener(
                "mousedown",
                state.rightClickRangeGuardHandler,
                true
            );

            /*
             * تحديث الارتفاع يحدث فقط عند تغيير حجم نافذة المتصفح،
             * وليس أثناء الكتابة أو التعديل داخل الخلايا.
             */
            state.resizeHandler = function () {
                /*
                 * Capture the logical top-row anchor at the START of a resize
                 * burst. Waiting until the debounce callback runs is too late:
                 * the browser may already have changed the table geometry, which
                 * caused the saved anchor to drift several rows on every resize.
                 */
                if (!state.resizeTimer) {
                    state.resizePendingViewportPosition =
                        window.tabulatorTest
                            .captureTableViewportPosition(table);
                }

                if (state.resizeTimer) {
                    window.clearTimeout(state.resizeTimer);
                }

                state.resizeTimer = window.setTimeout(
                    function () {
                        state.resizeTimer = null;

                        const viewportPosition =
                            state.resizePendingViewportPosition ??
                            window.tabulatorTest
                                .captureTableViewportPosition(table);

                        state.resizePendingViewportPosition = null;

                        const shouldLock =
                            window.tabulatorTest
                                .usesDesktopPointer();

                        if (shouldLock) {
                            if (!state.viewportLockApplied) {
                                window.tabulatorTest
                                    .applyViewportLock(state);
                            }

                            /*
                             * منع بقاء أي إزاحة للصفحة حدثت أثناء التصغير
                             * قبل انتهاء مؤقت إعادة حساب ارتفاع الجدول.
                             */
                            window.scrollTo({
                                top: 0,
                                left: 0,
                                behavior: "auto"
                            });

                            table.setHeight(
                                `${window.tabulatorTest
                                    .calculateViewportTableHeight(element)}px`
                            );
                        } else {
                            window.tabulatorTest
                                .releaseViewportLock(state);
                            table.setHeight("650px");
                        }

                        /*
                         * setHeight can rebuild the Virtual DOM and reset the
                         * table holder to row 1. Restore the exact table scroll
                         * position for a few paint frames after the resize.
                         */
                        window.tabulatorTest
                            .scheduleTableViewportPositionRestore(
                                elementId,
                                viewportPosition,
                                12
                            );
                    },
                    160
                );
            };

            window.addEventListener(
                "resize",
                state.resizeHandler
            );
        },

        /*
         * Plain vertical range navigation is fast while the active cell stays
         * inside the current viewport, but Tabulator 6.5 performs its complete
         * range layout synchronously after it also changes holder.scrollTop.
         * On the dense Work Orders sheet that couples one Arrow movement to the
         * same event turn as Virtual DOM scroll/layout work.
         *
         * Preserve Tabulator as the only range owner. Do not limit the logical
         * range to rendered rows. When (and only when) one keyboard navigation
         * actually scrolls the table, defer Tabulator's original FULL range
         * layout to the next animation frame so the scroll/Virtual DOM update
         * can settle first. No-scroll navigation keeps the original synchronous
         * path unchanged. Multiple moves in one frame share one latest layout.
         */
        /*
         * Tabulator 6.5 keeps the logical range correctly, but its default
         * SelectRange.layoutElement() walks every logical row and every cell
         * after each keyboard navigation. On a 5k-10k Work Orders sheet that
         * makes one Arrow movement pay for thousands of off-screen cells.
         *
         * Tabulator already exposes its own rendered-window path through
         * layoutElement(true). In virtual mode that path covers the complete
         * current Virtual DOM window (visible rows + render buffer), not only
         * one screen. The logical range itself remains unchanged.
         *
         * During range navigation only:
         * - if no vertical scroll happened, refresh the rendered window now;
         * - if navigation changed scrollTop, wait one animation frame so the
         *   Virtual DOM moves first, then refresh the latest rendered window.
         *
         * Non-navigation layout, structural changes, mouse selection and full
         * redraws keep Tabulator's original behavior.
         */
        deferScrolledKeyboardRangeLayout: function (
            elementId,
            table
        ) {
            const rangeModule =
                table?.modules?.selectRange;
            const rowManager =
                table?.rowManager;
            const holder =
                table?.element?.querySelector(
                    ".tabulator-tableholder"
                );

            if (
                !rangeModule ||
                !rowManager ||
                !holder ||
                table?.options?.renderVertical !== "virtual" ||
                rangeModule.__udsScrolledKeyboardLayoutDeferred === true
            ) {
                return false;
            }

            const originalNavigate =
                rangeModule.navigate;
            const originalLayoutElement =
                rangeModule.layoutElement;

            if (
                typeof originalNavigate !== "function" ||
                typeof originalLayoutElement !== "function" ||
                typeof rowManager.getDisplayRows !== "function" ||
                typeof rowManager.getRowFromPosition !== "function"
            ) {
                return false;
            }

            let navigationActive = false;
            let navigationStartScrollTop = 0;
            let deferredLayoutFrame = null;
            let deferredLayoutWork = null;
            let arrowUpCorrectionArmFrame = null;

            const tableIsCurrent = function () {
                return window.tabulatorTest
                    ?.tables?.[elementId] === table;
            };

            const renderCurrentVirtualWindow = function () {
                return originalLayoutElement.call(
                    rangeModule,
                    true
                );
            };

            const queueDeferredLayout = function (work) {
                deferredLayoutWork = work;

                if (deferredLayoutFrame !== null) {
                    return;
                }

                deferredLayoutFrame =
                    window.requestAnimationFrame(
                        function () {
                            deferredLayoutFrame = null;

                            if (!tableIsCurrent()) {
                                deferredLayoutWork = null;
                                return;
                            }

                            const latestWork =
                                deferredLayoutWork;
                            deferredLayoutWork = null;

                            latestWork?.();
                        }
                    );
            };

            /*
             * The ArrowUp viewport repair is only relevant when navigation
             * actually moved the table upward. Arm it after the Virtual DOM
             * has had one paint frame to settle, then let the existing repair
             * verify the final geometry. This avoids forcing a layout check on
             * every ArrowUp that stayed inside the current viewport.
             */
            const queueArrowUpCorrectionAfterSettledScroll = function () {
                if (arrowUpCorrectionArmFrame !== null) {
                    return;
                }

                arrowUpCorrectionArmFrame =
                    window.requestAnimationFrame(
                        function () {
                            arrowUpCorrectionArmFrame = null;

                            if (!tableIsCurrent()) {
                                return;
                            }

                            window.tabulatorTest
                                .queueArrowUpRangeViewportCorrection(
                                    elementId,
                                    2
                                );
                        }
                    );
            };

            const refreshOneCellAndRow = function (cell) {
                if (!cell) {
                    return;
                }

                rangeModule.renderCell?.(cell);
                rangeModule.layoutRow?.(cell.row);
            };

            const refreshActiveSelection = function () {
                const activeCell =
                    rangeModule.getActiveCell?.();
                const activeElement =
                    activeCell?.getElement?.();

                if (!activeCell || !activeElement?.isConnected) {
                    renderCurrentVirtualWindow();
                    return;
                }

                refreshOneCellAndRow(activeCell);
                rangeModule.layoutRanges?.();
            };

            const ensureTargetRowVisible = function (row) {
                const rowElement =
                    row?.getElement?.();

                if (!rowElement) {
                    return false;
                }

                if (!rowElement.parentNode) {
                    row?.getComponent?.()
                        ?.scrollTo?.(undefined, false);
                    return true;
                }

                /*
                 * Plain vertical navigation never changes the column, so avoid
                 * Tabulator's four getBoundingClientRect() calls and its
                 * horizontal visibility branch. Work only with the row offsets
                 * already used by Tabulator's own autoScroll implementation.
                 */
                const rowTop =
                    rowElement.offsetTop;
                const rowBottom =
                    rowTop + rowElement.offsetHeight;
                const viewportTop =
                    holder.scrollTop;
                const viewportBottom =
                    viewportTop + holder.clientHeight;

                if (rowTop < viewportTop) {
                    holder.scrollTop = rowTop;
                    return true;
                }

                if (rowBottom > viewportBottom) {
                    holder.scrollTop =
                        rowBottom - holder.clientHeight;
                    return true;
                }

                return false;
            };

            /*
             * Tabulator's SelectRange helpers repeatedly search the complete
             * display-row collection by logical position. At deep Work Orders
             * rows that turns one Arrow movement into several O(N) scans.
             *
             * Keep one logical row index while the displayed order is stable.
             * Normal Arrow movement and scrolling reuse it without rescanning
             * the 4k-10k row collection. Only operations that can actually
             * change row order/structure touch the index:
             *
             * - Sort / Filter / full data processing: invalidate once and
             *   rebuild lazily on the next Arrow because the global order
             *   genuinely changed.
             * - Insert / Delete / Move: adjust the cached row list locally
             *   whenever Tabulator kept the same display-row array.
             * - Cell Edit: does not invalidate anything by itself. If an edit
             *   really causes a Sort/Filter operation, those events invalidate
             *   the cache through their own handlers.
             *
             * This follows the spreadsheet rule used throughout Work Orders:
             * a local change should pay a local cost; a global reorder pays one
             * global rebuild, never one rebuild per Arrow.
             */
            let navigationRowSnapshot = null;
            let pendingAddedRows = null;
            let addedRowsSyncQueued = false;

            const invalidateNavigationRowSnapshot = function () {
                navigationRowSnapshot = null;
            };

            const rebuildNavigationRowSnapshot = function () {
                const displayRows =
                    rowManager.getDisplayRows();
                const rows = [];

                for (
                    let index = 0;
                    index < displayRows.length;
                    index += 1
                ) {
                    const row = displayRows[index];

                    if (row?.type === "row") {
                        rows.push(row);
                    }
                }

                navigationRowSnapshot = {
                    displayRows,
                    displayLength: displayRows.length,
                    rows
                };

                return navigationRowSnapshot;
            };

            const createNavigationRowSnapshot = function () {
                const displayRows =
                    rowManager.getDisplayRows();

                if (
                    navigationRowSnapshot &&
                    navigationRowSnapshot.displayRows === displayRows &&
                    navigationRowSnapshot.displayLength === displayRows.length
                ) {
                    return navigationRowSnapshot;
                }

                return rebuildNavigationRowSnapshot();
            };

            const getInternalRow = function (rowComponent) {
                return rowComponent?._getSelf?.() ?? null;
            };

            const syncDeletedNavigationRow = function (rowComponent) {
                const snapshot =
                    navigationRowSnapshot;

                if (!snapshot) {
                    return;
                }

                const displayRows =
                    rowManager.getDisplayRows();

                if (
                    snapshot.displayRows !== displayRows ||
                    displayRows.length > snapshot.displayLength
                ) {
                    invalidateNavigationRowSnapshot();
                    return;
                }

                const internalRow =
                    getInternalRow(rowComponent);
                const cachedIndex =
                    snapshot.rows.indexOf(internalRow);

                /*
                 * Deleting a row that is currently filtered out does not change
                 * the displayed logical row list.
                 */
                if (cachedIndex >= 0) {
                    snapshot.rows.splice(cachedIndex, 1);
                }

                snapshot.displayLength =
                    displayRows.length;
            };

            const syncMovedNavigationRow = function (rowComponent) {
                const snapshot =
                    navigationRowSnapshot;

                if (!snapshot) {
                    return;
                }

                const displayRows =
                    rowManager.getDisplayRows();

                if (
                    snapshot.displayRows !== displayRows ||
                    snapshot.displayLength !== displayRows.length
                ) {
                    invalidateNavigationRowSnapshot();
                    return;
                }

                const internalRow =
                    getInternalRow(rowComponent);
                const oldIndex =
                    snapshot.rows.indexOf(internalRow);
                const newPosition =
                    Number(internalRow?.position);
                const newIndex =
                    Number.isInteger(newPosition)
                        ? newPosition - 1
                        : -1;

                if (
                    oldIndex < 0 ||
                    newIndex < 0 ||
                    newIndex >= snapshot.rows.length
                ) {
                    invalidateNavigationRowSnapshot();
                    return;
                }

                if (oldIndex === newIndex) {
                    return;
                }

                snapshot.rows.splice(oldIndex, 1);
                snapshot.rows.splice(
                    newIndex,
                    0,
                    internalRow
                );
            };

            const flushAddedNavigationRows = function () {
                addedRowsSyncQueued = false;

                const queuedRows =
                    pendingAddedRows;

                pendingAddedRows = null;

                if (
                    !navigationRowSnapshot ||
                    !queuedRows?.size
                ) {
                    return;
                }

                const snapshot =
                    navigationRowSnapshot;
                const displayRows =
                    rowManager.getDisplayRows();

                /*
                 * A sort/filter pipeline may replace the display-row array
                 * after addData/addRow completes. In that case the entire
                 * visible order genuinely changed, so do one lazy rebuild on
                 * the next Arrow instead of trying to patch stale order.
                 */
                if (
                    snapshot.displayRows !== displayRows ||
                    displayRows.length < snapshot.displayLength
                ) {
                    invalidateNavigationRowSnapshot();
                    return;
                }

                const visibleRows = [];

                queuedRows.forEach(function (internalRow) {
                    const position =
                        Number(internalRow?.position);

                    if (
                        internalRow?.type === "row" &&
                        Number.isInteger(position) &&
                        position > 0
                    ) {
                        visibleRows.push(internalRow);
                    }
                });

                /*
                 * New rows that are filtered out have no displayed logical
                 * position and therefore do not belong in the Arrow index.
                 */
                const displayDelta =
                    displayRows.length -
                    snapshot.displayLength;

                if (displayDelta !== visibleRows.length) {
                    invalidateNavigationRowSnapshot();
                    return;
                }

                visibleRows.sort(
                    (left, right) =>
                        left.position - right.position
                );

                for (const internalRow of visibleRows) {
                    const insertionIndex =
                        internalRow.position - 1;

                    if (
                        insertionIndex < 0 ||
                        insertionIndex > snapshot.rows.length
                    ) {
                        invalidateNavigationRowSnapshot();
                        return;
                    }

                    snapshot.rows.splice(
                        insertionIndex,
                        0,
                        internalRow
                    );
                }

                snapshot.displayLength =
                    displayRows.length;
            };

            const queueAddedNavigationRow = function (rowComponent) {
                if (!navigationRowSnapshot) {
                    return;
                }

                const internalRow =
                    getInternalRow(rowComponent);

                if (!internalRow) {
                    invalidateNavigationRowSnapshot();
                    return;
                }

                if (!pendingAddedRows) {
                    pendingAddedRows = new Set();
                }

                pendingAddedRows.add(internalRow);

                if (addedRowsSyncQueued) {
                    return;
                }

                addedRowsSyncQueued = true;

                /*
                 * rowAdded is emitted before addRows finishes refreshing the
                 * display pipeline. A microtask runs after that synchronous
                 * structural operation, when final row positions are known,
                 * without forcing another render or frame.
                 */
                window.queueMicrotask(
                    flushAddedNavigationRows
                );
            };

            table.on(
                "dataSorted",
                invalidateNavigationRowSnapshot
            );
            table.on(
                "dataFiltered",
                invalidateNavigationRowSnapshot
            );
            table.on(
                "dataProcessed",
                invalidateNavigationRowSnapshot
            );
            table.on(
                "rowAdded",
                queueAddedNavigationRow
            );
            table.on(
                "rowDeleted",
                syncDeletedNavigationRow
            );
            table.on(
                "rowMoved",
                syncMovedNavigationRow
            );

            const withNavigationRowLookup = function (
                snapshot,
                work
            ) {
                if (
                    !snapshot ||
                    typeof work !== "function"
                ) {
                    return work?.();
                }

                const currentDisplayRows =
                    rowManager.getDisplayRows();

                if (
                    currentDisplayRows !== snapshot.displayRows ||
                    currentDisplayRows.length !== snapshot.displayLength
                ) {
                    return work();
                }

                const previousGetRowFromPosition =
                    rowManager.getRowFromPosition;

                rowManager.getRowFromPosition = function (position) {
                    const logicalPosition =
                        Number(position);
                    const row =
                        Number.isInteger(logicalPosition)
                            ? snapshot.rows[logicalPosition - 1]
                            : null;

                    if (
                        row?.type === "row" &&
                        row.position === logicalPosition
                    ) {
                        return row;
                    }

                    return previousGetRowFromPosition.call(
                        this,
                        position
                    );
                };

                try {
                    return work();
                } finally {
                    rowManager.getRowFromPosition =
                        previousGetRowFromPosition;
                }
            };

            rangeModule.layoutElement = function (
                visibleRowsOnly
            ) {
                const navigationLayout =
                    navigationActive &&
                    visibleRowsOnly === undefined;

                if (!navigationLayout) {
                    return originalLayoutElement.call(
                        this,
                        visibleRowsOnly
                    );
                }

                const scrolledDuringNavigation =
                    holder.scrollTop !== navigationStartScrollTop;

                if (!scrolledDuringNavigation) {
                    return renderCurrentVirtualWindow();
                }

                queueDeferredLayout(
                    renderCurrentVirtualWindow
                );

                return undefined;
            };

            rangeModule.navigate = function (...args) {
                const activeRange =
                    rangeModule.activeRange;

                const startsAsOneCell =
                    rangeModule.ranges?.length === 1 &&
                    activeRange &&
                    activeRange.top === activeRange.bottom &&
                    activeRange.left === activeRange.right &&
                    rangeModule.selecting === "cell";

                const plainVerticalMove =
                    args[0] === false &&
                    args[1] === false &&
                    (
                        args[2] === "up" ||
                        args[2] === "down"
                    );

                const canUseFastPath =
                    Boolean(
                        startsAsOneCell &&
                        plainVerticalMove &&
                        !table?.modules?.edit?.currentCell
                    );

                if (!canUseFastPath) {
                    navigationActive = true;
                    navigationStartScrollTop =
                        holder.scrollTop;

                    let navigationResult;

                    try {
                        navigationResult =
                            originalNavigate.apply(
                                this,
                                args
                            );
                    } finally {
                        navigationActive = false;
                    }

                    if (
                        plainVerticalMove &&
                        args[2] === "up" &&
                        holder.scrollTop < navigationStartScrollTop
                    ) {
                        queueArrowUpCorrectionAfterSettledScroll();
                    }

                    return navigationResult;
                }

                const snapshot =
                    createNavigationRowSnapshot();
                const rows =
                    snapshot.rows;
                const rowCount =
                    rows.length;

                if (rowCount <= 0) {
                    return originalNavigate.apply(
                        this,
                        args
                    );
                }

                return withNavigationRowLookup(
                    snapshot,
                    function () {
                        const previousCell =
                            rangeModule.getActiveCell?.();

                        if (!previousCell) {
                            return originalNavigate.apply(
                                rangeModule,
                                args
                            );
                        }

                        const currentRow =
                            activeRange.start.row;
                        const currentCol =
                            activeRange.start.col;
                        const rowDelta =
                            args[2] === "up"
                                ? -1
                                : 1;
                        const nextRow =
                            Math.max(
                                0,
                                Math.min(
                                    currentRow + rowDelta,
                                    rowCount - 1
                                )
                            );

                        if (nextRow === currentRow) {
                            return true;
                        }

                        const targetRow =
                            rows[nextRow];

                        if (!targetRow) {
                            return originalNavigate.apply(
                                rangeModule,
                                args
                            );
                        }

                        const startScrollTop =
                            holder.scrollTop;

                        /*
                         * Keep Tabulator's existing Range object and current
                         * Work Orders visibility behavior. This optimization
                         * changes only row lookup cost; it does not add another
                         * Arrow owner, another scroll path, or another range.
                         */
                        activeRange.setStart(
                            nextRow,
                            currentCol
                        );
                        activeRange.setEnd(
                            nextRow,
                            currentCol
                        );
                        rangeModule.selecting = "cell";

                        refreshOneCellAndRow(
                            previousCell
                        );

                        const didScroll =
                            ensureTargetRowVisible(
                                targetRow
                            ) ||
                            holder.scrollTop !== startScrollTop;

                        if (didScroll) {
                            queueDeferredLayout(
                                function () {
                                    withNavigationRowLookup(
                                        snapshot,
                                        refreshActiveSelection
                                    );
                                }
                            );

                            if (
                                args[2] === "up" &&
                                holder.scrollTop < startScrollTop
                            ) {
                                queueArrowUpCorrectionAfterSettledScroll();
                            }
                        } else {
                            refreshActiveSelection();
                        }

                        return true;
                    }
                );
            };

            rangeModule.__udsScrolledKeyboardLayoutDeferred = true;
            rangeModule.__udsPlainVerticalFastPath = true;
            rangeModule.__udsVerticalNavigationRowLookup = true;
            rangeModule.__udsVerticalNavigationCachedRowIndex = true;
            return true;
        },

        /*
         * Owns editing, selection, keyboard, clipboard and context-menu
         * interaction wiring for one live grid instance.
         *
         * Business example:
         * - one selected cell receives one Arrow/Copy/Paste path;
         * - changing year destroys the old instance before a new set binds;
         * - a future custom input column uses the same printable-key path
         *   without adding another document-level listener.
         */
        bindGridCommandInteractions: function (
            elementId,
            table,
            state,
            element,
            directTypingFields
        ) {
            /*
             * تسجيل القيمة قبل تعديل خلية واحدة.
             */
            table.on("cellEditing", function (cell) {
                if (state.applyingHistory) {
                    return;
                }

                state.currentEditingCell = cell;

                /*
                 * الكتابة المباشرة تدخل Quick mode.
                 * Double Click أو Enter يدخل Text mode، مثل F2 في Excel.
                 * Basket يظل في وضع القائمة حتى تعمل أسهم اختيار القيم طبيعيًا.
                 */
                state.currentEditMode =
                    state.nextEditMode === "quick" &&
                        cell.getField() !== "basket"
                        ? "quick"
                        : "text";

                state.nextEditMode = null;

                state.pendingEdit = {
                    rowId: cell.getRow().getIndex(),
                    clientKey:
                        cell.getRow().getData().clientKey,
                    field: cell.getField(),
                    oldValue: cell.getValue(),
                    aggregateBefore:
                        window.tabulatorTest
                            .doesFieldAffectAggregates?.(
                                cell.getField()
                            )
                            ? window.tabulatorTest
                                .captureAggregateRowState?.(
                                    elementId,
                                    cell.getRow().getData()
                                )
                            : null
                };

                /*
                 * محررات رقم أمر العمل والنوع والتاريخ تمنع Enter من
                 * الانتقال أصلًا داخل المحرر المخصص. نطبق نفس السلوك
                 * على محررات Tabulator الجاهزة مثل Basket وStatus وNotes:
                 * يثبت Enter القيمة، ثم نوقف الحدث قبل أن ينفذ Tabulator
                 * تنقلًا إلى الصف التالي.
                 *
                 * نربط المستمع بعد إنشاء المحرر، ولذلك ينفذ مستمع المحرر
                 * الأصلي أولًا لحفظ القيمة، ثم يمنع هذا المستمع التنقل فقط.
                 */
                window.requestAnimationFrame(function () {
                    const cellElement =
                        cell.getElement();

                    const editor =
                        cellElement?.querySelector(
                            "input:not([type='hidden']), textarea, select"
                        );

                    if (
                        !editor ||
                        editor.dataset.udsEnterStayBound === "true"
                    ) {
                        return;
                    }

                    editor.dataset.udsEnterStayBound = "true";

                    editor.addEventListener(
                        "keydown",
                        function (event) {
                            if (
                                event.key !== "Enter" ||
                                event.isComposing
                            ) {
                                return;
                            }

                            event.preventDefault();
                            event.stopImmediatePropagation();
                        }
                    );
                });
            });

            table.on("cellEditCancelled", function (cell) {
                state.pendingEdit = null;
                state.nextEditMode = null;
                state.currentEditMode = null;
                state.currentEditingCell = null;

                if (cell) {
                    window.tabulatorTest.validateRows(
                        elementId,
                        [cell.getRow().getIndex()],
                        { forceRequired: false }
                    );
                }
            });

            /*
             * تسجيل تعديل الخلية كعملية Undo واحدة.
             */
            table.on("cellEdited", function (cell) {
                if (state.applyingHistory) {
                    return;
                }

                /*
                 * لا نمسح nextEditMode هنا؛ أثناء التنقل بالسهم
                 * تحتاجه الخلية التالية لتظل في Quick mode.
                 */
                state.currentEditMode = null;
                state.currentEditingCell = null;

                const rowId =
                    cell.getRow().getIndex();

                const field =
                    cell.getField();

                const pending =
                    state.pendingEdit;

                const oldValue =
                    pending &&
                        pending.rowId === rowId &&
                        pending.field === field
                        ? pending.oldValue
                        : cell.getOldValue();

                const aggregateBefore =
                    pending &&
                        pending.rowId === rowId &&
                        pending.field === field
                        ? pending.aggregateBefore
                        : null;

                let newValue =
                    cell.getValue();

                const normalizedValue =
                    window.tabulatorTest.normalizeFieldValue(
                        elementId,
                        field,
                        newValue
                    );

                if (!Object.is(newValue, normalizedValue)) {
                    state.applyingHistory = true;

                    try {
                        cell.setValue(normalizedValue, true);
                        newValue = normalizedValue;
                    } finally {
                        state.applyingHistory = false;
                    }
                }

                state.pendingEdit = null;

                if (Object.is(oldValue, newValue)) {
                    return;
                }

                if (
                    typeof window.tabulatorTest.syncFinancialRows === "function" &&
                    window.tabulatorTest.isFinancialField(field)
                ) {
                    void window.tabulatorTest.syncFinancialRows(
                        elementId,
                        [rowId]
                    ).then(() => {
                        window.tabulatorTest
                            .applyAggregateRowDelta?.(
                                elementId,
                                rowId,
                                aggregateBefore
                            );
                    }).catch(() => {
                        window.tabulatorTest.scheduleAggregateRefresh?.(
                            elementId,
                            "financial-cell-edit-error"
                        );
                    });
                } else if (
                    window.tabulatorTest
                        .doesFieldAffectAggregates?.(field)
                ) {
                    window.tabulatorTest.applyAggregateRowDelta?.(
                        elementId,
                        rowId,
                        aggregateBefore
                    );
                }

                window.tabulatorTest.pushTransaction(
                    elementId,
                    {
                        type: "cell-edit",
                        label: "تعديل خلية",

                        changes: [
                            {
                                rowId: rowId,
                                clientKey:
                                    cell.getRow().getData().clientKey,
                                field: field,

                                oldValue: oldValue,
                                newValue: newValue
                            }
                        ]
                    }
                );

                window.tabulatorFilters
                    .refreshFields(
                        window.tabulatorTest,
                        elementId,
                        [field]
                    );
            });

            /*
             * نعتبر الشيت نشطًا عند تحديد خلية أو نطاق داخله.
             * الضغط خارج الشيت يوقف اختصاراته حتى لا تتعارض
             * مع حقول البحث والقوائم الموجودة في الصفحة.
             */
            table.on("cellMouseDown", function (event, cell) {
                state.isActive = true;

                if (cell) {
                    state.activeCell = {
                        rowId: cell.getRow().getIndex(),
                        field: cell.getField()
                    };
                }
            });

            table.on("cellContext", function (event, cell) {
                event.preventDefault();
                state.isActive = true;

                window.tabulatorTest.showStructureContextMenu(
                    elementId,
                    event,
                    cell
                );
            });

            table.on("rangeAdded", function () {
                state.isActive = true;
                window.tabulatorTest.scheduleSelectionAggregateRefresh?.(
                    elementId,
                    "range-added"
                );
            });

            table.on("rangeChanged", function () {
                state.isActive = true;
                window.tabulatorTest.scheduleSelectionAggregateRefresh?.(
                    elementId,
                    "range-changed"
                );
            });

            table.on("rangeRemoved", function () {
                window.tabulatorTest.scheduleSelectionAggregateRefresh?.(
                    elementId,
                    "range-removed"
                );
            });

            state.pointerDownHandler = function (event) {
                state.isActive =
                    element.contains(event.target);

                const menu = document.getElementById(
                    `${elementId}-row-menu`
                );

                if (
                    menu &&
                    !menu.contains(event.target)
                ) {
                    window.tabulatorTest
                        .hideStructureContextMenu(
                            elementId
                        );
                }
            };

            document.addEventListener(
                "pointerdown",
                state.pointerDownHandler,
                true
            );

            /*
             * الكتابة المباشرة وUndo/Redo.
             *
             * نستخدم event.key للحرف المكتوب فعلًا داخل الخلية،
             * ونستخدم event.code للاختصارات حتى تعمل مع لوحة
             * المفاتيح العربية والإنجليزية بنفس الشكل.
             */
            state.keyDownHandler = function (event) {
                if (
                    state.isSaving ||
                    state.bulkStructureMutationActive
                ) {
                    return;
                }

                const modifierPressed =
                    event.ctrlKey || event.metaKey;

                const shortcutCode =
                    event.code;

                /*
                 * Undo / Redo يعملان على مستوى صفحة Work Orders كلها،
                 * وليس فقط عندما تكون آخر ضغطة داخل الشيت.
                 *
                 * نترك Ctrl+Z الطبيعي داخل input/textarea حتى لا نكسر
                 * تعديل النص أثناء الكتابة.
                 */
                if (
                    modifierPressed &&
                    !event.altKey &&
                    !window.tabulatorTest.isEditorTarget(
                        event.target
                    )
                ) {
                    if (shortcutCode === "KeyZ") {
                        event.preventDefault();
                        event.stopImmediatePropagation();

                        if (event.shiftKey) {
                            window.tabulatorTest.redo(
                                elementId
                            );
                        } else {
                            window.tabulatorTest.undo(
                                elementId
                            );
                        }

                        return;
                    }

                    if (shortcutCode === "KeyY") {
                        event.preventDefault();
                        event.stopImmediatePropagation();

                        window.tabulatorTest.redo(
                            elementId
                        );

                        return;
                    }
                }

                /*
                 * الكتابة المباشرة والتنقل يظلان مرتبطين بالشيت نفسه.
                 */
                if (!state.isActive) {
                    return;
                }

                /*
                 * Use one central repeat gate for plain vertical range
                 * navigation. ArrowUp, ArrowDown, and Enter all move the active
                 * range vertically, so they share the same frame budget and
                 * cannot build a stale browser key-repeat queue.
                 *
                 * The viewport correction remains an ArrowUp-only exception
                 * because the confirmed Virtual DOM edge defect exists above
                 * the viewport, not below it.
                 */
                if (
                    (
                        event.key === "ArrowUp" ||
                        event.key === "ArrowDown" ||
                        event.key === "Enter"
                    ) &&
                    !event.shiftKey &&
                    !event.ctrlKey &&
                    !event.metaKey &&
                    !event.altKey &&
                    !window.tabulatorTest.isEditorTarget(
                        event.target
                    )
                ) {
                    const shouldNavigate =
                        window.tabulatorTest
                            .allowVerticalNavigationEvent(
                                elementId,
                                event
                            );

                    if (!shouldNavigate) {
                        /*
                         * This is a stale browser key-repeat event that arrived
                         * before the previous vertical navigation produced a
                         * paint. Stop it in capture phase so it never enters
                         * Tabulator's queue.
                         */
                        event.preventDefault();
                        event.stopImmediatePropagation();
                        return;
                    }

                }

                /*
                 * في Quick mode تعمل الأسهم الأربعة كتنقل بين الخلايا.
                 * في Text mode نترك Left/Right لتحريك المؤشر داخل النص.
                 */
                if (
                    window.tabulatorTest.isEditorTarget(
                        event.target
                    )
                ) {
                    const navigationByKey = {
                        ArrowLeft: "navigateLeft",
                        ArrowRight: "navigateRight",
                        ArrowUp: "navigateUp",
                        ArrowDown: "navigateDown"
                    };

                    const navigationName =
                        navigationByKey[event.key];

                    if (
                        state.currentEditMode === "quick" &&
                        state.currentEditingCell &&
                        navigationName
                    ) {
                        event.preventDefault();
                        event.stopImmediatePropagation();

                        const editingCell =
                            state.currentEditingCell;

                        const navigationFunction =
                            editingCell[navigationName];

                        if (
                            typeof navigationFunction ===
                            "function"
                        ) {
                            /*
                             * الخلية التالية تظل في Quick mode حتى يستمر
                             * التنقل بالأسهم دون الدخول داخل النص.
                             */
                            state.nextEditMode = "quick";

                            const moved =
                                navigationFunction.call(
                                    editingCell
                                );

                            if (moved === false) {
                                state.nextEditMode = null;
                            }
                        }

                        return;
                    }

                    return;
                }

                const activeRange =
                    window.tabulatorTest.getActiveRange(
                        table
                    );

                if (!activeRange) {
                    return;
                }

                /*
                 * تشخيص M5D1 أثبت أن Tabulator يحتفظ بالنطاق المنطقي كاملًا
                 * بعد الـScroll، وأن getStructuredCells يعيد الصفوف غير الظاهرة
                 * أيضًا. المشكلة كانت في مسار المسح الداخلي نفسه مع Virtual DOM.
                 *
                 * لذلك يملك المشروع Delete/Backspace حصريًا: نمنع المسار
                 * الداخلي، ونمسح نفس النطاق المنطقي من خلال CellComponents
                 * التي أعادها Tabulator، دون أي نظام تحديد موازٍ.
                 */
                if (
                    (event.key === "Delete" ||
                        event.key === "Backspace") &&
                    !event.ctrlKey &&
                    !event.metaKey &&
                    !event.altKey
                ) {
                    event.preventDefault();
                    event.stopImmediatePropagation();

                    /*
                     * منع تكرار العملية عند استمرار الضغط على المفتاح.
                     */
                    if (!event.repeat) {
                        window.tabulatorTest
                            .clearActiveRangeContents(
                                elementId,
                                activeRange
                            );
                    }

                    return;
                }

                const isPrintableKey =
                    event.key.length === 1 &&
                    !event.ctrlKey &&
                    !event.metaKey &&
                    !event.altKey;

                if (isPrintableKey) {
                    const selectedCells =
                        activeRange.getStructuredCells();

                    const isSingleCell =
                        Array.isArray(selectedCells) &&
                        selectedCells.length === 1 &&
                        selectedCells[0].length === 1;

                    if (isSingleCell) {
                        const cell =
                            selectedCells[0][0];

                        const columnDefinition =
                            cell
                                .getColumn()
                                .getDefinition();

                        /*
                         * الكتابة المباشرة للأعمدة النصية
                         * وعمود التاريخ ذي المحرر المخصص.
                         */
                        if (
                            columnDefinition.editor === "input" ||
                            directTypingFields.has(
                                cell.getField()
                            )
                        ) {
                            event.preventDefault();
                            event.stopImmediatePropagation();

                            const typedCharacter =
                                directTypingFields.has(
                                    cell.getField()
                                ) &&
                                    (cell.getField() === "workOrderNumber" ||
                                        cell.getField() === "workTypeCode")
                                    ? window.tabulatorTest
                                        .normalizeIdentityDigits(event.key)
                                    : event.key;

                            state.nextEditMode =
                                cell.getField() === "basket"
                                    ? "text"
                                    : "quick";

                            cell.edit();

                            window.requestAnimationFrame(
                                function () {
                                    const cellElement =
                                        cell.getElement();

                                    const editor =
                                        cellElement?.querySelector(
                                            "input:not([type='hidden']), textarea"
                                        );

                                    if (!editor) {
                                        return;
                                    }

                                    editor.value =
                                        typedCharacter;

                                    editor.dispatchEvent(
                                        new Event(
                                            "input",
                                            {
                                                bubbles: true
                                            }
                                        )
                                    );

                                    editor.focus();

                                    if (
                                        typeof editor.setSelectionRange ===
                                        "function"
                                    ) {
                                        editor.setSelectionRange(
                                            typedCharacter.length,
                                            typedCharacter.length
                                        );
                                    }
                                }
                            );

                            return;
                        }
                    }
                }

            };

            /*
             * Phase 5B clipboard ownership:
             * - document copy/paste events exclusively own keyboard shortcuts.
             * - the toolbar copy button calls the same shared copy core.
             * - Tabulator's clipboard module is disabled so one user action can
             *   never enter a second copy or paste path.
             */
            state.copyHandler = function (event) {
                if (
                    !state.isActive ||
                    !event.clipboardData ||
                    window.tabulatorTest.isEditorTarget(
                        event.target
                    )
                ) {
                    return;
                }

                const copied =
                    window.tabulatorTest.copyActiveRange(
                        elementId,
                        event.clipboardData
                    );

                if (!copied) {
                    return;
                }

                event.preventDefault();
                event.stopImmediatePropagation();
            };

            state.pasteHandler = function (event) {
                if (
                    !state.isActive ||
                    !event.clipboardData ||
                    window.tabulatorTest.isEditorTarget(
                        event.target
                    )
                ) {
                    return;
                }

                const activeRange =
                    window.tabulatorTest.getActiveRange(
                        table
                    );

                if (!activeRange) {
                    return;
                }

                /*
                 * Once a sheet range is active, this handler is the only owner
                 * of the paste event. Stop it before parsing so an invalid or
                 * empty payload cannot fall through to Tabulator and execute a
                 * second paste path.
                 */
                event.preventDefault();
                event.stopImmediatePropagation();

                window.tabulatorTest.pasteClipboardText(
                    elementId,
                    event.clipboardData.getData(
                        "text/plain"
                    )
                );
            };

            document.addEventListener(
                "keydown",
                state.keyDownHandler,
                true
            );

            document.addEventListener(
                "copy",
                state.copyHandler,
                true
            );

            document.addEventListener(
                "paste",
                state.pasteHandler,
                true
            );
        }
    });
})();
