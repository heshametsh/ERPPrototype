using ERPPrototype.Data.Entities;
using Microsoft.AspNetCore.Identity;

namespace ERPPrototype.Data;

public class ApplicationUser : IdentityUser
{
    public string FullName { get; set; } = string.Empty;

    public bool MustChangePassword { get; set; } = true;

    public bool IsActive { get; set; } = true;

    public int? BranchId { get; set; }

    public Branch? Branch { get; set; }

    public int? DepartmentId { get; set; }

    public Department? Department { get; set; }
}