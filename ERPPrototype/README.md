# ERPPrototype Phase 9.0C-R2 Patch

Copy the contents of this folder into the ERPPrototype project folder and
allow replacement of matching files.

## Visible Observe run

From the solution folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Stress -Observe
```

Expected acceptance:

```text
Result: 11/11 passed.
Result: 33/33 browser checks passed.
Phase 9.0C Stress browser suite: PASS
ERPPrototype automated verification: PASS
```

Observe mode is deliberately slower and displays an Arabic step banner.
For normal fast verification use `-Suite Stress` without `-Observe`.

No production business rule, JavaScript behavior, migration, or database
schema is changed by this patch.
