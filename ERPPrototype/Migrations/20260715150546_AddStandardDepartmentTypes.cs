using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ERPPrototype.Migrations
{
    /// <inheritdoc />
    public partial class AddStandardDepartmentTypes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DepartmentTypes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Name = table.Column<string>(
                        type: "nvarchar(150)",
                        maxLength: 150,
                        nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DepartmentTypes", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DepartmentTypes_Name",
                table: "DepartmentTypes",
                column: "Name",
                unique: true);

            migrationBuilder.InsertData(
                table: "DepartmentTypes",
                column: "Name",
                values: new object[]
                {
            "قسم التوصيلات (العدادات)",
            "قسم المشاريع الأرضية",
            "قسم المشاريع الهوائية",
            "قسم الصيانة والطوارئ"
                });

            migrationBuilder.AddColumn<int>(
                name: "DepartmentTypeId",
                table: "Departments",
                type: "int",
                nullable: true);

            migrationBuilder.Sql("""
        UPDATE department
        SET DepartmentTypeId = departmentType.Id
        FROM Departments AS department
        INNER JOIN DepartmentTypes AS departmentType
            ON departmentType.Name =
                CASE
                    WHEN department.Name = N'قسم العدادات'
                        THEN N'قسم التوصيلات (العدادات)'
                    ELSE department.Name
                END;
        """);

            migrationBuilder.Sql("""
        IF EXISTS
        (
            SELECT 1
            FROM Departments
            WHERE DepartmentTypeId IS NULL
        )
        BEGIN
            THROW 50001,
                'Some existing departments could not be matched to a standard department type.',
                1;
        END;
        """);

            migrationBuilder.DropIndex(
                name: "IX_Departments_BranchId_Name",
                table: "Departments");

            migrationBuilder.AlterColumn<int>(
                name: "DepartmentTypeId",
                table: "Departments",
                type: "int",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "int",
                oldNullable: true);

            migrationBuilder.DropColumn(
                name: "Name",
                table: "Departments");

            migrationBuilder.CreateIndex(
                name: "IX_Departments_BranchId_DepartmentTypeId",
                table: "Departments",
                columns: new[] { "BranchId", "DepartmentTypeId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Departments_DepartmentTypeId",
                table: "Departments",
                column: "DepartmentTypeId");

            migrationBuilder.AddForeignKey(
                name: "FK_Departments_DepartmentTypes_DepartmentTypeId",
                table: "Departments",
                column: "DepartmentTypeId",
                principalTable: "DepartmentTypes",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Name",
                table: "Departments",
                type: "nvarchar(150)",
                maxLength: 150,
                nullable: true);

            migrationBuilder.Sql("""
        UPDATE department
        SET Name = departmentType.Name
        FROM Departments AS department
        INNER JOIN DepartmentTypes AS departmentType
            ON department.DepartmentTypeId = departmentType.Id;
        """);

            migrationBuilder.Sql("""
        IF EXISTS
        (
            SELECT 1
            FROM Departments
            WHERE Name IS NULL
        )
        BEGIN
            THROW 50002,
                'Some department names could not be restored.',
                1;
        END;
        """);

            migrationBuilder.AlterColumn<string>(
                name: "Name",
                table: "Departments",
                type: "nvarchar(150)",
                maxLength: 150,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(150)",
                oldMaxLength: 150,
                oldNullable: true);

            migrationBuilder.DropForeignKey(
                name: "FK_Departments_DepartmentTypes_DepartmentTypeId",
                table: "Departments");

            migrationBuilder.DropIndex(
                name: "IX_Departments_BranchId_DepartmentTypeId",
                table: "Departments");

            migrationBuilder.DropIndex(
                name: "IX_Departments_DepartmentTypeId",
                table: "Departments");

            migrationBuilder.DropColumn(
                name: "DepartmentTypeId",
                table: "Departments");

            migrationBuilder.DropTable(
                name: "DepartmentTypes");

            migrationBuilder.CreateIndex(
                name: "IX_Departments_BranchId_Name",
                table: "Departments",
                columns: new[] { "BranchId", "Name" },
                unique: true);
        }
    }
}
