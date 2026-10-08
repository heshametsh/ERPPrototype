using ContractorERP.BuildingBlocks.Persistence;
using ContractorERP.Modules.WorkOrders.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ContractorERP.Modules.WorkOrders.Infrastructure;

internal sealed class WorkOrdersDbContext(DbContextOptions<WorkOrdersDbContext> options) : ModuleDbContext(options)
{
    public const string SchemaName = "work_orders";

    protected override string Schema => SchemaName;

    public DbSet<WorkOrder> WorkOrders => Set<WorkOrder>();
}

internal sealed class WorkOrderConfiguration : IEntityTypeConfiguration<WorkOrder>
{
    public void Configure(EntityTypeBuilder<WorkOrder> b)
    {
        b.ToTable("work_orders");
        b.Property(x => x.Number).HasMaxLength(9).IsRequired();
        b.Property(x => x.WorkTypeCode).HasMaxLength(3).IsRequired();
        b.Property(x => x.Basket).HasMaxLength(WorkOrderRules.BasketMaxLength).IsRequired();
        b.Property(x => x.Value).HasPrecision(18, 2);
        b.Property(x => x.PartialAmount).HasPrecision(18, 2);
        b.Property(x => x.WorkYear);
        b.Property(x => x.AssignmentDate).HasField("assignmentDate");
        b.Ignore(x => x.RemainingAmount);
        b.Property(x => x.Version).IsRowVersion();

        // Last line of defense: the same Number + Work Type can exist only once in the whole company.
        b.HasIndex(x => new { x.Number, x.WorkTypeCode }).IsUnique();

        // The sheet read path: one department, one year, in sheet order.
        b.HasIndex(x => new { x.DepartmentId, x.WorkYear, x.DisplayOrder });

        b.ToTable(t =>
        {
            t.HasCheckConstraint("ck_work_orders_value", "\"Value\" >= 0");
            t.HasCheckConstraint("ck_work_orders_partial", "\"PartialAmount\" IS NULL OR (\"PartialAmount\" > 0 AND \"PartialAmount\" <= \"Value\")");
        });
    }
}
