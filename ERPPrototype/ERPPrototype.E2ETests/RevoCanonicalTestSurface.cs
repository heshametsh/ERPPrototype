using Microsoft.Playwright;

namespace ERPPrototype.E2ETests;

internal static class RevoCanonicalTestSurface
{
    internal const string GatePath = "/work-orders-revogrid";
    internal const string GridHostId = "revogrid-native-gate5a-grid";

    internal static ILocator Grid(IPage page) =>
        page.Locator($"#{GridHostId} revo-grid");

    internal static ILocator SaveButton(IPage page) =>
        page.Locator("#revogrid-gate5b11-save");

    internal static ILocator RowHeader(IPage page, int row) =>
        page.Locator($"#{GridHostId} revogr-row-headers [data-rgRow=\"{row}\"]").First;

    internal static ILocator DataCell(IPage page, int row, int column) =>
        page.Locator($"#{GridHostId} revogr-viewport-scroll.rgCol:not([row-header]) [data-rgRow=\"{row}\"][data-rgCol=\"{column}\"]");

    internal static ILocator VisibleDialog(IPage page, string title) =>
        page.Locator($".erp-revo-structure-dialog:not([hidden]):has(.erp-revo-structure-dialog__title:has-text(\"{title}\"))");

    internal static async Task<int> GetSourceCountAsync(IPage page) =>
        await page.EvaluateAsync<int>(
            "async () => (await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getSource('rgRow')).length");

    internal static async Task<int> FindVisibleIndexByClientKeyAsync(IPage page, string clientKey) =>
        await page.EvaluateAsync<int>(
            "async key => (await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getVisibleSource('rgRow')).findIndex(row => String(row?.clientKey ?? '') === key)",
            clientKey);

    internal static async Task<bool> SourceContainsClientKeyAsync(IPage page, string clientKey) =>
        await page.EvaluateAsync<bool>(
            "async key => (await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getSource('rgRow')).some(row => String(row?.clientKey ?? '') === key)",
            clientKey);

    internal static async Task<bool> SourceContainsWorkOrderNumberAsync(IPage page, string workOrderNumber) =>
        await page.EvaluateAsync<bool>(
            "async value => (await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getSource('rgRow')).some(row => String(row?.workOrderNumber ?? '') === value)",
            workOrderNumber);

    internal static string FindProjectRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            var project = Path.Combine(directory.FullName, "ERPPrototype.csproj");
            if (File.Exists(project))
            {
                return directory.FullName;
            }
            directory = directory.Parent;
        }
        throw new DirectoryNotFoundException("Could not locate ERPPrototype.csproj.");
    }
}
