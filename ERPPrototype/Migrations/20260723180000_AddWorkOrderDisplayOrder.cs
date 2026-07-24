using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ERPPrototype.Migrations
{
    /// <inheritdoc />
    public partial class AddWorkOrderDisplayOrder : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "DisplayOrder",
                table: "WorkOrders",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.Sql(
                """
                ;WITH OrderedWorkOrders AS
                (
                    SELECT
                        [Id],
                        ROW_NUMBER() OVER
                        (
                            PARTITION BY [DepartmentId]
                            ORDER BY [Id]
                        ) AS [RowNumber]
                    FROM [WorkOrders]
                )
                UPDATE workOrder
                SET [DisplayOrder] =
                    orderedWorkOrder.[RowNumber] *
                    CAST(1000000000 AS bigint)
                FROM [WorkOrders] AS workOrder
                INNER JOIN OrderedWorkOrders AS orderedWorkOrder
                    ON orderedWorkOrder.[Id] = workOrder.[Id];
                """);

            migrationBuilder.CreateIndex(
                name: "IX_WorkOrders_DepartmentId_DisplayOrder",
                table: "WorkOrders",
                columns: new[] { "DepartmentId", "DisplayOrder" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_WorkOrders_DepartmentId_DisplayOrder",
                table: "WorkOrders");

            migrationBuilder.DropColumn(
                name: "DisplayOrder",
                table: "WorkOrders");
        }
    }
}
