import {
    createRevoGridChangeEngine,
    RevoGridChangeEngineError
} from "./revoGridChangeEngine.js";
import {
    createRevoGridSheetHistory,
    RevoGridSheetHistoryError
} from "./revoGridSheetHistory.js";
import {
    createRevoGridHistoryCoordinator,
    revoGridSheetHistoryEvents
} from "./revoGridHistoryCoordinator.js";

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function expectEngineError(action, code) {
    let thrown = null;
    try {
        action();
    } catch (error) {
        thrown = error;
    }
    assert(thrown instanceof RevoGridChangeEngineError, `Expected engine error '${code}'.`);
    assert(thrown.code === code, `Expected engine error '${code}', got '${thrown.code}'.`);
}

function expectHistoryError(action, code) {
    let thrown = null;
    try {
        action();
    } catch (error) {
        thrown = error;
    }
    assert(thrown instanceof RevoGridSheetHistoryError, `Expected history error '${code}'.`);
    assert(thrown.code === code, `Expected history error '${code}', got '${thrown.code}'.`);
}

function recordChange(engine, kind, changes, applied = null) {
    const captureId = engine.captureBefore({
        kind,
        label: kind,
        changes: changes.map(change => ({
            clientKey: change.clientKey,
            field: change.field,
            before: change.before,
            proposedAfter: change.after
        }))
    });

    return engine.finalizeAfter(
        captureId,
        (applied ?? changes).map(change => ({
            clientKey: change.clientKey,
            field: change.field,
            after: change.after
        }))
    );
}

function testChangeEngineOwnsDirtyNotHistory() {
    const engine = createRevoGridChangeEngine({ datasetKey: "2026" });
    const result = recordChange(engine, "cell-edit", [
        { clientKey: "row:1", field: "basket", before: "A", after: "B" }
    ]);

    assert(result.recorded, "Edit was not finalized.");
    assert(result.changeSet.operations.length === 1, "Change Set is wrong.");
    assert(engine.getState().dirtyCellCount === 1, "Dirty delta was not tracked.");
    assert(engine.getState().undoCount === undefined, "Change Engine must not own Undo stack.");
}

function testReturnToBaselinePrunesDirtyTracker() {
    const engine = createRevoGridChangeEngine({ datasetKey: "2026" });
    recordChange(engine, "cell-edit", [
        { clientKey: "row:2", field: "basket", before: "A", after: "B" }
    ]);

    engine.applyExternalChanges([
        { clientKey: "row:2", field: "basket", before: "B", after: "A" }
    ]);

    const state = engine.getState();
    assert(!state.dirty, "Returning to Baseline must clear Dirty.");
    assert(state.trackedCellCount === 0, "Clean touched cell should be released from Dirty memory.");
}

function testMultiCellProducesOneChangeSet() {
    const engine = createRevoGridChangeEngine({ datasetKey: "2026" });
    const result = recordChange(engine, "paste", [
        { clientKey: "r1", field: "a", before: "1", after: "11" },
        { clientKey: "r1", field: "b", before: "2", after: "22" },
        { clientKey: "r2", field: "a", before: "3", after: "33" },
        { clientKey: "r2", field: "b", before: "4", after: "44" }
    ]);

    assert(result.changeSet.operations.length === 4, "Multi-cell Change Set must contain all applied cells.");
    assert(engine.getState().dirtyCellCount === 4, "Four changed cells should be Dirty.");
}

function testAppliedSubsetOnly() {
    const engine = createRevoGridChangeEngine({ datasetKey: "2026" });
    const result = recordChange(
        engine,
        "paste",
        [
            { clientKey: "r1", field: "a", before: "1", after: "11" },
            { clientKey: "r1", field: "readonly", before: "2", after: "22" }
        ],
        [
            { clientKey: "r1", field: "a", before: "1", after: "11" }
        ]
    );

    assert(result.changeSet.operations.length === 1, "Only applied cells should enter the Change Set.");
    assert(engine.getState().dirtyCellCount === 1, "Only applied cell should be Dirty.");
}

