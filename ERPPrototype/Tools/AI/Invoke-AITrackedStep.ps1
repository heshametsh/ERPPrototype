param(
    [Parameter(Mandatory = $true)][string]$MissionId,
    [Parameter(Mandatory = $true)][string]$Stage,
    [Parameter(Mandatory = $true)][string]$Action,
    [Parameter(Mandatory = $true)][scriptblock]$Operation,
    [string]$SessionId = "",
    [string]$Classification = "NA",
    [string]$EvidencePath = "",
    [string]$FilesChanged = "",
    [string]$Notes = "",
    [switch]$AllowFailure
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$logPath = Join-Path $projectRoot "Documentation\AI_EXECUTION_LOG.csv"
if ([string]::IsNullOrWhiteSpace($SessionId)) {
    $SessionId = (Get-Date -Format "yyyyMMdd-HHmmss") + "-" + $PID
}

$started = [DateTimeOffset]::Now
$watch = [System.Diagnostics.Stopwatch]::StartNew()
$outcome = "PASS"
$exitCode = 0
$errorText = ""
$caught = $null

try {
    $global:LASTEXITCODE = 0
    & $Operation
    if ($global:LASTEXITCODE -is [int] -and $global:LASTEXITCODE -ne 0) {
        $exitCode = [int]$global:LASTEXITCODE
        $outcome = "FAIL"
    }
}
catch {
    $caught = $_
    $outcome = "FAIL"
    $exitCode = 1
    $errorText = $_.Exception.Message
}
finally {
    $watch.Stop()
    $ended = [DateTimeOffset]::Now
    $effectiveClass = if ($outcome -eq "FAIL" -and $Classification -eq "NA") { "UNCLASSIFIED" } else { $Classification }
    $row = [pscustomobject][ordered]@{
        EventId = [guid]::NewGuid().ToString("N")
        StartedAt = $started.ToString("yyyy-MM-ddTHH:mm:ss.fffzzz")
        EndedAt = $ended.ToString("yyyy-MM-ddTHH:mm:ss.fffzzz")
        DurationMs = $watch.ElapsedMilliseconds
        SessionId = $SessionId
        MissionId = $MissionId
        Stage = $Stage
        Action = $Action
        Outcome = $outcome
        Classification = $effectiveClass
        ExitCode = $exitCode
        EvidencePath = $EvidencePath
        FilesChanged = $FilesChanged
        Notes = $Notes
        Error = $errorText
        Host = $env:COMPUTERNAME
    }
    $csv = @($row | ConvertTo-Csv -NoTypeInformation)
    if (-not (Test-Path $logPath)) {
        [IO.File]::WriteAllLines($logPath, $csv, (New-Object Text.UTF8Encoding($false)))
    } else {
        [IO.File]::AppendAllText($logPath, $csv[1] + [Environment]::NewLine, (New-Object Text.UTF8Encoding($false)))
    }
}

if ($outcome -eq "FAIL" -and -not $AllowFailure) {
    if ($caught) { throw $caught }
    throw "Tracked step '$Action' failed with exit code $exitCode."
}