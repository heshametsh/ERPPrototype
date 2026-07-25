using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ERPPrototype.Migrations
{
    /// <summary>
    /// Aligns existing work-order sheet years with the assignment-date year.
    /// Rows without an assignment date are intentionally left unchanged.
    /// </summary>
    public partial class AlignWorkOrderYearWithAssignmentDate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                UPDATE [WorkOrders]
                SET [WorkYear] = YEAR([AssignmentDate])
                WHERE [AssignmentDate] IS NOT NULL
                  AND YEAR([AssignmentDate]) BETWEEN 2000 AND 2100
                  AND [WorkYear] <> YEAR([AssignmentDate]);
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // This is an intentional data correction. The previous, incorrect
            // WorkYear cannot be reconstructed reliably during rollback.
        }
    }
}
