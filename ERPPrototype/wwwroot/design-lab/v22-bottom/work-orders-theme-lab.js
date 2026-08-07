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
  const presetButtons = [...document.querySelectorAll("[data-panel-size]")];
  const storageKey = "erp-design-lab-basket-bottom-height-v22";
  const presets = { small: 220, medium: 340, large: 480 };
  let currentHeight = presets.medium;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  function heightBounds() {
    const available = workspace?.clientHeight || window.innerHeight;
    const max = Math.max(230, Math.min(520, available - 28));
    const min = Math.min(210, max);
    return { min, max };
  }

  function activePreset(height) {
    return Object.entries(presets).reduce((best, entry) => {
      const distance = Math.abs(entry[1] - height);
      return distance < best.distance ? { name: entry[0], distance } : best;
    }, { name: "medium", distance: Infinity }).name;
  }

  function applyHeight(height, persist = true) {
    const { min, max } = heightBounds();
    currentHeight = Math.round(clamp(height, min, max));
    workspace?.style.setProperty("--basket-panel-height", `${currentHeight}px`);
    panel?.classList.toggle("is-compact", currentHeight < 275);
    handle?.setAttribute("aria-valuemin", String(min));
    handle?.setAttribute("aria-valuemax", String(max));
    handle?.setAttribute("aria-valuenow", String(currentHeight));
    const selected = activePreset(currentHeight);
    presetButtons.forEach(button => button.classList.toggle("is-active", button.dataset.panelSize === selected));
    if (persist) {
      try { localStorage.setItem(storageKey, String(currentHeight)); } catch {}
    }
  }

  function setOpen(open) {
    panel?.classList.toggle("is-open", open);
    panel?.setAttribute("aria-hidden", open ? "false" : "true");
    trigger?.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) requestAnimationFrame(() => applyHeight(currentHeight, false));
  }

  trigger?.addEventListener("click", () => setOpen(!panel?.classList.contains("is-open")));
  close?.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") setOpen(false);
  });

  presetButtons.forEach(button => {
    button.addEventListener("click", () => {
      const value = presets[button.dataset.panelSize];
      if (value) applyHeight(value);
    });
  });

  handle?.addEventListener("keydown", event => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const delta = event.key === "ArrowUp" ? 24 : -24;
    applyHeight(currentHeight + delta);
  });

  handle?.addEventListener("pointerdown", event => {
    if (!panel?.classList.contains("is-open")) return;
    event.preventDefault();
    handle.setPointerCapture?.(event.pointerId);
    const startY = event.clientY;
    const startHeight = currentHeight;
    document.body.classList.add("is-panel-resizing", "is-panel-resizing-bottom");

    const move = moveEvent => applyHeight(startHeight + (startY - moveEvent.clientY), false);
    const finish = () => {
      document.body.classList.remove("is-panel-resizing", "is-panel-resizing-bottom");
      try { localStorage.setItem(storageKey, String(currentHeight)); } catch {}
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", finish);
    };

    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  });

  window.addEventListener("resize", () => applyHeight(currentHeight, false));

  try {
    const stored = Number(localStorage.getItem(storageKey));
    if (Number.isFinite(stored) && stored > 0) currentHeight = stored;
  } catch {}
  applyHeight(currentHeight, false);
})();
