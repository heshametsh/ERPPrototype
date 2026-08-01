using ERPPrototype.Data;
using ERPPrototype.Data.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace ERPPrototype.IntegrationTests;

internal sealed class IntegrationTestDatabase : IAsyncDisposable
{
    private const string DefaultBaseConnection =
        "Server=(localdb)\\MSSQLLocalDB;Integrated Security=true;" +
        "TrustServerCertificate=true;MultipleActiveResultSets=true;";

    private readonly bool keepDatabase;
    private readonly ServiceProvider identityApplicationServices;

    private IntegrationTestDatabase(
        string databaseName,
        string connectionString,
        TestDbContextFactory factory,
        WorkOrderService service,
        ServiceProvider identityApplicationServices,
        bool keepDatabase,
        int branchId,
        int departmentAId,
        int departmentBId,
        string employeeAId,
        string employeeBId)
    {
        DatabaseName = databaseName;
        ConnectionString = connectionString;
        Factory = factory;
        Service = service;
        this.identityApplicationServices = identityApplicationServices;
        this.keepDatabase = keepDatabase;
        BranchId = branchId;
        DepartmentAId = departmentAId;
        DepartmentBId = departmentBId;
        EmployeeAId = employeeAId;
        EmployeeBId = employeeBId;
    }

    public string DatabaseName { get; }

    public string ConnectionString { get; }

    public TestDbContextFactory Factory { get; }

    public WorkOrderService Service { get; }

    public int BranchId { get; }

    public int DepartmentAId { get; }

    public int DepartmentBId { get; }

    public string EmployeeAId { get; }

    public string EmployeeBId { get; }

    public static async Task<IntegrationTestDatabase> CreateAsync(
        bool keepDatabase,
        CancellationToken cancellationToken = default)
    {
        var configuredBaseConnection =
            Environment.GetEnvironmentVariable(
                "ERP_TEST_SQLSERVER_CONNECTION");

        var databaseName =
            $"ERPPrototype_IntegrationTests_{DateTime.UtcNow:yyyyMMddHHmmss}_{Guid.NewGuid():N}";

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

        // IdentityDbContext reads StoreOptions from EF's application service
        // provider while building the model. The production app supplies these
        // options through AddDbContext. The standalone integration runner must
        // mirror the same Identity schema version explicitly; otherwise Identity
        // falls back to Version1 and EF reports false pending model changes
        // (dropping passkeys and widening Identity key columns).
        var identityServices = new ServiceCollection();
        identityServices.AddOptions();
        identityServices.Configure<IdentityOptions>(options =>
        {
            options.Stores.SchemaVersion = IdentitySchemaVersions.Version3;
        });

        var identityApplicationServices =
            identityServices.BuildServiceProvider();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseApplicationServiceProvider(identityApplicationServices)
            .UseSqlServer(connectionString)
            .Options;

        var factory = new TestDbContextFactory(options);

        try
        {
            await using (var dbContext =
                await factory.CreateDbContextAsync(cancellationToken))
            {
                try
                {
                    await dbContext.Database.MigrateAsync(cancellationToken);
                }
                catch (InvalidOperationException exception)
                    when (PendingModelChangesDiagnostics.IsPendingModelChanges(exception))
                {
                    var diagnosticReport =
                        PendingModelChangesDiagnostics.BuildReport(dbContext);

                    throw new InvalidOperationException(
                        diagnosticReport,
                        exception);
                }
            }

            var seed = await SeedCoreAsync(factory, cancellationToken);

            var queryService = new WorkOrderQueryService(
                factory,
                NullLogger<WorkOrderQueryService>.Instance);

            var savePlanBuilder = new WorkOrderSavePlanBuilder();

            var service = new WorkOrderService(
                factory,
                queryService,
                savePlanBuilder,
                NullLogger<WorkOrderService>.Instance);

            return new IntegrationTestDatabase(
                databaseName,
                connectionString,
                factory,
                service,
                identityApplicationServices,
                keepDatabase,
                seed.BranchId,
                seed.DepartmentAId,
                seed.DepartmentBId,
                seed.EmployeeAId,
                seed.EmployeeBId);
        }
        catch
        {
            await identityApplicationServices.DisposeAsync();
            throw;
        }
    }

