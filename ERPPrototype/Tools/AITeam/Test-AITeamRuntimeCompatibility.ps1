param(
    [string]$RepoRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
    $RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
}
else {
    $RepoRoot = [System.IO.Path]::GetFullPath($RepoRoot)
}

Import-Module (Join-Path $PSScriptRoot 'AITeamRun.psm1') -Force

$originalCulture = [System.Threading.Thread]::CurrentThread.CurrentCulture
$originalUICulture = [System.Threading.Thread]::CurrentThread.CurrentUICulture
$tempRoot = Join-Path $env:TEMP ('ERP-AI-Team-Compat-' + [Guid]::NewGuid().ToString('N'))
$runDir = Join-Path $tempRoot 'run'
New-Item -ItemType Directory -Force -Path $runDir | Out-Null

try {
    # Prove harness-manifest path discovery works on Windows PowerShell 5.1 without Path.GetRelativePath.
    $manifest = Get-AITeamHarnessManifest -RepoRoot $RepoRoot
    if (@($manifest.files).Count -lt 5) {
        throw 'Compatibility smoke: harness manifest returned too few files.'
    }
    foreach ($entry in @($manifest.files)) {
        $p = [string]$entry.path
        if ([System.IO.Path]::IsPathRooted($p)) {
            throw "Compatibility smoke: manifest path must be repository-relative: $p"
        }
    }

    # Reproduce the real failure class deliberately: finalize after JSON round-trip under a non-US culture.
    try {
        $probeCulture = New-Object System.Globalization.CultureInfo('ar-EG')
        [System.Threading.Thread]::CurrentThread.CurrentCulture = $probeCulture
        [System.Threading.Thread]::CurrentThread.CurrentUICulture = $probeCulture
    }
    catch {
        # If the specific culture is unavailable, invariant handling is still tested by the JSON round-trip below.
    }

    $started = [DateTime]::UtcNow.AddSeconds(-1)
    $run = [pscustomobject][ordered]@{
        schemaVersion = 1
        runId = 'compat-' + [Guid]::NewGuid().ToString('N')
        missionId = 'COMPAT'
        mission = 'Windows PowerShell runtime compatibility smoke'
        mode = 'deterministic'
        commitSha = (& git -C $RepoRoot rev-parse HEAD).Trim()
        repoRoot = $RepoRoot
        stateRoot = $tempRoot
        runDirectory = $runDir
        teamVersion = [string]$manifest.teamVersion
        startedUtc = $started.ToString('o', [System.Globalization.CultureInfo]::InvariantCulture)
        startedUtcTicks = [int64]$started.Ticks
        endedUtc = $null
        result = 'RUNNING'
        elapsedMilliseconds = $null
    }
    Write-AITeamJsonFile -Value $run -Path (Join-Path $runDir 'run.json')
    Add-AITeamTrace -RunDir $runDir -Event 'RUN_START' -Phase 'compatibility' -Status 'RUNNING' -Detail 'runtime smoke' | Out-Null

    $final = Complete-AITeamRun -RunDir $runDir -Result 'PASS' -Summary 'PowerShell/locale/path compatibility smoke.'
    if ([string]$final.result -ne 'PASS') { throw 'Compatibility smoke: final result was not PASS.' }

    foreach ($required in @('run.json','trace.jsonl','trace-summary.json','metrics.json','summary.txt')) {
        if (-not (Test-Path -LiteralPath (Join-Path $runDir $required) -PathType Leaf)) {
            throw "Compatibility smoke: missing final artifact $required"
        }
    }
    foreach ($required in @('latest.json','runs-index.jsonl')) {
        if (-not (Test-Path -LiteralPath (Join-Path $tempRoot $required) -PathType Leaf)) {
            throw "Compatibility smoke: missing state artifact $required"
        }
    }

    $closed = Get-Content -LiteralPath (Join-Path $runDir 'run.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ([string]$closed.result -ne 'PASS' -or $null -eq $closed.endedUtc) {
        throw 'Compatibility smoke: run.json was not closed correctly.'
    }

    # V3.3 local-first file/config checks (no Codex model call).
$configPath = Join-Path $RepoRoot '.ai\team-config.json'
$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ([string]$config.teamVersion -ne '3.3') { throw "Expected AI Team 3.3, found $($config.teamVersion)." }
foreach ($rel in @(
    'ERPPrototype\Tools\AITeam\AITeamCli.ps1',
    'ERPPrototype\Tools\AITeam\AITeamCodex.psm1',
    'ERPPrototype\Tools\AITeam\run_ai_test.ps1',
    'ERPPrototype\Tools\AITeam\Setup-AITeamLocalCommand.ps1',
    'ERPPrototype\Tools\AITeam\Setup-AITeamCodexCli.ps1',
    '.ai\prompts\mission-router.md',
    '.ai\schemas\routing-plan.schema.json'
)) {
    if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot $rel) -PathType Leaf)) { throw "V3.3 required file missing: $rel" }
}
$routingSchema = Get-Content -LiteralPath (Join-Path $RepoRoot '.ai\schemas\routing-plan.schema.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($null -eq $routingSchema) { throw 'Routing schema could not be parsed.' }

Write-Host 'AI TEAM RUNTIME COMPATIBILITY: PASS'
    Write-Host "- PowerShell: $($PSVersionTable.PSVersion)"
    Write-Host "- Team version: $($manifest.teamVersion)"
    Write-Host '- Relative-path manifest: PASS'
    Write-Host '- Locale-independent UTC finalization: PASS'
    Write-Host '- Metrics/trace/latest/index closure: PASS'
}
finally {
    [System.Threading.Thread]::CurrentThread.CurrentCulture = $originalCulture
    [System.Threading.Thread]::CurrentThread.CurrentUICulture = $originalUICulture
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
