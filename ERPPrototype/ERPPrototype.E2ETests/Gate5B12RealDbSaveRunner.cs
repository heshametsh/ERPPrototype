using System.Globalization;
using System.IO.Compression;
using System.Text.Json;
using Microsoft.Data.SqlClient;
using Microsoft.Playwright;

namespace ERPPrototype.E2ETests;

internal static class Gate5B12RealDbSaveRunner
{
    private const int FixedPort = 5265;
    private const string GatePath = "/work-orders-revogrid-gate5b12";
    private const string GridHostId = "revogrid-native-gate5a-grid";
    private const string ModulePath = "/js/revoGridGate5B1.js?v=20260901-b12-final-1";
    private const string CustomFieldKey = "custom_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private const string CustomFieldName = "B12 E2E Note";
    private const int LargeSaveRowCount = 1_200;
    private const int LargeSaveRowsPerYear = 1_500;

    public static async Task<int> RunAsync()
    {
        var projectRoot = FindProjectRoot();
        var artifactDirectory = E2EArtifactManager.CreateRunDirectory(projectRoot);
        Exception? failure = null;

        Console.WriteLine("RevoGrid Gate 5B-12 Real DB Save real-user browser journey");
        Console.WriteLine("The journey uses real Playwright mouse/keyboard actions and verifies SQL persistence, B11 snapshot semantics, new-row identity, DisplayOrder, Custom Values, cross-year confirmation, and concurrency rejection.");
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
                await WaitForRenderedCellAsync(page, 0, 0);

                await AssertExistingUpdatePersistsAsync(page, database);
                Console.WriteLine("[01-update] PASS — real cell edit + Save writes SQL, refreshes RowVersion, and returns Clean");

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
            Console.WriteLine("Gate 5B-12 Real DB Save real-user browser journey PASS.");
        }
        else
        {
            Console.Error.WriteLine("Gate 5B-12 Real DB Save real-user browser journey FAILED.");
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
        await ScrollToRowAsync(page, visibleIndex);

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
        await ScrollToRowAsync(page, visibleIndex);

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
        await ScrollToRowAsync(page, visibleIndex);

        await RowHeader(page, visibleIndex).ClickAsync();
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
        var workTypeColumn = await GetVisualColumnIndexAsync(page, "workTypeCode");
        E2ETestAssert.True(workTypeColumn >= 0, "Could not resolve Work Type column for the large Save test.");

        var firstRow = await GetVisibleRowAsync(page, 0);
        var firstId = firstRow.GetProperty("id").GetInt32();

        // One real edit supplies a value to copy. The remaining 1,199 cells are
        // filled by native Revo range selection + real Ctrl+C/Ctrl+V, matching
        // how an employee performs a large Excel-style edit.
        await EditCellAsync(page, 0, workTypeColumn, "499");
        await DataCell(page, 0, workTypeColumn).ClickAsync();
        await page.Keyboard.PressAsync("Control+C");
        await page.WaitForTimeoutAsync(120);

        await DataCell(page, 1, workTypeColumn).ClickAsync();
        await ScrollToRowAsync(page, LargeSaveRowCount - 1);
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
                const state = (await import('{{ModulePath}}')).getChangeState('{{GridHostId}}');
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
                const module = await import('{{ModulePath}}');
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
                const module = await import('{{ModulePath}}');
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
        // virtualized viewport near row 1,200. Return to the concurrency target
        // using real mouse-wheel scrolling before attempting the real cell edit.
        await ScrollToRowAsync(page, rowIndex);
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
                    ([DepartmentId], [FieldKey], [Name], [DataType], [LayoutOrder], [CreatedAt], [CreatedBy])
                SELECT TOP (1)
                    [DepartmentId], @FieldKey, @Name, 1, @LayoutOrder, SYSUTCDATETIME(), [CreatedBy]
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
        var editor = page.Locator($"#{GridHostId} input").Last;
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
        await WaitForRenderedCellAsync(page, 0, 0);
    }

    private static async Task ApplySingleWorkTypeFilterAsync(IPage page, string value)
    {
        await page.Locator(".erp-revo-excel-filter-button[data-erp-filter-prop=\"workTypeCode\"]").ClickAsync();
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
        await page.Locator(".erp-revo-excel-filter-button[data-erp-filter-prop=\"workTypeCode\"]").ClickAsync();
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
        var json = await page.EvaluateAsync<string>(
            $$"""
            async () => JSON.stringify((await import('{{ModulePath}}')).getChangeState('{{GridHostId}}'))
            """);
        return JsonDocument.Parse(json).RootElement.Clone();
    }

    private static async Task ScrollToRowAsync(IPage page, int row)
    {
        if (await DataCell(page, row, 0).IsVisibleAsync())
        {
            return;
        }

        var viewport = page.Locator($"#{GridHostId} revogr-viewport-scroll.rgCol:not([row-header])").First;
        var bounds = await viewport.BoundingBoxAsync();
        E2ETestAssert.True(bounds is not null, "Could not locate Revo viewport for real mouse-wheel scrolling.");
        await page.Mouse.MoveAsync((float)(bounds!.X + bounds.Width / 2), (float)(bounds.Y + bounds.Height / 2));

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
            E2ETestAssert.True(renderedRows.Length > 0, "Revo rendered no rows during real mouse-wheel scroll.");
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
            await page.Mouse.WheelAsync(0, direction * Math.Clamp(distance * 42, 360, 3200));
            await page.WaitForTimeoutAsync(35);
        }

        throw new InvalidOperationException($"Real mouse-wheel scrolling did not render row {row}.");
    }

    private static async Task WaitForRenderedCellAsync(IPage page, int row, int column) =>
        await DataCell(page, row, column).First.WaitForAsync(new LocatorWaitForOptions
        {
            State = WaitForSelectorState.Visible,
            Timeout = 30_000
        });

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
    private static ILocator DataCell(IPage page, int row, int column) =>
        page.Locator($"#{GridHostId} revogr-viewport-scroll.rgCol:not([row-header]) [data-rgRow=\"{row}\"][data-rgCol=\"{column}\"]");

    private static string Format(decimal value) => value.ToString("0.##", CultureInfo.InvariantCulture);

    private static async Task<DbRow> GetDbRowAsync(string connectionString, int id)
    {
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText =
            "SELECT [Id], [WorkOrderNumber], [WorkTypeCode], [WorkYear], [DisplayOrder], [WorkOrderValue], [PartialAmount], [CustomValuesJson], [RowVersion] FROM [WorkOrders] WHERE [Id] = @Id;";
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
            "SELECT TOP (1) [Id], [WorkOrderNumber], [WorkTypeCode], [WorkYear], [DisplayOrder], [WorkOrderValue], [PartialAmount], [CustomValuesJson], [RowVersion] FROM [WorkOrders] WHERE [WorkOrderNumber] = @Number AND [WorkTypeCode] = @Type ORDER BY [Id] DESC;";
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
        CustomValuesJson: reader.GetString(7),
        RowVersion: (byte[])reader[8]);

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
        string CustomValuesJson,
        byte[] RowVersion);

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
