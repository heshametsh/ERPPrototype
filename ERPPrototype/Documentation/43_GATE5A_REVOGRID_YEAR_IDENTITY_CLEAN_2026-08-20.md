# Gate 5A — Year Identity Clean Rebuild — 2026-08-20

This version is a clean replacement of the Gate 5A year logic.

## Root cause addressed

The year selector is not rendered during the asynchronous initial sheet load.

Only after the server returns the final year list does the selector enter the DOM.

Each `<option>` has stable identity through `@key="year"`.

This prevents a previously selected option DOM node from being reused for a
different year when the final descending list is rendered.

## Year rules

- Every new page open starts on the current Saudi business year.
- The last selected year is not persisted.
- The selector uses Blazor `@bind:get` / `@bind:set`.
- No manual `value + @onchange`.
- No selector render key.
- No JavaScript selector synchronization.
- No RevoGrid year-selection logic.

## RevoGrid rule

A successful year switch replaces RevoGrid `source`.

The grid instance is not destroyed/recreated merely because the dataset year changed.

## Acceptance

1. Fresh open: visible year == current year.
2. Fresh open: RevoGrid diagnostic dataset year == visible year.
3. 2025 -> 2026 -> 2027 -> current year all switch correctly.
4. Refresh: current year again.
5. Leave/re-enter: current year again.
