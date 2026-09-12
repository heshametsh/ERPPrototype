using System.Diagnostics;
using System.Globalization;
using System.IO.Compression;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Microsoft.Playwright;

namespace ERPPrototype.E2ETests;

internal static class Gate5C1RenameFocusedRunner
{
    private const string GatePath = "/work-orders-revogrid-gate5c1";
    private const string GridHostId = "revogrid-native-gate5a-grid";
    private const string TargetFieldKey = "custom_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    private const string SiblingFieldKey = "custom_cccccccccccccccccccccccccccccccc";
    private const string TargetName = "Rename Break Target";
    private const string SiblingName = "Rename Break Sibling";
    private const string StableValue = "rename-stable-value";

    public static async Task<int> RunAsync()
    {
        var projectRoot = FindProjectRoot();
        var artifactDirectory = E2EArtifactManager.CreateRunDirectory(projectRoot);
        Exception? failure = null;

        Console.WriteLine("Gate 5C-1 focused Custom Column Rename real SQL + Playwright break suite");
        Console.WriteLine("Starts directly from a seeded persisted Custom Column; it does not replay the broad B12 setup journey first.");
        Console.WriteLine($"Artifacts: {artifactDirectory}");
        Console.WriteLine();

        try
        {
            await using var database = await E2ETestDatabase.CreateAsync(
                keepDatabase: false,
                rowsPerYear: E2ETestDatabase.DefaultRowsPerYear);

            var fixture = await PrepareFixtureAsync(database);
            Console.WriteLine("[R00-db-fixture] PASS — persisted target/sibling Custom Columns and stable row value seeded");

            await using var application = await FocusedWebApplicationProcess.StartAsync(
                projectRoot,
                database.ConnectionString,
                artifactDirectory,
                configuration: "Debug");
            Console.WriteLine($"[R01-app] PASS — isolated application started at {application.BaseUri}");

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
                Console.WriteLine("[R02-login-surface] PASS — Gate 5C-1 loaded with rendered Revo data");

                var gateModulePath = await AssertRuntimeFreshAsync(page, projectRoot);
                Console.WriteLine("[R03-runtime-fresh] PASS — browser loaded the Gate/Rename module tokens declared by current source");

                await AssertSeededFixtureVisibleAsync(page, fixture);
                Console.WriteLine("[R04-fixture-visible] PASS — persisted target/sibling columns and stable custom value loaded");

                await AssertDoubleClickIntentAsync(page, fixture.TargetFieldKey);
                Console.WriteLine("[R05-double-click-intent] PASS — single-click selects; double-click Rename clears whole-column selection/text selection and renders one focused non-overlapping editor");

                await AssertEscapeAsync(page, fixture.TargetFieldKey, TargetName, gateModulePath);
                Console.WriteLine("[R06-escape] PASS — Escape closes without name, Dirty, or History mutation");

                await AssertNoOpAsync(page, fixture.TargetFieldKey, TargetName, gateModulePath);
                Console.WriteLine("[R07-no-op] PASS — unchanged Enter closes with no Dirty/History mutation");

                await AssertValidationAsync(page, fixture.TargetFieldKey, TargetName, SiblingName, gateModulePath);
                Console.WriteLine("[R08-validation] PASS — blank/core-duplicate/custom-duplicate are rejected safely and can recover to no-op");

                await AssertControlIsolationAsync(page, fixture.TargetFieldKey);
                Console.WriteLine("[R09-controls] PASS — Filter/Sort/core-header double-clicks do not enter Rename");

                const string rapidName = "Rename Break Rapid";
                await AssertRapidEnterUndoRedoAsync(page, fixture.TargetFieldKey, TargetName, rapidName, gateModulePath);
                Console.WriteLine("[R10-rapid-enter-history] PASS — double Enter produces one atomic Rename; Undo/Redo repaint visible header and never resurrect editor");

                const string outsideName = "Rename Break Outside";
                await AssertOutsideClickAsync(page, fixture.TargetFieldKey, rapidName, outsideName, gateModulePath);
                Console.WriteLine("[R11-outside-click] PASS — valid outside click commits exactly once; invalid outside click stays editable without History");

                await AssertSaveReloadAndYearIsolationAsync(
                    page,
                    database,
                    fixture,
                    outsideName,
                    gateModulePath);
                Console.WriteLine("[R12-save-reload-year] PASS — Save persists name only, preserves identity/type/order/value, advances definition RowVersion, survives reload, and remains Work-Year isolated");

                await AssertRenameConcurrencyRejectAsync(
                    page,
                    database,
                    fixture,
                    outsideName,
                    gateModulePath);
                Console.WriteLine("[R13-concurrency] PASS — stale Rename Save is rejected, stays Dirty, and reload restores authoritative clean definition");

                browser.Diagnostics.AssertNoCriticalErrors();
                await browser.CaptureSuccessAsync(
                    "gate5c1-rename-focused-break-suite",
                    preserveTrace: true);
            }
            catch (Exception exception)
            {
                failure = exception;
                Console.Error.WriteLine("[RENAME-FOCUSED-FAILURE]");
                Console.Error.WriteLine(exception);
                await browser.CaptureFailureAsync("gate5c1-rename-focused-break-suite");
            }
        }
        catch (Exception exception)
        {
            failure ??= exception;
            Console.Error.WriteLine("[RENAME-FOCUSED-STARTUP-FAILURE]");
            Console.Error.WriteLine(exception);
        }

