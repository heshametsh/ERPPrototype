using NetArchTest.Rules;

namespace ContractorERP.ArchitectureTests;

/// <summary>
/// Keeps the modular monolith honest: modules talk through BuildingBlocks contracts only,
/// never by reaching into each other's code or tables.
/// </summary>
public class ModuleBoundaryTests
{
    private const string Root = "ContractorERP";

    [Theory]
    [InlineData(typeof(ContractorERP.Modules.WorkOrders.WorkOrdersModule), "ContractorERP.Modules.Organization")]
    [InlineData(typeof(ContractorERP.Modules.Organization.OrganizationModule), "ContractorERP.Modules.WorkOrders")]
    public void A_module_does_not_depend_on_another_module(Type moduleType, string forbidden)
    {
        var result = Types.InAssembly(moduleType.Assembly).ShouldNot().HaveDependencyOn(forbidden).GetResult();
        Assert.True(result.IsSuccessful, string.Join(", ", result.FailingTypeNames ?? []));
    }

    [Fact]
    public void BuildingBlocks_do_not_depend_on_modules_or_host()
    {
        var result = Types.InAssembly(typeof(ContractorERP.BuildingBlocks.Modules.IModule).Assembly)
            .ShouldNot().HaveDependencyOnAny($"{Root}.Modules", $"{Root}.Host").GetResult();
        Assert.True(result.IsSuccessful, string.Join(", ", result.FailingTypeNames ?? []));
    }

    [Fact]
    public void Domain_does_not_depend_on_database_or_web()
    {
        var result = Types.InAssembly(typeof(ContractorERP.Modules.WorkOrders.WorkOrdersModule).Assembly)
            .That().ResideInNamespace($"{Root}.Modules.WorkOrders.Domain")
            .ShouldNot().HaveDependencyOnAny("Microsoft.EntityFrameworkCore", "Microsoft.AspNetCore", "Npgsql")
            .GetResult();
        Assert.True(result.IsSuccessful, string.Join(", ", result.FailingTypeNames ?? []));
    }
}
