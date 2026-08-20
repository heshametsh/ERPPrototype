ERP Grid Finalists Gate 2.1

Purpose: resolve only ambiguous Gate 2 failures.

RevoGrid:
- 500 selection/scroll jumps.
- Filter uses the documented filter collection and waits for aftertrimmed before reading getVisibleSource().
- Native clipboard test copies first, then restores RevoGrid focus. User presses Ctrl+V once.

Univer:
- LTR and RTL are separate fresh page loads.
- No dispose/recreate cycle is used.
- 500 selection/scroll jumps validate Basket selection.

Rows: 50,000.
