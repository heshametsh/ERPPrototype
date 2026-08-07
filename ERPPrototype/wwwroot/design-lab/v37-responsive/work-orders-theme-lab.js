(() => {
  "use strict";

  const STORAGE_KEY = "erp-work-orders-v37-basket-mode";
  const MODES = Object.freeze({ compact: 220, summary: 300, full: 420 });
  const MODE_ORDER = ["compact", "summary", "full"];

  const body = document.body;
  const input = document.querySelector(".search-box input");
  const trigger = document.getElementById("openBasketDetails");
  const close = document.getElementById("closeBasketDetails");
  const panel = document.getElementById("basketDetailsPanel");
  const workspace = document.getElementById("sheetWorkspace");
  const handle = document.getElementById("basketResizeHandle");
  const tableShell = document.querySelector(".table-shell");

  let open = false;
  let mode = readMode();
  let dragging = false;
  let startX = 0;
  let startWidth = 0;
  let resizeFrame = 0;

  function readMode() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return MODE_ORDER.includes(value) ? value : "summary";
    } catch {
      return "summary";
    }
  }

  function saveMode(value) {
    try { localStorage.setItem(STORAGE_KEY, value); } catch {}
  }

  function windowLayout() {
    const outer = Number(window.outerWidth || document.documentElement.clientWidth || 0);
    const available = Number(window.screen?.availWidth || outer || 1);
    const ratio = available > 0 ? outer / available : 1;
    if (outer <= 760 || ratio <= 0.42) return "narrow";
    if (outer <= 1180 || ratio <= 0.74) return "split";
    return "full";
  }

  function applyLayout() {
    const layout = windowLayout();
    body.classList.toggle("layout-full", layout === "full");
    body.classList.toggle("layout-split", layout === "split");
    body.classList.toggle("layout-narrow", layout === "narrow");
    body.dataset.layout = layout;
    applyMode(mode, false);
  }

  function maxPanelWidth() {
    if (!workspace) return MODES.full;
    const layout = body.dataset.layout || "full";
    if (layout === "narrow") return Math.max(220, workspace.clientWidth - 20);
    return Math.max(220, workspace.clientWidth - 480);
  }

  function widthForMode(value) {
    return Math.min(MODES[value], maxPanelWidth());
  }

  function applyMode(value, persist = true) {
    if (!MODE_ORDER.includes(value) || !workspace || !panel) return;
    mode = value;
    workspace.style.setProperty("--basket-panel-width", `${Math.round(widthForMode(value))}px`);
    panel.classList.toggle("basket-mode-compact", value === "compact");
    panel.classList.toggle("basket-mode-summary", value === "summary");
    panel.classList.toggle("basket-mode-full", value === "full");
    panel.dataset.basketMode = value;
    if (persist) saveMode(value);
    handle?.setAttribute("aria-valuetext", value === "compact" ? "مضغوط" : value === "summary" ? "ملخص" : "كامل");
  }

  function setOpen(value) {
    open = Boolean(value);
    workspace?.classList.toggle("panel-open", open);
    panel?.classList.toggle("is-open", open);
    panel?.setAttribute("aria-hidden", open ? "false" : "true");
    trigger?.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) applyMode(mode, false);
  }

  function nearestMode(width) {
    return MODE_ORDER.reduce((best, candidate) => {
      const distance = Math.abs(MODES[candidate] - width);
      return distance < best.distance ? { value: candidate, distance } : best;
    }, { value: mode, distance: Number.POSITIVE_INFINITY }).value;
  }

  function beginDrag(event) {
    if (!open || !panel || !workspace || !handle || body.classList.contains("layout-narrow")) return;
    dragging = true;
    startX = event.clientX;
    startWidth = panel.getBoundingClientRect().width;
    workspace.classList.add("basket-resizing");
    handle.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function moveDrag(event) {
    if (!dragging || !workspace) return;
    const width = Math.max(MODES.compact, Math.min(maxPanelWidth(), startWidth + startX - event.clientX));
    workspace.style.setProperty("--basket-panel-width", `${Math.round(width)}px`);
    event.preventDefault();
  }

  function endDrag(event) {
    if (!dragging) return;
    dragging = false;
    workspace?.classList.remove("basket-resizing");
    try { handle?.releasePointerCapture?.(event.pointerId); } catch {}
    const width = panel?.getBoundingClientRect().width || MODES[mode];
    applyMode(nearestMode(width));
  }

  function keyboardResize(event) {
    if (!open) return;
    const index = MODE_ORDER.indexOf(mode);
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      applyMode(MODE_ORDER[Math.min(MODE_ORDER.length - 1, index + 1)]);
      event.preventDefault();
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      applyMode(MODE_ORDER[Math.max(0, index - 1)]);
      event.preventDefault();
    }
  }

  function scheduleLayout() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(applyLayout);
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
  handle?.addEventListener("pointermove", moveDrag);
  handle?.addEventListener("pointerup", endDrag);
  handle?.addEventListener("pointercancel", endDrag);
  handle?.addEventListener("keydown", keyboardResize);
  window.addEventListener("resize", scheduleLayout, { passive: true });

  applyLayout();
  applyMode(mode, false);
  setOpen(false);
  requestAnimationFrame(() => {
    if (tableShell) tableShell.scrollLeft = 0;
    if (document.scrollingElement) document.scrollingElement.scrollLeft = 0;
  });
})();
