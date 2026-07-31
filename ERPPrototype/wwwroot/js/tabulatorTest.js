window.tabulatorTest = {
    tables: {},
    states: {},
    modules: {},

    registerModule: function (name, methods) {
        const moduleName = String(name ?? "").trim();

        if (!moduleName) {
            throw new Error("Tabulator module name is required.");
        }

        if (!methods || typeof methods !== "object") {
            throw new Error(
                `Tabulator module '${moduleName}' must provide an object.`
            );
        }

        const duplicateMembers = Object.keys(methods).filter(
            member => Object.prototype.hasOwnProperty.call(this, member)
        );

        if (duplicateMembers.length > 0) {
            throw new Error(
                `Tabulator module '${moduleName}' attempted to replace: ` +
                duplicateMembers.join(", ")
            );
        }

        Object.assign(this, methods);
        this.modules[moduleName] = Object.freeze(
            Object.keys(methods)
        );
    },

    /*
     * Central Virtual DOM tuning point.
     * 260px is roughly 6-7 work-order rows on the current sheet,
     * keeping enough overscan for smooth keyboard/mouse scrolling while
     * avoiding the much larger downward DOM window measured previously.
     * Any future tuning for both ArrowUp and ArrowDown belongs here.
     */
    virtualDomSettings: {
        renderVerticalBufferPx: 260
    },

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
        const minimumHeight = 320;
        const bottomGap = 14;
        const viewportHeight =
            window.visualViewport?.height || window.innerHeight;
        const elementTop =
            element.getBoundingClientRect().top;

        return Math.max(
            minimumHeight,
            Math.floor(
                viewportHeight - elementTop - bottomGap
            )
        );
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
    },

    disposeTableInstance: function (elementId) {
        const table = this.tables[elementId];
        const state = this.states[elementId];

        window.tabulatorFilters?.closeActivePopup?.(elementId);
        window.tabulatorRangeAutoScroll?.detach?.(elementId);

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
            deletedOriginalRowIds: new Set(),

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

            /*
             * نحتفظ بنسخة القيم الأصلية فقط للمقارنة.
             * لا نلون الصفوف ولا نغير شكل الشيت.
             */
            originalRows: new Map(
                data.map(function (row) {
                    return [
                        String(row.id),
                        window.tabulatorTest
                            .createDirtySnapshot(row)
                    ];
                })
            ),

            dirtyRowIds: new Set(),
            changedFieldsByRow: new Map(),
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

            viewportLockApplied: false,
            previousDocumentOverflow: "",
            previousBodyOverflow: "",

            externalFilters: {
                workOrderNumber: "",
                workTypeCodes: [],
                assignmentDates: [],
                basketValues: []
            }
        };
    },

    initialize: function (
        elementId,
        data,
        baskets,
        openContext = null
    ) {
        const openInitializationStartedAt =
            this.getPerformanceTimestamp();

        const initializationDiagnostic =
            window.tabulatorDiagnostics
                ?.beginGridInitialization?.(
                    elementId,
                    Array.isArray(data) ? data.length : 0
                );

        const element = document.getElementById(elementId);

        if (!element) {
            console.error("Tabulator element was not found:", elementId);
            return;
        }

        if (typeof Tabulator === "undefined") {
            console.error("Tabulator library is not loaded.");
            return;
        }

        this.disposeTableInstance(elementId);

        data = Array.isArray(data) ? data : [];
        baskets = Array.isArray(baskets) ? baskets : [];

        data = data.map(
            row =>
                window.tabulatorTest.cloneRowData(row)
        );

        const directTypingFields = new Set([
            "workOrderNumber",
            "workTypeCode",
            "assignmentDate",
            "basket"
        ]);

        const state = this.createGridState(
            data,
            baskets
        );
        this.states[elementId] = state;

        this.rebuildIdentityIndex(
            elementId,
            data
        );

        this.ensureStructureUi(elementId);

        const viewportLocked =
            this.applyViewportLock(state);

        const initialTableHeight = viewportLocked
            ? this.calculateViewportTableHeight(element)
            : 650;

        const table = new Tabulator(element, {
            data: data,
            index: "id",

            height: `${initialTableHeight}px`,
            layout: "fitColumns",
            renderVertical: "virtual",

            /*
             * One central buffer policy for both vertical directions.
             * This limits the number of off-screen rows retained by the
             * Virtual DOM instead of adding direction-specific key fixes.
             */
            renderVerticalBuffer:
                this.virtualDomSettings.renderVerticalBufferPx,

            /*
             * Render popups under document.body. Their final position
             * is calculated from the clicked header icon after render,
             * which avoids page-scroll and container-offset errors.
             */
            popupContainer: false,
            headerSortClickElement: "icon",

            keybindings: {
                navDown: ["40", "13"]
            },

            /*
             * أوقفنا History الافتراضي لأننا سنستخدم
             * Transaction History خاصًا بنا.
             */
            history: false,

            selectableRange: 1,
            selectableRangeInitializeDefault: false,

            /*
             * Tabulator 6.5 creates a temporary default range whenever a new
             * mouse selection starts. With Virtual DOM, that temporary range
             * can point to the first active row while its cell element is not
             * currently attached to document, which makes the browser log:
             * "addRange(): The given range isn't in document."
             *
             * Disable only Tabulator's automatic native DOM focus for that
             * temporary range. The real clicked cell is still focused by
             * Tabulator's normal click path, and programmatic focus after
             * structural operations remains owned by focusRow.
             */
            selectableRangeAutoFocus: false,

            selectableRangeColumns: true,
            selectableRangeRows: true,
            selectableRangeClearCells: false,
            selectableRangeClearCellsValue: "",

            /*
             * Phase 5B gives the custom clipboard core exclusive ownership
             * of copy and paste. Excel round-trip, empty cells, quoted text,
             * multiline values, undo/redo and save/refresh were verified in
             * Phase 5A, so Tabulator's parallel clipboard path is disabled.
             */
            clipboard: false,

            editTriggerEvent: "dblclick",
            editorEmptyValue: undefined,

            rowHeader: {
                field: "rowNumber",
                formatter: "rownum",

                width: 55,
                frozen: true,
                resizable: false,

                headerSort: false,
                hozAlign: "center"
            },

            columnDefaults: {
                headerHozAlign: "center",
                vertAlign: "middle",
                resizable: "header"
            },

            rowFormatter: function (row) {
                window.tabulatorTest.applyValidationStylesToRow(
                    elementId,
                    row
                );
            },

            columns: [
                {
                    title: "Work Order Number",
                    field: "workOrderNumber",
                    editor:
                        window.tabulatorTest.fixedDigitsEditor,
                    editorParams: {
                        requiredLength: 9
                    },
                    minWidth: 210,
                    widthGrow: 1.15,
                    headerHozAlign: "left"
                },
                {
                    title: "Work Type",
                    field: "workTypeCode",
                    editor:
                        window.tabulatorTest.fixedDigitsEditor,
                    editorParams: {
                        requiredLength: 3
                    },
                    headerSort: false,
                    minWidth: 150,
                    widthGrow: 0.8,
                    headerHozAlign: "left",

                    headerPopupIcon:
                        window.tabulatorFilters.icon(
                            "Filter Work Type"
                        ),

                    headerPopup: function (
                        event,
                        column,
                        onRendered
                    ) {
                        return window.tabulatorFilters
                            .createValuePopup(
                                window.tabulatorTest,
                                elementId,
                                column,
                                onRendered,
                                "workTypeCode"
                            );
                    }
                },
                {
                    title: "Assignment Date",
                    field: "assignmentDate",
                    editor:
                        window.tabulatorTest
                            .assignmentDateEditor,
                    headerSort: false,
                    minWidth: 185,
                    widthGrow: 0.95,
                    headerHozAlign: "left",

                    headerPopupIcon:
                        window.tabulatorFilters.icon(
                            "Filter Assignment Date"
                        ),

                    headerPopup: function (
                        event,
                        column,
                        onRendered
                    ) {
                        return window.tabulatorFilters
                            .createDatePopup(
                                window.tabulatorTest,
                                elementId,
                                column,
                                onRendered
                            );
                    }
                },
                {
                    title: "Basket",
                    field: "basket",
                    editor: "list",
                    headerSort: false,
                    minWidth: 250,
                    widthGrow: 1.45,
                    headerHozAlign: "left",

                    editorParams: {
                        values: baskets,
                        autocomplete: true,
                        listOnEmpty: true,
                        clearable: false,
                        freetext: false,
                        verticalNavigation: "editor",
                        placeholderLoading: "Loading...",
                        placeholderEmpty: "No matching baskets"
                    },

                    headerPopupIcon:
                        window.tabulatorFilters.icon(
                            "Filter Basket"
                        ),

                    headerPopup: function (
                        event,
                        column,
                        onRendered
                    ) {
                        return window.tabulatorFilters
                            .createValuePopup(
                                window.tabulatorTest,
                                elementId,
                                column,
                                onRendered,
                                "basket"
                            );
                    }
                },
                {
                    title: "Status",
                    field: "status",
                    editor: "input",
                    minWidth: 180,
                    widthGrow: 1,
                    headerHozAlign: "left"
                },
                {
                    title: "Notes",
                    field: "notes",
                    editor: "input",
                    minWidth: 310,
                    widthGrow: 2,
                    headerHozAlign: "left"
                }
            ]
        });

        this.tables[elementId] = table;

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

        table.on("tableBuilt", function () {
            window.tabulatorFilters.updateAllIcons(
                window.tabulatorTest,
                elementId
            );

            window.tabulatorTest.bindHeaderFilterSelectionGuards(
                elementId
            );

            window.tabulatorRangeAutoScroll?.attach?.(
                elementId,
                table
            );

            /*
             * The sheet must open without a preselected first cell.
             */
            window.requestAnimationFrame(() => {
                window.tabulatorTest.clearTableRanges(elementId);
            });

            /*
             * Rows loaded from SQL already passed database constraints and
             * server validation. Validate only rows the user changes later.
             */
            window.tabulatorTest.renderStatus(elementId);

            window.tabulatorDiagnostics
                ?.completeGridInitialization?.(
                    initializationDiagnostic
                );

            window.tabulatorTest.recordPerformanceStage(
                elementId,
                "open.grid.table-built",
                openInitializationStartedAt,
                {
                    rows: data.length,
                    expectedRows:
                        Number(openContext?.expectedRows) ||
                        data.length,
                    selectedWorkYear:
                        Number(openContext?.selectedWorkYear) ||
                        null,
                    initializationAttempt:
                        Number(openContext?.initializationAttempt) ||
                        null,
                    measurementId:
                        String(openContext?.measurementId ?? ""),
                    initialPageOpen:
                        openContext?.initialPageOpen === true
                }
            );
        });

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
                oldValue: cell.getValue()
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

            const newValue =
                cell.getValue();

            state.pendingEdit = null;

            if (Object.is(oldValue, newValue)) {
                return;
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
        });

        table.on("rangeChanged", function () {
            state.isActive = true;
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

        this.setStatus(
            elementId,
            `تم تحميل ${data.length.toLocaleString()} أمر عمل من قاعدة البيانات.`
        );
    },

    /*
     * الحقول التي تدخل في حساب الصفوف غير المحفوظة.
     */
    dirtyFields: [
        "displayOrder",
        "workOrderNumber",
        "workTypeCode",
        "assignmentDate",
        "basket",
        "status",
        "notes"
    ],

    normalizeDirtyValue: function (value) {
        return value === null || value === undefined
            ? ""
            : String(value);
    },

    createDirtySnapshot: function (rowData) {
        const snapshot = {
            rowVersion: rowData?.rowVersion ?? ""
        };

        const fields =
            typeof this.getTrackableFieldKeys === "function"
                ? this.getTrackableFieldKeys()
                : this.dirtyFields;

        for (const field of fields) {
            snapshot[field] =
                this.normalizeDirtyValue(
                    rowData?.[field]
                );
        }

        return snapshot;
    },

    refreshDirtyRows: function (
        elementId,
        rowIds,
        changedFieldsByRowHint = null
    ) {
        const table =
            this.tables[elementId];

        const state =
            this.states[elementId];

        if (!table || !state) {
            return;
        }

        const uniqueRowIds =
            new Map();

        for (const rowId of rowIds ?? []) {
            uniqueRowIds.set(
                String(rowId),
                rowId
            );
        }

        const allTrackableFields =
            typeof this.getTrackableFieldKeys === "function"
                ? this.getTrackableFieldKeys()
                : this.dirtyFields;

        for (const [rowKey, rowId] of uniqueRowIds) {
            const row =
                table.getRow(rowId);

            if (!row) {
                state.dirtyRowIds.delete(rowKey);
                state.changedFieldsByRow?.delete(rowKey);
                continue;
            }

            const currentSnapshot =
                this.createDirtySnapshot(
                    row.getData()
                );

            const originalSnapshot =
                state.originalRows.get(rowKey);

            const fieldsToCheck =
                changedFieldsByRowHint instanceof Map &&
                    changedFieldsByRowHint.has(rowKey)
                    ? Array.from(changedFieldsByRowHint.get(rowKey))
                    : allTrackableFields;

            const changedFields = new Set(
                state.changedFieldsByRow?.get(rowKey) ?? []
            );

            if (!originalSnapshot) {
                for (const field of allTrackableFields) {
                    changedFields.add(field);
                }
            } else {
                for (const field of fieldsToCheck) {
                    if (
                        currentSnapshot[field] !==
                        originalSnapshot[field]
                    ) {
                        changedFields.add(field);
                    } else {
                        changedFields.delete(field);
                    }
                }
            }

            if (changedFields.size > 0) {
                state.dirtyRowIds.add(rowKey);
                state.changedFieldsByRow.set(
                    rowKey,
                    changedFields
                );
            } else {
                state.dirtyRowIds.delete(rowKey);
                state.changedFieldsByRow.delete(rowKey);
            }
        }

        this.renderStatus(elementId);
    },

    /*
     * Keep dirty/deleted sets by delta. Existing edited rows retain their
     * state across setData; only rows added, restored, removed, or rarely
     * rebalanced need to be checked again.
     */
    applyStructureDirtyDelta: function (
        elementId,
        insertedRows,
        removedRows,
        additionalDirtyRowIds
    ) {
        const state = this.states[elementId];

        if (!state) {
            return;
        }

        const rowsToRefresh = new Map();

        for (const record of removedRows ?? []) {
            const rowData =
                this.getStructureRowData(record);

            if (!rowData) {
                continue;
            }

            const rowKey = String(rowData.id);
            state.dirtyRowIds.delete(rowKey);
            state.changedFieldsByRow?.delete(rowKey);

            if (state.originalRows.has(rowKey)) {
                state.deletedOriginalRowIds.add(rowKey);
            } else {
                state.deletedOriginalRowIds.delete(rowKey);
            }
        }

        for (const record of insertedRows ?? []) {
            const rowData =
                this.getStructureRowData(record);

            if (!rowData) {
                continue;
            }

            const rowKey = String(rowData.id);
            state.deletedOriginalRowIds.delete(rowKey);
            rowsToRefresh.set(rowKey, rowData.id);
        }

        for (const rowId of additionalDirtyRowIds ?? []) {
            rowsToRefresh.set(
                String(rowId),
                rowId
            );
        }

        if (rowsToRefresh.size > 0) {
            this.refreshDirtyRows(
                elementId,
                rowsToRefresh.values()
            );
        } else {
            this.renderStatus(elementId);
        }
    },

    renderStatus: function (elementId) {
        const statusElement =
            document.getElementById(
                `${elementId}-status`
            );

        if (!statusElement) {
            return;
        }

        const state =
            this.states[elementId];

        const message =
            state?.lastStatusMessage ?? "";

        const dirtyCount =
            state?.dirtyRowIds?.size ?? 0;

        const deletedCount =
            state?.deletedOriginalRowIds?.size ?? 0;

        const unsavedCount =
            dirtyCount + deletedCount;

        const errorCount =
            state?.validationErrors?.size ?? 0;

        const dirtyText =
            `صفوف غير محفوظة: ${unsavedCount.toLocaleString()}`;

        const errorText =
            errorCount > 0
                ? `أخطاء: ${errorCount.toLocaleString()}`
                : "";

        const summaryText =
            errorText
                ? `${dirtyText} | ${errorText}`
                : dirtyText;

        statusElement.textContent =
            message
                ? `${message} | ${summaryText}`
                : summaryText;
    },

    /*
     * ينهي تعديل الخلية الحالية قبل جمع الصفوف المعدلة.
     * هذا يمنع تجاهل آخر قيمة كتبها المستخدم عند الضغط على Save.
     */
    commitActiveEditor: async function (elementId) {
        const element =
            document.getElementById(elementId);

        const activeElement =
            document.activeElement;

        if (
            element &&
            activeElement &&
            element.contains(activeElement) &&
            this.isEditorTarget(activeElement)
        ) {
            activeElement.blur();

            await new Promise(resolve =>
                requestAnimationFrame(resolve)
            );
        }
    },

    /*
     * يعيد الصفوف المعدلة فقط إلى Blazor.
     * لا يعيد كل بيانات الشيت.
     */
    getDirtyRows: async function (elementId) {
        await this.commitActiveEditor(elementId);

        const table =
            this.tables[elementId];

        const state =
            this.states[elementId];

        if (!table || !state) {
            return [];
        }

        const dirtyRows = [];

        for (const rowKey of state.dirtyRowIds) {
            const numericId = Number(rowKey);

            const row = table.getRow(
                Number.isNaN(numericId)
                    ? rowKey
                    : numericId
            );

            if (row) {
                const changedFields =
                    typeof this.getChangedFieldsForRow === "function"
                        ? this.getChangedFieldsForRow(
                            elementId,
                            rowKey
                        )
                        : [];

                dirtyRows.push({
                    ...row.getData(),
                    changedFields:
                        changedFields.length > 0
                            ? changedFields
                            : (
                                typeof this.getTrackableFieldKeys === "function"
                                    ? this.getTrackableFieldKeys()
                                    : this.dirtyFields
                            )
                });
            }
        }

        return dirtyRows;
    },

    /*
     * ينقل تغييرات الحفظ إلى Blazor كـ stream بدل JSON SignalR واحد.
     * هذا يمنع فصل الـCircuit عند حفظ مئات أو آلاف الصفوف، مع حد
     * أقصى مقيد على جانب .NET بدل رفع حد الرسائل لكل التطبيق.
     */
    getSaveDeltaStream: async function (elementId) {
        const startedAt =
            this.getPerformanceTimestamp();

        const dirtyRows =
            await this.getDirtyRows(elementId);

        const deletedRows =
            await this.getDeletedRows(elementId);

        const json = JSON.stringify({
            dirtyRows: dirtyRows,
            deletedRows: deletedRows
        });

        const bytes =
            new TextEncoder().encode(json);

        this.recordPerformanceStage(
            elementId,
            "save.delta.build-stream",
            startedAt,
            {
                dirtyRows: dirtyRows.length,
                deletedRows: deletedRows.length,
                bytes: bytes.byteLength
            }
        );

        return bytes;
    },

    /*
     * البحث المستقل برقم أمر العمل.
     * بقية الفلاتر موجودة في tabulatorFilters.js.
     */
    filterByWorkOrder: function (elementId, value) {
        const state = this.states[elementId];

        if (!state) {
            return;
        }

        state.externalFilters.workOrderNumber =
            String(value ?? "").trim();

        window.tabulatorFilters.apply(
            this,
            elementId
        );
    },

    /*
     * هل الحدث داخل محرر نص أو قائمة؟
     * في هذه الحالة نترك المتصفح والمحرر يتعاملان
     * مع الاختصارات بشكل طبيعي.
     */
    isEditorTarget: function (target) {
        return (
            target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            target instanceof HTMLSelectElement ||
            target?.isContentEditable === true
        );
    },

    /*
     * إرجاع آخر نطاق محدد داخل الشيت.
     */
    getActiveRange: function (table) {
        if (!table) {
            return null;
        }

        const ranges =
            table.getRanges();

        if (
            !Array.isArray(ranges) ||
            ranges.length === 0
        ) {
            return null;
        }

        return ranges[ranges.length - 1];
    },

    /*
     * Phase 7B2 - one shared redraw boundary for bulk cell operations.
     * Paste, range clear, and their Undo/Redo paths keep their proven
     * CellComponent logic, but Tabulator is allowed to redraw only once after
     * all values are applied. This removes three duplicated redraw patterns
     * without replacing the table or introducing a parallel data path.
     */
    runCellMutationBatch: function (
        elementId,
        mutation
    ) {
        const table =
            this.tables[elementId];

        const state =
            this.states[elementId];

        if (
            !table ||
            !state ||
            typeof mutation !== "function"
        ) {
            return undefined;
        }

        const canBlockRedraw =
            typeof table.blockRedraw === "function" &&
            typeof table.restoreRedraw === "function";

        if (canBlockRedraw) {
            table.blockRedraw();
        }

        state.applyingHistory = true;

        try {
            return mutation.call(this);
        } finally {
            state.applyingHistory = false;

            if (canBlockRedraw) {
                table.restoreRedraw();
            }
        }
    },

    /*
     * Tabulator 6.5 can move the logical range one row above the visible
     * viewport while navigating upward through a Virtual DOM boundary.
     * The range remains valid, but its active cell is hidden above the
     * table by approximately one row. Correct only that confirmed upward
     * edge case without replacing Tabulator range selection.
     */
    /*
     * A held vertical arrow generates repeated keydown events independently
     * of rendering. If Tabulator takes longer than one frame, those events
     * can queue up and replay later in either direction.
     *
     * Keep normal taps untouched. For browser-generated repeat events only,
     * use one shared ArrowUp/ArrowDown/Enter gate, allow one vertical
     * navigation per rendered frame, and discard stale repeats from that
     * frame.
     */
    allowVerticalNavigationEvent: function (
        elementId,
        event
    ) {
        const state = this.states[elementId];

        if (!state) {
            return true;
        }

        if (
            event?.repeat === true &&
            state.verticalNavigationFrame !== null
        ) {
            return false;
        }

        if (state.verticalNavigationFrame === null) {
            state.verticalNavigationFrame =
                window.requestAnimationFrame(() => {
                    const currentState =
                        this.states[elementId];

                    if (currentState) {
                        currentState.verticalNavigationFrame = null;
                    }
                });
        }

        return true;
    },

    captureTableViewportPosition: function (table) {
        const holder = table?.element?.querySelector(
            ".tabulator-tableholder"
        );

        if (!holder) {
            return null;
        }

        const holderBounds = holder.getBoundingClientRect();
        let anchorRow = null;
        let anchorElement = null;
        let anchorTop = Number.POSITIVE_INFINITY;

        /*
         * Preserve a logical row anchor instead of raw scrollTop only.
         * A browser resize can change column widths and row geometry, so
         * the same pixel offset may point at a different row afterwards.
         */
        for (const row of table.getRows("visible")) {
            const rowElement = row?.getElement?.();

            if (!rowElement || !rowElement.isConnected) {
                continue;
            }

            const rowBounds = rowElement.getBoundingClientRect();
            const intersectsViewport =
                rowBounds.bottom > holderBounds.top + 1 &&
                rowBounds.top < holderBounds.bottom - 1;

            if (
                intersectsViewport &&
                rowBounds.top < anchorTop
            ) {
                anchorRow = row;
                anchorElement = rowElement;
                anchorTop = rowBounds.top;
            }
        }

        return {
            anchorRowIndex: anchorRow?.getIndex?.() ?? null,
            anchorOffsetTop: anchorElement
                ? anchorElement.getBoundingClientRect().top -
                holderBounds.top
                : null,
            scrollTop: holder.scrollTop,
            scrollLeft: holder.scrollLeft
        };
    },

    scheduleTableViewportPositionRestore: function (
        elementId,
        position,
        frames
    ) {
        const state = this.states[elementId];
        const table = this.tables[elementId];

        if (!state || !table || !position) {
            return false;
        }

        if (state.resizeViewportRestoreFrame !== null) {
            window.cancelAnimationFrame(
                state.resizeViewportRestoreFrame
            );
            state.resizeViewportRestoreFrame = null;
        }

        state.resizeViewportRestoreGeneration += 1;
        const restoreGeneration =
            state.resizeViewportRestoreGeneration;

        state.resizeViewportPosition = {
            anchorRowIndex:
                position.anchorRowIndex ?? null,
            anchorOffsetTop:
                Number.isFinite(position.anchorOffsetTop)
                    ? Number(position.anchorOffsetTop)
                    : null,
            scrollTop: Math.max(0, Number(position.scrollTop) || 0),
            scrollLeft: Math.max(0, Number(position.scrollLeft) || 0)
        };
        state.resizeViewportRestoreFramesRemaining =
            Number.isInteger(frames)
                ? Math.max(1, frames)
                : 4;

        const restoreOnFrame = () => {
            const currentState = this.states[elementId];
            const currentTable = this.tables[elementId];
            const holder = currentTable?.element?.querySelector(
                ".tabulator-tableholder"
            );

            if (
                !currentState ||
                currentState.resizeViewportRestoreGeneration !==
                restoreGeneration
            ) {
                return;
            }

            currentState.resizeViewportRestoreFrame = null;

            const saved =
                currentState.resizeViewportPosition;

            if (holder && saved) {
                holder.scrollLeft = saved.scrollLeft;

                const anchorRow =
                    saved.anchorRowIndex !== null
                        ? currentTable.getRow(saved.anchorRowIndex)
                        : null;
                const anchorElement =
                    anchorRow?.getElement?.();

                if (
                    anchorElement?.isConnected &&
                    Number.isFinite(saved.anchorOffsetTop)
                ) {
                    const holderBounds =
                        holder.getBoundingClientRect();
                    const currentOffset =
                        anchorElement.getBoundingClientRect().top -
                        holderBounds.top;
                    const offsetDelta =
                        currentOffset - saved.anchorOffsetTop;

                    if (Math.abs(offsetDelta) > 0.5) {
                        holder.scrollTop = Math.max(
                            0,
                            holder.scrollTop + offsetDelta
                        );
                    }
                } else {
                    holder.scrollTop = saved.scrollTop;
                }
            }

            currentState.resizeViewportRestoreFramesRemaining =
                Math.max(
                    0,
                    currentState.resizeViewportRestoreFramesRemaining - 1
                );

            if (
                currentState.resizeViewportRestoreFramesRemaining > 0
            ) {
                currentState.resizeViewportRestoreFrame =
                    window.requestAnimationFrame(restoreOnFrame);
            } else {
                currentState.resizeViewportPosition = null;
            }
        };

        const beginFrameRestore = () => {
            const currentState = this.states[elementId];

            if (
                !currentState ||
                currentState.resizeViewportRestoreGeneration !==
                restoreGeneration
            ) {
                return;
            }

            currentState.resizeViewportRestoreFrame =
                window.requestAnimationFrame(restoreOnFrame);
        };

        const anchorRowIndex =
            state.resizeViewportPosition.anchorRowIndex;

        if (
            anchorRowIndex !== null &&
            typeof table.scrollToRow === "function"
        ) {
            try {
                Promise.resolve(
                    table.scrollToRow(
                        anchorRowIndex,
                        "top",
                        false
                    )
                )
                    .catch(() => false)
                    .finally(beginFrameRestore);
            } catch {
                beginFrameRestore();
            }
        } else {
            beginFrameRestore();
        }

        return true;
    },

    correctArrowUpRangeViewport: function (elementId) {
        const table = this.tables[elementId];

        if (!table) {
            return false;
        }

        const range = this.getActiveRange(table);
        const bounds = range?.getBounds?.();
        const activeCell = bounds?.start;
        const cellElement = activeCell?.getElement?.();
        const holder = table.element?.querySelector(
            ".tabulator-tableholder"
        );

        if (
            !holder ||
            !cellElement ||
            !cellElement.isConnected
        ) {
            return false;
        }

        const holderBounds =
            holder.getBoundingClientRect();
        const cellBounds =
            cellElement.getBoundingClientRect();

        const hiddenPixels =
            holderBounds.top - cellBounds.top;

        /*
         * Ignore sub-pixel and border differences. The actual bug is a
         * full-row gap (about 40px in this sheet).
         */
        if (hiddenPixels <= 2) {
            return true;
        }

        holder.scrollTop = Math.max(
            0,
            holder.scrollTop - Math.ceil(hiddenPixels)
        );

        return true;
    },

    queueArrowUpRangeViewportCorrection: function (
        elementId,
        attempts
    ) {
        const state = this.states[elementId];

        if (!state) {
            return false;
        }

        const requestedFrames =
            Number.isInteger(attempts)
                ? Math.max(1, attempts)
                : 3;

        /*
         * Do not create one RAF chain for every repeated ArrowUp key.
         * Keep one shared chain and let each newer key refresh the quiet
         * settle window. The callback always reads the latest active range.
         */
        state.arrowUpCorrectionFramesRemaining =
            Math.max(
                state.arrowUpCorrectionFramesRemaining || 0,
                requestedFrames
            );

        if (state.arrowUpCorrectionFrame !== null) {
            return true;
        }

        const runCorrectionFrame = () => {
            const currentState =
                this.states[elementId];

            if (!currentState) {
                return;
            }

            currentState.arrowUpCorrectionFrame = null;

            this.correctArrowUpRangeViewport(
                elementId
            );

            currentState.arrowUpCorrectionFramesRemaining =
                Math.max(
                    0,
                    (currentState
                        .arrowUpCorrectionFramesRemaining || 0) - 1
                );

            if (
                currentState
                    .arrowUpCorrectionFramesRemaining <= 0
            ) {
                return;
            }

            currentState.arrowUpCorrectionFrame =
                window.requestAnimationFrame(
                    runCorrectionFrame
                );
        };

        state.arrowUpCorrectionFrame =
            window.requestAnimationFrame(
                runCorrectionFrame
            );

        return true;
    },

    createClientKey: function () {
        if (
            window.crypto &&
            typeof window.crypto.randomUUID ===
            "function"
        ) {
            return window.crypto.randomUUID();
        }

        return (
            "row-" +
            Date.now().toString(36) +
            "-" +
            Math.random().toString(36).slice(2)
        );
    },

    ensureClientKey: function (rowData) {
        const existing = String(
            rowData?.clientKey ?? ""
        ).trim();

        if (existing) {
            return existing;
        }

        const id = Number(rowData?.id);

        if (Number.isFinite(id) && id > 0) {
            return `db:${id}`;
        }

        return `temp:${this.createClientKey()}`;
    },

    cloneRowData: function (rowData) {
        /*
         * Preserve every field, including future user-defined columns.
         * Core fields still receive safe defaults, but adding a custom column
         * must not require editing this shared clone function.
         */
        const clone = {
            ...(rowData ?? {})
        };

        clone.id = rowData?.id;
        clone.clientKey = this.ensureClientKey(rowData);
        clone.displayOrder = Number(rowData?.displayOrder) || 0;
        clone.workOrderNumber = rowData?.workOrderNumber ?? "";
        clone.workTypeCode = rowData?.workTypeCode ?? "";
        clone.assignmentDate = rowData?.assignmentDate ?? "";
        clone.basket = rowData?.basket ?? "";
        clone.status = rowData?.status ?? "";
        clone.notes = rowData?.notes ?? "";
        clone.rowVersion = Array.isArray(rowData?.rowVersion)
            ? Array.from(rowData.rowVersion)
            : rowData?.rowVersion ?? "";

        return clone;
    },

    /*
     * M5C1 diagnostics only: record named save-delta stages in the existing
     * Performance Observatory. When performance mode is off this is a no-op,
     * so the production save path and data behaviour remain unchanged.
     */
    getPerformanceTimestamp: function () {
        return window.performance &&
            typeof window.performance.now === "function"
            ? window.performance.now()
            : Date.now();
    },

    recordPerformanceStage: function (
        elementId,
        name,
        startedAt,
        metadata = null
    ) {
        const profiler =
            window.tabulatorPerformance;

        if (
            !profiler?.active ||
            typeof profiler.recordDuration !==
            "function"
        ) {
            return;
        }

        const duration =
            this.getPerformanceTimestamp() -
            startedAt;

        profiler.recordDuration(
            elementId,
            name,
            duration,
            metadata,
            false
        );
    },

    /*
     * Phase 7B3 diagnostics only.
     * Blazor measures the save stages that happen outside JavaScript and sends
     * them back in one batch. Recording is a no-op unless the existing
     * Performance Observatory is active. The temporary C# measurement patch
     * uses only a small number of Stopwatch samples per Save operation.
     */
    recordExternalPerformanceStages: function (
        elementId,
        stages
    ) {
        const profiler =
            window.tabulatorPerformance;

        if (
            !profiler?.active ||
            typeof profiler.recordDuration !==
                "function" ||
            !Array.isArray(stages)
        ) {
            return;
        }

        for (const stage of stages) {
            const name =
                String(stage?.name ?? "").trim();
            const durationMs =
                Number(stage?.durationMs);

            if (
                !name ||
                !Number.isFinite(durationMs)
            ) {
                continue;
            }

            profiler.recordDuration(
                elementId,
                name,
                durationMs,
                stage?.metadata ?? null,
                false
            );
        }
    },

    focusRow: function (
        elementId,
        rowId
    ) {
        const table =
            this.tables[elementId];

        const state =
            this.states[elementId];

        if (!table || !state) {
            return;
        }

        const row =
            table.getRow(rowId);

        const cell =
            row?.getCell(
                "workOrderNumber"
            );

        if (!row || !cell) {
            return;
        }

        const selectCell = function () {
            for (const range of table.getRanges()) {
                range.remove();
            }

            table.addRange(cell, cell);

            state.activeCell = {
                rowId: row.getIndex(),
                field: "workOrderNumber"
            };

            const focusRenderedCell =
                function (remainingAttempts) {
                    let element = null;

                    try {
                        element =
                            cell.getElement();
                    } catch {
                        return;
                    }

                    if (
                        element &&
                        typeof element.focus === "function"
                    ) {
                        element.focus({
                            preventScroll: true
                        });

                        return;
                    }

                    if (remainingAttempts > 0) {
                        window.requestAnimationFrame(
                            function () {
                                focusRenderedCell(
                                    remainingAttempts - 1
                                );
                            }
                        );
                    }
                };

            window.requestAnimationFrame(
                function () {
                    focusRenderedCell(2);
                }
            );
        };

        table
            .scrollToRow(
                row,
                "center",
                false
            )
            .then(selectCell)
            .catch(selectCell);
    },

    getDeletedRows: async function (elementId) {
        await this.commitActiveEditor(elementId);

        const state =
            this.states[elementId];

        if (!state) {
            return [];
        }

        return Array.from(
            state.deletedOriginalRowIds
        ).map(function (rowId) {
            const originalSnapshot =
                state.originalRows.get(
                    String(rowId)
                );

            return {
                id: Number(rowId),
                rowVersion:
                    originalSnapshot?.rowVersion ?? ""
            };
        });
    },

    setSaving: function (
        elementId,
        isSaving
    ) {
        const element =
            document.getElementById(elementId);

        const state =
            this.states[elementId];

        if (!element || !state) {
            return;
        }

        state.isSaving = Boolean(isSaving);

        if (state.isSaving) {
            const activeElement =
                document.activeElement;

            if (
                activeElement &&
                element.contains(activeElement) &&
                typeof activeElement.blur ===
                "function"
            ) {
                activeElement.blur();
            }

            element.style.pointerEvents = "none";
            element.setAttribute(
                "aria-busy",
                "true"
            );
        } else {
            element.style.pointerEvents = "";
            element.removeAttribute("aria-busy");
        }
    },

    /*
     * نستخدم ClientKey ثابتًا داخل جلسة المتصفح، منفصلًا عن Id
     * القادم من SQL Server. بهذا يمكن إعادة ربط سجل Undo/Redo
     * بعد أن تتحول IDs المؤقتة للصفوف الجديدة إلى IDs حقيقية.
     */
    rebaseHistoryAfterSave: function (
        state,
        oldRows,
        savedRows,
        savedRowMappings
    ) {
        const oldClientKeyById = new Map();
        const oldIdByClientKey = new Map();

        for (const row of oldRows ?? []) {
            const clientKey =
                this.ensureClientKey(row);

            oldClientKeyById.set(
                String(row.id),
                clientKey
            );

            oldIdByClientKey.set(
                clientKey,
                row.id
            );
        }

        const mappedClientKeyByDatabaseId =
            new Map();

        for (const mapping of savedRowMappings ?? []) {
            const clientKey = String(
                mapping?.clientKey ?? ""
            ).trim();

            const databaseId = Number(
                mapping?.databaseId
            );

            if (
                clientKey &&
                Number.isFinite(databaseId) &&
                databaseId > 0
            ) {
                mappedClientKeyByDatabaseId.set(
                    String(databaseId),
                    clientKey
                );
            }
        }

        const preparedRows = (savedRows ?? []).map(
            row => {
                const databaseId = Number(row?.id);

                const clientKey =
                    mappedClientKeyByDatabaseId.get(
                        String(databaseId)
                    ) ||
                    oldClientKeyById.get(
                        String(databaseId)
                    ) ||
                    this.ensureClientKey(row);

                return this.cloneRowData({
                    ...row,
                    clientKey: clientKey
                });
            }
        );

        const currentIdByClientKey = new Map(
            preparedRows.map(
                row => [
                    row.clientKey,
                    row.id
                ]
            )
        );

        const currentRowVersionByClientKey = new Map(
            preparedRows.map(
                row => [
                    row.clientKey,
                    row.rowVersion ?? ""
                ]
            )
        );

        const temporaryIdByClientKey = new Map();
        const usedIds = new Set(
            preparedRows.map(
                row => String(row.id)
            )
        );

        const allocateTemporaryId = clientKey => {
            if (
                temporaryIdByClientKey.has(
                    clientKey
                )
            ) {
                return temporaryIdByClientKey.get(
                    clientKey
                );
            }

            let candidate =
                Number(
                    oldIdByClientKey.get(clientKey)
                );

            if (
                !Number.isFinite(candidate) ||
                candidate >= 0 ||
                usedIds.has(String(candidate))
            ) {
                candidate = state.nextTemporaryId;

                while (
                    usedIds.has(String(candidate))
                ) {
                    candidate--;
                }
            }

            state.nextTemporaryId =
                Math.min(
                    state.nextTemporaryId,
                    candidate - 1
                );

            usedIds.add(String(candidate));
            temporaryIdByClientKey.set(
                clientKey,
                candidate
            );

            return candidate;
        };

        const resolveRowId = (
            clientKey,
            fallbackId
        ) => {
            if (
                currentIdByClientKey.has(
                    clientKey
                )
            ) {
                return currentIdByClientKey.get(
                    clientKey
                );
            }

            return allocateTemporaryId(
                clientKey ||
                this.ensureClientKey({
                    id: fallbackId
                })
            );
        };

        const rebaseStack = stack => {
            for (const transaction of stack ?? []) {
                if (transaction?.kind === "filter") {
                    continue;
                }

                if (
                    transaction?.kind === "structure" &&
                    Array.isArray(transaction.rows)
                ) {
                    for (const record of transaction.rows) {
                        const rowData = record?.data;

                        if (!rowData) {
                            continue;
                        }

                        const clientKey =
                            String(
                                rowData.clientKey ?? ""
                            ).trim() ||
                            oldClientKeyById.get(
                                String(rowData.id)
                            ) ||
                            this.ensureClientKey(rowData);

                        rowData.clientKey = clientKey;
                        rowData.id = resolveRowId(
                            clientKey,
                            rowData.id
                        );
                        rowData.rowVersion =
                            currentRowVersionByClientKey.get(
                                clientKey
                            ) ?? "";
                    }

                    continue;
                }

                if (!Array.isArray(transaction?.changes)) {
                    continue;
                }

                for (const change of transaction.changes) {
                    const clientKey =
                        String(
                            change.clientKey ?? ""
                        ).trim() ||
                        oldClientKeyById.get(
                            String(change.rowId)
                        ) ||
                        this.ensureClientKey({
                            id: change.rowId
                        });

                    change.clientKey = clientKey;
                    change.rowId = resolveRowId(
                        clientKey,
                        change.rowId
                    );
                }
            }
        };

        rebaseStack(state.undoStack);
        rebaseStack(state.redoStack);

        return preparedRows;
    },

    /*
     * يطبق نتيجة الحفظ على الصفوف المتأثرة فقط.
     * لا يعيد تحميل بيانات الشيت ولا يستبدل آلاف الصفوف السليمة.
     */
    applySavedDelta: async function (
        elementId,
        savedRows,
        savedRowMappings,
        removedRowIds
    ) {
        const table =
            this.tables[elementId];

        const state =
            this.states[elementId];

        if (!table || !state) {
            return;
        }

        const prepareInputsStartedAt =
            this.getPerformanceTimestamp();

        savedRows = Array.isArray(savedRows)
            ? savedRows.map(row =>
                this.cloneRowData(row))
            : [];

        savedRowMappings =
            Array.isArray(savedRowMappings)
                ? savedRowMappings
                : [];

        removedRowIds =
            Array.isArray(removedRowIds)
                ? removedRowIds
                : [];

        this.recordPerformanceStage(
            elementId,
            "save.delta.prepare-inputs",
            prepareInputsStartedAt,
            {
                savedRows: savedRows.length,
                mappings: savedRowMappings.length,
                removedRows: removedRowIds.length
            }
        );

        const snapshotCurrentStartedAt =
            this.getPerformanceTimestamp();

        const oldRows = table
            .getData()
            .map(row =>
                this.cloneRowData(row));

        this.recordPerformanceStage(
            elementId,
            "save.delta.snapshot-current",
            snapshotCurrentStartedAt,
            { rows: oldRows.length }
        );

        const buildMapsStartedAt =
            this.getPerformanceTimestamp();

        const savedById = new Map(
            savedRows.map(row => [
                String(row.id),
                row
            ])
        );

        const savedByClientKey = new Map(
            savedRows.map(row => [
                String(row.clientKey),
                row
            ])
        );

        const mappingByTemporaryId = new Map();
        const mappedClientKeyByDatabaseId =
            new Map();

        for (const mapping of savedRowMappings) {
            const temporaryId =
                Number(mapping?.temporaryId);

            const databaseId =
                Number(mapping?.databaseId);

            const clientKey = String(
                mapping?.clientKey ?? ""
            ).trim();

            if (
                Number.isFinite(temporaryId) &&
                Number.isFinite(databaseId) &&
                databaseId > 0
            ) {
                mappingByTemporaryId.set(
                    String(temporaryId),
                    databaseId
                );

                if (clientKey) {
                    mappedClientKeyByDatabaseId.set(
                        String(databaseId),
                        clientKey
                    );
                }
            }
        }

        const removedIdSet = new Set(
            removedRowIds.map(id =>
                String(id))
        );

        this.recordPerformanceStage(
            elementId,
            "save.delta.build-maps",
            buildMapsStartedAt,
            {
                savedById: savedById.size,
                savedByClientKey:
                    savedByClientKey.size,
                temporaryMappings:
                    mappingByTemporaryId.size,
                removedIds: removedIdSet.size
            }
        );

        const composeFinalStartedAt =
            this.getPerformanceTimestamp();

        const includedSavedIds = new Set();
        const finalRows = [];

        for (const oldRow of oldRows) {
            const oldIdKey =
                String(oldRow.id);

            if (removedIdSet.has(oldIdKey)) {
                continue;
            }

            const mappedDatabaseId =
                mappingByTemporaryId.get(oldIdKey);

            let savedRow = null;

            if (mappedDatabaseId !== undefined) {
                savedRow = savedById.get(
                    String(mappedDatabaseId)
                ) ?? null;
            }

            if (!savedRow) {
                savedRow =
                    savedById.get(oldIdKey) ??
                    savedByClientKey.get(
                        String(oldRow.clientKey)
                    ) ??
                    null;
            }

            if (savedRow) {
                const preparedSavedRow =
                    this.cloneRowData({
                        ...savedRow,
                        clientKey:
                            oldRow.clientKey ||
                            savedRow.clientKey ||
                            mappedClientKeyByDatabaseId.get(
                                String(savedRow.id)
                            )
                    });

                finalRows.push(preparedSavedRow);
                includedSavedIds.add(
                    String(preparedSavedRow.id)
                );
            } else {
                finalRows.push(oldRow);
            }
        }

        for (const savedRow of savedRows) {
            const savedIdKey =
                String(savedRow.id);

            if (includedSavedIds.has(savedIdKey)) {
                continue;
            }

            finalRows.push(
                this.cloneRowData({
                    ...savedRow,
                    clientKey:
                        savedRow.clientKey ||
                        mappedClientKeyByDatabaseId.get(
                            savedIdKey
                        )
                })
            );
        }

        finalRows.sort((first, second) => {
            const orderDifference =
                Number(first.displayOrder) -
                Number(second.displayOrder);

            if (orderDifference !== 0) {
                return orderDifference;
            }

            return Number(first.id) -
                Number(second.id);
        });

        const minimumCurrentId =
            finalRows.reduce(
                (minimum, row) => {
                    const id = Number(row?.id);

                    return Number.isFinite(id)
                        ? Math.min(minimum, id)
                        : minimum;
                },
                0
            );

        state.nextTemporaryId =
            minimumCurrentId <= 0
                ? minimumCurrentId - 1
                : -1;

        this.recordPerformanceStage(
            elementId,
            "save.delta.compose-final",
            composeFinalStartedAt,
            {
                oldRows: oldRows.length,
                finalRows: finalRows.length,
                includedSavedRows:
                    includedSavedIds.size
            }
        );

        const rebaseHistoryStartedAt =
            this.getPerformanceTimestamp();

        const rebasedRows =
            this.rebaseHistoryAfterSave(
                state,
                oldRows,
                finalRows,
                savedRowMappings
            );

        this.recordPerformanceStage(
            elementId,
            "save.delta.rebase-history",
            rebaseHistoryStartedAt,
            {
                rows: rebasedRows.length,
                undoTransactions:
                    state.undoStack?.length ?? 0,
                redoTransactions:
                    state.redoStack?.length ?? 0
            }
        );

        const captureValidationStartedAt =
            this.getPerformanceTimestamp();

        const validationRowIds = new Set(
            Array.from(
                state.validationErrors.values()
            ).map(error => error.rowId)
        );

        this.recordPerformanceStage(
            elementId,
            "save.delta.capture-validation",
            captureValidationStartedAt,
            { rows: validationRowIds.size }
        );

        state.applyingHistory = true;

        try {
            /*
             * Tabulator's public getRow API writes a console warning whenever
             * the requested row is absent. During save reconciliation, absent
             * temporary/database rows are expected while their ids are being
             * replaced. Build one quiet lookup from all current rows instead
             * of using getRow as an existence probe.
             */
            const lookupCurrentStartedAt =
                this.getPerformanceTimestamp();

            const currentRowsById = new Map(
                table.getRows().map(row => [
                    String(row.getIndex()),
                    row
                ])
            );

            this.recordPerformanceStage(
                elementId,
                "save.delta.lookup-current",
                lookupCurrentStartedAt,
                { rows: currentRowsById.size }
            );

            const planMutationsStartedAt =
                this.getPerformanceTimestamp();

            /*
             * Saved new rows already exist in the table under a temporary
             * client-side id. Reconcile those rows in place through their
             * RowComponent instead of deleting the temporary row and adding
             * a second row with the database id. This preserves the rendered
             * row, selection/range ownership and virtual-DOM position while
             * avoiding two expensive structural refreshes per saved row.
             */
            const rowIdsToDelete = new Set(
                removedRowIds.map(id =>
                    String(id))
            );

            const rekeyPlans = [];

            const rebasedRowsById = new Map(
                rebasedRows.map(row => [
                    String(row.id),
                    row
                ])
            );

            for (const mapping of savedRowMappings) {
                const temporaryId =
                    Number(mapping?.temporaryId);

                const databaseId =
                    Number(mapping?.databaseId);

                if (
                    !Number.isFinite(temporaryId) ||
                    !Number.isFinite(databaseId) ||
                    databaseId <= 0
                ) {
                    continue;
                }

                const temporaryKey =
                    String(temporaryId);

                const databaseKey =
                    String(databaseId);

                const temporaryRow =
                    currentRowsById.get(temporaryKey) ??
                    null;

                const databaseRow =
                    currentRowsById.get(databaseKey) ??
                    null;

                const savedRow =
                    rebasedRowsById.get(databaseKey) ??
                    savedById.get(databaseKey) ??
                    null;

                if (
                    temporaryRow &&
                    savedRow &&
                    (!databaseRow ||
                        databaseRow === temporaryRow)
                ) {
                    /*
                     * This temporary row will be converted in place to its
                     * database id. Keep it out of the structural delete set;
                     * deleting it first would make the subsequent rekey work
                     * on a detached RowComponent and would trigger an
                     * unnecessary bulk delete during save reconciliation.
                     */
                    rowIdsToDelete.delete(temporaryKey);

                    rekeyPlans.push({
                        temporaryKey,
                        databaseKey,
                        row: temporaryRow,
                        data: savedRow
                    });

                    continue;
                }

                /*
                 * Defensive fallback for an unexpected id collision or an
                 * incomplete server response. The old delete/insert route is
                 * retained only for that exceptional case.
                 */
                if (temporaryRow) {
                    rowIdsToDelete.add(temporaryKey);
                }
            }

            const rowsToDelete = [];

            for (const rowId of rowIdsToDelete) {
                const row =
                    currentRowsById.get(String(rowId));

                if (row) {
                    rowsToDelete.push(row);
                }
            }

            const rekeyedDatabaseIds = new Set(
                rekeyPlans.map(plan =>
                    plan.databaseKey)
            );

            /*
             * The edited values are already visible in the grid before Save.
             * The server response usually changes only hidden technical data
             * such as RowVersion. Re-applying every complete saved row through
             * Tabulator makes thousands of rendered rows look "changed" again
             * and leaves navigation fatigued until the grid is recreated.
             *
             * Merge technical values directly into the row data object and
             * ask Tabulator to refresh only sheet fields whose server value
             * actually differs from what the user already has.
             *
             * Sheet fields are discovered from the current grid columns,
             * including user-hidden columns, so filters/sorts and future
             * custom columns stay correct without hard-coded field names.
             */
            const sheetFieldKeys = new Set(
                table.getColumns()
                    .map(column => column.getField?.())
                    .filter(field =>
                        typeof field === "string" &&
                        field.trim() !== ""
                    )
            );

            const indexField = table.options?.index || "id";
            const rowsToUpdate = [];
            let technicalFieldWrites = 0;
            let sheetFieldWrites = 0;

            for (const savedRow of savedRows) {
                const rowId = String(savedRow.id);

                if (
                    rekeyedDatabaseIds.has(rowId) ||
                    !currentRowsById.has(rowId)
                ) {
                    continue;
                }

                const rowComponent = currentRowsById.get(rowId);
                const currentData = rowComponent.getData();
                const sheetPatch = {
                    [indexField]: savedRow[indexField]
                };
                let hasSheetDifference = false;

                for (const [field, serverValue] of Object.entries(savedRow)) {
                    if (field === indexField) {
                        continue;
                    }

                    const currentValue = currentData?.[field];

                    if (Object.is(currentValue, serverValue)) {
                        continue;
                    }

                    if (sheetFieldKeys.has(field)) {
                        sheetPatch[field] = serverValue;
                        hasSheetDifference = true;
                        sheetFieldWrites++;
                    } else {
                        currentData[field] = serverValue;
                        technicalFieldWrites++;
                    }
                }

                if (hasSheetDifference) {
                    rowsToUpdate.push(sheetPatch);
                }
            }

            const savedIdSet = new Set(
                savedRows.map(row =>
                    String(row.id))
            );

            this.recordPerformanceStage(
                elementId,
                "save.delta.plan-mutations",
                planMutationsStartedAt,
                {
                    rekeyRows: rekeyPlans.length,
                    deleteRows: rowsToDelete.length,
                    updateRows: rowsToUpdate.length,
                    savedIds: savedIdSet.size,
                    sheetFieldWrites: sheetFieldWrites,
                    technicalFieldWrites: technicalFieldWrites
                }
            );

            const deleteRowsStartedAt =
                this.getPerformanceTimestamp();

            if (rowsToDelete.length > 0) {
                await this.deleteRowsWithSingleRedraw(
                    elementId,
                    rowsToDelete,
                    "save.delta.delete-rows"
                );

                for (const rowId of rowIdsToDelete) {
                    currentRowsById.delete(String(rowId));
                }
            }

            this.recordPerformanceStage(
                elementId,
                "save.delta.delete-rows",
                deleteRowsStartedAt,
                { rows: rowsToDelete.length }
            );

            const rekeyRowsStartedAt =
                this.getPerformanceTimestamp();

            let rekeyedRowCount = 0;

            for (const plan of rekeyPlans) {
                /*
                 * A row component update targets the existing row directly,
                 * so changing its index field does not require a getRow probe
                 * or a structural delete/add cycle.
                 */
                await plan.row.update(plan.data);

                currentRowsById.delete(
                    plan.temporaryKey
                );

                currentRowsById.set(
                    plan.databaseKey,
                    plan.row
                );

                rekeyedRowCount++;
            }

            this.recordPerformanceStage(
                elementId,
                "save.delta.rekey-rows",
                rekeyRowsStartedAt,
                { rows: rekeyedRowCount }
            );

            const updateRowsStartedAt =
                this.getPerformanceTimestamp();

            if (rowsToUpdate.length > 0) {
                await table.updateData(
                    rowsToUpdate
                );
            }

            this.recordPerformanceStage(
                elementId,
                "save.delta.update-rows",
                updateRowsStartedAt,
                {
                    rows: rowsToUpdate.length,
                    sheetFieldWrites: sheetFieldWrites,
                    technicalFieldWrites: technicalFieldWrites
                }
            );

            const insertRowsStartedAt =
                this.getPerformanceTimestamp();

            let insertedRowCount = 0;

            for (
                let index = 0;
                index < rebasedRows.length;
                index++
            ) {
                const rowData =
                    rebasedRows[index];

                const rowId =
                    String(rowData.id);

                if (
                    !savedIdSet.has(rowId) ||
                    currentRowsById.has(rowId)
                ) {
                    continue;
                }

                let previousRow = null;

                for (
                    let previousIndex = index - 1;
                    previousIndex >= 0;
                    previousIndex--
                ) {
                    previousRow =
                        currentRowsById.get(
                            String(
                                rebasedRows[previousIndex].id
                            )
                        ) ?? null;

                    if (previousRow) {
                        break;
                    }
                }

                if (previousRow) {
                    const addedRow =
                        await table.addRow(
                            rowData,
                            false,
                            previousRow
                        );

                    currentRowsById.set(
                        rowId,
                        addedRow
                    );

                    insertedRowCount++;

                    continue;
                }

                let nextRow = null;

                for (
                    let nextIndex = index + 1;
                    nextIndex < rebasedRows.length;
                    nextIndex++
                ) {
                    nextRow =
                        currentRowsById.get(
                            String(
                                rebasedRows[nextIndex].id
                            )
                        ) ?? null;

                    if (nextRow) {
                        break;
                    }
                }

                const addedRow =
                    await table.addRow(
                        rowData,
                        true,
                        nextRow || undefined
                    );

                currentRowsById.set(
                    rowId,
                    addedRow
                );

                insertedRowCount++;
            }

            this.recordPerformanceStage(
                elementId,
                "save.delta.insert-rows",
                insertRowsStartedAt,
                { rows: insertedRowCount }
            );

            const snapshotOriginalsStartedAt =
                this.getPerformanceTimestamp();

            state.originalRows = new Map(
                rebasedRows.map(row => [
                    String(row.id),
                    this.createDirtySnapshot(row)
                ])
            );

            this.recordPerformanceStage(
                elementId,
                "save.delta.snapshot-originals",
                snapshotOriginalsStartedAt,
                { rows: state.originalRows.size }
            );

            const rebuildIdentityStartedAt =
                this.getPerformanceTimestamp();

            this.rebuildIdentityIndex(
                elementId,
                rebasedRows
            );

            this.recordPerformanceStage(
                elementId,
                "save.delta.rebuild-identity",
                rebuildIdentityStartedAt,
                {
                    identityKeys:
                        state.identityRows.size,
                    indexedRows:
                        state.rowIdentityKeys.size
                }
            );

            const resetStateStartedAt =
                this.getPerformanceTimestamp();

            state.dirtyRowIds.clear();
            state.changedFieldsByRow.clear();
            state.deletedOriginalRowIds.clear();

            state.validationErrors.clear();
            state.validationRowIds.clear();
            state.validationOrder = [];
            state.activeValidationIndex = -1;

            state.pendingEdit = null;
            state.nextEditMode = null;
            state.currentEditMode = null;
            state.currentEditingCell = null;
            state.activeCell = null;

            this.recordPerformanceStage(
                elementId,
                "save.delta.reset-state",
                resetStateStartedAt,
                {
                    validationErrors:
                        state.validationErrors.size,
                    dirtyRows:
                        state.dirtyRowIds.size,
                    deletedRows:
                        state.deletedOriginalRowIds.size
                }
            );

            const applyFiltersStartedAt =
                this.getPerformanceTimestamp();

            window.tabulatorFilters.apply(
                this,
                elementId
            );

            this.recordPerformanceStage(
                elementId,
                "save.delta.apply-filters",
                applyFiltersStartedAt
            );
        } finally {
            state.applyingHistory = false;
        }

        const restoreValidationStartedAt =
            this.getPerformanceTimestamp();

        for (const rowId of validationRowIds) {
            this.applyValidationStylesToRow(
                elementId,
                rowId
            );
        }

        this.recordPerformanceStage(
            elementId,
            "save.delta.restore-validation",
            restoreValidationStartedAt,
            { rows: validationRowIds.size }
        );

        const renderUiStartedAt =
            this.getPerformanceTimestamp();

        this.syncValidationUi(elementId);
        this.renderStatus(elementId);

        this.recordPerformanceStage(
            elementId,
            "save.delta.render-ui",
            renderUiStartedAt
        );
    },

    hasUnsavedChanges: async function (elementId) {
        await this.commitActiveEditor(elementId);

        const state =
            this.states[elementId];

        if (!state) {
            return false;
        }

        return (
            state.dirtyRowIds.size > 0 ||
            state.deletedOriginalRowIds.size > 0
        );
    },

    setStatus: function (
        elementId,
        message
    ) {
        const state =
            this.states[elementId];

        if (state) {
            state.lastStatusMessage =
                String(message ?? "");
        }

        this.renderStatus(elementId);
    },

    destroy: function (elementId) {
        this.disposeTableInstance(elementId);
    }
};