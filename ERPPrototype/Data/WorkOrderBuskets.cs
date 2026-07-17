namespace ERPPrototype.Data;

public static class WorkOrderBuskets
{
    public const string MunicipalityNotSubmitted =
        "لم يتم تقديم البلديه";

    public const string MunicipalitySubmittedNotExecuted =
        "تم تقديم البلدية ولم يتم التنفيذ";

    public const string InProgress =
        "تحت التنفيذ";

    public const string InspectionBusket =
        "سلة الفحص";

    public const string EstimateRevision =
        "تعديل مقايسة";

    public const string EngineeringBusket =
        "سلة الهندسة";

    public const string MaterialIssueAndReturn =
        "صرف ورجيع";

    public const string FirstCompletionCertificate =
        "شهادة انجاز اولى";

    public const string SecondCompletionCertificate =
        "شهادة انجاز ثانية";

    public const string PaymentCertificatePreparation =
        "اعداد مستخلص";

    public const string PaymentCertificateApproval =
        "اعتماد مستخلص";

    public const string FinanceBusket =
        "سلة المالية";

    public const string WorkOrderCompleted =
        "انتهاء امر العمل";

    public static IReadOnlyList<string> All { get; } =
    [
        MunicipalityNotSubmitted,
        MunicipalitySubmittedNotExecuted,
        InProgress,
        InspectionBusket,
        EstimateRevision,
        EngineeringBusket,
        MaterialIssueAndReturn,
        FirstCompletionCertificate,
        SecondCompletionCertificate,
        PaymentCertificatePreparation,
        PaymentCertificateApproval,
        FinanceBusket,
        WorkOrderCompleted
    ];
}