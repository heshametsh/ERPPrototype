# Phase 9.3D Integration Test Isolation Fix

Files changed:
- ERPPrototype.IntegrationTests/IntegrationTestDatabase.cs
- ERPPrototype.IntegrationTests/WorkOrderSaveIntegrationTests.cs

Changes:
1. Scope the forced SQL failure constraint to the intended rollback-test work order only, so rows created by earlier tests do not prevent installing the constraint.
2. Make the invalid-width atomicity assertion compare the persisted Basket layout before and after the rejected save instead of assuming no prior Basket layout exists.

No production application code, schema, or migration is changed.
