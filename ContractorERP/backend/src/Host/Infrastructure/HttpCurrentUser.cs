using System.Security.Claims;
using ContractorERP.BuildingBlocks.Security;

namespace ContractorERP.Host.Infrastructure;

internal sealed class HttpCurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    private ClaimsPrincipal Principal => accessor.HttpContext?.User ?? new ClaimsPrincipal();

    public bool IsAuthenticated => Principal.Identity?.IsAuthenticated == true;

    public Guid UserId => Guid.TryParse(Principal.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : Guid.Empty;

    public Guid? BranchId => ReadGuid(ErpClaims.BranchId);

    public Guid? DepartmentId => ReadGuid(ErpClaims.DepartmentId);

    public bool MustChangePassword => !string.Equals(Principal.FindFirstValue(ErpClaims.MustChangePassword), "False", StringComparison.OrdinalIgnoreCase);

    public bool IsInRole(string role) => Principal.IsInRole(role);

    private Guid? ReadGuid(string claim) => Guid.TryParse(Principal.FindFirstValue(claim), out var id) ? id : null;
}
