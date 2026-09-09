# CURRENT-STATE POINTER - 2026-09-04

This document remains authoritative for its own subject area.

For the latest implementation checkpoint, active issues and execution sequence use `03_CURRENT_IMPLEMENTATION.md`, `07_KNOWN_ISSUES_AND_TECHNICAL_DEBT.md`, `09_REFACTOR_ROADMAP.md` and `10_RELEASE_READINESS_PLAN.md`.

Only older statements that describe Gate 5A/B10/B11 or Real DB Save as the current next step are historical.

---

# BUSINESS BEHAVIOR OVERRIDE — 2026-08-30

> This document remains the engine-independent Grid behavior contract.
> Business semantics are canonical in `15_BUSINESS_DOMAIN_AND_PERMISSIONS.md`.

## Financial field meaning

- `Work Order Value` = total Work Order value.
- `Partial Amount` = one-time Partial Invoice amount when applicable.
- `Remaining Amount` is derived/read-only.
- approved commercial meaning of `Remaining Amount` = Final Invoice Amount / portion not included in the one-time Partial Invoice.
- it does **not** become zero after final invoice approval.
- if Partial is blank, Final/Remaining equals Work Order Value.
- Partial = 0 normalizes to blank/null.
- Partial eligibility threshold may vary by region/contract and must not be hard-coded globally before configuration is defined.

## Identity/delete after specialist interaction — target behavior

Before another module records a real business interaction, Master employee may correct WorkOrderNumber/WorkTypeCode or delete an incorrectly entered Work Order.

After real downstream interaction:

- WorkOrderNumber/WorkTypeCode correction = BranchManager only.
- Delete = BranchManager only.
- ordinary allowed fields such as Basket remain editable by Master employee.

Merely appearing in another department queue does not count as interaction.

This is approved target behavior and is not claimed as already implemented in current live Grid.

## Closure and Basket — target behavior

- `انتهاء أمر العمل` = operational + financial closure.
- Reopen = BranchManager only and must enter durable Business History.
- Basket is main/general/official stage, not a rigid gate that forbids practical parallel work.
- specialist detailed states belong in specialist workflows.

## Year move

Changing Assignment Date so Work Order moves to another year requires user confirmation before authoritative server move.

This supersedes older “automatic move vs confirmation still open” statements later in this file.

## Selection, Filter, and current-view targeting

Approved product behavior for the Revo candidate:

- Scroll does not cancel selection; virtualization is not a Filter.
- Sort keeps the same selected Work Orders by stable identity even when their positions move.
- when Filter removes a row from the current result, that row leaves row selection immediately.
- clearing the Filter does not silently restore that old row selection.
- any **new** sheet mutation that resolves row/cell targets must resolve its final targets only from rows still in the current filtered result.
- a change made while a row was visible remains a valid dirty change; Save may persist it even if a later Filter hides the row.
- Undo/Redo continues the earlier logical operation and must not be corrupted merely because Filter visibility later changed.
- changing year/dataset clears selection because it is a different dataset.

Example:

> Employee selects Work Orders A, B, C. A Filter removes B. Selection becomes A + C. Delete may target A + C only. Clearing the Filter makes B visible again, but B does not become selected again automatically.

## Selection architecture boundary

- Revo owns the native active cell/range, focus, edit and keyboard mechanics.
- ERP may add missing semantic Ctrl/Shift selection for whole rows/columns using stable row/column identity.
- right-click inside current selection preserves it; right-click outside targets the clicked location.
- disjoint Ctrl multi-cell ranges are postponed until their Copy/Paste/Delete/Undo meaning is fully defined.
- a large/whole-row/whole-column selection may visually suppress an intrusive inner active-cell marker only if Revo focus remains functionally intact.

**Implementation note:** Gate 5B-10 at `86eb2ff3ce51addc2046133c820dd5dc75bfd08f` implements the whole-row/whole-column Plain/Ctrl/Shift behavior and Filter-pruning contract above. Sort identity preservation, virtualization repaint, right-click preservation and dataset-switch clearing passed real-browser and manual acceptance. Disjoint Ctrl multi-cell ranges remain postponed.

---

# 05 — Work Orders Grid Behaviour

