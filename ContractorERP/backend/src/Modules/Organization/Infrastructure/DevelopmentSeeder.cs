using ContractorERP.BuildingBlocks.Security;
using ContractorERP.Modules.Organization.Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace ContractorERP.Modules.Organization.Infrastructure;

/// <summary>
/// Development-only demo data. Production never seeds users at startup (lesson AUTH-004: startup must not
/// silently re-enable a disabled Admin).
/// </summary>
internal sealed class DevelopmentSeeder(
    OrganizationDbContext db,
    UserManager<AppUser> users,
    RoleManager<IdentityRole<Guid>> roles)
{
    public const string DemoPassword = "Demo#2026";

    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        foreach (var role in new[] { Roles.Admin, Roles.ProjectManager, Roles.BranchManager, Roles.Employee })
        {
            if (!await roles.RoleExistsAsync(role))
            {
                await roles.CreateAsync(new IdentityRole<Guid>(role) { Id = Guid.CreateVersion7() });
            }
        }

        if (await db.Branches.AnyAsync(cancellationToken))
        {
            return;
        }

        var branch = new Branch { Name = "فرع الرياض" };
        var master = new Department { Name = "أوامر العمل", Kind = "MasterWorkOrders" };
        var other = new Department { Name = "التنفيذ", Kind = "Execution" };
        branch.Departments.Add(master);
        branch.Departments.Add(other);
        db.Branches.Add(branch);
        await db.SaveChangesAsync(cancellationToken);

        await CreateAsync("admin", "مدير النظام", Roles.Admin, null, null);
        await CreateAsync("employee", "موظف أوامر العمل", Roles.Employee, branch.Id, master.Id);
        await CreateAsync("employee2", "موظف التنفيذ", Roles.Employee, branch.Id, other.Id);
        await CreateAsync("newemployee", "موظف جديد بباسورد مؤقت", Roles.Employee, branch.Id, master.Id, mustChangePassword: true);
    }

    private async Task CreateAsync(string userName, string fullName, string role, Guid? branchId, Guid? departmentId, bool mustChangePassword = false)
    {
        var user = new AppUser { UserName = userName, FullName = fullName, BranchId = branchId, DepartmentId = departmentId, MustChangePassword = mustChangePassword };
        var created = await users.CreateAsync(user, DemoPassword);
        if (!created.Succeeded)
        {
            throw new InvalidOperationException(string.Join("; ", created.Errors.Select(e => e.Description)));
        }

        await users.AddToRoleAsync(user, role);
    }
}
