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

$shim = Join-Path $bin 'erp-ai-team.cmd'
$escapedCli = $cli.Replace('%','%%')
@(
    '@echo off',
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + $escapedCli + '" %*'
) | Set-Content -LiteralPath $shim -Encoding ASCII

$userPath = [Environment]::GetEnvironmentVariable('Path','User')
$parts = @()
if (-not [string]::IsNullOrWhiteSpace($userPath)) { $parts = @($userPath -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }) }
$already = $false
foreach ($p in $parts) {
    if ([string]::Equals($p.TrimEnd([char]'\'), $bin.TrimEnd([char]'\'), [System.StringComparison]::OrdinalIgnoreCase)) { $already = $true; break }
}
if (-not $already) {
    $newUserPath = if ([string]::IsNullOrWhiteSpace($userPath)) { $bin } else { $userPath.TrimEnd(';') + ';' + $bin }
    [Environment]::SetEnvironmentVariable('Path',$newUserPath,'User')
}
if (-not (($env:Path -split ';') -contains $bin)) { $env:Path = $env:Path.TrimEnd(';') + ';' + $bin }

Write-Host 'AI Team local command setup: PASS'
Write-Host "- command: erp-ai-team"
Write-Host "- shim: $shim"
Write-Host "- repository: $RepoRoot"
Write-Host '- deterministic tests now run from PowerShell without opening Codex.'
