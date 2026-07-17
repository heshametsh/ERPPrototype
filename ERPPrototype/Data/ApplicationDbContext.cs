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

        builder.Entity<WorkOrder>(entity =>
        {
            entity.ToTable("WorkOrders");

            entity.HasKey(workOrder => workOrder.Id);

            entity.Property(workOrder => workOrder.WorkOrderNumber)
                .HasMaxLength(50)
                .IsRequired();

            entity.Property(workOrder => workOrder.WorkTypeCode)
                .HasMaxLength(20)
                .IsRequired();

            entity.Property(workOrder => workOrder.WorkYear)
                .IsRequired();

            entity.Property(workOrder => workOrder.AssignmentDate);

            entity.Property(workOrder => workOrder.Busket)
                .HasMaxLength(150)
                .IsRequired();

            entity.Property(workOrder => workOrder.Status)
                .HasMaxLength(150)
                .IsRequired();

            entity.Property(workOrder => workOrder.Notes)
                .HasMaxLength(1000);

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
                workOrder.WorkOrderNumber,
                workOrder.WorkTypeCode
            })
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