using ERPPrototype.Components;
using ERPPrototype.Components.Account;
using ERPPrototype.Data;
using Microsoft.AspNetCore.Components.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Syncfusion.Blazor;
using Syncfusion.Licensing;

var builder = WebApplication.CreateBuilder(args);

var syncfusionLicenseKey =
    builder.Configuration["Syncfusion:LicenseKey"]
    ?? throw new InvalidOperationException(
        "Syncfusion license key was not found. Add it to User Secrets.");

SyncfusionLicenseProvider.RegisterLicense(syncfusionLicenseKey);

builder.Services.AddSyncfusionBlazor();

builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();

builder.Services.AddCascadingAuthenticationState();
builder.Services.AddScoped<IdentityRedirectManager>();
builder.Services.AddScoped<
    AuthenticationStateProvider,
    IdentityRevalidatingAuthenticationStateProvider>();

builder.Services.AddAuthentication(options =>
{
    options.DefaultScheme =
        IdentityConstants.ApplicationScheme;

    options.DefaultSignInScheme =
        IdentityConstants.ExternalScheme;
})
    .AddIdentityCookies();

var originalConnectionString =
    builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException(
        "Connection string 'DefaultConnection' not found.");

// Azure SQL may need additional time during startup or resume.
// Preserve all existing connection settings and only increase
// the connection timeout.
var connectionStringBuilder =
    new SqlConnectionStringBuilder(originalConnectionString)
    {
        ConnectTimeout = 30
    };

var connectionString =
    connectionStringBuilder.ConnectionString;

builder.Services.AddDbContext<ApplicationDbContext>(
    options =>
        options.UseSqlServer(connectionString));

builder.Services.AddDbContextFactory<ApplicationDbContext>(
    options =>
        options.UseSqlServer(connectionString),
    ServiceLifetime.Scoped);

builder.Services.AddDatabaseDeveloperPageExceptionFilter();

builder.Services.AddScoped<UserManagementService>();

builder.Services.AddIdentityCore<ApplicationUser>(options =>
{
    options.SignIn.RequireConfirmedAccount = true;

    options.Stores.SchemaVersion =
        IdentitySchemaVersions.Version3;
})
    .AddRoles<IdentityRole>()
    .AddEntityFrameworkStores<ApplicationDbContext>()
    .AddSignInManager()
    .AddDefaultTokenProviders();

builder.Services.AddSingleton<
    IEmailSender<ApplicationUser>,
    IdentityNoOpEmailSender>();

var app = builder.Build();

// The application previously stopped with HTTP 500.30 when
// Azure SQL timed out while the startup seeder was running.
// Retry the entire idempotent seeding operation using a fresh
// dependency-injection scope for every attempt.
const int startupSeedMaxAttempts = 3;

var startupLogger =
    app.Services
        .GetRequiredService<ILoggerFactory>()
        .CreateLogger("ApplicationStartup");

for (var attempt = 1;
     attempt <= startupSeedMaxAttempts;
     attempt++)
{
    try
    {
        using var scope =
            app.Services.CreateScope();

        await ApplicationSeeder.SeedAsync(
            scope.ServiceProvider);

        startupLogger.LogInformation(
            "Application database initialization succeeded " +
            "on attempt {Attempt}.",
            attempt);

        break;
    }
    catch (SqlException exception)
        when (attempt < startupSeedMaxAttempts)
    {
        var delay =
            TimeSpan.FromSeconds(attempt * 5);

        startupLogger.LogWarning(
            exception,
            "Azure SQL was not ready during application startup. " +
            "Attempt {Attempt} of {MaximumAttempts} failed. " +
            "Retrying after {DelaySeconds} seconds.",
            attempt,
            startupSeedMaxAttempts,
            delay.TotalSeconds);

        await Task.Delay(delay);
    }
    catch (TimeoutException exception)
        when (attempt < startupSeedMaxAttempts)
    {
        var delay =
            TimeSpan.FromSeconds(attempt * 5);

        startupLogger.LogWarning(
            exception,
            "A database timeout occurred during application startup. " +
            "Attempt {Attempt} of {MaximumAttempts} failed. " +
            "Retrying after {DelaySeconds} seconds.",
            attempt,
            startupSeedMaxAttempts,
            delay.TotalSeconds);

        await Task.Delay(delay);
    }
    catch (Exception exception)
    {
        startupLogger.LogCritical(
            exception,
            "Application database initialization failed " +
            "after attempt {Attempt}.",
            attempt);

        throw;
    }
}

if (app.Environment.IsDevelopment())
{
    app.UseMigrationsEndPoint();
}
else
{
    app.UseExceptionHandler(
        "/Error",
        createScopeForErrors: true);

    app.UseHsts();
}

app.UseStatusCodePagesWithReExecute(
    "/not-found",
    createScopeForStatusCodePages: true);

app.UseHttpsRedirection();
app.UseAntiforgery();

app.MapStaticAssets();

app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

app.MapAdditionalIdentityEndpoints();

app.Run();