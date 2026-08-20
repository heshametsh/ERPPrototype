import { defineCustomElement as defineRevoGrid } from "https://cdn.jsdelivr.net/npm/@revolist/revogrid@4.25.2/standalone/revo-grid.js/+esm";
import { defineCustomElement as defineFilterPanel } from "https://cdn.jsdelivr.net/npm/@revolist/revogrid@4.25.2/standalone/revogr-filter-panel.js/+esm";

defineRevoGrid();
defineFilterPanel?.();

const ROWS = 50000;
const NEED_LICENSE = 6250;
const SCROLL_SECONDS = 15;
const PERF_LIMIT_MS = 250;

const state = {
  candidate: "RevoGrid Community Guided 2.4",
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
  filterHiddenCount: null,
  pastePrepared: null,
};

let grid;
let data;
let lastFrame = performance.now();
let scrollWindowStart = null;
let scrollWindowStartCount = 0;

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
      notes: `Row ${i + 1} — Guided Gate 2.4`,
    };
  }
  return rows;
}

const columns = () => [
  {name:"Work Order",prop:"workOrderNumber",size:150,sortable:true,filter:"string"},
  {name:"Work Type",prop:"workTypeCode",size:100,sortable:true,filter:"number"},
  {name:"Assignment Date",prop:"assignmentDate",size:135,sortable:true,filter:"string"},
  {name:"Work Order Value",prop:"workOrderValue",size:150,sortable:true,filter:"number"},
  {name:"Partial Amount",prop:"partialAmount",size:135,sortable:true,filter:"number"},
  {name:"Remaining Amount",prop:"remainingAmount",size:150,sortable:true,filter:"number",readonly:true},
  {name:"Basket",prop:"basket",size:170,sortable:true,filter:"string"},
  {name:"Notes",prop:"notes",size:260,sortable:true,filter:"string"},
];

function rangeX(r){ return r?.x ?? r?.start?.x ?? null; }
function rangeY(r){ return r?.y ?? r?.start?.y ?? null; }
function rangeX1(r){ return r?.x1 ?? r?.end?.x ?? rangeX(r); }
function rangeY1(r){ return r?.y1 ?? r?.end?.y ?? rangeY(r); }

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
  badge.textContent = status === "pass" ? "✓" : status === "fail" ? "✕" : status === "running" ? "…" : "…";
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
  const required = ["selection","scrollPerf","filter","paste","endRule"];
  const statuses = required.map(k => state.tests[k]?.status ?? "pending");
  const box = $("final-result");
  box.classList.remove("pass","fail");
  if (statuses.every(s => s === "pass")) {
    box.textContent = "النتيجة النهائية: PASS — RevoGrid Community عدى الاختبار الموجّه.";
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

async function startGuided() {
  $("start").disabled = true;
  state.stage = "scroll";
  setTest("selection","running","تم تحديد Basket؛ اختبره أثناء السحب.");
  setTest("scrollPerf","running","القياس شغال الآن.");
  await grid.setCellsFocus({x:6,y:0},{x:6,y:ROWS-1});
  await twoFrames();

  scrollWindowStart = performance.now();
  scrollWindowStartCount = state.scrollEvents;
  setInstruction("اسحب شريط الـScroll لفوق وتحت بسرعة، واستخدم Wheel بعنف كمان. استمر لحد العداد يخلص.", `${SCROLL_SECONDS}`);

  for (let remaining = SCROLL_SECONDS; remaining > 0; remaining--) {
    $("countdown").textContent = `${remaining}`;
    await wait(1000);
  }
  $("countdown").textContent = "";

  const selected = await grid.getSelectedRange();
  const selectionOk = rangeX(selected) === 6 && rangeX1(selected) === 6 && rangeY(selected) === 0 && rangeY1(selected) === ROWS - 1;
  setTest("selection", selectionOk ? "pass" : "fail", selectionOk ? "Basket فضل محدد صح بعد السحب." : `التحديد اتغير: ${JSON.stringify(selected)}`);

  const perf = currentPerfWindow(scrollWindowStart);
  const scrollDelta = state.scrollEvents - scrollWindowStartCount;
  const perfOk = scrollDelta >= 10 && perf.worstLong <= PERF_LIMIT_MS && perf.worstFrame <= PERF_LIMIT_MS;
  setTest("scrollPerf", perfOk ? "pass" : "fail", `Scroll=${scrollDelta} | Worst long=${perf.worstLong.toFixed(1)}ms | Worst frame=${perf.worstFrame.toFixed(1)}ms`);
  recordAction("guided-scroll-15s", scrollWindowStart, selectionOk && perfOk, JSON.stringify({scrollDelta,...perf}));

  state.stage = "filter-apply";
  setTest("filter","running","مستني الفلتر الحقيقي من رأس Basket.");
  setInstruction("دلوقتي من رأس Basket افتح علامة الفلتر → Equal → اكتب NeedLicense → Apply. الصفحة هتحكم لوحدها.");
}

async function evaluateFilterAfterTrim() {
  if (state.stage !== "filter-apply" && state.stage !== "filter-clear") return;
  await twoFrames();
  const visible = await grid.getVisibleSource();
  const visibleCount = visible.length;
  const trimmedProp = grid.trimmedRows || {};
  const trimmedCount = Object.values(trimmedProp).filter(Boolean).length;
  const hidden = state.filterHiddenCount ?? trimmedCount;

  if (state.stage === "filter-apply") {
    const sample = visible.slice(0, Math.min(200, visible.length));
    const sampleAllNeed = sample.length > 0 && sample.every(r => r.basket === "NeedLicense");
    const correctCount = visibleCount === NEED_LICENSE || hidden === ROWS - NEED_LICENSE || trimmedCount === ROWS - NEED_LICENSE;
    if (correctCount && sampleAllNeed) {
      setTest("filter","running",`تطبيق الفلتر PASS (${NEED_LICENSE.toLocaleString()} صف). دلوقتي امسح الفلتر.`);
      state.notes.push({at:Date.now(),type:"filter-applied",visibleCount,hidden,trimmedCount});
      state.stage = "filter-clear";
      setInstruction("الفلتر نجح ✅. امسح فلتر Basket من نفس الواجهة. لما يرجع كل الـ50,000 صف هيتحول الاختبار PASS تلقائيًا.");
    }
  } else {
    const cleared = visibleCount === ROWS || (trimmedCount === 0 && hidden === 0);
    if (cleared) {
      setTest("filter","pass",`Apply + Clear نجحوا. رجع ${ROWS.toLocaleString()} صف.`);
      state.notes.push({at:Date.now(),type:"filter-cleared",visibleCount,hidden,trimmedCount});
      state.stage = "paste-ready";
      $("prepare-paste").hidden = false;
      setInstruction("الفلتر خلص ✅. اضغط «جهّز Paste 5000» جنب الاختبار، وبعدها اضغط Ctrl+V مرة واحدة.");
    }
  }
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
  setInstruction("اضغط Ctrl+V مرة واحدة فقط. متضغطش أي زر فحص؛ النتيجة هتظهر لوحدها.");
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
  setInstruction("اختبار نهاية الشيت جاهز. اضغط Ctrl+V مرة واحدة فقط؛ المفروض يلصق 200 من الـ4000 من غير ما يضيف صفوف.");
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
    setInstruction("Paste خلص. دلوقتي اضغط «جهّز 4000→200» جنب آخر اختبار، وبعدها Ctrl+V مرة واحدة.");
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
    setInstruction("الاختبار خلص. بص على النتيجة النهائية وصدّر JSON وابعتلي الملف.");
    $("export").disabled = false;
    renderFinal();
  }
}

