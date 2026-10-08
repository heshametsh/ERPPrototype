using ERPPrototype.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace ERPPrototype.Data;

public sealed class AdminBranchService(
    IDbContextFactory<ApplicationDbContext> dbFactory,
    AdminAuthorizationService adminAuthorization)
{
    public async Task<AdminMutationResult> AddBranchAsync(
        string? actorUserId,
        string branchName,
        CancellationToken cancellationToken = default)
    {
        var authorization = await adminAuthorization.AuthorizeAsync(
            actorUserId,
            cancellationToken);

        if (!authorization.Succeeded)
        {
            return AdminMutationResult.Unauthorized();
        }

        branchName = branchName.Trim();
        if (string.IsNullOrWhiteSpace(branchName))
        {
            return AdminMutationResult.Failure("اكتب اسم الفرع أولًا.");
        }

        await using var dbContext =
            await dbFactory.CreateDbContextAsync(cancellationToken);

        if (await dbContext.Branches.AnyAsync(
                branch => branch.Name == branchName,
                cancellationToken))
        {
            return AdminMutationResult.Failure(
                "يوجد فرع مسجل بنفس الاسم.");
        }

        var departmentTypes = await dbContext.DepartmentTypes
            .AsNoTracking()
            .Where(departmentType =>
                StandardDepartmentTypes.All.Contains(departmentType.Name))
            .ToListAsync(cancellationToken);

        if (departmentTypes.Count != StandardDepartmentTypes.All.Count)
        {
            return AdminMutationResult.Failure(
                "تعذر إنشاء الفرع لأن أنواع الأقسام الأساسية غير مكتملة.");
        }

        var branch = new Branch { Name = branchName };
        foreach (var departmentType in departmentTypes)
        {
            branch.Departments.Add(new Department
            {
                DepartmentTypeId = departmentType.Id
            });
        }

        dbContext.Branches.Add(branch);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
            return AdminMutationResult.Success();
        }
        catch (DbUpdateException)
        {
            return AdminMutationResult.Failure(
                "تعذر حفظ الفرع. قد يكون الاسم مستخدمًا بالفعل.");
        }
    }

    public async Task<AdminMutationResult> RenameBranchAsync(
        string? actorUserId,
        int branchId,
        string branchName,
        CancellationToken cancellationToken = default)
    {
        var authorization = await adminAuthorization.AuthorizeAsync(
            actorUserId,
            cancellationToken);

        if (!authorization.Succeeded)
        {
            return AdminMutationResult.Unauthorized();
        }

        branchName = branchName.Trim();
        if (string.IsNullOrWhiteSpace(branchName))
        {
            return AdminMutationResult.Failure(
                "اسم الفرع لا يمكن أن يكون فارغًا.");
        }

        await using var dbContext =
            await dbFactory.CreateDbContextAsync(cancellationToken);

        var branch = await dbContext.Branches.SingleOrDefaultAsync(
            item => item.Id == branchId,
            cancellationToken);

        if (branch is null)
        {
            return AdminMutationResult.Failure(
                "الفرع المطلوب تعديله غير موجود.");
        }

        if (await dbContext.Branches.AnyAsync(
                item => item.Id != branchId && item.Name == branchName,
                cancellationToken))
        {
            return AdminMutationResult.Failure(
                "يوجد فرع آخر مسجل بنفس الاسم.");
        }

        branch.Name = branchName;

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
            return AdminMutationResult.Success();
        }
        catch (DbUpdateException)
        {
            return AdminMutationResult.Failure(
                "تعذر تعديل الفرع. قد يكون الاسم مستخدمًا بالفعل.");
        }
    }
}

public sealed record AdminMutationResult(
    bool Succeeded,
    string ErrorMessage)
{
    public static AdminMutationResult Success() => new(true, string.Empty);

    public static AdminMutationResult Failure(string errorMessage) =>
        new(false, errorMessage);

    public static AdminMutationResult Unauthorized() =>
        Failure("غير مصرح لهذا الحساب بتنفيذ عمليات الإدارة.");
}
