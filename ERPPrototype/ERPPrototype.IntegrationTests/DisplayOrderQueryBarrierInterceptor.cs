using System.Data.Common;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace ERPPrototype.IntegrationTests;

internal sealed class DisplayOrderQueryBarrierInterceptor(
    int participantCount)
    : DbCommandInterceptor
{
    private readonly TaskCompletionSource<bool> allParticipantsReached =
        new(TaskCreationOptions.RunContinuationsAsynchronously);

    private int reachedParticipants;

    public override async ValueTask<InterceptionResult<DbDataReader>>
        ReaderExecutingAsync(
            DbCommand command,
            CommandEventData eventData,
            InterceptionResult<DbDataReader> result,
            CancellationToken cancellationToken = default)
    {
        if (!IsDisplayOrderAllocationQuery(command.CommandText))
        {
            return result;
        }

        var reached = Interlocked.Increment(ref reachedParticipants);

        if (reached >= participantCount)
        {
            allParticipantsReached.TrySetResult(true);
        }

        try
        {
            await allParticipantsReached.Task.WaitAsync(
                TimeSpan.FromSeconds(30),
                cancellationToken);
        }
        catch (TimeoutException exception)
        {
            throw new InvalidOperationException(
                $"Only {reachedParticipants} of {participantCount} concurrent display-order queries reached the test barrier.",
                exception);
        }

        return result;
    }

    private static bool IsDisplayOrderAllocationQuery(string commandText) =>
        commandText.Contains("WorkOrders", StringComparison.OrdinalIgnoreCase) &&
        commandText.Contains("DisplayOrder", StringComparison.OrdinalIgnoreCase) &&
        commandText.Contains("MAX(", StringComparison.OrdinalIgnoreCase) &&
        commandText.Contains("UPDLOCK", StringComparison.OrdinalIgnoreCase) &&
        commandText.Contains("HOLDLOCK", StringComparison.OrdinalIgnoreCase);
}
