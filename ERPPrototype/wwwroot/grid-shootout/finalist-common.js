(function () {
  const state = {
    candidate: 'unknown',
    version: 'unknown',
    rowCount: 0,
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
    actions: [],
    checks: [],
    notes: [],
  };

  let statusElm = null;
  let metricsElm = null;
  let checksElm = null;

  const fields = ['workOrderNumber','workTypeCode','assignmentDate','workOrderValue','partialAmount','remainingAmount','basket','notes'];

  function randomBasket(i) {
    const baskets = ['NeedLicense','UnderExecution','InspectionBasket','ModifyEstimate','Engineering','IssueReturn','InvoiceBasket','FinanceBasket'];
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
        workTypeCode: [401,402,801,802][i % 4],
        assignmentDate: `2026-${String((i % 12) + 1).padStart(2,'0')}-${String((i % 28) + 1).padStart(2,'0')}`,
        workOrderValue,
        partialAmount: partial,
        remainingAmount: workOrderValue - partial,
        basket: randomBasket(i),
        notes: `Row ${i + 1} — ERP finalist benchmark`,
      };
    }
    return rows;
  }

  function payloadMatrix(rowCount = 1000, colCount = 6) {
    const rows = [];
    for (let r = 0; r < rowCount; r += 1) {
      const vals = [
        String(900000000 + r),
        String([401,402,801,802][r % 4]),
        `2026-${String((r % 12) + 1).padStart(2,'0')}-${String((r % 28) + 1).padStart(2,'0')}`,
        String(10000 + r * 17),
        String(r % 3 === 0 ? 2500 : 0),
        String(7500 + r * 17),
      ];
      rows.push(vals.slice(0, colCount));
    }
    return rows;
  }

  function payloadText(rowCount = 1000, colCount = 6) {
    return payloadMatrix(rowCount, colCount).map(r => r.join('\t')).join('\n');
  }

  async function copyPayload() {
    const text = payloadText(1000, 6);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setStatus('Copied 1000×6. Press Prepare paste target, then Ctrl+V.', 'ok');
  }

  function setStatus(message, kind) {
    statusElm ||= document.getElementById('bench-status');
    if (!statusElm) return;
    statusElm.textContent = message;
    statusElm.className = `status${kind ? ` ${kind}` : ''}`;
  }

  function addCheck(name, passed, detail) {
    state.checks.push({ at: Date.now(), name, passed: !!passed, detail: detail ?? '' });
    setStatus(`${passed ? 'PASS' : 'FAIL'} — ${name}${detail ? ` — ${detail}` : ''}`, passed ? 'ok' : 'error');
    render();
    return passed;
  }

  async function measure(name, fn) {
    const started = performance.now();
    try {
      const result = await fn();
      const ms = performance.now() - started;
      state.actions.push({ at: Date.now(), name, ms, ok: true });
      render();
      return { result, ms };
    } catch (error) {
      const ms = performance.now() - started;
      state.actions.push({ at: Date.now(), name, ms, ok: false, error: String(error?.message || error) });
      addCheck(name, false, String(error?.message || error));
      throw error;
    }
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
    state.actions = [];
    state.checks = [];
    state.notes = [];
    setStatus('Metrics reset. Start Gate 1 torture.');
    render();
  }

  function markReady(candidate, version, rowCount) {
    state.candidate = candidate;
    state.version = version;
    state.rowCount = rowCount;
    state.readyAt = performance.now();
    state.notes.push({ at: Date.now(), type: 'ready', ms: state.readyAt - state.startedAt, rows: rowCount });
    setStatus(`${candidate} ${version} ready with ${rowCount.toLocaleString()} rows.`, 'ok');
    render();
  }

  function heapMb() {
    return performance.memory ? performance.memory.usedJSHeapSize / 1024 / 1024 : null;
  }

  function snapshot() {
    return {
      at: new Date().toISOString(),
      gate: 'ERP Grid Finalists Gate 1',
      candidate: state.candidate,
      version: state.version,
      rows: state.rowCount,
      readyMs: state.readyAt ? state.readyAt - state.startedAt : null,
      longTasks: state.longTasks,
      longTaskTotalMs: state.longTaskTotalMs,
      longTaskMaxMs: state.longTaskMaxMs,
      frameCount: state.frameCount,
      frameGapOver50: state.frameGapOver50,
      maxFrameGapMs: state.maxFrameGapMs,
      wheelEvents: state.wheelEvents,
      scrollEvents: state.scrollEvents,
      heapMb: heapMb(),
      domNodes: document.getElementsByTagName('*').length,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      userAgent: navigator.userAgent,
      actions: state.actions.slice(),
      checks: state.checks.slice(),
      notes: state.notes.slice(),
    };
  }

  function exportMetrics() {
    const data = snapshot();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `grid-finalist-${state.candidate.replace(/\s+/g,'-').toLowerCase()}-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function render() {
    metricsElm ||= document.getElementById('bench-metrics');
    checksElm ||= document.getElementById('check-results');
    if (metricsElm) {
      const heap = heapMb();
      const ready = state.readyAt ? `${(state.readyAt - state.startedAt).toFixed(1)} ms` : '—';
      const latest = state.actions.at(-1);
      metricsElm.innerHTML = `
        <div>Ready</div><strong>${ready}</strong>
        <div>Long tasks</div><strong>${state.longTasks}</strong>
        <div>Long task total</div><strong>${state.longTaskTotalMs.toFixed(0)} ms</strong>
        <div>Worst long task</div><strong>${state.longTaskMaxMs.toFixed(1)} ms</strong>
        <div>Frame gaps &gt;50ms</div><strong>${state.frameGapOver50}</strong>
        <div>Worst frame gap</div><strong>${state.maxFrameGapMs.toFixed(1)} ms</strong>
        <div>Wheel events</div><strong>${state.wheelEvents}</strong>
        <div>Scroll events</div><strong>${state.scrollEvents}</strong>
        <div>JS heap</div><strong>${heap == null ? 'n/a' : `${heap.toFixed(1)} MB`}</strong>
        <div>DOM nodes</div><strong>${document.getElementsByTagName('*').length}</strong>
        <div>Last action</div><strong>${latest ? `${latest.name}: ${latest.ms.toFixed(1)} ms` : '—'}</strong>`;
    }
    if (checksElm) {
      const recent = state.checks.slice(-10).reverse();
      checksElm.innerHTML = recent.length ? recent.map(c => `<div class="check ${c.passed ? 'pass' : 'fail'}"><b>${c.passed ? 'PASS' : 'FAIL'}</b> ${c.name}<span>${escapeHtml(c.detail)}</span></div>`).join('') : '<div class="small">No checks yet.</div>';
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function frameLoop(now) {
    const gap = now - state.lastFrameAt;
    state.lastFrameAt = now;
    state.frameCount += 1;
    if (gap > 50) {
      state.frameGapOver50 += 1;
      state.maxFrameGapMs = Math.max(state.maxFrameGapMs, gap);
    }
    requestAnimationFrame(frameLoop);
  }

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        state.longTasks += 1;
        state.longTaskTotalMs += entry.duration;
        state.longTaskMaxMs = Math.max(state.longTaskMaxMs, entry.duration);
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch {}

  document.addEventListener('wheel', () => { state.wheelEvents += 1; }, { capture: true, passive: true });
  document.addEventListener('scroll', () => { state.scrollEvents += 1; }, { capture: true, passive: true });
  requestAnimationFrame(frameLoop);
  setInterval(render, 500);

  function bindFinalistControls(adapter) {
    const rowsSelect = document.getElementById('row-count');
    let split = false;
    let rtl = false;

    document.getElementById('reload-grid')?.addEventListener('click', () => adapter.load(Number(rowsSelect.value)));
    document.getElementById('copy-payload')?.addEventListener('click', copyPayload);
    document.getElementById('toggle-split')?.addEventListener('click', async () => {
      split = !split;
      document.getElementById('grid-card')?.classList.toggle('is-split', split);
      window.dispatchEvent(new Event('resize'));
      state.notes.push({ at: Date.now(), type: 'split', enabled: split });
      await adapter.afterResize?.();
      setStatus(`Half width ${split ? 'ON' : 'OFF'}.`);
    });
    document.getElementById('toggle-rtl')?.addEventListener('click', async () => {
      rtl = !rtl;
      await adapter.setRtl?.(rtl);
      state.notes.push({ at: Date.now(), type: 'rtl', enabled: rtl });
      setStatus(`RTL ${rtl ? 'ON' : 'OFF'}.`);
    });
    document.getElementById('reset-metrics')?.addEventListener('click', resetMetrics);
    document.getElementById('export-metrics')?.addEventListener('click', exportMetrics);
    document.getElementById('run-auto-tests')?.addEventListener('click', async () => {
      const button = document.getElementById('run-auto-tests');
      try {
        if (button) { button.disabled = true; button.textContent = 'جاري الاختبار…'; }
        setStatus('جاري تشغيل الاختبارات الآلية…');
        await measure('runAutomatedTests', () => adapter.runAutomatedTests?.());
      } catch (error) {
        console.error(error);
      } finally {
        if (button) { button.disabled = false; button.textContent = 'تشغيل الاختبارات الآلية'; }
      }
    });

    const binds = {
      'anchor-selection': 'anchorSelection',
      'check-selection': 'checkSelection',
      'auto-scroll-kill': 'autoScrollKill',
      'prepare-paste': 'preparePaste',
      'verify-paste': 'verifyPaste',
      'undo-test': 'undoTest',
      'redo-test': 'redoTest',
      'custom-column-cycle': 'customColumnCycle',
      'delete-restore': 'deleteRestore',
      'sort-cycle': 'sortCycle',
      'readonly-test': 'readonlyTest',
    };
    for (const [id, method] of Object.entries(binds)) {
      document.getElementById(id)?.addEventListener('click', async () => {
        try {
          await measure(method, () => adapter[method]?.());
        } catch (error) {
          console.error(error);
        }
      });
    }
  }

  window.GridFinalist = {
    state,
    fields,
    generateRows,
    payloadMatrix,
    payloadText,
    copyPayload,
    setStatus,
    addCheck,
    measure,
    resetMetrics,
    markReady,
    snapshot,
    exportMetrics,
    bindFinalistControls,
  };
})();
