using ERPPrototype.Data.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace ERPPrototype.Data;

public static class ApplicationSeeder
{
    private const string InitialAdminEmail = "heshammastoura@outlook.com";

    public static async Task SeedAsync(IServiceProvider services)
    {
        await EnsureRolesAsync(services);
        await EnsureInitialAdminAsync(services);
        await EnsureStandardDepartmentStructureAsync(services);
    }

    private static async Task EnsureRolesAsync(IServiceProvider services)
    {
        var roleManager =
            services.GetRequiredService<RoleManager<IdentityRole>>();

        foreach (var roleName in AppRoles.All)
        {
            if (await roleManager.RoleExistsAsync(roleName))
            {
                continue;
            }

            var result =
                await roleManager.CreateAsync(new IdentityRole(roleName));

            ThrowIfIdentityOperationFailed(
                result,
                $"Failed to create role '{roleName}'");
        }
    }

    private static async Task EnsureInitialAdminAsync(
        IServiceProvider services)
    {
        var userManager =
            services.GetRequiredService<UserManager<ApplicationUser>>();

        var initialAdmin =
            await userManager.FindByEmailAsync(InitialAdminEmail);

        if (initialAdmin is null)
        {
            throw new InvalidOperationException(
                $"The initial admin account '{InitialAdminEmail}' was not found.");
        }

        var currentRoles = await userManager.GetRolesAsync(initialAdmin);

        if (currentRoles.Count == 1 &&
            currentRoles.Contains(AppRoles.Admin))
        {
            return;
        }

        if (currentRoles.Count > 0)
        {
            var removeResult =
                await userManager.RemoveFromRolesAsync(
                    initialAdmin,
                    currentRoles);

            ThrowIfIdentityOperationFailed(
                removeResult,
                "Failed to remove existing roles from the initial admin");
        }

        var addResult =
            await userManager.AddToRoleAsync(initialAdmin, AppRoles.Admin);

        ThrowIfIdentityOperationFailed(
            addResult,
            "Failed to assign the Admin role to the initial admin");
    }

    private static async Task EnsureStandardDepartmentStructureAsync(
        IServiceProvider services)
    {
        var dbContext =
            services.GetRequiredService<ApplicationDbContext>();

        var departmentTypes =
            await dbContext.DepartmentTypes.ToListAsync();

        var unexpectedDepartmentTypes = departmentTypes
            .Where(departmentType =>
                !StandardDepartmentTypes.All.Contains(departmentType.Name))
            .Select(departmentType => departmentType.Name)
            .ToList();

        if (unexpectedDepartmentTypes.Count > 0)
        {
            throw new InvalidOperationException(
                "Unexpected department types were found: " +
                string.Join(", ", unexpectedDepartmentTypes));
        }

        foreach (var departmentTypeName in StandardDepartmentTypes.All)
        {
            if (departmentTypes.Any(departmentType =>
                    departmentType.Name == departmentTypeName))
            {
                continue;
            }

            var departmentType = new DepartmentType
            {
                Name = departmentTypeName
            };

            dbContext.DepartmentTypes.Add(departmentType);
            departmentTypes.Add(departmentType);
        }

        await dbContext.SaveChangesAsync();

        var branches = await dbContext.Branches
            .Include(branch => branch.Departments)
            .ToListAsync();

        foreach (var branch in branches)
        {
            var existingDepartmentTypeIds = branch.Departments
                .Select(department => department.DepartmentTypeId)
                .ToHashSet();

            foreach (var departmentType in departmentTypes)
            {
                if (existingDepartmentTypeIds.Contains(departmentType.Id))
                {
                    continue;
                }

                branch.Departments.Add(new Department
                {
                    DepartmentTypeId = departmentType.Id
                });
            }
        }

        await dbContext.SaveChangesAsync();
    }

    private static void ThrowIfIdentityOperationFailed(
        IdentityResult result,
        string operation)
    {
        if (result.Succeeded)
        {
            return;
        }

        var errors = string.Join(
            "; ",
            result.Errors.Select(error => error.Description));

        throw new InvalidOperationException($"{operation}: {errors}");
    }
}
