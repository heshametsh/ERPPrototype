window.tabulatorFilters = {
    activePopups: new Map(),

    definitions: {
        workTypeCode: {
            stateKey: "workTypeCodes",
            title: "Filter Work Type",
            storageKey: "uds-work-type-filter-size"
        },
        assignmentDate: {
            stateKey: "assignmentDates",
            title: "Filter Assignment Date",
            storageKey: "uds-assignment-date-filter-size",
            type: "date"
        },
        basket: {
            stateKey: "basketValues",
            title: "Filter Basket",
            storageKey: "uds-basket-filter-size"
        }
    },

    icon: function (title) {
        return (
            '<span class="excel-filter-icon" title="' +
            title +
            '" aria-label="' +
            title +
            '">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M3 5h18l-7 8v5.2l-4 2V13L3 5z"></path>' +
            '</svg>' +
            '</span>'
        );
    },

    getDefinition: function (field) {
        return this.definitions[field] ?? null;
    },

    normalizeFieldValue: function (
        host,
        field,
        value
    ) {
        if (field === "assignmentDate") {
            return host.normalizeAssignmentDate(value);
        }

        return String(value ?? "").trim();
    },

    rowMatchesExternalFilters: function (
        host,
        rowData,
        filters,
        excludedField = null
    ) {
        const workOrderSearch = String(
            filters.workOrderNumber ?? ""
        ).trim();

        const workTypes = new Set(
            filters.workTypeCodes ?? []
        );

        const assignmentDates = new Set(
            filters.assignmentDates ?? []
        );

        const baskets = new Set(
            filters.basketValues ?? []
        );

        const matchesWorkOrder =
            workOrderSearch === "" ||
            String(
                rowData.workOrderNumber ?? ""
            ).includes(workOrderSearch);

        const matchesWorkType =
            excludedField === "workTypeCode" ||
            workTypes.size === 0 ||
            workTypes.has(
                String(
                    rowData.workTypeCode ?? ""
                ).trim()
            );

        const normalizedDate =
            host.normalizeAssignmentDate(
                rowData.assignmentDate
            );

        const matchesDate =
            excludedField === "assignmentDate" ||
            assignmentDates.size === 0 ||
            assignmentDates.has(normalizedDate);

        const matchesBasket =
            excludedField === "basket" ||
            baskets.size === 0 ||
            baskets.has(
                String(
                    rowData.basket ?? ""
                ).trim()
            );

        return (
            matchesWorkOrder &&
            matchesWorkType &&
            matchesDate &&
            matchesBasket
        );
    },

    getRowsForFilterOptions: function (
        host,
        elementId,
        field
    ) {
        const table = host.tables[elementId];
        const state = host.states[elementId];

        if (!table || !state) {
            return [];
        }

        return table
            .getData()
            .filter(row =>
                this.rowMatchesExternalFilters(
                    host,
                    row,
                    state.externalFilters,
                    field
                )
            );
    },

    getUniqueValues: function (
        host,
        elementId,
        field
    ) {
        const rows = this.getRowsForFilterOptions(
            host,
            elementId,
            field
        );

        return Array.from(
            new Set(
                rows
                    .map(row =>
                        this.normalizeFieldValue(
                            host,
                            field,
                            row[field]
                        )
                    )
                    .filter(value =>
                        value !== null && value !== ""
                    )
            )
        ).sort((first, second) => {
            if (field === "assignmentDate") {
                return (
                    this.dateToTime(first) -
                    this.dateToTime(second)
                );
            }

            return first.localeCompare(
                second,
                undefined,
                {
                    numeric: true,
                    sensitivity: "base"
                }
            );
        });
    },

    dateToTime: function (dateValue) {
        const [day, month, year] =
            String(dateValue)
                .split("/")
                .map(Number);

        return Date.UTC(year, month - 1, day);
    },

    createResizeHandle: function () {
        const handle = document.createElement("div");
        handle.className = "excel-filter-resize-handle";
        handle.title = "Drag to resize";
        return handle;
    },

    getActivePopup: function (elementId) {
        const active = this.activePopups.get(elementId) ?? null;

        if (active && !active.shell?.isConnected) {
            active.observer?.disconnect();
            active.anchorElement?.classList.remove("is-popup-open");
            this.activePopups.delete(elementId);
            return null;
        }

        return active;
    },

    closeActivePopup: function (elementId) {
        const active = this.activePopups.get(elementId);

        if (!active) {
            return false;
        }

        active.observer?.disconnect();
        active.anchorElement?.classList.remove("is-popup-open");

        if (active.shell?.isConnected) {
            active.shell.remove();
        }

        this.activePopups.delete(elementId);
        return true;
    },

    registerActivePopup: function (
        elementId,
        field,
        anchorElement,
        shell
    ) {
        this.closeActivePopup(elementId);

        if (!shell) {
            return;
        }

        anchorElement?.classList.add("is-popup-open");

        const active = {
            field,
            anchorElement,
            shell,
            observer: null
        };

        const observer = new MutationObserver(() => {
            if (!shell.isConnected) {
                observer.disconnect();
                anchorElement?.classList.remove("is-popup-open");

                if (this.activePopups.get(elementId) === active) {
                    this.activePopups.delete(elementId);
                }
            }
        });

        active.observer = observer;
        this.activePopups.set(elementId, active);
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    },

    handleHeaderIconClick: function (
        elementId,
        button,
        event
    ) {
        const active = this.getActivePopup(elementId);

        if (!active) {
            return true;
        }

        if (active.anchorElement === button) {
            this.closeActivePopup(elementId);
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            return false;
        }

        /*
         * A different filter icon was clicked. Close the current popup, then
         * allow Tabulator's own handler to open the newly requested filter.
         */
        this.closeActivePopup(elementId);
        return true;
    },

    mountPopup: function (
        container,
        onRendered,
        options
    ) {
        if (typeof onRendered !== "function") {
            return;
        }

        onRendered(() => {
            const shell = container.closest(
                ".tabulator-popup-container"
            );

            const searchInput = container.querySelector(
                ".excel-filter-search"
            );

            if (!shell) {
                searchInput?.focus({ preventScroll: true });
                return;
            }

            shell.classList.add(
                "excel-filter-popup-shell"
            );

            const {
                elementId,
                field,
                storageKey,
                anchorElement,
                defaultWidth = 270,
                defaultHeight = 380,
                minWidth = 235,
                minHeight = 290,
                maxWidth = 540,
                maxHeight = 650
            } = options;

            this.registerActivePopup(
                elementId,
                field,
                anchorElement,
                shell
            );

            let storedSize = null;

            try {
                storedSize = JSON.parse(
                    localStorage.getItem(storageKey)
                );
            } catch {
                storedSize = null;
            }

            const clamp = (value, min, max) =>
                Math.min(Math.max(value, min), max);

            shell.style.width =
                `${clamp(
                    Number(storedSize?.width) ||
                    defaultWidth,
                    minWidth,
                    maxWidth
                )}px`;

            shell.style.height =
                `${clamp(
                    Number(storedSize?.height) ||
                    defaultHeight,
                    minHeight,
                    maxHeight
                )}px`;

            /*
             * Tabulator 6.5 positions header popups from the mouse
             * event. With a scrolled page or a custom popup container,
             * that can produce a large vertical offset. Re-anchor the
             * popup to the actual filter icon using viewport geometry.
             */
            const positionPopup = () => {
                if (
                    !shell.isConnected ||
                    !anchorElement?.isConnected
                ) {
                    return;
                }

                const anchorRect =
                    anchorElement.getBoundingClientRect();

                const popupWidth = shell.offsetWidth;
                const popupHeight = shell.offsetHeight;
                const viewportMargin = 8;
                const gap = 4;

                let left =
                    anchorRect.right - popupWidth;

                left = clamp(
                    left,
                    viewportMargin,
                    Math.max(
                        viewportMargin,
                        window.innerWidth -
                        popupWidth -
                        viewportMargin
                    )
                );

                let top = anchorRect.bottom + gap;

                if (
                    top + popupHeight >
                    window.innerHeight - viewportMargin
                ) {
                    const topAbove =
                        anchorRect.top - popupHeight - gap;

                    top = topAbove >= viewportMargin
                        ? topAbove
                        : Math.max(
                            viewportMargin,
                            window.innerHeight -
                            popupHeight -
                            viewportMargin
                        );
                }

                shell.style.position = "fixed";
                shell.style.left = `${Math.round(left)}px`;
                shell.style.top = `${Math.round(top)}px`;
                shell.style.right = "auto";
                shell.style.bottom = "auto";
                shell.style.zIndex = "3000";
            };

            const handle = container.querySelector(
                ".excel-filter-resize-handle"
            );

            handle?.addEventListener(
                "pointerdown",
                event => {
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();

                    const startX = event.clientX;
                    const startY = event.clientY;
                    const startWidth = shell.offsetWidth;
                    const startHeight = shell.offsetHeight;

                    handle.setPointerCapture(
                        event.pointerId
                    );

                    const move = moveEvent => {
                        moveEvent.preventDefault();
                        moveEvent.stopPropagation();

                        shell.style.width =
                            `${clamp(
                                startWidth +
                                moveEvent.clientX -
                                startX,
                                minWidth,
                                maxWidth
                            )}px`;

                        shell.style.height =
                            `${clamp(
                                startHeight +
                                moveEvent.clientY -
                                startY,
                                minHeight,
                                maxHeight
                            )}px`;

                        positionPopup();
                    };

                    const stop = stopEvent => {
                        stopEvent.preventDefault();
                        stopEvent.stopPropagation();

                        handle.removeEventListener(
                            "pointermove",
                            move
                        );

                        handle.removeEventListener(
                            "pointerup",
                            stop
                        );

                        handle.removeEventListener(
                            "pointercancel",
                            stop
                        );

                        localStorage.setItem(
                            storageKey,
                            JSON.stringify({
                                width: shell.offsetWidth,
                                height: shell.offsetHeight
                            })
                        );
                    };

                    handle.addEventListener(
                        "pointermove",
                        move
                    );

                    handle.addEventListener(
                        "pointerup",
                        stop
                    );

                    handle.addEventListener(
                        "pointercancel",
                        stop
                    );
                },
                true
            );

            /*
             * Run after Tabulator's own synchronous fit-to-screen
             * calculation. Preventing scroll also stops the browser
             * from moving the whole page when the search box focuses.
             */
            requestAnimationFrame(() => {
                positionPopup();
                searchInput?.focus({
                    preventScroll: true
                });
            });
        });
    },

    createBasePopup: function (titleText) {
        const container = document.createElement("div");
        container.className = "excel-filter-popup";
        container.dir = "ltr";

        const title = document.createElement("div");
        title.className = "excel-filter-title";
        title.textContent = titleText;

        const search = document.createElement("input");
        search.className = "excel-filter-search";
        search.type = "search";
        search.autocomplete = "off";
        search.placeholder = "Search values...";

        const selectAllLabel =
            document.createElement("label");
        selectAllLabel.className =
            "excel-filter-option excel-filter-select-all";

        const selectAll = document.createElement("input");
        selectAll.type = "checkbox";

        const selectAllText =
            document.createElement("span");
        selectAllText.textContent = "Select All";

        selectAllLabel.append(
            selectAll,
            selectAllText
        );

        const actions = document.createElement("div");
        actions.className = "excel-filter-actions";

        const clear = document.createElement("button");
        clear.type = "button";
        clear.className =
            "excel-filter-button excel-filter-button-secondary";
        clear.textContent = "Clear Filter";

        const apply = document.createElement("button");
        apply.type = "button";
        apply.className =
            "excel-filter-button excel-filter-button-primary";
        apply.textContent = "Apply";

        actions.append(clear, apply);

        return {
            container,
            title,
            search,
            selectAllLabel,
            selectAll,
            actions,
            clear,
            apply
        };
    },

    closePopup: function (
        elementId,
        popupContainer,
        afterClose = null
    ) {
        const active = this.getActivePopup(elementId);
        const popupShell = popupContainer?.closest(
            ".tabulator-popup-container"
        );

        if (active?.shell === popupShell) {
            this.closeActivePopup(elementId);
        } else if (popupShell?.isConnected) {
            popupShell.remove();
        }

        window.requestAnimationFrame(() => {
            if (typeof afterClose === "function") {
                afterClose();
            }
        });
    },

    createValuePopup: function (
        host,
        elementId,
        column,
        onRendered,
        field
    ) {
        const definition = this.getDefinition(field);
        const state = host.states[elementId];

        if (!definition || !state) {
            return document.createElement("div");
        }

        const uniqueValues = this.getUniqueValues(
            host,
            elementId,
            field
        );

        const appliedValues =
            state.externalFilters[definition.stateKey] ?? [];

        const pendingValues = new Set(
            appliedValues.length > 0
                ? appliedValues
                : uniqueValues
        );

        const ui = this.createBasePopup(
            definition.title
        );

        const options = document.createElement("div");
        options.className =
            "excel-filter-options excel-filter-scroll";

        const empty = document.createElement("div");
        empty.className = "excel-filter-empty";
        empty.textContent = "No matching values.";

        const updateSelectAll = () => {
            ui.selectAll.checked =
                uniqueValues.length > 0 &&
                pendingValues.size === uniqueValues.length;

            ui.selectAll.indeterminate =
                pendingValues.size > 0 &&
                pendingValues.size < uniqueValues.length;
        };

        const render = () => {
            const query = ui.search.value
                .trim()
                .toLocaleLowerCase();

            options.replaceChildren();
            let visible = 0;

            uniqueValues.forEach(value => {
                if (
                    query !== "" &&
                    !value
                        .toLocaleLowerCase()
                        .includes(query)
                ) {
                    return;
                }

                visible++;

                const label = document.createElement("label");
                label.className = "excel-filter-option";

                const checkbox =
                    document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.checked = pendingValues.has(value);

                const text = document.createElement("span");
                text.textContent = value;

                checkbox.addEventListener(
                    "change",
                    () => {
                        if (checkbox.checked) {
                            pendingValues.add(value);
                        } else {
                            pendingValues.delete(value);
                        }

                        updateSelectAll();
                    }
                );

                label.append(checkbox, text);
                options.appendChild(label);
            });

            if (visible === 0) {
                options.appendChild(empty);
            }
        };

        ui.selectAll.addEventListener(
            "change",
            () => {
                pendingValues.clear();

                if (ui.selectAll.checked) {
                    uniqueValues.forEach(value =>
                        pendingValues.add(value)
                    );
                }

                render();
                updateSelectAll();
            }
        );

        ui.search.addEventListener("input", render);

        ui.clear.addEventListener("click", () => {
            const oldFilters =
                host.cloneExternalFilters(
                    state.externalFilters
                );

            state.externalFilters[
                definition.stateKey
            ] = [];

            const newFilters =
                host.cloneExternalFilters(
                    state.externalFilters
                );

            host.pushFilterTransaction(
                elementId,
                oldFilters,
                newFilters,
                `Clear ${definition.title}`
            );

            this.closePopup(
                elementId,
                ui.container,
                () => {
                    this.apply(
                        host,
                        elementId
                    );
                }
            );
        });

        ui.apply.addEventListener("click", () => {
            const oldFilters =
                host.cloneExternalFilters(
                    state.externalFilters
                );

            const selected = uniqueValues.filter(value =>
                pendingValues.has(value)
            );

            state.externalFilters[
                definition.stateKey
            ] =
                selected.length === uniqueValues.length
                    ? []
                    : selected;

            const newFilters =
                host.cloneExternalFilters(
                    state.externalFilters
                );

            host.pushFilterTransaction(
                elementId,
                oldFilters,
                newFilters,
                definition.title
            );

            this.closePopup(
                elementId,
                ui.container,
                () => {
                    this.apply(
                        host,
                        elementId
                    );
                }
            );
        });

        const resizeHandle = this.createResizeHandle();

        ui.container.append(
            ui.title,
            ui.search,
            ui.selectAllLabel,
            options,
            ui.actions,
            resizeHandle
        );

        updateSelectAll();
        render();

        this.mountPopup(
            ui.container,
            onRendered,
            {
                elementId,
                field,
                storageKey: definition.storageKey,
                anchorElement:
                    column
                        .getElement()
                        .querySelector(
                            ".tabulator-header-popup-button"
                        ),
                defaultWidth: 270,
                defaultHeight: 380
            }
        );

        return ui.container;
    },

    createDatePopup: function (
        host,
        elementId,
        column,
        onRendered
    ) {
        const definition =
            this.definitions.assignmentDate;
        const state = host.states[elementId];

        if (!state) {
            return document.createElement("div");
        }

        const uniqueDates = this.getUniqueValues(
            host,
            elementId,
            "assignmentDate"
        );

        const appliedDates =
            state.externalFilters.assignmentDates ?? [];

        const pendingDates = new Set(
            appliedDates.length > 0
                ? appliedDates
                : uniqueDates
        );

        const monthNames = [
            "",
            "January",
            "February",
            "March",
            "April",
            "May",
            "June",
            "July",
            "August",
            "September",
            "October",
            "November",
            "December"
        ];

        const groups = new Map();

        uniqueDates.forEach(value => {
            const [day, month, year] =
                value.split("/").map(Number);

            if (!groups.has(year)) {
                groups.set(year, new Map());
            }

            const months = groups.get(year);

            if (!months.has(month)) {
                months.set(month, []);
            }

            months.get(month).push({ day, value });
        });

        const expandedYears = new Set();
        const expandedMonths = new Set();
        const ui = this.createBasePopup(definition.title);

        const tree = document.createElement("div");
        tree.className =
            "excel-date-tree excel-filter-scroll";

        const empty = document.createElement("div");
        empty.className = "excel-filter-empty";
        empty.textContent = "No matching dates.";

        const updateSelectAll = () => {
            ui.selectAll.checked =
                uniqueDates.length > 0 &&
                pendingDates.size === uniqueDates.length;

            ui.selectAll.indeterminate =
                pendingDates.size > 0 &&
                pendingDates.size < uniqueDates.length;
        };

        const syncGroupCheckbox = (
            checkbox,
            values
        ) => {
            const selected = values.filter(value =>
                pendingDates.has(value)
            ).length;

            checkbox.checked =
                values.length > 0 &&
                selected === values.length;

            checkbox.indeterminate =
                selected > 0 && selected < values.length;
        };

        const render = () => {
            const query = ui.search.value
                .trim()
                .toLocaleLowerCase();

            tree.replaceChildren();
            let visibleDates = 0;

            Array.from(groups.keys())
                .sort((a, b) => a - b)
                .forEach(year => {
                    const months = groups.get(year);
                    const yearValues = [];

                    months.forEach(items =>
                        items.forEach(item =>
                            yearValues.push(item.value)
                        )
                    );

                    const yearMatches =
                        query === "" ||
                        String(year).includes(query) ||
                        yearValues.some(value =>
                            value
                                .toLocaleLowerCase()
                                .includes(query)
                        );

                    if (!yearMatches) {
                        return;
                    }

                    const yearDetails =
                        document.createElement("details");
                    yearDetails.className =
                        "excel-date-year";
                    yearDetails.open =
                        query !== "" ||
                        expandedYears.has(year);

                    yearDetails.addEventListener(
                        "toggle",
                        () => {
                            if (yearDetails.open) {
                                expandedYears.add(year);
                            } else {
                                expandedYears.delete(year);
                            }
                        }
                    );

                    const yearSummary =
                        document.createElement("summary");
                    yearSummary.className =
                        "excel-date-summary";

                    const yearCheckbox =
                        document.createElement("input");
                    yearCheckbox.type = "checkbox";
                    yearCheckbox.addEventListener(
                        "click",
                        event => event.stopPropagation()
                    );

                    const yearText =
                        document.createElement("span");
                    yearText.textContent = String(year);

                    syncGroupCheckbox(
                        yearCheckbox,
                        yearValues
                    );

                    yearCheckbox.addEventListener(
                        "change",
                        () => {
                            yearValues.forEach(value => {
                                if (yearCheckbox.checked) {
                                    pendingDates.add(value);
                                } else {
                                    pendingDates.delete(value);
                                }
                            });

                            updateSelectAll();
                            render();
                        }
                    );

                    yearSummary.append(
                        yearCheckbox,
                        yearText
                    );
                    yearDetails.appendChild(yearSummary);

                    Array.from(months.keys())
                        .sort((a, b) => a - b)
                        .forEach(month => {
                            const items = months.get(month);
                            const monthValues = items.map(
                                item => item.value
                            );

                            const monthMatches =
                                query === "" ||
                                monthNames[month]
                                    .toLocaleLowerCase()
                                    .includes(query) ||
                                String(month).includes(query) ||
                                monthValues.some(value =>
                                    value
                                        .toLocaleLowerCase()
                                        .includes(query)
                                );

                            if (!monthMatches) {
                                return;
                            }

                            const monthKey =
                                `${year}-${month}`;
                            const monthDetails =
                                document.createElement("details");
                            monthDetails.className =
                                "excel-date-month";
                            monthDetails.open =
                                query !== "" ||
                                expandedMonths.has(monthKey);

                            monthDetails.addEventListener(
                                "toggle",
                                () => {
                                    if (monthDetails.open) {
                                        expandedMonths.add(monthKey);
                                    } else {
                                        expandedMonths.delete(monthKey);
                                    }
                                }
                            );

                            const monthSummary =
                                document.createElement("summary");
                            monthSummary.className =
                                "excel-date-summary";

                            const monthCheckbox =
                                document.createElement("input");
                            monthCheckbox.type = "checkbox";
                            monthCheckbox.addEventListener(
                                "click",
                                event =>
                                    event.stopPropagation()
                            );

                            const monthText =
                                document.createElement("span");
                            monthText.textContent =
                                monthNames[month];

                            syncGroupCheckbox(
                                monthCheckbox,
                                monthValues
                            );

                            monthCheckbox.addEventListener(
                                "change",
                                () => {
                                    monthValues.forEach(value => {
                                        if (monthCheckbox.checked) {
                                            pendingDates.add(value);
                                        } else {
                                            pendingDates.delete(value);
                                        }
                                    });

                                    updateSelectAll();
                                    render();
                                }
                            );

                            monthSummary.append(
                                monthCheckbox,
                                monthText
                            );
                            monthDetails.appendChild(
                                monthSummary
                            );

                            items.forEach(item => {
                                const matches =
                                    query === "" ||
                                    item.value
                                        .toLocaleLowerCase()
                                        .includes(query);

                                if (!matches) {
                                    return;
                                }

                                visibleDates++;

                                const label =
                                    document.createElement("label");
                                label.className =
                                    "excel-filter-option excel-date-value";

                                const checkbox =
                                    document.createElement("input");
                                checkbox.type = "checkbox";
                                checkbox.checked =
                                    pendingDates.has(item.value);

                                const text =
                                    document.createElement("span");
                                text.textContent = item.value;

                                checkbox.addEventListener(
                                    "change",
                                    () => {
                                        if (checkbox.checked) {
                                            pendingDates.add(item.value);
                                        } else {
                                            pendingDates.delete(item.value);
                                        }

                                        updateSelectAll();
                                        render();
                                    }
                                );

                                label.append(checkbox, text);
                                monthDetails.appendChild(label);
                            });

                            yearDetails.appendChild(
                                monthDetails
                            );
                        });

                    tree.appendChild(yearDetails);
                });

            if (visibleDates === 0) {
                tree.appendChild(empty);
            }
        };

        ui.selectAll.addEventListener(
            "change",
            () => {
                pendingDates.clear();

                if (ui.selectAll.checked) {
                    uniqueDates.forEach(value =>
                        pendingDates.add(value)
                    );
                }

                updateSelectAll();
                render();
            }
        );

        ui.search.placeholder = "Search dates...";
        ui.search.addEventListener("input", render);

        ui.clear.addEventListener("click", () => {
            const oldFilters =
                host.cloneExternalFilters(
                    state.externalFilters
                );

            state.externalFilters
                .assignmentDates = [];

            const newFilters =
                host.cloneExternalFilters(
                    state.externalFilters
                );

            host.pushFilterTransaction(
                elementId,
                oldFilters,
                newFilters,
                "Clear Filter Assignment Date"
            );

            this.closePopup(
                elementId,
                ui.container,
                () => {
                    this.apply(
                        host,
                        elementId
                    );
                }
            );
        });

        ui.apply.addEventListener("click", () => {
            const oldFilters =
                host.cloneExternalFilters(
                    state.externalFilters
                );

            const selected = uniqueDates.filter(value =>
                pendingDates.has(value)
            );

            state.externalFilters
                .assignmentDates =
                selected.length === uniqueDates.length
                    ? []
                    : selected;

            const newFilters =
                host.cloneExternalFilters(
                    state.externalFilters
                );

            host.pushFilterTransaction(
                elementId,
                oldFilters,
                newFilters,
                "Filter Assignment Date"
            );

            this.closePopup(
                elementId,
                ui.container,
                () => {
                    this.apply(
                        host,
                        elementId
                    );
                }
            );
        });

        const resizeHandle = this.createResizeHandle();

        ui.container.append(
            ui.title,
            ui.search,
            ui.selectAllLabel,
            tree,
            ui.actions,
            resizeHandle
        );

        updateSelectAll();
        render();

        this.mountPopup(
            ui.container,
            onRendered,
            {
                elementId,
                field: "assignmentDate",
                storageKey: definition.storageKey,
                anchorElement:
                    column
                        .getElement()
                        .querySelector(
                            ".tabulator-header-popup-button"
                        ),
                defaultWidth: 285,
                defaultHeight: 430,
                minWidth: 250,
                minHeight: 330
            }
        );

        return ui.container;
    },

    apply: function (host, elementId) {
        const table = host.tables[elementId];
        const state = host.states[elementId];

        if (!table || !state) {
            return;
        }

        const filters = state.externalFilters;

        const hasAnyFilter =
            String(
                filters.workOrderNumber ?? ""
            ).trim() !== "" ||
            (filters.workTypeCodes ?? []).length > 0 ||
            (filters.assignmentDates ?? []).length > 0 ||
            (filters.basketValues ?? []).length > 0;

        if (!hasAnyFilter) {
            table.clearFilter();
        } else {
            table.setFilter(rowData =>
                this.rowMatchesExternalFilters(
                    host,
                    rowData,
                    filters
                )
            );
        }

        const visibleRows = table.getDataCount("active");
        const totalRows = table.getDataCount();

        host.setStatus(
            elementId,
            `المعروض ${visibleRows.toLocaleString()} من أصل ${totalRows.toLocaleString()} صف.`
        );

        this.updateAllIcons(host, elementId);

        host.scheduleAggregateRefresh?.(
            elementId,
            "filter-applied",
            "visible"
        );
    },

    updateIcon: function (
        host,
        elementId,
        field
    ) {
        const table = host.tables[elementId];
        const state = host.states[elementId];
        const definition = this.getDefinition(field);

        if (!table || !state || !definition) {
            return;
        }

        const column = table.getColumn(field);

        if (
            !column ||
            typeof column.getElement !== "function"
        ) {
            return;
        }

        const button = column
            .getElement()
            .querySelector(
                ".tabulator-header-popup-button"
            );

        const values =
            state.externalFilters[definition.stateKey] ?? [];

        button?.classList.toggle(
            "is-filtered",
            values.length > 0
        );
    },

    updateAllIcons: function (host, elementId) {
        Object.keys(this.definitions).forEach(field =>
            this.updateIcon(host, elementId, field)
        );
    },

    refreshFields: function (
        host,
        elementId,
        fields
    ) {
        const table = host.tables[elementId];
        const state = host.states[elementId];

        if (!table || !state) {
            return;
        }

        const uniqueFields =
            Array.from(new Set(fields ?? []));

        const shouldReapplyActiveFilter =
            uniqueFields.some(field => {
                if (field === "workOrderNumber") {
                    return String(
                        state.externalFilters.workOrderNumber ?? ""
                    ).trim() !== "";
                }

                const definition =
                    this.getDefinition(field);

                if (!definition) {
                    return false;
                }

                return (
                    state.externalFilters[
                        definition.stateKey
                    ] ?? []
                ).length > 0;
            });

        /*
         * Filter option values are rebuilt only when the popup opens.
         * Scanning every row after every cell edit made large sheets pause.
         * Re-run the table filter only when the edited field currently has
         * an active filter; otherwise update the icons with no data scan.
         */
        if (shouldReapplyActiveFilter) {
            this.apply(host, elementId);
            return;
        }

        this.updateAllIcons(host, elementId);
    }
};
