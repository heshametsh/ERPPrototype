namespace ContractorERP.BuildingBlocks.Security;

public static class AuthPolicies
{
    /// <summary>Signed in, even with a temporary password. Only for login/logout/me/change-password.</summary>
    public const string SignedIn = "signed-in";

    // Every other endpoint uses the default policy: signed in AND temporary password already changed.
}