function snapshot() {
  const heap = performance.memory ? performance.memory.usedJSHeapSize / 1024 / 1024 : null;
  return {
    at: new Date().toISOString(),
    gate: "RevoGrid Community Guided Gate 2.4",
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
  a.download = `grid-gate24-revogrid-guided-${Date.now()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function load() {
  data = generateRows(ROWS);
  await customElements.whenDefined("revo-grid");
  await customElements.whenDefined("revogr-filter-panel");

  grid = document.createElement("revo-grid");
  grid.style.width = "100%";
  grid.style.height = "720px";
  grid.filter = true;
  grid.columns = columns();
  grid.source = data;
  grid.range = true;
  grid.useClipboard = {rangeFill:true};
  grid.resize = true;
  grid.rowHeaders = true;
  grid.rowSize = 22;
  $("grid").replaceChildren(grid);

  grid.addEventListener("viewportscroll", () => { state.scrollEvents++; });
  grid.addEventListener("beforefiltertrimmed", event => {
    const items = event?.detail?.itemsToFilter || {};
    state.filterHiddenCount = Object.keys(items).filter(key => items[key]).length;
    state.notes.push({at:Date.now(),type:"beforefiltertrimmed",hidden:state.filterHiddenCount});
  });
  grid.addEventListener("aftertrimmed", () => {
    state.notes.push({at:Date.now(),type:"aftertrimmed"});
    evaluateFilterAfterTrim().catch(console.error);
  });
  grid.addEventListener("afterpasteapply", () => {
    state.notes.push({at:Date.now(),type:"afterpasteapply",stage:state.stage});
    handlePasteApplied().catch(console.error);
  });

  await twoFrames();
  state.readyMs = performance.now() - state.startedAt;
  state.stage = "ready";
  $("start").disabled = false;
  setInstruction("الشيت جاهز. اضغط «ابدأ الاختبار» مرة واحدة، وبعدها نفّذ التعليمات اللي هتظهر هنا فقط.");
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

$("start").addEventListener("click", () => startGuided().catch(error => { console.error(error); setInstruction(`حصل خطأ في الاختبار: ${error.message}`); }));
$("prepare-paste").addEventListener("click", () => preparePaste5000().catch(console.error));
$("prepare-end").addEventListener("click", () => prepareEndRule().catch(console.error));
$("restart").addEventListener("click", () => location.reload());
$("export").addEventListener("click", exportJson);

load().catch(error => {
  console.error(error);
  setInstruction(`Load failed: ${error.message}`);
});
