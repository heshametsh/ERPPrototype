using System.Security.Claims;
using System.Threading.RateLimiting;
using ContractorERP.BuildingBlocks.Modules;
using ContractorERP.BuildingBlocks.Security;
using ContractorERP.BuildingBlocks.Time;
using ContractorERP.Host.Infrastructure;
using ContractorERP.Modules.Organization;
using ContractorERP.Modules.Organization.Api;
using ContractorERP.Modules.WorkOrders;
using Microsoft.AspNetCore.Identity;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

builder.Host.UseSerilog((context, logger) => logger.ReadFrom.Configuration(context.Configuration).WriteTo.Console());

// ---- Modules: adding a business area = one project + one line here. ----
IModule[] modules = [new OrganizationModule(), new WorkOrdersModule()];
foreach (var module in modules)
{
    module.Register(builder.Services, builder.Configuration);
}

// ---- Shared services ----
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<IBusinessClock, RiyadhBusinessClock>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, HttpCurrentUser>();
builder.Services.AddProblemDetails();
builder.Services.AddOpenApi();
builder.Services.AddHealthChecks();

// ---- Authentication: same-site cookie (the React app is served from the same origin). ----
builder.Services.AddAuthentication(IdentityConstants.ApplicationScheme).AddIdentityCookies();
builder.Services.ConfigureApplicationCookie(cookie =>
{
    cookie.Cookie.Name = "erp.auth";
    cookie.Cookie.HttpOnly = true;
    cookie.Cookie.SameSite = SameSiteMode.Strict;
    cookie.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
    cookie.ExpireTimeSpan = TimeSpan.FromHours(10);
    cookie.SlidingExpiration = true;

    // An API answers 401/403; it never redirects to an HTML login page.
    cookie.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = StatusCodes.Status401Unauthorized; return Task.CompletedTask; };
    cookie.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = StatusCodes.Status403Forbidden; return Task.CompletedTask; };
});

// A disabled user or a changed password is noticed within one minute, not 30 (lesson R8-F2).
builder.Services.Configure<SecurityStampValidatorOptions>(o => o.ValidationInterval = TimeSpan.FromMinutes(1));

builder.Services.AddAuthorizationBuilder()
    // Default for every business endpoint: signed in AND the temporary password was already changed (lesson SEC-001).
    .SetDefaultPolicy(new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .RequireAssertion(ctx => ctx.User.FindFirstValue(ErpClaims.MustChangePassword) == bool.FalseString)
        .Build())
    .AddPolicy(AuthPolicies.SignedIn, p => p.RequireAuthenticatedUser());

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy(AuthEndpoints.LoginRateLimitPolicy, ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1) }));
});

var app = builder.Build();

if (args.Contains("--migrate"))
{
    await DatabaseMigrator.MigrateAsync(app.Services, seedDevelopmentData: false);
    return;
}

if (app.Environment.IsDevelopment())
{
    await DatabaseMigrator.MigrateAsync(app.Services, seedDevelopmentData: true);
    app.MapOpenApi();
}
else
{
    app.UseHsts();
}

app.UseSerilogRequestLogging();
app.UseExceptionHandler();
app.UseSecurityHeaders();
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapHealthChecks("/health");
foreach (var module in modules)
{
    module.MapEndpoints(app);
}

// The React app handles its own routes.
app.MapFallbackToFile("index.html");

app.Run();

public partial class Program;
