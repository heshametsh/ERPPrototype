STEP 12C — SHOW DUPLICATE YEAR AND DIFFERENT DEPARTMENT

Changed files:
- Components/Pages/TabulatorTest.razor
- Data/WorkOrderService.cs

Behavior:
- Duplicate message always shows the year of the existing work order.
- If the existing work order belongs to the same department, the department name is omitted.
- If it belongs to another department, the message shows that department and the year.
- No navigation button and no company-wide search change.

Examples:
- Same department: رقم أمر العمل 233039311 مع النوع 801 مسجل بالفعل في سنة 2025.
- Different department: رقم أمر العمل 233039311 مع النوع 801 مسجل بالفعل في قسم المشاريع الأرضية، سنة 2025.

No migration is required.
