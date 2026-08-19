(function () {
    "use strict";

    const target = window.tabulatorTest;

    if (!target?.registerModule) {
        throw new Error(
            "tabulatorValidation.js requires tabulatorTest.js first."
        );
    }

    target.registerModule("validation", {
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

        normalizeIdentityDigits: function (value) {
            return String(value ?? "")
                .replace(/[٠-٩]/g, digit =>
                    String(digit.charCodeAt(0) - 1632))
                .replace(/[۰-۹]/g, digit =>
                    String(digit.charCodeAt(0) - 1776));
        },

        validationFieldOrder: {
            workOrderNumber: 0,
            workTypeCode: 1,
            assignmentDate: 2,
            workOrderValue: 3,
            partialAmount: 4,
            remainingAmount: 5,
            basket: 6
        },

        validationFieldLabels: {
            workOrderNumber: "رقم أمر العمل",
            workTypeCode: "نوع أمر العمل",
            assignmentDate: "تاريخ الإسناد",
            workOrderValue: "قيمة أمر العمل",
            partialAmount: "المبلغ الجزئي",
            remainingAmount: "المبلغ المتبقي",
            basket: "السلة"
        },

        getValidationCellKey: function (rowId, field) {
            return `${String(rowId)}::${String(field)}`;
        },

        isCompletelyBlankRowData: function (rowData) {
            return this.getContentFieldKeys().every(field =>
                String(rowData?.[field] ?? "").trim() === ""
            );
        },

        getIdentityKey: function (rowData) {
            const number =
                String(rowData?.workOrderNumber ?? "").trim();
            const type =
                String(rowData?.workTypeCode ?? "").trim();

            if (
                !/^[0-9]{9}$/.test(number) ||
                !/^[0-9]{3}$/.test(type)
            ) {
                return null;
            }

            return `${number}::${type}`;
        },

        rebuildIdentityIndex: function (
            elementId,
            rows
        ) {
            const state = this.states[elementId];

            if (!state) {
                return;
            }

            state.identityRows.clear();
            state.rowIdentityKeys.clear();

            for (const rowData of rows ?? []) {
                const rowKey = String(rowData?.id);
                const identityKey =
                    this.getIdentityKey(rowData);

                if (!identityKey) {
                    continue;
                }

                if (!state.identityRows.has(identityKey)) {
                    state.identityRows.set(
                        identityKey,
                        new Set()
                    );
                }

                state.identityRows
                    .get(identityKey)
                    .add(rowKey);

                state.rowIdentityKeys.set(
                    rowKey,
                    identityKey
                );
            }
        },

        getStructureRowData: function (record) {
            return record?.data ?? record ?? null;
        },

        /*
         * Build a quiet row lookup for structural operations. Tabulator's public
         * getRow API logs a console warning when a row is absent; absence is an
         * expected state during Undo/Redo and after temporary ids are rebased to
         * database ids. ClientKey is the stable identity across those id changes.
         */
        createStructureRowLookup: function (table) {
            const rows = table?.getRows?.() ?? [];
            const byId = new Map();
            const byClientKey = new Map();

            for (const row of rows) {
                const rowData = row?.getData?.();

                if (!row || !rowData) {
                    continue;
                }

                byId.set(
                    String(row.getIndex()),
                    row
                );

                const clientKey = String(
                    rowData.clientKey ?? ""
                ).trim();

                if (clientKey) {
                    byClientKey.set(clientKey, row);
                }
            }

            return {
                rows: rows,
                byId: byId,
                byClientKey: byClientKey
            };
        },

        findStructureRowComponent: function (
            lookup,
            rowData
        ) {
            if (!lookup || !rowData) {
                return null;
            }

            const clientKey = String(
                rowData.clientKey ?? ""
            ).trim();

            if (
                clientKey &&
                lookup.byClientKey.has(clientKey)
            ) {
                return lookup.byClientKey.get(clientKey);
            }

            return lookup.byId.get(
                String(rowData.id)
            ) ?? null;
        },

        /*
         * Structural Insert/Delete keeps the same row values for every
         * unaffected row. Update the identity lookup only for rows that entered
         * or left the sheet instead of rebuilding the full 3,000-row index.
         */
        applyStructureIdentityDelta: function (
            elementId,
            insertedRows,
            removedRows
        ) {
            const state = this.states[elementId];
            const affectedIdentityKeys = new Set();

            if (!state) {
                return affectedIdentityKeys;
            }

            const removeIndexedRow = (
                rowData,
                useDataFallback
            ) => {
                if (!rowData) {
                    return;
                }

                const rowKey = String(rowData.id);
                const indexedKey =
                    state.rowIdentityKeys.get(rowKey);
                const identityKey =
                    indexedKey ||
                    (useDataFallback
                        ? this.getIdentityKey(rowData)
                        : null);

                if (identityKey) {
                    affectedIdentityKeys.add(identityKey);

                    const owners =
                        state.identityRows.get(identityKey);

                    if (owners) {
                        owners.delete(rowKey);

                        if (owners.size === 0) {
                            state.identityRows.delete(identityKey);
                        }
                    }
                }

                state.rowIdentityKeys.delete(rowKey);
            };

            for (const record of removedRows ?? []) {
                removeIndexedRow(
                    this.getStructureRowData(record),
                    true
                );
            }

            for (const record of insertedRows ?? []) {
                const rowData =
                    this.getStructureRowData(record);

                if (!rowData) {
                    continue;
                }

                /* Defensive cleanup if a restored row id is still indexed. */
                removeIndexedRow(rowData, false);

                const rowKey = String(rowData.id);
                const identityKey =
                    this.getIdentityKey(rowData);

                if (!identityKey) {
                    continue;
                }

                affectedIdentityKeys.add(identityKey);

                if (!state.identityRows.has(identityKey)) {
                    state.identityRows.set(
                        identityKey,
                        new Set()
                    );
                }

                state.identityRows
                    .get(identityKey)
                    .add(rowKey);

                state.rowIdentityKeys.set(
                    rowKey,
                    identityKey
                );
            }

            return affectedIdentityKeys;
        },

        clearValidationForRemovedRows: function (
            elementId,
            removedRows
        ) {
            const state = this.states[elementId];

            if (!state) {
                return;
            }

            const removedRowIds = new Set(
                Array.from(removedRows ?? [])
                    .map(record =>
                        this.getStructureRowData(record))
                    .filter(Boolean)
                    .map(rowData => String(rowData.id))
            );

            if (removedRowIds.size === 0) {
                return;
            }

            for (const [key, error] of state.validationErrors) {
                if (removedRowIds.has(String(error.rowId))) {
                    state.validationErrors.delete(key);
                }
            }

            for (const rowId of removedRowIds) {
                state.validationRowIds.delete(rowId);
            }
        },

        /*
         * After a structural change, only new/restored rows require full field
         * validation. Duplicate markers are recalculated only for identities
         * whose owner set changed.
         */
        reconcileStructureValidation: function (
            elementId,
            insertedRows,
            removedRows,
            affectedIdentityKeys
        ) {
            const table = this.tables[elementId];
            const state = this.states[elementId];

            if (!table || !state) {
                return;
            }

            this.clearValidationForRemovedRows(
                elementId,
                removedRows
            );

            const insertedRowIds = new Map();

            for (const record of insertedRows ?? []) {
                const rowData =
                    this.getStructureRowData(record);

                if (!rowData) {
                    continue;
                }

                insertedRowIds.set(
                    String(rowData.id),
                    rowData.id
                );
            }

            for (const rowId of insertedRowIds.values()) {
                const row = table.getRow(rowId);

                if (row) {
                    this.validateRow(
                        elementId,
                        row,
                        { forceRequired: false }
                    );
                }
            }

            const duplicateAffectedRowIds = new Set();

            for (const identityKey of affectedIdentityKeys ?? []) {
                const owners =
                    state.identityRows.get(identityKey);

                if (!owners) {
                    continue;
                }

                for (const ownerRowId of owners) {
                    duplicateAffectedRowIds.add(
                        String(ownerRowId)
                    );
                }
            }

            for (const rowId of duplicateAffectedRowIds) {
                this.clearCellValidationError(
                    elementId,
                    rowId,
                    "workOrderNumber",
                    {
                        code: "duplicate_identity",
                        deferUi: true
                    }
                );

                this.clearCellValidationError(
                    elementId,
                    rowId,
                    "workTypeCode",
                    {
                        code: "duplicate_identity",
                        deferUi: true
                    }
                );
            }

            const duplicateMessage =
                "رقم أمر العمل ونوعه مكرران داخل الشيت.";

            for (const identityKey of affectedIdentityKeys ?? []) {
                const owners =
                    state.identityRows.get(identityKey);

                if (!owners || owners.size <= 1) {
                    continue;
                }

                for (const rowId of owners) {
                    this.setCellValidationError(
                        elementId,
                        rowId,
                        "workOrderNumber",
                        "duplicate_identity",
                        duplicateMessage,
                        { deferUi: true }
                    );

                    this.setCellValidationError(
                        elementId,
                        rowId,
                        "workTypeCode",
                        "duplicate_identity",
                        duplicateMessage,
                        { deferUi: true }
                    );
                }
            }

            for (const rowId of duplicateAffectedRowIds) {
                this.applyValidationStylesToRow(
                    elementId,
                    rowId
                );
            }

            this.syncValidationUi(elementId);
        },

        refreshValidationRowMarker: function (
            elementId,
            rowId
        ) {
            const state = this.states[elementId];

            if (!state) {
                return;
            }

            const rowKey = String(rowId);
            let hasErrors = false;

            for (const error of state.validationErrors.values()) {
                if (String(error.rowId) === rowKey) {
                    hasErrors = true;
                    break;
                }
            }

            if (hasErrors) {
                state.validationRowIds.add(rowKey);
            } else {
                state.validationRowIds.delete(rowKey);
            }

            this.applyValidationStylesToRow(
                elementId,
                rowId
            );
        },

        setCellValidationError: function (
            elementId,
            rowId,
            field,
            code,
            message,
            options = {}
        ) {
            const state = this.states[elementId];

            if (!state || rowId === null || rowId === undefined || !field) {
                return;
            }

            const key = this.getValidationCellKey(rowId, field);

            state.validationErrors.set(key, {
                key: key,
                rowId: rowId,
                field: field,
                code: code || "validation_error",
                message: String(message || "القيمة غير صحيحة."),
                source: options.source || "client"
            });

            state.validationRowIds.add(String(rowId));
            this.applyValidationStylesToRow(elementId, rowId);

            if (!options.deferUi) {
                this.syncValidationUi(elementId);
            }
        },

        clearCellValidationError: function (
            elementId,
            rowId,
            field,
            options = {}
        ) {
            const state = this.states[elementId];

            if (!state) {
                return;
            }

            const key = this.getValidationCellKey(rowId, field);
            const current = state.validationErrors.get(key);

            if (
                current &&
                options.code &&
                current.code !== options.code
            ) {
                return;
            }

            const removed =
                state.validationErrors.delete(key);

            if (removed) {
                this.refreshValidationRowMarker(
                    elementId,
                    rowId
                );
            }

            if (!options.deferUi) {
                this.syncValidationUi(elementId);
            }
        },

        getSortedValidationErrors: function (elementId) {
            const table = this.tables[elementId];
            const state = this.states[elementId];

            if (!table || !state) {
                return [];
            }

            if (state.validationErrors.size === 0) {
                return [];
            }

            const rowPositions = new Map();
            const rows = table.getRows();
            const existingRowIds = new Set(
                rows.map(row => String(row.getIndex()))
            );

            for (const [key, error] of state.validationErrors) {
                if (!existingRowIds.has(String(error.rowId))) {
                    state.validationErrors.delete(key);
                }
            }

            rows.forEach((row, index) => {
                rowPositions.set(String(row.getIndex()), index);
            });

            return Array.from(state.validationErrors.values())
                .sort((first, second) => {
                    const firstRow =
                        rowPositions.get(String(first.rowId)) ?? Number.MAX_SAFE_INTEGER;
                    const secondRow =
                        rowPositions.get(String(second.rowId)) ?? Number.MAX_SAFE_INTEGER;

                    if (firstRow !== secondRow) {
                        return firstRow - secondRow;
                    }

                    const firstField =
                        this.getFieldOrder(first.field);
                    const secondField =
                        this.getFieldOrder(second.field);

                    return firstField - secondField;
                });
        },

        getValidationRowNumber: function (elementId, rowId) {
            const table = this.tables[elementId];

            if (!table) {
                return "?";
            }

            const rows = table.getRows();
            const index = rows.findIndex(
                row => String(row.getIndex()) === String(rowId)
            );

            return index >= 0 ? String(index + 1) : "?";
        },

        syncValidationUi: function (elementId) {
            const state = this.states[elementId];

            if (!state) {
                return;
            }

            const errors = this.getSortedValidationErrors(elementId);
            state.validationOrder = errors.map(error => error.key);

            const panel = document.getElementById(
                `${elementId}-validation-panel`
            );

            const title = document.getElementById(
                `${elementId}-validation-title`
            );

            const message = document.getElementById(
                `${elementId}-validation-message`
            );

            const previous = document.getElementById(
                `${elementId}-validation-previous`
            );

            const next = document.getElementById(
                `${elementId}-validation-next`
            );

            if (errors.length === 0) {
                state.activeValidationIndex = -1;

                if (panel) {
                    panel.hidden = true;
                }

                this.renderStatus(elementId);
                return;
            }

            if (
                state.activeValidationIndex < 0 ||
                state.activeValidationIndex >= errors.length
            ) {
                state.activeValidationIndex = 0;
            }

            const activeError = errors[state.activeValidationIndex];

            const fieldLabel =
                this.getFieldLabel(activeError.field) || activeError.field;
            const rowNumber = this.getValidationRowNumber(
                elementId,
                activeError.rowId
            );

            if (panel) {
                panel.hidden = false;
            }

            if (title) {
                title.textContent =
                    `يوجد ${errors.length.toLocaleString()} ` +
                    `${errors.length === 1 ? "خطأ يمنع" : "أخطاء تمنع"} الحفظ`;
            }

            if (message) {
                message.textContent =
                    `الصف ${rowNumber} — ${fieldLabel}: ${activeError.message}`;
            }

            if (previous) {
                previous.disabled = errors.length <= 1;
            }

            if (next) {
                next.disabled = errors.length <= 1;
            }

            this.renderStatus(elementId);
        },

        clearTableRanges: function (elementId) {
            const table = this.tables[elementId];

            if (!table) {
                return;
            }

            /*
             * Let Tabulator remove its own range state and rendered classes.
             * Manually deleting Tabulator CSS classes can leave the internal
             * active range pointing at a different cell than the visible border.
             */
            for (const range of table.getRanges()) {
                try {
                    range.remove();
                } catch {
                }
            }

            /*
             * Do not rely only on Tabulator's rangeRemoved event.
             * Some programmatic clear paths can finish without refreshing
             * the selected-row financial summary.
             */
            this.scheduleSelectionAggregateRefresh?.(
                elementId,
                "ranges-cleared"
            );
        },

        ensureRangeBeforeRightClick: function (elementId, event) {
            const table = this.tables[elementId];
            const element = document.getElementById(elementId);

            if (
                !table ||
                !element ||
                event?.button !== 2 ||
                table.getRanges().length > 0
            ) {
                return;
            }

            const cellElement =
                event.target instanceof Element
                    ? event.target.closest(".tabulator-cell")
                    : null;

            if (
                !cellElement ||
                !element.contains(cellElement)
            ) {
                return;
            }

            /*
             * Tabulator 6.5 leaves SelectRange.activeRange as false when
             * selectableRangeInitializeDefault is disabled. Its first right-click
             * path calls activeRange.occupies(...) before creating a range, which
             * throws. Create the real range on the clicked visible cell during the
             * capture phase, before Tabulator handles the same mousedown event.
             */
            for (const row of table.getRows("visible")) {
                for (const cell of row.getCells()) {
                    if (cell.getElement() === cellElement) {
                        table.addRange(cell, cell);
                        return;
                    }
                }
            }
        },

        bindHeaderFilterSelectionGuards: function (elementId) {
            const table = this.tables[elementId];

            if (!table) {
                return;
            }

            const tableElement = table.element;

            if (!tableElement) {
                return;
            }

            const stopHeaderSelection = event => {
                /*
                 * Keep pointer events from starting a whole-column range while
                 * still allowing Tabulator's own click handler to open a popup.
                 */
                event.stopPropagation();
            };

            for (const button of tableElement.querySelectorAll(
                ".tabulator-header-popup-button"
            )) {
                if (button.dataset.udsSelectionGuard === "true") {
                    continue;
                }

                button.dataset.udsSelectionGuard = "true";

                /*
                 * Capture runs before Tabulator's target click listener. When the
                 * same icon owns the open popup, close it and cancel this click so
                 * Tabulator does not immediately open another copy.
                 */
                button.addEventListener(
                    "click",
                    event => {
                        window.tabulatorFilters.handleHeaderIconClick(
                            elementId,
                            button,
                            event
                        );
                    },
                    true
                );

                button.addEventListener("pointerdown", stopHeaderSelection);
                button.addEventListener("mousedown", stopHeaderSelection);
                button.addEventListener("click", stopHeaderSelection);
            }
        },

        applyValidationStylesToRow: function (elementId, rowOrId) {
            const table = this.tables[elementId];
            const state = this.states[elementId];

            if (!table || !state) {
                return;
            }

            const row =
                typeof rowOrId === "object" && rowOrId?.getData
                    ? rowOrId
                    : table.getRow(rowOrId);

            if (!row) {
                return;
            }

            const rowKey = String(row.getIndex());
            const rowElement = row.getElement();

            rowElement?.classList.toggle(
                "uds-validation-error-row",
                state.validationRowIds.has(rowKey)
            );
        },

        applyVisibleValidationStyles: function (elementId) {
            const table = this.tables[elementId];

            if (!table) {
                return;
            }

            for (const row of table.getRows("visible")) {
                this.applyValidationStylesToRow(elementId, row);
            }
        },

        focusValidationError: async function (elementId, index) {
            const table = this.tables[elementId];
            const state = this.states[elementId];
            const errors = this.getSortedValidationErrors(elementId);

            if (!table || !state || errors.length === 0) {
                return false;
            }

            const normalizedIndex =
                ((Number(index) || 0) % errors.length + errors.length) % errors.length;

            state.activeValidationIndex = normalizedIndex;
            state.validationOrder = errors.map(error => error.key);

            const error = errors[normalizedIndex];

            /*
             * Next/Previous only updates the message and brings the relevant row
             * and column into view. It does not create a red cell marker and does
             * not interfere with the user's normal blue spreadsheet selection.
             */
            this.syncValidationUi(elementId);

            const row = table.getRow(error.rowId);

            if (!row) {
                return false;
            }

            try {
                await Promise.resolve(
                    table.scrollToRow(row, "nearest", false)
                );
            } catch {
            }

            try {
                await Promise.resolve(
                    table.scrollToColumn(error.field, "center", false)
                );
            } catch {
            }

            await new Promise(resolve =>
                window.requestAnimationFrame(resolve)
            );

            this.applyVisibleValidationStyles(elementId);
            return true;
        },

        nextValidationError: function (elementId) {
            const state = this.states[elementId];

            if (!state) {
                return;
            }

            this.focusValidationError(
                elementId,
                state.activeValidationIndex + 1
            );
        },

        previousValidationError: function (elementId) {
            const state = this.states[elementId];

            if (!state) {
                return;
            }

            this.focusValidationError(
                elementId,
                state.activeValidationIndex - 1
            );
        },

        validateCellValue: function (
            elementId,
            rowData,
            field,
            options = {}
        ) {
            const definition = this.getFieldDefinition(field);

            if (!definition) {
                return null;
            }

            for (const validator of definition.validators) {
                const result = validator.call(
                    this,
                    rowData?.[field],
                    rowData,
                    {
                        ...options,
                        elementId: elementId,
                        field: field,
                        definition: definition
                    }
                );

                if (result) {
                    return result;
                }
            }

            return null;
        },

        validateRow: function (elementId, rowOrId, options = {}) {
            const table = this.tables[elementId];
            const state = this.states[elementId];

            if (!table || !state) {
                return;
            }

            const row =
                typeof rowOrId === "object" && rowOrId?.getData
                    ? rowOrId
                    : table.getRow(rowOrId);

            if (!row) {
                return;
            }

            const rowData = row.getData();
            const rowKey = String(row.getIndex());
            const isBlank = this.isCompletelyBlankRowData(rowData);
            const isPersistedRow = state.originalRows.has(rowKey);
            const forceRequired =
                options.forceRequired === true ||
                isPersistedRow ||
                !isBlank;

            for (const field of this.getValidatableFieldKeys()) {
                const result = this.validateCellValue(
                    elementId,
                    rowData,
                    field,
                    { forceRequired: forceRequired }
                );

                if (result) {
                    this.setCellValidationError(
                        elementId,
                        row.getIndex(),
                        field,
                        result.code,
                        result.message,
                        { deferUi: true }
                    );
                } else {
                    this.clearCellValidationError(
                        elementId,
                        row.getIndex(),
                        field,
                        { deferUi: true }
                    );
                }
            }

            this.applyValidationStylesToRow(elementId, row);
        },

        validateFieldChanges: function (
            elementId,
            changedFieldsByRow,
            options = {}
        ) {
            const table = this.tables[elementId];
            const state = this.states[elementId];

            if (!table || !state || !(changedFieldsByRow instanceof Map)) {
                return;
            }

            const identityRows = new Set();

            for (const [rowKey, fields] of changedFieldsByRow) {
                const numericId = Number(rowKey);
                const row = table.getRow(
                    Number.isNaN(numericId) ? rowKey : numericId
                );

                if (!row) {
                    continue;
                }

                const rowData = row.getData();
                const isBlank = this.isCompletelyBlankRowData(rowData);
                const isPersistedRow = state.originalRows.has(String(rowKey));
                const forceRequired =
                    options.forceRequired === true ||
                    isPersistedRow ||
                    !isBlank;

                const affectedRules =
                    this.getAffectedValidationRuleKeys(fields);
                const fieldsToValidate = new Set(fields ?? []);

                for (const fieldKey of this.getValidatableFieldKeys()) {
                    const fieldDefinition =
                        this.getFieldDefinition(fieldKey);

                    if (fieldDefinition?.validationRules.some(
                        ruleKey => affectedRules.has(ruleKey)
                    )) {
                        fieldsToValidate.add(fieldKey);
                    }
                }

                for (const field of fieldsToValidate) {
                    const definition = this.getFieldDefinition(field);

                    if (!definition || definition.validators.length === 0) {
                        continue;
                    }

                    const result = this.validateCellValue(
                        elementId,
                        rowData,
                        field,
                        { forceRequired: forceRequired }
                    );

                    if (result) {
                        this.setCellValidationError(
                            elementId,
                            row.getIndex(),
                            field,
                            result.code,
                            result.message,
                            { deferUi: true }
                        );
                    } else {
                        this.clearCellValidationError(
                            elementId,
                            row.getIndex(),
                            field,
                            { deferUi: true }
                        );
                    }
                }

                if (affectedRules.has("work-order-identity")) {
                    identityRows.add(String(rowKey));
                }

                this.applyValidationStylesToRow(elementId, row);
            }

            if (identityRows.size > 0) {
                this.refreshIdentityDuplicateErrors(
                    elementId,
                    identityRows,
                    true
                );
            }

            this.syncValidationUi(elementId);
        },

        validateRows: function (elementId, rowIds, options = {}) {
            const table = this.tables[elementId];

            if (!table) {
                return;
            }

            const uniqueRowIds = new Set(
                Array.from(rowIds ?? []).map(rowId => String(rowId))
            );

            for (const rowId of uniqueRowIds) {
                const numericId = Number(rowId);
                const row = table.getRow(
                    Number.isNaN(numericId) ? rowId : numericId
                );

                if (row) {
                    this.validateRow(elementId, row, options);
                }
            }

            this.refreshIdentityDuplicateErrors(
                elementId,
                uniqueRowIds,
                true
            );
            this.syncValidationUi(elementId);
        },

        refreshIdentityDuplicateErrors: function (
            elementId,
            rowIds,
            deferUi = false
        ) {
            const table = this.tables[elementId];
            const state = this.states[elementId];

            if (!table || !state) {
                return;
            }

            const uniqueRowIds = new Set(
                Array.from(rowIds ?? []).map(
                    rowId => String(rowId)
                )
            );

            if (uniqueRowIds.size === 0) {
                if (!deferUi) {
                    this.syncValidationUi(elementId);
                }

                return;
            }

            const affectedIdentityKeys = new Set();
            const affectedRowIds = new Set();

            for (const rowKey of uniqueRowIds) {
                const previousKey =
                    state.rowIdentityKeys.get(rowKey);

                if (previousKey) {
                    affectedIdentityKeys.add(previousKey);

                    const previousOwners =
                        state.identityRows.get(previousKey);

                    if (previousOwners) {
                        for (const ownerRowId of previousOwners) {
                            affectedRowIds.add(ownerRowId);
                        }

                        previousOwners.delete(rowKey);

                        if (previousOwners.size === 0) {
                            state.identityRows.delete(previousKey);
                        }
                    }
                }

                state.rowIdentityKeys.delete(rowKey);

                const numericId = Number(rowKey);
                const row = table.getRow(
                    Number.isNaN(numericId)
                        ? rowKey
                        : numericId
                );

                if (row) {
                    const nextKey =
                        this.getIdentityKey(row.getData());

                    if (nextKey) {
                        affectedIdentityKeys.add(nextKey);

                        if (!state.identityRows.has(nextKey)) {
                            state.identityRows.set(
                                nextKey,
                                new Set()
                            );
                        }

                        state.identityRows
                            .get(nextKey)
                            .add(rowKey);

                        state.rowIdentityKeys.set(
                            rowKey,
                            nextKey
                        );
                    }
                }

                affectedRowIds.add(rowKey);
            }

            for (const identityKey of affectedIdentityKeys) {
                const owners =
                    state.identityRows.get(identityKey);

                if (!owners) {
                    continue;
                }

                for (const ownerRowId of owners) {
                    affectedRowIds.add(ownerRowId);
                }
            }

            for (const rowId of affectedRowIds) {
                this.clearCellValidationError(
                    elementId,
                    rowId,
                    "workOrderNumber",
                    {
                        code: "duplicate_identity",
                        deferUi: true
                    }
                );

                this.clearCellValidationError(
                    elementId,
                    rowId,
                    "workTypeCode",
                    {
                        code: "duplicate_identity",
                        deferUi: true
                    }
                );
            }

            const message =
                "رقم أمر العمل ونوعه مكرران داخل الشيت.";

            for (const identityKey of affectedIdentityKeys) {
                const owners =
                    state.identityRows.get(identityKey);

                if (!owners || owners.size <= 1) {
                    continue;
                }

                for (const rowId of owners) {
                    this.setCellValidationError(
                        elementId,
                        rowId,
                        "workOrderNumber",
                        "duplicate_identity",
                        message,
                        { deferUi: true }
                    );

                    this.setCellValidationError(
                        elementId,
                        rowId,
                        "workTypeCode",
                        "duplicate_identity",
                        message,
                        { deferUi: true }
                    );
                }
            }

            if (!deferUi) {
                this.syncValidationUi(elementId);
            }
        },

        validateBeforeSave: async function (elementId) {
            await this.commitActiveEditor(elementId);

            const state = this.states[elementId];

            if (!state) {
                return false;
            }

            const newRowIds = new Set();
            const existingChanges = new Map();

            for (const rowKey of state.dirtyRowIds) {
                if (!state.originalRows.has(String(rowKey))) {
                    newRowIds.add(String(rowKey));
                    continue;
                }

                const fields =
                    state.changedFieldsByRow?.get(String(rowKey));

                if (fields?.size > 0) {
                    existingChanges.set(String(rowKey), fields);
                }
            }

            if (newRowIds.size > 0) {
                this.validateRows(
                    elementId,
                    newRowIds,
                    { forceRequired: true }
                );
            }

            if (existingChanges.size > 0) {
                this.validateFieldChanges(
                    elementId,
                    existingChanges,
                    { forceRequired: true }
                );
            }

            const errors = this.getSortedValidationErrors(elementId);

            if (errors.length > 0) {
                this.setStatus(
                    elementId,
                    `لا يمكن الحفظ قبل تصحيح ${errors.length.toLocaleString()} ` +
                    `${errors.length === 1 ? "خطأ" : "أخطاء"}.`
                );

                await this.focusValidationError(elementId, 0);
                return false;
            }

            return true;
        },

        applyExternalValidationErrors: function (
            elementId,
            errors,
            focusFirst = true
        ) {
            const state = this.states[elementId];

            if (!state || !Array.isArray(errors)) {
                return;
            }

            for (const error of errors) {
                this.setCellValidationError(
                    elementId,
                    error.rowId ?? error.RowId,
                    error.field ?? error.FieldName,
                    error.code ?? error.ErrorCode ?? "server_validation",
                    error.message ?? error.Message ?? "القيمة غير صحيحة.",
                    {
                        source: "server",
                        deferUi: true
                    }
                );
            }

            this.syncValidationUi(elementId);

            if (focusFirst && state.validationErrors.size > 0) {
                this.focusValidationError(elementId, 0);
            }
        },

        fixedDigitsEditor: function (
            cell,
            onRendered,
            success,
            cancel,
            editorParams
        ) {
            const requiredLength =
                Number(editorParams?.requiredLength) || 1;

            const requiredPattern =
                new RegExp(`^[0-9]{${requiredLength}}$`);

            const fieldLabel =
                editorParams?.label ||
                (requiredLength === 9
                    ? "رقم أمر العمل"
                    : "نوع أمر العمل");

            const wrapper = document.createElement("div");
            wrapper.className = "uds-identity-editor";

            const input = document.createElement("input");
            input.className = "uds-identity-editor-input";
            input.type = "text";
            input.inputMode = "numeric";
            input.autocomplete = "off";
            input.maxLength = requiredLength;
            input.pattern = `[0-9]{${requiredLength}}`;
            input.value = window.tabulatorTest
                .normalizeIdentityDigits(cell.getValue())
                .trim();

            const counter = document.createElement("span");
            counter.className = "uds-identity-editor-count";
            counter.setAttribute("aria-hidden", "true");

            wrapper.append(input, counter);

            const cellElement = cell.getElement();
            const tableElementId =
                cell.getTable()?.element?.id || "";
            const validationRowId =
                cell.getRow().getIndex();
            const validationField =
                cell.getField();

            const pageElement =
                cell.getTable()?.element?.closest(
                    ".tabulator-workorders-page"
                ) || document.body;

            const popoverId =
                `uds-identity-validation-${Date.now()}-${Math.random()
                    .toString(36)
                    .slice(2)}`;

            let popover = null;
            let completed = false;
            let lastAcceptedValue = input.value;
            let rejectedInputTimer = null;

            input.setAttribute("aria-describedby", popoverId);

            const positionPopover = function () {
                if (!popover || popover.hidden) {
                    return;
                }

                const rect = input.getBoundingClientRect();
                const gap = 7;
                const viewportPadding = 10;
                const popoverWidth = Math.min(
                    Math.max(rect.width, 235),
                    340
                );

                popover.style.width = `${popoverWidth}px`;

                let left = rect.left;
                left = Math.max(
                    viewportPadding,
                    Math.min(
                        left,
                        window.innerWidth - popoverWidth - viewportPadding
                    )
                );

                popover.style.left = `${left}px`;

                const measuredHeight =
                    popover.offsetHeight || 42;

                const hasRoomBelow =
                    rect.bottom + gap + measuredHeight <=
                    window.innerHeight - viewportPadding;

                if (hasRoomBelow) {
                    popover.classList.remove("is-above");
                    popover.style.top = `${rect.bottom + gap}px`;
                } else {
                    popover.classList.add("is-above");
                    popover.style.top = `${Math.max(
                        viewportPadding,
                        rect.top - measuredHeight - gap
                    )}px`;
                }
            };

            const ensurePopover = function () {
                if (popover) {
                    return popover;
                }

                popover = document.createElement("div");
                popover.id = popoverId;
                popover.className =
                    "uds-identity-validation-popover";
                popover.setAttribute("role", "alert");
                popover.hidden = true;
                pageElement.appendChild(popover);
                return popover;
            };

            const hideValidationMessage = function () {
                if (popover) {
                    popover.hidden = true;
                }
            };

            const showValidationMessage = function (message) {
                const messageElement = ensurePopover();
                messageElement.textContent = message;
                messageElement.hidden = false;

                window.requestAnimationFrame(positionPopover);
            };

            const clearRejectedInputTimer = function () {
                if (rejectedInputTimer !== null) {
                    window.clearTimeout(rejectedInputTimer);
                    rejectedInputTimer = null;
                }
            };

            const setVisualState = function (state) {
                wrapper.classList.remove(
                    "is-neutral",
                    "is-invalid",
                    "is-valid"
                );
                wrapper.classList.add(`is-${state}`);

                cellElement.classList.toggle(
                    "uds-identity-cell-invalid",
                    state === "invalid"
                );

                input.setAttribute(
                    "aria-invalid",
                    state === "invalid" ? "true" : "false"
                );

                const valueLength = input.value.trim().length;

                counter.textContent =
                    state === "valid"
                        ? `✓ ${valueLength}/${requiredLength}`
                        : `${valueLength}/${requiredLength}`;
            };

            const currentLengthMessage = function () {
                const valueLength = input.value.trim().length;

                return `${fieldLabel}: مطلوب ${requiredLength} أرقام بالضبط — تم إدخال ${valueLength}.`;
            };

            const updateValidationState = function (
                forceMessage = false
            ) {
                clearRejectedInputTimer();

                const value = input.value.trim();
                const isValid = requiredPattern.test(value);

                if (isValid) {
                    setVisualState("valid");
                    hideValidationMessage();
                    input.removeAttribute("title");

                    if (tableElementId) {
                        window.tabulatorTest.clearCellValidationError(
                            tableElementId,
                            validationRowId,
                            validationField
                        );
                    }

                    return true;
                }

                if (value.length === 0 && !forceMessage) {
                    const emptyMessage =
                        `${fieldLabel}: مطلوب ${requiredLength} أرقام بالضبط.`;

                    setVisualState("neutral");
                    hideValidationMessage();
                    input.title = emptyMessage;

                    if (tableElementId) {
                        window.tabulatorTest.setCellValidationError(
                            tableElementId,
                            validationRowId,
                            validationField,
                            "required",
                            emptyMessage
                        );
                    }

                    return false;
                }

                const message = currentLengthMessage();

                setVisualState("invalid");
                input.title = message;
                showValidationMessage(message);

                if (tableElementId) {
                    window.tabulatorTest.setCellValidationError(
                        tableElementId,
                        validationRowId,
                        validationField,
                        "identity_format",
                        message
                    );
                }

                return false;
            };

            const showRejectedInput = function (message) {
                clearRejectedInputTimer();

                setVisualState("invalid");
                input.title = message;
                showValidationMessage(message);

                if (tableElementId) {
                    window.tabulatorTest.setCellValidationError(
                        tableElementId,
                        validationRowId,
                        validationField,
                        "identity_format",
                        message
                    );
                }

                rejectedInputTimer = window.setTimeout(
                    function () {
                        updateValidationState(
                            input.value.trim().length > 0
                        );
                    },
                    1200
                );
            };

            const cleanup = function () {
                clearRejectedInputTimer();
                cellElement.classList.remove(
                    "uds-identity-cell-invalid"
                );

                window.removeEventListener(
                    "resize",
                    positionPopover
                );
                document.removeEventListener(
                    "scroll",
                    positionPopover,
                    true
                );

                if (popover) {
                    popover.remove();
                    popover = null;
                }
            };

            const setAcceptedValue = function (
                value,
                caretPosition
            ) {
                input.value = value;
                lastAcceptedValue = value;

                const nextPosition = Math.min(
                    Math.max(Number(caretPosition) || 0, 0),
                    value.length
                );

                input.setSelectionRange(
                    nextPosition,
                    nextPosition
                );

                updateValidationState(value.length > 0);
            };

            const commit = function (cancelWhenInvalid) {
                if (completed) {
                    return;
                }

                const value = input.value.trim();

                if (!requiredPattern.test(value)) {
                    updateValidationState(true);

                    if (cancelWhenInvalid) {
                        completed = true;
                        cleanup();
                        cancel();
                    } else {
                        input.focus();
                        input.select();
                    }

                    return;
                }

                completed = true;
                cleanup();
                success(value);
            };

            input.addEventListener("focus", function () {
                if (
                    input.value.trim().length > 0 &&
                    !requiredPattern.test(input.value.trim())
                ) {
                    updateValidationState(true);
                }
            });

            input.addEventListener("keydown", function (event) {
                if (event.key === "Enter") {
                    event.preventDefault();
                    event.stopPropagation();
                    commit(false);
                    return;
                }

                if (event.key === "Escape") {
                    completed = true;
                    event.preventDefault();
                    event.stopPropagation();
                    cleanup();
                    cancel();

                    if (tableElementId) {
                        window.setTimeout(() => {
                            window.tabulatorTest.validateRows(
                                tableElementId,
                                [validationRowId],
                                { forceRequired: false }
                            );
                        }, 0);
                    }

                    return;
                }

                const isPrintableKey =
                    event.key.length === 1 &&
                    !event.ctrlKey &&
                    !event.metaKey &&
                    !event.altKey;

                if (!isPrintableKey) {
                    return;
                }

                const normalizedKey = window.tabulatorTest
                    .normalizeIdentityDigits(event.key);

                if (!/^[0-9]$/.test(normalizedKey)) {
                    event.preventDefault();
                    showRejectedInput("يسمح بإدخال الأرقام فقط.");
                    return;
                }

                const selectionStart =
                    input.selectionStart ?? input.value.length;
                const selectionEnd =
                    input.selectionEnd ?? selectionStart;

                const nextLength =
                    input.value.length -
                    (selectionEnd - selectionStart) +
                    1;

                if (nextLength > requiredLength) {
                    event.preventDefault();
                    showRejectedInput(
                        `الحد الأقصى ${requiredLength} أرقام.`
                    );
                }
            });

            input.addEventListener("paste", function (event) {
                const clipboardText =
                    event.clipboardData?.getData("text") ?? "";

                const normalizedClipboard =
                    window.tabulatorTest
                        .normalizeIdentityDigits(clipboardText)
                        .trim();

                const selectionStart =
                    input.selectionStart ?? input.value.length;
                const selectionEnd =
                    input.selectionEnd ?? selectionStart;

                const proposedValue =
                    input.value.slice(0, selectionStart) +
                    normalizedClipboard +
                    input.value.slice(selectionEnd);

                if (!/^[0-9]*$/.test(normalizedClipboard)) {
                    event.preventDefault();
                    showRejectedInput(
                        "القيمة الملصقة يجب أن تحتوي على أرقام فقط."
                    );
                    return;
                }

                if (proposedValue.length > requiredLength) {
                    event.preventDefault();
                    showRejectedInput(
                        `القيمة الملصقة تتجاوز ${requiredLength} أرقام.`
                    );
                    return;
                }

                event.preventDefault();

                setAcceptedValue(
                    proposedValue,
                    selectionStart + normalizedClipboard.length
                );
            });

            input.addEventListener("input", function () {
                const rawValue = input.value;
                const normalized = window.tabulatorTest
                    .normalizeIdentityDigits(rawValue);

                if (
                    !/^[0-9]*$/.test(normalized) ||
                    normalized.length > requiredLength
                ) {
                    input.value = lastAcceptedValue;
                    input.setSelectionRange(
                        lastAcceptedValue.length,
                        lastAcceptedValue.length
                    );

                    showRejectedInput(
                        normalized.length > requiredLength
                            ? `الحد الأقصى ${requiredLength} أرقام.`
                            : "يسمح بإدخال الأرقام فقط."
                    );
                    return;
                }

                const selectionStart =
                    input.selectionStart ?? normalized.length;

                input.value = normalized;
                lastAcceptedValue = normalized;

                const nextPosition = Math.min(
                    selectionStart,
                    normalized.length
                );

                input.setSelectionRange(
                    nextPosition,
                    nextPosition
                );

                updateValidationState(normalized.length > 0);
            });

            input.addEventListener("blur", function () {
                commit(true);
            });

            window.addEventListener("resize", positionPopover);
            document.addEventListener(
                "scroll",
                positionPopover,
                true
            );

            onRendered(function () {
                updateValidationState(false);
                input.focus();
                input.select();
            });

            return wrapper;
        },

        assignmentDateEditor: function (
            cell,
            onRendered,
            success,
            cancel
        ) {
            const input = document.createElement("input");
            const cellElement = cell.getElement();
            const tableElement = cellElement?.closest(".tabulator");
            const elementId = tableElement?.id ?? null;
            const rowId = cell.getRow().getIndex();
            const field = cell.getField();
            const validationMessage =
                "أدخل تاريخًا صحيحًا بالشكل يوم/شهر/سنة.";

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

            const clearCentralError = function () {
                if (!elementId) {
                    return;
                }

                window.tabulatorTest.clearCellValidationError(
                    elementId,
                    rowId,
                    field,
                    { code: "invalid_date" }
                );
            };

            const publishCentralError = function () {
                if (!elementId) {
                    return;
                }

                window.tabulatorTest.setCellValidationError(
                    elementId,
                    rowId,
                    field,
                    "invalid_date",
                    validationMessage
                );

                const state =
                    window.tabulatorTest.states[elementId];
                const errors =
                    window.tabulatorTest.getSortedValidationErrors(
                        elementId
                    );
                const key =
                    window.tabulatorTest.getValidationCellKey(
                        rowId,
                        field
                    );
                const index = errors.findIndex(
                    error => error.key === key
                );

                if (state && index >= 0) {
                    state.activeValidationIndex = index;
                    window.tabulatorTest.syncValidationUi(
                        elementId
                    );
                }
            };

            const clearLocalError = function () {
                input.style.boxShadow = "none";
                input.style.background = "#ffffff";
                input.removeAttribute("title");
                input.setAttribute("aria-invalid", "false");
            };

            const showLocalError = function (focusEditor) {
                input.style.boxShadow =
                    "inset 0 0 0 2px #c62828";
                input.style.background = "#fff7f7";
                input.title = validationMessage;
                input.setAttribute("aria-invalid", "true");

                if (focusEditor) {
                    input.focus();
                    input.select();
                }
            };

            const updateLiveValidation = function () {
                const normalized =
                    window.tabulatorTest
                        .normalizeAssignmentDate(
                            input.value
                        );

                if (normalized === null) {
                    showLocalError(false);
                    publishCentralError();
                    return false;
                }

                clearLocalError();
                clearCentralError();
                return true;
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
                    showLocalError(true);
                    publishCentralError();
                    return;
                }

                completed = true;
                clearLocalError();
                clearCentralError();
                success(normalized);
            };

            input.addEventListener(
                "input",
                updateLiveValidation
            );

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
                    clearCentralError();
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

    });

    target.registerValidationRuleDefinitions([
        {
            key: "work-order-identity",
            dependsOn: ["workOrderNumber", "workTypeCode"]
        },
        {
            key: "financial-amounts",
            dependsOn: ["workOrderValue", "partialAmount"]
        }
    ]);

    target.registerFieldDefinitions([
        {
            key: "displayOrder",
            label: "ترتيب الصف",
            order: 0,
            countsAsContent: false
        },
        {
            key: "workOrderNumber",
            label: "رقم أمر العمل",
            order: 10,
            normalize: function (value) {
                return this.normalizeIdentityDigits(value).trim();
            },
            validationRules: ["work-order-identity"],
            validators: [
                function (value, _rowData, options) {
                    const text = String(value ?? "").trim();

                    if (text === "") {
                        return options.forceRequired
                            ? {
                                code: "required",
                                message: "رقم أمر العمل مطلوب ويجب أن يتكون من 9 أرقام."
                            }
                            : null;
                    }

                    return /^[0-9]{9}$/.test(text)
                        ? null
                        : {
                            code: "identity_format",
                            message: "يجب أن يتكون رقم أمر العمل من 9 أرقام بالضبط."
                        };
                }
            ]
        },
        {
            key: "workTypeCode",
            label: "نوع أمر العمل",
            order: 20,
            normalize: function (value) {
                return this.normalizeIdentityDigits(value).trim();
            },
            validationRules: ["work-order-identity"],
            validators: [
                function (value, _rowData, options) {
                    const text = String(value ?? "").trim();

                    if (text === "") {
                        return options.forceRequired
                            ? {
                                code: "required",
                                message: "نوع أمر العمل مطلوب ويجب أن يتكون من 3 أرقام."
                            }
                            : null;
                    }

                    return /^[0-9]{3}$/.test(text)
                        ? null
                        : {
                            code: "identity_format",
                            message: "يجب أن يتكون نوع أمر العمل من 3 أرقام بالضبط."
                        };
                }
            ]
        },
        {
            key: "assignmentDate",
            label: "تاريخ الإسناد",
            order: 30,
            normalize: function (value) {
                const normalized = this.normalizeAssignmentDate(value);

                return normalized === null
                    ? String(value ?? "").trim()
                    : normalized;
            },
            validators: [
                function (value) {
                    const text = String(value ?? "").trim();

                    if (text === "" || this.normalizeAssignmentDate(text) !== null) {
                        return null;
                    }

                    return {
                        code: "invalid_date",
                        message: "أدخل تاريخًا صحيحًا بالشكل يوم/شهر/سنة."
                    };
                }
            ]
        },
        {
            key: "workOrderValue",
            label: "Work Order Value",
            order: 40,
            normalize: function (value) {
                return this.normalizeAmountValue(value);
            },
            validationRules: ["financial-amounts"],
            validators: [
                function (value, rowData, options) {
                    const parsed = this.parseAmount(value);

                    if (parsed.empty) {
                        return options.forceRequired
                            ? {
                                code: "required",
                                message: "قيمة أمر العمل مطلوبة ويجب أن تكون أكبر من صفر."
                            }
                            : null;
                    }

                    if (!parsed.valid) {
                        return {
                            code: "invalid_amount",
                            message: "أدخل قيمة أمر عمل رقمية صحيحة."
                        };
                    }

                    if (parsed.cents <= 0) {
                        return {
                            code: "positive_amount",
                            message: "قيمة أمر العمل يجب أن تكون أكبر من صفر."
                        };
                    }

                    const partial = this.parseAmount(
                        rowData?.partialAmount
                    );

                    if (
                        partial.valid &&
                        !partial.empty &&
                        partial.cents > parsed.cents
                    ) {
                        return {
                            code: "partial_above_value",
                            message:
                                "لا يمكن جعل قيمة أمر العمل أقل من " +
                                `المبلغ الجزئي المسجل: ${partial.formatted}.`
                        };
                    }

                    return null;
                }
            ]
        },
        {
            key: "partialAmount",
            label: "Partial Amount",
            order: 50,
            normalize: function (value) {
                return this.normalizeAmountValue(value);
            },
            validationRules: ["financial-amounts"],
            validators: [
                function (value) {
                    const parsed = this.parseAmount(value);

                    if (parsed.empty) {
                        return null;
                    }

                    if (!parsed.valid) {
                        return {
                            code: "invalid_amount",
                            message: "أدخل مبلغًا جزئيًا رقميًا صحيحًا."
                        };
                    }

                    return parsed.cents > 0
                        ? null
                        : {
                            code: "positive_amount",
                            message: "المبلغ الجزئي يجب أن يكون أكبر من صفر عند إدخاله."
                        };
                }
            ]
        },
        {
            key: "remainingAmount",
            label: "Remaining Amount",
            order: 60,
            persisted: false,
            trackChanges: false,
            countsAsContent: false,
            normalize: function (value) {
                return this.normalizeAmountValue(value);
            }
        },
        {
            key: "basket",
            label: "السلة",
            order: 70,
            normalize: function (value) {
                return String(value ?? "").trim();
            },
            validators: [
                function (value, _rowData, options) {
                    const text = String(value ?? "").trim();

                    if (text === "") {
                        return options.forceRequired
                            ? {
                                code: "required",
                                message: "اختيار السلة مطلوب."
                            }
                            : null;
                    }

                    const state = this.states[options.elementId];

                    return state?.basketValues && !state.basketValues.has(text)
                        ? {
                            code: "invalid_option",
                            message: "اختر قيمة صحيحة من قائمة السلة."
                        }
                        : null;
                }
            ]
        },
    ]);
})();
