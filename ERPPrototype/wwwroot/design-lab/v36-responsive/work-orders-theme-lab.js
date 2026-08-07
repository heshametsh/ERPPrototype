(() => {
  "use strict";

  const STORAGE_KEY = "erp-work-orders-v36-basket-snap-mode";
  const MODE_PHYSICAL_WIDTH = Object.freeze({ compact: 230, summary: 305, full: 390 });
  const MODE_ORDER = ["compact", "summary", "full"];

  const root = document.documentElement;
  const body = document.body;
  const input = document.querySelector(".search-box input");
  const trigger = document.getElementById("openBasketDetails");
  const close = document.getElementById("closeBasketDetails");
  const panel = document.getElementById("basketDetailsPanel");
  const workspace = document.getElementById("sheetWorkspace");
  const tableShell = document.querySelector(".table-shell");
  const handle = document.getElementById("basketResizeHandle");

  let basketMode = readMode();
  let open = false;
  let dragStartX = 0;
  let dragStartPhysicalWidth = 0;
  let dragging = false;
  let resizeFrame = 0;
  let preservedScrollRatio = 0;

  function readMode() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return MODE_ORDER.includes(stored) ? stored : "summary";
    } catch {
      return "summary";
    }
  }

  function saveMode(mode) {
    try { localStorage.setItem(STORAGE_KEY, mode); } catch {}
  }

  function dpr() {
    const value = Number(window.devicePixelRatio || 1);
    return Number.isFinite(value) && value > 0 ? value : 1;
  }

  function physicalViewportWidth() {
    return Math.round(document.documentElement.clientWidth * dpr());
  }

  function physicalViewportHeight() {
    return Math.round(document.documentElement.clientHeight * dpr());
  }

  function setViewportClass() {
    const width = physicalViewportWidth();
    const height = physicalViewportHeight();
    body.classList.toggle("physical-wide", width > 1100);
    body.classList.toggle("physical-half", width <= 1100 && width > 760);
    body.classList.toggle("physical-narrow", width <= 760);
    body.classList.toggle("physical-short", height <= 760);
    body.dataset.physicalWidth = String(width);
    root.style.setProperty("--browser-dpr", String(dpr()));
  }

  function cssWidthForMode(mode) {
    return MODE_PHYSICAL_WIDTH[mode] / dpr();
  }

  function tableScrollRatio() {
    if (!tableShell) return 0;
    const range = Math.max(0, tableShell.scrollWidth - tableShell.clientWidth);
    return range ? Math.max(0, Math.min(1, tableShell.scrollLeft / range)) : 0;
  }

  function restoreTableScrollRatio(ratio) {
    if (!tableShell) return;
    requestAnimationFrame(() => {
      const range = Math.max(0, tableShell.scrollWidth - tableShell.clientWidth);
      tableShell.scrollLeft = range * Math.max(0, Math.min(1, ratio));
    });
  }

  function applyBasketMode(mode, { persist = true } = {}) {
    if (!MODE_ORDER.includes(mode) || !workspace || !panel) return;
    basketMode = mode;
    const widthCss = cssWidthForMode(mode);
    workspace.style.setProperty("--basket-panel-width", `${widthCss}px`);
    workspace.style.setProperty("--basket-mode-physical-width", `${MODE_PHYSICAL_WIDTH[mode]}px`);
    workspace.dataset.basketMode = mode;
    panel.dataset.basketMode = mode;
    panel.classList.toggle("basket-mode-compact", mode === "compact");
    panel.classList.toggle("basket-mode-summary", mode === "summary");
    panel.classList.toggle("basket-mode-full", mode === "full");
    panel.classList.toggle("is-summary-only", mode === "compact");
    panel.classList.toggle("is-compact", mode === "summary");
    if (persist) saveMode(mode);
    handle?.setAttribute("aria-valuetext", mode === "compact" ? "مضغوط" : mode === "summary" ? "ملخص" : "كامل");
    handle?.setAttribute("aria-valuenow", String(MODE_PHYSICAL_WIDTH[mode]));
  }

  function setOpen(nextOpen) {
    open = Boolean(nextOpen);
    panel?.classList.toggle("is-open", open);
    workspace?.classList.toggle("panel-open", open);
    panel?.setAttribute("aria-hidden", open ? "false" : "true");
    trigger?.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function nearestMode(physicalWidth) {
    return MODE_ORDER.reduce((best, mode) => {
      const distance = Math.abs(MODE_PHYSICAL_WIDTH[mode] - physicalWidth);
      return distance < best.distance ? { mode, distance } : best;
    }, { mode: basketMode, distance: Number.POSITIVE_INFINITY }).mode;
  }

  function beginDrag(event) {
    if (!open || !workspace || !panel || !handle) return;
    dragging = true;
    dragStartX = event.clientX;
    dragStartPhysicalWidth = panel.getBoundingClientRect().width * dpr();
    preservedScrollRatio = tableScrollRatio();
    workspace.classList.add("basket-resizing");
    handle.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function continueDrag(event) {
    if (!dragging || !workspace) return;
    // Panel is on the right: moving pointer left increases its width.
    const deltaPhysical = (dragStartX - event.clientX) * dpr();
    const physicalWidth = Math.max(210, Math.min(420, dragStartPhysicalWidth + deltaPhysical));
    workspace.style.setProperty("--basket-panel-width", `${physicalWidth / dpr()}px`);
    const previewMode = nearestMode(physicalWidth);
    panel?.setAttribute("data-preview-mode", previewMode);
    event.preventDefault();
  }

  function endDrag(event) {
    if (!dragging) return;
    dragging = false;
    workspace?.classList.remove("basket-resizing");
    try { handle?.releasePointerCapture?.(event.pointerId); } catch {}
    const physicalWidth = (panel?.getBoundingClientRect().width || cssWidthForMode(basketMode)) * dpr();
    applyBasketMode(nearestMode(physicalWidth));
    panel?.removeAttribute("data-preview-mode");
    restoreTableScrollRatio(preservedScrollRatio);
  }

  function changeModeByKeyboard(event) {
    if (!handle || !open) return;
    const index = MODE_ORDER.indexOf(basketMode);
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      applyBasketMode(MODE_ORDER[Math.min(MODE_ORDER.length - 1, index + 1)]);
      event.preventDefault();
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      applyBasketMode(MODE_ORDER[Math.max(0, index - 1)]);
      event.preventDefault();
    } else if (event.key === "Home") {
      applyBasketMode("compact");
      event.preventDefault();
    } else if (event.key === "End") {
      applyBasketMode("full");
      event.preventDefault();
    }
  }

  function updateLayout() {
    preservedScrollRatio = tableScrollRatio();
    setViewportClass();
    applyBasketMode(basketMode, { persist: false });
    document.scrollingElement && (document.scrollingElement.scrollLeft = 0);
    restoreTableScrollRatio(preservedScrollRatio);
  }

  function scheduleLayoutUpdate() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(updateLayout);
  }

  input?.addEventListener("keydown", event => {
    if (event.key === "Enter") event.preventDefault();
  });
  trigger?.addEventListener("click", () => setOpen(!open));
  close?.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") setOpen(false);
  });
  handle?.addEventListener("pointerdown", beginDrag);
  handle?.addEventListener("pointermove", continueDrag);
  handle?.addEventListener("pointerup", endDrag);
  handle?.addEventListener("pointercancel", endDrag);
  handle?.addEventListener("keydown", changeModeByKeyboard);

  window.addEventListener("resize", scheduleLayoutUpdate, { passive: true });
  window.visualViewport?.addEventListener("resize", scheduleLayoutUpdate, { passive: true });
  if (window.ResizeObserver && workspace) {
    new ResizeObserver(scheduleLayoutUpdate).observe(workspace);
  }

  setViewportClass();
  applyBasketMode(basketMode, { persist: false });
  setOpen(false);
  requestAnimationFrame(() => {
    if (tableShell) tableShell.scrollLeft = 0;
    document.scrollingElement && (document.scrollingElement.scrollLeft = 0);
  });
})();
