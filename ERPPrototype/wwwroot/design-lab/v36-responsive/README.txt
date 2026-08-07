v35 Responsive Fixed Logic

This experiment removes free resizing.
Responsive states are determined from the sheet workspace width:
- >= 1400px: docked full basket details (380px)
- 1100–1399px: docked compact metrics (290px)
- < 1100px: compact overlay drawer; table keeps full width

Only open/close remains user controlled. v34-fixed is unchanged.
