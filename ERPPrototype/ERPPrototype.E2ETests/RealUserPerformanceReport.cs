namespace ERPPrototype.E2ETests;

internal sealed record RealUserPerformanceReport(
    string SchemaVersion,
    DateTimeOffset CapturedAtUtc,
    int RowsPerYear,
    int RunCount,
    bool Headed,
    int ViewportWidth,
    int ViewportHeight,
    string RequiredLayoutMode,
    string MeasurementNote,
    bool RequiresHumanSmoothnessAcceptance,
    IReadOnlyList<RealUserPerformanceRunMetrics> Runs,
    RealUserPerformanceAggregate Aggregate);

internal sealed record RealUserPerformanceRunMetrics(
    int RunNumber,
    string LayoutMode,
    double LayoutRatio,
    double OuterWidth,
    double ScreenAvailableWidth,
    double LoginToUsableGridMilliseconds,
    int FinalActiveRowCount,
    int FinalDirtyRowCount,
    int MaximumRenderedRows,
    IReadOnlyList<RealUserActionMetric> Actions);

internal sealed record RealUserActionMetric(
    string Name,
    string Description,
    double WallMilliseconds,
    int LongTaskCount,
    double TotalLongTaskMilliseconds,
    double MaximumLongTaskMilliseconds);

internal sealed record RealUserActionAggregate(
    string Name,
    string Description,
    int RunsPresent,
    double MedianWallMilliseconds,
    double MinimumWallMilliseconds,
    double MaximumWallMilliseconds,
    double MedianLongTaskCount,
    double MedianMaximumLongTaskMilliseconds);

internal sealed record RealUserPerformanceAggregate(
    double MedianLoginToUsableGridMilliseconds,
    IReadOnlyList<RealUserActionAggregate> Actions);
