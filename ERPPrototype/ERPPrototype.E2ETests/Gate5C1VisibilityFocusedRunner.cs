using System.Globalization;
using System.IO.Compression;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Microsoft.Playwright;
using static ERPPrototype.E2ETests.RevoCanonicalTestSurface;

namespace ERPPrototype.E2ETests;

internal static class Gate5C1VisibilityFocusedRunner
{
    private const string TargetProp = "workOrderValue";
    private const string TargetName = "Work Order Value";
    private const string AnchorProp = "basket";

    public static async Task<int> RunAsync()
    {
        var projectRoot = FindProjectRoot();
        var artifactDirectory = E2EArtifactManager.CreateRunDirectory(projectRoot);
        Exception? failure = null;

        Console.WriteLine("Gate 5C-1 focused Hide/Unhide browser + SQL suite");
        Console.WriteLine($"Artifacts: {artifactDirectory}");
        try
        {
            await using var database = await E2ETestDatabase.CreateAsync(
                keepDatabase: false,
                rowsPerYear: E2ETestDatabase.DefaultRowsPerYear);

            await using var application = await WebApplicationProcess.StartAsync(
                projectRoot,
                database.ConnectionString,
                artifactDirectory,
                configuration: "Debug");

            await using var browser = await E2EBrowserSession.CreateAsync(
                application.BaseUri,
                artifactDirectory,
                headed: true,
                traceEnabled: true,
                benchmarkMode: false,
                viewportWidth: 1800,
                viewportHeight: 1000,
                windowWidth: 1900,
                windowHeight: 1050,
                screenWidth: 1920,
                screenHeight: 1080);

            var page = browser.Page;
            try
            {
                var loginPage = new LoginPage(page, application.BaseUri);
                await loginPage.OpenAsync(GatePath);
                await loginPage.LoginAsync(database.Seed);
                await page.WaitForURLAsync(
                    $"**{GatePath}*",
                    new PageWaitForURLOptions { Timeout = 45_000 });
                await Grid(page).WaitForAsync(new LocatorWaitForOptions
                {
                    State = WaitForSelectorState.Visible,
                    Timeout = 45_000
                });
                await WaitForAnyRenderedDataCellAsync(page);
                await WaitForAggregatesAsync(page);

                var modulePath = await AssertRuntimeFreshAsync(page, projectRoot);
                Console.WriteLine("[H00-runtime] PASS — current Gate/Visibility modules loaded");

                var baseline = await CaptureStateAsync(page, modulePath);
                E2ETestAssert.True(!baseline.Hidden && !baseline.Dirty,
                    "Visibility suite did not start from a visible Clean baseline.");
                E2ETestAssert.True(await IsPropVisibleAsync(page, TargetProp),
                    "Target column is not visibly projected at baseline.");
                E2ETestAssert.True(await HasAggregateAsync(page, TargetProp),
                    "Target Money aggregate is missing at baseline.");
                await HideColumnAsync(page, TargetProp);
                await WaitForHiddenAsync(page, modulePath, hidden: true);
                var hidden = await CaptureStateAsync(page, modulePath);
                E2ETestAssert.True(hidden.Dirty,
                    "Hide did not make the sheet Dirty.");
                E2ETestAssert.Equal(
                    baseline.UndoCount + 1,
                    hidden.UndoCount,
                    "Hide did not create exactly one History action.");
                E2ETestAssert.True(!await IsPropVisibleAsync(page, TargetProp),
                    "Hidden column is still in Revo's visible projection.");
                E2ETestAssert.True(!await HasAggregateAsync(page, TargetProp),
                    "Hidden Money column still appears in visible aggregates.");
                Console.WriteLine("[H01-hide] PASS — real menu Hide updates visibility, Dirty, History, and aggregates");

                await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
                await WaitForHiddenAsync(page, modulePath, hidden: false);
                var undone = await CaptureStateAsync(page, modulePath);
                E2ETestAssert.True(!undone.Dirty,
                    "Undo of the only Hide action did not restore Clean.");
                E2ETestAssert.True(await IsPropVisibleAsync(page, TargetProp),
                    "Undo did not restore the visible column.");
                E2ETestAssert.True(await HasAggregateAsync(page, TargetProp),
                    "Undo did not restore the visible Money aggregate.");
                await page.Locator("#revogrid-gate5b1-redo").ClickAsync();
                await WaitForHiddenAsync(page, modulePath, hidden: true);
                var redone = await CaptureStateAsync(page, modulePath);
                E2ETestAssert.True(redone.Dirty,
                    "Redo did not restore Dirty Hide state.");
                E2ETestAssert.True(!await HasAggregateAsync(page, TargetProp),
                    "Redo did not hide the Money aggregate again.");
                Console.WriteLine("[H02-history] PASS — Undo/Redo restores the semantic visibility state atomically");

                await SaveButton(page).ClickAsync();
                await WaitForCleanSaveAsync(page);
                var storedHidden = await GetDbVisibilityAsync(
                    database.ConnectionString,
                    database.Seed.CurrentYear,
                    TargetProp);
                E2ETestAssert.True(storedHidden is { IsHidden: true, Id: > 0 },
                    "Save did not persist the hidden column in SQL.");
                E2ETestAssert.True(storedHidden!.RowVersion.Length > 0,
                    "Saved visibility did not receive a RowVersion.");
                Console.WriteLine("[H03-save] PASS — Hide persists to SQL and returns Clean");

                await ReloadGateAsync(page);
                modulePath = await AssertRuntimeFreshAsync(page, projectRoot);
                await WaitForHiddenAsync(page, modulePath, hidden: true);
                E2ETestAssert.True(!(await CaptureStateAsync(page, modulePath)).Dirty,
                    "Reloaded saved Hide did not start Clean.");
                E2ETestAssert.True(!await HasAggregateAsync(page, TargetProp),
                    "Saved hidden Money aggregate returned after reload.");
                await SwitchYearAsync(page, database.Seed.PreviousYear);
                modulePath = await ResolveActiveModulePathAsync(page);
                await WaitForHiddenAsync(page, modulePath, hidden: false);
                E2ETestAssert.True(await IsPropVisibleAsync(page, TargetProp),
                    "Current-year Hide leaked into the previous Work Year.");
                E2ETestAssert.True(await HasAggregateAsync(page, TargetProp),
                    "Previous Work Year lost the visible Money aggregate.");
                E2ETestAssert.True(
                    await GetDbVisibilityAsync(
                        database.ConnectionString,
                        database.Seed.PreviousYear,
                        TargetProp) is null,
                    "Current-year Hide persisted into the previous Work Year.");

                await SwitchYearAsync(page, database.Seed.CurrentYear);
                modulePath = await ResolveActiveModulePathAsync(page);
                await WaitForHiddenAsync(page, modulePath, hidden: true);
                E2ETestAssert.True(!await HasAggregateAsync(page, TargetProp),
                    "Returning to the owning Work Year did not restore its Hide state.");
                Console.WriteLine("[H04-year] PASS — visibility is isolated by Work Year");

                await UnhideColumnAsync(page, TargetName);
                await WaitForHiddenAsync(page, modulePath, hidden: false);
                var unhidden = await CaptureStateAsync(page, modulePath);
                E2ETestAssert.True(unhidden.Dirty,
                    "Unhide did not make the sheet Dirty.");
                E2ETestAssert.True(await IsPropVisibleAsync(page, TargetProp),
                    "Unhide did not restore the visible column.");
                E2ETestAssert.True(await HasAggregateAsync(page, TargetProp),
                    "Unhide did not restore the visible Money aggregate.");

                await SaveButton(page).ClickAsync();
                await WaitForCleanSaveAsync(page);
                var storedVisible = await GetDbVisibilityAsync(
                    database.ConnectionString,
                    database.Seed.CurrentYear,
                    TargetProp);
                E2ETestAssert.True(storedVisible is { IsHidden: false, Id: > 0 },
                    "Save did not persist the unhidden column state.");

                await ReloadGateAsync(page);
                modulePath = await AssertRuntimeFreshAsync(page, projectRoot);
                await WaitForHiddenAsync(page, modulePath, hidden: false);
                E2ETestAssert.True(await IsPropVisibleAsync(page, TargetProp),
                    "Saved Unhide did not survive reload.");
                E2ETestAssert.True(await HasAggregateAsync(page, TargetProp),
                    "Saved Unhide did not restore aggregate after reload.");
                Console.WriteLine("[H05-unhide] PASS — Unhide persists, reloads, and restores aggregates");

                browser.Diagnostics.AssertNoCriticalErrors();
                await browser.CaptureSuccessAsync(
                    "gate5c1-visibility-focused",
                    preserveTrace: true);
            }
            catch (Exception exception)
            {
                failure = exception;
                Console.Error.WriteLine("[VISIBILITY-FOCUSED-FAILURE]");
                Console.Error.WriteLine(exception);
                await browser.CaptureFailureAsync("gate5c1-visibility-focused");
            }
        }
        catch (Exception exception)
        {
            failure ??= exception;
            Console.Error.WriteLine("[VISIBILITY-FOCUSED-STARTUP-FAILURE]");
            Console.Error.WriteLine(exception);
        }

        var bundle = CreateBundle(artifactDirectory);
        Console.WriteLine();
        Console.WriteLine(failure is null
            ? "Gate 5C-1 focused Visibility suite PASS."
            : "Gate 5C-1 focused Visibility suite FAILED.");
        Console.WriteLine("READY TO UPLOAD:");
        Console.WriteLine(bundle);
        return failure is null ? 0 : 1;
    }

