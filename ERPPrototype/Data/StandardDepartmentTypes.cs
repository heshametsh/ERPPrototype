namespace ERPPrototype.Data;

public static class StandardDepartmentTypes
{
    public const string Connections = "قسم التوصيلات (العدادات)";
    public const string UndergroundProjects = "قسم المشاريع الأرضية";
    public const string OverheadProjects = "قسم المشاريع الهوائية";
    public const string MaintenanceAndEmergency = "قسم الصيانة والطوارئ";

    public static IReadOnlyList<string> All { get; } =
    [
        Connections,
        UndergroundProjects,
        OverheadProjects,
        MaintenanceAndEmergency
    ];
}
