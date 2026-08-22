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
Import-Module (Join-Path $PSScriptRoot 'AITeamCodex.psm1') -Force

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
if ([string]$config.teamVersion -ne '3.3.5') { throw "Expected AI Team 3.3.5, found $($config.teamVersion)." }
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

# V3.3.5: Windows PowerShell 5.1 treats an empty collection passed to a
# Mandatory parameter as a binding failure unless AllowEmptyCollection is
# explicitly declared. Exercise the zero-error path directly so this exact
# regression is caught locally before any model-backed run.
$validBindingSchemaPath = Join-Path $tempRoot 'valid-empty-errors-binding.schema.json'
@'
{
  "type": "object",
  "additionalProperties": false,
  "required": ["schemaVersion"],
  "properties": {
    "schemaVersion": { "type": "integer", "const": 1 }
  }
}
'@ | Set-Content -LiteralPath $validBindingSchemaPath -Encoding UTF8
$validBindingCheck = Test-AITeamCodexOutputSchema -SchemaPath $validBindingSchemaPath
if (-not $validBindingCheck.pass -or @($validBindingCheck.errors).Count -ne 0) {
    throw "Structured-output empty-error binding smoke failed: $(@($validBindingCheck.errors) -join ' | ')"
}

# V3.3.4: every schema that can be sent to Codex must pass the local
# Structured Outputs subset check before any model-backed test is allowed.
$modelSchemaKeys = @('routingPlan','reviewer','lead','product')
foreach ($schemaKey in $modelSchemaKeys) {
    $schemaRel = [string]$config.schemas.PSObject.Properties[$schemaKey].Value
    $schemaPath = Join-Path $RepoRoot $schemaRel
    $schemaCheck = Test-AITeamCodexOutputSchema -SchemaPath $schemaPath
    if (-not $schemaCheck.pass) {
        throw "Structured-output schema preflight failed for ${schemaKey}: $(@($schemaCheck.errors) -join ' | ')"
    }
}

# Exact negative canary for the AIT-02 failure class: const without type must
# be rejected locally before any Codex process is considered.
$badSchemaPath = Join-Path $tempRoot 'invalid-structured-output.schema.json'
@'
{
  "type": "object",
  "additionalProperties": false,
  "required": ["schemaVersion"],
  "properties": {
    "schemaVersion": { "const": 1 }
  }
}
'@ | Set-Content -LiteralPath $badSchemaPath -Encoding UTF8
$badSchemaCheck = Test-AITeamCodexOutputSchema -SchemaPath $badSchemaPath
if ($badSchemaCheck.pass -or (@($badSchemaCheck.errors) -join ' ') -notmatch 'const without an explicit type') {
    throw 'Structured-output negative canary failed to catch const-without-type.'
}

# V3.3.3: prove native STDERR from a successful process cannot abort the
# harness under Windows PowerShell 5.1 / ErrorActionPreference=Stop.
$nativeProbe = Invoke-AITeamNativeCapture -FilePath 'powershell.exe' -Arguments @(
    '-NoProfile',
    '-Command',
    "[Console]::Error.WriteLine('AIT_NATIVE_STDERR_OK'); exit 0"
)
if ($nativeProbe.exitCode -ne 0 -or $nativeProbe.text -notmatch 'AIT_NATIVE_STDERR_OK') {
    throw 'Native STDERR compatibility smoke failed.'
}

# V3.3.2: prove the official Codex installer wrapper parses under Windows
# PowerShell without any network request or model call.
$setupCodex = Join-Path $RepoRoot 'ERPPrototype\Tools\AITeam\Setup-AITeamCodexCli.ps1'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $setupCodex -SelfTest | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Codex installer wrapper self-test failed.' }

Write-Host 'AI TEAM RUNTIME COMPATIBILITY: PASS'
    Write-Host "- PowerShell: $($PSVersionTable.PSVersion)"
    Write-Host "- Team version: $($manifest.teamVersion)"
    Write-Host '- Relative-path manifest: PASS'
    Write-Host '- Locale-independent UTC finalization: PASS'
    Write-Host '- Metrics/trace/latest/index closure: PASS'
    Write-Host '- Codex installer wrapper (PowerShell 5.1 parse): PASS'
    Write-Host '- Native STDERR capture (PowerShell 5.1): PASS'
    Write-Host '- PowerShell 5.1 empty schema-error binding: PASS'
Write-Host '- Structured-output schema preflight: PASS (router/reviewer/lead/product)'
    Write-Host '- Structured-output negative canary (const without type): PASS'
}
finally {
    [System.Threading.Thread]::CurrentThread.CurrentCulture = $originalCulture
    [System.Threading.Thread]::CurrentThread.CurrentUICulture = $originalUICulture
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
