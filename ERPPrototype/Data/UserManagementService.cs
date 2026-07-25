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
        string actorUserId,
        CreateBranchUserRequest request,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(actorUserId))
        {
            return UserCreationResult.Failure(
                "تعذر التحقق من حساب مدير النظام.");
        }

        var fullName = request.FullName.Trim();
        var userName = request.UserName.Trim();
        var email = request.Email.Trim();

        if (string.IsNullOrWhiteSpace(fullName))
        {
            return UserCreationResult.Failure("اكتب الاسم الكامل.");
        }

        if (string.IsNullOrWhiteSpace(userName))
        {
            return UserCreationResult.Failure("اكتب اسم المستخدم.");
        }

        if (string.IsNullOrWhiteSpace(email))
        {
            return UserCreationResult.Failure("اكتب البريد الإلكتروني.");
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
            await _dbFactory.CreateDbContextAsync(cancellationToken);

        var actorIsAdmin = await (
            from account in dbContext.Users.AsNoTracking()
            join userRole in dbContext.UserRoles.AsNoTracking()
                on account.Id equals userRole.UserId
            join role in dbContext.Roles.AsNoTracking()
                on userRole.RoleId equals role.Id
            where
                account.Id == actorUserId &&
                account.IsActive &&
                role.Name == AppRoles.Admin
            select account.Id)
            .AnyAsync(cancellationToken);

        if (!actorIsAdmin)
        {
            return UserCreationResult.Failure(
                "غير مصرح لهذا الحساب بإنشاء مستخدمين.");
        }

        var branchExists = await dbContext.Branches
            .AsNoTracking()
            .AnyAsync(
                branch => branch.Id == request.BranchId,
                cancellationToken);

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
                .AnyAsync(
                    department =>
                        department.Id == request.DepartmentId.Value &&
                        department.BranchId == request.BranchId,
                    cancellationToken);

            if (!departmentExists)
            {
                return UserCreationResult.Failure(
                    "القسم المحدد لا يتبع هذا الفرع.");
            }

            departmentId = request.DepartmentId;
        }

        var fixedAccountAlreadyExists = await (
            from account in dbContext.Users.AsNoTracking()
            join userRole in dbContext.UserRoles.AsNoTracking()
                on account.Id equals userRole.UserId
            join role in dbContext.Roles.AsNoTracking()
                on userRole.RoleId equals role.Id
            where
                role.Name == request.Role &&
                account.BranchId == request.BranchId &&
                (
                    request.Role == AppRoles.BranchManager ||
                    account.DepartmentId == departmentId
                )
            select account.Id)
            .AnyAsync(cancellationToken);

        if (fixedAccountAlreadyExists)
        {
            return request.Role == AppRoles.BranchManager
                ? UserCreationResult.Failure(
                    "يوجد بالفعل حساب مدير مشروع ثابت لهذا الفرع.")
                : UserCreationResult.Failure(
                    "يوجد بالفعل حساب موظف ثابت لهذا القسم.");
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

        var newUser = new ApplicationUser
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
            newUser,
            request.TemporaryPassword);

        if (!createResult.Succeeded)
        {
            return UserCreationResult.Failure(
                string.Join(
                    " ",
                    createResult.Errors.Select(error =>
                        error.Description)));
        }

        var roleResult = await _userManager.AddToRoleAsync(
            newUser,
            request.Role);

        if (!roleResult.Succeeded)
        {
            await _userManager.DeleteAsync(newUser);

            return UserCreationResult.Failure(
                string.Join(
                    " ",
                    roleResult.Errors.Select(error =>
                        error.Description)));
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

    public string ErrorMessage { get; private init; } = string.Empty;

    public static UserCreationResult Success() =>
        new()
        {
            Succeeded = true
        };

    public static UserCreationResult Failure(string errorMessage) =>
        new()
        {
            Succeeded = false,
            ErrorMessage = errorMessage
        };
}