    public async Task<WorkOrder> SeedWorkOrderAsync(
        int departmentId,
        string createdBy,
        string workOrderNumber,
        string workTypeCode,
        int workYear,
        string? notes,
        DateTime? assignmentDate = null,
        long? displayOrder = null,
        decimal workOrderValue = 125_000m,
        decimal? partialAmount = null,
        CancellationToken cancellationToken = default)
    {
        await using var dbContext =
            await Factory.CreateDbContextAsync(cancellationToken);

        var workOrder = new WorkOrder
        {
            DepartmentId = departmentId,
            WorkOrderNumber = workOrderNumber,
            WorkTypeCode = workTypeCode,
            WorkYear = workYear,
            DisplayOrder = displayOrder ??
                workOrderNumber[^3..].Aggregate(
                    0L,
                    (value, digit) =>
                        (value * 10L) + (digit - '0')) *
                1_000_000_000L,
            AssignmentDate = assignmentDate,
            WorkOrderValue = workOrderValue,
            PartialAmount = partialAmount,
            Busket = WorkOrderBuskets.InProgress,
            Status = "تحت التنفيذ",
            Notes = notes,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = createdBy
        };

        dbContext.WorkOrders.Add(workOrder);
        await dbContext.SaveChangesAsync(cancellationToken);

        return Clone(workOrder);
    }

    public async Task<WorkOrder?> ReadWorkOrderAsync(
        int id,
        CancellationToken cancellationToken = default)
    {
        await using var dbContext =
            await Factory.CreateDbContextAsync(cancellationToken);

        var workOrder = await dbContext.WorkOrders
            .AsNoTracking()
            .SingleOrDefaultAsync(
                item => item.Id == id,
                cancellationToken);

        return workOrder is null
            ? null
            : Clone(workOrder);
    }

    public async Task<int> CountIdentityAsync(
        string workOrderNumber,
        string workTypeCode,
        CancellationToken cancellationToken = default)
    {
        await using var dbContext =
            await Factory.CreateDbContextAsync(cancellationToken);

        return await dbContext.WorkOrders.CountAsync(
            item =>
                item.WorkOrderNumber == workOrderNumber &&
                item.WorkTypeCode == workTypeCode,
            cancellationToken);
    }

    public async Task<int> CountWorkOrdersByNumberPrefixAsync(
        string prefix,
        CancellationToken cancellationToken = default)
    {
        await using var dbContext =
            await Factory.CreateDbContextAsync(cancellationToken);

        return await dbContext.WorkOrders.CountAsync(
            item => item.WorkOrderNumber.StartsWith(prefix),
            cancellationToken);
    }

