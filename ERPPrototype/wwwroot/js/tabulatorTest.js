window.tabulatorTest = {
    tables: {},
    states: {},

    calculateTableHeight: function (element) {
        const minimumHeight = 320;
        const bottomGap = 16;
        const viewportHeight =
            window.visualViewport?.height || window.innerHeight;
        const elementTop = element.getBoundingClientRect().top;

        return Math.max(
            minimumHeight,
            Math.floor(viewportHeight - elementTop - bottomGap)
        );
    },

    normalizeValue: function (value) {
        return value === null || value === undefined
            ? ""
            : String(value);
    },

    valuesAreEqual: function (left, right) {
        return this.normalizeValue(left) === this.normalizeValue(right);
    },

    initialize: function (elementId, data) {
        const element = document.getElementById(elementId);

        if (!element) {
            throw new Error(`Tabulator element '${elementId}' was not found.`);
        }

        this.destroy(elementId);

        const state = {
            dirtyFieldsByRowId: new Map(),
            originalValuesByCell: new Map(),
            isSaving: false
        };

        this.states[elementId] = state;

        const tableHeight = this.calculateTableHeight(element);

        const editableWhenNotSaving = function () {
            return !state.isSaving;
        };

        const table = new Tabulator(element, {
            data: Array.isArray(data) ? data : [],
            index: "id",
            height: `${tableHeight}px`,
            layout: "fitColumns",
            renderVertical: "virtual",
            renderVerticalBuffer: Math.max(1200, tableHeight * 2),
            rowHeight: 40,
            placeholder: "No work orders found for this year.",
            editTriggerEvent: "click",

            /*
             * Tabulator's default vertical cell navigation repeatedly
             * opens/focuses editors while the Virtual DOM moves.
             * It is disabled here and replaced by the lightweight
             * fixed-row scroll handler below.
             */
            keybindings: {
                navUp: false,
                navDown: false
            },

            columnDefaults: {
                headerSort: false,
                headerHozAlign: "center",
                vertAlign: "middle",
                resizable: "header"
            },

            columns: [
                {
                    title: "Work Order Number",
                    field: "workOrderNumber",
                    editor: "input",
                    editable: editableWhenNotSaving,
                    width: 210
                },
                {
                    title: "Work Type",
                    field: "workTypeCode",
                    editor: "input",
                    editable: editableWhenNotSaving,
                    width: 150
                },
                {
                    title: "Assignment Date",
                    field: "assignmentDate",
                    editor: "input",
                    editable: editableWhenNotSaving,
                    width: 185
                },
                {
                    title: "Basket",
                    field: "basket",
                    editor: "input",
                    editable: editableWhenNotSaving,
                    width: 250
                },
                {
                    title: "Status",
                    field: "status",
                    editor: "input",
                    editable: editableWhenNotSaving,
                    width: 180
                },
                {
                    title: "Notes",
                    field: "notes",
                    editor: "input",
                    editable: editableWhenNotSaving,
                    minWidth: 260,
                    widthGrow: 1
                }
            ]
        });

        const holder = element.querySelector(
            ".tabulator-tableholder"
        );

        if (holder) {
            holder.tabIndex = 0;

            state.arrowKeyHandler = (event) => {
                if (
                    event.key !== "ArrowUp" &&
                    event.key !== "ArrowDown"
                ) {
                    return;
                }

                if (!element.contains(document.activeElement)) {
                    return;
                }

                event.preventDefault();
                event.stopImmediatePropagation();

                const activeElement = document.activeElement;
                const isEditor =
                    activeElement instanceof HTMLInputElement ||
                    activeElement instanceof HTMLTextAreaElement ||
                    activeElement?.isContentEditable === true;

                if (isEditor) {
                    activeElement.blur();
                }

                holder.focus({ preventScroll: true });
                holder.scrollTop +=
                    event.key === "ArrowDown" ? 40 : -40;
            };

            element.addEventListener(
                "keydown",
                state.arrowKeyHandler,
                true
            );
        }

        table.on("cellEdited", (cell) => {
            const rowId = cell.getRow().getIndex();
            const field = cell.getField();
            const cellKey = `${rowId}::${field}`;

            if (!state.originalValuesByCell.has(cellKey)) {
                state.originalValuesByCell.set(
                    cellKey,
                    cell.getOldValue()
                );
            }

            const originalValue =
                state.originalValuesByCell.get(cellKey);

            let dirtyFields =
                state.dirtyFieldsByRowId.get(rowId);

            if (!dirtyFields) {
                dirtyFields = new Set();
                state.dirtyFieldsByRowId.set(rowId, dirtyFields);
            }

            if (this.valuesAreEqual(cell.getValue(), originalValue)) {
                state.originalValuesByCell.delete(cellKey);
                dirtyFields.delete(field);

                if (dirtyFields.size === 0) {
                    state.dirtyFieldsByRowId.delete(rowId);
                }
            } else {
                dirtyFields.add(field);
            }

            this.updateDirtyStatus(elementId);
        });

        this.tables[elementId] = table;
        this.setStatus(
            elementId,
            `تم تحميل ${table.getDataCount()} صف.`
        );
    },

    updateDirtyStatus: function (elementId) {
        const state = this.states[elementId];

        if (!state) {
            return;
        }

        const count = state.dirtyFieldsByRowId.size;

        this.setStatus(
            elementId,
            count === 0
                ? "لا توجد تغييرات غير محفوظة."
                : `صفوف غير محفوظة: ${count}`
        );
    },

    getDirtyRows: function (elementId) {
        const table = this.tables[elementId];
        const state = this.states[elementId];

        if (!table || !state) {
            return [];
        }

        const rows = [];

        for (const rowId of state.dirtyFieldsByRowId.keys()) {
            const row = table.getRow(rowId);

            if (row) {
                rows.push(row.getData());
            }
        }

        return rows;
    },

    hasUnsavedChanges: function (elementId) {
        const state = this.states[elementId];
        return Boolean(state && state.dirtyFieldsByRowId.size > 0);
    },

    setSaving: function (elementId, isSaving) {
        const state = this.states[elementId];

        if (!state) {
            return;
        }

        state.isSaving = Boolean(isSaving);
    },

    applySavedRows: async function (
        elementId,
        savedRows,
        removedRowIds
    ) {
        const table = this.tables[elementId];
        const state = this.states[elementId];

        if (!table || !state) {
            return;
        }

        const rowsToUpdate = Array.isArray(savedRows)
            ? savedRows
            : [];

        const idsToRemove = Array.isArray(removedRowIds)
            ? removedRowIds
            : [];

        if (rowsToUpdate.length > 0) {
            await table.updateData(rowsToUpdate);
        }

        for (const rowId of idsToRemove) {
            const row = table.getRow(rowId);

            if (row) {
                await row.delete();
            }
        }

        const savedIds = new Set([
            ...rowsToUpdate.map(row => row.id),
            ...idsToRemove
        ]);

        for (const rowId of savedIds) {
            state.dirtyFieldsByRowId.delete(rowId);

            const prefix = `${rowId}::`;

            for (const cellKey of state.originalValuesByCell.keys()) {
                if (cellKey.startsWith(prefix)) {
                    state.originalValuesByCell.delete(cellKey);
                }
            }
        }
    },

    setStatus: function (elementId, message) {
        const status = document.getElementById(
            `${elementId}-status`
        );

        if (status) {
            status.textContent = message || "";
        }
    },

    destroy: function (elementId) {
        const table = this.tables[elementId];
        const state = this.states[elementId];
        const element = document.getElementById(elementId);

        if (state?.arrowKeyHandler && element) {
            element.removeEventListener(
                "keydown",
                state.arrowKeyHandler,
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
