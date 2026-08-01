using System.Globalization;
using ERPPrototype.Data.Entities;

namespace ERPPrototype.Data;

/// <summary>
/// Central financial rules for the Work Orders sheet.
/// The stored values are Work Order Value and Partial Amount only.
/// Remaining Amount is always derived and is never persisted.
/// </summary>
public static class WorkOrderFinancialRules
{
    public const int DecimalScale = 2;

    public static decimal? NormalizeAmount(decimal? value) =>
        value is null
            ? null
            : decimal.Round(
                value.Value,
                DecimalScale,
                MidpointRounding.AwayFromZero);

    public static void Normalize(WorkOrder workOrder)
    {
        workOrder.WorkOrderValue =
            NormalizeAmount(workOrder.WorkOrderValue);

        workOrder.PartialAmount =
            NormalizeAmount(workOrder.PartialAmount);
    }

    public static decimal? CalculateRemainingAmount(
        decimal? workOrderValue,
        decimal? partialAmount)
    {
        var normalizedValue = NormalizeAmount(workOrderValue);

        if (normalizedValue is null)
        {
            return null;
        }

        var normalizedPartial = NormalizeAmount(partialAmount) ?? 0m;

        return NormalizeAmount(
            normalizedValue.Value - normalizedPartial);
    }

    public static string? Validate(
        WorkOrder workOrder,
        bool requireWorkOrderValue)
    {
        if (workOrder.WorkOrderValue is null)
        {
            return requireWorkOrderValue
                ? "Work Order Value is required and must be greater than zero."
                : null;
        }

        if (workOrder.WorkOrderValue <= 0m)
        {
            return "Work Order Value must be greater than zero.";
        }

        if (workOrder.PartialAmount is null)
        {
            return null;
        }

        if (workOrder.PartialAmount <= 0m)
        {
            return "Partial Amount must be greater than zero when entered.";
        }

        if (workOrder.PartialAmount > workOrder.WorkOrderValue)
        {
            return
                "Work Order Value cannot be less than the recorded " +
                $"Partial Amount: {workOrder.PartialAmount.Value.ToString(
                    "N2",
                    CultureInfo.InvariantCulture)}.";
        }

        return null;
    }
}
