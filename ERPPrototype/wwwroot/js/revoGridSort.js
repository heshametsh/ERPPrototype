const HISTORY_ADAPTER_KEY = "work-orders-sort-state";
const SORT_BUTTON_CLASS = "erp-revo-sort-button";
const SORT_STATE_PROP = "erpSortState";
const SORT_KIND_PROP = "erpSortKind";

function requireText(value, name) {
    const normalized = String(value ?? "").trim();
    if (!normalized) {
        throw new Error(`${name} is required.`);
    }
    return normalized;
}

function cloneValue(value) {
    if (value === undefined) {
        return undefined;
    }
    if (typeof structuredClone === "function") {
        try {
            return structuredClone(value);
        } catch {
        }
    }
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return value;
    }
}

export function normalizeSortState(input) {
    const field = String(input?.field ?? "").trim();
    const order = input?.order;
    if (!field || (order !== "asc" && order !== "desc")) {
        return null;
    }
    return { field, order };
}

export function sortStatesEqual(left, right) {
    return JSON.stringify(normalizeSortState(left)) ===
        JSON.stringify(normalizeSortState(right));
}

// Approved Work Orders numeric behavior: first click is largest -> smallest,
// second click reverses it, third click returns to natural source order.
export function getNextErpSortOrder(currentOrder) {
    switch (currentOrder) {
        case "desc":
            return "asc";
        case "asc":
            return undefined;
        default:
            return "desc";
    }
}

function sortIcon(h, order) {
    if (order === "asc") {
        return h("svg", {
            viewBox: "0 0 24 24",
            width: "14",
            height: "14",
            "aria-hidden": "true",
            style: { display: "block", pointerEvents: "none" }
        }, [
            h("path", {
                d: "M12 5l6 7h-4v7h-4v-7H6l6-7z",
                fill: "currentColor"
            })
        ]);
    }

    if (order === "desc") {
        return h("svg", {
            viewBox: "0 0 24 24",
            width: "14",
            height: "14",
            "aria-hidden": "true",
            style: { display: "block", pointerEvents: "none" }
        }, [
            h("path", {
                d: "M12 19l-6-7h4V5h4v7h4l-6 7z",
                fill: "currentColor"
            })
        ]);
    }

    return h("svg", {
        viewBox: "0 0 24 24",
        width: "14",
        height: "14",
        "aria-hidden": "true",
        style: { display: "block", pointerEvents: "none" }
    }, [
        h("path", {
            d: "M8 4l-4 5h3v7h2V9h3L8 4zm8 16l4-5h-3V8h-2v7h-3l4 5z",
            fill: "currentColor"
        })
    ]);
}

export function sortOnlyHeaderTemplate(h, column) {
    const state = column?.[SORT_STATE_PROP];
    const order = state?.order;
    const prop = String(column?.prop ?? "");
    const title = String(column?.name ?? prop);
    const active = order === "asc" || order === "desc";
    const directionText = order === "desc"
        ? "largest to smallest"
        : order === "asc"
            ? "smallest to largest"
            : "not sorted";

    return h("span", {
        style: {
            display: "flex",
            alignItems: "center",
            minWidth: "0",
            width: "100%",
            gap: "5px"
        }
    }, [
        h("span", {
            style: {
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: "0",
                flex: "1 1 auto"
            }
        }, title),
        h("button", {
            type: "button",
            class: SORT_BUTTON_CLASS,
            "data-erp-sort-prop": prop,
            "aria-label": `Sort ${title}: ${directionText}`,
            "aria-pressed": active ? "true" : "false",
            title: active
                ? `Sort ${title}: ${directionText}`
                : `Sort ${title}: largest to smallest`,
            style: {
                display: "inline-grid",
                placeItems: "center",
                width: "20px",
                height: "20px",
                padding: "0",
                border: active ? "1px solid #6aaed6" : "1px solid transparent",
                borderRadius: "3px",
                background: active ? "#d8eefc" : "transparent",
                color: active ? "#0b5f8a" : "currentColor",
                opacity: active ? "1" : ".78",
                cursor: "pointer",
                flex: "0 0 auto"
            }
        }, [sortIcon(h, order)])
    ]);
}

