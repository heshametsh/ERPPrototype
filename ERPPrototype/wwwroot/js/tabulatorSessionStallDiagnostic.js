/*
 * ERP Prototype — Work Orders lightweight session-stall diagnostic
 * Version: UDS-SessionStall-v1
 *
 * Opt-in only: /work-orders?diag=stall
 * Purpose: correlate Blazor reconnects with browser main-thread stalls without
 * wrapping Tabulator internals or changing Work Orders runtime behavior.
 */
(function () {
    "use strict";

    const VERSION = "UDS-SessionStall-v1";
    const WATCHDOG_INTERVAL_MS = 250;
    const WATCHDOG_RECORD_THRESHOLD_MS = 100;
    const FRAME_SAMPLE_INTERVAL_MS = 1000;
    const MAX_STALLS = 600;
    const MAX_LONG_TASKS = 800;
    const MAX_FRAME_SAMPLES = 600;
    const MAX_EVENTS = 300;
    const MAX_MEMORY_SAMPLES = 240;

    const params = new URLSearchParams(window.location.search);
    const mode = String(params.get("diag") || "").trim().toLowerCase();

    if (mode !== "stall" && mode !== "reconnect") {
        return;
    }

    if (window.tabulatorSessionStallDiagnostic) {
        return;
    }

    const startedPerfMs = performance.now();
    const startedEpochMs = Date.now();
    const stalls = [];
    const longTasks = [];
    const frameSamples = [];
    const events = [];
    const memorySamples = [];
    const reconnectEvents = [];
    const observers = [];

    let stopped = false;
    let watchdogTimer = 0;
    let frameTimer = 0;
    let memoryTimer = 0;
    let lastWatchdogPerfMs = performance.now();
    let maxWatchdogStallMs = 0;
    let watchdogSamples = 0;

    function round(value, digits) {
        if (!Number.isFinite(value)) {
            return value ?? null;
        }

        const factor = 10 ** (digits ?? 1);
        return Math.round(value * factor) / factor;
    }

    function pushBounded(array, item, maximum) {
        array.push(item);

        if (array.length > maximum) {
            array.shift();
        }
    }

    function nowContext() {
        return {
            atEpochMs: Date.now(),
            atIso: new Date().toISOString(),
            atPerfMs: round(performance.now()),
            visibility: document.visibilityState,
            focused: document.hasFocus(),
            online: navigator.onLine
        };
    }

    function recordEvent(type, detail) {
        pushBounded(events, {
            ...nowContext(),
            type,
            detail: detail ?? null
        }, MAX_EVENTS);
    }

    function memorySnapshot(reason) {
        const memory = performance.memory;

        if (!memory) {
            return;
        }

        pushBounded(memorySamples, {
            ...nowContext(),
            reason,
            usedJsHeapMb: round(memory.usedJSHeapSize / 1024 / 1024, 2),
            totalJsHeapMb: round(memory.totalJSHeapSize / 1024 / 1024, 2),
            jsHeapLimitMb: round(memory.jsHeapSizeLimit / 1024 / 1024, 2)
        }, MAX_MEMORY_SAMPLES);
    }

    function watchdogTick() {
        if (stopped) {
            return;
        }

        const now = performance.now();
        const gapMs = now - lastWatchdogPerfMs;
        const stallMs = Math.max(0, gapMs - WATCHDOG_INTERVAL_MS);
        lastWatchdogPerfMs = now;
        watchdogSamples++;
        maxWatchdogStallMs = Math.max(maxWatchdogStallMs, stallMs);

        if (stallMs >= WATCHDOG_RECORD_THRESHOLD_MS) {
            pushBounded(stalls, {
                ...nowContext(),
                gapMs: round(gapMs),
                stallMs: round(stallMs)
            }, MAX_STALLS);

            updatePanel();
        }

        watchdogTimer = window.setTimeout(
            watchdogTick,
            WATCHDOG_INTERVAL_MS);
    }

    function sampleFrame() {
        if (stopped) {
            return;
        }

        const scheduledPerfMs = performance.now();

        requestAnimationFrame(framePerfMs => {
            if (stopped) {
                return;
            }

            const waitMs = Math.max(0, framePerfMs - scheduledPerfMs);

            if (waitMs >= 50) {
                pushBounded(frameSamples, {
                    ...nowContext(),
                    waitMs: round(waitMs)
                }, MAX_FRAME_SAMPLES);
            }
        });

        frameTimer = window.setTimeout(
            sampleFrame,
            FRAME_SAMPLE_INTERVAL_MS);
    }

    function observeLongTasks() {
        if (typeof PerformanceObserver === "undefined") {
            return;
        }

        const supported = PerformanceObserver.supportedEntryTypes || [];

        if (!supported.includes("longtask")) {
            return;
        }

        try {
            const observer = new PerformanceObserver(list => {
                for (const entry of list.getEntries()) {
                    pushBounded(longTasks, {
                        atEpochMs: round(performance.timeOrigin + entry.startTime),
                        atIso: new Date(
                            performance.timeOrigin + entry.startTime
                        ).toISOString(),
                        startPerfMs: round(entry.startTime),
                        durationMs: round(entry.duration),
                        name: entry.name || null
                    }, MAX_LONG_TASKS);
                }
            });

            observer.observe({ type: "longtask", buffered: true });
            observers.push(observer);
        } catch (error) {
            recordEvent("longtask-observer-error", String(error));
        }
    }

    function reconnectStateChanged(event) {
        const state = String(event?.detail?.state || "unknown");
        const reconnect = {
            ...nowContext(),
            state,
            recentMaxStallMs: round(maxRecentStall(45000)),
            recentLongTaskMaxMs: round(maxRecentLongTask(45000))
        };

        pushBounded(reconnectEvents, reconnect, 100);
        recordEvent("blazor-reconnect-state", reconnect);
        updatePanel();

        console.warn(
            `[${VERSION}] Blazor reconnect state: ${state}. ` +
            `Recent max main-thread stall: ${reconnect.recentMaxStallMs} ms.`);
    }

    function maxRecentStall(windowMs) {
        const cutoff = Date.now() - windowMs;
        let maximum = 0;

        for (let index = stalls.length - 1; index >= 0; index--) {
            const item = stalls[index];

            if (item.atEpochMs < cutoff) {
                break;
            }

            maximum = Math.max(maximum, item.stallMs || 0);
        }

        return maximum;
    }

    function maxRecentLongTask(windowMs) {
        const cutoff = Date.now() - windowMs;
        let maximum = 0;

        for (let index = longTasks.length - 1; index >= 0; index--) {
            const item = longTasks[index];

            if ((item.atEpochMs || 0) < cutoff) {
                break;
            }

            maximum = Math.max(maximum, item.durationMs || 0);
        }

        return maximum;
    }

    function countAtLeast(values, threshold, selector) {
        let count = 0;

        for (const item of values) {
            if ((selector(item) || 0) >= threshold) {
                count++;
            }
        }

        return count;
    }

    function summarize() {
        const elapsedMs = performance.now() - startedPerfMs;
        const longTaskTotalMs = longTasks.reduce(
            (sum, item) => sum + (item.durationMs || 0),
            0);
        const longTaskMaxMs = longTasks.reduce(
            (maximum, item) => Math.max(maximum, item.durationMs || 0),
            0);
        const maxFrameWaitMs = frameSamples.reduce(
            (maximum, item) => Math.max(maximum, item.waitMs || 0),
            0);

        return {
            elapsedMs: round(elapsedMs),
            watchdog: {
                samples: watchdogSamples,
                recordedStalls: stalls.length,
                maxStallMs: round(maxWatchdogStallMs),
                atLeast500ms: countAtLeast(stalls, 500, item => item.stallMs),
                atLeast1000ms: countAtLeast(stalls, 1000, item => item.stallMs),
                atLeast5000ms: countAtLeast(stalls, 5000, item => item.stallMs),
                atLeast10000ms: countAtLeast(stalls, 10000, item => item.stallMs),
                atLeast25000ms: countAtLeast(stalls, 25000, item => item.stallMs)
            },
            longTasks: {
                count: longTasks.length,
                totalMs: round(longTaskTotalMs),
                maxMs: round(longTaskMaxMs)
            },
            frameSampling: {
                delayedSamples: frameSamples.length,
                maxWaitMs: round(maxFrameWaitMs),
                note: "Frames are sampled once per second to keep observer overhead low."
            },
            reconnects: {
                events: reconnectEvents.length,
                states: reconnectEvents.map(item => item.state)
            }
        };
    }

    function environmentSnapshot() {
        const connection = navigator.connection ||
            navigator.mozConnection ||
            navigator.webkitConnection;

        return {
            userAgent: navigator.userAgent,
            language: navigator.language,
            logicalProcessors: navigator.hardwareConcurrency ?? null,
            approximateDeviceMemoryGb: navigator.deviceMemory ?? null,
            visibility: document.visibilityState,
            focused: document.hasFocus(),
            online: navigator.onLine,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight,
                devicePixelRatio: window.devicePixelRatio
            },
            connection: connection ? {
                effectiveType: connection.effectiveType ?? null,
                downlinkMbps: connection.downlink ?? null,
                rttMs: connection.rtt ?? null,
                saveData: connection.saveData ?? null
            } : null
        };
    }

    function exportData() {
        memorySnapshot("download");

        return {
            version: VERSION,
            mode: "stall",
            page: `${location.pathname}${location.search}`,
            startedAtIso: new Date(startedEpochMs).toISOString(),
            downloadedAtIso: new Date().toISOString(),
            measurementIntent: "Low-overhead correlation of Blazor reconnects with browser main-thread stalls. No Tabulator internal wrappers are installed.",
            environment: environmentSnapshot(),
            summary: summarize(),
            reconnectEvents: reconnectEvents.slice(),
            stalls: stalls.slice(),
            longTasks: longTasks.slice(),
            delayedFrameSamples: frameSamples.slice(),
            sessionEvents: events.slice(),
            memorySamples: memorySamples.slice()
        };
    }

    function download() {
        const data = exportData();
        const blob = new Blob(
            [JSON.stringify(data, null, 2)],
            { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const timestamp = new Date()
            .toISOString()
            .replace(/[:.]/g, "-");

        link.href = url;
        link.download = `UDS_SessionStall_${timestamp}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();

        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function stop() {
        if (stopped) {
            return exportData();
        }

        stopped = true;
        window.clearTimeout(watchdogTimer);
        window.clearTimeout(frameTimer);
        window.clearInterval(memoryTimer);

        for (const observer of observers) {
            try {
                observer.disconnect();
            } catch {
                // Diagnostic shutdown must never affect application behavior.
            }
        }

        recordEvent("diagnostic-stopped");
        updatePanel();
        return exportData();
    }

    let panelStatus = null;

    function updatePanel() {
        if (!panelStatus) {
            return;
        }

        const summary = summarize();
        panelStatus.textContent =
            `Max stall ${summary.watchdog.maxStallMs} ms · ` +
            `Reconnect ${summary.reconnects.events}`;
    }

    function createPanel() {
        const panel = document.createElement("div");
        panel.id = "uds-session-stall-panel";
        panel.style.cssText = [
            "position:fixed",
            "right:12px",
            "bottom:12px",
            "z-index:2147483647",
            "font:12px/1.35 system-ui,sans-serif",
            "background:#111",
            "color:#fff",
            "padding:8px 10px",
            "border-radius:6px",
            "box-shadow:0 2px 10px rgba(0,0,0,.25)",
            "max-width:300px"
        ].join(";");

        const title = document.createElement("div");
        title.textContent = "STALL DIAG — AUTO";
        title.style.fontWeight = "700";

        panelStatus = document.createElement("div");
        panelStatus.style.margin = "4px 0 6px";

        const downloadButton = document.createElement("button");
        downloadButton.type = "button";
        downloadButton.textContent = "Download";
        downloadButton.style.cssText =
            "font:inherit;padding:3px 8px;cursor:pointer;";
        downloadButton.addEventListener("click", download);

        panel.append(title, panelStatus, downloadButton);
        document.body.appendChild(panel);
        updatePanel();
    }

    const api = Object.freeze({
        version: VERSION,
        mode: "stall",
        download,
        exportData,
        stop,
        summary: summarize
    });

    window.tabulatorSessionStallDiagnostic = api;

    document.addEventListener("visibilitychange", () => {
        recordEvent("visibilitychange", document.visibilityState);
    });
    window.addEventListener("focus", () => recordEvent("window-focus"));
    window.addEventListener("blur", () => recordEvent("window-blur"));
    window.addEventListener("online", () => recordEvent("online"));
    window.addEventListener("offline", () => recordEvent("offline"));
    window.addEventListener("error", event => {
        recordEvent("window-error", {
            message: event.message || null,
            filename: event.filename || null,
            lineno: event.lineno || null,
            colno: event.colno || null
        });
    });
    window.addEventListener("unhandledrejection", event => {
        recordEvent(
            "unhandled-rejection",
            String(event.reason || "unknown"));
    });

    const reconnectModal = document.getElementById("components-reconnect-modal");

    if (reconnectModal) {
        reconnectModal.addEventListener(
            "components-reconnect-state-changed",
            reconnectStateChanged);
    } else {
        recordEvent("reconnect-modal-missing");
    }

    observeLongTasks();
    recordEvent("diagnostic-started");
    memorySnapshot("start");
    watchdogTimer = window.setTimeout(
        watchdogTick,
        WATCHDOG_INTERVAL_MS);
    frameTimer = window.setTimeout(
        sampleFrame,
        FRAME_SAMPLE_INTERVAL_MS);
    memoryTimer = window.setInterval(
        () => memorySnapshot("periodic"),
        10000);

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", createPanel, { once: true });
    } else {
        createPanel();
    }

    console.info(
        `[${VERSION}] lightweight reconnect/main-thread diagnostic active.`);
})();
