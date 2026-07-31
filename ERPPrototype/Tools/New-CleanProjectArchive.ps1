[CmdletBinding()]
param(
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $projectRoot 'ERPPrototype.csproj'))) {
    throw "ERPPrototype.csproj was not found at $projectRoot"
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $parent = Split-Path -Parent $projectRoot
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $OutputPath = Join-Path $parent "ERPPrototype_Source_$stamp.zip"
}
elseif (-not [System.IO.Path]::IsPathRooted($OutputPath)) {
    $OutputPath = Join-Path (Get-Location) $OutputPath
}

$outputFullPath = [System.IO.Path]::GetFullPath($OutputPath)
$outputDirectory = Split-Path -Parent $outputFullPath
if (-not (Test-Path $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

if (Test-Path $outputFullPath) {
    Remove-Item $outputFullPath -Force
}

$excludedDirectoryNames = @(
    '.git', '.vs', 'bin', 'obj', 'Debug', 'Release', 'artifacts',
    'TestResults', 'coverage', 'publish'
)

$excludedRelativePrefixes = @(
    'Properties/PublishProfiles/',
    'Properties/ServiceDependencies/'
)

$excludedExtensions = @(
    '.user', '.suo', '.userosscache', '.pdb', '.exe', '.dll',
    '.log', '.tmp', '.bak', '.orig', '.zip'
)

function Get-ProjectRelativePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BasePath,

        [Parameter(Mandatory = $true)]
        [string]$TargetPath
    )

    $baseFullPath = [System.IO.Path]::GetFullPath($BasePath).TrimEnd('\', '/')
    $targetFullPath = [System.IO.Path]::GetFullPath($TargetPath)
    $basePrefix = $baseFullPath + [System.IO.Path]::DirectorySeparatorChar

    if (-not $targetFullPath.StartsWith($basePrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "The file '$targetFullPath' is outside the project root '$baseFullPath'."
    }

    return $targetFullPath.Substring($basePrefix.Length)
}

$files = @(Get-ChildItem $projectRoot -File -Recurse -Force | Where-Object {
    $file = $_
    $relative = (Get-ProjectRelativePath -BasePath $projectRoot -TargetPath $file.FullName).Replace('\', '/')
    $segments = $relative.Split('/')

    $hasExcludedDirectory = $false
    foreach ($segment in $segments) {
        if ($excludedDirectoryNames -contains $segment) {
            $hasExcludedDirectory = $true
            break
        }
    }

    if ($hasExcludedDirectory) {
        return $false
    }

    foreach ($prefix in $excludedRelativePrefixes) {
        if ($relative.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
            return $false
        }
    }

    if ($excludedExtensions -contains $file.Extension.ToLowerInvariant()) {
        return $false
    }

    if ($relative -eq 'appsettings.Local.json') {
        return $false
    }

    return $true
} | Sort-Object FullName)

$archive = [System.IO.Compression.ZipFile]::Open($outputFullPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in $files) {
        $relative = (Get-ProjectRelativePath -BasePath $projectRoot -TargetPath $file.FullName).Replace('\', '/')
        $entryName = "ERPPrototype/$relative"
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive,
            $file.FullName,
            $entryName,
            [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
}
finally {
    $archive.Dispose()
}

$archiveInfo = Get-Item $outputFullPath
$sizeMb = [Math]::Round($archiveInfo.Length / 1MB, 2)
Write-Host "Clean source archive created: $outputFullPath" -ForegroundColor Green
Write-Host "Files: $($files.Count) | Size: $sizeMb MB"
Write-Host 'Excluded: bin, obj, .vs, build output, machine-local files, publish output, logs, binaries, and nested ZIP files.'
