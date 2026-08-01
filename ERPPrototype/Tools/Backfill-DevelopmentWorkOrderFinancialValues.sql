/*
    DEVELOPMENT / TEST DATA ONLY
    ----------------------------
    Fills only existing WorkOrders whose WorkOrderValue is still NULL.
    It is deterministic and safe to run more than once: previously filled rows
    are not changed. Do not run this script against real customer data.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF
    DB_NAME() NOT LIKE N'aspnet-ERPPrototype-%' AND
    DB_NAME() NOT LIKE N'ERPPrototype_IntegrationTests_%' AND
    DB_NAME() NOT LIKE N'ERPPrototype_E2E_%'
BEGIN
    THROW 51000,
        'Safety stop: this script accepts only the known local development or isolated test database names.',
        1;
END;

DECLARE @RowsBefore int =
(
    SELECT COUNT(*)
    FROM dbo.WorkOrders
    WHERE WorkOrderValue IS NULL
);

BEGIN TRANSACTION;

;WITH SeedValues AS
(
    SELECT
        Id,
        CAST(
            50000 +
            ((CONVERT(bigint, Id) % 400) * 5000) +
            ((Id % 4) * 0.25)
            AS decimal(18,2)
        ) AS GeneratedWorkOrderValue
    FROM dbo.WorkOrders
    WHERE WorkOrderValue IS NULL
)
UPDATE workOrder
SET
    WorkOrderValue = seed.GeneratedWorkOrderValue,
    PartialAmount =
        CASE
            WHEN workOrder.Id % 3 = 0
                THEN CAST(
                    ROUND(seed.GeneratedWorkOrderValue * 0.30, 2)
                    AS decimal(18,2)
                )
            ELSE NULL
        END
FROM dbo.WorkOrders AS workOrder
INNER JOIN SeedValues AS seed
    ON seed.Id = workOrder.Id;

DECLARE @RowsUpdated int = @@ROWCOUNT;

COMMIT TRANSACTION;

SELECT
    DB_NAME() AS DatabaseName,
    @RowsBefore AS RowsMissingValueBefore,
    @RowsUpdated AS RowsFilled,
    COUNT(*) AS TotalWorkOrders,
    SUM(CASE WHEN PartialAmount IS NOT NULL THEN 1 ELSE 0 END) AS RowsWithPartialAmount
FROM dbo.WorkOrders;
