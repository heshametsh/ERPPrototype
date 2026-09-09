using ERPPrototype.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ERPPrototype.Migrations
{
    /// <summary>
    /// Converts the original department-wide column catalogue into one
    /// catalogue per existing WorkYear. Values retain their field keys, so
    /// every existing CustomValuesJson document remains readable after the
    /// migration.
    /// </summary>
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260905110000_ScopeCustomColumnsByWorkYear")]
    public partial class ScopeCustomColumnsByWorkYear : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CustomColumnDefinitions_DepartmentId_FieldKey",
                table: "CustomColumnDefinitions");
            migrationBuilder.DropIndex(
                name: "IX_CustomColumnDefinitions_DepartmentId_LayoutOrder",
                table: "CustomColumnDefinitions");
            migrationBuilder.DropIndex(
                name: "IX_CustomColumnDefinitions_DepartmentId_Name",
                table: "CustomColumnDefinitions");

            migrationBuilder.AddColumn<int>(
                name: "WorkYear",
                table: "CustomColumnDefinitions",
                type: "int",
                nullable: true);

            migrationBuilder.Sql(
                """
                ;WITH [BaseYear] AS
                (
                    SELECT [DepartmentId], MIN([WorkYear]) AS [WorkYear]
                    FROM [WorkOrders]
                    GROUP BY [DepartmentId]
                )
                UPDATE [column]
                SET [WorkYear] = COALESCE([base].[WorkYear], YEAR(GETUTCDATE()))
                FROM [CustomColumnDefinitions] AS [column]
                LEFT JOIN [BaseYear] AS [base]
                    ON [base].[DepartmentId] = [column].[DepartmentId];

                INSERT INTO [CustomColumnDefinitions]
                    ([DepartmentId], [WorkYear], [FieldKey], [Name], [DataType], [LayoutOrder], [CreatedAt], [CreatedBy])
                SELECT
                    [column].[DepartmentId],
                    [year].[WorkYear],
                    [column].[FieldKey],
                    [column].[Name],
                    [column].[DataType],
                    [column].[LayoutOrder],
                    [column].[CreatedAt],
                    [column].[CreatedBy]
                FROM [CustomColumnDefinitions] AS [column]
                INNER JOIN
                (
                    SELECT DISTINCT [DepartmentId], [WorkYear]
                    FROM [WorkOrders]
                ) AS [year]
                    ON [year].[DepartmentId] = [column].[DepartmentId]
                WHERE [year].[WorkYear] <> [column].[WorkYear];
                """);

            migrationBuilder.AlterColumn<int>(
                name: "WorkYear",
                table: "CustomColumnDefinitions",
                type: "int",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "int",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_CustomColumnDefinitions_DepartmentId_WorkYear_FieldKey",
                table: "CustomColumnDefinitions",
                columns: new[] { "DepartmentId", "WorkYear", "FieldKey" },
                unique: true);
            migrationBuilder.CreateIndex(
                name: "IX_CustomColumnDefinitions_DepartmentId_WorkYear_LayoutOrder",
                table: "CustomColumnDefinitions",
                columns: new[] { "DepartmentId", "WorkYear", "LayoutOrder" },
                unique: true);
            migrationBuilder.CreateIndex(
                name: "IX_CustomColumnDefinitions_DepartmentId_WorkYear_Name",
                table: "CustomColumnDefinitions",
                columns: new[] { "DepartmentId", "WorkYear", "Name" },
                unique: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder) =>
            throw new NotSupportedException(
                "Year-scoped custom columns cannot be safely collapsed into the former department-wide catalogue.");
    }
}