    public async Task UpdateNotesDirectlyAsync(
        int id,
        string notes,
        CancellationToken cancellationToken = default)
    {
        await using var dbContext =
            await Factory.CreateDbContextAsync(cancellationToken);

        var workOrder = await dbContext.WorkOrders
            .SingleAsync(item => item.Id == id, cancellationToken);

        workOrder.Notes = notes;
        workOrder.UpdatedAt = DateTime.UtcNow;
        workOrder.UpdatedBy = "integration-direct-update";

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task InstallForcedFailureConstraintAsync(
        CancellationToken cancellationToken = default)
    {
        await using var dbContext =
            await Factory.CreateDbContextAsync(cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync(
            """
            ALTER TABLE [dbo].[WorkOrders]
            ADD CONSTRAINT [CK_WorkOrders_IntegrationTest_RejectMagicNotes]
            CHECK ([Notes] IS NULL OR [Notes] <> N'__FORCE_DB_FAILURE__');
            """,
            cancellationToken);
    }

    public static WorkOrder Clone(WorkOrder source) =>
        new()
        {
            Id = source.Id,
            WorkOrderNumber = source.WorkOrderNumber,
            WorkTypeCode = source.WorkTypeCode,
            WorkYear = source.WorkYear,
            DisplayOrder = source.DisplayOrder,
            AssignmentDate = source.AssignmentDate,
            WorkOrderValue = source.WorkOrderValue,
            PartialAmount = source.PartialAmount,
            Busket = source.Busket,
            Status = source.Status,
            Notes = source.Notes,
            RowVersion = source.RowVersion.ToArray(),
            DepartmentId = source.DepartmentId,
            CreatedAt = source.CreatedAt,
            CreatedBy = source.CreatedBy,
            UpdatedAt = source.UpdatedAt,
            UpdatedBy = source.UpdatedBy
        };

    public async ValueTask DisposeAsync()
    {
        try
        {
            if (keepDatabase)
            {
                Console.WriteLine(
                    $"Temporary database kept for diagnosis: {DatabaseName}");
            }
            else
            {
                try
                {
                    await using var dbContext =
                        await Factory.CreateDbContextAsync();

                    await dbContext.Database.EnsureDeletedAsync();
                }
                catch (Exception exception)
                {
                    Console.Error.WriteLine(
                        $"Warning: could not delete temporary database {DatabaseName}: {exception.Message}");
                }
            }
        }
        finally
        {
            await identityApplicationServices.DisposeAsync();
        }
    }

    private static async Task<SeedResult> SeedCoreAsync(
        TestDbContextFactory factory,
        CancellationToken cancellationToken)
    {
        await using var dbContext =
            await factory.CreateDbContextAsync(cancellationToken);

        var branch = new Branch
        {
            Name = "Integration Test Branch"
        };

        var departmentTypeA = new DepartmentType
        {
            Name = "Integration Connections"
        };

        var departmentTypeB = new DepartmentType
        {
            Name = "Integration Ground Projects"
        };

        var departmentA = new Department
        {
            Branch = branch,
            DepartmentType = departmentTypeA
        };

        var departmentB = new Department
        {
            Branch = branch,
            DepartmentType = departmentTypeB
        };

        dbContext.AddRange(
            branch,
            departmentTypeA,
            departmentTypeB,
            departmentA,
            departmentB);

        await dbContext.SaveChangesAsync(cancellationToken);

        const string employeeRoleId =
            "integration-role-employee";
        const string employeeAId =
            "integration-employee-a";
        const string employeeBId =
            "integration-employee-b";

        var employeeRole = new IdentityRole
        {
            Id = employeeRoleId,
            Name = AppRoles.Employee,
            NormalizedName = AppRoles.Employee.ToUpperInvariant(),
            ConcurrencyStamp = Guid.NewGuid().ToString("N")
        };

        var employeeA = CreateEmployee(
            employeeAId,
            "integration.employee.a",
            branch.Id,
            departmentA.Id);

        var employeeB = CreateEmployee(
            employeeBId,
            "integration.employee.b",
            branch.Id,
            departmentB.Id);

        dbContext.Roles.Add(employeeRole);
        dbContext.Users.AddRange(employeeA, employeeB);
        dbContext.UserRoles.AddRange(
            new IdentityUserRole<string>
            {
                UserId = employeeAId,
                RoleId = employeeRoleId
            },
            new IdentityUserRole<string>
            {
                UserId = employeeBId,
                RoleId = employeeRoleId
            });

        await dbContext.SaveChangesAsync(cancellationToken);

        return new SeedResult(
            branch.Id,
            departmentA.Id,
            departmentB.Id,
            employeeAId,
            employeeBId);
    }

    private static ApplicationUser CreateEmployee(
        string id,
        string userName,
        int branchId,
        int departmentId) =>
        new()
        {
            Id = id,
            UserName = userName,
            NormalizedUserName = userName.ToUpperInvariant(),
            Email = $"{userName}@integration.test",
            NormalizedEmail =
                $"{userName}@integration.test".ToUpperInvariant(),
            EmailConfirmed = true,
            FullName = userName,
            IsActive = true,
            MustChangePassword = false,
            BranchId = branchId,
            DepartmentId = departmentId,
            SecurityStamp = Guid.NewGuid().ToString("N"),
            ConcurrencyStamp = Guid.NewGuid().ToString("N"),
            LockoutEnabled = true
        };

    private sealed record SeedResult(
        int BranchId,
        int DepartmentAId,
        int DepartmentBId,
        string EmployeeAId,
        string EmployeeBId);
}