        var bundle = CreateBundle(artifactDirectory);
        Console.WriteLine();
        Console.WriteLine(failure is null
            ? "Gate 5C-1 focused Rename break suite PASS."
            : "Gate 5C-1 focused Rename break suite FAILED.");
        Console.WriteLine("READY TO UPLOAD:");
        Console.WriteLine(bundle);
        return failure is null ? 0 : 1;
    }

    private static async Task AssertSeededFixtureVisibleAsync(IPage page, RenameFixture fixture)
    {
        E2ETestAssert.True(await HasColumnNamedAsync(page, TargetName),
            "Seeded target Custom Column was not loaded.");
        E2ETestAssert.True(await HasColumnNamedAsync(page, SiblingName),
            "Seeded sibling Custom Column was not loaded.");
        E2ETestAssert.Equal(TargetFieldKey,
            await GetColumnPropByNameAsync(page, TargetName),
            "Seeded target Custom Column did not preserve its expected FieldKey.");

        await EnsureCustomColumnVisibleAsync(page, TargetFieldKey);
        var row = await GetSourceRowByIdAsync(page, fixture.RowId);
        E2ETestAssert.Equal(StableValue,
            row.GetProperty(TargetFieldKey).GetString() ?? string.Empty,
            "Seeded Custom Value was not projected into the Revo source row.");
    }

    private static async Task AssertDoubleClickIntentAsync(IPage page, string prop)
    {
        await EnsureCustomColumnVisibleAsync(page, prop);
        await ClearSemanticSelectionAsync(page);

        var name = ColumnName(page, prop);

        E2ETestAssert.True(
            await name.EvaluateAsync<bool>(
                "el => getComputedStyle(el).userSelect === 'none'"),
            "Custom header name is still browser-selectable.");

        await name.ClickAsync();
        await page.Locator(
                $"#{GridHostId} [data-erp-column-header-selected=\"true\"][data-erp-selected-column-prop=\"{prop}\"]")
            .First.WaitForAsync(new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = 10_000
            });

        // Keep the single-click contract independent from the double-click contract.
        // ClickAsync + DblClickAsync back-to-back can become a synthetic triple-click
        // and create browser text selection that a real user double-click does not.
        await ClearSemanticSelectionAsync(page);
        await page.Mouse.MoveAsync(2, 2);
        await page.WaitForTimeoutAsync(750);

        await name.DblClickAsync();
        var input = RenameInput(page, prop);
        await input.WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });

        await page.WaitForFunctionAsync(
            """
            prop => document.querySelectorAll(
                `#revogrid-native-gate5a-grid [data-erp-selected-column-prop="${prop}"]`
            ).length === 0
            """,
            prop,
            new PageWaitForFunctionOptions { Timeout = 10_000 });

        E2ETestAssert.Equal(1,
            await page.Locator("input[data-erp-column-rename-input]").CountAsync(),
            "Rename rendered more than one inline editor.");

        E2ETestAssert.True(
            await input.EvaluateAsync<bool>(
                "el => el.selectionStart === 0 && el.selectionEnd === el.value.length"),
            "Rename editor did not select its full current name inside the input.");

        E2ETestAssert.True(
            await input.EvaluateAsync<bool>("el => document.activeElement === el"),
            "Rename editor did not own keyboard focus after double-click.");

        var overlapsControl = await page.EvaluateAsync<bool>(
            """
            prop => {
                const input = document.querySelector(`input[data-erp-column-rename-input="${prop}"]`);
                const header = input?.closest('.rgHeaderCell');
                if (!input || !header) return true;
                const a = input.getBoundingClientRect();
                const controls = [...header.querySelectorAll(
                    `[data-erp-filter-prop="${prop}"], [data-erp-sort-prop="${prop}"]`
                )].filter(el => {
                    const r = el.getBoundingClientRect();
                    return r.width > 0 && r.height > 0;
                });
                return controls.some(el => {
                    const b = el.getBoundingClientRect();
                    return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
                });
            }
            """,
            prop);
        E2ETestAssert.True(!overlapsControl,
            "RTL Rename editor overlaps the visible Filter/Sort control region.");
    }

    private static async Task AssertEscapeAsync(
        IPage page,
        string prop,
        string expectedName,
        string gateModulePath)
    {
        var before = await CaptureStateAsync(page, gateModulePath);
        var input = RenameInput(page, prop);
        E2ETestAssert.True(await input.IsVisibleAsync(),
            "Escape scenario expected the editor opened by the previous double-click.");
        await input.FillAsync("temporary escape rename");
        await input.PressAsync("Escape");
        await WaitForInputDetachedAsync(input);
        await WaitForHeaderTextAsync(page, prop, expectedName);
        await AssertStateUnchangedAsync(page, gateModulePath, before, "Escape");
    }

    private static async Task AssertNoOpAsync(
        IPage page,
        string prop,
        string expectedName,
        string gateModulePath)
    {
        var before = await CaptureStateAsync(page, gateModulePath);
        await BeginRenameAsync(page, prop);
        var input = RenameInput(page, prop);
        await input.PressAsync("Enter");
        await WaitForInputDetachedAsync(input);
        await WaitForHeaderTextAsync(page, prop, expectedName);
        await AssertStateUnchangedAsync(page, gateModulePath, before, "No-op Rename");
    }

    private static async Task AssertValidationAsync(
        IPage page,
        string prop,
        string expectedName,
        string siblingName,
        string gateModulePath)
    {
        var before = await CaptureStateAsync(page, gateModulePath);
        await BeginRenameAsync(page, prop);
        var input = RenameInput(page, prop);

        await input.FillAsync("   ");
        await input.PressAsync("Enter");
        await AssertInvalidEditorAsync(input, "Blank Rename was accepted.");

        await input.FillAsync("Work Order Number");
        await input.PressAsync("Enter");
        await AssertInvalidEditorAsync(input, "Core-column duplicate Rename was accepted.");

        await input.FillAsync(siblingName);
        await input.PressAsync("Enter");
        await AssertInvalidEditorAsync(input, "Sibling Custom Column duplicate Rename was accepted.");

        await input.FillAsync(expectedName);
        await input.PressAsync("Enter");
        await WaitForInputDetachedAsync(input);
        await WaitForHeaderTextAsync(page, prop, expectedName);
        await AssertStateUnchangedAsync(page, gateModulePath, before, "Rejected-to-original Rename");
    }

    private static async Task AssertControlIsolationAsync(IPage page, string prop)
    {
        await EnsureCustomColumnVisibleAsync(page, prop);
        var filter = page.Locator($"[data-erp-filter-prop=\"{prop}\"]").First;
        E2ETestAssert.True(await filter.IsVisibleAsync(),
            "Target Custom Column does not expose its expected Filter control.");
        await filter.DblClickAsync();
        E2ETestAssert.Equal(0, await RenameInput(page, prop).CountAsync(),
            "Double-clicking Filter entered Rename.");
        if (await page.Locator(".erp-revo-excel-filter:not([hidden])").CountAsync() > 0)
        {
            await page.Keyboard.PressAsync("Escape");
        }

        await ScrollToColumnPropAsync(page, "workOrderValue");
        var sort = page.Locator("[data-erp-sort-prop=\"workOrderValue\"]").First;
        await sort.WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });
        E2ETestAssert.True(await sort.IsVisibleAsync(),
            "Work Order Value does not expose its expected Sort control.");
        await sort.DblClickAsync();
        E2ETestAssert.Equal(0,
            await page.Locator("input[data-erp-column-rename-input]").CountAsync(),
            "Double-clicking Sort entered Rename.");

        await ScrollToColumnPropAsync(page, "workOrderNumber");
        var coreHeader = page.GetByText(
            "Work Order Number",
            new PageGetByTextOptions { Exact = true }).Last;
        await coreHeader.WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });
        await coreHeader.DblClickAsync();
        E2ETestAssert.Equal(0,
            await page.Locator("input[data-erp-column-rename-input]").CountAsync(),
            "Double-clicking a core header entered Rename.");
    }

    private static async Task AssertRapidEnterUndoRedoAsync(
        IPage page,
        string prop,
        string oldName,
        string newName,
        string gateModulePath)
    {
        var before = await CaptureStateAsync(page, gateModulePath);
        await BeginRenameAsync(page, prop);
        var input = RenameInput(page, prop);
        await input.FillAsync(newName);
        await input.EvaluateAsync(
            """
            el => {
                const options = { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true };
                el.dispatchEvent(new KeyboardEvent('keydown', options));
                el.dispatchEvent(new KeyboardEvent('keydown', options));
            }
            """);
        await WaitForInputDetachedAsync(input);
        await WaitForHeaderTextAsync(page, prop, newName);

        var after = await CaptureStateAsync(page, gateModulePath);
        E2ETestAssert.Equal(before.UndoCount + 1, after.UndoCount,
            "Rapid double Enter created more or fewer than one History action.");
        E2ETestAssert.True(after.Dirty,
            "Changed Rename did not mark the sheet Dirty.");
        E2ETestAssert.Equal(prop, await GetColumnPropByNameAsync(page, newName),
            "Changed Rename changed the stable FieldKey/prop.");

        await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
        await WaitForHeaderTextAsync(page, prop, oldName);
        E2ETestAssert.Equal(0,
            await page.Locator("input[data-erp-column-rename-input]").CountAsync(),
            "Undo resurrected the Rename editor.");
        var undoState = await CaptureStateAsync(page, gateModulePath);
        E2ETestAssert.True(!undoState.Dirty,
            "Undo of the only unsaved Rename did not return to the clean baseline.");

        await page.Locator("#revogrid-gate5b1-redo").ClickAsync();
        await WaitForHeaderTextAsync(page, prop, newName);
        E2ETestAssert.Equal(0,
            await page.Locator("input[data-erp-column-rename-input]").CountAsync(),
            "Redo resurrected the Rename editor.");
        var redoState = await CaptureStateAsync(page, gateModulePath);
        E2ETestAssert.True(redoState.Dirty,
            "Redo of Rename did not restore Dirty state.");
    }

    private static async Task AssertOutsideClickAsync(
        IPage page,
        string prop,
        string oldName,
        string newName,
        string gateModulePath)
    {
        var before = await CaptureStateAsync(page, gateModulePath);
        await BeginRenameAsync(page, prop);
        var input = RenameInput(page, prop);
        await input.FillAsync(newName);
        await page.Locator(".native-gate5a__statusbar").ClickAsync();
        await WaitForInputDetachedAsync(input);
        await WaitForHeaderTextAsync(page, prop, newName);
        var after = await CaptureStateAsync(page, gateModulePath);
        E2ETestAssert.Equal(before.UndoCount + 1, after.UndoCount,
            "Valid outside-click Rename did not create exactly one History action.");

        var invalidBefore = after;
        await BeginRenameAsync(page, prop);
        input = RenameInput(page, prop);
        await input.FillAsync("   ");
        await page.Locator(".native-gate5a__statusbar").ClickAsync();
        await AssertInvalidEditorAsync(input,
            "Invalid outside-click Rename closed or committed instead of staying editable.");
        var invalidAfter = await CaptureStateAsync(page, gateModulePath);
        E2ETestAssert.Equal(invalidBefore.UndoCount, invalidAfter.UndoCount,
            "Invalid outside-click Rename created History.");
        E2ETestAssert.Equal(invalidBefore.Dirty, invalidAfter.Dirty,
            "Invalid outside-click Rename changed Dirty state.");
        await input.PressAsync("Escape");
        await WaitForInputDetachedAsync(input);
        await WaitForHeaderTextAsync(page, prop, newName);
    }

    private static async Task AssertSaveReloadAndYearIsolationAsync(
        IPage page,
        E2ETestDatabase database,
        RenameFixture fixture,
        string savedName,
        string gateModulePath)
    {
        var beforeDefinition = await GetDbCustomColumnAsync(
            database.ConnectionString,
            fixture.TargetFieldKey,
            database.Seed.CurrentYear);
        var beforeRow = await GetDbRowAsync(database.ConnectionString, fixture.RowId);

        await SaveButton(page).ClickAsync();
        await WaitForCleanSaveAsync(page);

        var afterDefinition = await GetDbCustomColumnAsync(
            database.ConnectionString,
            fixture.TargetFieldKey,
            database.Seed.CurrentYear);
        var afterRow = await GetDbRowAsync(database.ConnectionString, fixture.RowId);

        E2ETestAssert.Equal(beforeDefinition.Id, afterDefinition.Id,
            "Rename Save changed Custom Column Id.");
        E2ETestAssert.Equal(beforeDefinition.FieldKey, afterDefinition.FieldKey,
            "Rename Save changed FieldKey.");
        E2ETestAssert.Equal(beforeDefinition.DataType, afterDefinition.DataType,
            "Rename Save changed DataType.");
        E2ETestAssert.Equal(beforeDefinition.LayoutOrder, afterDefinition.LayoutOrder,
            "Rename Save changed LayoutOrder.");
        E2ETestAssert.Equal(savedName, afterDefinition.Name,
            "Rename Save did not persist the current name.");
        E2ETestAssert.True(!beforeDefinition.RowVersion.SequenceEqual(afterDefinition.RowVersion),
            "Rename Save did not advance the Custom Column RowVersion.");
        E2ETestAssert.Equal(StableValue,
            CustomColumnValue(afterRow.CustomValuesJson, fixture.TargetFieldKey),
            "Rename Save changed the existing custom value.");
        E2ETestAssert.True(beforeRow.RowVersion.SequenceEqual(afterRow.RowVersion),
            "Name-only Rename Save unexpectedly updated the Work Order RowVersion.");

        var clean = await CaptureStateAsync(page, gateModulePath);
        E2ETestAssert.True(!clean.Dirty,
            "Accepted Rename Save did not return the sheet to Clean.");

        await ReloadGateAsync(page);
        await WaitForHeaderTextAsync(page, fixture.TargetFieldKey, savedName);
        E2ETestAssert.Equal(fixture.TargetFieldKey,
            await GetColumnPropByNameAsync(page, savedName),
            "Reloaded Rename did not preserve FieldKey/prop.");
        var reloadedRow = await GetSourceRowByIdAsync(page, fixture.RowId);
        E2ETestAssert.Equal(StableValue,
            reloadedRow.GetProperty(fixture.TargetFieldKey).GetString() ?? string.Empty,
            "Saved custom value did not survive reload after Rename.");

        await SwitchYearAsync(page, database.Seed.PreviousYear);
        E2ETestAssert.True(!await HasColumnNamedAsync(page, savedName),
            "Current-year renamed Custom Column leaked into the previous Work Year.");
        E2ETestAssert.True(!await DbCustomColumnExistsAsync(
                database.ConnectionString,
                fixture.TargetFieldKey,
                database.Seed.PreviousYear),
            "Current-year renamed Custom Column was persisted into the previous Work Year.");

        await SwitchYearAsync(page, database.Seed.CurrentYear);
        await WaitForHeaderTextAsync(page, fixture.TargetFieldKey, savedName);
    }

    private static async Task AssertRenameConcurrencyRejectAsync(
        IPage page,
        E2ETestDatabase database,
        RenameFixture fixture,
        string authoritativeName,
        string gateModulePath)
    {
        const string staleLocalName = "Rename Break Stale Local";
        await BeginRenameAsync(page, fixture.TargetFieldKey);
        var input = RenameInput(page, fixture.TargetFieldKey);
        await input.FillAsync(staleLocalName);
        await input.PressAsync("Enter");
        await WaitForInputDetachedAsync(input);
        await WaitForHeaderTextAsync(page, fixture.TargetFieldKey, staleLocalName);

        var dirtyBeforeSave = await CaptureStateAsync(page, gateModulePath);
        E2ETestAssert.True(dirtyBeforeSave.Dirty,
            "Local stale Rename did not become Dirty before concurrency rejection.");

        var dbBefore = await GetDbCustomColumnAsync(
            database.ConnectionString,
            fixture.TargetFieldKey,
            database.Seed.CurrentYear);
        await BumpCustomColumnRowVersionExternallyAsync(
            database.ConnectionString,
            dbBefore.Id);

        await SaveButton(page).ClickAsync();
        await WaitForOperationMessageAsync(page, "another session");

        var dbAfter = await GetDbCustomColumnAsync(
            database.ConnectionString,
            fixture.TargetFieldKey,
            database.Seed.CurrentYear);
        E2ETestAssert.Equal(authoritativeName, dbAfter.Name,
            "Stale Rename partially overwrote the authoritative SQL name.");
        var rejectedState = await CaptureStateAsync(page, gateModulePath);
        E2ETestAssert.True(rejectedState.Dirty,
            "Rename concurrency rejection incorrectly marked local work Clean.");

        await ReloadGateAsync(page);
        await WaitForHeaderTextAsync(page, fixture.TargetFieldKey, authoritativeName);
        var recovered = await CaptureStateAsync(page, gateModulePath);
        E2ETestAssert.True(!recovered.Dirty,
            "Reload after Rename concurrency rejection did not restore a clean authoritative baseline.");
    }

    private static async Task BeginRenameAsync(IPage page, string prop)
    {
        await EnsureCustomColumnVisibleAsync(page, prop);
        await ColumnName(page, prop).DblClickAsync();
        await RenameInput(page, prop).WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });
    }

    private static async Task AssertInvalidEditorAsync(ILocator input, string message)
    {
        E2ETestAssert.True(await input.IsVisibleAsync(), message);
        E2ETestAssert.Equal("true", await input.GetAttributeAsync("aria-invalid") ?? string.Empty, message);
    }

    private static async Task WaitForInputDetachedAsync(ILocator input) =>
        await input.WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Detached,
            Timeout = 10_000
        });

    private static async Task WaitForHeaderTextAsync(IPage page, string prop, string expectedName)
    {
        await EnsureCustomColumnVisibleAsync(page, prop);
        await page.WaitForFunctionAsync(
            """
            args => {
                const el = document.querySelector(`[data-erp-custom-column-name-prop="${args.prop}"]`);
                return (el?.textContent ?? '').trim() === args.name;
            }
            """,
            new { prop, name = expectedName },
            new PageWaitForFunctionOptions { Timeout = 10_000 });
    }

    private static async Task ScrollToColumnPropAsync(IPage page, string prop)
    {
        await page.EvaluateAsync(
            """
            async prop => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                if (!grid) throw new Error('Revo grid not found.');
                if (typeof grid.scrollToColumnProp === 'function') {
                    await grid.scrollToColumnProp(prop);
                }
            }
            """,
            prop);
    }

    private static async Task EnsureCustomColumnVisibleAsync(IPage page, string prop)
    {
        await ScrollToColumnPropAsync(page, prop);
        await ColumnName(page, prop).WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });
    }

    private static async Task ClearSemanticSelectionAsync(IPage page)
    {
        await WaitForAnyRenderedDataCellAsync(page);
        await page.Locator(
                $"#{GridHostId} revogr-viewport-scroll.rgCol:not([row-header]) [data-rgRow][data-rgCol]")
            .First.ClickAsync();
        await page.WaitForFunctionAsync(
            """
            () => document.querySelectorAll(
                '#revogrid-native-gate5a-grid [data-erp-selected-column-prop]'
            ).length === 0
            """,
            null,
            new PageWaitForFunctionOptions { Timeout = 10_000 });
    }

    private static async Task<string> AssertRuntimeFreshAsync(IPage page, string projectRoot)
    {
        var razorPath = Path.Combine(
            projectRoot,
            "Components",
            "Pages",
            "WorkOrdersRevoGridNativeGate5A.razor.cs");
        var gateSourcePath = Path.Combine(projectRoot, "wwwroot", "js", "revoGridGate5B1.js");
        var razor = await File.ReadAllTextAsync(razorPath);
        var gateSource = await File.ReadAllTextAsync(gateSourcePath);

        var gateToken = ExtractToken(
            razor,
            @"revoGridGate5B1\.js\?v=([^""']+)",
            "Gate module token");
        var renameToken = ExtractToken(
            gateSource,
            @"revoGridColumnRename\.js\?v=([^""']+)",
            "Rename module token");

        var gateUrls = await ResourceUrlsAsync(page, "/js/revoGridGate5B1.js");
        var renameUrls = await ResourceUrlsAsync(page, "/js/revoGridColumnRename.js");
        E2ETestAssert.Equal(1, gateUrls.Length,
            $"Expected one loaded Gate module URL, found {gateUrls.Length}: {string.Join(", ", gateUrls)}");
        E2ETestAssert.Equal(1, renameUrls.Length,
            $"Expected one loaded Rename module URL, found {renameUrls.Length}: {string.Join(", ", renameUrls)}");
        E2ETestAssert.Contains($"v={gateToken}", gateUrls[0],
            "Browser loaded a stale Gate module token.");
        E2ETestAssert.Contains($"v={renameToken}", renameUrls[0],
            "Browser loaded a stale Rename module token.");
        return gateUrls[0];
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

    private static async Task<string[]> ResourceUrlsAsync(IPage page, string filePath) =>
        await page.EvaluateAsync<string[]>(
            """
            filePath => [...new Set(
                performance.getEntriesByType('resource')
                    .map(entry => String(entry?.name ?? ''))
                    .filter(name => name.includes(filePath))
            )]
            """,
            filePath);

    private static async Task<RenameState> CaptureStateAsync(IPage page, string gateModulePath)
    {
        var undo = ParseCounter(await page.Locator("#revogrid-gate5b1-undo-count").TextContentAsync());
        var redo = ParseCounter(await page.Locator("#revogrid-gate5b1-redo-count").TextContentAsync());
        var json = await page.EvaluateAsync<string>(
            """
            async args => JSON.stringify((await import(args.modulePath)).getChangeState(args.gridId))
            """,
            new { modulePath = gateModulePath, gridId = GridHostId });
        var root = JsonDocument.Parse(json).RootElement;
        return new RenameState(
            undo,
            redo,
            root.GetProperty("dirty").GetBoolean());
    }

    private static int ParseCounter(string? text) =>
        int.Parse((text ?? "0").Trim(), CultureInfo.InvariantCulture);

    private static async Task AssertStateUnchangedAsync(
        IPage page,
        string gateModulePath,
        RenameState expected,
        string scenario)
    {
        var actual = await CaptureStateAsync(page, gateModulePath);
        E2ETestAssert.Equal(expected.UndoCount, actual.UndoCount,
            $"{scenario} changed Undo history.");
        E2ETestAssert.Equal(expected.RedoCount, actual.RedoCount,
            $"{scenario} changed Redo history.");
        E2ETestAssert.Equal(expected.Dirty, actual.Dirty,
            $"{scenario} changed Dirty state.");
    }

    private static async Task<RenameFixture> PrepareFixtureAsync(E2ETestDatabase database)
    {
        await using var connection = new SqlConnection(database.ConnectionString);
        await connection.OpenAsync();

        int rowId;
        int departmentId;
        string createdBy;
        byte[] rowVersion;
        await using (var rowCommand = connection.CreateCommand())
        {
            rowCommand.CommandText =
                """
                SELECT TOP (1) [Id], [DepartmentId], [CreatedBy], [RowVersion]
                FROM [WorkOrders]
                WHERE [WorkYear] = @Year
                ORDER BY [Id];
                """;
            rowCommand.Parameters.AddWithValue("@Year", database.Seed.CurrentYear);
            await using var reader = await rowCommand.ExecuteReaderAsync();
            E2ETestAssert.True(await reader.ReadAsync(),
                "Could not resolve a current-year Work Order for the Rename fixture.");
            rowId = reader.GetInt32(0);
            departmentId = reader.GetInt32(1);
            createdBy = reader.GetString(2);
            rowVersion = (byte[])reader[3];
        }

        long maxLayout;
        await using (var maxCommand = connection.CreateCommand())
        {
            maxCommand.CommandText =
                """
                SELECT COALESCE(MAX([LayoutOrder]), 0)
                FROM [CustomColumnDefinitions]
                WHERE [DepartmentId] = @DepartmentId AND [WorkYear] = @Year;
                """;
            maxCommand.Parameters.AddWithValue("@DepartmentId", departmentId);
            maxCommand.Parameters.AddWithValue("@Year", database.Seed.CurrentYear);
            maxLayout = Convert.ToInt64(await maxCommand.ExecuteScalarAsync(), CultureInfo.InvariantCulture);
        }

        await InsertDefinitionAsync(
            connection,
            departmentId,
            database.Seed.CurrentYear,
            TargetFieldKey,
            TargetName,
            maxLayout + 1_000_000L,
            createdBy);
        await InsertDefinitionAsync(
            connection,
            departmentId,
            database.Seed.CurrentYear,
            SiblingFieldKey,
            SiblingName,
            maxLayout + 2_000_000L,
            createdBy);

        var valueJson = JsonSerializer.Serialize(
            new Dictionary<string, string> { [TargetFieldKey] = StableValue });
        await using (var valueCommand = connection.CreateCommand())
        {
            valueCommand.CommandText =
                "UPDATE [WorkOrders] SET [CustomValuesJson] = @Json WHERE [Id] = @Id;";
            valueCommand.Parameters.AddWithValue("@Json", valueJson);
            valueCommand.Parameters.AddWithValue("@Id", rowId);
            E2ETestAssert.Equal(1, await valueCommand.ExecuteNonQueryAsync(),
                "Could not seed the stable Custom Value for Rename.");
        }

        var definition = await GetDbCustomColumnAsync(
            database.ConnectionString,
            TargetFieldKey,
            database.Seed.CurrentYear);
        var row = await GetDbRowAsync(database.ConnectionString, rowId);
        E2ETestAssert.True(!rowVersion.SequenceEqual(row.RowVersion),
            "Seeding CustomValuesJson did not advance the Work Order RowVersion as expected.");

        return new RenameFixture(
            rowId,
            departmentId,
            TargetFieldKey,
            definition.Id);
    }

    private static async Task InsertDefinitionAsync(
        SqlConnection connection,
        int departmentId,
        int workYear,
        string fieldKey,
        string name,
        long layoutOrder,
        string createdBy)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            INSERT INTO [CustomColumnDefinitions]
                ([DepartmentId], [WorkYear], [FieldKey], [Name], [DataType], [LayoutOrder], [CreatedAt], [CreatedBy])
            VALUES
                (@DepartmentId, @WorkYear, @FieldKey, @Name, 1, @LayoutOrder, SYSUTCDATETIME(), @CreatedBy);
            """;
        command.Parameters.AddWithValue("@DepartmentId", departmentId);
        command.Parameters.AddWithValue("@WorkYear", workYear);
        command.Parameters.AddWithValue("@FieldKey", fieldKey);
        command.Parameters.AddWithValue("@Name", name);
        command.Parameters.AddWithValue("@LayoutOrder", layoutOrder);
        command.Parameters.AddWithValue("@CreatedBy", createdBy);
        E2ETestAssert.Equal(1, await command.ExecuteNonQueryAsync(),
            $"Could not seed Custom Column '{name}'.");
    }

    private static async Task BumpCustomColumnRowVersionExternallyAsync(
        string connectionString,
        int id)
    {
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText =
            "UPDATE [CustomColumnDefinitions] SET [CreatedAt] = [CreatedAt] WHERE [Id] = @Id;";
        command.Parameters.AddWithValue("@Id", id);
        E2ETestAssert.Equal(1, await command.ExecuteNonQueryAsync(),
            "External Rename-concurrency update did not touch exactly one Custom Column.");
    }

    private static async Task<DbCustomColumn> GetDbCustomColumnAsync(
        string connectionString,
        string fieldKey,
        int workYear)
    {
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT [Id], [FieldKey], [Name], [DataType], [LayoutOrder], [RowVersion]
            FROM [CustomColumnDefinitions]
            WHERE [FieldKey] = @FieldKey AND [WorkYear] = @Year;
            """;
        command.Parameters.AddWithValue("@FieldKey", fieldKey);
        command.Parameters.AddWithValue("@Year", workYear);
        await using var reader = await command.ExecuteReaderAsync();
        E2ETestAssert.True(await reader.ReadAsync(),
            $"SQL Custom Column '{fieldKey}' for Work Year {workYear} was not found.");
        return new DbCustomColumn(
            reader.GetInt32(0),
            reader.GetString(1),
            reader.GetString(2),
            reader.GetInt32(3),
            reader.GetInt64(4),
            (byte[])reader[5]);
    }

    private static async Task<bool> DbCustomColumnExistsAsync(
        string connectionString,
        string fieldKey,
        int workYear)
    {
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT COUNT(*) FROM [CustomColumnDefinitions]
            WHERE [FieldKey] = @FieldKey AND [WorkYear] = @Year;
            """;
        command.Parameters.AddWithValue("@FieldKey", fieldKey);
        command.Parameters.AddWithValue("@Year", workYear);
        return Convert.ToInt32(await command.ExecuteScalarAsync(), CultureInfo.InvariantCulture) == 1;
    }

    private static async Task<DbRow> GetDbRowAsync(string connectionString, int id)
    {
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText =
            "SELECT [Id], [CustomValuesJson], [RowVersion] FROM [WorkOrders] WHERE [Id] = @Id;";
        command.Parameters.AddWithValue("@Id", id);
        await using var reader = await command.ExecuteReaderAsync();
        E2ETestAssert.True(await reader.ReadAsync(), $"SQL Work Order {id} was not found.");
        return new DbRow(reader.GetInt32(0), reader.GetString(1), (byte[])reader[2]);
    }

    private static string CustomColumnValue(string json, string fieldKey)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.TryGetProperty(fieldKey, out var value)
            ? value.GetString() ?? string.Empty
            : string.Empty;
    }

    private static async Task<JsonElement> GetSourceRowByIdAsync(IPage page, int id)
    {
        var json = await page.EvaluateAsync<string>(
            """
            async id => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const row = (await grid.getSource('rgRow'))
                    .find(item => Number(item?.id ?? 0) === Number(id));
                return JSON.stringify(row ?? null);
            }
            """,
            id);
        var element = JsonDocument.Parse(json).RootElement.Clone();
        E2ETestAssert.True(element.ValueKind == JsonValueKind.Object,
            $"Could not resolve browser source row for database Id {id}.");
        return element;
    }

    private static async Task<bool> HasColumnNamedAsync(IPage page, string name) =>
        await page.EvaluateAsync<bool>(
            """
            async name => (await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getColumns())
                .some(column => String(column?.name ?? '') === name)
            """,
            name);

    private static async Task<string> GetColumnPropByNameAsync(IPage page, string name) =>
        await page.EvaluateAsync<string>(
            """
            async name => String((await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getColumns())
                .find(column => String(column?.name ?? '') === name)?.prop ?? '')
            """,
            name);

    private static async Task ReloadGateAsync(IPage page)
    {
        await page.ReloadAsync(new PageReloadOptions { WaitUntil = WaitUntilState.DOMContentLoaded });
        await Grid(page).WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 45_000
        });
        await WaitForAnyRenderedDataCellAsync(page);
    }

    private static async Task SwitchYearAsync(IPage page, int year)
    {
        await page.GetByTestId("gate5a-year-selector")
            .SelectOptionAsync(year.ToString(CultureInfo.InvariantCulture));
        await page.WaitForFunctionAsync(
            """
            expected => {
                const selector = document.querySelector('[data-testid="gate5a-year-selector"]');
                const loading = document.querySelector('.native-gate5a__loading');
                const status = document.querySelector('.native-gate5a__statusbar')?.textContent ?? '';
                return selector?.value === String(expected)
                    && selector.disabled === false
                    && !loading
                    && status.includes(`Dataset ${expected}`);
            }
            """,
            year,
            new PageWaitForFunctionOptions { Timeout = 30_000 });
        await WaitForAnyRenderedDataCellAsync(page);
    }

    private static async Task WaitForCleanSaveAsync(IPage page, int timeoutMs = 30_000)
    {
        await WaitForOperationMessageAsync(page, "تم الحفظ في قاعدة البيانات", timeoutMs);
        await page.WaitForFunctionAsync(
            "() => document.querySelector('#revogrid-gate5b1-change-status')?.textContent?.trim() === 'Clean'",
            null,
            new PageWaitForFunctionOptions { Timeout = timeoutMs });
    }

    private static async Task WaitForOperationMessageAsync(
        IPage page,
        string text,
        int timeoutMs = 30_000) =>
        await page.Locator(".native-gate5a__operation-message")
            .Filter(new LocatorFilterOptions { HasTextString = text })
            .WaitForAsync(new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = timeoutMs
            });

    private static async Task WaitForAnyRenderedDataCellAsync(IPage page) =>
        await page.Locator(
                $"#{GridHostId} revogr-viewport-scroll.rgCol:not([row-header]) [data-rgRow][data-rgCol]")
            .First.WaitForAsync(new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = 30_000
            });

    private static ILocator Grid(IPage page) => page.Locator($"#{GridHostId} revo-grid");
    private static ILocator SaveButton(IPage page) => page.Locator("#revogrid-gate5b11-save");
    private static ILocator RenameInput(IPage page, string prop) =>
        page.Locator($"input[data-erp-column-rename-input=\"{prop}\"]");
    private static ILocator ColumnName(IPage page, string prop) =>
        page.Locator($"[data-erp-custom-column-name-prop=\"{prop}\"]").First;

    private static string CreateBundle(string artifactDirectory)
    {
        var downloads = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            "Downloads");
        Directory.CreateDirectory(downloads);
        var path = Path.Combine(
            downloads,
            $"ERP_RENAME_FOCUSED_TRACE_{DateTime.Now:yyyyMMdd-HHmmss}.zip");
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
        }
        throw new DirectoryNotFoundException("Could not locate ERPPrototype.csproj.");
    }

    private sealed record RenameFixture(
        int RowId,
        int DepartmentId,
        string TargetFieldKey,
        int TargetDefinitionId);

    private sealed record RenameState(int UndoCount, int RedoCount, bool Dirty);

    private sealed record DbCustomColumn(
        int Id,
        string FieldKey,
        string Name,
        int DataType,
        long LayoutOrder,
        byte[] RowVersion);

    private sealed record DbRow(int Id, string CustomValuesJson, byte[] RowVersion);

    private sealed class FocusedWebApplicationProcess : IAsyncDisposable
    {
        private readonly Process process;
        private readonly StringBuilder output;
        private readonly string logPath;

        private FocusedWebApplicationProcess(
            Process process,
            StringBuilder output,
            string logPath,
            Uri baseUri)
        {
            this.process = process;
            this.output = output;
            this.logPath = logPath;
            BaseUri = baseUri;
        }

        public Uri BaseUri { get; }

        public static async Task<FocusedWebApplicationProcess> StartAsync(
            string projectRoot,
            string connectionString,
            string artifactDirectory,
            string configuration,
            CancellationToken cancellationToken = default)
        {
            var projectPath = Path.Combine(projectRoot, "ERPPrototype.csproj");
            var port = ReserveTcpPort();
            var baseUri = new Uri($"http://127.0.0.1:{port}");
            var logPath = Path.Combine(artifactDirectory, "rename-focused-web-application.log");
            var output = new StringBuilder();

            var startInfo = new ProcessStartInfo
            {
                FileName = "dotnet",
                WorkingDirectory = projectRoot,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };
            startInfo.ArgumentList.Add("run");
            startInfo.ArgumentList.Add("--no-build");
            startInfo.ArgumentList.Add("--project");
            startInfo.ArgumentList.Add(projectPath);
            startInfo.ArgumentList.Add("--configuration");
            startInfo.ArgumentList.Add(configuration);
            startInfo.ArgumentList.Add("--no-launch-profile");
            startInfo.Environment["ASPNETCORE_ENVIRONMENT"] = "E2ETest";
            startInfo.Environment["ASPNETCORE_URLS"] = baseUri.ToString().TrimEnd('/');
            startInfo.Environment["ConnectionStrings__DefaultConnection"] = connectionString;
            startInfo.Environment["InitialAdmin__Email"] = "e2e.admin@local.test";
            startInfo.Environment["InitialAdmin__Password"] = "E2E_Admin_2026!";
            startInfo.Environment["InitialAdmin__FullName"] = "E2E Administrator";
            startInfo.Environment["Logging__LogLevel__Default"] = "Warning";
            startInfo.Environment["Logging__LogLevel__Microsoft.AspNetCore"] = "Warning";
            startInfo.Environment["DOTNET_NOLOGO"] = "true";

            var process = new Process { StartInfo = startInfo, EnableRaisingEvents = true };
            process.OutputDataReceived += (_, args) =>
            {
                if (args.Data is not null)
                {
                    lock (output) output.AppendLine(args.Data);
                }
            };
            process.ErrorDataReceived += (_, args) =>
            {
                if (args.Data is not null)
                {
                    lock (output) output.AppendLine("[stderr] " + args.Data);
                }
            };

            if (!process.Start())
            {
                throw new InvalidOperationException("Focused Rename ERP process could not be started.");
            }
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            var app = new FocusedWebApplicationProcess(process, output, logPath, baseUri);
            try
            {
                await app.WaitUntilReadyAsync(cancellationToken);
                return app;
            }
            catch
            {
                await app.WriteLogAsync();
                await app.DisposeAsync();
                throw;
            }
        }

        private async Task WaitUntilReadyAsync(CancellationToken cancellationToken)
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
            var deadline = DateTime.UtcNow.AddSeconds(75);
            Exception? last = null;
            while (DateTime.UtcNow < deadline)
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (process.HasExited)
                {
                    await WriteLogAsync();
                    throw new InvalidOperationException(
                        $"Focused Rename ERP process exited before ready. Exit code {process.ExitCode}. Log: {logPath}");
                }
                try
                {
                    using var login = await http.GetAsync(
                        new Uri(BaseUri, "/Account/Login"),
                        HttpCompletionOption.ResponseHeadersRead,
                        cancellationToken);
                    using var blazor = await http.GetAsync(
                        new Uri(BaseUri, "/_framework/blazor.web.js"),
                        HttpCompletionOption.ResponseHeadersRead,
                        cancellationToken);
                    if (login.StatusCode == HttpStatusCode.OK && blazor.StatusCode == HttpStatusCode.OK)
                    {
                        return;
                    }
                }
                catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException)
                {
                    last = exception;
                }
                await Task.Delay(350, cancellationToken);
            }
            await WriteLogAsync();
            throw new TimeoutException($"Focused Rename ERP process did not become ready at {BaseUri}. Log: {logPath}", last);
        }

        private static int ReserveTcpPort()
        {
            var listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start();
            try
            {
                return ((IPEndPoint)listener.LocalEndpoint).Port;
            }
            finally
            {
                listener.Stop();
            }
        }

        private async Task WriteLogAsync()
        {
            string content;
            lock (output) content = output.ToString();
            await File.WriteAllTextAsync(logPath, content);
        }

        public async ValueTask DisposeAsync()
        {
            try
            {
                if (!process.HasExited)
                {
                    process.Kill(entireProcessTree: true);
                    await process.WaitForExitAsync();
                }
            }
            catch (InvalidOperationException)
            {
            }
            finally
            {
                await WriteLogAsync();
                process.Dispose();
            }
        }
    }
}
