function sameNumber(left, right) {
    return Number(left) === Number(right);
}

function normalizedRange(range) {
    if (!range) {
        return null;
    }

    const x = Number(range.x);
    const x1 = Number(range.x1);
    const y = Number(range.y);
    const y1 = Number(range.y1);
    if (![x, x1, y, y1].every(Number.isInteger)) {
        return null;
    }

    return {
        x: Math.min(x, x1),
        x1: Math.max(x, x1),
        y: Math.min(y, y1),
        y1: Math.max(y, y1),
        colType: String(range.colType ?? "rgCol"),
        rowType: String(range.rowType ?? "rgRow")
    };
}

function sameRange(left, right) {
    const a = normalizedRange(left);
    const b = normalizedRange(right);
    if (!a || !b) {
        return false;
    }

    return sameNumber(a.x, b.x) &&
        sameNumber(a.x1, b.x1) &&
        sameNumber(a.y, b.y) &&
        sameNumber(a.y1, b.y1) &&
        a.colType === b.colType &&
        a.rowType === b.rowType;
}

export function isCellInsideSelectionRange(range, cell) {
    const normalized = normalizedRange(range);
    const rowIndex = Number(cell?.rowIndex);
    const colIndex = Number(cell?.colIndex);
    if (!normalized || !Number.isInteger(rowIndex) || !Number.isInteger(colIndex)) {
        return false;
    }

    const colType = String(cell?.colType ?? "rgCol");
    const rowType = String(cell?.rowType ?? "rgRow");
    return normalized.colType === colType &&
        normalized.rowType === rowType &&
        colIndex >= normalized.x &&
        colIndex <= normalized.x1 &&
        rowIndex >= normalized.y &&
        rowIndex <= normalized.y1;
}

export function classifyRevoGridSelection({ focused, selectedRange, explicitColumn } = {}) {
    const range = normalizedRange(selectedRange);
    const explicitRange = normalizedRange(explicitColumn?.range);

    if (
        explicitColumn &&
        String(explicitColumn.prop ?? "").trim() &&
        explicitRange &&
        !focused &&
        (!range || sameRange(range, explicitRange))
    ) {
        return Object.freeze({
            kind: "column",
            prop: String(explicitColumn.prop),
            // Revo Community's public getSelectedRange() depends on an active
            // focused cell. ERP whole-column selection deliberately removes
            // that synthetic focus, so the semantic owner keeps the explicit
            // column range as the authoritative selection meaning.
            range: range ?? explicitRange,
            focused: null
        });
    }

    if (!range && !focused) {
        return Object.freeze({ kind: "none", range: null, focused: null });
    }

    const singleCell = range &&
        range.x === range.x1 &&
        range.y === range.y1;

    if (focused && (!range || singleCell)) {
        return Object.freeze({
            kind: "cell",
            range,
            focused
        });
    }

    return Object.freeze({
        kind: "range",
        range,
        focused: focused ?? null
    });
}

function isSecondaryMouseEvent(originalEvent) {
    return originalEvent instanceof MouseEvent && originalEvent.button === 2;
}

