using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ERPPrototype.Migrations
{
    /// <inheritdoc />
    public partial class EnforceWorkOrderIdentityRules : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_WorkOrders_DepartmentId_WorkOrderNumber_WorkTypeCode",
                table: "WorkOrders");

            migrationBuilder.AlterColumn<string>(
                name: "WorkTypeCode",
                table: "WorkOrders",
                type: "varchar(3)",
                unicode: false,
                maxLength: 3,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(20)",
                oldMaxLength: 20);

            migrationBuilder.AlterColumn<string>(
                name: "WorkOrderNumber",
                table: "WorkOrders",
                type: "varchar(9)",
                unicode: false,
                maxLength: 9,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(50)",
                oldMaxLength: 50);

            migrationBuilder.CreateIndex(
                name: "UX_WorkOrders_WorkOrderNumber_WorkTypeCode",
                table: "WorkOrders",
                columns: new[] { "WorkOrderNumber", "WorkTypeCode" },
                unique: true);

            migrationBuilder.AddCheckConstraint(
            name: "CK_WorkOrders_WorkOrderNumber_NineDigits",
            table: "WorkOrders",
            sql: "DATALENGTH([WorkOrderNumber]) = 9 AND [WorkOrderNumber] COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^0-9]%'");

            migrationBuilder.AddCheckConstraint(
                name: "CK_WorkOrders_WorkTypeCode_ThreeDigits",
                table: "WorkOrders",
                sql: "DATALENGTH([WorkTypeCode]) = 3 AND [WorkTypeCode] COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^0-9]%'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "UX_WorkOrders_WorkOrderNumber_WorkTypeCode",
                table: "WorkOrders");

            migrationBuilder.DropCheckConstraint(
                name: "CK_WorkOrders_WorkOrderNumber_NineDigits",
                table: "WorkOrders");

            migrationBuilder.DropCheckConstraint(
                name: "CK_WorkOrders_WorkTypeCode_ThreeDigits",
                table: "WorkOrders");

            migrationBuilder.AlterColumn<string>(
                name: "WorkTypeCode",
                table: "WorkOrders",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "varchar(3)",
                oldUnicode: false,
                oldMaxLength: 3);

            migrationBuilder.AlterColumn<string>(
                name: "WorkOrderNumber",
                table: "WorkOrders",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "varchar(9)",
                oldUnicode: false,
                oldMaxLength: 9);

            migrationBuilder.CreateIndex(
                name: "IX_WorkOrders_DepartmentId_WorkOrderNumber_WorkTypeCode",
                table: "WorkOrders",
                columns: new[] { "DepartmentId", "WorkOrderNumber", "WorkTypeCode" },
                unique: true);
        }
    }
}
