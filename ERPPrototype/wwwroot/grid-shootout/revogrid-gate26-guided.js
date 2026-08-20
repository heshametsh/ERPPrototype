import { defineCustomElement as defineRevoGrid } from "https://cdn.jsdelivr.net/npm/@revolist/revogrid@4.25.2/standalone/revo-grid.js/+esm";
import { defineCustomElement as defineFilterPanel } from "https://cdn.jsdelivr.net/npm/@revolist/revogrid@4.25.2/standalone/revogr-filter-panel.js/+esm";

defineRevoGrid();
defineFilterPanel?.();

const ROWS = 50000;
const NEED_LICENSE = 6250;
const NEED_LICENSE_HIDDEN = ROWS - NEED_LICENSE;
const SCROLL_SECONDS = 15;
const PERF_LIMIT_MS = 250;

const state = {
  candidate: "RevoGrid Community Guided 2.6",
  version: "4.25.2",
  rows: ROWS,
  startedAt: performance.now(),
  readyMs: null,
  stage: "loading",
  tests: {},
  actions: [],
  notes: [],
  longTaskEntries: [],
  frameGaps: [],
  scrollEvents: 0,
  pastePrepared: null,
  filterCollection: null,
  filterHiddenCount: null,
  selectionSortLeak: false,
};

let grid;
let data;
let gridColumns;
let lastFrame = performance.now();
let scrollWindowStart = null;
let scrollWindowStartCount = 0;
let selectionPoll = null;
let headerSelectionTxn = false;
let programmaticColumnSelection = false;
let headerSelectionTimer = null;

const $ = id => document.getElementById(id);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const twoFrames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

function generateRows(count) {
  const baskets = ["NeedLicense","UnderExecution","InspectionBasket","ModifyEstimate","Engineering","IssueReturn","InvoiceBasket","FinanceBasket"];
  const rows = new Array(count);
  for (let i = 0; i < count; i++) {
    const value = 10000 + ((i * 7919) % 490000);
    const partial = i % 4 === 0 ? Math.round(value * 0.35) : 0;
    rows[i] = {
      id: i + 1,
      workOrderNumber: String(233000000 + i),
      workTypeCode: [401,402,801,802][i % 4],
      assignmentDate: `2026-${String((i % 12) + 1).padStart(2,"0")}-${String((i % 28) + 1).padStart(2,"0")}`,
      workOrderValue: value,
      partialAmount: partial,
      remainingAmount: value - partial,
      basket: baskets[i % 8],
      notes: `Row ${i + 1} — Guided Gate 2.6`,
    };
  }
  return rows;
}

function rangeX(r){ return r?.x ?? r?.start?.x ?? null; }
function rangeY(r){ return r?.y ?? r?.start?.y ?? null; }
function rangeX1(r){ return r?.x1 ?? r?.end?.x ?? rangeX(r); }
function rangeY1(r){ return r?.y1 ?? r?.end?.y ?? rangeY(r); }

function logicalIndexForProp(prop) {
  return gridColumns.findIndex(column => String(column.prop) === String(prop));
}

function visualIndexForProp(prop) {
  const logical = logicalIndexForProp(prop);
  if (logical < 0) return -1;
  return grid?.rtl ? gridColumns.length - 1 - logical : logical;
}

async function selectWholeColumn(prop) {
  const x = visualIndexForProp(prop);
  if (x < 0) return false;
  programmaticColumnSelection = true;
  try {
    await grid.setCellsFocus({x,y:0},{x,y:ROWS-1});
    grid.focus({preventScroll:true});
    await twoFrames();
    return isWholeColumn(await grid.getSelectedRange(), prop);
  } finally {
    programmaticColumnSelection = false;
  }
}

function headerTemplate(h, column) {
  const order = column?.order;
  const glyph = order === "asc" ? "↑" : order === "desc" ? "↓" : "↕";
  return h("span", { class: "erp-header-inner" }, [
    h("span", {
      class: "erp-header-title",
      "data-erp-header-action": "select",
      title: "اضغط لتحديد العمود كله"
    }, column.name || String(column.prop || "")),
    h("span", {
      class: "erp-sort-trigger",
      "data-erp-header-action": "sort",
      title: "ترتيب العمود"
    }, glyph)
  ]);
}