> **Grid-engine transition 2026-08-20:** هذه الوثيقة أصبحت **engine-independent behavior contract**. `/work-orders` الحالي ما زال Tabulator 6.5.0، لكن RevoGrid Community 4.25.2 هو المحرك المختار للاستبدال. أي RevoGrid integration يجب أن يحافظ على السلوك هنا ولا يغيّره لمجرد اختلاف المكتبة.

**Status:** Approved description of `M5D4R3-Stable-Range-UX` behavior and acceptance contract
**Route:** `/work-orders`
**Authorized current role:** `Employee`

## 1. Sheet Scope

- المستخدم يرى قسمه فقط.
- البيانات تُفلتر على السيرفر حسب Department Id.
- المستخدم يختار سنة واحدة.
- كل سنة تحمل صفوفها الخاصة.
- تغيير السنة ممنوع عند وجود تغييرات غير محفوظة.

## 2. Current Columns

| Column | Type / rule |
|---|---|
| Row number | Visual only, frozen |
| Work Order Number | Exactly 9 digits |
| Work Type | Exactly 3 digits |
| Assignment Date | `DD/MM/YYYY`, blank allowed |
| Work Order Value | Required positive money value |
| Partial Amount | Optional positive money value, not above Work Order Value |
| Remaining Amount | Calculated, read-only |
| Basket | Required from fixed list |
| Custom columns | Optional `Text`, `Money`, `Date`, or whole `Number`; definitions are scoped by Department + Work Year |

System fields مثل Id وWorkYear وDisplayOrder وRowVersion لا تظهر للمستخدم.

## 3. Editing

- Double-click or Enter opens normal text edit mode.
- Direct character typing starts Quick mode.
- Basket uses list editing.
- Enter commits the value inside an active editor without unintended row movement. Outside an editor, plain Enter follows the vertical navigation path.
- Arabic/Persian digits in identity fields are normalized to English digits.
- Assignment Date accepts typed dates, ISO date, and supported Excel serial values when pasted.

## 4. Navigation

- ArrowLeft/Right/Up/Down move the active selection.
- ArrowUp, ArrowDown, and plain Enter share one frame gate to prevent browser key-repeat backlog.
- ArrowUp has one documented direction-specific viewport correction because a hidden-row issue was proven in that direction.
- Horizontal navigation remains independent.
- The sheet shortcuts are active only when the grid is active, so they do not interfere with search fields.

## 5. Selection and Clipboard

- One selectable range can include rows and columns.
- Copy produces tab-separated values without headers.
- Paste is treated as one transaction even when it changes many cells.
- **Approved end-of-sheet rule:** Paste never grows the sheet merely to fit clipboard data. If 4,000 values are copied and only 200 target rows remain, paste exactly the available 200 and ignore the overflow.
- Delete/Backspace can clear a selected range.
- Paste and range clear participate in Undo/Redo.

## 6. Row Structure

Insertion is Excel-like:

- Select any cell in a row.
- Insert above or below from the top button or right-click menu.
- The row targeted by the Insert command determines the insertion boundary.
- `Insert 1 Row Above/Below` inserts one row only.
- `Insert Rows...` asks for an explicit row count; selection size never determines how many rows are inserted.
- Deleting rows requires confirmation.
- Unsaved new rows have temporary negative Ids/client keys.
- Saved rows receive database Ids.

Current performance caveat:

Structural insert/delete/undo rebuilds full client data using `table.setData()` and then recalculates state/validation. This is a known bottleneck.

## 7. Undo and Redo

- Custom transaction history, not Tabulator default history.
- Supports cell edits, paste, range clear, filtering transactions where applicable, insert, and delete.
- History is session-only.
- Refreshing, closing the page, or changing year clears session history.
- Maximum transaction count is controlled in JavaScript state.

## 8. Validation

Client validation uses the approved **soft validation** behavior:

- invalid values remain visible in the sheet;
- the affected cell/row is clearly marked as invalid;
- the employee may continue working;
- Save is blocked while any validation error remains;
- Manual Edit, Paste, Range Clear and Undo/Redo resulting state follow the same rule.

Gate 5B-6 currently validates:

- required Work Order Number / Work Type / Basket;
- exact identity digit lengths;
- Assignment Date format;
- Basket membership;
- Work Order Number + Work Type duplicates inside the active sheet;
- Work Order Value / Partial financial rules;
- supported custom Text/Money/Date/whole-Number values when those definitions are supplied.

