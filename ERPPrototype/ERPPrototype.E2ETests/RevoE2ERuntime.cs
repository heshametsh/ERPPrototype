using Microsoft.Playwright;

namespace ERPPrototype.E2ETests;

/// <summary>
/// Test-only bridge to the exact Revo Gate module already loaded by the page.
/// It never changes ERP state; it only prevents diagnostics from importing a
/// stale cache-buster URL that differs from the employee's running page.
/// </summary>
internal static class RevoE2ERuntime
{
    private const string GateModuleResource = "/js/revoGridGate5B1.js";

    public static async Task BindLoadedGateModuleAsync(IPage page)
    {
        await page.WaitForFunctionAsync(
            """
            resource => performance
                .getEntriesByType('resource')
                .some(entry =>
                    String(entry?.name ?? '').includes(resource))
            """,
            GateModuleResource,
            new PageWaitForFunctionOptions
            {
                Timeout = 15_000
            });

        var moduleUrl = await page.EvaluateAsync<string>(
            """
            resource => [...performance.getEntriesByType('resource')]
                .map(entry => String(entry?.name ?? ''))
                .reverse()
                .find(name => name.includes(resource)) ?? ''
            """,
            GateModuleResource);

        E2ETestAssert.True(
            !string.IsNullOrWhiteSpace(moduleUrl),
            "Could not resolve the Revo Gate module actually loaded by the employee page.");

        await page.EvaluateAsync(
            """
            moduleUrl => {
                window.__erpE2EGateModuleUrl = moduleUrl;
            }
            """,
            moduleUrl);

        Console.WriteLine($"[e2e-runtime] Loaded Gate module: {moduleUrl}");
    }
}
