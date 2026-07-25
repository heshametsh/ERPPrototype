using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ERPPrototype.Migrations
{
    /// <inheritdoc />
    public partial class AddWorkOrderRowVersion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<byte[]>(
                name: "RowVersion",
                table: "WorkOrders",
                type: "rowversion",
                rowVersion: true,
                nullable: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RowVersion",
                table: "WorkOrders");
        }
    }
}
