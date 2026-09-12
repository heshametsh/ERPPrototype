function pathElements(event) {
    const path = typeof event?.composedPath === "function"
        ? event.composedPath()
        : [];
    return path.filter(item => item instanceof Element);
}

function findInPath(event, selector) {
    for (const item of pathElements(event)) {
        if (item.matches(selector)) {
            return item;
        }
    }
    const target = event?.target;
    return target instanceof Element ? target.closest(selector) : null;
}

function isHeaderControl(event) {
    return Boolean(findInPath(
        event,
        "[data-erp-filter-prop], [data-erp-sort-prop]"
    ));
}

function inputForProp(grid, prop) {
    const inputs = grid.querySelectorAll("input[data-erp-column-rename-input]");
    for (const input of inputs) {
        if (String(input.dataset.erpColumnRenameInput ?? "") === String(prop ?? "")) {
            return input;
        }
    }
    return null;
}

function controlInset(nameElement) {
    const container = nameElement?.parentElement;
    if (!container) {
        return 0;
    }

    const controls = container.querySelectorAll(
        "[data-erp-filter-prop], [data-erp-sort-prop]"
    );
    let width = 0;
    for (const control of controls) {
        width += Math.ceil(control.getBoundingClientRect().width || 0);
    }
    if (controls.length > 0) {
        width += 5 * controls.length;
    }
    return width;
}

