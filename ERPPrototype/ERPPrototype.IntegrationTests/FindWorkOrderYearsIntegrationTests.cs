using Microsoft.EntityFrameworkCore;

namespace ERPPrototype.IntegrationTests;

// Find cross-year lookup security boundary: allow and deny paths with fresh
// authoritative account state from SQL Server.
internal sealed class FindWorkOrderYearsIntegrationTests(IntegrationTestDatabase database)
{
    public async Task CrossYearLookupIsScopedToOwnDepartmentAsync()
    {
        var year = DateTime.Now.Year;
        const string ownNumber = "961000001";
        const string otherNumber = "961000002";

        await database.SeedWorkOrderAsync(database.DepartmentAId, database.EmployeeAId, ownNumber, "401", year - 1, "find");
        await database.SeedWorkOrderAsync(database.DepartmentAId, database.EmployeeAId, ownNumber, "402", year - 2, "find");
        await database.SeedWorkOrderAsync(database.DepartmentBId, database.EmployeeBId, otherNumber, "401", year - 1, "find");

        var service = database.Service;

        TestAssert.Equal(
            $"{year - 1},{year - 2}",
            string.Join(",", await service.FindWorkOrderYearsAsync(database.EmployeeAId, ownNumber)),
            "Own-department number was not found in both saved years (newest first).");
        TestAssert.Equal(
            0,
            (await service.FindWorkOrderYearsAsync(database.EmployeeAId, otherNumber)).Count,
            "Employee A saw a Work Order of department B.");
        TestAssert.Equal(
            0,
            (await service.FindWorkOrderYearsAsync(database.EmployeeBId, ownNumber)).Count,
            "Employee B saw a Work Order of department A.");
        TestAssert.Equal(
            $"{year - 1}",
            string.Join(",", await service.FindWorkOrderYearsAsync(database.EmployeeBId, otherNumber)),
            "Employee B did not find its own department number.");
        TestAssert.Equal(
            0,
            (await service.FindWorkOrderYearsAsync(database.EmployeeAId, "96100000")).Count,
            "A non-9-digit query reached the cross-year lookup.");

        await using (var dbContext = await database.Factory.CreateDbContextAsync())
        {
            await dbContext.Users
                .Where(user => user.Id == database.EmployeeAId)
                .ExecuteUpdateAsync(setters => setters.SetProperty(user => user.IsActive, false));
        }

        try
        {
            TestAssert.Equal(
                0,
                (await service.FindWorkOrderYearsAsync(database.EmployeeAId, ownNumber)).Count,
                "A deactivated employee still received cross-year results.");
        }
        finally
        {
            await using var dbContext = await database.Factory.CreateDbContextAsync();
            await dbContext.Users
                .Where(user => user.Id == database.EmployeeAId)
                .ExecuteUpdateAsync(setters => setters.SetProperty(user => user.IsActive, true));
        }
    }
}
