using System.Text.Json;
using ERPPrototype.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;

namespace ERPPrototype.IntegrationTests;

internal sealed class CustomColumnMigrationIntegrationTests
{
    private const string DefaultBaseConnection =
        "Server=(localdb)\\MSSQLLocalDB;Integrated Security=true;" +
        "TrustServerCertificate=true;MultipleActiveResultSets=true;";

    private const string PreviousMigration =
        "20260805183000_AddDepartmentColumnVisibility";

    private const string TargetMigration =
        "20260905110000_ScopeCustomColumnsByWorkYear";

    private const string FieldKey =
        "custom_migration_populated_001";

    public async Task YearScopeMigrationPreservesPopulatedLegacyDataAsync()
    {
        var configuredBaseConnection =
            Environment.GetEnvironmentVariable(
                "ERP_TEST_SQLSERVER_CONNECTION");

        var databaseName =
            $"ERPPrototype_MigrationTests_{DateTime.UtcNow:yyyyMMddHHmmss}_{Guid.NewGuid():N}";

        var connectionBuilder = new SqlConnectionStringBuilder(
            string.IsNullOrWhiteSpace(configuredBaseConnection)
                ? DefaultBaseConnection
                : configuredBaseConnection)
        {
            InitialCatalog = databaseName,
            ConnectTimeout = 30,
            TrustServerCertificate = true,
            MultipleActiveResultSets = true
        };

        var connectionString = connectionBuilder.ConnectionString;

        var identityServices = new ServiceCollection();
        identityServices.AddOptions();
        identityServices.Configure<IdentityOptions>(options =>
        {
            options.Stores.SchemaVersion = IdentitySchemaVersions.Version3;
        });

        await using var identityApplicationServices =
            identityServices.BuildServiceProvider();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseApplicationServiceProvider(identityApplicationServices)
            .UseSqlServer(connectionString)
            .Options;

        var factory = new TestDbContextFactory(options);

        try
        {
            await using (var dbContext =
                await factory.CreateDbContextAsync())
            {
                var migrator =
                    dbContext.GetService<IMigrator>();

                await migrator.MigrateAsync(PreviousMigration);
            }

            var departmentId =
                await SeedPopulatedLegacyDataAsync(connectionString);

            await using (var dbContext =
                await factory.CreateDbContextAsync())
            {
                var migrator =
                    dbContext.GetService<IMigrator>();

                await migrator.MigrateAsync(TargetMigration);
            }

            await AssertMigratedStateAsync(
                connectionString,
                departmentId);
        }
        finally
        {
            try
            {
                await using var cleanup =
                    await factory.CreateDbContextAsync();

                await cleanup.Database.EnsureDeletedAsync();
            }
            catch (Exception exception)
            {
                Console.Error.WriteLine(
                    $"Warning: could not delete populated migration test database {databaseName}: {exception.Message}");
            }
        }
    }

    private static async Task<int> SeedPopulatedLegacyDataAsync(
        string connectionString)
    {
        await using var connection =
            new SqlConnection(connectionString);

        await connection.OpenAsync();

        await using var command =
            connection.CreateCommand();

        command.CommandText =
            """
            SET NOCOUNT ON;

            INSERT INTO [Branches] ([Name])
            VALUES (N'Populated Migration Branch');

            DECLARE @BranchId int = CONVERT(int, SCOPE_IDENTITY());

            DECLARE @DepartmentTypeId int =
            (
                SELECT TOP (1) [Id]
                FROM [DepartmentTypes]
                ORDER BY [Id]
            );

            INSERT INTO [Departments]
                ([BranchId], [DepartmentTypeId])
            VALUES
                (@BranchId, @DepartmentTypeId);

            DECLARE @DepartmentId int =
                CONVERT(int, SCOPE_IDENTITY());

            INSERT INTO [WorkOrders]
                ([WorkOrderNumber],
                 [WorkTypeCode],
                 [WorkYear],
                 [DisplayOrder],
                 [AssignmentDate],
                 [WorkOrderValue],
                 [PartialAmount],
                 [Busket],
                 [CustomValuesJson],
                 [DepartmentId],
                 [CreatedAt],
                 [CreatedBy],
                 [UpdatedAt],
                 [UpdatedBy])
            VALUES
                ('910000001',
                 '401',
                 2025,
                 1000000000,
                 '2025-03-01',
                 1000.00,
                 100.00,
                 N'migration-basket',
                 N'{"custom_migration_populated_001":"legacy-2025"}',
                 @DepartmentId,
                 SYSUTCDATETIME(),
                 N'migration-test',
                 NULL,
                 NULL),
                ('910000002',
                 '402',
                 2026,
                 2000000000,
                 '2026-04-01',
                 2000.00,
                 200.00,
                 N'migration-basket',
                 N'{"custom_migration_populated_001":"legacy-2026"}',
                 @DepartmentId,
                 SYSUTCDATETIME(),
                 N'migration-test',
                 NULL,
                 NULL);

            INSERT INTO [CustomColumnDefinitions]
                ([DepartmentId],
                 [FieldKey],
                 [Name],
                 [DataType],
                 [LayoutOrder],
                 [CreatedAt],
                 [CreatedBy])
            VALUES
                (@DepartmentId,
                 'custom_migration_populated_001',
                 N'Legacy Permit Reference',
                 1,
                 7000000000000,
                 SYSUTCDATETIME(),
                 N'migration-test');

            SELECT @DepartmentId;
            """;

        var result =
            await command.ExecuteScalarAsync();

        return Convert.ToInt32(result);
    }

