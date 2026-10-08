using ERPPrototype.Data;
using ERPPrototype.Data.Entities;
using Microsoft.Data.SqlClient;

namespace ERPPrototype.IntegrationTests;

internal sealed class VisibilityOwnershipModificationGate
{
    private readonly IntegrationTestDatabase database;

    public VisibilityOwnershipModificationGate(IntegrationTestDatabase database)
    {
        this.database = database;
    }

    public async Task LayoutNoLongerOwnsVisibilityAsync()
    {
        await using var connection = new SqlConnection(database.ConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT CASE
                WHEN COL_LENGTH('dbo.DepartmentColumnLayouts', 'IsHidden') IS NULL THEN 1
                ELSE 0
            END;
            """;

        var schemaResult = Convert.ToInt32(await command.ExecuteScalarAsync());
        TestAssert.Equal(
            1,
            schemaResult,
            "DepartmentColumnLayouts still stores legacy IsHidden; Width and Visibility still have two persistence owners.");

        TestAssert.True(
            typeof(DepartmentColumnLayout).GetProperty("IsHidden") is null,
            "DepartmentColumnLayout entity still owns legacy IsHidden.");
        TestAssert.True(
            typeof(DepartmentColumnLayoutInput).GetProperty("IsHidden") is null,
            "Column-layout save contract still carries legacy IsHidden.");
        TestAssert.True(
            typeof(DepartmentColumnLayoutData).GetProperty("IsHidden") is null,
            "Column-layout load contract still exposes legacy IsHidden.");

        command.CommandText = """
            SELECT CASE
                WHEN COL_LENGTH('dbo.DepartmentColumnVisibilities', 'IsHidden') IS NOT NULL THEN 1
                ELSE 0
            END;
            """;
        var visibilityResult = Convert.ToInt32(await command.ExecuteScalarAsync());
        TestAssert.Equal(
            1,
            visibilityResult,
            "The year-scoped visibility owner lost its IsHidden persistence column.");
    }
}
