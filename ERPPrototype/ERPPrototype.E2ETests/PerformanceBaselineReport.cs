namespace ERPPrototype.E2ETests;

internal sealed record PerformanceBaselineReport(
    string SchemaVersion,
    DateTimeOffset CapturedAtUtc,
    string Action,
    int RowsPerYear,
    int RunCount,
    bool Headed,
    bool DiagnosticsEnabled,
    bool ComparableBaseline,
    PerformanceProtocolSnapshot Protocol,
    PerformanceEnvironmentSnapshot Environment,
    IReadOnlyList<PerformanceRunMetrics> Runs,
    PerformanceAggregateMetrics Aggregate);

internal sealed record PerformanceProtocolSnapshot(
    int WarmupActions,
    int ColdMeasuredActions,
    int MinimumContinuationActions,
    int LongMeasuredActions,
    double WheelDeltaY,
    string ContinuationStrategy,
    string MeasurementMethod,
    string Notes);

internal sealed record PerformanceEnvironmentSnapshot(
    string UserAgent,
    int HardwareConcurrency,
    double? DeviceMemoryGigabytes,
    int ViewportWidth,
    int ViewportHeight,
    string OperatingSystem,
    string ProcessArchitecture,
    string FrameworkDescription);

internal sealed record PerformanceRunMetrics(
    int RunNumber,
    double LoginToGridMilliseconds,
    PerformanceSegmentMetrics Cold,
    PerformanceContinuationMetrics Fatigue,
    PerformanceSegmentMetrics LongSession,
    int FinalActiveRowCount,
    int FinalDirtyRowCount,
    int MaximumRenderedRows,
    bool MovementWasValid,
    bool ReachedNearEnd);

internal sealed record PerformanceSegmentMetrics(
    string Label,
    int RequestedActions,
    int CapturedSamples,
    double PositionBefore,
    double PositionAfter,
    double PositionDelta,
    string PositionUnit,
    double WallClockMilliseconds,
    double AverageWallClockPerActionMilliseconds,
    double InputToPaintP50Milliseconds,
    double InputToPaintP95Milliseconds,
    double InputToPaintMaximumMilliseconds,
    double? UsedJsHeapBeforeMegabytes,
    double? UsedJsHeapAfterMegabytes,
    double? UsedJsHeapDeltaMegabytes,
    int RenderedRowsBefore,
    int RenderedRowsAfter,
    int LongTaskCount,
    double LongTaskTotalMilliseconds,
    double LongTaskMaximumMilliseconds,
    IReadOnlyList<double> InputToPaintSamplesMilliseconds);

internal sealed record PerformanceContinuationMetrics(
    int RequestedActions,
    double PositionBefore,
    double PositionAfter,
    double PositionDelta,
    string PositionUnit,
    double WallClockMilliseconds,
    double AverageWallClockPerActionMilliseconds,
    double? UsedJsHeapBeforeMegabytes,
    double? UsedJsHeapAfterMegabytes,
    double? UsedJsHeapDeltaMegabytes,
    int RenderedRowsBefore,
    int RenderedRowsAfter);

internal sealed record PerformanceAggregateMetrics(
    double ColdRunP50MedianMilliseconds,
    double ColdRunP95MedianMilliseconds,
    double ColdAllSamplesP50Milliseconds,
    double ColdAllSamplesP95Milliseconds,
    double LongRunP50MedianMilliseconds,
    double LongRunP95MedianMilliseconds,
    double LongAllSamplesP50Milliseconds,
    double LongAllSamplesP95Milliseconds,
    double LongVsColdP95DeltaMilliseconds,
    double LongVsColdP95Ratio,
    double? MedianRunHeapDeltaMegabytes,
    int MaximumRenderedRows,
    bool EveryRunCapturedAllSamples,
    bool EveryRunPreservedSheetState,
    string InterpretationNote);