    private static async Task HideColumnAsync(IPage page, string prop)
    {
        var column = await GetVisibleColumnIndexAsync(page, prop);
        E2ETestAssert.True(column >= 0,
            $"Could not resolve visible column '{prop}' before Hide.");
        await OpenStructureMenuAsync(page, 0, column);
        var button = page.Locator(".erp-revo-structure-menu:not([hidden])")
            .GetByRole(AriaRole.Button, new() { Name = "Hide Column", Exact = true });
        E2ETestAssert.True(!await button.IsDisabledAsync(),
            "Hide Column was unexpectedly disabled for a normal visible column.");
        await button.ClickAsync();
    }

    private static async Task UnhideColumnAsync(IPage page, string columnName)
    {
        var anchor = await GetVisibleColumnIndexAsync(page, AnchorProp);
        E2ETestAssert.True(anchor >= 0,
            "Could not resolve a visible anchor column for Unhide.");
        await OpenStructureMenuAsync(page, 0, anchor);
        var menu = page.Locator(".erp-revo-structure-menu:not([hidden])");
        await menu.Locator("button")
            .Filter(new LocatorFilterOptions { HasTextString = "Unhide Column >" })
            .ClickAsync();
        var item = menu.Locator(".erp-revo-structure-menu__unhide-list:not([hidden]) button")
            .Filter(new LocatorFilterOptions { HasTextString = columnName });
        await item.ClickAsync();
    }
    private static async Task OpenStructureMenuAsync(IPage page, int row, int column)
    {
        await ScrollToRowAsync(page, row);
        await ScrollToColumnAsync(page, column);
        await DataCell(page, row, column).First.WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 30_000
        });
        await DataCell(page, row, column).ClickAsync(
            new LocatorClickOptions { Button = MouseButton.Right });
        await page.Locator(".erp-revo-structure-menu:not([hidden])")
            .WaitForAsync(new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = 10_000
            });
    }

    private static async Task<int> GetVisibleColumnIndexAsync(IPage page, string prop) =>
        await page.EvaluateAsync<int>(
            """
            async prop => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const providers = await grid.getProviders();
                const raw = providers.column.getRawColumns();
                const source = Array.isArray(raw?.rgCol) ? raw.rgCol : [];
                const items = providers.column.stores?.rgCol?.store?.get?.('items');
                const visible = items
                    ? Array.from(items).map(index => source[Number(index)]).filter(Boolean)
                    : source;
                const logical = visible.findIndex(column => String(column?.prop ?? '') === prop);
                if (logical < 0) return -1;
                return grid.rtl ? visible.length - 1 - logical : logical;
            }
            """,
            prop);

    private static async Task<bool> IsPropVisibleAsync(IPage page, string prop) =>
        await page.EvaluateAsync<bool>(
            """
            async prop => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const providers = await grid.getProviders();
                const raw = providers.column.getRawColumns();
                const source = Array.isArray(raw?.rgCol) ? raw.rgCol : [];
                const items = providers.column.stores?.rgCol?.store?.get?.('items');
                const visible = items
                    ? Array.from(items).map(index => source[Number(index)]).filter(Boolean)
                    : source;
                return visible.some(column => String(column?.prop ?? '') === prop);
            }
            """,
            prop);
    private static async Task<VisibilityState> CaptureStateAsync(
        IPage page,
        string modulePath)
    {
        var json = await page.EvaluateAsync<string>(
            """
            async args => JSON.stringify((await import(args.modulePath)).getChangeState(args.gridId))
            """,
            new { modulePath, gridId = GridHostId });
        var root = JsonDocument.Parse(json).RootElement;
        var hiddenProps = root.GetProperty("hiddenProps")
            .EnumerateArray()
            .Select(item => item.GetString() ?? string.Empty)
            .ToHashSet(StringComparer.Ordinal);
        return new VisibilityState(
            ParseCounter(await page.Locator("#revogrid-gate5b1-undo-count").TextContentAsync()),
            ParseCounter(await page.Locator("#revogrid-gate5b1-redo-count").TextContentAsync()),
            root.GetProperty("dirty").GetBoolean(),
            hiddenProps.Contains(TargetProp));
    }

    private static async Task WaitForHiddenAsync(
        IPage page,
        string modulePath,
        bool hidden)
    {
        await page.WaitForFunctionAsync(
            """
            async args => {
                const state = (await import(args.modulePath)).getChangeState(args.gridId);
                const props = Array.isArray(state?.hiddenProps) ? state.hiddenProps : [];
                return props.includes(args.prop) === args.hidden;
            }
            """,
            new { modulePath, gridId = GridHostId, prop = TargetProp, hidden },
            new PageWaitForFunctionOptions { Timeout = 10_000 });
    }

    private static async Task<bool> HasAggregateAsync(IPage page, string prop)
    {
        await WaitForAggregatesAsync(page);
        return await page.Locator(
            $"#revogrid-gate5c1-visible-aggregates [data-aggregate-field=\"{prop}\"]")
            .CountAsync() > 0;
    }

    private static async Task WaitForAggregatesAsync(IPage page) =>
        await page.WaitForFunctionAsync(
            """
            () => document.querySelector('#revogrid-gate5c1-visible-aggregates')
                ?.dataset?.aggregateReady === 'true'
            """,
            null,
            new PageWaitForFunctionOptions { Timeout = 30_000 });
    private static async Task WaitForCleanSaveAsync(IPage page)
    {
        await page.Locator(".native-gate5a__operation-message")
            .Filter(new LocatorFilterOptions { HasTextString = "تم الحفظ في قاعدة البيانات" })
            .WaitForAsync(new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = 30_000
            });
        await page.WaitForFunctionAsync(
            "() => document.querySelector('#revogrid-gate5b1-change-status')?.textContent?.trim() === 'Clean'",
            null,
            new PageWaitForFunctionOptions { Timeout = 30_000 });
    }

    private static async Task SwitchYearAsync(IPage page, int year)
    {
        var selector = page.GetByTestId("gate5a-year-selector");
        var value = year.ToString(CultureInfo.InvariantCulture);
        if (!StringComparer.Ordinal.Equals(await selector.InputValueAsync(), value))
        {
            await selector.SelectOptionAsync(value);
        }
        await WaitForYearAsync(page, year);
    }

    private static async Task WaitForYearAsync(IPage page, int year)
    {
        await page.WaitForFunctionAsync(
            """
            expected => {
                const selector = document.querySelector('[data-testid="gate5a-year-selector"]');
                const loading = document.querySelector('.native-gate5a__loading');
                const status = document.querySelector('.native-gate5a__statusbar')?.textContent ?? '';
                return selector?.value === String(expected) &&
                    selector.disabled === false && !loading && status.includes(`Dataset ${expected}`);
            }
            """,
            year,
            new PageWaitForFunctionOptions { Timeout = 30_000 });
        await WaitForAnyRenderedDataCellAsync(page);
        await WaitForAggregatesAsync(page);
    }

    private static async Task ReloadGateAsync(IPage page)
    {
        await page.ReloadAsync(new PageReloadOptions { WaitUntil = WaitUntilState.DOMContentLoaded });
        await Grid(page).WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 45_000
        });
        await WaitForAnyRenderedDataCellAsync(page);
        await WaitForAggregatesAsync(page);
    }

    private static async Task<string> AssertRuntimeFreshAsync(IPage page, string projectRoot)
    {
        var razor = await File.ReadAllTextAsync(Path.Combine(
            projectRoot,
            "Components",
            "Pages",
            "WorkOrdersRevoGridNativeGate5A.razor.cs"));
        var gateSource = await File.ReadAllTextAsync(Path.Combine(
            projectRoot,
            "wwwroot",
            "js",
            "revoGridGate5B1.js"));
        var gateToken = ExtractToken(
            razor,
            @"revoGridGate5B1\.js\?v=([^""']+)",
            "Gate module token");
        var visibilityToken = ExtractToken(
            gateSource,
            @"revoGridColumnVisibility\.js\?v=([^""']+)",
            "Visibility module token");

        var gateUrl = await ResolveActiveModulePathAsync(page);
        E2ETestAssert.True(gateUrl.Contains($"v={gateToken}", StringComparison.Ordinal),
            "Browser loaded a stale Gate module token.");
        var visibilityUrls = await page.EvaluateAsync<string[]>(
            """
            () => [...new Set(
                performance.getEntriesByType('resource')
                    .map(entry => String(entry?.name ?? ''))
                    .filter(name => name.includes('/js/revoGridColumnVisibility.js'))
            )]
            """);
        E2ETestAssert.Equal(1, visibilityUrls.Length,
            $"Expected one loaded Visibility module URL, found {visibilityUrls.Length}.");
        E2ETestAssert.True(
            visibilityUrls[0].Contains($"v={visibilityToken}", StringComparison.Ordinal),
            "Browser loaded a stale Visibility module token.");
        return gateUrl;
    }

    private static async Task<string> ResolveActiveModulePathAsync(IPage page)
    {
        var urls = await page.EvaluateAsync<string[]>(
            """
            () => [...new Set(
                performance.getEntriesByType('resource')
                    .map(entry => String(entry?.name ?? ''))
                    .filter(name => /\/js\/revoGridGate5B1\.js(?:\?|$)/.test(name))
            )]
            """);
        E2ETestAssert.Equal(1, urls.Length,
            $"Expected exactly one active Gate module URL, found {urls.Length}.");
        return urls[0];
    }

    private static string ExtractToken(string source, string pattern, string label)
    {
        var match = Regex.Match(source, pattern, RegexOptions.CultureInvariant);
        if (!match.Success || string.IsNullOrWhiteSpace(match.Groups[1].Value))
        {
            throw new InvalidOperationException($"Could not extract {label} from current source.");
        }
        return match.Groups[1].Value;
    }

    private static async Task ScrollToRowAsync(IPage page, int row)
    {
        if (await RenderedRowCell(page, row).IsVisibleAsync())
        {
            return;
        }
        await page.EvaluateAsync(
            "async row => document.querySelector('#revogrid-native-gate5a-grid revo-grid').scrollToRow(row)",
            row);
        await RenderedRowCell(page, row).WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });
    }
    private static async Task ScrollToColumnAsync(IPage page, int column)
    {
        if (await RenderedColumnCell(page, column).IsVisibleAsync())
        {
            return;
        }
        await page.EvaluateAsync(
            "async column => document.querySelector('#revogrid-native-gate5a-grid revo-grid').scrollToColumnIndex(column)",
            column);
        await RenderedColumnCell(page, column).WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });
    }

    private static async Task WaitForAnyRenderedDataCellAsync(IPage page) =>
        await page.Locator(
                $"#{GridHostId} revogr-viewport-scroll.rgCol:not([row-header]) [data-rgRow][data-rgCol]")
            .First.WaitForAsync(new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = 30_000
            });

    private static int ParseCounter(string? text) =>
        int.Parse((text ?? "0").Trim(), CultureInfo.InvariantCulture);
    private static async Task<DbVisibility?> GetDbVisibilityAsync(
        string connectionString,
        int workYear,
        string fieldKey)
    {
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT TOP (1) [Id], [IsHidden], [RowVersion]
            FROM [DepartmentColumnVisibilities]
            WHERE [WorkYear] = @WorkYear
              AND [FieldKey] = @FieldKey
              AND [DepartmentId] = (
                  SELECT TOP (1) [DepartmentId]
                  FROM [WorkOrders]
                  WHERE [WorkYear] = @WorkYear
                  ORDER BY [Id]);
            """;
        command.Parameters.AddWithValue("@WorkYear", workYear);
        command.Parameters.AddWithValue("@FieldKey", fieldKey);
        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return null;
        }
        return new DbVisibility(
            reader.GetInt32(0),
            reader.GetBoolean(1),
            (byte[])reader[2]);
    }
    private static ILocator Grid(IPage page) =>
        page.Locator($"#{GridHostId} revo-grid");

    private static ILocator SaveButton(IPage page) =>
        page.Locator("#revogrid-gate5b11-save");

    private static ILocator RenderedRowCell(IPage page, int row) =>
        page.Locator(
            $"#{GridHostId} revogr-viewport-scroll.rgCol:not([row-header]) [data-rgRow=\"{row}\"][data-rgCol]").First;

    private static ILocator RenderedColumnCell(IPage page, int column) =>
        page.Locator(
            $"#{GridHostId} revogr-viewport-scroll.rgCol:not([row-header]) [data-rgRow][data-rgCol=\"{column}\"]").First;

    private static ILocator DataCell(IPage page, int row, int column) =>
        page.Locator(
            $"#{GridHostId} revogr-viewport-scroll.rgCol:not([row-header]) [data-rgRow=\"{row}\"][data-rgCol=\"{column}\"]");

    private static string CreateBundle(string artifactDirectory)
    {
        var downloads = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            "Downloads");
        Directory.CreateDirectory(downloads);
        var path = Path.Combine(
            downloads,
            $"ERP_VISIBILITY_FOCUSED_TRACE_{DateTime.Now:yyyyMMdd-HHmmss}.zip");
        if (File.Exists(path))
        {
            File.Delete(path);
        }
        ZipFile.CreateFromDirectory(
            artifactDirectory,
            path,
            CompressionLevel.Optimal,
            includeBaseDirectory: false);
        return path;
    }

    private static string FindProjectRoot()
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
        }        throw new DirectoryNotFoundException("Could not locate ERPPrototype.csproj.");
    }

    private sealed record VisibilityState(
        int UndoCount,
        int RedoCount,
        bool Dirty,
        bool Hidden);

    private sealed record DbVisibility(
        int Id,
        bool IsHidden,
        byte[] RowVersion);
}
