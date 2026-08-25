(function () {
    "use strict";

    const target = window.tabulatorTest;

    if (!target?.registerModule) {
        throw new Error(
            "tabulatorFinancialFields.js requires tabulatorTest.js first."
        );
    }

    const financialFields = new Set([
        "workOrderValue",
        "partialAmount"
    ]);

    // Sorting 10k+ rows calls the comparator many times for the same values.
    // Keep only the numeric sort key so repeated comparisons do not redo
    // digit normalization, BigInt parsing, rounding, and formatting.
    const amountSortValueCache = new Map();
    const amountSortValueCacheLimit = 100000;

    target.registerModule("financialFields", {
        normalizeFinancialDigits: function (value) {
            return String(value ?? "")
                .replace(/[٠-٩]/g, digit =>
                    String(digit.charCodeAt(0) - 1632))
                .replace(/[۰-۹]/g, digit =>
                    String(digit.charCodeAt(0) - 1776));
        },

        parseAmount: function (value) {
            const original = String(value ?? "").trim();

            if (original === "") {
                return {
                    valid: true,
                    empty: true,
                    cents: null,
                    formatted: ""
                };
            }

            const normalized = this.normalizeFinancialDigits(original)
                .replace(/\u066B/g, ".")
                .replace(/[\s,\u066C\u00A0\u202F]/g, "");

            const match = normalized.match(
                /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))$/
            );

            if (!match) {
                return {
                    valid: false,
                    empty: false,
                    cents: null,
                    formatted: original
                };
            }

            const negative = match[1] === "-";
            const wholeText = match[2] || "0";
            const fractionText = match[3] ?? match[4] ?? "";
            const paddedFraction = `${fractionText}000`;

            try {
                let absoluteCents =
                    (BigInt(wholeText) * 100n) +
                    BigInt(paddedFraction.slice(0, 2));

                if (Number(paddedFraction[2]) >= 5) {
                    absoluteCents += 1n;
                }

                const signedCents = negative
                    ? -absoluteCents
                    : absoluteCents;

                if (
                    signedCents > BigInt(Number.MAX_SAFE_INTEGER) ||
                    signedCents < BigInt(Number.MIN_SAFE_INTEGER)
                ) {
                    return {
                        valid: false,
                        empty: false,
                        cents: null,
                        formatted: original
                    };
                }

                const cents = Number(signedCents);

                return {
                    valid: true,
                    empty: false,
                    cents: cents,
                    formatted: this.formatAmountCents(cents)
                };
            } catch {
                return {
                    valid: false,
                    empty: false,
                    cents: null,
                    formatted: original
                };
            }
        },

        formatAmountCents: function (cents) {
            if (!Number.isSafeInteger(cents)) {
                return "";
            }

            const negative = cents < 0;
            const absolute = Math.abs(cents);
            const whole = Math.trunc(absolute / 100);
            const fraction = absolute % 100;
            const wholeText = whole.toLocaleString("en-US");
            const fractionText = fraction === 0
                ? ""
                : `.${String(fraction).padStart(2, "0")}`;

            return `${negative ? "-" : ""}${wholeText}${fractionText}`;
        },

        normalizeAmountValue: function (value) {
            const parsed = this.parseAmount(value);

            return parsed.valid
                ? parsed.formatted
                : String(value ?? "").trim();
        },

        normalizePartialAmountValue: function (value) {
            const parsed = this.parseAmount(value);

            if (parsed.valid && !parsed.empty && parsed.cents === 0) {
                return "";
            }

            return this.normalizeAmountValue(value);
        },

        amountFormatter: function (cell) {
            return this.normalizeAmountValue(cell?.getValue?.());
        },

        getAmountSortValue: function (value) {
            const cacheKey = String(value ?? "").trim();

            if (amountSortValueCache.has(cacheKey)) {
                return amountSortValueCache.get(cacheKey);
            }

            const parsed = this.parseAmount(value);
            const sortValue = parsed.valid && !parsed.empty
                ? parsed.cents
                : Number.NEGATIVE_INFINITY;

            if (amountSortValueCache.size >= amountSortValueCacheLimit) {
                amountSortValueCache.clear();
            }

            amountSortValueCache.set(cacheKey, sortValue);
            return sortValue;
        },

        amountSorter: function (first, second) {
            return this.getAmountSortValue(first) -
                this.getAmountSortValue(second);
        },

        calculateRemainingAmount: function (
            workOrderValue,
            partialAmount
        ) {
            const value = this.parseAmount(workOrderValue);
            const partial = this.parseAmount(partialAmount);

            if (!value.valid || value.empty || value.cents <= 0) {
                return "";
            }

            if (
                !partial.valid ||
                (!partial.empty && partial.cents < 0) ||
                (!partial.empty &&
                    partial.cents > 0 &&
                    partial.cents > value.cents)
            ) {
                return "";
            }

            return this.formatAmountCents(
                value.cents - (partial.empty ? 0 : partial.cents)
            );
        },

        syncFinancialRows: async function (elementId, rowIds) {
            const table = this.tables[elementId];
            const state = this.states[elementId];

            if (!table || !state) {
                return;
            }

            const uniqueRowIds = Array.from(
                new Set(Array.from(rowIds ?? []).map(rowId => String(rowId)))
            );
            const updates = [];

            for (const rowKey of uniqueRowIds) {
                const numericId = Number(rowKey);
                const row = table.getRow(
                    Number.isNaN(numericId) ? rowKey : numericId
                );

                if (!row) {
                    continue;
                }

                const data = row.getData();
                const remainingAmount = this.calculateRemainingAmount(
                    data?.workOrderValue,
                    data?.partialAmount
                );

                if (!Object.is(data?.remainingAmount ?? "", remainingAmount)) {
                    updates.push({
                        id: row.getIndex(),
                        remainingAmount: remainingAmount
                    });
                }
            }

            if (updates.length === 0) {
                return;
            }

            const previousApplyingHistory = state.applyingHistory;
            state.applyingHistory = true;

            try {
                await table.updateData(updates);
            } finally {
                state.applyingHistory = previousApplyingHistory;
            }
        },

        syncDerivedFieldsForChanges: async function (
            elementId,
            changes
        ) {
            const affectedRows = [];

            for (const change of changes ?? []) {
                if (financialFields.has(String(change?.field ?? ""))) {
                    affectedRows.push(change.rowId);
                }
            }

            if (affectedRows.length > 0) {
                await this.syncFinancialRows(elementId, affectedRows);
            }
        },

        isFinancialField: function (field) {
            return financialFields.has(String(field ?? ""));
        }
    });
})();
