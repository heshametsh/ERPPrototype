using ERPPrototype.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace ERPPrototype.IntegrationTests;

internal sealed class AdminSecurityIntegrationTests(
    IntegrationTestDatabase database)
{
    private const string AdminId = "integration-admin-security";
    private const string AdminRoleId = "integration-role-admin-security";

    public async Task AdminMutationsRequireFreshAuthorizationAsync()
    {
        await SeedAdminAsync();

        var authorization = new AdminAuthorizationService(database.Factory);
        var branchService = new AdminBranchService(
            database.Factory,
            authorization);

        var allowed = await authorization.AuthorizeAsync(AdminId);
        Ensure(allowed.Succeeded, "A valid Admin was rejected.");

        var rename = await branchService.RenameBranchAsync(
            AdminId,
            database.BranchId,
            "Authorized Admin Rename");
        Ensure(rename.Succeeded, "A valid Admin could not rename a branch.");
        await AssertBranchNameAsync("Authorized Admin Rename");

        await SetAdminStateAsync(isActive: true, mustChangePassword: true);
        var mustChange = await authorization.AuthorizeAsync(AdminId);
        Ensure(
            !mustChange.Succeeded &&
            mustChange.Failure == AdminAuthorizationFailure.MustChangePassword,
            "An Admin with a temporary password was authorized.");

        rename = await branchService.RenameBranchAsync(
            AdminId,
            database.BranchId,
            "Temporary Password Escape");
        Ensure(!rename.Succeeded, "Temporary-password Admin mutation succeeded.");
        await AssertBranchNameAsync("Authorized Admin Rename");

        await SetAdminStateAsync(isActive: false, mustChangePassword: false);
        var inactive = await authorization.AuthorizeAsync(AdminId);
        Ensure(
            !inactive.Succeeded &&
            inactive.Failure == AdminAuthorizationFailure.Inactive,
            "An inactive Admin was authorized.");

        rename = await branchService.RenameBranchAsync(
            AdminId,
            database.BranchId,
            "Inactive Admin Escape");
        Ensure(!rename.Succeeded, "Inactive Admin mutation succeeded.");
        await AssertBranchNameAsync("Authorized Admin Rename");

        var employee = await authorization.AuthorizeAsync(database.EmployeeAId);
        Ensure(
            !employee.Succeeded &&
            employee.Failure == AdminAuthorizationFailure.NotAdmin,
            "A normal Employee was authorized for Admin operations.");

        rename = await branchService.RenameBranchAsync(
            database.EmployeeAId,
            database.BranchId,
            "Employee Admin Escape");
        Ensure(!rename.Succeeded, "Employee Admin mutation succeeded.");
        await AssertBranchNameAsync("Authorized Admin Rename");

        await RestoreBranchNameAsync();
    }

    private async Task SeedAdminAsync()
    {
        await using var dbContext = await database.Factory.CreateDbContextAsync();

        dbContext.Roles.Add(new IdentityRole
        {
            Id = AdminRoleId,
            Name = AppRoles.Admin,
            NormalizedName = AppRoles.Admin.ToUpperInvariant(),
            ConcurrencyStamp = Guid.NewGuid().ToString("N")
        });

        dbContext.Users.Add(new ApplicationUser
        {
            Id = AdminId,
            UserName = "integration.admin.security",
            NormalizedUserName = "INTEGRATION.ADMIN.SECURITY",
            Email = "integration.admin.security@integration.test",
            NormalizedEmail = "INTEGRATION.ADMIN.SECURITY@INTEGRATION.TEST",
            EmailConfirmed = true,
            FullName = "Integration Security Admin",
            IsActive = true,
            MustChangePassword = false,
            SecurityStamp = Guid.NewGuid().ToString("N"),
            ConcurrencyStamp = Guid.NewGuid().ToString("N"),
            LockoutEnabled = true
        });

        dbContext.UserRoles.Add(new IdentityUserRole<string>
        {
            UserId = AdminId,
            RoleId = AdminRoleId
        });

        await dbContext.SaveChangesAsync();
    }

    private async Task SetAdminStateAsync(
        bool isActive,
        bool mustChangePassword)
    {
        await using var dbContext = await database.Factory.CreateDbContextAsync();
        var admin = await dbContext.Users.SingleAsync(user => user.Id == AdminId);
        admin.IsActive = isActive;
        admin.MustChangePassword = mustChangePassword;
        await dbContext.SaveChangesAsync();
    }

    private async Task AssertBranchNameAsync(string expected)
    {
        await using var dbContext = await database.Factory.CreateDbContextAsync();
        var actual = await dbContext.Branches
            .AsNoTracking()
            .Where(branch => branch.Id == database.BranchId)
            .Select(branch => branch.Name)
            .SingleAsync();

        Ensure(actual == expected, $"Expected branch name '{expected}', got '{actual}'.");
    }

    private async Task RestoreBranchNameAsync()
    {
        await using var dbContext = await database.Factory.CreateDbContextAsync();
        var branch = await dbContext.Branches.SingleAsync(
            item => item.Id == database.BranchId);
        branch.Name = "Integration Test Branch";
        await dbContext.SaveChangesAsync();
    }

    private static void Ensure(bool condition, string message)
    {
        if (!condition)
        {
            throw new InvalidOperationException(message);
        }
    }
}
