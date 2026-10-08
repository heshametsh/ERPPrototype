using ContractorERP.BuildingBlocks.Results;

namespace ContractorERP.Modules.WorkOrders.Application;

internal static class WorkOrderErrors
{
    public static Error NotEmployee() => new(ErrorKind.Forbidden, "not_department_employee", "الحساب ده مش موظف في قسم");

    public static Error Field(string rowKey, string field, string code, string message) =>
        new(ErrorKind.Validation, code, message, $"{rowKey}:{field}");

    public static Error Duplicate(string rowKey) =>
        new(ErrorKind.Conflict, "duplicate_identity", "رقم أمر العمل ونوع العمل موجودين قبل كده", $"{rowKey}:number");

    public static Error Stale(string rowKey) =>
        new(ErrorKind.Conflict, "stale_row", "حد تاني عدّل أو مسح الصف ده قبلك. اعمل تحديث للشيت", rowKey);

    public static Error YearMoveNeedsConfirmation(string rowKey, int fromYear, int toYear) =>
        new(ErrorKind.Validation, "year_move_needs_confirmation", $"تاريخ الإسناد هينقل الأمر من سنة {fromYear} لسنة {toYear}. أكّد النقل", $"{rowKey}:assignmentDate");
}
