(function () {
    "use strict";

    const target = window.tabulatorTest;

    if (!target?.registerModule) {
        throw new Error(
            "tabulatorCustomColumns.js requires tabulatorTest.js first."
        );
    }

    const layoutStep = 1_000_000_000_000;
    const coreLayoutOrders = Object.freeze({
        workOrderNumber: 1 * layoutStep,
        workTypeCode: 2 * layoutStep,
        assignmentDate: 3 * layoutStep,
        workOrderValue: 4 * layoutStep,
        partialAmount: 5 * layoutStep,
        remainingAmount: 6 * layoutStep,
        basket: 7 * layoutStep,
        status: 8 * layoutStep,
        notes: 9 * layoutStep
    });

    const validTypes = new Set([
        "Text",
        "Money",
        "Date",
        "Number"
    ]);

    target.registerModule("customColumns", {
        normalizeCustomColumnDefinition: function (definition) {
            const dataType = String(
                definition?.dataType ?? definition?.DataType ?? "Text"
            ).trim();

            return {
                id: Number(definition?.id ?? definition?.Id) || 0,
                fieldKey: String(
                    definition?.fieldKey ?? definition?.FieldKey ?? ""
                ).trim(),
                name: String(
                    definition?.name ?? definition?.Name ?? ""
                ).trim(),
                dataType: validTypes.has(dataType)
                    ? dataType
                    : "Text",
                layoutOrder: Number(
                    definition?.layoutOrder ?? definition?.LayoutOrder
                ) || 0,
                rowVersion: String(
                    definition?.rowVersion ?? definition?.RowVersion ?? ""
                )
            };
        },

        cloneCustomColumns: function (columns) {
            return (Array.isArray(columns) ? columns : [])
                .map(column => ({
                    ...this.normalizeCustomColumnDefinition(column)
                }))
                .sort((first, second) =>
                    first.layoutOrder - second.layoutOrder ||
                    first.fieldKey.localeCompare(second.fieldKey)
                );
        },

        initializeCustomColumnsState: function (
            elementId,
            state,
            columns,
            directTypingFields
        ) {
            const normalized = this.cloneCustomColumns(columns);

            state.customColumns = normalized;
            state.originalCustomColumns = this.cloneCustomColumns(normalized);
            state.customColumnsChanged = false;
            state.directTypingFields = directTypingFields;
            state.customColumnHeaderContextHandler = null;
            state.customColumnDocumentClickHandler = null;

            for (const column of normalized) {
                directTypingFields?.add?.(column.fieldKey);
                this.registerCustomColumnField(column);
            }

            this.refreshCustomAmountAggregateFields(elementId, state);
        },

        applyCustomColumns: function (
            elementId,
            coreColumns,
            customColumns
        ) {
            const core = (Array.isArray(coreColumns) ? coreColumns : [])
                .map(column => ({
                    ...column,
                    udsLayoutOrder:
                        coreLayoutOrders[column.field] ??
                        Number.MAX_SAFE_INTEGER,
                    udsCustomColumn: false
                }));

            const custom = this.cloneCustomColumns(customColumns)
                .map(column => this.createCustomTabulatorColumn(
                    elementId,
                    column
                ));

            return [...core, ...custom]
                .sort((first, second) =>
                    Number(first.udsLayoutOrder) -
                    Number(second.udsLayoutOrder)
                );
        },

        createCustomTabulatorColumn: function (elementId, column) {
            const definition = {
                title: column.name,
                field: column.fieldKey,
                editor: "input",
                headerSort: false,
                width: 180,
                minWidth: 180,
                widthGrow: 0,
                widthShrink: 0,
                resizable: false,
                headerHozAlign: "left",
                udsLayoutOrder: column.layoutOrder,
                udsCustomColumn: true,
                udsCustomColumnType: column.dataType
            };

            if (column.dataType === "Text") {
                definition.editorParams = {
                    elementAttributes: {
                        maxlength: "250",
                        autocomplete: "off"
                    }
                };
            } else if (column.dataType === "Money") {
                definition.editorParams = {
                    elementAttributes: {
                        inputmode: "decimal",
                        autocomplete: "off"
                    }
                };
                definition.formatter = cell =>
                    this.amountFormatter(cell);
                definition.sorter = (first, second) =>
                    this.amountSorter(first, second);
                definition.headerSort = true;
                definition.hozAlign = "right";
            } else if (column.dataType === "Date") {
                definition.editor = this.assignmentDateEditor;
            } else if (column.dataType === "Number") {
                definition.editorParams = {
                    elementAttributes: {
                        inputmode: "numeric",
                        autocomplete: "off"
                    }
                };
                definition.sorter = (first, second) =>
                    this.integerSorter(first, second);
                definition.headerSort = true;
                definition.hozAlign = "right";
            }

            return definition;
        },

        registerCustomColumnField: function (column) {
            const definition = this.normalizeCustomColumnDefinition(column);
            const validators = [];
            let normalize = value => String(value ?? "");

            if (definition.dataType === "Text") {
                validators.push(function (value) {
                    return String(value ?? "").length <= 250
                        ? null
                        : {
                            code: "max_length",
                            message:
                                `العمود ${definition.name} لا يمكن أن يتجاوز 250 حرفًا.`
                        };
                });
            } else if (definition.dataType === "Money") {
                normalize = function (value) {
                    return this.normalizeAmountValue(value);
                };
                validators.push(function (value) {
                    const parsed = this.parseAmount(value);

                    return parsed.empty || parsed.valid
                        ? null
                        : {
                            code: "invalid_amount",
                            message:
                                `أدخل قيمة مالية صحيحة في العمود ${definition.name}.`
                        };
                });
            } else if (definition.dataType === "Date") {
                normalize = function (value) {
                    const normalized = this.normalizeAssignmentDate(value);

                    return normalized === null
                        ? String(value ?? "").trim()
                        : normalized;
                };
                validators.push(function (value) {
                    const text = String(value ?? "").trim();

                    return text === "" ||
                        this.normalizeAssignmentDate(text) !== null
                        ? null
                        : {
                            code: "invalid_date",
                            message:
                                `أدخل تاريخًا صحيحًا في العمود ${definition.name}.`
                        };
                });
            } else if (definition.dataType === "Number") {
                normalize = function (value) {
                    return this.normalizeIntegerValue(value);
                };
                validators.push(function (value) {
                    const text = String(value ?? "").trim();

                    const normalized =
                        this.normalizeIdentityDigits(text);
                    const parsed = Number.parseInt(normalized, 10);
                    const valid =
                        text === "" ||
                        (
                            /^[-+]?\d+$/.test(normalized) &&
                            Number.isSafeInteger(parsed) &&
                            parsed >= -2147483648 &&
                            parsed <= 2147483647
                        );

                    return valid
                        ? null
                        : {
                            code: "invalid_integer",
                            message:
                                `أدخل رقمًا صحيحًا بدون كسور في العمود ${definition.name}.`
                        };
                });
            }

            this.registerFieldDefinitions([{
                key: definition.fieldKey,
                label: definition.name,
                order: definition.layoutOrder,
                normalize: normalize,
                validators: validators
            }]);
        },

        unregisterCustomColumnField: function (fieldKey) {
            this.fieldDefinitions?.delete?.(String(fieldKey ?? ""));
        },

        normalizeIntegerValue: function (value) {
            const text = this.normalizeIdentityDigits(
                String(value ?? "").trim()
            );

            if (text === "" || !/^[-+]?\d+$/.test(text)) {
                return text;
            }

            const number = Number.parseInt(text, 10);
            return Number.isSafeInteger(number)
                ? String(number)
                : text;
        },

        integerSorter: function (first, second) {
            const parse = value => {
                const text = this.normalizeIntegerValue(value);
                const parsed = Number.parseInt(text, 10);
                return Number.isSafeInteger(parsed) ? parsed : null;
            };
            const firstNumber = parse(first);
            const secondNumber = parse(second);

            if (firstNumber === null && secondNumber === null) {
                return 0;
            }

            if (firstNumber === null) {
                return -1;
            }

            if (secondNumber === null) {
                return 1;
            }

            return firstNumber - secondNumber;
        },

        refreshCustomAmountAggregateFields: function (
            elementId,
            suppliedState = null
        ) {
            const state = suppliedState ?? this.states[elementId];

            if (!state) {
                return;
            }

            state.customAmountAggregateFields =
                (state.customColumns ?? [])
                    .filter(column => column.dataType === "Money")
                    .sort((first, second) =>
                        first.layoutOrder - second.layoutOrder
                    )
                    .map(column => ({
                        field: column.fieldKey,
                        label: column.name
                    }));
        },

        serializeCustomColumns: function (columns) {
            return JSON.stringify(
                this.cloneCustomColumns(columns).map(column => ({
                    id: column.id,
                    fieldKey: column.fieldKey,
                    name: column.name,
                    dataType: column.dataType,
                    layoutOrder: column.layoutOrder,
                    rowVersion: column.rowVersion
                }))
            );
        },

        refreshCustomColumnsChanged: function (elementId) {
            const state = this.states[elementId];

            if (!state) {
                return false;
            }

            state.customColumnsChanged =
                this.serializeCustomColumns(state.customColumns) !==
                this.serializeCustomColumns(state.originalCustomColumns);

            this.renderStatus(elementId);
            return state.customColumnsChanged;
        },

        getCustomColumnsSaveState: function (elementId) {
            const state = this.states[elementId];

            return {
                customColumns: this.cloneCustomColumns(
                    state?.customColumns ?? []
                ),
                customColumnsChanged:
                    state?.customColumnsChanged === true
            };
        },

        ensureCustomColumnsUi: function (elementId) {
            this.ensureCustomColumnStyles();

            let menu = document.getElementById(
                `${elementId}-column-menu`
            );

            if (!menu) {
                menu = document.createElement("div");
                menu.id = `${elementId}-column-menu`;
                menu.className = "tabulator-column-context-menu";
                menu.hidden = true;

                const createButton = (text, position) => {
                    const button = document.createElement("button");
                    button.type = "button";
                    button.textContent = text;
                    button.addEventListener("click", () => {
                        menu.hidden = true;
                        this.openCustomColumnDialog(
                            elementId,
                            position
                        );
                    });
                    return button;
                };

                menu.append(
                    createButton("Insert Column Before", "before"),
                    createButton("Insert Column After", "after")
                );

                document.body.appendChild(menu);
            }

            let dialog = document.getElementById(
                `${elementId}-custom-column-dialog`
            );

            if (!dialog) {
                dialog = document.createElement("dialog");
                dialog.id = `${elementId}-custom-column-dialog`;
                dialog.className = "tabulator-custom-column-dialog";
                dialog.innerHTML = `
                    <form method="dialog" class="tabulator-custom-column-form">
                        <h2>Add Column</h2>

                        <label>
                            Column Name
                            <input
                                class="tabulator-custom-column-name"
                                maxlength="150"
                                autocomplete="off"
                                required />
                        </label>

                        <label>
                            Column Type
                            <select class="tabulator-custom-column-type">
                                <option value="Text">Text</option>
                                <option value="Money">Money</option>
                                <option value="Date">Date</option>
                                <option value="Number">Number</option>
                            </select>
                        </label>

                        <div class="tabulator-custom-column-error" hidden></div>

                        <div class="tabulator-custom-column-actions">
                            <button type="button" class="tabulator-custom-column-cancel">
                                Cancel
                            </button>
                            <button type="submit" class="tabulator-custom-column-confirm">
                                Add
                            </button>
                        </div>
                    </form>
                `;

                dialog.querySelector(
                    ".tabulator-custom-column-cancel"
                ).addEventListener("click", () => dialog.close());

                dialog.querySelector("form").addEventListener(
                    "submit",
                    async event => {
                        event.preventDefault();

                        const name = dialog.querySelector(
                            ".tabulator-custom-column-name"
                        ).value;
                        const dataType = dialog.querySelector(
                            ".tabulator-custom-column-type"
                        ).value;
                        const position = dialog.dataset.position || "after";
                        const anchorField = dialog.dataset.anchorField || "";
                        const errorElement = dialog.querySelector(
                            ".tabulator-custom-column-error"
                        );

                        const result = await this.addCustomColumn(
                            elementId,
                            anchorField,
                            position,
                            name,
                            dataType
                        );

                        if (!result.succeeded) {
                            errorElement.textContent = result.message;
                            errorElement.hidden = false;
                            return;
                        }

                        dialog.close();
                    }
                );

                dialog.addEventListener("click", event => {
                    if (event.target === dialog) {
                        dialog.close();
                    }
                });

                document.body.appendChild(dialog);
            }
        },

        ensureCustomColumnStyles: function () {
            if (document.getElementById("tabulator-custom-column-styles")) {
                return;
            }

            const style = document.createElement("style");
            style.id = "tabulator-custom-column-styles";
            style.textContent = `
                .tabulator-column-context-menu {
                    position: fixed;
                    z-index: 4100;
                    width: 220px;
                    padding: 6px;
                    border: 1px solid #b9c8d4;
                    border-radius: 9px;
                    background: #fff;
                    box-shadow: 0 14px 34px rgba(15, 42, 70, .2);
                }
                .tabulator-column-context-menu[hidden] { display: none; }
                .tabulator-column-context-menu button {
                    display: block;
                    width: 100%;
                    padding: 9px 11px;
                    border: 0;
                    border-radius: 6px;
                    background: transparent;
                    color: #173047;
                    text-align: left;
                    font: 650 .88rem "Segoe UI", Tahoma, Arial, sans-serif;
                    cursor: pointer;
                }
                .tabulator-column-context-menu button:hover {
                    background: #eef7fc;
                    color: #0b5f95;
                }
                .tabulator-custom-column-dialog {
                    width: min(420px, calc(100vw - 32px));
                    padding: 0;
                    border: 1px solid #b8c8d4;
                    border-radius: 12px;
                    color: #173047;
                    background: #fff;
                    box-shadow: 0 22px 60px rgba(15, 42, 70, .25);
                }
                .tabulator-custom-column-dialog::backdrop {
                    background: rgba(11, 34, 57, .34);
                }
                .tabulator-custom-column-form {
                    display: grid;
                    gap: 16px;
                    padding: 22px;
                }
                .tabulator-custom-column-form h2 {
                    margin: 0;
                    color: #0b2239;
                    font-size: 1.2rem;
                    font-weight: 800;
                }
                .tabulator-custom-column-form label {
                    display: grid;
                    gap: 7px;
                    color: #2e4a60;
                    font-size: .9rem;
                    font-weight: 700;
                }
                .tabulator-custom-column-form input,
                .tabulator-custom-column-form select {
                    box-sizing: border-box;
                    width: 100%;
                    height: 40px;
                    padding: 7px 10px;
                    border: 1px solid #99afbf;
                    border-radius: 7px;
                    color: #173047;
                    background: #fff;
                    font: inherit;
                    outline: none;
                }
                .tabulator-custom-column-form input:focus,
                .tabulator-custom-column-form select:focus {
                    border-color: #0b78c7;
                    box-shadow: 0 0 0 3px rgba(11, 120, 199, .14);
                }
                .tabulator-custom-column-error {
                    padding: 9px 11px;
                    border: 1px solid #d9a3a3;
                    border-radius: 7px;
                    color: #8b1e1e;
                    background: #fff2f2;
                    font-size: .88rem;
                }
                .tabulator-custom-column-actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: 9px;
                }
                .tabulator-custom-column-actions button {
                    min-width: 92px;
                    height: 38px;
                    padding: 0 14px;
                    border-radius: 7px;
                    font-size: .88rem;
                    font-weight: 750;
                    cursor: pointer;
                }
                .tabulator-custom-column-cancel {
                    border: 1px solid #9eb0bd;
                    color: #435c70;
                    background: #fff;
                }
                .tabulator-custom-column-confirm {
                    border: 1px solid #0b78c7;
                    color: #fff;
                    background: #0b78c7;
                }
            `;
            document.head.appendChild(style);
        },

        bindCustomColumnHeaderMenu: function (elementId) {
            const element = document.getElementById(elementId);
            const state = this.states[elementId];

            if (!element || !state || state.customColumnHeaderContextHandler) {
                return;
            }

            this.ensureCustomColumnsUi(elementId);

            const contextHandler = event => {
                const header = event.target?.closest?.(
                    ".tabulator-col[tabulator-field]"
                );

                if (!header || !element.contains(header)) {
                    return;
                }

                const field = String(
                    header.getAttribute("tabulator-field") ?? ""
                ).trim();

                if (!field) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();

                state.customColumnAnchorField = field;

                const menu = document.getElementById(
                    `${elementId}-column-menu`
                );

                menu.style.left = `${Math.min(
                    event.clientX,
                    window.innerWidth - 230
                )}px`;
                menu.style.top = `${Math.min(
                    event.clientY,
                    window.innerHeight - 100
                )}px`;
                menu.hidden = false;
            };

            const clickHandler = event => {
                const menu = document.getElementById(
                    `${elementId}-column-menu`
                );

                if (menu && !menu.contains(event.target)) {
                    menu.hidden = true;
                }
            };

            element.addEventListener("contextmenu", contextHandler);
            document.addEventListener("click", clickHandler, true);

            state.customColumnHeaderContextHandler = contextHandler;
            state.customColumnDocumentClickHandler = clickHandler;
        },

        openCustomColumnDialog: function (elementId, position) {
            const state = this.states[elementId];
            const dialog = document.getElementById(
                `${elementId}-custom-column-dialog`
            );

            if (!state || !dialog) {
                return;
            }

            dialog.dataset.position = position === "before"
                ? "before"
                : "after";
            dialog.dataset.anchorField =
                state.customColumnAnchorField ?? "";

            const nameInput = dialog.querySelector(
                ".tabulator-custom-column-name"
            );
            const typeInput = dialog.querySelector(
                ".tabulator-custom-column-type"
            );
            const errorElement = dialog.querySelector(
                ".tabulator-custom-column-error"
            );

            nameInput.value = "";
            typeInput.value = "Text";
            errorElement.hidden = true;
            errorElement.textContent = "";

            dialog.showModal();
            window.requestAnimationFrame(() => nameInput.focus());
        },

        addCustomColumn: async function (
            elementId,
            anchorField,
            position,
            name,
            dataType
        ) {
            const table = this.tables[elementId];
            const state = this.states[elementId];
            const normalizedName = String(name ?? "").trim();

            if (!table || !state) {
                return { succeeded: false, message: "The sheet is not ready." };
            }

            if (!normalizedName) {
                return { succeeded: false, message: "Column Name is required." };
            }

            if (normalizedName.length > 150) {
                return {
                    succeeded: false,
                    message: "Column Name cannot exceed 150 characters."
                };
            }

            if (!validTypes.has(dataType)) {
                return { succeeded: false, message: "Select a valid Column Type." };
            }

            const duplicateName = table.getColumns().some(column =>
                String(column.getDefinition()?.title ?? "")
                    .trim()
                    .localeCompare(
                        normalizedName,
                        undefined,
                        { sensitivity: "accent" }
                    ) === 0
            );

            if (duplicateName) {
                return {
                    succeeded: false,
                    message: "A column with the same name already exists."
                };
            }

            const layoutOrder = this.calculateCustomColumnLayoutOrder(
                table,
                anchorField,
                position
            );

            if (!Number.isSafeInteger(layoutOrder) || layoutOrder <= 0) {
                return {
                    succeeded: false,
                    message:
                        "There is no free position here. Save and refresh the sheet, then try again."
                };
            }

            const column = {
                id: 0,
                fieldKey: this.createCustomColumnFieldKey(),
                name: normalizedName,
                dataType: dataType,
                layoutOrder: layoutOrder,
                rowVersion: ""
            };

            state.customColumns.push(column);
            state.customColumns.sort((first, second) =>
                first.layoutOrder - second.layoutOrder
            );
            state.directTypingFields?.add?.(column.fieldKey);
            this.registerCustomColumnField(column);

            await this.addCustomColumnToTable(elementId, column);
            this.refreshCustomAmountAggregateFields(elementId);
            this.refreshCustomColumnsChanged(elementId);
            this.pushCustomColumnTransaction(elementId, column);
            this.scheduleAggregateRefresh?.(
                elementId,
                "custom-column-add"
            );

            this.setStatus(
                elementId,
                `تمت إضافة العمود ${normalizedName}. اضغط Save لحفظه.`
            );

            return { succeeded: true, message: "" };
        },

        calculateCustomColumnLayoutOrder: function (
            table,
            anchorField,
            position
        ) {
            const columns = table.getColumns()
                .filter(column => Boolean(column.getField()));
            const anchorIndex = columns.findIndex(column =>
                column.getField() === anchorField
            );

            if (anchorIndex < 0) {
                return 0;
            }

            const readOrder = column => Number(
                column?.getDefinition?.()?.udsLayoutOrder
            ) || 0;
            const anchorOrder = readOrder(columns[anchorIndex]);
            let lower;
            let upper;

            if (position === "before") {
                lower = anchorIndex > 0
                    ? readOrder(columns[anchorIndex - 1])
                    : 0;
                upper = anchorOrder;
            } else {
                lower = anchorOrder;
                upper = anchorIndex < columns.length - 1
                    ? readOrder(columns[anchorIndex + 1])
                    : anchorOrder + layoutStep;
            }

            const candidate = Math.floor((lower + upper) / 2);
            return candidate > lower && candidate < upper
                ? candidate
                : 0;
        },

        createCustomColumnFieldKey: function () {
            const token = globalThis.crypto?.randomUUID
                ? globalThis.crypto.randomUUID().replaceAll("-", "")
                : Array.from(
                    globalThis.crypto.getRandomValues(new Uint8Array(16)),
                    value => value.toString(16).padStart(2, "0")
                ).join("");

            return `custom_${token.toLowerCase()}`;
        },

        addCustomColumnToTable: async function (elementId, column) {
            const table = this.tables[elementId];

            if (!table) {
                return;
            }

            const currentColumns = table.getColumns()
                .filter(current => Boolean(current.getField()));

            if (currentColumns.some(current =>
                current.getField() === column.fieldKey)) {
                return;
            }
            const nextColumn = currentColumns.find(current =>
                Number(current.getDefinition()?.udsLayoutOrder) >
                column.layoutOrder
            );
            const definition = this.createCustomTabulatorColumn(
                elementId,
                column
            );

            if (nextColumn) {
                await table.addColumn(
                    definition,
                    true,
                    nextColumn.getField()
                );
            } else {
                await table.addColumn(definition, false);
            }
        },

        removeCustomColumnFromTable: async function (
            elementId,
            fieldKey
        ) {
            const table = this.tables[elementId];
            const column = table?.getColumn(fieldKey);

            if (column) {
                await table.deleteColumn(fieldKey);
            }
        },

        pushCustomColumnTransaction: function (elementId, column) {
            const state = this.states[elementId];

            if (!state) {
                return;
            }

            state.undoStack.push({
                kind: "custom-column",
                action: "add",
                label: `إضافة العمود ${column.name}`,
                column: { ...column }
            });

            if (state.undoStack.length > state.maxTransactions) {
                state.undoStack.shift();
            }

            state.redoStack = [];
        },

        applyCustomColumnTransaction: async function (
            elementId,
            transaction,
            direction
        ) {
            const state = this.states[elementId];
            const column = this.normalizeCustomColumnDefinition(
                transaction?.column
            );

            if (!state || !column.fieldKey) {
                return;
            }

            const shouldAdd = direction === "redo";

            if (shouldAdd) {
                if (!state.customColumns.some(item =>
                    item.fieldKey === column.fieldKey)) {
                    state.customColumns.push(column);
                    state.customColumns.sort((first, second) =>
                        first.layoutOrder - second.layoutOrder
                    );
                }

                state.directTypingFields?.add?.(column.fieldKey);
                this.registerCustomColumnField(column);
                await this.addCustomColumnToTable(elementId, column);
            } else {
                state.customColumns = state.customColumns.filter(item =>
                    item.fieldKey !== column.fieldKey
                );
                state.directTypingFields?.delete?.(column.fieldKey);
                this.unregisterCustomColumnField(column.fieldKey);
                await this.removeCustomColumnFromTable(
                    elementId,
                    column.fieldKey
                );
            }

            this.refreshCustomAmountAggregateFields(elementId);
            this.refreshCustomColumnsChanged(elementId);
            this.scheduleAggregateRefresh?.(
                elementId,
                "custom-column-history"
            );
        },

        acceptSavedCustomColumns: function (elementId, columns) {
            const state = this.states[elementId];

            if (!state) {
                return;
            }

            const normalized = this.cloneCustomColumns(columns);
            state.customColumns = normalized;
            state.originalCustomColumns = this.cloneCustomColumns(normalized);
            state.customColumnsChanged = false;

            for (const column of normalized) {
                this.registerCustomColumnField(column);
            }

            state.undoStack = (state.undoStack ?? []).filter(
                transaction => transaction?.kind !== "custom-column"
            );
            state.redoStack = (state.redoStack ?? []).filter(
                transaction => transaction?.kind !== "custom-column"
            );

            this.refreshCustomAmountAggregateFields(elementId);
            this.renderStatus(elementId);
        },

        disposeCustomColumnsUi: function (elementId, state) {
            const element = document.getElementById(elementId);

            for (const column of state?.customColumns ?? []) {
                this.unregisterCustomColumnField(column.fieldKey);
            }

            if (element && state?.customColumnHeaderContextHandler) {
                element.removeEventListener(
                    "contextmenu",
                    state.customColumnHeaderContextHandler
                );
            }

            if (state?.customColumnDocumentClickHandler) {
                document.removeEventListener(
                    "click",
                    state.customColumnDocumentClickHandler,
                    true
                );
            }

            document.getElementById(
                `${elementId}-column-menu`
            )?.remove();
            document.getElementById(
                `${elementId}-custom-column-dialog`
            )?.remove();
        }
    });
})();
