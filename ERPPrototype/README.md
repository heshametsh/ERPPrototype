# ERPPrototype Automated Verification — Phase 9.2D2

## 1. Functional acceptance

This checks business rules, SQL Server safety, browser behavior, save, filters,
year movement, structural Undo/Redo, and the 1,000-row stress journey.

Run from the solution folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress
```

The browser runs without artificial delay. `-Headed` is still available only
when a visible browser is needed, and it also runs with `SlowMo = 0`.

Stress timing fields are diagnostic only because the functional suite keeps
failure tracing available. They are not the quantitative performance baseline.

## 2. One neutral deep performance baseline

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPPerformanceBaseline.ps1 -Action Arrow -RowsPerYear 1000 -Runs 5
```

Supported actions: `Arrow`, `Enter`, `Wheel`.
Supported datasets: `1000`, `5000`, `10000` rows per year.

Every run uses a fresh browser, disables SlowMo and timing trace, measures input
to double requestAnimationFrame inside Chromium, continues on the same sheet to
the end region, and compares the cold segment with the final long-session
segment.

## 3. Full pressure matrix

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPPerformanceMatrix.ps1
```

The default matrix runs Arrow, Enter, and Wheel against 1,000, 5,000, and
10,000 rows per year, with five independent fresh-browser runs for each
combination.

The output JSON reports are written below:

```text
ERPPrototype.E2ETests\TestArtifacts\<run>\
```

No production business rule, migration, database schema, Work Orders JavaScript,
Razor, or CSS is changed by Phase 9.2D2.
