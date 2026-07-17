using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ERPPrototype.Migrations
{
    /// <inheritdoc />
    public partial class AddWorkYearToWorkOrders : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "WorkYear",
                table: "WorkOrders",
                type: "int",
                nullable: true);

            migrationBuilder.Sql("""
        UPDATE WorkOrders
        SET WorkYear =
            CASE
                WHEN AssignmentDate IS NOT NULL THEN YEAR(AssignmentDate)
                ELSE YEAR(CreatedAt)
            END
        WHERE WorkYear IS NULL;
        """);

            migrationBuilder.AlterColumn<int>(
                name: "WorkYear",
                table: "WorkOrders",
                type: "int",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "int",
                oldNullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "WorkYear",
                table: "WorkOrders");
        }
    }
}
