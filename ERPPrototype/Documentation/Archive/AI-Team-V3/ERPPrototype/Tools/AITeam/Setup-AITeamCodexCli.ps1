param(
    [switch]$InstallIfMissing,
    [switch]$Login,
    [switch]$SelfTest
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Import-Module (Join-Path $PSScriptRoot 'AITeamCodex.psm1') -Force

function Get-OfficialCodexInstallerCommand {
    # Keep this equivalent to OpenAI's documented Windows installation flow.
    # TLS 1.2 is set explicitly for Windows PowerShell 5.1 before the first web request.
    return "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm 'https://chatgpt.com/codex/install.ps1' | iex"
}

if ($SelfTest) {
    $command = Get-OfficialCodexInstallerCommand
    # Parse the command locally without making a network request. This catches
    # quoting/PowerShell-5.1 regressions in the wrapper itself.
    [scriptblock]::Create($command) | Out-Null
    if ($command -notmatch 'chatgpt\.com/codex/install\.ps1' -or $command -notmatch '\|\s*iex') {
        throw 'Codex installer self-test failed: official installer command was not constructed correctly.'
    }
    Write-Host 'CODEX INSTALLER WRAPPER SELF-TEST: PASS'
    exit 0
}

$codex = Get-AITeamCodexCommand
if (-not $codex -and $InstallIfMissing) {
    Write-Host 'Codex CLI not found. Installing with the official OpenAI Windows installer...'

    # Do not download the installer with Invoke-WebRequest and cast Content to
    # string. On Windows PowerShell 5.1 Content can be Byte[], which turns into
    # text like "91 67 109 ..." and fails parsing. Run the documented installer
    # pipeline in a clean child PowerShell process instead.
    $installCommand = Get-OfficialCodexInstallerCommand
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -Command $installCommand
    if ($LASTEXITCODE -ne 0) {
        throw "Official Codex installer failed with exit code $LASTEXITCODE."
    }

    $codex = Get-AITeamCodexCommand
}

if (-not $codex) {
    Write-Host 'CODEX CLI: NOT INSTALLED'
    Write-Host 'Run:'
    Write-Host '  erp-ai-team setup-codex'
    exit 2
}

$versionResult = Invoke-AITeamNativeCapture -FilePath $codex -Arguments @('--version')
if ($versionResult.exitCode -ne 0) { throw 'Codex CLI was found but codex --version failed.' }
Write-Host "CODEX CLI: $($versionResult.text)"
Write-Host "- command: $codex"

$statusResult = Invoke-AITeamNativeCapture -FilePath $codex -Arguments @('login','status')
Write-Host $statusResult.text
$loggedIn = ($statusResult.exitCode -eq 0 -and $statusResult.text -match '(?i)logged in|chatgpt')

if (-not $loggedIn -and $Login) {
    Write-Host ''
    Write-Host 'Starting one-time ChatGPT sign-in for Codex CLI...'
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $codex login
        $loginCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($loginCode -ne 0) { throw 'Codex CLI login failed.' }
    $statusResult = Invoke-AITeamNativeCapture -FilePath $codex -Arguments @('login','status')
    $loggedIn = ($statusResult.exitCode -eq 0 -and $statusResult.text -match '(?i)logged in|chatgpt')
}
if (-not $loggedIn) { throw 'Codex CLI is installed but not logged in with ChatGPT.' }

Write-Host 'CODEX CLI SETUP: PASS'
Write-Host '- model missions can now be launched by erp-ai-team without opening the Codex app.'
