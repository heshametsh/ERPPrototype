# ERP Prototype

ERP Prototype is the current development repository for the ERP application.

## Current Work Orders state

- the current `/work-orders` route still uses Tabulator.
- RevoGrid is the selected replacement path.
- the accepted Revo foundation includes snapshot-safe Save, real database Add/Update/Delete, RowVersion concurrency, Selection Core V4R3, cross-year transactional Save, and visible aggregates.
- Revo cutover remains pending production parity and qualification.

## Start here

For the current project state, read:

1. `START_HERE_ERP_PROTOTYPE.md`
2. `Documentation/00_DOCUMENTATION_INDEX.md`
3. `Documentation/03_CURRENT_IMPLEMENTATION.md`
4. `Documentation/07_KNOWN_ISSUES_AND_TECHNICAL_DEBT.md`
5. `Documentation/08_DECISIONS_LOG.md`
6. `Documentation/09_REFACTOR_ROADMAP.md`
7. `Documentation/10_RELEASE_READINESS_PLAN.md`

Historical engineering evidence is retained under `Documentation/Archive` and `Documentation/Review`.

## Verification

The authoritative test and regression commands are maintained in:

`Documentation/06_REGRESSION_TEST_CHECKLIST.md`

Do not use historical Phase or Gate instructions as the current execution sequence unless the current documentation explicitly references them.
