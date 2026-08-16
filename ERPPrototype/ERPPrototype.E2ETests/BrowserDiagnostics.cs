using System.Collections.Concurrent;
using Microsoft.Playwright;

namespace ERPPrototype.E2ETests;

internal sealed class BrowserDiagnostics
{
    private readonly ConcurrentQueue<string> pageErrors = new();
    private readonly ConcurrentQueue<string> consoleErrors = new();
    private readonly ConcurrentQueue<string> failedRequests = new();
    private readonly ConcurrentQueue<string> serverErrors = new();

    public void Attach(IPage page, Uri baseUri)
    {
        page.PageError += (_, message) =>
            pageErrors.Enqueue(message);

        page.Console += (_, message) =>
        {
            if (string.Equals(
                    message.Type,
                    "error",
                    StringComparison.OrdinalIgnoreCase))
            {
                consoleErrors.Enqueue(message.Text);
            }
        };

        page.RequestFailed += (_, request) =>
        {
            if (IsExpectedBlazorDisconnectAbort(request, baseUri))
            {
                return;
            }

            failedRequests.Enqueue(
                $"{request.Method} {request.Url}: " +
                $"{request.Failure}");
        };

        page.Response += (_, response) =>
        {
            if (response.Status < 500)
            {
                return;
            }

            if (!Uri.TryCreate(response.Url, UriKind.Absolute, out var uri)
                || !string.Equals(
                    uri.Authority,
                    baseUri.Authority,
                    StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            serverErrors.Enqueue(
                $"HTTP {response.Status} {response.Request.Method} {response.Url}");
        };
    }


    private static bool IsExpectedBlazorDisconnectAbort(
        IRequest request,
        Uri baseUri)
    {
        if (!string.Equals(
                request.Method,
                "POST",
                StringComparison.OrdinalIgnoreCase)
            || !Uri.TryCreate(request.Url, UriKind.Absolute, out var uri)
            || !string.Equals(
                uri.Authority,
                baseUri.Authority,
                StringComparison.OrdinalIgnoreCase)
            || !string.Equals(
                uri.AbsolutePath,
                "/_blazor/disconnect",
                StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        return request.Failure?.Contains(
                   "ERR_ABORTED",
                   StringComparison.OrdinalIgnoreCase) == true;
    }

    public void AssertNoCriticalErrors()
    {
        if (
            pageErrors.IsEmpty &&
            serverErrors.IsEmpty &&
            consoleErrors.IsEmpty &&
            failedRequests.IsEmpty)
        {
            return;
        }

        throw new InvalidOperationException(
            "The browser journey completed with unexpected browser/server errors." +
            Environment.NewLine +
            BuildReport());
    }

    public async Task WriteReportAsync(string path)
    {
        await File.WriteAllTextAsync(path, BuildReport());
    }

    private string BuildReport()
    {
        var sections = new List<string>
        {
            FormatSection("Page errors", pageErrors),
            FormatSection("HTTP 5xx responses", serverErrors),
            FormatSection("Console errors", consoleErrors),
            FormatSection("Failed requests", failedRequests)
        };

        return string.Join(
            Environment.NewLine + Environment.NewLine,
            sections);
    }

    private static string FormatSection(
        string title,
        IEnumerable<string> entries)
    {
        var values = entries.ToList();

        if (values.Count == 0)
        {
            return $"{title}: none";
        }

        return title + ":" + Environment.NewLine +
               string.Join(
                   Environment.NewLine,
                   values.Select(value => "- " + value));
    }
}
