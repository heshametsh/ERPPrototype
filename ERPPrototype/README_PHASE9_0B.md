# Phase 9.0B Patch

Apply the patch to the ERPPrototype project root, then run from the Solution directory:

```powershell
powershell -ExecutionPolicy Bypass -File .\ERPPrototype\Tools\Invoke-ERPTests.ps1 -Suite Full -Headed
```

Expected: integration `10/10` and browser Full `9/9`. Do not commit or tag before both pass.
