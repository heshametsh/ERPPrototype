window.tabulatorTest = {
    tables: {},
    states: {},

    initialize: function (elementId, rowCount) {
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
            element.removeEventListener(
                "keydown",
                oldState.keyDownHandler,
                true
            );
        }

        if (oldTable) {
            oldTable.destroy();
        }

        delete this.tables[elementId];
        delete this.states[elementId];

        const workTypes = [
            "401",
            "402",
            "801",
            "802"
        ];

        const baskets = [
            "الحاجة إلى ترخيص",
            "تحت التنفيذ",
            "207",
            "سلة المعاينة",
            "تعديل المقايسة",
            "الهندسة",
            "إنشاء صرف وإرجاع",
            "صرف وإرجاع",
            "شهادة الإنجاز الابتدائية",
            "شهادة الإنجاز النهائية",
            "تجهيز الفاتورة",
            "سلة الفواتير",
            "السلة المالية",
            "أمر العمل مغلق"
        ];

        const data = [];

        for (let index = 0; index < rowCount; index++) {
            const day =
                String((index % 28) + 1).padStart(2, "0");

            const month =
                String((index % 12) + 1).padStart(2, "0");

            data.push({
                id: index + 1,

                workOrderNumber:
                    String(233000001 + index),

                workTypeCode:
                    workTypes[index % workTypes.length],

                assignmentDate:
                    `2026-${month}-${day}`,

                basket:
                    baskets[index % baskets.length],

                notes:
                    index % 5 === 0
                        ? "ملاحظة تجريبية لأمر العمل"
                        : ""
            });
        }

        const state = {
            undoStack: [],
            redoStack: [],

            applyingHistory: false,
            pendingEdit: null,

            maxTransactions: 100,
            keyDownHandler: null
        };

        this.states[elementId] = state;

        const table = new Tabulator(element, {
            data: data,
            index: "id",

            height: "650px",
            layout: "fitColumns",
            renderVertical: "virtual",

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
                    title: "رقم أمر العمل",
                    field: "workOrderNumber",

                    editor: "input",
                    headerFilter: "input",

                    width: 180
                },
                {
                    title: "نوع العمل",
                    field: "workTypeCode",

                    editor: "input",
                    headerFilter: "input",

                    width: 130
                },
                {
                    title: "تاريخ الإسناد",
                    field: "assignmentDate",

                    editor: "date",
                    headerFilter: "input",

                    width: 160
                },
                {
                    title: "السلة",
                    field: "basket",

                    editor: "list",

                    editorParams: {
                        values: baskets,
                        autocomplete: true,
                        listOnEmpty: true,
                        clearable: false
                    },

                    headerFilter: "input",
                    minWidth: 230
                },
                {
                    title: "الملاحظات",
                    field: "notes",

                    editor: "input",
                    headerFilter: "input",

                    minWidth: 300,
                    widthGrow: 2
                }
            ]
        });

        this.tables[elementId] = table;

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
         * Ctrl+Z وCtrl+Y يستخدمان سجلنا الخاص.
         *
         * أثناء الكتابة داخل Input نترك المتصفح
         * يتعامل مع Undo للنص الموجود داخل المحرر.
         */
        state.keyDownHandler = function (event) {
            const target = event.target;

            const isEditor =
                target instanceof HTMLInputElement ||
                target instanceof HTMLTextAreaElement ||
                target instanceof HTMLSelectElement ||
                target?.isContentEditable === true;

            if (isEditor) {
                return;
            }

            const modifierPressed =
                event.ctrlKey || event.metaKey;

            if (!modifierPressed || event.altKey) {
                return;
            }

            const key =
                event.key.toLowerCase();

            if (key === "z") {
                event.preventDefault();
                event.stopPropagation();

                if (event.shiftKey) {
                    window.tabulatorTest.redo(
                        elementId
                    );
                } else {
                    window.tabulatorTest.undo(
                        elementId
                    );
                }
            } else if (key === "y") {
                event.preventDefault();
                event.stopPropagation();

                window.tabulatorTest.redo(
                    elementId
                );
            }
        };

        element.addEventListener(
            "keydown",
            state.keyDownHandler,
            true
        );

        this.setStatus(
            elementId,
            `تم إنشاء ${rowCount.toLocaleString()} صف تجريبي.`
        );
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

                    const newValue =
                        sourceRow[
                        columnIndex %
                        sourceRow.length
                        ];

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

        this.applyTransactionValues(
            elementId,
            transaction,
            "oldValue"
        );

        state.redoStack.push(
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

        this.applyTransactionValues(
            elementId,
            transaction,
            "newValue"
        );

        state.undoStack.push(
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

        if (
            element &&
            state?.keyDownHandler
        ) {
            element.removeEventListener(
                "keydown",
                state.keyDownHandler,
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