Server and database validation remain final and must recheck authoritative rules during real Save.

## 9. Save

1. Commit active editor.
2. Validate client state.
3. Collect dirty and deleted rows only.
4. Parse dates and RowVersion.
5. Send Delta to WorkOrderService.
6. Recheck scope, fields, duplicates, and concurrency.
7. Save in one transaction.
8. Return saved Ids/RowVersions/moved rows.
9. Apply saved delta to the open grid.
10. Clear dirty/deleted state for saved rows.

## 10. Year Behaviour

Live Tabulator implementation/history:

- A blank Assignment Date keeps the row in the open Work Year.
- older live behavior can route a saved row to the year implied by Assignment Date.
- the year list updates after save.
- the live Tabulator path recreates its grid instance on year change.

Approved product contract:

- a cross-year Assignment Date change must ask for user confirmation **before** the authoritative move.
- after confirmation, the server remains authoritative for the final saved year.
- this decision is closed; it is not an open automatic-vs-confirmation question.
- the Revo isolated candidate treats each year as a separate dataset and clears selection/history state at the dataset boundary as defined by its current owners.

## 11. Resize Behaviour — E6C Foundation

- Desktop uses the grid as the main vertical scroll container.
- The table height is recalculated after resize.
- E6C captures the first visible logical row before the resize series.
- It restores the same row after Tabulator redraw settles.
- It does not rely only on pixel `scrollTop`, because the same pixel can represent a different row after resizing.

## 12. Performance Foundation and Current Issue

M5D4R3 retains the E6C foundation plus all later safeguards. The E6C foundation includes:

- `renderVerticalBuffer: 260px`
- shared vertical frame gate
- ArrowUp viewport correction
- resize logical-row anchor

Later checkpoints add:

- central repeat gating for plain Enter navigation
- first-right-click range initialization guard
- bounded structural focus restoration
- incremental structural operations
- unified Copy/Paste ownership
- in-place saved identity reconciliation
- full global duplicate reporting
- logical range clear outside the visible Virtual DOM
- drag-selection Auto-scroll owned by a separate helper

Known unresolved issue:

Phase 6.0 proved that ArrowUp/ArrowDown alone cause gradual long-session degradation. Changing year and returning recreates the instance and restores speed, but this is diagnostic evidence only and not an accepted Recovery. Failed automatic recovery experiments remain excluded.


## 13. First Right-Click Behaviour — E6E

- The sheet may intentionally start with no selected range.
- On the first right-click over a visible cell, E6E creates a genuine one-cell Tabulator range during the capture phase.
- Tabulator then handles the same mouse event normally and the row context menu can open.
- The guard runs only when no range exists, so normal range selection is not replaced.

## 14. Acceptance Tests for Any Grid Change

A grid change is not accepted until all pass:

- Four arrows.
- Direct typing and double-click editing.
- Enter behavior.
- Range selection.
- Copy and paste.
- Delete/Backspace range clear.
- Insert above/below/multiple.
- Delete rows and confirmation.
- Undo and redo.
- Search and filters.
- Validation navigator.
- Save added/changed/deleted rows.
- Year switch protection with unsaved data.
- Resize at a deep row.
- No red Console error.
- No duplicated event response.
- 100,000-row candidate qualification before an engine cutover.
- Paste 5,000 values without data loss and as one Undo/Redo transaction.
- End-of-sheet overflow obeys the approved available-space-only rule.
- Split Screen selection stability.
- RTL + deep scroll stability.
- Browser Zoom 100/90/80/75/70/67% with selection preserved/restored without visible breakage.

## 15. Simple Example

عند الوقوف على الصف 2,576 ثم تصغير النافذة، حفظ `scrollTop` بالبكسل قد يعيدك إلى 2,583 لأن ارتفاع العرض تغير.
E6C يحفظ هوية الصف نفسه، مثل حفظ رقم المنزل بدل حفظ عدد الأمتار التي مشيتها.


## E6F Structural Focus Safety

بعد Insert/Delete أو Undo/Redo قد يعيد Tabulator بناء الـVirtual DOM قبل ظهور عنصر الخلية. E6F لا يستدعي `focus()` إلا بعد التأكد أن العنصر موجود ويدعم التركيز، مع عدد محاولات محدود.

