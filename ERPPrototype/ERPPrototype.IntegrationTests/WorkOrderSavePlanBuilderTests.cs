using ERPPrototype.Data;
using ERPPrototype.Data.Entities;

namespace ERPPrototype.IntegrationTests;

internal sealed class WorkOrderSavePlanBuilderTests
{
    private readonly WorkOrderSavePlanBuilder builder = new();

    public Task NormalizesEditableFieldsAsync()
    {
        var record = CreateNewRecord(
            -3001,
            " ٨١٠٠٠٠٠١٣ ",
            " ۴۱۳ ",
            $" {WorkOrderBuskets.InProgress} ",
            "  تحت التنفيذ  ",
            "  normalized notes  ");

        var result = builder.Build(
            2026,
            addedRecords: [record],
            changedRecords: Array.Empty<WorkOrderChangeSet>(),
            deletedRecords: []);

        TestAssert.True(
            result.Succeeded,
            $"The normalized save plan failed: {result.Failure?.ErrorMessage}");

        var planned = result.Plan!.NewRecords.Single();

        TestAssert.Equal(
            "810000013",
            planned.WorkOrderNumber,
            "Arabic Work Order Number digits were not normalized.");

        TestAssert.Equal(
            "413",
            planned.WorkTypeCode,
            "Persian Work Type digits were not normalized.");

        TestAssert.Equal(
            WorkOrderBuskets.InProgress,
            planned.Busket,
            "Basket whitespace was not normalized.");

        TestAssert.Equal(
            "تحت التنفيذ",
            planned.Status,
            "Status whitespace was not normalized.");

        TestAssert.Equal(
            "normalized notes",
            planned.Notes,
            "Notes whitespace was not normalized.");

        return Task.CompletedTask;
    }

    public Task IgnoresBlankRowsAndPreservesNewRowIdentityAsync()
    {
        var blank = new WorkOrder
        {
            Id = 0
        };

        var zeroIdOne = CreateNewRecord(
            0,
            "810000014",
            "414",
            WorkOrderBuskets.InProgress,
            "تحت التنفيذ",
            "zero-one");

        var zeroIdTwo = CreateNewRecord(
            0,
            "810000015",
            "415",
            WorkOrderBuskets.InProgress,
            "تحت التنفيذ",
            "zero-two");

        var temporaryFirst = CreateNewRecord(
            -3016,
            "810000016",
            "416",
            WorkOrderBuskets.InProgress,
            "تحت التنفيذ",
            "temporary-first");

        var temporaryLast = CreateNewRecord(
            -3016,
            "810000016",
            "416",
            WorkOrderBuskets.InProgress,
            "تحت التنفيذ",
            "temporary-last");

        var result = builder.Build(
            2026,
            addedRecords:
            [
                blank,
                zeroIdOne,
                zeroIdTwo,
                temporaryFirst
            ],
            changedRecords:
            [
                WorkOrderChangeSet.AllFields(temporaryLast)
            ],
            deletedRecords: []);

        TestAssert.True(
            result.Succeeded,
            $"The new-row plan failed: {result.Failure?.ErrorMessage}");

        TestAssert.Equal(
            3,
            result.Plan!.NewRecords.Count,
            "Blank rows or repeated temporary rows were planned incorrectly.");

        TestAssert.Equal(
            2,
            result.Plan.NewRecords.Count(record => record.Id == 0),
            "Distinct Id 0 rows must all be preserved.");

        TestAssert.Equal(
            "temporary-last",
            result.Plan.NewRecords.Single(record => record.Id == -3016).Notes,
            "The latest version of a repeated negative temporary Id was not used.");

        return Task.CompletedTask;
    }


