using ERPPrototype.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ERPPrototype.Migrations;

[DbContext(typeof(ApplicationDbContext))]
[Migration("20260805173000_RemoveLegacyWorkOrderStatusAndNotes")]
public partial class RemoveLegacyWorkOrderStatusAndNotes : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(
            """
            DELETE FROM [DepartmentColumnLayouts]
            WHERE [FieldKey] IN ('status', 'notes');
            """);

        migrationBuilder.DropColumn(
            name: "Notes",
            table: "WorkOrders");

        migrationBuilder.DropColumn(
            name: "Status",
            table: "WorkOrders");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "Status",
            table: "WorkOrders",
            type: "nvarchar(150)",
            maxLength: 150,
            nullable: false,
            defaultValue: "");

        migrationBuilder.AddColumn<string>(
            name: "Notes",
            table: "WorkOrders",
            type: "nvarchar(1000)",
            maxLength: 1000,
            nullable: true);
    }
}