export function createSortOnlyColumn(column, kind = "number") {
    return {
        ...column,
        // SortingPlugin remains the engine, but header clicks are not allowed
        // to trigger it implicitly. The dedicated ERP sort button calls the
        // public updateColumnSorting/clearSorting API instead.
        sortable: false,
        filter: false,
        [SORT_KIND_PROP]: String(kind || "number"),
        [SORT_STATE_PROP]: { order: undefined },
        columnTemplate: sortOnlyHeaderTemplate
    };
}

function findSortButton(originalEvent) {
    const path = typeof originalEvent?.composedPath === "function"
        ? originalEvent.composedPath()
        : [];

    for (const item of path) {
        if (
            item instanceof Element &&
            item.classList.contains(SORT_BUTTON_CLASS)
        ) {
            return item;
        }
    }

    const target = originalEvent?.target;
    return target instanceof Element
        ? target.closest(`.${SORT_BUTTON_CLASS}`)
        : null;
}

function getSortColumns(grid) {
    const result = new Map();
    for (const column of Array.isArray(grid?.columns) ? grid.columns : []) {
        if (!column?.[SORT_KIND_PROP]) {
            continue;
        }
        result.set(String(column.prop), column);
    }
    return result;
}

function setVisualState(sortColumns, nextState) {
    const normalized = normalizeSortState(nextState);
    for (const [field, column] of sortColumns.entries()) {
        const state = column?.[SORT_STATE_PROP];
        if (!state || typeof state !== "object") {
            continue;
        }
        state.order = normalized?.field === field
            ? normalized.order
            : undefined;
    }
}

function waitForSortApply(grid, trigger) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const timer = window.setTimeout(() => {
            if (settled) {
                return;
            }
            settled = true;
            grid.removeEventListener("aftersortingapply", handler);
            reject(new Error("RevoGrid native sort did not finish in time."));
        }, 5000);

        const handler = event => {
            if (settled) {
                return;
            }
            settled = true;
            window.clearTimeout(timer);
            grid.removeEventListener("aftersortingapply", handler);
            resolve(event.detail);
        };

        grid.addEventListener("aftersortingapply", handler);
        Promise.resolve()
            .then(trigger)
            .catch(error => {
                if (settled) {
                    return;
                }
                settled = true;
                window.clearTimeout(timer);
                grid.removeEventListener("aftersortingapply", handler);
                reject(error);
            });
    });
}

