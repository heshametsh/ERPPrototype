window.workOrdersGrid = {
    initializeExcelTyping: function (gridId) {
        const gridElement = document.getElementById(gridId);

        if (!gridElement) {
            console.warn("Grid element not found:", gridId);
            return;
        }

        if (gridElement.dataset.excelTypingInitialized === "true") {
            return;
        }

        const grid = gridElement.ej2_instances?.[0];

        if (!grid) {
            console.warn("Syncfusion Grid instance not found:", gridId);
            return;
        }

        gridElement.dataset.excelTypingInitialized = "true";

        gridElement.addEventListener(
            "keydown",
            function (event) {
                if (
                    event.ctrlKey ||
                    event.metaKey ||
                    event.altKey ||
                    event.key.length !== 1
                ) {
                    return;
                }

                const target = event.target;

                const isAlreadyEditing =
                    target instanceof HTMLInputElement ||
                    target instanceof HTMLTextAreaElement ||
                    target instanceof HTMLSelectElement ||
                    target?.isContentEditable === true ||
                    target?.closest?.(".e-editcell") !== null;

                if (isAlreadyEditing) {
                    return;
                }

                const selectedCells =
                    grid.getSelectedRowCellIndexes();

                if (
                    !selectedCells ||
                    selectedCells.length === 0
                ) {
                    return;
                }

                const lastSelectedRow =
                    selectedCells[selectedCells.length - 1];

                if (
                    !lastSelectedRow.cellIndexes ||
                    lastSelectedRow.cellIndexes.length === 0
                ) {
                    return;
                }

                const rowIndex = lastSelectedRow.rowIndex;

                const columnIndex =
                    lastSelectedRow.cellIndexes[
                    lastSelectedRow.cellIndexes.length - 1
                    ];

                const column =
                    grid.getColumnByIndex(columnIndex);

                if (
                    !column ||
                    !column.field ||
                    column.allowEditing === false ||
                    column.isPrimaryKey === true
                ) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();

                grid.editCell(
                    rowIndex,
                    column.field
                );

                window.setTimeout(function () {
                    const editedCell =
                        grid.getCellFromIndex(
                            rowIndex,
                            columnIndex
                        );

                    if (!editedCell) {
                        return;
                    }

                    const input =
                        editedCell.querySelector(
                            "input:not([type='hidden']), textarea"
                        );

                    if (!input) {
                        return;
                    }

                    input.focus();
                    input.value = event.key;

                    input.dispatchEvent(
                        new Event("input", {
                            bubbles: true
                        })
                    );

                    if (
                        typeof input.setSelectionRange === "function"
                    ) {
                        input.setSelectionRange(
                            input.value.length,
                            input.value.length
                        );
                    }
                }, 100);
            },
            true
        );
    }
};