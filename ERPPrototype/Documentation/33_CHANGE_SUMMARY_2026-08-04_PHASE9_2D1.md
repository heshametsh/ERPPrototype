# Phase 9.2D1 — Neutral Performance Baseline Harness

Date: 2026-08-04

## Why this replaces the previous soak

The previous Arrow soak ran inside the long Stress journey with `-Observe`.
That mode added 650 ms of Playwright SlowMo to every action and kept a
Playwright trace plus the in-application `tabulatorPerformance` wrappers active.
Its timing values therefore could not be treated as a neutral application
benchmark.

Phase 9.2D1 replaces that protocol without changing the production application.

## New protocol

- Dedicated `Performance` browser suite.
- No `Observe` and no artificial SlowMo.
- Playwright tracing disabled during a normal baseline.
- Fresh browser, context, page, login, and grid for each independent run.
- Default: five runs.
- Warm-up before the first measured segment.
- Cold and long-session measurements continue on the same page and sheet,
  without Refresh or changing year.
- Arrow, Enter, and Wheel are executed in separate commands and separate runs.
- Input latency is measured inside Chromium from the capture-phase input event
  to a double `requestAnimationFrame`, rather than from the Playwright command
  round trip.
- Report contains raw samples, P50, P95, maximum, wall-clock throughput,
  JavaScript heap snapshots, rendered-row counts, and cold-versus-long deltas.
- No arbitrary absolute latency threshold is enforced in the baseline phase.
  Results must be compared on the same machine, build, dataset, action, browser
  mode, and diagnostics setting.

## Supported datasets

The runner accepts 1,000, 5,000, or 10,000 rows per year. Two years are seeded
in an isolated temporary SQL Server database.

## Commands

Run from the solution root that contains the inner `ERPPrototype` directory.

First baseline — Arrow only, 1,000 rows, five fresh browsers:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPPerformanceBaseline.ps1 -Action Arrow -RowsPerYear 1000 -Runs 5
```

Visible run without SlowMo:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPPerformanceBaseline.ps1 -Action Arrow -RowsPerYear 1000 -Runs 5 -Headed
```

Separate Enter and Wheel baselines:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPPerformanceBaseline.ps1 -Action Enter -RowsPerYear 1000 -Runs 5
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPPerformanceBaseline.ps1 -Action Wheel -RowsPerYear 1000 -Runs 5
```

Only after the 1,000-row result is understood, repeat the relevant action with
5,000 and 10,000 rows.

## Diagnostic rerun

Use diagnostics only after a neutral baseline shows a problem:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPPerformanceBaseline.ps1 -Action Arrow -RowsPerYear 1000 -Diagnostics -Headed
```

Diagnostic mode enables Playwright trace and long-task observation. Its numbers
are intentionally marked non-comparable to the neutral baseline.

## Output

The main JSON report is written under:

```text
ERPPrototype.E2ETests\TestArtifacts\<run>\phase9-performance-<action>-<rows>-rows-baseline.json
```

Each browser run also receives a separate artifact directory.

## Production impact

None. This patch changes only test infrastructure, the synthetic E2E seed size,
and PowerShell test runners. It does not change Work Orders JavaScript, Razor,
CSS, C#, business rules, database migrations, or the developer database.
