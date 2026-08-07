using ERPPrototype.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ERPPrototype.Migrations;

[DbContext(typeof(ApplicationDbContext))]
[Migration("20260805183000_AddDepartmentColumnVisibility")]
public partial class AddDepartmentColumnVisibility : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<bool>(
            name: "IsHidden",
            table: "DepartmentColumnLayouts",
            type: "bit",
            nullable: false,
            defaultValue: false);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "IsHidden",
            table: "DepartmentColumnLayouts");
    }
}
