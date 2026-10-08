namespace ContractorERP.BuildingBlocks.Security;

/// <summary>Role names approved in the business rules (prototype doc 15).</summary>
public static class Roles
{
    public const string Admin = "Admin";
    public const string ProjectManager = "ProjectManager";
    public const string BranchManager = "BranchManager";
    public const string Employee = "Employee";
}

/// <summary>Claim types the Host writes at sign-in so modules never query another module's tables.</summary>
public static class ErpClaims
{
    public const string BranchId = "erp:branch";
    public const string DepartmentId = "erp:department";
    public const string MustChangePassword = "erp:must_change_password";
}
