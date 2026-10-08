using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace ContractorERP.IntegrationTests;

[Collection(ErpCollection.Name)]
public class WorkOrderSheetTests(ErpFactory factory)
{
    private static int counter = 100_000_000;

    private static string NextNumber() => Interlocked.Increment(ref counter).ToString();

    private static object Fields(string number, string date = "2026-03-01", decimal value = 1000m, decimal? partial = 250m) =>
        new { number, workTypeCode = "001", assignmentDate = date, value, partialAmount = partial, basket = "التنفيذ" };

    private static object AddRequest(params (string clientKey, object fields)[] rows) => new
    {
        added = rows.Select((r, i) => new { r.clientKey, r.fields, displayOrder = i }).ToArray(),
        updated = Array.Empty<object>(),
        deleted = Array.Empty<object>(),
    };

    private static async Task<JsonElement> Json(HttpResponseMessage r) => await r.Content.ReadFromJsonAsync<JsonElement>();

    [Fact]
    public async Task Anonymous_cannot_read_the_sheet()
    {
        var response = await factory.CreateClient().GetAsync("/api/work-orders/sheet");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Added_row_is_saved_and_read_back_with_derived_remaining()
    {
        var client = await factory.LoginAsync("employee");
        var number = NextNumber();

        var save = await client.PostAsJsonAsync("/api/work-orders/sheet", AddRequest(("tmp-1", Fields(number))));
        Assert.Equal(HttpStatusCode.OK, save.StatusCode);
        var saved = (await Json(save)).GetProperty("added")[0];
        Assert.Equal("tmp-1", saved.GetProperty("clientKey").GetString());

        var sheet = await Json(await client.GetAsync("/api/work-orders/sheet?year=2026"));
        var row = sheet.GetProperty("rows").EnumerateArray().Single(r => r.GetProperty("number").GetString() == number);
        Assert.Equal(750m, row.GetProperty("remainingAmount").GetDecimal());
    }

    [Fact]
    public async Task Stale_version_is_rejected_and_nothing_changes()
    {
        var client = await factory.LoginAsync("employee");
        var number = NextNumber();
        var saved = (await Json(await client.PostAsJsonAsync("/api/work-orders/sheet", AddRequest(("a", Fields(number)))))).GetProperty("added")[0];
        var id = saved.GetProperty("id").GetGuid();
        var version = saved.GetProperty("version").GetUInt32();

        // First session edits successfully.
        var first = await client.PostAsJsonAsync("/api/work-orders/sheet", new
        {
            added = Array.Empty<object>(),
            updated = new[] { new { id, version, fields = Fields(number, value: 2000m), displayOrder = 0 } },
            deleted = Array.Empty<object>(),
        });
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        // Second session still holds the old version and must not overwrite.
        var second = await client.PostAsJsonAsync("/api/work-orders/sheet", new
        {
            added = Array.Empty<object>(),
            updated = new[] { new { id, version, fields = Fields(number, value: 5000m), displayOrder = 0 } },
            deleted = Array.Empty<object>(),
        });
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);

        var sheet = await Json(await client.GetAsync("/api/work-orders/sheet?year=2026"));
        var row = sheet.GetProperty("rows").EnumerateArray().Single(r => r.GetProperty("id").GetGuid() == id);
        Assert.Equal(2000m, row.GetProperty("value").GetDecimal());
    }

    [Fact]
    public async Task Identity_is_unique_across_departments()
    {
        var number = NextNumber();
        var employee = await factory.LoginAsync("employee");
        Assert.Equal(HttpStatusCode.OK, (await employee.PostAsJsonAsync("/api/work-orders/sheet", AddRequest(("a", Fields(number))))).StatusCode);

        var other = await factory.LoginAsync("employee2");
        var duplicate = await other.PostAsJsonAsync("/api/work-orders/sheet", AddRequest(("b", Fields(number))));
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
        Assert.Contains("duplicate_identity", await duplicate.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Another_department_cannot_edit_or_delete_my_row()
    {
        var employee = await factory.LoginAsync("employee");
        var number = NextNumber();
        var saved = (await Json(await employee.PostAsJsonAsync("/api/work-orders/sheet", AddRequest(("a", Fields(number)))))).GetProperty("added")[0];

        var other = await factory.LoginAsync("employee2");
        var attempt = await other.PostAsJsonAsync("/api/work-orders/sheet", new
        {
            added = Array.Empty<object>(),
            updated = Array.Empty<object>(),
            deleted = new[] { new { id = saved.GetProperty("id").GetGuid(), version = saved.GetProperty("version").GetUInt32() } },
        });
        Assert.Equal(HttpStatusCode.Conflict, attempt.StatusCode);

        var sheet = await Json(await employee.GetAsync("/api/work-orders/sheet?year=2026"));
        Assert.Contains(sheet.GetProperty("rows").EnumerateArray(), r => r.GetProperty("number").GetString() == number);
    }

    [Fact]
    public async Task Invalid_fields_return_every_error_with_its_cell()
    {
        var client = await factory.LoginAsync("employee");
        var response = await client.PostAsJsonAsync("/api/work-orders/sheet", AddRequest(("bad", Fields("12", value: 100m, partial: 500m))));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("bad:number", body);
        Assert.Contains("bad:partialAmount", body);
    }

    [Fact]
    public async Task Moving_a_row_to_another_year_needs_confirmation()
    {
        var client = await factory.LoginAsync("employee");
        var number = NextNumber();
        var saved = (await Json(await client.PostAsJsonAsync("/api/work-orders/sheet", AddRequest(("a", Fields(number)))))).GetProperty("added")[0];
        object Move(bool confirm) => new
        {
            added = Array.Empty<object>(),
            updated = new[] { new { id = saved.GetProperty("id").GetGuid(), version = saved.GetProperty("version").GetUInt32(), fields = Fields(number, date: "2027-01-05"), displayOrder = 0 } },
            deleted = Array.Empty<object>(),
            confirmYearMoves = confirm,
        };

        var unconfirmed = await client.PostAsJsonAsync("/api/work-orders/sheet", Move(false));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, unconfirmed.StatusCode);

        var confirmed = await client.PostAsJsonAsync("/api/work-orders/sheet", Move(true));
        Assert.Equal(HttpStatusCode.OK, confirmed.StatusCode);
        Assert.Equal(2027, (await Json(confirmed)).GetProperty("updated")[0].GetProperty("workYear").GetInt32());
    }
}
