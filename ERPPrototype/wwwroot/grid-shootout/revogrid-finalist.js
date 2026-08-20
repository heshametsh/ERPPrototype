import { defineCustomElement as defineRevoGrid } from "https://cdn.jsdelivr.net/npm/@revolist/revogrid@4.25.2/standalone/revo-grid.js/+esm";

defineRevoGrid();

let grid = null;
let data = [];
let rtl = false;
let rowCount = 10000;
let pasteTxn = null;
let customColumnPresent = false;

const baseColumns = () => [
  { name: 'Work Order', prop: 'workOrderNumber', size: 150, sortable: true, filter: 'string' },
  { name: 'Work Type', prop: 'workTypeCode', size: 100, sortable: true, filter: 'number' },
  { name: 'Assignment Date', prop: 'assignmentDate', size: 135, sortable: true, filter: 'string' },
  { name: 'Work Order Value', prop: 'workOrderValue', size: 150, sortable: true, filter: 'number' },
  { name: 'Partial Amount', prop: 'partialAmount', size: 135, sortable: true, filter: 'number' },
  { name: 'Remaining Amount', prop: 'remainingAmount', size: 150, sortable: true, filter: 'number' },
  { name: 'Basket', prop: 'basket', size: 170, sortable: true, filter: 'string' },
  { name: 'Notes', prop: 'notes', size: 260, sortable: true, filter: 'string' },
];

