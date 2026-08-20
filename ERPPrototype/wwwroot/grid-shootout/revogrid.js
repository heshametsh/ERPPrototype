import { defineCustomElement as defineRevoGrid } from "https://cdn.jsdelivr.net/npm/@revolist/revogrid@4.24.2/standalone/revo-grid.js/+esm";

defineRevoGrid();

let grid = null;
let rtl = false;

const columns = [
  { name: "Work Order", prop: "workOrderNumber", size: 150 },
  { name: "Work Type", prop: "workTypeCode", size: 100 },
  { name: "Assignment Date", prop: "assignmentDate", size: 135 },
  { name: "Work Order Value", prop: "workOrderValue", size: 150 },
  { name: "Partial Amount", prop: "partialAmount", size: 135 },
  { name: "Remaining Amount", prop: "remainingAmount", size: 150 },
  { name: "Basket", prop: "basket", size: 170 },
  { name: "Notes", prop: "notes", size: 260 },
];

async function load(count) {
  GridShootout.resetMetrics();
  GridShootout.setStatus(`Generating ${count.toLocaleString()} rows…`);
  const started = performance.now();
  const data = GridShootout.generateRows(count);
  document.getElementById("grid").replaceChildren();
  grid = document.createElement("revo-grid");
  grid.style.width = "100%";
  grid.style.height = "720px";
  grid.columns = columns;
  grid.source = data;
  grid.range = true;
  grid.useClipboard = { rangeFill: true };
  grid.resize = true;
  grid.rowHeaders = true;
  grid.rtl = rtl;
  document.getElementById("grid").appendChild(grid);
  await customElements.whenDefined("revo-grid");
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  GridShootout.state.notes.push({ at: Date.now(), type: "dataset-generation", ms: performance.now() - started, rows: count });
  GridShootout.markReady("RevoGrid", "4.24.2");
}

GridShootout.bindCommonControls({
  reload: load,
  setRtl: (enabled) => {
    rtl = enabled;
    if (grid) grid.rtl = enabled;
    window.dispatchEvent(new Event("resize"));
  },
});

load(10000).catch((error) => {
  console.error(error);
  GridShootout.setStatus(`RevoGrid load failed: ${error.message}`, "error");
});
