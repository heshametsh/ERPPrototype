using ERPPrototype.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ERPPrototype.Migrations;

[DbContext(typeof(ApplicationDbContext))]
[Migration("20260804225500_ReduceMinimumDepartmentColumnWidth")]
public partial class ReduceMinimumDepartmentColumnWidth : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropCheckConstraint(
            name: "CK_DepartmentColumnLayouts_Width",
            table: "DepartmentColumnLayouts");

        migrationBuilder.AddCheckConstraint(
            name: "CK_DepartmentColumnLayouts_Width",
            table: "DepartmentColumnLayouts",
            sql: "[Width] >= 45 AND [Width] <= 1000");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropCheckConstraint(
            name: "CK_DepartmentColumnLayouts_Width",
            table: "DepartmentColumnLayouts");

        migrationBuilder.AddCheckConstraint(
            name: "CK_DepartmentColumnLayouts_Width",
            table: "DepartmentColumnLayouts",
            sql: "[Width] >= 80 AND [Width] <= 1000");
    }
}
