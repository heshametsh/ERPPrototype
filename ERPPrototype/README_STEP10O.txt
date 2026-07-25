STEP 10O — SIMPLE VALIDATION UI

Based on: ERPPrototype(8).zip

FILES TO REPLACE
1) Components/Pages/TabulatorTest.razor.css
2) wwwroot/js/tabulatorTest.js

DOCUMENTATION UPDATE
3) Documentation/02_AI_DECISION_PRINCIPLES.md
   Adds the approved essential rule requiring AI to proactively present a materially better alternative instead of agreeing automatically.

NO DATABASE CHANGE
- Do not run Add-Migration.
- Do not run Update-Database.

EXPECTED UI
- Invalid rows show only the red exclamation icon beside the row number.
- No invalid-cell red background.
- No invalid-cell border.
- No red corner triangle.
- No current-error cell marker or animation.
- The top validation message and Previous/Next remain.
- Previous/Next scroll to the related row/column without changing the blue spreadsheet selection.

TEST
1) Stop the project.
2) Copy the patch contents into the project and replace the two code files.
3) Build Solution.
4) Run and press Ctrl+F5.
5) Create errors in visible and off-screen rows.
6) Confirm only row exclamation icons appear.
7) Confirm Previous/Next updates the top message and scrolls correctly.
8) Confirm the normal blue range selection still works independently.
9) Correct all errors and confirm row icons and the top panel disappear.

After successful testing:
git add .
git commit -m "Simplify validation indicators"
git status
