using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ContractorERP.Modules.WorkOrders.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class Initial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "work_orders");

            migrationBuilder.CreateTable(
                name: "work_orders",
                schema: "work_orders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: false),
                    DepartmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkYear = table.Column<int>(type: "integer", nullable: false),
                    Number = table.Column<string>(type: "character varying(9)", maxLength: 9, nullable: false),
                    WorkTypeCode = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    AssignmentDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Value = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    PartialAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    Basket = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    DisplayOrder = table.Column<int>(type: "integer", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_work_orders", x => x.Id);
                    table.CheckConstraint("ck_work_orders_partial", "\"PartialAmount\" IS NULL OR (\"PartialAmount\" > 0 AND \"PartialAmount\" <= \"Value\")");
                    table.CheckConstraint("ck_work_orders_value", "\"Value\" >= 0");
                });

            migrationBuilder.CreateIndex(
                name: "IX_work_orders_DepartmentId_WorkYear_DisplayOrder",
                schema: "work_orders",
                table: "work_orders",
                columns: new[] { "DepartmentId", "WorkYear", "DisplayOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_work_orders_Number_WorkTypeCode",
                schema: "work_orders",
                table: "work_orders",
                columns: new[] { "Number", "WorkTypeCode" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "work_orders",
                schema: "work_orders");
        }
    }
}
