(function () {
    "use strict";

    const target = window.tabulatorTest;

    if (!target?.registerModule) {
        throw new Error(
            "tabulatorDirtyState.js requires tabulatorTest.js first."
        );
    }

    target.registerModule("dirtyState", {
        /*
         * الحقول التي تدخل في حساب الصفوف غير المحفوظة.
         */
        dirtyFields: [
            "displayOrder",
            "workOrderNumber",
            "workTypeCode",
            "assignmentDate",
            "workOrderValue",
            "partialAmount",
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
    
            const fields =
                typeof this.getTrackableFieldKeys === "function"
                    ? this.getTrackableFieldKeys()
                    : this.dirtyFields;
    
            for (const field of fields) {
                snapshot[field] =
                    this.normalizeDirtyValue(
                        rowData?.[field]
                    );
            }
    
            return snapshot;
        },
    
        refreshDirtyRows: function (
            elementId,
            rowIds,
            changedFieldsByRowHint = null
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
    
            const allTrackableFields =
                typeof this.getTrackableFieldKeys === "function"
                    ? this.getTrackableFieldKeys()
                    : this.dirtyFields;
    
            for (const [rowKey, rowId] of uniqueRowIds) {
                const row =
                    table.getRow(rowId);
    
                if (!row) {
                    state.dirtyRowIds.delete(rowKey);
                    state.changedFieldsByRow?.delete(rowKey);
                    continue;
                }
    
                const currentSnapshot =
                    this.createDirtySnapshot(
                        row.getData()
                    );
    
                const originalSnapshot =
                    state.originalRows.get(rowKey);
    
                const fieldsToCheck =
                    changedFieldsByRowHint instanceof Map &&
                        changedFieldsByRowHint.has(rowKey)
                        ? Array.from(changedFieldsByRowHint.get(rowKey))
                        : allTrackableFields;
    
                const changedFields = new Set(
                    state.changedFieldsByRow?.get(rowKey) ?? []
                );
    
                if (!originalSnapshot) {
                    for (const field of allTrackableFields) {
                        changedFields.add(field);
                    }
                } else {
                    for (const field of fieldsToCheck) {
                        if (
                            currentSnapshot[field] !==
                            originalSnapshot[field]
                        ) {
                            changedFields.add(field);
                        } else {
                            changedFields.delete(field);
                        }
                    }
                }
    
                if (changedFields.size > 0) {
                    state.dirtyRowIds.add(rowKey);
                    state.changedFieldsByRow.set(
                        rowKey,
                        changedFields
                    );
                } else {
                    state.dirtyRowIds.delete(rowKey);
                    state.changedFieldsByRow.delete(rowKey);
                }
            }
    
            this.renderStatus(elementId);
        },
    
        /*
         * Keep dirty/deleted sets by delta. Existing edited rows retain their
         * state across setData; only rows added, restored, removed, or rarely
         * rebalanced need to be checked again.
         */
        applyStructureDirtyDelta: function (
            elementId,
            insertedRows,
            removedRows,
            additionalDirtyRowIds
        ) {
            const state = this.states[elementId];
    
            if (!state) {
                return;
            }
    
            const rowsToRefresh = new Map();
    
            for (const record of removedRows ?? []) {
                const rowData =
                    this.getStructureRowData(record);
    
                if (!rowData) {
                    continue;
                }
    
                const rowKey = String(rowData.id);
                state.dirtyRowIds.delete(rowKey);
                state.changedFieldsByRow?.delete(rowKey);
    
                if (state.originalRows.has(rowKey)) {
                    state.deletedOriginalRowIds.add(rowKey);
                } else {
                    state.deletedOriginalRowIds.delete(rowKey);
                }
            }
    
            for (const record of insertedRows ?? []) {
                const rowData =
                    this.getStructureRowData(record);
    
                if (!rowData) {
                    continue;
                }
    
                const rowKey = String(rowData.id);
                state.deletedOriginalRowIds.delete(rowKey);
                rowsToRefresh.set(rowKey, rowData.id);
            }
    
            for (const rowId of additionalDirtyRowIds ?? []) {
                rowsToRefresh.set(
                    String(rowId),
                    rowId
                );
            }
    
            if (rowsToRefresh.size > 0) {
                this.refreshDirtyRows(
                    elementId,
                    rowsToRefresh.values()
                );
            } else {
                this.renderStatus(elementId);
            }
        },

        /*
         * Creates the complete change-tracking state for one grid instance.
         * Lifecycle owns when a grid exists; this module owns what constitutes
         * saved, changed, or deleted data inside that instance.
         */
        createDirtyState: function (data) {
            const rows = Array.isArray(data) ? data : [];

            return {
                originalRows: new Map(
                    rows.map(row => [
                        String(row.id),
                        this.createDirtySnapshot(row)
                    ])
                ),
                dirtyRowIds: new Set(),
                changedFieldsByRow: new Map(),
                deletedOriginalRowIds: new Set()
            };
        },

        /*
         * Accepts the server-confirmed rows as the new comparison baseline.
         * The caller keeps performance-stage ownership, while all Dirty State
         * mutations stay centralized here.
         */
        replaceDirtyBaseline: function (elementId, rows) {
            const state = this.states[elementId];

            if (!state) {
                return 0;
            }

            state.originalRows = new Map(
                (Array.isArray(rows) ? rows : []).map(row => [
                    String(row.id),
                    this.createDirtySnapshot(row)
                ])
            );

            return state.originalRows.size;
        },

        clearDirtyState: function (elementId) {
            const state = this.states[elementId];

            if (!state) {
                return {
                    dirtyRows: 0,
                    changedRows: 0,
                    deletedRows: 0
                };
            }

            state.dirtyRowIds.clear();
            state.changedFieldsByRow.clear();
            state.deletedOriginalRowIds.clear();

            return {
                dirtyRows: state.dirtyRowIds.size,
                changedRows: state.changedFieldsByRow.size,
                deletedRows: state.deletedOriginalRowIds.size
            };
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
                    const changedFields =
                        typeof this.getChangedFieldsForRow === "function"
                            ? this.getChangedFieldsForRow(
                                elementId,
                                rowKey
                            )
                            : [];
    
                    dirtyRows.push({
                        ...row.getData(),
                        changedFields:
                            changedFields.length > 0
                                ? changedFields
                                : (
                                    typeof this.getTrackableFieldKeys === "function"
                                        ? this.getTrackableFieldKeys()
                                        : this.dirtyFields
                                )
                    });
                }
            }
    
            return dirtyRows;
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

    });
})();
