/*
 * ERP Prototype — Work Orders runtime loader
 *
 * Loading boundary only: no authentication, scope, business-rule, or data
 * decisions live here. Global application layout remains outside this loader.
 */
(function () {
    "use strict";

    const loaderElement = document.currentScript;
    const WORK_ORDERS_PATH = "/work-orders";
    const PERFORMANCE_VALUES = new Set([
        "baseline",
        "base",
        "light",
        "deep",
        "diagnostic",
        "1",
        "lifecycle",
        "audit"
    ]);

    const loadedScripts = new Set();
    const pendingScripts = new Map();

    let corePromise = null;
    let coreReady = false;
    let performancePromise = null;

    function normalizePath(pathname) {
        const value = String(pathname || "/")
            .trim()
            .toLowerCase()
            .replace(/\/+$/, "");

        return value || "/";
    }

    function isWorkOrdersRoute() {
        return normalizePath(window.location.pathname) === WORK_ORDERS_PATH;
    }

    function readCoreScripts() {
        if (!loaderElement) {
            return [];
        }

        return Array.from(loaderElement.attributes)
            .filter(attribute =>
                attribute.name.startsWith("data-core-"))
            .sort((left, right) =>
                left.name.localeCompare(right.name))
            .map(attribute => attribute.value.trim())
            .filter(Boolean);
    }

    function readPerformanceScript() {
        return String(
            loaderElement?.getAttribute("data-performance") || ""
        ).trim();
    }

    function performanceRequested() {
        const value = String(
            new URLSearchParams(window.location.search)
                .get("perf") || ""
        )
            .trim()
            .toLowerCase();

        return PERFORMANCE_VALUES.has(value);
    }

    function absoluteUrl(source) {
        return new URL(source, document.baseURI).href;
    }

    function loadScript(source, role) {
        const url = absoluteUrl(source);

        if (loadedScripts.has(url)) {
            return Promise.resolve();
        }

        if (pendingScripts.has(url)) {
            return pendingScripts.get(url);
        }

        let resolveLoad;
        let rejectLoad;

        const promise = new Promise((resolve, reject) => {
            resolveLoad = resolve;
            rejectLoad = reject;
        });

        const script = document.createElement("script");
        script.src = url;
        script.async = false;
        script.dataset.workOrdersRuntime = role;

        script.addEventListener(
            "load",
            () => {
                loadedScripts.add(url);
                pendingScripts.delete(url);
                resolveLoad();
            },
            { once: true });

        script.addEventListener(
            "error",
            () => {
                pendingScripts.delete(url);
                script.remove();

                rejectLoad(
                    new Error(
                        `Failed to load Work Orders runtime script: ${url}`
                    )
                );
            },
            { once: true });

        pendingScripts.set(url, promise);
        document.body.appendChild(script);

        return promise;
    }

    async function loadCore() {
        const scripts = readCoreScripts();

        if (scripts.length === 0) {
            throw new Error(
                "Work Orders runtime loader has no configured core scripts."
            );
        }

        for (const source of scripts) {
            await loadScript(source, "core");
        }

        if (
            typeof window.Tabulator === "undefined" ||
            typeof window.tabulatorTest?.initialize !== "function"
        ) {
            throw new Error(
                "Work Orders runtime loaded without the required Tabulator API."
            );
        }
    }

    function ensureCoreLoaded() {
        if (coreReady) {
            return Promise.resolve();
        }

        if (!corePromise) {
            corePromise = loadCore()
                .then(() => {
                    coreReady = true;
                })
                .catch(error => {
                    corePromise = null;
                    throw error;
                });
        }

        return corePromise;
    }

    function ensurePerformanceLoaded() {
        if (!performanceRequested()) {
            return Promise.resolve();
        }

        if (typeof window.tabulatorPerformance !== "undefined") {
            return Promise.resolve();
        }

        const source = readPerformanceScript();

        if (!source) {
            return Promise.reject(
                new Error(
                    "Work Orders performance script is not configured."
                )
            );
        }

        if (!performancePromise) {
            performancePromise =
                loadScript(source, "performance")
                    .catch(error => {
                        performancePromise = null;
                        throw error;
                    });
        }

        return performancePromise;
    }

    const api = {
        ensureLoaded: async function () {
            await ensureCoreLoaded();
            await ensurePerformanceLoaded();

            return true;
        },

        isWorkOrdersRoute: isWorkOrdersRoute
    };

    window.workOrdersLoader = Object.freeze(api);

    /*
     * Direct entry (including the normal post-login redirect) starts fetching
     * immediately. Interactive navigation remains safe because the component
     * also awaits ensureLoaded() before its first grid interop call.
     */
    if (isWorkOrdersRoute()) {
        api.ensureLoaded().catch(error => {
            console.error(
                "Work Orders runtime preload failed.",
                error);
        });
    }
})();
