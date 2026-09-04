# Gate 5A — Clean Year Binding — 2026-08-20

This is a clean replacement of the Gate 5A experiment, not an incremental patch.

## Year ownership

Blazor owns the selected year.

- The page opens on the current Saudi business year (UTC+3).
- The last selected year is not persisted.
- The selector uses `@bind:get` / `@bind:set`.
- `SelectedWorkYear` is the single authoritative year value.
- A requested year is first loaded into a temporary snapshot.
- The requested dataset must return the exact requested `WorkYear`.
- Only after load succeeds does RevoGrid receive the replacement source.
- Only after RevoGrid accepts that source is the C# page state committed.
- A failed switch leaves both the visible year and current dataset unchanged.

## RevoGrid ownership

RevoGrid does not own the year selector.

A year change is treated as a documented RevoGrid **dataset switch**:

- replace `source`;
- do not destroy/recreate the grid;
- do not add year logic to the grid;
- do not import Tabulator year/layout behavior.

## Removed approaches

This clean version does not contain:

- `value="@SelectedWorkYear"` + `@onchange` manual two-way simulation;
- `YearSelectorRenderKey`;
- selector DOM forcing;
- destroy/reinitialize on every year switch;
- saved Tabulator widths/layout state.

## Acceptance

1. New page open: selector = current Saudi year and dataset = same year.
2. Switch to another year: selector and dataset change together after success.
3. Switch back: same rule.
4. Failed switch: selector and existing dataset remain unchanged.
5. Refresh or leave/re-enter: starts on current Saudi year again.
