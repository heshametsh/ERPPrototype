# Phase 9.2D2 — Remove Observe, Stabilize Year Reload, Deep Performance Traversal

Date: 2026-08-04

## What changed

### 1. Observe was removed from active test infrastructure

- Removed the `-Observe` PowerShell parameter.
- Removed the E2E `--observe` option and state.
- Removed Arabic visual banners and deliberate pauses.
- Removed 650 ms Observe SlowMo.
- Removed the separate 90 ms Headed SlowMo.
- Headless and Headed functional runs now both use `SlowMo = 0`.

### 2. Year switching waits for the real destination dataset

The old browser wait could pass on the previous table when both years contained
1,000 rows. The replacement wait requires all of the following:

- requested year selected;
- Tabulator host, table, and state ready;
- expected active-row count;
- known Work Order from the destination year present;
- known Work Order from the old year absent;
- aggregate summary ready.

This targets the failure `Tabulator could not locate row Id 2000` without
changing production year-switching behavior.

### 3. Functional Stress no longer claims to be a performance baseline

Stress still checks correctness and records diagnostic timings, but its JSON now
marks `ComparablePerformanceBaseline = false`. Quantitative conclusions belong
to the dedicated Performance suite.

### 4. Performance now traverses to the end region

For each fresh-browser run:

1. warm up at the top;
2. measure a cold segment;
3. continue on the same sheet without Refresh or changing year;
4. traverse the real dataset to the position immediately before the final segment;
5. measure the long-session segment until the final row/end region;
6. verify sheet state, Virtual DOM bound, movement, and end-region reach.

The JSON schema is now `1.1` and records whether every run reached the end region.

### 5. Full matrix runner

`Tools\Invoke-ERPPerformanceMatrix.ps1` runs:

- Arrow, Enter, and Wheel;
- 1,000, 5,000, and 10,000 rows per year;
- five fresh-browser runs per combination by default;
- headless, no SlowMo, no timing trace.

## Production impact

None. No Work Orders JavaScript, Razor, CSS, business rule, service, migration,
or production database schema changed.

## Required verification

Functional acceptance first:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress
```

Required result:

```text
Integration tests: 17/17 PASS
Browser checks: 55/55 PASS
ERPPrototype automated verification: PASS
```

First quantitative run:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPPerformanceBaseline.ps1 -Action Arrow -RowsPerYear 1000 -Runs 5
```

Full matrix after the first report is reviewed:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPPerformanceMatrix.ps1
```
