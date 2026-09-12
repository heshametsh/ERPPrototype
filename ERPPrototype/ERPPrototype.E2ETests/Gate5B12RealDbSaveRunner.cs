using System.Globalization;
using System.IO.Compression;
using System.Text.Json;
using Microsoft.Data.SqlClient;
using Microsoft.Playwright;

namespace ERPPrototype.E2ETests;

internal static class Gate5B12RealDbSaveRunner
{
    private const int FixedPort = 5265;
    private const string GatePath = "/work-orders-revogrid-gate5c1";
    private const string GridHostId = "revogrid-native-gate5a-grid";
    private const string ExpectedModuleVersionToken = "20260912-revo-rename-6";
    private const string CustomFieldKey = "custom_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private const string CustomFieldName = "B12 E2E Note";
    private const int LargeSaveRowCount = 1_200;
    private const int LargeSaveRowsPerYear = 1_500;

    public static async Task<int> RunAsync()
    {
        var projectRoot = FindProjectRoot();
        var artifactDirectory = E2EArtifactManager.CreateRunDirectory(projectRoot);
        Exception? failure = null;

        Console.WriteLine("RevoGrid Gate 5C-1 / B12 Real DB Save real-user browser journey");
        Console.WriteLine("The journey uses deterministic Revo viewport positioning plus real Playwright mouse/keyboard actions and verifies SQL persistence, B11 snapshot semantics, new-row identity, DisplayOrder, Custom Values, cross-year confirmation, and concurrency rejection.");
        Console.WriteLine($"Application port: {FixedPort}");
        Console.WriteLine($"Artifacts: {artifactDirectory}");
        Console.WriteLine();

        try
        {
            await using var database = await E2ETestDatabase.CreateAsync(
                keepDatabase: false,
                rowsPerYear: LargeSaveRowsPerYear);

            var seedFixture = await PrepareDatabaseFixtureAsync(database);

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

                var activeModulePath = await ResolveActiveModulePathAsync(page);
                Console.WriteLine($"[00-runtime-module] PASS — browser and E2E diagnostics share {activeModulePath}");

                await AssertActiveSurfaceAsync(page);
                Console.WriteLine("[00a-active-surface] PASS — closure runs on Revo Gate 5C-1 with visible aggregates active");

                await AssertExistingUpdatePersistsAsync(page, database);
                Console.WriteLine("[01-update] PASS — real cell edit + Save writes SQL, refreshes RowVersion, and returns Clean");

                await AssertCustomColumnSaveFlowAsync(page, database);
                Console.WriteLine("[01b-custom-columns] PASS — Add/Delete, mixed Save/reload, Work-Year isolation/switch-back, structural Undo/Redo, RowVersion identity, and post-Save row History");

                await AssertMultipleValuedCustomColumnDeleteAsync(page, database);
                Console.WriteLine("[01c-custom-multi-delete] PASS — two valued persisted Custom Columns delete in one Save, reconcile affected RowVersion, stay Clean, and allow immediate year switching");

                await AssertCustomColumnCrossYearMappingAsync(page, database);
                Console.WriteLine("[01d-custom-cross-year] PASS — missing destination, compatible reuse, type-conflict batch remap, blank-value no-create, and destination visual order");

                await AssertCustomColumnViewStateIsolationAsync(page, database);
                Console.WriteLine("[01e-custom-year-view] PASS — Custom Column Filter/Sort state is isolated per Work Year and restored only when returning to its owning year");

                await AssertCustomColumnConcurrencyRejectsAsync(page, database);
                Console.WriteLine("[01f-custom-concurrency] PASS — stale Custom Column RowVersion is rejected without partial persistence and employee structural work remains recoverable");

                await AssertEditDuringSaveAndFilterSnapshotAsync(page, database);
                Console.WriteLine("[02-snapshot] PASS — DB-blocked Save keeps the sent generation, newer edit stays Dirty, and Filter cannot drop the captured row");

                var newRow = await AssertEmptyNewRowThenRealAddAsync(page, database, seedFixture);
                Console.WriteLine("[03-add] PASS — empty new row is blocked; completed row gets DB Id/RowVersion, server canonical value, Custom Value, and fully Clean baseline");

                await AssertPersistedDeleteAsync(page, database, newRow);
                Console.WriteLine("[04-delete] PASS — committed Delete + in-flight real Undo preserves the newer restore as a new unsaved row, then re-saves it with a fresh DB identity");

                await AssertCrossYearCancelThenContinueAsync(page, database);
                Console.WriteLine("[05-cross-year] PASS — Cancel makes no SQL change; Continue moves the row transactionally, removes it from the source sheet, and clears local History");

                await AssertLargeDayLongSaveStreamsAsync(page, database);
                Console.WriteLine("[06-large-save] PASS — 1,200 real range edits stream a compact persistence projection, commit to SQL, and return Clean");

                await AssertConcurrencyRejectKeepsDirtyAsync(page, database);
                Console.WriteLine("[07-concurrency] PASS — stale RowVersion is rejected transactionally and the employee edit remains Dirty");

                browser.Diagnostics.AssertNoCriticalErrors();
                await browser.CaptureSuccessAsync(
                    "gate5b12-real-db-save-real-user-journey",
                    preserveTrace: true);
            }
            catch (Exception exception)
            {
                failure = exception;
                await browser.CaptureFailureAsync(
                    "gate5b12-real-db-save-real-user-journey");
            }
        }
        catch (Exception exception)
        {
            failure ??= exception;
        }

