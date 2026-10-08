using ContractorERP.BuildingBlocks.Modules;
using ContractorERP.Modules.Organization.Api;
using ContractorERP.Modules.Organization.Domain;
using ContractorERP.Modules.Organization.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ContractorERP.Modules.Organization;

/// <summary>Company structure (branches, departments) and user accounts.</summary>
public sealed class OrganizationModule : IModule
{
    public string Name => "Organization";

    public void Register(IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<OrganizationDbContext>(options => options.UseNpgsql(
            configuration.GetConnectionString("Default"),
            npgsql => npgsql.MigrationsHistoryTable("__ef_migrations", OrganizationDbContext.Schema)));

        services
            .AddIdentityCore<AppUser>(options =>
            {
                // Approved rule: temporary passwords are 8 simple characters; real strength comes from lockout + forced change.
                options.Password.RequiredLength = 8;
                options.Password.RequireDigit = false;
                options.Password.RequireLowercase = false;
                options.Password.RequireUppercase = false;
                options.Password.RequireNonAlphanumeric = false;
                options.Lockout.MaxFailedAccessAttempts = 5;
                options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
                options.Lockout.AllowedForNewUsers = true;
                options.User.RequireUniqueEmail = false;
            })
            .AddRoles<IdentityRole<Guid>>()
            .AddEntityFrameworkStores<OrganizationDbContext>()
            .AddSignInManager<ActiveUserSignInManager>()
            .AddClaimsPrincipalFactory<ErpClaimsFactory>()
            .AddDefaultTokenProviders();

        services.AddScoped<DevelopmentSeeder>();
    }

    public void MapEndpoints(IEndpointRouteBuilder endpoints) => AuthEndpoints.Map(endpoints);
}