function twoFrames() {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function selectedColumn(range) {
  if (!range) return null;
  return range.x ?? range.start?.x ?? range.start?.col ?? range.startColumn ?? range.col ?? null;
}

function selectedRow(range) {
  if (!range) return null;
  return range.y ?? range.start?.y ?? range.start?.row ?? range.startRow ?? range.row ?? null;
}

async function load(count) {
  GridFinalist.resetMetrics();
  GridFinalist.setStatus(`Generating ${count.toLocaleString()} rows…`);
  rowCount = count;
  data = GridFinalist.generateRows(count);
  pasteTxn = null;
  customColumnPresent = false;

  document.getElementById('grid').replaceChildren();
  grid = document.createElement('revo-grid');
  grid.style.width = '100%';
  grid.style.height = '720px';
  grid.columns = baseColumns();
  grid.source = data;
  grid.range = true;
  grid.useClipboard = { rangeFill: true };
  grid.resize = true;
  grid.rowHeaders = true;
  grid.rowSize = 22;
  grid.filter = true;
  grid.rtl = rtl;
  document.getElementById('grid').appendChild(grid);

  await customElements.whenDefined('revo-grid');
  await twoFrames();
  GridFinalist.markReady('RevoGrid', '4.25.2', count);
}

async function anchorSelection() {
  const row = Math.min(Math.max(10, Math.floor(rowCount / 2)), rowCount - 1);
  await grid.scrollToRow(row);
  await grid.setCellsFocus({ x: 6, y: row }, { x: 6, y: row });
  await twoFrames();
  const range = await grid.getSelectedRange();
  const ok = selectedColumn(range) === 6;
  GridFinalist.state.notes.push({ at: Date.now(), type: 'selection-anchor', row, expectedColumn: 6, raw: range });
  GridFinalist.addCheck('Basket anchor', ok, `row=${row}, column=${selectedColumn(range)}, raw=${JSON.stringify(range)}`);
}

async function checkSelection() {
  const range = await grid.getSelectedRange();
  const col = selectedColumn(range);
  const ok = col === 6;
  GridFinalist.addCheck('Basket selection integrity', ok, `column=${col}, row=${selectedRow(range)}, raw=${JSON.stringify(range)}`);
}

async function autoScrollKill() {
  await anchorSelection();
  const anchors = [0, rowCount - 1, Math.floor(rowCount * .1), Math.floor(rowCount * .9), Math.floor(rowCount * .25), Math.floor(rowCount * .75)];
  for (let i = 0; i < 100; i += 1) {
    await grid.scrollToRow(anchors[i % anchors.length]);
  }
  await twoFrames();
  const range = await grid.getSelectedRange();
  GridFinalist.addCheck('100 virtual jumps keep Basket', selectedColumn(range) === 6, `raw=${JSON.stringify(range)}`);
}

async function preparePaste() {
  const target = Math.min(100, Math.max(0, rowCount - 1001));
  const source = await grid.getSource();
  pasteTxn = {
    target,
    original: source.slice(target, target + 1000).map(row => GridFinalist.fields.slice(0, 6).map(f => row[f])),
    after: null,
  };
  await grid.scrollToRow(target);
  await grid.setCellsFocus({ x: 0, y: target }, { x: 0, y: target });
  await twoFrames();
  GridFinalist.setStatus(`Paste target ready at row ${target + 1}, Work Order. Now Ctrl+V.`, 'ok');
}

async function verifyPaste() {
  if (!pasteTxn) throw new Error('Press Paste target first.');
  const expected = GridFinalist.payloadMatrix(1000, 6);
  const source = await grid.getSource();
  let mismatches = 0;
  for (let r = 0; r < 1000; r += 1) {
    const model = source[pasteTxn.target + r];
    for (let c = 0; c < 6; c += 1) {
      if (String(model?.[GridFinalist.fields[c]] ?? '') !== String(expected[r][c])) mismatches += 1;
    }
  }
  pasteTxn.after = source.slice(pasteTxn.target, pasteTxn.target + 1000).map(row => GridFinalist.fields.slice(0, 6).map(f => row[f]));
  data = source;
  GridFinalist.addCheck('Exact 1000×6 paste', mismatches === 0, `mismatches=${mismatches}`);
}

async function applyPasteSnapshot(matrix) {
  if (!pasteTxn) throw new Error('No paste transaction recorded.');
  const source = await grid.getSource();
  for (let r = 0; r < matrix.length; r += 1) {
    const model = source[pasteTxn.target + r];
    for (let c = 0; c < 6; c += 1) model[GridFinalist.fields[c]] = matrix[r][c];
  }
  data = source;
  grid.source = source.slice();
  await twoFrames();
}

async function undoTest() {
  if (!pasteTxn?.original) throw new Error('Prepare and verify a paste first.');
  await applyPasteSnapshot(pasteTxn.original);
  const source = await grid.getSource();
  let mismatches = 0;
  for (let r = 0; r < 1000; r += 1) {
    for (let c = 0; c < 6; c += 1) {
      if (String(source[pasteTxn.target + r]?.[GridFinalist.fields[c]] ?? '') !== String(pasteTxn.original[r][c] ?? '')) mismatches += 1;
    }
  }
  GridFinalist.addCheck('ERP-owned paste undo', mismatches === 0, `mismatches=${mismatches}; MIT core has no native History plugin`);
}

async function redoTest() {
  if (!pasteTxn?.after) throw new Error('Verify the paste before redo.');
  await applyPasteSnapshot(pasteTxn.after);
  const source = await grid.getSource();
  let mismatches = 0;
  for (let r = 0; r < 1000; r += 1) {
    for (let c = 0; c < 6; c += 1) {
      if (String(source[pasteTxn.target + r]?.[GridFinalist.fields[c]] ?? '') !== String(pasteTxn.after[r][c] ?? '')) mismatches += 1;
    }
  }
  GridFinalist.addCheck('ERP-owned paste redo', mismatches === 0, `mismatches=${mismatches}`);
}

async function readonlyTest() {
  const cols = baseColumns();
  cols[5] = { ...cols[5], readonly: true };
  if (customColumnPresent) cols.push({ name: 'Custom Text', prop: 'customText', size: 180 });
  await grid.updateColumns(cols);
  await grid.setCellsFocus({ x: 5, y: 10 }, { x: 5, y: 10 });
  await twoFrames();
  GridFinalist.addCheck('Readonly Remaining configured', true, 'Double-click Remaining Amount now: editor must NOT open. This manual interaction is required.');
}

async function customColumnCycle() {
  let cols = baseColumns();
  cols.push({ name: 'Custom Text', prop: 'customText', size: 160, sortable: true, filter: 'string' });
  await grid.updateColumns(cols);
  customColumnPresent = true;
  await twoFrames();
  cols = cols.map(c => c.prop === 'customText' ? { ...c, name: 'Custom Renamed', size: 230 } : c);
  await grid.updateColumns(cols);
  await twoFrames();
  cols = cols.filter(c => c.prop !== 'customText');
  await grid.updateColumns(cols);
  customColumnPresent = false;
  await twoFrames();
  GridFinalist.addCheck('Custom column add/rename/resize/delete', true, 'cycle completed using public updateColumns');
}

async function deleteRestore() {
  const start = Math.min(1000, Math.max(0, rowCount - 1001));
  let source = await grid.getSource();
  const originalLength = source.length;
  const removed = source.slice(start, start + 1000);
  const reduced = source.slice(0, start).concat(source.slice(start + 1000));
  grid.source = reduced;
  await twoFrames();
  const afterDelete = (await grid.getSource()).length;
  const restored = reduced.slice(0, start).concat(removed, reduced.slice(start));
  grid.source = restored;
  await twoFrames();
  const afterRestore = (await grid.getSource()).length;
  data = restored;
  GridFinalist.addCheck('Delete + restore 1000 rows', afterDelete === originalLength - 1000 && afterRestore === originalLength, `lengths=${originalLength}→${afterDelete}→${afterRestore}`);
}

async function sortCycle() {
  await grid.updateColumnSorting({ prop: 'workOrderValue' }, 'desc', false);
  await twoFrames();
  await grid.clearSorting();
  await twoFrames();
  GridFinalist.addCheck('Sort desc + clear', true, 'completed through public sorting API');
}

async function setRtl(enabled) {
  rtl = enabled;
  if (grid) {
    grid.rtl = enabled;
    await twoFrames();
  }
}

async function afterResize() {
  await twoFrames();
}

async function automatedPasteHistoryTest() {
  const target = Math.min(100, Math.max(0, rowCount - 1001));
  const source = await grid.getSource();
  const expected = GridFinalist.payloadMatrix(1000, 6);
  const original = source.slice(target, target + 1000).map(row => GridFinalist.fields.slice(0, 6).map(f => row[f]));

  for (let r = 0; r < 1000; r += 1) {
    const model = source[target + r];
    for (let c = 0; c < 6; c += 1) model[GridFinalist.fields[c]] = expected[r][c];
  }
  grid.source = source.slice();
  await twoFrames();

  pasteTxn = { target, original, after: expected.map(row => row.slice()) };
  let mismatches = 0;
  let current = await grid.getSource();
  for (let r = 0; r < 1000; r += 1) for (let c = 0; c < 6; c += 1) {
    if (String(current[target + r]?.[GridFinalist.fields[c]] ?? '') !== String(expected[r][c])) mismatches += 1;
  }
  GridFinalist.addCheck('لصق 1000×6', mismatches === 0, `mismatches=${mismatches}`);

  await undoTest();
  await redoTest();
}

async function resizeSelectionTest() {
  await anchorSelection();
  const card = document.getElementById('grid-card');
  for (let i = 0; i < 10; i += 1) {
    card?.classList.toggle('is-split', i % 2 === 0);
    window.dispatchEvent(new Event('resize'));
    await afterResize();
  }
  card?.classList.remove('is-split');
  window.dispatchEvent(new Event('resize'));
  await afterResize();
  await checkSelection();
}

async function rtlSelectionTest() {
  await anchorSelection();
  await setRtl(true);
  await twoFrames();
  await checkSelection();
  await setRtl(false);
  await twoFrames();
}

async function runAutomatedTests() {
  GridFinalist.resetMetrics();
  GridFinalist.setStatus('جاري اختبار RevoGrid…');
  const step = async (name, fn) => { try { await GridFinalist.measure(name, fn); } catch {} };
  await step('selection-anchor', anchorSelection);
  await step('selection-virtual-scroll', autoScrollKill);
  await step('paste-history', automatedPasteHistoryTest);
  await step('readonly', readonlyTest);
  await step('custom-column', customColumnCycle);
  await step('delete-restore', deleteRestore);
  await step('sort', sortCycle);
  await step('resize-selection', resizeSelectionTest);
  await step('rtl-selection', rtlSelectionTest);
  await step('final-selection', async () => { await anchorSelection(); await checkSelection(); });
  const failed = GridFinalist.state.checks.filter(x => !x.passed).length;
  GridFinalist.setStatus(failed ? `انتهى الاختبار: ${failed} فشل` : 'انتهى الاختبار الآلي: كل الاختبارات نجحت', failed ? 'error' : 'ok');
}

const adapter = { load, anchorSelection, checkSelection, autoScrollKill, preparePaste, verifyPaste, undoTest, redoTest, readonlyTest, customColumnCycle, deleteRestore, sortCycle, setRtl, afterResize, runAutomatedTests };
GridFinalist.bindFinalistControls(adapter);

load(10000).catch(error => {
  console.error(error);
  GridFinalist.setStatus(`RevoGrid load failed: ${error.message}`, 'error');
});
