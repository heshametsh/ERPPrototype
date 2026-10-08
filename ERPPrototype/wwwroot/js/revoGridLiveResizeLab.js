const bindings = new Map();

function nextFrame() {
    return new Promise(resolve => requestAnimationFrame(resolve));
}

async function waitForGrid(elementId, timeoutMs = 20000) {
    const started = performance.now();

    while (performance.now() - started < timeoutMs) {
        const host = document.getElementById(elementId);
        const grid = host?.querySelector("revo-grid");

        if (grid && typeof grid.getProviders === "function") {
            try {
                const providers = await grid.getProviders();
                if (providers?.dimension?.setCustomSizes) {
                    return { host, grid, providers };
                }
            } catch {
            }
        }

        await nextFrame();
    }

    throw new Error(
        `Live resize lab could not find RevoGrid '${elementId}'.`);
}

function centralViewport(grid) {
    return grid.querySelector(
        "revogr-viewport-scroll.rgCol:not([row-header])");
}

function centralContent(grid) {
    return centralViewport(grid)
        ?.querySelector(".inner-content-table");
}

function isResizeHandle(target) {
    return target instanceof HTMLElement &&
        target.classList.contains("resizable-l");
}

function columnIndexFromHandle(handle) {
    const owner = handle.closest("[data-rgCol]");
    const index = Number(owner?.getAttribute("data-rgCol"));

    return {
        owner,
        index: Number.isInteger(index) ? index : -1
    };
}

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