export function createRevoGridColumnRename(options) {
    const grid = options?.grid;
    const columnWorkspace = options?.columnWorkspace;
    const clearColumnSelection = options?.clearColumnSelection;
    if (!grid || !columnWorkspace?.renameColumn) {
        throw new Error("Column Rename requires Column Workspace.");
    }

    let active = null;
    let destroyed = false;

    async function rerenderColumn(prop) {
        if (destroyed || typeof grid.getColumns !== "function" ||
            typeof grid.updateColumns !== "function") {
            return;
        }
        const columns = await grid.getColumns();
        const column = (Array.isArray(columns) ? columns : [])
            .find(item => String(item?.prop ?? "") === String(prop ?? ""));
        if (column) {
            await grid.updateColumns([column]);
        }
    }

    function currentInput() {
        return active ? inputForProp(grid, active.prop) : null;
    }

    function focusEditor(select = false) {
        const input = currentInput();
        if (!(input instanceof HTMLInputElement)) {
            return;
        }
        input.focus();
        if (select) {
            input.select();
        }
    }

    function syncErrorToDom() {
        if (!active) {
            return;
        }
        const input = currentInput();
        if (!(input instanceof HTMLInputElement)) {
            return;
        }
        input.setAttribute("aria-invalid", active.error ? "true" : "false");
        input.title = active.error || "Press Enter to accept or Escape to cancel.";
        input.dataset.renameError = active.error || "";
    }

    function setError(error) {
        if (!active) {
            return;
        }
        active.error = error || "";
        syncErrorToDom();
        focusEditor(true);
    }

    async function closeEditor() {
        if (!active) {
            return;
        }
        const current = active;
        active = null;
        await rerenderColumn(current.prop);
    }

    async function commit() {
        if (!active || active.committing) {
            return true;
        }

        const current = active;
        current.committing = true;
        const result = await columnWorkspace.renameColumn(
            current.prop,
            current.draft
        );

        if (active !== current) {
            return true;
        }

        if (!result?.succeeded) {
            current.committing = false;
            setError(result?.message || "Unable to rename the custom column.");
            return false;
        }

        // The workspace owns the persistent name/History mutation. Rename only
        // owns this temporary header editor. Clear its state and ask Revo to
        // render the authoritative column definition again by stable prop.
        active = null;
        await rerenderColumn(current.prop);
        return true;
    }

    function ownsKeyboardEvent(event) {
        if (!active) {
            return false;
        }
        const input = findInPath(event, "input[data-erp-column-rename-input]");
        return Boolean(
            input &&
            String(input.dataset.erpColumnRenameInput ?? "") === active.prop
        );
    }

    function renderEditor(h, column, originalTemplate, additionalData) {
        const prop = String(column?.prop ?? "");
        const current = active;
        if (!current || current.prop !== prop) {
            return typeof originalTemplate === "function"
                ? originalTemplate(h, column, additionalData)
                : String(column?.name ?? prop);
        }

        const original = typeof originalTemplate === "function"
            ? originalTemplate(h, column, additionalData)
            : h("span", {
                "data-erp-custom-column-name-prop": prop,
                style: {
                    display: "block",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    minWidth: "0",
                    width: "100%",
                    userSelect: "none",
                    WebkitUserSelect: "none"
                }
            }, String(column?.name ?? prop));

        return h("span", {
            style: {
                display: "block",
                position: "relative",
                minWidth: "0",
                width: "100%"
            }
        }, [
            original,
            h("input", {
                type: "text",
                value: current.draft,
                maxLength: 150,
                autocomplete: "off",
                "data-erp-column-rename-input": prop,
                "aria-label": `Rename ${current.oldName}`,
                "aria-invalid": current.error ? "true" : "false",
                title: current.error || "Press Enter to accept or Escape to cancel.",
                "data-rename-error": current.error || "",
                style: {
                    position: "absolute",
                    insetBlock: "0",
                    insetInlineStart: "0",
                    insetInlineEnd: `${current.controlInset}px`,
                    width: "auto",
                    minWidth: "0",
                    boxSizing: "border-box",
                    font: "inherit",
                    padding: "1px 3px",
                    zIndex: "2"
                },
                onInput: event => {
                    if (active !== current) {
                        return;
                    }
                    current.draft = String(event?.target?.value ?? "");
                    if (current.error) {
                        current.error = "";
                        syncErrorToDom();
                    }
                },
                onKeyDown: event => {
                    if (active !== current) {
                        return;
                    }
                    event.stopPropagation();
                    if (event.key === "Escape") {
                        event.preventDefault();
                        void closeEditor();
                    } else if (event.key === "Enter") {
                        event.preventDefault();
                        void commit();
                    }
                },
                onPointerDown: event => event.stopPropagation(),
                onClick: event => event.stopPropagation(),
                onDblClick: event => event.stopPropagation()
            })
        ]);
    }

    function onBeforeHeaderRender(event) {
        if (!active) {
            return;
        }
        const data = event.detail?.data;
        if (String(data?.prop ?? "") !== active.prop) {
            return;
        }

        const originalTemplate = data.columnTemplate;
        data.columnTemplate = (h, column, additionalData) =>
            renderEditor(h, column, originalTemplate, additionalData);
    }

    function onAfterHeaderRender() {
        if (!active || !active.focusPending) {
            return;
        }
        const input = currentInput();
        if (!(input instanceof HTMLInputElement)) {
            return;
        }
        active.focusPending = false;
        syncErrorToDom();
        focusEditor(true);
    }

    async function begin(event) {
        if (destroyed || active) {
            return;
        }

        const originalEvent = event.detail?.originalEvent;
        if (!originalEvent || isHeaderControl(originalEvent)) {
            return;
        }

        const nameElement = findInPath(
            originalEvent,
            "[data-erp-custom-column-name-prop]"
        );
        const eventProp = String(event.detail?.column?.prop ?? "").trim();
        const targetProp = String(
            nameElement?.dataset?.erpCustomColumnNameProp ?? ""
        ).trim();
        if (!nameElement || !eventProp || targetProp !== eventProp) {
            return;
        }

        originalEvent.preventDefault();
        originalEvent.stopPropagation();
        event.preventDefault?.();

        // A native double-click can leave the header text browser-selected
        // before the higher-level Revo event fires. Rename intent owns this
        // gesture, so clear only that transient text selection.
        const textSelection = window.getSelection?.();
        if (textSelection?.rangeCount) {
            textSelection.removeAllRanges();
        }

        const oldName = String(event.detail?.column?.name ?? nameElement.textContent ?? "").trim();
        active = {
            prop: eventProp,
            oldName,
            draft: oldName,
            error: "",
            committing: false,
            focusPending: true,
            controlInset: controlInset(nameElement)
        };

        // Choice A: keep normal single-click behavior, but once the second
        // click proves Rename intent, remove the column selection immediately.
        // This avoids leaving the whole column selected while the editor is open
        // without adding a delay to ordinary single-click column selection.
        if (typeof clearColumnSelection === "function") {
            await clearColumnSelection(eventProp);
        }

        // Clearing a selected column can itself cause a header render. Re-arm
        // focus before the final Rename-owned render so the surviving input,
        // not an intermediate VDOM instance, receives keyboard focus.
        if (active?.prop === eventProp) {
            active.focusPending = true;
        }
        await rerenderColumn(eventProp);
    }

    function onHeaderDoubleClick(event) {
        void begin(event);
    }

    function onPointerDown(event) {
        if (!active) {
            return;
        }
        const input = currentInput();
        if (input && event.target instanceof Node && input.contains(event.target)) {
            return;
        }

        // Keep the existing safety contract for outside-click commit: do not
        // let the target action race ahead of validation/History. A valid rename
        // commits and closes; an invalid value stays editable.
        event.preventDefault();
        event.stopPropagation();
        void commit();
    }

    grid.addEventListener("headerdblclick", onHeaderDoubleClick);
    grid.addEventListener("beforeheaderrender", onBeforeHeaderRender);
    grid.addEventListener("afterheaderrender", onAfterHeaderRender);
    document.addEventListener("pointerdown", onPointerDown, true);

    function destroy() {
        if (destroyed) {
            return;
        }
        active = null;
        grid.removeEventListener("headerdblclick", onHeaderDoubleClick);
        grid.removeEventListener("beforeheaderrender", onBeforeHeaderRender);
        grid.removeEventListener("afterheaderrender", onAfterHeaderRender);
        document.removeEventListener("pointerdown", onPointerDown, true);
        destroyed = true;
    }

    return Object.freeze({ ownsKeyboardEvent, destroy });
}
