using Microsoft.Playwright;
using static ERPPrototype.E2ETests.RevoCanonicalTestSurface;

namespace ERPPrototype.E2ETests;

internal static class EmptySheetLifecycleRunner
{
    private const int FixedPort = 5265;

    public static async Task<int> RunAsync()
    {
        var projectRoot = FindProjectRoot();
        var artifactDirectory = E2EArtifactManager.CreateRunDirectory(projectRoot);
        Exception? failure = null;

        Console.WriteLine("Canonical Revo Empty Sheet lifecycle");
        Console.WriteLine("Delete all -> Empty State -> Undo/Redo -> Add first rows.");
        Console.WriteLine($"Artifacts: {artifactDirectory}");
        Console.WriteLine();

        try
        {
            await using var database = await E2ETestDatabase.CreateAsync(
                keepDatabase: false,
                rowsPerYear: E2ETestDatabase.DefaultRowsPerYear);
            await using var application = await WebApplicationProcess.StartAsync(
                projectRoot,
                database.ConnectionString,
                artifactDirectory,
                fixedPort: FixedPort,
                configuration: "Debug");
            await using var browser = await E2EBrowserSession.CreateAsync(
                application.BaseUri,
                artifactDirectory,
                headed: true,
                traceEnabled: true,
                benchmarkMode: false,
                viewportWidth: 1440,
                viewportHeight: 1000,
                windowWidth: 1500,
                windowHeight: 1050,
                screenWidth: 1920,
                screenHeight: 1080);

            var page = browser.Page;
            try
            {
                var loginPage = new LoginPage(page, application.BaseUri);
                await loginPage.OpenAsync(GatePath);
                await loginPage.LoginAsync(database.Seed);
                await Grid(page).WaitForAsync(new LocatorWaitForOptions
                {
                    State = WaitForSelectorState.Visible,
                    Timeout = 45_000
                });
                var actualPath = new Uri(page.Url).AbsolutePath;
                E2ETestAssert.True(
                    string.Equals(actualPath, GatePath, StringComparison.Ordinal),
                    $"Empty Sheet test reached '{actualPath}' instead of '{GatePath}'.");

                var baselineCount = database.Seed.RowsPerYear;
                await WaitForSourceCountAsync(page, baselineCount);
                Console.WriteLine($"[01-open] PASS - canonical sheet starts with {baselineCount:N0} real rows");

                await RowHeader(page, 0).ClickAsync();
                await ScrollToRowAsync(page, baselineCount - 1);
                await WithKeyAsync(
                    page,
                    "Shift",
                    () => RowHeader(page, baselineCount - 1).ClickAsync());
                await DataCell(page, baselineCount - 1, 0).ClickAsync(
                    new LocatorClickOptions { Button = MouseButton.Right });
                await page.Locator(".erp-revo-structure-menu:not([hidden])").WaitForAsync(
                    new LocatorWaitForOptions
                    {
                        State = WaitForSelectorState.Visible,
                        Timeout = 10_000
                    });
                await ClickStructureMenuAsync(page, "Delete Rows...");
                var deleteDialog = VisibleDialog(page);
                var selectionScope = deleteDialog.Locator(
                    "input[type=\"radio\"][value=\"selection\"]");
                E2ETestAssert.True(
                    await selectionScope.IsEnabledAsync(),
                    "Delete Rows did not keep the real full-sheet employee Selection.");
                await selectionScope.CheckAsync();
                await deleteDialog.Locator("button:has-text(\"Delete\")").ClickAsync();
                await WaitForSourceCountAsync(page, 0);
                var emptyState = page.GetByTestId("work-orders-empty-state");
                await emptyState.WaitForAsync(new LocatorWaitForOptions
                {
                    State = WaitForSelectorState.Visible,
                    Timeout = 10_000
                });
                Console.WriteLine("[02-delete-all] PASS - source zero shows the Empty State");

                await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
                await WaitForSourceCountAsync(page, baselineCount);
                await emptyState.WaitForAsync(new LocatorWaitForOptions
                {
                    State = WaitForSelectorState.Hidden
                });
                await page.Locator("#revogrid-gate5b1-redo").ClickAsync();
                await WaitForSourceCountAsync(page, 0);
                await emptyState.WaitForAsync(new LocatorWaitForOptions
                {
                    State = WaitForSelectorState.Visible
                });
                Console.WriteLine("[03-history] PASS - Undo/Redo moves cleanly between rows and empty");

                await page.Locator("#revogrid-empty-state-add-rows").ClickAsync();
                var insertDialog = VisibleDialog(page);
                await insertDialog.WaitForAsync(new LocatorWaitForOptions
                {
                    State = WaitForSelectorState.Visible,
                    Timeout = 10_000
                });
                var countInput = insertDialog.Locator("input[type=\"number\"]");
                E2ETestAssert.Equal(
                    "100",
                    await countInput.InputValueAsync(),
                    "Empty Sheet Add Rows no longer defaults to 100.");
                E2ETestAssert.Equal(
                    0,
                    await insertDialog.Locator(
                        "button:has-text(\"Insert Above\"), button:has-text(\"Insert Below\")")
                        .CountAsync(),
                    "Empty Sheet still exposes meaningless Above/Below actions.");

                await countInput.FillAsync("2");
                await insertDialog.Locator("button:has-text(\"إضافة\")").ClickAsync();
                await WaitForSourceCountAsync(page, 2);
                await emptyState.WaitForAsync(new LocatorWaitForOptions
                {
                    State = WaitForSelectorState.Hidden
                });
                Console.WriteLine("[04-first-rows] PASS - Add Rows creates the first rows without an anchor");

                await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
                await WaitForSourceCountAsync(page, 0);
                await emptyState.WaitForAsync(new LocatorWaitForOptions
                {
                    State = WaitForSelectorState.Visible
                });
                await page.Locator("#revogrid-gate5b1-redo").ClickAsync();
                await WaitForSourceCountAsync(page, 2);
                await emptyState.WaitForAsync(new LocatorWaitForOptions
                {
                    State = WaitForSelectorState.Hidden
                });
                Console.WriteLine("[05-first-rows-history] PASS - first-row Add participates in Undo/Redo");

                browser.Diagnostics.AssertNoCriticalErrors();
                await browser.CaptureSuccessAsync(
                    "canonical-empty-sheet-lifecycle",
                    preserveTrace: true);
            }
            catch (Exception exception)
            {
                failure = exception;
                await browser.CaptureFailureAsync("canonical-empty-sheet-lifecycle");
            }
        }
        catch (Exception exception)
        {
            failure ??= exception;
        }

        if (failure is null)
        {
            Console.WriteLine();
            Console.WriteLine("CANONICAL EMPTY SHEET LIFECYCLE: PASS");
            return 0;
        }
        Console.Error.WriteLine();
        Console.Error.WriteLine("CANONICAL EMPTY SHEET LIFECYCLE: FAILED");
        Console.Error.WriteLine(failure);
        return 1;
    }