function headerActionFromOriginalEvent(originalEvent) {
  const path = originalEvent?.composedPath?.() || [];
  for (const node of path) {
    const action = node?.dataset?.erpHeaderAction;
    if (action) return action;
  }
  return null;
}

function endHeaderSelectionTxnSoon() {
  if (headerSelectionTimer) clearTimeout(headerSelectionTimer);
  headerSelectionTimer = setTimeout(() => {
    headerSelectionTxn = false;
    headerSelectionTimer = null;
  }, 180);
}

function columns() {
  const common = { sortable:true, columnTemplate:headerTemplate };
  return [
    {...common,name:"Work Order",prop:"workOrderNumber",size:150,filter:"string"},
    {...common,name:"Work Type",prop:"workTypeCode",size:100,filter:"number"},
    {...common,name:"Assignment Date",prop:"assignmentDate",size:135,filter:"string"},
    {...common,name:"Work Order Value",prop:"workOrderValue",size:150,filter:"number"},
    {...common,name:"Partial Amount",prop:"partialAmount",size:135,filter:"number"},
    {...common,name:"Remaining Amount",prop:"remainingAmount",size:150,filter:"number",readonly:true},
    {...common,name:"Basket",prop:"basket",size:170,filter:"string"},
    {...common,name:"Notes",prop:"notes",size:260,filter:"string"},
  ];
}

function setInstruction(text, countdown = "") {
  $("instruction").textContent = text;
  $("countdown").textContent = countdown;
}

function setTest(name, status, detail = "") {
  const card = document.querySelector(`[data-test="${name}"]`);
  if (!card) return;
  card.classList.remove("running","pass","fail");
  if (status !== "pending") card.classList.add(status);
  const badge = card.querySelector(".test-badge");
  badge.className = `test-badge ${status}`;
  badge.textContent = status === "pass" ? "✓" : status === "fail" ? "✕" : "…";
  if (detail) {
    const small = card.querySelector("small");
    if (small) small.textContent = detail;
  }
  state.tests[name] = { status, detail, at: Date.now() };
  renderFinal();
}

function renderMetrics() {
  const heap = performance.memory ? performance.memory.usedJSHeapSize / 1024 / 1024 : null;
  const worstLong = state.longTaskEntries.length ? Math.max(...state.longTaskEntries.map(x => x.duration)) : 0;
  const worstFrame = state.frameGaps.length ? Math.max(...state.frameGaps.map(x => x.gap)) : 0;
  $("metrics").innerHTML = `
    <div>Ready</div><strong>${state.readyMs == null ? "—" : `${state.readyMs.toFixed(1)} ms`}</strong>
    <div>Scroll events</div><strong>${state.scrollEvents}</strong>
    <div>Long tasks</div><strong>${state.longTaskEntries.length}</strong>
    <div>Worst long</div><strong>${worstLong.toFixed(1)} ms</strong>
    <div>Worst frame</div><strong>${worstFrame.toFixed(1)} ms</strong>
    <div>JS heap</div><strong>${heap == null ? "n/a" : `${heap.toFixed(1)} MB`}</strong>
    <div>DOM</div><strong>${document.getElementsByTagName("*").length}</strong>`;
}

function renderFinal() {
  const required = ["selection","scrollPerf","sort","filter","paste","endRule"];
  const statuses = required.map(k => state.tests[k]?.status ?? "pending");
  const box = $("final-result");
  box.classList.remove("pass","fail");
  if (statuses.every(s => s === "pass")) {
    box.textContent = "النتيجة النهائية: PASS — حل Community المجاني عدى Gate 2.6.";
    box.classList.add("pass");
    $("export").disabled = false;
  } else if (statuses.some(s => s === "fail")) {
    box.textContent = "النتيجة النهائية: يوجد FAIL — صدّر JSON وابعتلي النتيجة.";
    box.classList.add("fail");
    $("export").disabled = false;
  } else {
    box.textContent = "النتيجة النهائية: الاختبار لم يكتمل بعد.";
  }
}

