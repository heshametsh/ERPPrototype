using ERPPrototype.Data;
using ERPPrototype.Data.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace ERPPrototype.E2ETests;

internal sealed class E2ETestDatabase : IAsyncDisposable
{
    internal const int DefaultRowsPerYear = 1_000;

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
        int rowsPerYear = DefaultRowsPerYear,
        CancellationToken cancellationToken = default)
    {
        if (rowsPerYear is < 1_000 or > 10_000)
        {
            throw new ArgumentOutOfRangeException(
                nameof(rowsPerYear),
                rowsPerYear,
                "Rows per year must be from 1,000 through 10,000.");
        }

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

            var seed = await SeedAsync(
                dbContext,
                rowsPerYear,
                cancellationToken);

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
        int rowsPerYear,
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

        var currentRows = CreateYearRows(
            employee.Id,
            department.Id,
            currentYear,
            workOrderBase: 920_000_000,
            notePrefix: "Phase 9 current-year browser row",
            rowsPerYear);

        var previousRows = CreateYearRows(
            employee.Id,
            department.Id,
            previousYear,
            workOrderBase: 921_000_000,
            notePrefix: "Phase 9 previous-year browser row",
            rowsPerYear);

        dbContext.WorkOrders.AddRange(currentRows);
        dbContext.WorkOrders.AddRange(previousRows);
        await dbContext.SaveChangesAsync(cancellationToken);

        var currentFirst = currentRows[0];
        var currentMiddle = currentRows[rowsPerYear / 2 - 1];
        var currentLast = currentRows[^1];
        var previousFirst = previousRows[0];
        var previousLast = previousRows[^1];

        return new E2ESeedData(
            UserName: userName,
            Password: password,
            BranchName: branch.Name,
            DepartmentName: departmentType.Name,
            CurrentYear: currentYear,
            PreviousYear: previousYear,
            RowsPerYear: rowsPerYear,
            CurrentYearFirstRowId: currentFirst.Id,
            CurrentYearFirstWorkOrderNumber: currentFirst.WorkOrderNumber,
            CurrentYearMiddleRowId: currentMiddle.Id,
            CurrentYearMiddleWorkOrderNumber: currentMiddle.WorkOrderNumber,
            CurrentYearFirstNote: currentFirst.Notes ?? string.Empty,
            CurrentYearMiddleNote: currentMiddle.Notes ?? string.Empty,
            CurrentYearLastNote: currentLast.Notes ?? string.Empty,
            CurrentYearLastRowId: currentLast.Id,
            CurrentYearLastWorkOrderNumber: currentLast.WorkOrderNumber,
            PreviousYearFirstWorkOrderNumber: previousFirst.WorkOrderNumber,
            PreviousYearLastRowId: previousLast.Id,
            PreviousYearLastWorkOrderNumber: previousLast.WorkOrderNumber);
    }

    private static List<WorkOrder> CreateYearRows(
        string employeeId,
        int departmentId,
        int year,
        int workOrderBase,
        string notePrefix,
        int rowsPerYear)
    {
        var workTypeCodes = new[] { "401", "402", "801", "802" };
        var statusValues = new[]
        {
            "تحت التنفيذ",
            "مراجعة",
            "متوقف",
            string.Empty
        };
        var rows = new List<WorkOrder>(rowsPerYear);

        for (var index = 1; index <= rowsPerYear; index++)
        {
            var workOrderValue =
                50_000m +
                ((index % 400) * 5_000m) +
                ((index % 4) * 0.25m);

            var partialAmount = index % 3 == 0
                ? decimal.Round(
                    workOrderValue * 0.30m,
                    2,
                    MidpointRounding.AwayFromZero)
                : (decimal?)null;

            rows.Add(
                new WorkOrder
                {
                    WorkOrderNumber =
                        (workOrderBase + index).ToString("D9"),
                    WorkTypeCode =
                        workTypeCodes[(index - 1) % workTypeCodes.Length],
                    WorkYear = year,
                    DisplayOrder = index * 1_000_000_000L,
                    AssignmentDate = new DateTime(
                        year,
                        ((index - 1) % 12) + 1,
                        ((index - 1) % 28) + 1),
                    WorkOrderValue = workOrderValue,
                    PartialAmount = partialAmount,
                    Busket = WorkOrderBuskets.InProgress,
                    Status =
                        statusValues[(index - 1) % statusValues.Length],
                    Notes = $"{notePrefix} {index:D4}",
                    DepartmentId = departmentId,
                    CreatedAt = DateTime.UtcNow.AddTicks(index),
                    CreatedBy = employeeId
                });
        }

        return rows;
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
    int RowsPerYear,
    int CurrentYearFirstRowId,
    string CurrentYearFirstWorkOrderNumber,
    int CurrentYearMiddleRowId,
    string CurrentYearMiddleWorkOrderNumber,
    string CurrentYearFirstNote,
    string CurrentYearMiddleNote,
    string CurrentYearLastNote,
    int CurrentYearLastRowId,
    string CurrentYearLastWorkOrderNumber,
    string PreviousYearFirstWorkOrderNumber,
    int PreviousYearLastRowId,
    string PreviousYearLastWorkOrderNumber);
