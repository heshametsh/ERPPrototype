namespace ERPPrototype.Data;

public static class AppRoles
{
    public const string Admin = "Admin";
    public const string ProjectManager = "ProjectManager";
    public const string BranchManager = "BranchManager";
    public const string Employee = "Employee";

    public static IReadOnlyList<string> All { get; } =
    [
        Admin,
        ProjectManager,
        BranchManager,
        Employee
    ];
}
