RevoGrid Community — ERP Gate 4F Manual

Isolated fix for test 5 (Custom Columns):
- Structural column changes now assign grid.columns (documented public property).
- The test verifies ERP Custom exists immediately after Add BEFORE creating history.
- The grid scrolls to ERP Custom so the user can visually confirm it.
- Undo/Redo still use the user's Ctrl+Z / Ctrl+Y and are verified with getColumns().
- If Add itself fails, the test stops there instead of reporting a misleading Redo failure.

All earlier Gate 4E tests and behavior are unchanged.
No Work Orders production files are modified.