function recordAction(name, started, ok, detail = "") {
  state.actions.push({ at: Date.now(), name, ms: performance.now() - started, ok, detail });
}

function currentPerfWindow(start) {
  const longs = state.longTaskEntries.filter(x => x.at >= start);
  const gaps = state.frameGaps.filter(x => x.at >= start);
  return {
    longTasks: longs.length,
    worstLong: longs.length ? Math.max(...longs.map(x => x.duration)) : 0,
    frameGaps: gaps.length,
    worstFrame: gaps.length ? Math.max(...gaps.map(x => x.gap)) : 0,
  };
}

function isWholeColumn(range, prop) {
  const x = visualIndexForProp(prop);
  return x >= 0 && rangeX(range) === x && rangeX1(range) === x && rangeY(range) === 0 && rangeY1(range) === ROWS - 1;
}

function isWholeBasket(range) {
  return isWholeColumn(range, "basket");
}

async function waitForManualBasketSelection() {
  if (selectionPoll) clearInterval(selectionPoll);
  selectionPoll = setInterval(async () => {
    if (state.stage !== "selection-wait") return;
    const range = await grid.getSelectedRange();
    if (!isWholeBasket(range)) return;
    clearInterval(selectionPoll);
    selectionPoll = null;
    if (state.selectionSortLeak) {
      setTest("selection","fail","اسم Basket شغّل Sort بالغلط.");
      state.stage = "done";
      setInstruction("ظهر تعارض بين تحديد العمود والـSort. صدّر JSON.");
      return;
    }
    setTest("selection","running","اسم Basket حدد العمود كله بدون Sort. دلوقتي نختبر ثباته.");
    await runScrollWindow();
  }, 200);
}

async function startGuided() {
  $("start").disabled = true;
  state.stage = "selection-wait";
  state.selectionSortLeak = false;
  setTest("selection","running","اضغط على اسم Basket نفسه في الهيدر.");
  setInstruction("اضغط على كلمة Basket في رأس العمود. المفروض يتحدد العمود كله من غير ما يترتب.");
  await waitForManualBasketSelection();
}

async function runScrollWindow() {
  state.stage = "scroll";
  setTest("scrollPerf","running","القياس شغال الآن.");
  scrollWindowStart = performance.now();
  scrollWindowStartCount = state.scrollEvents;
  setInstruction("اسحب شريط الـScroll لفوق وتحت بسرعة واستخدم Wheel بعنف. استمر لحد العداد يخلص.", `${SCROLL_SECONDS}`);

  for (let remaining = SCROLL_SECONDS; remaining > 0; remaining--) {
    $("countdown").textContent = `${remaining}`;
    await wait(1000);
  }
  $("countdown").textContent = "";

  const selected = await grid.getSelectedRange();
  const selectionOk = isWholeBasket(selected);
  setTest("selection", selectionOk ? "pass" : "fail", selectionOk ? "Basket فضل محدد صح بعد السحب." : `التحديد اتغير: ${JSON.stringify(selected)}`);

  const perf = currentPerfWindow(scrollWindowStart);
  const scrollDelta = state.scrollEvents - scrollWindowStartCount;
  const perfOk = scrollDelta >= 10 && perf.worstLong <= PERF_LIMIT_MS && perf.worstFrame <= PERF_LIMIT_MS;
  setTest("scrollPerf", perfOk ? "pass" : "fail", `Scroll=${scrollDelta} | Worst long=${perf.worstLong.toFixed(1)}ms | Worst frame=${perf.worstFrame.toFixed(1)}ms`);
  recordAction("guided-scroll-15s", scrollWindowStart, selectionOk && perfOk, JSON.stringify({scrollDelta,...perf}));

  state.stage = "sort-wait";
  setTest("sort","running","مستني ضغط ↕ في Work Order.");
  setInstruction("دلوقتي اضغط علامة ↕ الصغيرة في رأس Work Order مرة واحدة. اسم العمود نفسه للتحديد؛ ↕ للترتيب.");
}

