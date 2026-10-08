using ContractorERP.Modules.Organization.Infrastructure;
using ContractorERP.Modules.WorkOrders.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace ContractorERP.Host.Infrastructure;

/// <summary>
/// Production migrations run as an explicit deployment step (`dotnet ContractorERP.Host.dll --migrate`),
/// never silently at web startup (lesson OPS-001: a failed startup migration took the whole site down).
/// </summary>
internal static class DatabaseMigrator
{
    public static async Task MigrateAsync(IServiceProvider services, bool seedDevelopmentData)
    {
        await using var scope = services.CreateAsyncScope();
        var sp = scope.ServiceProvider;
        await sp.GetRequiredService<OrganizationDbContext>().Database.MigrateAsync();
        await sp.GetRequiredService<WorkOrdersDbContext>().Database.MigrateAsync();

        if (seedDevelopmentData)
        {
            await sp.GetRequiredService<DevelopmentSeeder>().SeedAsync();
        }
    }
}
