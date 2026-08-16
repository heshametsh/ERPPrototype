namespace ERPPrototype.E2ETests;

internal sealed record OpenPerformanceBaselineReport(
    string SchemaVersion,
    DateTimeOffset CapturedAtUtc,
    int RowsPerYear,
    int RunCount,
    bool Headed,
    PerformanceEnvironmentSnapshot Environment,
    IReadOnlyList<OpenPerformanceRunMetrics> Runs,
    OpenPerformanceAggregateMetrics Aggregate,
    string InterpretationNote);

internal sealed record OpenPerformanceRunMetrics(
    int RunNumber,
    double LoginToGridWallMilliseconds,
    double? GridFirstUsableFromInitializeMilliseconds,
    double? GridFirstUsableFromProfilerStartMilliseconds,
    double ApproximateGridDataKilobytes,
    double ResourceTransferKilobytes,
    double LongestResourceMilliseconds,
    string? LongestResourceName,
    double? BrowserUsedJsHeapStartMegabytes,
    double? BrowserUsedJsHeapEndMegabytes,
    double? BrowserUsedJsHeapDeltaMegabytes,
    double ProfilerMeasuredHookMilliseconds,
    double? ProfilerMeasuredHookRatioPercent,
    IReadOnlyList<OpenPerformanceStageMetric> Stages,
    IReadOnlyList<OpenPerformanceResourceMetric> Resources);

internal sealed record OpenPerformanceStageMetric(
    string Name,
    int Count,
    double TotalMilliseconds,
    double AverageMilliseconds,
    double MaximumMilliseconds,
    double LastMilliseconds);

internal sealed record OpenPerformanceResourceMetric(
    string Name,
    double DurationMilliseconds,
    double? TransferKilobytes,
    double? DecodedKilobytes);

internal sealed record OpenPerformanceStageAggregate(
    string Name,
    int RunsPresent,
    double MedianMilliseconds,
    double MinimumMilliseconds,
    double MaximumMilliseconds);

internal sealed record OpenPerformanceAggregateMetrics(
    double MedianLoginToGridWallMilliseconds,
    double MedianGridFirstUsableFromInitializeMilliseconds,
    double MedianApproximateGridDataKilobytes,
    double MedianResourceTransferKilobytes,
    double MedianProfilerMeasuredHookRatioPercent,
    IReadOnlyList<OpenPerformanceStageAggregate> Stages);