function filterValueFromCollection(collection) {
  const item = collection?.basket;
  if (!item) return null;
  if (Array.isArray(item)) return item[0]?.value ?? null;
  return item.value ?? null;
}

function acceptFilterTrim(hidden, sourceType) {
  state.filterHiddenCount = hidden;
  state.notes.push({at:Date.now(),type:sourceType,hidden,stage:state.stage});

  if (state.stage === "filter-apply") {
    const value = filterValueFromCollection(state.filterCollection);
    if (hidden === NEED_LICENSE_HIDDEN && value === "NeedLicense") {
      setTest("filter","running",`Apply نجح: ظاهر ${NEED_LICENSE.toLocaleString()} صف. امسح الفلتر بـ Reset.`);
      state.stage = "filter-clear";
      setInstruction("الفلتر اتطبق صح ✅. اضغط Reset في نافذة الفلتر علشان يرجع كل الـ50,000 صف.");
    }
  } else if (state.stage === "filter-clear" && hidden === 0) {
    setTest("filter","pass",`Apply + Reset نجحوا (${NEED_LICENSE.toLocaleString()} → ${ROWS.toLocaleString()}).`);
    state.stage = "paste-ready";
    $("prepare-paste").hidden = false;
    setInstruction("الفلتر خلص ✅. اضغط «جهّز Paste 5000» ثم Ctrl+V مرة واحدة.");
  }
}

function handleFilterTrim(event) {
  const items = event?.detail?.itemsToFilter || {};
  const hidden = Object.keys(items).filter(key => items[key]).length;
  acceptFilterTrim(hidden, "beforefiltertrimmed");
}

function handleGenericTrim(event) {
  const trimmed = event?.detail?.trimmed || {};
  const hidden = Object.keys(trimmed).filter(key => trimmed[key]).length;
  const trimmedType = String(event?.detail?.trimmedType || "");
  if (!trimmedType.toLowerCase().includes("filter") && state.stage !== "filter-apply" && state.stage !== "filter-clear") return;
  acceptFilterTrim(hidden, `beforetrimmed:${trimmedType || "unknown"}`);
}

