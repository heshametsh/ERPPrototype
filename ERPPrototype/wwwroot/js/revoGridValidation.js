import {
    parseAmountToCents,
    validateFinancialInputs
} from "./workOrderFinancialRules.js?v=20260825-financial-rules-1";

const CORE_EDITABLE_FIELDS = [
    "workOrderNumber",
    "workTypeCode",
    "assignmentDate",
    "workOrderValue",
    "partialAmount",
    "basket"
];

const FINANCIAL_FIELDS = new Set(["workOrderValue", "partialAmount"]);
const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;

function text(value) {
    return String(value ?? "").trim();
}

function normalizeDigits(value) {
    return String(value ?? "")
        .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632))
        .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776));
}

function normalizeIntegerText(value) {
    return normalizeDigits(text(value));
}

function isBlankValue(value) {
    return value === null || value === undefined || text(value) === "";
}

function normalizeCustomColumn(column) {
    return {
        fieldKey: text(column?.fieldKey ?? column?.FieldKey),
        name: text(column?.name ?? column?.Name),
        dataType: text(column?.dataType ?? column?.DataType ?? "Text")
    };
}

function buildCustomColumns(customColumns) {
    return (Array.isArray(customColumns) ? customColumns : [])
        .map(normalizeCustomColumn)
        .filter(column => column.fieldKey);
}

function rowKey(row) {
    const key = text(row?.clientKey);
    if (!key) {
        throw new Error("Validation requires row.clientKey.");
    }
    return key;
}

function isPersistedRow(row) {
    const id = Number(row?.id ?? 0);
    return Number.isFinite(id) && id > 0;
}

function isCompletelyBlankNewRow(row, customColumns) {
    if (isPersistedRow(row)) {
        return false;
    }

    for (const field of CORE_EDITABLE_FIELDS) {
        if (!isBlankValue(row?.[field])) {
            return false;
        }
    }

    for (const column of customColumns) {
        if (!isBlankValue(row?.[column.fieldKey])) {
            return false;
        }
    }

    return true;
}

function validDateParts(value) {
    const normalized = normalizeDigits(text(value));
    const match = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) {
        return null;
    }

    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1) {
        return null;
    }

    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (
        candidate.getUTCFullYear() !== year ||
        candidate.getUTCMonth() !== month - 1 ||
        candidate.getUTCDate() !== day
    ) {
        return null;
    }

    return { day, month, year };
}

function identityPart(value, length) {
    const normalized = normalizeDigits(text(value));
    return new RegExp(`^\\d{${length}}$`).test(normalized)
        ? normalized
        : null;
}

function identityKey(row) {
    const number = identityPart(row?.workOrderNumber, 9);
    const type = identityPart(row?.workTypeCode, 3);
    return number && type ? `${number}|${type}` : null;
}

function error(field, code, message, category = "validation") {
    return { field, code, message, category };
}

function sameErrors(left, right) {
    const a = Array.from(left?.values?.() ?? [])
        .map(item => `${item.field}|${item.code}|${item.message}`)
        .sort();
    const b = Array.from(right?.values?.() ?? [])
        .map(item => `${item.field}|${item.code}|${item.message}`)
        .sort();
    return a.length === b.length && a.every((value, index) => value === b[index]);
}

function normalizeNumberForMoney(value) {
    return normalizeDigits(text(value))
        .replace(/\u066B/g, ".")
        .replace(/[,\u066C\s\u00A0\u202F]/g, "");
}

function validateCustomValue(column, value) {
    const raw = text(value);
    if (!raw) {
        return null;
    }

    const type = column.dataType.toLowerCase();
    if (type === "text") {
        return raw.length <= 250
            ? null
            : error(
                column.fieldKey,
                "custom-text-too-long",
                `${column.name || column.fieldKey} cannot exceed 250 characters.`,
                "custom"
            );
    }

    if (type === "money") {
        const parsed = parseAmountToCents(normalizeNumberForMoney(raw));
        return parsed.valid && !parsed.empty
            ? null
            : error(
                column.fieldKey,
                "custom-money-invalid",
                `${column.name || column.fieldKey} must be a valid money value.`,
                "custom"
            );
    }

    if (type === "date") {
        return validDateParts(raw)
            ? null
            : error(
                column.fieldKey,
                "custom-date-invalid",
                `${column.name || column.fieldKey} must use DD/MM/YYYY.`,
                "custom"
            );
    }

    if (type === "number") {
        const normalized = normalizeIntegerText(raw);
        if (!/^[+-]?\d+$/.test(normalized)) {
            return error(
                column.fieldKey,
                "custom-number-invalid",
                `${column.name || column.fieldKey} must be a whole number.`,
                "custom"
            );
        }

        const numeric = Number(normalized);
        return Number.isSafeInteger(numeric) && numeric >= INT32_MIN && numeric <= INT32_MAX
            ? null
            : error(
                column.fieldKey,
                "custom-number-range",
                `${column.name || column.fieldKey} is outside the allowed whole-number range.`,
                "custom"
            );
    }

    return null;
}

