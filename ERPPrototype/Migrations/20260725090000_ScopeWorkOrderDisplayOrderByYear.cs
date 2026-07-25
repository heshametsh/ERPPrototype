using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ERPPrototype.Migrations
{
    /// <inheritdoc />
    public partial class ScopeWorkOrderDisplayOrderByYear : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_WorkOrders_DepartmentId_DisplayOrder",
                table: "WorkOrders");

            migrationBuilder.CreateIndex(
                name: "IX_WorkOrders_DepartmentId_WorkYear_DisplayOrder",
                table: "WorkOrders",
                columns: new[]
                {
                    "DepartmentId",
                    "WorkYear",
                    "DisplayOrder"
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_WorkOrders_DepartmentId_WorkYear_DisplayOrder",
                table: "WorkOrders");

            migrationBuilder.CreateIndex(
                name: "IX_WorkOrders_DepartmentId_DisplayOrder",
                table: "WorkOrders",
                columns: new[]
                {
                    "DepartmentId",
                    "DisplayOrder"
                });
        }
    }
}
