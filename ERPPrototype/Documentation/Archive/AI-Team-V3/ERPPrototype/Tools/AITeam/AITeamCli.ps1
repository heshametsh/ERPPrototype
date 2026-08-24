param(
    [Parameter(Position=0,Mandatory=$true)]
    [ValidateSet('test','smoke-router','smoke-reviewer','latest','history','doctor','setup-codex','allowance','usage')]
    [string]$Command,
    [Parameter(Position=1)][string]$Arg1,
    [Parameter(Position=2)][string]$Arg2
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
Import-Module (Join-Path $PSScriptRoot 'AITeamRun.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'AITeamCodex.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'AITeamLocalRouter.psm1') -Force
$StateRoot = Get-AITeamStateRoot

function Show-Latest {
    $latestPath = Join-Path $StateRoot 'latest.json'
    if (-not (Test-Path -LiteralPath $latestPath -PathType Leaf)) { Write-Host 'No AI Team runs recorded yet.'; return }
    $latest = Get-Content -LiteralPath $latestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    Write-Host "Latest: $($latest.missionId) = $($latest.result)"
    if ($latest.elapsedMilliseconds) { Write-Host "- elapsed ms: $($latest.elapsedMilliseconds)" }
    Write-Host "- evidence: $($latest.runDirectory)"
    $summary = Join-Path ([string]$latest.runDirectory) 'summary.txt'
    if (Test-Path -LiteralPath $summary -PathType Leaf) { Write-Host "- summary: $summary" }
}

switch ($Command) {
    'test' {
        if ([string]::IsNullOrWhiteSpace($Arg1)) { throw 'Usage: erp-ai-team test AIT-04' }
        $dispatch = Join-Path $PSScriptRoot 'AITeamDispatch.ps1'
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $dispatch -TestId $Arg1 -RepoRoot $RepoRoot
        $code = $LASTEXITCODE
        Write-Host ''
        Show-Latest
        exit $code
    }
    'smoke-router' {
        if ([string]::IsNullOrWhiteSpace($Arg1)) { throw 'Usage: erp-ai-team smoke-router AIT-02' }
        $smoke = Join-Path $PSScriptRoot 'run_router_smoke.ps1'
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $smoke -TestId $Arg1 -RepoRoot $RepoRoot
        $code = $LASTEXITCODE
        Write-Host ''
        Show-Latest
        exit $code
    }
    'smoke-reviewer' {
        if ([string]::IsNullOrWhiteSpace($Arg1) -or [string]::IsNullOrWhiteSpace($Arg2)) { throw 'Usage: erp-ai-team smoke-reviewer AIT-02 revo' }
        $smoke = Join-Path $PSScriptRoot 'run_reviewer_smoke.ps1'
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $smoke -TestId $Arg1 -Role $Arg2 -RepoRoot $RepoRoot
        $code = $LASTEXITCODE
        Write-Host ''
        Show-Latest
        exit $code
    }
    'latest' { Show-Latest; break }
    'history' {
        $index = Join-Path $StateRoot 'runs-index.jsonl'
        if (-not (Test-Path -LiteralPath $index -PathType Leaf)) { Write-Host 'No run history yet.'; break }
        $rows = @()
        foreach ($line in @(Get-Content -LiteralPath $index -Encoding UTF8)) {
            if ([string]::IsNullOrWhiteSpace($line)) { continue }
            try { $row = $line | ConvertFrom-Json } catch { continue }
            if ([string]::IsNullOrWhiteSpace($Arg1) -or [string]$row.missionId -eq $Arg1) { $rows += $row }
        }
        $rows | Select-Object -Last 15 | ForEach-Object {
            Write-Host ("{0}  {1,-7}  {2,8} ms  reviewers={3}  {4}" -f $_.missionId,$_.result,$_.elapsedMilliseconds,$_.reviewerCount,$_.runId)
        }
        break
    }
    'doctor' {
        Write-Host 'ERP AI TEAM DOCTOR'
        Write-Host "- repo: $RepoRoot"
        Write-Host "- PowerShell: $($PSVersionTable.PSVersion)"
        $head = & git -C $RepoRoot rev-parse --short HEAD 2>&1
        Write-Host "- Git HEAD: $($head -join ' ')"
        $config = Get-Content -LiteralPath (Join-Path $RepoRoot '.ai\team-config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        Write-Host "- Team: $($config.teamVersion) / $($config.operatingProfile)"
        Write-Host "- state: $StateRoot"
        $rulesPath = Join-Path $RepoRoot ([string]$config.routing.rulesPath)
        $localRouterCheck = Test-AITeamLocalRouterRules -RulesPath $rulesPath
        Write-Host "- Local router rules: $(if ($localRouterCheck.pass) { 'PASS' } else { 'FAIL' })"
        Write-Host "- Routing strategy: $([string]$config.routing.strategy)"
        if (-not $localRouterCheck.pass) { foreach ($e in @($localRouterCheck.errors)) { Write-Host "  - $e" } }
        $schemaErrors = New-Object System.Collections.Generic.List[string]
        foreach ($schemaKey in @('routingPlan','reviewer','lead','product')) {
            $schemaRel = [string]$config.schemas.PSObject.Properties[$schemaKey].Value
            $schemaCheck = Test-AITeamCodexOutputSchema -SchemaPath (Join-Path $RepoRoot $schemaRel)
            if (-not $schemaCheck.pass) {
                foreach ($e in @($schemaCheck.errors)) { $schemaErrors.Add("${schemaKey}: $e") }
            }
        }
        Write-Host "- Structured output schemas: $(if ($schemaErrors.Count -eq 0) { 'PASS' } else { 'FAIL' })"
        if ($schemaErrors.Count -gt 0) { foreach ($e in $schemaErrors) { Write-Host "  - $e" } }
        $status = Get-AITeamCodexLoginStatus
        Write-Host "- Codex installed: $($status.installed)"
        Write-Host "- Codex logged in: $($status.loggedIn)"
        if ($status.detail) { Write-Host "- Codex: $($status.detail)" }
        break
    }
    'setup-codex' {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Setup-AITeamCodexCli.ps1') -InstallIfMissing -Login
        exit $LASTEXITCODE
    }
    'allowance' {
        if ([string]::IsNullOrWhiteSpace($Arg1)) {
            $file = Join-Path $StateRoot 'allowance-snapshots.jsonl'
            if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { Write-Host 'No manual allowance snapshots recorded.'; break }
            Get-Content -LiteralPath $file -Encoding UTF8 | Select-Object -Last 10
            break
        }
        $pct = 0
        if (-not [int]::TryParse($Arg1,[ref]$pct) -or $pct -lt 0 -or $pct -gt 100) { throw 'Usage: erp-ai-team allowance 79' }
        New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null
        $record = [pscustomobject][ordered]@{
            utc = [DateTime]::UtcNow.ToString('o',[System.Globalization.CultureInfo]::InvariantCulture)
            remainingPercent = $pct
            source = 'manual-codex-ui'
            note = $Arg2
        }
        Add-Content -LiteralPath (Join-Path $StateRoot 'allowance-snapshots.jsonl') -Value ($record | ConvertTo-Json -Compress) -Encoding UTF8
        Write-Host "Allowance snapshot recorded: $pct% remaining."
        break
    }
    'usage' {
        $index = Join-Path $StateRoot 'runs-index.jsonl'
        if (-not (Test-Path -LiteralPath $index -PathType Leaf)) { Write-Host 'No run history yet.'; break }
        $totalIn=[int64]0; $totalCached=[int64]0; $totalOut=[int64]0
        $attempts=0; $completedCalls=0; $preGenerationRejects=0; $runsWithTokens=0; $legacyUsageRecords=0
        foreach ($line in @(Get-Content -LiteralPath $index -Encoding UTF8)) {
            if ([string]::IsNullOrWhiteSpace($line)) { continue }
            try { $row = $line | ConvertFrom-Json } catch { continue }
            $metricsPath = Join-Path ([string]$row.runDirectory) 'metrics.json'
            if (-not (Test-Path -LiteralPath $metricsPath -PathType Leaf)) { continue }
            try { $m = Get-Content -LiteralPath $metricsPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { continue }
            if ($null -eq $m.usageTelemetry) { continue }
            $u = $m.usageTelemetry
            $in=[int64]0; $cached=[int64]0; $out=[int64]0
            if ($null -ne $u.PSObject.Properties['inputTokens']) { $in = [int64]$u.inputTokens; $totalIn += $in }
            if ($null -ne $u.PSObject.Properties['cachedInputTokens']) { $cached = [int64]$u.cachedInputTokens; $totalCached += $cached }
            if ($null -ne $u.PSObject.Properties['outputTokens']) { $out = [int64]$u.outputTokens; $totalOut += $out }
            if (($in + $cached + $out) -gt 0) { $runsWithTokens++ }

            if ($null -ne $u.PSObject.Properties['modelAttempts']) {
                $attempts += [int]$u.modelAttempts
                if ($null -ne $u.PSObject.Properties['modelCalls']) { $completedCalls += [int]$u.modelCalls }
                if ($null -ne $u.PSObject.Properties['apiRejectedBeforeGeneration']) { $preGenerationRejects += [int]$u.apiRejectedBeforeGeneration }
            }
            elseif ($null -ne $u.PSObject.Properties['modelCalls'] -and [int]$u.modelCalls -gt 0) {
                # Historical V3.3.3 records counted an attempted CLI invocation as a
                # model call even when the API rejected the schema before generation.
                $legacyUsageRecords++
            }
        }
        Write-Host 'DIRECT CODEX TOKEN TELEMETRY'
        Write-Host "- Codex attempts (V3.3.4+): $attempts"
        Write-Host "- completed model calls (V3.3.4+): $completedCalls"
        Write-Host "- pre-generation API rejects (V3.3.4+): $preGenerationRejects"
        Write-Host "- runs with measured tokens: $runsWithTokens"
        Write-Host "- input tokens: $totalIn"
        Write-Host "- cached input tokens: $totalCached"
        Write-Host "- output tokens: $totalOut"
        if ($legacyUsageRecords -gt 0) { Write-Host "- legacy pre-V3.3.4 usage records with old call semantics: $legacyUsageRecords" }
        Write-Host '- weekly allowance percentage is not inferred; record UI snapshots with: erp-ai-team allowance 79'
        break
    }
}
