using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text;

namespace ERPPrototype.E2ETests;

internal sealed class WebApplicationProcess : IAsyncDisposable
{
    private readonly Process process;
    private readonly StringBuilder output;
    private readonly string logPath;

    private WebApplicationProcess(
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

    public static async Task<WebApplicationProcess> StartAsync(
        string projectRoot,
        string connectionString,
        string artifactDirectory,
        CancellationToken cancellationToken = default,
        int? fixedPort = null,
        string configuration = "Release")
    {
        var projectPath = Path.Combine(projectRoot, "ERPPrototype.csproj");
        if (!File.Exists(projectPath))
        {
            throw new FileNotFoundException(
                "ERPPrototype.csproj was not found.",
                projectPath);
        }

        Directory.CreateDirectory(artifactDirectory);

        var port = fixedPort ?? ReserveTcpPort();
        if (fixedPort.HasValue)
        {
            EnsureTcpPortAvailable(fixedPort.Value);
        }

        var baseUri = new Uri($"http://127.0.0.1:{port}");
        var logPath = Path.Combine(artifactDirectory, "web-application.log");
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
        startInfo.Environment["ConnectionStrings__DefaultConnection"] =
            connectionString;
        startInfo.Environment["InitialAdmin__Email"] =
            "e2e.admin@local.test";
        startInfo.Environment["InitialAdmin__Password"] =
            "E2E_Admin_2026!";
        startInfo.Environment["InitialAdmin__FullName"] =
            "E2E Administrator";
        startInfo.Environment["Logging__LogLevel__Default"] = "Warning";
        startInfo.Environment["Logging__LogLevel__Microsoft.AspNetCore"] =
            "Warning";
        startInfo.Environment["DOTNET_NOLOGO"] = "true";

        var process = new Process
        {
            StartInfo = startInfo,
            EnableRaisingEvents = true
        };

        process.OutputDataReceived += (_, eventArgs) =>
        {
            if (eventArgs.Data is not null)
            {
                lock (output)
                {
                    output.AppendLine(eventArgs.Data);
                }
            }
        };

        process.ErrorDataReceived += (_, eventArgs) =>
        {
            if (eventArgs.Data is not null)
            {
                lock (output)
                {
                    output.AppendLine("[stderr] " + eventArgs.Data);
                }
            }
        };

        if (!process.Start())
        {
            throw new InvalidOperationException(
                "The ERPPrototype web process could not be started.");
        }

        process.BeginOutputReadLine();
        process.BeginErrorReadLine();

        var application = new WebApplicationProcess(
            process,
            output,
            logPath,
            baseUri);

        try
        {
            await application.WaitUntilReadyAsync(cancellationToken);
            return application;
        }
        catch
        {
            await application.WriteLogAsync();
            await application.DisposeAsync();
            throw;
        }
    }

    private async Task WaitUntilReadyAsync(
        CancellationToken cancellationToken)
    {
        using var httpClient = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(3)
        };

        var deadline = DateTime.UtcNow.AddSeconds(75);
        Exception? lastException = null;

        while (DateTime.UtcNow < deadline)
        {
            cancellationToken.ThrowIfCancellationRequested();

            if (process.HasExited)
            {
                await WriteLogAsync();

                throw new InvalidOperationException(
                    $"ERPPrototype exited before becoming ready. " +
                    $"Exit code: {process.ExitCode}. Log: {logPath}");
            }

            try
            {
                using var loginResponse = await httpClient.GetAsync(
                    new Uri(BaseUri, "/Account/Login"),
                    HttpCompletionOption.ResponseHeadersRead,
                    cancellationToken);

                using var blazorScriptResponse = await httpClient.GetAsync(
                    new Uri(BaseUri, "/_framework/blazor.web.js"),
                    HttpCompletionOption.ResponseHeadersRead,
                    cancellationToken);

                if (loginResponse.StatusCode == HttpStatusCode.OK
                    && blazorScriptResponse.StatusCode == HttpStatusCode.OK)
                {
                    return;
                }
            }
            catch (Exception exception)
                when (exception is HttpRequestException or TaskCanceledException)
            {
                lastException = exception;
            }

            await Task.Delay(350, cancellationToken);
        }

        await WriteLogAsync();

        throw new TimeoutException(
            $"ERPPrototype did not become ready at {BaseUri}. " +
            $"Log: {logPath}",
            lastException);
    }

    private static void EnsureTcpPortAvailable(int port)
    {
        var listener = new TcpListener(IPAddress.Loopback, port);

        try
        {
            listener.Start();
        }
        catch (SocketException exception)
        {
            throw new InvalidOperationException(
                $"TCP port {port} is already in use. Close the running ERPPrototype process and retry.",
                exception);
        }
        finally
        {
            try
            {
                listener.Stop();
            }
            catch
            {
            }
        }
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

        lock (output)
        {
            content = output.ToString();
        }

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
