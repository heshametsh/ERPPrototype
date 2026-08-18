(function () {
    "use strict";

    const target = window.tabulatorTest;

    if (!target?.registerModule) {
        throw new Error(
            "tabulatorFieldChanges.js requires tabulatorTest.js first."
        );
    }

    target.registerModule("fieldChanges", {
        fieldDefinitions: new Map(),
        validationRuleDefinitions: new Map(),

        /*
         * Large paste/clear/undo operations are cheaper when the final sheet
         * data is composed once and handed back to Tabulator in one replace.
         * Smaller edits keep updateData so a normal cell edit does not rebuild
         * the table data pipeline.
         */
        bulkFieldReplaceThreshold: 500,

        registerFieldDefinitions: function (definitions) {
            for (const definition of definitions ?? []) {
                const key = String(definition?.key ?? "").trim();

                if (!key) {
                    continue;
                }

                this.fieldDefinitions.set(
                    key,
                    Object.freeze({
                        key: key,
                        label: String(definition?.label ?? key),
                        order: Number.isFinite(definition?.order)
                            ? definition.order
                            : Number.MAX_SAFE_INTEGER,
                        persisted: definition?.persisted !== false,
                        trackChanges: definition?.trackChanges !== false,
                        countsAsContent: definition?.countsAsContent !== false,
                        validators: Array.isArray(definition?.validators)
                            ? definition.validators.filter(
                                validator => typeof validator === "function"
                            )
                            : [],
                        validationRules: Array.from(
                            new Set(
                                (definition?.validationRules ?? [])
                                    .map(rule => String(rule ?? "").trim())
                                    .filter(Boolean)
                            )
                        ),
                        normalize:
                            typeof definition?.normalize === "function"
                                ? definition.normalize
                                : null
                    })
                );
            }
        },

        registerValidationRuleDefinitions: function (definitions) {
            for (const definition of definitions ?? []) {
                const key = String(definition?.key ?? "").trim();

                if (!key) {
                    continue;
                }

                this.validationRuleDefinitions.set(
                    key,
                    Object.freeze({
                        key: key,
                        dependsOn: Object.freeze(
                            Array.from(
                                new Set(
                                    (definition?.dependsOn ?? [])
                                        .map(field => String(field ?? "").trim())
                                        .filter(Boolean)
                                )
                            )
                        )
                    })
                );
            }
        },

        getFieldDefinition: function (field) {
            return this.fieldDefinitions.get(String(field ?? "")) ?? null;
        },

        getRegisteredFieldKeys: function (predicate = null) {
            return Array.from(this.fieldDefinitions.values())
                .filter(definition =>
                    typeof predicate !== "function" || predicate(definition))
                .sort((first, second) =>
                    first.order - second.order ||
                    first.key.localeCompare(second.key)
                )
                .map(definition => definition.key);
        },

        getTrackableFieldKeys: function () {
            return this.getRegisteredFieldKeys(
                definition =>
                    definition.persisted && definition.trackChanges
            );
        },

        getValidatableFieldKeys: function () {
            return this.getRegisteredFieldKeys(
                definition => definition.validators.length > 0
            );
        },

        getContentFieldKeys: function () {
            return this.getRegisteredFieldKeys(
                definition => definition.countsAsContent
            );
        },

        getFieldLabel: function (field) {
            return this.getFieldDefinition(field)?.label ?? String(field ?? "");
        },

        getFieldOrder: function (field) {
            return this.getFieldDefinition(field)?.order ?? Number.MAX_SAFE_INTEGER;
        },

        normalizeFieldValue: function (elementId, field, value) {
            const definition = this.getFieldDefinition(field);

            if (!definition?.normalize) {
                return value;
            }

            return definition.normalize.call(
                this,
                value,
                {
                    elementId: elementId,
                    field: field,
                    definition: definition
                }
            );
        },

        buildChangedFieldsByRow: function (changes) {
            const changedFieldsByRow = new Map();

            for (const change of changes ?? []) {
                const rowKey = String(change?.rowId ?? "");
                const field = String(change?.field ?? "").trim();

                if (!rowKey || !field) {
                    continue;
                }

                if (!changedFieldsByRow.has(rowKey)) {
                    changedFieldsByRow.set(rowKey, new Set());
                }

                changedFieldsByRow.get(rowKey).add(field);
            }

            return changedFieldsByRow;
        },

        getAffectedValidationRuleKeys: function (fieldKeys) {
            const fields = new Set(
                Array.from(fieldKeys ?? []).map(field => String(field))
            );
            const result = new Set();

            for (const field of fields) {
                const definition = this.getFieldDefinition(field);

                for (const ruleKey of definition?.validationRules ?? []) {
                    result.add(ruleKey);
                }
            }

            for (const definition of this.validationRuleDefinitions.values()) {
                if (definition.dependsOn.some(field => fields.has(field))) {
                    result.add(definition.key);
                }
            }

            return result;
        },

        getChangedFieldsForRow: function (elementId, rowId) {
            const state = this.states[elementId];

            if (!state) {
                return [];
            }

            return Array.from(
                state.changedFieldsByRow?.get(String(rowId)) ?? []
            ).sort((first, second) =>
                this.getFieldOrder(first) - this.getFieldOrder(second)
            );
        },

        captureActiveRangeDescriptor: function (table) {
            const ranges =
                table?.getRanges?.() ?? [];
            const activeRange =
                ranges.length > 0
                    ? ranges[ranges.length - 1]
                    : null;

            if (!activeRange) {
                return null;
            }

            const rows =
                typeof activeRange.getRows === "function"
                    ? activeRange.getRows()
                    : [];
            const columns =
                typeof activeRange.getColumns === "function"
                    ? activeRange.getColumns()
                    : [];

            if (
                !Array.isArray(rows) ||
                !Array.isArray(columns) ||
                rows.length === 0 ||
                columns.length === 0
            ) {
                return null;
            }

            const startRow =
                rows[0];
            const endRow =
                rows[rows.length - 1];
            const startColumn =
                columns[0];
            const endColumn =
                columns[columns.length - 1];

            const startField =
                startColumn?.getField?.();
            const endField =
                endColumn?.getField?.();

            if (
                !startRow ||
                !endRow ||
                !startField ||
                !endField
            ) {
                return null;
            }

            return {
                startRowId: startRow.getIndex(),
                startField: startField,
                endRowId: endRow.getIndex(),
                endField: endField
            };
        },

        restoreActiveRangeDescriptor: function (
            elementId,
            descriptor,
            viewportPosition
        ) {
            const table = this.tables[elementId];

            if (!table || !descriptor) {
                if (viewportPosition) {
                    this.scheduleTableViewportPositionRestore(
                        elementId,
                        viewportPosition,
                        4
                    );
                }

                return;
            }

            window.requestAnimationFrame(() => {
                const startRow = table.getRow(descriptor.startRowId);
                const endRow = table.getRow(descriptor.endRowId);
                const startCell = startRow?.getCell(descriptor.startField);
                const endCell = endRow?.getCell(descriptor.endField);

                if (startCell && endCell) {
                    this.clearTableRanges(elementId);

                    try {
                        table.addRange(startCell, endCell);
                    } catch {
                    }
                }

                if (viewportPosition) {
                    this.scheduleTableViewportPositionRestore(
                        elementId,
                        viewportPosition,
                        4
                    );
                }
            });
        },

        applyLargeFieldChangesByReplacement: async function (
            elementId,
            table,
            state,
            effectiveChanges
        ) {
            if (typeof table.replaceData !== "function") {
                return false;
            }

            const indexField = table.options?.index || "id";
            const viewportPosition =
                this.captureTableViewportPosition(table);
            const rangeDescriptor =
                this.captureActiveRangeDescriptor(table);
            const nextData = table.getData().map(row =>
                this.cloneRowData(row)
            );
            const rowsById = new Map(
                nextData.map(row => [String(row?.[indexField]), row])
            );

            for (const change of effectiveChanges) {
                const row = rowsById.get(String(change.rowId));

                if (!row) {
                    return false;
                }

                row[change.field] = change.newValue;
            }

            const replaceStartedAt = this.getPerformanceTimestamp();

            state.applyingHistory = true;
            state.bulkFieldMutationActive = true;

            try {
                await table.replaceData(nextData);
            } finally {
                state.bulkFieldMutationActive = false;
                state.applyingHistory = false;
            }

            this.recordPerformanceStage(
                elementId,
                "fields.batch-replace-data",
                replaceStartedAt,
                {
                    requestedCells: effectiveChanges.length,
                    affectedRows: rowsById.size,
                    finalRows: nextData.length
                }
            );

            this.restoreActiveRangeDescriptor(
                elementId,
                rangeDescriptor,
                viewportPosition
            );

            return true;
        },

        applyFieldChangesBatch: async function (
            elementId,
            changes,
            options = {}
        ) {
            const table = this.tables[elementId];
            const state = this.states[elementId];

            if (!table || !state || !Array.isArray(changes)) {
                return [];
            }

            const compacted = new Map();

            for (const rawChange of changes) {
                const rowId = rawChange?.rowId;
                const field = String(rawChange?.field ?? "").trim();

                if (rowId === null || rowId === undefined || !field) {
                    continue;
                }

                const key = `${String(rowId)}::${field}`;
                const normalizedValue = this.normalizeFieldValue(
                    elementId,
                    field,
                    rawChange.newValue
                );

                if (!compacted.has(key)) {
                    compacted.set(key, {
                        rowId: rowId,
                        clientKey: rawChange.clientKey ?? "",
                        field: field,
                        oldValue: rawChange.oldValue,
                        newValue: normalizedValue
                    });
                } else {
                    compacted.get(key).newValue = normalizedValue;
                }
            }

            const effectiveChanges = Array.from(compacted.values())
                .filter(change =>
                    !Object.is(change.oldValue, change.newValue)
                );

            if (effectiveChanges.length === 0) {
                return [];
            }

            const updatesByRow = new Map();
            const indexField = table.options?.index || "id";

            for (const change of effectiveChanges) {
                const rowKey = String(change.rowId);

                if (!updatesByRow.has(rowKey)) {
                    updatesByRow.set(rowKey, {
                        [indexField]: change.rowId
                    });
                }

                updatesByRow.get(rowKey)[change.field] = change.newValue;
            }

            const shouldUseReplacement =
                effectiveChanges.length >= this.bulkFieldReplaceThreshold;
            const replaced = shouldUseReplacement
                ? await this.applyLargeFieldChangesByReplacement(
                    elementId,
                    table,
                    state,
                    effectiveChanges
                )
                : false;

            if (!replaced) {
                const canBlockRedraw =
                    typeof table.blockRedraw === "function" &&
                    typeof table.restoreRedraw === "function";

                if (canBlockRedraw) {
                    table.blockRedraw();
                }

                state.applyingHistory = true;
                state.bulkFieldMutationActive = true;

                try {
                    await table.updateData(Array.from(updatesByRow.values()));
                } finally {
                    state.bulkFieldMutationActive = false;
                    state.applyingHistory = false;

                    if (canBlockRedraw) {
                        table.restoreRedraw();
                    }
                }
            }

            if (typeof this.syncDerivedFieldsForChanges === "function") {
                await this.syncDerivedFieldsForChanges(
                    elementId,
                    effectiveChanges
                );
            }

            if (effectiveChanges.some(change =>
                this.doesFieldAffectAggregates?.(change.field))) {
                this.scheduleAggregateRefresh?.(
                    elementId,
                    "content-batch"
                );
            }

            if (options.postProcess !== false) {
                const changedFieldsByRow =
                    this.buildChangedFieldsByRow(effectiveChanges);
                const rowIds = effectiveChanges.map(change => change.rowId);
                const fields = Array.from(
                    new Set(effectiveChanges.map(change => change.field))
                );

                this.refreshDirtyRows(
                    elementId,
                    rowIds,
                    changedFieldsByRow
                );

                if (typeof this.validateFieldChanges === "function") {
                    this.validateFieldChanges(
                        elementId,
                        changedFieldsByRow,
                        { forceRequired: false }
                    );
                }

                window.tabulatorFilters?.refreshFields?.(
                    this,
                    elementId,
                    fields
                );
            }

            return effectiveChanges;
        }
    });
})();
