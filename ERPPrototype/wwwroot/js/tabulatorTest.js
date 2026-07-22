window.tabulatorTest = {
    tables: {},
    states: {},

    /*
     * يحول التاريخ إلى الشكل المعتمد داخل الشيت:
     * DD/MM/YYYY
     *
     * يقبل:
     * 22/07/2026
     * 22/7/2026
     * 2/7/2026
     * 2026-07-22
     * أرقام Excel التسلسلية الحديثة عند اللصق.
     */
    normalizeAssignmentDate: function (value) {
        if (
            value === null ||
            value === undefined ||
            String(value).trim() === ""
        ) {
            return "";
        }

        if (value instanceof Date) {
            if (Number.isNaN(value.getTime())) {
                return null;
            }

            return this.formatAssignmentDate(
                value.getFullYear(),
                value.getMonth() + 1,
                value.getDate()
            );
        }

        const text = String(value).trim();

        /* DD/MM/YYYY أو D/M/YYYY */
        let match = text.match(
            /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/
        );

        if (match) {
            return this.formatAssignmentDate(
                Number(match[3]),
                Number(match[2]),
                Number(match[1])
            );
        }

        /* YYYY-MM-DD القادم من النظام أو HTML date input */
        match = text.match(
            /^(\d{4})-(\d{1,2})-(\d{1,2})$/
        );

        if (match) {
            return this.formatAssignmentDate(
                Number(match[1]),
                Number(match[2]),
                Number(match[3])
            );
        }

        /*
         * Excel قد يرسل التاريخ كرقم تسلسلي.
         * نقبل النطاق الحديث فقط لتجنب تفسير سنة أو كود كأنه تاريخ.
         */
        if (/^\d+(?:\.\d+)?$/.test(text)) {
            const serial = Number(text);

            if (serial >= 20000 && serial <= 80000) {
                const excelEpoch = Date.UTC(1899, 11, 30);
                const milliseconds =
                    Math.floor(serial) * 86400000;

                const date = new Date(
                    excelEpoch + milliseconds
                );

                return this.formatAssignmentDate(
                    date.getUTCFullYear(),
                    date.getUTCMonth() + 1,
                    date.getUTCDate()
                );
            }
        }

        return null;
    },

    formatAssignmentDate: function (year, month, day) {
        if (
            !Number.isInteger(year) ||
            !Number.isInteger(month) ||
            !Number.isInteger(day) ||
            year < 1900 ||
            year > 9999
        ) {
            return null;
        }

        const date = new Date(
            Date.UTC(year, month - 1, day)
        );

        if (
            date.getUTCFullYear() !== year ||
            date.getUTCMonth() !== month - 1 ||
            date.getUTCDate() !== day
        ) {
            return null;
        }

        return (
            String(day).padStart(2, "0") +
            "/" +
            String(month).padStart(2, "0") +
            "/" +
            String(year).padStart(4, "0")
        );
    },

    assignmentDateEditor: function (
        cell,
        onRendered,
        success,
        cancel
    ) {
        const input = document.createElement("input");

        input.type = "text";
        input.inputMode = "numeric";
        input.autocomplete = "off";
        input.placeholder = "DD/MM/YYYY";
        input.value = cell.getValue() ?? "";

        input.style.boxSizing = "border-box";
        input.style.width = "100%";
        input.style.height = "100%";
        input.style.minHeight = "37px";
        input.style.margin = "0";
        input.style.padding = "7px 9px";
        input.style.border = "0";
        input.style.outline = "0";
        input.style.background = "#ffffff";
        input.style.font = "inherit";
        input.style.color = "#173047";
        input.style.direction = "ltr";
        input.style.textAlign = "left";

        let completed = false;

        const clearError = function () {
            input.style.boxShadow = "none";
            input.style.background = "#ffffff";
            input.removeAttribute("title");
            input.setAttribute("aria-invalid", "false");
        };

        const showError = function () {
            input.style.boxShadow =
                "inset 0 0 0 2px #c62828";
            input.style.background = "#fff7f7";
            input.title =
                "Enter a valid date in DD/MM/YYYY format.";
            input.setAttribute("aria-invalid", "true");
            input.focus();
            input.select();
        };

        const commit = function () {
            if (completed) {
                return;
            }

            const normalized =
                window.tabulatorTest
                    .normalizeAssignmentDate(
                        input.value
                    );

            if (normalized === null) {
                showError();
                return;
            }

            completed = true;
            clearError();
            success(normalized);
        };

        input.addEventListener("input", clearError);

        input.addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                commit();
                return;
            }

            if (event.key === "Escape") {
                completed = true;
                event.preventDefault();
                event.stopPropagation();
                cancel();
            }
        });

        input.addEventListener("blur", commit);

        onRendered(function () {
            input.focus();
            input.select();
        });

        return input;
    },

    initialize: function (elementId, rowCount) {
        const element = document.getElementById(elementId);

        if (!element) {
            console.error("Tabulator element was not found:", elementId);
            return;
        }

        if (typeof Tabulator === "undefined") {
            console.error("Tabulator library is not loaded.");
            return;
        }

        const oldTable = this.tables[elementId];
        const oldState = this.states[elementId];

        if (oldState?.keyDownHandler) {
            document.removeEventListener(
                "keydown",
                oldState.keyDownHandler,
                true
            );
        }

        if (oldState?.copyHandler) {
            document.removeEventListener(
                "copy",
                oldState.copyHandler,
                true
            );
        }

        if (oldState?.pasteHandler) {
            document.removeEventListener(
                "paste",
                oldState.pasteHandler,
                true
            );
        }

        if (oldState?.pointerDownHandler) {
            document.removeEventListener(
                "pointerdown",
                oldState.pointerDownHandler,
                true
            );
        }

        if (oldTable) {
            oldTable.destroy();
        }

        delete this.tables[elementId];
        delete this.states[elementId];

        const workTypes = [
            "401",
            "402",
            "801",
            "802"
        ];

        const baskets = [
            "الحاجة إلى ترخيص",
            "تحت التنفيذ",
            "207",
            "سلة المعاينة",
            "تعديل المقايسة",
            "الهندسة",
            "إنشاء صرف وإرجاع",
            "صرف وإرجاع",
            "شهادة الإنجاز الابتدائية",
            "شهادة الإنجاز النهائية",
            "تجهيز الفاتورة",
            "سلة الفواتير",
            "السلة المالية",
            "أمر العمل مغلق"
        ];

        const data = [];

        for (let index = 0; index < rowCount; index++) {
            const day =
                String((index % 28) + 1).padStart(2, "0");

            const month =
                String((index % 12) + 1).padStart(2, "0");

            data.push({
                id: index + 1,

                workOrderNumber:
                    String(233000001 + index),

                workTypeCode:
                    workTypes[index % workTypes.length],

                assignmentDate:
                    `${day}/${month}/2026`,

                basket:
                    baskets[index % baskets.length],

                status:
                    index % 4 === 0
                        ? "مشكلة"
                        : index % 4 === 1
                            ? "تحت التنفيذ"
                            : "",

                notes:
                    index % 5 === 0
                        ? "ملاحظة تجريبية لأمر العمل"
                        : ""
            });
        }

        const state = {
            undoStack: [],
            redoStack: [],

            applyingHistory: false,
            pendingEdit: null,

            maxTransactions: 100,

            isActive: false,
            keyDownHandler: null,
            copyHandler: null,
            pasteHandler: null,
            pointerDownHandler: null,

            externalFilters: {
                workOrderNumber: "",
                workTypeCodes: [],
                assignmentDates: [],
                bucketValues: []
            }
        };

        this.states[elementId] = state;

        const table = new Tabulator(element, {
            data: data,
            index: "id",

            height: "650px",
            layout: "fitColumns",
            renderVertical: "virtual",
            popupContainer: true,

            keybindings: {
                navDown: ["40", "13"]
            },

            /*
             * أوقفنا History الافتراضي لأننا سنستخدم
             * Transaction History خاصًا بنا.
             */
            history: false,

            selectableRange: 1,
            selectableRangeColumns: true,
            selectableRangeRows: true,
            selectableRangeClearCells: true,
            selectableRangeClearCellsValue: "",

            clipboard: true,

            clipboardCopyRowRange: "range",
            clipboardPasteParser: function (clipboard) {
                return window.tabulatorTest.parseClipboardText(
                    clipboard
                );
            },

            /*
             * كل عملية Paste تمر من هنا حتى نسجلها
             * كعملية واحدة مهما كان عدد الخلايا.
             */
            clipboardPasteAction: function (rowData) {
                return window.tabulatorTest.applyRangePaste(
                    elementId,
                    this.table,
                    rowData
                );
            },

            clipboardCopyStyled: false,

            clipboardCopyConfig: {
                rowHeaders: false,
                columnHeaders: false
            },

            editTriggerEvent: "dblclick",
            editorEmptyValue: undefined,

            rowHeader: {
                field: "rowNumber",
                formatter: "rownum",

                width: 55,
                frozen: true,
                resizable: false,

                headerSort: false,
                hozAlign: "center"
            },

            columnDefaults: {
                headerHozAlign: "center",
                vertAlign: "middle",
                resizable: "header"
            },

            columns: [
                {
                    title: "Work Order Number",
                    field: "workOrderNumber",
                    editor: "input",
                    minWidth: 210,
                    widthGrow: 1.15,
                    headerHozAlign: "left"
                },
                {
                    title: "Work Type",
                    field: "workTypeCode",
                    editor: "input",
                    headerSort: false,
                    minWidth: 150,
                    widthGrow: 0.8,
                    headerHozAlign: "left",

                    headerPopupIcon:
                        '<span class="work-type-filter-icon" title="Filter Work Type" aria-label="Filter Work Type">' +
                        '<svg viewBox="0 0 24 24" aria-hidden="true">' +
                        '<path d="M3 5h18l-7 8v5.2l-4 2V13L3 5z"></path>' +
                        '</svg>' +
                        '</span>',

                    headerPopup: function (
                        event,
                        column,
                        onRendered
                    ) {
                        return window.tabulatorTest
                            .createWorkTypeFilterPopup(
                                elementId,
                                column,
                                onRendered
                            );
                    }
                },
                {
                    title: "Assignment Date",
                    field: "assignmentDate",
                    editor:
                        window.tabulatorTest
                            .assignmentDateEditor,
                    directTyping: true,
                    headerSort: false,
                    minWidth: 185,
                    widthGrow: 0.95,
                    headerHozAlign: "left",

                    headerPopupIcon:
                        '<span class="work-type-filter-icon" title="Filter Assignment Date" aria-label="Filter Assignment Date">' +
                        '<svg viewBox="0 0 24 24" aria-hidden="true">' +
                        '<path d="M3 5h18l-7 8v5.2l-4 2V13L3 5z"></path>' +
                        '</svg>' +
                        '</span>',

                    headerPopup: function (
                        event,
                        column,
                        onRendered
                    ) {
                        return window.tabulatorTest
                            .createAssignmentDateFilterPopup(
                                elementId,
                                column,
                                onRendered
                            );
                    }
                },
                {
                    title: "Bucket",
                    field: "basket",
                    editor: "list",
                    directTyping: true,
                    headerSort: false,
                    minWidth: 250,
                    widthGrow: 1.45,
                    headerHozAlign: "left",

                    editorParams: {
                        values: baskets,
                        autocomplete: true,
                        listOnEmpty: true,
                        clearable: false,
                        freetext: false,
                        verticalNavigation: "editor",
                        placeholderLoading: "Loading...",
                        placeholderEmpty: "No matching buckets"
                    },

                    headerPopupIcon:
                        '<span class="work-type-filter-icon" title="Filter Bucket" aria-label="Filter Bucket">' +
                        '<svg viewBox="0 0 24 24" aria-hidden="true">' +
                        '<path d="M3 5h18l-7 8v5.2l-4 2V13L3 5z"></path>' +
                        '</svg>' +
                        '</span>',

                    headerPopup: function (
                        event,
                        column,
                        onRendered
                    ) {
                        return window.tabulatorTest
                            .createBucketFilterPopup(
                                elementId,
                                column,
                                onRendered
                            );
                    }
                },
                {
                    title: "Status",
                    field: "status",
                    editor: "input",
                    minWidth: 180,
                    widthGrow: 1,
                    headerHozAlign: "left"
                },
                {
                    title: "Notes",
                    field: "notes",
                    editor: "input",
                    minWidth: 310,
                    widthGrow: 2,
                    headerHozAlign: "left"
                }
            ]
        });

        this.tables[elementId] = table;

        window.requestAnimationFrame(
            function () {
                window.tabulatorTest
                    .updateWorkTypeFilterIcon(
                        elementId
                    );

                window.tabulatorTest
                    .updateAssignmentDateFilterIcon(
                        elementId
                    );

                window.tabulatorTest
                    .updateBucketFilterIcon(
                        elementId
                    );
            }
        );

        /*
         * تسجيل القيمة قبل تعديل خلية واحدة.
         */
        table.on("cellEditing", function (cell) {
            if (state.applyingHistory) {
                return;
            }

            state.pendingEdit = {
                rowId: cell.getRow().getIndex(),
                field: cell.getField(),
                oldValue: cell.getValue()
            };
        });

        table.on("cellEditCancelled", function () {
            state.pendingEdit = null;
        });

        /*
         * تسجيل تعديل الخلية كعملية Undo واحدة.
         */
        table.on("cellEdited", function (cell) {
            if (state.applyingHistory) {
                return;
            }

            const rowId =
                cell.getRow().getIndex();

            const field =
                cell.getField();

            const pending =
                state.pendingEdit;

            const oldValue =
                pending &&
                    pending.rowId === rowId &&
                    pending.field === field
                    ? pending.oldValue
                    : cell.getOldValue();

            const newValue =
                cell.getValue();

            state.pendingEdit = null;

            if (Object.is(oldValue, newValue)) {
                return;
            }

            window.tabulatorTest.pushTransaction(
                elementId,
                {
                    type: "cell-edit",
                    label: "تعديل خلية",

                    changes: [
                        {
                            rowId: rowId,
                            field: field,

                            oldValue: oldValue,
                            newValue: newValue
                        }
                    ]
                }
            );

            if (field === "workTypeCode") {
                window.tabulatorTest
                    .refreshWorkTypeFilterState(
                        elementId
                    );
            }

            if (field === "assignmentDate") {
                window.tabulatorTest
                    .refreshAssignmentDateFilterState(
                        elementId
                    );
            }

            if (field === "basket") {
                window.tabulatorTest
                    .refreshBucketFilterState(
                        elementId
                    );
            }
        });

        table.on("clipboardCopied", function () {
            window.tabulatorTest.setStatus(
                elementId,
                "تم نسخ الخلايا المحددة."
            );
        });

        table.on("clipboardPasteError", function () {
            window.tabulatorTest.setStatus(
                elementId,
                "تعذر لصق البيانات المحددة."
            );
        });

        /*
         * نعتبر الشيت نشطًا عند تحديد خلية أو نطاق داخله.
         * الضغط خارج الشيت يوقف اختصاراته حتى لا تتعارض
         * مع حقول البحث والقوائم الموجودة في الصفحة.
         */
        table.on("cellMouseDown", function () {
            state.isActive = true;
        });

        table.on("rangeAdded", function () {
            state.isActive = true;
        });

        table.on("rangeChanged", function () {
            state.isActive = true;
        });

        state.pointerDownHandler = function (event) {
            state.isActive =
                element.contains(event.target);
        };

        document.addEventListener(
            "pointerdown",
            state.pointerDownHandler,
            true
        );

        /*
         * الكتابة المباشرة وUndo/Redo.
         *
         * نستخدم event.key للحرف المكتوب فعلًا داخل الخلية،
         * ونستخدم event.code للاختصارات حتى تعمل مع لوحة
         * المفاتيح العربية والإنجليزية بنفس الشكل.
         */
        state.keyDownHandler = function (event) {
            if (!state.isActive) {
                return;
            }

            const activeRange =
                window.tabulatorTest.getActiveRange(
                    table
                );

            if (!activeRange) {
                return;
            }

            if (
                window.tabulatorTest.isEditorTarget(
                    event.target
                )
            ) {
                return;
            }

            const isPrintableKey =
                event.key.length === 1 &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.altKey;

            if (isPrintableKey) {
                const selectedCells =
                    activeRange.getStructuredCells();

                const isSingleCell =
                    Array.isArray(selectedCells) &&
                    selectedCells.length === 1 &&
                    selectedCells[0].length === 1;

                if (isSingleCell) {
                    const cell =
                        selectedCells[0][0];

                    const columnDefinition =
                        cell
                            .getColumn()
                            .getDefinition();

                    /*
                     * الكتابة المباشرة للأعمدة النصية
                     * وعمود التاريخ ذي المحرر المخصص.
                     */
                    if (
                        columnDefinition.editor ===
                        "input" ||
                        columnDefinition.directTyping ===
                        true
                    ) {
                        event.preventDefault();
                        event.stopImmediatePropagation();

                        const typedCharacter =
                            event.key;

                        cell.edit();

                        window.requestAnimationFrame(
                            function () {
                                const cellElement =
                                    cell.getElement();

                                const editor =
                                    cellElement?.querySelector(
                                        "input:not([type='hidden']), textarea"
                                    );

                                if (!editor) {
                                    return;
                                }

                                editor.value =
                                    typedCharacter;

                                editor.dispatchEvent(
                                    new Event(
                                        "input",
                                        {
                                            bubbles: true
                                        }
                                    )
                                );

                                editor.focus();

                                if (
                                    typeof editor.setSelectionRange ===
                                    "function"
                                ) {
                                    editor.setSelectionRange(
                                        typedCharacter.length,
                                        typedCharacter.length
                                    );
                                }
                            }
                        );

                        return;
                    }
                }
            }

            const modifierPressed =
                event.ctrlKey || event.metaKey;

            if (
                !modifierPressed ||
                event.altKey
            ) {
                return;
            }

            const shortcutCode =
                event.code;

            if (shortcutCode === "KeyZ") {
                event.preventDefault();
                event.stopImmediatePropagation();

                if (event.shiftKey) {
                    window.tabulatorTest.redo(
                        elementId
                    );
                } else {
                    window.tabulatorTest.undo(
                        elementId
                    );
                }

                return;
            }

            if (shortcutCode === "KeyY") {
                event.preventDefault();
                event.stopImmediatePropagation();

                window.tabulatorTest.redo(
                    elementId
                );
            }
        };

        /*
         * Ctrl+C يطلق حدث copy من المتصفح.
         * نضع بيانات النطاق مباشرة في الحافظة حتى يعمل
         * الاختصار مع أي لغة للوحة المفاتيح.
         */
        state.copyHandler = function (event) {
            if (
                !state.isActive ||
                !event.clipboardData ||
                window.tabulatorTest.isEditorTarget(
                    event.target
                )
            ) {
                return;
            }

            const activeRange =
                window.tabulatorTest.getActiveRange(
                    table
                );

            if (!activeRange) {
                return;
            }

            const clipboardText =
                window.tabulatorTest.rangeToClipboardText(
                    activeRange
                );

            if (clipboardText === null) {
                return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();

            event.clipboardData.setData(
                "text/plain",
                clipboardText
            );

            window.tabulatorTest.setStatus(
                elementId,
                "تم نسخ الخلايا المحددة."
            );
        };

        /*
         * Ctrl+V يطلق حدث paste من المتصفح.
         * نقرأ النص من الحدث نفسه بدل Clipboard API،
         * فلا نحتاج إذنًا إضافيًا من المتصفح.
         */
        state.pasteHandler = function (event) {
            if (
                !state.isActive ||
                !event.clipboardData ||
                window.tabulatorTest.isEditorTarget(
                    event.target
                )
            ) {
                return;
            }

            const activeRange =
                window.tabulatorTest.getActiveRange(
                    table
                );

            if (!activeRange) {
                return;
            }

            const clipboardText =
                event.clipboardData.getData(
                    "text/plain"
                );

            const parsedData =
                window.tabulatorTest.parseClipboardText(
                    clipboardText
                );

            if (!parsedData) {
                window.tabulatorTest.setStatus(
                    elementId,
                    "لا توجد بيانات صالحة للصق."
                );

                return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();

            window.tabulatorTest.applyRangePaste(
                elementId,
                table,
                parsedData
            );

            window.tabulatorTest.setStatus(
                elementId,
                "تم لصق البيانات."
            );
        };

        document.addEventListener(
            "keydown",
            state.keyDownHandler,
            true
        );

        document.addEventListener(
            "copy",
            state.copyHandler,
            true
        );

        document.addEventListener(
            "paste",
            state.pasteHandler,
            true
        );

        this.setStatus(
            elementId,
            `تم إنشاء ${rowCount.toLocaleString()} صف تجريبي.`
        );
    },

    /*
     * منع عجلة الماوس واللمس داخل نافذة الفلتر
     * من تحريك الجدول الموجود خلفها.
     * العنصر الداخلي القابل للتمرير يظل يعمل طبيعيًا.
     */
    protectFilterPopupScrolling: function (
        container
    ) {
        if (!container) {
            return;
        }

        container.addEventListener(
            "wheel",
            function (event) {
                event.stopPropagation();
            },
            {
                passive: true
            }
        );

        container.addEventListener(
            "touchmove",
            function (event) {
                event.stopPropagation();
            },
            {
                passive: true
            }
        );
    },

    /*
     * البحث المستقل برقم أمر العمل.
     * فلتر نوع العمل الموجود داخل رأس العمود يظل محفوظًا.
     */
    filterByWorkOrder: function (elementId, value) {
        const state = this.states[elementId];

        if (!state) {
            return;
        }

        state.externalFilters.workOrderNumber =
            String(value ?? "").trim();

        this.applyExternalFilters(elementId);
    },

    /*
     * جلب جميع أنواع العمل الفعلية من بيانات الشيت.
     * القيم ليست ثابتة داخل الكود.
     */
    getUniqueWorkTypes: function (elementId) {
        const table = this.tables[elementId];

        if (!table) {
            return [];
        }

        return Array.from(
            new Set(
                table
                    .getData()
                    .map(function (row) {
                        return String(
                            row.workTypeCode ?? ""
                        ).trim();
                    })
                    .filter(function (value) {
                        return value !== "";
                    })
            )
        ).sort(function (first, second) {
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

    /*
     * إنشاء نافذة فلترة تشبه Excel:
     * بحث داخلي + تحديد الكل + اختيارات متعددة.
     */
    createWorkTypeFilterPopup: function (
        elementId,
        column,
        onRendered
    ) {
        const state = this.states[elementId];
        const uniqueValues =
            this.getUniqueWorkTypes(elementId);

        const appliedValues =
            state?.externalFilters
                ?.workTypeCodes ?? [];

        const pendingValues =
            new Set(
                appliedValues.length > 0
                    ? appliedValues
                    : uniqueValues
            );

        const container =
            document.createElement("div");

        container.className =
            "work-type-filter-popup";

        container.dir = "ltr";

        this.protectFilterPopupScrolling(
            container
        );

        const resizeHandle =
            document.createElement("div");

        resizeHandle.className =
            "work-type-filter-resize-handle";

        resizeHandle.title =
            "Drag to resize";

        const title =
            document.createElement("div");

        title.className =
            "work-type-filter-popup-title";

        title.textContent =
            "Filter Work Type";

        const searchInput =
            document.createElement("input");

        searchInput.className =
            "work-type-filter-popup-search";

        searchInput.type = "search";
        searchInput.placeholder = "Search values...";
        searchInput.autocomplete = "off";

        const selectAllLabel =
            document.createElement("label");

        selectAllLabel.className =
            "work-type-filter-option work-type-filter-select-all";

        const selectAllCheckbox =
            document.createElement("input");

        selectAllCheckbox.type = "checkbox";

        const selectAllText =
            document.createElement("span");

        selectAllText.textContent =
            "Select All";

        selectAllLabel.append(
            selectAllCheckbox,
            selectAllText
        );

        const optionsContainer =
            document.createElement("div");

        optionsContainer.className =
            "work-type-filter-options";

        const emptyMessage =
            document.createElement("div");

        emptyMessage.className =
            "work-type-filter-empty";

        emptyMessage.textContent =
            "No matching values.";

        const actions =
            document.createElement("div");

        actions.className =
            "work-type-filter-actions";

        const clearButton =
            document.createElement("button");

        clearButton.type = "button";
        clearButton.className =
            "work-type-filter-button work-type-filter-button-secondary";
        clearButton.textContent = "Clear Filter";

        const applyButton =
            document.createElement("button");

        applyButton.type = "button";
        applyButton.className =
            "work-type-filter-button work-type-filter-button-primary";
        applyButton.textContent = "Apply";

        actions.append(
            clearButton,
            applyButton
        );

        const updateSelectAllState = function () {
            selectAllCheckbox.checked =
                uniqueValues.length > 0 &&
                pendingValues.size ===
                uniqueValues.length;

            selectAllCheckbox.indeterminate =
                pendingValues.size > 0 &&
                pendingValues.size <
                uniqueValues.length;
        };

        const renderOptions = function () {
            const query =
                searchInput.value
                    .trim()
                    .toLocaleLowerCase();

            optionsContainer.replaceChildren();

            let visibleCount = 0;

            uniqueValues.forEach(function (value) {
                if (
                    query !== "" &&
                    !value
                        .toLocaleLowerCase()
                        .includes(query)
                ) {
                    return;
                }

                visibleCount++;

                const optionLabel =
                    document.createElement("label");

                optionLabel.className =
                    "work-type-filter-option";

                const checkbox =
                    document.createElement("input");

                checkbox.type = "checkbox";
                checkbox.value = value;
                checkbox.checked =
                    pendingValues.has(value);

                const optionText =
                    document.createElement("span");

                optionText.textContent = value;

                checkbox.addEventListener(
                    "change",
                    function () {
                        if (checkbox.checked) {
                            pendingValues.add(value);
                        } else {
                            pendingValues.delete(value);
                        }

                        updateSelectAllState();
                    }
                );

                optionLabel.append(
                    checkbox,
                    optionText
                );

                optionsContainer.appendChild(
                    optionLabel
                );
            });

            if (visibleCount === 0) {
                optionsContainer.appendChild(
                    emptyMessage
                );
            }
        };

        selectAllCheckbox.addEventListener(
            "change",
            function () {
                pendingValues.clear();

                if (selectAllCheckbox.checked) {
                    uniqueValues.forEach(
                        value =>
                            pendingValues.add(value)
                    );
                }

                renderOptions();
                updateSelectAllState();
            }
        );

        searchInput.addEventListener(
            "input",
            renderOptions
        );

        clearButton.addEventListener(
            "click",
            function () {
                if (!state) {
                    return;
                }

                state.externalFilters.workTypeCodes = [];

                window.tabulatorTest
                    .applyExternalFilters(
                        elementId
                    );

                window.tabulatorTest
                    .updateWorkTypeFilterIcon(
                        elementId
                    );

                column.getElement().click();
            }
        );

        applyButton.addEventListener(
            "click",
            function () {
                if (!state) {
                    return;
                }

                const selectedValues =
                    uniqueValues.filter(
                        value =>
                            pendingValues.has(value)
                    );

                state.externalFilters.workTypeCodes =
                    selectedValues.length ===
                        uniqueValues.length
                        ? []
                        : selectedValues;

                window.tabulatorTest
                    .applyExternalFilters(
                        elementId
                    );

                window.tabulatorTest
                    .updateWorkTypeFilterIcon(
                        elementId
                    );

                column.getElement().click();
            }
        );

        container.append(
            title,
            searchInput,
            selectAllLabel,
            optionsContainer,
            actions,
            resizeHandle
        );

        updateSelectAllState();
        renderOptions();

        if (typeof onRendered === "function") {
            onRendered(function () {
                const popupShell =
                    container.closest(
                        ".tabulator-popup-container"
                    );

                if (!popupShell) {
                    searchInput.focus();
                    return;
                }

                popupShell.classList.add(
                    "work-type-filter-popup-shell"
                );

                const storageKey =
                    "uds-work-type-filter-size";

                let storedSize = null;

                try {
                    storedSize =
                        JSON.parse(
                            localStorage.getItem(
                                storageKey
                            )
                        );
                } catch {
                    storedSize = null;
                }

                const initialWidth =
                    Number(storedSize?.width) || 260;

                const initialHeight =
                    Number(storedSize?.height) || 360;

                popupShell.style.width =
                    `${Math.min(
                        Math.max(initialWidth, 230),
                        520
                    )}px`;

                popupShell.style.height =
                    `${Math.min(
                        Math.max(initialHeight, 285),
                        620
                    )}px`;

                resizeHandle.addEventListener(
                    "pointerdown",
                    function (event) {
                        event.preventDefault();
                        event.stopPropagation();
                        event.stopImmediatePropagation();

                        const startX = event.clientX;
                        const startY = event.clientY;

                        const startWidth =
                            popupShell.offsetWidth;

                        const startHeight =
                            popupShell.offsetHeight;

                        resizeHandle.setPointerCapture(
                            event.pointerId
                        );

                        const handleMove =
                            function (moveEvent) {
                                moveEvent.preventDefault();
                                moveEvent.stopPropagation();

                                const nextWidth =
                                    Math.min(
                                        Math.max(
                                            startWidth +
                                            (
                                                moveEvent.clientX -
                                                startX
                                            ),
                                            230
                                        ),
                                        520
                                    );

                                const nextHeight =
                                    Math.min(
                                        Math.max(
                                            startHeight +
                                            (
                                                moveEvent.clientY -
                                                startY
                                            ),
                                            285
                                        ),
                                        620
                                    );

                                popupShell.style.width =
                                    `${nextWidth}px`;

                                popupShell.style.height =
                                    `${nextHeight}px`;
                            };

                        const handleUp =
                            function (upEvent) {
                                upEvent.preventDefault();
                                upEvent.stopPropagation();

                                resizeHandle.removeEventListener(
                                    "pointermove",
                                    handleMove
                                );

                                resizeHandle.removeEventListener(
                                    "pointerup",
                                    handleUp
                                );

                                resizeHandle.removeEventListener(
                                    "pointercancel",
                                    handleUp
                                );

                                localStorage.setItem(
                                    storageKey,
                                    JSON.stringify({
                                        width:
                                            popupShell.offsetWidth,
                                        height:
                                            popupShell.offsetHeight
                                    })
                                );
                            };

                        resizeHandle.addEventListener(
                            "pointermove",
                            handleMove
                        );

                        resizeHandle.addEventListener(
                            "pointerup",
                            handleUp
                        );

                        resizeHandle.addEventListener(
                            "pointercancel",
                            handleUp
                        );
                    },
                    true
                );

                searchInput.focus();
            });
        }

        return container;
    },

    /*
     * جلب جميع قيم Bucket الموجودة فعليًا في الشيت،
     * بدون قيم ثابتة داخل الفلتر.
     */
    getUniqueBuckets: function (elementId) {
        const table = this.tables[elementId];

        if (!table) {
            return [];
        }

        return Array.from(
            new Set(
                table
                    .getData()
                    .map(function (row) {
                        return String(
                            row.basket ?? ""
                        ).trim();
                    })
                    .filter(function (value) {
                        return value !== "";
                    })
            )
        ).sort(function (first, second) {
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

    /*
     * فلتر Bucket بأسلوب Excel:
     * بحث + تحديد الكل + اختيار متعدد.
     */
    createBucketFilterPopup: function (
        elementId,
        column,
        onRendered
    ) {
        const state = this.states[elementId];

        const uniqueValues =
            this.getUniqueBuckets(
                elementId
            );

        const appliedValues =
            state?.externalFilters
                ?.bucketValues ?? [];

        const pendingValues =
            new Set(
                appliedValues.length > 0
                    ? appliedValues
                    : uniqueValues
            );

        const container =
            document.createElement("div");

        container.className =
            "bucket-filter-popup";

        container.dir = "ltr";

        this.protectFilterPopupScrolling(
            container
        );

        const title =
            document.createElement("div");

        title.className =
            "work-type-filter-popup-title";

        title.textContent =
            "Filter Bucket";

        const searchInput =
            document.createElement("input");

        searchInput.type = "search";
        searchInput.autocomplete = "off";
        searchInput.placeholder =
            "Search values...";
        searchInput.className =
            "work-type-filter-popup-search";

        const selectAllLabel =
            document.createElement("label");

        selectAllLabel.className =
            "work-type-filter-option work-type-filter-select-all";

        const selectAllCheckbox =
            document.createElement("input");

        selectAllCheckbox.type =
            "checkbox";

        const selectAllText =
            document.createElement("span");

        selectAllText.textContent =
            "Select All";

        selectAllLabel.append(
            selectAllCheckbox,
            selectAllText
        );

        const optionsContainer =
            document.createElement("div");

        optionsContainer.className =
            "bucket-filter-options";

        const emptyMessage =
            document.createElement("div");

        emptyMessage.className =
            "work-type-filter-empty";

        emptyMessage.textContent =
            "No matching values.";

        const actions =
            document.createElement("div");

        actions.className =
            "work-type-filter-actions";

        const clearButton =
            document.createElement("button");

        clearButton.type = "button";
        clearButton.className =
            "work-type-filter-button work-type-filter-button-secondary";
        clearButton.textContent =
            "Clear Filter";

        const applyButton =
            document.createElement("button");

        applyButton.type = "button";
        applyButton.className =
            "work-type-filter-button work-type-filter-button-primary";
        applyButton.textContent =
            "Apply";

        actions.append(
            clearButton,
            applyButton
        );

        const updateSelectAllState =
            function () {
                selectAllCheckbox.checked =
                    uniqueValues.length > 0 &&
                    pendingValues.size ===
                    uniqueValues.length;

                selectAllCheckbox.indeterminate =
                    pendingValues.size > 0 &&
                    pendingValues.size <
                    uniqueValues.length;
            };

        const renderOptions =
            function () {
                const query =
                    searchInput.value
                        .trim()
                        .toLocaleLowerCase();

                optionsContainer
                    .replaceChildren();

                let visibleCount = 0;

                uniqueValues.forEach(
                    function (value) {
                        if (
                            query !== "" &&
                            !value
                                .toLocaleLowerCase()
                                .includes(query)
                        ) {
                            return;
                        }

                        visibleCount++;

                        const optionLabel =
                            document.createElement(
                                "label"
                            );

                        optionLabel.className =
                            "work-type-filter-option";

                        const checkbox =
                            document.createElement(
                                "input"
                            );

                        checkbox.type =
                            "checkbox";

                        checkbox.checked =
                            pendingValues.has(
                                value
                            );

                        const optionText =
                            document.createElement(
                                "span"
                            );

                        optionText.textContent =
                            value;

                        checkbox.addEventListener(
                            "change",
                            function () {
                                if (
                                    checkbox.checked
                                ) {
                                    pendingValues.add(
                                        value
                                    );
                                } else {
                                    pendingValues.delete(
                                        value
                                    );
                                }

                                updateSelectAllState();
                            }
                        );

                        optionLabel.append(
                            checkbox,
                            optionText
                        );

                        optionsContainer
                            .appendChild(
                                optionLabel
                            );
                    }
                );

                if (visibleCount === 0) {
                    optionsContainer
                        .appendChild(
                            emptyMessage
                        );
                }
            };

        selectAllCheckbox.addEventListener(
            "change",
            function () {
                pendingValues.clear();

                if (
                    selectAllCheckbox.checked
                ) {
                    uniqueValues.forEach(
                        value =>
                            pendingValues.add(
                                value
                            )
                    );
                }

                renderOptions();
                updateSelectAllState();
            }
        );

        searchInput.addEventListener(
            "input",
            renderOptions
        );

        clearButton.addEventListener(
            "click",
            function () {
                if (!state) {
                    return;
                }

                state.externalFilters
                    .bucketValues = [];

                window.tabulatorTest
                    .applyExternalFilters(
                        elementId
                    );

                window.tabulatorTest
                    .updateBucketFilterIcon(
                        elementId
                    );

                column.getElement().click();
            }
        );

        applyButton.addEventListener(
            "click",
            function () {
                if (!state) {
                    return;
                }

                const selectedValues =
                    uniqueValues.filter(
                        value =>
                            pendingValues.has(
                                value
                            )
                    );

                state.externalFilters
                    .bucketValues =
                    selectedValues.length ===
                        uniqueValues.length
                        ? []
                        : selectedValues;

                window.tabulatorTest
                    .applyExternalFilters(
                        elementId
                    );

                window.tabulatorTest
                    .updateBucketFilterIcon(
                        elementId
                    );

                column.getElement().click();
            }
        );

        container.append(
            title,
            searchInput,
            selectAllLabel,
            optionsContainer,
            actions
        );

        updateSelectAllState();
        renderOptions();

        if (
            typeof onRendered === "function"
        ) {
            onRendered(function () {
                const popupShell =
                    container.closest(
                        ".tabulator-popup-container"
                    );

                popupShell?.classList.add(
                    "bucket-filter-popup-shell"
                );

                searchInput.focus();
            });
        }

        return container;
    },

    /*
     * قراءة كل تواريخ الإسناد الفعلية من الشيت،
     * مرتبة زمنيًا، بدون تكرار.
     */
    getUniqueAssignmentDates: function (elementId) {
        const table = this.tables[elementId];

        if (!table) {
            return [];
        }

        const values = Array.from(
            new Set(
                table
                    .getData()
                    .map(function (row) {
                        return window.tabulatorTest
                            .normalizeAssignmentDate(
                                row.assignmentDate
                            );
                    })
                    .filter(function (value) {
                        return (
                            value !== null &&
                            value !== ""
                        );
                    })
            )
        );

        return values.sort(function (first, second) {
            const firstParts =
                first.split("/").map(Number);

            const secondParts =
                second.split("/").map(Number);

            const firstTime =
                Date.UTC(
                    firstParts[2],
                    firstParts[1] - 1,
                    firstParts[0]
                );

            const secondTime =
                Date.UTC(
                    secondParts[2],
                    secondParts[1] - 1,
                    secondParts[0]
                );

            return firstTime - secondTime;
        });
    },

    /*
     * إنشاء فلتر تاريخ شبيه بـ Excel:
     * سنة ← شهر ← تواريخ فعلية.
     */
    createAssignmentDateFilterPopup: function (
        elementId,
        column,
        onRendered
    ) {
        const state = this.states[elementId];

        const uniqueDates =
            this.getUniqueAssignmentDates(
                elementId
            );

        const appliedDates =
            state?.externalFilters
                ?.assignmentDates ?? [];

        const pendingDates =
            new Set(
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

        const grouped = new Map();

        uniqueDates.forEach(function (dateValue) {
            const parts =
                dateValue.split("/").map(Number);

            const day = parts[0];
            const month = parts[1];
            const year = parts[2];

            if (!grouped.has(year)) {
                grouped.set(year, new Map());
            }

            const months =
                grouped.get(year);

            if (!months.has(month)) {
                months.set(month, []);
            }

            months.get(month).push({
                day: day,
                value: dateValue
            });
        });

        const container =
            document.createElement("div");

        container.className =
            "date-filter-popup";

        container.dir = "ltr";

        this.protectFilterPopupScrolling(
            container
        );

        const title =
            document.createElement("div");

        title.className =
            "date-filter-popup-title";

        title.textContent =
            "Filter Assignment Date";

        const searchInput =
            document.createElement("input");

        searchInput.type = "search";
        searchInput.autocomplete = "off";
        searchInput.placeholder =
            "Search dates...";
        searchInput.className =
            "date-filter-popup-search";

        const selectAllLabel =
            document.createElement("label");

        selectAllLabel.className =
            "date-filter-check-row date-filter-select-all";

        const selectAllCheckbox =
            document.createElement("input");

        selectAllCheckbox.type = "checkbox";

        const selectAllText =
            document.createElement("span");

        selectAllText.textContent =
            "Select All";

        selectAllLabel.append(
            selectAllCheckbox,
            selectAllText
        );

        const tree =
            document.createElement("div");

        tree.className =
            "date-filter-tree";

        const emptyMessage =
            document.createElement("div");

        emptyMessage.className =
            "date-filter-empty";

        emptyMessage.textContent =
            "No matching dates.";

        const actions =
            document.createElement("div");

        actions.className =
            "date-filter-actions";

        const clearButton =
            document.createElement("button");

        clearButton.type = "button";
        clearButton.className =
            "date-filter-button date-filter-button-secondary";
        clearButton.textContent =
            "Clear Filter";

        const applyButton =
            document.createElement("button");

        applyButton.type = "button";
        applyButton.className =
            "date-filter-button date-filter-button-primary";
        applyButton.textContent =
            "Apply";

        actions.append(
            clearButton,
            applyButton
        );

        const resizeHandle =
            document.createElement("div");

        resizeHandle.className =
            "date-filter-resize-handle";

        resizeHandle.title =
            "Drag to resize";

        const updateSelectAllState =
            function () {
                selectAllCheckbox.checked =
                    uniqueDates.length > 0 &&
                    pendingDates.size ===
                    uniqueDates.length;

                selectAllCheckbox.indeterminate =
                    pendingDates.size > 0 &&
                    pendingDates.size <
                    uniqueDates.length;
            };

        const updateGroupCheckbox =
            function (
                checkbox,
                groupDates
            ) {
                const selectedCount =
                    groupDates.filter(
                        value =>
                            pendingDates.has(value)
                    ).length;

                checkbox.checked =
                    selectedCount ===
                    groupDates.length &&
                    groupDates.length > 0;

                checkbox.indeterminate =
                    selectedCount > 0 &&
                    selectedCount <
                    groupDates.length;
            };

        const createToggle =
            function (
                initiallyExpanded
            ) {
                const button =
                    document.createElement("button");

                button.type = "button";
                button.className =
                    "date-filter-toggle";

                button.textContent =
                    initiallyExpanded
                        ? "−"
                        : "+";

                return button;
            };

        const renderTree = function () {
            const query =
                searchInput.value
                    .trim()
                    .toLocaleLowerCase();

            tree.replaceChildren();

            let visibleDates = 0;

            Array.from(grouped.keys())
                .sort((a, b) => a - b)
                .forEach(function (year) {
                    const months =
                        grouped.get(year);

                    const yearDates = [];

                    months.forEach(function (
                        dates
                    ) {
                        dates.forEach(function (
                            item
                        ) {
                            yearDates.push(
                                item.value
                            );
                        });
                    });

                    const matchingYearDates =
                        yearDates.filter(
                            function (dateValue) {
                                return (
                                    query === "" ||
                                    dateValue
                                        .toLocaleLowerCase()
                                        .includes(query) ||
                                    String(year)
                                        .includes(query)
                                );
                            }
                        );

                    if (
                        query !== "" &&
                        matchingYearDates.length === 0
                    ) {
                        return;
                    }

                    const yearGroup =
                        document.createElement("div");

                    yearGroup.className =
                        "date-filter-group";

                    const yearHeader =
                        document.createElement("div");

                    yearHeader.className =
                        "date-filter-group-header";

                    const yearToggle =
                        createToggle(query !== "");

                    const yearCheckbox =
                        document.createElement("input");

                    yearCheckbox.type =
                        "checkbox";

                    const yearLabel =
                        document.createElement("span");

                    yearLabel.textContent =
                        String(year);

                    yearHeader.append(
                        yearToggle,
                        yearCheckbox,
                        yearLabel
                    );

                    const yearBody =
                        document.createElement("div");

                    yearBody.className =
                        "date-filter-group-body";

                    if (query === "") {
                        yearBody.hidden = true;
                    }

                    yearToggle.addEventListener(
                        "click",
                        function () {
                            yearBody.hidden =
                                !yearBody.hidden;

                            yearToggle.textContent =
                                yearBody.hidden
                                    ? "+"
                                    : "−";
                        }
                    );

                    yearCheckbox.addEventListener(
                        "change",
                        function () {
                            yearDates.forEach(
                                function (
                                    dateValue
                                ) {
                                    if (
                                        yearCheckbox.checked
                                    ) {
                                        pendingDates.add(
                                            dateValue
                                        );
                                    } else {
                                        pendingDates.delete(
                                            dateValue
                                        );
                                    }
                                }
                            );

                            renderTree();
                            updateSelectAllState();
                        }
                    );

                    updateGroupCheckbox(
                        yearCheckbox,
                        yearDates
                    );

                    Array.from(months.keys())
                        .sort((a, b) => a - b)
                        .forEach(function (
                            month
                        ) {
                            const monthItems =
                                months.get(month);

                            const monthDates =
                                monthItems.map(
                                    item =>
                                        item.value
                                );

                            const matchingItems =
                                monthItems.filter(
                                    function (
                                        item
                                    ) {
                                        return (
                                            query === "" ||
                                            item.value
                                                .toLocaleLowerCase()
                                                .includes(
                                                    query
                                                ) ||
                                            monthNames[
                                                month
                                            ]
                                                .toLocaleLowerCase()
                                                .includes(
                                                    query
                                                ) ||
                                            String(month)
                                                .includes(
                                                    query
                                                )
                                        );
                                    }
                                );

                            if (
                                query !== "" &&
                                matchingItems.length === 0
                            ) {
                                return;
                            }

                            const monthGroup =
                                document.createElement("div");

                            monthGroup.className =
                                "date-filter-month";

                            const monthHeader =
                                document.createElement("div");

                            monthHeader.className =
                                "date-filter-month-header";

                            const monthToggle =
                                createToggle(
                                    query !== ""
                                );

                            const monthCheckbox =
                                document.createElement("input");

                            monthCheckbox.type =
                                "checkbox";

                            const monthLabel =
                                document.createElement("span");

                            monthLabel.textContent =
                                monthNames[month];

                            monthHeader.append(
                                monthToggle,
                                monthCheckbox,
                                monthLabel
                            );

                            const monthBody =
                                document.createElement("div");

                            monthBody.className =
                                "date-filter-month-body";

                            if (query === "") {
                                monthBody.hidden = true;
                            }

                            monthToggle.addEventListener(
                                "click",
                                function () {
                                    monthBody.hidden =
                                        !monthBody.hidden;

                                    monthToggle.textContent =
                                        monthBody.hidden
                                            ? "+"
                                            : "−";
                                }
                            );

                            monthCheckbox.addEventListener(
                                "change",
                                function () {
                                    monthDates.forEach(
                                        function (
                                            dateValue
                                        ) {
                                            if (
                                                monthCheckbox.checked
                                            ) {
                                                pendingDates.add(
                                                    dateValue
                                                );
                                            } else {
                                                pendingDates.delete(
                                                    dateValue
                                                );
                                            }
                                        }
                                    );

                                    renderTree();
                                    updateSelectAllState();
                                }
                            );

                            updateGroupCheckbox(
                                monthCheckbox,
                                monthDates
                            );

                            matchingItems.forEach(
                                function (item) {
                                    visibleDates++;

                                    const dateRow =
                                        document.createElement(
                                            "label"
                                        );

                                    dateRow.className =
                                        "date-filter-check-row date-filter-date-row";

                                    const checkbox =
                                        document.createElement(
                                            "input"
                                        );

                                    checkbox.type =
                                        "checkbox";

                                    checkbox.checked =
                                        pendingDates.has(
                                            item.value
                                        );

                                    const text =
                                        document.createElement(
                                            "span"
                                        );

                                    text.textContent =
                                        item.value;

                                    checkbox.addEventListener(
                                        "change",
                                        function () {
                                            if (
                                                checkbox.checked
                                            ) {
                                                pendingDates.add(
                                                    item.value
                                                );
                                            } else {
                                                pendingDates.delete(
                                                    item.value
                                                );
                                            }

                                            updateSelectAllState();
                                            updateGroupCheckbox(
                                                monthCheckbox,
                                                monthDates
                                            );
                                            updateGroupCheckbox(
                                                yearCheckbox,
                                                yearDates
                                            );
                                        }
                                    );

                                    dateRow.append(
                                        checkbox,
                                        text
                                    );

                                    monthBody.appendChild(
                                        dateRow
                                    );
                                }
                            );

                            monthGroup.append(
                                monthHeader,
                                monthBody
                            );

                            yearBody.appendChild(
                                monthGroup
                            );
                        });

                    yearGroup.append(
                        yearHeader,
                        yearBody
                    );

                    tree.appendChild(
                        yearGroup
                    );
                });

            if (visibleDates === 0) {
                tree.appendChild(
                    emptyMessage
                );
            }
        };

        selectAllCheckbox.addEventListener(
            "change",
            function () {
                pendingDates.clear();

                if (
                    selectAllCheckbox.checked
                ) {
                    uniqueDates.forEach(
                        value =>
                            pendingDates.add(value)
                    );
                }

                renderTree();
                updateSelectAllState();
            }
        );

        searchInput.addEventListener(
            "input",
            renderTree
        );

        clearButton.addEventListener(
            "click",
            function () {
                if (!state) {
                    return;
                }

                state.externalFilters
                    .assignmentDates = [];

                window.tabulatorTest
                    .applyExternalFilters(
                        elementId
                    );

                window.tabulatorTest
                    .updateAssignmentDateFilterIcon(
                        elementId
                    );

                column.getElement().click();
            }
        );

        applyButton.addEventListener(
            "click",
            function () {
                if (!state) {
                    return;
                }

                const selectedDates =
                    uniqueDates.filter(
                        value =>
                            pendingDates.has(value)
                    );

                state.externalFilters
                    .assignmentDates =
                    selectedDates.length ===
                        uniqueDates.length
                        ? []
                        : selectedDates;

                window.tabulatorTest
                    .applyExternalFilters(
                        elementId
                    );

                window.tabulatorTest
                    .updateAssignmentDateFilterIcon(
                        elementId
                    );

                column.getElement().click();
            }
        );

        container.append(
            title,
            searchInput,
            selectAllLabel,
            tree,
            actions,
            resizeHandle
        );

        updateSelectAllState();
        renderTree();

        if (
            typeof onRendered === "function"
        ) {
            onRendered(function () {
                const popupShell =
                    container.closest(
                        ".tabulator-popup-container"
                    );

                if (!popupShell) {
                    searchInput.focus();
                    return;
                }

                popupShell.classList.add(
                    "assignment-date-filter-popup-shell"
                );

                const storageKey =
                    "uds-assignment-date-filter-size";

                let storedSize = null;

                try {
                    storedSize =
                        JSON.parse(
                            localStorage.getItem(
                                storageKey
                            )
                        );
                } catch {
                    storedSize = null;
                }

                const initialWidth =
                    Number(
                        storedSize?.width
                    ) || 275;

                const initialHeight =
                    Number(
                        storedSize?.height
                    ) || 420;

                popupShell.style.width =
                    `${Math.min(
                        Math.max(
                            initialWidth,
                            245
                        ),
                        540
                    )}px`;

                popupShell.style.height =
                    `${Math.min(
                        Math.max(
                            initialHeight,
                            320
                        ),
                        650
                    )}px`;

                resizeHandle.addEventListener(
                    "pointerdown",
                    function (event) {
                        event.preventDefault();
                        event.stopPropagation();
                        event.stopImmediatePropagation();

                        const startX =
                            event.clientX;

                        const startY =
                            event.clientY;

                        const startWidth =
                            popupShell.offsetWidth;

                        const startHeight =
                            popupShell.offsetHeight;

                        resizeHandle
                            .setPointerCapture(
                                event.pointerId
                            );

                        const handleMove =
                            function (
                                moveEvent
                            ) {
                                moveEvent
                                    .preventDefault();

                                moveEvent
                                    .stopPropagation();

                                const nextWidth =
                                    Math.min(
                                        Math.max(
                                            startWidth +
                                            (
                                                moveEvent
                                                    .clientX -
                                                startX
                                            ),
                                            245
                                        ),
                                        540
                                    );

                                const nextHeight =
                                    Math.min(
                                        Math.max(
                                            startHeight +
                                            (
                                                moveEvent
                                                    .clientY -
                                                startY
                                            ),
                                            320
                                        ),
                                        650
                                    );

                                popupShell.style.width =
                                    `${nextWidth}px`;

                                popupShell.style.height =
                                    `${nextHeight}px`;
                            };

                        const handleUp =
                            function (
                                upEvent
                            ) {
                                upEvent
                                    .preventDefault();

                                upEvent
                                    .stopPropagation();

                                resizeHandle
                                    .removeEventListener(
                                        "pointermove",
                                        handleMove
                                    );

                                resizeHandle
                                    .removeEventListener(
                                        "pointerup",
                                        handleUp
                                    );

                                resizeHandle
                                    .removeEventListener(
                                        "pointercancel",
                                        handleUp
                                    );

                                localStorage.setItem(
                                    storageKey,
                                    JSON.stringify({
                                        width:
                                            popupShell
                                                .offsetWidth,
                                        height:
                                            popupShell
                                                .offsetHeight
                                    })
                                );
                            };

                        resizeHandle
                            .addEventListener(
                                "pointermove",
                                handleMove
                            );

                        resizeHandle
                            .addEventListener(
                                "pointerup",
                                handleUp
                            );

                        resizeHandle
                            .addEventListener(
                                "pointercancel",
                                handleUp
                            );
                    },
                    true
                );

                searchInput.focus();
            });
        }

        return container;
    },

    /*
     * تطبيق بحث أمر العمل وفلتر أنواع العمل معًا.
     */
    applyExternalFilters: function (elementId) {
        const table = this.tables[elementId];
        const state = this.states[elementId];

        if (!table || !state) {
            return;
        }

        const workOrderNumber =
            state.externalFilters.workOrderNumber
                .toLocaleLowerCase();

        const workTypeCodes =
            new Set(
                state.externalFilters.workTypeCodes
            );

        const hasWorkOrderSearch =
            workOrderNumber !== "";

        const hasWorkTypeFilter =
            workTypeCodes.size > 0;

        const assignmentDates =
            new Set(
                state.externalFilters
                    .assignmentDates
            );

        const hasAssignmentDateFilter =
            assignmentDates.size > 0;

        const bucketValues =
            new Set(
                state.externalFilters
                    .bucketValues
            );

        const hasBucketFilter =
            bucketValues.size > 0;

        if (
            !hasWorkOrderSearch &&
            !hasWorkTypeFilter &&
            !hasAssignmentDateFilter &&
            !hasBucketFilter
        ) {
            table.clearFilter();
        } else {
            table.setFilter(function (rowData) {
                const matchesWorkOrder =
                    !hasWorkOrderSearch ||
                    String(
                        rowData.workOrderNumber ?? ""
                    )
                        .toLocaleLowerCase()
                        .includes(workOrderNumber);

                const matchesWorkType =
                    !hasWorkTypeFilter ||
                    workTypeCodes.has(
                        String(
                            rowData.workTypeCode ?? ""
                        ).trim()
                    );

                const normalizedDate =
                    window.tabulatorTest
                        .normalizeAssignmentDate(
                            rowData.assignmentDate
                        );

                const matchesAssignmentDate =
                    !hasAssignmentDateFilter ||
                    assignmentDates.has(
                        normalizedDate
                    );

                const matchesBucket =
                    !hasBucketFilter ||
                    bucketValues.has(
                        String(
                            rowData.basket ?? ""
                        ).trim()
                    );

                return (
                    matchesWorkOrder &&
                    matchesWorkType &&
                    matchesAssignmentDate &&
                    matchesBucket
                );
            });
        }

        const visibleRows =
            table.getDataCount("active");

        const totalRows =
            table.getDataCount();

        this.setStatus(
            elementId,
            `المعروض ${visibleRows.toLocaleString()} من أصل ${totalRows.toLocaleString()} صف.`
        );

        this.updateWorkTypeFilterIcon(
            elementId
        );

        this.updateAssignmentDateFilterIcon(
            elementId
        );

        this.updateBucketFilterIcon(
            elementId
        );
    },

    /*
     * تمييز أيقونة الفلتر عند وجود فلتر نشط.
     */
    updateWorkTypeFilterIcon: function (elementId) {
        const table = this.tables[elementId];
        const state = this.states[elementId];

        if (!table || !state) {
            return;
        }

        const column =
            table.getColumn("workTypeCode");

        const button =
            column
                ?.getElement()
                ?.querySelector(
                    ".tabulator-header-popup-button"
                );

        button?.classList.toggle(
            "is-filtered",
            state.externalFilters
                .workTypeCodes.length > 0
        );
    },

    /*
     * تمييز أيقونة فلتر التاريخ عند وجود فلتر نشط.
     */
    updateAssignmentDateFilterIcon: function (
        elementId
    ) {
        const table = this.tables[elementId];
        const state = this.states[elementId];

        if (!table || !state) {
            return;
        }

        const column =
            table.getColumn(
                "assignmentDate"
            );

        const button =
            column
                ?.getElement()
                ?.querySelector(
                    ".tabulator-header-popup-button"
                );

        button?.classList.toggle(
            "is-filtered",
            state.externalFilters
                .assignmentDates.length > 0
        );
    },

    /*
     * تمييز أيقونة فلتر Bucket عند وجود فلتر نشط.
     */
    updateBucketFilterIcon: function (
        elementId
    ) {
        const table = this.tables[elementId];
        const state = this.states[elementId];

        if (!table || !state) {
            return;
        }

        const column =
            table.getColumn("basket");

        const button =
            column
                ?.getElement()
                ?.querySelector(
                    ".tabulator-header-popup-button"
                );

        button?.classList.toggle(
            "is-filtered",
            state.externalFilters
                .bucketValues.length > 0
        );
    },

    /*
     * تنظيف فلتر Bucket بعد تعديل القيم.
     */
    refreshBucketFilterState: function (
        elementId
    ) {
        const state = this.states[elementId];

        if (!state) {
            return;
        }

        const uniqueValues =
            this.getUniqueBuckets(
                elementId
            );

        const uniqueSet =
            new Set(uniqueValues);

        const previousValues =
            state.externalFilters
                .bucketValues;

        const nextValues =
            previousValues.filter(
                value =>
                    uniqueSet.has(value)
            );

        const changed =
            nextValues.length !==
            previousValues.length;

        state.externalFilters
            .bucketValues =
            nextValues;

        if (changed) {
            this.applyExternalFilters(
                elementId
            );
        } else {
            this.updateBucketFilterIcon(
                elementId
            );
        }
    },

    /*
     * أي نوع جديد تتم إضافته سيظهر في الفلتر عند فتحه.
     * وإذا اختفت قيمة مستخدمة في الفلتر ننظفها بأمان.
     */
    refreshWorkTypeFilterState: function (elementId) {
        const state = this.states[elementId];

        if (!state) {
            return;
        }

        const uniqueValues =
            this.getUniqueWorkTypes(elementId);

        const uniqueSet =
            new Set(uniqueValues);

        const previousValues =
            state.externalFilters.workTypeCodes;

        const nextValues =
            previousValues.filter(
                value =>
                    uniqueSet.has(value)
            );

        const changed =
            nextValues.length !==
            previousValues.length;

        state.externalFilters.workTypeCodes =
            nextValues;

        if (changed) {
            this.applyExternalFilters(elementId);
        } else {
            this.updateWorkTypeFilterIcon(
                elementId
            );
        }
    },

    /*
     * تنظيف فلتر التاريخ بعد تعديل القيم.
     */
    refreshAssignmentDateFilterState: function (
        elementId
    ) {
        const state = this.states[elementId];

        if (!state) {
            return;
        }

        const uniqueDates =
            this.getUniqueAssignmentDates(
                elementId
            );

        const uniqueSet =
            new Set(uniqueDates);

        const previousDates =
            state.externalFilters
                .assignmentDates;

        const nextDates =
            previousDates.filter(
                value =>
                    uniqueSet.has(value)
            );

        const changed =
            nextDates.length !==
            previousDates.length;

        state.externalFilters
            .assignmentDates =
            nextDates;

        if (changed) {
            this.applyExternalFilters(
                elementId
            );
        } else {
            this.updateAssignmentDateFilterIcon(
                elementId
            );
        }
    },

    /*
     * هل الحدث داخل محرر نص أو قائمة؟
     * في هذه الحالة نترك المتصفح والمحرر يتعاملان
     * مع الاختصارات بشكل طبيعي.
     */
    isEditorTarget: function (target) {
        return (
            target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            target instanceof HTMLSelectElement ||
            target?.isContentEditable === true
        );
    },

    /*
     * إرجاع آخر نطاق محدد داخل الشيت.
     */
    getActiveRange: function (table) {
        if (!table) {
            return null;
        }

        const ranges =
            table.getRanges();

        if (
            !Array.isArray(ranges) ||
            ranges.length === 0
        ) {
            return null;
        }

        return ranges[ranges.length - 1];
    },

    /*
     * تحويل النطاق المحدد إلى نص Tab-Separated
     * يمكن لصقه مباشرة داخل Excel أو أي شيت آخر.
     */
    rangeToClipboardText: function (range) {
        if (!range) {
            return null;
        }

        const matrix =
            range.getStructuredCells();

        if (
            !Array.isArray(matrix) ||
            matrix.length === 0
        ) {
            return null;
        }

        const escapeValue = function (value) {
            const text =
                value === null ||
                    value === undefined
                    ? ""
                    : String(value);

            if (/[\t\r\n"]/.test(text)) {
                return (
                    `"${text.replace(/"/g, '""')}"`
                );
            }

            return text;
        };

        return matrix
            .map(
                row =>
                    row
                        .map(
                            cell =>
                                escapeValue(
                                    cell?.getValue()
                                )
                        )
                        .join("\t")
            )
            .join("\r\n");
    },

    /*
     * تطبيق Paste وتسجيل كل الخلايا المتأثرة
     * داخل Transaction واحدة.
     */
    applyRangePaste: function (
        elementId,
        table,
        rowData
    ) {
        const state =
            this.states[elementId];

        if (
            !state ||
            !Array.isArray(rowData) ||
            rowData.length === 0
        ) {
            return [];
        }

        const ranges =
            table.getRanges();

        const activeRange =
            ranges.length > 0
                ? ranges[ranges.length - 1]
                : null;

        if (!activeRange) {
            return [];
        }

        const sourceMatrix =
            this.normalizePasteData(
                table,
                rowData
            );

        if (
            sourceMatrix.length === 0 ||
            sourceMatrix.every(
                row => row.length === 0
            )
        ) {
            return [];
        }

        const selectedMatrix =
            activeRange.getStructuredCells();

        if (
            !Array.isArray(selectedMatrix) ||
            selectedMatrix.length === 0 ||
            selectedMatrix[0].length === 0
        ) {
            return [];
        }

        const selectedIsSingleCell =
            selectedMatrix.length === 1 &&
            selectedMatrix[0].length === 1;

        /*
         * تحديد خلية واحدة:
         * نطاق اللصق يتمدد بحجم البيانات المنسوخة.
         *
         * تحديد نطاق:
         * البيانات تتكرر لملء النطاق مثل Excel.
         */
        const targetMatrix =
            selectedIsSingleCell
                ? this.buildTargetMatrixFromStart(
                    table,
                    selectedMatrix[0][0],
                    sourceMatrix.length,
                    Math.max(
                        ...sourceMatrix.map(
                            row => row.length
                        )
                    )
                )
                : selectedMatrix;

        const changes = [];
        const affectedRows = new Map();

        state.applyingHistory = true;

        try {
            for (
                let rowIndex = 0;
                rowIndex < targetMatrix.length;
                rowIndex++
            ) {
                const targetRow =
                    targetMatrix[rowIndex];

                const sourceRow =
                    sourceMatrix[
                    rowIndex %
                    sourceMatrix.length
                    ];

                if (
                    !sourceRow ||
                    sourceRow.length === 0
                ) {
                    continue;
                }

                for (
                    let columnIndex = 0;
                    columnIndex < targetRow.length;
                    columnIndex++
                ) {
                    const cell =
                        targetRow[columnIndex];

                    if (!cell) {
                        continue;
                    }

                    const field =
                        cell.getField();

                    if (!field) {
                        continue;
                    }

                    const columnDefinition =
                        cell
                            .getColumn()
                            .getDefinition();

                    if (
                        columnDefinition.editor === false
                    ) {
                        continue;
                    }

                    const pastedValue =
                        sourceRow[
                        columnIndex %
                        sourceRow.length
                        ];

                    let newValue = pastedValue;

                    if (field === "assignmentDate") {
                        newValue =
                            this.normalizeAssignmentDate(
                                pastedValue
                            );

                        /*
                         * لا نستبدل التاريخ القديم بقيمة غير صالحة.
                         */
                        if (newValue === null) {
                            continue;
                        }
                    }

                    const oldValue =
                        cell.getValue();

                    if (
                        Object.is(
                            oldValue,
                            newValue
                        )
                    ) {
                        continue;
                    }

                    const row =
                        cell.getRow();

                    const rowId =
                        row.getIndex();

                    changes.push({
                        rowId: rowId,
                        field: field,

                        oldValue: oldValue,
                        newValue: newValue
                    });

                    affectedRows.set(
                        rowId,
                        row
                    );

                    cell.setValue(
                        newValue,
                        true
                    );
                }
            }
        } finally {
            state.applyingHistory = false;
        }

        if (changes.length > 0) {
            this.pushTransaction(
                elementId,
                {
                    type: "range-paste",
                    label: "لصق نطاق",
                    changes: changes
                }
            );

            if (
                changes.some(
                    change =>
                        change.field ===
                        "workTypeCode"
                )
            ) {
                this.refreshWorkTypeFilterState(
                    elementId
                );
            }
        }

        return Array.from(
            affectedRows.values()
        );
    },

    /*
 * قراءة البيانات المنسوخة من Excel مع الحفاظ
 * على عدد الصفوف والأعمدة والخلايا الفارغة.
 */
    parseClipboardText: function (clipboard) {
        if (
            typeof clipboard !== "string" ||
            clipboard.length === 0
        ) {
            return false;
        }

        const rows = [];
        let currentRow = [];
        let currentValue = "";
        let insideQuotes = false;

        for (
            let index = 0;
            index < clipboard.length;
            index++
        ) {
            const character = clipboard[index];

            if (insideQuotes) {
                if (
                    character === "\"" &&
                    clipboard[index + 1] === "\""
                ) {
                    currentValue += "\"";
                    index++;
                } else if (character === "\"") {
                    insideQuotes = false;
                } else {
                    currentValue += character;
                }

                continue;
            }

            if (character === "\"") {
                insideQuotes = true;
                continue;
            }

            if (character === "\t") {
                currentRow.push(currentValue);
                currentValue = "";
                continue;
            }

            if (
                character === "\r" ||
                character === "\n"
            ) {
                if (
                    character === "\r" &&
                    clipboard[index + 1] === "\n"
                ) {
                    index++;
                }

                currentRow.push(currentValue);
                rows.push(currentRow);

                currentRow = [];
                currentValue = "";

                continue;
            }

            currentValue += character;
        }

        currentRow.push(currentValue);
        rows.push(currentRow);

        /*
         * Excel غالبًا يضع سطرًا فارغًا في نهاية
         * النص المنسوخ، فلا نحسبه كصف إضافي.
         */
        const lastRow =
            rows[rows.length - 1];

        if (
            rows.length > 1 &&
            lastRow.length === 1 &&
            lastRow[0] === ""
        ) {
            rows.pop();
        }

        return rows.length > 0
            ? rows
            : false;
    },

    /*
     * تحويل البيانات القادمة من Clipboard
     * إلى مصفوفة صفوف وأعمدة.
     */
    normalizePasteData: function (
        table,
        rowData
    ) {
        if (Array.isArray(rowData[0])) {
            return rowData.map(
                row => Array.from(row)
            );
        }

        const fields =
            table
                .getColumns()
                .filter(
                    column =>
                        column.isVisible() &&
                        column.getField() &&
                        column.getField() !== "rowNumber"
                )
                .map(
                    column =>
                        column.getField()
                );

        return rowData.map(
            row =>
                fields.map(
                    field =>
                        row?.[field] ?? ""
                )
        );
    },

    /*
     * تكوين نطاق يبدأ من خلية واحدة
     * وبنفس حجم البيانات الملصقة.
     */
    buildTargetMatrixFromStart: function (
        table,
        startCell,
        requiredRows,
        requiredColumns
    ) {
        const rows =
            table.getRows("active");

        const columns =
            table
                .getColumns()
                .filter(
                    column =>
                        column.isVisible() &&
                        column.getField() &&
                        column.getField() !== "rowNumber"
                );

        const startRow =
            startCell.getRow();

        const startColumn =
            startCell.getColumn();

        const startRowIndex =
            rows.findIndex(
                row =>
                    row.getIndex() ===
                    startRow.getIndex()
            );

        const startColumnIndex =
            columns.findIndex(
                column =>
                    column.getField() ===
                    startColumn.getField()
            );

        if (
            startRowIndex < 0 ||
            startColumnIndex < 0
        ) {
            return [];
        }

        const targetMatrix = [];

        for (
            let rowOffset = 0;
            rowOffset < requiredRows;
            rowOffset++
        ) {
            const row =
                rows[startRowIndex + rowOffset];

            if (!row) {
                break;
            }

            const targetRow = [];

            for (
                let columnOffset = 0;
                columnOffset < requiredColumns;
                columnOffset++
            ) {
                const column =
                    columns[
                    startColumnIndex +
                    columnOffset
                    ];

                if (!column) {
                    break;
                }

                targetRow.push(
                    row.getCell(column)
                );
            }

            if (targetRow.length > 0) {
                targetMatrix.push(
                    targetRow
                );
            }
        }

        return targetMatrix;
    },

    /*
     * إضافة عملية جديدة إلى سجل Undo.
     */
    pushTransaction: function (
        elementId,
        transaction
    ) {
        const state =
            this.states[elementId];

        if (
            !state ||
            !transaction?.changes?.length
        ) {
            return;
        }

        state.undoStack.push(
            transaction
        );

        if (
            state.undoStack.length >
            state.maxTransactions
        ) {
            state.undoStack.shift();
        }

        /*
         * مثل Excel:
         * أي تعديل جديد بعد Undo يمسح Redo القديم.
         */
        state.redoStack = [];

        this.setStatus(
            elementId,

            `${transaction.label}: ` +
            `${transaction.changes.length.toLocaleString()} خلية. ` +
            `التراجع المتاح: ${state.undoStack.length}.`
        );
    },

    /*
     * وضع القيم القديمة أو الجديدة
     * حسب عملية Undo أو Redo.
     */
    applyTransactionValues: function (
        elementId,
        transaction,
        valueKey
    ) {
        const table =
            this.tables[elementId];

        const state =
            this.states[elementId];

        if (
            !table ||
            !state ||
            !transaction
        ) {
            return;
        }

        state.applyingHistory = true;

        try {
            for (
                const change
                of transaction.changes
            ) {
                const row =
                    table.getRow(
                        change.rowId
                    );

                if (!row) {
                    continue;
                }

                const cell =
                    row.getCell(
                        change.field
                    );

                if (!cell) {
                    continue;
                }

                cell.setValue(
                    change[valueKey],
                    true
                );
            }
        } finally {
            state.applyingHistory = false;
        }

        if (
            transaction.changes.some(
                change =>
                    change.field ===
                    "workTypeCode"
            )
        ) {
            this.refreshWorkTypeFilterState(
                elementId
            );
        }
    },

    /*
 * الانتقال إلى مكان العملية التي تم عمل
 * Undo أو Redo لها، وتحديد الخلايا المتأثرة.
 */
    focusTransaction: function (
        elementId,
        transaction
    ) {
        const table =
            this.tables[elementId];

        if (
            !table ||
            !transaction?.changes?.length
        ) {
            return;
        }

        const rows =
            table.getRows("active");

        const columns =
            table
                .getColumns()
                .filter(
                    column =>
                        column.isVisible() &&
                        column.getField() &&
                        column.getField() !== "rowNumber"
                );

        const rowPositions =
            new Map();

        for (
            let index = 0;
            index < rows.length;
            index++
        ) {
            rowPositions.set(
                String(rows[index].getIndex()),
                index
            );
        }

        const columnPositions =
            new Map();

        for (
            let index = 0;
            index < columns.length;
            index++
        ) {
            columnPositions.set(
                columns[index].getField(),
                index
            );
        }

        let minimumRow = Infinity;
        let maximumRow = -1;

        let minimumColumn = Infinity;
        let maximumColumn = -1;

        for (
            const change
            of transaction.changes
        ) {
            const rowPosition =
                rowPositions.get(
                    String(change.rowId)
                );

            const columnPosition =
                columnPositions.get(
                    change.field
                );

            if (
                rowPosition === undefined ||
                columnPosition === undefined
            ) {
                continue;
            }

            minimumRow =
                Math.min(
                    minimumRow,
                    rowPosition
                );

            maximumRow =
                Math.max(
                    maximumRow,
                    rowPosition
                );

            minimumColumn =
                Math.min(
                    minimumColumn,
                    columnPosition
                );

            maximumColumn =
                Math.max(
                    maximumColumn,
                    columnPosition
                );
        }

        if (
            !Number.isFinite(minimumRow) ||
            !Number.isFinite(minimumColumn) ||
            maximumRow < 0 ||
            maximumColumn < 0
        ) {
            return;
        }

        const startRow =
            rows[minimumRow];

        const endRow =
            rows[maximumRow];

        const startColumn =
            columns[minimumColumn];

        const endColumn =
            columns[maximumColumn];

        const startCell =
            startRow?.getCell(startColumn);

        const endCell =
            endRow?.getCell(endColumn);

        if (
            !startRow ||
            !startCell ||
            !endCell
        ) {
            return;
        }

        const selectAffectedRange =
            function () {
                /*
                 * إزالة التحديد القديم.
                 */
                const existingRanges =
                    table.getRanges();

                for (
                    const range
                    of existingRanges
                ) {
                    range.remove();
                }

                /*
                 * تحديد الخلية أو النطاق
                 * الذي تم التراجع عنه.
                 */
                table.addRange(
                    startCell,
                    endCell
                );

                window.requestAnimationFrame(
                    function () {
                        const cellElement =
                            startCell.getElement();

                        if (cellElement) {
                            cellElement.focus({
                                preventScroll: true
                            });
                        }
                    }
                );
            };

        /*
         * الانتقال إلى مكان العملية فورًا،
         * ثم تحديد النطاق بعد اكتمال الانتقال.
         */
        table
            .scrollToRow(
                startRow,
                "center",
                false
            )
            .then(
                selectAffectedRange
            )
            .catch(
                selectAffectedRange
            );
    },

    undo: function (elementId) {
        const state =
            this.states[elementId];

        if (
            !state ||
            state.undoStack.length === 0
        ) {
            this.setStatus(
                elementId,
                "لا توجد عملية يمكن التراجع عنها."
            );

            return;
        }

        const transaction =
            state.undoStack.pop();

        this.applyTransactionValues(
            elementId,
            transaction,
            "oldValue"
        );

        state.redoStack.push(
            transaction
        );

        this.focusTransaction(
            elementId,
            transaction
        );

        this.setStatus(
            elementId,

            `تم التراجع عن: ${transaction.label} ` +
            `(${transaction.changes.length.toLocaleString()} خلية).`
        );
    },

    redo: function (elementId) {
        const state =
            this.states[elementId];

        if (
            !state ||
            state.redoStack.length === 0
        ) {
            this.setStatus(
                elementId,
                "لا توجد عملية يمكن إعادتها."
            );

            return;
        }

        const transaction =
            state.redoStack.pop();

        this.applyTransactionValues(
            elementId,
            transaction,
            "newValue"
        );

        state.undoStack.push(
            transaction
        );

        this.focusTransaction(
            elementId,
            transaction
        );

        this.setStatus(
            elementId,

            `تمت إعادة: ${transaction.label} ` +
            `(${transaction.changes.length.toLocaleString()} خلية).`
        );
    },

    copyRange: function (elementId) {
        const table =
            this.tables[elementId];

        if (table) {
            table.copyToClipboard(
                "range"
            );
        }
    },

    setStatus: function (
        elementId,
        message
    ) {
        const statusElement =
            document.getElementById(
                `${elementId}-status`
            );

        if (statusElement) {
            statusElement.textContent =
                message;
        }
    },

    destroy: function (elementId) {
        const table =
            this.tables[elementId];

        const state =
            this.states[elementId];

        const element =
            document.getElementById(
                elementId
            );

        if (state?.keyDownHandler) {
            document.removeEventListener(
                "keydown",
                state.keyDownHandler,
                true
            );
        }

        if (state?.copyHandler) {
            document.removeEventListener(
                "copy",
                state.copyHandler,
                true
            );
        }

        if (state?.pasteHandler) {
            document.removeEventListener(
                "paste",
                state.pasteHandler,
                true
            );
        }

        if (state?.pointerDownHandler) {
            document.removeEventListener(
                "pointerdown",
                state.pointerDownHandler,
                true
            );
        }

        if (table) {
            table.destroy();
        }

        delete this.tables[elementId];
        delete this.states[elementId];
    }
};