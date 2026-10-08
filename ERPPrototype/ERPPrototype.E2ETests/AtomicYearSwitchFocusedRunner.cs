using System.Text.Json;
using Microsoft.Playwright;
using static ERPPrototype.E2ETests.RevoCanonicalTestSurface;

namespace ERPPrototype.E2ETests;

internal static class AtomicYearSwitchFocusedRunner
{
    public static async Task<int> RunAsync()
    {
        var projectRoot = FindProjectRoot();
        var artifacts = E2EArtifactManager.CreateRunDirectory(projectRoot);
        Console.WriteLine("Atomic Work-Year Switch modification gate");
        Console.WriteLine($"Artifacts: {artifacts}");

        try
        {
            await using var database = await E2ETestDatabase.CreateAsync(
                keepDatabase: false,
                rowsPerYear: E2ETestDatabase.DefaultRowsPerYear);
            await using var application = await WebApplicationProcess.StartAsync(
                projectRoot,
                database.ConnectionString,
                artifacts,
                configuration: "Debug");
            await using var browser = await E2EBrowserSession.CreateAsync(
                application.BaseUri,
                artifacts,
                headed: false,
                traceEnabled: true,
                benchmarkMode: false,                viewportWidth: 1440,
                viewportHeight: 900,
                windowWidth: 1500,
                windowHeight: 950,
                screenWidth: 1920,
                screenHeight: 1080);

            var page = browser.Page;
            var login = new LoginPage(page, application.BaseUri);
            await login.OpenAsync(GatePath);
            await login.LoginAsync(database.Seed);
            await page.WaitForURLAsync($"**{GatePath}*", new() { Timeout = 45_000 });
            await Grid(page).WaitForAsync(new()
            {
                State = WaitForSelectorState.Visible,
                Timeout = 45_000
            });
            await page.WaitForFunctionAsync(
                "() => document.querySelector('#revogrid-native-gate5a-grid revo-grid')?.querySelector('[data-rgRow]') != null");

            var result = await page.EvaluateAsync<JsonElement>(
                """
                async targetYear => {
                    const id = 'revogrid-native-gate5a-grid';
                    const grid = document.querySelector(`#${id} revo-grid`);
                    const moduleUrl = performance.getEntriesByType('resource')
                        .map(entry => String(entry?.name ?? ''))
                        .filter(name => name.includes('/js/revoGridGate5B1.js?'))
                        .at(-1);
                    if (!grid || !moduleUrl) throw new Error('Canonical Revo runtime was not found.');                    const gate = await import(moduleUrl);
                    const snapshot = async () => {
                        const diagnostics = await gate.getDiagnostics(id);
                        const rows = await grid.getSource('rgRow');
                        return {
                            workYear: Number(diagnostics?.workYear ?? 0),
                            source: JSON.stringify(rows.map(row => ({
                                clientKey: row?.clientKey,
                                id: row?.id,
                                workOrderNumber: row?.workOrderNumber,
                                workTypeCode: row?.workTypeCode,
                                assignmentDate: row?.assignmentDate,
                                basket: row?.basket
                            }))),
                            customColumns: JSON.stringify(diagnostics?.columnWorkspace?.customColumns ?? []),
                            hiddenProps: JSON.stringify(diagnostics?.columnVisibility?.hiddenProps ?? []),
                            dirty: Boolean(diagnostics?.changeEngine?.dirty),
                            undoCount: Number(diagnostics?.changeEngine?.undoCount ?? 0),
                            redoCount: Number(diagnostics?.changeEngine?.redoCount ?? 0),
                            rowCount: Number(diagnostics?.rowStructure?.rowCount ?? -1)
                        };
                    };

                    const before = await snapshot();
                    const rows = structuredClone(await grid.getSource('rgRow'));
                    rows[0].workOrderNumber = rows[0].workOrderNumber === '999999998'
                        ? '999999997'
                        : '999999998';

                    const decision = await gate.beginDatasetSwitch(id);
                    let injectedError = '';
                    try {                        const badColumn = { name: 'Injected failure column' };
                        Object.defineProperty(badColumn, 'fieldKey', {
                            get() { throw new Error('ATOMIC_YEAR_SWITCH_INJECTED_FAILURE'); }
                        });
                        await gate.replaceDataset(id, rows, [badColumn], targetYear, [], []);
                    } catch (error) {
                        injectedError = String(error?.message ?? error ?? '');
                    }

                    const after = await snapshot();
                    return {
                        decisionAllowed: Boolean(decision?.allowed),
                        injectedError,
                        before,
                        after
                    };
                }
                """,
                database.Seed.PreviousYear);

            var before = result.GetProperty("before");
            var after = result.GetProperty("after");
            E2ETestAssert.True(result.GetProperty("decisionAllowed").GetBoolean(),
                "Clean sheet did not allow the dataset-switch gate.");
            E2ETestAssert.True(
                result.GetProperty("injectedError").GetString()?.Contains(
                    "ATOMIC_YEAR_SWITCH_INJECTED_FAILURE",
                    StringComparison.Ordinal) == true,
                "The focused gate did not fail at the intended mid-switch boundary.");

            AssertSame(before, after, "workYear");
            AssertSame(before, after, "source");            AssertSame(before, after, "customColumns");
            AssertSame(before, after, "hiddenProps");
            AssertSame(before, after, "dirty");
            AssertSame(before, after, "undoCount");
            AssertSame(before, after, "redoCount");
            AssertSame(before, after, "rowCount");

            Console.WriteLine(
                "[Y00-mid-switch-rollback] PASS - failed replacement restored the complete prior dataset state.");
            Console.WriteLine("ATOMIC WORK-YEAR SWITCH GATE: PASS");
            return 0;
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine("ATOMIC WORK-YEAR SWITCH GATE: RED");
            Console.Error.WriteLine(exception);
            return 1;
        }
    }

    private static void AssertSame(JsonElement before, JsonElement after, string name)
    {
        var expected = before.GetProperty(name).GetRawText();
        var actual = after.GetProperty(name).GetRawText();
        E2ETestAssert.Equal(expected, actual,
            $"Failed year switch changed '{name}' instead of restoring the prior state.");
    }
}
