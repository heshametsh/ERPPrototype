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
        basket: 7 * layoutStep
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
                ),
                hasStoredValues: Boolean(
                    definition?.hasStoredValues ??
                    definition?.HasStoredValues ??
                    false
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
            state.deletedCustomColumns = [];
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
            const active = this.cloneCustomColumns(
                state?.customColumns ?? []
            ).map(column => ({
                ...column,
                isDeleted: false
            }));
            const deleted = this.cloneCustomColumns(
                state?.deletedCustomColumns ?? []
            ).map(column => ({
                ...column,
                isDeleted: true
            }));

            return {
                customColumns: [...active, ...deleted],
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

                const createButton = (text, action, customOnly = false) => {
                    const button = document.createElement("button");
                    button.type = "button";
                    button.textContent = text;
                    button.dataset.action = action;
                    button.dataset.customOnly = customOnly ? "true" : "false";
                    button.addEventListener("click", async () => {
                        const field = menu.dataset.field ?? "";
                        menu.hidden = true;

                        if (action === "insert-before") {
                            this.openCustomColumnDialog(
                                elementId,
                                "before"
                            );
                        } else if (action === "insert-after") {
                            this.openCustomColumnDialog(
                                elementId,
                                "after"
                            );
                        } else if (action === "properties") {
                            this.openCustomColumnPropertiesDialog(
                                elementId,
                                field
                            );
                        } else if (action === "delete") {
                            await this.requestDeleteCustomColumn(
                                elementId,
                                field
                            );
                        }
                    });
                    return button;
                };

                menu.append(
                    createButton(
                        "Insert Column Before",
                        "insert-before"
                    ),
                    createButton(
                        "Insert Column After",
                        "insert-after"
                    )
                );

                const separator = document.createElement("div");
                separator.className =
                    "tabulator-column-context-menu-separator";
                separator.dataset.customOnly = "true";
                menu.appendChild(separator);
                menu.append(
                    createButton(
                        "Custom Column Properties",
                        "properties",
                        true
                    ),
                    createButton(
                        "Delete Custom Column",
                        "delete",
                        true
                    )
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

            let propertiesDialog = document.getElementById(
                `${elementId}-custom-column-properties-dialog`
            );

            if (!propertiesDialog) {
                propertiesDialog = document.createElement("dialog");
                propertiesDialog.id =
                    `${elementId}-custom-column-properties-dialog`;
                propertiesDialog.className =
                    "tabulator-custom-column-dialog";
                propertiesDialog.innerHTML = `
                    <form method="dialog" class="tabulator-custom-column-form">
                        <h2>Custom Column Properties</h2>

                        <label>
                            Column Name
                            <input
                                class="tabulator-custom-column-properties-name"
                                maxlength="150"
                                autocomplete="off"
                                required />
                        </label>

                        <label>
                            Column Type
                            <select class="tabulator-custom-column-properties-type">
                                <option value="Text">Text</option>
                                <option value="Money">Money</option>
                                <option value="Date">Date</option>
                                <option value="Number">Number</option>
                            </select>
                        </label>

                        <div class="tabulator-custom-column-type-note" hidden></div>
                        <div class="tabulator-custom-column-error" hidden></div>

                        <div class="tabulator-custom-column-actions">
                            <button type="button" class="tabulator-custom-column-properties-cancel">
                                Cancel
                            </button>
                            <button type="submit" class="tabulator-custom-column-confirm">
                                Apply
                            </button>
                        </div>
                    </form>
                `;

                propertiesDialog.querySelector(
                    ".tabulator-custom-column-properties-cancel"
                ).addEventListener(
                    "click",
                    () => propertiesDialog.close()
                );

                propertiesDialog.querySelector("form").addEventListener(
                    "submit",
                    async event => {
                        event.preventDefault();

                        const field =
                            propertiesDialog.dataset.field ?? "";
                        const name = propertiesDialog.querySelector(
                            ".tabulator-custom-column-properties-name"
                        ).value;
                        const dataType = propertiesDialog.querySelector(
                            ".tabulator-custom-column-properties-type"
                        ).value;
                        const errorElement = propertiesDialog.querySelector(
                            ".tabulator-custom-column-error"
                        );

                        const result = await this.updateCustomColumn(
                            elementId,
                            field,
                            name,
                            dataType
                        );

                        if (!result.succeeded) {
                            errorElement.textContent = result.message;
                            errorElement.hidden = false;
                            return;
                        }

                        propertiesDialog.close();
                    }
                );

                propertiesDialog.addEventListener("click", event => {
                    if (event.target === propertiesDialog) {
                        propertiesDialog.close();
                    }
                });

                document.body.appendChild(propertiesDialog);
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
                .tabulator-column-context-menu-separator {
                    height: 1px;
                    margin: 5px 4px;
                    background: #d9e3ea;
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
                .tabulator-custom-column-type-note {
                    padding: 9px 11px;
                    border: 1px solid #b9cad7;
                    border-radius: 7px;
                    color: #35566e;
                    background: #f3f8fb;
                    font-size: .86rem;
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

                if (!field || field === "rowNumber") {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();

                state.customColumnAnchorField = field;

                const menu = document.getElementById(
                    `${elementId}-column-menu`
                );
                const isCustomColumn = state.customColumns.some(column =>
                    column.fieldKey === field
                );

                menu.dataset.field = field;

                for (const item of menu.querySelectorAll(
                    "[data-custom-only='true']"
                )) {
                    item.hidden = !isCustomColumn;
                }

                menu.style.left = `${Math.min(
                    event.clientX,
                    window.innerWidth - 230
                )}px`;
                menu.style.top = `${Math.min(
                    event.clientY,
                    window.innerHeight - 220
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

        openCustomColumnPropertiesDialog: function (
            elementId,
            fieldKey
        ) {
            const state = this.states[elementId];
            const table = this.tables[elementId];
            const dialog = document.getElementById(
                `${elementId}-custom-column-properties-dialog`
            );
            const column = state?.customColumns?.find(item =>
                item.fieldKey === fieldKey
            );

            if (!state || !table || !dialog || !column) {
                return;
            }

            const nameInput = dialog.querySelector(
                ".tabulator-custom-column-properties-name"
            );
            const typeInput = dialog.querySelector(
                ".tabulator-custom-column-properties-type"
            );
            const noteElement = dialog.querySelector(
                ".tabulator-custom-column-type-note"
            );
            const errorElement = dialog.querySelector(
                ".tabulator-custom-column-error"
            );
            const hasCurrentValues = this.hasCurrentCustomColumnValues(
                table,
                fieldKey
            );
            const typeLocked =
                column.hasStoredValues === true || hasCurrentValues;

            dialog.dataset.field = fieldKey;
            nameInput.value = column.name;
            typeInput.value = column.dataType;
            typeInput.disabled = typeLocked;
            errorElement.hidden = true;
            errorElement.textContent = "";
            noteElement.hidden = !typeLocked;
            noteElement.textContent = typeLocked
                ? "Column Type cannot be changed because this column contains values."
                : "Column Type can be changed only while the column is empty.";

            dialog.showModal();
            window.requestAnimationFrame(() => nameInput.focus());
        },

        hasCurrentCustomColumnValues: function (table, fieldKey) {
            return (table?.getData?.() ?? []).some(row =>
                String(row?.[fieldKey] ?? "").trim() !== ""
            );
        },

        updateCustomColumn: async function (
            elementId,
            fieldKey,
            name,
            dataType
        ) {
            const state = this.states[elementId];
            const table = this.tables[elementId];
            const index = state?.customColumns?.findIndex(column =>
                column.fieldKey === fieldKey
            ) ?? -1;

            if (!state || !table || index < 0) {
                return {
                    succeeded: false,
                    message: "The custom column is no longer available."
                };
            }

            const oldColumn = {
                ...state.customColumns[index]
            };
            const normalizedName = String(name ?? "").trim();
            const normalizedType = String(dataType ?? "").trim();

            if (!normalizedName) {
                return {
                    succeeded: false,
                    message: "Column Name is required."
                };
            }

            if (normalizedName.length > 150) {
                return {
                    succeeded: false,
                    message: "Column Name cannot exceed 150 characters."
                };
            }

            if (!validTypes.has(normalizedType)) {
                return {
                    succeeded: false,
                    message: "Select a valid Column Type."
                };
            }

            const duplicateName = table.getColumns().some(column => {
                if (column.getField() === fieldKey) {
                    return false;
                }

                return String(column.getDefinition()?.title ?? "")
                    .trim()
                    .localeCompare(
                        normalizedName,
                        undefined,
                        { sensitivity: "accent" }
                    ) === 0;
            });

            if (duplicateName) {
                return {
                    succeeded: false,
                    message: "A column with the same name already exists."
                };
            }

            if (
                normalizedType !== oldColumn.dataType &&
                (
                    oldColumn.hasStoredValues === true ||
                    this.hasCurrentCustomColumnValues(table, fieldKey)
                )
            ) {
                return {
                    succeeded: false,
                    message:
                        "Column Type can be changed only while the column is empty."
                };
            }

            const newColumn = {
                ...oldColumn,
                name: normalizedName,
                dataType: normalizedType
            };

            if (
                newColumn.name === oldColumn.name &&
                newColumn.dataType === oldColumn.dataType
            ) {
                return { succeeded: true, message: "" };
            }

            state.customColumns[index] = newColumn;
            this.unregisterCustomColumnField(fieldKey);
            this.registerCustomColumnField(newColumn);
            await this.rebuildCustomColumnInTable(
                elementId,
                newColumn
            );
            this.refreshCustomAmountAggregateFields(elementId);
            this.refreshCustomColumnsChanged(elementId);
            this.pushCustomColumnTransaction(elementId, {
                action: "update",
                label: `تعديل خصائص العمود ${oldColumn.name}`,
                oldColumn: oldColumn,
                newColumn: { ...newColumn }
            });
            this.scheduleAggregateRefresh?.(
                elementId,
                "custom-column-update"
            );

            this.setStatus(
                elementId,
                `تم تعديل العمود ${normalizedName}. اضغط Save لحفظ التعديل.`
            );

            return { succeeded: true, message: "" };
        },

        requestDeleteCustomColumn: async function (
            elementId,
            fieldKey
        ) {
            const state = this.states[elementId];
            const column = state?.customColumns?.find(item =>
                item.fieldKey === fieldKey
            );

            if (!column) {
                return;
            }

            const confirmed = window.confirm(
                `Delete custom column "${column.name}" and all its values ` +
                "from every year in this department? " +
                "The deletion will not be permanent until you press Save."
            );

            if (!confirmed) {
                return;
            }

            await this.deleteCustomColumn(elementId, fieldKey);
        },

        deleteCustomColumn: async function (elementId, fieldKey) {
            const state = this.states[elementId];
            const index = state?.customColumns?.findIndex(column =>
                column.fieldKey === fieldKey
            ) ?? -1;

            if (!state || index < 0) {
                return;
            }

            const column = {
                ...state.customColumns[index]
            };
            const layoutSnapshot = this.captureColumnLayoutSnapshot(
                state,
                fieldKey
            );

            state.customColumns.splice(index, 1);

            if (column.id > 0 && !state.deletedCustomColumns.some(item =>
                item.fieldKey === fieldKey)) {
                state.deletedCustomColumns.push({ ...column });
            }

            state.directTypingFields?.delete?.(fieldKey);
            this.unregisterCustomColumnField(fieldKey);
            await this.removeCustomColumnFromTable(elementId, fieldKey);
            this.refreshCustomAmountAggregateFields(elementId);
            this.refreshCustomColumnsChanged(elementId);
            this.pushCustomColumnTransaction(elementId, {
                action: "delete",
                label: `حذف العمود ${column.name}`,
                column: column,
                layout: layoutSnapshot.layout,
                originalLayout: layoutSnapshot.originalLayout
            });
            this.scheduleAggregateRefresh?.(
                elementId,
                "custom-column-delete"
            );

            this.setStatus(
                elementId,
                `تم حذف العمود ${column.name}. اضغط Save لتأكيد الحذف.`
            );
        },

        captureColumnLayoutSnapshot: function (state, fieldKey) {
            const clone = layout => layout ? { ...layout } : null;

            return {
                layout: clone((state.columnLayouts ?? []).find(item =>
                    item.fieldKey === fieldKey
                )),
                originalLayout: clone(
                    (state.originalColumnLayouts ?? []).find(item =>
                        item.fieldKey === fieldKey
                    )
                )
            };
        },

        restoreColumnLayoutSnapshot: function (
            elementId,
            fieldKey,
            layout,
            originalLayout
        ) {
            const state = this.states[elementId];

            if (!state) {
                return;
            }

            state.columnLayouts = (state.columnLayouts ?? [])
                .filter(item => item.fieldKey !== fieldKey);
            state.originalColumnLayouts =
                (state.originalColumnLayouts ?? [])
                    .filter(item => item.fieldKey !== fieldKey);

            if (layout) {
                state.columnLayouts.push({ ...layout });
            }

            if (originalLayout) {
                state.originalColumnLayouts.push({ ...originalLayout });
            }

            state.columnLayouts.sort((first, second) =>
                first.fieldKey.localeCompare(second.fieldKey)
            );
            state.originalColumnLayouts.sort((first, second) =>
                first.fieldKey.localeCompare(second.fieldKey)
            );
            this.refreshColumnLayoutsChanged(elementId);
        },

        rebuildCustomColumnInTable: async function (
            elementId,
            column
        ) {
            const table = this.tables[elementId];
            const state = this.states[elementId];
            const current = table?.getColumn(column.fieldKey);

            if (!current) {
                await this.addCustomColumnToTable(elementId, column);
                return;
            }

            const currentWidth = this.normalizeColumnWidth(
                current.getWidth()
            );
            const definition = {
                ...this.applyColumnLayoutDefinition(
                    elementId,
                    this.createCustomTabulatorColumn(elementId, column)
                ),
                width: currentWidth
            };

            if (state) {
                this.suppressProgrammaticColumnResize?.(
                    state,
                    column.fieldKey,
                    currentWidth
                );
            }

            await current.updateDefinition(definition);
            this.arrangeColumnHeaderControls?.(elementId);
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
                rowVersion: "",
                hasStoredValues: false
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
            this.pushCustomColumnTransaction(elementId, {
                action: "add",
                label: `إضافة العمود ${column.name}`,
                column: { ...column }
            });
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
            const definition = this.applyColumnLayoutDefinition(
                elementId,
                this.createCustomTabulatorColumn(
                    elementId,
                    column
                )
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

            this.registerColumnLayoutForColumn(
                elementId,
                table.getColumn(column.fieldKey)
            );
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

            this.unregisterColumnLayoutField(elementId, fieldKey);
        },

        pushCustomColumnTransaction: function (
            elementId,
            transaction
        ) {
            const state = this.states[elementId];

            if (!state || !transaction?.action) {
                return;
            }

            state.undoStack.push({
                kind: "custom-column",
                ...transaction
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
            const action = String(transaction?.action ?? "");

            if (!state || !action) {
                return;
            }

            if (action === "update") {
                const source = direction === "undo"
                    ? transaction.oldColumn
                    : transaction.newColumn;
                const column = this.normalizeCustomColumnDefinition(source);
                const index = state.customColumns.findIndex(item =>
                    item.fieldKey === column.fieldKey
                );

                if (index < 0 || !column.fieldKey) {
                    return;
                }

                state.customColumns[index] = column;
                this.unregisterCustomColumnField(column.fieldKey);
                this.registerCustomColumnField(column);
                await this.rebuildCustomColumnInTable(
                    elementId,
                    column
                );
            } else {
                const column = this.normalizeCustomColumnDefinition(
                    transaction?.column
                );

                if (!column.fieldKey) {
                    return;
                }

                const shouldAdd = action === "add"
                    ? direction === "redo"
                    : direction === "undo";

                if (shouldAdd) {
                    if (!state.customColumns.some(item =>
                        item.fieldKey === column.fieldKey)) {
                        state.customColumns.push(column);
                        state.customColumns.sort((first, second) =>
                            first.layoutOrder - second.layoutOrder
                        );
                    }

                    state.deletedCustomColumns =
                        (state.deletedCustomColumns ?? []).filter(item =>
                            item.fieldKey !== column.fieldKey
                        );
                    state.directTypingFields?.add?.(column.fieldKey);
                    this.registerCustomColumnField(column);
                    await this.addCustomColumnToTable(elementId, column);

                    if (action === "delete") {
                        this.restoreColumnLayoutSnapshot(
                            elementId,
                            column.fieldKey,
                            transaction.layout ?? null,
                            transaction.originalLayout ?? null
                        );
                    }
                } else {
                    state.customColumns = state.customColumns.filter(item =>
                        item.fieldKey !== column.fieldKey
                    );

                    if (
                        action === "delete" &&
                        column.id > 0 &&
                        !state.deletedCustomColumns.some(item =>
                            item.fieldKey === column.fieldKey
                        )
                    ) {
                        state.deletedCustomColumns.push({ ...column });
                    }

                    state.directTypingFields?.delete?.(column.fieldKey);
                    this.unregisterCustomColumnField(column.fieldKey);
                    await this.removeCustomColumnFromTable(
                        elementId,
                        column.fieldKey
                    );
                }
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
            state.deletedCustomColumns = [];
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
            document.getElementById(
                `${elementId}-custom-column-properties-dialog`
            )?.remove();
        }
    });
})();
