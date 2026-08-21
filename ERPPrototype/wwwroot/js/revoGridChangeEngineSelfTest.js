import {
    createRevoGridChangeEngine,
    RevoGridChangeEngineError
} from "./revoGridChangeEngine.js";

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

    assert(
        thrown instanceof RevoGridChangeEngineError,
        `Expected RevoGridChangeEngineError '${code}'.`
    );
    assert(
        thrown.code === code,
        `Expected error '${code}', got '${thrown.code}'.`
    );
}

function record(engine, kind, changes, applied = null) {
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

function testCellEditDirtyUndoRedo() {
    const engine = createRevoGridChangeEngine({ datasetKey: "2026" });

    const result = record(engine, "cell-edit", [
        {
            clientKey: "db:10",
            field: "basket",
            before: "Inspection",
            after: "ModifyEstimate"
        }
    ]);

    assert(result.recorded, "Cell edit was not recorded.");
    assert(engine.getState().dirtyCellCount === 1, "Dirty cell was not tracked.");
    assert(engine.getState().undoCount === 1, "Undo transaction was not created.");

    const undo = engine.planUndo();
    assert(undo?.operations.length === 1, "Undo replay plan is wrong.");
    assert(undo.operations[0].value === "Inspection", "Undo value is wrong.");
    assert(engine.isReplayActive(), "Replay guard did not activate.");
    engine.commitReplay(undo.replayId);

    assert(engine.getState().dirtyCellCount === 0, "Undo should return to baseline.");
    assert(engine.getState().redoCount === 1, "Redo transaction was not created.");

    const redo = engine.planRedo();
    assert(redo.operations[0].value === "ModifyEstimate", "Redo value is wrong.");
    engine.commitReplay(redo.replayId);

    assert(engine.getState().dirtyCellCount === 1, "Redo should restore Dirty state.");
    assert(engine.getState().undoCount === 1, "Redo did not restore Undo history.");
}


function testSeparateEditsUndoOneTransactionAtATime() {
    const engine = createRevoGridChangeEngine({ datasetKey: "2026" });

    record(engine, "cell-edit", [
        { clientKey: "db:21", field: "basket", before: "A", after: "B" }
    ]);
    record(engine, "cell-edit", [
        { clientKey: "db:22", field: "notes", before: "N1", after: "N2" }
    ]);
    record(engine, "cell-edit", [
        { clientKey: "db:23", field: "workOrderNumber", before: "100", after: "101" }
    ]);

    assert(engine.getState().undoCount === 3, "Three separate edits must create three Undo transactions.");

    const undo3 = engine.planUndo();
    assert(undo3.operations.length === 1, "One Undo must contain only the newest separate edit.");
    assert(undo3.operations[0].clientKey === "db:23", "First Undo targeted the wrong transaction.");
    engine.commitReplay(undo3.replayId);
    assert(engine.getState().undoCount === 2, "One Undo must remove exactly one transaction from Undo history.");
    assert(engine.getState().redoCount === 1, "One Undo must add exactly one transaction to Redo history.");

    const undo2 = engine.planUndo();
    assert(undo2.operations.length === 1, "Second Undo must still contain one separate edit.");
    assert(undo2.operations[0].clientKey === "db:22", "Second Undo targeted the wrong transaction.");
    engine.commitReplay(undo2.replayId);
    assert(engine.getState().undoCount === 1, "Second Undo must leave one older transaction.");
    assert(engine.getState().redoCount === 2, "Second Undo must produce two Redo transactions.");
}

function testPasteIsOneTransaction() {
    const engine = createRevoGridChangeEngine({ datasetKey: "2026" });
    const changes = [
        ["db:1", "basket", "A", "B"],
        ["db:1", "partialAmount", 10, 20],
        ["db:2", "basket", "C", "D"],
        ["db:2", "partialAmount", 30, 40]
    ].map(([clientKey, field, before, after]) => ({
        clientKey,
        field,
        before,
        after
    }));

    const result = record(engine, "paste", changes);

    assert(result.recorded, "Paste was not recorded.");
    assert(result.transaction.operations.length === 4, "Paste lost cells.");
    assert(engine.getState().undoCount === 1, "Paste must be one Undo transaction.");
    assert(engine.getState().dirtyCellCount === 4, "Paste Dirty count is wrong.");

    const undo = engine.planUndo();
    assert(undo.operations.length === 4, "Paste Undo must replay all cells together.");
    engine.commitReplay(undo.replayId);
    assert(engine.getState().dirtyCellCount === 0, "Paste Undo did not restore baseline.");
}

function testAppliedSubsetOnlyRecordsAppliedCells() {
    const engine = createRevoGridChangeEngine({ datasetKey: "2026" });

    const captureId = engine.captureBefore({
        kind: "range-edit",
        changes: [
            {
                clientKey: "db:1",
                field: "basket",
                before: "A",
                proposedAfter: "B"
            },
            {
                clientKey: "db:1",
                field: "remainingAmount",
                before: 100,
                proposedAfter: 50
            }
        ]
    });

    const result = engine.finalizeAfter(captureId, [
        {
            clientKey: "db:1",
            field: "basket",
            after: "B"
        }
    ]);

    assert(result.transaction.operations.length === 1, "Ignored/read-only cell was recorded.");
    assert(engine.getState().dirtyCellCount === 1, "Subset Dirty count is wrong.");
}

function testReturnToBaselineClearsDirtyWithoutDeletingHistory() {
    const engine = createRevoGridChangeEngine({ datasetKey: "2026" });

    record(engine, "cell-edit", [
        { clientKey: "db:5", field: "basket", before: "A", after: "B" }
    ]);
    record(engine, "cell-edit", [
        { clientKey: "db:5", field: "basket", before: "B", after: "A" }
    ]);

    assert(!engine.getState().dirty, "Returning to baseline must clear Dirty.");
    assert(engine.getState().undoCount === 2, "History must remain after returning to baseline.");
}

function testNewEditAfterUndoClearsRedo() {
    const engine = createRevoGridChangeEngine({ datasetKey: "2026" });

    record(engine, "cell-edit", [
        { clientKey: "db:8", field: "basket", before: "A", after: "B" }
    ]);

    const undo = engine.planUndo();
    engine.commitReplay(undo.replayId);
    assert(engine.getState().redoCount === 1, "Redo must exist after Undo.");

    record(engine, "cell-edit", [
        { clientKey: "db:8", field: "basket", before: "A", after: "C" }
    ]);

    assert(engine.getState().redoCount === 0, "New user edit must clear Redo branch.");
}

function testSaveMovesBaselineButKeepsHistory() {
    const engine = createRevoGridChangeEngine({ datasetKey: "2026" });

    record(engine, "cell-edit", [
        { clientKey: "db:11", field: "basket", before: "A", after: "B" }
    ]);

    const save = engine.beginSave();
    assert(save.cells.length === 1, "Save delta should contain one dirty cell.");
    engine.acceptSave(save.id);

    assert(!engine.getState().dirty, "Successful Save must accept the new baseline.");
    assert(engine.getState().undoCount === 1, "Save must not clear Undo history.");

    const undo = engine.planUndo();
    engine.commitReplay(undo.replayId);

    assert(engine.getState().dirty, "Undo after Save must become Dirty again.");
    const dirty = engine.getDirtyCells();
    assert(dirty[0].baseline === "B", "Saved baseline should be B.");
    assert(dirty[0].current === "A", "Undo after Save should restore A.");
}

function testInFlightSaveDoesNotLoseNewerEdit() {
    const engine = createRevoGridChangeEngine({ datasetKey: "2026" });

    record(engine, "cell-edit", [
        { clientKey: "db:12", field: "basket", before: "A", after: "B" }
    ]);

    const save = engine.beginSave();

    record(engine, "cell-edit", [
        { clientKey: "db:12", field: "basket", before: "B", after: "C" }
    ]);

    engine.acceptSave(save.id);

    const dirty = engine.getDirtyCells();
    assert(dirty.length === 1, "Newer edit during Save must remain Dirty.");
    assert(dirty[0].baseline === "B", "Server-accepted value must become baseline.");
    assert(dirty[0].current === "C", "Newer browser value must remain current.");
}

function testRejectedSaveChangesNothing() {
    const engine = createRevoGridChangeEngine({ datasetKey: "2026" });

    record(engine, "cell-edit", [
        { clientKey: "db:13", field: "basket", before: "A", after: "B" }
    ]);

    const save = engine.beginSave();
    engine.rejectSave(save.id);

    const dirty = engine.getDirtyCells();
    assert(dirty[0].baseline === "A", "Failed Save must not move baseline.");
    assert(dirty[0].current === "B", "Failed Save must keep current edit.");
    assert(engine.getState().undoCount === 1, "Failed Save must keep history.");
}

function testCleanDatasetSwitchClearsHistory() {
    const engine = createRevoGridChangeEngine({ datasetKey: "2026" });

    record(engine, "cell-edit", [
        { clientKey: "db:15", field: "basket", before: "A", after: "B" }
    ]);
    const save = engine.beginSave();
    engine.acceptSave(save.id);

    assert(!engine.getState().dirty, "Precondition: dataset must be clean.");
    assert(engine.getState().undoCount === 1, "Precondition: old-year history must exist.");

    engine.resetDataset("2025");

    const state = engine.getState();
    assert(state.datasetKey === "2025", "Dataset key did not change.");
    assert(state.undoCount === 0 && state.redoCount === 0, "Year switch must clear old History.");
    assert(state.dirtyCellCount === 0, "Year switch must start clean.");
}

function testDirtyDatasetSwitchIsRejected() {
    const engine = createRevoGridChangeEngine({ datasetKey: "2026" });

    record(engine, "cell-edit", [
        { clientKey: "db:16", field: "basket", before: "A", after: "B" }
    ]);

    expectEngineError(() => engine.resetDataset("2025"), "DIRTY_DATASET");
    assert(engine.getState().datasetKey === "2026", "Rejected year switch changed dataset.");
}

function testClientKeyDoesNotDependOnDatabaseId() {
    const engine = createRevoGridChangeEngine({ datasetKey: "2026" });
    const clientKey = "temp:7f0d-session-row";

    record(engine, "cell-edit", [
        { clientKey, field: "workOrderNumber", before: "", after: "233039311" }
    ]);

    const save = engine.beginSave();
    engine.acceptSave(save.id);

    const history = engine.getHistorySnapshot();
    assert(
        history.undo[0].operations[0].clientKey === clientKey,
        "Save must not re-key History when the server later assigns a database Id."
    );
}

function testStaleBeforeIsRejected() {
    const engine = createRevoGridChangeEngine({ datasetKey: "2026" });

    record(engine, "cell-edit", [
        { clientKey: "db:20", field: "basket", before: "A", after: "B" }
    ]);

    expectEngineError(
        () => engine.captureBefore({
            kind: "cell-edit",
            changes: [
                {
                    clientKey: "db:20",
                    field: "basket",
                    before: "A",
                    proposedAfter: "C"
                }
            ]
        }),
        "STALE_BEFORE"
    );
}

function testNoOpDoesNotCreateHistory() {
    const engine = createRevoGridChangeEngine({ datasetKey: "2026" });

    const result = record(engine, "cell-edit", [
        { clientKey: "db:21", field: "basket", before: "A", after: "A" }
    ]);

    assert(!result.recorded, "No-op edit should not be recorded.");
    assert(engine.getState().undoCount === 0, "No-op edit created Undo history.");
    assert(!engine.getState().dirty, "No-op edit created Dirty state.");
}

function testHistoryBudgetEvictsOldestButKeepsNewest() {
    const engine = createRevoGridChangeEngine({
        datasetKey: "2026",
        maxHistoryBytes: 1024
    });

    const largeA = "A".repeat(2500);
    const largeB = "B".repeat(2500);
    const largeC = "C".repeat(2500);

    record(engine, "cell-edit", [
        { clientKey: "db:30", field: "basket", before: "", after: largeA }
    ]);
    record(engine, "cell-edit", [
        { clientKey: "db:31", field: "basket", before: "", after: largeB }
    ]);
    record(engine, "cell-edit", [
        { clientKey: "db:32", field: "basket", before: "", after: largeC }
    ]);

    const state = engine.getState();
    assert(state.undoCount === 1, "History budget should evict oldest transactions.");
    assert(state.historyOverBudget, "Single oversized newest transaction should be retained and reported.");

    const undo = engine.planUndo();
    assert(undo.transactionId, "Newest oversized transaction should remain undoable.");
}

const TESTS = [
    ["Cell Edit → Dirty → Undo/Redo", testCellEditDirtyUndoRedo],
    ["Separate edits undo one transaction at a time", testSeparateEditsUndoOneTransactionAtATime],
    ["Paste 2×2 = one transaction", testPasteIsOneTransaction],
    ["Applied subset only", testAppliedSubsetOnlyRecordsAppliedCells],
    ["Return to Baseline clears Dirty", testReturnToBaselineClearsDirtyWithoutDeletingHistory],
    ["New edit after Undo clears Redo", testNewEditAfterUndoClearsRedo],
    ["Save moves Baseline, keeps History", testSaveMovesBaselineButKeepsHistory],
    ["Edit during Save is not lost", testInFlightSaveDoesNotLoseNewerEdit],
    ["Failed Save keeps Baseline/History", testRejectedSaveChangesNothing],
    ["Clean year switch clears old History", testCleanDatasetSwitchClearsHistory],
    ["Dirty year switch is rejected", testDirtyDatasetSwitchIsRejected],
    ["ClientKey survives server Id assignment", testClientKeyDoesNotDependOnDatabaseId],
    ["Stale before-value is rejected", testStaleBeforeIsRejected],
    ["No-op creates no History", testNoOpDoesNotCreateHistory],
    ["History uses a memory budget", testHistoryBudgetEvictsOldestButKeepsNewest]
];

export function runRevoGridChangeEngineSelfTests() {
    const results = [];

    for (const [name, test] of TESTS) {
        const startedAt = performance.now();

        try {
            test();
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
        engine: "RevoGrid Change Engine Foundation",
        version: "Gate 5B-0",
        passed: results.filter(result => result.status === "PASS").length,
        failed: results.filter(result => result.status === "FAIL").length,
        total: results.length,
        results
    };
}
