(function () {
  let table = null;
  let rtl = false;

  const columns = [
    { title: "Work Order", field: "workOrderNumber", width: 150, editor: "input" },
    { title: "Work Type", field: "workTypeCode", width: 100, editor: "input" },
    { title: "Assignment Date", field: "assignmentDate", width: 135, editor: "input" },
    { title: "Work Order Value", field: "workOrderValue", width: 150, editor: "number" },
    { title: "Partial Amount", field: "partialAmount", width: 135, editor: "number" },
    { title: "Remaining Amount", field: "remainingAmount", width: 150, editor: "number" },
    { title: "Basket", field: "basket", width: 170, editor: "input" },
    { title: "Notes", field: "notes", width: 260, editor: "input" },
  ];

  function destroy() {
    try { table?.destroy(); } catch {}
    table = null;
    document.getElementById("grid").replaceChildren();
  }

  function load(count) {
    GridShootout.resetMetrics();
    GridShootout.setStatus(`Generating ${count.toLocaleString()} rows…`);
    const started = performance.now();
    const data = GridShootout.generateRows(count);
    destroy();
    requestAnimationFrame(() => {
      table = new Tabulator("#grid", {
        data,
        index: "id",
        height: "720px",
        layout: "fitDataStretch",
        renderVertical: "virtual",
        renderVerticalBuffer: 260,
        selectableRange: 1,
        selectableRangeInitializeDefault: false,
        selectableRangeColumns: true,
        selectableRangeRows: true,
        clipboard: true,
        clipboardCopyRowRange: "range",
        clipboardPasteParser: "range",
        clipboardPasteAction: "update",
        history: true,
        editTriggerEvent: "dblclick",
        textDirection: rtl ? "rtl" : "ltr",
        rowHeader: { formatter: "rownum", width: 55, frozen: true },
        columns,
      });
      table.on("tableBuilt", () => {
        GridShootout.state.notes.push({ at: Date.now(), type: "dataset-generation", ms: performance.now() - started, rows: count });
        GridShootout.markReady("Tabulator", "6.5.0");
      });
    });
  }

  GridShootout.bindCommonControls({
    reload: load,
    setRtl: (enabled) => {
      rtl = enabled;
      load(Number(document.getElementById("row-count").value));
    },
  });

  load(10000);
})();
