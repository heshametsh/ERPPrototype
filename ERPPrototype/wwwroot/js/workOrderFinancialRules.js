const MONEY_SCALE = 100n;

function normalizeDigits(value) {
    return String(value ?? "")
        .replace(/[٠-٩]/g, digit =>
            String(digit.charCodeAt(0) - 1632))
        .replace(/[۰-۹]/g, digit =>
            String(digit.charCodeAt(0) - 1776));
}

function parseAmountToCents(value) {
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

export function calculateRemainingAmount(workOrderValue, partialAmount) {
    const value = parseAmountToCents(workOrderValue);
    const partial = parseAmountToCents(partialAmount);

    if (!value.valid || value.empty || !partial.valid) {
        return null;
    }

    const remainingCents =
        value.cents - (partial.empty ? 0 : partial.cents);

    return remainingCents / Number(MONEY_SCALE);
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
