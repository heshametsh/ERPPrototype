[CmdletBinding()]
param(
    [switch]$Headed,
    [switch]$KeepDatabase,

    [ValidateSet('Smoke', 'Full')]
    [string]$Suite = 'Full',

    [switch]$SkipIntegration
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$canonicalRunner = Join-Path $PSScriptRoot 'Invoke-ERPTests.ps1'

if (-not (Test-Path $canonicalRunner)) {
    throw "The canonical automated-test runner was not found at $canonicalRunner"
}

& $canonicalRunner @PSBoundParameters
