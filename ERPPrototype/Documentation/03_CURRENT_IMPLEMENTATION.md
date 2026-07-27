# 03 — Current Implementation

**Status:** Approved description of the E6E stable checkpoint  
**Review date:** 2026-07-27  
**Important:** This is a static code review. The review environment did not contain .NET SDK, so compilation and browser execution were not performed here.

## 1. Snapshot

| Item | Current value |
|---|---|
| Project type | One ASP.NET Core Web project |
| Target framework | `net10.0` |
| Render mode | Blazor Interactive Server |
| Authentication | ASP.NET Core Identity |
| Database | SQL Server / LocalDB in Development |
| ORM | EF Core 10.0.9 |
| Grid | Tabulator 6.5.0 |
| Grid stable checkpoint | Step 16E6E (built on E6C) |
| Main grid file | `wwwroot/js/tabulatorTest.js` — 7,299 lines in E6E |
| Work-order page | `Components/Pages/WorkOrders.razor` — 1,023 lines |
| Work-order service | `Data/WorkOrderService.cs` — 907 lines |
| Migrations | 29 files |
| Runtime code changed by this documentation review | None |

## 2. Runtime Flow

```text
Browser / Tabulator
        |
        | JavaScript Interop
        v
WorkOrders.razor
        |
        v
WorkOrderService
        |
        v
ApplicationDbContext / EF Core
        |
        v
SQL Server
```

Admin management currently has an exception: `AdminPanel.razor` accesses `ApplicationDbContext` directly for branch operations instead of using an application service.

## 3. Authentication and Accounts

Implemented:

- No public registration page.
- Login by username and password.
- Inactive users are rejected.
- Five failed attempts cause a 15-minute lockout.
- New users must change the temporary password.
- Authentication state is revalidated every 30 minutes.
- One Admin account is enforced by the startup Seeder.
- Initial Admin credentials come from configuration/User Secrets.
- Roles are created during startup.
- Standard department types are created during startup.
- Every existing branch is given the four standard departments.

Operational risk:

- Database initialization/Seeder runs during application startup.
- The app retries SQL startup three times, then fails startup.
- This may contribute to Azure `500.30` when SQL is unavailable, but this has not been proven from logs.

## 4. Current Roles

| Code role | Current capability |
|---|---|
| `Admin` | Admin page, add/rename branch, create/list fixed BranchManager/Employee accounts |
| `ProjectManager` | Role exists; no completed operating screen/workflow |
| `BranchManager` | Account can be created; no completed read-only work-order screen or branch account management |
| `Employee` | Loads and modifies work orders for the assigned department only |

The product terminology and current code terminology are not yet aligned.

## 5. Work-Order Data Model

Visible operational fields:

- Work Order Number
- Work Type
- Assignment Date
- Basket
- Status
- Notes

Hidden/system fields:

- Id
- Client Key in the browser
- Work Year
- Display Order
- Department Id
- RowVersion
- Created/Updated audit fields

Database rules:

- Work Order Number is exactly 9 ASCII digits.
- Work Type is exactly 3 ASCII digits.
- The database Unique Index is currently company-wide on Work Order Number + Work Type.
- Department deletion is restricted.
- RowVersion is used for optimistic concurrency.
- Notes max 1,000 characters.
- Status max 150 characters.
- Basket is required and must be one of the configured values.

## 6. Work-Order Loading

`WorkOrderService.LoadSheetAsync`:

- Validates the year range 2000–2100.
- Confirms that the user is active, has changed the temporary password, has role Employee, and has a department.
- Filters SQL by the employee's Department Id and selected Work Year.
- Selects a lightweight DTO rather than the full entity.
- Orders by Display Order then Id.
- Returns all rows for that department/year to the browser.
- Logs query timing for user scope, years, rows, and total.

Current scaling limit:

All rows of the selected year are still transferred to Blazor and JavaScript. This is acceptable for the current 3,000-row prototype only after testing; 10,000 rows remain unverified.

## 7. Work-Order Saving

Implemented:

- The browser sends dirty rows and deleted rows only.
- Server validation is repeated.
- Scope is repeated on the server.
- Duplicate checks occur in current changes, SQL query, and Unique Index.
- Updates and deletes require a valid RowVersion.
- One transaction covers added, updated, and deleted rows.
- Assignment Date determines the destination year in the current implementation.
- The result returns saved rows, new database Ids, RowVersions, moved rows, and deleted Ids.
- The browser applies the saved delta without reloading the full sheet.

## 8. Grid Features in E6E

- Virtual DOM with central buffer 260px.
- Direct cell editing.
- Quick typing mode and text editing mode.
- Four-arrow navigation.
- Frame gate shared by ArrowUp, ArrowDown, and plain Enter navigation.
- ArrowUp-only viewport correction for a proven direction-specific issue.
- Range selection.
- Copy/paste matrix.
- Insert above/below and multiple rows.
- Delete selected rows.
- Custom session Undo/Redo.
- Validation navigation.
- Work-order-number search.
- Column filter popups.
- Dirty row tracking.
- Year switching only after unsaved changes are cleared.
- Resize keeps the logical first visible row using the E6C anchor restore.
- First right-click on an unselected sheet initializes a real range before Tabulator handles the event, preventing `activeRange.occupies` errors.

## 9. Not Implemented

- Excel import.
- Excel export.
- Dashboard/KPIs.
- Warehouse.
- Invoice module.
- BranchManager operating page.
- Projects Director operating page.
- User rename/reset password/activate/deactivate workflows.
- Admin audit trail.
- Automated unit, integration, or browser tests.
- Production monitoring and client-side error reporting.
- Proven 10,000-row strategy.
- Final solution to long-session vertical-navigation fatigue.

## 10. Static Review Performed

Passed in this review:

- JavaScript syntax for project-owned JS files using Node.
- JSON parsing.
- Project XML parsing.
- Required routes present.
- No Syncfusion runtime/package references.
- No recovery-test flags from failed R2/R3 experiments in E6C.
- E6C markers present: 260px buffer and resize viewport restoration.
- No obvious hard-coded production password or connection string in source.
- Runtime source manifest generated.

Not performed here:

- `dotnet restore`
- `dotnet build`
- EF migration execution
- SQL integration
- Browser regression tests
- Azure/network tests
- NuGet vulnerability scan after restore

## 11. Important Code Mismatches

1. Product role names differ from code role names.
2. Product expectation for BranchManager is not implemented.
3. Current database uniqueness is company-wide; business scope needs final confirmation.
4. Current year movement is automatic; product preference may require confirmation.
5. Admin branch logic bypasses a service layer.
6. Historical review said `.csproj.user` was removed, but the uploaded ZIP still contained it; it was excluded from the documented deliverable.

## 12. Simple Example

**Why is server validation repeated when JavaScript already validates?**  
JavaScript is like the receptionist checking a form quickly. The server is the locked records room. Even if someone bypasses the receptionist, the records room must still reject an invalid or unauthorized form.


## 12. E6D/E6E Verification Record

User-tested on 2026-07-27 after Clean/Rebuild and local browser execution:

- Sustained Enter navigation remained responsive beyond the previously slow point near row 1,040.
- Arrow navigation remained functional after Enter navigation.
- First right-click on a one-row year and on a large year opened without the previous `activeRange.occupies` exception.
- Insert/right-click flow and the connected smoke tests were reported as working.

This is user-environment evidence, not an automated browser-test suite.
