using ContractorERP.Modules.WorkOrders.Domain;

namespace ContractorERP.UnitTests;

public class WorkOrderRulesTests
{
    private static WorkOrderFields Valid() => new("123456789", "001", new DateOnly(2026, 3, 1), 1000m, 300m, "التنفيذ");

    [Fact]
    public void Valid_row_has_no_errors() => Assert.Empty(WorkOrderRules.Validate(Valid()));

    [Theory]
    [InlineData("12345678")]
    [InlineData("1234567890")]
    [InlineData("12345678A")]
    public void Number_must_be_nine_digits(string number) =>
        Assert.Contains(WorkOrderRules.Validate(Valid() with { Number = number }), e => e.Field == "number");

    [Fact]
    public void Partial_cannot_exceed_value() =>
        Assert.Contains(WorkOrderRules.Validate(Valid() with { PartialAmount = 1001m }), e => e.Code == "partial_exceeds_value");

    [Fact]
    public void Partial_zero_is_normalized_to_blank() =>
        Assert.Null(WorkOrderRules.Normalize(Valid() with { PartialAmount = 0m }).PartialAmount);

    [Fact]
    public void Remaining_is_value_minus_partial_and_year_follows_assignment_date()
    {
        var order = new WorkOrder();
        WorkOrderRules.Apply(order, Valid());
        Assert.Equal(700m, order.RemainingAmount);
        Assert.Equal(2026, order.WorkYear);

        order.PartialAmount = null;
        Assert.Equal(1000m, order.RemainingAmount);
    }

    [Fact]
    public void Assignment_year_must_be_in_range() =>
        Assert.Contains(WorkOrderRules.Validate(Valid() with { AssignmentDate = new DateOnly(1999, 12, 31) }), e => e.Field == "assignmentDate");
}
