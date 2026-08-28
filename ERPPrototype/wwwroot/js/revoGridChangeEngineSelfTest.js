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
import {
    calculateMinimalRevealCoordinate,
    createRevoGridHistoryFocus
} from "./revoGridHistoryFocus.js";
import { createRevoGridChangeBridge } from "./revoGridChangeBridge.js";
import {
    calculateRemainingAmount,
    validateFinancialInputs
} from "./workOrderFinancialRules.js";
import { createRevoGridValidation } from "./revoGridValidation.js";
import { createRevoGridPersistenceIdentity } from "./revoGridPersistenceIdentity.js";
import {
    classifyRevoGridSelection,
    createRevoGridSelectionContext,
    isCellInsideSelectionRange
} from "./revoGridSelectionContext.js";
import {
    planDisplayOrderBatchInsertion,
    restoreDeletedItemsByIndex
} from "./revoGridRowStructure.js";
import {
    planColumnBatchInsertion,
    planColumnWorkspaceInsertion,
    revoGridColumnWorkspaceInternals
} from "./revoGridColumnWorkspace.js";
import {
    createRevoGridStructureCommands,
    REVO_GRID_STRUCTURE_COMMANDS
} from "./revoGridStructureCommands.js";

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
            { clientKey: "row:2", basket: "X" },
            { clientKey: "row:3", basket: "Y" },
            { clientKey: "row:4", basket: "Z" }
        ];
        this.columns = [
            { prop: "workOrderNumber" },
            { prop: "basket" },
            { prop: "notes" }
        ];
        this.calls = [];
        this.rowViewport = { current: 0, size: 66 };
        this.colViewport = { current: 0, size: 200 };
    }

    async getVisibleSource() {
        return this.visibleRows;
    }

    async getColumns() {
        return this.columns;
    }

    async getProviders() {
        const makeViewport = state => ({
            get lastCoordinate() {
                return state.current;
            },
            store: {
                get(key) {
                    if (key === "virtualSize" || key === "clientSize") {
                        return state.size;
                    }
                    return undefined;
                }
            }
        });
        const makeDimension = (originItemSize, count) => ({
            getCurrentState() {
                return {
                    sizes: {},
                    originItemSize,
                    realSize: originItemSize * count
                };
            }
        });

        return {
            column: {
                getColumnByProp: prop =>
                    this.columns.find(column => String(column?.prop ?? "") === String(prop)),
                getColumnIndexByProp: (prop, colType) =>
                    this.columns
                        .filter(column => (column.pin || "rgCol") === colType)
                        .findIndex(column => String(column?.prop ?? "") === String(prop))
            },
            dimension: {
                stores: {
                    rgRow: makeDimension(22, this.visibleRows.length),
                    rgCol: makeDimension(100, this.columns.length)
                },
                getViewPortPos({ coordinate, dimension }) {
                    return coordinate * (dimension === "rgRow" ? 22 : 100);
                }
            },
            viewport: {
                stores: {
                    rgRow: makeViewport(this.rowViewport),
                    rgCol: makeViewport(this.colViewport)
                }
            }
        };
    }

    async refresh(type) {
        this.calls.push(["refresh", type]);
    }

    async scrollToCoordinate(cell) {
        this.calls.push(["scrollToCoordinate", { ...cell }]);
        if (typeof cell?.y === "number") {
            this.rowViewport.current = cell.y;
        }
        if (typeof cell?.x === "number") {
            this.colViewport.current = cell.x;
        }
    }

    async setCellsFocus(start, end, colType, rowType) {
        this.calls.push(["setCellsFocus", start, end, colType, rowType]);
    }
}

function testMinimalRevealKeepsVisibleViewportStill() {
    assert(
        calculateMinimalRevealCoordinate({
            currentCoordinate: 0,
            viewportSize: 66,
            itemStart: 22,
            itemSize: 22,
            contentSize: 220
        }) === null,
        "A visible cell must not move the viewport."
    );

    assert(
        calculateMinimalRevealCoordinate({
            currentCoordinate: 30,
            viewportSize: 44,
            itemStart: 22,
            itemSize: 22,
            contentSize: 220
        }) === null,
        "A partially visible cell must not move the viewport."
    );
}

function testMinimalRevealMovesOnlyToNearestEdge() {
    const below = calculateMinimalRevealCoordinate({
        currentCoordinate: 0,
        viewportSize: 44,
        itemStart: 66,
        itemSize: 22,
        contentSize: 220
    });
    assert(below === 44, `Below-cell minimal reveal expected 44, got ${below}.`);

    const above = calculateMinimalRevealCoordinate({
        currentCoordinate: 66,
        viewportSize: 44,
        itemStart: 22,
        itemSize: 22,
        contentSize: 220
    });
    assert(above === 22, `Above-cell minimal reveal expected 22, got ${above}.`);
}

async function testHistoryFocusVisibleCellDoesNotScroll() {
    const grid = new MockGrid();
    const focus = createRevoGridHistoryFocus({ grid });

    await focus.focusTarget({ clientKey: "row:2", field: "basket" });

    const focusCalls = grid.calls.filter(call => call[0] === "setCellsFocus");
    const scrollCalls = grid.calls.filter(call => call[0] === "scrollToCoordinate");
    assert(focusCalls.length === 1, "Visible target was not selected.");
    assert(scrollCalls.length === 0, "Visible target must not move the viewport.");
}

async function testHistoryFocusOffscreenCellUsesMinimalScroll() {
    const grid = new MockGrid();
    grid.rowViewport.size = 44;
    const focus = createRevoGridHistoryFocus({ grid });

    await focus.focusTarget({ clientKey: "row:4", field: "basket" });

    const scrollCall = grid.calls.find(call => call[0] === "scrollToCoordinate");
    assert(Boolean(scrollCall), "Off-screen target did not request reveal scroll.");
    assert(scrollCall[1].y === 44, `Expected minimal Y reveal 44, got ${scrollCall[1].y}.`);
    assert(scrollCall[1].x === undefined, "Visible horizontal position must not move.");
}

async function testHistoryFocusOffscreenColumnUsesMinimalScroll() {
    const grid = new MockGrid();
    const focus = createRevoGridHistoryFocus({ grid });

    await focus.focusTarget({ clientKey: "row:2", field: "notes" });

    const scrollCall = grid.calls.find(call => call[0] === "scrollToCoordinate");
    assert(Boolean(scrollCall), "Off-screen column did not request reveal scroll.");
    assert(scrollCall[1].x === 100, `Expected minimal X reveal 100, got ${scrollCall[1].x}.`);
    assert(scrollCall[1].y === undefined, "Visible vertical position must not move.");
}

async function testPinnedHistoryFocusNeverScrollsCentralViewport() {
    const grid = new MockGrid();
    grid.columns.unshift({ prop: "pinned", pin: "colPinStart" });
    const focus = createRevoGridHistoryFocus({ grid });

    await focus.focusTarget({ clientKey: "row:2", field: "pinned" });

    assert(
        !grid.calls.some(call => call[0] === "scrollToCoordinate"),
        "Pinned target must not scroll the central viewport."
    );
}

