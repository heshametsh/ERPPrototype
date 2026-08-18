/*
 * UDS Work Orders Performance Observatory
 * Version: Step16P0-ArrowCauseDiag-v1
 *
 * Modes:
 *   Normal use:             /work-orders                -> OFF
 *   Stable comparison:      /work-orders?perf=baseline  -> low overhead
 *   Manual interaction map: /work-orders?perf=trace     -> all sheet actions, correlated
 *   Arrow root-cause:       /work-orders?perf=arrowdiag -> diagnostic only; no runtime behavior changes
 *   Short diagnosis:        /work-orders?perf=deep      -> detailed, band-aware, heavy
 *   Backward-compatible:    /work-orders?perf=1         -> deep
 *
 * The observatory never runs during normal use. Baseline mode avoids continuous
 * animation loops, MutationObserver, DOM geometry reads during scrolling, and
 * Tabulator-internal wrappers. Trace mode records every manual sheet interaction
 * and correlates it with scroll/table reactions while keeping continuous heavy
 * observers off. Deep mode adds the heaviest diagnostics only for a short test.
 * All modes report the time spent inside profiler callbacks so measurement
 * overhead remains visible instead of being silently attributed to the grid.
 */
(function () {
    "use strict";

    const VERSION = "Step16P0-ArrowCauseDiag-v1";
    const DEFAULT_TABLE_ID = "tabulator-test-table";
    const ROW_BAND_SIZE = 250;
    const MAX_TIMELINE = 1200;
    const MAX_INTERACTIONS = 1200;
    const MAX_MEMORY_SAMPLES = 240;
    const MAX_SAMPLES_PER_METRIC = 400;
    const BASELINE_SAMPLE_FIRST = 8;
    const BASELINE_SAMPLE_EVERY = 4;
    const BASELINE_SCROLL_SAMPLE_EVERY = 16;
    const DEEP_CONTEXT_INTERVAL_MS = 120;
    const SCROLL_IDLE_MS = 220;
    const RECENT_INPUT_MS = 500;
    const DEFAULT_DEEP_SECONDS = 90;
    const MAX_DEEP_SECONDS = 180;
    const TIME_BUCKET_MS = 30000;
    const MAX_TIME_BUCKETS = 240;
    const MAX_OPERATION_SAMPLES = 600;
    const MAX_TRACE_EVENTS = 6000;

    const OPERATION_CONSOLE_NAMES = new Set([
        "clipboard.copy",
        "clipboard.paste.total",
        "range.clear",
        "structure.insert",
        "structure.delete",
        "history.undo",
        "history.redo",
        "save.end-to-end"
    ]);

    const parameters = new URLSearchParams(window.location.search);
    const requestedPerfMode = String(parameters.get("perf") || "")
        .trim()
        .toLowerCase();
    const ARROW_DIAG_ENABLED = [
        "arrowdiag",
        "arrow-trace",
        "navdiag"
    ].includes(requestedPerfMode);
    const ARROW_DIAG_RECENT_MS = 550;
    const MAX_ARROW_DIAG_WINDOWS = 800;
    const MAX_ARROW_DIAG_FRAMES = 800;
    const MAX_ARROW_DIAG_TASKS = 800;
    const MAX_ARROW_DIAG_EVENT_TIMING = 800;

    function resolveMode(rawValue) {
        const value = String(rawValue || "").trim().toLowerCase();

        if (value === "baseline" || value === "base" || value === "light") {
            return "baseline";
        }

        if (
            value === "trace" ||
            value === "manual" ||
            value === "explore" ||
            value === "arrowdiag" ||
            value === "arrow-trace" ||
            value === "navdiag"
        ) {
            return "trace";
        }

        if (value === "deep" || value === "diagnostic" || value === "1") {
            return "deep";
        }

        if (value === "lifecycle" || value === "audit") {
            return "lifecycle";
        }

        return "off";
    }

    function round(value, digits) {
        if (!Number.isFinite(value)) {
            return value ?? null;
        }

        const factor = 10 ** (digits ?? 2);
        return Math.round(value * factor) / factor;
    }

    function percentile(values, percentage) {
        if (!Array.isArray(values) || values.length === 0) {
            return null;
        }

        const sorted = values
            .filter(Number.isFinite)
            .slice()
            .sort((first, second) => first - second);

        if (sorted.length === 0) {
            return null;
        }

        const index = Math.min(
            sorted.length - 1,
            Math.max(0, Math.ceil((percentage / 100) * sorted.length) - 1)
        );

        return round(sorted[index]);
    }

    function createDurationMetric() {
        return {
            count: 0,
            totalMs: 0,
            minMs: Number.POSITIVE_INFINITY,
            maxMs: 0,
            lastMs: 0,
            samples: []
        };
    }

    function addDuration(map, name, durationMs, keepSamples) {
        if (!name || !Number.isFinite(durationMs)) {
            return null;
        }

        let metric = map.get(name);

        if (!metric) {
            metric = createDurationMetric();
            map.set(name, metric);
        }

        metric.count++;
        metric.totalMs += durationMs;
        metric.minMs = Math.min(metric.minMs, durationMs);
        metric.maxMs = Math.max(metric.maxMs, durationMs);
        metric.lastMs = durationMs;

        if (keepSamples === true) {
            metric.samples.push(durationMs);

            if (metric.samples.length > MAX_SAMPLES_PER_METRIC) {
                metric.samples.shift();
            }
        }

        return metric;
    }

    function serializeDurationMap(map) {
        return Array.from(map.entries())
            .map(([name, metric]) => ({
                name: name,
                count: metric.count,
                totalMs: round(metric.totalMs),
                averageMs: round(metric.totalMs / Math.max(1, metric.count)),
                p50Ms: percentile(metric.samples, 50),
                p95Ms: percentile(metric.samples, 95),
                minMs: round(metric.minMs),
                maxMs: round(metric.maxMs),
                lastMs: round(metric.lastMs)
            }))
            .sort((first, second) => second.totalMs - first.totalMs);
    }

    function pushBounded(array, item, maximum) {
        array.push(item);

        if (array.length > maximum) {
            array.shift();
        }
    }

    function createBandBucket() {
        return {
            interactionCount: 0,
            keyCount: 0,
            scrollEvents: 0,
            scrollDistancePx: 0,
            renderCompleteCount: 0,
            longTaskCount: 0,
            longTaskTotalMs: 0,
            longTaskMaxMs: 0,
            rowsAdded: 0,
            rowsRemoved: 0,
            cellsAdded: 0,
            cellsRemoved: 0,
            hiddenAboveCount: 0,
            hiddenBelowCount: 0,
            maxHiddenAbovePx: 0,
            maxHiddenBelowPx: 0,
            inputToPaintMs: [],
            frameGapMs: []
        };
    }

    function createScrollInputBucket() {
        return {
            events: 0,
            sessions: 0,
            distancePx: 0,
            maxHandlerMs: 0
        };
    }

    function incrementCount(map, key, amount) {
        if (!map || !key) {
            return;
        }

        const next = (map.get(key) || 0) + (amount ?? 1);

        if (next <= 0) {
            map.delete(key);
        } else {
            map.set(key, next);
        }
    }

    function serializeCountMap(map) {
        return Object.fromEntries(
            Array.from(map.entries())
                .sort((first, second) =>
                    second[1] - first[1] ||
                    String(first[0]).localeCompare(String(second[0]))
                )
        );
    }

    function createTimeBucket(index) {
        return {
            index,
            startMs: index * TIME_BUCKET_MS,
            endMs: (index + 1) * TIME_BUCKET_MS,
            inputs: new Map(),
            interactions: new Map(),
            scroll: {
                events: 0,
                distancePx: 0,
                byInput: new Map()
            },
            longTasks: {
                count: 0,
                totalMs: 0,
                maxMs: 0
            },
            longAnimationFrames: {
                count: 0,
                totalMs: 0,
                totalBlockingMs: 0,
                maxMs: 0,
                maxBlockingMs: 0
            },
            tableEvents: new Map(),
            memory: null,
            lifecycle: null
        };
    }

    function describeEventTarget(target) {
        if (target === window) {
            return "window";
        }

        if (target === document) {
            return "document";
        }

        if (target instanceof Element) {
            const tag = String(target.tagName || "element").toLowerCase();

            if (target.id) {
                return `${tag}#${target.id}`;
            }

            const classes = Array.from(target.classList || [])
                .filter(Boolean)
                .slice(0, 2);

            return classes.length > 0
                ? `${tag}.${classes.join(".")}`
                : tag;
        }

        return target?.constructor?.name || "unknown-target";
    }

    function createLifecycleTracker() {
        const tracker = {
            installed: false,
            originals: null,
            listenerRegistry: new WeakMap(),
            listeners: {
                active: 0,
                peak: 0,
                added: 0,
                removed: 0,
                duplicateAdds: 0,
                onceRegistrations: 0,
                signalRegistrations: 0,
                byEvent: new Map(),
                byTarget: new Map()
            },
            timers: {
                active: new Map(),
                activeRaf: new Map(),
                peakTimers: 0,
                peakRaf: 0,
                created: 0,
                completed: 0,
                cleared: 0,
                rafCreated: 0,
                rafCompleted: 0,
                rafCancelled: 0,
                stringHandlers: 0
            },
            observerRecords: new WeakMap(),
            observers: {
                constructed: 0,
                active: 0,
                peak: 0,
                disconnected: 0,
                byType: new Map(),
                instrumentationErrors: []
            },

            updateListenerPeak: function () {
                this.listeners.peak = Math.max(
                    this.listeners.peak,
                    this.listeners.active
                );
            },

            updateObserverPeak: function () {
                this.observers.peak = Math.max(
                    this.observers.peak,
                    this.observers.active
                );
            },

            updateTimerPeaks: function () {
                this.timers.peakTimers = Math.max(
                    this.timers.peakTimers,
                    this.timers.active.size
                );
                this.timers.peakRaf = Math.max(
                    this.timers.peakRaf,
                    this.timers.activeRaf.size
                );
            },

            noteListenerAdded: function (target, type, listener, options) {
                if (
                    !listener ||
                    (typeof listener !== "function" && typeof listener !== "object")
                ) {
                    return;
                }

                const capture =
                    typeof options === "boolean"
                        ? options
                        : Boolean(options?.capture);
                const key = `${String(type)}::${capture ? 1 : 0}`;
                let targetMap = this.listenerRegistry.get(target);

                if (!targetMap) {
                    targetMap = new Map();
                    this.listenerRegistry.set(target, targetMap);
                }

                let listeners = targetMap.get(key);

                if (!listeners) {
                    listeners = new WeakMap();
                    targetMap.set(key, listeners);
                }

                if (listeners.has(listener)) {
                    this.listeners.duplicateAdds++;
                    return;
                }

                const targetLabel = describeEventTarget(target);
                listeners.set(listener, { targetLabel, type: String(type) });
                this.listeners.active++;
                this.listeners.added++;
                incrementCount(this.listeners.byEvent, String(type), 1);
                incrementCount(this.listeners.byTarget, targetLabel, 1);

                if (typeof options === "object" && options?.once === true) {
                    this.listeners.onceRegistrations++;
                }

                if (typeof options === "object" && options?.signal) {
                    this.listeners.signalRegistrations++;
                }

                this.updateListenerPeak();
            },

            noteListenerRemoved: function (target, type, listener, options) {
                if (
                    !listener ||
                    (typeof listener !== "function" && typeof listener !== "object")
                ) {
                    return;
                }

                const capture =
                    typeof options === "boolean"
                        ? options
                        : Boolean(options?.capture);
                const key = `${String(type)}::${capture ? 1 : 0}`;
                const targetMap = this.listenerRegistry.get(target);
                const listeners = targetMap?.get(key);
                const metadata = listeners?.get(listener);

                if (!metadata) {
                    return;
                }

                listeners.delete(listener);
                this.listeners.active = Math.max(0, this.listeners.active - 1);
                this.listeners.removed++;
                incrementCount(this.listeners.byEvent, metadata.type, -1);
                incrementCount(this.listeners.byTarget, metadata.targetLabel, -1);
            },

            noteTimerCreated: function (id, kind, delay) {
                this.timers.active.set(id, {
                    kind,
                    delayMs: Number.isFinite(Number(delay)) ? Number(delay) : null
                });
                this.timers.created++;
                this.updateTimerPeaks();
            },

            noteTimerResolved: function (id, reason) {
                if (!this.timers.active.has(id)) {
                    return;
                }

                this.timers.active.delete(id);

                if (reason === "completed") {
                    this.timers.completed++;
                } else {
                    this.timers.cleared++;
                }
            },

            noteRafCreated: function (id) {
                this.timers.activeRaf.set(id, true);
                this.timers.rafCreated++;
                this.updateTimerPeaks();
            },

            noteRafResolved: function (id, reason) {
                if (!this.timers.activeRaf.has(id)) {
                    return;
                }

                this.timers.activeRaf.delete(id);

                if (reason === "completed") {
                    this.timers.rafCompleted++;
                } else {
                    this.timers.rafCancelled++;
                }
            },

            registerObserver: function (instance, type) {
                const metadata = {
                    type,
                    active: false,
                    observedTargets: new WeakSet(),
                    targetCount: 0
                };
                this.observerRecords.set(instance, metadata);
                this.observers.constructed++;

                const markActive = () => {
                    if (metadata.active) {
                        return;
                    }

                    metadata.active = true;
                    this.observers.active++;
                    incrementCount(this.observers.byType, type, 1);
                    this.updateObserverPeak();
                };

                const markInactive = () => {
                    if (!metadata.active) {
                        return;
                    }

                    metadata.active = false;
                    metadata.observedTargets = new WeakSet();
                    metadata.targetCount = 0;
                    this.observers.active = Math.max(0, this.observers.active - 1);
                    this.observers.disconnected++;
                    incrementCount(this.observers.byType, type, -1);
                };

                try {
                    if (typeof instance.observe === "function") {
                        const originalObserve = instance.observe.bind(instance);
                        instance.observe = (...args) => {
                            const result = originalObserve(...args);
                            const target = args[0];

                            if (
                                type !== "PerformanceObserver" &&
                                target &&
                                (typeof target === "object" || typeof target === "function") &&
                                !metadata.observedTargets.has(target)
                            ) {
                                metadata.observedTargets.add(target);
                                metadata.targetCount++;
                            }

                            markActive();
                            return result;
                        };
                    }

                    if (typeof instance.unobserve === "function") {
                        const originalUnobserve = instance.unobserve.bind(instance);
                        instance.unobserve = target => {
                            const result = originalUnobserve(target);

                            if (target && metadata.observedTargets.has(target)) {
                                metadata.observedTargets.delete(target);
                                metadata.targetCount = Math.max(0, metadata.targetCount - 1);

                                if (metadata.targetCount === 0) {
                                    markInactive();
                                }
                            }

                            return result;
                        };
                    }

                    if (typeof instance.disconnect === "function") {
                        const originalDisconnect = instance.disconnect.bind(instance);
                        instance.disconnect = (...args) => {
                            const result = originalDisconnect(...args);
                            markInactive();
                            return result;
                        };
                    }
                } catch (error) {
                    this.observers.instrumentationErrors.push({
                        type,
                        message: error?.message || String(error)
                    });
                }
            },

            wrapObserverConstructor: function (name) {
                const Original = window[name];

                if (typeof Original !== "function") {
                    return null;
                }

                const owner = this;
                const Wrapped = new Proxy(Original, {
                    construct(target, args) {
                        const instance = Reflect.construct(target, args, target);
                        owner.registerObserver(instance, name);
                        return instance;
                    }
                });

                window[name] = Wrapped;
                return Original;
            },

            install: function () {
                if (this.installed) {
                    return;
                }

                const owner = this;
                this.originals = {
                    addEventListener: EventTarget.prototype.addEventListener,
                    removeEventListener: EventTarget.prototype.removeEventListener,
                    setTimeout: window.setTimeout,
                    clearTimeout: window.clearTimeout,
                    setInterval: window.setInterval,
                    clearInterval: window.clearInterval,
                    requestAnimationFrame: window.requestAnimationFrame,
                    cancelAnimationFrame: window.cancelAnimationFrame,
                    observers: {}
                };

                EventTarget.prototype.addEventListener = function (type, listener, options) {
                    const result = owner.originals.addEventListener.call(
                        this,
                        type,
                        listener,
                        options
                    );
                    owner.noteListenerAdded(this, type, listener, options);
                    return result;
                };

                EventTarget.prototype.removeEventListener = function (type, listener, options) {
                    const result = owner.originals.removeEventListener.call(
                        this,
                        type,
                        listener,
                        options
                    );
                    owner.noteListenerRemoved(this, type, listener, options);
                    return result;
                };

                window.setTimeout = function (handler, delay, ...args) {
                    let id = null;
                    const wrapped = typeof handler === "function"
                        ? function (...callbackArgs) {
                            owner.noteTimerResolved(id, "completed");
                            return handler.apply(this, callbackArgs);
                        }
                        : handler;

                    if (typeof handler !== "function") {
                        owner.timers.stringHandlers++;
                    }

                    id = owner.originals.setTimeout.call(window, wrapped, delay, ...args);
                    owner.noteTimerCreated(id, "timeout", delay);
                    return id;
                };

                window.clearTimeout = function (id) {
                    owner.noteTimerResolved(id, "cleared");
                    return owner.originals.clearTimeout.call(window, id);
                };

                window.setInterval = function (handler, delay, ...args) {
                    const id = owner.originals.setInterval.call(
                        window,
                        handler,
                        delay,
                        ...args
                    );
                    owner.noteTimerCreated(id, "interval", delay);
                    return id;
                };

                window.clearInterval = function (id) {
                    owner.noteTimerResolved(id, "cleared");
                    return owner.originals.clearInterval.call(window, id);
                };

                window.requestAnimationFrame = function (callback) {
                    let id = null;
                    id = owner.originals.requestAnimationFrame.call(
                        window,
                        timestamp => {
                            owner.noteRafResolved(id, "completed");
                            callback(timestamp);
                        }
                    );
                    owner.noteRafCreated(id);
                    return id;
                };

                window.cancelAnimationFrame = function (id) {
                    owner.noteRafResolved(id, "cancelled");
                    return owner.originals.cancelAnimationFrame.call(window, id);
                };

                for (const name of [
                    "MutationObserver",
                    "ResizeObserver",
                    "IntersectionObserver",
                    "PerformanceObserver"
                ]) {
                    const original = this.wrapObserverConstructor(name);

                    if (original) {
                        this.originals.observers[name] = original;
                    }
                }

                this.installed = true;
            },

            restore: function () {
                if (!this.installed || !this.originals) {
                    return;
                }

                EventTarget.prototype.addEventListener = this.originals.addEventListener;
                EventTarget.prototype.removeEventListener = this.originals.removeEventListener;
                window.setTimeout = this.originals.setTimeout;
                window.clearTimeout = this.originals.clearTimeout;
                window.setInterval = this.originals.setInterval;
                window.clearInterval = this.originals.clearInterval;
                window.requestAnimationFrame = this.originals.requestAnimationFrame;
                window.cancelAnimationFrame = this.originals.cancelAnimationFrame;

                for (const [name, Original] of Object.entries(this.originals.observers)) {
                    window[name] = Original;
                }

                this.installed = false;
            },

            snapshot: function () {
                const timersByKind = new Map();

                for (const metadata of this.timers.active.values()) {
                    incrementCount(timersByKind, metadata.kind, 1);
                }

                return {
                    installed: this.installed,
                    listeners: {
                        activeRegistrationBalance: this.listeners.active,
                        peakRegistrationBalance: this.listeners.peak,
                        added: this.listeners.added,
                        explicitlyRemoved: this.listeners.removed,
                        duplicateAddsIgnored: this.listeners.duplicateAdds,
                        onceRegistrations: this.listeners.onceRegistrations,
                        signalRegistrations: this.listeners.signalRegistrations,
                        byEvent: serializeCountMap(this.listeners.byEvent),
                        byTarget: serializeCountMap(this.listeners.byTarget),
                        note: "Listener balance is addEventListener minus explicit removeEventListener. Browser auto-removal for once/signal can make this an upper-bound estimate."
                    },
                    timers: {
                        active: this.timers.active.size,
                        activeByKind: serializeCountMap(timersByKind),
                        peakActive: this.timers.peakTimers,
                        created: this.timers.created,
                        completed: this.timers.completed,
                        cleared: this.timers.cleared,
                        stringHandlers: this.timers.stringHandlers
                    },
                    animationFrames: {
                        active: this.timers.activeRaf.size,
                        peakActive: this.timers.peakRaf,
                        created: this.timers.rafCreated,
                        completed: this.timers.rafCompleted,
                        cancelled: this.timers.rafCancelled
                    },
                    observers: {
                        constructed: this.observers.constructed,
                        active: this.observers.active,
                        peakActive: this.observers.peak,
                        disconnected: this.observers.disconnected,
                        activeByType: serializeCountMap(this.observers.byType),
                        instrumentationErrors: this.observers.instrumentationErrors
                    }
                };
            }
        };

        return tracker;
    }

    const lifecycleTracker = createLifecycleTracker();

    const api = {
        version: VERSION,
        mode: resolveMode(parameters.get("perf")),
        enabled: false,
        active: false,
        sessions: new Map(),
        attachments: new Map(),
        wrappers: [],
        observers: [],
        globalHandlers: [],
        panel: null,
        deepStopTimer: null,
        memoryTimer: null,
        attachTimer: null,
        markNumber: 0,
        lifecycleTracker: lifecycleTracker,

        now: function () {
            return window.performance?.now?.() ?? Date.now();
        },

        isArrowDiagnosticInput: function (input) {
            return ARROW_DIAG_ENABLED &&
                input?.type === "keyboard" &&
                (input.detail === "ArrowUp" || input.detail === "ArrowDown");
        },

        getArrowDiagnosticWindow: function (session, sequence) {
            if (!ARROW_DIAG_ENABLED || !session?.arrowDiagnosis || !sequence) {
                return null;
            }

            return session.arrowDiagnosis.windows.get(sequence) || null;
        },

        createArrowDiagnosticWindow: function (session, input) {
            if (!this.isArrowDiagnosticInput(input) || !session?.arrowDiagnosis) {
                return null;
            }

            const diagnosis = session.arrowDiagnosis;
            const sequence = input.sequence;
            const windowItem = {
                sequence,
                key: input.detail,
                direction: input.direction,
                startedAt: input.at,
                repeat: false,
                internals: new Map(),
                internalCalls: [],
                paintProbe: null,
                contextBefore: null,
                contextAfter: null,
                reaction: null,
                actionBreakdown: null
            };

            diagnosis.windows.set(sequence, windowItem);
            while (diagnosis.windows.size > MAX_ARROW_DIAG_WINDOWS) {
                const oldest = diagnosis.windows.keys().next().value;
                diagnosis.windows.delete(oldest);
                diagnosis.droppedWindows++;
            }

            return windowItem;
        },

        findArrowDiagnosticWindowsForSpan: function (session, startAt, endAt) {
            if (!ARROW_DIAG_ENABLED || !session?.arrowDiagnosis) {
                return [];
            }

            const start = Number.isFinite(startAt) ? startAt : this.now();
            const end = Number.isFinite(endAt) ? endAt : start;
            const matches = [];

            for (const item of session.arrowDiagnosis.windows.values()) {
                if (item.startedAt >= start - 20 && item.startedAt <= end + 20) {
                    matches.push(item.sequence);
                }
            }

            return matches;
        },

        noteArrowDiagnosticDuration: function (session, name, durationMs) {
            if (!ARROW_DIAG_ENABLED || !session || !Number.isFinite(durationMs)) {
                return;
            }

            const input = session.lastInput;
            if (!this.isArrowDiagnosticInput(input)) {
                return;
            }

            const now = this.now();
            if (now - input.at > ARROW_DIAG_RECENT_MS) {
                return;
            }

            const item = this.getArrowDiagnosticWindow(session, input.sequence);
            if (!item) return;

            let metric = item.internals.get(name);
            if (!metric) {
                metric = { count: 0, totalMs: 0, maxMs: 0 };
                item.internals.set(name, metric);
            }
            metric.count++;
            metric.totalMs += durationMs;
            metric.maxMs = Math.max(metric.maxMs, durationMs);

            if (item.internalCalls.length < 160) {
                item.internalCalls.push({
                    atMs: round(now - item.startedAt),
                    name,
                    durationMs: round(durationMs)
                });
            }
        },

        trackProfilerWork: function (session, name, startedAt) {
            if (!session || !Number.isFinite(startedAt)) {
                return;
            }

            const duration = this.now() - startedAt;
            session.profiler.measuredHookTimeMs += duration;
            session.profiler.callbackCount++;
            session.profiler.maxCallbackMs = Math.max(
                session.profiler.maxCallbackMs,
                duration
            );
            addDuration(
                session.profiler.byHook,
                name || "unknown",
                duration,
                false
            );
        },

        readMemorySnapshot: function () {
            const memory = window.performance?.memory;
            const toMb = value =>
                Number.isFinite(value)
                    ? round(value / 1048576)
                    : null;

            return {
                usedJsHeapMb: toMb(memory?.usedJSHeapSize),
                totalJsHeapMb: toMb(memory?.totalJSHeapSize),
                jsHeapLimitMb: toMb(memory?.jsHeapSizeLimit)
            };
        },

        captureDomSnapshot: function (elementId) {
            const startedAt = this.now();
            const element = document.getElementById(elementId);
            const snapshot = {
                pageElements: document.getElementsByTagName("*").length,
                tableRows: element?.querySelectorAll?.(".tabulator-row").length ?? 0,
                tableCells: element?.querySelectorAll?.(".tabulator-cell").length ?? 0,
                tableRanges: element?.querySelectorAll?.(".tabulator-range").length ?? 0,
                holderHeight: null,
                scrollHeight: null,
                scrollTop: null
            };
            const holder = element?.querySelector?.(".tabulator-tableholder");

            if (holder) {
                snapshot.holderHeight = holder.clientHeight;
                snapshot.scrollHeight = holder.scrollHeight;
                snapshot.scrollTop = holder.scrollTop;
            }

            const session = this.sessions.get(elementId);
            this.trackProfilerWork(session, "profiler.dom-snapshot", startedAt);
            return snapshot;
        },

        captureGpuIdentity: function () {
            const result = {
                available: false,
                api: null,
                vendor: null,
                renderer: null,
                note: "GPU identity only. Browser JavaScript cannot read GPU utilization or VRAM usage."
            };

            try {
                const canvas = document.createElement("canvas");
                const context =
                    canvas.getContext("webgl2", { powerPreference: "high-performance" }) ||
                    canvas.getContext("webgl", { powerPreference: "high-performance" });

                if (!context) {
                    return result;
                }

                const debugInfo = context.getExtension("WEBGL_debug_renderer_info");
                result.available = true;
                result.api =
                    typeof WebGL2RenderingContext !== "undefined" &&
                        context instanceof WebGL2RenderingContext
                        ? "WebGL2"
                        : "WebGL";
                result.vendor = debugInfo
                    ? context.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
                    : context.getParameter(context.VENDOR);
                result.renderer = debugInfo
                    ? context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
                    : context.getParameter(context.RENDERER);
                context.getExtension("WEBGL_lose_context")?.loseContext?.();
            } catch (error) {
                result.error = error?.message || String(error);
            }

            return result;
        },

        captureEnvironment: function () {
            const connection =
                navigator.connection ||
                navigator.mozConnection ||
                navigator.webkitConnection;

            return {
                userAgent: navigator.userAgent,
                language: navigator.language,
                logicalProcessors: navigator.hardwareConcurrency ?? null,
                approximateDeviceMemoryGb: navigator.deviceMemory ?? null,
                screen: {
                    width: window.screen?.width ?? null,
                    height: window.screen?.height ?? null,
                    availableWidth: window.screen?.availWidth ?? null,
                    availableHeight: window.screen?.availHeight ?? null,
                    devicePixelRatio: window.devicePixelRatio ?? null
                },
                viewport: {
                    width: window.innerWidth,
                    height: window.innerHeight
                },
                connection: connection
                    ? {
                        effectiveType: connection.effectiveType ?? null,
                        downlinkMbps: connection.downlink ?? null,
                        rttMs: connection.rtt ?? null,
                        saveData: connection.saveData ?? null
                    }
                    : null,
                supportedObservers: (() => {
                    const entries =
                        typeof PerformanceObserver !== "undefined"
                            ? PerformanceObserver.supportedEntryTypes || []
                            : [];

                    return {
                        longTask: entries.includes("longtask"),
                        eventTiming: entries.includes("event"),
                        longAnimationFrame: entries.includes("long-animation-frame"),
                        layoutShift: entries.includes("layout-shift")
                    };
                })()
            };
        },

        createSession: function (elementId, label) {
            const session = {
                elementId: elementId,
                version: this.version,
                mode: this.mode,
                label: label || `UDS ${this.mode} performance run`,
                startedAt: this.now(),
                endedAt: null,
                rowCount: null,
                initializationStartedAt: null,
                firstUsableAt: null,
                firstUsableMsFromInitialize: null,
                firstUsableMsFromSessionStart: null,
                pendingSaveStartedAt: null,
                environment: this.captureEnvironment(),
                durations: new Map(),
                counters: new Map(),
                interactionMetrics: new Map(),
                internalDurations: new Map(),
                bands: new Map(),
                timeline: [],
                operationSamples: [],
                interactions: [],
                timeBuckets: new Map(),
                marks: [],
                errors: [],
                lastInput: {
                    type: "unknown",
                    detail: "unknown",
                    direction: "unknown",
                    at: 0
                },
                scroll: {
                    events: 0,
                    sessions: 0,
                    distancePx: 0,
                    maxHandlerMs: 0,
                    byInput: new Map()
                },
                longTasks: {
                    count: 0,
                    totalMs: 0,
                    maxMs: 0
                },
                longAnimationFrames: {
                    count: 0,
                    totalMs: 0,
                    totalBlockingMs: 0,
                    maxMs: 0,
                    maxBlockingMs: 0,
                    scripts: new Map()
                },
                eventTiming: new Map(),
                layoutShifts: {
                    count: 0,
                    totalScore: 0,
                    withoutRecentInputCount: 0,
                    withoutRecentInputScore: 0
                },
                domMutations: {
                    callbacks: 0,
                    records: 0,
                    rowsAdded: 0,
                    rowsRemoved: 0,
                    cellsAdded: 0,
                    cellsRemoved: 0
                },
                memory: {
                    start: this.readMemorySnapshot(),
                    end: null,
                    samples: []
                },
                dom: {
                    start: null,
                    end: null
                },
                profiler: {
                    measuredHookTimeMs: 0,
                    callbackCount: 0,
                    maxCallbackMs: 0,
                    sampledInteractions: 0,
                    skippedInteractions: 0,
                    byHook: new Map()
                },
                tableEvents: new Map(),
                tableOptions: null,
                resources: null,
                navigation: null,
                gpuIdentity: null,
                trace: {
                    events: [],
                    droppedEvents: 0,
                    nextActionId: 1,
                    currentActionId: null,
                    inputSequence: 0,
                    pendingActions: new Map(),
                    selectionSafety: {
                        checks: 0,
                        failures: 0,
                        disconnected: 0,
                        notSelected: 0,
                        outsideViewport: 0,
                        supersededChecksSkipped: 0
                    }
                },
                arrowDiagnosis: {
                    enabled: ARROW_DIAG_ENABLED,
                    windows: new Map(),
                    frames: [],
                    longTasks: [],
                    eventTiming: [],
                    droppedWindows: 0,
                    droppedFrames: 0,
                    droppedLongTasks: 0,
                    droppedEventTiming: 0
                },
                lifecycle: {
                    start: null,
                    end: null,
                    samples: []
                }
            };

            this.sessions.set(elementId, session);

            if (this.mode === "lifecycle") {
                const sample = this.recordLifecycleSample(
                    elementId,
                    "session-start"
                );
                session.lifecycle.start = sample?.snapshot || null;
            }

            this.recordMemorySample(elementId, "session-start");
            return session;
        },

        ensureSession: function (elementId) {
            if (!this.active || !elementId) {
                return null;
            }

            return this.sessions.get(elementId) || this.createSession(elementId);
        },

        ensureTimeBucket: function (session, absoluteAt) {
            if (!session) {
                return null;
            }

            const timestamp = Number.isFinite(absoluteAt)
                ? absoluteAt
                : this.now();
            const elapsedMs = Math.max(0, timestamp - session.startedAt);
            const index = Math.floor(elapsedMs / TIME_BUCKET_MS);
            let bucket = session.timeBuckets.get(index);

            if (!bucket) {
                bucket = createTimeBucket(index);
                session.timeBuckets.set(index, bucket);

                while (session.timeBuckets.size > MAX_TIME_BUCKETS) {
                    const oldest = Math.min(...session.timeBuckets.keys());
                    session.timeBuckets.delete(oldest);
                }
            }

            return bucket;
        },

        captureKnownLifecycleState: function (elementId) {
            const state = window.tabulatorTest?.states?.[elementId] || null;
            const attachment = this.attachments.get(elementId) || null;
            const activePopups = window.tabulatorFilters?.activePopups;
            const popupEntries = activePopups instanceof Map
                ? Array.from(activePopups.values())
                : [];

            return {
                grid: {
                    tableInstances: Object.keys(window.tabulatorTest?.tables || {}).length,
                    stateInstances: Object.keys(window.tabulatorTest?.states || {}).length,
                    registeredDocumentHandlers: state
                        ? [
                            state.keyDownHandler,
                            state.copyHandler,
                            state.pasteHandler,
                            state.pointerDownHandler
                        ].filter(Boolean).length
                        : 0,
                    registeredWindowHandlers: state?.resizeHandler ? 1 : 0,
                    registeredElementHandlers: state?.rightClickRangeGuardHandler ? 1 : 0,
                    activeTimeouts: state?.resizeTimer ? 1 : 0,
                    activeAnimationFrames: state
                        ? [
                            state.resizeViewportRestoreFrame,
                            state.arrowUpCorrectionFrame,
                            state.verticalNavigationFrame
                        ].filter(value => value !== null && value !== undefined).length
                        : 0
                },
                performanceObservatory: {
                    attachments: this.attachments.size,
                    domHandlers: attachment?.domHandlers?.length || 0,
                    tableHandlers: attachment?.tableHandlers?.length || 0,
                    attachmentMutationObservers: attachment?.mutationObserver ? 1 : 0,
                    attachmentTimeouts: attachment?.scrollIdleTimer !== null &&
                        attachment?.scrollIdleTimer !== undefined
                        ? 1
                        : 0,
                    attachmentAnimationFrames: attachment?.contextRaf !== null &&
                        attachment?.contextRaf !== undefined
                        ? 1
                        : 0,
                    performanceObservers: this.observers.length,
                    globalHandlers: this.globalHandlers.length,
                    memoryTimer: this.memoryTimer !== null ? 1 : 0,
                    deepStopTimer: this.deepStopTimer !== null ? 1 : 0,
                    attachTimer: this.attachTimer !== null ? 1 : 0
                },
                filters: {
                    activePopups: popupEntries.length,
                    activePopupObservers: popupEntries.filter(item => item?.observer).length
                },
                rangeAutoScroll:
                    window.tabulatorRangeAutoScroll?.snapshot?.(elementId) || null
            };
        },

        captureLifecycleSnapshot: function (elementId) {
            return {
                trackedResources: this.lifecycleTracker.snapshot(),
                knownOwners: this.captureKnownLifecycleState(elementId)
            };
        },

        recordLifecycleSample: function (elementId, reason) {
            if (this.mode !== "lifecycle") {
                return null;
            }

            const session = this.ensureSession(elementId);

            if (!session) {
                return null;
            }

            const sample = {
                atMs: round(this.now() - session.startedAt),
                reason: reason || "periodic",
                snapshot: this.captureLifecycleSnapshot(elementId)
            };
            pushBounded(session.lifecycle.samples, sample, MAX_MEMORY_SAMPLES);
            const bucket = this.ensureTimeBucket(session, this.now());

            if (bucket) {
                bucket.lifecycle = sample.snapshot;
            }

            return sample;
        },

        serializeTimeBuckets: function (session) {
            return Array.from(session.timeBuckets.values())
                .sort((first, second) => first.index - second.index)
                .map(bucket => ({
                    window: {
                        index: bucket.index,
                        startMs: bucket.startMs,
                        endMs: bucket.endMs
                    },
                    inputs: serializeCountMap(bucket.inputs),
                    interactions: this.serializeInteractionMetrics(bucket.interactions),
                    scroll: {
                        events: bucket.scroll.events,
                        distancePx: round(bucket.scroll.distancePx),
                        byInput: Array.from(bucket.scroll.byInput.entries()).map(
                            ([name, value]) => ({ name, ...value })
                        )
                    },
                    longTasks: {
                        count: bucket.longTasks.count,
                        totalMs: round(bucket.longTasks.totalMs),
                        maxMs: round(bucket.longTasks.maxMs)
                    },
                    longAnimationFrames: {
                        count: bucket.longAnimationFrames.count,
                        totalMs: round(bucket.longAnimationFrames.totalMs),
                        totalBlockingMs: round(bucket.longAnimationFrames.totalBlockingMs),
                        maxMs: round(bucket.longAnimationFrames.maxMs),
                        maxBlockingMs: round(bucket.longAnimationFrames.maxBlockingMs)
                    },
                    tableEvents: Object.fromEntries(bucket.tableEvents),
                    memory: bucket.memory,
                    lifecycle: bucket.lifecycle
                }));
        },

        serializeArrowDiagnosis: function (session) {
            if (!ARROW_DIAG_ENABLED || !session?.arrowDiagnosis) {
                return null;
            }

            const serializeMetrics = map => Array.from(map.entries())
                .map(([name, metric]) => ({
                    name,
                    count: metric.count,
                    totalMs: round(metric.totalMs),
                    averageMs: round(metric.totalMs / Math.max(1, metric.count)),
                    maxMs: round(metric.maxMs)
                }))
                .sort((a, b) => b.totalMs - a.totalMs);

            const windows = Array.from(session.arrowDiagnosis.windows.values())
                .map(item => ({
                    sequence: item.sequence,
                    key: item.key,
                    direction: item.direction,
                    repeat: item.repeat,
                    startedMs: round(item.startedAt - session.startedAt),
                    internals: serializeMetrics(item.internals),
                    internalCalls: item.internalCalls,
                    paintProbe: item.paintProbe,
                    contextBefore: item.contextBefore,
                    contextAfter: item.contextAfter,
                    reaction: item.reaction,
                    actionBreakdown: item.actionBreakdown
                }));

            return {
                purpose: "Root-cause attribution only. Diagnostic wrappers add overhead; do not use these timings as the final before/after benchmark.",
                windows,
                longAnimationFrames: session.arrowDiagnosis.frames,
                longTasks: session.arrowDiagnosis.longTasks,
                eventTiming: session.arrowDiagnosis.eventTiming,
                dropped: {
                    windows: session.arrowDiagnosis.droppedWindows,
                    frames: session.arrowDiagnosis.droppedFrames,
                    longTasks: session.arrowDiagnosis.droppedLongTasks,
                    eventTiming: session.arrowDiagnosis.droppedEventTiming
                }
            };
        },

        reset: function (elementId, label) {
            const id = elementId || DEFAULT_TABLE_ID;
            const oldSession = this.sessions.get(id);

            if (oldSession && oldSession.endedAt === null) {
                oldSession.endedAt = this.now();
            }

            const session = this.createSession(
                id,
                label || `Performance run ${new Date().toLocaleTimeString()}`
            );
            const attachment = this.attachments.get(id);

            if (attachment) {
                attachment.lastScrollTop = attachment.holder.scrollTop;
                attachment.lastScrollLeft = attachment.holder.scrollLeft;
                attachment.baselineScrollCounter = 0;
                attachment.baselineSampledScrollTop = attachment.lastScrollTop;
                attachment.baselineSampledScrollLeft = attachment.lastScrollLeft;
                attachment.lastContextAt = 0;
                attachment.cachedContext = null;
                attachment.interactionCounts.clear();
                attachment.scrollSession = null;
                attachment.lastMutationDetailAt = 0;
                this.captureFirstUsable(id, attachment);

                if (this.mode === "deep") {
                    this.captureViewportContext(id, attachment, true);
                }
            } else {
                this.attachWhenReady(id);
            }

            this.startMemoryTimer();
            this.startDeepAutoStop();
            this.setPanelStatus(
                ARROW_DIAG_ENABLED
                    ? "Recording arrow root-cause diagnostic"
                    : this.mode === "deep"
                        ? `Recording deep test for ${this.getDeepSeconds()}s`
                        : this.mode === "lifecycle"
                            ? "Recording lifecycle audit"
                            : "Recording baseline"
            );
            return session;
        },

        start: function (mode, elementId, label) {
            const selectedMode = resolveMode(mode || this.mode);

            if (selectedMode === "off") {
                return null;
            }

            this.stop(false);
            this.mode = selectedMode;
            this.enabled = true;
            this.active = true;

            if (this.mode === "lifecycle") {
                this.lifecycleTracker.install();
            }

            const id = elementId || DEFAULT_TABLE_ID;
            const session = this.createSession(id, label);
            this.wrapApplicationMethods();
            this.startPerformanceObservers();
            this.attachGlobalErrorHandlers();
            this.attachWhenReady(id);
            this.createPanel(id);
            this.startMemoryTimer();
            this.setPanelStatus(
                ARROW_DIAG_ENABLED
                    ? "ARROW DIAG ready — press Start/Reset before the test"
                    : `${this.mode.toUpperCase()} ready — press Start/Reset before the test`
            );
            return session;
        },

        stop: function (finalizeCurrent) {
            if (finalizeCurrent !== false) {
                for (const session of this.sessions.values()) {
                    if (session.endedAt === null) {
                        this.finalizeSession(session.elementId);
                    }
                }
            }

            this.active = false;
            this.clearTimers();
            this.detachAll();
            this.stopPerformanceObservers();
            this.detachGlobalHandlers();
            this.restoreWrappers();
            this.lifecycleTracker.restore();
            this.setPanelStatus("Capture stopped — Download remains available");
        },

        clearTimers: function () {
            if (this.deepStopTimer !== null) {
                window.clearTimeout(this.deepStopTimer);
                this.deepStopTimer = null;
            }

            if (this.memoryTimer !== null) {
                window.clearInterval(this.memoryTimer);
                this.memoryTimer = null;
            }

            if (this.attachTimer !== null) {
                window.clearTimeout(this.attachTimer);
                this.attachTimer = null;
            }
        },

        getDeepSeconds: function () {
            const requested = Number(parameters.get("perfSeconds"));

            if (!Number.isFinite(requested)) {
                return DEFAULT_DEEP_SECONDS;
            }

            return Math.min(
                MAX_DEEP_SECONDS,
                Math.max(20, Math.round(requested))
            );
        },

        startDeepAutoStop: function () {
            if (this.deepStopTimer !== null) {
                window.clearTimeout(this.deepStopTimer);
                this.deepStopTimer = null;
            }

            if (this.mode !== "deep" || !this.active) {
                return;
            }

            this.deepStopTimer = window.setTimeout(() => {
                this.deepStopTimer = null;
                this.stop(true);
            }, this.getDeepSeconds() * 1000);
        },

        startMemoryTimer: function () {
            if (this.memoryTimer !== null) {
                window.clearInterval(this.memoryTimer);
            }

            if (!this.active) {
                return;
            }

            const interval = this.mode === "deep" ? 10000 : 30000;
            this.memoryTimer = window.setInterval(() => {
                for (const session of this.sessions.values()) {
                    if (session.endedAt === null) {
                        this.recordMemorySample(session.elementId, "periodic");
                    }
                }
            }, interval);
        },

        recordMemorySample: function (elementId, reason) {
            const session = this.ensureSession(elementId);

            if (!session) {
                return;
            }

            const startedAt = this.now();
            const memorySample = {
                atMs: round(this.now() - session.startedAt),
                reason: reason || "manual",
                ...this.readMemorySnapshot(),
                context:
                    this.mode === "deep"
                        ? this.currentContext(elementId)
                        : null
            };
            pushBounded(
                session.memory.samples,
                memorySample,
                MAX_MEMORY_SAMPLES
            );
            const bucket = this.ensureTimeBucket(session, this.now());

            if (bucket) {
                bucket.memory = memorySample;
            }

            if (this.mode === "lifecycle" && reason !== "session-start") {
                this.recordLifecycleSample(elementId, reason || "periodic");
            }

            this.trackProfilerWork(session, "profiler.memory-sample", startedAt);
        },

        increment: function (elementId, name, amount) {
            const session = this.ensureSession(elementId);

            if (!session || !name) {
                return;
            }

            session.counters.set(
                name,
                (session.counters.get(name) || 0) + (amount ?? 1)
            );
        },

        addTimeline: function (elementId, item) {
            const session = this.ensureSession(elementId);

            if (!session || this.mode !== "deep" || !item) {
                return;
            }

            pushBounded(
                session.timeline,
                {
                    atMs: round(this.now() - session.startedAt),
                    ...item
                },
                MAX_TIMELINE
            );
        },

        recordDuration: function (
            elementId,
            name,
            durationMs,
            metadata,
            internal
        ) {
            const session = this.ensureSession(elementId);

            if (!session || !Number.isFinite(durationMs)) {
                return;
            }

            const targetMap = internal
                ? session.internalDurations
                : session.durations;
            addDuration(targetMap, name, durationMs, true);
            if (internal === true) {
                this.noteArrowDiagnosticDuration(session, name, durationMs);
            }
            this.noteTraceActionDuration(
                session,
                name,
                durationMs,
                internal === true
            );

            if (this.mode === "trace" && internal !== true) {
                this.pushTraceEvent(elementId, "operation", {
                    name,
                    durationMs: round(durationMs)
                });
            }

            const normalizedMetadata = metadata
                ? { ...metadata }
                : null;

            if (normalizedMetadata) {
                delete normalizedMetadata.alwaysTimeline;
                delete normalizedMetadata.captureSample;
                delete normalizedMetadata.consoleSummary;
            }

            const shouldCaptureOperation =
                internal !== true &&
                (
                    metadata?.captureSample === true ||
                    String(name || "").startsWith("clipboard.") ||
                    String(name || "").startsWith("range.") ||
                    String(name || "").startsWith("history.") ||
                    String(name || "").startsWith("structure.") ||
                    String(name || "").startsWith("save.")
                );

            if (shouldCaptureOperation) {
                const sample = {
                    atMs: round(this.now() - session.startedAt),
                    name: name,
                    durationMs: round(durationMs),
                    metadata: normalizedMetadata
                };

                pushBounded(
                    session.operationSamples,
                    sample,
                    MAX_OPERATION_SAMPLES
                );

                if (
                    metadata?.consoleSummary === true ||
                    OPERATION_CONSOLE_NAMES.has(name)
                ) {
                    console.info(
                        `[UDS Operation] ${name}: ${round(durationMs)} ms`,
                        normalizedMetadata || {}
                    );
                }
            }

            const threshold = this.mode === "deep" ? 8 : 30;

            if (durationMs >= threshold || metadata?.alwaysTimeline === true) {
                this.addTimeline(elementId, {
                    type: internal ? "internal-duration" : "operation-duration",
                    name: name,
                    durationMs: round(durationMs),
                    metadata: normalizedMetadata,
                    context:
                        this.mode === "deep"
                            ? this.currentContext(elementId)
                            : null
                });
            }
        },

        resolveElementId: function (args, configuredId) {
            if (typeof configuredId === "function") {
                return configuredId(args) || DEFAULT_TABLE_ID;
            }

            if (typeof configuredId === "string") {
                return configuredId;
            }

            return typeof args?.[0] === "string"
                ? args[0]
                : DEFAULT_TABLE_ID;
        },

        wrapMethod: function (target, methodName, options) {
            const original = target?.[methodName];

            if (
                typeof original !== "function" ||
                original.__udsFinalPerfWrapper === true
            ) {
                return false;
            }

            const profiler = this;
            const config = options || {};
            let callCount = 0;

            const wrapped = function (...args) {
                if (!profiler.active) {
                    return original.apply(this, args);
                }

                const elementId = profiler.resolveElementId(
                    args,
                    config.elementId
                );
                const session = profiler.ensureSession(elementId);

                if (!session) {
                    return original.apply(this, args);
                }

                const hookStartedAt = profiler.now();
                callCount++;
                profiler.increment(
                    elementId,
                    `${config.name || methodName}.calls`
                );

                const sampleEvery = Math.max(1, Number(config.sampleEvery) || 1);
                const shouldMeasure =
                    config.deepOnly !== true || profiler.mode === "deep";
                const sampled = shouldMeasure && callCount % sampleEvery === 0;
                const beforeContext =
                    typeof config.before === "function"
                        ? config.before(args, this, session)
                        : null;
                profiler.trackProfilerWork(
                    session,
                    `profiler.wrapper.before.${config.name || methodName}`,
                    hookStartedAt
                );

                const operationStartedAt = profiler.now();
                let result;

                try {
                    result = original.apply(this, args);
                } catch (error) {
                    const callbackStartedAt = profiler.now();
                    profiler.recordDuration(
                        elementId,
                        `${config.name || methodName}.failed`,
                        profiler.now() - operationStartedAt,
                        { message: error?.message || String(error), alwaysTimeline: true },
                        config.internal === true
                    );
                    profiler.trackProfilerWork(
                        session,
                        `profiler.wrapper.error.${config.name || methodName}`,
                        callbackStartedAt
                    );
                    throw error;
                }

                const complete = (value, failed) => {
                    const callbackStartedAt = profiler.now();
                    const duration = profiler.now() - operationStartedAt;

                    if (sampled) {
                        let metadata = null;

                        if (typeof config.metadata === "function") {
                            try {
                                metadata = config.metadata(
                                    args,
                                    value,
                                    beforeContext,
                                    session
                                );
                            } catch {
                                metadata = null;
                            }
                        }

                        if (failed) {
                            metadata = {
                                ...(metadata || {}),
                                message: value?.message || String(value),
                                alwaysTimeline: true
                            };
                        }

                        profiler.recordDuration(
                            elementId,
                            failed
                                ? `${config.name || methodName}.failed`
                                : config.name || methodName,
                            duration,
                            metadata,
                            config.internal === true
                        );
                    }

                    if (typeof config.after === "function") {
                        try {
                            config.after(
                                args,
                                value,
                                beforeContext,
                                duration,
                                session,
                                failed
                            );
                        } catch {
                        }
                    }

                    profiler.trackProfilerWork(
                        session,
                        `profiler.wrapper.after.${config.name || methodName}`,
                        callbackStartedAt
                    );
                    return value;
                };

                if (result && typeof result.then === "function") {
                    return Promise.resolve(result).then(
                        value => complete(value, false),
                        error => {
                            complete(error, true);
                            throw error;
                        }
                    );
                }

                return complete(result, false);
            };

            wrapped.__udsFinalPerfWrapper = true;
            wrapped.__udsFinalPerfOriginal = original;
            target[methodName] = wrapped;
            this.wrappers.push({ target, methodName, original, wrapped });
            return true;
        },

        restoreWrappers: function () {
            for (let index = this.wrappers.length - 1; index >= 0; index--) {
                const item = this.wrappers[index];

                if (item.target?.[item.methodName] === item.wrapped) {
                    item.target[item.methodName] = item.original;
                }
            }

            this.wrappers = [];
        },

        wrapApplicationMethods: function () {
            const target = window.tabulatorTest;

            if (!target) {
                window.setTimeout(() => {
                    if (this.active) {
                        this.wrapApplicationMethods();
                    }
                }, 25);
                return;
            }

            const readRangeShape = range => {
                let rows = 0;
                let columns = 0;

                try {
                    const rangeRows = range?.getRows?.();
                    const rangeColumns = range?.getColumns?.();
                    rows = Array.isArray(rangeRows) ? rangeRows.length : 0;
                    columns = Array.isArray(rangeColumns)
                        ? rangeColumns.length
                        : 0;
                } catch {
                    rows = 0;
                    columns = 0;
                }

                return {
                    rows,
                    columns,
                    cells: rows * columns
                };
            };

            const readActiveRangeShape = elementId => {
                const table = target.tables?.[elementId];
                const range = target.getActiveRange?.(table);
                return readRangeShape(range);
            };

            const readTransaction = (elementId, stackName) => {
                const state = target.states?.[elementId];
                const stack = state?.[stackName];
                const transaction = Array.isArray(stack) && stack.length > 0
                    ? stack[stack.length - 1]
                    : null;

                return {
                    transactionKind: transaction?.kind || "cells",
                    transactionType: transaction?.type || null,
                    transactionAction: transaction?.action || null,
                    label: transaction?.label || null,
                    rows: Array.isArray(transaction?.rows)
                        ? transaction.rows.length
                        : 0,
                    cells: Array.isArray(transaction?.changes)
                        ? transaction.changes.length
                        : 0
                };
            };

            const commonSample = metadata => ({
                ...(metadata || {}),
                captureSample: true,
                alwaysTimeline: true
            });

            const definitions = [
                { method: "validateRows", name: "validation.rows" },
                { method: "refreshIdentityDuplicateErrors", name: "validation.duplicates" },
                { method: "refreshDirtyRows", name: "dirty.refresh" },
                { method: "validateBeforeSave", name: "save.validate" },
                {
                    method: "copyActiveRange",
                    name: "clipboard.copy",
                    before: args => ({
                        ...readActiveRangeShape(args?.[0] || DEFAULT_TABLE_ID)
                    }),
                    metadata: (_args, value, before) =>
                        commonSample({
                            ...before,
                            copied: value === true || Boolean(value)
                        })
                },
                {
                    method: "pasteClipboardText",
                    name: "clipboard.paste.total",
                    before: args => {
                        const text = typeof args?.[1] === "string"
                            ? args[1]
                            : "";
                        return {
                            ...readActiveRangeShape(args?.[0] || DEFAULT_TABLE_ID),
                            clipboardCharacters: text.length,
                            clipboardLines: text
                                ? text.split(/\r\n|\n|\r/).length
                                : 0
                        };
                    },
                    metadata: (_args, value, before) =>
                        commonSample({
                            ...before,
                            accepted: Boolean(value),
                            consoleSummary: true
                        })
                },
                {
                    method: "applyRangePaste",
                    name: "clipboard.paste.apply",
                    before: args => {
                        const source = Array.isArray(args?.[2])
                            ? args[2]
                            : [];
                        return {
                            ...readActiveRangeShape(args?.[0] || DEFAULT_TABLE_ID),
                            sourceRows: source.length,
                            sourceColumns: source.reduce(
                                (maximum, row) =>
                                    Math.max(
                                        maximum,
                                        Array.isArray(row) ? row.length : 0
                                    ),
                                0
                            )
                        };
                    },
                    metadata: (_args, value, before) =>
                        commonSample({
                            ...before,
                            affectedRows: Array.isArray(value) ? value.length : null
                        })
                },
                {
                    method: "clearActiveRangeContents",
                    name: "range.clear",
                    before: args => readRangeShape(args?.[1]),
                    metadata: (_args, value, before) =>
                        commonSample({
                            ...before,
                            changedCells: Number(value) || 0,
                            consoleSummary: true
                        })
                },
                { method: "runCellMutationBatch", name: "cells.batch" },
                {
                    method: "applyFieldChangesBatch",
                    name: "fields.batch-apply",
                    before: args => ({
                        requestedCells: Array.isArray(args?.[1])
                            ? args[1].length
                            : 0
                    }),
                    metadata: (_args, value, before) =>
                        commonSample({
                            ...before,
                            appliedCells: Array.isArray(value)
                                ? value.length
                                : 0,
                            consoleSummary: true
                        })
                },
                {
                    method: "insertRows",
                    name: "structure.insert",
                    before: args => ({
                        requestedRows: Number(args?.[1]) || 0,
                        position: args?.[2] || null
                    }),
                    metadata: (_args, _value, before) =>
                        commonSample({ ...before, consoleSummary: true })
                },
                {
                    method: "deleteSelectedRows",
                    name: "structure.delete",
                    before: args => {
                        const range = readActiveRangeShape(
                            args?.[0] || DEFAULT_TABLE_ID
                        );
                        return { selectedRows: range.rows };
                    },
                    metadata: (_args, _value, before) =>
                        commonSample({ ...before, consoleSummary: true })
                },
                {
                    method: "deleteRowsWithSingleRedraw",
                    name: "structure.delete-redraw",
                    before: args => ({
                        rows: Array.isArray(args?.[1]) ? args[1].length : 0,
                        stage: args?.[2] || null
                    }),
                    metadata: (_args, _value, before) => commonSample(before)
                },
                {
                    method: "restoreStructureRowsIncrementally",
                    name: "structure.restore",
                    before: args => ({
                        rows: Array.isArray(args?.[1]) ? args[1].length : 0
                    }),
                    metadata: (_args, value, before) =>
                        commonSample({ ...before, restored: Boolean(value) })
                },
                {
                    method: "applyStructureTransaction",
                    name: "structure.apply-history",
                    before: args => ({
                        direction: args?.[2] || null,
                        transactionAction: args?.[1]?.action || null,
                        rows: Array.isArray(args?.[1]?.rows)
                            ? args[1].rows.length
                            : 0
                    }),
                    metadata: (_args, _value, before) => commonSample(before)
                },
                { method: "replaceStructureData", name: "structure.replace-all" },
                { method: "recalculateStructureState", name: "structure.recalculate" },
                {
                    method: "undo",
                    name: "history.undo",
                    before: args =>
                        readTransaction(
                            args?.[0] || DEFAULT_TABLE_ID,
                            "undoStack"
                        ),
                    metadata: (_args, _value, before) =>
                        commonSample({ ...before, consoleSummary: true })
                },
                {
                    method: "redo",
                    name: "history.redo",
                    before: args =>
                        readTransaction(
                            args?.[0] || DEFAULT_TABLE_ID,
                            "redoStack"
                        ),
                    metadata: (_args, _value, before) =>
                        commonSample({ ...before, consoleSummary: true })
                },
                {
                    method: "applyTransactionValues",
                    name: "history.apply-values",
                    before: args => ({
                        valueKey: args?.[2] || null,
                        cells: Array.isArray(args?.[1]?.changes)
                            ? args[1].changes.length
                            : 0,
                        transactionType: args?.[1]?.type || null
                    }),
                    metadata: (_args, _value, before) => commonSample(before)
                },
                { method: "pushTransaction", name: "history.push" },
                { method: "pushStructureTransaction", name: "history.push-structure" },
                { method: "filterByWorkOrder", name: "filters.search" },
                { method: "getDirtyRows", name: "save.collect-dirty" },
                { method: "getDeletedRows", name: "save.collect-deleted" },
                {
                    method: "applySavedDelta",
                    name: "save.apply-delta",
                    before: args => ({
                        savedRows: Array.isArray(args?.[1]) ? args[1].length : 0,
                        mappings: Array.isArray(args?.[2]) ? args[2].length : 0
                    }),
                    metadata: (_args, _value, before) => commonSample(before)
                },
                { method: "correctArrowUpRangeViewport", name: "keyboard.arrow-up-correction" },
                { method: "queueArrowUpRangeViewportCorrection", name: "keyboard.arrow-up-queue" }
            ];

            for (const definition of definitions) {
                this.wrapMethod(target, definition.method, {
                    name: definition.name,
                    before: definition.before,
                    metadata: definition.metadata
                });
            }

            this.wrapMethod(target, "setSaving", {
                name: "save.set-state",
                before: (args, _context, session) => {
                    if (Boolean(args?.[1])) {
                        session.pendingSaveStartedAt = this.now();
                    }
                    return null;
                },
                after: (args, _value, _before, _duration, session) => {
                    if (
                        !Boolean(args?.[1]) &&
                        Number.isFinite(session.pendingSaveStartedAt)
                    ) {
                        this.recordDuration(
                            args?.[0] || DEFAULT_TABLE_ID,
                            "save.end-to-end",
                            this.now() - session.pendingSaveStartedAt,
                            { alwaysTimeline: true },
                            false
                        );
                        session.pendingSaveStartedAt = null;
                    }
                }
            });

            this.wrapFilterMethods();

            this.wrapMethod(target, "initialize", {
                name: "initialize.total",
                before: (args, _context, session) => {
                    session.initializationStartedAt = this.now();
                    session.rowCount = Array.isArray(args?.[1])
                        ? args[1].length
                        : null;
                    return null;
                },
                metadata: args => ({
                    rows: Array.isArray(args?.[1]) ? args[1].length : null,
                    alwaysTimeline: true
                }),
                after: args => {
                    const id = args?.[0] || DEFAULT_TABLE_ID;
                    this.attachWhenReady(id);
                }
            });
        },

        wrapFilterMethods: function () {
            const filters = window.tabulatorFilters;

            if (!filters) {
                return;
            }

            const definitions = [
                ["getUniqueValues", "filters.unique-values"],
                ["createValuePopup", "filters.open-value-popup"],
                ["createDatePopup", "filters.open-date-popup"],
                ["createAmountPopup", "filters.open-amount-popup"],
                ["apply", "filters.apply"],
                ["refreshFields", "filters.refresh-fields"],
                ["updateAllIcons", "filters.update-icons"]
            ];

            for (const [methodName, metricName] of definitions) {
                this.wrapMethod(filters, methodName, {
                    name: metricName,
                    elementId: args =>
                        typeof args?.[1] === "string"
                            ? args[1]
                            : DEFAULT_TABLE_ID
                });
            }
        },

        wrapDeepInternals: function (elementId, table) {
            if (this.mode !== "deep" && this.mode !== "trace") {
                return;
            }

            const rowManager = table?.rowManager;
            const renderer = rowManager?.renderer;
            const range = table?.modules?.selectRange;

            const wrapDefinitions = (target, prefix, definitions) => {
                for (const [method, suffix, sampleEvery] of definitions) {
                    this.wrapMethod(target, method, {
                        name: `${prefix}.${suffix}`,
                        elementId: elementId,
                        sampleEvery: sampleEvery,
                        internal: true,
                        deepOnly: this.mode === "deep"
                    });
                }
            };

            if (this.mode === "trace") {
                wrapDefinitions(rowManager, "tabulator.row-manager", [
                    ["reRenderInPosition", "rerender-in-position", 1],
                    ["scrollToRow", "scroll-to-row", 1],
                    ...(ARROW_DIAG_ENABLED
                        ? [
                            ["getRowFromPosition", "get-row-from-position", 1],
                            ["renderTable", "render-table", 1]
                        ]
                        : [])
                ]);
                wrapDefinitions(renderer, "tabulator.renderer", [
                    ["scrollRows", "scroll-rows", 1],
                    ["scrollToRowPosition", "scroll-to-row-position", 1],
                    ...(ARROW_DIAG_ENABLED
                        ? [
                            ["render", "render", 1],
                            ["renderRows", "render-rows", 1],
                            ["rerenderRows", "rerender-rows", 1],
                            ["_virtualRenderFill", "virtual-render-fill", 1],
                            ["_addTopRow", "add-top-row", 1],
                            ["_removeBottomRow", "remove-bottom-row", 1],
                            ["_addBottomRow", "add-bottom-row", 1],
                            ["_removeTopRow", "remove-top-row", 1]
                        ]
                        : [])
                ]);
                wrapDefinitions(range, "tabulator.range", [
                    ["navigate", "navigate", 1],
                    ["layoutRanges", "layout-ranges", 1],
                    ["layoutElement", "layout-element", 1],
                    ...(ARROW_DIAG_ENABLED
                        ? [
                            ["autoScroll", "auto-scroll", 1],
                            ["getActiveCell", "get-active-cell", 1],
                            ["getCell", "get-cell", 1],
                            ["getTableRows", "get-table-rows", 1],
                            ["getRowByRangePos", "get-row-by-range-pos", 1]
                        ]
                        : [])
                ]);
                return;
            }

            wrapDefinitions(rowManager, "tabulator.row-manager", [
                ["refreshActiveData", "refresh-active-data", 1],
                ["renderTable", "render-table", 2],
                ["reRenderInPosition", "rerender-in-position", 2],
                ["setData", "set-data", 1],
                ["regenerateRowPositions", "regenerate-row-positions", 2],
                ["scrollToRow", "scroll-to-row", 1]
            ]);

            wrapDefinitions(renderer, "tabulator.renderer", [
                ["render", "render", 2],
                ["renderRows", "render-rows", 4],
                ["rerenderRows", "rerender-rows", 4],
                ["scrollRows", "scroll-rows", 4],
                ["scrollToRowPosition", "scroll-to-row-position", 2]
            ]);

            wrapDefinitions(range, "tabulator.range", [
                ["navigate", "navigate", 1],
                ["autoScroll", "auto-scroll", 1],
                ["layoutRanges", "layout-ranges", 4],
                ["layoutElement", "layout-element", 10],
                ["addRange", "add-range", 1],
                ["removeRange", "remove-range", 1]
            ]);
        },

        attachWhenReady: function (elementId, attempts) {
            if (!this.active) {
                return;
            }

            const remaining = Number.isInteger(attempts) ? attempts : 240;
            const table = window.tabulatorTest?.tables?.[elementId];
            const holder = table?.element?.querySelector?.(".tabulator-tableholder");

            if (!table || !holder) {
                if (remaining > 1) {
                    this.attachTimer = window.setTimeout(
                        () => this.attachWhenReady(elementId, remaining - 1),
                        25
                    );
                }
                return;
            }

            this.attach(elementId, table, holder);
        },

        attach: function (elementId, table, holder) {
            const existing = this.attachments.get(elementId);

            if (existing?.table === table && existing?.holder === holder) {
                this.captureFirstUsable(elementId, existing);
                return;
            }

            if (existing) {
                this.detach(elementId);
            }

            const attachment = {
                elementId: elementId,
                table: table,
                element: table.element,
                holder: holder,
                domHandlers: [],
                tableHandlers: [],
                mutationObserver: null,
                lastScrollTop: holder.scrollTop,
                lastScrollLeft: holder.scrollLeft,
                baselineScrollCounter: 0,
                baselineSampledScrollTop: holder.scrollTop,
                baselineSampledScrollLeft: holder.scrollLeft,
                lastScrollAt: 0,
                scrollIdleTimer: null,
                scrollSession: null,
                lastContextAt: 0,
                cachedContext: null,
                contextRaf: null,
                interactionCounts: new Map(),
                lastMutationDetailAt: 0,
                firstUsableRecorded: false,
                tracePointer: null
            };

            this.attachments.set(elementId, attachment);
            const session = this.ensureSession(elementId);

            if (session && session.dom.start === null) {
                session.dom.start = this.captureDomSnapshot(elementId);
                session.tableOptions = this.captureTableOptions(table);
            }

            this.attachDomHandlers(elementId, attachment);
            this.attachTableEvents(elementId, attachment);
            this.wrapDeepInternals(elementId, table);

            if (this.mode === "deep") {
                this.attachMutationObserver(elementId, attachment);
                this.captureViewportContext(elementId, attachment, true);
            }

            this.captureFirstUsable(elementId, attachment);
        },

        captureFirstUsable: function (elementId, attachment) {
            const session = this.ensureSession(elementId);

            if (!session || session.firstUsableAt !== null) {
                return;
            }

            const hasVisibleRow =
                attachment.holder.querySelector(".tabulator-row") !== null;

            if (!hasVisibleRow) {
                window.setTimeout(() => {
                    if (this.active) {
                        this.captureFirstUsable(elementId, attachment);
                    }
                }, 25);
                return;
            }

            session.firstUsableAt = this.now();
            session.firstUsableMsFromInitialize =
                session.initializationStartedAt === null
                    ? null
                    : round(session.firstUsableAt - session.initializationStartedAt);
            session.firstUsableMsFromSessionStart = round(
                session.firstUsableAt - session.startedAt
            );
            this.increment(elementId, "grid.first-usable");
            this.recordMemorySample(elementId, "grid-first-usable");
            this.addTimeline(elementId, {
                type: "grid-first-usable",
                durationMs: session.firstUsableMsFromInitialize,
                rows: session.rowCount
            });
        },

        addDomHandler: function (attachment, target, eventName, handler, options) {
            target?.addEventListener?.(eventName, handler, options);
            attachment.domHandlers.push({ target, eventName, handler, options });
        },

        isInsideTable: function (attachment, event) {
            const target = event?.target;

            if (target instanceof Node && attachment.element.contains(target)) {
                return true;
            }

            const activeElement = document.activeElement;

            if (activeElement instanceof Node && attachment.element.contains(activeElement)) {
                return true;
            }

            return window.tabulatorTest?.states?.[attachment.elementId]?.isActive === true;
        },

        classifyKeyDirection: function (key) {
            if (key === "ArrowUp" || key === "PageUp") {
                return "up";
            }

            if (key === "ArrowDown" || key === "PageDown") {
                return "down";
            }

            if (key === "ArrowLeft") {
                return "left";
            }

            if (key === "ArrowRight") {
                return "right";
            }

            return "none";
        },

        noteInput: function (elementId, type, detail, direction) {
            const session = this.ensureSession(elementId);

            if (!session) {
                return;
            }

            const inputSequence = this.mode === "trace"
                ? ++session.trace.inputSequence
                : null;

            session.lastInput = {
                type: type || "unknown",
                detail: detail || "unknown",
                direction: direction || "none",
                at: this.now(),
                sequence: inputSequence
            };
            if (ARROW_DIAG_ENABLED) {
                this.createArrowDiagnosticWindow(session, session.lastInput);
            }
            this.increment(elementId, `input.${session.lastInput.type}.${session.lastInput.detail}`);
            const bucket = this.ensureTimeBucket(session, session.lastInput.at);

            if (bucket) {
                incrementCount(
                    bucket.inputs,
                    `${session.lastInput.type}.${session.lastInput.detail}`,
                    1
                );
            }
        },

        shouldMeasureInteraction: function (attachment, key) {
            const count = (attachment.interactionCounts.get(key) || 0) + 1;
            attachment.interactionCounts.set(key, count);

            if (this.mode === "deep" || this.mode === "trace") {
                return true;
            }

            return count <= BASELINE_SAMPLE_FIRST || count % BASELINE_SAMPLE_EVERY === 0;
        },

        pushTraceEvent: function (elementId, type, detail) {
            if (this.mode !== "trace") {
                return;
            }

            const session = this.ensureSession(elementId);

            if (!session) {
                return;
            }

            if (session.trace.events.length >= MAX_TRACE_EVENTS) {
                session.trace.events.shift();
                session.trace.droppedEvents++;
            }

            session.trace.events.push({
                atMs: round(this.now() - session.startedAt),
                type: type || "unknown",
                ...(detail || {})
            });
        },

        captureTraceContext: function (elementId, attachment, includeGeometry) {
            if (this.mode !== "trace") {
                return null;
            }

            const table = attachment.table;
            const holder = attachment.holder;
            const state = window.tabulatorTest?.states?.[elementId] || null;
            const activeRange = window.tabulatorTest?.getActiveRange?.(table) || null;
            const activeCell = this.getActiveCellComponent(table);
            const activeRow = activeCell?.getRow?.();
            const activePosition = this.getRowPosition(activeRow);
            const cellElement = activeCell?.getElement?.();
            const activeColumn = activeCell?.getColumn?.();
            const activeField = activeColumn?.getField?.() ?? state?.activeCell?.field ?? null;
            const activeRowKey = activeRow?.getIndex?.() ?? null;
            let selected = null;
            let intersectsViewport = null;

            if (cellElement instanceof Element) {
                selected =
                    cellElement.classList.contains("tabulator-range-selected") ||
                    cellElement.classList.contains("tabulator-range-only-cell-selected");

                if (includeGeometry === true) {
                    if (cellElement.isConnected) {
                        const cellBounds = cellElement.getBoundingClientRect();
                        const holderBounds = holder.getBoundingClientRect();
                        intersectsViewport =
                            cellBounds.bottom > holderBounds.top + 1 &&
                            cellBounds.top < holderBounds.bottom - 1 &&
                            cellBounds.right > holderBounds.left + 1 &&
                            cellBounds.left < holderBounds.right - 1;
                    } else {
                        intersectsViewport = false;
                    }
                }
            }

            const connected = Boolean(cellElement?.isConnected);
            const hasActiveRange = Boolean(activeRange);
            const bounds = activeRange?.getBounds?.() || null;
            const startCell = bounds?.start || null;
            const endCell = bounds?.end || null;
            const startRow = startCell?.getRow?.();
            const endRow = endCell?.getRow?.();
            const startRowPosition = this.getRowPosition(startRow);
            const endRowPosition = this.getRowPosition(endRow);
            const columns = table?.getColumns?.() || [];
            const startColumn = startCell?.getColumn?.();
            const endColumn = endCell?.getColumn?.();
            const startColumnPosition = startColumn ? columns.indexOf(startColumn) + 1 : null;
            const endColumnPosition = endColumn ? columns.indexOf(endColumn) + 1 : null;
            const rangeRowCount =
                Number.isFinite(startRowPosition) && Number.isFinite(endRowPosition)
                    ? Math.abs(endRowPosition - startRowPosition) + 1
                    : null;
            const rangeColumnCount =
                Number.isFinite(startColumnPosition) && Number.isFinite(endColumnPosition)
                    ? Math.abs(endColumnPosition - startColumnPosition) + 1
                    : null;
            const safety =
                !hasActiveRange ||
                (connected &&
                    selected === true &&
                    (includeGeometry !== true || intersectsViewport === true));

            return {
                activeRow: activePosition,
                activeRowKey,
                stateActiveRowId: state?.activeCell?.rowId ?? null,
                activeField,
                hasActiveRange,
                activeCellConnected: connected,
                activeCellSelected: selected,
                activeCellInViewport: intersectsViewport,
                selectionSafe: safety,
                rangeStartRow: startRowPosition,
                rangeEndRow: endRowPosition,
                rangeStartColumn: startColumnPosition,
                rangeEndColumn: endColumnPosition,
                rangeRows: rangeRowCount,
                rangeColumns: rangeColumnCount,
                rangeCells:
                    Number.isFinite(rangeRowCount) && Number.isFinite(rangeColumnCount)
                        ? rangeRowCount * rangeColumnCount
                        : null,
                dirtyRows: state?.dirtyRowIds?.size ?? 0,
                deletedRows: state?.deletedOriginalRowIds?.size ?? 0,
                undoDepth: state?.undoStack?.length ?? 0,
                redoDepth: state?.redoStack?.length ?? 0,
                logicalRows: table?.getDataCount?.("active") ?? table?.getDataCount?.() ?? null,
                visibleColumns: columns.length,
                scrollTop: round(holder.scrollTop),
                scrollLeft: round(holder.scrollLeft),
                renderedRows: attachment.element.querySelectorAll(".tabulator-row").length,
                rangeElements: attachment.element.querySelectorAll(".tabulator-range").length
            };
        },

        beginTraceAction: function (elementId, name, inputSequence) {
            if (this.mode !== "trace") {
                return null;
            }

            const session = this.ensureSession(elementId);
            if (!session) return null;

            const id = session.trace.nextActionId++;
            session.trace.currentActionId = id;
            session.trace.pendingActions.set(id, {
                id,
                name,
                inputSequence: inputSequence ?? session.trace.inputSequence,
                startedAt: this.now(),
                internal: new Map(),
                operations: new Map()
            });

            // Keep synchronous Tabulator work tied to this exact browser input task.
            // The document keydown listener runs in capture phase; Tabulator handles
            // the same event later in the same task, before this microtask clears it.
            queueMicrotask(() => {
                if (session.trace.currentActionId === id) {
                    session.trace.currentActionId = null;
                }
            });

            return id;
        },

        noteTraceActionDuration: function (session, name, durationMs, internal) {
            if (this.mode !== "trace" || !session || !Number.isFinite(durationMs)) {
                return;
            }

            const id = session.trace.currentActionId;
            const action = id ? session.trace.pendingActions.get(id) : null;
            if (!action) return;

            const map = internal ? action.internal : action.operations;
            let metric = map.get(name);
            if (!metric) {
                metric = { count: 0, totalMs: 0, maxMs: 0 };
                map.set(name, metric);
            }
            metric.count++;
            metric.totalMs += durationMs;
            metric.maxMs = Math.max(metric.maxMs, durationMs);
        },

        finishTraceAction: function (elementId, actionId) {
            if (this.mode !== "trace" || !actionId) return null;
            const session = this.sessions.get(elementId);
            const action = session?.trace?.pendingActions?.get(actionId);
            if (!session || !action) return null;

            session.trace.pendingActions.delete(actionId);
            if (session.trace.currentActionId === actionId) {
                session.trace.currentActionId = null;
            }

            const serialize = map => Array.from(map.entries())
                .map(([name, metric]) => ({
                    name,
                    count: metric.count,
                    totalMs: round(metric.totalMs),
                    maxMs: round(metric.maxMs)
                }))
                .sort((a, b) => b.totalMs - a.totalMs);

            return {
                actionId,
                actionName: action.name,
                inputSequence: action.inputSequence,
                elapsedMs: round(this.now() - action.startedAt),
                internal: serialize(action.internal),
                operations: serialize(action.operations)
            };
        },

        enforceTraceSelectionSafety: function (elementId, name, context, superseded) {
            if (this.mode !== "trace" || !context?.hasActiveRange) {
                return;
            }

            const keyboardNavigation = /^keyboard\.(?:(?:ctrl|shift)\+)?(?:ArrowUp|ArrowDown|ArrowLeft|ArrowRight|PageUp|PageDown|Home|End)$/.test(name || "");
            if (!keyboardNavigation) return;

            const session = this.sessions.get(elementId);
            if (!session) return;

            const safety = session.trace.selectionSafety;
            if (superseded === true) {
                safety.supersededChecksSkipped++;
                return;
            }

            safety.checks++;
            if (context.selectionSafe === true) return;

            safety.failures++;
            if (context.activeCellConnected !== true) safety.disconnected++;
            if (context.activeCellSelected !== true) safety.notSelected++;
            if (context.activeCellInViewport !== true) safety.outsideViewport++;

            this.pushTraceEvent(elementId, "safety", {
                name: "selection-lost",
                interaction: name,
                activeRow: context.activeRow,
                activeRowKey: context.activeRowKey,
                stateActiveRowId: context.stateActiveRowId,
                activeField: context.activeField
            });
        },

        snapshotReactionCounters: function (elementId, attachment) {
            const session = this.sessions.get(elementId);

            return {
                scrollEvents: session?.scroll?.events || 0,
                scrollTop: attachment.holder.scrollTop,
                scrollLeft: attachment.holder.scrollLeft,
                tableEvents: session
                    ? Object.fromEntries(session.tableEvents)
                    : {}
            };
        },

        reactionDelta: function (before, after) {
            if (!before || !after) {
                return null;
            }

            const tableEvents = {};
            const names = new Set([
                ...Object.keys(before.tableEvents || {}),
                ...Object.keys(after.tableEvents || {})
            ]);

            for (const name of names) {
                const delta =
                    (after.tableEvents?.[name] || 0) -
                    (before.tableEvents?.[name] || 0);
                if (delta !== 0) tableEvents[name] = delta;
            }

            return {
                scrollEvents: after.scrollEvents - before.scrollEvents,
                scrollTopDelta: round(after.scrollTop - before.scrollTop),
                scrollLeftDelta: round(after.scrollLeft - before.scrollLeft),
                tableEvents
            };
        },

        schedulePaintProbe: function (elementId, attachment, name, metadata) {
            const session = this.ensureSession(elementId);

            if (!session) {
                return;
            }

            if (!this.shouldMeasureInteraction(attachment, name)) {
                session.profiler.skippedInteractions++;
                return;
            }

            session.profiler.sampledInteractions++;
            const traceInputSequence =
                this.mode === "trace"
                    ? session.lastInput?.sequence ?? session.trace.inputSequence
                    : null;
            const traceActionId = this.beginTraceAction(
                elementId,
                name,
                traceInputSequence
            );
            const startedAt = this.now();
            const contextBefore =
                this.mode === "deep"
                    ? this.captureViewportContext(elementId, attachment, false)
                    : this.mode === "trace"
                        ? this.captureTraceContext(elementId, attachment, false)
                        : null;
            const reactionBefore =
                this.mode === "trace"
                    ? this.snapshotReactionCounters(elementId, attachment)
                    : null;
            const arrowDiagWindow =
                ARROW_DIAG_ENABLED && traceInputSequence !== null
                    ? this.getArrowDiagnosticWindow(session, traceInputSequence)
                    : null;
            if (arrowDiagWindow) {
                arrowDiagWindow.repeat = metadata?.repeat === true;
                arrowDiagWindow.contextBefore = contextBefore;
            }

            window.requestAnimationFrame(firstFrameAt => {
                const firstRafCallbackAt = this.now();
                window.requestAnimationFrame(secondFrameAt => {
                    if (!this.active) {
                        return;
                    }

                    const callbackStartedAt = this.now();
                    const inputToPaintMs = this.now() - startedAt;
                    const frameGapMs = secondFrameAt - firstFrameAt;
                    if (arrowDiagWindow) {
                        arrowDiagWindow.paintProbe = {
                            inputToSecondRafMs: round(inputToPaintMs),
                            inputToFirstRafCallbackMs: round(firstRafCallbackAt - startedAt),
                            firstToSecondFrameMs: round(frameGapMs),
                            firstFrameTimestampMs: round(firstFrameAt - startedAt),
                            secondFrameTimestampMs: round(secondFrameAt - startedAt)
                        };
                    }
                    const superseded =
                        this.mode === "trace" &&
                        traceInputSequence !== null &&
                        session.trace.inputSequence !== traceInputSequence;
                    const keyboardNavigation =
                        /^keyboard\.(?:(?:ctrl|shift)\+)?(?:ArrowUp|ArrowDown|ArrowLeft|ArrowRight|PageUp|PageDown|Home|End)$/.test(name || "");
                    const contextAfter =
                        this.mode === "deep"
                            ? this.captureViewportContext(elementId, attachment, true)
                            : this.mode === "trace"
                                ? this.captureTraceContext(
                                    elementId,
                                    attachment,
                                    keyboardNavigation && !superseded
                                )
                                : null;
                    const reactionAfter =
                        this.mode === "trace"
                            ? this.snapshotReactionCounters(elementId, attachment)
                            : null;
                    const reaction = this.mode === "trace"
                        ? this.reactionDelta(reactionBefore, reactionAfter)
                        : null;
                    if (this.mode === "trace") {
                        this.enforceTraceSelectionSafety(
                            elementId,
                            name,
                            contextAfter,
                            superseded
                        );
                    }
                    const actionBreakdown = this.finishTraceAction(
                        elementId,
                        traceActionId
                    );
                    if (arrowDiagWindow) {
                        arrowDiagWindow.contextAfter = contextAfter;
                        arrowDiagWindow.reaction = reaction;
                        arrowDiagWindow.actionBreakdown = actionBreakdown;
                    }

                    this.recordInteraction(elementId, {
                        name: name,
                        inputToPaintMs: inputToPaintMs,
                        frameGapMs: frameGapMs,
                        metadata: this.mode === "trace"
                            ? { ...(metadata || {}), superseded }
                            : metadata || null,
                        contextBefore: contextBefore,
                        contextAfter: contextAfter,
                        reaction: reaction,
                        actionBreakdown: actionBreakdown
                    });
                    this.trackProfilerWork(
                        session,
                        "profiler.paint-probe-complete",
                        callbackStartedAt
                    );
                });
            });
        },

        recordInteraction: function (elementId, item) {
            const session = this.ensureSession(elementId);

            if (!session || !item) {
                return;
            }

            const metric = addDuration(
                session.interactionMetrics,
                item.name,
                item.inputToPaintMs,
                true
            );
            metric.frameGapSamples = metric.frameGapSamples || [];
            metric.frameGapSamples.push(item.frameGapMs);
            const timeBucket = this.ensureTimeBucket(session, this.now());

            if (timeBucket) {
                const bucketMetric = addDuration(
                    timeBucket.interactions,
                    item.name,
                    item.inputToPaintMs,
                    true
                );
                bucketMetric.frameGapSamples = bucketMetric.frameGapSamples || [];
                bucketMetric.frameGapSamples.push(item.frameGapMs);

                if (bucketMetric.frameGapSamples.length > MAX_SAMPLES_PER_METRIC) {
                    bucketMetric.frameGapSamples.shift();
                }
            }

            if (metric.frameGapSamples.length > MAX_SAMPLES_PER_METRIC) {
                metric.frameGapSamples.shift();
            }

            const context = item.contextAfter || item.contextBefore;
            const bandKey = context?.band || "unknown";
            const bucket = this.ensureBand(session, bandKey);
            bucket.interactionCount++;
            bucket.inputToPaintMs.push(item.inputToPaintMs);
            bucket.frameGapMs.push(item.frameGapMs);

            if (bucket.inputToPaintMs.length > MAX_SAMPLES_PER_METRIC) {
                bucket.inputToPaintMs.shift();
            }

            if (bucket.frameGapMs.length > MAX_SAMPLES_PER_METRIC) {
                bucket.frameGapMs.shift();
            }

            if (item.name.startsWith("keyboard.")) {
                bucket.keyCount++;
            }

            if ((context?.hiddenAbovePx || 0) > 2) {
                bucket.hiddenAboveCount++;
                bucket.maxHiddenAbovePx = Math.max(
                    bucket.maxHiddenAbovePx,
                    context.hiddenAbovePx
                );
            }

            if ((context?.hiddenBelowPx || 0) > 2) {
                bucket.hiddenBelowCount++;
                bucket.maxHiddenBelowPx = Math.max(
                    bucket.maxHiddenBelowPx,
                    context.hiddenBelowPx
                );
            }

            if (this.mode === "deep" || this.mode === "trace") {
                pushBounded(
                    session.interactions,
                    {
                        atMs: round(this.now() - session.startedAt),
                        name: item.name,
                        inputToPaintMs: round(item.inputToPaintMs),
                        frameGapMs: round(item.frameGapMs),
                        metadata: item.metadata,
                        contextBefore: item.contextBefore,
                        contextAfter: item.contextAfter,
                        reaction: item.reaction || null,
                        actionBreakdown: item.actionBreakdown || null
                    },
                    MAX_INTERACTIONS
                );
            }

            if (this.mode === "trace") {
                this.pushTraceEvent(elementId, "paint", {
                    name: item.name,
                    inputToPaintMs: round(item.inputToPaintMs),
                    frameGapMs: round(item.frameGapMs),
                    reaction: item.reaction || null,
                    selectionSafe: item.contextAfter?.selectionSafe ?? null,
                    actionBreakdown: item.actionBreakdown || null
                });
            }
        },

        attachDomHandlers: function (elementId, attachment) {
            const keydown = event => {
                if (!this.isInsideTable(attachment, event)) {
                    return;
                }

                const callbackStartedAt = this.now();
                const direction = this.classifyKeyDirection(event.key);
                const modifier = event.ctrlKey || event.metaKey
                    ? "ctrl+"
                    : event.shiftKey
                        ? "shift+"
                        : event.altKey
                            ? "alt+"
                            : "";
                const physicalKey = /^Key[A-Z]$/.test(event.code || "")
                    ? event.code.slice(3).toLowerCase()
                    : event.code === "Space"
                        ? "Space"
                        : event.key;
                const shortcutUsesPhysicalKey =
                    (event.ctrlKey || event.metaKey) && /^Key[A-Z]$/.test(event.code || "");
                const detailKey = shortcutUsesPhysicalKey ? physicalKey : event.key;
                const detail = `${modifier}${detailKey}`;
                this.noteInput(elementId, "keyboard", detail, direction);

                const measuredKeys = new Set([
                    "ArrowUp",
                    "ArrowDown",
                    "ArrowLeft",
                    "ArrowRight",
                    "PageUp",
                    "PageDown",
                    "Home",
                    "End",
                    "Enter",
                    "Tab",
                    "Escape",
                    "Delete",
                    "Backspace",
                    " ",
                    "a", "A", "c", "C", "v", "V", "x", "X",
                    "z", "Z", "y", "Y"
                ]);

                if (this.mode === "trace") {
                    this.pushTraceEvent(elementId, "input", {
                        source: "keyboard",
                        action: detail,
                        key: event.key,
                        code: event.code,
                        direction,
                        repeat: event.repeat === true,
                        target: describeEventTarget(event.target)
                    });
                }

                const measuredShortcut =
                    (event.ctrlKey || event.metaKey) &&
                    ["KeyA", "KeyC", "KeyV", "KeyX", "KeyZ", "KeyY"].includes(event.code);

                if (measuredKeys.has(event.key) || measuredShortcut) {
                    this.schedulePaintProbe(
                        elementId,
                        attachment,
                        `keyboard.${detail}`,
                        {
                            direction,
                            repeat: event.repeat === true,
                            target: describeEventTarget(event.target)
                        }
                    );
                }

                this.trackProfilerWork(
                    this.sessions.get(elementId),
                    "profiler.keydown-handler",
                    callbackStartedAt
                );
            };

            const wheel = event => {
                if (!this.isInsideTable(attachment, event)) {
                    return;
                }

                const callbackStartedAt = this.now();
                const vertical = Math.abs(event.deltaY) >= Math.abs(event.deltaX);
                const direction = vertical
                    ? (event.deltaY < 0 ? "up" : "down")
                    : (event.deltaX < 0 ? "left" : "right");
                const detail = vertical ? "wheel-vertical" : "wheel-horizontal";
                this.noteInput(elementId, "wheel", detail, direction);
                if (this.mode === "trace") {
                    this.pushTraceEvent(elementId, "input", {
                        source: "wheel",
                        action: detail,
                        direction,
                        deltaX: round(event.deltaX),
                        deltaY: round(event.deltaY)
                    });
                }
                this.schedulePaintProbe(
                    elementId,
                    attachment,
                    `wheel.${direction}`,
                    {
                        deltaX: round(event.deltaX),
                        deltaY: round(event.deltaY),
                        axis: vertical ? "vertical" : "horizontal"
                    }
                );
                this.trackProfilerWork(
                    this.sessions.get(elementId),
                    "profiler.wheel-handler",
                    callbackStartedAt
                );
            };

            const pointerdown = event => {
                if (!this.isInsideTable(attachment, event)) {
                    return;
                }

                const holderBounds =
                    this.mode === "deep"
                        ? attachment.holder.getBoundingClientRect()
                        : null;
                const nearVerticalScrollbar =
                    holderBounds !== null &&
                    event.clientX >= holderBounds.right - 24;
                this.noteInput(
                    elementId,
                    nearVerticalScrollbar ? "scrollbar" : "pointer",
                    event.pointerType || "pointer",
                    "none"
                );
                this.increment(elementId, "interaction.pointerdown");

                if (this.mode === "trace") {
                    attachment.tracePointer = {
                        startedAt: this.now(),
                        startX: event.clientX,
                        startY: event.clientY,
                        lastX: event.clientX,
                        lastY: event.clientY,
                        pointerType: event.pointerType || "pointer",
                        button: event.button,
                        target: describeEventTarget(event.target)
                    };
                    this.pushTraceEvent(elementId, "input", {
                        source: "pointer",
                        action: "down",
                        pointerType: event.pointerType || "pointer",
                        button: event.button,
                        target: describeEventTarget(event.target)
                    });
                }
            };

            const pointermove = event => {
                if (this.mode !== "trace" || !attachment.tracePointer) {
                    return;
                }

                attachment.tracePointer.lastX = event.clientX;
                attachment.tracePointer.lastY = event.clientY;
            };

            const pointerup = event => {
                if (this.mode !== "trace" || !attachment.tracePointer) {
                    return;
                }

                const gesture = attachment.tracePointer;
                attachment.tracePointer = null;
                const dx = event.clientX - gesture.startX;
                const dy = event.clientY - gesture.startY;
                const distance = Math.hypot(dx, dy);
                const durationMs = this.now() - gesture.startedAt;
                const action = distance >= 5 ? "drag" : "up";
                this.noteInput(elementId, "pointer", action, "none");
                this.pushTraceEvent(elementId, "input", {
                    source: "pointer",
                    action,
                    durationMs: round(durationMs),
                    distancePx: round(distance),
                    deltaX: round(dx),
                    deltaY: round(dy),
                    pointerType: gesture.pointerType,
                    button: gesture.button,
                    target: gesture.target
                });
                this.schedulePaintProbe(
                    elementId,
                    attachment,
                    `pointer.${action}`,
                    { durationMs: round(durationMs), distancePx: round(distance) }
                );
            };

            const click = event => {
                if (!this.isInsideTable(attachment, event)) {
                    return;
                }

                this.noteInput(elementId, "pointer", "click", "none");
                if (this.mode === "trace") {
                    this.pushTraceEvent(elementId, "input", {
                        source: "pointer", action: "click",
                        target: describeEventTarget(event.target)
                    });
                }
                this.schedulePaintProbe(elementId, attachment, "pointer.click");
            };

            const doubleClick = event => {
                if (!this.isInsideTable(attachment, event)) {
                    return;
                }

                this.noteInput(elementId, "pointer", "double-click", "none");
                if (this.mode === "trace") {
                    this.pushTraceEvent(elementId, "input", {
                        source: "pointer", action: "double-click",
                        target: describeEventTarget(event.target)
                    });
                }
                this.schedulePaintProbe(elementId, attachment, "pointer.double-click");
            };

            const contextMenu = event => {
                if (this.isInsideTable(attachment, event)) {
                    this.noteInput(elementId, "pointer", "context-menu", "none");
                    if (this.mode === "trace") {
                        this.pushTraceEvent(elementId, "input", {
                            source: "pointer", action: "context-menu",
                            target: describeEventTarget(event.target)
                        });
                    }
                    this.schedulePaintProbe(elementId, attachment, "pointer.context-menu");
                }
            };

            const copy = event => {
                if (this.isInsideTable(attachment, event)) {
                    this.noteInput(elementId, "clipboard", "copy", "none");
                    this.increment(elementId, "interaction.copy");
                    this.pushTraceEvent(elementId, "input", { source: "clipboard", action: "copy" });
                }
            };

            const paste = event => {
                if (this.isInsideTable(attachment, event)) {
                    this.noteInput(elementId, "clipboard", "paste", "none");
                    this.pushTraceEvent(elementId, "input", { source: "clipboard", action: "paste" });
                    this.schedulePaintProbe(elementId, attachment, "clipboard.paste-event");
                }
            };

            const input = event => {
                if (this.isInsideTable(attachment, event)) {
                    this.noteInput(elementId, "editor", "input", "none");
                    this.increment(elementId, "interaction.editor-input");
                    if (this.mode === "trace") {
                        this.pushTraceEvent(elementId, "input", {
                            source: "editor",
                            action: "input",
                            target: describeEventTarget(event.target)
                        });
                        this.schedulePaintProbe(
                            elementId, attachment, "editor.input",
                            { target: describeEventTarget(event.target) }
                        );
                    }
                }
            };

            const change = event => {
                if (this.isInsideTable(attachment, event)) {
                    this.noteInput(elementId, "editor", "change", "none");
                    this.pushTraceEvent(elementId, "input", {
                        source: "editor", action: "change",
                        target: describeEventTarget(event.target)
                    });
                    this.schedulePaintProbe(elementId, attachment, "editor.change");
                }
            };

            const scroll = () => {
                const handlerStartedAt = this.now();
                const session = this.ensureSession(elementId);

                if (!session) {
                    return;
                }

                if (this.mode === "baseline") {
                    // Baseline must not force layout work on every scroll event.
                    // Count every event, but sample scroll geometry only occasionally.
                    attachment.baselineScrollCounter = (attachment.baselineScrollCounter || 0) + 1;
                    session.scroll.events++;

                    const recent = session.lastInput || {
                        type: "programmatic-or-unknown",
                        detail: "unknown",
                        direction: "unknown",
                        at: 0
                    };
                    const direction = recent.direction || "unknown";
                    const key = `${recent.type || "programmatic-or-unknown"}.${direction}`;
                    let bucket = session.scroll.byInput.get(key);

                    if (!bucket) {
                        bucket = createScrollInputBucket();
                        session.scroll.byInput.set(key, bucket);
                    }

                    bucket.events++;

                    if (
                        attachment.baselineScrollCounter === 1 ||
                        attachment.baselineScrollCounter % BASELINE_SCROLL_SAMPLE_EVERY === 0
                    ) {
                        const scrollTop = attachment.holder.scrollTop;
                        const scrollLeft = attachment.holder.scrollLeft;
                        const delta = scrollTop - (attachment.baselineSampledScrollTop || 0);
                        const deltaX = scrollLeft - (attachment.baselineSampledScrollLeft || 0);
                        attachment.baselineSampledScrollTop = scrollTop;
                        attachment.baselineSampledScrollLeft = scrollLeft;
                        attachment.lastScrollTop = scrollTop;
                        attachment.lastScrollLeft = scrollLeft;

                        const sampledDistance = Math.abs(delta) + Math.abs(deltaX);
                        session.scroll.distancePx += sampledDistance;
                        bucket.distancePx += sampledDistance;
                    }

                    const handlerMs = this.now() - handlerStartedAt;
                    session.scroll.maxHandlerMs = Math.max(
                        session.scroll.maxHandlerMs,
                        handlerMs
                    );
                    bucket.maxHandlerMs = Math.max(bucket.maxHandlerMs, handlerMs);
                    this.trackProfilerWork(
                        session,
                        "profiler.scroll-handler",
                        handlerStartedAt
                    );
                    return;
                }

                const scrollTop = attachment.holder.scrollTop;
                const scrollLeft = attachment.holder.scrollLeft;
                const delta = scrollTop - attachment.lastScrollTop;
                const deltaX = scrollLeft - (attachment.lastScrollLeft || 0);
                attachment.lastScrollTop = scrollTop;
                attachment.lastScrollLeft = scrollLeft;
                const now = this.now();
                const recent =
                    now - session.lastInput.at <= RECENT_INPUT_MS
                        ? session.lastInput
                        : {
                            type: "programmatic-or-unknown",
                            detail: "unknown",
                            direction: delta < 0 ? "up" : "down"
                        };
                const scrollDirection = Math.abs(delta) >= Math.abs(deltaX)
                    ? (delta < 0 ? "up" : delta > 0 ? "down" : recent.direction)
                    : (deltaX < 0 ? "left" : "right");
                const key = `${recent.type}.${scrollDirection}`;

                if (this.mode === "trace") {
                    this.pushTraceEvent(elementId, "reaction", {
                        name: "scroll",
                        deltaY: round(delta),
                        deltaX: round(deltaX),
                        scrollTop: round(scrollTop),
                        scrollLeft: round(scrollLeft),
                        attributedTo: `${recent.type}.${recent.detail}`,
                        direction: scrollDirection
                    });
                }
                let bucket = session.scroll.byInput.get(key);

                if (!bucket) {
                    bucket = createScrollInputBucket();
                    session.scroll.byInput.set(key, bucket);
                }

                session.scroll.events++;
                session.scroll.distancePx += Math.abs(delta);
                bucket.events++;
                bucket.distancePx += Math.abs(delta);
                const timeBucket = this.ensureTimeBucket(session, now);

                if (timeBucket) {
                    timeBucket.scroll.events++;
                    timeBucket.scroll.distancePx += Math.abs(delta);
                    let timeInputBucket = timeBucket.scroll.byInput.get(key);

                    if (!timeInputBucket) {
                        timeInputBucket = createScrollInputBucket();
                        timeBucket.scroll.byInput.set(key, timeInputBucket);
                    }

                    timeInputBucket.events++;
                    timeInputBucket.distancePx += Math.abs(delta);
                }

                if (attachment.scrollSession === null) {
                    attachment.scrollSession = {
                        input: key,
                        startedAt: now,
                        events: 0,
                        distancePx: 0
                    };
                    session.scroll.sessions++;
                    bucket.sessions++;
                }

                attachment.scrollSession.events++;
                attachment.scrollSession.distancePx += Math.abs(delta);

                if (attachment.scrollIdleTimer !== null) {
                    window.clearTimeout(attachment.scrollIdleTimer);
                }

                attachment.scrollIdleTimer = window.setTimeout(() => {
                    attachment.scrollIdleTimer = null;
                    attachment.scrollSession = null;
                }, SCROLL_IDLE_MS);

                if (this.mode === "deep") {
                    const context = this.currentContext(elementId);
                    const bandBucket = this.ensureBand(
                        session,
                        context?.band || "unknown"
                    );
                    bandBucket.scrollEvents++;
                    bandBucket.scrollDistancePx += Math.abs(delta);
                    this.queueViewportContext(elementId, attachment);
                }

                const handlerMs = this.now() - handlerStartedAt;
                session.scroll.maxHandlerMs = Math.max(
                    session.scroll.maxHandlerMs,
                    handlerMs
                );
                bucket.maxHandlerMs = Math.max(bucket.maxHandlerMs, handlerMs);
                this.trackProfilerWork(
                    session,
                    "profiler.scroll-handler",
                    handlerStartedAt
                );
            };

            this.addDomHandler(attachment, document, "keydown", keydown, true);
            this.addDomHandler(attachment, attachment.holder, "wheel", wheel, { passive: true });
            this.addDomHandler(attachment, document, "pointerdown", pointerdown, true);
            this.addDomHandler(attachment, document, "pointermove", pointermove, true);
            this.addDomHandler(attachment, document, "pointerup", pointerup, true);
            this.addDomHandler(attachment, document, "click", click, true);
            this.addDomHandler(attachment, document, "dblclick", doubleClick, true);
            this.addDomHandler(attachment, document, "contextmenu", contextMenu, true);
            this.addDomHandler(attachment, document, "copy", copy, true);
            this.addDomHandler(attachment, document, "paste", paste, true);
            this.addDomHandler(attachment, document, "input", input, true);
            this.addDomHandler(attachment, document, "change", change, true);
            this.addDomHandler(attachment, attachment.holder, "scroll", scroll, { passive: true });
        },

        attachTableEvents: function (elementId, attachment) {
            const noteTableEvent = name => {
                const session = this.ensureSession(elementId);

                if (!session) {
                    return;
                }

                session.tableEvents.set(
                    name,
                    (session.tableEvents.get(name) || 0) + 1
                );
                const timeBucket = this.ensureTimeBucket(session, this.now());

                if (timeBucket) {
                    incrementCount(timeBucket.tableEvents, name, 1);
                }

                this.increment(elementId, `table.${name}`);
                this.pushTraceEvent(elementId, "reaction", {
                    name: `table.${name}`
                });
            };

            const definitions = [
                ["renderComplete", () => {
                    noteTableEvent("render-complete");
                    const session = this.ensureSession(elementId);
                    const context = this.currentContext(elementId);
                    const band = context?.band || "unknown";
                    this.ensureBand(session, band).renderCompleteCount++;
                    this.captureFirstUsable(elementId, attachment);
                }],
                ["dataProcessed", () => noteTableEvent("data-processed")],
                ["cellEditing", () => noteTableEvent("cell-editing")],
                ["cellEdited", () => noteTableEvent("cell-edited")],
                ["cellEditCancelled", () => noteTableEvent("cell-edit-cancelled")],
                ["clipboardCopied", () => noteTableEvent("clipboard-copied")],
                ["clipboardPasted", () => noteTableEvent("clipboard-pasted")],
                ["rangeAdded", () => noteTableEvent("range-added")],
                ["rangeChanged", () => noteTableEvent("range-changed")],
                ["rangeRemoved", () => noteTableEvent("range-removed")],
                ["dataSorting", () => noteTableEvent("data-sorting")],
                ["dataSorted", () => noteTableEvent("data-sorted")],
                ["dataFiltering", () => noteTableEvent("data-filtering")],
                ["dataFiltered", () => noteTableEvent("data-filtered")],
                ["columnResized", () => noteTableEvent("column-resized")],
                ["columnMoved", () => noteTableEvent("column-moved")],
                ["columnVisibilityChanged", () => noteTableEvent("column-visibility-changed")],
                ["rowSelectionChanged", () => noteTableEvent("row-selection-changed")]
            ];

            for (const [eventName, handler] of definitions) {
                try {
                    attachment.table.on(eventName, handler);
                    attachment.tableHandlers.push({ eventName, handler });
                } catch {
                }
            }
        },

        attachMutationObserver: function (elementId, attachment) {
            if (this.mode !== "deep" || typeof MutationObserver === "undefined") {
                return;
            }

            attachment.mutationObserver = new MutationObserver(records => {
                const callbackStartedAt = this.now();
                const session = this.ensureSession(elementId);

                if (!session) {
                    return;
                }

                session.domMutations.callbacks++;
                session.domMutations.records += records.length;
                const now = this.now();

                if (now - attachment.lastMutationDetailAt < DEEP_CONTEXT_INTERVAL_MS) {
                    this.trackProfilerWork(
                        session,
                        "profiler.mutation-observer-light",
                        callbackStartedAt
                    );
                    return;
                }

                attachment.lastMutationDetailAt = now;
                let rowsAdded = 0;
                let rowsRemoved = 0;
                let cellsAdded = 0;
                let cellsRemoved = 0;

                const countNode = (node, added) => {
                    if (!(node instanceof Element)) {
                        return;
                    }

                    const rowCount =
                        (node.matches(".tabulator-row") ? 1 : 0) +
                        node.querySelectorAll(".tabulator-row").length;
                    const cellCount =
                        (node.matches(".tabulator-cell") ? 1 : 0) +
                        node.querySelectorAll(".tabulator-cell").length;

                    if (added) {
                        rowsAdded += rowCount;
                        cellsAdded += cellCount;
                    } else {
                        rowsRemoved += rowCount;
                        cellsRemoved += cellCount;
                    }
                };

                for (const record of records.slice(0, 50)) {
                    for (const node of record.addedNodes) {
                        countNode(node, true);
                    }
                    for (const node of record.removedNodes) {
                        countNode(node, false);
                    }
                }

                session.domMutations.rowsAdded += rowsAdded;
                session.domMutations.rowsRemoved += rowsRemoved;
                session.domMutations.cellsAdded += cellsAdded;
                session.domMutations.cellsRemoved += cellsRemoved;
                const context = this.currentContext(elementId);
                const band = context?.band || "unknown";
                const bucket = this.ensureBand(session, band);
                bucket.rowsAdded += rowsAdded;
                bucket.rowsRemoved += rowsRemoved;
                bucket.cellsAdded += cellsAdded;
                bucket.cellsRemoved += cellsRemoved;
                this.trackProfilerWork(
                    session,
                    "profiler.mutation-observer-detail",
                    callbackStartedAt
                );
            });

            attachment.mutationObserver.observe(attachment.holder, {
                childList: true,
                subtree: true
            });
        },

        queueViewportContext: function (elementId, attachment) {
            if (attachment.contextRaf !== null) {
                return;
            }

            attachment.contextRaf = window.requestAnimationFrame(() => {
                attachment.contextRaf = null;
                this.captureViewportContext(elementId, attachment, false);
            });
        },

        getRowPosition: function (rowComponent) {
            try {
                const value = rowComponent?.getPosition?.(true);
                return Number.isFinite(value) ? value : null;
            } catch {
                return null;
            }
        },

        getActiveCellComponent: function (table) {
            try {
                const range = window.tabulatorTest?.getActiveRange?.(table);
                const internalCell = range?.getBounds?.()?.start;
                return internalCell?.getComponent?.() || internalCell || null;
            } catch {
                return null;
            }
        },

        captureViewportContext: function (elementId, attachment, force) {
            if (this.mode !== "deep") {
                return null;
            }

            const now = this.now();

            if (
                force !== true &&
                attachment.cachedContext !== null &&
                now - attachment.lastContextAt < DEEP_CONTEXT_INTERVAL_MS
            ) {
                return attachment.cachedContext;
            }

            const callbackStartedAt = now;
            let visibleRows = [];

            try {
                visibleRows = attachment.table.getRows("visible") || [];
            } catch {
                visibleRows = [];
            }

            const firstPosition = this.getRowPosition(visibleRows[0]);
            const lastPosition = this.getRowPosition(
                visibleRows.length > 0
                    ? visibleRows[visibleRows.length - 1]
                    : null
            );
            const activeCell = this.getActiveCellComponent(attachment.table);
            const activeRow = activeCell?.getRow?.();
            const activePosition = this.getRowPosition(activeRow);
            const activeElement = activeCell?.getElement?.();
            let hiddenAbovePx = 0;
            let hiddenBelowPx = 0;

            if (activeElement?.isConnected) {
                const holderBounds = attachment.holder.getBoundingClientRect();
                const cellBounds = activeElement.getBoundingClientRect();
                hiddenAbovePx = Math.max(0, holderBounds.top - cellBounds.top);
                hiddenBelowPx = Math.max(0, cellBounds.bottom - holderBounds.bottom);
            }

            const bandPosition = activePosition || firstPosition;
            const context = {
                atMs: round(now - (this.sessions.get(elementId)?.startedAt || now)),
                firstVisibleRow: firstPosition,
                lastVisibleRow: lastPosition,
                activeRow: activePosition,
                band: this.getBandKey(bandPosition),
                scrollTop: round(attachment.holder.scrollTop),
                renderedRows: attachment.holder.querySelectorAll(".tabulator-row").length,
                renderedCells: attachment.holder.querySelectorAll(".tabulator-cell").length,
                rangeElements: attachment.holder.querySelectorAll(".tabulator-range").length,
                hiddenAbovePx: round(hiddenAbovePx),
                hiddenBelowPx: round(hiddenBelowPx)
            };

            attachment.lastContextAt = now;
            attachment.cachedContext = context;
            this.trackProfilerWork(
                this.sessions.get(elementId),
                "profiler.viewport-context",
                callbackStartedAt
            );
            return context;
        },

        currentContext: function (elementId) {
            return this.attachments.get(elementId)?.cachedContext || null;
        },

        getBandKey: function (rowPosition) {
            if (!Number.isFinite(rowPosition) || rowPosition <= 0) {
                return "unknown";
            }

            const start = Math.floor((rowPosition - 1) / ROW_BAND_SIZE) * ROW_BAND_SIZE + 1;
            return `${start}-${start + ROW_BAND_SIZE - 1}`;
        },

        ensureBand: function (session, bandKey) {
            const key = bandKey || "unknown";
            let bucket = session.bands.get(key);

            if (!bucket) {
                bucket = createBandBucket();
                session.bands.set(key, bucket);
            }

            return bucket;
        },

        startPerformanceObservers: function () {
            if (!this.active || typeof PerformanceObserver === "undefined") {
                return;
            }

            this.stopPerformanceObservers();
            const supported = PerformanceObserver.supportedEntryTypes || [];

            const addObserver = (type, callback, options) => {
                if (!supported.includes(type)) {
                    return;
                }

                try {
                    const observer = new PerformanceObserver(callback);
                    observer.observe(options || { type, buffered: true });
                    this.observers.push(observer);
                } catch {
                }
            };

            addObserver("longtask", list => {
                const callbackStartedAt = this.now();

                for (const entry of list.getEntries()) {
                    for (const session of this.sessions.values()) {
                        if (session.endedAt !== null || entry.startTime < session.startedAt) {
                            continue;
                        }

                        session.longTasks.count++;
                        session.longTasks.totalMs += entry.duration;
                        session.longTasks.maxMs = Math.max(
                            session.longTasks.maxMs,
                            entry.duration
                        );
                        if (ARROW_DIAG_ENABLED && session.arrowDiagnosis) {
                            const sequences = this.findArrowDiagnosticWindowsForSpan(
                                session,
                                entry.startTime,
                                entry.startTime + entry.duration
                            );
                            if (sequences.length) {
                                pushBounded(
                                    session.arrowDiagnosis.longTasks,
                                    {
                                        startMs: round(entry.startTime - session.startedAt),
                                        durationMs: round(entry.duration),
                                        arrowSequences: sequences
                                    },
                                    MAX_ARROW_DIAG_TASKS
                                );
                            }
                        }
                        const timeBucket = this.ensureTimeBucket(session, entry.startTime);

                        if (timeBucket) {
                            timeBucket.longTasks.count++;
                            timeBucket.longTasks.totalMs += entry.duration;
                            timeBucket.longTasks.maxMs = Math.max(
                                timeBucket.longTasks.maxMs,
                                entry.duration
                            );
                        }

                        const band = this.currentContext(session.elementId)?.band || "unknown";
                        const bucket = this.ensureBand(session, band);
                        bucket.longTaskCount++;
                        bucket.longTaskTotalMs += entry.duration;
                        bucket.longTaskMaxMs = Math.max(
                            bucket.longTaskMaxMs,
                            entry.duration
                        );
                    }
                }

                for (const session of this.sessions.values()) {
                    if (session.endedAt === null) {
                        this.trackProfilerWork(
                            session,
                            "profiler.longtask-observer",
                            callbackStartedAt
                        );
                    }
                }
            });

            addObserver("long-animation-frame", list => {
                const callbackStartedAt = this.now();

                for (const entry of list.getEntries()) {
                    for (const session of this.sessions.values()) {
                        if (session.endedAt !== null || entry.startTime < session.startedAt) {
                            continue;
                        }

                        const target = session.longAnimationFrames;
                        target.count++;
                        target.totalMs += entry.duration || 0;
                        target.totalBlockingMs += entry.blockingDuration || 0;
                        target.maxMs = Math.max(target.maxMs, entry.duration || 0);
                        target.maxBlockingMs = Math.max(
                            target.maxBlockingMs,
                            entry.blockingDuration || 0
                        );
                        const timeBucket = this.ensureTimeBucket(session, entry.startTime);

                        if (timeBucket) {
                            const loaf = timeBucket.longAnimationFrames;
                            loaf.count++;
                            loaf.totalMs += entry.duration || 0;
                            loaf.totalBlockingMs += entry.blockingDuration || 0;
                            loaf.maxMs = Math.max(loaf.maxMs, entry.duration || 0);
                            loaf.maxBlockingMs = Math.max(
                                loaf.maxBlockingMs,
                                entry.blockingDuration || 0
                            );
                        }

                        if (this.mode === "deep" || ARROW_DIAG_ENABLED) {
                            for (const script of entry.scripts || []) {
                                const functionName =
                                    script.sourceFunctionName ||
                                    script.functionName ||
                                    script.invoker ||
                                    "unknown";
                                const key = `${script.sourceURL || "inline"}::${functionName}`;
                                addDuration(
                                    target.scripts,
                                    key,
                                    script.duration || 0,
                                    false
                                );
                            }
                        }

                        if (ARROW_DIAG_ENABLED && session.arrowDiagnosis) {
                            const frameEnd = entry.startTime + (entry.duration || 0);
                            const sequences = this.findArrowDiagnosticWindowsForSpan(
                                session,
                                entry.startTime,
                                frameEnd
                            );
                            if (sequences.length) {
                                const scripts = (entry.scripts || [])
                                    .map(script => ({
                                        durationMs: round(script.duration || 0),
                                        executionStartMs: Number.isFinite(script.executionStart)
                                            ? round(script.executionStart - session.startedAt)
                                            : null,
                                        forcedStyleAndLayoutMs: round(
                                            script.forcedStyleAndLayoutDuration || 0
                                        ),
                                        pauseMs: round(script.pauseDuration || 0),
                                        invoker: script.invoker || null,
                                        functionName:
                                            script.sourceFunctionName ||
                                            script.functionName ||
                                            null,
                                        sourceURL: script.sourceURL || null
                                    }))
                                    .sort((a, b) => b.durationMs - a.durationMs)
                                    .slice(0, 12);
                                const scriptDurationMs = scripts.reduce(
                                    (sum, script) => sum + (script.durationMs || 0),
                                    0
                                );
                                const forcedStyleAndLayoutMs = scripts.reduce(
                                    (sum, script) =>
                                        sum + (script.forcedStyleAndLayoutMs || 0),
                                    0
                                );
                                pushBounded(
                                    session.arrowDiagnosis.frames,
                                    {
                                        startMs: round(entry.startTime - session.startedAt),
                                        durationMs: round(entry.duration || 0),
                                        blockingDurationMs: round(entry.blockingDuration || 0),
                                        firstUIEventTimestampMs: Number.isFinite(entry.firstUIEventTimestamp)
                                            ? round(entry.firstUIEventTimestamp - session.startedAt)
                                            : null,
                                        renderStartMs: Number.isFinite(entry.renderStart)
                                            ? round(entry.renderStart - session.startedAt)
                                            : null,
                                        styleAndLayoutStartMs: Number.isFinite(entry.styleAndLayoutStart)
                                            ? round(entry.styleAndLayoutStart - session.startedAt)
                                            : null,
                                        preRenderMs: Number.isFinite(entry.renderStart)
                                            ? round(entry.renderStart - entry.startTime)
                                            : null,
                                        renderTailMs: Number.isFinite(entry.renderStart)
                                            ? round(frameEnd - entry.renderStart)
                                            : null,
                                        styleLayoutPaintTailMs: Number.isFinite(entry.styleAndLayoutStart)
                                            ? round(frameEnd - entry.styleAndLayoutStart)
                                            : null,
                                        scriptDurationMs: round(scriptDurationMs),
                                        forcedStyleAndLayoutMs: round(forcedStyleAndLayoutMs),
                                        arrowSequences: sequences,
                                        scripts
                                    },
                                    MAX_ARROW_DIAG_FRAMES
                                );
                            }
                        }
                    }
                }

                for (const session of this.sessions.values()) {
                    if (session.endedAt === null) {
                        this.trackProfilerWork(
                            session,
                            "profiler.loaf-observer",
                            callbackStartedAt
                        );
                    }
                }
            });

            if (this.mode === "deep" || ARROW_DIAG_ENABLED) {
                addObserver(
                    "event",
                    list => {
                        const callbackStartedAt = this.now();

                        for (const entry of list.getEntries()) {
                            for (const session of this.sessions.values()) {
                                if (session.endedAt === null && entry.startTime >= session.startedAt) {
                                    addDuration(
                                        session.eventTiming,
                                        entry.name || "unknown",
                                        entry.duration,
                                        true
                                    );
                                    if (ARROW_DIAG_ENABLED && session.arrowDiagnosis) {
                                        const nearest = Array.from(
                                            session.arrowDiagnosis.windows.values()
                                        )
                                            .filter(item =>
                                                Math.abs(item.startedAt - entry.startTime) <= 40
                                            )
                                            .sort((a, b) =>
                                                Math.abs(a.startedAt - entry.startTime) -
                                                Math.abs(b.startedAt - entry.startTime)
                                            )[0];
                                        if (nearest) {
                                            pushBounded(
                                                session.arrowDiagnosis.eventTiming,
                                                {
                                                    sequence: nearest.sequence,
                                                    name: entry.name || "unknown",
                                                    startMs: round(entry.startTime - session.startedAt),
                                                    durationMs: round(entry.duration || 0),
                                                    processingStartDelayMs: Number.isFinite(entry.processingStart)
                                                        ? round(entry.processingStart - entry.startTime)
                                                        : null,
                                                    processingDurationMs:
                                                        Number.isFinite(entry.processingStart) &&
                                                        Number.isFinite(entry.processingEnd)
                                                            ? round(entry.processingEnd - entry.processingStart)
                                                            : null,
                                                    presentationDelayMs: Number.isFinite(entry.processingEnd)
                                                        ? round(
                                                            entry.startTime + entry.duration -
                                                            entry.processingEnd
                                                        )
                                                        : null,
                                                    interactionId: entry.interactionId || null
                                                },
                                                MAX_ARROW_DIAG_EVENT_TIMING
                                            );
                                        }
                                    }
                                }
                            }
                        }

                        for (const session of this.sessions.values()) {
                            if (session.endedAt === null) {
                                this.trackProfilerWork(
                                    session,
                                    "profiler.event-timing-observer",
                                    callbackStartedAt
                                );
                            }
                        }
                    },
                    { type: "event", buffered: true, durationThreshold: 16 }
                );

                if (this.mode === "deep") {
                    addObserver("layout-shift", list => {
                    const callbackStartedAt = this.now();

                    for (const entry of list.getEntries()) {
                        for (const session of this.sessions.values()) {
                            if (session.endedAt !== null || entry.startTime < session.startedAt) {
                                continue;
                            }

                            session.layoutShifts.count++;
                            session.layoutShifts.totalScore += entry.value || 0;

                            if (!entry.hadRecentInput) {
                                session.layoutShifts.withoutRecentInputCount++;
                                session.layoutShifts.withoutRecentInputScore += entry.value || 0;
                            }
                        }
                    }

                    for (const session of this.sessions.values()) {
                        if (session.endedAt === null) {
                            this.trackProfilerWork(
                                session,
                                "profiler.layout-shift-observer",
                                callbackStartedAt
                            );
                        }
                    }
                    });
                }
            }
        },

        stopPerformanceObservers: function () {
            for (const observer of this.observers) {
                observer.disconnect?.();
            }
            this.observers = [];
        },

        attachGlobalErrorHandlers: function () {
            this.detachGlobalHandlers();

            const errorHandler = event => {
                for (const session of this.sessions.values()) {
                    if (session.endedAt === null) {
                        pushBounded(
                            session.errors,
                            {
                                type: "error",
                                message: event.message || "Unknown error",
                                source: event.filename || null,
                                line: event.lineno || null,
                                column: event.colno || null
                            },
                            50
                        );
                    }
                }
            };

            const rejectionHandler = event => {
                for (const session of this.sessions.values()) {
                    if (session.endedAt === null) {
                        pushBounded(
                            session.errors,
                            {
                                type: "unhandled-rejection",
                                message:
                                    event.reason?.message ||
                                    String(event.reason || "Unknown rejection")
                            },
                            50
                        );
                    }
                }
            };

            window.addEventListener("error", errorHandler);
            window.addEventListener("unhandledrejection", rejectionHandler);
            this.globalHandlers.push([window, "error", errorHandler]);
            this.globalHandlers.push([window, "unhandledrejection", rejectionHandler]);
        },

        detachGlobalHandlers: function () {
            for (const [target, name, handler] of this.globalHandlers) {
                target.removeEventListener(name, handler);
            }
            this.globalHandlers = [];
        },

        detach: function (elementId) {
            const attachment = this.attachments.get(elementId);

            if (!attachment) {
                return;
            }

            for (const item of attachment.domHandlers) {
                item.target?.removeEventListener?.(
                    item.eventName,
                    item.handler,
                    item.options
                );
            }

            for (const item of attachment.tableHandlers) {
                try {
                    attachment.table.off(item.eventName, item.handler);
                } catch {
                }
            }

            attachment.mutationObserver?.disconnect?.();

            if (attachment.scrollIdleTimer !== null) {
                window.clearTimeout(attachment.scrollIdleTimer);
            }

            if (attachment.contextRaf !== null) {
                window.cancelAnimationFrame(attachment.contextRaf);
            }

            this.attachments.delete(elementId);
        },

        detachAll: function () {
            for (const elementId of Array.from(this.attachments.keys())) {
                this.detach(elementId);
            }
        },

        captureTableOptions: function (table) {
            const options = table?.options || {};
            return {
                renderVertical: options.renderVertical ?? null,
                rowHeight: options.rowHeight ?? null,
                layout: options.layout ?? null,
                height: options.height ?? null,
                selectableRange: options.selectableRange ?? null,
                clipboard: options.clipboard ?? null,
                history: options.history ?? null
            };
        },

        captureNavigationTiming: function () {
            const entry = performance.getEntriesByType?.("navigation")?.[0];

            if (!entry) {
                return null;
            }

            return {
                type: entry.type,
                responseEndMs: round(entry.responseEnd),
                domInteractiveMs: round(entry.domInteractive),
                domContentLoadedMs: round(entry.domContentLoadedEventEnd),
                loadEventEndMs: round(entry.loadEventEnd)
            };
        },

        captureResourceTiming: function () {
            const entries = performance.getEntriesByType?.("resource") || [];
            const relevant = entries.filter(entry =>
                /tabulator|blazor|ERPPrototype|\.js(?:\?|$)|\.css(?:\?|$)/i.test(entry.name)
            );

            return relevant
                .map(entry => ({
                    name: entry.name.split("/").at(-1),
                    durationMs: round(entry.duration),
                    transferKb: Number.isFinite(entry.transferSize)
                        ? round(entry.transferSize / 1024)
                        : null,
                    decodedKb: Number.isFinite(entry.decodedBodySize)
                        ? round(entry.decodedBodySize / 1024)
                        : null
                }))
                .sort((first, second) => second.durationMs - first.durationMs)
                .slice(0, 30);
        },

        mark: function (elementId, label) {
            const id = elementId || DEFAULT_TABLE_ID;
            const session = this.ensureSession(id);

            if (!session) {
                return null;
            }

            const mark = {
                number: ++this.markNumber,
                atMs: round(this.now() - session.startedAt),
                label: label || `Mark ${this.markNumber}`,
                context:
                    this.mode === "deep"
                        ? this.captureViewportContext(
                            id,
                            this.attachments.get(id),
                            true
                        )
                        : null,
                memory: this.readMemorySnapshot()
            };
            session.marks.push(mark);
            return mark;
        },

        finalizeSession: function (elementId) {
            const session = this.sessions.get(elementId);

            if (!session || session.endedAt !== null) {
                return session;
            }

            if (this.mode === "lifecycle") {
                const sample = this.recordLifecycleSample(
                    elementId,
                    "session-end"
                );
                session.lifecycle.end = sample?.snapshot || null;
            }

            session.memory.end = this.readMemorySnapshot();
            session.dom.end = this.captureDomSnapshot(elementId);
            session.navigation = this.captureNavigationTiming();
            session.resources = this.captureResourceTiming();
            session.gpuIdentity = this.captureGpuIdentity();
            session.endedAt = this.now();
            return session;
        },

        serializeInteractionMetrics: function (map) {
            return Array.from(map.entries())
                .map(([name, metric]) => ({
                    name,
                    count: metric.count,
                    inputToPaint: {
                        averageMs: round(metric.totalMs / Math.max(1, metric.count)),
                        p50Ms: percentile(metric.samples, 50),
                        p95Ms: percentile(metric.samples, 95),
                        maxMs: round(metric.maxMs)
                    },
                    frameGap: {
                        p50Ms: percentile(metric.frameGapSamples, 50),
                        p95Ms: percentile(metric.frameGapSamples, 95),
                        maxMs: round(Math.max(0, ...(metric.frameGapSamples || [])))
                    }
                }))
                .sort((first, second) =>
                    (second.inputToPaint.p95Ms || 0) -
                    (first.inputToPaint.p95Ms || 0)
                );
        },

        serializeBands: function (bands) {
            const numericStart = key => {
                const start = Number(String(key).split("-")[0]);
                return Number.isFinite(start) ? start : Number.MAX_SAFE_INTEGER;
            };

            return Array.from(bands.entries())
                .map(([band, bucket]) => ({
                    band,
                    interactionCount: bucket.interactionCount,
                    keyCount: bucket.keyCount,
                    scrollEvents: bucket.scrollEvents,
                    scrollDistancePx: round(bucket.scrollDistancePx),
                    renderCompleteCount: bucket.renderCompleteCount,
                    longTasks: {
                        count: bucket.longTaskCount,
                        totalMs: round(bucket.longTaskTotalMs),
                        maxMs: round(bucket.longTaskMaxMs)
                    },
                    virtualDom: {
                        rowsAdded: bucket.rowsAdded,
                        rowsRemoved: bucket.rowsRemoved,
                        cellsAdded: bucket.cellsAdded,
                        cellsRemoved: bucket.cellsRemoved
                    },
                    activeCellVisibility: {
                        hiddenAboveCount: bucket.hiddenAboveCount,
                        hiddenBelowCount: bucket.hiddenBelowCount,
                        maxHiddenAbovePx: round(bucket.maxHiddenAbovePx),
                        maxHiddenBelowPx: round(bucket.maxHiddenBelowPx)
                    },
                    inputToPaint: {
                        p50Ms: percentile(bucket.inputToPaintMs, 50),
                        p95Ms: percentile(bucket.inputToPaintMs, 95),
                        maxMs: round(Math.max(0, ...bucket.inputToPaintMs))
                    },
                    frameGap: {
                        p50Ms: percentile(bucket.frameGapMs, 50),
                        p95Ms: percentile(bucket.frameGapMs, 95),
                        maxMs: round(Math.max(0, ...bucket.frameGapMs))
                    }
                }))
                .sort((first, second) => numericStart(first.band) - numericStart(second.band));
        },

        buildReport: function (elementId) {
            const id = elementId || DEFAULT_TABLE_ID;
            const session = this.finalizeSession(id);

            if (!session) {
                return null;
            }

            const elapsedMs = Math.max(0, session.endedAt - session.startedAt);
            const memoryStart = session.memory.start;
            const memoryEnd = session.memory.end;
            const heapDelta =
                Number.isFinite(memoryStart.usedJsHeapMb) &&
                    Number.isFinite(memoryEnd.usedJsHeapMb)
                    ? round(memoryEnd.usedJsHeapMb - memoryStart.usedJsHeapMb)
                    : null;
            const measuredOverheadRatio = elapsedMs > 0
                ? round((session.profiler.measuredHookTimeMs / elapsedMs) * 100, 4)
                : null;

            return {
                version: session.version,
                mode: session.mode,
                label: session.label,
                page: `${window.location.pathname}${window.location.search}`,
                rows: session.rowCount,
                elapsedMs: round(elapsedMs),
                measurementValidity: {
                    decisionUse:
                        session.mode === "baseline"
                            ? "Use for before/after regression decisions. Run three times and compare the median."
                            : session.mode === "lifecycle"
                                ? "Use for lifecycle/resource accumulation diagnosis and time-window trends. Confirm final performance gains again in baseline mode."
                                : session.mode === "trace"
                                    ? "Use for manual interaction sequencing and cause/reaction correlation. Diagnostic only; confirm final gains again in baseline mode."
                                    : "Use for diagnosis and row-band correlation. Confirm final gains again in baseline mode.",
                    profilerMeasuredHookTimeMs: round(session.profiler.measuredHookTimeMs),
                    profilerMeasuredHookRatioPercent: measuredOverheadRatio,
                    profilerCallbackCount: session.profiler.callbackCount,
                    profilerMaxCallbackMs: round(session.profiler.maxCallbackMs),
                    warning: "Measured hook time is a lower-bound estimate. Browser observer and instrumentation effects cannot be measured perfectly from inside the page.",
                    baselineScrollGeometrySamplingEvery: session.mode === "baseline" ? BASELINE_SCROLL_SAMPLE_EVERY : null
                },
                environment: session.environment,
                grid: {
                    firstUsableMsFromInitialize: session.firstUsableMsFromInitialize,
                    firstUsableMsFromSessionStart: session.firstUsableMsFromSessionStart,
                    tableOptions: session.tableOptions,
                    domStart: session.dom.start,
                    domEnd: session.dom.end
                },
                memory: {
                    start: memoryStart,
                    end: memoryEnd,
                    usedJsHeapDeltaMb: heapDelta,
                    samples: session.memory.samples,
                    note: "This is Chromium JavaScript heap, not total Edge RAM or total device RAM."
                },
                processorAndGpuLimits: {
                    logicalProcessors: session.environment.logicalProcessors,
                    approximateDeviceMemoryGb: session.environment.approximateDeviceMemoryGb,
                    gpuIdentity: session.gpuIdentity,
                    note: "A web page cannot read Windows CPU percentage, total browser RAM, GPU percentage, or VRAM usage. Long tasks, frame gaps and JS heap are the in-page pressure indicators."
                },
                longTasks: {
                    count: session.longTasks.count,
                    totalMs: round(session.longTasks.totalMs),
                    maxMs: round(session.longTasks.maxMs)
                },
                longAnimationFrames: {
                    count: session.longAnimationFrames.count,
                    totalMs: round(session.longAnimationFrames.totalMs),
                    totalBlockingMs: round(session.longAnimationFrames.totalBlockingMs),
                    maxMs: round(session.longAnimationFrames.maxMs),
                    maxBlockingMs: round(session.longAnimationFrames.maxBlockingMs),
                    topScripts: serializeDurationMap(session.longAnimationFrames.scripts).slice(0, 20)
                },
                interactions: {
                    sampled: session.profiler.sampledInteractions,
                    skippedByBaselineSampling: session.profiler.skippedInteractions,
                    summary: this.serializeInteractionMetrics(session.interactionMetrics),
                    deepSamples:
                        session.mode === "deep" || session.mode === "trace"
                            ? session.interactions
                            : []
                },
                interactionTrace: session.mode === "trace"
                    ? {
                        events: session.trace.events,
                        droppedEvents: session.trace.droppedEvents,
                        pendingActionCount: session.trace.pendingActions.size,
                        selectionSafety: session.trace.selectionSafety
                    }
                    : null,
                arrowDiagnosis: ARROW_DIAG_ENABLED
                    ? this.serializeArrowDiagnosis(session)
                    : null,
                timeSeries30s: this.serializeTimeBuckets(session),
                lifecycleAudit: session.mode === "lifecycle"
                    ? session.lifecycle
                    : null,
                scroll: {
                    events: session.scroll.events,
                    sessions: session.scroll.sessions,
                    distancePx: round(session.scroll.distancePx),
                    maxHandlerMs: round(session.scroll.maxHandlerMs),
                    byInput: Array.from(session.scroll.byInput.entries()).map(
                        ([name, bucket]) => ({ name, ...bucket })
                    )
                },
                byRowBand: session.mode === "deep"
                    ? this.serializeBands(session.bands)
                    : [],
                operations: serializeDurationMap(session.durations),
                operationSamples: session.operationSamples,
                tabulatorInternals:
                    session.mode === "deep" || session.mode === "trace"
                        ? serializeDurationMap(session.internalDurations)
                        : [],
                eventTiming: session.mode === "deep" || ARROW_DIAG_ENABLED
                    ? serializeDurationMap(session.eventTiming)
                    : [],
                layoutShifts: session.layoutShifts,
                domMutations: session.mode === "deep"
                    ? session.domMutations
                    : null,
                tableEvents: Object.fromEntries(session.tableEvents),
                counters: Object.fromEntries(
                    Array.from(session.counters.entries()).sort()
                ),
                profilerHooks: serializeDurationMap(session.profiler.byHook),
                marks: session.marks,
                timeline: session.mode === "deep" ? session.timeline : [],
                errors: session.errors,
                navigation: session.navigation,
                resources: session.resources,
                performanceBudgets: {
                    firstUsableGridMs: { target: 800, regression: 1750 },
                    arrowInputToPaintP95Ms: { target: 33, regression: 100 },
                    cellEditMs: { target: 30, regression: 40 },
                    paste10x6Ms: { target: 120, regression: 200 },
                    insertOneRowMs: { target: 100, regression: 200 },
                    deleteOneRowMs: { target: 150, regression: 250 },
                    structuralUndoRedoMs: { target: 150, regression: 250 },
                    openValueFilterMs: { target: 150, regression: 300 },
                    saveOneRowEndToEndMs: { target: 500, regression: 1000 },
                    clientApplyDeltaMs: { target: 75, regression: 150 }
                }
            };
        },

        finish: function (elementId) {
            const report = this.buildReport(elementId || DEFAULT_TABLE_ID);
            this.stop(false);
            return report;
        },

        downloadReport: function (elementId) {
            const id = elementId || DEFAULT_TABLE_ID;
            const report = this.buildReport(id);

            if (!report) {
                return false;
            }

            this.stop(false);
            const text = JSON.stringify(report, null, 2);
            const blob = new Blob([text], { type: "application/json;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            anchor.href = url;
            anchor.download = `UDS_Performance_${report.mode}_${timestamp}.json`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            this.setPanelStatus("Report downloaded");
            return true;
        },

        report: function (elementId) {
            const report = this.buildReport(elementId || DEFAULT_TABLE_ID);
            console.log(report);
            return report;
        },

        createPanel: function (elementId) {
            if (this.panel) {
                return;
            }

            const panel = document.createElement("div");
            panel.id = "uds-performance-panel";
            panel.innerHTML = `
                <style>
                    #uds-performance-panel {
                        position: fixed;
                        left: 12px;
                        bottom: 12px;
                        z-index: 2147483647;
                        direction: ltr;
                        font: 12px/1.35 system-ui, sans-serif;
                        color: #f8fafc;
                        background: rgba(15, 23, 42, 0.94);
                        border: 1px solid rgba(148, 163, 184, 0.55);
                        border-radius: 8px;
                        padding: 8px;
                        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
                    }
                    #uds-performance-panel .uds-perf-title {
                        font-weight: 700;
                        margin-bottom: 5px;
                    }
                    #uds-performance-panel .uds-perf-status {
                        max-width: 330px;
                        margin-bottom: 6px;
                        color: #cbd5e1;
                    }
                    #uds-performance-panel button {
                        margin-right: 4px;
                        border: 1px solid #64748b;
                        border-radius: 5px;
                        background: #1e293b;
                        color: #f8fafc;
                        padding: 3px 7px;
                        cursor: pointer;
                    }
                </style>
                <div class="uds-perf-title">UDS PERF — ${this.mode.toUpperCase()}</div>
                <div class="uds-perf-status">Ready</div>
                <button type="button" data-action="reset">Start / Reset</button>
                <button type="button" data-action="mark">Mark</button>
                <button type="button" data-action="download">Download</button>
                <button type="button" data-action="stop">Stop</button>
            `;
            panel.addEventListener("click", event => {
                const action = event.target?.dataset?.action;

                if (action === "reset") {
                    if (!this.active) {
                        this.start(this.mode, elementId);
                    }
                    this.reset(elementId);
                } else if (action === "mark") {
                    const label = window.prompt("Mark label", "Row 1500 area");
                    if (label !== null) {
                        this.mark(elementId, label);
                        this.setPanelStatus(`Marked: ${label}`);
                    }
                } else if (action === "download") {
                    this.downloadReport(elementId);
                } else if (action === "stop") {
                    this.stop(true);
                }
            });
            document.body.appendChild(panel);
            this.panel = panel;
        },

        setPanelStatus: function (message) {
            const target = this.panel?.querySelector?.(".uds-perf-status");

            if (target) {
                target.textContent = message || "";
            }
        },

        help: function () {
            console.log([
                "UDS Performance Observatory:",
                "Normal:   /work-orders",
                "Baseline:  /work-orders?perf=baseline",
                "Bulk ops:  baseline mode now records operationSamples with sizes",
                "Lifecycle: /work-orders?perf=lifecycle",
                "Trace:     /work-orders?perf=trace",
                "ArrowDiag: /work-orders?perf=arrowdiag",
                "Deep:      /work-orders?perf=deep",
                "tabulatorPerformance.reset('tabulator-test-table')",
                "tabulatorPerformance.mark('tabulator-test-table', 'label')",
                "tabulatorPerformance.downloadReport('tabulator-test-table')",
                "tabulatorPerformance.stop(true)"
            ].join("\n"));
        }
    };

    window.tabulatorPerformance = api;

    if (api.mode !== "off") {
        api.start(api.mode, DEFAULT_TABLE_ID, "UDS final performance observatory");
        console.info(
            `[${api.version}] ${ARROW_DIAG_ENABLED ? "arrowdiag" : api.mode} mode active. ` +
            "Press Start / Reset immediately before the test, then Download."
        );
    }
})();
