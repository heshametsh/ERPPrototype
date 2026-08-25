const MONEY_SCALE = 100n;

function normalizeDigits(value) {
    return String(value ?? "")
        .replace(/[٠-٩]/g, digit =>
            String(digit.charCodeAt(0) - 1632))
        .replace(/[۰-۹]/g, digit =>
            String(digit.charCodeAt(0) - 1776));
}

export function parseAmountToCents(value) {
    const original = String(value ?? "").trim();

    if (original === "") {
        return { valid: true, empty: true, cents: null };
    }

    const normalized = normalizeDigits(original)
        .replace(/\u066B/g, ".")
        .replace(/[\s,\u066C\u00A0\u202F]/g, "");

    const match = normalized.match(
        /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))$/
    );

    if (!match) {
        return { valid: false, empty: false, cents: null };
    }

    const negative = match[1] === "-";
    const wholeText = match[2] || "0";
    const fractionText = match[3] ?? match[4] ?? "";
    const paddedFraction = `${fractionText}000`;

    try {
        let absoluteCents =
            (BigInt(wholeText) * MONEY_SCALE) +
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
            return { valid: false, empty: false, cents: null };
        }

        return {
            valid: true,
            empty: false,
            cents: Number(signedCents)
        };
    } catch {
        return { valid: false, empty: false, cents: null };
    }
}

export function validateFinancialInputs(workOrderValue, partialAmount) {
    const value = parseAmountToCents(workOrderValue);
    const partial = parseAmountToCents(partialAmount);
    const errors = [];

    if (!value.valid || value.empty) {
        errors.push({
            field: "workOrderValue",
            code: value.empty ? "required" : "invalid",
            message: value.empty
                ? "Work Order Value is required and must be greater than zero."
                : "Work Order Value must be numeric."
        });
    } else if (value.cents <= 0) {
        errors.push({
            field: "workOrderValue",
            code: "positive",
            message: "Work Order Value must be greater than zero."
        });
    }

    if (!partial.valid) {
        errors.push({
            field: "partialAmount",
            code: "invalid",
            message: "Partial Amount must be numeric when entered."
        });
    } else if (!partial.empty && partial.cents < 0) {
        errors.push({
            field: "partialAmount",
            code: "negative",
            message: "Partial Amount cannot be negative."
        });
    } else if (
        !partial.empty &&
        partial.cents > 0 &&
        value.valid &&
        !value.empty &&
        value.cents > 0 &&
        partial.cents > value.cents
    ) {
        errors.push({
            field: "partialAmount",
            code: "above-work-order-value",
            message: "Partial Amount cannot exceed Work Order Value."
        });
    } else if (
        !partial.empty &&
        partial.cents > 0 &&
        (!value.valid || value.empty || value.cents <= 0)
    ) {
        errors.push({
            field: "partialAmount",
            code: "missing-work-order-value",
            message: "Partial Amount requires a valid Work Order Value."
        });
    }

    return errors;
}

export function calculateRemainingAmount(workOrderValue, partialAmount) {
    const errors = validateFinancialInputs(workOrderValue, partialAmount);

    if (errors.length > 0) {
        return null;
    }

    const value = parseAmountToCents(workOrderValue);
    const partial = parseAmountToCents(partialAmount);

    const remainingCents =
        value.cents - (partial.empty ? 0 : partial.cents);

    return remainingCents / Number(MONEY_SCALE);
}

export function normalizeFinancialInput(row, field) {
    if (!row || typeof row !== "object" || field !== "partialAmount") {
        return false;
    }

    const parsed = parseAmountToCents(row[field]);
    if (!parsed.valid || parsed.empty || parsed.cents !== 0) {
        return false;
    }

    if (row[field] === null || row[field] === undefined || row[field] === "") {
        return false;
    }

    row[field] = null;
    return true;
}

export function syncWorkOrderDerivedFinancialFields(row) {
    if (!row || typeof row !== "object") {
        return false;
    }

    const nextRemaining = calculateRemainingAmount(
        row.workOrderValue,
        row.partialAmount
    );

    if (Object.is(row.remainingAmount ?? null, nextRemaining)) {
        return false;
    }

    row.remainingAmount = nextRemaining;
    return true;
}
