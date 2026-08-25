[CmdletBinding()]
param(
    [string[]]$RunnerArguments = @('--revo-gate5b5-trace')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$cleanupScript = Join-Path $PSScriptRoot 'RepositoryProcessCleanup.ps1'
$projectPath = Join-Path $repositoryRoot 'ERPPrototype.E2ETests\ERPPrototype.E2ETests.csproj'

& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $cleanupScript -CleanupOnly -RepositoryRoot $repositoryRoot
if ($LASTEXITCODE -ne 0) {
    throw "Repository-owned E2E process cleanup failed with exit code $LASTEXITCODE."
}

& dotnet run --project $projectPath -- @RunnerArguments
exit $LASTEXITCODE
