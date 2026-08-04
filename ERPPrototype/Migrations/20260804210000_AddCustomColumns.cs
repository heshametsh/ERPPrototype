using System;
using ERPPrototype.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ERPPrototype.Migrations;

[DbContext(typeof(ApplicationDbContext))]
[Migration("20260804210000_AddCustomColumns")]
public partial class AddCustomColumns : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "CustomValuesJson",
            table: "WorkOrders",
            type: "nvarchar(max)",
            nullable: false,
            defaultValue: "{}");

        migrationBuilder.CreateTable(
            name: "CustomColumnDefinitions",
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
                Name = table.Column<string>(
                    type: "nvarchar(150)",
                    maxLength: 150,
                    nullable: false),
                DataType = table.Column<int>(type: "int", nullable: false),
                LayoutOrder = table.Column<long>(type: "bigint", nullable: false),
                CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                CreatedBy = table.Column<string>(
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
                    "PK_CustomColumnDefinitions",
                    x => x.Id);

                table.CheckConstraint(
                    "CK_CustomColumnDefinitions_DataType",
                    "[DataType] >= 1 AND [DataType] <= 4");

                table.CheckConstraint(
                    "CK_CustomColumnDefinitions_LayoutOrder",
                    "[LayoutOrder] > 0");

                table.ForeignKey(
                    name: "FK_CustomColumnDefinitions_Departments_DepartmentId",
                    column: x => x.DepartmentId,
                    principalTable: "Departments",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.CreateIndex(
            name: "IX_CustomColumnDefinitions_DepartmentId_FieldKey",
            table: "CustomColumnDefinitions",
            columns: new[] { "DepartmentId", "FieldKey" },
            unique: true);

        migrationBuilder.CreateIndex(
            name: "IX_CustomColumnDefinitions_DepartmentId_LayoutOrder",
            table: "CustomColumnDefinitions",
            columns: new[] { "DepartmentId", "LayoutOrder" },
            unique: true);

        migrationBuilder.CreateIndex(
            name: "IX_CustomColumnDefinitions_DepartmentId_Name",
            table: "CustomColumnDefinitions",
            columns: new[] { "DepartmentId", "Name" },
            unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "CustomColumnDefinitions");

        migrationBuilder.DropColumn(
            name: "CustomValuesJson",
            table: "WorkOrders");
    }
}
