using ERPPrototype.Data.Entities;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace ERPPrototype.Data;

public class ApplicationDbContext(
    DbContextOptions<ApplicationDbContext> options)
    : IdentityDbContext<ApplicationUser>(options)
{
    public DbSet<Branch> Branches => Set<Branch>();

    public DbSet<DepartmentType> DepartmentTypes => Set<DepartmentType>();

    public DbSet<Department> Departments => Set<Department>();

    public DbSet<WorkOrder> WorkOrders => Set<WorkOrder>();

    public DbSet<CustomColumnDefinition> CustomColumnDefinitions =>
        Set<CustomColumnDefinition>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<Branch>(entity =>
        {
            entity.ToTable("Branches");

            entity.HasKey(branch => branch.Id);

            entity.Property(branch => branch.Name)
                .HasMaxLength(150)
                .IsRequired();

            entity.HasIndex(branch => branch.Name)
                .IsUnique();
        });

        builder.Entity<DepartmentType>(entity =>
        {
            entity.ToTable("DepartmentTypes");

            entity.HasKey(departmentType => departmentType.Id);

            entity.Property(departmentType => departmentType.Name)
                .HasMaxLength(150)
                .IsRequired();

            entity.HasIndex(departmentType => departmentType.Name)
                .IsUnique();
        });

        builder.Entity<Department>(entity =>
        {
            entity.ToTable("Departments");

            entity.HasKey(department => department.Id);

            entity.HasOne(department => department.Branch)
                .WithMany(branch => branch.Departments)
                .HasForeignKey(department => department.BranchId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(department => department.DepartmentType)
                .WithMany(departmentType => departmentType.Departments)
                .HasForeignKey(department => department.DepartmentTypeId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(department => new
            {
                department.BranchId,
                department.DepartmentTypeId
            })
            .IsUnique();
        });


        builder.Entity<CustomColumnDefinition>(entity =>
        {
            entity.ToTable(
                "CustomColumnDefinitions",
                tableBuilder =>
                {
                    tableBuilder.HasCheckConstraint(
                        "CK_CustomColumnDefinitions_DataType",
                        "[DataType] >= 1 AND [DataType] <= 4");

                    tableBuilder.HasCheckConstraint(
                        "CK_CustomColumnDefinitions_LayoutOrder",
                        "[LayoutOrder] > 0");
                });

            entity.HasKey(column => column.Id);

            entity.Property(column => column.FieldKey)
                .IsUnicode(false)
                .HasMaxLength(40)
                .IsRequired();

            entity.Property(column => column.Name)
                .HasMaxLength(150)
                .IsRequired();

            entity.Property(column => column.DataType)
                .IsRequired();

            entity.Property(column => column.LayoutOrder)
                .IsRequired();

            entity.Property(column => column.CreatedBy)
                .HasMaxLength(450)
                .IsRequired();

            entity.Property(column => column.RowVersion)
                .IsRowVersion();

            entity.HasOne(column => column.Department)
                .WithMany(department => department.CustomColumnDefinitions)
                .HasForeignKey(column => column.DepartmentId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(column => new
            {
                column.DepartmentId,
                column.FieldKey
            })
            .IsUnique();

            entity.HasIndex(column => new
            {
                column.DepartmentId,
                column.Name
            })
            .IsUnique();

            entity.HasIndex(column => new
            {
                column.DepartmentId,
                column.LayoutOrder
            })
            .IsUnique();
        });

        builder.Entity<WorkOrder>(entity =>
        {
            entity.ToTable(
                "WorkOrders",
                tableBuilder =>
                {
                    tableBuilder.HasCheckConstraint(
                        "CK_WorkOrders_WorkOrderNumber_NineDigits",
                        "DATALENGTH([WorkOrderNumber]) = 9 AND [WorkOrderNumber] COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^0-9]%'");

                    tableBuilder.HasCheckConstraint(
                        "CK_WorkOrders_WorkTypeCode_ThreeDigits",
                        "DATALENGTH([WorkTypeCode]) = 3 AND [WorkTypeCode] COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^0-9]%'");

                    tableBuilder.HasCheckConstraint(
                        "CK_WorkOrders_WorkOrderValue_Positive",
                        "[WorkOrderValue] IS NULL OR [WorkOrderValue] > 0");

                    tableBuilder.HasCheckConstraint(
                        "CK_WorkOrders_PartialAmount_Positive",
                        "[PartialAmount] IS NULL OR [PartialAmount] > 0");

                    tableBuilder.HasCheckConstraint(
                        "CK_WorkOrders_PartialAmount_NotAboveValue",
                        "[PartialAmount] IS NULL OR ([WorkOrderValue] IS NOT NULL AND [PartialAmount] <= [WorkOrderValue])");
                });

            entity.HasKey(workOrder => workOrder.Id);

            entity.Property(workOrder => workOrder.WorkOrderNumber)
                .IsUnicode(false)
                .HasMaxLength(9)
                .IsRequired();

            entity.Property(workOrder => workOrder.WorkTypeCode)
                .IsUnicode(false)
                .HasMaxLength(3)
                .IsRequired();

            entity.Property(workOrder => workOrder.WorkYear)
                .IsRequired();

            entity.Property(workOrder => workOrder.DisplayOrder)
                .IsRequired();

            entity.Property(workOrder => workOrder.AssignmentDate);

            entity.Property(workOrder => workOrder.WorkOrderValue)
                .HasPrecision(18, 2);

            entity.Property(workOrder => workOrder.PartialAmount)
                .HasPrecision(18, 2);

            entity.Property(workOrder => workOrder.Busket)
                .HasMaxLength(150)
                .IsRequired();

            entity.Property(workOrder => workOrder.Status)
                .HasMaxLength(150)
                .IsRequired();

            entity.Property(workOrder => workOrder.Notes)
                .HasMaxLength(1000);

            entity.Property(workOrder => workOrder.CustomValuesJson)
                .HasColumnType("nvarchar(max)")
                .HasDefaultValue("{}")
                .IsRequired();

            entity.Property(workOrder => workOrder.RowVersion)
                .IsRowVersion();

            entity.Property(workOrder => workOrder.CreatedBy)
                .HasMaxLength(450)
                .IsRequired();

            entity.Property(workOrder => workOrder.UpdatedBy)
                .HasMaxLength(450);

            entity.HasOne(workOrder => workOrder.Department)
                .WithMany(department => department.WorkOrders)
                .HasForeignKey(workOrder => workOrder.DepartmentId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(workOrder => new
            {
                workOrder.DepartmentId,
                workOrder.WorkYear,
                workOrder.DisplayOrder
            });

            entity.HasIndex(workOrder => new
            {
                workOrder.WorkOrderNumber,
                workOrder.WorkTypeCode
            })
            .HasDatabaseName(
                "UX_WorkOrders_WorkOrderNumber_WorkTypeCode")
            .IsUnique();
        });

        builder.Entity<ApplicationUser>(entity =>
        {
            entity.Property(user => user.FullName)
                .HasMaxLength(200)
                .IsRequired();

            entity.Property(user => user.MustChangePassword)
                .IsRequired();

            entity.Property(user => user.IsActive)
                .IsRequired();

            entity.HasOne(user => user.Branch)
                .WithMany()
                .HasForeignKey(user => user.BranchId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(user => user.Department)
                .WithMany()
                .HasForeignKey(user => user.DepartmentId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }
}