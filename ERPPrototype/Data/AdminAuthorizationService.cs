using Microsoft.EntityFrameworkCore;

namespace ERPPrototype.Data;

public sealed class AdminAuthorizationService(
    IDbContextFactory<ApplicationDbContext> dbFactory)
{
    public async Task<AdminAuthorizationResult> AuthorizeAsync(
        string? actorUserId,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(actorUserId))
        {
            return AdminAuthorizationResult.Denied(
                AdminAuthorizationFailure.MissingAccount);
        }

        await using var dbContext =
            await dbFactory.CreateDbContextAsync(cancellationToken);

        var accountRows = await (
            from account in dbContext.Users.AsNoTracking()
            join userRole in dbContext.UserRoles.AsNoTracking()
                on account.Id equals userRole.UserId
            join role in dbContext.Roles.AsNoTracking()
                on userRole.RoleId equals role.Id
            where account.Id == actorUserId
            select new
            {
                account.IsActive,
                account.MustChangePassword,
                RoleName = role.Name
            })
            .ToListAsync(cancellationToken);

        if (accountRows.Count == 0)
        {
            return AdminAuthorizationResult.Denied(
                AdminAuthorizationFailure.MissingAccount);
        }

        if (!accountRows[0].IsActive)
        {
            return AdminAuthorizationResult.Denied(
                AdminAuthorizationFailure.Inactive);
        }

        if (accountRows[0].MustChangePassword)
        {
            return AdminAuthorizationResult.Denied(
                AdminAuthorizationFailure.MustChangePassword);
        }

        if (!accountRows.Any(row => row.RoleName == AppRoles.Admin))
        {
            return AdminAuthorizationResult.Denied(
                AdminAuthorizationFailure.NotAdmin);
        }

        return AdminAuthorizationResult.Allowed();
    }
}

public enum AdminAuthorizationFailure
{
    None,
    MissingAccount,
    Inactive,
    MustChangePassword,
    NotAdmin
}

public sealed record AdminAuthorizationResult(
    bool Succeeded,
    AdminAuthorizationFailure Failure)
{
    public static AdminAuthorizationResult Allowed() =>
        new(true, AdminAuthorizationFailure.None);

    public static AdminAuthorizationResult Denied(
        AdminAuthorizationFailure failure) =>
        new(false, failure);
}
