param(
    [switch]$InstallIfMissing,
    [switch]$Login
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Find-Codex {
    return (Get-Command codex -ErrorAction SilentlyContinue | Select-Object -First 1)
}

$cmd = Find-Codex
if ($null -eq $cmd -and $InstallIfMissing) {
    Write-Host 'Codex CLI not found. Installing with the official OpenAI Windows installer...'
    $installer = Invoke-WebRequest -Uri 'https://chatgpt.com/codex/install.ps1' -UseBasicParsing
    & ([scriptblock]::Create([string]$installer.Content))
    $userPath = [Environment]::GetEnvironmentVariable('Path','User')
    if (-not [string]::IsNullOrWhiteSpace($userPath)) { $env:Path = $env:Path.TrimEnd(';') + ';' + $userPath }
    $cmd = Find-Codex
}

if ($null -eq $cmd) {
    Write-Host 'CODEX CLI: NOT INSTALLED'
    Write-Host 'Run:'
    Write-Host '  erp-ai-team setup-codex'
    exit 2
}

$version = & codex --version 2>&1
Write-Host "CODEX CLI: $($version -join ' ')"
$status = & codex login status 2>&1
$statusCode = $LASTEXITCODE
Write-Host ($status -join [Environment]::NewLine)
$loggedIn = ($statusCode -eq 0 -and (($status -join ' ') -match '(?i)logged in|chatgpt'))

if (-not $loggedIn -and $Login) {
    Write-Host ''
    Write-Host 'Starting one-time ChatGPT sign-in for Codex CLI...'
    & codex login
    if ($LASTEXITCODE -ne 0) { throw 'Codex CLI login failed.' }
    $status = & codex login status 2>&1
    $statusCode = $LASTEXITCODE
    $loggedIn = ($statusCode -eq 0 -and (($status -join ' ') -match '(?i)logged in|chatgpt'))
}
if (-not $loggedIn) { throw 'Codex CLI is installed but not logged in with ChatGPT.' }

Write-Host 'CODEX CLI SETUP: PASS'
Write-Host '- model missions can now be launched by erp-ai-team without opening the Codex app.'
