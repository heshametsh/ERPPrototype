(() => {
  "use strict";

  const SPLIT_ENTER_RATIO = 0.76;
  const WIDE_ENTER_RATIO = 0.86;
  const DEFAULT_MODE = "wide";

  // Basket sizing is intentionally independent from Wide/Split and from browser zoom.
  // 184 visual px matches the approved basket width at the 80% reference view.
  const BASKET_REFERENCE_ZOOM = 0.80;
  const BASKET_DEFAULT_VISUAL_PX = 184;
  const BASKET_MIN_VISUAL_PX = 184;
  const BASKET_MAX_VISUAL_PX = 540;
  const BASKET_MAX_VIEWPORT_RATIO = 0.60;
  const BASKET_STORAGE_KEY = "erp-work-orders-v46-basket-visual-width-v1";


  const root = document.documentElement;
  const input = document.querySelector(".search-box input");
  const trigger = document.getElementById("openBasketDetails");
  const close = document.getElementById("closeBasketDetails");
  const panel = document.getElementById("basketDetailsPanel");
  const workspace = document.getElementById("sheetWorkspace");
  const handle = document.getElementById("basketResizeHandle");
  const tableShell = document.querySelector(".table-shell");
  const commandsButton = document.getElementById("commandsMenuButton");
  const commandsMenu = document.getElementById("commandsMenu");
  const validationBar = document.getElementById("validationBar");
  const validationTitle = document.getElementById("validationTitle");
  const validationMessage = document.getElementById("validationMessage");
  const validationPrev = document.getElementById("validationPrev");
  const validationNext = document.getElementById("validationNext");
  const saveButton = document.getElementById("saveButton");
  const saveBadge = document.getElementById("saveBadge");
  const systemMessage = document.querySelector(".system-message");
  const systemMessageText = systemMessage?.querySelector("strong");
  const tableBody = document.querySelector(".table-shell tbody");
  const kpiValues = [...document.querySelectorAll(".kpi-card strong")];

  let layoutMode = DEFAULT_MODE;
  let panelOpen = false;
  let panelVisualWidth = readPanelVisualWidth();
  let dragging = false;
  let dragStartX = 0;
  let dragStartWidth = 0;
  let resizeFrame = 0;
  let dirtyCount = 1;
  let validationErrors = [];
  let validationIndex = 0;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);


  function pageZoomRatio() {
    const outer = Number(window.outerWidth || 0);
    const inner = Number(window.innerWidth || 0);
    if (!outer || !inner) return 1;
    return clamp(outer / inner, 0.50, 1.75);
  }

  // Keep the approved minimum basket appearance at the default width, then let
  // typography grow gently when the USER widens the panel. Browser zoom itself
  // still does not choose another basket layout or typography mode.
  function basketTypographyScale(visualWidth) {
    const widthGrowth = Math.max(0, (visualWidth / BASKET_DEFAULT_VISUAL_PX) - 1);
    return clamp(1 + (widthGrowth * 0.25), 1, 1.30);
  }

  function applyBasketVisualSize(visualWidth = BASKET_DEFAULT_VISUAL_PX) {
    const zoom = pageZoomRatio();
    const typeScale = basketTypographyScale(visualWidth);
    const px = valueAt100Css => `${(valueAt100Css * BASKET_REFERENCE_ZOOM / zoom).toFixed(2)}px`;
    const typePx = valueAt100Css => `${(valueAt100Css * typeScale * BASKET_REFERENCE_ZOOM / zoom).toFixed(2)}px`;

    // Structure/spacing keeps the approved minimum density. Only readable content
    // grows with manual panel width, so extra width does not become empty space.
    root.style.setProperty("--basket-header-min", px(54));
    root.style.setProperty("--basket-header-font", typePx(17));
    root.style.setProperty("--basket-row-min", px(62));
    root.style.setProperty("--basket-row-pad-y", px(7));
    root.style.setProperty("--basket-row-pad-bottom", px(13));
    root.style.setProperty("--basket-row-gap-y", px(5));
    root.style.setProperty("--basket-row-gap-x", px(8));
    root.style.setProperty("--basket-name-font", typePx(16.20));
    root.style.setProperty("--basket-count-font", typePx(12.16));
    root.style.setProperty("--basket-amount-font", typePx(13.92));
    root.style.setProperty("--basket-label-font", typePx(8.80));
    root.style.setProperty("--basket-percent-font", typePx(9.92));
    root.style.setProperty("--basket-dot-size", px(8));
    root.style.setProperty("--basket-progress-height", px(4));
    root.style.setProperty("--basket-header-pad-x", px(9));
    root.style.setProperty("--basket-list-pad-top", px(5));
    root.style.setProperty("--basket-list-pad-x", px(6));
    root.style.setProperty("--basket-list-pad-bottom", px(8));
    root.style.setProperty("--basket-row-pad-x", px(7));
    root.style.setProperty("--basket-progress-inset", px(6));
    root.style.setProperty("--basket-progress-bottom", px(5));
    root.style.setProperty("--basket-dot-offset", px(4));
    root.style.setProperty("--basket-meta-gap", px(4));
  }

  function readPanelVisualWidth() {
    try {
      const value = Number(localStorage.getItem(BASKET_STORAGE_KEY));
      return Number.isFinite(value) && value >= BASKET_MIN_VISUAL_PX && value <= BASKET_MAX_VISUAL_PX
        ? value
        : BASKET_DEFAULT_VISUAL_PX;
    } catch {
      return BASKET_DEFAULT_VISUAL_PX;
    }
  }

  function savePanelVisualWidth() {
    try { localStorage.setItem(BASKET_STORAGE_KEY, panelVisualWidth.toFixed(1)); } catch {}
  }


  function viewportRatio() {
    const screenWidth = Number(window.screen?.availWidth || window.screen?.width || 0);
    const outerWidth = Number(window.outerWidth || 0);
    if (!screenWidth || !outerWidth) return 1;
    return outerWidth / screenWidth;
  }

  function resolveMode() {
    const ratio = viewportRatio();
    if (layoutMode === "split") return ratio >= WIDE_ENTER_RATIO ? "wide" : "split";
    if (layoutMode === "wide") return ratio <= SPLIT_ENTER_RATIO ? "split" : "wide";
    return ratio <= 0.8 ? "split" : "wide";
  }


  function compactNumberText(text) {
    const numeric = Number(String(text).replace(/,/g, ""));
    if (!Number.isFinite(numeric)) return text;
    const abs = Math.abs(numeric);
    if (abs >= 1_000_000_000) return `${(numeric / 1_000_000_000).toFixed(2)}B`;
    if (abs >= 1_000_000) return `${(numeric / 1_000_000).toFixed(abs >= 100_000_000 ? 1 : 2)}M`;
    return text;
  }

  function updateKpis() {
    kpiValues.forEach((element, index) => {
      if (!element.dataset.fullValue) element.dataset.fullValue = element.textContent.trim();
      const full = element.dataset.fullValue;
      element.title = full;
      if (layoutMode === "split" && index > 0) element.textContent = compactNumberText(full);
      else element.textContent = full;
    });
  }

  function applyMode(force = false) {
    const next = resolveMode();
    if (!force && next === layoutMode) return;
    layoutMode = next;
    root.classList.toggle("layout-split", layoutMode === "split");
    root.classList.toggle("layout-wide", layoutMode === "wide");
    root.dataset.layoutMode = layoutMode;
    updateKpis();
    requestAnimationFrame(() => applyPanelWidth());
  }

  function panelBounds() {
    const availableCss = Math.max(0, workspace?.clientWidth || window.innerWidth || 0);
    const zoom = pageZoomRatio();
    const availableVisual = availableCss * zoom;

    const minVisual = Math.min(BASKET_MIN_VISUAL_PX, availableVisual);
    const maxVisual = Math.max(
      minVisual,
      Math.min(BASKET_MAX_VISUAL_PX, availableVisual * BASKET_MAX_VIEWPORT_RATIO)
    );

    return { availableCss, zoom, minVisual, maxVisual };
  }

  function applyPanelWidth() {
    if (!workspace) return;
    const { availableCss, zoom, minVisual, maxVisual } = panelBounds();
    if (!availableCss) return;

    // Do not overwrite the user's saved preference when the viewport is temporarily narrow.
    const effectiveVisual = clamp(panelVisualWidth, minVisual, maxVisual);
    applyBasketVisualSize(effectiveVisual);
    const cssWidth = effectiveVisual / Math.max(zoom, 0.50);
    workspace.style.setProperty("--basket-panel-width", `${Math.round(cssWidth)}px`);
    handle?.setAttribute("aria-valuemin", String(Math.round(minVisual)));
    handle?.setAttribute("aria-valuemax", String(Math.round(maxVisual)));
    handle?.setAttribute("aria-valuenow", String(Math.round(effectiveVisual)));
  }

  function applyWidthFromDrag(cssWidth) {
    if (!workspace) return;
    const { availableCss, zoom, minVisual, maxVisual } = panelBounds();
    if (!availableCss) return;

    const requestedVisual = cssWidth * zoom;
    panelVisualWidth = clamp(requestedVisual, minVisual, maxVisual);
    applyBasketVisualSize(panelVisualWidth);
    const clampedCss = panelVisualWidth / Math.max(zoom, 0.50);
    workspace.style.setProperty("--basket-panel-width", `${Math.round(clampedCss)}px`);
    handle?.setAttribute("aria-valuenow", String(Math.round(panelVisualWidth)));
  }


  function setOpen(value) {
    panelOpen = Boolean(value);
    workspace?.classList.toggle("panel-open", panelOpen);
    panel?.classList.toggle("is-open", panelOpen);
    panel?.setAttribute("aria-hidden", panelOpen ? "false" : "true");
    trigger?.setAttribute("aria-expanded", panelOpen ? "true" : "false");
    if (panelOpen) requestAnimationFrame(applyPanelWidth);
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
    savePanelVisualWidth();
  }

  function keyboardResize(event) {
    if (!panelOpen || !panel) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? 20 : -20;
    applyWidthFromDrag(panel.getBoundingClientRect().width + delta);
    savePanelVisualWidth();
  }

  function positionCommandsMenu() {
    if (!commandsButton || !commandsMenu || commandsMenu.hidden) return;
    const buttonRect = commandsButton.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    const margin = 8;
    const gap = 7;

    // Measure after the menu is visible, then clamp it fully inside the viewport.
    const menuRect = commandsMenu.getBoundingClientRect();
    const menuWidth = Math.min(menuRect.width || 270, Math.max(0, viewportWidth - margin * 2));
    const menuHeight = Math.min(menuRect.height || 0, Math.max(0, viewportHeight - margin * 2));

    let left = buttonRect.right - menuWidth;
    left = clamp(left, margin, Math.max(margin, viewportWidth - menuWidth - margin));

    let top = buttonRect.bottom + gap;
    if (top + menuHeight > viewportHeight - margin) {
      top = Math.max(margin, buttonRect.top - menuHeight - gap);
    }

    commandsMenu.style.left = `${Math.round(left)}px`;
    commandsMenu.style.top = `${Math.round(top)}px`;
  }

  function setCommandsOpen(value) {
    if (!commandsButton || !commandsMenu) return;
    const open = Boolean(value);
    commandsMenu.hidden = !open;
    commandsMenu.setAttribute("aria-hidden", open ? "false" : "true");
    commandsButton.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) requestAnimationFrame(() => {
      positionCommandsMenu();
      commandsMenu.querySelector(".command-item")?.focus();
    });
  }

  function updateSystemMessage(message) {
    if (!systemMessageText || !message) return;
    systemMessageText.textContent = message;
    systemMessage?.setAttribute("title", message);
  }

  function refreshSaveState() {
    if (!saveButton || !saveBadge) return;
    const blocked = validationErrors.length > 0;
    const clean = dirtyCount <= 0;
    const disabled = blocked || clean;

    saveButton.disabled = disabled;
    saveButton.setAttribute("aria-disabled", disabled ? "true" : "false");
    saveButton.classList.toggle("is-clean", clean && !blocked);
    saveButton.classList.toggle("is-blocked", blocked);
    saveBadge.hidden = clean;
    saveBadge.textContent = String(Math.max(0, dirtyCount));
    saveBadge.title = dirtyCount === 1 ? "تغيير غير محفوظ واحد" : `${dirtyCount} تغييرات غير محفوظة`;
    saveButton.title = blocked
      ? "يوجد خطأ يمنع الحفظ"
      : clean
        ? "لا توجد تغييرات غير محفوظة"
        : `${dirtyCount} تغييرات غير محفوظة`;
  }

  function highlightValidationRow(rowNumber) {
    if (!tableBody) return;
    const row = tableBody.rows[Math.max(0, rowNumber - 1)];
    if (!row) return;
    tableBody.querySelectorAll(".validation-row-highlight").forEach(item => item.classList.remove("validation-row-highlight"));
    row.classList.add("validation-row-highlight");
    row.scrollIntoView({ block:"nearest", inline:"nearest" });
    window.setTimeout(() => row.classList.remove("validation-row-highlight"), 1800);
  }

  function renderValidation() {
    if (!validationBar) return;
    const hasErrors = validationErrors.length > 0;
    validationBar.hidden = !hasErrors;
    if (!hasErrors) {
      refreshSaveState();
      return;
    }

    validationIndex = clamp(validationIndex, 0, validationErrors.length - 1);
    const current = validationErrors[validationIndex];
    if (validationTitle) validationTitle.textContent = `خطأ ${validationIndex + 1} من ${validationErrors.length} يمنع الحفظ`;
    if (validationMessage) validationMessage.textContent = current.message;
    const hasMultipleErrors = validationErrors.length > 1;
    if (validationPrev) validationPrev.disabled = !hasMultipleErrors;
    if (validationNext) validationNext.disabled = !hasMultipleErrors;
    const validationActions = validationBar.querySelector(".validation-actions");
    if (validationActions) {
      validationActions.hidden = !hasMultipleErrors;
      validationActions.setAttribute("aria-hidden", hasMultipleErrors ? "false" : "true");
    }
    refreshSaveState();
  }

  function configureValidationDemo() {
    const params = new URLSearchParams(location.search);
    const requested = Math.max(0, Number.parseInt(params.get("error") || "0", 10) || 0);
    const demoErrors = [
      { row:4, message:"الصف 4 — تاريخ الإسناد غير صحيح بالكامل." },
      { row:12, message:"الصف 12 — Work Order Value مطلوب قبل الحفظ." },
      { row:21, message:"الصف 21 — رقم أمر العمل ونوعه مكرران." }
    ];
    validationErrors = demoErrors.slice(0, Math.min(requested, demoErrors.length));
    validationIndex = 0;
    renderValidation();
  }

  function configureDirtyDemo() {
    const params = new URLSearchParams(location.search);
    const requested = Number.parseInt(params.get("dirty") || "1", 10);
    dirtyCount = Number.isFinite(requested) ? Math.max(0, requested) : 1;
    refreshSaveState();
  }

  function dispatchCommand(command) {
    const shortcutMap = {
      undo:{ key:"z", ctrlKey:true },
      redo:{ key:"y", ctrlKey:true },
      copy:{ key:"c", ctrlKey:true },
      paste:{ key:"v", ctrlKey:true }
    };

    document.dispatchEvent(new CustomEvent("workorders:command", {
      bubbles:true,
      detail:{ command, source:"commands-menu" }
    }));

    const shortcut = shortcutMap[command];
    if (shortcut) {
      document.dispatchEvent(new KeyboardEvent("keydown", {
        key:shortcut.key,
        ctrlKey:shortcut.ctrlKey,
        bubbles:true,
        cancelable:true
      }));
    }

    const labels = {
      undo:"Undo", redo:"Redo", copy:"Copy", paste:"Paste",
      insert:"Insert Rows", delete:"Delete Rows"
    };
    updateSystemMessage(`تم إرسال أمر ${labels[command] || command} إلى مسار أوامر الشيت.`);
  }

  function scheduleResize() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      applyMode(false);
      applyPanelWidth();
      positionCommandsMenu();
    });
  }

  function moveTableToStart() {
    if (tableShell) tableShell.scrollLeft = 0;
  }

  input?.addEventListener("keydown", event => {
    if (event.key === "Enter") event.preventDefault();
  });
  trigger?.addEventListener("click", () => setOpen(!panelOpen));
  close?.addEventListener("click", () => setOpen(false));
  commandsButton?.addEventListener("click", event => {
    event.stopPropagation();
    setCommandsOpen(commandsMenu?.hidden ?? true);
  });
  commandsMenu?.addEventListener("click", event => {
    const item = event.target.closest(".command-item");
    if (!item) return;
    dispatchCommand(item.dataset.command || "");
    setCommandsOpen(false);
    commandsButton?.focus();
  });
  commandsMenu?.addEventListener("keydown", event => {
    const items = [...commandsMenu.querySelectorAll(".command-item")];
    const current = items.indexOf(document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const next = current < 0 ? 0 : (current + delta + items.length) % items.length;
      items[next]?.focus();
    }
  });
  saveButton?.addEventListener("click", () => {
    if (saveButton.disabled) return;
    dirtyCount = 0;
    refreshSaveState();
    updateSystemMessage("تم حفظ التغييرات في تجربة التصميم. لا توجد تغييرات غير محفوظة.");
  });
  validationPrev?.addEventListener("click", () => {
    if (!validationErrors.length) return;
    validationIndex = (validationIndex - 1 + validationErrors.length) % validationErrors.length;
    renderValidation();
    highlightValidationRow(validationErrors[validationIndex].row);
  });
  validationNext?.addEventListener("click", () => {
    if (!validationErrors.length) return;
    validationIndex = (validationIndex + 1) % validationErrors.length;
    renderValidation();
    highlightValidationRow(validationErrors[validationIndex].row);
  });
  document.addEventListener("click", event => {
    if (!event.target.closest(".commands-wrap")) setCommandsOpen(false);
  });
  document.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (saveButton && !saveButton.disabled) saveButton.click();
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      setCommandsOpen(false);
    }
  });
  handle?.addEventListener("pointerdown", beginDrag);
  handle?.addEventListener("pointermove", moveDrag);
  handle?.addEventListener("pointerup", endDrag);
  handle?.addEventListener("pointercancel", endDrag);
  handle?.addEventListener("keydown", keyboardResize);
  window.addEventListener("resize", scheduleResize, { passive:true });

  if (typeof ResizeObserver !== "undefined" && workspace) {
    const observer = new ResizeObserver(applyPanelWidth);
    observer.observe(workspace);
  }

  // Initial mode is derived from window geometry, not browser zoom-specific CSS widths.
  layoutMode = viewportRatio() <= 0.8 ? "split" : "wide";
  root.classList.add(layoutMode === "split" ? "layout-split" : "layout-wide");
  root.dataset.layoutMode = layoutMode;
  updateKpis();
  configureDirtyDemo();
  configureValidationDemo();
  applyPanelWidth();
  setOpen(false);
  setCommandsOpen(false);

  // Design-lab hooks only. The real Work Orders page can bind the same command event
  // to its existing command/save state without duplicating business logic.
  window.WorkOrdersV46Demo = {
    setDirtyCount(value) {
      dirtyCount = Math.max(0, Number(value) || 0);
      refreshSaveState();
    },
    clearValidation() {
      validationErrors = [];
      validationIndex = 0;
      renderValidation();
    }
  };

  requestAnimationFrame(moveTableToStart);
  window.addEventListener("pageshow", () => requestAnimationFrame(moveTableToStart), { once:true });
})();
