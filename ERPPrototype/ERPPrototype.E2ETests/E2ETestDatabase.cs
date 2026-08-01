using ERPPrototype.Data;
using ERPPrototype.Data.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace ERPPrototype.E2ETests;

internal sealed class E2ETestDatabase : IAsyncDisposable
{
    private const string DefaultBaseConnection =
        "Server=(localdb)\\MSSQLLocalDB;Integrated Security=true;" +
        "TrustServerCertificate=true;MultipleActiveResultSets=true;";

    private readonly ServiceProvider identityApplicationServices;
    private readonly DbContextOptions<ApplicationDbContext> dbOptions;
    private readonly bool keepDatabase;

    private E2ETestDatabase(
        string databaseName,
        string connectionString,
        DbContextOptions<ApplicationDbContext> dbOptions,
        ServiceProvider identityApplicationServices,
        bool keepDatabase,
        E2ESeedData seed)
    {
        DatabaseName = databaseName;
        ConnectionString = connectionString;
        this.dbOptions = dbOptions;
        this.identityApplicationServices = identityApplicationServices;
        this.keepDatabase = keepDatabase;
        Seed = seed;
    }

    public string DatabaseName { get; }

    public string ConnectionString { get; }

    public E2ESeedData Seed { get; }

    public static async Task<E2ETestDatabase> CreateAsync(
        bool keepDatabase,
        CancellationToken cancellationToken = default)
    {
        var configuredBaseConnection =
            Environment.GetEnvironmentVariable("ERP_TEST_SQLSERVER_CONNECTION");

        var databaseName =
            $"ERPPrototype_E2E_{DateTime.UtcNow:yyyyMMddHHmmss}_{Guid.NewGuid():N}";

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

        var identityApplicationServices =
            identityServices.BuildServiceProvider();

        var dbOptions =
            new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseApplicationServiceProvider(identityApplicationServices)
                .UseSqlServer(connectionString)
                .Options;

        try
        {
            await using var dbContext =
                new ApplicationDbContext(dbOptions);

            await dbContext.Database.MigrateAsync(cancellationToken);

            var seed = await SeedAsync(dbContext, cancellationToken);

            return new E2ETestDatabase(
                databaseName,
                connectionString,
                dbOptions,
                identityApplicationServices,
                keepDatabase,
                seed);
        }
        catch
        {
            if (!keepDatabase)
            {
                try
                {
                    await using var cleanupContext =
                        new ApplicationDbContext(dbOptions);

                    await cleanupContext.Database.EnsureDeletedAsync();
                }
                catch (Exception cleanupException)
                {
                    Console.Error.WriteLine(
                        $"Warning: failed to delete the temporary E2E database after setup failure: " +
                        cleanupException.Message);
                }
            }

            await identityApplicationServices.DisposeAsync();
            throw;
        }
    }

    private static async Task<E2ESeedData> SeedAsync(
        ApplicationDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var currentYear = DateTime.Now.Year;
        var previousYear = currentYear - 1;

        var branch = new Branch
        {
            Name = "فرع الأحساء — اختبار المتصفح"
        };

        var departmentType =
            await dbContext.DepartmentTypes.SingleAsync(
                departmentType =>
                    departmentType.Name ==
                    StandardDepartmentTypes.Connections,
                cancellationToken);

        var department = new Department
        {
            Branch = branch,
            DepartmentTypeId = departmentType.Id
        };

        dbContext.AddRange(branch, department);
        await dbContext.SaveChangesAsync(cancellationToken);

        var employeeRole = new IdentityRole
        {
            Id = Guid.NewGuid().ToString("N"),
            Name = AppRoles.Employee,
            NormalizedName = AppRoles.Employee.ToUpperInvariant(),
            ConcurrencyStamp = Guid.NewGuid().ToString("N")
        };

        const string userName = "e2e.employee";
        const string password = "E2E_Test_2026!";

        var employee = new ApplicationUser
        {
            Id = Guid.NewGuid().ToString("N"),
            UserName = userName,
            NormalizedUserName = userName.ToUpperInvariant(),
            Email = "e2e.employee@local.test",
            NormalizedEmail = "E2E.EMPLOYEE@LOCAL.TEST",
            EmailConfirmed = true,
            FullName = "موظف اختبار المتصفح",
            IsActive = true,
            MustChangePassword = false,
            BranchId = branch.Id,
            DepartmentId = department.Id,
            SecurityStamp = Guid.NewGuid().ToString("N"),
            ConcurrencyStamp = Guid.NewGuid().ToString("N"),
            LockoutEnabled = true
        };

        employee.PasswordHash =
            new PasswordHasher<ApplicationUser>()
                .HashPassword(employee, password);

        dbContext.Roles.Add(employeeRole);
        dbContext.Users.Add(employee);
        dbContext.UserRoles.Add(
            new IdentityUserRole<string>
            {
                UserId = employee.Id,
                RoleId = employeeRole.Id
            });

        const string currentYearWorkOrderNumber = "920000001";
        const string previousYearWorkOrderNumber = "920000002";

        dbContext.WorkOrders.AddRange(
            new WorkOrder
            {
                WorkOrderNumber = currentYearWorkOrderNumber,
                WorkTypeCode = "401",
                WorkYear = currentYear,
                DisplayOrder = 1_000_000_000L,
                AssignmentDate = new DateTime(currentYear, 1, 15),
                Busket = WorkOrderBuskets.InProgress,
                Status = "تحت التنفيذ",
                Notes = "Phase 9 current-year browser row",
                DepartmentId = department.Id,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = employee.Id
            },
            new WorkOrder
            {
                WorkOrderNumber = previousYearWorkOrderNumber,
                WorkTypeCode = "402",
                WorkYear = previousYear,
                DisplayOrder = 1_000_000_000L,
                AssignmentDate = new DateTime(previousYear, 2, 20),
                Busket = WorkOrderBuskets.InProgress,
                Status = "تحت التنفيذ",
                Notes = "Phase 9 previous-year browser row",
                DepartmentId = department.Id,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = employee.Id
            });

        await dbContext.SaveChangesAsync(cancellationToken);

        return new E2ESeedData(
            UserName: userName,
            Password: password,
            BranchName: branch.Name,
            DepartmentName: departmentType.Name,
            CurrentYear: currentYear,
            PreviousYear: previousYear,
            CurrentYearWorkOrderNumber: currentYearWorkOrderNumber,
            PreviousYearWorkOrderNumber: previousYearWorkOrderNumber);
    }

    public async ValueTask DisposeAsync()
    {
        try
        {
            if (keepDatabase)
            {
                Console.WriteLine(
                    $"Temporary E2E database kept for diagnosis: {DatabaseName}");

                return;
            }

            await using var dbContext =
                new ApplicationDbContext(dbOptions);

            await dbContext.Database.EnsureDeletedAsync();
        }
        finally
        {
            await identityApplicationServices.DisposeAsync();
        }
    }
}

internal sealed record E2ESeedData(
    string UserName,
    string Password,
    string BranchName,
    string DepartmentName,
    int CurrentYear,
    int PreviousYear,
    string CurrentYearWorkOrderNumber,
    string PreviousYearWorkOrderNumber);
