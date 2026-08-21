import { createRevoGridHistoryFocus } from "./revoGridHistoryFocus.js?v=20260821-gate5b4-keyboard-sort-1";

function sameCoordinate(left, right) {
    return Number(left) === Number(right);
}

export function isSingleCellRange(range) {
    if (!range) {
        return true;
    }

    return sameCoordinate(range.x, range.x1) &&
        sameCoordinate(range.y, range.y1);
}

export function logicalCellTarget(focused, selectedRange) {
    if (!focused || !isSingleCellRange(selectedRange)) {
        return null;
    }

    const clientKey = String(focused.model?.clientKey ?? "").trim();
    const field = String(focused.column?.prop ?? "").trim();
    if (!clientKey || !field) {
        return null;
    }

    return { clientKey, field };
}

/**
 * Keeps a real cell selection attached to the same logical Work Order while
 * Revo changes only the visible row order (Filter / Sort).
 *
 * Multi-cell ranges are intentionally not rewritten here. Their semantics
 * across sorting/filtering are a separate product decision. Whole-column
 * selection also has no focused cell, so it is left to the column-selection
 * controller rather than being converted into a synthetic first-cell focus.
 */
export function createRevoGridSelectionLifecycle(options) {
    const grid = options?.grid;
    if (
        !grid ||
        typeof grid.getFocused !== "function" ||
        typeof grid.getSelectedRange !== "function" ||
        typeof grid.clearFocus !== "function"
    ) {
        throw new Error("A compatible RevoGrid element is required.");
    }

    const navigator = createRevoGridHistoryFocus({ grid });

    async function captureCellBeforeViewMutation() {
        const focused = await grid.getFocused();
        if (!focused) {
            return null;
        }

        const selectedRange = await grid.getSelectedRange();
        return logicalCellTarget(focused, selectedRange);
    }

    async function restoreCellAfterViewMutation(
        target,
        { restorePolicy = "reveal" } = {}
    ) {
        if (!target) {
            return false;
        }

        if (restorePolicy === "visible-only") {
            const stillOnScreen = await navigator.isTargetVisible(target);
            if (!stillOnScreen) {
                // Sort is allowed to move the Work Order anywhere in the view,
                // but the sheet must not chase an off-screen row. No hidden
                // active cell is kept because the next keystroke must never edit
                // something the employee cannot see.
                await grid.clearFocus();
                return false;
            }
        }

        const restored = await navigator.focusTarget(target, {
            reveal: restorePolicy !== "visible-only"
        });
        if (!restored) {
            // The logical row is no longer visible (for example the employee's
            // active Work Order was excluded by a filter). Never jump focus to
            // the first remaining row or to another Work Order.
            await grid.clearFocus();
            return false;
        }

        return true;
    }

    async function runWithPreservedCellSelection(
        action,
        { preserve = true, restorePolicy = "reveal" } = {}
    ) {
        if (typeof action !== "function") {
            throw new Error("A view mutation action is required.");
        }

        const target = preserve
            ? await captureCellBeforeViewMutation()
            : null;

        const result = await action();

        if (preserve && target) {
            await restoreCellAfterViewMutation(target, { restorePolicy });
        }

        return result;
    }

    return Object.freeze({
        captureCellBeforeViewMutation,
        restoreCellAfterViewMutation,
        runWithPreservedCellSelection
    });
}