function testSaveMovesBaselineThenHistoryReplayCanBecomeDirty() {
    const engine = createRevoGridChangeEngine({ datasetKey: "2026" });
    recordChange(engine, "cell-edit", [
        { clientKey: "r3", field: "basket", before: "A", after: "B" }
    ]);

    const save = engine.beginSave();
    engine.acceptSave(save.id);
    assert(!engine.getState().dirty, "Successful Save must advance Baseline.");
    assert(engine.getState().trackedCellCount === 0, "Clean saved cell should be released.");

    // Simulate Sheet History Undo after Save: current B -> old value A.
    engine.applyExternalChanges([
        { clientKey: "r3", field: "basket", before: "B", after: "A" }
    ]);
    const dirty = engine.getDirtyCells();
    assert(dirty.length === 1, "Undo after Save must become Dirty again.");
    assert(dirty[0].baseline === "B", "New Baseline must be the server-saved value B.");
    assert(dirty[0].current === "A", "Replay target must be A.");
}

function testInFlightSaveKeepsNewerEditSafely() {
    const engine = createRevoGridChangeEngine({ datasetKey: "2026" });
    recordChange(engine, "cell-edit", [
        { clientKey: "r4", field: "basket", before: "A", after: "B" }
    ]);
    const save = engine.beginSave();

    recordChange(engine, "cell-edit", [
        { clientKey: "r4", field: "basket", before: "B", after: "A" }
    ]);
    assert(!engine.getState().dirty, "Browser can temporarily return to old Baseline while Save is in flight.");
    assert(engine.getState().trackedCellCount === 1, "In-flight Save must retain the touched cell until server result.");

    engine.acceptSave(save.id);
    const dirty = engine.getDirtyCells();
    assert(dirty.length === 1, "Newer browser value must remain Dirty after server accepts older snapshot.");
    assert(dirty[0].baseline === "B", "Accepted server snapshot should become Baseline B.");
    assert(dirty[0].current === "A", "Current browser value A must be preserved.");
}

function testRejectedSaveKeepsOriginalBaseline() {
    const engine = createRevoGridChangeEngine({ datasetKey: "2026" });
    recordChange(engine, "cell-edit", [
        { clientKey: "r5", field: "basket", before: "A", after: "B" }
    ]);
    const save = engine.beginSave();
    engine.rejectSave(save.id);
    const dirty = engine.getDirtyCells();
    assert(dirty[0].baseline === "A" && dirty[0].current === "B", "Failed Save changed Baseline/Current.");
}

function testDatasetRulesStayInChangeEngine() {
    const engine = createRevoGridChangeEngine({ datasetKey: "2026" });
    recordChange(engine, "cell-edit", [
        { clientKey: "r6", field: "basket", before: "A", after: "B" }
    ]);
    expectEngineError(() => engine.resetDataset("2025"), "DIRTY_DATASET");

    engine.applyExternalChanges([
        { clientKey: "r6", field: "basket", before: "B", after: "A" }
    ]);
    engine.resetDataset("2025");
    assert(engine.getState().datasetKey === "2025", "Clean dataset switch failed.");
}

function testStaleTransitionRejected() {
    const engine = createRevoGridChangeEngine({ datasetKey: "2026" });
    recordChange(engine, "cell-edit", [
        { clientKey: "r7", field: "basket", before: "A", after: "B" }
    ]);
    expectEngineError(() => engine.applyExternalChanges([
        { clientKey: "r7", field: "basket", before: "A", after: "C" }
    ]), "STALE_CURRENT");
}

function testNoOpCreatesNoDirty() {
    const engine = createRevoGridChangeEngine({ datasetKey: "2026" });
    const result = recordChange(engine, "cell-edit", [
        { clientKey: "r8", field: "basket", before: "A", after: "A" }
    ]);
    assert(!result.recorded, "No-op should not produce a Change Set.");
    assert(!engine.getState().dirty, "No-op created Dirty state.");
}

function historyEntry(label, payload = {}) {
    return {
        adapterKey: "data-cell-set",
        kind: "cell-edit",
        label,
        focusTarget: { clientKey: `row:${label}`, field: "basket" },
        payload
    };
}

function testSheetHistorySeparatesTransactions() {
    const history = createRevoGridSheetHistory({ datasetKey: "2026" });
    history.record(historyEntry("1"));
    history.record(historyEntry("2"));
    history.record(historyEntry("3"));

    const firstUndo = history.planUndo();
    assert(firstUndo.entry.label === "3", "First Undo must target latest separate action only.");
    history.commitReplay(firstUndo.replayId);
    assert(history.getState().undoCount === 2 && history.getState().redoCount === 1, "One Undo must move exactly one entry.");

    const secondUndo = history.planUndo();
    assert(secondUndo.entry.label === "2", "Second Undo must target the next action.");
    history.commitReplay(secondUndo.replayId);
}

