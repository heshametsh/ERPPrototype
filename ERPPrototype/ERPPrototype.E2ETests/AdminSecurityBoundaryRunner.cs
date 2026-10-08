using Microsoft.Data.SqlClient;
using Microsoft.Playwright;

namespace ERPPrototype.E2ETests;

internal static class AdminSecurityBoundaryRunner
{
    private const int FixedPort = 5274;
    private const string AdminEmail = "e2e.admin@local.test";
    private const string AdminPassword = "E2E_Admin_2026!";

    public static async Task<int> RunAsync()
    {
        var projectRoot = FindProjectRoot();
        var artifactDirectory =
            E2EArtifactManager.CreateRunDirectory(projectRoot);
        Exception? failure = null;

        Console.WriteLine("Admin security boundary");
        Console.WriteLine(
            "Fresh DB authorization must block temporary-password and inactive Admin access.");
        Console.WriteLine();

        try
        {
            await using var database = await E2ETestDatabase.CreateAsync(
                keepDatabase: false,
                rowsPerYear: E2ETestDatabase.DefaultRowsPerYear);
            await using var application = await WebApplicationProcess.StartAsync(
                projectRoot,
                database.ConnectionString,
                artifactDirectory,
                fixedPort: FixedPort,
                configuration: "Debug");

            await SetAdminStateAsync(
                database.ConnectionString,
                isActive: true,
                mustChangePassword: false);

            await using var browser = await E2EBrowserSession.CreateAsync(
                application.BaseUri,
                artifactDirectory,
                headed: false,
                traceEnabled: false,
                benchmarkMode: false,
                viewportWidth: 1440,
                viewportHeight: 1000,
                windowWidth: 1500,
                windowHeight: 1050,
                screenWidth: 1920,
                screenHeight: 1080);

            var page = browser.Page;
            await LoginAdminAsync(page, application.BaseUri);
            await page.WaitForURLAsync(
                "**/admin*",
                new PageWaitForURLOptions { Timeout = 45_000 });
            await page.GetByRole(AriaRole.Heading,
                    new() { Name = "لوحة الإدارة" })
                .WaitForAsync();
            Console.WriteLine(
                "[01-valid-admin] PASS - valid Admin reached /admin.");

            await SetAdminStateAsync(
                database.ConnectionString,
                isActive: true,
                mustChangePassword: true);

            await page.GotoAsync(
                new Uri(application.BaseUri, "/admin").ToString(),
                new PageGotoOptions { WaitUntil = WaitUntilState.DOMContentLoaded });
            await page.WaitForURLAsync(
                "**/Account/Manage/ChangePassword*",
                new PageWaitForURLOptions { Timeout = 45_000 });
            Console.WriteLine(
                "[02-direct-route] PASS - temporary-password Admin was redirected away from /admin.");

            await SetAdminStateAsync(
                database.ConnectionString,
                isActive: false,
                mustChangePassword: false);
            await page.GotoAsync(
                new Uri(application.BaseUri, "/admin").ToString(),
                new PageGotoOptions { WaitUntil = WaitUntilState.DOMContentLoaded });
            await page.WaitForURLAsync(
                "**/Account/AccessDenied*",
                new PageWaitForURLOptions { Timeout = 45_000 });
            Console.WriteLine(
                "[03-inactive] PASS - inactive Admin was denied immediately on /admin.");

            browser.Diagnostics.AssertNoCriticalErrors();
        }
        catch (Exception exception)
        {
            failure = exception;
        }

        if (failure is null)
        {
            Console.WriteLine();
            Console.WriteLine("ADMIN SECURITY BOUNDARY: PASS");
            return 0;
        }

        Console.Error.WriteLine();
        Console.Error.WriteLine("ADMIN SECURITY BOUNDARY: FAILED");
        Console.Error.WriteLine(failure);
        return 1;
    }

    private static async Task LoginAdminAsync(IPage page, Uri baseUri)
    {
        var returnUrl = Uri.EscapeDataString("/admin");
        await page.GotoAsync(
            new Uri(
                baseUri,
                $"/Account/Login?ReturnUrl={returnUrl}").ToString(),
            new PageGotoOptions { WaitUntil = WaitUntilState.DOMContentLoaded });

        await page.GetByTestId("login-username").FillAsync(AdminEmail);
        await page.GetByTestId("login-password").FillAsync(AdminPassword);
        await page.GetByTestId("login-submit").ClickAsync();
    }

    private static async Task SetAdminStateAsync(
        string connectionString,
        bool isActive,
        bool mustChangePassword)
    {
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText =
            "UPDATE [AspNetUsers] SET [IsActive] = @IsActive, [MustChangePassword] = @MustChangePassword WHERE [Email] = @Email;";
        command.Parameters.AddWithValue("@IsActive", isActive);
        command.Parameters.AddWithValue("@MustChangePassword", mustChangePassword);
        command.Parameters.AddWithValue("@Email", AdminEmail);
        var affected = await command.ExecuteNonQueryAsync();
        E2ETestAssert.Equal(
            1,
            affected,
            "Expected exactly one Admin account to be updated.");
    }

    private static string FindProjectRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            var candidate = Path.Combine(
                directory.FullName,
                "ERPPrototype.csproj");
            if (File.Exists(candidate))
            {
                return directory.FullName;
            }

            directory = directory.Parent;
        }

        throw new DirectoryNotFoundException(
            "ERPPrototype.csproj was not found.");
    }
}
