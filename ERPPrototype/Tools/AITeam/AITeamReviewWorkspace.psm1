Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-AITeamGitCapture {
    param(
        [Parameter(Mandatory)][string]$RepoRoot,
        [Parameter(Mandatory)][string[]]$Arguments
    )

    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $items = @(& git -C $RepoRoot @Arguments 2>&1)
        $code = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }

    $lines = New-Object System.Collections.Generic.List[string]
    foreach ($item in @($items)) {
        if ($item -is [System.Management.Automation.ErrorRecord] -and $null -ne $item.Exception) {
            $lines.Add([string]$item.Exception.Message)
        }
        else { $lines.Add([string]$item) }
    }
    return [pscustomobject][ordered]@{ exitCode=[int]$code; lines=@($lines); text=([string](@($lines) -join "`n")).Trim() }
}

function New-AITeamReviewWorkspace {
    param(
        [Parameter(Mandatory)][string]$RepoRoot,
        [Parameter(Mandatory)][string]$CommitSha,
        [Parameter(Mandatory)][string]$Role,
        [string]$WorkspaceBaseRoot
    )

    $repo = [System.IO.Path]::GetFullPath($RepoRoot)
    if ([string]::IsNullOrWhiteSpace($WorkspaceBaseRoot)) {
        if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
            $WorkspaceBaseRoot = Join-Path $env:LOCALAPPDATA 'ERPPrototype\AI-Team\W'
        }
        else { $WorkspaceBaseRoot = Join-Path $env:TEMP 'ERP-AI-Team-W' }
    }
    $base = [System.IO.Path]::GetFullPath($WorkspaceBaseRoot)
    New-Item -ItemType Directory -Force -Path $base | Out-Null

    $safeRole = [regex]::Replace($Role, '[^A-Za-z0-9_-]', '-')
    if ($safeRole.Length -gt 18) { $safeRole = $safeRole.Substring(0,18) }
    $shortSha = if ($CommitSha.Length -ge 8) { $CommitSha.Substring(0,8) } else { $CommitSha }
    $leaf = '{0}-{1}-{2}' -f $shortSha,$safeRole,[Guid]::NewGuid().ToString('N').Substring(0,6)
    $path = Join-Path $base $leaf

    if ($path.Length -gt 180) { throw "Review workspace path is unexpectedly long before creation: $path" }

    $add = Invoke-AITeamGitCapture -RepoRoot $repo -Arguments @('worktree','add','--detach','--force',$path,$CommitSha)
    if ($add.exitCode -ne 0) { throw "Unable to create isolated review workspace: $($add.text)" }

    try {
        $head = Invoke-AITeamGitCapture -RepoRoot $path -Arguments @('rev-parse','HEAD')
        if ($head.exitCode -ne 0 -or $head.text.Trim().ToLowerInvariant() -ne $CommitSha.ToLowerInvariant()) {
            throw "Review workspace commit mismatch. Expected $CommitSha, got $($head.text)."
        }
        return [pscustomobject][ordered]@{
            path = [System.IO.Path]::GetFullPath($path)
            commitSha = $CommitSha
            role = $Role
            created = $true
        }
    }
    catch {
        try { Invoke-AITeamGitCapture -RepoRoot $repo -Arguments @('worktree','remove','--force',$path) | Out-Null } catch { }
        throw
    }
}

function Get-AITeamReviewWorkspaceState {
    param([Parameter(Mandatory)][string]$WorkspaceRoot)

    if (-not (Test-Path -LiteralPath $WorkspaceRoot -PathType Container)) {
        return [pscustomobject][ordered]@{ exists=$false; clean=$false; changes=@('workspace missing') }
    }
    $status = Invoke-AITeamGitCapture -RepoRoot $WorkspaceRoot -Arguments @('status','--porcelain=v1','--untracked-files=all')
    if ($status.exitCode -ne 0) {
        return [pscustomobject][ordered]@{ exists=$true; clean=$false; changes=@("git status failed: $($status.text)") }
    }
    $changes = @($status.lines | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) })
    return [pscustomobject][ordered]@{ exists=$true; clean=($changes.Count -eq 0); changes=$changes }
}

function Remove-AITeamReviewWorkspace {
    param(
        [Parameter(Mandatory)][string]$RepoRoot,
        [Parameter(Mandatory)][string]$WorkspaceRoot
    )

    $repo = [System.IO.Path]::GetFullPath($RepoRoot)
    $remove = Invoke-AITeamGitCapture -RepoRoot $repo -Arguments @('worktree','remove','--force',$WorkspaceRoot)
    if ($remove.exitCode -ne 0) {
        Remove-Item -LiteralPath $WorkspaceRoot -Recurse -Force -ErrorAction SilentlyContinue
        Invoke-AITeamGitCapture -RepoRoot $repo -Arguments @('worktree','prune') | Out-Null
    }
    return (-not (Test-Path -LiteralPath $WorkspaceRoot))
}

Export-ModuleMember -Function Invoke-AITeamGitCapture, New-AITeamReviewWorkspace, Get-AITeamReviewWorkspaceState, Remove-AITeamReviewWorkspace