async function copyPayload(rows, seed = 0) {
  const text = Array.from({length:rows}, (_,i) => String(910000000 + seed + i)).join("\n");
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

async function preparePaste5000() {
  const started = performance.now();
  const target = 100;
  await copyPayload(5000);
  await grid.scrollToRow(target);
  await grid.setCellsFocus({x:0,y:target},{x:0,y:target});
  grid.focus({preventScroll:true});
  await twoFrames();
  state.pastePrepared = { kind:"paste", target, startedAt: performance.now() };
  state.stage = "paste-wait";
  $("prepare-paste").hidden = true;
  setTest("paste","running","جاهز. اضغط Ctrl+V مرة واحدة فقط.");
  setInstruction("اضغط Ctrl+V مرة واحدة فقط. النتيجة هتظهر تلقائيًا.");
  recordAction("prepare-paste-5000", started, true);
}

async function prepareEndRule() {
  const started = performance.now();
  const target = ROWS - 200;
  await copyPayload(4000, 20000);
  await grid.scrollToRow(target);
  await grid.setCellsFocus({x:0,y:target},{x:0,y:target});
  grid.focus({preventScroll:true});
  await twoFrames();
  state.pastePrepared = { kind:"end", target, startedAt: performance.now() };
  state.stage = "end-wait";
  $("prepare-end").hidden = true;
  setTest("endRule","running","جاهز. اضغط Ctrl+V مرة واحدة.");
  setInstruction("اختبار نهاية الشيت جاهز. اضغط Ctrl+V مرة واحدة؛ المفروض يلصق 200 فقط من الـ4000.");
  recordAction("prepare-end-rule", started, true);
}

async function handlePasteApplied() {
  const txn = state.pastePrepared;
  if (!txn) return;
  await twoFrames();
  const source = await grid.getSource();

  if (txn.kind === "paste" && state.stage === "paste-wait") {
    let bad = 0;
    for (let i = 0; i < 5000; i++) {
      if (String(source[txn.target + i]?.workOrderNumber ?? "") !== String(910000000 + i)) bad++;
    }
    const ms = performance.now() - txn.startedAt;
    const ok = bad === 0;
    setTest("paste", ok ? "pass" : "fail", `${ok ? "5000/5000" : `mismatches=${bad}`} | ${ms.toFixed(1)}ms`);
    recordAction("native-paste-5000", txn.startedAt, ok, `mismatches=${bad}`);
    state.pastePrepared = null;
    state.stage = "end-ready";
    $("prepare-end").hidden = false;
    setInstruction("Paste خلص. اضغط «جهّز 4000→200» ثم Ctrl+V مرة واحدة.");
  } else if (txn.kind === "end" && state.stage === "end-wait") {
    let bad = 0;
    for (let i = 0; i < 200; i++) {
      if (String(source[ROWS - 200 + i]?.workOrderNumber ?? "") !== String(910020000 + i)) bad++;
    }
    const ms = performance.now() - txn.startedAt;
    const ok = source.length === ROWS && bad === 0;
    setTest("endRule", ok ? "pass" : "fail", `rows=${source.length.toLocaleString()} | pasted=${200 - bad}/200 | ${ms.toFixed(1)}ms`);
    recordAction("native-end-rule-4000-to-200", txn.startedAt, ok, `rows=${source.length}, mismatches=${bad}`);
    state.pastePrepared = null;
    state.stage = "done";
    setInstruction("الاختبار خلص. صدّر JSON وابعتلي الملف.");
    $("export").disabled = false;
    renderFinal();
  }
}

function snapshot() {
  const heap = performance.memory ? performance.memory.usedJSHeapSize / 1024 / 1024 : null;
  return {
    at: new Date().toISOString(),
    gate: "RevoGrid Community Guided Gate 2.6",
    candidate: state.candidate,
    version: state.version,
    rows: state.rows,
    readyMs: state.readyMs,
    stage: state.stage,
    tests: state.tests,
    actions: state.actions,
    notes: state.notes,
    scrollEvents: state.scrollEvents,
    longTasks: state.longTaskEntries.length,
    longTaskTotalMs: state.longTaskEntries.reduce((a,x)=>a+x.duration,0),
    longTaskMaxMs: state.longTaskEntries.length ? Math.max(...state.longTaskEntries.map(x=>x.duration)) : 0,
    frameGapOver50: state.frameGaps.filter(x=>x.gap>50).length,
    maxFrameGapMs: state.frameGaps.length ? Math.max(...state.frameGaps.map(x=>x.gap)) : 0,
    heapMb: heap,
    domNodes: document.getElementsByTagName("*").length,
    viewport: {width:innerWidth,height:innerHeight,dpr:devicePixelRatio},
    userAgent: navigator.userAgent,
  };
}

function exportJson() {
  const blob = new Blob([JSON.stringify(snapshot(), null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `grid-gate25-revogrid-guided-${Date.now()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function load() {
  data = generateRows(ROWS);
  gridColumns = columns();
  await customElements.whenDefined("revo-grid");
  await customElements.whenDefined("revogr-filter-panel");

  grid = document.createElement("revo-grid");
  grid.style.width = "100%";
  grid.style.height = "720px";
  grid.filter = true;
  grid.columns = gridColumns;
  grid.source = data;
  grid.range = true;
  grid.useClipboard = {rangeFill:true};
  grid.resize = true;
  grid.rowHeaders = true;
  grid.rowSize = 22;
  $("grid").replaceChildren(grid);

  grid.addEventListener("beforeheaderclick", event => {
    const originalEvent = event?.detail?.originalEvent;
    const action = headerActionFromOriginalEvent(originalEvent);
    if (action !== "select") return;

    const prop = event?.detail?.column?.prop;
    if (prop == null) return;

    headerSelectionTxn = true;
    event.preventDefault?.();
    originalEvent?.preventDefault?.();
    originalEvent?.stopPropagation?.();
    originalEvent?.stopImmediatePropagation?.();

    state.notes.push({at:Date.now(),type:"header-select-intercept",prop:String(prop),stage:state.stage});

    queueMicrotask(async () => {
      const ok = await selectWholeColumn(prop);
      state.notes.push({at:Date.now(),type:"header-select-applied",prop:String(prop),ok,stage:state.stage});
      endHeaderSelectionTxnSoon();
    });
  });

  grid.addEventListener("beforesorting", event => {
    if (!headerSelectionTxn) return;
    event.preventDefault?.();
    state.notes.push({at:Date.now(),type:"sort-blocked-during-header-selection",stage:state.stage});
  });

  grid.addEventListener("beforecellfocus", event => {
    if (headerSelectionTxn && !programmaticColumnSelection) {
      event.preventDefault?.();
      state.notes.push({at:Date.now(),type:"cell-focus-blocked-during-header-selection",stage:state.stage});
    }
  });

  grid.addEventListener("viewportscroll", () => { state.scrollEvents++; });
  grid.addEventListener("aftersortingapply", event => {
    state.notes.push({at:Date.now(),type:"aftersortingapply",detail:event?.detail || null,stage:state.stage});
    if (state.stage === "selection-wait") {
      state.selectionSortLeak = true;
      return;
    }
    if (state.stage !== "sort-wait") return;
    const sorting = event?.detail?.sorting || {};
    const columnEntry = event?.detail?.sortingColumns?.workOrderNumber;
    const order = sorting.workOrderNumber ?? columnEntry?.order ?? null;
    if (order === "asc" || order === "desc") {
      setTest("sort","pass",`Work Order اتعمله Sort ${order.toUpperCase()} من زر ↕ فقط.`);
      state.stage = "filter-apply";
      setTest("filter","running","مستني Basket = Equal → NeedLicense → Apply.");
      setInstruction("افتح علامة الفلتر في Basket → Equal → اكتب NeedLicense → Apply. بعد النجاح هقولك تعمل Reset.");
    }
  });
  grid.addEventListener("beforefilterapply", event => {
    state.filterCollection = event?.detail?.collection || null;
    state.notes.push({at:Date.now(),type:"beforefilterapply",collection:state.filterCollection,stage:state.stage});
  });
  grid.addEventListener("beforefiltertrimmed", handleFilterTrim);
  grid.addEventListener("beforetrimmed", handleGenericTrim);
  grid.addEventListener("afterpasteapply", () => {
    state.notes.push({at:Date.now(),type:"afterpasteapply",stage:state.stage});
    handlePasteApplied().catch(console.error);
  });

  await twoFrames();
  state.readyMs = performance.now() - state.startedAt;
  state.stage = "ready";
  $("start").disabled = false;
  setInstruction("الشيت جاهز. اضغط «ابدأ الاختبار»، وبعدها نفّذ الجملة اللي تظهر فوق فقط.");
  renderMetrics();
}

try {
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      state.longTaskEntries.push({at:performance.now(),duration:entry.duration});
    }
  }).observe({type:"longtask",buffered:true});
} catch {}

function frameLoop(now) {
  const gap = now - lastFrame;
  lastFrame = now;
  if (gap > 16.7) state.frameGaps.push({at:now,gap});
  requestAnimationFrame(frameLoop);
}
requestAnimationFrame(frameLoop);
setInterval(renderMetrics, 500);

$("start").addEventListener("click", () => startGuided().catch(error => { console.error(error); setInstruction(`حصل خطأ: ${error.message}`); }));
$("prepare-paste").addEventListener("click", () => preparePaste5000().catch(console.error));
$("prepare-end").addEventListener("click", () => prepareEndRule().catch(console.error));
$("restart").addEventListener("click", () => location.reload());
$("export").addEventListener("click", exportJson);

load().catch(error => {
  console.error(error);
  setInstruction(`Load failed: ${error.message}`);
});
