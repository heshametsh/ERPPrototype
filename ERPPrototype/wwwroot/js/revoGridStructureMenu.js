import { REVO_GRID_STRUCTURE_COMMANDS } from "./revoGridStructureCommands.js";

const STYLE_ID = "erp-revogrid-structure-menu-style";
const MENU_CLASS = "erp-revo-structure-menu";
const DIALOG_CLASS = "erp-revo-structure-dialog";
const MAX_INSERT_ROWS = 1000;
const MAX_INSERT_COLUMNS = 1000;
const VALID_COLUMN_TYPES = ["Text", "Money", "Date", "Number"];

function injectStyles() {
    if (document.getElementById(STYLE_ID)) {
        return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        .${MENU_CLASS} {
            position: fixed;
            z-index: 10050;
            width: 220px;
            padding: 6px;
            border: 1px solid #b9c8d4;
            border-radius: 9px;
            background: #fff;
            box-shadow: 0 14px 34px rgba(15, 42, 70, .20);
            direction: ltr;
            font-family: "Segoe UI", Tahoma, Arial, sans-serif;
        }
        .${MENU_CLASS}[hidden], .${DIALOG_CLASS}[hidden] { display: none !important; }
        .${MENU_CLASS} button {
            width: 100%;
            border: 0;
            background: transparent;
            padding: 9px 11px;
            text-align: left;
            border-radius: 6px;
            cursor: pointer;
            color: #173047;
            font: inherit;
            font-size: .88rem;
            font-weight: 650;
        }
        .${MENU_CLASS} button:hover:not(:disabled) { background: #eef7fc; color: #0b5f95; }
        .${MENU_CLASS} button[data-danger="true"] { color: #a52a2a; }
        .${MENU_CLASS}__separator { height: 1px; background: #dce5eb; margin: 5px 3px; }
        .${DIALOG_CLASS} {
            position: fixed;
            inset: 0;
            z-index: 10100;
            display: grid;
            place-items: center;
            padding: 20px;
            background: rgba(15, 42, 70, .18);
            direction: ltr;
            font-family: "Segoe UI", Tahoma, Arial, sans-serif;
        }
        .${DIALOG_CLASS}__card {
            width: min(520px, calc(100vw - 32px));
            max-height: min(720px, calc(100vh - 40px));
            overflow: auto;
            padding: 16px;
            border: 1px solid #b9c8d4;
            background: #fff;
            border-radius: 10px;
            box-shadow: 0 18px 42px rgba(15, 42, 70, .22);
        }
        .${DIALOG_CLASS}__title { margin: 0 0 12px; color: #173047; font-size: 1rem; font-weight: 700; }
        .${DIALOG_CLASS} label { display: block; margin: 10px 0 5px; }
        .${DIALOG_CLASS} input[type="number"],
        .${DIALOG_CLASS} input[type="text"],
        .${DIALOG_CLASS} select {
            width: 100%;
            box-sizing: border-box;
            min-height: 36px;
            border: 1px solid #aebfcb;
            border-radius: 7px;
            padding: 8px 10px;
            font: inherit;
        }
        .${DIALOG_CLASS}__section-label {
            margin: 2px 0 7px;
            color: #173047;
            font-size: .9rem;
            font-weight: 650;
        }
        .${DIALOG_CLASS} .${DIALOG_CLASS}__scope {
            display: flex;
            gap: 10px;
            align-items: center;
            min-height: 40px;
            margin: 8px 0;
            padding: 9px 11px;
            box-sizing: border-box;
            border: 1px solid #cbd7df;
            border-radius: 7px;
            background: #fff;
            color: #173047;
            cursor: pointer;
        }
        .${DIALOG_CLASS} .${DIALOG_CLASS}__scope:hover:not([data-disabled="true"]) {
            background: #f5fafc;
            border-color: #9db9ca;
        }
        .${DIALOG_CLASS} .${DIALOG_CLASS}__scope[data-selected="true"] {
            background: #eef7fc;
            border-color: #0b6d9f;
            box-shadow: inset 3px 0 0 #0b6d9f;
        }
        .${DIALOG_CLASS} .${DIALOG_CLASS}__scope[data-disabled="true"] {
            background: #f7f9fa;
            color: #778692;
            cursor: default;
        }
        .${DIALOG_CLASS} .${DIALOG_CLASS}__scope input[type="radio"] {
            width: 16px;
            height: 16px;
            flex: 0 0 16px;
            margin: 0;
            accent-color: #0b6d9f;
        }
        .${DIALOG_CLASS}__scope span { line-height: 1.35; }
        .${DIALOG_CLASS}__note {
            margin: 11px 0 0;
            padding: 9px 11px;
            border-radius: 7px;
            background: #f7f9fa;
            color: #4b6171;
            font-size: .86rem;
            line-height: 1.45;
        }
        .${DIALOG_CLASS}__error { min-height: 22px; margin-top: 8px; color: #b42318; }
        .${DIALOG_CLASS}__actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            margin-top: 14px;
        }
        .${DIALOG_CLASS}__actions button {
            min-height: 36px;
            padding: 6px 12px;
            border: 1px solid #b9c8d4;
            border-radius: 7px;
            background: #fff;
            color: #173047;
            cursor: pointer;
            font: inherit;
        }
        .${DIALOG_CLASS}__actions button[data-primary="true"] {
            border-color: #0b5f95;
            background: #0b5f95;
            color: #fff;
        }
        .${DIALOG_CLASS}__actions button[data-danger="true"] {
            border-color: #a52a2a;
            background: #a52a2a;
            color: #fff;
        }
        .${DIALOG_CLASS}__column-specs { margin-top: 12px; display: grid; gap: 8px; }
        .${DIALOG_CLASS}__column-spec {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 160px;
            gap: 8px;
            align-items: end;
        }
        .${DIALOG_CLASS}__column-spec label { margin: 0; }
    `;
    document.head.appendChild(style);
}

function waitForContextMenuFocusToSettle() {
    return new Promise(resolve => {
        if (typeof window.requestAnimationFrame !== "function") {
            window.setTimeout(resolve, 0);
            return;
        }

        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(resolve);
        });
    });
}

function positionMenu(menu, x, y) {
    menu.hidden = false;
    menu.style.left = "0px";
    menu.style.top = "0px";
    const rect = menu.getBoundingClientRect();
    const margin = 8;
    const left = Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin));
    const top = Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin));
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
}

function pointerCellFromEvent(event) {
    const path = typeof event?.composedPath === "function" ? event.composedPath() : [];
    let rowIndex = null;
    let colIndex = null;

    for (const node of path) {
        if (rowIndex === null) {
            const raw = node?.dataset?.rgrow ?? node?.dataset?.rgRow;
            const value = Number(raw);
            if (raw !== undefined && Number.isInteger(value) && value >= 0) {
                rowIndex = value;
            }
        }
        if (colIndex === null) {
            const raw = node?.dataset?.rgcol ?? node?.dataset?.rgCol;
            const value = Number(raw);
            if (raw !== undefined && Number.isInteger(value) && value >= 0) {
                colIndex = value;
            }
        }
        if (rowIndex !== null && colIndex !== null) {
            break;
        }
    }

    return {
        rowIndex,
        colIndex,
        colType: "rgCol",
        rowType: "rgRow"
    };
}

function makeMenuButton(label, action, danger = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    if (danger) {
        button.dataset.danger = "true";
    }
    button.addEventListener("click", action);
    return button;
}

function createDialog(title) {
    const dialog = document.createElement("div");
    dialog.className = DIALOG_CLASS;
    dialog.hidden = true;
    dialog.innerHTML = `
        <div class="${DIALOG_CLASS}__card" role="dialog" aria-modal="true">
            <h3 class="${DIALOG_CLASS}__title"></h3>
            <div data-body></div>
            <div class="${DIALOG_CLASS}__error" data-error aria-live="polite"></div>
            <div class="${DIALOG_CLASS}__actions" data-actions></div>
        </div>`;
    dialog.querySelector(`.${DIALOG_CLASS}__title`).textContent = title;
    return dialog;
}

function button(label, action, options = {}) {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = label;
    if (options.primary) element.dataset.primary = "true";
    if (options.danger) element.dataset.danger = "true";
    element.addEventListener("click", action);
    return element;
}

function syncScopeSelection(container, radioName) {
    for (const option of container.querySelectorAll(`.${DIALOG_CLASS}__scope`)) {
        const radio = option.querySelector(`input[type="radio"][name="${radioName}"]`);
        option.dataset.selected = radio?.checked ? "true" : "false";
    }
}

export function createRevoGridStructureMenu(options) {
    const grid = options?.grid;
    const structureCommands = options?.structureCommands;

    if (!grid || typeof grid.addEventListener !== "function") {
        throw new Error("A compatible RevoGrid element is required.");
    }
    if (!structureCommands?.captureContext || !structureCommands?.execute) {
        throw new Error("Structure Menu requires the shared Structure Commands owner.");
    }

    injectStyles();

    let destroyed = false;
    let menuContext = null;
    let pendingContext = null;
    let contextMenuSequence = 0;
    const removers = [];

    const menu = document.createElement("div");
    menu.className = MENU_CLASS;
    menu.hidden = true;

    const insertRowsDialog = createDialog("Insert Rows");
    const deleteRowsDialog = createDialog("Delete Rows");
    const insertColumnsDialog = createDialog("Insert Columns");
    const deleteColumnsDialog = createDialog("Delete Columns");

    function addListener(target, type, handler, listenerOptions) {
        target.addEventListener(type, handler, listenerOptions);
        removers.push(() => target.removeEventListener(type, handler, listenerOptions));
    }

    function closeMenu() {
        menu.hidden = true;
        menuContext = null;
    }

    function closeDialog(dialog) {
        dialog.hidden = true;
        const error = dialog.querySelector("[data-error]");
        if (error) error.textContent = "";
    }

    function closeAllDialogs() {
        closeDialog(insertRowsDialog);
        closeDialog(deleteRowsDialog);
        closeDialog(insertColumnsDialog);
        closeDialog(deleteColumnsDialog);
    }

    async function captureContext(clickedCell) {
        return structureCommands.captureContext(clickedCell);
    }

    function showDialog(dialog) {
        closeMenu();
        closeAllDialogs();
        dialog.hidden = false;
    }

    async function openInsertRowsDialog() {
        const context = menuContext;
        if (!context) return;
        const body = insertRowsDialog.querySelector("[data-body]");
        const actions = insertRowsDialog.querySelector("[data-actions]");
        const error = insertRowsDialog.querySelector("[data-error]");
        body.replaceChildren();
        actions.replaceChildren();
        error.textContent = "";

        const label = document.createElement("label");
        label.textContent = "Number of rows";
        const input = document.createElement("input");
        input.type = "number";
        input.min = "1";
        input.max = String(MAX_INSERT_ROWS);
        input.step = "1";
        input.value = "1";
        input.inputMode = "numeric";
        label.append(input);
        body.append(label);

        const submit = async position => {
            const count = Number(input.value);
            if (!Number.isInteger(count) || count < 1 || count > MAX_INSERT_ROWS) {
                error.textContent = `Enter a whole number from 1 to ${MAX_INSERT_ROWS}.`;
                input.focus();
                return;
            }

            try {
                await structureCommands.execute(
                    REVO_GRID_STRUCTURE_COMMANDS.INSERT_ROWS,
                    context,
                    { position, count }
                );
                closeDialog(insertRowsDialog);
            } catch (exception) {
                error.textContent = exception?.message || "Unable to insert rows.";
            }
        };

        actions.append(
            button("Cancel", () => closeDialog(insertRowsDialog)),
            button("Insert Above", () => void submit("above"), { primary: true }),
            button("Insert Below", () => void submit("below"), { primary: true })
        );
        showDialog(insertRowsDialog);
        queueMicrotask(() => { input.focus(); input.select(); });
    }

    async function openDeleteRowsDialog() {
        const context = menuContext;
        if (!context) return;
        const body = deleteRowsDialog.querySelector("[data-body]");
        const actions = deleteRowsDialog.querySelector("[data-actions]");
        const error = deleteRowsDialog.querySelector("[data-error]");
        body.replaceChildren();
        actions.replaceChildren();
        error.textContent = "";

        const rowDelete = await structureCommands.describeRowDelete(context);
        const scopes = [
            { value: "current", label: rowDelete.currentCount ? "Current Row — 1" : "Current Row — unavailable", enabled: rowDelete.currentCount > 0 },
            { value: "selection", label: `Rows in Selection — ${rowDelete.selectionCount.toLocaleString()}`, enabled: rowDelete.selectionCount > 0 }
        ];
        let selectedScope = rowDelete.selectionCount > 0
            ? "selection"
            : scopes.find(scope => scope.enabled)?.value ?? null;

        const scopeTitle = document.createElement("div");
        scopeTitle.className = `${DIALOG_CLASS}__section-label`;
        scopeTitle.textContent = "Delete scope";
        body.append(scopeTitle);

        for (const scope of scopes) {
            const label = document.createElement("label");
            label.className = `${DIALOG_CLASS}__scope`;
            label.dataset.disabled = scope.enabled ? "false" : "true";
            label.dataset.selected = scope.value === selectedScope ? "true" : "false";
            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = "erp-delete-row-scope";
            radio.value = scope.value;
            radio.disabled = !scope.enabled;
            radio.checked = scope.value === selectedScope;
            radio.addEventListener("change", () => {
                selectedScope = scope.value;
                syncScopeSelection(body, radio.name);
            });
            const text = document.createElement("span");
            text.textContent = scope.label;
            label.append(radio, text);
            body.append(label);
        }

        const submit = async () => {
            try {
                await structureCommands.execute(
                    REVO_GRID_STRUCTURE_COMMANDS.DELETE_ROWS,
                    context,
                    { scope: selectedScope }
                );
                closeDialog(deleteRowsDialog);
            } catch (exception) {
                error.textContent = exception?.message || "Unable to delete rows.";
            }
        };

        actions.append(
            button("Cancel", () => closeDialog(deleteRowsDialog)),
            button("Delete", () => void submit(), { danger: true })
        );
        showDialog(deleteRowsDialog);
    }

    function renderColumnSpecifications(container, count) {
        const existing = Array.from(container.querySelectorAll(`.${DIALOG_CLASS}__column-spec`));
        const previous = existing.map(row => ({
            name: row.querySelector('input[type="text"]')?.value ?? "",
            dataType: row.querySelector("select")?.value ?? "Text"
        }));
        container.replaceChildren();

        for (let index = 0; index < count; index += 1) {
            const row = document.createElement("div");
            row.className = `${DIALOG_CLASS}__column-spec`;
            const nameLabel = document.createElement("label");
            nameLabel.textContent = `Column ${index + 1} name`;
            const name = document.createElement("input");
            name.type = "text";
            name.maxLength = 150;
            name.value = previous[index]?.name ?? "";
            nameLabel.append(name);

            const typeLabel = document.createElement("label");
            typeLabel.textContent = "Type";
            const type = document.createElement("select");
            for (const item of VALID_COLUMN_TYPES) {
                const option = document.createElement("option");
                option.value = item;
                option.textContent = item;
                option.selected = item === (previous[index]?.dataType ?? "Text");
                type.append(option);
            }
            typeLabel.append(type);
            row.append(nameLabel, typeLabel);
            container.append(row);
        }
    }

    async function openInsertColumnsDialog() {
        const context = menuContext;
        if (!context) return;
        const body = insertColumnsDialog.querySelector("[data-body]");
        const actions = insertColumnsDialog.querySelector("[data-actions]");
        const error = insertColumnsDialog.querySelector("[data-error]");
        body.replaceChildren();
        actions.replaceChildren();
        error.textContent = "";

        const countLabel = document.createElement("label");
        countLabel.textContent = "Number of columns";
        const countInput = document.createElement("input");
        countInput.type = "number";
        countInput.min = "1";
        countInput.max = String(MAX_INSERT_COLUMNS);
        countInput.step = "1";
        countInput.value = "1";
        countLabel.append(countInput);
        const specs = document.createElement("div");
        specs.className = `${DIALOG_CLASS}__column-specs`;
        renderColumnSpecifications(specs, 1);
        body.append(countLabel, specs);

        countInput.addEventListener("change", () => {
            const count = Number(countInput.value);
            if (Number.isInteger(count) && count >= 1 && count <= MAX_INSERT_COLUMNS) {
                renderColumnSpecifications(specs, count);
                error.textContent = "";
            }
        });

        const submit = async position => {
            const count = Number(countInput.value);
            if (!Number.isInteger(count) || count < 1 || count > MAX_INSERT_COLUMNS) {
                error.textContent = `Enter a whole number from 1 to ${MAX_INSERT_COLUMNS}.`;
                return;
            }
            renderColumnSpecifications(specs, count);
            const specifications = Array.from(specs.querySelectorAll(`.${DIALOG_CLASS}__column-spec`))
                .map(row => ({
                    name: row.querySelector('input[type="text"]')?.value ?? "",
                    dataType: row.querySelector("select")?.value ?? "Text"
                }));

            try {
                await structureCommands.execute(
                    REVO_GRID_STRUCTURE_COMMANDS.INSERT_COLUMNS,
                    context,
                    { position, specifications }
                );
                closeDialog(insertColumnsDialog);
            } catch (exception) {
                error.textContent = exception?.message || "Unable to insert columns.";
            }
        };

        actions.append(
            button("Cancel", () => closeDialog(insertColumnsDialog)),
            button("Insert Left", () => void submit("left"), { primary: true }),
            button("Insert Right", () => void submit("right"), { primary: true })
        );
        showDialog(insertColumnsDialog);
        queueMicrotask(() => specs.querySelector('input[type="text"]')?.focus());
    }

    async function openDeleteColumnsDialog() {
        const context = menuContext;
        if (!context) return;
        const body = deleteColumnsDialog.querySelector("[data-body]");
        const actions = deleteColumnsDialog.querySelector("[data-actions]");
        const error = deleteColumnsDialog.querySelector("[data-error]");
        body.replaceChildren();
        actions.replaceChildren();
        error.textContent = "";

        const column = context.column ?? {};
        const columnDelete = structureCommands.describeColumnDelete(context);
        const scopes = [
            {
                value: "current",
                label: columnDelete.currentCount
                    ? "Current Column — 1"
                    : "Current Column — protected Core column",
                enabled: columnDelete.currentCount > 0
            },
            {
                value: "selection",
                label: `Custom Columns in Selection — ${columnDelete.selectionCount.toLocaleString()}`,
                enabled: columnDelete.selectionCount > 0
            }
        ];
        let selectedScope = columnDelete.selectionCount > 0
            ? "selection"
            : scopes.find(scope => scope.enabled)?.value ?? null;

        const scopeTitle = document.createElement("div");
        scopeTitle.className = `${DIALOG_CLASS}__section-label`;
        scopeTitle.textContent = "Delete scope";
        body.append(scopeTitle);

        for (const scope of scopes) {
            const label = document.createElement("label");
            label.className = `${DIALOG_CLASS}__scope`;
            label.dataset.disabled = scope.enabled ? "false" : "true";
            label.dataset.selected = scope.value === selectedScope ? "true" : "false";
            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = "erp-delete-column-scope";
            radio.value = scope.value;
            radio.disabled = !scope.enabled;
            radio.checked = scope.value === selectedScope;
            radio.addEventListener("change", () => {
                selectedScope = scope.value;
                syncScopeSelection(body, radio.name);
            });
            const text = document.createElement("span");
            text.textContent = scope.label;
            label.append(radio, text);
            body.append(label);
        }

        const note = document.createElement("p");
        note.className = `${DIALOG_CLASS}__note`;
        note.textContent = "Core Work Order columns are protected and are never deleted by this command.";
        body.append(note);

        const submit = async () => {
            try {
                await structureCommands.execute(
                    REVO_GRID_STRUCTURE_COMMANDS.DELETE_COLUMNS,
                    context,
                    { scope: selectedScope }
                );
                closeDialog(deleteColumnsDialog);
            } catch (exception) {
                error.textContent = exception?.message || "Unable to delete columns.";
            }
        };

        actions.append(
            button("Cancel", () => closeDialog(deleteColumnsDialog)),
            button("Delete", () => void submit(), { danger: true })
        );
        showDialog(deleteColumnsDialog);
    }

    menu.append(
        makeMenuButton("Insert Rows...", () => void openInsertRowsDialog()),
        makeMenuButton("Delete Rows...", () => void openDeleteRowsDialog(), true)
    );
    const separator = document.createElement("div");
    separator.className = `${MENU_CLASS}__separator`;
    menu.append(separator);
    menu.append(
        makeMenuButton("Insert Columns...", () => void openInsertColumnsDialog()),
        makeMenuButton("Delete Columns...", () => void openDeleteColumnsDialog(), true)
    );

    document.body.append(menu, insertRowsDialog, deleteRowsDialog, insertColumnsDialog, deleteColumnsDialog);

    const onPointerDown = event => {
        if (event.button !== 2) {
            pendingContext = null;
            return;
        }
        const clickedCell = pointerCellFromEvent(event);
        pendingContext = captureContext(clickedCell).catch(() => null);
    };

    const onContextMenu = event => {
        event.preventDefault();
        const x = event.clientX;
        const y = event.clientY;
        const clickedCell = pointerCellFromEvent(event);
        const captured = pendingContext;
        const sequence = ++contextMenuSequence;
        pendingContext = null;

        void Promise.resolve(captured)
            .then(context => context ?? captureContext(clickedCell))
            .then(async context => {
                if (destroyed || sequence !== contextMenuSequence || !context) {
                    closeMenu();
                    return;
                }

                // Revo can finish a secondary-click focus move after contextmenu.
                // Open the ERP menu only after that visual focus has settled so
                // Revo's own focus scroll cannot immediately close it again.
                await waitForContextMenuFocusToSettle();
                if (destroyed || sequence !== contextMenuSequence) {
                    return;
                }

                menuContext = context;
                positionMenu(menu, x, y);
            })
            .catch(() => closeMenu());
    };

    const onDocumentPointerDown = event => {
        const path = typeof event.composedPath === "function" ? event.composedPath() : [];
        if (!path.includes(menu)) {
            contextMenuSequence += 1;
            if (!menu.hidden) {
                closeMenu();
            }
        }
    };

    const onEscape = event => {
        if (event.key !== "Escape") return;
        contextMenuSequence += 1;
        closeMenu();
        closeAllDialogs();
    };

    const onViewportScroll = () => {
        if (!menu.hidden) {
            contextMenuSequence += 1;
            closeMenu();
        }
    };
    const onResize = () => {
        contextMenuSequence += 1;
        closeMenu();
    };

    addListener(grid, "pointerdown", onPointerDown, true);
    addListener(grid, "contextmenu", onContextMenu);
    addListener(grid, "viewportscroll", onViewportScroll);
    addListener(document, "pointerdown", onDocumentPointerDown, true);
    addListener(document, "keydown", onEscape, true);
    addListener(window, "resize", onResize, { passive: true });

    function getState() {
        return {
            structureMenuOpen: !menu.hidden,
            structureDialogOpen: [insertRowsDialog, deleteRowsDialog, insertColumnsDialog, deleteColumnsDialog]
                .some(dialog => !dialog.hidden)
        };
    }

    function destroy() {
        if (destroyed) return;
        contextMenuSequence += 1;
        closeMenu();
        closeAllDialogs();
        pendingContext = null;
        for (const remove of removers.splice(0)) {
            try { remove(); } catch { }
        }
        menu.remove();
        insertRowsDialog.remove();
        deleteRowsDialog.remove();
        insertColumnsDialog.remove();
        deleteColumnsDialog.remove();
        destroyed = true;
    }

    return Object.freeze({ getState, destroy });
}

export const revoGridStructureMenuInternals = Object.freeze({
    STYLE_ID,
    MENU_CLASS,
    DIALOG_CLASS,
    MAX_INSERT_ROWS,
    MAX_INSERT_COLUMNS,
    pointerCellFromEvent
});
