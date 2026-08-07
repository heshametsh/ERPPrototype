(() => {
  "use strict";

  const STORAGE_KEY = "erp-work-orders-v45-basket-ratio-clean-v2";
  const DEFAULT_RATIO = 0.20;
  const MIN_RATIO = 0.04;
  const MAX_RATIO = 0.42;
  const MIN_PANEL_PX = 165;
  const MAX_PANEL_PX = 540;

  const input = document.querySelector(".search-box input");
  const trigger = document.getElementById("openBasketDetails");
  const close = document.getElementById("closeBasketDetails");
  const panel = document.getElementById("basketDetailsPanel");
  const workspace = document.getElementById("sheetWorkspace");
  const handle = document.getElementById("basketResizeHandle");
  const tableShell = document.querySelector(".table-shell");

  let panelRatio = readRatio();
  let panelOpen = false;
  let dragging = false;
  let dragStartX = 0;
  let dragStartWidth = 0;
  let resizeFrame = 0;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  function readRatio() {
    try {
      const value = Number(localStorage.getItem(STORAGE_KEY));
      return Number.isFinite(value) && value >= MIN_RATIO && value <= MAX_RATIO ? value : DEFAULT_RATIO;
    } catch {
      return DEFAULT_RATIO;
    }
  }

  function saveRatio() {
    try { localStorage.setItem(STORAGE_KEY, panelRatio.toFixed(4)); } catch {}
  }

  function bounds() {
    const available = Math.max(0, workspace?.clientWidth || window.innerWidth || 0);
    const min = Math.min(MIN_PANEL_PX, available);
    const max = Math.max(min, Math.min(MAX_PANEL_PX, available * MAX_RATIO));
    return { available, min, max };
  }

  function applyRatio(persist = false) {
    if (!workspace) return;
    const { available, min, max } = bounds();
    if (!available) return;

    const width = clamp(available * panelRatio, min, max);
    workspace.style.setProperty("--basket-panel-width", `${Math.round(width)}px`);
    handle?.setAttribute("aria-valuemin", String(Math.round(min)));
    handle?.setAttribute("aria-valuemax", String(Math.round(max)));
    handle?.setAttribute("aria-valuenow", String(Math.round(width)));
    if (persist) saveRatio();
  }

  function applyWidthFromDrag(width) {
    if (!workspace) return;
    const { available, min, max } = bounds();
    if (!available) return;

    const clamped = clamp(width, min, max);
    panelRatio = clamp(clamped / available, MIN_RATIO, MAX_RATIO);
    workspace.style.setProperty("--basket-panel-width", `${Math.round(clamped)}px`);
    handle?.setAttribute("aria-valuenow", String(Math.round(clamped)));
  }

  function setOpen(value) {
    panelOpen = Boolean(value);
    workspace?.classList.toggle("panel-open", panelOpen);
    panel?.classList.toggle("is-open", panelOpen);
    panel?.setAttribute("aria-hidden", panelOpen ? "false" : "true");
    trigger?.setAttribute("aria-expanded", panelOpen ? "true" : "false");
    if (panelOpen) requestAnimationFrame(() => applyRatio(false));
  }

  function beginDrag(event) {
    if (!panelOpen || !panel || !handle) return;
    dragging = true;
    dragStartX = event.clientX;
    dragStartWidth = panel.getBoundingClientRect().width;
    document.body.classList.add("is-panel-resizing-side");
    handle.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function moveDrag(event) {
    if (!dragging) return;
    applyWidthFromDrag(dragStartWidth + (dragStartX - event.clientX));
    event.preventDefault();
  }

  function endDrag(event) {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove("is-panel-resizing-side");
    try { handle?.releasePointerCapture?.(event.pointerId); } catch {}
    saveRatio();
  }

  function keyboardResize(event) {
    if (!panelOpen || !panel) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? 20 : -20;
    applyWidthFromDrag(panel.getBoundingClientRect().width + delta);
    saveRatio();
  }

  function scheduleResize() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => applyRatio(false));
  }

  function moveTableToStart() {
    if (!tableShell) return;
    tableShell.scrollLeft = 0;
  }

  input?.addEventListener("keydown", event => {
    if (event.key === "Enter") event.preventDefault();
  });
  trigger?.addEventListener("click", () => setOpen(!panelOpen));
  close?.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") setOpen(false);
  });
  handle?.addEventListener("pointerdown", beginDrag);
  handle?.addEventListener("pointermove", moveDrag);
  handle?.addEventListener("pointerup", endDrag);
  handle?.addEventListener("pointercancel", endDrag);
  handle?.addEventListener("keydown", keyboardResize);
  window.addEventListener("resize", scheduleResize, { passive:true });

  if (typeof ResizeObserver !== "undefined" && workspace) {
    const observer = new ResizeObserver(scheduleResize);
    observer.observe(workspace);
  }

  applyRatio(false);
  setOpen(false);
  requestAnimationFrame(moveTableToStart);
  window.addEventListener("pageshow", () => requestAnimationFrame(moveTableToStart), { once:true });
})();
