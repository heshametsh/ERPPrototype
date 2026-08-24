param(
    [Parameter(Mandatory=$true)][string]$TestId,
    [string]$RepoRoot,
    [string]$StateRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'AITeamGates.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'AITeamRun.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'AITeamLocalRouter.psm1') -Force

if (-not $RepoRoot) { $RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..')) }
else { $RepoRoot = [System.IO.Path]::GetFullPath($RepoRoot) }

function New-ZeroUsage {
    return [pscustomobject][ordered]@{
        status='local-router-zero-model'; estimated=$false; modelAttempts=0; modelCalls=0; apiRejectedBeforeGeneration=0;
        inputTokens=[int64]0; cachedInputTokens=[int64]0; outputTokens=[int64]0; reasoningTokens=[int64]0;
        weeklyAllowancePercent=$null; note='V3.4 local-router smoke never launches Codex, reviewers, or Lead.'
    }
}

$config = Get-Content -LiteralPath (Join-Path $RepoRoot '.ai\team-config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$suitePath = Join-Path $RepoRoot ([string]$config.qualification.suite)
$oraclePath = Join-Path $RepoRoot ([string]$config.qualification.oracles)
$suite = Get-Content -LiteralPath $suitePath -Raw -Encoding UTF8 | ConvertFrom-Json
$rows = @($suite.missions | Where-Object { [string]$_.id -eq $TestId })
if ($rows.Count -ne 1) { throw "Mission $TestId not found exactly once." }
$mission = $rows[0]
if ([string]$mission.mode -eq 'deterministic') { throw "Local router smoke requires a model mission; $TestId is deterministic." }

$smokeMissionId = "$TestId-LRTR"
$run = New-AITeamRun -RepoRoot $RepoRoot -MissionId $smokeMissionId -MissionName ("Local router smoke: " + [string]$mission.name) -Mode ([string]$mission.mode) -StateRoot $StateRoot
$runDir = [string]$run.runDirectory
$phaseMs = [ordered]@{}
$runCompleted = $false
$usageObj = New-ZeroUsage

try {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    Add-AITeamTrace -RunDir $runDir -Event 'PHASE_START' -Phase 'preflight' -Status 'RUNNING' | Out-Null
    $suiteCheck = Test-AITeamSuite -SuitePath $suitePath -OraclePath $oraclePath
    if (-not $suiteCheck.pass) { throw 'AI Team suite validation failed.' }
    $before = Get-AITeamRepoState -RepoRoot $RepoRoot
    Write-AITeamJsonFile -Value $before -Path (Join-Path $runDir 'repo-before.json')
    if ([bool]$config.qualification.requireCleanStart -and -not [bool]$before.isClean) { throw 'Local router smoke requires a clean working tree.' }
    $rulesPath = Join-Path $RepoRoot ([string]$config.routing.rulesPath)
    $rulesCheck = Test-AITeamLocalRouterRules -RulesPath $rulesPath
    Write-AITeamJsonFile -Value $rulesCheck -Path (Join-Path $runDir 'local-router-rules-gate.json')
    if (-not $rulesCheck.pass) { throw "Local router rules failed validation: $(@($rulesCheck.errors) -join ' | ')" }
    $sw.Stop(); $phaseMs.preflight = [int64]$sw.ElapsedMilliseconds
    Add-AITeamTrace -RunDir $runDir -Event 'PHASE_END' -Phase 'preflight' -Status 'PASS' -Detail "ms=$($phaseMs.preflight)" | Out-Null

    $packet = [pscustomobject][ordered]@{
        schemaVersion = 1
        runId = [string]$run.runId
        missionId = $TestId
        mission = [string]$mission.name
        mode = [string]$mission.mode
        commitSha = [string]$run.commitSha
        workspaceFingerprint = [string]$before.fingerprint
        objective = [string]$mission.objective
        requiredBehaviors = @()
        decisionRefs = @($mission.requiredDecisionRefs)
        exclusions = @('Local-router smoke only. Do not inspect repository files.','Do not solve the mission.','Do not read qualification oracles during routing.','Do not launch Codex, reviewers, Lead, or subagents.')
        webPolicy = [string]$mission.webPolicy
    }
    $missionPath = Join-Path $runDir 'mission.json'
    Write-AITeamJsonFile -Value $packet -Path $missionPath
    $missionGate = Test-AITeamMissionPacket -PacketPath $missionPath -ExpectedSha ([string]$run.commitSha)
    Write-AITeamJsonFile -Value $missionGate -Path (Join-Path $runDir 'mission-gate.json')
    if (-not $missionGate.pass) { throw 'Mission Packet Gate failed.' }

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    Add-AITeamTrace -RunDir $runDir -Event 'LOCAL_ROUTER_START' -Phase 'routing' -Role 'local-router' -Status 'RUNNING' -Detail 'Pure PowerShell rule engine; zero model calls permitted.' | Out-Null
    $local = Get-AITeamLocalRoute -MissionPacket $packet -Config $config -RulesPath $rulesPath
    $routingDetail = $local.routingPlan
    $sw.Stop(); $phaseMs.localRouter = [int64]$sw.ElapsedMilliseconds
    Write-AITeamJsonFile -Value $local -Path (Join-Path $runDir 'local-routing-debug.json')
    Write-AITeamJsonFile -Value $routingDetail -Path (Join-Path $runDir 'routing.json')
    Write-AITeamJsonFile -Value $usageObj -Path (Join-Path $runDir 'model-usage.json')
    $selected = @($routingDetail.selectedRoles | ForEach-Object { [string]$_ })
    Add-AITeamTrace -RunDir $runDir -Event 'LOCAL_ROUTER_END' -Phase 'routing' -Role 'local-router' -Status $(if ($local.needsAiFallback) { 'GAP' } else { 'PASS' }) -Detail "selected=$($selected -join ','); fallback=$($local.needsAiFallback); ms=$($phaseMs.localRouter)" | Out-Null

    # Hidden qualification oracle is consulted only after the route is complete.
    $routingScore = Test-AITeamRoutingOracle -OraclePath $oraclePath -TestId $TestId -Selected $selected
    Write-AITeamJsonFile -Value $routingScore -Path (Join-Path $runDir 'routing-oracle.json')
    Add-AITeamTrace -RunDir $runDir -Event 'ROUTER_ORACLE' -Phase 'routing-quality' -Role 'local-router' -Status $(if ($routingScore.pass) { 'PASS' } else { 'GAP' }) -Detail "oracleMatch=$($routingScore.pass)" | Out-Null

    $after = Get-AITeamRepoState -RepoRoot $RepoRoot
    Write-AITeamJsonFile -Value $after -Path (Join-Path $runDir 'repo-after.json')
    $clean = Compare-AITeamRepoState -Baseline $before -Current $after
    Write-AITeamJsonFile -Value $clean -Path (Join-Path $runDir 'cleanliness-result.json')
    if (-not $clean.pass) { throw 'Cleanliness Gate failed.' }

    $resultValue = if ($routingScore.pass -and -not [bool]$local.needsAiFallback) { 'PASS' } else { 'PASS_WITH_GAPS' }
    $result = [pscustomobject][ordered]@{
        schemaVersion = 2
        smokeType = 'local-router-only'
        targetMissionId = $TestId
        runMissionId = $smokeMissionId
        commitSha = [string]$run.commitSha
        teamVersion = [string]$run.teamVersion
        result = $resultValue
        routingSource = [string]$local.source
        localConfidence = [string]$local.confidence
        aiFallbackRecommended = [bool]$local.needsAiFallback
        selectedReviewers = $selected
        routingOracleMatch = [bool]$routingScore.pass
        reviewersStarted = 0
        leadStarted = $false
        cleanlinessPass = [bool]$clean.pass
        usageTelemetry = $usageObj
        evidenceDirectory = $runDir
        traceFile = (Join-Path $runDir 'trace.jsonl')
    }
    Write-AITeamJsonFile -Value $result -Path (Join-Path $runDir 'result.json')
    $final = Complete-AITeamRun -RunDir $runDir -Result $resultValue -Summary "localRouter=True; oracle=$($routingScore.pass); fallback=$($local.needsAiFallback); modelCalls=0" -PhaseMilliseconds $phaseMs -UsageTelemetry $usageObj -Extra ([pscustomobject][ordered]@{ targetMissionId=$TestId; smokeType='local-router-only'; routingOracleMatch=[bool]$routingScore.pass; aiFallbackRecommended=[bool]$local.needsAiFallback })
    $runCompleted = $true

    Write-Host ''
    Write-Host "AI TEAM LOCAL ROUTER SMOKE ${TestId}: $resultValue"
    Write-Host '- routing source: local-rules'
    Write-Host "- selected for future full run: $($selected -join ', ')"
    Write-Host "- local confidence: $($local.confidence)"
    Write-Host "- AI fallback recommended: $($local.needsAiFallback)"
    Write-Host "- routing oracle match: $($routingScore.pass)"
    Write-Host '- reviewers started: 0'
    Write-Host '- Lead started: False'
    Write-Host '- Codex attempts: 0'
    Write-Host '- completed model calls: 0'
    Write-Host '- tokens: input=0 cached=0 output=0 reasoning=0'
    Write-Host "- local router ms: $($phaseMs.localRouter)"
    Write-Host "- total ms: $($final.elapsedMilliseconds)"
    Write-Host "- evidence: $runDir"
    Write-Host "- trace: $(Join-Path $runDir 'trace.jsonl')"
    exit 0
}
catch {
    $err = $_.Exception.Message
    try {
        Add-AITeamTrace -RunDir $runDir -Event 'RUN_ERROR' -Phase 'local-router-smoke' -Status 'FAIL' -Detail $err | Out-Null
        Write-AITeamJsonFile -Value $usageObj -Path (Join-Path $runDir 'model-usage.json')
        if (-not $runCompleted) {
            Complete-AITeamRun -RunDir $runDir -Result 'FAIL' -Summary $err -PhaseMilliseconds $phaseMs -UsageTelemetry $usageObj -Extra ([pscustomobject][ordered]@{ targetMissionId=$TestId; smokeType='local-router-only' }) | Out-Null
            $runCompleted = $true
        }
    }
    catch { try { Set-AITeamRunEmergencyFailure -RunDir $runDir -ErrorMessage $err | Out-Null } catch { } }
    Write-Host "AI TEAM LOCAL ROUTER SMOKE ${TestId}: FAIL"
    Write-Host "- error: $err"
    Write-Host '- Codex attempts: 0'
    Write-Host '- completed model calls: 0'
    Write-Host '- reviewers started: 0'
    Write-Host '- Lead started: False'
    Write-Host "- evidence: $runDir"
    exit 1
}
