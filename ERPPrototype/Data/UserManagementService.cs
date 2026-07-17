using ERPPrototype.Data.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace ERPPrototype.Data;

public sealed class UserManagementService
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IDbContextFactory<ApplicationDbContext> _dbFactory;

    public UserManagementService(
        UserManager<ApplicationUser> userManager,
        IDbContextFactory<ApplicationDbContext> dbFactory)
    {
        _userManager = userManager;
        _dbFactory = dbFactory;
    }

    public async Task<UserCreationResult> CreateBranchUserAsync(
        CreateBranchUserRequest request)
    {
        var fullName = request.FullName.Trim();
        var userName = request.UserName.Trim();
        var email = request.Email.Trim();

        if (string.IsNullOrWhiteSpace(fullName))
        {
            return UserCreationResult.Failure(
                "اكتب الاسم الكامل.");
        }

        if (string.IsNullOrWhiteSpace(userName))
        {
            return UserCreationResult.Failure(
                "اكتب اسم المستخدم.");
        }

        if (string.IsNullOrWhiteSpace(email))
        {
            return UserCreationResult.Failure(
                "اكتب البريد الإلكتروني.");
        }

        if (string.IsNullOrWhiteSpace(request.TemporaryPassword))
        {
            return UserCreationResult.Failure(
                "اكتب كلمة المرور المؤقتة.");
        }

        if (request.Role is not AppRoles.BranchManager
            and not AppRoles.Employee)
        {
            return UserCreationResult.Failure(
                "نوع المستخدم غير صحيح.");
        }

        await using var dbContext =
            await _dbFactory.CreateDbContextAsync();

        var branchExists = await dbContext.Branches
            .AsNoTracking()
            .AnyAsync(branch => branch.Id == request.BranchId);

        if (!branchExists)
        {
            return UserCreationResult.Failure(
                "الفرع المحدد غير موجود.");
        }

        int? departmentId = null;

        if (request.Role == AppRoles.Employee)
        {
            if (request.DepartmentId is null)
            {
                return UserCreationResult.Failure(
                    "اختر قسم الموظف.");
            }

            var departmentExists = await dbContext.Departments
                .AsNoTracking()
                .AnyAsync(department =>
                    department.Id == request.DepartmentId.Value
                    && department.BranchId == request.BranchId);

            if (!departmentExists)
            {
                return UserCreationResult.Failure(
                    "القسم المحدد لا يتبع هذا الفرع.");
            }

            departmentId = request.DepartmentId;
        }

        var existingUserName =
            await _userManager.FindByNameAsync(userName);

        if (existingUserName is not null)
        {
            return UserCreationResult.Failure(
                "اسم المستخدم مستخدم بالفعل.");
        }

        var existingEmail =
            await _userManager.FindByEmailAsync(email);

        if (existingEmail is not null)
        {
            return UserCreationResult.Failure(
                "البريد الإلكتروني مستخدم بالفعل.");
        }

        var user = new ApplicationUser
        {
            FullName = fullName,
            UserName = userName,
            Email = email,
            EmailConfirmed = true,
            IsActive = true,
            MustChangePassword = true,
            BranchId = request.BranchId,
            DepartmentId = departmentId
        };

        var createResult = await _userManager.CreateAsync(
            user,
            request.TemporaryPassword);

        if (!createResult.Succeeded)
        {
            var errorMessage = string.Join(
                " ",
                createResult.Errors.Select(error =>
                    error.Description));

            return UserCreationResult.Failure(errorMessage);
        }

        var roleResult = await _userManager.AddToRoleAsync(
            user,
            request.Role);

        if (!roleResult.Succeeded)
        {
            await _userManager.DeleteAsync(user);

            var errorMessage = string.Join(
                " ",
                roleResult.Errors.Select(error =>
                    error.Description));

            return UserCreationResult.Failure(errorMessage);
        }

        return UserCreationResult.Success();
    }
}

public sealed class CreateBranchUserRequest
{
    public string FullName { get; set; } = string.Empty;

    public string UserName { get; set; } = string.Empty;

    public string Email { get; set; } = string.Empty;

    public string TemporaryPassword { get; set; } = string.Empty;

    public string Role { get; set; } = AppRoles.Employee;

    public int BranchId { get; set; }

    public int? DepartmentId { get; set; }
}

public sealed class UserCreationResult
{
    public bool Succeeded { get; private init; }

    public string ErrorMessage { get; private init; } =
        string.Empty;

    public static UserCreationResult Success()
    {
        return new UserCreationResult
        {
            Succeeded = true
        };
    }

    public static UserCreationResult Failure(string errorMessage)
    {
        return new UserCreationResult
        {
            Succeeded = false,
            ErrorMessage = errorMessage
        };
    }
}