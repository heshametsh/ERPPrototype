window.tabulatorTest = {
    tables: {},
    states: {},

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
        basket: 3,
        status: 4,
        notes: 5
    },

    validationFieldLabels: {
        workOrderNumber: "رقم أمر العمل",
        workTypeCode: "نوع أمر العمل",
        assignmentDate: "تاريخ الإسناد",
        basket: "السلة",
        status: "الحالة",
        notes: "الملاحظات"
    },

    getValidationCellKey: function (rowId, field) {
        return `${String(rowId)}::${String(field)}`;
    },

    isCompletelyBlankRowData: function (rowData) {
        return [
            "workOrderNumber",
            "workTypeCode",
            "assignmentDate",
            "basket",
            "status",
            "notes"
        ].every(field =>
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
                    this.validationFieldOrder[first.field] ?? 999;
                const secondField =
                    this.validationFieldOrder[second.field] ?? 999;

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
            this.validationFieldLabels[activeError.field] || activeError.field;
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
                table.scrollToRow(row, "center", false)
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
        const state = this.states[elementId];
        const value = String(rowData?.[field] ?? "").trim();
        const forceRequired = options.forceRequired === true;

        if (field === "workOrderNumber") {
            if (value === "") {
                return forceRequired
                    ? {
                        code: "required",
                        message: "رقم أمر العمل مطلوب ويجب أن يتكون من 9 أرقام."
                    }
                    : null;
            }

            if (!/^[0-9]{9}$/.test(value)) {
                return {
                    code: "identity_format",
                    message: "يجب أن يتكون رقم أمر العمل من 9 أرقام بالضبط."
                };
            }
        }

        if (field === "workTypeCode") {
            if (value === "") {
                return forceRequired
                    ? {
                        code: "required",
                        message: "نوع أمر العمل مطلوب ويجب أن يتكون من 3 أرقام."
                    }
                    : null;
            }

            if (!/^[0-9]{3}$/.test(value)) {
                return {
                    code: "identity_format",
                    message: "يجب أن يتكون نوع أمر العمل من 3 أرقام بالضبط."
                };
            }
        }

        if (field === "assignmentDate" && value !== "") {
            if (this.normalizeAssignmentDate(value) === null) {
                return {
                    code: "invalid_date",
                    message: "أدخل تاريخًا صحيحًا بالشكل يوم/شهر/سنة."
                };
            }
        }

        if (field === "basket") {
            if (value === "") {
                return forceRequired
                    ? {
                        code: "required",
                        message: "اختيار السلة مطلوب."
                    }
                    : null;
            }

            if (state?.basketValues && !state.basketValues.has(value)) {
                return {
                    code: "invalid_option",
                    message: "اختر قيمة صحيحة من قائمة السلة."
                };
            }
        }

        if (field === "status" && value.length > 150) {
            return {
                code: "max_length",
                message: "الحالة لا يمكن أن تتجاوز 150 حرفًا."
            };
        }

        if (field === "notes" && value.length > 1000) {
            return {
                code: "max_length",
                message: "الملاحظات لا يمكن أن تتجاوز 1000 حرف."
            };
        }

        return null;
    },

    validateRow: function (elementId, rowOrId, options = {}) {
        const table = this.tables[elementId];

        if (!table) {
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
        const isBlank = this.isCompletelyBlankRowData(rowData);
        const forceRequired =
            options.forceRequired === true || !isBlank;

        for (const field of Object.keys(this.validationFieldOrder)) {
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

        this.validateRows(
            elementId,
            state.dirtyRowIds,
            { forceRequired: true }
        );

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

    initialize: function (elementId, data, baskets) {
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

        if (oldState?.rightClickRangeGuardHandler) {
            oldTable?.element?.removeEventListener(
                "mousedown",
                oldState.rightClickRangeGuardHandler,
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

        if (oldState?.resizeHandler) {
            window.removeEventListener(
                "resize",
                oldState.resizeHandler
            );
        }

        if (oldState?.resizeTimer) {
            window.clearTimeout(oldState.resizeTimer);
            oldState.resizeTimer = null;
        }

        if (oldState) {
            oldState.resizePendingViewportPosition = null;
        }

        if (
            oldState?.resizeViewportRestoreFrame !== null &&
            oldState?.resizeViewportRestoreFrame !== undefined
        ) {
            window.cancelAnimationFrame(
                oldState.resizeViewportRestoreFrame
            );
            oldState.resizeViewportRestoreFrame = null;
            oldState.resizeViewportRestoreFramesRemaining = 0;
            oldState.resizeViewportRestoreGeneration += 1;
            oldState.resizeViewportPosition = null;
        }

        if (
            oldState?.arrowUpCorrectionFrame !== null &&
            oldState?.arrowUpCorrectionFrame !== undefined
        ) {
            window.cancelAnimationFrame(
                oldState.arrowUpCorrectionFrame
            );
            oldState.arrowUpCorrectionFrame = null;
            oldState.arrowUpCorrectionFramesRemaining = 0;
        }

        if (
            oldState?.verticalNavigationFrame !== null &&
            oldState?.verticalNavigationFrame !== undefined
        ) {
            window.cancelAnimationFrame(
                oldState.verticalNavigationFrame
            );
            oldState.verticalNavigationFrame = null;
        }

        this.releaseViewportLock(oldState);

        if (oldTable) {
            oldTable.destroy();
        }

        delete this.tables[elementId];
        delete this.states[elementId];

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
            if (state.isSaving) {
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
                                            clientKey:
                                                cell.getRow().getData().clientKey,
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
                dirtyRows.push({
                    ...row.getData()
                });
            }
        }

        return dirtyRows;
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

                    if (
                        field === "workOrderNumber" ||
                        field === "workTypeCode"
                    ) {
                        newValue = this
                            .normalizeIdentityDigits(pastedValue)
                            .trim();
                    }

                    if (field === "assignmentDate") {
                        const normalizedDate =
                            this.normalizeAssignmentDate(
                                pastedValue
                            );

                        /*
                         * نحتفظ بالقيمة الخاطئة مؤقتًا ونميزها
                         * داخل نظام الأخطاء بدل تجاهلها بصمت.
                         */
                        newValue =
                            normalizedDate === null
                                ? String(pastedValue ?? "").trim()
                                : normalizedDate;
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
                        clientKey:
                            row.getData().clientKey,
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

            if (
                this.getSortedValidationErrors(elementId).length > 0
            ) {
                this.focusValidationError(elementId, 0);
            }
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

        const affectedRowIds =
            transaction.changes.map(
                change => change.rowId
            );

        this.refreshDirtyRows(
            elementId,
            affectedRowIds
        );

        this.validateRows(
            elementId,
            affectedRowIds,
            { forceRequired: false }
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

        const affectedRowIds =
            transaction.changes.map(
                change => change.rowId
            );

        this.refreshDirtyRows(
            elementId,
            affectedRowIds
        );

        this.validateRows(
            elementId,
            affectedRowIds,
            { forceRequired: false }
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
        return {
            id: rowData.id,
            clientKey:
                this.ensureClientKey(rowData),
            displayOrder:
                Number(rowData.displayOrder) || 0,
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
                rowData.notes ?? "",
            rowVersion:
                rowData.rowVersion ?? ""
        };
    },

    displayOrderStep: 1000000000,

    rebalanceDisplayOrders: function (rows) {
        const step = this.displayOrderStep;

        rows.forEach(function (row, index) {
            row.displayOrder =
                (index + 1) * step;
        });
    },

    allocateDisplayOrders: function (
        rows,
        insertIndex,
        count
    ) {
        const allocate = () => {
            const previousOrder =
                insertIndex > 0
                    ? Number(
                        rows[insertIndex - 1]
                            ?.displayOrder
                    ) || 0
                    : 0;

            const nextOrder =
                insertIndex < rows.length
                    ? Number(
                        rows[insertIndex]
                            ?.displayOrder
                    ) || 0
                    : null;

            if (nextOrder === null) {
                return Array.from(
                    { length: count },
                    function (_, index) {
                        return previousOrder +
                            ((index + 1) *
                                window.tabulatorTest
                                    .displayOrderStep);
                    }
                );
            }

            const availableGap =
                nextOrder - previousOrder;

            if (availableGap <= count) {
                return null;
            }

            const interval = Math.floor(
                availableGap / (count + 1)
            );

            if (interval < 1) {
                return null;
            }

            return Array.from(
                { length: count },
                function (_, index) {
                    return previousOrder +
                        ((index + 1) * interval);
                }
            );
        };

        let orders = allocate();

        if (orders) {
            return orders;
        }

        this.rebalanceDisplayOrders(rows);
        orders = allocate();

        if (!orders) {
            throw new Error(
                "Unable to allocate row display order."
            );
        }

        return orders;
    },

    createBlankRow: function (state) {
        const id = state.nextTemporaryId;
        state.nextTemporaryId--;

        return {
            id: id,
            clientKey:
                `temp:${this.createClientKey()}`,
            displayOrder: 0,
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

        const displayOrders =
            this.allocateDisplayOrders(
                currentData,
                insertIndex,
                count
            );

        const insertedRows = [];

        for (
            let index = 0;
            index < count;
            index++
        ) {
            const data =
                this.createBlankRow(state);

            data.displayOrder =
                displayOrders[index];

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

            this.rebuildIdentityIndex(
                elementId,
                data
            );

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

        this.validateRows(
            elementId,
            table.getRows().map(row => row.getIndex()),
            { forceRequired: false }
        );

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

        const oldRows = table
            .getData()
            .map(row =>
                this.cloneRowData(row));

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

        const rebasedRows =
            this.rebaseHistoryAfterSave(
                state,
                oldRows,
                finalRows,
                savedRowMappings
            );

        const validationRowIds = new Set(
            Array.from(
                state.validationErrors.values()
            ).map(error => error.rowId)
        );

        state.applyingHistory = true;

        try {
            const rowIdsToDelete = new Set(
                removedRowIds.map(id =>
                    String(id))
            );

            for (const mapping of savedRowMappings) {
                const temporaryId =
                    Number(mapping?.temporaryId);

                const databaseId =
                    Number(mapping?.databaseId);

                if (
                    Number.isFinite(temporaryId) &&
                    Number.isFinite(databaseId) &&
                    databaseId > 0 &&
                    savedById.has(String(databaseId))
                ) {
                    rowIdsToDelete.add(
                        String(temporaryId)
                    );
                }
            }

            const rowsToDelete = [];

            for (const rowId of rowIdsToDelete) {
                const numericId = Number(rowId);
                const row = table.getRow(
                    Number.isNaN(numericId)
                        ? rowId
                        : numericId
                );

                if (row) {
                    rowsToDelete.push(row);
                }
            }

            if (rowsToDelete.length > 0) {
                await table.deleteRow(rowsToDelete);
            }

            const rowsToUpdate = savedRows
                .filter(row =>
                    Boolean(table.getRow(row.id)));

            if (rowsToUpdate.length > 0) {
                await table.updateData(
                    rowsToUpdate
                );
            }

            const savedIdSet = new Set(
                savedRows.map(row =>
                    String(row.id))
            );

            for (
                let index = 0;
                index < rebasedRows.length;
                index++
            ) {
                const rowData =
                    rebasedRows[index];

                if (
                    !savedIdSet.has(
                        String(rowData.id)
                    ) ||
                    table.getRow(rowData.id)
                ) {
                    continue;
                }

                let previousRow = null;

                for (
                    let previousIndex = index - 1;
                    previousIndex >= 0;
                    previousIndex--
                ) {
                    previousRow = table.getRow(
                        rebasedRows[previousIndex].id
                    );

                    if (previousRow) {
                        break;
                    }
                }

                if (previousRow) {
                    await table.addRow(
                        rowData,
                        false,
                        previousRow
                    );

                    continue;
                }

                let nextRow = null;

                for (
                    let nextIndex = index + 1;
                    nextIndex < rebasedRows.length;
                    nextIndex++
                ) {
                    nextRow = table.getRow(
                        rebasedRows[nextIndex].id
                    );

                    if (nextRow) {
                        break;
                    }
                }

                await table.addRow(
                    rowData,
                    true,
                    nextRow || undefined
                );
            }

            state.originalRows = new Map(
                rebasedRows.map(row => [
                    String(row.id),
                    this.createDirtySnapshot(row)
                ])
            );

            this.rebuildIdentityIndex(
                elementId,
                rebasedRows
            );

            state.dirtyRowIds.clear();
            state.deletedOriginalRowIds.clear();

            state.validationErrors.clear();
            state.validationRowIds.clear();
            state.validationOrder = [];
            state.activeValidationIndex = -1;

            state.pendingEdit = null;
            state.pendingRangeClear = null;
            state.nextEditMode = null;
            state.currentEditMode = null;
            state.currentEditingCell = null;
            state.activeCell = null;

            window.tabulatorFilters.apply(
                this,
                elementId
            );
        } finally {
            state.applyingHistory = false;
        }

        for (const rowId of validationRowIds) {
            this.applyValidationStylesToRow(
                elementId,
                rowId
            );
        }

        this.syncValidationUi(elementId);
        this.renderStatus(elementId);
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
        window.tabulatorFilters?.closeActivePopup?.(elementId);

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

        if (state?.rightClickRangeGuardHandler) {
            element?.removeEventListener(
                "mousedown",
                state.rightClickRangeGuardHandler,
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

        if (state?.resizeHandler) {
            window.removeEventListener(
                "resize",
                state.resizeHandler
            );
        }

        if (state?.resizeTimer) {
            window.clearTimeout(state.resizeTimer);
            state.resizeTimer = null;
        }

        if (state) {
            state.resizePendingViewportPosition = null;
        }

        if (
            state?.resizeViewportRestoreFrame !== null &&
            state?.resizeViewportRestoreFrame !== undefined
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
            state?.arrowUpCorrectionFrame !== null &&
            state?.arrowUpCorrectionFrame !== undefined
        ) {
            window.cancelAnimationFrame(
                state.arrowUpCorrectionFrame
            );
            state.arrowUpCorrectionFrame = null;
            state.arrowUpCorrectionFramesRemaining = 0;
        }

        if (
            state?.verticalNavigationFrame !== null &&
            state?.verticalNavigationFrame !== undefined
        ) {
            window.cancelAnimationFrame(
                state.verticalNavigationFrame
            );
            state.verticalNavigationFrame = null;
        }

        this.releaseViewportLock(state);

        if (table) {
            table.destroy();
        }

        delete this.tables[elementId];
        delete this.states[elementId];
    }
};