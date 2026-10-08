using FluentValidation;

namespace ContractorERP.Modules.WorkOrders.Application;

/// <summary>Shape checks on the request itself (sizes, duplicates inside the request). Business field rules live in WorkOrderRules.</summary>
internal sealed class SaveSheetValidator : AbstractValidator<SaveSheetRequest>
{
    public const int MaxOperations = 20_000;

    public SaveSheetValidator()
    {
        RuleFor(x => x.Added.Count + x.Updated.Count + x.Deleted.Count)
            .LessThanOrEqualTo(MaxOperations)
            .WithMessage($"Save أكبر من {MaxOperations} تغيير");

        RuleFor(x => x.Added)
            .Must(rows => rows.Select(r => r.ClientKey).Distinct(StringComparer.Ordinal).Count() == rows.Count)
            .WithMessage("ClientKey مكرر");

        RuleForEach(x => x.Added).Must(r => !string.IsNullOrWhiteSpace(r.ClientKey) && r.ClientKey.Length <= 64);

        RuleFor(x => x)
            .Must(x => x.Updated.Select(r => r.Id).Concat(x.Deleted.Select(r => r.Id)).Distinct().Count() == x.Updated.Count + x.Deleted.Count)
            .WithMessage("نفس الصف متبعت أكتر من مرة");
    }
}
