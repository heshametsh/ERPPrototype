param(
    [Parameter(Mandatory=$true)]
    [string]$TestId,
    [string]$RepoRoot,
    [string]$StateRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
    $RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
}
else {
    $RepoRoot = [System.IO.Path]::GetFullPath($RepoRoot)
}

$configPath = Join-Path $RepoRoot '.ai\team-config.json'
if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
    throw "AI Team config not found: $configPath"
}
$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json

$suitePath = Join-Path $RepoRoot ([string]$config.qualification.suite)
if (-not (Test-Path -LiteralPath $suitePath -PathType Leaf)) {
    throw "AI Team suite not found: $suitePath"
}
$suite = Get-Content -LiteralPath $suitePath -Raw -Encoding UTF8 | ConvertFrom-Json
$matches = @($suite.missions | Where-Object { [string]$_.id -eq $TestId })
if ($matches.Count -ne 1) {
    throw "Test $TestId not found exactly once in configured suite."
}
$mission = $matches[0]
$fast = @($config.qualification.fastDeterministicTests | ForEach-Object { [string]$_ })

Write-Host "AI_DISPATCH_TEST_ID=$TestId"
Write-Host "AI_DISPATCH_TEAM_VERSION=$($config.teamVersion)"
Write-Host "AI_DISPATCH_MODE=$($mission.mode)"
Write-Host "AI_DISPATCH_NAME=$($mission.name)"

if ($fast -contains $TestId) {
    if ([string]$mission.mode -ne 'deterministic') {
        throw "$TestId is configured as fast deterministic but suite mode is '$($mission.mode)'."
    }
    $script = Join-Path $PSScriptRoot 'run_deterministic_test.ps1'
    $args = @('-NoProfile','-ExecutionPolicy','Bypass','-File',$script,'-TestId',$TestId,'-RepoRoot',$RepoRoot)
    if (-not [string]::IsNullOrWhiteSpace($StateRoot)) {
        $args += @('-StateRoot',$StateRoot)
    }
    & powershell @args
    $code = $LASTEXITCODE
    Write-Host "AI_DISPATCH_COMPLETE=1"
    exit $code
}

# Non-deterministic missions are launched locally through Codex CLI only after the
# deterministic dispatcher proves that a model is actually needed. Opening the
# Codex desktop app is not part of normal test execution.
$script = Join-Path $PSScriptRoot 'run_ai_test.ps1'
$args = @('-NoProfile','-ExecutionPolicy','Bypass','-File',$script,'-TestId',$TestId,'-RepoRoot',$RepoRoot)
if (-not [string]::IsNullOrWhiteSpace($StateRoot)) { $args += @('-StateRoot',$StateRoot) }
& powershell.exe @args
$code = $LASTEXITCODE
Write-Host "AI_DISPATCH_COMPLETE=1"
exit $code