async function testCoordinatorUsesOneReplayPathAndFocusesTarget() {
    const grid = new MockGrid();
    const historyFocus = createRevoGridHistoryFocus({ grid });
    const coordinator = createRevoGridHistoryCoordinator({
        grid,
        datasetKey: "2026",
        focusTarget: target => historyFocus.focusTarget(target)
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
    assert(!grid.calls.some(call => call[0] === "scrollToCoordinate"), "Already visible replay target moved the viewport.");
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


class BridgeMockGrid extends EventTarget {
    constructor(rows) {
        super();
        this.rows = rows;
        this.calls = [];
    }

    async refresh(type) {
        this.calls.push(["refresh", type]);
    }
}

function dispatchGridEvent(grid, type, detail) {
    const event = new CustomEvent(type, {
        detail,
        cancelable: true
    });
    grid.dispatchEvent(event);
    return event;
}

function makeRangeDetail(rows, data) {
    const models = {};
    for (const key of Object.keys(data)) {
        models[key] = rows[Number(key)];
    }
    return {
        data,
        models,
        type: "rgRow",
        colType: "rgCol",
        range: { x: 0, y: 0, x1: 1, y1: Math.max(0, Object.keys(data).length - 1) },
        newRange: { x: 0, y: 0, x1: 1, y1: Math.max(0, Object.keys(data).length - 1) },
        oldRange: { x: 0, y: 0, x1: 0, y1: 0 }
    };
}

function makeCellDetail(row, field, value) {
    return {
        model: row,
        prop: field,
        rowIndex: 0,
        val: value
    };
}

function applyRevoRangeClear(grid, rows, data) {
    const detail = makeRangeDetail(rows, data);
    detail.oldRange = { ...detail.newRange };

    const beforeRange = dispatchGridEvent(grid, "beforerangeedit", detail);
    assert(!beforeRange.defaultPrevented, "Qualified Range Clear was blocked.");

    for (const [rowIndexText, changedRow] of Object.entries(data)) {
        const row = rows[Number(rowIndexText)];
        for (const [field, next] of Object.entries(changedRow)) {
            row[field] = next;
        }
    }

    dispatchGridEvent(grid, "afteredit", detail);
}

function testFinancialRulesRejectInvalidRemaining() {
    assert(
        calculateRemainingAmount(100000, null) === 100000,
        "An empty Partial Amount must leave the full Work Order Value remaining."
    );
    assert(
        calculateRemainingAmount(100000, 20000) === 80000,
        "A valid Partial Amount must be subtracted from Work Order Value."
    );
    assert(
        calculateRemainingAmount(100000, 0) === 100000,
        "Partial Amount zero must normalize to the empty calculation state."
    );
    assert(
        calculateRemainingAmount(100000, -500) === null,
        "A negative Partial Amount must blank Remaining Amount."
    );
    assert(
        calculateRemainingAmount(100000, 120000) === null,
        "An excessive Partial Amount must blank Remaining Amount."
    );
    assert(
        calculateRemainingAmount(0, 20000) === null,
        "An invalid Work Order Value must blank Remaining Amount."
    );
    assert(
        validateFinancialInputs(0, 20000).length >= 2,
        "The cross-field invalid state must mark the financial inputs."
    );
}

async function testPartialZeroIsOneUndoableNormalizedEdit() {
    const rows = [{
        clientKey: "financial:1",
        workOrderValue: 100000,
        partialAmount: 20000,
        remainingAmount: 80000
    }];
    const grid = new BridgeMockGrid(rows);
    const coordinator = createRevoGridHistoryCoordinator({ grid, datasetKey: "2026" });
    const bridge = createRevoGridChangeBridge({
        grid,
        rows,
        datasetKey: "2026",
        historyCoordinator: coordinator,
        allowPaste: true
    });

    const before = dispatchGridEvent(
        grid,
        "beforeedit",
        makeCellDetail(rows[0], "partialAmount", "0")
    );
    assert(!before.defaultPrevented, "Manual financial edit was blocked.");
    rows[0].partialAmount = "0";
    dispatchGridEvent(
        grid,
        "afteredit",
        makeCellDetail(rows[0], "partialAmount", "0")
    );

    assert(rows[0].partialAmount === null, "Partial zero was not normalized to empty.");
    assert(rows[0].remainingAmount === 100000, "Remaining did not recalculate after zero normalization.");
    assert(coordinator.getState().undoCount === 1, "Zero normalization must create one logical History action.");

    await coordinator.undo();
    assert(rows[0].partialAmount === 20000, "Undo did not restore the prior Partial Amount.");
    assert(rows[0].remainingAmount === 80000, "Undo did not restore the prior Remaining Amount.");

    await coordinator.redo();
    assert(rows[0].partialAmount === null, "Redo did not restore normalized empty Partial Amount.");
    assert(rows[0].remainingAmount === 100000, "Redo did not restore derived Remaining Amount.");

    bridge.destroy();
    coordinator.destroy();
}

function applyRevoPaste(grid, rows, data) {
    const detail = makeRangeDetail(rows, data);
    const pasteEvent = dispatchGridEvent(grid, "clipboardrangepaste", detail);
    assert(!pasteEvent.defaultPrevented, "Qualified Paste was blocked at clipboardrangepaste.");

    const beforeRange = dispatchGridEvent(grid, "beforerangeedit", detail);
    assert(!beforeRange.defaultPrevented, "Qualified Paste was blocked at beforerangeedit.");

    for (const [rowIndexText, changedRow] of Object.entries(data)) {
        const row = rows[Number(rowIndexText)];
        for (const [field, next] of Object.entries(changedRow)) {
            row[field] = next;
        }
    }

    dispatchGridEvent(grid, "afteredit", detail);
}

async function testPasteBridgeCreatesOneHistoryTransaction() {
    const rows = [
        { clientKey: "r1", a: "1", b: "2" },
        { clientKey: "r2", a: "3", b: "4" }
    ];
    const grid = new BridgeMockGrid(rows);
    const coordinator = createRevoGridHistoryCoordinator({ grid, datasetKey: "2026" });
    const bridge = createRevoGridChangeBridge({
        grid,
        rows,
        datasetKey: "2026",
        historyCoordinator: coordinator,
        allowPaste: true
    });

    applyRevoPaste(grid, rows, {
        0: { a: "11", b: "22" },
        1: { a: "33", b: "44" }
    });

    assert(coordinator.getState().undoCount === 1, "One 2x2 Paste must create one History entry.");
    assert(bridge.getState().dirtyCellCount === 4, "2x2 Paste should make four cells Dirty.");

    await coordinator.undo();
    assert(rows[0].a === "1" && rows[0].b === "2", "Undo did not restore first pasted row.");
    assert(rows[1].a === "3" && rows[1].b === "4", "Undo did not restore second pasted row.");
    assert(bridge.getState().dirtyCellCount === 0, "Undo of unsaved Paste should return to Clean.");
    assert(coordinator.getState().redoCount === 1, "Paste Undo should create one Redo entry.");

    await coordinator.redo();
    assert(rows[0].a === "11" && rows[0].b === "22", "Redo did not restore first pasted row.");
    assert(rows[1].a === "33" && rows[1].b === "44", "Redo did not restore second pasted row.");

    bridge.destroy();
    coordinator.destroy();
}


async function testLargePaste5000StaysOneHistoryAction() {
    const rows = Array.from({ length: 5000 }, (_, index) => ({
        clientKey: `large:${index}`,
        value: `old-${index}`
    }));
    const data = {};
    for (let index = 0; index < rows.length; index++) {
        data[index] = { value: `new-${index}` };
    }

    const grid = new BridgeMockGrid(rows);
    const coordinator = createRevoGridHistoryCoordinator({ grid, datasetKey: "2026" });
    const bridge = createRevoGridChangeBridge({
        grid,
        rows,
        datasetKey: "2026",
        historyCoordinator: coordinator,
        allowPaste: true
    });

    applyRevoPaste(grid, rows, data);
    assert(coordinator.getState().undoCount === 1, "Paste 5000 must remain one History action.");
    assert(bridge.getState().dirtyCellCount === 5000, "Paste 5000 Dirty count is wrong.");

    await coordinator.undo();
    assert(rows[0].value === "old-0", "Paste 5000 Undo did not restore first cell.");
    assert(rows[4999].value === "old-4999", "Paste 5000 Undo did not restore last cell.");
    assert(!bridge.getState().dirty, "Paste 5000 Undo should return unsaved dataset to Clean.");

    bridge.destroy();
    coordinator.destroy();
}

async function testSeparatePastesStaySeparateHistoryActions() {
    const rows = [
        { clientKey: "r1", a: "1" },
        { clientKey: "r2", a: "2" }
    ];
    const grid = new BridgeMockGrid(rows);
    const coordinator = createRevoGridHistoryCoordinator({ grid, datasetKey: "2026" });
    const bridge = createRevoGridChangeBridge({
        grid,
        rows,
        datasetKey: "2026",
        historyCoordinator: coordinator,
        allowPaste: true
    });

    applyRevoPaste(grid, rows, { 0: { a: "10" } });
    applyRevoPaste(grid, rows, { 1: { a: "20" } });
    assert(coordinator.getState().undoCount === 2, "Two separate Paste actions must remain two History entries.");

    await coordinator.undo();
    assert(rows[0].a === "10", "Undo of second Paste must not touch first Paste.");
    assert(rows[1].a === "2", "Undo should restore only the latest separate Paste.");
    assert(coordinator.getState().undoCount === 1, "One Undo should remove one Paste action only.");

    bridge.destroy();
    coordinator.destroy();
}

async function testSingleCellDeleteStillUsesCellEditPath() {
    const rows = [{ clientKey: "single-clear", a: "1" }];
    const grid = new BridgeMockGrid(rows);
    const coordinator = createRevoGridHistoryCoordinator({ grid, datasetKey: "2026" });
    const bridge = createRevoGridChangeBridge({
        grid,
        rows,
        datasetKey: "2026",
        historyCoordinator: coordinator,
        allowPaste: true,
        allowRangeClear: true
    });

    const before = dispatchGridEvent(
        grid,
        "beforeedit",
        makeCellDetail(rows[0], "a", "")
    );
    assert(!before.defaultPrevented, "Single-cell Delete was incorrectly blocked by Range Clear support.");

    rows[0].a = "";
    dispatchGridEvent(
        grid,
        "afteredit",
        makeCellDetail(rows[0], "a", "")
    );

    assert(coordinator.getState().undoCount === 1, "Single-cell Delete must remain one cell-edit History action.");
    await coordinator.undo();
    assert(rows[0].a === "1", "Single-cell Delete Undo did not restore the value.");

    bridge.destroy();
    coordinator.destroy();
}

async function testRangeClearCreatesOneHistoryTransaction() {
    const rows = [
        { clientKey: "r1", a: "1", b: "2" },
        { clientKey: "r2", a: "3", b: "4" }
    ];
    const grid = new BridgeMockGrid(rows);
    const coordinator = createRevoGridHistoryCoordinator({ grid, datasetKey: "2026" });
    const bridge = createRevoGridChangeBridge({
        grid,
        rows,
        datasetKey: "2026",
        historyCoordinator: coordinator,
        allowPaste: true,
        allowRangeClear: true
    });

    applyRevoRangeClear(grid, rows, {
        0: { a: "", b: "" },
        1: { a: "", b: "" }
    });

    assert(coordinator.getState().undoCount === 1, "One 2x2 Range Clear must create one History entry.");
    assert(bridge.getState().dirtyCellCount === 4, "2x2 Range Clear should make four cells Dirty.");
    assert(rows[0].a === "" && rows[0].b === "", "Range Clear did not clear first row.");
    assert(rows[1].a === "" && rows[1].b === "", "Range Clear did not clear second row.");

    await coordinator.undo();
    assert(rows[0].a === "1" && rows[0].b === "2", "Range Clear Undo did not restore first row.");
    assert(rows[1].a === "3" && rows[1].b === "4", "Range Clear Undo did not restore second row.");
    assert(!bridge.getState().dirty, "Undo of unsaved Range Clear should return to Clean.");

    await coordinator.redo();
    assert(rows[0].a === "" && rows[0].b === "", "Range Clear Redo did not clear first row.");
    assert(rows[1].a === "" && rows[1].b === "", "Range Clear Redo did not clear second row.");

    bridge.destroy();
    coordinator.destroy();
}

async function testRangeClearRecalculatesFinancialFields() {
    const rows = [{
        clientKey: "financial:range-clear",
        workOrderValue: 100000,
        partialAmount: 20000,
        remainingAmount: 80000
    }];
    const grid = new BridgeMockGrid(rows);
    const coordinator = createRevoGridHistoryCoordinator({ grid, datasetKey: "2026" });
    const bridge = createRevoGridChangeBridge({
        grid,
        rows,
        datasetKey: "2026",
        historyCoordinator: coordinator,
        allowPaste: true,
        allowRangeClear: true
    });

    const detail = makeRangeDetail(rows, {
        0: { partialAmount: "" }
    });
    // Revo filters readonly Remaining Amount out of the payload while keeping
    // the selected range shape. Native clear applies in place, so old/new range
    // are the same.
    detail.range.x1 = 1;
    detail.newRange.x1 = 1;
    detail.oldRange = { ...detail.newRange };

    const beforeRange = dispatchGridEvent(grid, "beforerangeedit", detail);
    assert(!beforeRange.defaultPrevented, "Financial Range Clear was blocked.");

    rows[0].partialAmount = "";
    dispatchGridEvent(grid, "afteredit", detail);

    assert(rows[0].remainingAmount === 100000, "Remaining did not recalculate after clearing Partial Amount.");
    assert(coordinator.getState().undoCount === 1, "Financial Range Clear must be one History action.");

    await coordinator.undo();
    assert(rows[0].partialAmount === 20000, "Undo did not restore cleared Partial Amount.");
    assert(rows[0].remainingAmount === 80000, "Undo did not restore derived Remaining Amount.");

    await coordinator.redo();
    assert(
        rows[0].partialAmount === "" || rows[0].partialAmount === null,
        "Redo did not restore cleared Partial Amount."
    );
    assert(rows[0].remainingAmount === 100000, "Redo did not recalculate Remaining Amount.");

    bridge.destroy();
    coordinator.destroy();
}

async function testBlankAutofillRangeRemainsBlocked() {
    const rows = [{ clientKey: "r1", a: "1", b: "2" }];
    const grid = new BridgeMockGrid(rows);
    const coordinator = createRevoGridHistoryCoordinator({ grid, datasetKey: "2026" });
    const bridge = createRevoGridChangeBridge({
        grid,
        rows,
        datasetKey: "2026",
        historyCoordinator: coordinator,
        allowPaste: true,
        allowRangeClear: true
    });
    const detail = makeRangeDetail(rows, { 0: { a: "", b: "" } });
    detail.oldRange = { x: 0, y: 0, x1: 0, y1: 0 };
    detail.newRange = { x: 0, y: 0, x1: 1, y1: 0 };

    const beforeRange = dispatchGridEvent(grid, "beforerangeedit", detail);
    assert(beforeRange.defaultPrevented, "Blank Autofill was incorrectly classified as Range Clear.");
    assert(!bridge.getState().dirty, "Blocked blank Autofill created Dirty state.");

    bridge.destroy();
    coordinator.destroy();
}

async function testBlankPasteKeepsPasteIdentity() {
    const rows = [{ clientKey: "r1", a: "1", b: "2" }];
    const grid = new BridgeMockGrid(rows);
    const coordinator = createRevoGridHistoryCoordinator({ grid, datasetKey: "2026" });
    const bridge = createRevoGridChangeBridge({
        grid,
        rows,
        datasetKey: "2026",
        historyCoordinator: coordinator,
        allowPaste: true,
        allowRangeClear: true
    });
    const detail = makeRangeDetail(rows, { 0: { a: "", b: "" } });
    detail.oldRange = { ...detail.newRange };

    const clipboard = dispatchGridEvent(grid, "clipboardrangepaste", detail);
    assert(!clipboard.defaultPrevented, "Blank Paste intent was blocked.");
    const beforeRange = dispatchGridEvent(grid, "beforerangeedit", detail);
    assert(!beforeRange.defaultPrevented, "Blank Paste was blocked by Range Clear classification.");

    rows[0].a = "";
    rows[0].b = "";
    dispatchGridEvent(grid, "afteredit", detail);

    assert(coordinator.getState().undoCount === 1, "Blank Paste should create one History action.");
    assert(bridge.getState().dirtyCellCount === 2, "Blank Paste should dirty the two pasted cells.");

    bridge.destroy();
    coordinator.destroy();
}

async function testNonBlankSameRangeMutationRemainsBlocked() {
    const rows = [{ clientKey: "r1", a: "1", b: "2" }];
    const grid = new BridgeMockGrid(rows);
    const coordinator = createRevoGridHistoryCoordinator({ grid, datasetKey: "2026" });
    const bridge = createRevoGridChangeBridge({
        grid,
        rows,
        datasetKey: "2026",
        historyCoordinator: coordinator,
        allowPaste: true,
        allowRangeClear: true
    });
    const detail = makeRangeDetail(rows, { 0: { a: "X", b: "" } });
    detail.oldRange = { ...detail.newRange };

    const beforeRange = dispatchGridEvent(grid, "beforerangeedit", detail);
    assert(beforeRange.defaultPrevented, "Nonblank same-range mutation bypassed the Range Clear gate.");
    assert(!bridge.getState().dirty, "Blocked nonblank range mutation created Dirty state.");

    bridge.destroy();
    coordinator.destroy();
}

function testGate5B1StillBlocksPaste() {
    const rows = [{ clientKey: "r1", a: "1" }];
    const grid = new BridgeMockGrid(rows);
    const coordinator = createRevoGridHistoryCoordinator({ grid, datasetKey: "2026" });
    const bridge = createRevoGridChangeBridge({
        grid,
        rows,
        datasetKey: "2026",
        historyCoordinator: coordinator,
        allowPaste: false
    });

    const event = dispatchGridEvent(grid, "clipboardrangepaste", makeRangeDetail(rows, { 0: { a: "10" } }));
    assert(event.defaultPrevented, "Gate 5B-1 must keep Paste blocked.");
    assert(coordinator.getState().undoCount === 0, "Blocked Paste must not enter History.");
    assert(!bridge.getState().dirty, "Blocked Paste must not create Dirty state.");

    bridge.destroy();
    coordinator.destroy();
}

function testNonPasteRangeMutationRemainsBlocked() {
    const rows = [{ clientKey: "r1", a: "1" }];
    const grid = new BridgeMockGrid(rows);
    const coordinator = createRevoGridHistoryCoordinator({ grid, datasetKey: "2026" });
    const bridge = createRevoGridChangeBridge({
        grid,
        rows,
        datasetKey: "2026",
        historyCoordinator: coordinator,
        allowPaste: true,
        allowRangeClear: true
    });

    const rangeEvent = dispatchGridEvent(grid, "beforerangeedit", makeRangeDetail(rows, { 0: { a: "10" } }));
    assert(rangeEvent.defaultPrevented, "Autofill/unqualified range mutation must remain blocked in Gate 5B-2.");
    assert(!bridge.getState().dirty, "Blocked range mutation created Dirty state.");

    bridge.destroy();
    coordinator.destroy();
}

async function testCanceledClipboardPasteDoesNotLeaveEngineBusy() {
    const rows = [{ clientKey: "r1", a: "1" }];
    const grid = new BridgeMockGrid(rows);
    const coordinator = createRevoGridHistoryCoordinator({ grid, datasetKey: "2026" });
    const bridge = createRevoGridChangeBridge({
        grid,
        rows,
        datasetKey: "2026",
        historyCoordinator: coordinator,
        allowPaste: true
    });

    grid.addEventListener("clipboardrangepaste", event => event.preventDefault(), { once: true });
    const event = dispatchGridEvent(grid, "clipboardrangepaste", makeRangeDetail(rows, { 0: { a: "10" } }));
    assert(event.defaultPrevented, "Test precondition: Paste should be canceled by later listener.");
    await Promise.resolve();
    assert(!bridge.getState().activeDataCapture, "Canceled Paste left a stale active capture.");

    bridge.destroy();
    coordinator.destroy();
}


function validValidationRow(clientKey, id = 1) {
    return {
        clientKey,
        id,
        displayOrder: id * 1000,
        workOrderNumber: String(100000000 + id).slice(-9),
        workTypeCode: "401",
        assignmentDate: "26/08/2026",
        workOrderValue: 100000,
        partialAmount: 20000,
        remainingAmount: 80000,
        basket: "تحت التنفيذ"
    };
}

const VALIDATION_BASKETS = ["تحت التنفيذ", "سلة الفحص"];

function testUnifiedValidationAllowsCompletelyBlankNewRow() {
    const row = {
        clientKey: "temp:blank",
        id: 0,
        workOrderNumber: "",
        workTypeCode: "",
        assignmentDate: "",
        workOrderValue: null,
        partialAmount: null,
        remainingAmount: null,
        basket: ""
    };
    const validation = createRevoGridValidation({
        rows: [row],
        basketValues: VALIDATION_BASKETS
    });
    const state = validation.getState();
    assert(state.validationInvalidCellCount === 0, "A completely blank new row must stay preparation-safe.");
    assert(state.canSave, "A completely blank new row should not block Save because it is not materialized data.");
    validation.destroy();
}

function testUnifiedValidationActivatesRequiredFieldsWhenNewRowStarts() {
    const row = {
        clientKey: "temp:started",
        id: 0,
        workOrderNumber: "123456789",
        workTypeCode: "",
        assignmentDate: "",
        workOrderValue: null,
        partialAmount: null,
        remainingAmount: null,
        basket: ""
    };
    const validation = createRevoGridValidation({
        rows: [row],
        basketValues: VALIDATION_BASKETS
    });
    const state = validation.getState();
    assert(state.validationInvalidCellCount === 3, "Starting a new row must activate Work Type, Work Order Value, and Basket requirements.");
    assert(!state.canSave, "An incomplete started row must block Save.");
    validation.destroy();
}

function testUnifiedValidationRequiresPersistedRowFields() {
    const row = {
        clientKey: "row:persisted-blank",
        id: 55,
        workOrderNumber: "",
        workTypeCode: "",
        assignmentDate: "",
        workOrderValue: null,
        partialAmount: null,
        remainingAmount: null,
        basket: ""
    };
    const validation = createRevoGridValidation({
        rows: [row],
        basketValues: VALIDATION_BASKETS
    });
    const state = validation.getState();
    assert(state.validationInvalidCellCount === 4, "Persisted blank row must require identity, value, and Basket.");
    assert(!state.canSave, "Persisted blank row must block Save.");
    validation.destroy();
}

function testUnifiedValidationKeepsInvalidInputVisible() {
    const row = validValidationRow("row:invalid-visible", 1);
    const validation = createRevoGridValidation({
        rows: [row],
        basketValues: VALIDATION_BASKETS
    });
    row.workOrderNumber = "123";
    const result = validation.refreshForOperations([{
        clientKey: row.clientKey,
        field: "workOrderNumber",
        before: "100000001",
        after: "123"
    }]);
    assert(row.workOrderNumber === "123", "Validation must never rewrite invalid employee input.");
    assert(result.validatedRows === 1, "Single-row edit should validate only the affected row.");
    assert(validation.getCellError(row.clientKey, "workOrderNumber")?.code === "identity-format", "Invalid identity was not marked.");
    assert(!validation.getState().canSave, "Invalid visible value must block Save.");
    validation.destroy();
}

function testUnifiedValidationDuplicatePeersUpdateIncrementally() {
    const first = validValidationRow("row:dup-1", 1);
    const second = validValidationRow("row:dup-2", 2);
    const validation = createRevoGridValidation({
        rows: [first, second],
        basketValues: VALIDATION_BASKETS
    });

    second.workOrderNumber = first.workOrderNumber;
    second.workTypeCode = first.workTypeCode;
    const duplicate = validation.refreshForOperations([
        { clientKey: second.clientKey, field: "workOrderNumber" },
        { clientKey: second.clientKey, field: "workTypeCode" }
    ]);
    assert(duplicate.validatedRows === 2, "Creating a duplicate should revalidate the touched row and its peer only.");
    assert(validation.getCellError(first.clientKey, "workOrderNumber")?.code === "duplicate", "Original duplicate peer was not marked.");
    assert(validation.getCellError(second.clientKey, "workTypeCode")?.code === "duplicate", "Edited duplicate row was not marked.");

    second.workOrderNumber = "999999999";
    const cleared = validation.refreshForOperations([
        { clientKey: second.clientKey, field: "workOrderNumber" }
    ]);
    assert(cleared.validatedRows === 2, "Breaking a duplicate should revalidate both former peers only.");
    assert(!validation.getCellError(first.clientKey, "workOrderNumber"), "Former duplicate peer error did not clear.");
    assert(!validation.getCellError(second.clientKey, "workOrderNumber"), "Edited row remained invalid after duplicate was fixed.");
    validation.destroy();
}

function testUnifiedValidationRowRemovalClearsDuplicatePeer() {
    const first = validValidationRow("row:dup-remove-1", 11);
    const second = validValidationRow("row:dup-remove-2", 12);
    second.workOrderNumber = first.workOrderNumber;
    second.workTypeCode = first.workTypeCode;

    const validation = createRevoGridValidation({
        rows: [first, second],
        basketValues: VALIDATION_BASKETS
    });

    assert(validation.getCellError(first.clientKey, "workOrderNumber")?.code === "duplicate", "Initial duplicate peer was not marked.");
    assert(validation.getCellError(second.clientKey, "workOrderNumber")?.code === "duplicate", "Initial duplicate row was not marked.");

    const result = validation.replaceRows([first]);
    assert(result.validatedRows === 1, "Removing a duplicate row should revalidate only the surviving peer.");
    assert(!validation.getCellError(first.clientKey, "workOrderNumber"), "Surviving peer kept a duplicate error after the other row was removed.");
    assert(validation.getState().canSave, "Removing the duplicate peer should restore a valid Save state.");
    validation.destroy();
}

function testUnifiedValidationCustomTypes() {
    const row = validValidationRow("row:custom", 3);
    row.customText = "x".repeat(251);
    row.customMoney = "abc";
    row.customDate = "31/02/2026";
    row.customNumber = "12.5";
    const validation = createRevoGridValidation({
        rows: [row],
        basketValues: VALIDATION_BASKETS,
        customColumns: [
            { fieldKey: "customText", name: "Text", dataType: "Text" },
            { fieldKey: "customMoney", name: "Money", dataType: "Money" },
            { fieldKey: "customDate", name: "Date", dataType: "Date" },
            { fieldKey: "customNumber", name: "Number", dataType: "Number" }
        ]
    });
    const state = validation.getState();
    assert(state.validationInvalidCellCount === 4, "All invalid custom-column types should be reported independently.");
    validation.destroy();
}

function testUnifiedValidationTenThousandRowsStaysIncremental() {
    const rows = Array.from({ length: 10000 }, (_, index) => {
        const row = validValidationRow(`row:perf-${index}`, index + 1);
        row.workOrderNumber = String(200000000 + index).slice(-9);
        return row;
    });
    const validation = createRevoGridValidation({
        rows,
        basketValues: VALIDATION_BASKETS
    });
    const before = validation.getState();
    assert(before.rowsValidated === 10000, "Initial validation must scan the dataset exactly once.");

    rows[5000].basket = "سلة الفحص";
    const result = validation.refreshForOperations([{
        clientKey: rows[5000].clientKey,
        field: "basket"
    }]);
    const after = validation.getState();
    assert(result.validatedRows === 1, "One ordinary edit must not rescan 10,000 rows.");
    assert(after.rowsValidated === 10001, "Incremental validation unexpectedly rescanned the dataset.");
    assert(after.fullValidationPasses === 1, "Ordinary edit triggered a second full validation pass.");
    validation.destroy();
}

async function testBridgeUndoRedoRefreshesUnifiedValidation() {
    const row = validValidationRow("row:bridge-validation", 4);
    const rows = [row];
    const grid = new BridgeMockGrid(rows);
    const coordinator = createRevoGridHistoryCoordinator({ grid, datasetKey: "2026" });
    const validation = createRevoGridValidation({
        rows,
        basketValues: VALIDATION_BASKETS
    });
    const bridge = createRevoGridChangeBridge({
        grid,
        rows,
        datasetKey: "2026",
        historyCoordinator: coordinator,
        allowPaste: true,
        allowRangeClear: true,
        validationOwner: validation
    });

    const original = row.workOrderNumber;
    const before = dispatchGridEvent(
        grid,
        "beforeedit",
        makeCellDetail(row, "workOrderNumber", "123")
    );
    assert(!before.defaultPrevented, "Unified Validation unexpectedly blocked the edit.");
    row.workOrderNumber = "123";
    dispatchGridEvent(
        grid,
        "afteredit",
        makeCellDetail(row, "workOrderNumber", "123")
    );
    assert(row.workOrderNumber === "123", "Invalid edit did not remain visible.");
    assert(validation.getCellError(row.clientKey, "workOrderNumber"), "Invalid edit did not create a validation error.");

    await coordinator.undo();
    assert(row.workOrderNumber === original, "Undo did not restore the original identity.");
    assert(!validation.getCellError(row.clientKey, "workOrderNumber"), "Undo did not clear the validation error.");

    await coordinator.redo();
    assert(row.workOrderNumber === "123", "Redo did not restore the invalid visible value.");
    assert(validation.getCellError(row.clientKey, "workOrderNumber"), "Redo did not restore the validation error.");

    bridge.destroy();
    validation.destroy();
    coordinator.destroy();
}


function testPersistenceIdentityTracksDeletedPersistedRow() {
    const row = {
        clientKey: "row:persisted",
        id: 41,
        rowVersion: "persisted-version",
        displayOrder: 10
    };
    const identity = createRevoGridPersistenceIdentity({ rows: [row] });
    const engine = createRevoGridChangeEngine({ datasetKey: "2026" });

    engine.applyExternalRowChanges([
        {
            clientKey: row.clientKey,
            before: { exists: true, displayOrder: 10 },
            after: { exists: false, displayOrder: null }
        }
    ]);

    const deleted = identity.getDeletedRecords(engine.getDirtyRows());
    assert(deleted.length === 1, "Persisted deleted row was not retained for Save.");
    assert(deleted[0].id === 41, "Deleted row database Id was lost.");
    assert(deleted[0].rowVersion === "persisted-version", "Deleted row RowVersion was lost.");

    engine.applyExternalRowChanges([
        {
            clientKey: row.clientKey,
            before: { exists: false, displayOrder: null },
            after: { exists: true, displayOrder: 10 }
        }
    ]);
    assert(identity.getDeletedRecords(engine.getDirtyRows()).length === 0, "Undo did not cancel the pending database delete.");
    identity.destroy();
}

function testPersistenceIdentityIgnoresTemporaryDelete() {
    const row = {
        clientKey: "temp:1",
        id: 0,
        rowVersion: "",
        displayOrder: 10
    };
    const identity = createRevoGridPersistenceIdentity({ rows: [row] });
    const engine = createRevoGridChangeEngine({ datasetKey: "2026" });

    engine.applyExternalRowChanges([
        {
            clientKey: row.clientKey,
            before: { exists: false, displayOrder: null },
            after: { exists: true, displayOrder: 10 }
        }
    ]);
    engine.applyExternalRowChanges([
        {
            clientKey: row.clientKey,
            before: { exists: true, displayOrder: 10 },
            after: { exists: false, displayOrder: null }
        }
    ]);

    assert(identity.getDeletedRecords(engine.getDirtyRows()).length === 0, "Temporary row was incorrectly turned into a database delete.");
    identity.destroy();
}

function testPersistenceIdentityRebasesInsertedRowAfterSave() {
    const oldHistoryRow = {
        clientKey: "temp:saved",
        id: 0,
        rowVersion: "",
        displayOrder: 10,
        workOrderNumber: "233039311"
    };
    const identity = createRevoGridPersistenceIdentity({ rows: [oldHistoryRow] });

    identity.acceptSaveResult({
        savedRows: [
            { id: 77, rowVersion: "server-version" }
        ],
        savedRowMappings: [
            { clientKey: oldHistoryRow.clientKey, databaseId: 77 }
        ],
        removedRowIds: []
    });

    const replayRow = identity.prepareRowForReplay(oldHistoryRow);
    assert(replayRow.id === 77, "Redo would restore the saved row with its old temporary Id.");
    assert(replayRow.rowVersion === "server-version", "Redo would restore a stale RowVersion after Save.");
    assert(replayRow.workOrderNumber === oldHistoryRow.workOrderNumber, "Persistence identity changed business data during replay.");
    identity.destroy();
}


function testPersistenceIdentityTenThousandRowsStaysTargeted() {
    const rows = Array.from({ length: 10_000 }, (_, index) => ({
        clientKey: `row:${index + 1}`,
        id: index + 1,
        rowVersion: `version-${index + 1}`,
        displayOrder: (index + 1) * 10
    }));
    const identity = createRevoGridPersistenceIdentity({ rows });
    const dirtyRows = [{
        clientKey: "row:5000",
        baseline: { exists: true, displayOrder: 50_000 },
        current: { exists: false, displayOrder: null }
    }];

    const deleted = identity.getDeletedRecords(dirtyRows);
    assert(identity.getState().persistedIdentityCount === 10_000, "Persistence identity did not index all 10,000 rows.");
    assert(deleted.length === 1 && deleted[0].id === 5000, "One-row delete lookup scanned into the wrong persistence identity.");
    identity.destroy();
}


function testPersistenceIdentityReconcilesVisibleRowAfterCommittedDelete() {
    const restoredBeforeSaveFinished = {
        clientKey: "row:in-flight-delete",
        id: 99,
        rowVersion: "version-before-delete",
        displayOrder: 10,
        workOrderNumber: "233039313"
    };
    const identity = createRevoGridPersistenceIdentity({
        rows: [restoredBeforeSaveFinished]
    });

    // The employee undid the row delete while the server was still saving the
    // older deletion snapshot. Once the server accepts the delete, this visible
    // row must become a new unsaved row instead of keeping a dead database Id.
    identity.acceptSaveResult({
        savedRows: [],
        savedRowMappings: [],
        removedRowIds: [99]
    });

    const [reconciled] = identity.reconcileRows([restoredBeforeSaveFinished]);
    assert(reconciled.id === 0, "Visible row kept a database Id that the accepted Save deleted.");
    assert(reconciled.rowVersion === "", "Visible row kept a RowVersion that the accepted Save deleted.");
    assert(reconciled.workOrderNumber === restoredBeforeSaveFinished.workOrderNumber, "Identity reconciliation changed business data.");
    identity.destroy();
}

function testPersistenceIdentityMakesSavedDeleteUndoAnewRow() {
    const oldHistoryRow = {
        clientKey: "row:deleted",
        id: 88,
        rowVersion: "old-version",
        displayOrder: 10,
        workOrderNumber: "233039312"
    };
    const identity = createRevoGridPersistenceIdentity({ rows: [oldHistoryRow] });

    identity.acceptSaveResult({
        savedRows: [],
        savedRowMappings: [],
        removedRowIds: [88]
    });

    const replayRow = identity.prepareRowForReplay(oldHistoryRow);
    assert(replayRow.id === 0, "Undo after a committed database delete would reuse a deleted database Id.");
    assert(replayRow.rowVersion === "", "Undo after a committed delete would reuse a deleted RowVersion.");
    assert(replayRow.workOrderNumber === oldHistoryRow.workOrderNumber, "Undo after Save lost the deleted row data.");
    identity.destroy();
}


function testSelectionContextRecognizesWholeColumnWithoutRows() {
    const range = {
        x: 4,
        y: 0,
        x1: 4,
        y1: 9_999,
        colType: "rgCol",
        rowType: "rgRow"
    };
    const snapshot = classifyRevoGridSelection({
        focused: null,
        selectedRange: range,
        explicitColumn: {
            prop: "partialAmount",
            range
        }
    });

    assert(snapshot.kind === "column", "Whole-column selection lost its semantic kind.");
    assert(snapshot.prop === "partialAmount", "Whole-column selection lost its field identity.");
    assert(snapshot.focused === null, "Whole-column selection invented an active cell.");
}

function testSelectionContextKeepsWholeColumnWhenPublicRangeIsDetached() {
    const range = {
        x: 4,
        y: 0,
        x1: 4,
        y1: 9_999,
        colType: "rgCol",
        rowType: "rgRow"
    };
    const snapshot = classifyRevoGridSelection({
        focused: null,
        selectedRange: null,
        explicitColumn: {
            prop: "partialAmount",
            range
        }
    });

    assert(snapshot.kind === "column", "Detached native focus lost whole-column semantics.");
    assert(snapshot.prop === "partialAmount", "Detached whole-column selection lost its field identity.");
    assert(snapshot.range.y1 === 9_999, "Detached whole-column selection lost its explicit range.");
}

function testSelectionContextDoesNotConfuseVerticalRangeWithWholeColumn() {
    const range = {
        x: 4,
        y: 2,
        x1: 4,
        y1: 4,
        colType: "rgCol",
        rowType: "rgRow"
    };
    const snapshot = classifyRevoGridSelection({
        focused: { model: { clientKey: "row:3" }, column: { prop: "partialAmount" } },
        selectedRange: range,
        explicitColumn: null
    });

    assert(snapshot.kind === "range", "A normal vertical range was misclassified as a whole column.");
}

function testSelectionContextHitTestingUsesRowsAndColumns() {
    const range = {
        x: 4,
        y: 0,
        x1: 4,
        y1: 9_999,
        colType: "rgCol",
        rowType: "rgRow"
    };

    assert(
        isCellInsideSelectionRange(range, {
            rowIndex: 5000,
            colIndex: 4,
            colType: "rgCol",
            rowType: "rgRow"
        }),
        "A cell inside the selected column was not recognized."
    );
    assert(
        !isCellInsideSelectionRange(range, {
            rowIndex: 5000,
            colIndex: 3,
            colType: "rgCol",
            rowType: "rgRow"
        }),
        "A right-click outside the selected column was treated as inside it."
    );
}


async function testSelectionContextPreservesSecondaryClickInsideRange() {
    const grid = new EventTarget();
    grid.getFocused = async () => ({ model: { clientKey: "row:3" }, column: { prop: "workOrderNumber" } });
    grid.getSelectedRange = async () => ({
        x: 0,
        y: 2,
        x1: 2,
        y1: 4,
        colType: "rgCol",
        rowType: "rgRow"
    });

    const context = createRevoGridSelectionContext({ grid });
    grid.dispatchEvent(new CustomEvent("setrange", {
        detail: { x: 0, y: 2, x1: 2, y1: 4, type: "rgRow" }
    }));

    const inside = new CustomEvent("beforecellfocus", {
        cancelable: true,
        detail: {
            rowIndex: 3,
            colIndex: 1,
            colType: "rgCol",
            type: "rgRow",
            prop: "workTypeCode",
            originalEvent: new MouseEvent("mousedown", { button: 2 })
        }
    });
    grid.dispatchEvent(inside);
    assert(inside.defaultPrevented, "Secondary-click inside a selected range collapsed the native Selection.");

    const outside = new CustomEvent("beforecellfocus", {
        cancelable: true,
        detail: {
            rowIndex: 6,
            colIndex: 1,
            colType: "rgCol",
            type: "rgRow",
            prop: "workTypeCode",
            originalEvent: new MouseEvent("mousedown", { button: 2 })
        }
    });
    grid.dispatchEvent(outside);
    assert(!outside.defaultPrevented, "Secondary-click outside a selected range failed to retarget the clicked cell.");

    context.destroy();
}

async function testStructureCommandsOwnRoutingAndScopeMeaning() {
    const calls = [];
    const rowStructure = {
        async getContext() {
            return { targetKey: "row-2", selectedKeys: ["row-2", "row-3"], selectionKind: "range" };
        },
        async getDisplayedKeys() {
            return ["row-1", "row-2", "row-3"];
        },
        async insertRows(payload) {
            calls.push({ type: "row-insert", payload });
            return true;
        },
        async deleteRows(keys) {
            calls.push({ type: "row-delete", keys: [...keys] });
            return true;
        }
    };
    const columnWorkspace = {
        async resolveContext() {
            return {
                targetProp: "custom_a",
                targetCustom: true,
                selectedCustomProps: ["custom_a", "custom_b"],
                allCustomProps: ["custom_a", "custom_b", "custom_c"]
            };
        },
        getOrderedProps() {
            return ["workOrderNumber", "custom_a", "basket"];
        },
        async insertColumns(payload) {
            calls.push({ type: "column-insert", payload });
            return true;
        },
        async deleteColumns(props) {
            calls.push({ type: "column-delete", props: [...props] });
            return true;
        }
    };
    const selectionContext = {
        async getSnapshot() {
            return { kind: "range", range: { x: 0, x1: 1, y: 1, y1: 2 } };
        }
    };

    const commands = createRevoGridStructureCommands({
        rowStructure,
        columnWorkspace,
        selectionContext
    });
    const context = await commands.captureContext({ rowIndex: 2, colIndex: 1 });

    await commands.execute(
        REVO_GRID_STRUCTURE_COMMANDS.DELETE_ROWS,
        context,
        { scope: "selection" }
    );
    await commands.execute(
        REVO_GRID_STRUCTURE_COMMANDS.DELETE_COLUMNS,
        context,
        { scope: "selection" }
    );
    await commands.execute(
        REVO_GRID_STRUCTURE_COMMANDS.INSERT_ROWS,
        context,
        { position: "below", count: 4 }
    );

    assert(
        calls[0]?.type === "row-delete" && calls[0].keys.join(",") === "row-2,row-3",
        "Structure Commands did not keep row Selection scope out of the Menu."
    );
    assert(
        calls[1]?.type === "column-delete" && calls[1].props.join(",") === "custom_a,custom_b",
        "Structure Commands did not keep Custom Columns in Selection scope out of the Menu."
    );
    assert(
        calls[2]?.type === "row-insert" &&
        calls[2].payload.targetKey === "row-2" &&
        calls[2].payload.position === "below" &&
        calls[2].payload.count === 4,
        "Structure Commands did not preserve the explicit Insert Rows target/count."
    );
}

async function testStructureCommandsMapWholeColumnToDisplayedRows() {
    const deleted = [];
    const rowStructure = {
        async getContext() {
            return { targetKey: "row-2", selectedKeys: [], selectionKind: "column" };
        },
        async getDisplayedKeys() {
            return ["row-1", "row-2", "row-3", "row-4"];
        },
        async insertRows() { return true; },
        async deleteRows(keys) {
            deleted.push(...keys);
            return true;
        }
    };
    const columnWorkspace = {
        async resolveContext() {
            return { targetProp: "partialAmount", targetCustom: false, selectedCustomProps: [] };
        },
        getOrderedProps() { return ["partialAmount"]; },
        async insertColumns() { return true; },
        async deleteColumns() { return true; }
    };
    const selectionContext = {
        async getSnapshot() {
            return { kind: "column", range: { x: 4, x1: 4, y: 0, y1: 3 } };
        }
    };

    const commands = createRevoGridStructureCommands({ rowStructure, columnWorkspace, selectionContext });
    const context = await commands.captureContext({ rowIndex: 1, colIndex: 4 });
    const description = await commands.describeRowDelete(context);
    assert(description.selectionCount === 4, "Whole-column row scope did not report displayed rows as the Selection.");
    await commands.execute(REVO_GRID_STRUCTURE_COMMANDS.DELETE_ROWS, context, { scope: "selection" });
    assert(deleted.join(",") === "row-1,row-2,row-3,row-4", "Whole-column Rows in Selection did not resolve to displayed rows.");
}

function testRowInsertRestoresThousandRowSafetyLimit() {
    let thrown = null;
    try {
        planDisplayOrderBatchInsertion([], 0, 1001);
    } catch (error) {
        thrown = error;
    }
    assert(thrown instanceof Error, "Insert Rows accepted more than 1,000 rows in one command.");
}

function testLargeDeleteRestoreUsesCapturedIndices() {
    const original = Array.from({ length: 10_000 }, (_, index) => `row-${index}`);
    const removedIndexes = new Set(Array.from({ length: 5_000 }, (_, index) => index * 2));
    const existing = original.filter((_, index) => !removedIndexes.has(index));
    const records = [...removedIndexes].map(index => ({ sourceIndex: index, value: original[index] }));
    const restored = restoreDeletedItemsByIndex(existing, records, "sourceIndex", record => record.value);
    assert(restored.length === original.length, "Large delete Undo did not restore the original row count.");
    assert(restored.every((value, index) => value === original[index]), "Large delete Undo did not restore original row order.");
}

function testColumnBatchInsertionUsesOneStableGap() {
    const orders = planColumnBatchInsertion(
        [],
        "partialAmount",
        "right",
        3
    );
    assert(orders.length === 3, "Column batch insertion did not allocate all requested columns.");
    assert(orders[0] > 5_000_000_000_000, "First inserted column was not after Partial Amount.");
    assert(orders[2] < 6_000_000_000_000, "Last inserted column crossed Remaining Amount.");
    assert(orders[0] < orders[1] && orders[1] < orders[2], "Inserted column orders are not stable and ascending.");
}

function testColumnVisualDirectionAndSpecificationOrderAreStable() {
    const {
        logicalInsertionPosition,
        additionsForLogicalPosition
    } = revoGridColumnWorkspaceInternals;

    assert(
        logicalInsertionPosition("right", true) === "left" &&
        logicalInsertionPosition("left", true) === "right",
        "RTL visual left/right did not map to the opposite logical layout direction."
    );
    assert(
        logicalInsertionPosition("right", false) === "right" &&
        logicalInsertionPosition("left", false) === "left",
        "LTR visual left/right unexpectedly changed logical layout direction."
    );

    const requested = [
        {
            id: 0,
            fieldKey: "custom_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
            name: "Column 1",
            dataType: "Text",
            layoutOrder: 0,
            rowVersion: ""
        },
        {
            id: 0,
            fieldKey: "custom_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            name: "Column 2",
            dataType: "Number",
            layoutOrder: 0,
            rowVersion: ""
        }
    ];
    const prepared = additionsForLogicalPosition(requested, "left");
    const plan = planColumnWorkspaceInsertion(
        [],
        "partialAmount",
        "left",
        prepared
    );
    const first = plan.columns.find(column => column.name === "Column 1");
    const second = plan.columns.find(column => column.name === "Column 2");
    assert(first && second, "Column insertion lost one of the requested definitions.");
    assert(
        first.layoutOrder > second.layoutOrder,
        "Column 1 was not kept nearest to the anchor when insertion uses the logical left side."
    );
}

function testColumnInsertionRebalancesExhaustedGap() {
    const existing = [
        {
            id: 40,
            fieldKey: "custom_cccccccccccccccccccccccccccccccc",
            name: "Unrelated Column",
            dataType: "Text",
            layoutOrder: 3_500_000_000_000,
            rowVersion: "rv-40"
        },
        {
            id: 41,
            fieldKey: "custom_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            name: "Existing Tight Column",
            dataType: "Text",
            layoutOrder: 5_000_000_000_001,
            rowVersion: "rv-41"
        }
    ];
    const added = [{
        id: 0,
        fieldKey: "custom_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        name: "New Tight Column",
        dataType: "Number",
        layoutOrder: 0,
        rowVersion: ""
    }];

    const plan = planColumnWorkspaceInsertion(
        existing,
        "partialAmount",
        "right",
        added
    );

    assert(plan.rebalanced, "An exhausted one-slot gap did not trigger column rebalancing.");
    const unrelatedAfter = plan.columns.find(column => column.fieldKey === existing[0].fieldKey);
    const existingAfter = plan.columns.find(column => column.fieldKey === existing[1].fieldKey);
    const addedAfter = plan.columns.find(column => column.fieldKey === added[0].fieldKey);
    assert(existingAfter && addedAfter, "Rebalancing lost an existing or inserted Custom Column.");
    assert(
        addedAfter.layoutOrder > 5_000_000_000_000 &&
        addedAfter.layoutOrder < existingAfter.layoutOrder &&
        existingAfter.layoutOrder < 6_000_000_000_000,
        "Rebalanced Custom Columns did not preserve the requested order between core columns."
    );
    assert(
        existingAfter.rowVersion === "rv-41",
        "Rebalancing changed the persisted column concurrency token on the client."
    );
    assert(
        unrelatedAfter?.layoutOrder === 3_500_000_000_000,
        "Rebalancing one exhausted section unnecessarily moved an unrelated Custom Column."
    );
}

function testColumnBatchRejectsDuplicateNamesBeforeMutation() {
    const { validateSpecifications } = revoGridColumnWorkspaceInternals;
    let thrown = null;
    try {
        validateSpecifications(
            [
                { name: "Permit", dataType: "Text" },
                { name: "permit", dataType: "Number" }
            ],
            []
        );
    } catch (error) {
        thrown = error;
    }
    assert(thrown instanceof Error, "Duplicate column names in the same Insert Columns command were accepted.");
}

const TESTS = [
    ["Structure Commands own routing and scope meaning", testStructureCommandsOwnRoutingAndScopeMeaning],
    ["Structure Commands map whole column to displayed row selection", testStructureCommandsMapWholeColumnToDisplayedRows],
    ["Row Insert restores 1,000-row safety limit", testRowInsertRestoresThousandRowSafetyLimit],
    ["Large displayed delete restores 10k order linearly", testLargeDeleteRestoreUsesCapturedIndices],
    ["Column batch insertion stays inside anchor gap", testColumnBatchInsertionUsesOneStableGap],
    ["Column visual direction and specification order stay stable", testColumnVisualDirectionAndSpecificationOrderAreStable],
    ["Column insertion rebalances an exhausted gap", testColumnInsertionRebalancesExhaustedGap],
    ["Column batch rejects duplicate names before mutation", testColumnBatchRejectsDuplicateNamesBeforeMutation],
    ["Selection Context recognizes whole column", testSelectionContextRecognizesWholeColumnWithoutRows],
    ["Selection Context survives detached public range", testSelectionContextKeepsWholeColumnWhenPublicRangeIsDetached],
    ["Selection Context keeps normal vertical range distinct", testSelectionContextDoesNotConfuseVerticalRangeWithWholeColumn],
    ["Selection Context hit-testing uses row and column", testSelectionContextHitTestingUsesRowsAndColumns],
    ["Selection Context preserves secondary-click inside range", testSelectionContextPreservesSecondaryClickInsideRange],
    ["Persistence identity retains persisted delete", testPersistenceIdentityTracksDeletedPersistedRow],
    ["Persistence identity ignores temporary delete", testPersistenceIdentityIgnoresTemporaryDelete],
    ["Persistence identity rebases inserted row after Save", testPersistenceIdentityRebasesInsertedRowAfterSave],
    ["Persistence identity stays targeted across 10,000 rows", testPersistenceIdentityTenThousandRowsStaysTargeted],
    ["Persistence identity reconciles visible row after committed delete", testPersistenceIdentityReconcilesVisibleRowAfterCommittedDelete],
    ["Persistence identity makes committed delete Undo a new row", testPersistenceIdentityMakesSavedDeleteUndoAnewRow],
    ["Unified Validation allows completely blank new row", testUnifiedValidationAllowsCompletelyBlankNewRow],
    ["Unified Validation activates requirements when a new row starts", testUnifiedValidationActivatesRequiredFieldsWhenNewRowStarts],
    ["Unified Validation requires persisted blank row fields", testUnifiedValidationRequiresPersistedRowFields],
    ["Unified Validation keeps invalid input visible", testUnifiedValidationKeepsInvalidInputVisible],
    ["Unified Validation updates duplicate peers incrementally", testUnifiedValidationDuplicatePeersUpdateIncrementally],
    ["Unified Validation clears duplicate peer after row removal", testUnifiedValidationRowRemovalClearsDuplicatePeer],
    ["Unified Validation validates custom column types", testUnifiedValidationCustomTypes],
    ["Unified Validation stays incremental across 10,000 rows", testUnifiedValidationTenThousandRowsStaysIncremental],
    ["Undo/Redo refreshes Unified Validation", testBridgeUndoRedoRefreshesUnifiedValidation],
    ["Financial rules keep invalid Remaining blank", testFinancialRulesRejectInvalidRemaining],
    ["Partial zero normalization has one Undo/Redo transaction", testPartialZeroIsOneUndoableNormalizedEdit],
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
    ["Visible target keeps viewport still", testMinimalRevealKeepsVisibleViewportStill],
    ["Off-screen target uses nearest-edge reveal", testMinimalRevealMovesOnlyToNearestEdge],
    ["History focus selects visible cell without scroll", testHistoryFocusVisibleCellDoesNotScroll],
    ["History focus minimally reveals off-screen cell", testHistoryFocusOffscreenCellUsesMinimalScroll],
    ["History focus minimally reveals off-screen column", testHistoryFocusOffscreenColumnUsesMinimalScroll],
    ["Pinned History target does not scroll central viewport", testPinnedHistoryFocusNeverScrollsCentralViewport],
    ["Coordinator replay path + focus", testCoordinatorUsesOneReplayPathAndFocusesTarget],
    ["Coordinator blocks overlapping replay", testCoordinatorRejectsOverlappingReplay],
    ["Canceled replay leaves History untouched", testCoordinatorCanceledReplayDoesNotMoveHistory],
    ["Paste bridge records 2x2 as one History action", testPasteBridgeCreatesOneHistoryTransaction],
    ["Paste 5000 stays one History action", testLargePaste5000StaysOneHistoryAction],
    ["Separate Paste actions stay separate", testSeparatePastesStaySeparateHistoryActions],
    ["Single-cell Delete still uses cell-edit path", testSingleCellDeleteStillUsesCellEditPath],
    ["Range Clear is one Undo/Redo transaction", testRangeClearCreatesOneHistoryTransaction],
    ["Range Clear recalculates financial derived fields", testRangeClearRecalculatesFinancialFields],
    ["Blank Autofill stays blocked", testBlankAutofillRangeRemainsBlocked],
    ["Blank Paste keeps Paste identity", testBlankPasteKeepsPasteIdentity],
    ["Nonblank same-range mutation stays blocked", testNonBlankSameRangeMutationRemainsBlocked],
    ["Gate 5B-1 still blocks Paste", testGate5B1StillBlocksPaste],
    ["Non-Paste range mutation stays blocked", testNonPasteRangeMutationRemainsBlocked],
    ["Canceled Paste leaves no stale capture", testCanceledClipboardPasteDoesNotLeaveEngineBusy]
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
        version: "Gate 5B-9 Structure Workspace Foundation",
        passed: results.filter(result => result.status === "PASS").length,
        failed: results.filter(result => result.status === "FAIL").length,
        total: results.length,
        results
    };
}
