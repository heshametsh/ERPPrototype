using System.Text.RegularExpressions;

namespace ContractorERP.Modules.WorkOrders.Domain;

/// <summary>The editable fields of one sheet row, as typed by the employee.</summary>
public sealed record WorkOrderFields(
    string Number,
    string WorkTypeCode,
    DateOnly AssignmentDate,
    decimal Value,
    decimal? PartialAmount,
    string Basket);

public sealed record FieldError(string Field, string Code, string Message);

/// <summary>
/// Single server owner of Work Order field rules. The browser repeats them only for fast feedback;
/// this class decides.
/// </summary>
public static partial class WorkOrderRules
{
    public const int MinYear = 2000;
    public const int MaxYear = 2100;
    public const int BasketMaxLength = 100;

    public static WorkOrderFields Normalize(WorkOrderFields fields) => fields with
    {
        Number = fields.Number.Trim(),
        WorkTypeCode = fields.WorkTypeCode.Trim(),
        Basket = fields.Basket.Trim(),
        PartialAmount = fields.PartialAmount == 0m ? null : fields.PartialAmount,
    };

    public static IReadOnlyList<FieldError> Validate(WorkOrderFields fields)
    {
        var errors = new List<FieldError>();

        if (!NineDigits().IsMatch(fields.Number))
        {
            errors.Add(new("number", "number_format", "رقم أمر العمل لازم يكون 9 أرقام"));
        }

        if (!ThreeDigits().IsMatch(fields.WorkTypeCode))
        {
            errors.Add(new("workTypeCode", "work_type_format", "نوع العمل لازم يكون 3 أرقام"));
        }

        if (fields.AssignmentDate.Year is < MinYear or > MaxYear)
        {
            errors.Add(new("assignmentDate", "assignment_year_range", $"سنة الإسناد لازم تكون بين {MinYear} و {MaxYear}"));
        }

        if (fields.Value < 0)
        {
            errors.Add(new("value", "value_negative", "قيمة أمر العمل ماينفعش تكون بالسالب"));
        }

        if (fields.PartialAmount is { } partial)
        {
            if (partial < 0)
            {
                errors.Add(new("partialAmount", "partial_negative", "المستخلص الجزئي ماينفعش يكون بالسالب"));
            }
            else if (partial > fields.Value)
            {
                errors.Add(new("partialAmount", "partial_exceeds_value", "المستخلص الجزئي أكبر من قيمة أمر العمل"));
            }
        }

        if (string.IsNullOrWhiteSpace(fields.Basket))
        {
            errors.Add(new("basket", "basket_required", "السلة مطلوبة"));
        }
        else if (fields.Basket.Length > BasketMaxLength)
        {
            errors.Add(new("basket", "basket_too_long", $"السلة أطول من {BasketMaxLength} حرف"));
        }

        return errors;
    }

    public static void Apply(WorkOrder target, WorkOrderFields fields)
    {
        target.Number = fields.Number;
        target.WorkTypeCode = fields.WorkTypeCode;
        target.AssignmentDate = fields.AssignmentDate;
        target.Value = fields.Value;
        target.PartialAmount = fields.PartialAmount;
        target.Basket = fields.Basket;
    }

    [GeneratedRegex(@"^\d{9}$")]
    private static partial Regex NineDigits();

    [GeneratedRegex(@"^\d{3}$")]
    private static partial Regex ThreeDigits();
}