export function createRevoGridSort(options) {
    const grid = options?.grid;
    const historyCoordinator = options?.historyCoordinator;
    if (!grid || typeof grid.addEventListener !== "function") {
        throw new Error("A RevoGrid element is required.");
    }
    if (
        !historyCoordinator ||
        typeof historyCoordinator.registerAdapter !== "function" ||
        typeof historyCoordinator.record !== "function"
    ) {
        throw new Error("Sheet History coordinator is required.");
    }

    let datasetKey = requireText(options?.datasetKey, "datasetKey");
    let activeState = null;
    let destroyed = false;
    let applying = false;
    let refreshScheduled = false;
    const viewStateByDataset = new Map([[datasetKey, null]]);
    const sortColumns = getSortColumns(grid);
    const removers = [];

    function notifyState() {
        if (typeof options?.onStateChange === "function") {
            options.onStateChange(getState());
        }
    }

    function addListener(target, type, handler, listenerOptions) {
        target.addEventListener(type, handler, listenerOptions);
        removers.push(() => target.removeEventListener(type, handler, listenerOptions));
    }

    async function applyNativeState(nextState, { remember = true } = {}) {
        if (destroyed) {
            return;
        }

        const normalized = normalizeSortState(nextState);
        const previousVisual = cloneValue(activeState);
        applying = true;
        setVisualState(sortColumns, normalized);
        notifyState();

        try {
            await waitForSortApply(grid, async () => {
                if (!normalized) {
                    await grid.clearSorting();
                    return;
                }

                const column = sortColumns.get(normalized.field);
                if (!column) {
                    throw new Error(`Sort column '${normalized.field}' is not available.`);
                }

                await grid.updateColumnSorting(
                    {
                        prop: normalized.field,
                        cellCompare: column.cellCompare
                    },
                    normalized.order,
                    false
                );
            });

            activeState = normalized;
            if (remember) {
                viewStateByDataset.set(datasetKey, cloneValue(activeState));
            }
        } catch (error) {
            setVisualState(sortColumns, previousVisual);
            throw error;
        } finally {
            applying = false;
            notifyState();
        }
    }

    async function commitUserSort(field) {
        if (applying || destroyed) {
            return false;
        }

        const normalizedField = requireText(field, "field");
        if (!sortColumns.has(normalizedField)) {
            return false;
        }

        const before = normalizeSortState(activeState);
        const currentOrder = before?.field === normalizedField
            ? before.order
            : undefined;
        const nextOrder = getNextErpSortOrder(currentOrder);
        const after = nextOrder
            ? { field: normalizedField, order: nextOrder }
            : null;

        if (sortStatesEqual(before, after)) {
            return false;
        }

        await applyNativeState(after);

        try {
            historyCoordinator.record({
                adapterKey: HISTORY_ADAPTER_KEY,
                kind: "sort",
                label: after
                    ? `Sort ${normalizedField} ${after.order}`
                    : `Clear Sort ${normalizedField}`,
                focusTarget: null,
                payload: { before, after }
            });
        } catch (error) {
            await applyNativeState(before);
            throw error;
        }

        return true;
    }

    const unregisterHistoryAdapter = historyCoordinator.registerAdapter(
        HISTORY_ADAPTER_KEY,
        {
            apply: async (entry, direction) => {
                const target = direction === "undo"
                    ? entry?.payload?.before
                    : entry?.payload?.after;
                await applyNativeState(target ?? null);
            }
        }
    );

    const onHeaderClick = event => {
        const button = findSortButton(event.detail?.originalEvent);
        if (!button) {
            return;
        }

        const field = String(
            button.getAttribute("data-erp-sort-prop") ??
            event.detail?.prop ??
            ""
        );
        if (!sortColumns.has(field)) {
            return;
        }

        event.preventDefault();
        event.detail?.originalEvent?.preventDefault?.();
        void commitUserSort(field);
    };

    function scheduleRefresh() {
        if (!activeState || applying || destroyed || refreshScheduled) {
            return;
        }

        refreshScheduled = true;
        queueMicrotask(() => {
            refreshScheduled = false;
            if (!activeState || applying || destroyed) {
                return;
            }
            void applyNativeState(activeState, { remember: false });
        });
    }

    const refreshAfterHistoryReplay = event => {
        if (event.detail?.entry?.adapterKey === HISTORY_ADAPTER_KEY) {
            return;
        }
        scheduleRefresh();
    };

    addListener(grid, "headerclick", onHeaderClick);
    addListener(grid, "afteredit", scheduleRefresh);
    addListener(grid, "erpaftersheethistoryreplay", refreshAfterHistoryReplay);

    async function suspendForDatasetSwitch() {
        const remembered = cloneValue(activeState);
        await applyNativeState(null, { remember: false });
        activeState = remembered;
        setVisualState(sortColumns, remembered);
    }

    async function resetDataset(nextDatasetKey) {
        datasetKey = requireText(nextDatasetKey, "datasetKey");
        const restored = viewStateByDataset.has(datasetKey)
            ? cloneValue(viewStateByDataset.get(datasetKey))
            : null;
        if (!viewStateByDataset.has(datasetKey)) {
            viewStateByDataset.set(datasetKey, null);
        }
        await applyNativeState(restored);
    }

    async function resumeCurrentDataset() {
        await applyNativeState(activeState);
    }

    function getState() {
        return {
            datasetKey,
            sortBusy: applying,
            activeSort: cloneValue(activeState)
        };
    }

    function getSortState() {
        return cloneValue(activeState);
    }

    function destroy() {
        if (destroyed) {
            return;
        }
        for (const remove of removers.splice(0)) {
            try {
                remove();
            } catch {
            }
        }
        try {
            unregisterHistoryAdapter();
        } catch {
        }
        destroyed = true;
    }

    return Object.freeze({
        suspendForDatasetSwitch,
        resetDataset,
        resumeCurrentDataset,
        getState,
        getSortState,
        destroy
    });
}

export const revoGridSortInternals = Object.freeze({
    HISTORY_ADAPTER_KEY,
    SORT_BUTTON_CLASS,
    SORT_STATE_PROP,
    SORT_KIND_PROP,
    normalizeSortState,
    sortStatesEqual,
    getNextErpSortOrder
});
