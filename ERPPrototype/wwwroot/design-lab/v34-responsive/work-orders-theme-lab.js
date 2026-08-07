(() => {
  "use strict";

  const input = document.querySelector(".search-box input");
  input?.addEventListener("keydown", event => {
    if (event.key === "Enter") event.preventDefault();
  });

  const trigger = document.getElementById("openBasketDetails");
  const close = document.getElementById("closeBasketDetails");
  const panel = document.getElementById("basketDetailsPanel");
  const workspace = document.getElementById("sheetWorkspace");
  const handle = document.getElementById("basketResizeHandle");
  const tableShell = document.querySelector(".table-shell");
  const storageKey = "erp-design-lab-basket-responsive-width-v34-fix6";
  let currentWidth = window.innerWidth <= 1100 ? 240 : 340;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  function widthBounds() {
    const available = workspace?.clientWidth || window.innerWidth;
    const min = 220;
    const max = Math.max(min, Math.min(540, available - 420));
    return { min, max };
  }

  function updatePanelMode() {
    panel?.classList.toggle("is-summary-only", currentWidth < 320);
    panel?.classList.toggle("is-compact", currentWidth >= 320 && currentWidth < 390);
  }

  function applyWidth(width, persist = true) {
    const { min, max } = widthBounds();
    currentWidth = Math.round(clamp(width, min, max));
    workspace?.style.setProperty("--basket-panel-width", `${currentWidth}px`);
    updatePanelMode();
    handle?.setAttribute("aria-valuemin", String(min));
    handle?.setAttribute("aria-valuemax", String(max));
    handle?.setAttribute("aria-valuenow", String(currentWidth));
    if (persist) {
      try { localStorage.setItem(storageKey, String(currentWidth)); } catch {}
    }
  }

  function setOpen(open) {
    panel?.classList.toggle("is-open", open);
    workspace?.classList.toggle("panel-open", open);
    panel?.setAttribute("aria-hidden", open ? "false" : "true");
    trigger?.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) requestAnimationFrame(() => applyWidth(currentWidth, false));
  }

  trigger?.addEventListener("click", () => setOpen(!panel?.classList.contains("is-open")));
  close?.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") setOpen(false);
  });

  handle?.addEventListener("keydown", event => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? 24 : -24;
    applyWidth(currentWidth + delta);
  });

  handle?.addEventListener("pointerdown", event => {
    if (!workspace?.classList.contains("panel-open")) return;
    event.preventDefault();
    handle.setPointerCapture?.(event.pointerId);
    const startX = event.clientX;
    const startWidth = currentWidth;
    document.body.classList.add("is-panel-resizing", "is-panel-resizing-side");

    const move = moveEvent => applyWidth(startWidth + (startX - moveEvent.clientX), false);
    const finish = () => {
      document.body.classList.remove("is-panel-resizing", "is-panel-resizing-side");
      try { localStorage.setItem(storageKey, String(currentWidth)); } catch {}
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", finish);
    };

    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  });

  let resizeFrame = 0;
  function handleResize() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => applyWidth(currentWidth, false));
  }
  window.addEventListener("resize", handleResize);
  if (window.ResizeObserver && workspace) {
    new ResizeObserver(handleResize).observe(workspace);
  }

  try {
    const stored = Number(localStorage.getItem(storageKey));
    if (Number.isFinite(stored) && stored > 0) currentWidth = stored;
  } catch {}
  applyWidth(currentWidth, false);

  // The grid must always open at # and Work Order Number.
  // Multiple frames are intentional because the iframe can become visible
  // after its first layout pass when switching from v34 fixed.
  function resetGridToFirstColumns() {
    if (!tableShell) return;
    tableShell.scrollLeft = 0;
    requestAnimationFrame(() => { tableShell.scrollLeft = 0; });
  }
  requestAnimationFrame(resetGridToFirstColumns);
  window.addEventListener("pageshow", resetGridToFirstColumns);
  window.addEventListener("focus", resetGridToFirstColumns);
})();
