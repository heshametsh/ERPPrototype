# Rollback — Phase 9.2B7 to Phase 9.2B6-R1

Extract this ZIP into the folder that contains `ERPPrototype.csproj`, preserving folders and replacing:

- `Components/Pages/WorkOrders.razor`
- `Components/Pages/WorkOrders.razor.css`
- `wwwroot/app.css`

This removes the experimental vertical KPI rail and restores the B6-R1 horizontal summary layout and light cell selection frame.

No database update is required.
