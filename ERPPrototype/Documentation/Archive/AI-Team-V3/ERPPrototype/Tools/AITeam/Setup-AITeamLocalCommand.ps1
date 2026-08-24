param(
    [string]$RepoRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
    $RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
} else {
    $RepoRoot = [System.IO.Path]::GetFullPath($RepoRoot)
}

$stateRoot = if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'ERPPrototype\AI-Team' } else { Join-Path $env:TEMP 'ERPPrototype-AI-Team' }
$bin = Join-Path $stateRoot 'bin'
New-Item -ItemType Directory -Force -Path $bin | Out-Null

$cli = Join-Path $RepoRoot 'ERPPrototype\Tools\AITeam\AITeamCli.ps1'
if (-not (Test-Path -LiteralPath $cli -PathType Leaf)) { throw "AI Team CLI not found: $cli" }

# The AI-Team bin directory is dedicated to this harness. Remove stale command siblings
# so PowerShell/Windows can never resolve an old .ps1/.bat before the intended .cmd shim.
foreach ($staleName in @('erp-ai-team.ps1','erp-ai-team.bat','erp-ai-team.exe','erp-ai-team.com')) {
    $stalePath = Join-Path $bin $staleName
    if (Test-Path -LiteralPath $stalePath -PathType Leaf) {
        Remove-Item -LiteralPath $stalePath -Force
    }
}

$shim = Join-Path $bin 'erp-ai-team.cmd'
$escapedCli = $cli.Replace('%','%%')

# Keep quoting inside CMD variables instead of composing -File quotes inline. This is
# intentionally conservative for Windows PowerShell 5.1 / cmd.exe interoperability.
$shimLines = @(
    '@echo off',
    'setlocal',
    ('set "ERP_AI_TEAM_CLI={0}"' -f $escapedCli),
    'powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%ERP_AI_TEAM_CLI%" %*',
    'set "ERP_AI_TEAM_EXIT=%ERRORLEVEL%"',
    'endlocal & exit /b %ERP_AI_TEAM_EXIT%'
)
$shimLines | Set-Content -LiteralPath $shim -Encoding ASCII

$userPath = [Environment]::GetEnvironmentVariable('Path','User')
$parts = @()
if (-not [string]::IsNullOrWhiteSpace($userPath)) {
    $parts = @($userPath -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}
$already = $false
foreach ($p in $parts) {
    if ([string]::Equals($p.TrimEnd([char]'\'), $bin.TrimEnd([char]'\'), [System.StringComparison]::OrdinalIgnoreCase)) {
        $already = $true
        break
    }
}
if (-not $already) {
    $newUserPath = if ([string]::IsNullOrWhiteSpace($userPath)) { $bin } else { $userPath.TrimEnd(';') + ';' + $bin }
    [Environment]::SetEnvironmentVariable('Path',$newUserPath,'User')
}
if (-not (($env:Path -split ';') -contains $bin)) {
    $env:Path = $env:Path.TrimEnd(';') + ';' + $bin
}

# Do not report PASS until the exact installed command has successfully crossed
# cmd.exe -> powershell.exe -> AITeamCli.ps1 on this Windows machine.
$probeOutput = @(& $shim doctor 2>&1)
$probeExit = $LASTEXITCODE
if ($probeExit -ne 0) {
    $probeText = ($probeOutput | ForEach-Object { [string]$_ }) -join "`n"
    throw "AI Team command shim self-test failed with exit code $probeExit.`n$probeText"
}

$resolved = Get-Command erp-ai-team -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -eq $resolved) {
    throw "AI Team command was installed but cannot be resolved from PATH: $bin"
}

Write-Host 'AI Team local command setup: PASS'
Write-Host '- command self-test: PASS'
Write-Host "- command: erp-ai-team"
Write-Host "- resolved: $($resolved.Source)"
Write-Host "- shim: $shim"
Write-Host "- repository: $RepoRoot"
Write-Host '- deterministic tests now run from PowerShell without opening Codex.'
