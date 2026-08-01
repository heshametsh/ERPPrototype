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

                    if (event.key === "ArrowUp") {
                        window.tabulatorTest
                            .queueArrowUpRangeViewportCorrection(
                                elementId,
                                3
                            );
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
