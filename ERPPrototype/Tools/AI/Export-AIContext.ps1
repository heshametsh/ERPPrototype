param(
    [string]$RepoRoot = "$env:USERPROFILE\source\repos\ERPPrototype",
    [string]$OutputDirectory = "$env:USERPROFILE\Downloads",
    [ValidateRange(0, 20)]
    [int]$MaxStashes = 5
)

$ErrorActionPreference = "Stop"

$repo = (Resolve-Path -LiteralPath $RepoRoot).Path
$gitDir = Join-Path $repo ".git"
if (-not (Test-Path -LiteralPath $gitDir)) {
    throw "Git repository was not found at: $repo"
}

if (-not (Test-Path -LiteralPath $OutputDirectory)) {
    New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
}

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$packageName = "ERP_AI_CONTEXT_$stamp"
$tempRoot = Join-Path $env:TEMP $packageName
$stage = Join-Path $tempRoot $packageName
$contextDir = Join-Path $stage "AI_CONTEXT"
$zip = Join-Path $OutputDirectory "$packageName.zip"

Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $stage | Out-Null

Write-Host "=== COPY CURRENT WORKING TREE ==="

$robocopyArgs = @(
    $repo,
    $stage,
    "/E",
    "/R:1",
    "/W:1",
    "/NFL",
    "/NDL",
    "/NJH",
    "/NJS",
    "/NP",
    "/XD", ".git", ".vs", "bin", "obj", "TestArtifacts", "node_modules",
    "/XF", "ERPPrototype.zip", "*.user", "ERP_AI_CONTEXT_*.zip"
)

& robocopy @robocopyArgs | Out-Null
$copyExitCode = $LASTEXITCODE
if ($copyExitCode -ge 8) {
    throw "Robocopy failed with exit code $copyExitCode."
}

New-Item -ItemType Directory -Force -Path $contextDir | Out-Null

Write-Host "Copy: PASS"
Write-Host ""
Write-Host "=== CAPTURE GIT EVIDENCE ==="

$branch = (& git -C $repo branch --show-current | Out-String).Trim()
$head = (& git -C $repo rev-parse HEAD | Out-String).Trim()
$status = (& git -C $repo status --short --untracked-files=all | Out-String).TrimEnd()
$recent = (& git -C $repo log -15 --oneline --decorate | Out-String).TrimEnd()
$stashList = (& git -C $repo stash list | Out-String).TrimEnd()
$untracked = (& git -C $repo ls-files --others --exclude-standard | Out-String).TrimEnd()

@(
    "=== BRANCH ==="
    $branch
    ""
    "=== HEAD ==="
    $head
    ""
    "=== STATUS ==="
    $status
    ""
    "=== STASHES ==="
    $stashList
    ""
    "=== UNTRACKED FILES ==="
    $untracked
    ""
    "=== RECENT COMMITS ==="
    $recent
) | Set-Content -LiteralPath (Join-Path $contextDir "REVIEW_GIT_INFO.txt") -Encoding UTF8

(& git -C $repo diff --no-ext-diff | Out-String) |
    Set-Content -LiteralPath (Join-Path $contextDir "CURRENT_UNCOMMITTED_DIFF.patch") -Encoding UTF8

(& git -C $repo diff --cached --no-ext-diff | Out-String) |
    Set-Content -LiteralPath (Join-Path $contextDir "CURRENT_STAGED_DIFF.patch") -Encoding UTF8

$stashLines = @(& git -C $repo stash list)
$stashCount = [Math]::Min($MaxStashes, $stashLines.Count)
for ($i = 0; $i -lt $stashCount; $i++) {
    $stashRef = "stash@{$i}"
    $safeName = "STASH_$i.patch"
    (& git -C $repo stash show -p $stashRef | Out-String) |
        Set-Content -LiteralPath (Join-Path $contextDir $safeName) -Encoding UTF8
}

@(
    "READ ORDER FOR A NEW CHAT"
    "1. AI_CONTROL_CENTER.md"
    "2. AI_CURRENT_STATE.md"
    "3. AI_CONTEXT/REVIEW_GIT_INFO.txt"
    "4. AI_CONTEXT/CURRENT_UNCOMMITTED_DIFF.patch"
    "5. AI_CONTEXT/STASH_*.patch when the current state references preserved work"
    "6. Only the code and documentation required by the current mission"
    ""
    "Git, current code, and executed tests override stale narrative documentation."
) | Set-Content -LiteralPath (Join-Path $contextDir "BOOTSTRAP_ORDER.txt") -Encoding UTF8

Write-Host "Git evidence: PASS"
Write-Host ""
Write-Host "=== CREATE CONTEXT ZIP ==="

if (Test-Path -LiteralPath $zip) {
    Remove-Item -LiteralPath $zip -Force
}

Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip -CompressionLevel Optimal
Remove-Item -LiteralPath $tempRoot -Recurse -Force

Write-Host ""
Write-Host "============================================"
Write-Host "AI CONTEXT PACKAGE READY"
Write-Host "NO SOURCE FILES WERE MODIFIED"
Write-Host "NO STASH OR COMMIT WAS CREATED"
Write-Host "============================================"
Write-Host ""
Write-Host $zip