**مثال بسيط:** لا يحاول النظام الضغط على زر لم يظهر بعد؛ ينتظر لحظات قصيرة ثم يتوقف بأمان إذا لم يظهر.


## 16. M5D4R3 Range and Auto-scroll Contract

- Delete/Backspace clears cell values only; row count does not change.
- The full logical range is cleared even when some selected rows are outside the visible Virtual DOM.
- Auto-scroll moves the viewport near the top/bottom edge during mouse drag.
- Tabulator remains the only owner of the selected range.
- Auto-scroll speed is fixed at `minimumStep = 8` and `maximumStep = 32`.


## 17. Bulk Field-Change Contract — Phase 8.5

- A large Paste, range clear, Undo, or Redo is one user transaction.
- The values are applied while repeated redraw and per-cell project processing are suspended.
- After all values are applied, dirty tracking runs once using the affected row and field keys.
- Only validators and cross-field rules that depend on those keys run.
- Saving an existing row updates only its changed fields. New rows still validate and save all required fields.

Example: pasting a custom Text column into 4,952 rows changes 4,952 values, but the identity rule does not run because neither Work Order Number nor Work Type changed. Changing Work Type in one row does run the identity rule for that row.


## 18. Department Column Layout Contract — Phase 9.3B

- Right-click on a data-column Header exposes `Insert Column Before` and `Insert Column After`.
- Dragging the Header edge changes width locally; Save is required to persist it. There is no numeric-width entry option.
- Valid width is 45–1000 px.
- Undo/Redo includes unsaved width changes.
- One department's widths apply to all its years and never leak into another department.
- Header title, filter icon, and sort icon stay directly adjacent. Extra horizontal space remains after that group.
- When width is insufficient, the title uses an ellipsis; icons remain visible.
- The row-number Header is not a saved data-column layout.

## 19. Custom Column Filter, Sort, and Visibility Contract — Phase 9.3E

- Custom Column definitions are year-scoped within the employee's department. Add/Rename/Delete affect only the current Work Year.
- Moving a Work Order to another year preserves non-empty custom values. A destination column with the same name + type is reused; a missing column is created; a same-name/different-type conflict receives a safe unique destination name. Blank values do not create destination columns.
- Width/visibility layout is intentionally separate from definition ownership and remains department-scoped by `DepartmentId + FieldKey`, so layout can still be shared across years when the same field key exists there.
- The custom-column type is selected once during creation and cannot be changed later, even while the column is empty.
- `Rename Custom Column` changes the name only.
- Custom `Text`, `Date`, and whole `Number` columns receive a value filter automatically.
- Custom `Money` columns receive numeric Header sorting only. The first sort is descending, then ascending, then cleared by Tabulator's normal cycle.
- Filter option values are derived from the rows already loaded in the browser and are scanned only when the popup opens. Applying a filter remains client-side and does not request the server.
- Right-clicking a visible data-column Header exposes `Hide Column`.
- `Unhide Column` appears in that same context menu only when at least one data column is hidden. Its list is created only when the menu opens.
- The row-number column cannot be hidden, and at least one data column must remain visible so the Header context menu remains reachable.
- Hide/Unhide changes update Tabulator locally, participate in Undo/Redo, and are sent to SQL Server only by the normal Save action.
- Visibility is stored with the existing department column layout (`DepartmentId + FieldKey`) and therefore applies to every year of that department without affecting another department.
- The selection summary renders totals only for amount columns that are currently visible. Fixed yearly summaries remain independent of column visibility.


## 20. RevoGrid Gate 5B-5 Range Clear Contract

- This contract applies to the isolated Revo route `/work-orders-revogrid-gate5b5`; `/work-orders` remains on the current production grid until cutover qualification.
- A multi-cell `Delete` or `Backspace` clears only writable cells in the selected range.
- `Remaining Amount` stays readonly and derived; selecting it together with editable financial cells does not directly blank it.
- One Range Clear creates one Sheet History action. Undo/Redo restores/reapplies the complete operation once.
- Range Clear participates in Change Engine Dirty tracking using the actual affected editable cells only.
- Paste retains its explicit clipboard intent. Other unqualified range mutation/Autofill stays blocked.
- Qualification requires both the Change Engine self-test and the real Playwright browser journey. A browser failure must preserve diagnostic evidence rather than being reduced to a generic FAIL.
