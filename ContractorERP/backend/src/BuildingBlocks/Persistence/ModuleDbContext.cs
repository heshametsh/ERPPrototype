using Microsoft.EntityFrameworkCore;

namespace ContractorERP.BuildingBlocks.Persistence;

/// <summary>
/// Each module owns its own tables inside its own PostgreSQL schema (e.g. "work_orders").
/// A module never reads another module's tables directly; it asks through that module's public contract.
/// </summary>
public abstract class ModuleDbContext(DbContextOptions options) : DbContext(options)
{
    protected abstract string Schema { get; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);
        modelBuilder.ApplyConfigurationsFromAssembly(GetType().Assembly);
        base.OnModelCreating(modelBuilder);
    }
}
