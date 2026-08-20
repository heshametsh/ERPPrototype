RevoGrid Community Gate 2.3 — Fully Automated

What it does:
- Starts an isolated temporary ERP database and local web app.
- Launches Playwright Chromium automatically.
- Tests 50,000-row RevoGrid Community page.
- Tests Basket selection across 500 virtual jumps.
- Tests Community Equal filter and clear.
- Tests real browser clipboard paste 5,000 x 1 using Ctrl+V.
- Tests end-of-sheet rule: 4,000 source values with 200 rows available must paste 200 only.
- Writes JSON + screenshot/trace artifacts.

Run:
dotnet build ERPPrototype.E2ETests -c Release
dotnet run --project ERPPrototype.E2ETests -c Release --no-build -- --grid-community