    private static ILocator Grid(IPage page) =>
        page.Locator($"#{GridHostId} revo-grid");

    private static ILocator RowHeader(IPage page, int row) =>
        page.Locator(
            $"#{GridHostId} revogr-row-headers [data-rgRow=\"{row}\"]")
            .First;

    private static ILocator DataCell(IPage page, int row, int column) =>
        page.Locator(
            $"#{GridHostId} revogr-viewport-scroll.rgCol:not([row-header]) " +
            $"[data-rgRow=\"{row}\"][data-rgCol=\"{column}\"]");

    private static ILocator VisibleDialog(IPage page) =>
        page.Locator(".erp-revo-structure-dialog:not([hidden])");

    private static async Task ClickStructureMenuAsync(IPage page, string text) =>
        await page.Locator(".erp-revo-structure-menu:not([hidden])")
            .Locator($"button:has-text(\"{text}\")")
            .ClickAsync();
    private static async Task WaitForSourceCountAsync(IPage page, int expected) =>
        await page.WaitForFunctionAsync(
            """
            async expected =>
                (await document.querySelector('#revogrid-native-gate5a-grid revo-grid')
                    .getSource('rgRow')).length === expected
            """,
            expected,
            new PageWaitForFunctionOptions { Timeout = 15_000 });

    private static async Task WithKeyAsync(
        IPage page,
        string key,
        Func<Task> action)
    {
        await page.Keyboard.DownAsync(key);
        try
        {
            await action();
        }
        finally
        {
            await page.Keyboard.UpAsync(key);
        }
    }

    private static async Task ScrollToRowAsync(IPage page, int row)
    {
        if (await DataCell(page, row, 0).IsVisibleAsync())
        {
            return;
        }

        var viewport = page.Locator(
            $"#{GridHostId} revogr-viewport-scroll.rgCol:not([row-header])").First;
        var bounds = await viewport.BoundingBoxAsync();
        E2ETestAssert.True(bounds is not null, "Could not locate the Revo viewport.");
        await page.Mouse.MoveAsync(
            (float)(bounds!.X + bounds.Width / 2),
            (float)(bounds.Y + bounds.Height / 2));

        for (var attempt = 0; attempt < 80; attempt++)
        {
            if (await DataCell(page, row, 0).IsVisibleAsync())
            {
                return;
            }

            var renderedRows = await page.EvaluateAsync<int[]>(
                """
                () => [...document.querySelectorAll('#revogrid-native-gate5a-grid revogr-viewport-scroll.rgCol:not([row-header]) [data-rgRow][data-rgCol="0"]')]
                    .map(element => Number(element.getAttribute('data-rgRow')))
                    .filter(Number.isFinite)
                """);
            E2ETestAssert.True(renderedRows.Length > 0, "Revo rendered no rows while scrolling.");
            var minimum = renderedRows.Min();
            var maximum = renderedRows.Max();
            var direction = row > maximum ? 1 : row < minimum ? -1 : 0;
            if (direction == 0)
            {
                await WaitForRenderedCellAsync(page, row, 0);
                return;
            }

            var edge = direction > 0 ? maximum : minimum;
            var distance = Math.Abs(row - edge);
            await page.Mouse.WheelAsync(
                0,
                direction * Math.Clamp(distance * 42, 360, 3200));
            await page.WaitForTimeoutAsync(35);
        }

        throw new InvalidOperationException($"Scrolling did not render row {row}.");
    }

    private static async Task WaitForRenderedCellAsync(
        IPage page,
        int row,
        int column) =>
        await DataCell(page, row, column).First.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = 30_000
            });
    private static string FindProjectRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            var candidate = Path.Combine(directory.FullName, "ERPPrototype.csproj");
            if (File.Exists(candidate))
            {
                return directory.FullName;
            }

            directory = directory.Parent;
        }

        throw new DirectoryNotFoundException("ERPPrototype.csproj was not found.");
    }
}
