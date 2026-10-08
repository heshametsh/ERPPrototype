using ContractorERP.BuildingBlocks.Modules;
using ContractorERP.Modules.WorkOrders.Api;
using ContractorERP.Modules.WorkOrders.Application;
using ContractorERP.Modules.WorkOrders.Infrastructure;
using FluentValidation;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ContractorERP.Modules.WorkOrders;

/// <summary>The Master Work Orders sheet: read one department/year, save changes in one transaction.</summary>
public sealed class WorkOrdersModule : IModule
{
    public string Name => "WorkOrders";

    public void Register(IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<WorkOrdersDbContext>(options => options.UseNpgsql(
            configuration.GetConnectionString("Default"),
            npgsql => npgsql.MigrationsHistoryTable("__ef_migrations", WorkOrdersDbContext.SchemaName)));

        services.AddScoped<IValidator<SaveSheetRequest>, SaveSheetValidator>();
        services.AddScoped<GetSheetHandler>();
        services.AddScoped<SaveSheetHandler>();
    }

    public void MapEndpoints(IEndpointRouteBuilder endpoints) => WorkOrderEndpoints.Map(endpoints);
}
