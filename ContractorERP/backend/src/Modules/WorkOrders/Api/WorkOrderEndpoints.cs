using ContractorERP.BuildingBlocks.Results;
using ContractorERP.Modules.WorkOrders.Application;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace ContractorERP.Modules.WorkOrders.Api;

internal static class WorkOrderEndpoints
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/work-orders").WithTags("WorkOrders").RequireAuthorization();

        group.MapGet("/sheet", async (int? year, GetSheetHandler handler, CancellationToken ct) =>
            ToHttp(await handler.HandleAsync(year, ct)));

        group.MapPost("/sheet", async (SaveSheetRequest request, SaveSheetHandler handler, CancellationToken ct) =>
            ToHttp(await handler.HandleAsync(request, ct)));
    }

    /// <summary>Forbidden -> 403, Conflict (stale/duplicate) -> 409, Validation -> 422. The body always lists every error with its target cell.</summary>
    private static IResult ToHttp<T>(Result<T> result)
    {
        if (result.IsSuccess)
        {
            return Results.Ok(result.Value);
        }

        var status = result.Errors.Any(e => e.Kind == ErrorKind.Forbidden) ? StatusCodes.Status403Forbidden
            : result.Errors.Any(e => e.Kind == ErrorKind.Conflict) ? StatusCodes.Status409Conflict
            : StatusCodes.Status422UnprocessableEntity;

        return Results.Json(new { errors = result.Errors }, statusCode: status);
    }
}
