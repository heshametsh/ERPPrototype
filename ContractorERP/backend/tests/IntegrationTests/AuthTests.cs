using System.Net;
using System.Net.Http.Json;

namespace ContractorERP.IntegrationTests;

[Collection(ErpCollection.Name)]
public class AuthTests(ErpFactory factory)
{
    [Fact]
    public async Task Wrong_password_is_rejected()
    {
        var response = await factory.CreateClient().PostAsJsonAsync("/api/auth/login", new { userName = "employee", password = "wrong-pass" });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Temporary_password_blocks_business_work_until_changed()
    {
        var client = await factory.LoginAsync("newemployee");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/work-orders/sheet")).StatusCode);

        var change = await client.PostAsJsonAsync("/api/auth/change-password", new { currentPassword = "Demo#2026", newPassword = "NewPass#2026" });
        Assert.Equal(HttpStatusCode.NoContent, change.StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/work-orders/sheet")).StatusCode);
    }

    [Fact]
    public async Task Responses_carry_security_headers()
    {
        var response = await factory.CreateClient().GetAsync("/health");
        Assert.Contains("frame-ancestors 'none'", response.Headers.GetValues("Content-Security-Policy").Single());
    }
}
