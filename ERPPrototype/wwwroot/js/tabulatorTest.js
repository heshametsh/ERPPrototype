window.tabulatorTest = {
    tables: {},
    states: {},

    /*
     * يحول التاريخ إلى الشكل المعتمد داخل الشيت:
     * DD/MM/YYYY
     *
     * يقبل:
     * 22/07/2026
     * 22/7/2026
     * 2/7/2026
     * 2026-07-22
     * أرقام Excel التسلسلية الحديثة عند اللصق.
     */
    normalizeAssignmentDate: function (value) {
        if (
            value === null ||
            value === undefined ||
            String(value).trim() === ""
        ) {
            return "";
        }

        if (value instanceof Date) {
            if (Number.isNaN(value.getTime())) {
                return null;
            }

            return this.formatAssignmentDate(
                value.getFullYear(),
                value.getMonth() + 1,
                value.getDate()
            );
        }

        const text = String(value).trim();

        /* DD/MM/YYYY أو D/M/YYYY */
        let match = text.match(
            /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/
        );

        if (match) {
            return this.formatAssignmentDate(
                Number(match[3]),
                Number(match[2]),
                Number(match[1])
            );
        }

        /* YYYY-MM-DD القادم من النظام أو HTML date input */
        match = text.match(
            /^(\d{4})-(\d{1,2})-(\d{1,2})$/
        );

        if (match) {
            return this.formatAssignmentDate(
                Number(match[1]),
                Number(match[2]),
                Number(match[3])
            );
        }

        /*
         * Excel قد يرسل التاريخ كرقم تسلسلي.
         * نقبل النطاق الحديث فقط لتجنب تفسير سنة أو كود كأنه تاريخ.
         */
        if (/^\d+(?:\.\d+)?$/.test(text)) {
            const serial = Number(text);

            if (serial >= 20000 && serial <= 80000) {
                const excelEpoch = Date.UTC(1899, 11, 30);
                const milliseconds =
                    Math.floor(serial) * 86400000;

                const date = new Date(
                    excelEpoch + milliseconds
                );

                return this.formatAssignmentDate(
                    date.getUTCFullYear(),
                    date.getUTCMonth() + 1,
                    date.getUTCDate()
                );
            }
        }

        return null;
    },

    formatAssignmentDate: function (year, month, day) {
        if (
            !Number.isInteger(year) ||
            !Number.isInteger(month) ||
            !Number.isInteger(day) ||
            year < 1900 ||
            year > 9999
        ) {
            return null;
        }

        const date = new Date(
            Date.UTC(year, month - 1, day)
        );

        if (
            date.getUTCFullYear() !== year ||
            date.getUTCMonth() !== month - 1 ||
            date.getUTCDate() !== day
        ) {
            return null;
        }

        return (
            String(day).padStart(2, "0") +
            "/" +
            String(month).padStart(2, "0") +
            "/" +
            String(year).padStart(4, "0")
        );
    },

    assignmentDateEditor: function (
        cell,
        onRendered,
        success,
        cancel
    ) {
        const input = document.createElement("input");

        input.type = "text";
        input.inputMode = "numeric";
        input.autocomplete = "off";
        input.placeholder = "DD/MM/YYYY";
        input.value = cell.getValue() ?? "";

        input.style.boxSizing = "border-box";
        input.style.width = "100%";
        input.style.height = "100%";
        input.style.minHeight = "37px";
        input.style.margin = "0";
        input.style.padding = "7px 9px";
        input.style.border = "0";
        input.style.outline = "0";
        input.style.background = "#ffffff";
        input.style.font = "inherit";
        input.style.color = "#173047";
        input.style.direction = "ltr";
        input.style.textAlign = "left";

        let completed = false;

        const clearError = function () {
            input.style.boxShadow = "none";
            input.style.background = "#ffffff";
            input.removeAttribute("title");
            input.setAttribute("aria-invalid", "false");
        };

        const showError = function () {
            input.style.boxShadow =
                "inset 0 0 0 2px #c62828";
            input.style.background = "#fff7f7";
            input.title =
                "Enter a valid date in DD/MM/YYYY format.";
            input.setAttribute("aria-invalid", "true");
            input.focus();
            input.select();
        };

        const commit = function () {
            if (completed) {
                return;
            }

            const normalized =
                window.tabulatorTest
                    .normalizeAssignmentDate(
                        input.value
                    );

            if (normalized === null) {
                showError();
                return;
            }

            completed = true;
            clearError();
            success(normalized);
        };

        input.addEventListener("input", clearError);

        input.addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                commit();
                return;
            }

            if (event.key === "Escape") {
                completed = true;
                event.preventDefault();
                event.stopPropagation();
                cancel();
            }
        });

        input.addEventListener("blur", commit);

        onRendered(function () {
            input.focus();
            input.select();
        });

        return input;
    },

    initialize: function (elementId, data, baskets) {
        const element = document.getElementById(elementId);

        if (!element) {
            console.error("Tabulator element was not found:", elementId);
            return;
        }

        if (typeof Tabulator === "undefined") {
            console.error("Tabulator library is not loaded.");
            return;
        }

        const oldTable = this.tables[elementId];
        const oldState = this.states[elementId];

        if (oldState?.keyDownHandler) {
            document.removeEventListener(
                "keydown",
                oldState.keyDownHandler,
                true
            );
        }

        if (oldState?.copyHandler) {
            document.removeEventListener(
                "copy",
                oldState.copyHandler,
                true
            );
        }

        if (oldState?.pasteHandler) {
            document.removeEventListener(
                "paste",
                oldState.pasteHandler,
                true
            );
        }

        if (oldState?.pointerDownHandler) {
            document.removeEventListener(
                "pointerdown",
                oldState.pointerDownHandler,
                true
            );
        }

        if (oldTable) {
            oldTable.destroy();
        }

        delete this.tables[elementId];
        delete this.states[elementId];

        data = Array.isArray(data) ? data : [];
        baskets = Array.isArray(baskets) ? baskets : [];

        const directTypingFields = new Set([
            "assignmentDate",
            "basket"
        ]);

        const minimumExistingId = data.reduce(
            function (minimum, row) {
                const id = Number(row?.id);

                return Number.isFinite(id)
                    ? Math.min(minimum, id)
                    : minimum;
            },
            0
        );

        const state = {
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
             * أثناء مسح نطاق، Tabulator يطلق cellEdited لكل خلية.
             * نجمع هذه التعديلات هنا ثم نسجلها Transaction واحدة.
             */
            pendingRangeClear: null,

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
            lastStatusMessage: "",

            maxTransactions: 100,

            isActive: false,
            keyDownHandler: null,
            copyHandler: null,
            pasteHandler: null,
            pointerDownHandler: null,

            externalFilters: {
                workOrderNumber: "",
                workTypeCodes: [],
                assignmentDates: [],
                basketValues: []
            }
        };

        this.states[elementId] = state;
        this.ensureStructureUi(elementId);

        const table = new Tabulator(element, {
            data: data,
            index: "id",

            height: "650px",
            layout: "fitColumns",
            renderVertical: "virtual",

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
            selectableRangeColumns: true,
            selectableRangeRows: true,
            selectableRangeClearCells: true,
            selectableRangeClearCellsValue: "",

            clipboard: true,

            clipboardCopyRowRange: "range",
            clipboardPasteParser: function (clipboard) {
                return window.tabulatorTest.parseClipboardText(
                    clipboard
                );
            },

            /*
             * كل عملية Paste تمر من هنا حتى نسجلها
             * كعملية واحدة مهما كان عدد الخلايا.
             */
            clipboardPasteAction: function (rowData) {
                return window.tabulatorTest.applyRangePaste(
                    elementId,
                    this.table,
                    rowData
                );
            },

            clipboardCopyStyled: false,

            clipboardCopyConfig: {
                rowHeaders: false,
                columnHeaders: false
            },

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

            columns: [
                {
                    title: "Work Order Number",
                    field: "workOrderNumber",
                    editor: "input",
                    minWidth: 210,
                    widthGrow: 1.15,
                    headerHozAlign: "left"
                },
                {
                    title: "Work Type",
                    field: "workTypeCode",
                    editor: "input",
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

        table.on("tableBuilt", function () {
            window.tabulatorFilters.updateAllIcons(
                window.tabulatorTest,
                elementId
            );
        });

        /*
         * تسجيل القيمة قبل تعديل خلية واحدة.
         */
        table.on("cellEditing", function (cell) {
            if (state.applyingHistory) {
                return;
            }

            state.pendingEdit = {
                rowId: cell.getRow().getIndex(),
                field: cell.getField(),
                oldValue: cell.getValue()
            };
        });

        table.on("cellEditCancelled", function () {
            state.pendingEdit = null;
        });

        /*
         * تسجيل تعديل الخلية كعملية Undo واحدة.
         */
        table.on("cellEdited", function (cell) {
            if (state.applyingHistory) {
                return;
            }

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

            /*
             * لو التعديل ناتج عن Delete/Backspace لنطاق، لا نسجله
             * كعملية منفصلة. نحدث العملية المجمعة فقط.
             */
            if (state.pendingRangeClear) {
                const changeKey =
                    `${String(rowId)}::${field}`;

                const pendingChange =
                    state.pendingRangeClear
                        .changesByKey
                        .get(changeKey);

                if (pendingChange) {
                    pendingChange.newValue =
                        newValue;

                    state.pendingRangeClear
                        .changedFields
                        .add(field);
                }

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

        table.on("clipboardCopied", function () {
            window.tabulatorTest.setStatus(
                elementId,
                "تم نسخ الخلايا المحددة."
            );
        });

        table.on("clipboardPasteError", function () {
            window.tabulatorTest.setStatus(
                elementId,
                "تعذر لصق البيانات المحددة."
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

            const activeRange =
                window.tabulatorTest.getActiveRange(
                    table
                );

            if (!activeRange) {
                return;
            }

            if (
                window.tabulatorTest.isEditorTarget(
                    event.target
                )
            ) {
                return;
            }

            /*
             * Tabulator نفسه هو الذي يمسح النطاق. هنا لا نمنع الحدث
             * ولا نغير الخلايا يدويًا؛ فقط نأخذ Snapshot قبل المسح،
             * ثم نجمع cellEdited في عملية Undo واحدة بعد انتهاء الحدث.
             */
            if (
                (event.key === "Delete" ||
                    event.key === "Backspace") &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.altKey
            ) {
                const structuredCells =
                    activeRange.getStructuredCells();

                const changesByKey =
                    new Map();

                if (Array.isArray(structuredCells)) {
                    structuredCells.forEach(
                        function (rowCells) {
                            if (!Array.isArray(rowCells)) {
                                return;
                            }

                            rowCells.forEach(
                                function (cell) {
                                    if (
                                        !cell ||
                                        typeof cell.getRow !==
                                        "function" ||
                                        typeof cell.getField !==
                                        "function" ||
                                        typeof cell.getValue !==
                                        "function"
                                    ) {
                                        return;
                                    }

                                    const rowId =
                                        cell
                                            .getRow()
                                            .getIndex();

                                    const field =
                                        cell.getField();

                                    const oldValue =
                                        cell.getValue();

                                    const changeKey =
                                        `${String(rowId)}::${field}`;

                                    changesByKey.set(
                                        changeKey,
                                        {
                                            rowId: rowId,
                                            field: field,
                                            oldValue: oldValue,
                                            newValue: oldValue
                                        }
                                    );
                                }
                            );
                        }
                    );
                }

                if (changesByKey.size > 0) {
                    const pendingRangeClear = {
                        changesByKey:
                            changesByKey,

                        changedFields:
                            new Set()
                    };

                    state.pendingRangeClear =
                        pendingRangeClear;

                    /*
                     * Tabulator ينفذ المسح بصورة متزامنة لاحقًا في
                     * نفس keydown. الـtimeout يعمل بعد انتهاء ذلك.
                     */
                    window.setTimeout(
                        function () {
                            if (
                                state.pendingRangeClear !==
                                pendingRangeClear
                            ) {
                                return;
                            }

                            state.pendingRangeClear =
                                null;

                            const changes =
                                Array.from(
                                    pendingRangeClear
                                        .changesByKey
                                        .values()
                                )
                                    .filter(
                                        change =>
                                            !Object.is(
                                                change.oldValue,
                                                change.newValue
                                            )
                                    );

                            if (changes.length === 0) {
                                return;
                            }

                            window.tabulatorTest
                                .pushTransaction(
                                    elementId,
                                    {
                                        type: "range-clear",
                                        label: "مسح نطاق",
                                        changes: changes
                                    }
                                );

                            window.tabulatorFilters
                                .refreshFields(
                                    window.tabulatorTest,
                                    elementId,
                                    Array.from(
                                        pendingRangeClear
                                            .changedFields
                                    )
                                );
                        },
                        0
                    );
                }

                /*
                 * مهم: لا نستخدم preventDefault هنا، حتى يظل
                 * مسح Tabulator الأصلي هو المسؤول عن التنفيذ.
                 */
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
                            event.key;

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
         * Ctrl+C يطلق حدث copy من المتصفح.
         * نضع بيانات النطاق مباشرة في الحافظة حتى يعمل
         * الاختصار مع أي لغة للوحة المفاتيح.
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

            const activeRange =
                window.tabulatorTest.getActiveRange(
                    table
                );

            if (!activeRange) {
                return;
            }

            const clipboardText =
                window.tabulatorTest.rangeToClipboardText(
                    activeRange
                );

            if (clipboardText === null) {
                return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();

            event.clipboardData.setData(
                "text/plain",
                clipboardText
            );

            window.tabulatorTest.setStatus(
                elementId,
                "تم نسخ الخلايا المحددة."
            );
        };

        /*
         * Ctrl+V يطلق حدث paste من المتصفح.
         * نقرأ النص من الحدث نفسه بدل Clipboard API،
         * فلا نحتاج إذنًا إضافيًا من المتصفح.
         */
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

            const clipboardText =
                event.clipboardData.getData(
                    "text/plain"
                );

            const parsedData =
                window.tabulatorTest.parseClipboardText(
                    clipboardText
                );

            if (!parsedData) {
                window.tabulatorTest.setStatus(
                    elementId,
                    "لا توجد بيانات صالحة للصق."
                );

                return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();

            window.tabulatorTest.applyRangePaste(
                elementId,
                table,
                parsedData
            );

            window.tabulatorTest.setStatus(
                elementId,
                "تم لصق البيانات."
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
        const snapshot = {};

        for (const field of this.dirtyFields) {
            snapshot[field] =
                this.normalizeDirtyValue(
                    rowData?.[field]
                );
        }

        return snapshot;
    },

    refreshDirtyRows: function (
        elementId,
        rowIds
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

        for (const [rowKey, rowId] of uniqueRowIds) {
            const row =
                table.getRow(rowId);

            if (!row) {
                state.dirtyRowIds.delete(rowKey);
                continue;
            }

            const currentSnapshot =
                this.createDirtySnapshot(
                    row.getData()
                );

            const originalSnapshot =
                state.originalRows.get(rowKey);

            const isDirty =
                !originalSnapshot ||
                this.dirtyFields.some(
                    field =>
                        currentSnapshot[field] !==
                        originalSnapshot[field]
                );

            if (isDirty) {
                state.dirtyRowIds.add(rowKey);
            } else {
                state.dirtyRowIds.delete(rowKey);
            }
        }

        this.renderStatus(elementId);
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

        const dirtyText =
            `صفوف غير محفوظة: ${unsavedCount.toLocaleString()}`;

        statusElement.textContent =
            message
                ? `${message} | ${dirtyText}`
                : dirtyText;
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
                dirtyRows.push(row.getData());
            }
        }

        return dirtyRows;
    },

    /*
     * بعد نجاح الحفظ نعتبر القيم التي أرسلت للسيرفر
     * هي النسخة الأصلية الجديدة. إذا عدل المستخدم أثناء الحفظ،
     * يظل الصف غير محفوظ ولا نفقد هذا التعديل.
     */
    markRowsSaved: function (elementId, savedRows) {
        const state =
            this.states[elementId];

        if (!state) {
            return;
        }

        const savedIds = [];

        for (const row of savedRows ?? []) {
            const rowKey = String(row.id);

            state.originalRows.set(
                rowKey,
                this.createDirtySnapshot(row)
            );

            savedIds.push(row.id);
        }

        this.refreshDirtyRows(
            elementId,
            savedIds
        );
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
     * تحويل النطاق المحدد إلى نص Tab-Separated
     * يمكن لصقه مباشرة داخل Excel أو أي شيت آخر.
     */
    rangeToClipboardText: function (range) {
        if (!range) {
            return null;
        }

        const matrix =
            range.getStructuredCells();

        if (
            !Array.isArray(matrix) ||
            matrix.length === 0
        ) {
            return null;
        }

        const escapeValue = function (value) {
            const text =
                value === null ||
                    value === undefined
                    ? ""
                    : String(value);

            if (/[\t\r\n"]/.test(text)) {
                return (
                    `"${text.replace(/"/g, '""')}"`
                );
            }

            return text;
        };

        return matrix
            .map(
                row =>
                    row
                        .map(
                            cell =>
                                escapeValue(
                                    cell?.getValue()
                                )
                        )
                        .join("\t")
            )
            .join("\r\n");
    },

    /*
     * تطبيق Paste وتسجيل كل الخلايا المتأثرة
     * داخل Transaction واحدة.
     */
    applyRangePaste: function (
        elementId,
        table,
        rowData
    ) {
        const state =
            this.states[elementId];

        if (
            !state ||
            !Array.isArray(rowData) ||
            rowData.length === 0
        ) {
            return [];
        }

        const ranges =
            table.getRanges();

        const activeRange =
            ranges.length > 0
                ? ranges[ranges.length - 1]
                : null;

        if (!activeRange) {
            return [];
        }

        const sourceMatrix =
            this.normalizePasteData(
                table,
                rowData
            );

        if (
            sourceMatrix.length === 0 ||
            sourceMatrix.every(
                row => row.length === 0
            )
        ) {
            return [];
        }

        const selectedMatrix =
            activeRange.getStructuredCells();

        if (
            !Array.isArray(selectedMatrix) ||
            selectedMatrix.length === 0 ||
            selectedMatrix[0].length === 0
        ) {
            return [];
        }

        const selectedIsSingleCell =
            selectedMatrix.length === 1 &&
            selectedMatrix[0].length === 1;

        /*
         * تحديد خلية واحدة:
         * نطاق اللصق يتمدد بحجم البيانات المنسوخة.
         *
         * تحديد نطاق:
         * البيانات تتكرر لملء النطاق مثل Excel.
         */
        const targetMatrix =
            selectedIsSingleCell
                ? this.buildTargetMatrixFromStart(
                    table,
                    selectedMatrix[0][0],
                    sourceMatrix.length,
                    Math.max(
                        ...sourceMatrix.map(
                            row => row.length
                        )
                    )
                )
                : selectedMatrix;

        const changes = [];
        const affectedRows = new Map();

        state.applyingHistory = true;

        try {
            for (
                let rowIndex = 0;
                rowIndex < targetMatrix.length;
                rowIndex++
            ) {
                const targetRow =
                    targetMatrix[rowIndex];

                const sourceRow =
                    sourceMatrix[
                    rowIndex %
                    sourceMatrix.length
                    ];

                if (
                    !sourceRow ||
                    sourceRow.length === 0
                ) {
                    continue;
                }

                for (
                    let columnIndex = 0;
                    columnIndex < targetRow.length;
                    columnIndex++
                ) {
                    const cell =
                        targetRow[columnIndex];

                    if (!cell) {
                        continue;
                    }

                    const field =
                        cell.getField();

                    if (!field) {
                        continue;
                    }

                    const columnDefinition =
                        cell
                            .getColumn()
                            .getDefinition();

                    if (
                        columnDefinition.editor === false
                    ) {
                        continue;
                    }

                    const pastedValue =
                        sourceRow[
                        columnIndex %
                        sourceRow.length
                        ];

                    let newValue = pastedValue;

                    if (field === "assignmentDate") {
                        newValue =
                            this.normalizeAssignmentDate(
                                pastedValue
                            );

                        /*
                         * لا نستبدل التاريخ القديم بقيمة غير صالحة.
                         */
                        if (newValue === null) {
                            continue;
                        }
                    }

                    const oldValue =
                        cell.getValue();

                    if (
                        Object.is(
                            oldValue,
                            newValue
                        )
                    ) {
                        continue;
                    }

                    const row =
                        cell.getRow();

                    const rowId =
                        row.getIndex();

                    changes.push({
                        rowId: rowId,
                        field: field,

                        oldValue: oldValue,
                        newValue: newValue
                    });

                    affectedRows.set(
                        rowId,
                        row
                    );

                    cell.setValue(
                        newValue,
                        true
                    );
                }
            }
        } finally {
            state.applyingHistory = false;
        }

        if (changes.length > 0) {
            this.pushTransaction(
                elementId,
                {
                    type: "range-paste",
                    label: "لصق نطاق",
                    changes: changes
                }
            );

            window.tabulatorFilters
                .refreshFields(
                    this,
                    elementId,
                    changes.map(
                        change => change.field
                    )
                );
        }

        return Array.from(
            affectedRows.values()
        );
    },

    /*
 * قراءة البيانات المنسوخة من Excel مع الحفاظ
 * على عدد الصفوف والأعمدة والخلايا الفارغة.
 */
    parseClipboardText: function (clipboard) {
        if (
            typeof clipboard !== "string" ||
            clipboard.length === 0
        ) {
            return false;
        }

        const rows = [];
        let currentRow = [];
        let currentValue = "";
        let insideQuotes = false;

        for (
            let index = 0;
            index < clipboard.length;
            index++
        ) {
            const character = clipboard[index];

            if (insideQuotes) {
                if (
                    character === "\"" &&
                    clipboard[index + 1] === "\""
                ) {
                    currentValue += "\"";
                    index++;
                } else if (character === "\"") {
                    insideQuotes = false;
                } else {
                    currentValue += character;
                }

                continue;
            }

            if (character === "\"") {
                insideQuotes = true;
                continue;
            }

            if (character === "\t") {
                currentRow.push(currentValue);
                currentValue = "";
                continue;
            }

            if (
                character === "\r" ||
                character === "\n"
            ) {
                if (
                    character === "\r" &&
                    clipboard[index + 1] === "\n"
                ) {
                    index++;
                }

                currentRow.push(currentValue);
                rows.push(currentRow);

                currentRow = [];
                currentValue = "";

                continue;
            }

            currentValue += character;
        }

        currentRow.push(currentValue);
        rows.push(currentRow);

        /*
         * Excel غالبًا يضع سطرًا فارغًا في نهاية
         * النص المنسوخ، فلا نحسبه كصف إضافي.
         */
        const lastRow =
            rows[rows.length - 1];

        if (
            rows.length > 1 &&
            lastRow.length === 1 &&
            lastRow[0] === ""
        ) {
            rows.pop();
        }

        return rows.length > 0
            ? rows
            : false;
    },

    /*
     * تحويل البيانات القادمة من Clipboard
     * إلى مصفوفة صفوف وأعمدة.
     */
    normalizePasteData: function (
        table,
        rowData
    ) {
        if (Array.isArray(rowData[0])) {
            return rowData.map(
                row => Array.from(row)
            );
        }

        const fields =
            table
                .getColumns()
                .filter(
                    column =>
                        column.isVisible() &&
                        column.getField() &&
                        column.getField() !== "rowNumber"
                )
                .map(
                    column =>
                        column.getField()
                );

        return rowData.map(
            row =>
                fields.map(
                    field =>
                        row?.[field] ?? ""
                )
        );
    },

    /*
     * تكوين نطاق يبدأ من خلية واحدة
     * وبنفس حجم البيانات الملصقة.
     */
    buildTargetMatrixFromStart: function (
        table,
        startCell,
        requiredRows,
        requiredColumns
    ) {
        const rows =
            table.getRows("active");

        const columns =
            table
                .getColumns()
                .filter(
                    column =>
                        column.isVisible() &&
                        column.getField() &&
                        column.getField() !== "rowNumber"
                );

        const startRow =
            startCell.getRow();

        const startColumn =
            startCell.getColumn();

        const startRowIndex =
            rows.findIndex(
                row =>
                    row.getIndex() ===
                    startRow.getIndex()
            );

        const startColumnIndex =
            columns.findIndex(
                column =>
                    column.getField() ===
                    startColumn.getField()
            );

        if (
            startRowIndex < 0 ||
            startColumnIndex < 0
        ) {
            return [];
        }

        const targetMatrix = [];

        for (
            let rowOffset = 0;
            rowOffset < requiredRows;
            rowOffset++
        ) {
            const row =
                rows[startRowIndex + rowOffset];

            if (!row) {
                break;
            }

            const targetRow = [];

            for (
                let columnOffset = 0;
                columnOffset < requiredColumns;
                columnOffset++
            ) {
                const column =
                    columns[
                    startColumnIndex +
                    columnOffset
                    ];

                if (!column) {
                    break;
                }

                targetRow.push(
                    row.getCell(column)
                );
            }

            if (targetRow.length > 0) {
                targetMatrix.push(
                    targetRow
                );
            }
        }

        return targetMatrix;
    },

    /*
     * إضافة عملية جديدة إلى سجل Undo.
     */
    pushTransaction: function (
        elementId,
        transaction
    ) {
        const state =
            this.states[elementId];

        if (
            !state ||
            !transaction?.changes?.length
        ) {
            return;
        }

        state.undoStack.push(
            transaction
        );

        if (
            state.undoStack.length >
            state.maxTransactions
        ) {
            state.undoStack.shift();
        }

        /*
         * مثل Excel:
         * أي تعديل جديد بعد Undo يمسح Redo القديم.
         */
        state.redoStack = [];

        this.refreshDirtyRows(
            elementId,
            transaction.changes.map(
                change => change.rowId
            )
        );

        this.setStatus(
            elementId,

            `${transaction.label}: ` +
            `${transaction.changes.length.toLocaleString()} خلية. ` +
            `التراجع المتاح: ${state.undoStack.length}.`
        );
    },

    /*
     * أخذ نسخة مستقلة من حالة الفلاتر.
     * لا نحتفظ بمراجع للمصفوفات حتى لا تتغير العملية القديمة لاحقًا.
     */
    cloneExternalFilters: function (filters) {
        return {
            workOrderNumber:
                String(
                    filters?.workOrderNumber ?? ""
                ),

            workTypeCodes:
                Array.from(
                    filters?.workTypeCodes ?? []
                ),

            assignmentDates:
                Array.from(
                    filters?.assignmentDates ?? []
                ),

            basketValues:
                Array.from(
                    filters?.basketValues ?? []
                )
        };
    },

    /*
     * مقارنة حالتي فلترة قبل إضافة عملية إلى Undo.
     */
    externalFiltersEqual: function (
        first,
        second
    ) {
        return JSON.stringify(
            this.cloneExternalFilters(first)
        ) === JSON.stringify(
            this.cloneExternalFilters(second)
        );
    },

    /*
     * تسجيل Apply أو Clear Filter كعملية واحدة في نفس سجل
     * Undo / Redo المستخدم لتعديلات الخلايا.
     */
    pushFilterTransaction: function (
        elementId,
        oldFilters,
        newFilters,
        label
    ) {
        const state =
            this.states[elementId];

        if (
            !state ||
            this.externalFiltersEqual(
                oldFilters,
                newFilters
            )
        ) {
            return;
        }

        const transaction = {
            kind: "filter",
            label: label,
            oldFilters:
                this.cloneExternalFilters(
                    oldFilters
                ),
            newFilters:
                this.cloneExternalFilters(
                    newFilters
                )
        };

        state.undoStack.push(
            transaction
        );

        if (
            state.undoStack.length >
            state.maxTransactions
        ) {
            state.undoStack.shift();
        }

        state.redoStack = [];

        this.setStatus(
            elementId,
            `${label}. التراجع المتاح: ${state.undoStack.length}.`
        );
    },

    /*
     * إعادة حالة فلترة سابقة أثناء Undo / Redo.
     */
    applyFilterSnapshot: function (
        elementId,
        filters
    ) {
        const state =
            this.states[elementId];

        if (!state) {
            return;
        }

        state.applyingHistory = true;

        try {
            state.externalFilters =
                this.cloneExternalFilters(
                    filters
                );

            const searchInput =
                document.getElementById(
                    "tabulator-work-order-search"
                );

            if (searchInput) {
                searchInput.value =
                    state.externalFilters
                        .workOrderNumber;
            }

            window.tabulatorFilters.apply(
                this,
                elementId
            );
        } finally {
            state.applyingHistory = false;
        }
    },

    /*
     * وضع القيم القديمة أو الجديدة
     * حسب عملية Undo أو Redo.
     */
    applyTransactionValues: function (
        elementId,
        transaction,
        valueKey
    ) {
        const table =
            this.tables[elementId];

        const state =
            this.states[elementId];

        if (
            !table ||
            !state ||
            !transaction
        ) {
            return;
        }

        state.applyingHistory = true;

        try {
            for (
                const change
                of transaction.changes
            ) {
                const row =
                    table.getRow(
                        change.rowId
                    );

                if (!row) {
                    continue;
                }

                const cell =
                    row.getCell(
                        change.field
                    );

                if (!cell) {
                    continue;
                }

                cell.setValue(
                    change[valueKey],
                    true
                );
            }
        } finally {
            state.applyingHistory = false;
        }

        window.tabulatorFilters
            .refreshFields(
                this,
                elementId,
                transaction.changes.map(
                    change => change.field
                )
            );

        this.refreshDirtyRows(
            elementId,
            transaction.changes.map(
                change => change.rowId
            )
        );
    },

    /*
 * الانتقال إلى مكان العملية التي تم عمل
 * Undo أو Redo لها، وتحديد الخلايا المتأثرة.
 */
    focusTransaction: function (
        elementId,
        transaction
    ) {
        const table =
            this.tables[elementId];

        if (
            !table ||
            !transaction?.changes?.length
        ) {
            return;
        }

        const rows =
            table.getRows("active");

        const columns =
            table
                .getColumns()
                .filter(
                    column =>
                        column.isVisible() &&
                        column.getField() &&
                        column.getField() !== "rowNumber"
                );

        const rowPositions =
            new Map();

        for (
            let index = 0;
            index < rows.length;
            index++
        ) {
            rowPositions.set(
                String(rows[index].getIndex()),
                index
            );
        }

        const columnPositions =
            new Map();

        for (
            let index = 0;
            index < columns.length;
            index++
        ) {
            columnPositions.set(
                columns[index].getField(),
                index
            );
        }

        let minimumRow = Infinity;
        let maximumRow = -1;

        let minimumColumn = Infinity;
        let maximumColumn = -1;

        for (
            const change
            of transaction.changes
        ) {
            const rowPosition =
                rowPositions.get(
                    String(change.rowId)
                );

            const columnPosition =
                columnPositions.get(
                    change.field
                );

            if (
                rowPosition === undefined ||
                columnPosition === undefined
            ) {
                continue;
            }

            minimumRow =
                Math.min(
                    minimumRow,
                    rowPosition
                );

            maximumRow =
                Math.max(
                    maximumRow,
                    rowPosition
                );

            minimumColumn =
                Math.min(
                    minimumColumn,
                    columnPosition
                );

            maximumColumn =
                Math.max(
                    maximumColumn,
                    columnPosition
                );
        }

        if (
            !Number.isFinite(minimumRow) ||
            !Number.isFinite(minimumColumn) ||
            maximumRow < 0 ||
            maximumColumn < 0
        ) {
            return;
        }

        const startRow =
            rows[minimumRow];

        const endRow =
            rows[maximumRow];

        const startColumn =
            columns[minimumColumn];

        const endColumn =
            columns[maximumColumn];

        const startCell =
            startRow?.getCell(startColumn);

        const endCell =
            endRow?.getCell(endColumn);

        if (
            !startRow ||
            !startCell ||
            !endCell
        ) {
            return;
        }

        const selectAffectedRange =
            function () {
                /*
                 * إزالة التحديد القديم.
                 */
                const existingRanges =
                    table.getRanges();

                for (
                    const range
                    of existingRanges
                ) {
                    range.remove();
                }

                /*
                 * تحديد الخلية أو النطاق
                 * الذي تم التراجع عنه.
                 */
                table.addRange(
                    startCell,
                    endCell
                );

                window.requestAnimationFrame(
                    function () {
                        const cellElement =
                            startCell.getElement();

                        if (cellElement) {
                            cellElement.focus({
                                preventScroll: true
                            });
                        }
                    }
                );
            };

        /*
         * الانتقال إلى مكان العملية فورًا،
         * ثم تحديد النطاق بعد اكتمال الانتقال.
         */
        table
            .scrollToRow(
                startRow,
                "center",
                false
            )
            .then(
                selectAffectedRange
            )
            .catch(
                selectAffectedRange
            );
    },

    undo: async function (elementId) {
        const state =
            this.states[elementId];

        if (
            !state ||
            state.undoStack.length === 0
        ) {
            this.setStatus(
                elementId,
                "لا توجد عملية يمكن التراجع عنها."
            );

            return;
        }

        const transaction =
            state.undoStack.pop();

        if (transaction.kind === "filter") {
            this.applyFilterSnapshot(
                elementId,
                transaction.oldFilters
            );

            state.redoStack.push(
                transaction
            );

            this.setStatus(
                elementId,
                `تم التراجع عن: ${transaction.label}.`
            );

            return;
        }

        if (transaction.kind === "structure") {
            await this.applyStructureTransaction(
                elementId,
                transaction,
                "undo"
            );

            state.redoStack.push(
                transaction
            );

            this.setStatus(
                elementId,
                `تم التراجع عن: ${transaction.label}.`
            );

            return;
        }

        this.applyTransactionValues(
            elementId,
            transaction,
            "oldValue"
        );

        state.redoStack.push(
            transaction
        );

        this.focusTransaction(
            elementId,
            transaction
        );

        this.setStatus(
            elementId,

            `تم التراجع عن: ${transaction.label} ` +
            `(${transaction.changes.length.toLocaleString()} خلية).`
        );
    },

    redo: async function (elementId) {
        const state =
            this.states[elementId];

        if (
            !state ||
            state.redoStack.length === 0
        ) {
            this.setStatus(
                elementId,
                "لا توجد عملية يمكن إعادتها."
            );

            return;
        }

        const transaction =
            state.redoStack.pop();

        if (transaction.kind === "filter") {
            this.applyFilterSnapshot(
                elementId,
                transaction.newFilters
            );

            state.undoStack.push(
                transaction
            );

            this.setStatus(
                elementId,
                `تمت إعادة: ${transaction.label}.`
            );

            return;
        }

        if (transaction.kind === "structure") {
            await this.applyStructureTransaction(
                elementId,
                transaction,
                "redo"
            );

            state.undoStack.push(
                transaction
            );

            this.setStatus(
                elementId,
                `تمت إعادة: ${transaction.label}.`
            );

            return;
        }

        this.applyTransactionValues(
            elementId,
            transaction,
            "newValue"
        );

        state.undoStack.push(
            transaction
        );

        this.focusTransaction(
            elementId,
            transaction
        );

        this.setStatus(
            elementId,

            `تمت إعادة: ${transaction.label} ` +
            `(${transaction.changes.length.toLocaleString()} خلية).`
        );
    },

    ensureStructureStyles: function () {
        const styleId =
            "tabulator-structure-ui-styles";

        if (document.getElementById(styleId)) {
            return;
        }

        const style =
            document.createElement("style");

        style.id = styleId;
        style.textContent = `
            .tabulator-row-context-menu {
                position: fixed;
                z-index: 4000;
                width: 220px;
                padding: 6px;
                border: 1px solid #b9c8d4;
                border-radius: 9px;
                background: #ffffff;
                box-shadow: 0 14px 34px rgba(15, 42, 70, 0.2);
            }

            .tabulator-row-context-menu[hidden] {
                display: none;
            }

            .tabulator-row-context-menu button {
                display: block;
                width: 100%;
                padding: 9px 11px;
                border: 0;
                border-radius: 6px;
                background: transparent;
                color: #173047;
                text-align: left;
                font-family: "Segoe UI", Tahoma, Arial, sans-serif;
                font-size: 0.88rem;
                font-weight: 650;
                cursor: pointer;
            }

            .tabulator-row-context-menu button:hover {
                background: #eef7fc;
                color: #0b5f95;
            }

            .tabulator-row-context-separator {
                height: 1px;
                margin: 5px 3px;
                background: #dce5eb;
            }

            .tabulator-insert-dialog {
                width: min(390px, calc(100vw - 32px));
                padding: 0;
                border: 1px solid #b8c8d4;
                border-radius: 12px;
                background: #ffffff;
                color: #173047;
                box-shadow: 0 22px 60px rgba(15, 42, 70, 0.25);
            }

            .tabulator-insert-dialog::backdrop {
                background: rgba(11, 34, 57, 0.34);
            }

            .tabulator-insert-form {
                padding: 22px;
            }

            .tabulator-insert-form h2 {
                margin: 0 0 18px;
                color: #0b2239;
                font-size: 1.2rem;
                font-weight: 800;
            }

            .tabulator-insert-label {
                display: grid;
                gap: 7px;
                color: #2e4a60;
                font-size: 0.9rem;
                font-weight: 700;
            }

            .tabulator-insert-count {
                box-sizing: border-box;
                width: 100%;
                height: 40px;
                padding: 7px 10px;
                border: 1px solid #99afbf;
                border-radius: 7px;
                color: #173047;
                font: inherit;
                outline: none;
            }

            .tabulator-insert-count:focus {
                border-color: #0b78c7;
                box-shadow: 0 0 0 3px rgba(11, 120, 199, 0.14);
            }

            .tabulator-insert-position {
                display: grid;
                gap: 9px;
                margin: 17px 0 0;
                padding: 14px;
                border: 1px solid #d3dfe7;
                border-radius: 8px;
            }

            .tabulator-insert-position legend {
                float: none;
                width: auto;
                margin: 0 0 7px;
                padding: 0 4px;
                color: #2e4a60;
                font-size: 0.88rem;
                font-weight: 800;
            }

            .tabulator-insert-position label {
                display: flex;
                align-items: center;
                gap: 8px;
                margin: 0;
                font-size: 0.9rem;
            }

            .tabulator-insert-actions {
                display: flex;
                justify-content: flex-end;
                gap: 9px;
                margin-top: 20px;
            }

            .tabulator-dialog-button {
                min-width: 92px;
                height: 38px;
                padding: 0 14px;
                border-radius: 7px;
                font-size: 0.88rem;
                font-weight: 750;
                cursor: pointer;
            }

            .tabulator-dialog-cancel {
                border: 1px solid #9eb0bd;
                background: #ffffff;
                color: #435c70;
            }

            .tabulator-dialog-confirm {
                border: 1px solid #0b78c7;
                background: #0b78c7;
                color: #ffffff;
            }
        `;

        document.head.appendChild(style);
    },

    /*
     * تجهيز قائمة الكليك اليمين ونافذة إدراج الصفوف.
     * يتم إنشاؤهما مرة واحدة لكل شيت.
     */
    ensureStructureUi: function (elementId) {
        this.ensureStructureStyles();

        let menu = document.getElementById(
            `${elementId}-row-menu`
        );

        if (!menu) {
            menu = document.createElement("div");
            menu.id = `${elementId}-row-menu`;
            menu.className = "tabulator-row-context-menu";
            menu.hidden = true;

            const createMenuButton = function (
                text,
                action
            ) {
                const button =
                    document.createElement("button");

                button.type = "button";
                button.textContent = text;

                button.addEventListener(
                    "click",
                    function () {
                        window.tabulatorTest
                            .hideStructureContextMenu(
                                elementId
                            );

                        action();
                    }
                );

                return button;
            };

            menu.append(
                createMenuButton(
                    "Insert 1 Row Above",
                    function () {
                        window.tabulatorTest.insertRows(
                            elementId,
                            1,
                            "above"
                        );
                    }
                ),
                createMenuButton(
                    "Insert 1 Row Below",
                    function () {
                        window.tabulatorTest.insertRows(
                            elementId,
                            1,
                            "below"
                        );
                    }
                ),
                createMenuButton(
                    "Insert Multiple Rows…",
                    function () {
                        window.tabulatorTest
                            .openInsertDialog(
                                elementId,
                                "below"
                            );
                    }
                )
            );

            const separator =
                document.createElement("div");

            separator.className =
                "tabulator-row-context-separator";

            menu.append(separator);

            menu.append(
                createMenuButton(
                    "Delete Selected Rows",
                    function () {
                        window.tabulatorTest
                            .deleteSelectedRows(
                                elementId
                            );
                    }
                )
            );

            document.body.appendChild(menu);
        }

        let dialog = document.getElementById(
            `${elementId}-insert-dialog`
        );

        if (!dialog) {
            dialog = document.createElement("dialog");
            dialog.id = `${elementId}-insert-dialog`;
            dialog.className = "tabulator-insert-dialog";

            dialog.innerHTML = `
                <form method="dialog" class="tabulator-insert-form">
                    <h2>Insert Rows</h2>

                    <label class="tabulator-insert-label">
                        Number of rows
                        <input
                            class="tabulator-insert-count"
                            type="number"
                            min="1"
                            max="1000"
                            step="1"
                            value="1" />
                    </label>

                    <fieldset class="tabulator-insert-position">
                        <legend>Position</legend>

                        <label>
                            <input
                                type="radio"
                                name="${elementId}-insert-position"
                                value="above" />
                            Above selected row
                        </label>

                        <label>
                            <input
                                type="radio"
                                name="${elementId}-insert-position"
                                value="below"
                                checked />
                            Below selected row
                        </label>
                    </fieldset>

                    <div class="tabulator-insert-actions">
                        <button
                            type="button"
                            class="tabulator-dialog-button tabulator-dialog-cancel">
                            Cancel
                        </button>

                        <button
                            type="submit"
                            class="tabulator-dialog-button tabulator-dialog-confirm">
                            Insert
                        </button>
                    </div>
                </form>
            `;

            const cancelButton =
                dialog.querySelector(
                    ".tabulator-dialog-cancel"
                );

            cancelButton.addEventListener(
                "click",
                function () {
                    dialog.close();
                }
            );

            dialog
                .querySelector("form")
                .addEventListener(
                    "submit",
                    function (event) {
                        event.preventDefault();

                        const countInput =
                            dialog.querySelector(
                                ".tabulator-insert-count"
                            );

                        const positionInput =
                            dialog.querySelector(
                                `input[name="${elementId}-insert-position"]:checked`
                            );

                        const count =
                            Number.parseInt(
                                countInput.value,
                                10
                            );

                        const position =
                            positionInput?.value === "above"
                                ? "above"
                                : "below";

                        dialog.close();

                        window.tabulatorTest.insertRows(
                            elementId,
                            count,
                            position
                        );
                    }
                );

            dialog.addEventListener(
                "click",
                function (event) {
                    if (event.target === dialog) {
                        dialog.close();
                    }
                }
            );

            document.body.appendChild(dialog);
        }
    },

    hideStructureContextMenu: function (elementId) {
        const menu =
            document.getElementById(
                `${elementId}-row-menu`
            );

        if (menu) {
            menu.hidden = true;
        }
    },

    showStructureContextMenu: function (
        elementId,
        event,
        cell
    ) {
        const table =
            this.tables[elementId];

        const state =
            this.states[elementId];

        if (!table || !state || !cell) {
            return;
        }

        const selectedRows =
            this.getSelectedRowComponents(
                elementId
            );

        const clickedRowId =
            cell.getRow().getIndex();

        const clickedRowIsSelected =
            selectedRows.some(
                row =>
                    String(row.getIndex()) ===
                    String(clickedRowId)
            );

        if (!clickedRowIsSelected) {
            for (const range of table.getRanges()) {
                range.remove();
            }

            table.addRange(cell, cell);
        }

        state.activeCell = {
            rowId: clickedRowId,
            field: cell.getField()
        };

        const menu =
            document.getElementById(
                `${elementId}-row-menu`
            );

        if (!menu) {
            return;
        }

        menu.hidden = false;

        const menuWidth = 220;
        const menuHeight = 170;

        const left = Math.min(
            event.clientX,
            window.innerWidth - menuWidth - 10
        );

        const top = Math.min(
            event.clientY,
            window.innerHeight - menuHeight - 10
        );

        menu.style.left =
            `${Math.max(8, left)}px`;

        menu.style.top =
            `${Math.max(8, top)}px`;
    },

    openInsertDialog: function (
        elementId,
        defaultPosition
    ) {
        const selectedRows =
            this.getSelectedRowComponents(
                elementId
            );

        if (selectedRows.length === 0) {
            this.setStatus(
                elementId,
                "حدد أي خلية داخل الصف أولًا."
            );

            return;
        }

        this.ensureStructureUi(elementId);
        this.hideStructureContextMenu(elementId);

        const dialog =
            document.getElementById(
                `${elementId}-insert-dialog`
            );

        if (!dialog) {
            return;
        }

        const countInput =
            dialog.querySelector(
                ".tabulator-insert-count"
            );

        countInput.value = "1";

        const position =
            defaultPosition === "above"
                ? "above"
                : "below";

        const positionInput =
            dialog.querySelector(
                `input[name="${elementId}-insert-position"][value="${position}"]`
            );

        if (positionInput) {
            positionInput.checked = true;
        }

        dialog.showModal();

        window.requestAnimationFrame(
            function () {
                countInput.focus();
                countInput.select();
            }
        );
    },

    cloneRowData: function (rowData) {
        return {
            id: rowData.id,
            workOrderNumber:
                rowData.workOrderNumber ?? "",
            workTypeCode:
                rowData.workTypeCode ?? "",
            assignmentDate:
                rowData.assignmentDate ?? "",
            basket:
                rowData.basket ?? "",
            status:
                rowData.status ?? "",
            notes:
                rowData.notes ?? ""
        };
    },

    createBlankRow: function (state) {
        const id = state.nextTemporaryId;
        state.nextTemporaryId--;

        return {
            id: id,
            workOrderNumber: "",
            workTypeCode: "",
            assignmentDate: "",
            basket: "",
            status: "",
            notes: ""
        };
    },

    /*
     * إرجاع الصفوف التي يغطيها النطاق الحالي.
     * تحديد خلية واحدة يعني اختيار صفها للإدراج.
     */
    getSelectedRowComponents: function (
        elementId
    ) {
        const table =
            this.tables[elementId];

        const state =
            this.states[elementId];

        if (!table || !state) {
            return [];
        }

        const activeRange =
            this.getActiveRange(table);

        const selectedById = new Map();

        if (activeRange) {
            const matrix =
                activeRange.getStructuredCells();

            if (Array.isArray(matrix)) {
                for (const rowCells of matrix) {
                    if (!Array.isArray(rowCells)) {
                        continue;
                    }

                    for (const cell of rowCells) {
                        const row = cell?.getRow?.();

                        if (row) {
                            selectedById.set(
                                String(row.getIndex()),
                                row
                            );
                        }
                    }
                }
            }
        }

        if (
            selectedById.size === 0 &&
            state.activeCell
        ) {
            const row =
                table.getRow(
                    state.activeCell.rowId
                );

            if (row) {
                selectedById.set(
                    String(row.getIndex()),
                    row
                );
            }
        }

        const positions = new Map();

        table
            .getRows()
            .forEach(
                function (row, index) {
                    positions.set(
                        String(row.getIndex()),
                        index
                    );
                }
            );

        return Array.from(
            selectedById.values()
        ).sort(
            function (first, second) {
                return (
                    (positions.get(
                        String(first.getIndex())
                    ) ?? 0) -
                    (positions.get(
                        String(second.getIndex())
                    ) ?? 0)
                );
            }
        );
    },

    insertRows: async function (
        elementId,
        requestedCount,
        position
    ) {
        await this.commitActiveEditor(elementId);

        const table =
            this.tables[elementId];

        const state =
            this.states[elementId];

        if (!table || !state) {
            return;
        }

        const selectedRows =
            this.getSelectedRowComponents(
                elementId
            );

        if (selectedRows.length === 0) {
            this.setStatus(
                elementId,
                "حدد أي خلية داخل الصف أولًا."
            );

            return;
        }

        const count = Math.min(
            1000,
            Math.max(
                1,
                Number.parseInt(
                    requestedCount,
                    10
                ) || 1
            )
        );

        const currentData =
            table
                .getData()
                .map(
                    row =>
                        this.cloneRowData(row)
                );

        const positionsById = new Map();

        currentData.forEach(
            function (row, index) {
                positionsById.set(
                    String(row.id),
                    index
                );
            }
        );

        const selectedPositions =
            selectedRows
                .map(
                    row =>
                        positionsById.get(
                            String(row.getIndex())
                        )
                )
                .filter(
                    index =>
                        Number.isInteger(index)
                );

        if (selectedPositions.length === 0) {
            this.setStatus(
                elementId,
                "تعذر تحديد موضع الصف."
            );

            return;
        }

        const insertIndex =
            position === "above"
                ? Math.min(...selectedPositions)
                : Math.max(...selectedPositions) + 1;

        const insertedRows = [];

        for (
            let index = 0;
            index < count;
            index++
        ) {
            const data =
                this.createBlankRow(state);

            insertedRows.push({
                index: insertIndex + index,
                data: this.cloneRowData(data)
            });
        }

        currentData.splice(
            insertIndex,
            0,
            ...insertedRows.map(
                record =>
                    this.cloneRowData(record.data)
            )
        );

        await this.replaceStructureData(
            elementId,
            currentData,
            insertedRows[0].data.id
        );

        this.pushStructureTransaction(
            elementId,
            {
                kind: "structure",
                action: "insert",
                label:
                    count === 1
                        ? "إضافة صف"
                        : `إضافة ${count.toLocaleString()} صفوف`,
                rows: insertedRows
            }
        );
    },

    deleteSelectedRows: async function (elementId) {
        await this.commitActiveEditor(elementId);

        const table =
            this.tables[elementId];

        if (!table) {
            return;
        }

        const selectedRows =
            this.getSelectedRowComponents(
                elementId
            );

        if (selectedRows.length === 0) {
            this.setStatus(
                elementId,
                "حدد خلية أو نطاق صفوف أولًا."
            );

            return;
        }

        const count =
            selectedRows.length;

        const confirmed = window.confirm(
            count === 1
                ? "هل تريد حذف الصف المحدد؟"
                : `هل تريد حذف ${count.toLocaleString()} صفوف محددة؟`
        );

        if (!confirmed) {
            return;
        }

        const currentData =
            table
                .getData()
                .map(
                    row =>
                        this.cloneRowData(row)
                );

        const selectedIds = new Set(
            selectedRows.map(
                row =>
                    String(row.getIndex())
            )
        );

        const deletedRows = [];

        currentData.forEach(
            function (row, index) {
                if (
                    selectedIds.has(
                        String(row.id)
                    )
                ) {
                    deletedRows.push({
                        index: index,
                        data:
                            window.tabulatorTest
                                .cloneRowData(row)
                    });
                }
            }
        );

        if (deletedRows.length === 0) {
            return;
        }

        const remainingData =
            currentData.filter(
                row =>
                    !selectedIds.has(
                        String(row.id)
                    )
            );

        const focusIndex = Math.min(
            deletedRows[0].index,
            remainingData.length - 1
        );

        const focusRowId =
            focusIndex >= 0
                ? remainingData[focusIndex].id
                : null;

        await this.replaceStructureData(
            elementId,
            remainingData,
            focusRowId
        );

        this.pushStructureTransaction(
            elementId,
            {
                kind: "structure",
                action: "delete",
                label:
                    deletedRows.length === 1
                        ? "حذف صف"
                        : `حذف ${deletedRows.length.toLocaleString()} صفوف`,
                rows: deletedRows
            }
        );
    },

    pushStructureTransaction: function (
        elementId,
        transaction
    ) {
        const state =
            this.states[elementId];

        if (
            !state ||
            !transaction?.rows?.length
        ) {
            return;
        }

        state.undoStack.push(transaction);

        if (
            state.undoStack.length >
            state.maxTransactions
        ) {
            state.undoStack.shift();
        }

        state.redoStack = [];

        this.renderStatus(elementId);

        this.setStatus(
            elementId,
            `${transaction.label}. التراجع المتاح: ${state.undoStack.length}.`
        );
    },

    applyStructureTransaction: async function (
        elementId,
        transaction,
        direction
    ) {
        const table =
            this.tables[elementId];

        if (
            !table ||
            !transaction?.rows?.length
        ) {
            return;
        }

        const data =
            table
                .getData()
                .map(
                    row =>
                        this.cloneRowData(row)
                );

        const rowIds = new Set(
            transaction.rows.map(
                record =>
                    String(record.data.id)
            )
        );

        const shouldInsert =
            (
                transaction.action === "insert" &&
                direction === "redo"
            ) ||
            (
                transaction.action === "delete" &&
                direction === "undo"
            );

        let nextData;
        let focusRowId = null;

        if (shouldInsert) {
            nextData = data;

            const orderedRows =
                Array.from(transaction.rows)
                    .sort(
                        (first, second) =>
                            first.index - second.index
                    );

            for (const record of orderedRows) {
                nextData.splice(
                    Math.min(
                        record.index,
                        nextData.length
                    ),
                    0,
                    this.cloneRowData(
                        record.data
                    )
                );
            }

            focusRowId =
                orderedRows[0].data.id;
        } else {
            const firstIndex =
                Math.min(
                    ...transaction.rows.map(
                        record => record.index
                    )
                );

            nextData =
                data.filter(
                    row =>
                        !rowIds.has(
                            String(row.id)
                        )
                );

            const focusIndex =
                Math.min(
                    firstIndex,
                    nextData.length - 1
                );

            focusRowId =
                focusIndex >= 0
                    ? nextData[focusIndex].id
                    : null;
        }

        await this.replaceStructureData(
            elementId,
            nextData,
            focusRowId
        );
    },

    replaceStructureData: async function (
        elementId,
        data,
        focusRowId
    ) {
        const table =
            this.tables[elementId];

        const state =
            this.states[elementId];

        if (!table || !state) {
            return;
        }

        state.applyingHistory = true;

        try {
            await table.setData(data);

            window.tabulatorFilters.apply(
                this,
                elementId
            );

            this.recalculateStructureState(
                elementId
            );
        } finally {
            state.applyingHistory = false;
        }

        if (
            focusRowId !== null &&
            focusRowId !== undefined
        ) {
            this.focusRow(
                elementId,
                focusRowId
            );
        }
    },

    recalculateStructureState: function (elementId) {
        const table =
            this.tables[elementId];

        const state =
            this.states[elementId];

        if (!table || !state) {
            return;
        }

        const currentRows =
            table.getData();

        const currentIds = new Set(
            currentRows.map(
                row =>
                    String(row.id)
            )
        );

        state.deletedOriginalRowIds =
            new Set(
                Array.from(
                    state.originalRows.keys()
                ).filter(
                    rowId =>
                        !currentIds.has(rowId)
                )
            );

        state.dirtyRowIds.clear();

        this.refreshDirtyRows(
            elementId,
            currentRows.map(
                row => row.id
            )
        );
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

            window.requestAnimationFrame(
                function () {
                    const element =
                        cell.getElement();

                    element?.focus({
                        preventScroll: true
                    });
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

    getStructuralChangeSummary: function (
        elementId
    ) {
        const table =
            this.tables[elementId];

        const state =
            this.states[elementId];

        if (!table || !state) {
            return {
                addedRows: 0,
                deletedRows: 0
            };
        }

        const addedRows =
            table
                .getData()
                .filter(
                    row =>
                        !state.originalRows.has(
                            String(row.id)
                        )
                )
                .length;

        return {
            addedRows: addedRows,
            deletedRows:
                state.deletedOriginalRowIds.size
        };
    },

    copyRange: function (elementId) {
        const table =
            this.tables[elementId];

        if (table) {
            table.copyToClipboard(
                "range"
            );
        }
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
        const table =
            this.tables[elementId];

        const state =
            this.states[elementId];

        const element =
            document.getElementById(
                elementId
            );

        if (state?.keyDownHandler) {
            document.removeEventListener(
                "keydown",
                state.keyDownHandler,
                true
            );
        }

        if (state?.copyHandler) {
            document.removeEventListener(
                "copy",
                state.copyHandler,
                true
            );
        }

        if (state?.pasteHandler) {
            document.removeEventListener(
                "paste",
                state.pasteHandler,
                true
            );
        }

        if (state?.pointerDownHandler) {
            document.removeEventListener(
                "pointerdown",
                state.pointerDownHandler,
                true
            );
        }

        if (table) {
            table.destroy();
        }

        delete this.tables[elementId];
        delete this.states[elementId];
    }
};