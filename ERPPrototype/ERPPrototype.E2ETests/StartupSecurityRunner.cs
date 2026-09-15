using Microsoft.Data.SqlClient;

namespace ERPPrototype.E2ETests;

internal static class StartupSecurityRunner
{
    private const string AdminEmail = "e2e.admin@local.test";

    public static async Task<int> RunAsync()
    {
        var projectRoot = FindProjectRoot();
        var artifactDirectory = E2EArtifactManager.CreateRunDirectory(projectRoot);
        Exception? failure = null;

        Console.WriteLine("Startup security regression");
        Console.WriteLine("A disabled Admin must stay disabled after an application restart.");
        Console.WriteLine();

        try
        {
            await using var database = await E2ETestDatabase.CreateAsync(
                keepDatabase: false,
                rowsPerYear: E2ETestDatabase.DefaultRowsPerYear);

            await StartAndStopAsync(
                projectRoot,
                database.ConnectionString,
                artifactDirectory,
                port: 5271);
            E2ETestAssert.True(
                await GetAdminActiveAsync(database.ConnectionString),
                "First startup did not create an active initial Admin.");
            Console.WriteLine("[01-first-start] PASS - missing Admin is created active");

            await SetAdminActiveAsync(database.ConnectionString, false);
            E2ETestAssert.True(
                !await GetAdminActiveAsync(database.ConnectionString),
                "Test setup failed to disable the Admin.");
            Console.WriteLine("[02-disable] PASS - Admin was explicitly disabled");

            await StartAndStopAsync(
                projectRoot,
                database.ConnectionString,
                artifactDirectory,
                port: 5272);

            E2ETestAssert.True(
                !await GetAdminActiveAsync(database.ConnectionString),
                "Application restart silently reactivated the disabled Admin.");
            Console.WriteLine("[03-restart] PASS - disabled Admin stayed disabled after restart");
        }
        catch (Exception exception)
        {
            failure = exception;
        }
        if (failure is null)
        {
            Console.WriteLine();
            Console.WriteLine("STARTUP SECURITY REGRESSION: PASS");
            return 0;
        }

        Console.Error.WriteLine();
        Console.Error.WriteLine("STARTUP SECURITY REGRESSION: FAILED");
        Console.Error.WriteLine(failure);
        return 1;
    }

    private static async Task StartAndStopAsync(
        string projectRoot,
        string connectionString,
        string artifactDirectory,
        int port)
    {
        await using var application = await WebApplicationProcess.StartAsync(
            projectRoot,
            connectionString,
            artifactDirectory,
            fixedPort: port,
            configuration: "Debug");
    }
    private static async Task<bool> GetAdminActiveAsync(string connectionString)
    {
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText =
            "SELECT [IsActive] FROM [AspNetUsers] WHERE [Email] = @Email;";
        command.Parameters.AddWithValue("@Email", AdminEmail);
        var value = await command.ExecuteScalarAsync();
        E2ETestAssert.True(
            value is not null && value is not DBNull,
            "Initial Admin was not found after startup.");
        return Convert.ToBoolean(value);
    }

    private static async Task SetAdminActiveAsync(
        string connectionString,
        bool isActive)
    {
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText =
            "UPDATE [AspNetUsers] SET [IsActive] = @IsActive WHERE [Email] = @Email;";
        command.Parameters.AddWithValue("@IsActive", isActive);
        command.Parameters.AddWithValue("@Email", AdminEmail);
        var affected = await command.ExecuteNonQueryAsync();
        E2ETestAssert.Equal(
            1,
            affected,
            "Expected exactly one initial Admin to be updated.");
    }

    private static string FindProjectRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            var candidate = Path.Combine(directory.FullName, "ERPPrototype.csproj");
            if (File.Exists(candidate))
            {
                return directory.FullName;
            }

            directory = directory.Parent;
        }

        throw new DirectoryNotFoundException("ERPPrototype.csproj was not found.");
    }
}
