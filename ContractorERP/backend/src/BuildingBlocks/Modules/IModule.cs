using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ContractorERP.BuildingBlocks.Modules;

/// <summary>
/// Every business module (Organization, WorkOrders, later Municipality, Execution, ...) plugs into the Host
/// through this contract only. Adding a module = one new project + one line in the Host module list.
/// </summary>
public interface IModule
{
    string Name { get; }

    void Register(IServiceCollection services, IConfiguration configuration);

    void MapEndpoints(IEndpointRouteBuilder endpoints);
}