function testSheetHistoryNewActionClearsRedo() {
    const history = createRevoGridSheetHistory({ datasetKey: "2026" });
    history.record(historyEntry("A"));
    history.record(historyEntry("B"));
    const undo = history.planUndo();
    history.commitReplay(undo.replayId);
    assert(history.getState().redoCount === 1, "Redo precondition failed.");
    history.record(historyEntry("C"));
    assert(history.getState().redoCount === 0, "New action after Undo must clear Redo.");
}

function testSheetHistoryMultiCellPayloadIsOneAction() {
    const history = createRevoGridSheetHistory({ datasetKey: "2026" });
    history.record(historyEntry("paste", {
        operations: [1, 2, 3, 4].map(value => ({ value }))
    }));
    assert(history.getState().undoCount === 1, "One Paste payload must be one History entry.");
}

function testSheetHistoryMemoryBudget() {
    const history = createRevoGridSheetHistory({
        datasetKey: "2026",
        maxHistoryBytes: 1024
    });
    history.record(historyEntry("A", { text: "A".repeat(2500) }));
    history.record(historyEntry("B", { text: "B".repeat(2500) }));
    history.record(historyEntry("C", { text: "C".repeat(2500) }));
    assert(history.getState().undoCount === 1, "History budget should evict oldest entries.");
    assert(history.getState().historyOverBudget, "Newest oversized entry should remain undoable.");
}

function testSheetHistoryDatasetReset() {
    const history = createRevoGridSheetHistory({ datasetKey: "2026" });
    history.record(historyEntry("A"));
    history.resetDataset("2025");
    const state = history.getState();
    assert(state.datasetKey === "2025", "History dataset did not change.");
    assert(state.undoCount === 0 && state.redoCount === 0, "Year switch must clear History.");
}

function testSheetHistoryReplayGuard() {
    const history = createRevoGridSheetHistory({ datasetKey: "2026" });
    history.record(historyEntry("A"));
    const plan = history.planUndo();
    expectHistoryError(() => history.record(historyEntry("B")), "REPLAY_ACTIVE");
    history.cancelReplay(plan.replayId);
}

class MockGrid extends EventTarget {
    constructor() {
        super();
        this.visibleRows = [
            { clientKey: "row:1", basket: "B" },
            { clientKey: "row:2", basket: "X" }
        ];
        this.columns = [
            { prop: "workOrderNumber" },
            { prop: "basket" }
        ];
        this.calls = [];
    }

    async getVisibleSource() {
        return this.visibleRows;
    }

    async getColumns() {
        return this.columns;
    }

    async scrollToRow(y) {
        this.calls.push(["scrollToRow", y]);
    }

    async scrollToColumnProp(prop, colType) {
        this.calls.push(["scrollToColumnProp", prop, colType]);
    }

    async setCellsFocus(start, end, colType, rowType) {
        this.calls.push(["setCellsFocus", start, end, colType, rowType]);
    }
}

async function testCoordinatorUsesOneReplayPathAndFocusesTarget() {
    const grid = new MockGrid();
    const coordinator = createRevoGridHistoryCoordinator({
        grid,
        datasetKey: "2026"
    });

    const lifecycle = [];
    grid.addEventListener(revoGridSheetHistoryEvents.beforeReplay, () => lifecycle.push("before"));
    grid.addEventListener(revoGridSheetHistoryEvents.afterReplay, () => lifecycle.push("after"));

    let appliedDirection = null;
    coordinator.registerAdapter("data-cell-set", {
        async apply(_entry, direction) {
            appliedDirection = direction;
            grid.visibleRows[0].basket = direction === "undo" ? "A" : "B";
        }
    });

    coordinator.record({
        adapterKey: "data-cell-set",
        kind: "cell-edit",
        label: "basket",
        focusTarget: { clientKey: "row:1", field: "basket" },
        payload: { operations: [{ before: "A", after: "B" }] }
    });

    await coordinator.undo();

    assert(appliedDirection === "undo", "Coordinator did not delegate replay to the registered adapter.");
    assert(lifecycle.join(",") === "before,after", "Replay lifecycle events are wrong.");
    assert(coordinator.getState().redoCount === 1, "Coordinator did not commit one Undo.");
    const focusCall = grid.calls.find(call => call[0] === "setCellsFocus");
    assert(Boolean(focusCall), "Successful replay did not return focus to the affected cell.");
    assert(focusCall[1].x === 1 && focusCall[1].y === 0, "Focused coordinates are wrong.");
}


