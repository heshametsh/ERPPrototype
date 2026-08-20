(function () {
  const state = {
    candidate: "unknown",
    version: "unknown",
    startedAt: performance.now(),
    readyAt: null,
    longTasks: 0,
    longTaskTotalMs: 0,
    longTaskMaxMs: 0,
    frameCount: 0,
    frameGapOver50: 0,
    maxFrameGapMs: 0,
    wheelEvents: 0,
    scrollEvents: 0,
    lastFrameAt: performance.now(),
    notes: [],
  };

  let rafId = 0;
  let statusElm = null;
  let metricsElm = null;

  function randomBasket(i) {
    const baskets = ["NeedLicense", "UnderExecution", "InspectionBasket", "ModifyEstimate", "Engineering", "IssueReturn", "InvoiceBasket", "FinanceBasket"];
    return baskets[i % baskets.length];
  }

  function generateRows(count) {
    const rows = new Array(count);
    for (let i = 0; i < count; i += 1) {
      const workOrderValue = 10000 + ((i * 7919) % 490000);
      const partial = i % 4 === 0 ? Math.round(workOrderValue * 0.35) : 0;
      rows[i] = {
        id: i + 1,
        workOrderNumber: String(233000000 + i),
        workTypeCode: [401, 402, 801, 802][i % 4],
        assignmentDate: `2026-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
        workOrderValue,
        partialAmount: partial,
        remainingAmount: workOrderValue - partial,
        basket: randomBasket(i),
        notes: `Row ${i + 1} — ERP benchmark data`,
      };
    }
    return rows;
  }

  function payloadText(rowCount = 1000, colCount = 6) {
    const rows = [];
    for (let r = 0; r < rowCount; r += 1) {
      const vals = [
        String(900000000 + r),
        String([401, 402, 801, 802][r % 4]),
        `2026-${String((r % 12) + 1).padStart(2, "0")}-${String((r % 28) + 1).padStart(2, "0")}`,
        String(10000 + r * 17),
        String(r % 3 === 0 ? 2500 : 0),
        `PASTE-${r + 1}`,
      ];
      rows.push(vals.slice(0, colCount).join("\t"));
    }
    return rows.join("\n");
  }

  async function copyPayload() {
    const text = payloadText(1000, 6);
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied 1000×6 payload. Select a cell and press Ctrl+V.", "ok");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      setStatus("Copied 1000×6 payload using fallback. Select a cell and press Ctrl+V.", "ok");
    }
  }

  function setStatus(message, kind) {
    if (!statusElm) statusElm = document.getElementById("bench-status");
    if (!statusElm) return;
    statusElm.textContent = message;
    statusElm.className = `status${kind ? ` ${kind}` : ""}`;
  }

  function markReady(candidate, version) {
    state.candidate = candidate;
    state.version = version;
    state.readyAt = performance.now();
    state.notes.push({ at: Date.now(), type: "ready", ms: state.readyAt - state.startedAt });
    setStatus(`${candidate} ready — ${(state.readyAt - state.startedAt).toFixed(1)} ms`, "ok");
    renderMetrics();
  }

  function resetMetrics() {
    state.startedAt = performance.now();
    state.readyAt = null;
    state.longTasks = 0;
    state.longTaskTotalMs = 0;
    state.longTaskMaxMs = 0;
    state.frameCount = 0;
    state.frameGapOver50 = 0;
    state.maxFrameGapMs = 0;
    state.wheelEvents = 0;
    state.scrollEvents = 0;
    state.lastFrameAt = performance.now();
    state.notes = [];
    setStatus("Metrics reset. Start the torture cycle.");
    renderMetrics();
  }

  function getHeapMb() {
    return performance.memory ? performance.memory.usedJSHeapSize / 1024 / 1024 : null;
  }

  function snapshot() {
    const snap = {
      at: new Date().toISOString(),
      candidate: state.candidate,
      version: state.version,
      readyMs: state.readyAt ? state.readyAt - state.startedAt : null,
      longTasks: state.longTasks,
      longTaskTotalMs: state.longTaskTotalMs,
      longTaskMaxMs: state.longTaskMaxMs,
      frameCount: state.frameCount,
      frameGapOver50: state.frameGapOver50,
      maxFrameGapMs: state.maxFrameGapMs,
      wheelEvents: state.wheelEvents,
      scrollEvents: state.scrollEvents,
      heapMb: getHeapMb(),
      domNodes: document.getElementsByTagName("*").length,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      userAgent: navigator.userAgent,
      notes: state.notes.slice(),
    };
    state.notes.push({ at: Date.now(), type: "snapshot", data: snap });
    setStatus("Snapshot recorded.", "ok");
    renderMetrics();
    return snap;
  }

  function exportMetrics() {
    const data = snapshot();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grid-shootout-${state.candidate.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function renderMetrics() {
    if (!metricsElm) metricsElm = document.getElementById("bench-metrics");
    if (!metricsElm) return;
    const heap = getHeapMb();
    const ready = state.readyAt ? `${(state.readyAt - state.startedAt).toFixed(1)} ms` : "—";
    metricsElm.innerHTML = `
      <div>Ready</div><strong>${ready}</strong>
      <div>Long tasks</div><strong>${state.longTasks}</strong>
      <div>Long task total</div><strong>${state.longTaskTotalMs.toFixed(0)} ms</strong>
      <div>Worst long task</div><strong>${state.longTaskMaxMs.toFixed(1)} ms</strong>
      <div>Frame gaps &gt;50ms</div><strong>${state.frameGapOver50}</strong>
      <div>Worst frame gap</div><strong>${state.maxFrameGapMs.toFixed(1)} ms</strong>
      <div>Wheel events</div><strong>${state.wheelEvents}</strong>
      <div>Scroll events</div><strong>${state.scrollEvents}</strong>
      <div>JS heap</div><strong>${heap == null ? "n/a" : `${heap.toFixed(1)} MB`}</strong>
      <div>DOM nodes</div><strong>${document.getElementsByTagName("*").length}</strong>`;
  }

  function frameLoop(now) {
    const gap = now - state.lastFrameAt;
    state.lastFrameAt = now;
    state.frameCount += 1;
    if (gap > 50) {
      state.frameGapOver50 += 1;
      state.maxFrameGapMs = Math.max(state.maxFrameGapMs, gap);
    }
    rafId = requestAnimationFrame(frameLoop);
  }

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        state.longTasks += 1;
        state.longTaskTotalMs += entry.duration;
        state.longTaskMaxMs = Math.max(state.longTaskMaxMs, entry.duration);
      }
    }).observe({ type: "longtask", buffered: true });
  } catch {}

  document.addEventListener("wheel", () => { state.wheelEvents += 1; }, { capture: true, passive: true });
  document.addEventListener("scroll", () => { state.scrollEvents += 1; }, { capture: true, passive: true });
  rafId = requestAnimationFrame(frameLoop);
  setInterval(renderMetrics, 500);

  function bindCommonControls({ reload, setRtl }) {
    const rowsSelect = document.getElementById("row-count");
    const reloadBtn = document.getElementById("reload-grid");
    const payloadBtn = document.getElementById("copy-payload");
    const splitBtn = document.getElementById("toggle-split");
    const rtlBtn = document.getElementById("toggle-rtl");
    const resetBtn = document.getElementById("reset-metrics");
    const exportBtn = document.getElementById("export-metrics");
    let rtl = false;
    let split = false;

    reloadBtn?.addEventListener("click", () => reload(Number(rowsSelect.value)));
    payloadBtn?.addEventListener("click", copyPayload);
    splitBtn?.addEventListener("click", () => {
      split = !split;
      document.getElementById("grid-card")?.classList.toggle("is-split", split);
      window.dispatchEvent(new Event("resize"));
      state.notes.push({ at: Date.now(), type: "split", enabled: split });
      setStatus(`Split width ${split ? "ON" : "OFF"}.`);
    });
    rtlBtn?.addEventListener("click", () => {
      rtl = !rtl;
      setRtl?.(rtl);
      state.notes.push({ at: Date.now(), type: "rtl", enabled: rtl });
      setStatus(`RTL ${rtl ? "ON" : "OFF"}.`);
    });
    resetBtn?.addEventListener("click", resetMetrics);
    exportBtn?.addEventListener("click", exportMetrics);
  }

  window.GridShootout = {
    generateRows,
    payloadText,
    copyPayload,
    markReady,
    setStatus,
    resetMetrics,
    snapshot,
    exportMetrics,
    bindCommonControls,
    state,
  };
})();
