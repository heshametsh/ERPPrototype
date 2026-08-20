(function () {
  let univer = null;
  let univerAPI = null;
  let rtl = false;

  const headers = ["Work Order", "Work Type", "Assignment Date", "Work Order Value", "Partial Amount", "Remaining Amount", "Basket", "Notes"];

  function makeWorkbook(count) {
    const data = GridShootout.generateRows(count);
    const cellData = { 0: {} };
    headers.forEach((h, c) => { cellData[0][c] = { v: h }; });
    for (let i = 0; i < data.length; i += 1) {
      const row = data[i];
      cellData[i + 1] = {
        0: { v: row.workOrderNumber },
        1: { v: row.workTypeCode },
        2: { v: row.assignmentDate },
        3: { v: row.workOrderValue },
        4: { v: row.partialAmount },
        5: { v: row.remainingAmount },
        6: { v: row.basket },
        7: { v: row.notes },
      };
    }

    return {
      id: "erp-grid-bench",
      name: "ERP Grid Benchmark",
      sheetOrder: ["sheet-01"],
      sheets: {
        "sheet-01": {
          id: "sheet-01",
          name: "Work Orders",
          cellData,
          rowCount: count + 1,
          columnCount: 8,
          defaultRowHeight: 22,
          defaultColumnWidth: 120,
          rowHeader: { width: 50, hidden: 0 },
          columnHeader: { height: 28, hidden: 0 },
          rightToLeft: rtl ? 1 : 0,
          showGridlines: 1,
          zoomRatio: 1,
        },
      },
    };
  }

  function dispose() {
    try { univer?.dispose?.(); } catch {}
    univer = null;
    univerAPI = null;
    document.getElementById("grid").replaceChildren();
  }

  async function load(count) {
    GridShootout.resetMetrics();
    GridShootout.setStatus(`Building ${count.toLocaleString()}×8 workbook…`);
    const started = performance.now();
    dispose();

    if (!window.UniverPresets || !window.UniverCore || !window.UniverPresetSheetsCore) {
      throw new Error("Pinned Univer UMD namespaces did not load.");
    }

    const { createUniver } = window.UniverPresets;
    const { LocaleType, mergeLocales, merge } = window.UniverCore;
    const { UniverSheetsCorePreset } = window.UniverPresetSheetsCore;
    const locale = window.UniverPresetSheetsCoreEnUS;

    const created = createUniver({
      locale: LocaleType.EN_US,
      locales: { [LocaleType.EN_US]: (mergeLocales || merge)({}, locale) },
      presets: [UniverSheetsCorePreset({
        container: "grid",
        header: false,
        toolbar: false,
        footer: false,
        formulaBar: false,
      })],
    });

    univer = created.univer;
    univerAPI = created.univerAPI;
    const workbookData = makeWorkbook(count);
    if (typeof univerAPI.createWorkbook === "function") {
      univerAPI.createWorkbook(workbookData);
    } else if (typeof univerAPI.createUniverSheet === "function") {
      univerAPI.createUniverSheet(workbookData);
    } else {
      throw new Error("No workbook creation facade was found in Univer 0.25.1.");
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    GridShootout.state.notes.push({ at: Date.now(), type: "dataset-generation", ms: performance.now() - started, rows: count });
    GridShootout.markReady("Univer", "0.25.1");
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
    GridShootout.setStatus(`Univer load failed: ${error.message}`, "error");
  });
})();
