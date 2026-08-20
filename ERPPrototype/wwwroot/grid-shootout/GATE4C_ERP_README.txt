RevoGrid Community — ERP Gate 4C

Built from the user's CURRENT uploaded grid-shootout files.

Fixes:
1) Ctrl+Z / Ctrl+Y detection now uses KeyboardEvent.code (KeyZ / KeyY),
   so shortcuts work regardless of Arabic/English keyboard layout.
2) afteredit explicitly syncs event.detail.val into the ERP-owned data store
   before creating the history operation.
3) JSON diagnostics now record Ctrl/Meta key, code, stage, and recognition.
4) No Work Orders production files are modified.

The rest of Gate 4 behavior is unchanged.
