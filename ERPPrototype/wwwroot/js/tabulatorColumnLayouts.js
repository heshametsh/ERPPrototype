(function () {
    "use strict";

    const minimumWidth = 45;
    const maximumWidth = 1000;
    const defaultWidths = Object.freeze({
        workOrderNumber: 210,
        workTypeCode: 150,
        assignmentDate: 185,
        workOrderValue: 185,
        partialAmount: 175,
        remainingAmount: 185,
        basket: 250
    });

    window.tabulatorTest.registerModule("column-layouts", {
        normalizeColumnLayout: function (layout) {
            const width = Number(layout?.width ?? layout?.Width);

            return {
                id: Number(layout?.id ?? layout?.Id) || 0,
                fieldKey: String(
                    layout?.fieldKey ?? layout?.FieldKey ?? ""
                ).trim(),
                width: Number.isFinite(width)
                    ? Math.round(width)
                    : 0,
                isHidden: Boolean(
                    layout?.isHidden ?? layout?.IsHidden ?? false
                ),
                rowVersion: String(
                    layout?.rowVersion ?? layout?.RowVersion ?? ""
                )
            };
        },

        cloneColumnLayouts: function (layouts) {
            return (Array.isArray(layouts) ? layouts : [])
                .map(layout => ({
                    ...this.normalizeColumnLayout(layout)
                }))
                .filter(layout => Boolean(layout.fieldKey))
                .sort((first, second) =>
                    first.fieldKey.localeCompare(second.fieldKey)
                );
        },

        initializeColumnLayoutsState: function (state, layouts) {
            const normalized = this.cloneColumnLayouts(layouts);

            state.loadedColumnLayouts = normalized;
            state.columnLayouts = [];
            state.originalColumnLayouts = [];
            state.columnLayoutsChanged = false;
            state.columnLayoutsReady = false;
            state.columnLayoutSuppressedWidths = new Map();
        },

        applyColumnLayouts: function (state, columns) {
            const sourceLayouts = state?.columnLayoutsReady === true
                ? state.columnLayouts
                : state?.loadedColumnLayouts;
            const savedByField = new Map(
                (sourceLayouts ?? []).map(layout => [
                    layout.fieldKey,
                    layout
                ])
            );

            return (Array.isArray(columns) ? columns : []).map(column => {
                const field = String(column?.field ?? "").trim();

                if (!field || field === "rowNumber") {
                    return { ...column };
                }

                const savedLayout = savedByField.get(field);
                const savedWidth = savedLayout?.width;
                const configuredWidth = Number(column?.width);
                const configuredMinimum = Number(column?.minWidth);
                const defaultWidth = defaultWidths[field] ?? 180;
                const width = this.normalizeColumnWidth(
                    savedWidth ||
                    configuredWidth ||
                    configuredMinimum ||
                    defaultWidth
                );

                return {
                    ...column,
                    width: width,
                    minWidth: minimumWidth,
                    maxWidth: maximumWidth,
                    widthGrow: 0,
                    widthShrink: 0,
                    resizable: true,
                    visible: savedLayout?.isHidden !== true
                };
            });
        },

        applyColumnLayoutDefinition: function (elementId, definition) {
            const state = this.states[elementId];
            return this.applyColumnLayouts(state, [definition])[0];
        },

        normalizeColumnWidth: function (width) {
            const numericWidth = Math.round(Number(width));

            if (!Number.isFinite(numericWidth)) {
                return 180;
            }

            return Math.min(
                maximumWidth,
                Math.max(minimumWidth, numericWidth)
            );
        },

        initializeColumnLayoutRuntime: function (elementId) {
            const table = this.tables[elementId];
            const state = this.states[elementId];

            if (!table || !state) {
                return;
            }

            const savedByField = new Map(
                (state.loadedColumnLayouts ?? []).map(layout => [
                    layout.fieldKey,
                    layout
                ])
            );

            state.columnLayouts = table.getColumns()
                .filter(column => {
                    const field = String(column.getField() ?? "").trim();
                    return field && field !== "rowNumber";
                })
                .map(column => {
                    const fieldKey = String(column.getField());
                    const saved = savedByField.get(fieldKey);

                    return {
                        id: saved?.id ?? 0,
                        fieldKey: fieldKey,
                        width: this.normalizeColumnWidth(
                            saved?.width ?? column.getWidth()
                        ),
                        rowVersion: saved?.rowVersion ?? "",
                        isHidden: saved?.isHidden === true
                    };
                })
                .sort((first, second) =>
                    first.fieldKey.localeCompare(second.fieldKey)
                );

            state.originalColumnLayouts = this.cloneColumnLayouts(
                state.columnLayouts
            );
            state.columnLayoutsChanged = false;
            state.columnLayoutsReady = true;

            this.arrangeColumnHeaderControls(elementId);
            this.renderStatus(elementId);
        },

        registerColumnLayoutForColumn: function (elementId, column) {
            const state = this.states[elementId];
            const fieldKey = String(column?.getField?.() ?? "").trim();

            if (!state || !fieldKey || fieldKey === "rowNumber") {
                return;
            }

            if (!state.columnLayouts.some(layout =>
                layout.fieldKey === fieldKey)) {
                state.columnLayouts.push({
                    id: 0,
                    fieldKey: fieldKey,
                    width: this.normalizeColumnWidth(column.getWidth()),
                    rowVersion: "",
                    isHidden: column.isVisible?.() === false
                });
                state.columnLayouts.sort((first, second) =>
                    first.fieldKey.localeCompare(second.fieldKey)
                );
            }

            window.requestAnimationFrame(() =>
                this.arrangeColumnHeaderControls(elementId)
            );
        },

        unregisterColumnLayoutField: function (elementId, fieldKey) {
            const state = this.states[elementId];

            if (!state) {
                return;
            }

            state.columnLayouts = (state.columnLayouts ?? [])
                .filter(layout => layout.fieldKey !== fieldKey);
            state.originalColumnLayouts =
                (state.originalColumnLayouts ?? [])
                    .filter(layout => layout.fieldKey !== fieldKey);
            this.refreshColumnLayoutsChanged(elementId);
        },

        bindColumnLayoutInteractions: function (elementId) {
            const table = this.tables[elementId];
            const state = this.states[elementId];

            if (!table || !state || state.columnLayoutResizeBound) {
                return;
            }

            state.columnLayoutResizeBound = true;

            table.on("columnResized", column => {
                const currentState = this.states[elementId];
                const fieldKey = String(column?.getField?.() ?? "").trim();

                if (
                    !currentState?.columnLayoutsReady ||
                    !fieldKey ||
                    fieldKey === "rowNumber"
                ) {
                    return;
                }

                const newWidth = this.normalizeColumnWidth(
                    column.getWidth()
                );
                const suppressedWidth =
                    currentState.columnLayoutSuppressedWidths
                        ?.get(fieldKey);

                if (suppressedWidth === newWidth) {
                    currentState.columnLayoutSuppressedWidths
                        .delete(fieldKey);
                    this.arrangeColumnHeaderControls(elementId);
                    return;
                }

                const layout = currentState.columnLayouts.find(item =>
                    item.fieldKey === fieldKey);
                const oldWidth = layout?.width ?? newWidth;

                if (oldWidth === newWidth) {
                    this.arrangeColumnHeaderControls(elementId);
                    return;
                }

                this.updateColumnLayoutWidth(
                    currentState,
                    fieldKey,
                    newWidth
                );
                this.pushColumnLayoutTransaction(
                    elementId,
                    fieldKey,
                    oldWidth,
                    newWidth
                );
                this.refreshColumnLayoutsChanged(elementId);
                this.arrangeColumnHeaderControls(elementId);

                this.setStatus(
                    elementId,
                    `تم تغيير عرض العمود إلى ${newWidth}px. اضغط Save لحفظه.`
                );
            });
        },

        updateColumnLayoutWidth: function (state, fieldKey, width) {
            let layout = state.columnLayouts.find(item =>
                item.fieldKey === fieldKey);

            if (!layout) {
                layout = {
                    id: 0,
                    fieldKey: fieldKey,
                    width: width,
                    rowVersion: "",
                    isHidden: false
                };
                state.columnLayouts.push(layout);
            } else {
                layout.width = width;
            }

            state.columnLayouts.sort((first, second) =>
                first.fieldKey.localeCompare(second.fieldKey)
            );
        },

        serializeColumnLayouts: function (layouts) {
            return JSON.stringify(
                this.cloneColumnLayouts(layouts).map(layout => ({
                    id: layout.id,
                    fieldKey: layout.fieldKey,
                    width: layout.width,
                    rowVersion: layout.rowVersion,
                    isHidden: layout.isHidden === true
                }))
            );
        },

        refreshColumnLayoutsChanged: function (elementId) {
            const state = this.states[elementId];

            if (!state) {
                return false;
            }

            state.columnLayoutsChanged =
                this.serializeColumnLayouts(state.columnLayouts) !==
                this.serializeColumnLayouts(state.originalColumnLayouts);

            this.renderStatus(elementId);
            return state.columnLayoutsChanged;
        },

        getColumnLayoutsSaveState: function (elementId) {
            const state = this.states[elementId];

            return {
                columnLayouts: this.cloneColumnLayouts(
                    state?.columnLayouts ?? []
                ),
                columnLayoutsChanged:
                    state?.columnLayoutsChanged === true
            };
        },

        suppressProgrammaticColumnResize: function (
            state,
            fieldKey,
            width
        ) {
            state.columnLayoutSuppressedWidths.set(fieldKey, width);

            window.setTimeout(() => {
                if (
                    state.columnLayoutSuppressedWidths.get(fieldKey) ===
                    width
                ) {
                    state.columnLayoutSuppressedWidths.delete(fieldKey);
                }
            }, 500);
        },

        pushColumnLayoutTransaction: function (
            elementId,
            fieldKey,
            oldWidth,
            newWidth
        ) {
            const state = this.states[elementId];

            if (!state || oldWidth === newWidth) {
                return;
            }

            state.undoStack.push({
                kind: "column-layout",
                action: "resize",
                label: "تغيير عرض العمود",
                fieldKey: fieldKey,
                oldWidth: oldWidth,
                newWidth: newWidth
            });

            if (state.undoStack.length > state.maxTransactions) {
                state.undoStack.shift();
            }

            state.redoStack = [];
        },

        applyColumnLayoutTransaction: async function (
            elementId,
            transaction,
            direction
        ) {
            const state = this.states[elementId];
            const table = this.tables[elementId];
            const fieldKey = String(transaction?.fieldKey ?? "").trim();
            const column = table?.getColumn(fieldKey);

            if (!state || !column || !fieldKey) {
                return;
            }

            if (transaction?.action === "visibility") {
                const isHidden = direction === "undo"
                    ? transaction?.oldHidden === true
                    : transaction?.newHidden === true;

                this.applyColumnVisibility(
                    elementId,
                    fieldKey,
                    isHidden,
                    false
                );
                return;
            }

            const width = this.normalizeColumnWidth(
                direction === "undo"
                    ? transaction?.oldWidth
                    : transaction?.newWidth
            );

            this.suppressProgrammaticColumnResize(
                state,
                fieldKey,
                width
            );
            column.setWidth(width);
            this.updateColumnLayoutWidth(state, fieldKey, width);
            this.refreshColumnLayoutsChanged(elementId);
            this.arrangeColumnHeaderControls(elementId);
        },

        updateColumnLayoutVisibility: function (
            state,
            fieldKey,
            isHidden,
            width
        ) {
            let layout = state.columnLayouts.find(item =>
                item.fieldKey === fieldKey);

            if (!layout) {
                layout = {
                    id: 0,
                    fieldKey: fieldKey,
                    width: this.normalizeColumnWidth(
                        width ?? defaultWidths[fieldKey] ?? 180
                    ),
                    rowVersion: "",
                    isHidden: isHidden === true
                };
                state.columnLayouts.push(layout);
            } else {
                layout.isHidden = isHidden === true;
            }

            state.columnLayouts.sort((first, second) =>
                first.fieldKey.localeCompare(second.fieldKey)
            );
        },

        pushColumnVisibilityTransaction: function (
            elementId,
            fieldKey,
            oldHidden,
            newHidden,
            label
        ) {
            const state = this.states[elementId];

            if (!state || oldHidden === newHidden) {
                return;
            }

            state.undoStack.push({
                kind: "column-layout",
                action: "visibility",
                label: label,
                fieldKey: fieldKey,
                oldHidden: oldHidden === true,
                newHidden: newHidden === true
            });

            if (state.undoStack.length > state.maxTransactions) {
                state.undoStack.shift();
            }

            state.redoStack = [];
        },

        getVisibleDataColumnCount: function (elementId) {
            const table = this.tables[elementId];

            return (table?.getColumns?.() ?? []).filter(column =>
                Boolean(column.getField()) &&
                column.getField() !== "rowNumber" &&
                column.isVisible()
            ).length;
        },

        applyColumnVisibility: function (
            elementId,
            fieldKey,
            isHidden,
            recordHistory = true
        ) {
            const state = this.states[elementId];
            const table = this.tables[elementId];
            const column = table?.getColumn(fieldKey);

            if (!state || !column || !fieldKey || fieldKey === "rowNumber") {
                return false;
            }

            const oldHidden = column.isVisible?.() === false;
            const nextHidden = isHidden === true;

            if (oldHidden === nextHidden) {
                return true;
            }

            if (nextHidden) {
                if (this.getVisibleDataColumnCount(elementId) <= 1) {
                    this.setStatus(
                        elementId,
                        "لا يمكن إخفاء آخر عمود ظاهر."
                    );
                    return false;
                }

                column.hide();
            } else {
                column.show();
            }

            this.updateColumnLayoutVisibility(
                state,
                fieldKey,
                nextHidden,
                column.getWidth()
            );

            if (recordHistory) {
                const title = String(
                    column.getDefinition()?.title ?? fieldKey
                ).trim();

                this.pushColumnVisibilityTransaction(
                    elementId,
                    fieldKey,
                    oldHidden,
                    nextHidden,
                    nextHidden
                        ? `إخفاء العمود ${title}`
                        : `إظهار العمود ${title}`
                );
            }

            this.refreshColumnLayoutsChanged(elementId);
            this.arrangeColumnHeaderControls(elementId);
            this.scheduleSelectionAggregateRefresh?.(
                elementId,
                "column-visibility"
            );

            if (recordHistory) {
                this.setStatus(
                    elementId,
                    nextHidden
                        ? "تم إخفاء العمود. اضغط Save لحفظ التغيير."
                        : "تم إظهار العمود. اضغط Save لحفظ التغيير."
                );
            }

            return true;
        },

        hideColumn: function (elementId, fieldKey) {
            return this.applyColumnVisibility(
                elementId,
                fieldKey,
                true,
                true
            );
        },

        unhideColumn: function (elementId, fieldKey) {
            return this.applyColumnVisibility(
                elementId,
                fieldKey,
                false,
                true
            );
        },

        getHiddenColumns: function (elementId) {
            const table = this.tables[elementId];

            if (!table) {
                return [];
            }

            return table.getColumns()
                .filter(column =>
                    Boolean(column.getField()) &&
                    column.getField() !== "rowNumber" &&
                    column.isVisible() === false
                )
                .map(column => ({
                    fieldKey: String(column.getField()),
                    title: String(
                        column.getDefinition()?.title ?? column.getField()
                    ).trim()
                }));
        },

        acceptSavedColumnLayouts: function (elementId, layouts) {
            const state = this.states[elementId];

            if (!state) {
                return;
            }

            const savedByField = new Map(
                this.cloneColumnLayouts(layouts).map(layout => [
                    layout.fieldKey,
                    layout
                ])
            );

            state.columnLayouts = (state.columnLayouts ?? []).map(layout => {
                const saved = savedByField.get(layout.fieldKey);

                return saved
                    ? { ...saved }
                    : { ...layout };
            });
            state.originalColumnLayouts = this.cloneColumnLayouts(
                state.columnLayouts
            );
            state.loadedColumnLayouts = this.cloneColumnLayouts(layouts);
            state.columnLayoutsChanged = false;

            state.undoStack = (state.undoStack ?? []).filter(
                transaction => transaction?.kind !== "column-layout"
            );
            state.redoStack = (state.redoStack ?? []).filter(
                transaction => transaction?.kind !== "column-layout"
            );

            this.renderStatus(elementId);
        },

        arrangeColumnHeaderControls: function (elementId) {
            const element = document.getElementById(elementId);

            if (!element) {
                return;
            }

            for (const title of element.querySelectorAll(
                ".tabulator-col[tabulator-field] .tabulator-col-title"
            )) {
                let text = title.querySelector(
                    ":scope > .tabulator-col-title-text"
                );

                if (!text) {
                    const textNodes = Array.from(title.childNodes)
                        .filter(node => node.nodeType === Node.TEXT_NODE);
                    const label = textNodes
                        .map(node => node.textContent ?? "")
                        .join("")
                        .trim();

                    for (const node of textNodes) {
                        node.remove();
                    }

                    text = document.createElement("span");
                    text.className = "tabulator-col-title-text";
                    text.textContent = label || "\u00a0";
                    title.prepend(text);
                }

                const popupButton = title.querySelector(
                    ":scope > .tabulator-header-popup-button"
                );

                if (popupButton) {
                    title.appendChild(popupButton);
                }

                title.title = text.textContent?.trim() ?? "";
            }
        }
    });
})();