async function testCoordinatorRejectsOverlappingReplay() {
    const grid = new MockGrid();
    const coordinator = createRevoGridHistoryCoordinator({ grid, datasetKey: "2026" });

    let release;
    const wait = new Promise(resolve => { release = resolve; });
    coordinator.registerAdapter("data-cell-set", {
        async apply() {
            await wait;
        }
    });
    coordinator.record(historyEntry("A"));

    const first = coordinator.undo();
    await Promise.resolve();
    const second = await coordinator.undo();
    assert(second === false, "A second Undo must not start while replay is active.");
    release();
    await first;
    assert(coordinator.getState().redoCount === 1, "The first replay did not complete normally.");
}

async function testCoordinatorCanceledReplayDoesNotMoveHistory() {
    const grid = new MockGrid();
    const coordinator = createRevoGridHistoryCoordinator({ grid, datasetKey: "2026" });
    coordinator.registerAdapter("data-cell-set", { async apply() {} });
    coordinator.record(historyEntry("A"));
    grid.addEventListener(revoGridSheetHistoryEvents.beforeReplay, event => event.preventDefault(), { once: true });
    const changed = await coordinator.undo();
    assert(!changed, "Canceled replay should report false.");
    assert(coordinator.getState().undoCount === 1, "Canceled replay moved History.");
}

const TESTS = [
    ["Change Engine owns Dirty, not History", testChangeEngineOwnsDirtyNotHistory],
    ["Return to Baseline prunes Dirty tracker", testReturnToBaselinePrunesDirtyTracker],
    ["Multi-cell change stays one Change Set", testMultiCellProducesOneChangeSet],
    ["Applied subset only", testAppliedSubsetOnly],
    ["Save Baseline + replay after Save", testSaveMovesBaselineThenHistoryReplayCanBecomeDirty],
    ["In-flight Save keeps newer browser value", testInFlightSaveKeepsNewerEditSafely],
    ["Rejected Save keeps original Baseline", testRejectedSaveKeepsOriginalBaseline],
    ["Dirty/Clean dataset rules", testDatasetRulesStayInChangeEngine],
    ["Stale replay transition rejected", testStaleTransitionRejected],
    ["No-op creates no Dirty", testNoOpCreatesNoDirty],
    ["Sheet History separates transactions", testSheetHistorySeparatesTransactions],
    ["New action after Undo clears Redo", testSheetHistoryNewActionClearsRedo],
    ["Multi-cell payload is one History action", testSheetHistoryMultiCellPayloadIsOneAction],
    ["Sheet History uses memory budget", testSheetHistoryMemoryBudget],
    ["Year/dataset switch clears Sheet History", testSheetHistoryDatasetReset],
    ["Sheet History blocks record during replay", testSheetHistoryReplayGuard],
    ["Coordinator replay path + focus", testCoordinatorUsesOneReplayPathAndFocusesTarget],
    ["Coordinator blocks overlapping replay", testCoordinatorRejectsOverlappingReplay],
    ["Canceled replay leaves History untouched", testCoordinatorCanceledReplayDoesNotMoveHistory]
];

export async function runRevoGridChangeEngineSelfTests() {
    const results = [];

    for (const [name, test] of TESTS) {
        const startedAt = performance.now();
        try {
            await test();
            results.push({
                name,
                status: "PASS",
                durationMs: performance.now() - startedAt,
                error: null
            });
        } catch (error) {
            results.push({
                name,
                status: "FAIL",
                durationMs: performance.now() - startedAt,
                error: error?.stack || error?.message || String(error)
            });
        }
    }

    return {
        engine: "RevoGrid Sheet History + Change Engine Foundation",
        version: "Gate 5B-1 History Refactor",
        passed: results.filter(result => result.status === "PASS").length,
        failed: results.filter(result => result.status === "FAIL").length,
        total: results.length,
        results
    };
}
