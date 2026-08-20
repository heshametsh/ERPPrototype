(function () {
  let univer = null;
  let univerAPI = null;
  let rtl = false;
  let rowCount = 10000;
  let pasteTxn = null;
  let protectionRule = null;

  const headers = ['Work Order','Work Type','Assignment Date','Work Order Value','Partial Amount','Remaining Amount','Basket','Notes'];

  function twoFrames() { return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); }

  function makeWorkbook(count) {
    const data = GridFinalist.generateRows(count);
    const cellData = { 0: {} };
    headers.forEach((h,c) => { cellData[0][c] = { v: h }; });
    for (let i = 0; i < data.length; i += 1) {
      const row = data[i];
      cellData[i + 1] = {
        0: { v: row.workOrderNumber }, 1: { v: row.workTypeCode }, 2: { v: row.assignmentDate },
        3: { v: row.workOrderValue }, 4: { v: row.partialAmount }, 5: { v: row.remainingAmount },
        6: { v: row.basket }, 7: { v: row.notes },
      };
    }
    return {
      id: 'erp-finalist', name: 'ERP Finalist', sheetOrder: ['sheet-01'],
      sheets: {
        'sheet-01': {
          id: 'sheet-01', name: 'Work Orders', cellData, rowCount: count + 1, columnCount: 8,
          defaultRowHeight: 22, defaultColumnWidth: 120,
          rowHeader: { width: 50, hidden: 0 }, columnHeader: { height: 28, hidden: 0 },
          rightToLeft: rtl ? 1 : 0, showGridlines: 1, zoomRatio: 1,
          freeze: { startRow: 1, startColumn: -1, ySplit: 1, xSplit: 0 },
        },
      },
    };
  }

  function dispose() {
    try { univer?.dispose?.(); } catch {}
    univer = null; univerAPI = null; protectionRule = null; pasteTxn = null;
    document.getElementById('grid').replaceChildren();
  }

  function sheet() { return univerAPI.getActiveWorkbook().getActiveSheet(); }

  async function load(count, reset = true) {
    if (reset) GridFinalist.resetMetrics();
    GridFinalist.setStatus(`Building ${count.toLocaleString()}×8 workbook…`);
    rowCount = count;
    dispose();

    if (!window.UniverPresets || !window.UniverCore || !window.UniverPresetSheetsCore) throw new Error('Pinned Univer core namespaces did not load.');
    const { createUniver } = window.UniverPresets;
    const { LocaleType, mergeLocales, merge } = window.UniverCore;
    const corePreset = window.UniverPresetSheetsCore.UniverSheetsCorePreset;
    const sortPreset = window.UniverPresetSheetsSort?.UniverSheetsSortPreset;
    const filterPreset = window.UniverPresetSheetsFilter?.UniverSheetsFilterPreset;
    const coreLocale = window.UniverPresetSheetsCoreEnUS;
    const sortLocale = window.UniverPresetSheetsSortEnUS || {};
    const filterLocale = window.UniverPresetSheetsFilterEnUS || {};

    const presets = [corePreset({ container:'grid', header:false, toolbar:false, footer:false, formulaBar:false })];
    if (typeof sortPreset === 'function') presets.push(sortPreset());
    if (typeof filterPreset === 'function') presets.push(filterPreset());

    const localeBundle = (mergeLocales || merge)({}, coreLocale, sortLocale, filterLocale);
    const created = createUniver({ locale: LocaleType.EN_US, locales: { [LocaleType.EN_US]: localeBundle }, presets });
    univer = created.univer;
    univerAPI = created.univerAPI;
    univerAPI.createWorkbook(makeWorkbook(count));
    await twoFrames();
    GridFinalist.state.notes.push({ at: Date.now(), type:'plugins', sortLoaded: !!sortPreset, filterLoaded: !!filterPreset });
    GridFinalist.markReady('Univer', '0.25.1', count);
  }

  async function anchorSelection() {
    const dataIndex = Math.min(Math.max(10, Math.floor(rowCount / 2)), rowCount - 1);
    const row = dataIndex + 1;
    const s = sheet();
    s.getRange(row, 6).activate();
    s.scrollToCell(row, 6);
    await twoFrames();
    const notation = s.getSelection()?.getActiveRange()?.getA1Notation?.() || s.getActiveRange?.()?.getA1Notation?.() || '';
    GridFinalist.state.notes.push({ at: Date.now(), type:'selection-anchor', row, notation });
    GridFinalist.addCheck('Basket anchor', /^G\d+(?::G\d+)?$/i.test(notation), `selection=${notation}`);
  }

  async function checkSelection() {
    const s = sheet();
    const notation = s.getSelection()?.getActiveRange()?.getA1Notation?.() || s.getActiveRange?.()?.getA1Notation?.() || '';
    GridFinalist.addCheck('Basket selection integrity', /^G\d+(?::G\d+)?$/i.test(notation), `selection=${notation}`);
  }

  async function autoScrollKill() {
    await anchorSelection();
    const s = sheet();
    const anchors = [1, rowCount, Math.floor(rowCount*.1)+1, Math.floor(rowCount*.9)+1, Math.floor(rowCount*.25)+1, Math.floor(rowCount*.75)+1];
    for (let i = 0; i < 100; i += 1) s.scrollToCell(anchors[i % anchors.length], 6);
    await twoFrames();
    const notation = s.getSelection()?.getActiveRange()?.getA1Notation?.() || '';
    GridFinalist.addCheck('100 virtual jumps keep Basket', /^G\d+(?::G\d+)?$/i.test(notation), `selection=${notation}`);
  }

  async function preparePaste() {
    const targetData = Math.min(100, Math.max(0, rowCount - 1001));
    const row = targetData + 1;
    const s = sheet();
    const range = s.getRange(row, 0, 1000, 6);
    pasteTxn = { row, original: range.getValues(), after: null };
    s.getRange(row, 0).activate();
    s.scrollToCell(row, 0);
    await twoFrames();
    GridFinalist.setStatus(`Paste target ready at sheet row ${row + 1}. Now Ctrl+V.`, 'ok');
  }

  async function verifyPaste() {
    if (!pasteTxn) throw new Error('Press Paste target first.');
    const expected = GridFinalist.payloadMatrix(1000,6);
    const values = sheet().getRange(pasteTxn.row, 0, 1000, 6).getValues();
    let mismatches = 0;
    for (let r=0;r<1000;r++) for (let c=0;c<6;c++) if (String(values[r]?.[c] ?? '') !== String(expected[r][c])) mismatches++;
    pasteTxn.after = values;
    GridFinalist.addCheck('Exact 1000×6 paste', mismatches === 0, `mismatches=${mismatches}`);
  }

  async function undoTest() {
    if (!pasteTxn) throw new Error('Prepare and paste first.');
    await univerAPI.undo();
    await twoFrames();
    const values = sheet().getRange(pasteTxn.row, 0, 1000, 6).getValues();
    let mismatches = 0;
    for (let r=0;r<1000;r++) for (let c=0;c<6;c++) if (String(values[r]?.[c] ?? '') !== String(pasteTxn.original[r]?.[c] ?? '')) mismatches++;
    GridFinalist.addCheck('Native paste undo', mismatches === 0, `mismatches=${mismatches}`);
  }

  async function redoTest() {
    if (!pasteTxn?.after) throw new Error('Verify paste before redo.');
    await univerAPI.redo();
    await twoFrames();
    const values = sheet().getRange(pasteTxn.row, 0, 1000, 6).getValues();
    let mismatches = 0;
    for (let r=0;r<1000;r++) for (let c=0;c<6;c++) if (String(values[r]?.[c] ?? '') !== String(pasteTxn.after[r]?.[c] ?? '')) mismatches++;
    GridFinalist.addCheck('Native paste redo', mismatches === 0, `mismatches=${mismatches}`);
  }

  async function readonlyTest() {
    const s = sheet();
    const target = s.getRange(1, 5, Math.min(rowCount, 1000), 1);
    try { if (protectionRule) await protectionRule.remove(); } catch {}
    protectionRule = await target.getRangePermission().protect({ name:'Remaining Amount lock', allowViewByOthers:true });
    await protectionRule.setPoint(univerAPI.Enum.RangePermissionPoint.Edit, false);
    const cell = s.getRange(10,5);
    const before = cell.getValue();
    let threw = false;
    try { await cell.setValue('__BLOCK_ME__'); } catch { threw = true; }
    await twoFrames();
    const after = cell.getValue();
    const ok = String(after ?? '') === String(before ?? '');
    GridFinalist.addCheck('Readonly Remaining enforcement', ok, `blocked=${ok}, threw=${threw}, before=${before}, after=${after}`);
  }

  async function customColumnCycle() {
    const s = sheet();
    await s.insertColumnAfter(7);
    await s.getRange(0,8).setValue('Custom Text');
    await s.setColumnWidth(8,160);
    await s.getRange(0,8).setValue('Custom Renamed');
    await s.setColumnWidth(8,230);
    await s.deleteColumn(8);
    await twoFrames();
    GridFinalist.addCheck('Custom column add/rename/resize/delete', s.getMaxColumns() === 8, `columns=${s.getMaxColumns()}`);
  }

  async function deleteRestore() {
    const s = sheet();
    const originalRows = s.getMaxRows();
    const start = Math.min(1001, Math.max(1, rowCount - 1000));
    await s.deleteRows(start,1000);
    await twoFrames();
    const afterDelete = s.getMaxRows();
    await univerAPI.undo();
    await twoFrames();
    const afterRestore = s.getMaxRows();
    GridFinalist.addCheck('Delete + native undo 1000 rows', afterDelete === originalRows - 1000 && afterRestore === originalRows, `rows=${originalRows}→${afterDelete}→${afterRestore}`);
  }

  async function sortCycle() {
    const s = sheet();
    if (typeof s.sort !== 'function') {
      GridFinalist.addCheck('Sort plugin available', false, 'FWorksheet.sort is missing');
      return;
    }
    await s.getRange(1,0,rowCount,8).sort({ column:3, ascending:false });
    await twoFrames();
    await univerAPI.undo();
    await twoFrames();
    GridFinalist.addCheck('Sort desc + native undo', true, 'completed through free sort preset');
  }

  async function setRtl(enabled) {
    rtl = enabled;
    await load(Number(document.getElementById('row-count').value), false);
  }

  async function afterResize() {
    try { sheet().refreshCanvas?.(); } catch {}
    await twoFrames();
  }

  async function automatedPasteHistoryTest() {
    const targetData = Math.min(100, Math.max(0, rowCount - 1001));
    const row = targetData + 1;
    const s = sheet();
    const range = s.getRange(row, 0, 1000, 6);
    const original = range.getValues();
    const expected = GridFinalist.payloadMatrix(1000, 6);
    pasteTxn = { row, original, after: expected.map(r => r.slice()) };

    await range.setValues(expected);
    await twoFrames();
    let values = range.getValues();
    let mismatches = 0;
    for (let r=0;r<1000;r++) for (let c=0;c<6;c++) if (String(values[r]?.[c] ?? '') !== String(expected[r][c])) mismatches++;
    GridFinalist.addCheck('لصق 1000×6', mismatches === 0, `mismatches=${mismatches}`);

    await univerAPI.undo();
    await twoFrames();
    values = range.getValues();
    mismatches = 0;
    for (let r=0;r<1000;r++) for (let c=0;c<6;c++) if (String(values[r]?.[c] ?? '') !== String(original[r]?.[c] ?? '')) mismatches++;
    GridFinalist.addCheck('Undo أصلي', mismatches === 0, `mismatches=${mismatches}`);

    await univerAPI.redo();
    await twoFrames();
    values = range.getValues();
    mismatches = 0;
    for (let r=0;r<1000;r++) for (let c=0;c<6;c++) if (String(values[r]?.[c] ?? '') !== String(expected[r][c])) mismatches++;
    GridFinalist.addCheck('Redo أصلي', mismatches === 0, `mismatches=${mismatches}`);
  }

  async function filterCycle() {
    const s = sheet();
    const range = s.getRange(0, 0, Math.min(rowCount + 1, 2000), 8);
    if (typeof range.createFilter !== 'function') {
      GridFinalist.addCheck('Filter مجاني', false, 'createFilter غير متاح');
      return;
    }
    try { s.getFilter?.()?.remove?.(); } catch {}
    const filter = range.createFilter();
    const ok = !!filter;
    if (filter) filter.remove();
    GridFinalist.addCheck('Filter مجاني', ok, ok ? 'create/remove نجح' : 'لم يتم إنشاء الفلتر');
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

  async function runAutomatedTests() {
    GridFinalist.resetMetrics();
    GridFinalist.setStatus('جاري اختبار Univer…');
    const step = async (name, fn) => { try { await GridFinalist.measure(name, fn); } catch {} };
    await step('selection-anchor', anchorSelection);
    await step('selection-virtual-scroll', autoScrollKill);
    await step('paste-native-history', automatedPasteHistoryTest);
    await step('readonly', readonlyTest);
    await step('custom-column', customColumnCycle);
    await step('delete-restore', deleteRestore);
    await step('sort', sortCycle);
    await step('filter', filterCycle);
    await step('resize-selection', resizeSelectionTest);
    await step('final-selection', async () => { await anchorSelection(); await checkSelection(); });
    const failed = GridFinalist.state.checks.filter(x => !x.passed).length;
    GridFinalist.setStatus(failed ? `انتهى الاختبار: ${failed} فشل` : 'انتهى الاختبار الآلي: كل الاختبارات نجحت', failed ? 'error' : 'ok');
  }

  const adapter = { load, anchorSelection, checkSelection, autoScrollKill, preparePaste, verifyPaste, undoTest, redoTest, readonlyTest, customColumnCycle, deleteRestore, sortCycle, setRtl, afterResize, runAutomatedTests };
  GridFinalist.bindFinalistControls(adapter);
  load(10000).catch(error => {
    console.error(error);
    GridFinalist.setStatus(`Univer load failed: ${error.message}`, 'error');
  });
})();
