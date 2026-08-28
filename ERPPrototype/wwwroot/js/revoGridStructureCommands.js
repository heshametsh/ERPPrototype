export const REVO_GRID_STRUCTURE_COMMANDS = Object.freeze({
    INSERT_ROWS: "row.insert",
    DELETE_ROWS: "row.delete",
    INSERT_COLUMNS: "column.insert",
    DELETE_COLUMNS: "column.delete"
});

function normalizeScope(value) {
    return String(value ?? "").trim().toLowerCase();
}

export function createRevoGridStructureCommands(options) {
    const rowStructure = options?.rowStructure;
    const columnWorkspace = options?.columnWorkspace;
    const selectionContext = options?.selectionContext ?? null;

    if (!rowStructure?.getContext || !rowStructure?.insertRows || !rowStructure?.deleteRows) {
        throw new Error("Structure Commands require the Row Structure owner.");
    }
    if (!rowStructure?.getDisplayedKeys) {
        throw new Error("Structure Commands require displayed-row access from Row Structure.");
    }
    if (!columnWorkspace?.resolveContext || !columnWorkspace?.insertColumns || !columnWorkspace?.deleteColumns) {
        throw new Error("Structure Commands require the Column Workspace owner.");
    }
    if (!columnWorkspace?.getOrderedProps) {
        throw new Error("Structure Commands require ordered-column access from Column Workspace.");
    }

    async function captureContext(clickedCell) {
        const snapshot = selectionContext?.getSnapshot
            ? await selectionContext.getSnapshot()
            : null;
        const [row, column] = await Promise.all([
            rowStructure.getContext(clickedCell, snapshot),
            columnWorkspace.resolveContext(clickedCell, snapshot)
        ]);
        return Object.freeze({ clickedCell, snapshot, row, column });
    }

    async function describeRowDelete(context) {
        const row = context?.row ?? {};
        const selectionCount = row.selectionKind === "column"
            ? (await rowStructure.getDisplayedKeys()).length
            : (row.selectedKeys?.length ?? 0);
        return Object.freeze({
            currentCount: row.targetKey ? 1 : 0,
            selectionCount
        });
    }

    function describeColumnDelete(context) {
        const column = context?.column ?? {};
        return Object.freeze({
            currentCount: column.targetCustom ? 1 : 0,
            selectionCount: column.selectedCustomProps?.length ?? 0,
            currentProtected: Boolean(column.targetProp && !column.targetCustom)
        });
    }

    async function execute(commandId, context, payload = {}) {
        switch (commandId) {
            case REVO_GRID_STRUCTURE_COMMANDS.INSERT_ROWS: {
                const position = String(payload.position ?? "").toLowerCase();
                const count = Number(payload.count);
                if (position !== "above" && position !== "below") {
                    throw new Error("Insert Rows position must be above or below.");
                }
                if (!Number.isInteger(count) || count < 1 || count > 1000) {
                    throw new Error("Insert Rows count must be between 1 and 1000.");
                }
                let targetKey = context?.row?.targetKey ?? null;
                if (!targetKey) {
                    const displayed = await rowStructure.getDisplayedKeys();
                    targetKey = position === "above"
                        ? displayed[0]
                        : displayed[displayed.length - 1];
                }
                if (!targetKey) {
                    throw new Error("There is no displayed row to use as an insertion point.");
                }
                return rowStructure.insertRows({ targetKey, position, count });
            }

            case REVO_GRID_STRUCTURE_COMMANDS.DELETE_ROWS: {
                const scope = normalizeScope(payload.scope);
                let keys = [];
                if (scope === "current" && context?.row?.targetKey) {
                    keys = [context.row.targetKey];
                } else if (scope === "selection") {
                    keys = context?.row?.selectionKind === "column"
                        ? await rowStructure.getDisplayedKeys()
                        : [...(context?.row?.selectedKeys ?? [])];
                }
                if (keys.length === 0) {
                    throw new Error("Choose a row scope that contains at least one displayed row.");
                }
                return rowStructure.deleteRows(keys);
            }

            case REVO_GRID_STRUCTURE_COMMANDS.INSERT_COLUMNS: {
                const position = String(payload.position ?? "").toLowerCase();
                if (position !== "left" && position !== "right") {
                    throw new Error("Insert Columns position must be left or right.");
                }
                let anchorProp = context?.column?.targetProp ?? null;
                if (!anchorProp) {
                    const ordered = columnWorkspace.getOrderedProps();
                    anchorProp = position === "left"
                        ? ordered[0]
                        : ordered[ordered.length - 1];
                }
                if (!anchorProp) {
                    throw new Error("There is no column to use as an insertion point.");
                }
                return columnWorkspace.insertColumns({
                    anchorProp,
                    position,
                    specifications: payload.specifications
                });
            }

            case REVO_GRID_STRUCTURE_COMMANDS.DELETE_COLUMNS: {
                const scope = normalizeScope(payload.scope);
                const column = context?.column ?? {};
                let props = [];
                if (scope === "current" && column.targetCustom) {
                    props = [column.targetProp];
                } else if (scope === "selection") {
                    props = [...(column.selectedCustomProps ?? [])];
                }
                if (props.length === 0) {
                    throw new Error("Choose a column scope that contains at least one Custom Column.");
                }
                return columnWorkspace.deleteColumns(props);
            }

            default:
                throw new Error(`Unknown Structure command '${commandId}'.`);
        }
    }

    return Object.freeze({
        captureContext,
        describeRowDelete,
        describeColumnDelete,
        execute
    });
}
