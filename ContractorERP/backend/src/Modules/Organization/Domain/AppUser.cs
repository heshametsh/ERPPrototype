using Microsoft.AspNetCore.Identity;

namespace ContractorERP.Modules.Organization.Domain;

public sealed class AppUser : IdentityUser<Guid>
{
    public AppUser()
    {
        Id = Guid.CreateVersion7();
        SecurityStamp = Guid.NewGuid().ToString();
    }

    public required string FullName { get; set; }

    public Guid? BranchId { get; set; }

    public Guid? DepartmentId { get; set; }

    public bool IsActive { get; set; } = true;

    /// <summary>Set when an Admin issues a temporary password. Blocks every business action until changed (lesson SEC-001).</summary>
    public bool MustChangePassword { get; set; }
}
