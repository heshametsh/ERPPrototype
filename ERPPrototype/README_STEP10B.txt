STEP 10B — Professional identity validation UI

Files replaced:
- wwwroot/js/tabulatorTest.js
- Components/Pages/TabulatorTest.razor.css

Behavior:
- Invalid cells keep a clean white background.
- The editor border becomes clearly red while invalid.
- A visible digit counter appears inside the cell (for example 3/9).
- A clear Arabic validation message appears next to the active cell.
- Valid input shows a green check and count.
- Invalid characters and extra digits are still blocked immediately.
- No database migration is required.
