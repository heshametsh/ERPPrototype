(() => {
  "use strict";

  const STORAGE_KEY = "erp-work-orders-v44-basket-ratio";
  const DEFAULT_RATIO = 0.24;
  const MIN_RATIO = 0.09;
  const MAX_RATIO = 0.42;
  const MIN_PANEL_PX = 180;
  const MAX_PANEL_PX = 560;
  const MIN_TABLE_PX = 440;

  const trigger = document.getElementById("openBasketDetails");
  const close = document.getElementById("closeBasketDetails");
  const panel = document.getElementById("basketDetailsPanel");
  const workspace = document.getElementById("sheetWorkspace");
  const handle = document.getElementById("basketResizeHandle");
  const tableShell = document.querySelector(".table-shell");
  const searchInput = document.querySelector(".search-box input");

  let panelRatio = readRatio();
  let panelOpen = false;
  let dragging = false;
  let startX = 0;
  let startWidth = 0;
  let resizeFrame = 0;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  function readRatio() {
    try {
      const stored = Number(localStorage.getItem(STORAGE_KEY));
      return Number.isFinite(stored) && stored >= MIN_RATIO && stored <= MAX_RATIO ? stored : DEFAULT_RATIO;
    } catch { return DEFAULT_RATIO; }
  }

  function saveRatio() {
    try { localStorage.setItem(STORAGE_KEY, panelRatio.toFixed(4)); } catch {}
  }

  function getBounds() {
    const available = Math.max(0, workspace?.clientWidth || window.innerWidth || 0);
    const maxByTable = Math.max(MIN_PANEL_PX, available - MIN_TABLE_PX - 8);
    return {
      available,
      min: Math.min(MIN_PANEL_PX, maxByTable),
      max: Math.max(Math.min(MIN_PANEL_PX, maxByTable), Math.min(MAX_PANEL_PX, maxByTable))
    };
  }

  // Content mode follows the user's chosen share of the sheet, not CSS pixels.
  // This keeps the basket layout stable when browser zoom changes.
  function modeFromRatio(ratio) {
    if (ratio < 0.20) return "compact";
    if (ratio < 0.33) return "summary";
    return "full";
  }

  function applyMode() {
    if (!panel) return;
    const mode = modeFromRatio(panelRatio);
    panel.dataset.basketMode = mode;
    panel.classList.toggle("basket-mode-compact", mode === "compact");
    panel.classList.toggle("basket-mode-summary", mode === "summary");
    panel.classList.toggle("basket-mode-full", mode === "full");
  }

  function setPanelWidth(width, persist = false) {
    if (!workspace) return;
    const { available, min, max } = getBounds();
    if (!available) return;
    const clamped = clamp(width, min, max);
    workspace.style.setProperty("--basket-panel-width", `${Math.round(clamped)}px`);
    handle?.setAttribute("aria-valuemin", String(Math.round(min)));
    handle?.setAttribute("aria-valuemax", String(Math.round(max)));
    handle?.setAttribute("aria-valuenow", String(Math.round(clamped)));
    applyMode();
    if (persist) saveRatio();
  }

  function applyRatio() {
    const { available } = getBounds();
    if (!available) return;
    setPanelWidth(available * panelRatio, false);
  }

  function setWidthFromDrag(width) {
    const { available, min, max } = getBounds();
    if (!available) return;
    const clamped = clamp(width, min, max);
    panelRatio = clamp(clamped / available, MIN_RATIO, MAX_RATIO);
    setPanelWidth(clamped, false);
  }

  function setOpen(open) {
    panelOpen = Boolean(open);
    workspace?.classList.toggle("panel-open", panelOpen);
    panel?.classList.toggle("is-open", panelOpen);
    panel?.setAttribute("aria-hidden", panelOpen ? "false" : "true");
    trigger?.setAttribute("aria-expanded", panelOpen ? "true" : "false");
    if (panelOpen) requestAnimationFrame(applyRatio);
  }

  function beginDrag(event) {
    if (!panelOpen || !panel || !handle) return;
    dragging = true;
    startX = event.clientX;
    startWidth = panel.getBoundingClientRect().width;
    document.body.classList.add("is-panel-resizing-side");
    handle.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function moveDrag(event) {
    if (!dragging) return;
    setWidthFromDrag(startWidth + (startX - event.clientX));
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
    const delta = event.key === "ArrowLeft" ? 24 : -24;
    setWidthFromDrag(panel.getBoundingClientRect().width + delta);
    saveRatio();
  }

  function scheduleResize() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(applyRatio);
  }

  function resetTableScroll() {
    if (tableShell) tableShell.scrollLeft = 0;
  }

  searchInput?.addEventListener("keydown", event => {
    if (event.key === "Enter") event.preventDefault();
  });
  trigger?.addEventListener("click", () => setOpen(!panelOpen));
  close?.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", event => { if (event.key === "Escape") setOpen(false); });
  handle?.addEventListener("pointerdown", beginDrag);
  handle?.addEventListener("pointermove", moveDrag);
  handle?.addEventListener("pointerup", endDrag);
  handle?.addEventListener("pointercancel", endDrag);
  handle?.addEventListener("keydown", keyboardResize);
  window.addEventListener("resize", scheduleResize, { passive:true });

  if (typeof ResizeObserver !== "undefined" && workspace) {
    new ResizeObserver(scheduleResize).observe(workspace);
  }

  // Optional design-lab query helpers for static review only.
  const params = new URLSearchParams(location.search);
  const queryRatio = Number(params.get("ratio"));
  if (Number.isFinite(queryRatio) && queryRatio >= MIN_RATIO && queryRatio <= MAX_RATIO) panelRatio = queryRatio;

  applyMode();
  applyRatio();
  setOpen(params.get("panel") === "open");
  requestAnimationFrame(resetTableScroll);
  window.addEventListener("pageshow", () => requestAnimationFrame(resetTableScroll), { once:true });
})();
