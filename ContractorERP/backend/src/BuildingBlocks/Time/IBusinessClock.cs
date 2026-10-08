namespace ContractorERP.BuildingBlocks.Time;

/// <summary>
/// The only owner of "what day/year is it for the business". All business dates use Asia/Riyadh,
/// never the server machine clock (lesson YEAR-001 from the prototype: two clocks disagreed at year boundaries).
/// </summary>
public interface IBusinessClock
{
    DateTimeOffset UtcNow { get; }

    DateOnly Today { get; }

    int CurrentYear => Today.Year;
}

public sealed class RiyadhBusinessClock(TimeProvider timeProvider) : IBusinessClock
{
    private static readonly TimeZoneInfo Riyadh = TimeZoneInfo.FindSystemTimeZoneById("Asia/Riyadh");

    public DateTimeOffset UtcNow => timeProvider.GetUtcNow();

    public DateOnly Today => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(UtcNow, Riyadh).DateTime);
}
