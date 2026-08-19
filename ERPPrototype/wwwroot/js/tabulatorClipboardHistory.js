(function () {
    "use strict";

    const target = window.tabulatorTest;

    if (!target?.registerModule) {
        throw new Error(
            "tabulatorClipboardHistory.js requires tabulatorTest.js first."
        );
    }

    target.registerModule("clipboardHistory", {
        /*
         * Return a logical cell reference even when Tabulator has not created
         * a CellComponent for that row/column pair yet. This happens when a
         * custom column is added during the current session: existing off-screen
         * rows remain valid logical rows, but only the currently rendered rows
         * initially receive a physical cell for the new column.
         *
         * Clipboard operations need row/column/value semantics, not a DOM node,
         * so a tiny adapter keeps Copy/Paste/Clear independent from Virtual DOM.
         */
        getLogicalCellReference: function (row, column) {
            if (
                !row ||
                !column ||
                typeof row.getCell !== "function"
            ) {
                return null;
            }

            const field = column.getField?.();

            if (!field) {
                return null;
            }

            const physicalCell = row.getCell(field);

            if (physicalCell) {
                return physicalCell;
            }

            return {
                getRow: () => row,
                getColumn: () => column,
                getField: () => field,
                getValue: () => row.getData?.()?.[field]
            };
        },

        /*
         * Build the target from Tabulator's logical Range rows/columns instead
         * of asking the DOM-oriented structured-cell path to reconstruct it.
         * RangeComponent.getRows()/getColumns() are derived from the range
         * edges, so Virtual DOM rendering does not shorten Copy/Paste/Clear.
         */
        getLogicalRangeMatrix: function (range) {
            if (!range) {
                return [];
            }

            const rows =
                typeof range.getRows === "function"
                    ? range.getRows()
                    : [];
            const columns =
                typeof range.getColumns === "function"
                    ? range.getColumns()
                    : [];

            if (
                !Array.isArray(rows) ||
                !Array.isArray(columns) ||
                rows.length === 0 ||
                columns.length === 0
            ) {
                return [];
            }

            const matrix = [];

            for (const row of rows) {
                if (!row || typeof row.getCell !== "function") {
                    continue;
                }

                const targetRow = [];

                for (const column of columns) {
                    const field =
                        column?.getField?.();

                    if (!field) {
                        continue;
                    }

                    const cell =
                        this.getLogicalCellReference(
                            row,
                            column
                        );

                    if (cell) {
                        targetRow.push(cell);
                    }
                }

                if (targetRow.length > 0) {
                    matrix.push(targetRow);
                }
            }

            return matrix;
        },

        /*
         * مسح محتوى النطاق المنطقي كاملًا، بما في ذلك الصفوف غير الظاهرة
         * داخل Virtual DOM. لا ننشئ تحديدًا بديلًا ولا نتعامل مع عناصر DOM؛
         * نعتمد فقط على النطاق الأصلي الذي يديره Tabulator.
         */
        clearActiveRangeContents: async function (
            elementId,
            activeRange
        ) {
            const state = this.states[elementId];

            if (!state || !activeRange) {
                return 0;
            }

            const structuredCells = this.getLogicalRangeMatrix(activeRange);

            if (!Array.isArray(structuredCells) || structuredCells.length === 0) {
                return 0;
            }

            const changes = [];

            for (const rowCells of structuredCells) {
                if (!Array.isArray(rowCells)) {
                    continue;
                }

                for (const cell of rowCells) {
                    if (
                        !cell ||
                        typeof cell.getRow !== "function" ||
                        typeof cell.getField !== "function" ||
                        typeof cell.getValue !== "function"
                    ) {
                        continue;
                    }

                    const columnDefinition =
                        cell.getColumn?.()?.getDefinition?.();

                    if (columnDefinition?.editor === false) {
                        continue;
                    }

                    const field = cell.getField();

                    if (!field) {
                        continue;
                    }

                    const oldValue = cell.getValue();
                    const newValue = this.normalizeFieldValue(
                        elementId,
                        field,
                        ""
                    );

                    if (Object.is(oldValue, newValue)) {
                        continue;
                    }

                    const row = cell.getRow();

                    changes.push({
                        rowId: row.getIndex(),
                        clientKey: row.getData().clientKey,
                        field: field,
                        oldValue: oldValue,
                        newValue: newValue
                    });
                }
            }

            const appliedChanges = await this.applyFieldChangesBatch(
                elementId,
                changes,
                { postProcess: false }
            );

            if (appliedChanges.length === 0) {
                return 0;
            }

            state.activeValidationIndex = 0;

            this.pushTransaction(
                elementId,
                {
                    type: "range-clear",
                    label: "مسح نطاق",
                    changes: appliedChanges
                }
            );

            return appliedChanges.length;
        },

        /*
         * Phase 5B: one exclusive clipboard core for keyboard shortcuts and the
         * toolbar button. Tabulator's parallel clipboard module is disabled.
         */
        getActiveRangeClipboardText: function (table) {
            const activeRange =
                this.getActiveRange(table);

            return activeRange
                ? this.rangeToClipboardText(activeRange)
                : null;
        },

        writeClipboardText: async function (text) {
            if (typeof text !== "string") {
                return false;
            }

            /*
             * The toolbar call starts with a real user gesture. Use the
             * synchronous browser copy command first so restricted office
             * browsers do not lose that gesture while waiting for a rejected
             * Clipboard API promise.
             */
            if (
                document?.body &&
                typeof document.createElement === "function" &&
                typeof document.execCommand === "function"
            ) {
                const textarea =
                    document.createElement("textarea");

                textarea.value = text;
                textarea.setAttribute("readonly", "");
                textarea.style.position = "fixed";
                textarea.style.left = "-10000px";
                textarea.style.top = "0";
                textarea.style.opacity = "0";

                const previousFocus =
                    document.activeElement;

                document.body.appendChild(textarea);
                textarea.focus();
                textarea.select();

                let copied = false;

                try {
                    copied = document.execCommand("copy");
                } catch {
                    copied = false;
                } finally {
                    textarea.remove();

                    if (
                        previousFocus &&
                        typeof previousFocus.focus === "function"
                    ) {
                        try {
                            previousFocus.focus({
                                preventScroll: true
                            });
                        } catch {
                            previousFocus.focus();
                        }
                    }
                }

                if (copied) {
                    return true;
                }
            }

            if (
                window.isSecureContext === true &&
                typeof window.navigator?.clipboard?.writeText ===
                    "function"
            ) {
                try {
                    await window.navigator.clipboard.writeText(text);
                    return true;
                } catch {
                    return false;
                }
            }

            return false;
        },

        copyActiveRange: function (
            elementId,
            clipboardData
        ) {
            const table =
                this.tables[elementId];

            if (!table) {
                return false;
            }

            const clipboardText =
                this.getActiveRangeClipboardText(table);

            if (clipboardText === null) {
                this.setStatus(
                    elementId,
                    "حدد خلية أو نطاقًا أولًا."
                );

                return false;
            }

            if (
                clipboardData &&
                typeof clipboardData.setData === "function"
            ) {
                clipboardData.setData(
                    "text/plain",
                    clipboardText
                );

                this.setStatus(
                    elementId,
                    "تم نسخ الخلايا المحددة."
                );

                return true;
            }

            return this.writeClipboardText(
                clipboardText
            ).then(copied => {
                this.setStatus(
                    elementId,
                    copied
                        ? "تم نسخ الخلايا المحددة."
                        : "تعذر نسخ الخلايا المحددة."
                );

                return copied;
            });
        },

        pasteClipboardText: async function (
            elementId,
            clipboardText
        ) {
            const table = this.tables[elementId];

            if (!table || !this.getActiveRange(table)) {
                return false;
            }

            const parsedData = this.parseClipboardText(clipboardText);

            if (!parsedData) {
                this.setStatus(
                    elementId,
                    "لا توجد بيانات صالحة للصق."
                );

                return false;
            }

            const appliedChanges = await this.applyRangePaste(
                elementId,
                table,
                parsedData
            );

            this.setStatus(
                elementId,
                appliedChanges.length > 0
                    ? "تم لصق البيانات."
                    : "لم تتغير أي قيمة."
            );

            return appliedChanges.length > 0;
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
                this.getLogicalRangeMatrix(range);

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
        applyRangePaste: async function (
            elementId,
            table,
            rowData
        ) {
            const state = this.states[elementId];

            if (!state || !Array.isArray(rowData) || rowData.length === 0) {
                return [];
            }

            const ranges = table.getRanges();
            const activeRange =
                ranges.length > 0 ? ranges[ranges.length - 1] : null;

            if (!activeRange) {
                return [];
            }

            const sourceMatrix = this.normalizePasteData(table, rowData);

            if (
                sourceMatrix.length === 0 ||
                sourceMatrix.every(row => row.length === 0)
            ) {
                return [];
            }

            const selectedMatrix = this.getLogicalRangeMatrix(activeRange);

            if (
                !Array.isArray(selectedMatrix) ||
                selectedMatrix.length === 0 ||
                selectedMatrix[0].length === 0
            ) {
                return [];
            }

            const selectedIsSingleCell =
                (
                    typeof activeRange.getTopEdge === "function" &&
                    typeof activeRange.getBottomEdge === "function" &&
                    typeof activeRange.getLeftEdge === "function" &&
                    typeof activeRange.getRightEdge === "function"
                )
                    ? (
                        activeRange.getTopEdge() === activeRange.getBottomEdge() &&
                        activeRange.getLeftEdge() === activeRange.getRightEdge()
                    )
                    : (
                        selectedMatrix.length === 1 &&
                        selectedMatrix[0].length === 1
                    );

            const sourceRowCount = sourceMatrix.length;
            const sourceColumnCount = Math.max(
                ...sourceMatrix.map(row => row.length)
            );

            /*
             * Paste only the overlap between copied data and the available
             * logical target. Do not repeat a smaller copied block to fill a
             * larger selection, and do not reject a larger copied block when
             * only part of the sheet remains below/right of the start cell.
             *
             * Examples:
             * - copied 4,000 rows, 200 target rows remain -> paste 200 rows;
             * - copied 200 rows, 4,000 rows selected -> paste 200 rows.
             */
            const targetMatrix = selectedIsSingleCell
                ? this.buildTargetMatrixFromStart(
                    table,
                    selectedMatrix[0][0],
                    sourceRowCount,
                    sourceColumnCount
                )
                : selectedMatrix
                    .slice(0, sourceRowCount)
                    .map(row =>
                        Array.isArray(row)
                            ? row.slice(0, sourceColumnCount)
                            : []
                    )
                    .filter(row => row.length > 0);

            const changes = [];

            for (let rowIndex = 0; rowIndex < targetMatrix.length; rowIndex++) {
                const targetRow = targetMatrix[rowIndex];
                const sourceRow = sourceMatrix[rowIndex];

                if (!sourceRow || sourceRow.length === 0) {
                    continue;
                }

                for (
                    let columnIndex = 0;
                    columnIndex < targetRow.length;
                    columnIndex++
                ) {
                    const cell = targetRow[columnIndex];

                    if (!cell) {
                        continue;
                    }

                    const field = cell.getField();

                    if (!field) {
                        continue;
                    }

                    const columnDefinition =
                        cell.getColumn().getDefinition();

                    if (columnDefinition.editor === false) {
                        continue;
                    }

                    if (columnIndex >= sourceRow.length) {
                        continue;
                    }

                    const pastedValue =
                        sourceRow[columnIndex];
                    const newValue = this.normalizeFieldValue(
                        elementId,
                        field,
                        pastedValue
                    );
                    const oldValue = cell.getValue();

                    if (Object.is(oldValue, newValue)) {
                        continue;
                    }

                    const row = cell.getRow();

                    changes.push({
                        rowId: row.getIndex(),
                        clientKey: row.getData().clientKey,
                        field: field,
                        oldValue: oldValue,
                        newValue: newValue
                    });
                }
            }

            const appliedChanges = await this.applyFieldChangesBatch(
                elementId,
                changes,
                { postProcess: false }
            );

            if (appliedChanges.length > 0) {
                state.activeValidationIndex = 0;

                this.pushTransaction(
                    elementId,
                    {
                        type: "range-paste",
                        label: "لصق نطاق",
                        changes: appliedChanges
                    }
                );

                if (this.getSortedValidationErrors(elementId).length > 0) {
                    this.focusValidationError(elementId, 0);
                }
            }

            return appliedChanges;
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

                    const cell =
                        this.getLogicalCellReference(
                            row,
                            column
                        );

                    if (cell) {
                        targetRow.push(cell);
                    }
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
            const state = this.states[elementId];

            if (!state || !transaction?.changes?.length) {
                return;
            }

            state.undoStack.push(transaction);

            if (state.undoStack.length > state.maxTransactions) {
                state.undoStack.shift();
            }

            state.redoStack = [];

            const changedFieldsByRow =
                this.buildChangedFieldsByRow(transaction.changes);
            const affectedRowIds = transaction.changes.map(
                change => change.rowId
            );
            const affectedFields = Array.from(
                new Set(transaction.changes.map(change => change.field))
            );

            this.refreshDirtyRows(
                elementId,
                affectedRowIds,
                changedFieldsByRow
            );

            if (
                typeof this.doFieldChangesRequireValidation !== "function" ||
                this.doFieldChangesRequireValidation(affectedFields)
            ) {
                this.validateFieldChanges(
                    elementId,
                    changedFieldsByRow,
                    { forceRequired: false }
                );
            }

            window.tabulatorFilters.refreshFields(
                this,
                elementId,
                affectedFields
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

                workOrderNumbers:
                    Array.from(
                        filters?.workOrderNumbers ?? []
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
                    ),


                workOrderValueAmount:
                    window.tabulatorFilters.cloneAmountFilter(
                        filters?.workOrderValueAmount
                    ),

                partialAmountAmount:
                    window.tabulatorFilters.cloneAmountFilter(
                        filters?.partialAmountAmount
                    ),

                remainingAmountAmount:
                    window.tabulatorFilters.cloneAmountFilter(
                        filters?.remainingAmountAmount
                    ),

                customValues: Object.fromEntries(
                    Object.entries(filters?.customValues ?? {})
                        .sort(([first], [second]) =>
                            first.localeCompare(second)
                        )
                        .map(([field, values]) => [
                            field,
                            Array.from(values ?? [])
                        ])
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
        applyTransactionValues: async function (
            elementId,
            transaction,
            valueKey
        ) {
            const table = this.tables[elementId];
            const state = this.states[elementId];

            if (!table || !state || !transaction) {
                return;
            }

            const changes = [];

            for (const transactionChange of transaction.changes) {
                const row = table.getRow(transactionChange.rowId);

                if (!row) {
                    continue;
                }

                changes.push({
                    rowId: transactionChange.rowId,
                    clientKey:
                        transactionChange.clientKey ??
                        row.getData().clientKey,
                    field: transactionChange.field,
                    oldValue: row.getData()?.[transactionChange.field],
                    newValue: transactionChange[valueKey]
                });
            }

            await this.applyFieldChangesBatch(
                elementId,
                changes,
                { postProcess: true }
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

            if (state?.bulkStructureMutationActive) {
                this.setStatus(
                    elementId,
                    "انتظر حتى تنتهي عملية الصفوف الحالية."
                );

                return;
            }

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

            if (transaction.kind === "custom-column") {
                await this.applyCustomColumnTransaction(
                    elementId,
                    transaction,
                    "undo"
                );

                state.redoStack.push(transaction);

                this.setStatus(
                    elementId,
                    `تم التراجع عن: ${transaction.label}.`
                );

                return;
            }

            if (transaction.kind === "column-layout") {
                await this.applyColumnLayoutTransaction(
                    elementId,
                    transaction,
                    "undo"
                );

                state.redoStack.push(transaction);

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

                this.scheduleAggregateRefresh?.(
                    elementId,
                    "structure-undo"
                );

                this.setStatus(
                    elementId,
                    `تم التراجع عن: ${transaction.label}.`
                );

                return;
            }

            await this.applyTransactionValues(
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

            if (state?.bulkStructureMutationActive) {
                this.setStatus(
                    elementId,
                    "انتظر حتى تنتهي عملية الصفوف الحالية."
                );

                return;
            }

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

            if (transaction.kind === "custom-column") {
                await this.applyCustomColumnTransaction(
                    elementId,
                    transaction,
                    "redo"
                );

                state.undoStack.push(transaction);

                this.setStatus(
                    elementId,
                    `تمت إعادة: ${transaction.label}.`
                );

                return;
            }

            if (transaction.kind === "column-layout") {
                await this.applyColumnLayoutTransaction(
                    elementId,
                    transaction,
                    "redo"
                );

                state.undoStack.push(transaction);

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

                this.scheduleAggregateRefresh?.(
                    elementId,
                    "structure-redo"
                );

                this.setStatus(
                    elementId,
                    `تمت إعادة: ${transaction.label}.`
                );

                return;
            }

            await this.applyTransactionValues(
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
            return this.copyActiveRange(
                elementId
            );
        }
    });
})();
