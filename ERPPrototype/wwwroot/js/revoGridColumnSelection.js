function composedPath(originalEvent) {
    return typeof originalEvent?.composedPath === "function"
        ? originalEvent.composedPath()
        : [];
}

function isHeaderControlClick(originalEvent) {
    for (const item of composedPath(originalEvent)) {
        if (!(item instanceof Element)) {
            continue;
        }
        if (
            item.hasAttribute("data-erp-filter-prop") ||
            item.hasAttribute("data-erp-sort-prop")
        ) {
            return true;
        }
    }

    const target = originalEvent?.target;
    return target instanceof Element && Boolean(
        target.closest("[data-erp-filter-prop], [data-erp-sort-prop]")
    );
}

function sameProp(left, right) {
    return String(left ?? "") === String(right ?? "");
}

export function getVisibleColumnSelectionRange(visibleRowCount, columnIndex) {
    const count = Math.max(0, Number(visibleRowCount) || 0);
    const x = Math.max(0, Number(columnIndex) || 0);
    if (count === 0) {
        return null;
    }
    return {
        start: { x, y: 0 },
        end: { x, y: count - 1 }
    };
}

export function createRevoGridColumnSelection(options) {
    const grid = options?.grid;
    if (!grid || typeof grid.addEventListener !== "function") {
        throw new Error("A RevoGrid element is required.");
    }

    let destroyed = false;
    let selecting = false;

    async function selectVisibleColumn(prop) {
        if (destroyed || selecting) {
            return;
        }

        selecting = true;
        try {
            const columns = await grid.getColumns();
            const column = (Array.isArray(columns) ? columns : [])
                .find(item => sameProp(item?.prop, prop));
            if (!column) {
                return;
            }

            const colType = column.pin || "rgCol";
            const sameViewportColumns = (Array.isArray(columns) ? columns : [])
                .filter(item => (item?.pin || "rgCol") === colType);
            const columnIndex = sameViewportColumns
                .findIndex(item => sameProp(item?.prop, prop));
            if (columnIndex < 0) {
                return;
            }

            // Revo Community public API returns the post-filter visible row
            // source. Using that count means a filtered 200-row view selects
            // exactly those 200 rows, never hidden rows from the full source.
            const visibleRows = await grid.getVisibleSource("rgRow");
            const range = getVisibleColumnSelectionRange(
                Array.isArray(visibleRows) ? visibleRows.length : 0,
                columnIndex
            );

            if (!range) {
                await grid.clearFocus();
                return;
            }

            await grid.setCellsFocus(
                range.start,
                range.end,
                colType,
                "rgRow"
            );
        } finally {
            selecting = false;
        }
    }

    const onHeaderClick = event => {
        const originalEvent = event.detail?.originalEvent;
        if (isHeaderControlClick(originalEvent)) {
            return;
        }

        const prop = event.detail?.prop;
        if (prop === undefined || prop === null || String(prop) === "") {
            return;
        }

        // Header body owns selection. Sort/Filter are dedicated controls.
        event.preventDefault();
        originalEvent?.preventDefault?.();
        void selectVisibleColumn(prop);
    };

    grid.addEventListener("headerclick", onHeaderClick);

    function destroy() {
        if (destroyed) {
            return;
        }
        grid.removeEventListener("headerclick", onHeaderClick);
        destroyed = true;
    }

    return Object.freeze({
        selectVisibleColumn,
        destroy
    });
}

export const revoGridColumnSelectionInternals = Object.freeze({
    getVisibleColumnSelectionRange
});
