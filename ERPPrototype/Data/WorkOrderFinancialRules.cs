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

        var normalizedPartial =
            NormalizeAmount(workOrder.PartialAmount);

        workOrder.PartialAmount =
            normalizedPartial == 0m
                ? null
                : normalizedPartial;
    }

    public static decimal? CalculateRemainingAmount(
        decimal? workOrderValue,
        decimal? partialAmount)
    {
        var normalizedValue = NormalizeAmount(workOrderValue);

        if (normalizedValue is null || normalizedValue <= 0m)
        {
            return null;
        }

        var normalizedPartial = NormalizeAmount(partialAmount) ?? 0m;

        if (normalizedPartial < 0m || normalizedPartial > normalizedValue)
        {
            return null;
        }

        return NormalizeAmount(
            normalizedValue.Value - normalizedPartial);
    }

    public static string? Validate(
        WorkOrder workOrder,
        bool requireWorkOrderValue)
    {
        var normalizedWorkOrderValue =
            NormalizeAmount(workOrder.WorkOrderValue);

        if (normalizedWorkOrderValue is null)
        {
            return requireWorkOrderValue
                ? "Work Order Value is required and must be greater than zero."
                : null;
        }

        if (normalizedWorkOrderValue <= 0m)
        {
            return "Work Order Value must be greater than zero.";
        }

        var normalizedPartial =
            NormalizeAmount(workOrder.PartialAmount);

        if (normalizedPartial is null || normalizedPartial == 0m)
        {
            return null;
        }

        if (normalizedPartial < 0m)
        {
            return "Partial Amount cannot be negative.";
        }

        if (normalizedPartial > normalizedWorkOrderValue)
        {
            return
                "Work Order Value cannot be less than the recorded " +
                $"Partial Amount: {normalizedPartial.Value.ToString(
                    "N2",
                    CultureInfo.InvariantCulture)}.";
        }

        return null;
    }
}
