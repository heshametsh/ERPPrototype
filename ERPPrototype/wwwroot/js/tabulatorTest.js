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

        const state = {
            undoStack: [],
            redoStack: [],

            applyingHistory: false,
            pendingEdit: null,

            /*
             * أثناء مسح نطاق، Tabulator يطلق cellEdited لكل خلية.
             * نجمع هذه التعديلات هنا ثم نسجلها Transaction واحدة.
             */
            pendingRangeClear: null,

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
        table.on("cellMouseDown", function () {
            state.isActive = true;
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

    undo: function (elementId) {
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

    redo: function (elementId) {
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
        const statusElement =
            document.getElementById(
                `${elementId}-status`
            );

        if (statusElement) {
            statusElement.textContent =
                message;
        }
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