export function createRevoGridValidation(options = {}) {
    let customColumns = buildCustomColumns(options.customColumns);
    let basketValues = new Set(
        (Array.isArray(options.basketValues) ? options.basketValues : [])
            .map(text)
            .filter(Boolean)
    );
    let rowByClientKey = new Map();
    let errorsByClientKey = new Map();
    let identityKeyByClientKey = new Map();
    let rowsByIdentityKey = new Map();
    let invalidRowCount = 0;
    let invalidCellCount = 0;
    let financialInvalidRowCount = 0;
    let financialInvalidCellCount = 0;
    let fullValidationPasses = 0;
    let incrementalValidationPasses = 0;
    let rowsValidated = 0;


    function financialErrorCount(fieldMap) {
        let count = 0;
        for (const item of fieldMap?.values?.() ?? []) {
            if (FINANCIAL_FIELDS.has(item.field)) {
                count += 1;
            }
        }
        return count;
    }

    function setRowErrors(clientKey, next) {
        const previous = errorsByClientKey.get(clientKey) ?? new Map();
        const previousFinancial = financialErrorCount(previous);
        const nextFinancial = financialErrorCount(next);

        invalidCellCount += next.size - previous.size;
        invalidRowCount += (next.size > 0 ? 1 : 0) - (previous.size > 0 ? 1 : 0);
        financialInvalidCellCount += nextFinancial - previousFinancial;
        financialInvalidRowCount +=
            (nextFinancial > 0 ? 1 : 0) - (previousFinancial > 0 ? 1 : 0);

        if (next.size === 0) {
            errorsByClientKey.delete(clientKey);
        } else {
            errorsByClientKey.set(clientKey, next);
        }
    }

    function removeRowErrors(clientKey) {
        const previous = errorsByClientKey.get(clientKey);
        if (!previous) {
            return;
        }
        setRowErrors(clientKey, new Map());
    }

    function addIdentityMembership(clientKey, key) {
        if (!key) {
            identityKeyByClientKey.delete(clientKey);
            return;
        }
        identityKeyByClientKey.set(clientKey, key);
        let members = rowsByIdentityKey.get(key);
        if (!members) {
            members = new Set();
            rowsByIdentityKey.set(key, members);
        }
        members.add(clientKey);
    }

    function removeIdentityMembership(clientKey, key) {
        if (!key) {
            identityKeyByClientKey.delete(clientKey);
            return;
        }
        const members = rowsByIdentityKey.get(key);
        members?.delete(clientKey);
        if (members?.size === 0) {
            rowsByIdentityKey.delete(key);
        }
        identityKeyByClientKey.delete(clientKey);
    }

    function validateRow(clientKey) {
        const row = rowByClientKey.get(clientKey);
        if (!row) {
            const hadErrors = errorsByClientKey.has(clientKey);
            removeRowErrors(clientKey);
            return hadErrors;
        }

        rowsValidated += 1;
        const next = new Map();
        const blankNew = isCompletelyBlankNewRow(row, customColumns);

        if (!blankNew) {
            const workOrderNumber = text(row.workOrderNumber);
            const normalizedNumber = normalizeDigits(workOrderNumber);
            if (!workOrderNumber) {
                next.set("workOrderNumber", error(
                    "workOrderNumber",
                    "required",
                    "Work Order Number is required."
                ));
            } else if (!/^\d{9}$/.test(normalizedNumber)) {
                next.set("workOrderNumber", error(
                    "workOrderNumber",
                    "identity-format",
                    "Work Order Number must contain exactly 9 digits."
                ));
            }

            const workTypeCode = text(row.workTypeCode);
            const normalizedType = normalizeDigits(workTypeCode);
            if (!workTypeCode) {
                next.set("workTypeCode", error(
                    "workTypeCode",
                    "required",
                    "Work Type is required."
                ));
            } else if (!/^\d{3}$/.test(normalizedType)) {
                next.set("workTypeCode", error(
                    "workTypeCode",
                    "identity-format",
                    "Work Type must contain exactly 3 digits."
                ));
            }

            const assignmentDate = text(row.assignmentDate);
            if (assignmentDate && !validDateParts(assignmentDate)) {
                next.set("assignmentDate", error(
                    "assignmentDate",
                    "date-invalid",
                    "Assignment Date must use DD/MM/YYYY and a year from 2000 to 2100."
                ));
            }

            for (const financialError of validateFinancialInputs(
                row.workOrderValue,
                row.partialAmount
            )) {
                next.set(financialError.field, {
                    ...financialError,
                    category: "financial"
                });
            }

            const basket = text(row.basket);
            if (!basket) {
                next.set("basket", error(
                    "basket",
                    "required",
                    "Basket is required."
                ));
            } else if (basketValues.size > 0 && !basketValues.has(basket)) {
                next.set("basket", error(
                    "basket",
                    "basket-invalid",
                    "Select a valid Basket value."
                ));
            }

            for (const column of customColumns) {
                const customError = validateCustomValue(
                    column,
                    row[column.fieldKey]
                );
                if (customError) {
                    next.set(column.fieldKey, customError);
                }
            }
        }

        const key = identityKeyByClientKey.get(clientKey);
        const duplicateMembers = key ? rowsByIdentityKey.get(key) : null;
        if (key && duplicateMembers && duplicateMembers.size > 1) {
            next.set("workOrderNumber", error(
                "workOrderNumber",
                "duplicate",
                "This Work Order Number + Work Type already exists in the current sheet.",
                "identity"
            ));
            next.set("workTypeCode", error(
                "workTypeCode",
                "duplicate",
                "This Work Order Number + Work Type already exists in the current sheet.",
                "identity"
            ));
        }

        const previous = errorsByClientKey.get(clientKey);
        const changed = !sameErrors(previous, next);
        setRowErrors(clientKey, next);
        return changed;
    }

    function rebuildAll(rows) {
        rowByClientKey = new Map();
        errorsByClientKey = new Map();
        identityKeyByClientKey = new Map();
        rowsByIdentityKey = new Map();
        invalidRowCount = 0;
        invalidCellCount = 0;
        financialInvalidRowCount = 0;
        financialInvalidCellCount = 0;

        for (const row of Array.isArray(rows) ? rows : []) {
            const key = rowKey(row);
            if (rowByClientKey.has(key)) {
                throw new Error(`Duplicate ClientKey '${key}' in validation dataset.`);
            }
            rowByClientKey.set(key, row);
        }

        for (const [clientKey, row] of rowByClientKey) {
            addIdentityMembership(clientKey, identityKey(row));
        }

        fullValidationPasses += 1;
        for (const clientKey of rowByClientKey.keys()) {
            validateRow(clientKey);
        }
    }

    function refreshForOperations(operations) {
        const touched = new Set();
        const identityTouched = new Set();

        for (const operation of Array.isArray(operations) ? operations : []) {
            const clientKey = text(operation?.clientKey);
            if (!clientKey || !rowByClientKey.has(clientKey)) {
                continue;
            }
            touched.add(clientKey);
            const field = text(operation?.field);
            if (field === "workOrderNumber" || field === "workTypeCode") {
                identityTouched.add(clientKey);
            }
        }

        if (touched.size === 0) {
            return { visualChanged: false, validatedRows: 0 };
        }

        incrementalValidationPasses += 1;
        const impacted = new Set(touched);

        for (const clientKey of identityTouched) {
            const oldKey = identityKeyByClientKey.get(clientKey) ?? null;
            if (oldKey) {
                for (const peer of rowsByIdentityKey.get(oldKey) ?? []) {
                    impacted.add(peer);
                }
            }

            removeIdentityMembership(clientKey, oldKey);
            const nextKey = identityKey(rowByClientKey.get(clientKey));
            addIdentityMembership(clientKey, nextKey);

            if (nextKey) {
                for (const peer of rowsByIdentityKey.get(nextKey) ?? []) {
                    impacted.add(peer);
                }
            }
        }

        let visualChanged = false;
        const before = rowsValidated;
        for (const clientKey of impacted) {
            visualChanged = validateRow(clientKey) || visualChanged;
        }

        return {
            visualChanged,
            validatedRows: rowsValidated - before
        };
    }

    function replaceRows(rows) {
        const nextRows = Array.isArray(rows) ? rows : [];
        const nextMap = new Map();
        for (const row of nextRows) {
            const key = rowKey(row);
            if (nextMap.has(key)) {
                throw new Error(`Duplicate ClientKey '${key}' in validation dataset.`);
            }
            nextMap.set(key, row);
        }

        incrementalValidationPasses += 1;
        const impacted = new Set();

        for (const [clientKey] of rowByClientKey) {
            if (nextMap.has(clientKey)) {
                continue;
            }
            const oldIdentity = identityKeyByClientKey.get(clientKey) ?? null;
            if (oldIdentity) {
                for (const peer of rowsByIdentityKey.get(oldIdentity) ?? []) {
                    if (peer !== clientKey) {
                        impacted.add(peer);
                    }
                }
            }
            removeIdentityMembership(clientKey, oldIdentity);
            removeRowErrors(clientKey);
        }

        rowByClientKey = nextMap;

        for (const [clientKey, row] of rowByClientKey) {
            if (identityKeyByClientKey.has(clientKey)) {
                continue;
            }
            const nextIdentity = identityKey(row);
            addIdentityMembership(clientKey, nextIdentity);
            impacted.add(clientKey);
            if (nextIdentity) {
                for (const peer of rowsByIdentityKey.get(nextIdentity) ?? []) {
                    impacted.add(peer);
                }
            }
        }

        let visualChanged = false;
        const before = rowsValidated;
        for (const clientKey of impacted) {
            visualChanged = validateRow(clientKey) || visualChanged;
        }

        return {
            visualChanged,
            validatedRows: rowsValidated - before
        };
    }

    function resetDataset(rows, nextCustomColumns = customColumns, nextBasketValues = [...basketValues]) {
        customColumns = buildCustomColumns(nextCustomColumns);
        basketValues = new Set(
            (Array.isArray(nextBasketValues) ? nextBasketValues : [])
                .map(text)
                .filter(Boolean)
        );
        rebuildAll(rows);
    }

    function getCellError(clientKey, field) {
        return errorsByClientKey.get(text(clientKey))?.get(text(field)) ?? null;
    }

    function getCellProperties(props) {
        const clientKey = text(props?.model?.clientKey);
        const field = text(props?.prop);
        const validationError = getCellError(clientKey, field);
        if (!validationError) {
            return undefined;
        }

        return {
            "data-erp-validation-invalid": "true",
            "aria-invalid": "true",
            title: validationError.message,
            style: {
                backgroundColor: "#fff1f0",
                boxShadow: "inset 0 0 0 2px #d92d20"
            }
        };
    }

    function getSummaryState() {
        return {
            validationInvalidRowCount: invalidRowCount,
            validationInvalidCellCount: invalidCellCount,
            canSave: invalidCellCount === 0,
            financialInvalidRowCount,
            financialInvalidCellCount,
            fullValidationPasses,
            incrementalValidationPasses,
            rowsValidated
        };
    }

    function getState() {
        const invalidRows = [];
        const financialInvalidRows = [];

        for (const [clientKey, fieldMap] of errorsByClientKey) {
            const errors = Array.from(fieldMap.values());
            invalidRows.push({
                clientKey,
                fields: errors.map(item => item.field),
                messages: errors.map(item => item.message),
                errors: errors.map(item => ({ ...item }))
            });

            const financial = errors.filter(item => FINANCIAL_FIELDS.has(item.field));
            if (financial.length > 0) {
                financialInvalidRows.push({
                    clientKey,
                    fields: financial.map(item => item.field),
                    messages: financial.map(item => item.message)
                });
            }
        }

        return {
            ...getSummaryState(),
            validationInvalidRows: invalidRows,
            financialInvalidRows
        };
    }

    function destroy() {
        rowByClientKey.clear();
        errorsByClientKey.clear();
        identityKeyByClientKey.clear();
        rowsByIdentityKey.clear();
    }

    rebuildAll(options.rows);

    return Object.freeze({
        refreshForOperations,
        replaceRows,
        resetDataset,
        getCellError,
        getCellProperties,
        getSummaryState,
        getState,
        destroy
    });
}
