window.tabulatorRangeAutoScroll = (() => {
    const instances = new Map();

    const edgeSize = 42;
    const minimumStep = 8;
    const maximumStep = 32;

    function clamp(value, minimum, maximum) {
        return Math.max(minimum, Math.min(maximum, value));
    }

    function stopFrame(state) {
        if (state.frame !== null) {
            window.cancelAnimationFrame(state.frame);
            state.frame = null;
        }
    }

    function stopDrag(state) {
        state.dragging = false;
        state.direction = 0;
        stopFrame(state);
    }

    function getCellAtPointer(state) {
        const rect = state.holder.getBoundingClientRect();
        const x = clamp(
            state.clientX,
            rect.left + 2,
            rect.right - 2
        );
        const y = clamp(
            state.clientY,
            rect.top + 2,
            rect.bottom - 2
        );

        const target = document.elementFromPoint(x, y);
        const cell = target?.closest?.(".tabulator-cell");

        if (!cell || !state.root.contains(cell)) {
            return null;
        }

        return { cell, x, y };
    }

    function refreshNativeRange(state) {
        const hit = getCellAtPointer(state);

        if (!hit) {
            return;
        }

        /*
         * Tabulator extends a mouse range from its own cell-mousemove event.
         * Scrolling moves new rows beneath a stationary pointer, so the
         * browser does not emit another mousemove automatically. Replaying
         * that one native event on the newly exposed cell lets Tabulator keep
         * full ownership of the range and its Virtual DOM bookkeeping.
         */
        hit.cell.dispatchEvent(
            new MouseEvent("mousemove", {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: hit.x,
                clientY: hit.y,
                button: 0,
                buttons: 1
            })
        );
    }

    function calculateDirection(state) {
        const rect = state.holder.getBoundingClientRect();

        if (
            state.clientX < rect.left ||
            state.clientX > rect.right
        ) {
            return 0;
        }

        if (
            state.clientY <= rect.top + edgeSize &&
            state.holder.scrollTop > 0
        ) {
            return -1;
        }

        const maximumScrollTop = Math.max(
            0,
            state.holder.scrollHeight - state.holder.clientHeight
        );

        if (
            state.clientY >= rect.bottom - edgeSize &&
            state.holder.scrollTop < maximumScrollTop
        ) {
            return 1;
        }

        return 0;
    }

    function calculateStep(state) {
        const rect = state.holder.getBoundingClientRect();
        const distance = state.direction < 0
            ? rect.top + edgeSize - state.clientY
            : state.clientY - (rect.bottom - edgeSize);
        const ratio = clamp(distance / edgeSize, 0, 1);

        return Math.round(
            minimumStep +
            (maximumStep - minimumStep) * ratio
        );
    }

    function runFrame(state) {
        state.frame = null;

        if (!state.dragging || state.direction === 0) {
            return;
        }

        const previousTop = state.holder.scrollTop;
        const step = calculateStep(state);

        state.holder.scrollTop +=
            state.direction * step;

        if (state.holder.scrollTop === previousTop) {
            state.direction = 0;
            return;
        }

        refreshNativeRange(state);
        state.frame = window.requestAnimationFrame(
            () => runFrame(state)
        );
    }

    function scheduleFrame(state) {
        if (
            state.frame === null &&
            state.dragging &&
            state.direction !== 0
        ) {
            state.frame = window.requestAnimationFrame(
                () => runFrame(state)
            );
        }
    }

    function attach(elementId, table) {
        detach(elementId);

        const root =
            table?.element ||
            document.getElementById(elementId);
        const holder = root?.querySelector?.(
            ".tabulator-tableholder"
        );

        if (!root || !holder) {
            return false;
        }

        const state = {
            root,
            holder,
            dragging: false,
            direction: 0,
            clientX: 0,
            clientY: 0,
            frame: null,
            onMouseDown: null,
            onMouseMove: null,
            onMouseUp: null,
            onBlur: null
        };

        state.onMouseDown = event => {
            if (
                event.button !== 0 ||
                !event.target?.closest?.(".tabulator-cell") ||
                event.target?.closest?.(
                    "input, textarea, select, [contenteditable='true']"
                )
            ) {
                return;
            }

            state.dragging = true;
            state.clientX = event.clientX;
            state.clientY = event.clientY;
            state.direction = 0;
        };

        state.onMouseMove = event => {
            if (!event.isTrusted || !state.dragging) {
                return;
            }

            if ((event.buttons & 1) !== 1) {
                stopDrag(state);
                return;
            }

            state.clientX = event.clientX;
            state.clientY = event.clientY;
            state.direction = calculateDirection(state);

            if (state.direction === 0) {
                stopFrame(state);
            } else {
                scheduleFrame(state);
            }
        };

        state.onMouseUp = () => stopDrag(state);
        state.onBlur = () => stopDrag(state);

        holder.addEventListener(
            "mousedown",
            state.onMouseDown,
            true
        );
        document.addEventListener(
            "mousemove",
            state.onMouseMove,
            true
        );
        document.addEventListener(
            "mouseup",
            state.onMouseUp,
            true
        );
        window.addEventListener("blur", state.onBlur);

        instances.set(elementId, state);
        return true;
    }

    function detach(elementId) {
        const state = instances.get(elementId);

        if (!state) {
            return false;
        }

        stopDrag(state);
        state.holder.removeEventListener(
            "mousedown",
            state.onMouseDown,
            true
        );
        document.removeEventListener(
            "mousemove",
            state.onMouseMove,
            true
        );
        document.removeEventListener(
            "mouseup",
            state.onMouseUp,
            true
        );
        window.removeEventListener("blur", state.onBlur);

        instances.delete(elementId);
        return true;
    }

    return { attach, detach };
})();