export function createRevoGridSelectionContext(options) {
    const grid = options?.grid;
    if (
        !grid ||
        typeof grid.addEventListener !== "function" ||
        typeof grid.getSelectedRange !== "function" ||
        typeof grid.getFocused !== "function"
    ) {
        throw new Error("A compatible RevoGrid element is required.");
    }

    let destroyed = false;
    let explicitColumn = null;
    let nativeRange = null;
    let semanticSelectionProvider = null;
    let suppressNextSecondaryFocusScroll = false;

    function clearExplicitSelection() {
        explicitColumn = null;
    }

    function markColumnSelection({ prop, range }) {
        const normalized = normalizedRange(range);
        const normalizedProp = String(prop ?? "").trim();
        if (!normalized || !normalizedProp) {
            clearExplicitSelection();
            return false;
        }

        explicitColumn = Object.freeze({
            kind: "column",
            prop: normalizedProp,
            range: normalized
        });
        return true;
    }

    async function getSnapshot() {
        const semanticSnapshot = semanticSelectionProvider?.getSnapshot?.() ?? null;
        if (semanticSnapshot) {
            return semanticSnapshot;
        }

        const [focused, selectedRange] = await Promise.all([
            grid.getFocused(),
            grid.getSelectedRange()
        ]);

        const normalizedSelectedRange = normalizedRange(selectedRange);
        if (normalizedSelectedRange) {
            nativeRange = normalizedSelectedRange;
        }

        return classifyRevoGridSelection({
            focused,
            selectedRange,
            explicitColumn
        });
    }

    function containsCell(snapshot, cell) {
        return isCellInsideSelectionRange(snapshot?.range, cell);
    }

    const onBeforeCellFocus = event => {
        const detail = event.detail;
        const originalEvent = detail?.originalEvent;
        const secondary = isSecondaryMouseEvent(originalEvent);

        if (semanticSelectionProvider?.getSnapshot?.()) {
            const insideSemanticSelection = Boolean(
                semanticSelectionProvider?.containsDetail?.(detail)
            );
            if (secondary && insideSemanticSelection) {
                // Context click inside semantic row/column selection must not let
                // Revo replace the employee's header selection with a cell focus.
                suppressNextSecondaryFocusScroll = false;
                event.preventDefault();
                return;
            }

            // Any real native cell focus outside semantic header selection ends
            // that mode. Revo then continues as the sole cell focus/range owner.
            semanticSelectionProvider?.clearForNativeFocus?.();
        }

        const cell = {
            rowIndex: detail?.rowIndex,
            colIndex: detail?.colIndex,
            colType: detail?.colType,
            rowType: detail?.type
        };

        if (secondary && explicitColumn) {
            const sameProp = String(detail?.prop ?? "") === explicitColumn.prop;
            if (sameProp && isCellInsideSelectionRange(explicitColumn.range, cell)) {
                // Revo Community focuses every mousedown, including button=2.
                // For a deliberate whole-column selection, a secondary click
                // inside that selection is context only and must not replace the
                // employee's selection with the cell under the pointer.
                suppressNextSecondaryFocusScroll = false;
                event.preventDefault();
                return;
            }
        }

        if (secondary && nativeRange && isCellInsideSelectionRange(nativeRange, cell)) {
            // Spreadsheet rule used by Excel/Tabulator: a secondary click inside
            // the current range opens context actions without visually collapsing
            // the employee's blue Selection to one cell. The semantic Structure
            // Context was already captured from the same range before Revo's
            // mouse-focus path runs, so keeping the native range here keeps the UI
            // and the command target telling the same story.
            suppressNextSecondaryFocusScroll = false;
            event.preventDefault();
            return;
        }

        // A secondary click can legitimately move focus outside the current
        // selection. The clicked cell is already visible (the pointer hit it),
        // so Revo's subsequent scrollIntoView is unnecessary and would emit a
        // viewportscroll that closes the ERP context menu immediately.
        suppressNextSecondaryFocusScroll = secondary;
        nativeRange = null;

        // Any real focus move outside the explicit whole-column selection ends
        // that selection mode. Revo remains the owner of the actual focus/range.
        clearExplicitSelection();
    };

    const onSetRange = event => {
        const detail = event?.detail;
        const normalized = normalizedRange({
            ...detail,
            colType: detail?.colType ?? event?.target?.colType ?? "rgCol",
            rowType: detail?.rowType ?? detail?.type ?? "rgRow"
        });
        if (normalized) {
            nativeRange = normalized;
        }
    };

    const onBeforeScrollIntoView = event => {
        if (!suppressNextSecondaryFocusScroll) {
            return;
        }

        suppressNextSecondaryFocusScroll = false;
        event.preventDefault();
    };

    const onAfterFocus = () => {
        // Safety cleanup if Revo did not emit beforescrollintoview for this
        // focus transition.
        suppressNextSecondaryFocusScroll = false;
    };

    const onBeforeFocusLost = () => {
        // Revo clears selection when focus genuinely leaves the grid. Keep the
        // semantic whole-column state in sync so it can never survive as stale
        // intent after the native selection is gone.
        nativeRange = null;
        clearExplicitSelection();
    };

    grid.addEventListener("setrange", onSetRange);
    grid.addEventListener("beforecellfocus", onBeforeCellFocus);
    grid.addEventListener("beforescrollintoview", onBeforeScrollIntoView);
    grid.addEventListener("afterfocus", onAfterFocus);
    grid.addEventListener("beforefocuslost", onBeforeFocusLost);

    function setSemanticSelectionProvider(provider) {
        semanticSelectionProvider = provider ?? null;
    }

    function destroy() {
        if (destroyed) {
            return;
        }
        grid.removeEventListener("setrange", onSetRange);
        grid.removeEventListener("beforecellfocus", onBeforeCellFocus);
        grid.removeEventListener("beforescrollintoview", onBeforeScrollIntoView);
        grid.removeEventListener("afterfocus", onAfterFocus);
        grid.removeEventListener("beforefocuslost", onBeforeFocusLost);
        suppressNextSecondaryFocusScroll = false;
        nativeRange = null;
        semanticSelectionProvider = null;
        clearExplicitSelection();
        destroyed = true;
    }

    return Object.freeze({
        markColumnSelection,
        clearExplicitSelection,
        setSemanticSelectionProvider,
        getSnapshot,
        containsCell,
        destroy
    });
}

export const revoGridSelectionContextInternals = Object.freeze({
    normalizedRange,
    sameRange
});
