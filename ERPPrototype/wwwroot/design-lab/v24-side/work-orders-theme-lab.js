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
  const storageKey = "erp-design-lab-basket-side-width-v24";
  const presets = { small: 380, medium: 460, large: 680 };
  let currentWidth = presets.medium;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  function widthBounds() {
    const available = workspace?.clientWidth || window.innerWidth;
    const max = Math.max(360, Math.min(720, available - 430));
    const min = Math.min(340, max);
    return { min, max };
  }

  function activePreset(width) {
    return Object.entries(presets).reduce((best, entry) => {
      const distance = Math.abs(entry[1] - width);
      return distance < best.distance ? { name: entry[0], distance } : best;
    }, { name: "medium", distance: Infinity }).name;
  }

  function applyWidth(width, persist = true) {
    const { min, max } = widthBounds();
    currentWidth = Math.round(clamp(width, min, max));
    workspace?.style.setProperty("--basket-panel-width", `${currentWidth}px`);
    panel?.classList.toggle("is-compact", currentWidth < 455);
    handle?.setAttribute("aria-valuemin", String(min));
    handle?.setAttribute("aria-valuemax", String(max));
    handle?.setAttribute("aria-valuenow", String(currentWidth));
    const selected = activePreset(currentWidth);
    presetButtons.forEach(button => button.classList.toggle("is-active", button.dataset.panelSize === selected));
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

  presetButtons.forEach(button => {
    button.addEventListener("click", () => {
      const value = presets[button.dataset.panelSize];
      if (value) applyWidth(value);
    });
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

  window.addEventListener("resize", () => applyWidth(currentWidth, false));

  try {
    const stored = Number(localStorage.getItem(storageKey));
    if (Number.isFinite(stored) && stored > 0) currentWidth = stored;
  } catch {}
  applyWidth(currentWidth, false);
})();