    public Task NormalizesAndValidatesFinancialAmountsAsync()
    {
        var record = CreateNewRecord(
            -3019,
            "810000019",
            "419",
            WorkOrderBuskets.InProgress,
            "تحت التنفيذ",
            "financial-normalization");
        record.WorkOrderValue = 1_250_000.565m;
        record.PartialAmount = 250_000.255m;

        var result = builder.Build(
            2026,
            addedRecords: [record],
            changedRecords: Array.Empty<WorkOrderChangeSet>(),
            deletedRecords: []);

        TestAssert.True(
            result.Succeeded,
            $"The financial save plan failed: {result.Failure?.ErrorMessage}");

        var planned = result.Plan!.NewRecords.Single();

        TestAssert.Equal(
            (decimal?)1_250_000.57m,
            planned.WorkOrderValue,
            "Work Order Value was not rounded away from zero to two decimals.");

        TestAssert.Equal(
            (decimal?)250_000.26m,
            planned.PartialAmount,
            "Partial Amount was not rounded away from zero to two decimals.");

        TestAssert.Equal(
            (decimal?)1_000_000.31m,
            WorkOrderFinancialRules.CalculateRemainingAmount(
                planned.WorkOrderValue,
                planned.PartialAmount),
            "Remaining Amount was not calculated from normalized values.");

        return Task.CompletedTask;
    }

    public Task RejectsInvalidFinancialAmountsAsync()
    {
        var missingValue = CreateNewRecord(
            -3020,
            "810000020",
            "420",
            WorkOrderBuskets.InProgress,
            "تحت التنفيذ",
            "missing-value");
        missingValue.WorkOrderValue = null;

        var missingResult = builder.Build(
            2026,
            addedRecords: [missingValue],
            changedRecords: Array.Empty<WorkOrderChangeSet>(),
            deletedRecords: []);

        TestAssert.False(
            missingResult.Succeeded,
            "A new work order without Work Order Value entered database execution.");

        var zeroValue = CreateNewRecord(
            -3022,
            "810000025",
            "425",
            WorkOrderBuskets.InProgress,
            "تحت التنفيذ",
            "zero-value");
        zeroValue.WorkOrderValue = 0m;

        var zeroValueResult = builder.Build(
            2026,
            addedRecords: [zeroValue],
            changedRecords: Array.Empty<WorkOrderChangeSet>(),
            deletedRecords: []);

        TestAssert.False(
            zeroValueResult.Succeeded,
            "A zero Work Order Value entered database execution.");

        var zeroPartial = CreateNewRecord(
            -3023,
            "810000026",
            "426",
            WorkOrderBuskets.InProgress,
            "تحت التنفيذ",
            "zero-partial");
        zeroPartial.PartialAmount = 0m;

        var zeroPartialResult = builder.Build(
            2026,
            addedRecords: [zeroPartial],
            changedRecords: Array.Empty<WorkOrderChangeSet>(),
            deletedRecords: []);

        TestAssert.False(
            zeroPartialResult.Succeeded,
            "An entered zero Partial Amount entered database execution.");

        var excessivePartial = CreateNewRecord(
            -3021,
            "810000021",
            "421",
            WorkOrderBuskets.InProgress,
            "تحت التنفيذ",
            "partial-above-value");
        excessivePartial.WorkOrderValue = 100_000m;
        excessivePartial.PartialAmount = 100_000.01m;

        var excessiveResult = builder.Build(
            2026,
            addedRecords: [excessivePartial],
            changedRecords: Array.Empty<WorkOrderChangeSet>(),
            deletedRecords: []);

        TestAssert.False(
            excessiveResult.Succeeded,
            "A Partial Amount above Work Order Value entered database execution.");

        TestAssert.True(
            excessiveResult.Failure?.ErrorMessage?.Contains(
                "cannot be less than",
                StringComparison.OrdinalIgnoreCase) == true,
            "The financial validation did not return the expected relationship error.");

        return Task.CompletedTask;
    }

