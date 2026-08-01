using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ERPPrototype.Migrations
{
    /// <inheritdoc />
    public partial class AddWorkOrderFinancialAmounts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "PartialAmount",
                table: "WorkOrders",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "WorkOrderValue",
                table: "WorkOrders",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_WorkOrders_WorkOrderValue_Positive",
                table: "WorkOrders",
                sql: "[WorkOrderValue] IS NULL OR [WorkOrderValue] > 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_WorkOrders_PartialAmount_Positive",
                table: "WorkOrders",
                sql: "[PartialAmount] IS NULL OR [PartialAmount] > 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_WorkOrders_PartialAmount_NotAboveValue",
                table: "WorkOrders",
                sql: "[PartialAmount] IS NULL OR ([WorkOrderValue] IS NOT NULL AND [PartialAmount] <= [WorkOrderValue])");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_WorkOrders_WorkOrderValue_Positive",
                table: "WorkOrders");

            migrationBuilder.DropCheckConstraint(
                name: "CK_WorkOrders_PartialAmount_Positive",
                table: "WorkOrders");

            migrationBuilder.DropCheckConstraint(
                name: "CK_WorkOrders_PartialAmount_NotAboveValue",
                table: "WorkOrders");

            migrationBuilder.DropColumn(
                name: "PartialAmount",
                table: "WorkOrders");

            migrationBuilder.DropColumn(
                name: "WorkOrderValue",
                table: "WorkOrders");
        }
    }
}
