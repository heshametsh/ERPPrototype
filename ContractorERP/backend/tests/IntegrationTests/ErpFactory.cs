using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Testcontainers.PostgreSql;

namespace ContractorERP.IntegrationTests;

/// <summary>Starts a real PostgreSQL in Docker and the real API against it (migrations + demo seed).</summary>
public sealed class ErpFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly PostgreSqlContainer postgres = new PostgreSqlBuilder("postgres:17-alpine").Build();

    public async Task InitializeAsync()
    {
        await postgres.StartAsync();
        Environment.SetEnvironmentVariable("ConnectionStrings__Default", postgres.GetConnectionString());
        _ = Server; // boot the app now: runs migrations + seed
    }

    public new async Task DisposeAsync()
    {
        await base.DisposeAsync();
        await postgres.DisposeAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder) => builder.UseEnvironment("Development");

    public async Task<HttpClient> LoginAsync(string userName)
    {
        var client = CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/login", new { userName, password = "Demo#2026" });
        response.EnsureSuccessStatusCode();
        return client;
    }
}

[CollectionDefinition(Name)]
public sealed class ErpCollection : ICollectionFixture<ErpFactory>
{
    public const string Name = "erp";
}
