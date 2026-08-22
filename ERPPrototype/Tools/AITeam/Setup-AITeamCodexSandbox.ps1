param(
    [string]$RepoRoot,
    [switch]$EnableAutoReview
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
    $RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
}
else {
    $RepoRoot = [System.IO.Path]::GetFullPath($RepoRoot)
}

$configPath = Join-Path $RepoRoot '.ai\team-config.json'
$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$rawRoot = [Environment]::ExpandEnvironmentVariables([string]$config.runState.root)
$stateRoot = [System.IO.Path]::GetFullPath($rawRoot)
New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null

$codexDir = Join-Path $env:USERPROFILE '.codex'
New-Item -ItemType Directory -Path $codexDir -Force | Out-Null
$codexConfig = Join-Path $codexDir 'config.toml'

if (Test-Path -LiteralPath $codexConfig -PathType Leaf) {
    $text = Get-Content -LiteralPath $codexConfig -Raw -Encoding UTF8
    $stamp = [DateTime]::Now.ToString('yyyyMMdd-HHmmss')
    Copy-Item -LiteralPath $codexConfig -Destination "$codexConfig.erp-ai-team-$stamp.bak" -Force
}
else {
    $text = ''
}

# TOML literal strings keep Windows backslashes literal.
$tomlRoot = $stateRoot.Replace('\','/')
$newLine = 'sandbox_workspace_write.writable_roots = ["' + $tomlRoot + '"]'
$pattern = '(?m)^\s*sandbox_workspace_write\.writable_roots\s*=.*$'

if ([regex]::IsMatch($text, $pattern)) {
    $currentLine = [regex]::Match($text, $pattern).Value
    if (($currentLine -notmatch [regex]::Escape($stateRoot)) -and ($currentLine -notmatch [regex]::Escape($tomlRoot))) {
        $quotePattern = '["'']([^"'']+)["'']'
        $quoted = [regex]::Matches($currentLine, $quotePattern) | ForEach-Object { $_.Groups[1].Value }
        $roots = New-Object System.Collections.Generic.List[string]
        foreach ($r in $quoted) { if (-not [string]::IsNullOrWhiteSpace($r) -and -not $roots.Contains($r)) { $roots.Add($r) } }
        if (-not $roots.Contains($tomlRoot)) { $roots.Add($tomlRoot) }
        $parts = $roots | ForEach-Object { '"' + $_.Replace('\','/').Replace('"','\"') + '"' }
        $replacement = 'sandbox_workspace_write.writable_roots = [' + ($parts -join ', ') + ']'
        $text = ([regex]::new($pattern)).Replace($text, $replacement, 1)
    }
}
else {
    if ($text.Length -gt 0 -and -not $text.EndsWith("`n")) { $text += "`r`n" }
    $text += "`r`n# ERP AI Team: allow only harness evidence/state writes outside the repository.`r`n$newLine`r`n"
}

if ($EnableAutoReview) {
    $autoPattern = '(?m)^\s*approvals_reviewer\s*=.*$'
    if ([regex]::IsMatch($text, $autoPattern)) {
        $text = ([regex]::new($autoPattern)).Replace($text, 'approvals_reviewer = "auto_review"', 1)
    }
    else {
        if (-not $text.EndsWith("`n")) { $text += "`r`n" }
        $text += 'approvals_reviewer = "auto_review"' + "`r`n"
    }
}

Set-Content -LiteralPath $codexConfig -Value $text -Encoding UTF8

Write-Host "AI Team Codex sandbox setup complete."
Write-Host "- state root: $stateRoot"
Write-Host "- Codex config: $codexConfig"
Write-Host "- auto-review: $(if ($EnableAutoReview) { 'enabled' } else { 'unchanged/off by default' })"
Write-Host "Restart Codex once so config.toml is reloaded."
