/*
 * UDS Work Orders Grid Diagnostics
 * Step16M1-Diagnostics-v1
 *
 * Owns lightweight, always-on diagnostic messages that were previously
 * implemented inside tabulatorTest.js. Performance test modes remain owned by
 * tabulatorPerformance.js and their query flags are unchanged.
 */
(function () {
    "use strict";

    const VERSION = "Step16M1-Diagnostics-v1";
    const activeInitializations = new Map();
    let nextTokenId = 1;

    function now() {
        return window.performance?.now?.() ?? Date.now();
    }

    function normalizeRowCount(value) {
        return Number.isFinite(value)
            ? Math.max(0, Math.trunc(value))
            : 0;
    }

    const api = {
        version: VERSION,

        beginGridInitialization: function (elementId, rowCount) {
            const key = String(elementId || "");
            const previous = activeInitializations.get(key);

            if (previous?.frameId !== null && previous?.frameId !== undefined) {
                window.cancelAnimationFrame(previous.frameId);
            }

            const token = {
                id: nextTokenId++,
                elementId: key,
                rowCount: normalizeRowCount(rowCount),
                startedAt: now(),
                frameId: null,
                completed: false
            };

            activeInitializations.set(key, token);
            return token;
        },

        completeGridInitialization: function (token) {
            if (!token || token.completed) {
                return false;
            }

            const active = activeInitializations.get(token.elementId);

            if (active !== token) {
                return false;
            }

            token.frameId = window.requestAnimationFrame(() => {
                const current = activeInitializations.get(token.elementId);

                if (current !== token || token.completed) {
                    return;
                }

                token.completed = true;
                token.frameId = null;
                activeInitializations.delete(token.elementId);

                const durationMs = Math.round(now() - token.startedAt);

                console.info(
                    `[WorkOrders Performance] Tabulator ready: ` +
                    `${durationMs} ms for ` +
                    `${token.rowCount.toLocaleString()} rows.`
                );
            });

            return true;
        }
    };

    window.tabulatorDiagnostics = api;
})();
