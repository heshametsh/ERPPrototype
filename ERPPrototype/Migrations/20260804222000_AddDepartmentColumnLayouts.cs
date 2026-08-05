using System;
using ERPPrototype.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ERPPrototype.Migrations;

[DbContext(typeof(ApplicationDbContext))]
[Migration("20260804222000_AddDepartmentColumnLayouts")]
public partial class AddDepartmentColumnLayouts : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "DepartmentColumnLayouts",
            columns: table => new
            {
                Id = table.Column<int>(type: "int", nullable: false)
                    .Annotation("SqlServer:Identity", "1, 1"),
                DepartmentId = table.Column<int>(type: "int", nullable: false),
                FieldKey = table.Column<string>(
                    type: "varchar(40)",
                    unicode: false,
                    maxLength: 40,
                    nullable: false),
                Width = table.Column<int>(type: "int", nullable: false),
                UpdatedAt = table.Column<DateTime>(
                    type: "datetime2",
                    nullable: false),
                UpdatedBy = table.Column<string>(
                    type: "nvarchar(450)",
                    maxLength: 450,
                    nullable: false),
                RowVersion = table.Column<byte[]>(
                    type: "rowversion",
                    rowVersion: true,
                    nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey(
                    "PK_DepartmentColumnLayouts",
                    x => x.Id);

                table.CheckConstraint(
                    "CK_DepartmentColumnLayouts_Width",
                    "[Width] >= 80 AND [Width] <= 1000");

                table.ForeignKey(
                    name: "FK_DepartmentColumnLayouts_Departments_DepartmentId",
                    column: x => x.DepartmentId,
                    principalTable: "Departments",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.CreateIndex(
            name: "IX_DepartmentColumnLayouts_DepartmentId_FieldKey",
            table: "DepartmentColumnLayouts",
            columns: new[] { "DepartmentId", "FieldKey" },
            unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "DepartmentColumnLayouts");
    }
}
