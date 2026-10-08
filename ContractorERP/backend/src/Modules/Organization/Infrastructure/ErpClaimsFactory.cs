using System.Globalization;
using System.Security.Claims;
using ContractorERP.BuildingBlocks.Security;
using ContractorERP.Modules.Organization.Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;

namespace ContractorERP.Modules.Organization.Infrastructure;

/// <summary>Writes branch/department scope into the sign-in cookie so other modules never read Organization tables.</summary>
internal sealed class ErpClaimsFactory(
    UserManager<AppUser> userManager,
    RoleManager<IdentityRole<Guid>> roleManager,
    IOptions<IdentityOptions> options)
    : UserClaimsPrincipalFactory<AppUser, IdentityRole<Guid>>(userManager, roleManager, options)
{
    protected override async Task<ClaimsIdentity> GenerateClaimsAsync(AppUser user)
    {
        var identity = await base.GenerateClaimsAsync(user);
        if (user.BranchId is { } branchId)
        {
            identity.AddClaim(new Claim(ErpClaims.BranchId, branchId.ToString()));
        }

        if (user.DepartmentId is { } departmentId)
        {
            identity.AddClaim(new Claim(ErpClaims.DepartmentId, departmentId.ToString()));
        }

        identity.AddClaim(new Claim(ErpClaims.MustChangePassword, user.MustChangePassword.ToString(CultureInfo.InvariantCulture)));
        return identity;
    }
}
