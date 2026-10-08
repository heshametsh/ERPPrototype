using System.Security.Claims;
using ContractorERP.BuildingBlocks.Security;
using ContractorERP.Modules.Organization.Domain;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Routing;

namespace ContractorERP.Modules.Organization.Api;

public sealed record LoginRequest(string UserName, string Password);

public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);

public sealed record MeResponse(Guid Id, string UserName, string FullName, IReadOnlyList<string> Roles, Guid? BranchId, Guid? DepartmentId, bool MustChangePassword);

internal static class AuthEndpoints
{
    public const string LoginRateLimitPolicy = "login";

    public static void Map(IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/auth").WithTags("Auth");

        group.MapPost("/login", async (LoginRequest request, SignInManager<AppUser> signIn) =>
        {
            // lockoutOnFailure: 5 wrong attempts lock the account for 15 minutes (configured in OrganizationModule).
            var result = await signIn.PasswordSignInAsync(request.UserName, request.Password, isPersistent: false, lockoutOnFailure: true);
            return result.Succeeded
                ? Results.NoContent()
                : Results.Problem(statusCode: StatusCodes.Status401Unauthorized, title: result.IsLockedOut ? "account_locked" : "invalid_credentials");
        })
        .AllowAnonymous()
        .RequireRateLimiting(LoginRateLimitPolicy);

        group.MapPost("/logout", async (SignInManager<AppUser> signIn) =>
        {
            await signIn.SignOutAsync();
            return Results.NoContent();
        })
        .RequireAuthorization(AuthPolicies.SignedIn);

        group.MapGet("/me", async (ClaimsPrincipal principal, UserManager<AppUser> users) =>
        {
            var user = await users.GetUserAsync(principal);
            if (user is null)
            {
                return Results.Unauthorized();
            }

            var roles = await users.GetRolesAsync(user);
            return Results.Ok(new MeResponse(user.Id, user.UserName!, user.FullName, [.. roles], user.BranchId, user.DepartmentId, user.MustChangePassword));
        })
        .RequireAuthorization(AuthPolicies.SignedIn);

        group.MapPost("/change-password", async (ChangePasswordRequest request, ClaimsPrincipal principal, UserManager<AppUser> users, SignInManager<AppUser> signIn) =>
        {
            var user = await users.GetUserAsync(principal);
            if (user is null)
            {
                return Results.Unauthorized();
            }

            var changed = await users.ChangePasswordAsync(user, request.CurrentPassword, request.NewPassword);
            if (!changed.Succeeded)
            {
                return Results.ValidationProblem(changed.Errors.GroupBy(e => e.Code).ToDictionary(g => g.Key, g => g.Select(e => e.Description).ToArray()));
            }

            user.MustChangePassword = false;
            await users.UpdateAsync(user);
            await signIn.RefreshSignInAsync(user);
            return Results.NoContent();
        })
        .RequireAuthorization(AuthPolicies.SignedIn);
    }
}
