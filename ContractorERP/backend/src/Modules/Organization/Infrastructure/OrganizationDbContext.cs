using ContractorERP.Modules.Organization.Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace ContractorERP.Modules.Organization.Infrastructure;

internal sealed class OrganizationDbContext(DbContextOptions<OrganizationDbContext> options)
    : IdentityDbContext<AppUser, IdentityRole<Guid>, Guid>(options)
{
    public const string Schema = "organization";

    public DbSet<Branch> Branches => Set<Branch>();

    public DbSet<Department> Departments => Set<Department>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.HasDefaultSchema(Schema);

        builder.Entity<Branch>(b =>
        {
            b.Property(x => x.Name).HasMaxLength(150);
            b.HasIndex(x => x.Name).IsUnique();
            b.HasMany(x => x.Departments).WithOne().HasForeignKey(x => x.BranchId).OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<Department>(d =>
        {
            d.Property(x => x.Name).HasMaxLength(150);
            d.Property(x => x.Kind).HasMaxLength(50);
            d.HasIndex(x => new { x.BranchId, x.Name }).IsUnique();
        });

        builder.Entity<AppUser>(u =>
        {
            u.Property(x => x.FullName).HasMaxLength(150);
            u.HasOne<Branch>().WithMany().HasForeignKey(x => x.BranchId).OnDelete(DeleteBehavior.Restrict);
            u.HasOne<Department>().WithMany().HasForeignKey(x => x.DepartmentId).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
