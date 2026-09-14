const TRIM_KEY = "erp-column-visibility";
const COLUMN_TYPES = Object.freeze([
    "colPinStart",
    "rgCol",
    "colPinEnd"
]);

function text(value) {
    return String(value ?? "").trim();
}

function waitForRender() {
    return new Promise(resolve => {
        if (typeof requestAnimationFrame !== "function") {
            setTimeout(resolve, 0);
            return;
        }

        requestAnimationFrame(() =>
            requestAnimationFrame(resolve));
    });
}

function visibleFromStore(source, dataStore) {
    const items = dataStore?.store?.get?.("items");
    if (!items) {
        return [...source];
    }

    return Array.from(items)
        .map(index => source[Number(index)])
        .filter(Boolean);
}

export function createRevoGridColumnVisibilityAdapter(options) {
    const grid = options?.grid;

    if (!grid || typeof grid.getProviders !== "function") {
        throw new Error(
            "Column Visibility Adapter requires a RevoGrid element."
        );
    }

    let destroyed = false;
    let providersPromise = null;

    async function providers() {
        if (destroyed) {
            throw new Error(
                "Column Visibility Adapter is destroyed."
            );
        }

        providersPromise ??=
            Promise.resolve(grid.getProviders());

        const value = await providersPromise;

        if (
            !value?.column?.getRawColumns ||
            !value?.column?.stores ||
            !value?.dimension?.setTrimmed
        ) {
            throw new Error(
                "RevoGrid column/dimension providers are unavailable."
            );
        }

        return value;
    }

    async function getVisibleColumns(type = "all") {
        const value = await providers();
        const raw = value.column.getRawColumns();

        const requested = text(type);
        const types = requested === "all"
            ? COLUMN_TYPES
            : COLUMN_TYPES.includes(requested)
                ? [requested]
                : [];

        return types.flatMap(columnType => {
            const source = Array.isArray(raw?.[columnType])
                ? raw[columnType]
                : [];

            return visibleFromStore(
                source,
                value.column.stores?.[columnType]
            );
        });
    }

    async function getAllColumns(type = "all") {
        const value = await providers();
        const raw = value.column.getRawColumns();

        const requested = text(type);
        const types = requested === "all"
            ? COLUMN_TYPES
            : COLUMN_TYPES.includes(requested)
                ? [requested]
                : [];

        return types.flatMap(columnType =>
            Array.isArray(raw?.[columnType])
                ? raw[columnType]
                : []
        );
    }

    async function applyHiddenProps(hiddenProps) {
        const value = await providers();
        const raw = value.column.getRawColumns();
        const hidden = new Set(
            (Array.isArray(hiddenProps) ? hiddenProps : [])
                .map(text)
                .filter(Boolean)
        );

        for (const type of COLUMN_TYPES) {
            const source = Array.isArray(raw?.[type])
                ? raw[type]
                : [];
            const dataStore = value.column.stores?.[type];

            if (
                !dataStore?.store?.get ||
                typeof dataStore.setData !== "function"
            ) {
                continue;
            }

            const hiddenPhysical = {};

            source.forEach((column, index) => {
                if (hidden.has(text(column?.prop))) {
                    hiddenPhysical[index] = true;
                }
            });

            const currentTrimmed =
                dataStore.store.get("trimmed") ?? {};
            const nextTrimmed = {
                ...currentTrimmed,
                [TRIM_KEY]: hiddenPhysical
            };

            // Revo's column DataStore trim removes the item from the visible
            // projection while leaving the authored source intact.
            dataStore.setData({ trimmed: nextTrimmed });

            // Dimension trim removes the same physical column width so Hide
            // leaves no blank strip and viewport math stays Revo-owned.
            value.dimension.setTrimmed(
                nextTrimmed,
                type
            );
        }

        await waitForRender();

        return getVisibleColumns("all");
    }

    function destroy() {
        destroyed = true;
        providersPromise = null;
    }

    return Object.freeze({
        getVisibleColumns,
        getAllColumns,
        applyHiddenProps,
        destroy
    });
}

export const revoGridColumnVisibilityAdapterInternals =
    Object.freeze({
        TRIM_KEY,
        COLUMN_TYPES,
        visibleFromStore
    });