        var bundle = CreateBundle(artifactDirectory);
        Console.WriteLine();
        if (failure is null)
        {
            Console.WriteLine("Gate 5C-1 / B12 Real DB Save real-user browser journey PASS.");
        }
        else
        {
            Console.Error.WriteLine("Gate 5C-1 / B12 Real DB Save real-user browser journey FAILED.");
            Console.Error.WriteLine(failure);
        }
        Console.WriteLine();
        Console.WriteLine("READY TO UPLOAD:");
        Console.WriteLine(bundle);
        return failure is null ? 0 : 1;
    }

    private static async Task AssertExistingUpdatePersistsAsync(
        IPage page,
        E2ETestDatabase database)
    {
        var row = await GetVisibleRowAsync(page, 5);
        var partialColumn = await GetVisualColumnIndexAsync(page, "partialAmount");
        var workOrderValue = ReadDecimalProperty(row, "workOrderValue");
        var before = await GetDbRowAsync(database.ConnectionString, row.GetProperty("id").GetInt32());
        var next = Math.Round(workOrderValue * 0.23m, 2);
        if (next == before.PartialAmount)
        {
            next = Math.Round(workOrderValue * 0.27m, 2);
        }

        await EditCellAsync(page, 5, partialColumn, Format(next));
        await SaveButton(page).ClickAsync();
        try
        {
            await WaitForCleanSaveAsync(page);
        }
        catch
        {
            var uiDiagnostics = await page.EvaluateAsync<string>(
                """
                () => JSON.stringify({
                    operationMessage: document.querySelector('.native-gate5a__operation-message')?.textContent?.trim() ?? '',
                    saveStatus: document.querySelector('#revogrid-gate5b11-save-status')?.textContent?.trim() ?? '',
                    saveActive: document.querySelector('#revogrid-gate5b11-save-status')?.dataset?.saveActive ?? '',
                    changeStatus: document.querySelector('#revogrid-gate5b1-change-status')?.textContent?.trim() ?? '',
                    saveDisabled: document.querySelector('#revogrid-gate5b11-save')?.disabled ?? null
                })
                """);
            var dbAfterFailure = await GetDbRowAsync(database.ConnectionString, before.Id);
            var stateAfterFailure = await GetChangeStateAsync(page);
            Console.WriteLine($"[B12-01-DIAG] UI={uiDiagnostics}");
            Console.WriteLine($"[B12-01-DIAG] DB partial={dbAfterFailure.PartialAmount?.ToString(CultureInfo.InvariantCulture) ?? "null"}; rowVersionChanged={!dbAfterFailure.RowVersion.SequenceEqual(before.RowVersion)}");
            Console.WriteLine($"[B12-01-DIAG] CHANGE={stateAfterFailure.GetRawText()}");
            throw;
        }

        var after = await GetDbRowAsync(database.ConnectionString, before.Id);
        E2ETestAssert.Equal(next, after.PartialAmount ?? 0m,
            "B12 Save did not persist the real Partial Amount edit.");
        E2ETestAssert.True(!after.RowVersion.SequenceEqual(before.RowVersion),
            "B12 Save did not advance SQL RowVersion after Update.");
        E2ETestAssert.True(!(await GetChangeStateAsync(page)).GetProperty("dirty").GetBoolean(),
            "B12 Update remained Dirty after the accepted server result.");
    }

    private static async Task AssertCustomColumnSaveFlowAsync(
        IPage page,
        E2ETestDatabase database)
    {
        const string undoneName = "B12 Unsaved Undo Column";
        await InsertCustomColumnAsync(page, undoneName);
        E2ETestAssert.True(await HasColumnNamedAsync(page, undoneName),
            "Add custom column did not render before Undo.");
        await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
        await page.WaitForFunctionAsync(
            "name => !Array.from(document.querySelector('#revogrid-native-gate5a-grid revo-grid').columns ?? []).some(c => String(c?.name ?? '') === name)",
            undoneName);

        var savedName = "B12 Saved Custom Column";
        var row = await GetVisibleRowAsync(page, 0);
        var rowId = row.GetProperty("id").GetInt32();
        var oldBasket = row.GetProperty("basket").GetString() ?? string.Empty;
        var newBasket = ERPPrototype.Data.WorkOrderBuskets.All
            .First(value => !StringComparer.Ordinal.Equals(value, oldBasket));
        await InsertCustomColumnAsync(page, savedName);
        var savedProp = await GetColumnPropByNameAsync(page, savedName);
        var savedColumn = await GetVisualColumnIndexAsync(page, savedProp);
        var basketColumn = await GetVisualColumnIndexAsync(page, "basket");
        await EditCellAsync(page, 0, savedColumn, "persisted custom value");
        await EditCellAsync(page, 0, basketColumn, newBasket);
        await SaveButton(page).ClickAsync();
        await WaitForCleanSaveAsync(page);

        var persistedDefinition = await GetDbCustomColumnAsync(
            database.ConnectionString,
            savedProp,
            database.Seed.CurrentYear);
        E2ETestAssert.True(persistedDefinition.Id > 0 && persistedDefinition.RowVersion.Length > 0,
            "Successful Save did not persist custom-column Id/RowVersion.");
        var savedRow = await GetDbRowAsync(database.ConnectionString, rowId);
        E2ETestAssert.Equal("persisted custom value",
            CustomColumnValue(savedRow.CustomValuesJson, savedProp),
            "Mixed row + custom-column Save did not persist the custom value.");
        E2ETestAssert.Equal(newBasket, savedRow.Busket,
            "Mixed row + custom-column Save did not persist the ordinary row edit.");

        // Saved structural History is removed, while a new ordinary row edit
        // remains a normal one-step Undo/Redo action.
        var postSaveBasket = oldBasket;
        await EditCellAsync(page, 0, basketColumn, postSaveBasket);
        await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
        E2ETestAssert.Equal(newBasket,
            (await GetVisibleRowAsync(page, 0)).GetProperty("basket").GetString() ?? string.Empty,
            "Ordinary row Undo stopped working after custom-column Save.");
        await page.Locator("#revogrid-gate5b1-redo").ClickAsync();
        E2ETestAssert.Equal(postSaveBasket,
            (await GetVisibleRowAsync(page, 0)).GetProperty("basket").GetString() ?? string.Empty,
            "Ordinary row Redo stopped working after custom-column Save.");
        await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
        E2ETestAssert.True(await HasColumnNamedAsync(page, savedName),
            "Post-Save History resurrected a temporary pre-save column identity.");

        await ReloadGateAsync(page);
        E2ETestAssert.True(await HasColumnNamedAsync(page, savedName),
            "Saved custom column disappeared after reload.");
        var reloadedProp = await GetColumnPropByNameAsync(page, savedName);
        var reloadedRow = await GetVisibleRowAsync(page, 0);
        E2ETestAssert.Equal("persisted custom value",
            reloadedRow.GetProperty(reloadedProp).GetString() ?? string.Empty,
            "Saved custom value disappeared after reload.");

        // A Work Year owns its own Custom Column catalogue. This directly
        // guards the reconnect bug where replaceDataset changed rows/year but
        // left Column Workspace on the previous year's current/baseline.
        await page.GetByTestId("gate5a-year-selector").SelectOptionAsync(
            database.Seed.PreviousYear.ToString(CultureInfo.InvariantCulture));
        await WaitForYearAsync(page, database.Seed.PreviousYear);
        E2ETestAssert.True(!await HasColumnNamedAsync(page, savedName),
            "Current-year custom column leaked into the previous Work Year after dataset switch.");
        E2ETestAssert.True(
            !await DbCustomColumnExistsAsync(
                database.ConnectionString,
                savedProp,
                database.Seed.PreviousYear),
            "Current-year custom column was persisted into the previous Work Year.");

        await page.GetByTestId("gate5a-year-selector").SelectOptionAsync(
            database.Seed.CurrentYear.ToString(CultureInfo.InvariantCulture));
        await WaitForYearAsync(page, database.Seed.CurrentYear);
        E2ETestAssert.True(await HasColumnNamedAsync(page, savedName),
            "Saved current-year custom column did not return after switching back.");
        var returnedProp = await GetColumnPropByNameAsync(page, savedName);
        var returnedRow = await GetVisibleRowAsync(page, 0);
        E2ETestAssert.Equal("persisted custom value",
            returnedRow.GetProperty(returnedProp).GetString() ?? string.Empty,
            "Saved current-year custom value did not return after switching back.");

        // Rename is inline on the custom header name only. It must remain one
        // Column Workspace History action and must not change the stable prop.
        var renameInput = page.Locator(
            $"input[data-erp-column-rename-input=\"{returnedProp}\"]");
        var renameName = "B12 Renamed Custom Column";
        var undoBeforeRename = int.Parse(
            (await page.Locator("#revogrid-gate5b1-undo-count").TextContentAsync())?.Trim() ?? "0",
            CultureInfo.InvariantCulture);
        await page.Locator(
                $"[data-erp-custom-column-name-prop=\"{returnedProp}\"]")
            .DblClickAsync();
        await renameInput.WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });
        E2ETestAssert.Equal(0, await page.Locator(
            $"[data-erp-column-header-selected=\"true\"][data-erp-selected-column-prop=\"{returnedProp}\"]")
            .CountAsync(),
            "Double-click Rename left the custom column header selected.");
        E2ETestAssert.Equal(0, await page.Locator(
            $"[data-erp-column-selected=\"true\"][data-erp-selected-column-prop=\"{returnedProp}\"]")
            .CountAsync(),
            "Double-click Rename left custom-column cells selected.");
        await renameInput.FillAsync(renameName);
        await renameInput.PressAsync("Enter");
        await renameInput.WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Detached,
            Timeout = 10_000
        });
        await page.WaitForFunctionAsync(
            "name => Array.from(document.querySelector('#revogrid-native-gate5a-grid revo-grid').columns ?? []).some(c => String(c?.name ?? '') === name)",
            renameName);
        E2ETestAssert.Equal(
            undoBeforeRename + 1,
            int.Parse(
                (await page.Locator("#revogrid-gate5b1-undo-count").TextContentAsync())?.Trim() ?? "0",
                CultureInfo.InvariantCulture),
            "Rename did not create exactly one History action.");
        E2ETestAssert.Equal(
            returnedProp,
            await GetColumnPropByNameAsync(page, renameName),
            "Rename changed the custom column FieldKey/prop.");
        E2ETestAssert.Equal(renameName,
            (await page.Locator(
                $"[data-erp-custom-column-name-prop=\"{returnedProp}\"]")
                .TextContentAsync())?.Trim(),
            "Rename did not update the visible custom header name.");
        E2ETestAssert.Equal(0, await page.Locator(
            "input[data-erp-column-rename-input]").CountAsync(),
            "Rename editor remained visible after Enter.");

        await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
        E2ETestAssert.True(await HasColumnNamedAsync(page, savedName),
            "Undo did not restore the previous custom column name.");
        E2ETestAssert.Equal(savedName,
            (await page.Locator(
                $"[data-erp-custom-column-name-prop=\"{returnedProp}\"]")
                .TextContentAsync())?.Trim(),
            "Undo did not update the visible custom header name.");
        E2ETestAssert.Equal(0, await page.Locator(
            "input[data-erp-column-rename-input]").CountAsync(),
            "Rename editor reappeared after Undo.");
        await page.Locator("#revogrid-gate5b1-redo").ClickAsync();
        E2ETestAssert.True(await HasColumnNamedAsync(page, renameName),
            "Redo did not reapply the custom column name.");
        E2ETestAssert.Equal(renameName,
            (await page.Locator(
                $"[data-erp-custom-column-name-prop=\"{returnedProp}\"]")
                .TextContentAsync())?.Trim(),
            "Redo did not update the visible custom header name.");
        E2ETestAssert.Equal(0, await page.Locator(
            "input[data-erp-column-rename-input]").CountAsync(),
            "Rename editor reappeared after Redo.");

        // Escape cancels. Filter and core header controls must not enter the
        // inline editor.
        await page.Locator(
                $"[data-erp-custom-column-name-prop=\"{returnedProp}\"]")
            .DblClickAsync();
        await renameInput.FillAsync("temporary rename");
        await renameInput.PressAsync("Escape");
        E2ETestAssert.True(await HasColumnNamedAsync(page, renameName),
            "Escape did not cancel inline rename.");

        var filterButton = await GetVisibleFilterButtonAsync(page, returnedProp);
        await filterButton.DblClickAsync();
        E2ETestAssert.Equal(0, await renameInput.CountAsync(),
            "Double-clicking Filter entered inline rename.");

        var coreHeader = page.GetByText(
            "Work Order Number",
            new PageGetByTextOptions { Exact = true }).Last;
        await coreHeader.DblClickAsync();
        E2ETestAssert.Equal(0, await page.Locator(
            "input[data-erp-column-rename-input]").CountAsync(),
            "Double-clicking a core header entered inline rename.");

        await page.Locator(
                $"[data-erp-custom-column-name-prop=\"{returnedProp}\"]")
            .DblClickAsync();
        await renameInput.FillAsync("   ");
        await renameInput.PressAsync("Enter");
        E2ETestAssert.Equal("true", await renameInput.GetAttributeAsync("aria-invalid"),
            "Blank rename was accepted.");
        // The real Rename input has maxlength=150, so a user cannot actually
        // enter character 151. Verify the real browser behavior instead of
        // expecting an impossible validation state.
        E2ETestAssert.Equal("150", await renameInput.GetAttributeAsync("maxlength"),
            "Rename input no longer exposes the 150-character limit.");
        await renameInput.FillAsync(new string('x', 151));
        E2ETestAssert.Equal(150, (await renameInput.InputValueAsync()).Length,
            "Rename input allowed a real user action to exceed 150 characters.");
        await renameInput.FillAsync("Work Order Number");
        await renameInput.PressAsync("Enter");
        E2ETestAssert.Equal("true", await renameInput.GetAttributeAsync("aria-invalid"),
            "Duplicate rename was accepted.");
        await renameInput.FillAsync(renameName);
        await renameInput.PressAsync("Enter");

        var sortButton = await GetVisibleSortButtonAsync(page, "workOrderValue");
        await sortButton.DblClickAsync();
        E2ETestAssert.Equal(0, await renameInput.CountAsync(),
            "Double-clicking Sort entered inline rename.");

        savedName = renameName;
        await SaveButton(page).ClickAsync();
        await WaitForCleanSaveAsync(page);
        var renamedDefinition = await GetDbCustomColumnAsync(
            database.ConnectionString,
            returnedProp,
            database.Seed.CurrentYear);
        E2ETestAssert.Equal(renameName, renamedDefinition.Name,
            "Save did not persist the renamed custom column.");
        var renamedRow = await GetDbRowAsync(database.ConnectionString, rowId);
        E2ETestAssert.Equal("persisted custom value",
            CustomColumnValue(renamedRow.CustomValuesJson, returnedProp),
            "Rename changed the existing CustomValuesJson value.");
        await ReloadGateAsync(page);
        E2ETestAssert.True(await HasColumnNamedAsync(page, renameName),
            "Saved rename did not survive reload.");
        E2ETestAssert.Equal(returnedProp,
            await GetColumnPropByNameAsync(page, renameName),
            "Reloaded rename did not preserve the FieldKey/prop.");

        // A no-op Enter must close the editor without creating Dirty/History.
        var noOpUndoCount = int.Parse(
            (await page.Locator("#revogrid-gate5b1-undo-count").TextContentAsync())?.Trim() ?? "0",
            CultureInfo.InvariantCulture);
        var noOpInput = page.Locator(
            $"input[data-erp-column-rename-input=\"{returnedProp}\"]");
        await page.Locator(
                $"[data-erp-custom-column-name-prop=\"{returnedProp}\"]")
            .DblClickAsync();
        await noOpInput.PressAsync("Enter");
        await noOpInput.WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Detached,
            Timeout = 10_000
        });
        E2ETestAssert.Equal(noOpUndoCount,
            int.Parse(
                (await page.Locator("#revogrid-gate5b1-undo-count").TextContentAsync())?.Trim() ?? "0",
                CultureInfo.InvariantCulture),
            "No-op Rename created a History action.");
        E2ETestAssert.True(
            !(await GetChangeStateAsync(page)).GetProperty("dirty").GetBoolean(),
            "No-op Rename changed Dirty state.");

        // A rejected value can be corrected to the original name and then
        // accepted as a no-op, which must also close without mutation.
        await page.Locator(
                $"[data-erp-custom-column-name-prop=\"{returnedProp}\"]")
            .DblClickAsync();
        await noOpInput.FillAsync("Work Order Number");
        await noOpInput.PressAsync("Enter");
        E2ETestAssert.Equal("true", await noOpInput.GetAttributeAsync("aria-invalid"),
            "Invalid rename did not remain safely editable.");
        await noOpInput.FillAsync(renameName);
        await noOpInput.PressAsync("Enter");
        await noOpInput.WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Detached,
            Timeout = 10_000
        });
        E2ETestAssert.Equal(noOpUndoCount,
            int.Parse(
                (await page.Locator("#revogrid-gate5b1-undo-count").TextContentAsync())?.Trim() ?? "0",
                CultureInfo.InvariantCulture),
            "Correcting an invalid rename to the original created History.");

        var columnIndex = await GetVisualColumnIndexAsync(page, returnedProp);
        await OpenStructureMenuAsync(page, 0, columnIndex);
        await ClickStructureMenuAsync(page, "Delete Columns...");
        var deleteDialog = VisibleDialog(page, "Delete Columns");
        await deleteDialog.Locator("button:has-text(\"Cancel\")").ClickAsync();
        E2ETestAssert.True(await HasColumnNamedAsync(page, savedName),
            "Cancel deleted the persisted custom column.");

        await OpenStructureMenuAsync(page, 0, columnIndex);
        await ClickStructureMenuAsync(page, "Delete Columns...");
        deleteDialog = VisibleDialog(page, "Delete Columns");
        await deleteDialog.Locator("button:has-text(\"Delete\")").ClickAsync();
        await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
        E2ETestAssert.True(await HasColumnNamedAsync(page, savedName),
            "Undo did not restore the confirmed pre-Save column deletion.");
        await page.Locator("#revogrid-gate5b1-redo").ClickAsync();
        E2ETestAssert.True(!await HasColumnNamedAsync(page, savedName),
            "Redo did not reapply the confirmed pre-Save column deletion.");
        await SaveButton(page).ClickAsync();
        await WaitForCleanSaveAsync(page);

        E2ETestAssert.True(
            !await DbCustomColumnExistsAsync(
                database.ConnectionString,
                returnedProp,
                database.Seed.CurrentYear),
            "Deleted persisted custom column still exists in the current Work Year after Save.");

        var dbAfterColumnDelete = await GetDbRowAsync(database.ConnectionString, rowId);
        E2ETestAssert.Equal(string.Empty,
            CustomColumnValue(dbAfterColumnDelete.CustomValuesJson, returnedProp),
            "Deleting the persisted custom column did not remove its saved row value.");
        E2ETestAssert.True(
            !dbAfterColumnDelete.RowVersion.SequenceEqual(savedRow.RowVersion),
            "Deleting a valued custom column did not advance the affected Work Order RowVersion.");

        var browserAfterColumnDelete = await GetSourceRowByIdAsync(page, rowId);
        E2ETestAssert.Equal(
            Convert.ToBase64String(dbAfterColumnDelete.RowVersion),
            browserAfterColumnDelete.GetProperty("rowVersion").GetString() ?? string.Empty,
            "Browser persistence identity did not reconcile the RowVersion advanced by custom-value cleanup.");

        // The accepted delete must be fully Clean immediately. A refresh must
        // not be required just to escape a stale Save generation or switch year.
        await page.GetByTestId("gate5a-year-selector").SelectOptionAsync(
            database.Seed.PreviousYear.ToString(CultureInfo.InvariantCulture));
        await WaitForYearAsync(page, database.Seed.PreviousYear);
        E2ETestAssert.True(!await HasColumnNamedAsync(page, savedName),
            "Deleted current-year custom column leaked into the previous Work Year after Save.");

        await page.GetByTestId("gate5a-year-selector").SelectOptionAsync(
            database.Seed.CurrentYear.ToString(CultureInfo.InvariantCulture));
        await WaitForYearAsync(page, database.Seed.CurrentYear);
        E2ETestAssert.True(!await HasColumnNamedAsync(page, savedName),
            "Deleted custom column returned after an in-session year round-trip.");

        await ReloadGateAsync(page);
        E2ETestAssert.True(!await HasColumnNamedAsync(page, savedName),
            "Deleted persisted custom column returned after Save + reload.");
    }


    private static async Task AssertMultipleValuedCustomColumnDeleteAsync(
        IPage page,
        E2ETestDatabase database)
    {
        const string firstName = "B12 Multi Delete A";
        const string secondName = "B12 Multi Delete B";
        const string firstValue = "multi-delete-a";
        const string secondValue = "multi-delete-b";

        await SwitchYearAsync(page, database.Seed.CurrentYear);

        var row = await GetVisibleRowAsync(page, 2);
        var rowId = row.GetProperty("id").GetInt32();

        await InsertCustomColumnAsync(page, firstName);
        await InsertCustomColumnAsync(page, secondName);

        var firstProp = await GetColumnPropByNameAsync(page, firstName);
        var secondProp = await GetColumnPropByNameAsync(page, secondName);
        E2ETestAssert.True(
            !string.IsNullOrWhiteSpace(firstProp) &&
            !string.IsNullOrWhiteSpace(secondProp) &&
            firstProp != secondProp,
            "The two Custom Columns did not receive distinct field identities.");

        await EditCellAsync(
            page,
            2,
            await GetVisualColumnIndexAsync(page, firstProp),
            firstValue);
        await EditCellAsync(
            page,
            2,
            await GetVisualColumnIndexAsync(page, secondProp),
            secondValue);

        await SaveButton(page).ClickAsync();
        await WaitForCleanSaveAsync(page);

        var firstDefinition = await GetDbCustomColumnAsync(
            database.ConnectionString,
            firstProp,
            database.Seed.CurrentYear);
        var secondDefinition = await GetDbCustomColumnAsync(
            database.ConnectionString,
            secondProp,
            database.Seed.CurrentYear);
        E2ETestAssert.True(
            firstDefinition.Id > 0 && secondDefinition.Id > 0,
            "The multi-delete fixture columns were not persisted before Delete.");

        var beforeDelete = await GetDbRowAsync(database.ConnectionString, rowId);
        E2ETestAssert.Equal(
            firstValue,
            CustomColumnValue(beforeDelete.CustomValuesJson, firstProp),
            "The first valued Custom Column was not persisted before multi-delete.");
        E2ETestAssert.Equal(
            secondValue,
            CustomColumnValue(beforeDelete.CustomValuesJson, secondProp),
            "The second valued Custom Column was not persisted before multi-delete.");

        // Delete two persisted valued columns before one Save. This is the
        // exact family that previously committed SQL but left the browser
        // carrying stale RowVersions until Refresh.
        await DeleteCustomColumnAsync(page, firstProp);
        await DeleteCustomColumnAsync(page, secondProp);

        await SaveButton(page).ClickAsync();
        await WaitForCleanSaveAsync(page);

        E2ETestAssert.True(
            !await DbCustomColumnExistsAsync(
                database.ConnectionString,
                firstProp,
                database.Seed.CurrentYear) &&
            !await DbCustomColumnExistsAsync(
                database.ConnectionString,
                secondProp,
                database.Seed.CurrentYear),
            "One or both persisted Custom Columns remained in SQL after the combined Delete Save.");

        var afterDelete = await GetDbRowAsync(database.ConnectionString, rowId);
        E2ETestAssert.Equal(
            string.Empty,
            CustomColumnValue(afterDelete.CustomValuesJson, firstProp),
            "The first deleted Custom Column value remained on the Work Order.");
        E2ETestAssert.Equal(
            string.Empty,
            CustomColumnValue(afterDelete.CustomValuesJson, secondProp),
            "The second deleted Custom Column value remained on the Work Order.");
        E2ETestAssert.True(
            !afterDelete.RowVersion.SequenceEqual(beforeDelete.RowVersion),
            "Deleting two valued Custom Columns did not advance the affected Work Order RowVersion.");

        var browserAfterDelete = await GetSourceRowByIdAsync(page, rowId);
        E2ETestAssert.Equal(
            Convert.ToBase64String(afterDelete.RowVersion),
            browserAfterDelete.GetProperty("rowVersion").GetString() ?? string.Empty,
            "The browser did not reconcile the RowVersion produced by multi-column value cleanup.");

        // Clean means the employee can switch year immediately; Refresh is not
        // allowed to hide a stale Save-generation defect.
        await SwitchYearAsync(page, database.Seed.PreviousYear);
        E2ETestAssert.True(
            !await HasColumnNamedAsync(page, firstName) &&
            !await HasColumnNamedAsync(page, secondName),
            "A deleted current-year Custom Column leaked into the destination year.");

        await SwitchYearAsync(page, database.Seed.CurrentYear);
        E2ETestAssert.True(
            !await HasColumnNamedAsync(page, firstName) &&
            !await HasColumnNamedAsync(page, secondName),
            "A deleted Custom Column returned after an in-session year round-trip.");
    }

    private static async Task AssertCustomColumnCrossYearMappingAsync(
        IPage page,
        E2ETestDatabase database)
    {
        var sourceYear = database.Seed.CurrentYear;
        var destinationYear = database.Seed.PreviousYear;

        // 1) Missing destination: two valued source columns must be created in
        // the destination year, preserve their source region/order, and carry
        // their values.
        const string movedFirstName = "B12 Move Layout First";
        const string movedSecondName = "B12 Move Layout Second";

        await SwitchYearAsync(page, sourceYear);
        await InsertCustomColumnAsync(page, movedFirstName);
        await InsertCustomColumnAsync(page, movedSecondName);

        var movedFirstSourceProp = await GetColumnPropByNameAsync(page, movedFirstName);
        var movedSecondSourceProp = await GetColumnPropByNameAsync(page, movedSecondName);
        var firstSourceRegion = await GetCoreNeighborSignatureAsync(page, movedFirstSourceProp);
        var secondSourceRegion = await GetCoreNeighborSignatureAsync(page, movedSecondSourceProp);
        var firstBeforeSecond = await GetLogicalColumnIndexAsync(page, movedFirstSourceProp) <
            await GetLogicalColumnIndexAsync(page, movedSecondSourceProp);

        await EditCellAsync(
            page,
            20,
            await GetVisualColumnIndexAsync(page, movedFirstSourceProp),
            "moved-layout-first");
        await EditCellAsync(
            page,
            20,
            await GetVisualColumnIndexAsync(page, movedSecondSourceProp),
            "moved-layout-second");
        await SaveButton(page).ClickAsync();
        await WaitForCleanSaveAsync(page);

        var missingDestinationMove = await MoveVisibleRowsToYearAsync(
            page,
            destinationYear,
            20);

        await SwitchYearAsync(page, destinationYear);

        var movedFirstDestinationProp = await GetColumnPropByNameAsync(page, movedFirstName);
        var movedSecondDestinationProp = await GetColumnPropByNameAsync(page, movedSecondName);
        E2ETestAssert.True(
            !string.IsNullOrWhiteSpace(movedFirstDestinationProp) &&
            !string.IsNullOrWhiteSpace(movedSecondDestinationProp),
            "Moving valued Custom Columns into a missing destination did not create both definitions.");

        E2ETestAssert.Equal(
            firstSourceRegion,
            await GetCoreNeighborSignatureAsync(page, movedFirstDestinationProp),
            "The first auto-created destination Custom Column moved into a different core-column region.");
        E2ETestAssert.Equal(
            secondSourceRegion,
            await GetCoreNeighborSignatureAsync(page, movedSecondDestinationProp),
            "The second auto-created destination Custom Column moved into a different core-column region.");
        E2ETestAssert.Equal(
            firstBeforeSecond,
            await GetLogicalColumnIndexAsync(page, movedFirstDestinationProp) <
                await GetLogicalColumnIndexAsync(page, movedSecondDestinationProp),
            "Two auto-created destination Custom Columns changed their relative source-year order.");

        var missingDestinationDbRow = await GetDbRowAsync(
            database.ConnectionString,
            missingDestinationMove.Single().DatabaseId);
        E2ETestAssert.Equal(
            "moved-layout-first",
            CustomColumnValue(
                missingDestinationDbRow.CustomValuesJson,
                movedFirstDestinationProp),
            "The first moved Custom Value did not reach its destination definition.");
        E2ETestAssert.Equal(
            "moved-layout-second",
            CustomColumnValue(
                missingDestinationDbRow.CustomValuesJson,
                movedSecondDestinationProp),
            "The second moved Custom Value did not reach its destination definition.");

        // 2) Same name + same type: reuse the existing destination definition.
        const string reuseName = "B12 Reusable Procedure";
        await InsertCustomColumnAsync(page, reuseName, "Text");
        var reuseDestinationProp = await GetColumnPropByNameAsync(page, reuseName);
        await SaveButton(page).ClickAsync();
        await WaitForCleanSaveAsync(page);

        var reuseDestinationBefore = await GetDbCustomColumnAsync(
            database.ConnectionString,
            reuseDestinationProp,
            destinationYear);

        await SwitchYearAsync(page, sourceYear);
        await InsertCustomColumnAsync(page, reuseName, "Text");
        var reuseSourceProp = await GetColumnPropByNameAsync(page, reuseName);
        await EditCellAsync(
            page,
            25,
            await GetVisualColumnIndexAsync(page, reuseSourceProp),
            "reuse-value");
        await SaveButton(page).ClickAsync();
        await WaitForCleanSaveAsync(page);

        var reuseMove = await MoveVisibleRowsToYearAsync(page, destinationYear, 25);
        await SwitchYearAsync(page, destinationYear);

        E2ETestAssert.Equal(
            1,
            await CountColumnsNamedAsync(page, reuseName),
            "Same-name/same-type move created a duplicate destination Custom Column.");
        E2ETestAssert.Equal(
            reuseDestinationProp,
            await GetColumnPropByNameAsync(page, reuseName),
            "Same-name/same-type move did not reuse the existing destination field identity.");

        var reuseDestinationAfter = await GetDbCustomColumnAsync(
            database.ConnectionString,
            reuseDestinationProp,
            destinationYear);
        E2ETestAssert.Equal(
            reuseDestinationBefore.LayoutOrder,
            reuseDestinationAfter.LayoutOrder,
            "Compatible destination reuse unexpectedly moved the destination column.");

        var reuseDbRow = await GetDbRowAsync(
            database.ConnectionString,
            reuseMove.Single().DatabaseId);
        E2ETestAssert.Equal(
            "reuse-value",
            CustomColumnValue(reuseDbRow.CustomValuesJson, reuseDestinationProp),
            "Compatible destination reuse did not remap the moved value.");
        E2ETestAssert.Equal(
            string.Empty,
            CustomColumnValue(reuseDbRow.CustomValuesJson, reuseSourceProp),
            "Compatible destination reuse left the source-year field key on the moved row.");

        // 3) Same name + different type: one safe destination Text definition
        // must be created and reused for a two-row batch. One Save confirmation
        // must cover the whole move.
        const string conflictName = "B12 Procedure Conflict";
        await InsertCustomColumnAsync(page, conflictName, "Money");
        var conflictMoneyProp = await GetColumnPropByNameAsync(page, conflictName);
        await SaveButton(page).ClickAsync();
        await WaitForCleanSaveAsync(page);
        var conflictMoneyBefore = await GetDbCustomColumnAsync(
            database.ConnectionString,
            conflictMoneyProp,
            destinationYear);

        await SwitchYearAsync(page, sourceYear);
        await InsertCustomColumnAsync(page, conflictName, "Text");
        var conflictSourceProp = await GetColumnPropByNameAsync(page, conflictName);

        var firstConflictRow = await GetVisibleRowAsync(page, 30);
        var secondConflictRow = await GetVisibleRowAsync(page, 31);
        var firstConflictId = firstConflictRow.GetProperty("id").GetInt32();
        var secondConflictId = secondConflictRow.GetProperty("id").GetInt32();

        await EditCellAsync(
            page,
            30,
            await GetVisualColumnIndexAsync(page, conflictSourceProp),
            "conflict-first");
        await EditCellAsync(
            page,
            31,
            await GetVisualColumnIndexAsync(page, conflictSourceProp),
            "conflict-second");
        await SaveButton(page).ClickAsync();
        await WaitForCleanSaveAsync(page);

        await MoveVisibleRowsToYearAsync(page, destinationYear, 30, 31);
        await SwitchYearAsync(page, destinationYear);

        var safeConflictName = $"{conflictName} ({sourceYear})";
        E2ETestAssert.Equal(
            1,
            await CountColumnsNamedAsync(page, conflictName),
            "The original different-type destination Custom Column was duplicated.");
        E2ETestAssert.Equal(
            1,
            await CountColumnsNamedAsync(page, safeConflictName),
            "A two-row name/type conflict created more than one safe destination Custom Column.");

        var safeConflictProp = await GetColumnPropByNameAsync(page, safeConflictName);
        var safeConflictDefinition = await GetDbCustomColumnAsync(
            database.ConnectionString,
            safeConflictProp,
            destinationYear);
        E2ETestAssert.Equal(
            "Text",
            safeConflictDefinition.DataType,
            "The safe destination definition did not preserve the source Text type.");

        var conflictMoneyAfter = await GetDbCustomColumnAsync(
            database.ConnectionString,
            conflictMoneyProp,
            destinationYear);
        E2ETestAssert.Equal(
            conflictMoneyBefore.LayoutOrder,
            conflictMoneyAfter.LayoutOrder,
            "Resolving a name/type conflict moved the existing destination definition.");

        var firstConflictStored = await GetDbRowAsync(
            database.ConnectionString,
            firstConflictId);
        var secondConflictStored = await GetDbRowAsync(
            database.ConnectionString,
            secondConflictId);
        E2ETestAssert.Equal(
            "conflict-first",
            CustomColumnValue(firstConflictStored.CustomValuesJson, safeConflictProp),
            "The first conflicting moved row did not use the shared safe destination definition.");
        E2ETestAssert.Equal(
            "conflict-second",
            CustomColumnValue(secondConflictStored.CustomValuesJson, safeConflictProp),
            "The second conflicting moved row did not use the same shared safe destination definition.");

        // 4) Blank value: owning a source definition is not enough to create a
        // destination definition. Only a non-empty moved value may do that.
        const string blankName = "B12 Blank Move";
        await SwitchYearAsync(page, sourceYear);
        await InsertCustomColumnAsync(page, blankName, "Text");
        await SaveButton(page).ClickAsync();
        await WaitForCleanSaveAsync(page);

        var blankMove = await MoveVisibleRowsToYearAsync(page, destinationYear, 35);
        await SwitchYearAsync(page, destinationYear);

        E2ETestAssert.True(
            !await HasColumnNamedAsync(page, blankName),
            "A blank moved Custom Value created a destination Custom Column.");
        E2ETestAssert.Equal(
            0,
            await CountDbCustomColumnsByNameAsync(
                database.ConnectionString,
                destinationYear,
                blankName),
            "A blank moved Custom Value persisted a destination Custom Column in SQL.");

        var blankStored = await GetDbRowAsync(
            database.ConnectionString,
            blankMove.Single().DatabaseId);
        E2ETestAssert.Equal(
            0,
            CustomColumnValueCount(blankStored.CustomValuesJson),
            "The blank-value move unexpectedly persisted a Custom Value payload.");

        await SwitchYearAsync(page, sourceYear);
    }

    private static async Task AssertCustomColumnViewStateIsolationAsync(
        IPage page,
        E2ETestDatabase database)
    {
        const string filterColumnName = "B12 Year View Filter";
        const string sortColumnName = "B12 Year View Sort";
        const string filterValue = "only-current-year-filter";
        const string sortValue = "12345.67";
        var sourceYear = database.Seed.CurrentYear;
        var destinationYear = database.Seed.PreviousYear;

        await SwitchYearAsync(page, sourceYear);
        await InsertCustomColumnAsync(page, filterColumnName, "Text");
        await InsertCustomColumnAsync(page, sortColumnName, "Money");
        var filterProp = await GetColumnPropByNameAsync(page, filterColumnName);
        var sortProp = await GetColumnPropByNameAsync(page, sortColumnName);

        await EditCellAsync(
            page,
            0,
            await GetVisualColumnIndexAsync(page, filterProp),
            filterValue);
        await EditCellAsync(
            page,
            0,
            await GetVisualColumnIndexAsync(page, sortProp),
            sortValue);
        await SaveButton(page).ClickAsync();
        await WaitForCleanSaveAsync(page);

        var sort = await GetVisibleSortButtonAsync(page, sortProp);
        await EnsureSortClearedAsync(page, sort, sortProp);
        await ClickSortAndWaitForLabelChangeAsync(page, sort, sortProp);
        var sortedLabel = await sort.GetAttributeAsync("aria-label") ?? string.Empty;

        var sourceCount = await GetSourceCountAsync(page);
        await ApplySingleFilterAsync(page, filterProp, filterValue);
        var filteredCount = await GetVisibleSourceCountAsync(page);
        E2ETestAssert.True(
            filteredCount > 0 && filteredCount < sourceCount,
            "The Custom Text filter did not create a meaningful filtered source-year view.");

        await SwitchYearAsync(page, destinationYear);
        E2ETestAssert.True(
            !await HasColumnNamedAsync(page, filterColumnName),
            "The source-year Custom Text Filter column leaked into the destination year.");
        E2ETestAssert.True(
            !await HasColumnNamedAsync(page, sortColumnName),
            "The source-year Custom Money Sort column leaked into the destination year.");
        E2ETestAssert.Equal(
            await GetSourceCountAsync(page),
            await GetVisibleSourceCountAsync(page),
            "The source year's Custom Column Filter leaked into the destination dataset.");
        E2ETestAssert.Equal(
            0,
            await page.Locator(
                $".erp-revo-sort-button[data-erp-sort-prop=\"{sortProp}\"]").CountAsync(),
            "The source year's Custom Money Sort control leaked into a year that does not own the column.");

        await SwitchYearAsync(page, sourceYear);
        E2ETestAssert.True(
            await HasColumnNamedAsync(page, filterColumnName),
            "Returning to the source year did not restore its Custom Text Filter column.");
        E2ETestAssert.True(
            await HasColumnNamedAsync(page, sortColumnName),
            "Returning to the source year did not restore its Custom Money Sort column.");
        E2ETestAssert.Equal(
            filteredCount,
            await GetVisibleSourceCountAsync(page),
            "Returning to the source year did not restore its own Custom Column Filter state.");

        var restoredSort = await GetVisibleSortButtonAsync(page, sortProp);
        E2ETestAssert.Equal(
            sortedLabel,
            await restoredSort.GetAttributeAsync("aria-label") ?? string.Empty,
            "Returning to the source year did not restore its own Custom Money Sort state.");

        await ClearFilterAsync(page, filterProp);
        await EnsureSortClearedAsync(page, restoredSort, sortProp);
    }

    private static async Task AssertCustomColumnConcurrencyRejectsAsync(
        IPage page,
        E2ETestDatabase database)
    {
        const string columnName = "B12 Structural Concurrency";
        var workYear = database.Seed.CurrentYear;

        await SwitchYearAsync(page, workYear);
        await InsertCustomColumnAsync(page, columnName, "Text");
        var prop = await GetColumnPropByNameAsync(page, columnName);
        await SaveButton(page).ClickAsync();
        await WaitForCleanSaveAsync(page);

        var staleDefinition = await GetDbCustomColumnAsync(
            database.ConnectionString,
            prop,
            workYear);
        await BumpCustomColumnRowVersionExternallyAsync(
            database.ConnectionString,
            staleDefinition.Id);

        await DeleteCustomColumnAsync(page, prop);
        await SaveButton(page).ClickAsync();
        await WaitForOperationMessageAsync(page, "another session");

        E2ETestAssert.True(
            await DbCustomColumnExistsAsync(
                database.ConnectionString,
                prop,
                workYear),
            "A stale Custom Column delete partially removed the authoritative SQL definition.");
        E2ETestAssert.True(
            (await GetChangeStateAsync(page)).GetProperty("dirty").GetBoolean(),
            "Structural concurrency rejection incorrectly marked the employee's local deletion Clean.");

        // Refresh is recovery after a real concurrency rejection, not a hidden
        // requirement for a successful Save.
        await ReloadGateAsync(page);
        E2ETestAssert.True(
            await HasColumnNamedAsync(page, columnName),
            "Reload after structural concurrency rejection did not restore the authoritative definition.");
        E2ETestAssert.True(
            !(await GetChangeStateAsync(page)).GetProperty("dirty").GetBoolean(),
            "Reload after structural concurrency rejection did not return to a clean authoritative baseline.");
    }

    private static async Task AssertEditDuringSaveAndFilterSnapshotAsync(
        IPage page,
        E2ETestDatabase database)
    {
        var rowIndex = 8;
        var row = await GetVisibleRowAsync(page, rowIndex);
        var id = row.GetProperty("id").GetInt32();
        var clientKey = row.GetProperty("clientKey").GetString() ?? string.Empty;
        var workType = row.GetProperty("workTypeCode").GetString() ?? string.Empty;
        var workOrderValue = ReadDecimalProperty(row, "workOrderValue");
        var partialColumn = await GetVisualColumnIndexAsync(page, "partialAmount");
        var sent = Math.Round(workOrderValue * 0.32m, 2);
        var newer = Math.Round(workOrderValue * 0.43m, 2);
        if (sent == newer)
        {
            newer += 1m;
        }

        await EditCellAsync(page, rowIndex, partialColumn, Format(sent));

        await using var rowLock = await SqlRowLock.AcquireAsync(database.ConnectionString, id);
        await SaveButton(page).ClickAsync();
        await WaitForSaveActiveAsync(page);

        await EditCellAsync(page, rowIndex, partialColumn, Format(newer));

        var filterValue = workType == "401" ? "402" : "401";
        await ApplySingleWorkTypeFilterAsync(page, filterValue);
        E2ETestAssert.Equal(-1, await FindVisibleIndexByClientKeyAsync(page, clientKey),
            "The test Filter did not hide the row while Save was blocked in SQL.");

        await rowLock.ReleaseAsync();
        await WaitForOperationMessageAsync(page, "تغييرات أحدث ما زالت Dirty");

        var databaseAfterFirstSave = await GetDbRowAsync(database.ConnectionString, id);
        E2ETestAssert.Equal(sent, databaseAfterFirstSave.PartialAmount ?? 0m,
            "The DB did not receive the exact earlier Save generation after the row became filtered out.");

        var sourceRow = await GetSourceRowByClientKeyAsync(page, clientKey);
        E2ETestAssert.Equal(newer, ReadDecimalProperty(sourceRow, "partialAmount"),
            "The newer browser edit was overwritten by the earlier Save result.");
        E2ETestAssert.True((await GetChangeStateAsync(page)).GetProperty("dirty").GetBoolean(),
            "The newer browser edit was incorrectly marked Clean.");

        await ClearWorkTypeFilterAsync(page);
        var visibleIndex = await FindVisibleIndexByClientKeyAsync(page, clientKey);
        E2ETestAssert.True(visibleIndex >= 0,
            "Clearing Filter did not restore the row that still owns the newer Dirty edit.");

        await SaveButton(page).ClickAsync();
        await WaitForCleanSaveAsync(page);

        var databaseAfterSecondSave = await GetDbRowAsync(database.ConnectionString, id);
        E2ETestAssert.Equal(newer, databaseAfterSecondSave.PartialAmount ?? 0m,
            "The newer edit did not persist on the second B12 Save.");
    }

    private static async Task<NewRowResult> AssertEmptyNewRowThenRealAddAsync(
        IPage page,
        E2ETestDatabase database,
        DatabaseFixture fixture)
    {
        var baselineCount = await GetDbYearCountAsync(database.ConnectionString, database.Seed.CurrentYear);
        var firstBefore = await GetDbRowAsync(database.ConnectionString, fixture.FirstRowId);
        var secondBefore = await GetDbRowAsync(database.ConnectionString, fixture.SecondRowId);

        await OpenStructureMenuAsync(page, 0, 0);
        await ClickStructureMenuAsync(page, "Insert Rows...");
        var insertDialog = VisibleDialog(page, "Insert Rows");
        await insertDialog.Locator("input[type=\"number\"]").FillAsync("1");
        await insertDialog.Locator("button:has-text(\"Insert Below\")").ClickAsync();

        await page.WaitForFunctionAsync(
            "async expected => (await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getSource('rgRow')).length === expected",
            baselineCount + 1,
            new PageWaitForFunctionOptions { Timeout = 15_000 });

        var newRow = await GetOnlyUnsavedRowAsync(page);
        var clientKey = newRow.GetProperty("clientKey").GetString() ?? string.Empty;
        E2ETestAssert.True(!string.IsNullOrWhiteSpace(clientKey),
            "Inserted B12 row did not receive a stable ClientKey.");

        await SaveButton(page).ClickAsync();
        await WaitForOperationMessageAsync(page, "أكمل بيانات الصفوف الجديدة أو احذف الصفوف الفارغة");
        E2ETestAssert.Equal(baselineCount,
            await GetDbYearCountAsync(database.ConnectionString, database.Seed.CurrentYear),
            "An empty new row reached SQL instead of being blocked before Save.");
        E2ETestAssert.True((await GetChangeStateAsync(page)).GetProperty("dirty").GetBoolean(),
            "Blocked empty new row was incorrectly marked Clean.");

        var visibleIndex = await FindVisibleIndexByClientKeyAsync(page, clientKey);
        E2ETestAssert.True(visibleIndex >= 0, "Inserted new row is not visible for real employee editing.");

        var workOrderNumberColumn = await GetVisualColumnIndexAsync(page, "workOrderNumber");
        var workTypeColumn = await GetVisualColumnIndexAsync(page, "workTypeCode");
        var assignmentDateColumn = await GetVisualColumnIndexAsync(page, "assignmentDate");
        var valueColumn = await GetVisualColumnIndexAsync(page, "workOrderValue");
        var basketColumn = await GetVisualColumnIndexAsync(page, "basket");
        var customColumn = await GetVisualColumnIndexAsync(page, CustomFieldKey);

        const string canonicalNumber = "929999999";
        const string typedNumber = " 929999999 ";
        var assignmentDate = $"15/06/{database.Seed.CurrentYear}";

        await EditCellAsync(page, visibleIndex, workOrderNumberColumn, typedNumber);
        await EditCellAsync(page, visibleIndex, workTypeColumn, "401");
        await EditCellAsync(page, visibleIndex, assignmentDateColumn, assignmentDate);
        await EditCellAsync(page, visibleIndex, valueColumn, "12345.67");
        await EditCellAsync(page, visibleIndex, basketColumn, "تحت التنفيذ");
        await EditCellAsync(page, visibleIndex, customColumn, "B12 custom persisted");

        var firstGridOrder = await GetSourceDisplayOrderByIdAsync(page, fixture.FirstRowId);
        var secondGridOrder = await GetSourceDisplayOrderByIdAsync(page, fixture.SecondRowId);
        E2ETestAssert.True(firstGridOrder != firstBefore.DisplayOrder || secondGridOrder != secondBefore.DisplayOrder,
            "Dense DisplayOrder fixture did not force structural adjustment of an existing persisted row.");

        await SaveButton(page).ClickAsync();
        await WaitForCleanSaveAsync(page);

        var inserted = await GetDbRowByIdentityAsync(
            database.ConnectionString,
            canonicalNumber,
            "401");
        E2ETestAssert.True(inserted is not null,
            "Completed new Revo row was not inserted into SQL.");
        E2ETestAssert.True(inserted!.Id > 0 && inserted.RowVersion.Length == 8,
            "New B12 row did not receive persistent Id/RowVersion.");
        E2ETestAssert.Contains("B12 custom persisted", inserted.CustomValuesJson,
            "Custom Value did not persist through CustomValuesJson.");

        var reconciled = await GetSourceRowByClientKeyAsync(page, clientKey);
        E2ETestAssert.Equal(inserted.Id, reconciled.GetProperty("id").GetInt32(),
            "Server Id was not reconciled back to the same ClientKey.");
        E2ETestAssert.Equal(canonicalNumber,
            reconciled.GetProperty("workOrderNumber").GetString() ?? string.Empty,
            "Server canonical Work Order Number did not replace the unchanged sent value.");
        E2ETestAssert.True(!string.IsNullOrWhiteSpace(reconciled.GetProperty("rowVersion").GetString()),
            "Server RowVersion was not reconciled into the new Revo row.");
        E2ETestAssert.True(!(await GetChangeStateAsync(page)).GetProperty("dirty").GetBoolean(),
            "First successful Save of a new row did not make row and cell baselines fully Clean.");

        var firstAfter = await GetDbRowAsync(database.ConnectionString, fixture.FirstRowId);
        var secondAfter = await GetDbRowAsync(database.ConnectionString, fixture.SecondRowId);
        E2ETestAssert.Equal(firstGridOrder, firstAfter.DisplayOrder,
            "Existing row DisplayOrder adjustment was not persisted.");
        E2ETestAssert.Equal(secondGridOrder, secondAfter.DisplayOrder,
            "Second existing row DisplayOrder adjustment was not persisted.");
        E2ETestAssert.Equal(firstBefore.WorkOrderNumber, firstAfter.WorkOrderNumber,
            "Structural DisplayOrder-only Save unexpectedly changed Work Order Number.");
        E2ETestAssert.Equal(firstBefore.WorkTypeCode, firstAfter.WorkTypeCode,
            "Structural DisplayOrder-only Save unexpectedly changed Work Type.");
        E2ETestAssert.Equal(firstBefore.WorkOrderValue, firstAfter.WorkOrderValue,
            "Structural DisplayOrder-only Save unexpectedly changed Work Order Value.");
        E2ETestAssert.Equal(secondBefore.WorkOrderNumber, secondAfter.WorkOrderNumber,
            "Structural DisplayOrder-only Save unexpectedly changed the neighboring Work Order Number.");

        return new NewRowResult(clientKey, inserted.Id, canonicalNumber);
    }

    private static async Task AssertPersistedDeleteAsync(
        IPage page,
        E2ETestDatabase database,
        NewRowResult row)
    {
        var visibleIndex = await FindVisibleIndexByClientKeyAsync(page, row.ClientKey);
        E2ETestAssert.True(visibleIndex >= 0, "Saved new row disappeared before the Delete test.");
        await WaitForRenderedRowHeaderAsync(page, visibleIndex);
        await RowHeader(page, visibleIndex).ClickAsync();
        await WaitForRenderedCellAsync(page, visibleIndex, 0);
        await DataCell(page, visibleIndex, 0).ClickAsync(
            new LocatorClickOptions { Button = MouseButton.Right });
        await page.Locator(".erp-revo-structure-menu:not([hidden])").WaitForAsync(
            new LocatorWaitForOptions { State = WaitForSelectorState.Visible, Timeout = 10_000 });
        await ClickStructureMenuAsync(page, "Delete Rows...");
        var dialog = VisibleDialog(page, "Delete Rows");
        await dialog.Locator("button:has-text(\"Delete\")").ClickAsync();

        await using var rowLock = await SqlRowLock.AcquireAsync(
            database.ConnectionString,
            row.DatabaseId);

        await SaveButton(page).ClickAsync();
        await WaitForSaveActiveAsync(page);

        // Real employee action while the older Delete generation is blocked in
        // SQL: Undo restores the row. The accepted SQL Delete must not erase
        // this newer browser state or leave it carrying a dead DB identity.
        await page.Locator("#revogrid-gate5b1-undo").ClickAsync();
        await page.WaitForFunctionAsync(
            "async key => (await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getSource('rgRow')).some(row => String(row?.clientKey ?? '') === key)",
            row.ClientKey,
            new PageWaitForFunctionOptions { Timeout = 15_000 });

        await rowLock.ReleaseAsync();
        await WaitForOperationMessageAsync(page, "تم الحفظ في قاعدة البيانات", timeoutMs: 60_000);
        await page.WaitForFunctionAsync(
            "() => document.querySelector('#revogrid-gate5b11-save-status')?.dataset?.saveActive === 'false'",
            null,
            new PageWaitForFunctionOptions { Timeout = 60_000 });

        E2ETestAssert.True(!await DbRowExistsAsync(database.ConnectionString, row.DatabaseId),
            "The older persisted row still exists in SQL after the accepted Delete snapshot.");
        E2ETestAssert.True(await SourceContainsClientKeyAsync(page, row.ClientKey),
            "Accepted Delete incorrectly removed the row restored by a newer in-flight Undo.");

        var restored = await GetSourceRowByClientKeyAsync(page, row.ClientKey);
        E2ETestAssert.Equal(0, restored.GetProperty("id").GetInt32(),
            "Undo after committed Delete kept the database Id that SQL already deleted.");
        E2ETestAssert.True(string.IsNullOrWhiteSpace(restored.GetProperty("rowVersion").GetString()),
            "Undo after committed Delete kept the RowVersion that SQL already deleted.");
        E2ETestAssert.True((await GetChangeStateAsync(page)).GetProperty("dirty").GetBoolean(),
            "The newer Undo was not kept Dirty after the older Delete snapshot was accepted.");

        // The restored row must now behave exactly like a new unsaved row:
        // same ClientKey, fresh database Id/RowVersion, then Clean.
        await SaveButton(page).ClickAsync();
        await WaitForCleanSaveAsync(page, timeoutMs: 60_000);

        var readded = await GetSourceRowByClientKeyAsync(page, row.ClientKey);
        var newDatabaseId = readded.GetProperty("id").GetInt32();
        E2ETestAssert.True(newDatabaseId > 0 && newDatabaseId != row.DatabaseId,
            "Restored row did not receive a fresh database Id when saved as a new row.");
        E2ETestAssert.True(!string.IsNullOrWhiteSpace(readded.GetProperty("rowVersion").GetString()),
            "Restored row did not receive a fresh RowVersion after re-save.");
        E2ETestAssert.True(await DbRowExistsAsync(database.ConnectionString, newDatabaseId),
            "Restored row was not inserted back into SQL under its fresh identity.");
        E2ETestAssert.True(!(await GetChangeStateAsync(page)).GetProperty("dirty").GetBoolean(),
            "Restored row remained Dirty after its fresh Add was accepted.");
    }

    private static async Task AssertCrossYearCancelThenContinueAsync(
        IPage page,
        E2ETestDatabase database)
    {
        var rowIndex = 12;
        var row = await GetVisibleRowAsync(page, rowIndex);
        var id = row.GetProperty("id").GetInt32();
        var clientKey = row.GetProperty("clientKey").GetString() ?? string.Empty;
        var workOrderNumber = row.GetProperty("workOrderNumber").GetString() ?? string.Empty;
        var assignmentColumn = await GetVisualColumnIndexAsync(page, "assignmentDate");
        var targetDate = $"15/07/{database.Seed.PreviousYear}";

        await EditCellAsync(page, rowIndex, assignmentColumn, targetDate);

        await ClickSaveHandlingConfirmAsync(page, accept: false);
        await WaitForOperationMessageAsync(page, "تم إلغاء الحفظ");
        var afterCancel = await GetDbRowAsync(database.ConnectionString, id);
        E2ETestAssert.Equal(database.Seed.CurrentYear, afterCancel.WorkYear,
            "Cancel on cross-year confirmation still changed SQL WorkYear.");
        E2ETestAssert.True((await GetChangeStateAsync(page)).GetProperty("dirty").GetBoolean(),
            "Cancel on cross-year Save discarded the employee's Dirty edit.");

        await ClickSaveHandlingConfirmAsync(page, accept: true);
        await page.WaitForFunctionAsync(
            "async key => !(await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getSource('rgRow')).some(row => String(row?.clientKey ?? '') === key)",
            clientKey,
            new PageWaitForFunctionOptions { Timeout = 30_000 });
        await WaitForOperationMessageAsync(page, "تم الحفظ في قاعدة البيانات");

        var afterMove = await GetDbRowAsync(database.ConnectionString, id);
        E2ETestAssert.Equal(database.Seed.PreviousYear, afterMove.WorkYear,
            "Confirmed cross-year Save did not move SQL WorkYear transactionally.");
        E2ETestAssert.True(!await SourceContainsClientKeyAsync(page, clientKey),
            "Cross-year row remained in the source-year Revo dataset after committed move.");
        E2ETestAssert.Equal("0", (await page.Locator("#revogrid-gate5b1-undo-count").TextContentAsync())?.Trim() ?? string.Empty,
            "Successful cross-year Save did not clear local Undo history.");
        E2ETestAssert.Equal("0", (await page.Locator("#revogrid-gate5b1-redo-count").TextContentAsync())?.Trim() ?? string.Empty,
            "Successful cross-year Save did not clear local Redo history.");

        await page.GetByTestId("gate5a-year-selector").SelectOptionAsync(database.Seed.PreviousYear.ToString(CultureInfo.InvariantCulture));
        await WaitForYearAsync(page, database.Seed.PreviousYear);
        E2ETestAssert.True(await SourceContainsWorkOrderNumberAsync(page, workOrderNumber),
            "Moved Work Order did not appear after the employee switched to the destination year.");

        await page.GetByTestId("gate5a-year-selector").SelectOptionAsync(database.Seed.CurrentYear.ToString(CultureInfo.InvariantCulture));
        await WaitForYearAsync(page, database.Seed.CurrentYear);
    }

    private static async Task AssertLargeDayLongSaveStreamsAsync(
        IPage page,
        E2ETestDatabase database)
    {
        var modulePath = await ResolveActiveModulePathAsync(page);
        var workTypeColumn = await GetVisualColumnIndexAsync(page, "workTypeCode");
        E2ETestAssert.True(workTypeColumn >= 0, "Could not resolve Work Type column for the large Save test.");

        var firstRow = await GetVisibleRowAsync(page, 0);
        var firstId = firstRow.GetProperty("id").GetInt32();

        // One real edit supplies a value to copy. The remaining 1,199 cells are
        // filled by native Revo range selection + real Ctrl+C/Ctrl+V, matching
        // how an employee performs a large Excel-style edit.
        await EditCellAsync(page, 0, workTypeColumn, "499");
        await WaitForRenderedCellAsync(page, 0, workTypeColumn);
        await DataCell(page, 0, workTypeColumn).ClickAsync();
        await page.Keyboard.PressAsync("Control+C");
        await page.WaitForTimeoutAsync(120);

        await WaitForRenderedCellAsync(page, 1, workTypeColumn);
        await DataCell(page, 1, workTypeColumn).ClickAsync();
        await WaitForRenderedCellAsync(page, LargeSaveRowCount - 1, workTypeColumn);
        await page.Keyboard.DownAsync("Shift");
        try
        {
            await DataCell(page, LargeSaveRowCount - 1, workTypeColumn).ClickAsync();
        }
        finally
        {
            await page.Keyboard.UpAsync("Shift");
        }
        await page.Keyboard.PressAsync("Control+V");

        await page.WaitForFunctionAsync(
            $$"""
            async expected => {
                const state = (await import('{{modulePath}}')).getChangeState('{{GridHostId}}');
                return Number(state?.dirtyCount ?? 0) >= expected;
            }
            """,
            LargeSaveRowCount,
            new PageWaitForFunctionOptions { Timeout = 45_000 });

        await using var rowLock = await SqlRowLock.AcquireAsync(
            database.ConnectionString,
            firstId);

        await SaveButton(page).ClickAsync();
        await WaitForSaveActiveAsync(page);

        await page.WaitForFunctionAsync(
            $$"""
            async () => {
                const module = await import('{{modulePath}}');
                try {
                    const saveId = module.getActiveSaveId('{{GridHostId}}');
                    return saveId && Number(module.getActiveSavePersistenceMetrics('{{GridHostId}}', saveId)?.bytes ?? 0) > 0;
                } catch {
                    return false;
                }
            }
            """,
            null,
            new PageWaitForFunctionOptions { Timeout = 20_000 });

        var diagnosticsJson = await page.EvaluateAsync<string>(
            $$"""
            async () => {
                const module = await import('{{modulePath}}');
                const saveId = module.getActiveSaveId('{{GridHostId}}');
                return JSON.stringify({
                    projection: module.getActiveSavePersistenceMetrics('{{GridHostId}}', saveId),
                    full: module.getActiveSaveContractMetrics('{{GridHostId}}', saveId)
                });
            }
            """);

        using var diagnosticsDocument = JsonDocument.Parse(diagnosticsJson);
        var diagnostics = diagnosticsDocument.RootElement;
        var projectionBytes = diagnostics.GetProperty("projection").GetProperty("bytes").GetInt64();
        var fullBytes = diagnostics.GetProperty("full").GetProperty("contractJsonBytes").GetInt64();

        E2ETestAssert.True(
            projectionBytes > 32 * 1024,
            "The large Save did not exercise a payload larger than the normal SignalR message limit.");
        E2ETestAssert.True(
            projectionBytes < fullBytes,
            $"Persistence projection was not smaller than the browser-local B11 contract ({projectionBytes} vs {fullBytes} bytes).");

        await rowLock.ReleaseAsync();
        await WaitForCleanSaveAsync(page, timeoutMs: 120_000);

        E2ETestAssert.Equal(
            LargeSaveRowCount,
            await CountDbRowsByWorkTypeAsync(
                database.ConnectionString,
                database.Seed.CurrentYear,
                "499"),
            "The large streamed Save did not persist all 1,200 real range edits.");

        var state = await GetChangeStateAsync(page);
        E2ETestAssert.True(
            !state.GetProperty("dirty").GetBoolean(),
            "The 1,200-row streamed Save did not return the sheet to Clean.");
    }

    private static async Task AssertConcurrencyRejectKeepsDirtyAsync(
        IPage page,
        E2ETestDatabase database)
    {
        var rowIndex = 15;
        var row = await GetVisibleRowAsync(page, rowIndex);
        var id = row.GetProperty("id").GetInt32();
        var workOrderValue = ReadDecimalProperty(row, "workOrderValue");
        var valueColumn = await GetVisualColumnIndexAsync(page, "workOrderValue");
        var next = Math.Round(workOrderValue + 777.77m, 2);

        await BumpRowVersionExternallyAsync(database.ConnectionString, id);
        var dbBeforeRejectedSave = await GetDbRowAsync(database.ConnectionString, id);

        // The preceding 1,200-row real-user range edit intentionally leaves the
        // virtualized viewport near row 1,200. EditCellAsync owns deterministic
        // viewport positioning before the real employee-style cell interaction.
        await EditCellAsync(page, rowIndex, valueColumn, Format(next));
        await SaveButton(page).ClickAsync();
        await WaitForOperationMessageAsync(page, "تم تعديل/حذف أمر عمل من جلسة أخرى");

        var dbAfterRejectedSave = await GetDbRowAsync(database.ConnectionString, id);
        E2ETestAssert.Equal(dbBeforeRejectedSave.WorkOrderValue, dbAfterRejectedSave.WorkOrderValue,
            "Concurrency rejection partially wrote the stale employee value to SQL.");
        E2ETestAssert.True((await GetChangeStateAsync(page)).GetProperty("dirty").GetBoolean(),
            "Concurrency rejection discarded the employee's Dirty work.");
    }

    private static async Task<DatabaseFixture> PrepareDatabaseFixtureAsync(E2ETestDatabase database)
    {
        await using var connection = new SqlConnection(database.ConnectionString);
        await connection.OpenAsync();

        var rows = new List<int>();
        await using (var command = connection.CreateCommand())
        {
            command.CommandText =
                "SELECT TOP (3) [Id] FROM [WorkOrders] WHERE [WorkYear] = @Year ORDER BY [DisplayOrder], [Id];";
            command.Parameters.AddWithValue("@Year", database.Seed.CurrentYear);
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                rows.Add(reader.GetInt32(0));
            }
        }

        E2ETestAssert.True(rows.Count == 3, "B12 E2E fixture could not resolve the first three current-year rows.");

        await using (var command = connection.CreateCommand())
        {
            command.CommandText =
                "UPDATE [WorkOrders] SET [DisplayOrder] = CASE WHEN [Id] = @First THEN 1 WHEN [Id] = @Second THEN 2 ELSE [DisplayOrder] END WHERE [Id] IN (@First, @Second);";
            command.Parameters.AddWithValue("@First", rows[0]);
            command.Parameters.AddWithValue("@Second", rows[1]);
            await command.ExecuteNonQueryAsync();
        }

        await using (var command = connection.CreateCommand())
        {
            command.CommandText =
                """
                INSERT INTO [CustomColumnDefinitions]
                    ([DepartmentId], [WorkYear], [FieldKey], [Name], [DataType], [LayoutOrder], [CreatedAt], [CreatedBy])
                SELECT TOP (1)
                    [DepartmentId], [WorkYear], @FieldKey, @Name, 1, @LayoutOrder, SYSUTCDATETIME(), [CreatedBy]
                FROM [WorkOrders]
                WHERE [WorkYear] = @Year
                ORDER BY [DisplayOrder], [Id];
                """;
            command.Parameters.AddWithValue("@FieldKey", CustomFieldKey);
            command.Parameters.AddWithValue("@Name", CustomFieldName);
            command.Parameters.AddWithValue("@LayoutOrder", 1_500_000_000_000L);
            command.Parameters.AddWithValue("@Year", database.Seed.CurrentYear);
            await command.ExecuteNonQueryAsync();
        }

        return new DatabaseFixture(rows[0], rows[1]);
    }

    private static async Task EditCellAsync(IPage page, int row, int column, string value)
    {
        await WaitForRenderedCellAsync(page, row, column);
        var cell = DataCell(page, row, column);
        await cell.DblClickAsync();
        var editor = page.Locator($"#{GridHostId} revogr-edit input").Last;
        await editor.WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });
        await editor.FillAsync(value);
        await editor.PressAsync("Enter");
        await page.WaitForTimeoutAsync(120);
    }

    private static async Task ClickSaveHandlingConfirmAsync(IPage page, bool accept)
    {
        var handled = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        EventHandler<IDialog>? handler = null;
        handler = async (_, dialog) =>
        {
            page.Dialog -= handler;
            try
            {
                if (accept)
                {
                    await dialog.AcceptAsync();
                }
                else
                {
                    await dialog.DismissAsync();
                }
                handled.TrySetResult(true);
            }
            catch (Exception exception)
            {
                handled.TrySetException(exception);
            }
        };

        page.Dialog += handler;
        try
        {
            await SaveButton(page).ClickAsync();
            await handled.Task.WaitAsync(TimeSpan.FromSeconds(10));
        }
        finally
        {
            page.Dialog -= handler;
        }
    }

    private static async Task WaitForCleanSaveAsync(
        IPage page,
        int timeoutMs = 30_000)
    {
        await WaitForOperationMessageAsync(
            page,
            "تم الحفظ في قاعدة البيانات",
            timeoutMs);
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

    private static async Task WaitForSaveActiveAsync(IPage page) =>
        await page.WaitForFunctionAsync(
            "() => document.querySelector('#revogrid-gate5b11-save-status')?.dataset?.saveActive === 'true'",
            null,
            new PageWaitForFunctionOptions { Timeout = 10_000 });

    private static async Task WaitForYearAsync(IPage page, int year)
    {
        await page.WaitForFunctionAsync(
            """
            expected => {
                const selector = document.querySelector('[data-testid="gate5a-year-selector"]');
                const loading = document.querySelector('.native-gate5a__loading');
                const status = document.querySelector('.native-gate5a__statusbar')?.textContent ?? '';
                return selector?.value === String(expected) &&
                    selector.disabled === false &&
                    !loading &&
                    status.includes(`Dataset ${expected}`);
            }
            """,
            year,
            new PageWaitForFunctionOptions { Timeout = 30_000 });
        await WaitForAnyRenderedDataCellAsync(page);
    }


    private static async Task AssertActiveSurfaceAsync(IPage page)
    {
        var path = new Uri(page.Url).AbsolutePath;
        E2ETestAssert.Equal(
            GatePath,
            path,
            $"Closure browser journey opened '{path}' instead of the accepted Revo Gate 5C-1 surface.");

        var aggregates = page.GetByTestId("gate5c1-visible-aggregates");
        await aggregates.WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 30_000
        });
        await page.WaitForFunctionAsync(
            """
            () => document.querySelector(
                '[data-testid="gate5c1-visible-aggregates"]')
                ?.dataset?.aggregateReady === 'true'
            """,
            null,
            new PageWaitForFunctionOptions { Timeout = 30_000 });
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

        E2ETestAssert.Equal(
            1,
            urls.Length,
            $"Expected exactly one active revoGridGate5B1 module URL, found {urls.Length}: {string.Join(", ", urls)}");

        var modulePath = urls[0];
        E2ETestAssert.True(
            modulePath.Contains(
                ExpectedModuleVersionToken,
                StringComparison.OrdinalIgnoreCase),
            $"The browser loaded '{modulePath}' instead of the expected '{ExpectedModuleVersionToken}' Revo module.");

        return modulePath;
    }

    private static async Task SwitchYearAsync(IPage page, int year)
    {
        var selector = page.GetByTestId("gate5a-year-selector");
        var requested = year.ToString(CultureInfo.InvariantCulture);
        if (!string.Equals(
                await selector.InputValueAsync(),
                requested,
                StringComparison.Ordinal))
        {
            await selector.SelectOptionAsync(requested);
        }
        await WaitForYearAsync(page, year);
    }

    private static async Task<IReadOnlyList<MovedRowRef>> MoveVisibleRowsToYearAsync(
        IPage page,
        int destinationYear,
        params int[] rowIndexes)
    {
        E2ETestAssert.True(
            rowIndexes.Length > 0,
            "Cross-year browser test requires at least one row.");

        var rows = new List<MovedRowRef>(rowIndexes.Length);
        foreach (var rowIndex in rowIndexes)
        {
            var row = await GetVisibleRowAsync(page, rowIndex);
            rows.Add(new MovedRowRef(
                row.GetProperty("id").GetInt32(),
                row.GetProperty("clientKey").GetString() ?? string.Empty,
                row.GetProperty("workOrderNumber").GetString() ?? string.Empty));
        }

        var assignmentColumn = await GetVisualColumnIndexAsync(page, "assignmentDate");
        var targetDate = $"15/08/{destinationYear}";

        foreach (var rowIndex in rowIndexes)
        {
            await EditCellAsync(page, rowIndex, assignmentColumn, targetDate);
        }

        // One employee Save owns one confirmation for the complete cross-year
        // batch. If the product opens another confirmation, the wait below will
        // not complete cleanly and the scenario fails.
        await ClickSaveHandlingConfirmAsync(page, accept: true);

        foreach (var row in rows)
        {
            await page.WaitForFunctionAsync(
                """
                async key => !(await document.querySelector(
                    '#revogrid-native-gate5a-grid revo-grid')
                    .getSource('rgRow'))
                    .some(row => String(row?.clientKey ?? '') === key)
                """,
                row.ClientKey,
                new PageWaitForFunctionOptions { Timeout = 30_000 });
        }

        await WaitForOperationMessageAsync(page, "تم الحفظ في قاعدة البيانات");
        E2ETestAssert.True(
            !(await GetChangeStateAsync(page)).GetProperty("dirty").GetBoolean(),
            "Accepted cross-year Save did not return the source sheet to Clean.");

        return rows;
    }

    private static async Task<int> GetLogicalColumnIndexAsync(
        IPage page,
        string prop) =>
        await page.EvaluateAsync<int>(
            """
            async prop => {
                const grid = document.querySelector(
                    '#revogrid-native-gate5a-grid revo-grid');
                const columns = Array.isArray(grid.columns)
                    ? grid.columns
                    : await grid.getColumns();
                return columns.findIndex(
                    column => String(column?.prop ?? '') === prop);
            }
            """,
            prop);

    private static async Task<string> GetCoreNeighborSignatureAsync(
        IPage page,
        string prop) =>
        await page.EvaluateAsync<string>(
            """
            async prop => {
                const grid = document.querySelector(
                    '#revogrid-native-gate5a-grid revo-grid');
                const columns = Array.isArray(grid.columns)
                    ? grid.columns
                    : await grid.getColumns();
                const core = new Set([
                    'workOrderNumber',
                    'workTypeCode',
                    'assignmentDate',
                    'workOrderValue',
                    'partialAmount',
                    'remainingAmount',
                    'basket'
                ]);
                const index = columns.findIndex(
                    column => String(column?.prop ?? '') === prop);
                if (index < 0) return '';

                let previous = '';
                let next = '';

                for (let i = index - 1; i >= 0; i -= 1) {
                    const candidate = String(columns[i]?.prop ?? '');
                    if (core.has(candidate)) {
                        previous = candidate;
                        break;
                    }
                }

                for (let i = index + 1; i < columns.length; i += 1) {
                    const candidate = String(columns[i]?.prop ?? '');
                    if (core.has(candidate)) {
                        next = candidate;
                        break;
                    }
                }

                return `${previous}|${next}`;
            }
            """,
            prop);

    private static async Task<int> CountColumnsNamedAsync(
        IPage page,
        string name) =>
        await page.EvaluateAsync<int>(
            """
            async name => {
                const grid = document.querySelector(
                    '#revogrid-native-gate5a-grid revo-grid');
                const columns = Array.isArray(grid.columns)
                    ? grid.columns
                    : await grid.getColumns();
                return columns.filter(
                    column => String(column?.name ?? '') === name).length;
            }
            """,
            name);

    private static async Task<int> GetSourceCountAsync(IPage page) =>
        await page.EvaluateAsync<int>(
            """
            async () => (await document.querySelector(
                '#revogrid-native-gate5a-grid revo-grid')
                .getSource('rgRow')).length
            """);

    private static async Task<int> GetVisibleSourceCountAsync(IPage page) =>
        await page.EvaluateAsync<int>(
            """
            async () => (await document.querySelector(
                '#revogrid-native-gate5a-grid revo-grid')
                .getVisibleSource('rgRow')).length
            """);

    private static async Task<ILocator> GetVisibleSortButtonAsync(IPage page, string prop)
    {
        await ScrollToColumnByPropAsync(page, prop);
        var sort = page.Locator($".erp-revo-sort-button[data-erp-sort-prop=\"{prop}\"]");
        await sort.WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });
        return sort;
    }

    private static async Task<ILocator> GetVisibleFilterButtonAsync(IPage page, string prop)
    {
        await ScrollToColumnByPropAsync(page, prop);
        var filter = page.Locator($".erp-revo-excel-filter-button[data-erp-filter-prop=\"{prop}\"]");
        await filter.WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });
        return filter;
    }

    private static async Task ApplySingleFilterAsync(
        IPage page,
        string prop,
        string value)
    {
        var filterButton = await GetVisibleFilterButtonAsync(page, prop);
        await filterButton.ClickAsync();

        var popup = page.Locator(".erp-revo-excel-filter");
        await popup.WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });

        var selectAll = popup.Locator(
            ".erp-revo-excel-filter__select-all input[type=\"checkbox\"]");
        if (await selectAll.IsCheckedAsync())
        {
            await selectAll.ClickAsync();
        }

        await popup.Locator(
                $".erp-revo-excel-filter__body label:has-text(\"{value}\") input[type=\"checkbox\"]")
            .First
            .ClickAsync();
        await popup.Locator(
                ".erp-revo-excel-filter__actions button[data-primary=\"true\"]")
            .ClickAsync();
        await popup.WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Detached,
            Timeout = 10_000
        });
    }

    private static async Task ClearFilterAsync(
        IPage page,
        string prop)
    {
        var filterButton = await GetVisibleFilterButtonAsync(page, prop);
        await filterButton.ClickAsync();

        var popup = page.Locator(".erp-revo-excel-filter");
        await popup.WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });
        await popup.Locator(
                ".erp-revo-excel-filter__actions button:has-text(\"Clear Filter\")")
            .ClickAsync();
        await popup.WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Detached,
            Timeout = 10_000
        });
    }

    private static async Task ClickSortAndWaitForLabelChangeAsync(
        IPage page,
        ILocator sort,
        string prop)
    {
        await ScrollToColumnByPropAsync(page, prop);
        await sort.WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });
        var before = await sort.GetAttributeAsync("aria-label") ?? string.Empty;
        await sort.ClickAsync();

        for (var attempt = 0; attempt < 100; attempt++)
        {
            var current = await sort.GetAttributeAsync("aria-label") ?? string.Empty;
            if (!string.Equals(current, before, StringComparison.Ordinal))
            {
                return;
            }
            await page.WaitForTimeoutAsync(50);
        }

        throw new InvalidOperationException(
            $"Sort state for '{prop}' did not change after the employee clicked its Sort button.");
    }

    private static async Task EnsureSortClearedAsync(
        IPage page,
        ILocator sort,
        string prop)
    {
        for (var attempt = 0; attempt < 4; attempt++)
        {
            var label = await sort.GetAttributeAsync("aria-label") ?? string.Empty;
            if (label.Contains(
                    "not sorted",
                    StringComparison.OrdinalIgnoreCase))
            {
                return;
            }
            await ClickSortAndWaitForLabelChangeAsync(page, sort, prop);
        }

        throw new InvalidOperationException(
            $"Could not return Custom Column '{prop}' Sort to clear state.");
    }

    private static async Task ApplySingleWorkTypeFilterAsync(IPage page, string value)
    {
        var filterButton = await GetVisibleFilterButtonAsync(page, "workTypeCode");
        await filterButton.ClickAsync();
        var popup = page.Locator(".erp-revo-excel-filter");
        await popup.WaitForAsync(new LocatorWaitForOptions { State = WaitForSelectorState.Visible, Timeout = 10_000 });
        var selectAll = popup.Locator(".erp-revo-excel-filter__select-all input[type=\"checkbox\"]");
        if (await selectAll.IsCheckedAsync())
        {
            await selectAll.ClickAsync();
        }
        await popup.Locator($".erp-revo-excel-filter__body label:has-text(\"{value}\") input[type=\"checkbox\"]").First.ClickAsync();
        await popup.Locator(".erp-revo-excel-filter__actions button[data-primary=\"true\"]").ClickAsync();
        await popup.WaitForAsync(new LocatorWaitForOptions { State = WaitForSelectorState.Detached, Timeout = 10_000 });
    }

    private static async Task ClearWorkTypeFilterAsync(IPage page)
    {
        var filterButton = await GetVisibleFilterButtonAsync(page, "workTypeCode");
        await filterButton.ClickAsync();
        var popup = page.Locator(".erp-revo-excel-filter");
        await popup.WaitForAsync(new LocatorWaitForOptions { State = WaitForSelectorState.Visible, Timeout = 10_000 });
        await popup.Locator(".erp-revo-excel-filter__actions button:has-text(\"Clear Filter\")").ClickAsync();
        await popup.WaitForAsync(new LocatorWaitForOptions { State = WaitForSelectorState.Detached, Timeout = 10_000 });
    }

    private static async Task<JsonElement> GetVisibleRowAsync(IPage page, int index)
    {
        var json = await page.EvaluateAsync<string>(
            "async index => JSON.stringify((await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getVisibleSource('rgRow'))[index])",
            index);
        return JsonDocument.Parse(json).RootElement.Clone();
    }

    private static async Task<JsonElement> GetOnlyUnsavedRowAsync(IPage page)
    {
        var json = await page.EvaluateAsync<string>(
            """
            async () => {
                const rows = (await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getSource('rgRow'))
                    .filter(row => Number(row?.id ?? 0) <= 0);
                if (rows.length !== 1) throw new Error(`Expected one unsaved row, found ${rows.length}.`);
                return JSON.stringify(rows[0]);
            }
            """);
        return JsonDocument.Parse(json).RootElement.Clone();
    }

    private static async Task<JsonElement> GetSourceRowByClientKeyAsync(IPage page, string clientKey)
    {
        var json = await page.EvaluateAsync<string>(
            """
            async key => {
                const row = (await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getSource('rgRow'))
                    .find(item => String(item?.clientKey ?? '') === key);
                return JSON.stringify(row ?? null);
            }
            """,
            clientKey);
        var element = JsonDocument.Parse(json).RootElement.Clone();
        E2ETestAssert.True(element.ValueKind == JsonValueKind.Object,
            $"Could not resolve source row for ClientKey {clientKey}.");
        return element;
    }

    private static async Task<JsonElement> GetSourceRowByIdAsync(IPage page, int id)
    {
        var json = await page.EvaluateAsync<string>(
            """
            async id => {
                const row = (await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getSource('rgRow'))
                    .find(item => Number(item?.id ?? 0) === Number(id));
                return JSON.stringify(row ?? null);
            }
            """,
            id);
        var element = JsonDocument.Parse(json).RootElement.Clone();
        E2ETestAssert.True(element.ValueKind == JsonValueKind.Object,
            $"Could not resolve source row for database Id {id}.");
        return element;
    }

    private static async Task<int> GetVisualColumnIndexAsync(IPage page, string prop) =>
        await page.EvaluateAsync<int>(
            """
            async prop => {
                const grid = document.querySelector('#revogrid-native-gate5a-grid revo-grid');
                const columns = Array.isArray(grid.columns) ? grid.columns : await grid.getColumns();
                const logical = columns.findIndex(column => String(column?.prop ?? '') === prop);
                if (logical < 0) return -1;
                return grid.rtl ? columns.length - 1 - logical : logical;
            }
            """,
            prop);

    private static async Task<long> GetSourceDisplayOrderByIdAsync(IPage page, int id) =>
        await page.EvaluateAsync<long>(
            "async id => Number((await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getSource('rgRow')).find(row => Number(row?.id ?? 0) === id)?.displayOrder ?? 0)",
            id);

    private static async Task<int> FindVisibleIndexByClientKeyAsync(IPage page, string clientKey) =>
        await page.EvaluateAsync<int>(
            "async key => (await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getVisibleSource('rgRow')).findIndex(row => String(row?.clientKey ?? '') === key)",
            clientKey);

    private static async Task<bool> SourceContainsClientKeyAsync(IPage page, string clientKey) =>
        await page.EvaluateAsync<bool>(
            "async key => (await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getSource('rgRow')).some(row => String(row?.clientKey ?? '') === key)",
            clientKey);

    private static async Task<bool> SourceContainsWorkOrderNumberAsync(IPage page, string workOrderNumber) =>
        await page.EvaluateAsync<bool>(
            "async value => (await document.querySelector('#revogrid-native-gate5a-grid revo-grid').getSource('rgRow')).some(row => String(row?.workOrderNumber ?? '') === value)",
            workOrderNumber);

    private static async Task<JsonElement> GetChangeStateAsync(IPage page)
    {
        var modulePath = await ResolveActiveModulePathAsync(page);
        var json = await page.EvaluateAsync<string>(
            $$"""
            async () => JSON.stringify((await import('{{modulePath}}')).getChangeState('{{GridHostId}}'))
            """);
        return JsonDocument.Parse(json).RootElement.Clone();
    }

    private static async Task WaitForAnyRenderedDataCellAsync(
        IPage page,
        int timeoutMs = 30_000) =>
        await page.Locator(
                $"#{GridHostId} revogr-viewport-scroll.rgCol:not([row-header]) [data-rgRow][data-rgCol]")
            .First.WaitForAsync(new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible,
                Timeout = timeoutMs
            });

    private static async Task ScrollToRowAsync(IPage page, int row)
    {
        if (await RenderedRowCell(page, row).IsVisibleAsync())
        {
            return;
        }

        await page.EvaluateAsync(
            """
            async row => {
                const grid = document.querySelector(
                    '#revogrid-native-gate5a-grid revo-grid');
                if (!grid || typeof grid.scrollToRow !== 'function') {
                    throw new Error('Revo scrollToRow API is unavailable.');
                }
                await grid.scrollToRow(row);
            }
            """,
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
            """
            async column => {
                const grid = document.querySelector(
                    '#revogrid-native-gate5a-grid revo-grid');
                if (!grid || typeof grid.scrollToColumnIndex !== 'function') {
                    throw new Error('Revo scrollToColumnIndex API is unavailable.');
                }
                await grid.scrollToColumnIndex(column);
            }
            """,
            column);

        await RenderedColumnCell(page, column).WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });
    }

    private static async Task ScrollToColumnByPropAsync(IPage page, string prop)
    {
        var column = await GetVisualColumnIndexAsync(page, prop);
        E2ETestAssert.True(
            column >= 0,
            $"Could not resolve column '{prop}' for viewport navigation.");

        if (await RenderedColumnCell(page, column).IsVisibleAsync())
        {
            return;
        }

        await page.EvaluateAsync(
            """
            async prop => {
                const grid = document.querySelector(
                    '#revogrid-native-gate5a-grid revo-grid');
                if (!grid || typeof grid.scrollToColumnProp !== 'function') {
                    throw new Error('Revo scrollToColumnProp API is unavailable.');
                }
                await grid.scrollToColumnProp(prop);
            }
            """,
            prop);

        await RenderedColumnCell(page, column).WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 10_000
        });
    }

    private static async Task WaitForRenderedCellAsync(IPage page, int row, int column)
    {
        await ScrollToRowAsync(page, row);
        await ScrollToColumnAsync(page, column);
        await DataCell(page, row, column).First.WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 30_000
        });
    }

    private static async Task WaitForRenderedRowHeaderAsync(IPage page, int row)
    {
        await ScrollToRowAsync(page, row);
        await RowHeader(page, row).WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 30_000
        });
    }

    private static async Task OpenStructureMenuAsync(IPage page, int row, int column)
    {
        await WaitForRenderedCellAsync(page, row, column);
        await DataCell(page, row, column).ClickAsync(new LocatorClickOptions { Button = MouseButton.Right });
        await page.Locator(".erp-revo-structure-menu:not([hidden])").WaitForAsync(
            new LocatorWaitForOptions { State = WaitForSelectorState.Visible, Timeout = 10_000 });
    }

    private static async Task ClickStructureMenuAsync(IPage page, string label) =>
        await page.Locator(".erp-revo-structure-menu:not([hidden])")
            .Locator($"button:has-text(\"{label}\")")
            .ClickAsync();

    private static ILocator VisibleDialog(IPage page, string title) =>
        page.Locator($".erp-revo-structure-dialog:not([hidden]):has(.erp-revo-structure-dialog__title:has-text(\"{title}\"))");

    private static ILocator Grid(IPage page) => page.Locator($"#{GridHostId} revo-grid");
    private static ILocator SaveButton(IPage page) => page.Locator("#revogrid-gate5b11-save");
    private static ILocator RowHeader(IPage page, int row) =>
        page.Locator($"#{GridHostId} revogr-row-headers [data-rgRow=\"{row}\"]").First;
    private static ILocator RenderedRowCell(IPage page, int row) =>
        page.Locator($"#{GridHostId} revogr-viewport-scroll.rgCol:not([row-header]) [data-rgRow=\"{row}\"][data-rgCol]").First;
    private static ILocator RenderedColumnCell(IPage page, int column) =>
        page.Locator($"#{GridHostId} revogr-viewport-scroll.rgCol:not([row-header]) [data-rgRow][data-rgCol=\"{column}\"]").First;
    private static ILocator DataCell(IPage page, int row, int column) =>
        page.Locator($"#{GridHostId} revogr-viewport-scroll.rgCol:not([row-header]) [data-rgRow=\"{row}\"][data-rgCol=\"{column}\"]");

    private static async Task InsertCustomColumnAsync(
        IPage page,
        string name,
        string dataType = "Text")
    {
        var anchor = await GetVisualColumnIndexAsync(page, "partialAmount");
        await OpenStructureMenuAsync(page, 0, anchor);
        await ClickStructureMenuAsync(page, "Insert Columns...");
        var dialog = VisibleDialog(page, "Insert Columns");
        await dialog.Locator("input[type=\"number\"]").First.FillAsync("1");
        await dialog.Locator("input[type=\"number\"]").First.PressAsync("Tab");
        var spec = dialog.Locator(".erp-revo-structure-dialog__column-spec").First;
        await spec.Locator("input[type=\"text\"]").FillAsync(name);
        await spec.Locator("select").SelectOptionAsync(dataType);
        await dialog.Locator("button:has-text(\"Insert Right\")").ClickAsync();
        await page.WaitForFunctionAsync(
            "name => Array.from(document.querySelector('#revogrid-native-gate5a-grid revo-grid').columns ?? []).some(c => String(c?.name ?? '') === name)",
            name);
    }







    private static async Task DeleteCustomColumnAsync(
        IPage page,
        string prop)
    {
        var columnIndex = await GetVisualColumnIndexAsync(page, prop);
        E2ETestAssert.True(
            columnIndex >= 0,
            $"Could not resolve Custom Column '{prop}' before Delete.");

        await OpenStructureMenuAsync(page, 0, columnIndex);
        await ClickStructureMenuAsync(page, "Delete Columns...");
        var dialog = VisibleDialog(page, "Delete Columns");
        await dialog.Locator("button:has-text(\"Delete\")").ClickAsync();

        await page.WaitForFunctionAsync(
            """
            prop => !Array.from(document.querySelector(
                '#revogrid-native-gate5a-grid revo-grid').columns ?? [])
                .some(column => String(column?.prop ?? '') === prop)
            """,
            prop);
    }

    private static async Task<bool> HasColumnNamedAsync(IPage page, string name) =>
        await page.EvaluateAsync<bool>(
            "name => Array.from(document.querySelector('#revogrid-native-gate5a-grid revo-grid').columns ?? []).some(c => String(c?.name ?? '') === name)",
            name);

    private static async Task<string> GetColumnPropByNameAsync(IPage page, string name) =>
        await page.EvaluateAsync<string>(
            "name => String(Array.from(document.querySelector('#revogrid-native-gate5a-grid revo-grid').columns ?? []).find(c => String(c?.name ?? '') === name)?.prop ?? '')",
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

    private static string CustomColumnValue(string json, string fieldKey)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.TryGetProperty(fieldKey, out var value)
            ? value.GetString() ?? string.Empty
            : string.Empty;
    }

    private static int CustomColumnValueCount(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.EnumerateObject().Count();
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
            WHERE [FieldKey] = @FieldKey AND [WorkYear] = @WorkYear;
            """;
        command.Parameters.AddWithValue("@FieldKey", fieldKey);
        command.Parameters.AddWithValue("@WorkYear", workYear);
        await using var reader = await command.ExecuteReaderAsync();
        E2ETestAssert.True(await reader.ReadAsync(),
            $"SQL custom column {fieldKey} was not found in Work Year {workYear}.");
        return new DbCustomColumn(
            reader.GetInt32(0),
            reader.GetString(1),
            reader.GetString(2),
            ((ERPPrototype.Data.Entities.CustomColumnDataType)reader.GetInt32(3)).ToString(),
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
            "SELECT COUNT(*) FROM [CustomColumnDefinitions] WHERE [FieldKey] = @FieldKey AND [WorkYear] = @WorkYear;";
        command.Parameters.AddWithValue("@FieldKey", fieldKey);
        command.Parameters.AddWithValue("@WorkYear", workYear);
        return Convert.ToInt32(
            await command.ExecuteScalarAsync(),
            CultureInfo.InvariantCulture) > 0;
    }


    private static async Task<int> CountDbCustomColumnsByNameAsync(
        string connectionString,
        int workYear,
        string name)
    {
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT COUNT(*)
            FROM [CustomColumnDefinitions]
            WHERE [WorkYear] = @WorkYear AND [Name] = @Name;
            """;
        command.Parameters.AddWithValue("@WorkYear", workYear);
        command.Parameters.AddWithValue("@Name", name);
        return Convert.ToInt32(
            await command.ExecuteScalarAsync(),
            CultureInfo.InvariantCulture);
    }

    private static async Task BumpCustomColumnRowVersionExternallyAsync(
        string connectionString,
        int id)
    {
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            UPDATE [CustomColumnDefinitions]
            SET [Name] = [Name]
            WHERE [Id] = @Id;
            """;
        command.Parameters.AddWithValue("@Id", id);
        E2ETestAssert.Equal(
            1,
            await command.ExecuteNonQueryAsync(),
            "External E2E Custom Column concurrency update did not touch exactly one definition.");
    }

    private static string Format(decimal value) => value.ToString("0.##", CultureInfo.InvariantCulture);

    private static async Task<DbRow> GetDbRowAsync(string connectionString, int id)
    {
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText =
            "SELECT [Id], [WorkOrderNumber], [WorkTypeCode], [WorkYear], [DisplayOrder], [WorkOrderValue], [PartialAmount], [Busket], [CustomValuesJson], [RowVersion] FROM [WorkOrders] WHERE [Id] = @Id;";
        command.Parameters.AddWithValue("@Id", id);
        await using var reader = await command.ExecuteReaderAsync();
        E2ETestAssert.True(await reader.ReadAsync(), $"SQL Work Order {id} was not found.");
        return ReadDbRow(reader);
    }

    private static async Task<DbRow?> GetDbRowByIdentityAsync(string connectionString, string number, string type)
    {
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText =
            "SELECT TOP (1) [Id], [WorkOrderNumber], [WorkTypeCode], [WorkYear], [DisplayOrder], [WorkOrderValue], [PartialAmount], [Busket], [CustomValuesJson], [RowVersion] FROM [WorkOrders] WHERE [WorkOrderNumber] = @Number AND [WorkTypeCode] = @Type ORDER BY [Id] DESC;";
        command.Parameters.AddWithValue("@Number", number);
        command.Parameters.AddWithValue("@Type", type);
        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync() ? ReadDbRow(reader) : null;
    }

    private static DbRow ReadDbRow(SqlDataReader reader) => new(
        Id: reader.GetInt32(0),
        WorkOrderNumber: reader.GetString(1),
        WorkTypeCode: reader.GetString(2),
        WorkYear: reader.GetInt32(3),
        DisplayOrder: reader.GetInt64(4),
        WorkOrderValue: reader.IsDBNull(5) ? null : reader.GetDecimal(5),
        PartialAmount: reader.IsDBNull(6) ? null : reader.GetDecimal(6),
        Busket: reader.GetString(7),
        CustomValuesJson: reader.GetString(8),
        RowVersion: (byte[])reader[9]);

    private static async Task<int> CountDbRowsByWorkTypeAsync(
        string connectionString,
        int year,
        string workTypeCode)
    {
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText =
            "SELECT COUNT(*) FROM [WorkOrders] WHERE [WorkYear] = @Year AND [WorkTypeCode] = @WorkTypeCode;";
        command.Parameters.AddWithValue("@Year", year);
        command.Parameters.AddWithValue("@WorkTypeCode", workTypeCode);
        return Convert.ToInt32(
            await command.ExecuteScalarAsync(),
            CultureInfo.InvariantCulture);
    }

    private static async Task<int> GetDbYearCountAsync(string connectionString, int year)
    {
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM [WorkOrders] WHERE [WorkYear] = @Year;";
        command.Parameters.AddWithValue("@Year", year);
        return Convert.ToInt32(await command.ExecuteScalarAsync(), CultureInfo.InvariantCulture);
    }

    private static async Task<bool> DbRowExistsAsync(string connectionString, int id)
    {
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM [WorkOrders] WHERE [Id] = @Id;";
        command.Parameters.AddWithValue("@Id", id);
        return Convert.ToInt32(await command.ExecuteScalarAsync(), CultureInfo.InvariantCulture) == 1;
    }

    private static async Task BumpRowVersionExternallyAsync(string connectionString, int id)
    {
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "UPDATE [WorkOrders] SET [UpdatedAt] = SYSUTCDATETIME() WHERE [Id] = @Id;";
        command.Parameters.AddWithValue("@Id", id);
        E2ETestAssert.Equal(1, await command.ExecuteNonQueryAsync(),
            "External E2E concurrency update did not touch exactly one Work Order.");
    }

    private static string CreateBundle(string artifactDirectory)
    {
        var downloads = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
        Directory.CreateDirectory(downloads);
        var path = Path.Combine(downloads, $"ERP_REVO_GATE5B12_TRACE_{DateTime.Now:yyyyMMdd-HHmmss}.zip");
        if (File.Exists(path))
        {
            File.Delete(path);
        }
        ZipFile.CreateFromDirectory(artifactDirectory, path, CompressionLevel.Optimal, includeBaseDirectory: false);
        return path;
    }

    private static decimal ReadDecimalProperty(JsonElement row, string propertyName)
    {
        var value = row.GetProperty(propertyName);
        if (value.ValueKind == JsonValueKind.Number)
        {
            return value.GetDecimal();
        }

        if (value.ValueKind == JsonValueKind.String &&
            decimal.TryParse(value.GetString(), NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed))
        {
            return parsed;
        }

        throw new InvalidOperationException(
            $"Expected '{propertyName}' to be a numeric value or numeric string, but received {value.ValueKind}: {value.GetRawText()}");
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

    private sealed record DatabaseFixture(int FirstRowId, int SecondRowId);
    private sealed record NewRowResult(string ClientKey, int DatabaseId, string WorkOrderNumber);
    private sealed record DbRow(
        int Id,
        string WorkOrderNumber,
        string WorkTypeCode,
        int WorkYear,
        long DisplayOrder,
        decimal? WorkOrderValue,
        decimal? PartialAmount,
        string Busket,
        string CustomValuesJson,
        byte[] RowVersion);
    private sealed record DbCustomColumn(
        int Id,
        string FieldKey,
        string Name,
        string DataType,
        long LayoutOrder,
        byte[] RowVersion);
    private sealed record MovedRowRef(
        int DatabaseId,
        string ClientKey,
        string WorkOrderNumber);

    private sealed class SqlRowLock : IAsyncDisposable
    {
        private readonly SqlConnection connection;
        private readonly SqlTransaction transaction;
        private bool released;

        private SqlRowLock(SqlConnection connection, SqlTransaction transaction)
        {
            this.connection = connection;
            this.transaction = transaction;
        }

        public static async Task<SqlRowLock> AcquireAsync(string connectionString, int id)
        {
            var connection = new SqlConnection(connectionString);
            await connection.OpenAsync();
            var transaction = (SqlTransaction)await connection.BeginTransactionAsync();
            await using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = "SELECT [Id] FROM [WorkOrders] WITH (XLOCK, HOLDLOCK, ROWLOCK) WHERE [Id] = @Id;";
            command.Parameters.AddWithValue("@Id", id);
            E2ETestAssert.Equal(id, Convert.ToInt32(await command.ExecuteScalarAsync(), CultureInfo.InvariantCulture),
                "Could not acquire the E2E SQL row lock.");
            return new SqlRowLock(connection, transaction);
        }

        public async Task ReleaseAsync()
        {
            if (released)
            {
                return;
            }
            released = true;
            await transaction.CommitAsync();
        }

        public async ValueTask DisposeAsync()
        {
            if (!released)
            {
                try
                {
                    await transaction.RollbackAsync();
                }
                catch
                {
                }
            }
            await transaction.DisposeAsync();
            await connection.DisposeAsync();
        }
    }
}