    public Task UnrelatedLegacyEditDoesNotRunFinancialRulesAsync()
    {
        var legacy = CreateExistingRecord(
            3027,
            "810000027",
            "427");
        legacy.WorkOrderValue = null;
        legacy.PartialAmount = null;
        legacy.Notes = "legacy-note-change";

        var result = builder.Build(
            2026,
            addedRecords: [],
            changedRecords:
            [
                new WorkOrderChangeSet(
                    legacy,
                    new HashSet<string>(StringComparer.Ordinal)
                    {
                        WorkOrderFieldRegistry.Notes
                    })
            ],
            deletedRecords: []);

        TestAssert.True(
            result.Succeeded,
            "An unrelated Notes edit incorrectly ran financial validation for a legacy row.");

        return Task.CompletedTask;
    }

    public Task RejectsChangedAndDeletedSameRecordAsync()
    {
        var changed = CreateExistingRecord(
            3017,
            "810000017",
            "417");

        var deleted = Clone(changed);

        var result = builder.Build(
            2026,
            addedRecords: [],
            changedRecords:
            [
                WorkOrderChangeSet.AllFields(changed)
            ],
            deletedRecords: [deleted]);

        TestAssert.False(
            result.Succeeded,
            "A record was allowed to be changed and deleted in one save plan.");

        TestAssert.Equal(
            WorkOrderSaveFailureType.Validation,
            result.Failure!.FailureType,
            "Changed-and-deleted overlap should be a validation failure.");

        return Task.CompletedTask;
    }

    public Task RejectsMissingRowVersionAsync()
    {
        var changed = CreateExistingRecord(
            3018,
            "810000018",
            "418");
        changed.RowVersion = [];

        var result = builder.Build(
            2026,
            addedRecords: [],
            changedRecords:
            [
                WorkOrderChangeSet.AllFields(changed)
            ],
            deletedRecords: []);

        TestAssert.False(
            result.Succeeded,
            "An existing record without RowVersion entered database execution.");

        TestAssert.Equal(
            WorkOrderSaveFailureType.Concurrency,
            result.Failure!.FailureType,
            "Missing RowVersion should be a concurrency failure.");

        TestAssert.Equal(
            changed.Id,
            result.Failure.WorkOrderId ?? -1,
            "The RowVersion failure did not identify the affected record.");

        return Task.CompletedTask;
    }

    private static WorkOrder CreateNewRecord(
        int id,
        string workOrderNumber,
        string workTypeCode,
        string basket,
        string status,
        string? notes) =>
        new()
        {
            Id = id,
            WorkOrderNumber = workOrderNumber,
            WorkTypeCode = workTypeCode,
            WorkYear = 2026,
            DisplayOrder = 0,
            AssignmentDate = null,
            WorkOrderValue = 125_000m,
            PartialAmount = null,
            Busket = basket,
            Status = status,
            Notes = notes
        };

    private static WorkOrder CreateExistingRecord(
        int id,
        string workOrderNumber,
        string workTypeCode) =>
        new()
        {
            Id = id,
            WorkOrderNumber = workOrderNumber,
            WorkTypeCode = workTypeCode,
            WorkYear = 2026,
            DisplayOrder = id * 1_000_000_000L,
            AssignmentDate = null,
            WorkOrderValue = 125_000m,
            PartialAmount = null,
            Busket = WorkOrderBuskets.InProgress,
            Status = "تحت التنفيذ",
            Notes = null,
            RowVersion = new byte[8]
        };

    private static WorkOrder Clone(WorkOrder source) =>
        new()
        {
            Id = source.Id,
            WorkOrderNumber = source.WorkOrderNumber,
            WorkTypeCode = source.WorkTypeCode,
            WorkYear = source.WorkYear,
            DisplayOrder = source.DisplayOrder,
            AssignmentDate = source.AssignmentDate,
            WorkOrderValue = source.WorkOrderValue,
            PartialAmount = source.PartialAmount,
            Busket = source.Busket,
            Status = source.Status,
            Notes = source.Notes,
            RowVersion = source.RowVersion.ToArray()
        };
}