    private static async Task AssertMigratedStateAsync(
        string connectionString,
        int departmentId)
    {
        await using var connection =
            new SqlConnection(connectionString);

        await connection.OpenAsync();

        await using (var migrationCommand =
            connection.CreateCommand())
        {
            migrationCommand.CommandText =
                """
                SELECT COUNT(*)
                FROM [__EFMigrationsHistory]
                WHERE [MigrationId] =
                    '20260905110000_ScopeCustomColumnsByWorkYear';
                """;

            TestAssert.Equal(
                1,
                Convert.ToInt32(
                    await migrationCommand.ExecuteScalarAsync()),
                "The year-scope migration was not recorded as applied.");
        }

        var definitions =
            new List<(int WorkYear, string FieldKey, string Name, int DataType, long LayoutOrder)>();

        await using (var definitionCommand =
            connection.CreateCommand())
        {
            definitionCommand.CommandText =
                """
                SELECT
                    [WorkYear],
                    [FieldKey],
                    [Name],
                    [DataType],
                    [LayoutOrder]
                FROM [CustomColumnDefinitions]
                WHERE [DepartmentId] = @DepartmentId
                  AND [FieldKey] = @FieldKey
                ORDER BY [WorkYear];
                """;

            definitionCommand.Parameters.AddWithValue(
                "@DepartmentId",
                departmentId);
            definitionCommand.Parameters.AddWithValue(
                "@FieldKey",
                FieldKey);

            await using var reader =
                await definitionCommand.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                definitions.Add(
                    (
                        reader.GetInt32(0),
                        reader.GetString(1),
                        reader.GetString(2),
                        reader.GetInt32(3),
                        reader.GetInt64(4)
                    ));
            }
        }

        TestAssert.Equal(
            2,
            definitions.Count,
            "The migration did not create one definition per existing work year.");

        TestAssert.Equal(
            2025,
            definitions[0].WorkYear,
            "The first migrated definition has the wrong year.");
        TestAssert.Equal(
            2026,
            definitions[1].WorkYear,
            "The second migrated definition has the wrong year.");

        foreach (var definition in definitions)
        {
            TestAssert.Equal(
                FieldKey,
                definition.FieldKey,
                "The migration changed the legacy field key.");
            TestAssert.Equal(
                "Legacy Permit Reference",
                definition.Name,
                "The migration changed the legacy column name.");
            TestAssert.Equal(
                1,
                definition.DataType,
                "The migration changed the legacy column type.");
            TestAssert.Equal(
                7_000_000_000_000L,
                definition.LayoutOrder,
                "The migration changed the legacy layout order.");
        }

        var valuesByYear =
            new Dictionary<int, string>();

        await using (var workOrderCommand =
            connection.CreateCommand())
        {
            workOrderCommand.CommandText =
                """
                SELECT [WorkYear], [CustomValuesJson]
                FROM [WorkOrders]
                WHERE [DepartmentId] = @DepartmentId
                  AND [WorkOrderNumber] IN ('910000001', '910000002')
                ORDER BY [WorkYear];
                """;

            workOrderCommand.Parameters.AddWithValue(
                "@DepartmentId",
                departmentId);

            await using var reader =
                await workOrderCommand.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                using var document =
                    JsonDocument.Parse(reader.GetString(1));

                var value =
                    document.RootElement
                        .GetProperty(FieldKey)
                        .GetString();

                valuesByYear[reader.GetInt32(0)] =
                    value ?? string.Empty;
            }
        }

        TestAssert.Equal(
            2,
            valuesByYear.Count,
            "The migration lost one of the populated work orders.");
        TestAssert.Equal(
            "legacy-2025",
            valuesByYear[2025],
            "The migration changed the 2025 custom value.");
        TestAssert.Equal(
            "legacy-2026",
            valuesByYear[2026],
            "The migration changed the 2026 custom value.");
    }
}
