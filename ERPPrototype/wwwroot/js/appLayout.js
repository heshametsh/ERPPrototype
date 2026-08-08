(function () {
    "use strict";

    const splitEnterRatio = 0.76;
    const wideEnterRatio = 0.86;
    const initialSplitRatio = 0.80;
    const targetSelectors = Object.freeze([
        ".app-shell",
        ".main-navbar",
        ".tabulator-workorders-page"
    ]);

    let layoutMode = null;
    let resizeFrame = null;

    function viewportToScreenRatio() {
        const screenWidth = Number(
            window.screen?.availWidth || window.screen?.width || 0
        );
        const outerWidth = Number(window.outerWidth || 0);

        if (!screenWidth || !outerWidth) {
            return 1;
        }

        return outerWidth / screenWidth;
    }

    function resolveLayoutMode() {
        const ratio = viewportToScreenRatio();

        if (layoutMode === "split") {
            return ratio >= wideEnterRatio ? "wide" : "split";
        }

        if (layoutMode === "wide") {
            return ratio <= splitEnterRatio ? "split" : "wide";
        }

        return ratio <= initialSplitRatio ? "split" : "wide";
    }

    function applyLayoutMode(nextMode) {
        document.documentElement.dataset.layoutMode = nextMode;

        for (const selector of targetSelectors) {
            const element = document.querySelector(selector);

            if (element) {
                element.dataset.layoutMode = nextMode;
            }
        }
    }

    function sync(force = false) {
        const previousMode = layoutMode;
        const nextMode = resolveLayoutMode();
        const changed = nextMode !== previousMode;

        layoutMode = nextMode;
        applyLayoutMode(nextMode);

        if (changed || force) {
            window.dispatchEvent(
                new CustomEvent("erp:layoutchange", {
                    detail: {
                        mode: nextMode,
                        previousMode,
                        ratio: viewportToScreenRatio()
                    }
                })
            );
        }

        return {
            mode: nextMode,
            changed
        };
    }

    function getMode() {
        if (!layoutMode) {
            sync(true);
        }

        return layoutMode;
    }

    function isSplit() {
        return getMode() === "split";
    }

    function scheduleSync() {
        if (resizeFrame !== null) {
            return;
        }

        resizeFrame = window.requestAnimationFrame(() => {
            resizeFrame = null;
            sync(false);
        });
    }

    window.erpAppLayout = Object.freeze({
        sync,
        getMode,
        isSplit,
        viewportToScreenRatio
    });

    window.addEventListener("resize", scheduleSync, { passive: true });
    window.addEventListener("pageshow", () => sync(true), { passive: true });

    // The script is loaded after the server-rendered layout markup, so the first
    // sync can establish the application mode without waiting for Tabulator.
    sync(true);
})();