function createGridBinding(grid, providers) {
    const removers = [];
    const state = {
        active: false,
        columnIndex: -1,
        startX: 0,
        startWidth: 0,
        startRealSize: 0,
        lastContentWidth: 0,
        desiredScroll: 0,
        minWidth: 45,
        maxWidth: 1000,
        keepRight: false,
        activeHeader: null,
        updateCount: 0,
        totalUpdateMs: 0,
        maxUpdateMs: 0,
        downEvents: 0,
        moveEvents: 0,
        startScrollLeft: 0,
        startMaxScroll: 0
    };

    const listen = (target, name, handler, options) => {
        target.addEventListener(name, handler, options);
        removers.push(() =>
            target.removeEventListener(name, handler, options));
    };

    const realColumnWidth = () =>
        Number(
            providers.dimension.stores?.rgCol
                ?.store?.get?.("realSize") ?? 0
        ) || 0;

    const syncPhysicalWidthAndAnchor = (
        contentWidth,
        forceRight = false
    ) => {
        const viewport = centralViewport(grid);
        const content = centralContent(grid);

        if (!(viewport instanceof HTMLElement) ||
            !(content instanceof HTMLElement)) {
            return;
        }

        const physicalWidth = Math.max(0, Number(contentWidth) || 0);

        if (physicalWidth > 0) {
            content.style.width = `${physicalWidth}px`;

            // Make the new physical width observable before scrollLeft is
            // clamped, otherwise the browser uses the previous max scroll.
            void content.offsetWidth;
        }

        const desiredScroll = Math.max(
            0,
            physicalWidth - viewport.clientWidth);

        state.lastContentWidth = physicalWidth;
        state.desiredScroll = desiredScroll;

        if (forceRight) {
            const viewportStore =
                providers.viewport?.stores?.rgCol;

            if (viewportStore) {
                viewportStore.lastCoordinate = desiredScroll;
            }

            content.style.transform = "";

            if (typeof viewport.setScroll === "function") {
                void viewport.setScroll({
                    dimension: "rgCol",
                    coordinate: desiredScroll
                });
            }

            viewport.scrollLeft = desiredScroll;
            return;
        }

        if (state.active && state.keepRight) {
            const compensation =
                desiredScroll - viewport.scrollLeft;

            content.style.transform = Math.abs(compensation) > 0.25
                ? `translateX(${-compensation}px)`
                : "";
        }
    };

    const applyWidth = width => {
        if (!state.active || state.columnIndex < 0) {
            return;
        }

        const started = performance.now();
        const contentWidth =
            state.startRealSize + (width - state.startWidth);
        const viewport = centralViewport(grid);
        const desiredScroll =
            viewport instanceof HTMLElement && state.keepRight
                ? Math.max(0, contentWidth - viewport.clientWidth)
                : null;

        if (desiredScroll !== null) {
            const viewportStore =
                providers.viewport?.stores?.rgCol;

            if (viewportStore) {
                viewportStore.lastCoordinate = desiredScroll;
            }
        }

        providers.dimension.setCustomSizes(
            "rgCol",
            {
                [state.columnIndex]: Math.round(width)
            },
            true);

        syncPhysicalWidthAndAnchor(contentWidth);

        const elapsed = performance.now() - started;
        state.updateCount += 1;
        state.totalUpdateMs += elapsed;
        state.maxUpdateMs = Math.max(state.maxUpdateMs, elapsed);
    };

    const finishDrag = () => {
        if (!state.active) {
            return;
        }

        const finalWidth =
            state.lastContentWidth ||
            (
                state.startRealSize +
                ((state.activeHeader?.clientWidth ?? state.startWidth) -
                    state.startWidth)
            );

        syncPhysicalWidthAndAnchor(finalWidth, true);

        state.activeHeader?.classList.remove("active");
        state.activeHeader = null;
        state.active = false;
        state.columnIndex = -1;
        grid.dataset.liveResizeActive = "false";
        document.body.style.cursor = "";
    };

    const onMouseDown = event => {
        if (!isResizeHandle(event.target)) {
            return;
        }

        const { owner, index } =
            columnIndexFromHandle(event.target);

        if (!(owner instanceof HTMLElement) || index < 0) {
            return;
        }

        const viewport = centralViewport(grid);
        if (!(viewport instanceof HTMLElement)) {
            return;
        }

        // This lab owns the drag. Do not let Revo's native ResizeDirective
        // move the blue handle independently from the live column width.
        event.preventDefault();
        event.stopImmediatePropagation();

        const raw =
            providers.column?.getRawColumns?.()?.rgCol ?? [];
        const column = raw[index] ?? {};

        const maxScroll = Math.max(
            0,
            viewport.scrollWidth - viewport.clientWidth);

        state.downEvents += 1;
        state.active = true;
        state.columnIndex = index;
        state.startX = event.clientX;
        state.startWidth = owner.clientWidth;
        state.startRealSize = realColumnWidth();
        state.lastContentWidth = state.startRealSize;
        state.desiredScroll = maxScroll;
        state.minWidth = Number(column.minSize ?? 45) || 45;
        state.maxWidth = Number(column.maxSize ?? 1000) || 1000;
        state.startScrollLeft = viewport.scrollLeft;
        state.startMaxScroll = maxScroll;
        state.keepRight =
            maxScroll <= 2 ||
            Math.abs(viewport.scrollLeft - maxScroll) <= 2;
        state.activeHeader = owner;

        owner.classList.add("active");
        grid.dataset.liveResizeActive = "true";
        document.body.style.cursor = "w-resize";
    };

    const onMouseMove = event => {
        if (!state.active) {
            return;
        }

        event.preventDefault();
        state.moveEvents += 1;

        const delta = event.clientX - state.startX;
        const width = clamp(
            state.startWidth - delta,
            state.minWidth,
            state.maxWidth);

        // Intentionally direct, matching Tabulator's lifecycle:
        // pointer move -> real width now. No extra resize guide phase.
        applyWidth(width);
    };

    const onMouseUp = event => {
        if (!state.active) {
            return;
        }

        event.preventDefault();
        finishDrag();
    };

    listen(grid, "mousedown", onMouseDown, true);
    listen(document, "mousemove", onMouseMove, true);
    listen(document, "mouseup", onMouseUp, true);
    listen(window, "blur", finishDrag, true);

    grid.dataset.liveResizeLab = "ready";
    grid.dataset.liveResizeActive = "false";

    requestAnimationFrame(() =>
        requestAnimationFrame(() =>
            syncPhysicalWidthAndAnchor(realColumnWidth(), true)));

    return {
        grid,
        state,

        destroy() {
            finishDrag();

            for (const remove of removers.splice(0)) {
                try {
                    remove();
                } catch {
                }
            }

            delete grid.dataset.liveResizeLab;
            delete grid.dataset.liveResizeActive;
        },

        getDiagnostics() {
            return {
                active: state.active,
                columnIndex: state.columnIndex,
                updateCount: state.updateCount,
                averageUpdateMs: state.updateCount
                    ? state.totalUpdateMs / state.updateCount
                    : 0,
                maxUpdateMs: state.maxUpdateMs,
                downEvents: state.downEvents,
                moveEvents: state.moveEvents,
                keepRight: state.keepRight,
                startScrollLeft: state.startScrollLeft,
                startMaxScroll: state.startMaxScroll
            };
        }
    };
}

async function bindCurrentGrid(elementId, binding) {
    const { host, grid, providers } =
        await waitForGrid(elementId);

    if (binding.current?.grid === grid) {
        return binding.current;
    }

    binding.current?.destroy();
    binding.current = createGridBinding(grid, providers);

    if (!binding.observer) {
        binding.observer = new MutationObserver(() => {
            const nextGrid = host.querySelector("revo-grid");

            if (nextGrid && nextGrid !== binding.current?.grid) {
                bindCurrentGrid(elementId, binding).catch(
                    error => console.error(error));
            }
        });

        binding.observer.observe(host, {
            childList: true,
            subtree: true
        });
    }

    return binding.current;
}

export async function attach(elementId) {
    await destroy(elementId);

    const binding = {
        current: null,
        observer: null
    };

    bindings.set(elementId, binding);
    await bindCurrentGrid(elementId, binding);

    return true;
}

export function getDiagnostics(elementId) {
    return bindings.get(elementId)?.current
        ?.getDiagnostics?.() ?? null;
}

export async function destroy(elementId) {
    const binding = bindings.get(elementId);

    if (!binding) {
        return;
    }

    binding.observer?.disconnect();
    binding.current?.destroy();
    bindings.delete(elementId);
}
