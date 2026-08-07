# 05 — Work Orders Grid Behaviour

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
| Custom columns | Optional `Text`, `Money`, `Date`, or whole `Number`; department-scoped |

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
- Delete/Backspace can clear a selected range.
- Paste and range clear participate in Undo/Redo.

## 6. Row Structure

Insertion is Excel-like:

- Select any cell in a row.
- Insert above or below from the top button or right-click menu.
- A multi-row range determines the insertion boundary.
- Multiple rows can be inserted.
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

Client validation provides immediate feedback:

- required identity fields.
- exact digit lengths.
- date format.
- Basket list.
- duplicate identity index.
- validation navigator with Previous/Next.

Server and database validation remain final.

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

Current implementation:

- A blank Assignment Date keeps the row in the open Work Year.
- An Assignment Date in another year moves the saved row automatically to that year.
- The year list updates after save.
- Changing the year destroys and creates a fresh Tabulator instance.
- This currently restores speed after the long-session fatigue issue.

The final business choice between automatic move and user confirmation remains an open decision before commercial release.

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
