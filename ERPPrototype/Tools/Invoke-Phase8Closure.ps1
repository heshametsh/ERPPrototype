[CmdletBinding()]
param(
    [string]$ArchiveOutputPath,
    [switch]$SkipJavaScriptSyntax
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

& (Join-Path $PSScriptRoot 'Remove-LocalBuildArtifacts.ps1')

$verificationArguments = @{}
if ($SkipJavaScriptSyntax) {
    $verificationArguments.SkipJavaScriptSyntax = $true
}
& (Join-Path $PSScriptRoot 'Invoke-Phase8Verification.ps1') @verificationArguments

$archiveArguments = @{}
if (-not [string]::IsNullOrWhiteSpace($ArchiveOutputPath)) {
    $archiveArguments.OutputPath = $ArchiveOutputPath
}
& (Join-Path $PSScriptRoot 'New-CleanProjectArchive.ps1') @archiveArguments

Write-Host "`nPhase 8.9 closure workflow: PASS" -ForegroundColor Green
