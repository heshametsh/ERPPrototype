using ERPPrototype.Data;
using Microsoft.EntityFrameworkCore;

namespace ERPPrototype.IntegrationTests;

internal sealed class TestDbContextFactory(
    DbContextOptions<ApplicationDbContext> options)
    : IDbContextFactory<ApplicationDbContext>
{
    public ApplicationDbContext CreateDbContext() =>
        new(options);

    public Task<ApplicationDbContext> CreateDbContextAsync(
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new ApplicationDbContext(options));
}
