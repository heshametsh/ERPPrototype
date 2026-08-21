function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function positiveNumber(value, fallback = 0) {
    const number = finiteNumber(value, fallback);
    return number > 0 ? number : fallback;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

/**
 * Plan the smallest scroll that makes a completely off-screen item visible.
 * If any part of the item already intersects the viewport, return null and
 * preserve the employee's current scroll position exactly.
 */
export function calculateMinimalRevealCoordinate({
    currentCoordinate,
    viewportSize,
    itemStart,
    itemSize,
    contentSize
}) {
    const current = Math.max(0, finiteNumber(currentCoordinate));
    const viewport = positiveNumber(viewportSize);
    const start = Math.max(0, finiteNumber(itemStart));
    const size = positiveNumber(itemSize);
    const content = Math.max(start + size, finiteNumber(contentSize));

    if (!viewport || !size) {
        return null;
    }

    const end = start + size;
    const viewportEnd = current + viewport;

    // Any overlap means the cell is already visible enough. Selection can
    // move to it without moving the sheet at all.
    if (end > current && start < viewportEnd) {
        return null;
    }

    let next;
    if (end <= current) {
        // Target is fully before the viewport: align its near edge.
        next = start;
    } else {
        // Target is fully after the viewport: align its far edge with the
        // viewport far edge. This is the minimum movement that shows the
        // complete normal-sized cell.
        next = end - viewport;
    }

    const maxCoordinate = Math.max(0, content - viewport);
    next = clamp(next, 0, maxCoordinate);

    return Math.abs(next - current) > 0.5 ? next : null;
}

function getDimensionState(providers, dimension) {
    const store = providers?.dimension?.stores?.[dimension];
    return typeof store?.getCurrentState === "function"
        ? store.getCurrentState()
        : null;
}

function getViewportState(providers, dimension) {
    const viewport = providers?.viewport?.stores?.[dimension];
    const store = viewport?.store;

    if (!viewport || !store || typeof store.get !== "function") {
        return null;
    }

    return {
        currentCoordinate: finiteNumber(viewport.lastCoordinate),
        viewportSize:
            positiveNumber(store.get("virtualSize")) ||
            positiveNumber(store.get("clientSize"))
    };
}

function getItemSize(dimensionState, index) {
    if (!dimensionState) {
        return 0;
    }

    const customSize = positiveNumber(dimensionState.sizes?.[index]);
    return customSize || positiveNumber(dimensionState.originItemSize);
}

function planDimensionReveal(providers, dimension, index) {
    const dimensionState = getDimensionState(providers, dimension);
    const viewportState = getViewportState(providers, dimension);

    if (
        !dimensionState ||
        !viewportState ||
        typeof providers?.dimension?.getViewPortPos !== "function"
    ) {
        return null;
    }

    const itemStart = providers.dimension.getViewPortPos({
        coordinate: index,
        dimension
    });

    return calculateMinimalRevealCoordinate({
        currentCoordinate: viewportState.currentCoordinate,
        viewportSize: viewportState.viewportSize,
        itemStart,
        itemSize: getItemSize(dimensionState, index),
        contentSize: dimensionState.realSize
    });
}

/**
 * RevoGrid History focus/reveal feedback.
 *
 * Revo owns rendering, selection and scrolling. This adapter only decides
 * whether scrolling is necessary. It intentionally uses RevoGrid's public
 * getProviders() integration API and scrollToCoordinate()/setCellsFocus().
 */
export function createRevoGridHistoryFocus(options) {
    const grid = options?.grid;
    if (
        !grid ||
        typeof grid.getVisibleSource !== "function" ||
        typeof grid.setCellsFocus !== "function"
    ) {
        throw new Error("A compatible RevoGrid element is required.");
    }

    async function focusTarget(target) {
        if (!target) {
            return false;
        }

        const clientKey = String(target.clientKey ?? "").trim();
        const field = String(target.field ?? "").trim();
        if (!clientKey || !field) {
            return false;
        }

        const visibleRows = await grid.getVisibleSource();
        const y = Array.isArray(visibleRows)
            ? visibleRows.findIndex(row =>
                String(row?.clientKey ?? "") === clientKey)
            : -1;

        // A row hidden by a Filter is intentionally not force-revealed here.
        // When Filter joins Sheet History, its own adapter restores its state.
        if (y < 0) {
            return false;
        }

        const providers = typeof grid.getProviders === "function"
            ? await grid.getProviders()
            : null;

        let column = null;
        let colType = "rgCol";
        let x = -1;

        if (
            providers?.column &&
            typeof providers.column.getColumnByProp === "function" &&
            typeof providers.column.getColumnIndexByProp === "function"
        ) {
            column = providers.column.getColumnByProp(field);
            if (column) {
                colType = column.pin || "rgCol";
                x = providers.column.getColumnIndexByProp(field, colType);
            }
        } else if (typeof grid.getColumns === "function") {
            const columns = await grid.getColumns();
            column = Array.isArray(columns)
                ? columns.find(item => String(item?.prop ?? "") === field)
                : null;
            if (column) {
                colType = column.pin || "rgCol";
                const sameTypeColumns = columns.filter(item =>
                    (item.pin || "rgCol") === colType);
                x = sameTypeColumns.findIndex(item =>
                    String(item?.prop ?? "") === field);
            }
        }

        if (!column || x < 0) {
            return false;
        }

        // Selection is independent from scrolling in RevoGrid. Move the
        // selection first. If the cell is already on-screen, this is the only
        // visible action and the viewport remains exactly where it was.
        await grid.setCellsFocus(
            { x, y },
            { x, y },
            colType,
            "rgRow"
        );

        if (!providers || typeof grid.scrollToCoordinate !== "function") {
            return true;
        }

        const scroll = {};

        const yCoordinate = planDimensionReveal(providers, "rgRow", y);
        if (yCoordinate !== null) {
            scroll.y = yCoordinate;
        }

        // Pinned columns are already visible by definition. Only the central
        // rgCol viewport participates in horizontal scrolling.
        if (colType === "rgCol") {
            const xCoordinate = planDimensionReveal(providers, "rgCol", x);
            if (xCoordinate !== null) {
                scroll.x = xCoordinate;
            }
        }

        if (Object.keys(scroll).length > 0) {
            await grid.scrollToCoordinate(scroll);
        }

        return true;
    }

    return Object.freeze({
        focusTarget
    });
}
