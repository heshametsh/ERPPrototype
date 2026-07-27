# 05 — Work Orders Grid Behaviour

**Status:** Approved description of E6F behavior and acceptance contract  
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
| Basket | Required from fixed list |
| Status | Free text, max 150 |
| Notes | Free text, max 1,000 |

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
- status/notes lengths.
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

## 12. Performance Baseline

E6E includes the E6C foundation plus E6D/E6E safeguards. The E6C foundation includes:

- `renderVerticalBuffer: 260px`
- shared vertical frame gate
- ArrowUp viewport correction
- resize logical-row anchor

E6D/E6E add:

- central repeat gating for plain Enter navigation
- first-right-click range initialization guard

Known unresolved issue:

After sustained repeated vertical navigation, the sheet can become noticeably slower. Changing year and returning recreates the instance and restores speed. Failed automatic recovery experiments are not part of E6E.


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
