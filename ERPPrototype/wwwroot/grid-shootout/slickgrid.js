import * as SlickBundle from "https://cdn.jsdelivr.net/npm/@slickgrid-universal/vanilla-bundle@10.9.0/+esm";

const { Slicker, Editors } = SlickBundle;
let bundle = null;
let rtl = false;

function makeColumns() {
  const editor = Editors?.text ? { model: Editors.text } : undefined;
  return [
    { id: "workOrderNumber", name: "Work Order", field: "workOrderNumber", width: 150, sortable: true, editor },
    { id: "workTypeCode", name: "Work Type", field: "workTypeCode", width: 100, sortable: true, editor },
    { id: "assignmentDate", name: "Assignment Date", field: "assignmentDate", width: 135, sortable: true, editor },
    { id: "workOrderValue", name: "Work Order Value", field: "workOrderValue", width: 150, sortable: true, editor },
    { id: "partialAmount", name: "Partial Amount", field: "partialAmount", width: 135, sortable: true, editor },
    { id: "remainingAmount", name: "Remaining Amount", field: "remainingAmount", width: 150, sortable: true, editor },
    { id: "basket", name: "Basket", field: "basket", width: 170, sortable: true, editor },
    { id: "notes", name: "Notes", field: "notes", width: 260, sortable: true, editor },
  ];
}

function destroy() {
  try { bundle?.dispose?.(); } catch {}
  try { bundle?.destroy?.(); } catch {}
  bundle = null;
  document.getElementById("grid").replaceChildren();
}

async function load(count) {
  GridShootout.resetMetrics();
  GridShootout.setStatus(`Generating ${count.toLocaleString()} rows…`);
  if (!Slicker?.GridBundle) {
    throw new Error("Slicker.GridBundle was not exported by the pinned vanilla bundle.");
  }
  const started = performance.now();
  const data = GridShootout.generateRows(count);
  destroy();
  const container = document.getElementById("grid");
  container.dir = rtl ? "rtl" : "ltr";
  const options = {
    enableAutoResize: true,
    autoResize: { container: "#grid-card", calculateAvailableSizeBy: "container" },
    editable: true,
    autoEdit: false,
    enableCellNavigation: true,
    enableSelection: true,
    selectionOptions: { selectionType: "cell", selectActiveRow: false },
    enableExcelCopyBuffer: true,
    excelCopyBufferOptions: {
      copyActiveEditorCell: true,
      removeDoubleQuotesOnPaste: true,
      replaceNewlinesWith: " ",
    },
    enableColumnPicker: true,
    enableSorting: true,
    rowHeight: 22,
    headerRowHeight: 42,
  };
  bundle = new Slicker.GridBundle(container, makeColumns(), options, data);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  GridShootout.state.notes.push({ at: Date.now(), type: "dataset-generation", ms: performance.now() - started, rows: count });
  GridShootout.markReady("SlickGrid Universal", "10.9.0");
}

GridShootout.bindCommonControls({
  reload: load,
  setRtl: (enabled) => {
    rtl = enabled;
    load(Number(document.getElementById("row-count").value));
  },
});

load(10000).catch((error) => {
  console.error(error);
  GridShootout.setStatus(`SlickGrid load failed: ${error.message}`, "error");
});
