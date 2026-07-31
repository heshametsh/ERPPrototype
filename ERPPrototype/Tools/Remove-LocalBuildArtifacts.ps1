[CmdletBinding(SupportsShouldProcess)]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $projectRoot 'ERPPrototype.csproj'))) {
    throw "ERPPrototype.csproj was not found at $projectRoot"
}

$directoryNames = @('.vs', 'bin', 'obj', 'Debug', 'Release', 'artifacts', 'TestResults', 'coverage', 'publish')
$directories = Get-ChildItem $projectRoot -Directory -Recurse -Force -ErrorAction SilentlyContinue |
    Where-Object { $directoryNames -contains $_.Name } |
    Sort-Object FullName -Descending

foreach ($directory in $directories) {
    if ((Test-Path $directory.FullName) -and
        $PSCmdlet.ShouldProcess($directory.FullName, 'Remove generated directory')) {
        try {
            Remove-Item $directory.FullName -Recurse -Force -ErrorAction Stop
        }
        catch {
            Write-Warning "Could not remove $($directory.FullName). A running Debug process may be locking it. The clean archive will still exclude it. $($_.Exception.Message)"
        }
    }
}

$localFiles = Get-ChildItem $projectRoot -File -Recurse -Force -ErrorAction SilentlyContinue |
    Where-Object {
        $_.Name -match '\.(user|suo|userosscache|pdb|log|tmp|bak|orig)$'
    }

foreach ($file in $localFiles) {
    if ($PSCmdlet.ShouldProcess($file.FullName, 'Remove machine-local/generated file')) {
        Remove-Item $file.FullName -Force -ErrorAction Stop
    }
}

$obsoleteRootFiles = @(
    '03_CURRENT_IMPLEMENTATION.md',
    '09_REFACTOR_ROADMAP.md',
    'SHA256SUMS.txt'
)

foreach ($name in $obsoleteRootFiles) {
    $path = Join-Path $projectRoot $name
    if (Test-Path $path) {
        if ($PSCmdlet.ShouldProcess($path, 'Remove obsolete duplicate/checksum file')) {
            Remove-Item $path -Force -ErrorAction Stop
        }
    }
}

Get-ChildItem $projectRoot -File -Filter 'README_PHASE8_*.md' -ErrorAction SilentlyContinue |
    ForEach-Object {
        if ($PSCmdlet.ShouldProcess($_.FullName, 'Remove obsolete patch README')) {
            Remove-Item $_.FullName -Force -ErrorAction Stop
        }
    }

Write-Host 'Local build artifacts and obsolete root duplicates removed.' -ForegroundColor Green
