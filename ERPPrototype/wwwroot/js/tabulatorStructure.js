(function () {
    "use strict";

    const target = window.tabulatorTest;

    if (!target?.registerModule) {
        throw new Error(
            "tabulatorStructure.js requires tabulatorTest.js first."
        );
    }

    target.registerModule("structure", {
        ensureStructureStyles: function () {
            const styleId =
                "tabulator-structure-ui-styles";

            if (document.getElementById(styleId)) {
                return;
            }

            const style =
                document.createElement("style");

            style.id = styleId;
            style.textContent = `
                .tabulator-row-context-menu {
                    position: fixed;
                    z-index: 4000;
                    width: 220px;
                    padding: 6px;
                    border: 1px solid #b9c8d4;
                    border-radius: 9px;
                    background: #ffffff;
                    box-shadow: 0 14px 34px rgba(15, 42, 70, 0.2);
                }

                .tabulator-row-context-menu[hidden] {
                    display: none;
                }

                .tabulator-row-context-menu button {
                    display: block;
                    width: 100%;
                    padding: 9px 11px;
                    border: 0;
                    border-radius: 6px;
                    background: transparent;
                    color: #173047;
                    text-align: left;
                    font-family: "Segoe UI", Tahoma, Arial, sans-serif;
                    font-size: 0.88rem;
                    font-weight: 650;
                    cursor: pointer;
                }

                .tabulator-row-context-menu button:hover {
                    background: #eef7fc;
                    color: #0b5f95;
                }

                .tabulator-row-context-separator {
                    height: 1px;
                    margin: 5px 3px;
                    background: #dce5eb;
                }

                .tabulator-insert-dialog {
                    width: min(390px, calc(100vw - 32px));
                    padding: 0;
                    border: 1px solid #b8c8d4;
                    border-radius: 12px;
                    background: #ffffff;
                    color: #173047;
                    box-shadow: 0 22px 60px rgba(15, 42, 70, 0.25);
                }

                .tabulator-insert-dialog::backdrop {
                    background: rgba(11, 34, 57, 0.34);
                }

                .tabulator-insert-form {
                    padding: 22px;
                }

                .tabulator-insert-form h2 {
                    margin: 0 0 18px;
                    color: #0b2239;
                    font-size: 1.2rem;
                    font-weight: 800;
                }

                .tabulator-insert-label {
                    display: grid;
                    gap: 7px;
                    color: #2e4a60;
                    font-size: 0.9rem;
                    font-weight: 700;
                }

                .tabulator-insert-count {
                    box-sizing: border-box;
                    width: 100%;
                    height: 40px;
                    padding: 7px 10px;
                    border: 1px solid #99afbf;
                    border-radius: 7px;
                    color: #173047;
                    font: inherit;
                    outline: none;
                }

                .tabulator-insert-count:focus {
                    border-color: #0b78c7;
                    box-shadow: 0 0 0 3px rgba(11, 120, 199, 0.14);
                }

                .tabulator-insert-position {
                    display: grid;
                    gap: 9px;
                    margin: 17px 0 0;
                    padding: 14px;
                    border: 1px solid #d3dfe7;
                    border-radius: 8px;
                }

                .tabulator-insert-position legend {
                    float: none;
                    width: auto;
                    margin: 0 0 7px;
                    padding: 0 4px;
                    color: #2e4a60;
                    font-size: 0.88rem;
                    font-weight: 800;
                }

                .tabulator-insert-position label {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin: 0;
                    font-size: 0.9rem;
                }

                .tabulator-insert-actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: 9px;
                    margin-top: 20px;
                }

                .tabulator-dialog-button {
                    min-width: 92px;
                    height: 38px;
                    padding: 0 14px;
                    border-radius: 7px;
                    font-size: 0.88rem;
                    font-weight: 750;
                    cursor: pointer;
                }

                .tabulator-dialog-cancel {
                    border: 1px solid #9eb0bd;
                    background: #ffffff;
                    color: #435c70;
                }

                .tabulator-dialog-confirm {
                    border: 1px solid #0b78c7;
                    background: #0b78c7;
                    color: #ffffff;
                }
            `;

            document.head.appendChild(style);
        },

        /*
         * تجهيز قائمة الكليك اليمين ونافذة إدراج الصفوف.
         * يتم إنشاؤهما مرة واحدة لكل شيت.
         */
        ensureStructureUi: function (elementId) {
            this.ensureStructureStyles();

            let menu = document.getElementById(
                `${elementId}-row-menu`
            );

            if (!menu) {
                menu = document.createElement("div");
                menu.id = `${elementId}-row-menu`;
                menu.className = "tabulator-row-context-menu";
                menu.hidden = true;

                const createMenuButton = function (
                    text,
                    action
                ) {
                    const button =
                        document.createElement("button");

                    button.type = "button";
                    button.textContent = text;

                    button.addEventListener(
                        "click",
                        function () {
                            window.tabulatorTest
                                .hideStructureContextMenu(
                                    elementId
                                );

                            action();
                        }
                    );

                    return button;
                };

                menu.append(
                    createMenuButton(
                        "Insert 1 Row Above",
                        function () {
                            window.tabulatorTest.insertRows(
                                elementId,
                                1,
                                "above"
                            );
                        }
                    ),
                    createMenuButton(
                        "Insert 1 Row Below",
                        function () {
                            window.tabulatorTest.insertRows(
                                elementId,
                                1,
                                "below"
                            );
                        }
                    ),
                    createMenuButton(
                        "Insert Multiple Rows…",
                        function () {
                            window.tabulatorTest
                                .openInsertDialog(
                                    elementId,
                                    "below"
                                );
                        }
                    )
                );

                const separator =
                    document.createElement("div");

                separator.className =
                    "tabulator-row-context-separator";

                menu.append(separator);

                menu.append(
                    createMenuButton(
                        "Delete Selected Rows",
                        function () {
                            window.tabulatorTest
                                .deleteSelectedRows(
                                    elementId
                                );
                        }
                    )
                );

                document.body.appendChild(menu);
            }

            let dialog = document.getElementById(
                `${elementId}-insert-dialog`
            );

            if (!dialog) {
                dialog = document.createElement("dialog");
                dialog.id = `${elementId}-insert-dialog`;
                dialog.className = "tabulator-insert-dialog";

                dialog.innerHTML = `
                    <form method="dialog" class="tabulator-insert-form">
                        <h2>Insert Rows</h2>

                        <label class="tabulator-insert-label">
                            Number of rows
                            <input
                                class="tabulator-insert-count"
                                type="number"
                                min="1"
                                max="1000"
                                step="1"
                                value="1" />
                        </label>

                        <fieldset class="tabulator-insert-position">
                            <legend>Position</legend>

                            <label>
                                <input
                                    type="radio"
                                    name="${elementId}-insert-position"
                                    value="above" />
                                Above selected row
                            </label>

                            <label>
                                <input
                                    type="radio"
                                    name="${elementId}-insert-position"
                                    value="below"
                                    checked />
                                Below selected row
                            </label>
                        </fieldset>

                        <div class="tabulator-insert-actions">
                            <button
                                type="button"
                                class="tabulator-dialog-button tabulator-dialog-cancel">
                                Cancel
                            </button>

                            <button
                                type="submit"
                                class="tabulator-dialog-button tabulator-dialog-confirm">
                                Insert
                            </button>
                        </div>
                    </form>
                `;

                const cancelButton =
                    dialog.querySelector(
                        ".tabulator-dialog-cancel"
                    );

                cancelButton.addEventListener(
                    "click",
                    function () {
                        dialog.close();
                    }
                );

                dialog
                    .querySelector("form")
                    .addEventListener(
                        "submit",
                        function (event) {
                            event.preventDefault();

                            const countInput =
                                dialog.querySelector(
                                    ".tabulator-insert-count"
                                );

                            const positionInput =
                                dialog.querySelector(
                                    `input[name="${elementId}-insert-position"]:checked`
                                );

                            const count =
                                Number.parseInt(
                                    countInput.value,
                                    10
                                );

                            const position =
                                positionInput?.value === "above"
                                    ? "above"
                                    : "below";

                            dialog.close();

                            window.tabulatorTest.insertRows(
                                elementId,
                                count,
                                position
                            );
                        }
                    );

                dialog.addEventListener(
                    "click",
                    function (event) {
                        if (event.target === dialog) {
                            dialog.close();
                        }
                    }
                );

                document.body.appendChild(dialog);
            }
        },

        hideStructureContextMenu: function (elementId) {
            const menu =
                document.getElementById(
                    `${elementId}-row-menu`
                );

            if (menu) {
                menu.hidden = true;
            }
        },

        showStructureContextMenu: function (
            elementId,
            event,
            cell
        ) {
            const table =
                this.tables[elementId];

            const state =
                this.states[elementId];

            if (!table || !state || !cell) {
                return;
            }

            const selectedRows =
                this.getSelectedRowComponents(
                    elementId
                );

            const clickedRowId =
                cell.getRow().getIndex();

            const clickedRowIsSelected =
                selectedRows.some(
                    row =>
                        String(row.getIndex()) ===
                        String(clickedRowId)
                );

            if (!clickedRowIsSelected) {
                for (const range of table.getRanges()) {
                    range.remove();
                }

                table.addRange(cell, cell);
            }

            state.activeCell = {
                rowId: clickedRowId,
                field: cell.getField()
            };

            const menu =
                document.getElementById(
                    `${elementId}-row-menu`
                );

            if (!menu) {
                return;
            }

            menu.hidden = false;

            const menuWidth = 220;
            const menuHeight = 170;

            const left = Math.min(
                event.clientX,
                window.innerWidth - menuWidth - 10
            );

            const top = Math.min(
                event.clientY,
                window.innerHeight - menuHeight - 10
            );

            menu.style.left =
                `${Math.max(8, left)}px`;

            menu.style.top =
                `${Math.max(8, top)}px`;
        },

        openInsertDialog: function (
            elementId,
            defaultPosition
        ) {
            const selectedRows =
                this.getSelectedRowComponents(
                    elementId
                );

            if (selectedRows.length === 0) {
                this.setStatus(
                    elementId,
                    "حدد أي خلية داخل الصف أولًا."
                );

                return;
            }

            this.ensureStructureUi(elementId);
            this.hideStructureContextMenu(elementId);

            const dialog =
                document.getElementById(
                    `${elementId}-insert-dialog`
                );

            if (!dialog) {
                return;
            }

            const countInput =
                dialog.querySelector(
                    ".tabulator-insert-count"
                );

            countInput.value = "1";

            const position =
                defaultPosition === "above"
                    ? "above"
                    : "below";

            const positionInput =
                dialog.querySelector(
                    `input[name="${elementId}-insert-position"][value="${position}"]`
                );

            if (positionInput) {
                positionInput.checked = true;
            }

            dialog.showModal();

            window.requestAnimationFrame(
                function () {
                    countInput.focus();
                    countInput.select();
                }
            );
        },

        /*
         * Phase 7B1 - Structural bulk delete.
         *
         * Tabulator's public deleteRow(array) removes every RowComponent one by
         * one. Without redraw blocking, each removal can request a Virtual DOM
         * rerender and force layout work. Large structural undo/delete operations
         * therefore freeze the UI even though the final result is correct.
         *
         * For very small operations the normal public path stays unchanged. From ten
         * rows onward we block redraw once, delete in bounded chunks so the browser
         * can service Blazor/WebSocket work between chunks, then restore redraw
         * exactly once. No table replacement or hidden instance rebuild is used.
         */
        structuralBulkDeleteThreshold: 10,
        structuralBulkDeleteChunkSize: 20,

        /*
         * Phase 7B4-R3 - Tabulator deleteRow(array) still performs expensive
         * per-row bookkeeping internally. For very large deletes, use the
         * existing proven full-data replacement path that already powers
         * structural Undo/Redo and the defensive correctness fallback.
         */
        structuralBulkReplaceThreshold: 500,

        yieldToBrowserTask: function () {
            /*
             * Chrome/Edge schedule the continuation of scheduler.yield() ahead of
             * ordinary queued tasks. This keeps the page responsive between delete
             * chunks without the long continuation delays seen with setTimeout(0).
             * Keep the existing timeout path as a compatibility fallback.
             */
            if (
                globalThis.scheduler &&
                typeof globalThis.scheduler.yield === "function"
            ) {
                return globalThis.scheduler.yield();
            }

            return new Promise(resolve => {
                window.setTimeout(resolve, 0);
            });
        },

        /*
         * Phase 7B1-R1 - keep Tabulator event delegation away from stale cells.
         *
         * While redraw is blocked, deleteRow removes RowComponents before the old
         * cell elements have necessarily left the DOM. A mouse event landing on
         * one of those short-lived elements makes Tabulator warn that the cell's
         * row can no longer be found. Temporarily disable pointer targeting on the
         * table holder, blur an active cell/editor, and restore interaction only
         * after restoreRedraw has had a browser task to synchronize the DOM.
         */
        lockBulkStructurePointerInteraction: function (elementId) {
            const element = document.getElementById(elementId);

            if (!element) {
                return null;
            }

            const holder = element.querySelector(
                ".tabulator-tableholder"
            );

            const activeElement = document.activeElement;

            if (
                activeElement &&
                typeof activeElement.blur === "function" &&
                element.contains(activeElement)
            ) {
                activeElement.blur();
            }

            const lock = {
                element: element,
                holder: holder,
                holderPointerEvents:
                    holder?.style.pointerEvents || "",
                holderUserSelect:
                    holder?.style.userSelect || "",
                elementCursor:
                    element.style.cursor || "",
                ariaBusy:
                    element.getAttribute("aria-busy")
            };

            if (holder) {
                holder.style.pointerEvents = "none";
                holder.style.userSelect = "none";
            }

            element.style.cursor = "progress";
            element.setAttribute("aria-busy", "true");

            return lock;
        },

        unlockBulkStructurePointerInteraction: function (lock) {
            if (!lock?.element) {
                return;
            }

            if (lock.holder) {
                lock.holder.style.pointerEvents =
                    lock.holderPointerEvents;
                lock.holder.style.userSelect =
                    lock.holderUserSelect;
            }

            lock.element.style.cursor =
                lock.elementCursor;

            if (lock.ariaBusy === null) {
                lock.element.removeAttribute("aria-busy");
            } else {
                lock.element.setAttribute(
                    "aria-busy",
                    lock.ariaBusy
                );
            }
        },

        deleteRowsWithSingleRedraw: async function (
            elementId,
            rowsToDelete,
            stageName = "structure.bulk-delete"
        ) {
            const table =
                this.tables[elementId];

            const state =
                this.states[elementId];

            const rows = Array.isArray(rowsToDelete)
                ? rowsToDelete.filter(Boolean)
                : [];

            if (!table || rows.length === 0) {
                return;
            }

            const rowCount = rows.length;
            const canBlockRedraw =
                typeof table.blockRedraw === "function" &&
                typeof table.restoreRedraw === "function";

            const shouldUseBulkPath =
                canBlockRedraw &&
                rowCount >= this.structuralBulkDeleteThreshold;

            const totalStartedAt =
                this.getPerformanceTimestamp();

            if (!shouldUseBulkPath) {
                await table.deleteRow(rows);

                this.recordPerformanceStage(
                    elementId,
                    `${stageName}.direct`,
                    totalStartedAt,
                    { rows: rowCount }
                );

                return;
            }

            const chunkSize = Math.max(
                1,
                Number(this.structuralBulkDeleteChunkSize) || 20
            );

            /*
             * Phase 7B4-R2 - large deletes keep the proven 20-row Tabulator
             * calls, but yield after every two chunks instead of every chunk.
             * This halves scheduler continuation boundaries for 500+ rows while
             * keeping each synchronous mutation window bounded.
             */
            const yieldEveryChunks =
                rowCount >= 500 ? 2 : 1;

            let redrawBlocked = false;
            let processedRows = 0;
            let completedChunks = 0;
            let pointerInteractionLock = null;

            if (state) {
                state.bulkStructureMutationActive = true;
            }

            try {
                /*
                 * Stop mouse event delegation before any RowComponent is removed.
                 * The first yield lets blur/mouseout settle while every row still
                 * exists, so Tabulator never receives an event for a stale cell.
                 */
                pointerInteractionLock =
                    this.lockBulkStructurePointerInteraction(
                        elementId
                    );

                /*
                 * Yield before entering the synchronous Tabulator delete loop.
                 * This lets the originating keydown/click handler finish and lets
                 * the browser service Blazor/WebSocket work before bulk mutation.
                 */
                await this.yieldToBrowserTask();

                table.blockRedraw();
                redrawBlocked = true;

                for (
                    let startIndex = 0;
                    startIndex < rowCount;
                    startIndex += chunkSize
                ) {
                    const chunk = rows.slice(
                        startIndex,
                        startIndex + chunkSize
                    );

                    const chunkStartedAt =
                        this.getPerformanceTimestamp();

                    await table.deleteRow(chunk);

                    processedRows += chunk.length;
                    completedChunks += 1;

                    this.recordPerformanceStage(
                        elementId,
                        `${stageName}.chunk`,
                        chunkStartedAt,
                        {
                            rows: chunk.length,
                            processedRows: processedRows,
                            totalRows: rowCount
                        }
                    );

                    if (
                        processedRows < rowCount &&
                        completedChunks % yieldEveryChunks === 0
                    ) {
                        await this.yieldToBrowserTask();
                    }
                }
            } finally {
                if (redrawBlocked) {
                    const restoreStartedAt =
                        this.getPerformanceTimestamp();

                    table.restoreRedraw();

                    this.recordPerformanceStage(
                        elementId,
                        `${stageName}.restore-redraw`,
                        restoreStartedAt,
                        { rows: rowCount }
                    );
                }

                /*
                 * restoreRedraw is synchronous, but DOM/event targeting settles at
                 * the next task boundary. Keep pointer targeting disabled until
                 * that boundary, then restore the exact previous styles.
                 */
                if (pointerInteractionLock) {
                    await this.yieldToBrowserTask();
                    this.unlockBulkStructurePointerInteraction(
                        pointerInteractionLock
                    );
                }

                if (state) {
                    state.bulkStructureMutationActive = false;
                }

                this.recordPerformanceStage(
                    elementId,
                    `${stageName}.total`,
                    totalStartedAt,
                    {
                        rows: rowCount,
                        chunkSize: chunkSize,
                        yieldEveryChunks: yieldEveryChunks,
                        processedRows: processedRows
                    }
                );
            }
        },

        displayOrderStep: 1000000000,

        rebalanceDisplayOrders: function (rows) {
            const step = this.displayOrderStep;

            rows.forEach(function (row, index) {
                row.displayOrder =
                    (index + 1) * step;
            });
        },

        allocateDisplayOrders: function (
            rows,
            insertIndex,
            count,
            allocationResult = null
        ) {
            const allocate = () => {
                const previousOrder =
                    insertIndex > 0
                        ? Number(
                            rows[insertIndex - 1]
                                ?.displayOrder
                        ) || 0
                        : 0;

                const nextOrder =
                    insertIndex < rows.length
                        ? Number(
                            rows[insertIndex]
                                ?.displayOrder
                        ) || 0
                        : null;

                if (nextOrder === null) {
                    return Array.from(
                        { length: count },
                        function (_, index) {
                            return previousOrder +
                                ((index + 1) *
                                    window.tabulatorTest
                                        .displayOrderStep);
                        }
                    );
                }

                const availableGap =
                    nextOrder - previousOrder;

                if (availableGap <= count) {
                    return null;
                }

                const interval = Math.floor(
                    availableGap / (count + 1)
                );

                if (interval < 1) {
                    return null;
                }

                return Array.from(
                    { length: count },
                    function (_, index) {
                        return previousOrder +
                            ((index + 1) * interval);
                    }
                );
            };

            let orders = allocate();

            if (orders) {
                if (allocationResult) {
                    allocationResult.rebalanced = false;
                }

                return orders;
            }

            this.rebalanceDisplayOrders(rows);

            if (allocationResult) {
                allocationResult.rebalanced = true;
            }
            orders = allocate();

            if (!orders) {
                throw new Error(
                    "Unable to allocate row display order."
                );
            }

            return orders;
        },

        createBlankRow: function (state) {
            const id = state.nextTemporaryId;
            state.nextTemporaryId--;

            return {
                id: id,
                clientKey:
                    `temp:${this.createClientKey()}`,
                displayOrder: 0,
                workOrderNumber: "",
                workTypeCode: "",
                assignmentDate: "",
                workOrderValue: "",
                partialAmount: "",
                remainingAmount: "",
                basket: "",
                status: "",
                notes: ""
            };
        },

        /*
         * إرجاع الصفوف التي يغطيها النطاق الحالي.
         * تحديد خلية واحدة يعني اختيار صفها للإدراج.
         */
        getSelectedRowComponents: function (
            elementId
        ) {
            const table =
                this.tables[elementId];

            const state =
                this.states[elementId];

            if (!table || !state) {
                return [];
            }

            const activeRange =
                this.getActiveRange(table);

            const selectedById = new Map();

            if (activeRange) {
                const matrix =
                    activeRange.getStructuredCells();

                if (Array.isArray(matrix)) {
                    for (const rowCells of matrix) {
                        if (!Array.isArray(rowCells)) {
                            continue;
                        }

                        for (const cell of rowCells) {
                            const row = cell?.getRow?.();

                            if (row) {
                                selectedById.set(
                                    String(row.getIndex()),
                                    row
                                );
                            }
                        }
                    }
                }
            }

            if (
                selectedById.size === 0 &&
                state.activeCell
            ) {
                const row =
                    table.getRow(
                        state.activeCell.rowId
                    );

                if (row) {
                    selectedById.set(
                        String(row.getIndex()),
                        row
                    );
                }
            }

            const positions = new Map();

            table
                .getRows()
                .forEach(
                    function (row, index) {
                        positions.set(
                            String(row.getIndex()),
                            index
                        );
                    }
                );

            return Array.from(
                selectedById.values()
            ).sort(
                function (first, second) {
                    return (
                        (positions.get(
                            String(first.getIndex())
                        ) ?? 0) -
                        (positions.get(
                            String(second.getIndex())
                        ) ?? 0)
                    );
                }
            );
        },

        /*
         * Common Insert path: add only the new rows to Tabulator instead of
         * replacing the full sheet. The full replacement path remains only as a
         * correctness fallback for the rare DisplayOrder rebalance case.
         */
        insertStructureRowsIncrementally: async function (
            elementId,
            insertedRows,
            anchorRowId,
            insertAbove
        ) {
            const table =
                this.tables[elementId];

            const state =
                this.states[elementId];

            if (
                !table ||
                !state ||
                !Array.isArray(insertedRows) ||
                insertedRows.length === 0
            ) {
                return false;
            }

            const anchorRow =
                table.getRow(anchorRowId);

            if (!anchorRow) {
                return false;
            }

            const rowData =
                insertedRows.map(record =>
                    this.cloneRowData(record.data));

            let affectedIdentityKeys = new Set();

            /*
             * setData used to remove the previous range as a side effect. Clear it
             * explicitly before the incremental insertion, then focusRow creates
             * the real range on the first inserted row after Tabulator finishes.
             */
            this.clearTableRanges(elementId);

            state.applyingHistory = true;

            try {
                await table.addData(
                    rowData,
                    Boolean(insertAbove),
                    anchorRow
                );

                affectedIdentityKeys =
                    this.applyStructureIdentityDelta(
                        elementId,
                        insertedRows,
                        []
                    );

                this.applyStructureDirtyDelta(
                    elementId,
                    insertedRows,
                    [],
                    []
                );
            } finally {
                state.applyingHistory = false;
            }

            this.reconcileStructureValidation(
                elementId,
                insertedRows,
                [],
                affectedIdentityKeys
            );

            this.focusRow(
                elementId,
                insertedRows[0].data.id
            );

            return true;
        },

        insertRows: async function (
            elementId,
            requestedCount,
            position
        ) {
            await this.commitActiveEditor(elementId);

            const table =
                this.tables[elementId];

            const state =
                this.states[elementId];

            if (!table || !state) {
                return;
            }

            if (state.bulkStructureMutationActive) {
                this.setStatus(
                    elementId,
                    "انتظر حتى تنتهي عملية الصفوف الحالية."
                );

                return;
            }

            const selectedRows =
                this.getSelectedRowComponents(
                    elementId
                );

            if (selectedRows.length === 0) {
                this.setStatus(
                    elementId,
                    "حدد أي خلية داخل الصف أولًا."
                );

                return;
            }

            const count = Math.min(
                1000,
                Math.max(
                    1,
                    Number.parseInt(
                        requestedCount,
                        10
                    ) || 1
                )
            );

            const currentData =
                table
                    .getData()
                    .map(
                        row =>
                            this.cloneRowData(row)
                    );

            const positionsById = new Map();

            currentData.forEach(
                function (row, index) {
                    positionsById.set(
                        String(row.id),
                        index
                    );
                }
            );

            const selectedPositions =
                selectedRows
                    .map(
                        row =>
                            positionsById.get(
                                String(row.getIndex())
                            )
                    )
                    .filter(
                        index =>
                            Number.isInteger(index)
                    );

            if (selectedPositions.length === 0) {
                this.setStatus(
                    elementId,
                    "تعذر تحديد موضع الصف."
                );

                return;
            }

            const insertIndex =
                position === "above"
                    ? Math.min(...selectedPositions)
                    : Math.max(...selectedPositions) + 1;

            const allocationResult = {
                rebalanced: false
            };

            const displayOrders =
                this.allocateDisplayOrders(
                    currentData,
                    insertIndex,
                    count,
                    allocationResult
                );

            const rebalancedRowIds =
                allocationResult.rebalanced
                    ? currentData.map(row => row.id)
                    : [];

            const insertedRows = [];

            for (
                let index = 0;
                index < count;
                index++
            ) {
                const data =
                    this.createBlankRow(state);

                data.displayOrder =
                    displayOrders[index];

                insertedRows.push({
                    index: insertIndex + index,
                    data: this.cloneRowData(data)
                });
            }

            const anchorRowId =
                position === "above"
                    ? selectedRows[0].getIndex()
                    : selectedRows[
                        selectedRows.length - 1
                    ].getIndex();

            let insertedIncrementally = false;

            if (!allocationResult.rebalanced) {
                insertedIncrementally =
                    await this
                        .insertStructureRowsIncrementally(
                            elementId,
                            insertedRows,
                            anchorRowId,
                            position === "above"
                        );
            }

            if (!insertedIncrementally) {
                /*
                 * A DisplayOrder rebalance changes existing rows too, so that
                 * rare case still uses the proven full-sheet path. The same
                 * fallback also protects correctness if the anchor row vanished
                 * before the asynchronous insert started.
                 */
                currentData.splice(
                    insertIndex,
                    0,
                    ...insertedRows.map(
                        record =>
                            this.cloneRowData(record.data)
                    )
                );

                await this.replaceStructureData(
                    elementId,
                    currentData,
                    insertedRows[0].data.id,
                    {
                        insertedRows: insertedRows,
                        removedRows: [],
                        additionalDirtyRowIds:
                            rebalancedRowIds
                    }
                );
            }

            this.pushStructureTransaction(
                elementId,
                {
                    kind: "structure",
                    action: "insert",
                    label:
                        count === 1
                            ? "إضافة صف"
                            : `إضافة ${count.toLocaleString()} صفوف`,
                    rows: insertedRows
                }
            );
        },

        /*
         * Common Delete path: remove only the selected RowComponents from
         * Tabulator. Identity, dirty/deleted state, validation, filters, and
         * focus are then reconciled by delta without rebuilding the full sheet.
         */
        deleteStructureRowsIncrementally: async function (
            elementId,
            deletedRows,
            focusRowId
        ) {
            const table =
                this.tables[elementId];

            const state =
                this.states[elementId];

            if (
                !table ||
                !state ||
                !Array.isArray(deletedRows) ||
                deletedRows.length === 0
            ) {
                return false;
            }

            const lookup =
                this.createStructureRowLookup(table);

            const rowsToDelete = [];
            const seenRows = new Set();

            for (const record of deletedRows) {
                const rowData =
                    this.getStructureRowData(record);

                const row =
                    this.findStructureRowComponent(
                        lookup,
                        rowData
                    );

                if (!row || seenRows.has(row)) {
                    return false;
                }

                seenRows.add(row);
                rowsToDelete.push(row);
            }

            let affectedIdentityKeys = new Set();

            /*
             * The selected range can contain cells that are about to leave the
             * Virtual DOM. Remove it before deleteRow so the next mouse click never
             * inherits a native range that points to a detached element.
             */
            this.clearTableRanges(elementId);
            state.activeCell = null;

            state.applyingHistory = true;

            try {
                await this.deleteRowsWithSingleRedraw(
                    elementId,
                    rowsToDelete,
                    "structure.delete-rows"
                );

                affectedIdentityKeys =
                    this.applyStructureIdentityDelta(
                        elementId,
                        [],
                        deletedRows
                    );

                this.applyStructureDirtyDelta(
                    elementId,
                    [],
                    deletedRows,
                    []
                );
            } finally {
                state.applyingHistory = false;
            }

            this.reconcileStructureValidation(
                elementId,
                [],
                deletedRows,
                affectedIdentityKeys
            );

            window.tabulatorFilters
                .refreshFields(
                    this,
                    elementId,
                    [
                        "workOrderNumber",
                        "workTypeCode",
                        "assignmentDate",
                        "basket"
                    ]
                );

            if (
                focusRowId !== null &&
                focusRowId !== undefined
            ) {
                this.focusRow(
                    elementId,
                    focusRowId
                );
            }

            return true;
        },

        deleteSelectedRows: async function (elementId) {
            await this.commitActiveEditor(elementId);

            const table =
                this.tables[elementId];

            const state =
                this.states[elementId];

            if (!table || !state) {
                return;
            }

            if (state.bulkStructureMutationActive) {
                this.setStatus(
                    elementId,
                    "انتظر حتى تنتهي عملية الصفوف الحالية."
                );

                return;
            }

            const selectedRows =
                this.getSelectedRowComponents(
                    elementId
                );

            if (selectedRows.length === 0) {
                this.setStatus(
                    elementId,
                    "حدد خلية أو نطاق صفوف أولًا."
                );

                return;
            }

            const count =
                selectedRows.length;

            const confirmed = window.confirm(
                count === 1
                    ? "هل تريد حذف الصف المحدد؟"
                    : `هل تريد حذف ${count.toLocaleString()} صفوف محددة؟`
            );

            if (!confirmed) {
                return;
            }

            /*
             * Keep only lightweight row components for the 3,000-row scan. Clone
             * data for selected rows only; the old path cloned the whole sheet.
             */
            const allRows =
                table.getRows();

            const positionsById = new Map();

            allRows.forEach(
                function (row, index) {
                    positionsById.set(
                        String(row.getIndex()),
                        index
                    );
                }
            );

            const selectedIds = new Set(
                selectedRows.map(row =>
                    String(row.getIndex()))
            );

            const deletedRows =
                selectedRows
                    .map(row => {
                        const index =
                            positionsById.get(
                                String(row.getIndex())
                            );

                        if (!Number.isInteger(index)) {
                            return null;
                        }

                        return {
                            index: index,
                            data: this.cloneRowData(
                                row.getData()
                            )
                        };
                    })
                    .filter(Boolean)
                    .sort(
                        (first, second) =>
                            first.index - second.index
                    );

            if (deletedRows.length === 0) {
                return;
            }

            const remainingRowIds =
                allRows
                    .filter(row =>
                        !selectedIds.has(
                            String(row.getIndex())
                        ))
                    .map(row => row.getIndex());

            const focusIndex = Math.min(
                deletedRows[0].index,
                remainingRowIds.length - 1
            );

            const focusRowId =
                focusIndex >= 0
                    ? remainingRowIds[focusIndex]
                    : null;

            const shouldUseBulkReplace =
                deletedRows.length >=
                this.structuralBulkReplaceThreshold;

            let deletedIncrementally = false;

            if (!shouldUseBulkReplace) {
                deletedIncrementally =
                    await this
                        .deleteStructureRowsIncrementally(
                            elementId,
                            deletedRows,
                            focusRowId
                        );
            }

            if (!deletedIncrementally) {
                /*
                 * For 500+ rows, avoid Tabulator's expensive per-row delete
                 * bookkeeping and use the existing proven full-sheet replacement
                 * path. The same path remains the defensive correctness fallback
                 * if an incremental RowComponent disappears before deletion.
                 */
                const replaceStartedAt =
                    this.getPerformanceTimestamp();

                const remainingData =
                    allRows
                        .filter(row =>
                            !selectedIds.has(
                                String(row.getIndex())
                            ))
                        .map(row =>
                            this.cloneRowData(
                                row.getData()
                            ));

                await this.replaceStructureData(
                    elementId,
                    remainingData,
                    focusRowId,
                    {
                        insertedRows: [],
                        removedRows: deletedRows,
                        additionalDirtyRowIds: []
                    }
                );

                this.recordPerformanceStage(
                    elementId,
                    "structure.delete-replace-data",
                    replaceStartedAt,
                    {
                        rows: deletedRows.length,
                        remainingRows: remainingData.length,
                        reason: shouldUseBulkReplace
                            ? "bulk-threshold"
                            : "incremental-fallback"
                    }
                );
            }

            this.pushStructureTransaction(
                elementId,
                {
                    kind: "structure",
                    action: "delete",
                    label:
                        deletedRows.length === 1
                            ? "حذف صف"
                            : `حذف ${deletedRows.length.toLocaleString()} صفوف`,
                    rows: deletedRows
                }
            );
        },

        pushStructureTransaction: function (
            elementId,
            transaction
        ) {
            const state =
                this.states[elementId];

            if (
                !state ||
                !transaction?.rows?.length
            ) {
                return;
            }

            state.undoStack.push(transaction);

            if (
                state.undoStack.length >
                state.maxTransactions
            ) {
                state.undoStack.shift();
            }

            state.redoStack = [];

            this.renderStatus(elementId);

            this.setStatus(
                elementId,
                `${transaction.label}. التراجع المتاح: ${state.undoStack.length}.`
            );
        },

        /*
         * Restore contiguous structural rows without replacing the full sheet.
         * Structural selections are contiguous in the current grid model. An old
         * or malformed transaction falls back to the proven full-sheet path.
         */
        restoreStructureRowsIncrementally: async function (
            elementId,
            restoredRows,
            focusRowId
        ) {
            const table =
                this.tables[elementId];

            const state =
                this.states[elementId];

            if (
                !table ||
                !state ||
                !Array.isArray(restoredRows) ||
                restoredRows.length === 0
            ) {
                return false;
            }

            const orderedRows =
                Array.from(restoredRows)
                    .filter(record =>
                        Number.isInteger(record?.index) &&
                        this.getStructureRowData(record))
                    .sort(
                        (first, second) =>
                            first.index - second.index
                    );

            if (orderedRows.length !== restoredRows.length) {
                return false;
            }

            const firstIndex =
                orderedRows[0].index;

            const isContiguous =
                orderedRows.every(
                    (record, offset) =>
                        record.index === firstIndex + offset
                );

            if (!isContiguous) {
                return false;
            }

            const lookup =
                this.createStructureRowLookup(table);

            for (const record of orderedRows) {
                const rowData =
                    this.getStructureRowData(record);

                if (
                    this.findStructureRowComponent(
                        lookup,
                        rowData
                    )
                ) {
                    return false;
                }
            }

            const currentRows = lookup.rows;

            const insertionIndex = Math.min(
                Math.max(0, firstIndex),
                currentRows.length
            );

            const rowData =
                orderedRows.map(record =>
                    this.cloneRowData(
                        this.getStructureRowData(record)
                    ));

            this.clearTableRanges(elementId);
            state.activeCell = null;

            let affectedIdentityKeys = new Set();

            state.applyingHistory = true;

            try {
                if (currentRows.length === 0) {
                    await table.addData(rowData);
                } else if (insertionIndex < currentRows.length) {
                    await table.addData(
                        rowData,
                        true,
                        currentRows[insertionIndex]
                    );
                } else {
                    await table.addData(
                        rowData,
                        false,
                        currentRows[currentRows.length - 1]
                    );
                }

                affectedIdentityKeys =
                    this.applyStructureIdentityDelta(
                        elementId,
                        orderedRows,
                        []
                    );

                this.applyStructureDirtyDelta(
                    elementId,
                    orderedRows,
                    [],
                    []
                );
            } finally {
                state.applyingHistory = false;
            }

            this.reconcileStructureValidation(
                elementId,
                orderedRows,
                [],
                affectedIdentityKeys
            );

            window.tabulatorFilters
                .refreshFields(
                    this,
                    elementId,
                    [
                        "workOrderNumber",
                        "workTypeCode",
                        "assignmentDate",
                        "basket"
                    ]
                );

            const firstRestoredRow =
                this.getStructureRowData(orderedRows[0]);

            const nextFocusRowId =
                focusRowId ?? firstRestoredRow?.id;

            if (
                nextFocusRowId !== null &&
                nextFocusRowId !== undefined
            ) {
                this.focusRow(
                    elementId,
                    nextFocusRowId
                );
            }

            return true;
        },

        applyStructureTransaction: async function (
            elementId,
            transaction,
            direction
        ) {
            const table =
                this.tables[elementId];

            if (
                !table ||
                !transaction?.rows?.length
            ) {
                return;
            }

            const shouldInsert =
                (
                    transaction.action === "insert" &&
                    direction === "redo"
                ) ||
                (
                    transaction.action === "delete" &&
                    direction === "undo"
                );

            const orderedTransactionRows =
                Array.from(transaction.rows)
                    .filter(record =>
                        Number.isInteger(record?.index) &&
                        this.getStructureRowData(record))
                    .sort(
                        (first, second) =>
                            first.index - second.index
                    );

            if (
                orderedTransactionRows.length !==
                transaction.rows.length
            ) {
                return;
            }

            const firstTransactionIndex =
                orderedTransactionRows[0].index;

            const transactionRowsAreContiguous =
                orderedTransactionRows.every(
                    (record, offset) =>
                        record.index ===
                        firstTransactionIndex + offset
                );

            const shouldUseBulkRestoreReplace =
                shouldInsert &&
                transactionRowsAreContiguous &&
                orderedTransactionRows.length >=
                    this.structuralBulkReplaceThreshold;

            if (shouldUseBulkRestoreReplace) {
                /*
                 * Restoring hundreds or thousands of rows through addData makes
                 * Tabulator run expensive per-row insertion bookkeeping. The
                 * large-delete path already proved that rebuilding the final data
                 * once through setData is substantially faster and preserves the
                 * same identity, dirty-state, validation, filter, and focus
                 * reconciliation performed by replaceStructureData.
                 */
                const restoreReplaceStartedAt =
                    this.getPerformanceTimestamp();

                const currentData =
                    table
                        .getData()
                        .map(row =>
                            this.cloneRowData(row));

                const insertionIndex = Math.min(
                    Math.max(0, firstTransactionIndex),
                    currentData.length
                );

                const restoredData =
                    orderedTransactionRows.map(record =>
                        this.cloneRowData(
                            this.getStructureRowData(record)
                        ));

                const nextData = [
                    ...currentData.slice(0, insertionIndex),
                    ...restoredData,
                    ...currentData.slice(insertionIndex)
                ];

                const focusRowId =
                    restoredData[0]?.id ?? null;

                await this.replaceStructureData(
                    elementId,
                    nextData,
                    focusRowId,
                    {
                        insertedRows:
                            orderedTransactionRows,
                        removedRows: [],
                        additionalDirtyRowIds: []
                    }
                );

                this.recordPerformanceStage(
                    elementId,
                    "structure.restore-replace-data",
                    restoreReplaceStartedAt,
                    {
                        rows:
                            orderedTransactionRows.length,
                        existingRows: currentData.length,
                        finalRows: nextData.length,
                        reason: "bulk-threshold"
                    }
                );

                return;
            }

            const shouldUseBulkRemoveReplace =
                !shouldInsert &&
                orderedTransactionRows.length >=
                    this.structuralBulkReplaceThreshold;

            if (shouldUseBulkRemoveReplace) {
                /*
                 * Redoing a large delete must use the same full-data replacement
                 * strategy as the original bulk delete. Falling back to the
                 * incremental RowComponent path makes Redo repeat thousands of
                 * per-row delete operations even though the final data set can be
                 * composed once and applied through setData.
                 */
                const removeReplaceStartedAt =
                    this.getPerformanceTimestamp();

                const currentData =
                    table
                        .getData()
                        .map(row =>
                            this.cloneRowData(row));

                const transactionIds = new Set();
                const transactionClientKeys = new Set();

                for (const record of orderedTransactionRows) {
                    const rowData =
                        this.getStructureRowData(record);

                    transactionIds.add(
                        String(rowData.id)
                    );

                    const clientKey = String(
                        rowData.clientKey ?? ""
                    ).trim();

                    if (clientKey) {
                        transactionClientKeys.add(
                            clientKey
                        );
                    }
                }

                const matchesBulkTransactionRow =
                    rowData => {
                        const clientKey = String(
                            rowData?.clientKey ?? ""
                        ).trim();

                        if (clientKey) {
                            return transactionClientKeys
                                .has(clientKey);
                        }

                        return transactionIds.has(
                            String(rowData?.id)
                        );
                    };

                const nextData =
                    currentData.filter(row =>
                        !matchesBulkTransactionRow(row));

                const removedCount =
                    currentData.length - nextData.length;

                if (
                    removedCount ===
                    orderedTransactionRows.length
                ) {
                    const focusIndex = Math.min(
                        firstTransactionIndex,
                        nextData.length - 1
                    );

                    const focusRowId =
                        focusIndex >= 0
                            ? nextData[focusIndex].id
                            : null;

                    await this.replaceStructureData(
                        elementId,
                        nextData,
                        focusRowId,
                        {
                            insertedRows: [],
                            removedRows:
                                orderedTransactionRows,
                            additionalDirtyRowIds: []
                        }
                    );

                    this.recordPerformanceStage(
                        elementId,
                        "structure.remove-replace-data",
                        removeReplaceStartedAt,
                        {
                            rows:
                                orderedTransactionRows.length,
                            existingRows:
                                currentData.length,
                            finalRows: nextData.length,
                            direction: direction,
                            transactionAction:
                                transaction.action,
                            reason: "bulk-threshold"
                        }
                    );

                    return;
                }
            }

            if (shouldInsert) {
                const focusRowId =
                    this.getStructureRowData(
                        orderedTransactionRows[0]
                    )?.id ?? null;

                const restoredIncrementally =
                    await this
                        .restoreStructureRowsIncrementally(
                            elementId,
                            orderedTransactionRows,
                            focusRowId
                        );

                if (restoredIncrementally) {
                    return;
                }
            } else {
                const lookup =
                    this.createStructureRowLookup(table);

                const rowsToRemove = [];
                const rowsToRemoveSet = new Set();

                for (const record of orderedTransactionRows) {
                    const row =
                        this.findStructureRowComponent(
                            lookup,
                            this.getStructureRowData(record)
                        );

                    if (!row || rowsToRemoveSet.has(row)) {
                        rowsToRemove.length = 0;
                        break;
                    }

                    rowsToRemove.push(row);
                    rowsToRemoveSet.add(row);
                }

                if (
                    rowsToRemove.length ===
                    orderedTransactionRows.length
                ) {
                    const firstIndex =
                        orderedTransactionRows[0].index;

                    const remainingRows =
                        lookup.rows.filter(row =>
                            !rowsToRemoveSet.has(row));

                    const focusIndex = Math.min(
                        firstIndex,
                        remainingRows.length - 1
                    );

                    const focusRowId =
                        focusIndex >= 0
                            ? remainingRows[focusIndex].getIndex()
                            : null;

                    const removedIncrementally =
                        await this
                            .deleteStructureRowsIncrementally(
                                elementId,
                                orderedTransactionRows,
                                focusRowId
                            );

                    if (removedIncrementally) {
                        return;
                    }
                }
            }

            /*
             * Defensive fallback for an old/non-contiguous transaction or an
             * unexpected row-state mismatch. This path preserves correctness and
             * is the only structural-history path that replaces the full sheet.
             */
            const data =
                table
                    .getData()
                    .map(
                        row =>
                            this.cloneRowData(row)
                    );

            const transactionIds = new Set();
            const transactionClientKeys = new Set();

            for (const record of orderedTransactionRows) {
                const rowData =
                    this.getStructureRowData(record);

                transactionIds.add(String(rowData.id));

                const clientKey = String(
                    rowData.clientKey ?? ""
                ).trim();

                if (clientKey) {
                    transactionClientKeys.add(clientKey);
                }
            }

            const matchesTransactionRow = rowData => {
                const clientKey = String(
                    rowData?.clientKey ?? ""
                ).trim();

                if (clientKey) {
                    return transactionClientKeys.has(clientKey);
                }

                return transactionIds.has(
                    String(rowData?.id)
                );
            };

            let nextData;
            let focusRowId = null;

            if (shouldInsert) {
                nextData = data;

                for (const record of orderedTransactionRows) {
                    nextData.splice(
                        Math.min(
                            record.index,
                            nextData.length
                        ),
                        0,
                        this.cloneRowData(
                            this.getStructureRowData(record)
                        )
                    );
                }

                focusRowId =
                    this.getStructureRowData(
                        orderedTransactionRows[0]
                    )?.id ?? null;
            } else {
                const firstIndex =
                    orderedTransactionRows[0].index;

                nextData =
                    data.filter(row =>
                        !matchesTransactionRow(row));

                const focusIndex = Math.min(
                    firstIndex,
                    nextData.length - 1
                );

                focusRowId =
                    focusIndex >= 0
                        ? nextData[focusIndex].id
                        : null;
            }

            await this.replaceStructureData(
                elementId,
                nextData,
                focusRowId,
                {
                    insertedRows:
                        shouldInsert
                            ? orderedTransactionRows
                            : [],
                    removedRows:
                        shouldInsert
                            ? []
                            : orderedTransactionRows,
                    additionalDirtyRowIds: []
                }
            );
        },

        replaceStructureData: async function (
            elementId,
            data,
            focusRowId,
            structureChange = {}
        ) {
            const table =
                this.tables[elementId];

            const state =
                this.states[elementId];

            if (!table || !state) {
                return;
            }

            const insertedRows = Array.from(
                structureChange.insertedRows ?? []
            );
            const removedRows = Array.from(
                structureChange.removedRows ?? []
            );
            const additionalDirtyRowIds = Array.from(
                structureChange.additionalDirtyRowIds ?? []
            );

            let affectedIdentityKeys = new Set();

            state.applyingHistory = true;

            try {
                await table.setData(data);

                affectedIdentityKeys =
                    this.applyStructureIdentityDelta(
                        elementId,
                        insertedRows,
                        removedRows
                    );

                window.tabulatorFilters.apply(
                    this,
                    elementId
                );

                this.applyStructureDirtyDelta(
                    elementId,
                    insertedRows,
                    removedRows,
                    additionalDirtyRowIds
                );
            } finally {
                state.applyingHistory = false;
            }

            this.reconcileStructureValidation(
                elementId,
                insertedRows,
                removedRows,
                affectedIdentityKeys
            );

            if (
                focusRowId !== null &&
                focusRowId !== undefined
            ) {
                this.focusRow(
                    elementId,
                    focusRowId
                );
            }
        },
    });
})();
