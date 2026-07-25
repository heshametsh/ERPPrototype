STEP 11D — ENTER SAVES WITHOUT MOVING TO THE NEXT ROW

Changed file:
- wwwroot/js/tabulatorTest.js

Behavior:
- Work Order Number, Work Type, and Assignment Date keep their existing behavior.
- Basket, Status, and Notes now commit on Enter without moving to the next row.
- Arrow keys and Tab/Shift+Tab behavior are unchanged.
- No database migration.

Test:
1. Edit Basket and press Enter: value is committed and the sheet does not move down.
2. Repeat for Status and Notes.
3. Confirm Work Order Number, Work Type, and Assignment Date still behave as before.
4. Save and refresh to confirm persistence.
