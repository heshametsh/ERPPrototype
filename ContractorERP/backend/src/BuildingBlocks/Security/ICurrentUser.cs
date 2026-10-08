namespace ContractorERP.BuildingBlocks.Security;

/// <summary>
/// Who is calling, as decided by the server. The browser never sends its own department/branch;
/// every module reads scope from here.
/// </summary>
public interface ICurrentUser
{
    bool IsAuthenticated { get; }

    Guid UserId { get; }

    Guid? BranchId { get; }

    Guid? DepartmentId { get; }

    bool MustChangePassword { get; }

    bool IsInRole(string role);
}
