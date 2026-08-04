[CmdletBinding()]
param(
    [switch]$SkipArchive
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent $PSScriptRoot
$workOrdersCssPath = Join-Path $projectRoot "Components\Pages\WorkOrders.razor.css"
$appCssPath = Join-Path $projectRoot "wwwroot\app.css"

function Assert-True {
    param(
        [Parameter(Mandatory = $true)][bool]$Condition,
        [Parameter(Mandatory = $true)][string]$Message
    )

    if (-not $Condition) {
        throw $Message
    }
}

function Get-TextMetrics {
    param([Parameter(Mandatory = $true)][string]$Path)

    Assert-True (Test-Path -LiteralPath $Path) "Missing required CSS file: $Path"
    $content = Get-Content -LiteralPath $Path -Raw -Encoding UTF8

    [pscustomobject]@{
        Path           = $Path
        Content        = $content
        Lines          = ($content -split "`r?`n").Count
        ImportantCount = ([regex]::Matches($content, '!important')).Count
        OpenBraces     = ([regex]::Matches($content, '\{')).Count
        CloseBraces    = ([regex]::Matches($content, '\}')).Count
    }
}

Write-Host "Phase 9.2C CSS consolidation validation" -ForegroundColor Cyan

$workOrdersCss = Get-TextMetrics -Path $workOrdersCssPath
$appCss = Get-TextMetrics -Path $appCssPath
$combined = $workOrdersCss.Content + "`n" + $appCss.Content

$legacyTokens = @(
    "PHASE 9.2A",
    "PHASE 9.2B",
    "work-orders-sheet-toolbar",
    "sheet-search-box",
    "page-header-search-box"
)

foreach ($token in $legacyTokens) {
    Assert-True ($combined.IndexOf($token, [System.StringComparison]::OrdinalIgnoreCase) -lt 0) "Legacy CSS token is still present: $token"
}

Assert-True ($workOrdersCss.OpenBraces -eq $workOrdersCss.CloseBraces) "Unbalanced braces in WorkOrders.razor.css."
Assert-True ($appCss.OpenBraces -eq $appCss.CloseBraces) "Unbalanced braces in app.css."

$totalLines = $workOrdersCss.Lines + $appCss.Lines
$totalImportant = $workOrdersCss.ImportantCount + $appCss.ImportantCount

Assert-True ($totalLines -le 2200) "CSS line budget exceeded: $totalLines lines."
Assert-True ($totalImportant -le 150) "CSS !important budget exceeded: $totalImportant declarations."

if (-not $SkipArchive) {
    $archiveDirectory = Join-Path $projectRoot "Documentation\Archive\Phase9-Patches\2026-08-03"
    New-Item -ItemType Directory -Path $archiveDirectory -Force | Out-Null

    $manifestFiles = Get-ChildItem -LiteralPath $projectRoot -File | Where-Object {
        $_.Name -match '^PATCH_MANIFEST_(PHASE_9_|ROLLBACK_TO_PHASE_9_)' -and
        $_.Name -ne 'PATCH_MANIFEST_PHASE_9_2C.md'
    }

    foreach ($manifest in $manifestFiles) {
        Move-Item -LiteralPath $manifest.FullName -Destination (Join-Path $archiveDirectory $manifest.Name) -Force
    }

    Write-Host ("Archived {0} old Phase 9 manifest file(s) to {1}" -f $manifestFiles.Count, $archiveDirectory) -ForegroundColor DarkGray
}
else {
    Write-Host "Skipped old manifest archive (-SkipArchive)." -ForegroundColor DarkGray
}

Write-Host ("WorkOrders.razor.css: {0} lines, {1} !important" -f $workOrdersCss.Lines, $workOrdersCss.ImportantCount)
Write-Host ("app.css: {0} lines, {1} !important" -f $appCss.Lines, $appCss.ImportantCount)
Write-Host ("Combined: {0} lines, {1} !important" -f $totalLines, $totalImportant)
Write-Host "Phase 9.2C static validation: PASS" -ForegroundColor Green
