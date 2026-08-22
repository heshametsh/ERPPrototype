param(
    [Parameter(Mandatory=$true)][string]$TestId,
    [string]$RepoRoot,
    [string]$StateRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'AITeamGates.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'AITeamRun.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'AITeamCodex.psm1') -Force

if (-not $RepoRoot) { $RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..')) }
else { $RepoRoot = [System.IO.Path]::GetFullPath($RepoRoot) }

function New-SmokeUsage {
    param($Usage)
    if ($null -eq $Usage) {
        return [pscustomobject][ordered]@{
            status='direct-codex-cli-json-events'; estimated=$false; modelAttempts=0; modelCalls=0; apiRejectedBeforeGeneration=0;
            inputTokens=[int64]0; cachedInputTokens=[int64]0; outputTokens=[int64]0; reasoningTokens=[int64]0;
            weeklyAllowancePercent=$null; note='No Codex usage was captured.'
        }
    }
    $attempted = 0
    if ($null -ne $Usage.PSObject.Properties['modelAttempted'] -and [bool]$Usage.modelAttempted) { $attempted = 1 }
    $completed = 0
    if ($null -ne $Usage.PSObject.Properties['completedModelCalls']) { $completed = [int]$Usage.completedModelCalls }
    elseif ($null -ne $Usage.PSObject.Properties['turnCompletedCount']) { $completed = [int]$Usage.turnCompletedCount }
    $rejected = 0
    if ($null -ne $Usage.PSObject.Properties['apiRejectedBeforeGeneration']) { $rejected = [int]$Usage.apiRejectedBeforeGeneration }
    return [pscustomobject][ordered]@{
        status='direct-codex-cli-json-events'; estimated=$false; modelAttempts=$attempted; modelCalls=$completed; apiRejectedBeforeGeneration=$rejected;
        inputTokens=$(if ($null -ne $Usage.PSObject.Properties['inputTokens']) { [int64]$Usage.inputTokens } else { [int64]0 });
        cachedInputTokens=$(if ($null -ne $Usage.PSObject.Properties['cachedInputTokens']) { [int64]$Usage.cachedInputTokens } else { [int64]0 });
        outputTokens=$(if ($null -ne $Usage.PSObject.Properties['outputTokens']) { [int64]$Usage.outputTokens } else { [int64]0 });
        reasoningTokens=$(if ($null -ne $Usage.PSObject.Properties['reasoningTokens']) { [int64]$Usage.reasoningTokens } else { [int64]0 });
        weeklyAllowancePercent=$null;
        note='Router-only smoke: exactly one Codex router attempt is permitted; reviewers and Lead are never launched.'
    }
}

$config = Get-Content -LiteralPath (Join-Path $RepoRoot '.ai\team-config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$suitePath = Join-Path $RepoRoot ([string]$config.qualification.suite)
$oraclePath = Join-Path $RepoRoot ([string]$config.qualification.oracles)
$suite = Get-Content -LiteralPath $suitePath -Raw -Encoding UTF8 | ConvertFrom-Json
$rows = @($suite.missions | Where-Object { [string]$_.id -eq $TestId })
if ($rows.Count -ne 1) { throw "Mission $TestId not found exactly once." }
$mission = $rows[0]
if ([string]$mission.mode -ne 'review') { throw "Router smoke requires a review mission; $TestId mode is $($mission.mode)." }

$smokeMissionId = "$TestId-RTR"
$run = New-AITeamRun -RepoRoot $RepoRoot -MissionId $smokeMissionId -MissionName ("Router smoke: " + [string]$mission.name) -Mode 'review' -StateRoot $StateRoot
$runDir = [string]$run.runDirectory
$phaseMs = [ordered]@{}
$runCompleted = $false
$usageObj = New-SmokeUsage -Usage $null

$login = Get-AITeamCodexLoginStatus
if (-not $login.installed -or -not $login.loggedIn) {
    Add-AITeamTrace -RunDir $runDir -Event 'MODEL_PREFLIGHT_BLOCKED' -Phase 'codex-preflight' -Status 'BLOCKED' -Detail ([string]$login.detail) | Out-Null
    Write-AITeamJsonFile -Value $login -Path (Join-Path $runDir 'codex-preflight.json')
    Complete-AITeamRun -RunDir $runDir -Result 'BLOCKED' -Summary 'Router smoke blocked before model use because Codex CLI is not installed/logged in.' -UsageTelemetry $usageObj | Out-Null
    Write-Host 'AI TEAM ROUTER SMOKE: BLOCKED'
    Write-Host '- Codex CLI is not installed/logged in.'
    Write-Host "- evidence: $runDir"
    exit 3
}

try {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    Add-AITeamTrace -RunDir $runDir -Event 'PHASE_START' -Phase 'preflight' -Status 'RUNNING' | Out-Null
    $suiteCheck = Test-AITeamSuite -SuitePath $suitePath -OraclePath $oraclePath
    if (-not $suiteCheck.pass) { throw 'AI Team suite validation failed.' }
    $before = Get-AITeamRepoState -RepoRoot $RepoRoot
    Write-AITeamJsonFile -Value $before -Path (Join-Path $runDir 'repo-before.json')
    if ([bool]$config.qualification.requireCleanStart -and -not [bool]$before.isClean) { throw 'Router smoke requires a clean working tree.' }
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
        exclusions = @('Router-only smoke test. Do not inspect repository files.','Do not solve the mission.','Do not read qualification oracles.','Do not spawn reviewers, Lead, or subagents.')
        webPolicy = [string]$mission.webPolicy
    }
    $missionPath = Join-Path $runDir 'mission.json'
    Write-AITeamJsonFile -Value $packet -Path $missionPath
    $missionGate = Test-AITeamMissionPacket -PacketPath $missionPath -ExpectedSha ([string]$run.commitSha)
    Write-AITeamJsonFile -Value $missionGate -Path (Join-Path $runDir 'mission-gate.json')
    if (-not $missionGate.pass) { throw 'Mission Packet Gate failed.' }

    $packetJson = $packet | ConvertTo-Json -Depth 20
    $routerPrompt = @"
You are the ERP AI Team Mission Router.
Read $([string]$config.prompts.missionRouter) and obey it exactly.
Do not inspect repository files, do not solve the mission, do not read oracles, and do not spawn subagents.

Mission packet:
$packetJson

Return only the routing JSON.
"@
    $routerPromptPath = Join-Path $runDir 'router-prompt.txt'
    $routerPrompt | Set-Content -LiteralPath $routerPromptPath -Encoding UTF8
    $routerOutput = Join-Path $runDir 'routing.raw.json'
    $routerEvents = Join-Path $runDir 'router.events.jsonl'
    $routerErr = Join-Path $runDir 'router.stderr.txt'

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    Add-AITeamTrace -RunDir $runDir -Event 'ROUTER_START' -Phase 'routing' -Role 'mission-router' -Status 'RUNNING' -Detail 'Router-only smoke; exactly one model attempt permitted.' | Out-Null
    $routerResult = Invoke-AITeamCodexExec -RepoRoot $RepoRoot -PromptPath $routerPromptPath -SchemaPath (Join-Path $RepoRoot ([string]$config.schemas.routingPlan)) -OutputPath $routerOutput -EventsPath $routerEvents -StderrPath $routerErr -ReasoningEffort ([string]$config.codex.routerReasoningEffort) -Model ([string]$config.codex.model) -WebAllowed $false
    $sw.Stop(); $phaseMs.router = [int64]$sw.ElapsedMilliseconds
    $usageObj = New-SmokeUsage -Usage $routerResult.usage
    Write-AITeamJsonFile -Value $routerResult -Path (Join-Path $runDir 'router-execution.json')
    Write-AITeamJsonFile -Value $usageObj -Path (Join-Path $runDir 'model-usage.json')

    if ($usageObj.modelAttempts -gt 1) { throw 'Router smoke attempted Codex more than once.' }
    if ($null -ne $routerResult.PSObject.Properties['schemaPreflightPass'] -and -not [bool]$routerResult.schemaPreflightPass) {
        throw "Mission Router schema preflight blocked before Codex: $(@($routerResult.schemaPreflightErrors) -join ' | ')"
    }
    if ([int]$routerResult.exitCode -ne 0 -or -not (Test-Path -LiteralPath $routerOutput -PathType Leaf)) { throw 'Mission Router Codex call failed.' }

    $routingDetail = Get-Content -LiteralPath $routerOutput -Raw -Encoding UTF8 | ConvertFrom-Json
    if ([int]$routingDetail.schemaVersion -ne 1) { throw 'Router returned the wrong schemaVersion.' }
    if ([string]$routingDetail.missionId -ne $TestId) { throw 'Router returned the wrong missionId.' }
    $selected = @($routingDetail.selectedRoles | ForEach-Object { [string]$_ })
    $excluded = @($routingDetail.excludedRoles | ForEach-Object { [string]$_ })
    if (@($selected | Select-Object -Unique).Count -ne $selected.Count) { throw 'Router returned duplicate selectedRoles.' }
    if (@($excluded | Select-Object -Unique).Count -ne $excluded.Count) { throw 'Router returned duplicate excludedRoles.' }
    $overlap = @($selected | Where-Object { $excluded -contains $_ })
    if ($overlap.Count -gt 0) { throw "Router returned roles in both selectedRoles and excludedRoles: $($overlap -join ', ')" }
    if ($selected.Count -gt [int]$config.maxConcurrentReviewers) { throw 'Router exceeded maxConcurrentReviewers.' }
    foreach ($role in $selected) {
        if ($null -eq $config.roles.PSObject.Properties[$role]) { throw "Router selected unknown role: $role" }
        $roleConfig = $config.roles.PSObject.Properties[$role].Value
        if ([string]$roleConfig.class -ne 'engineering') { throw "Router selected non-engineering role: $role" }
    }
    foreach ($role in $excluded) {
        if ($null -eq $config.roles.PSObject.Properties[$role]) { throw "Router excluded unknown role: $role" }
        $roleConfig = $config.roles.PSObject.Properties[$role].Value
        if ([string]$roleConfig.class -ne 'engineering') { throw "Router excluded non-engineering role: $role" }
    }
    Write-AITeamJsonFile -Value $routingDetail -Path (Join-Path $runDir 'routing.json')
    Add-AITeamTrace -RunDir $runDir -Event 'ROUTER_END' -Phase 'routing' -Role 'mission-router' -Status 'PASS' -Detail "selected=$($selected -join ',') ms=$($routerResult.elapsedMilliseconds)" | Out-Null

    # Hidden oracle is evaluated only after the router has finished. It never enters the prompt.
    $routingScore = Test-AITeamRoutingOracle -OraclePath $oraclePath -TestId $TestId -Selected $selected
    Write-AITeamJsonFile -Value $routingScore -Path (Join-Path $runDir 'routing-oracle.json')
    Add-AITeamTrace -RunDir $runDir -Event 'ROUTER_ORACLE' -Phase 'routing-quality' -Role 'mission-router' -Status $(if ($routingScore.pass) { 'PASS' } else { 'GAP' }) -Detail "oracleMatch=$($routingScore.pass)" | Out-Null

    $after = Get-AITeamRepoState -RepoRoot $RepoRoot
    Write-AITeamJsonFile -Value $after -Path (Join-Path $runDir 'repo-after.json')
    $clean = Compare-AITeamRepoState -Baseline $before -Current $after
    Write-AITeamJsonFile -Value $clean -Path (Join-Path $runDir 'cleanliness-result.json')
    if (-not $clean.pass) { throw 'Cleanliness Gate failed.' }

    $resultValue = $(if ($routingScore.pass) { 'PASS' } else { 'PASS_WITH_GAPS' })
    $result = [pscustomobject][ordered]@{
        schemaVersion = 1
        smokeType = 'router-only'
        targetMissionId = $TestId
        runMissionId = $smokeMissionId
        commitSha = [string]$run.commitSha
        teamVersion = [string]$run.teamVersion
        result = $resultValue
        transportPass = $true
        structuredOutputPass = $true
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
    $final = Complete-AITeamRun -RunDir $runDir -Result $resultValue -Summary "routerTransport=True; structuredOutput=True; oracle=$($routingScore.pass); reviewers=0; lead=False" -PhaseMilliseconds $phaseMs -UsageTelemetry $usageObj -Extra ([pscustomobject][ordered]@{ targetMissionId=$TestId; smokeType='router-only'; routingOracleMatch=[bool]$routingScore.pass })
    $runCompleted = $true

    Write-Host ''
    Write-Host "AI TEAM ROUTER SMOKE ${TestId}: $resultValue"
    Write-Host '- reviewers started: 0'
    Write-Host '- Lead started: False'
    Write-Host "- selected for future full run: $($selected -join ', ')"
    Write-Host "- routing oracle match: $($routingScore.pass)"
    Write-Host "- Codex attempts: $($usageObj.modelAttempts)"
    Write-Host "- completed model calls: $($usageObj.modelCalls)"
    Write-Host "- pre-generation API rejects: $($usageObj.apiRejectedBeforeGeneration)"
    Write-Host "- tokens: input=$($usageObj.inputTokens) cached=$($usageObj.cachedInputTokens) output=$($usageObj.outputTokens) reasoning=$($usageObj.reasoningTokens)"
    Write-Host "- router ms: $($phaseMs.router)"
    Write-Host "- total ms: $($final.elapsedMilliseconds)"
    Write-Host "- evidence: $runDir"
    Write-Host "- trace: $(Join-Path $runDir 'trace.jsonl')"
    exit 0
}
catch {
    $err = $_.Exception.Message
    try {
        Add-AITeamTrace -RunDir $runDir -Event 'RUN_ERROR' -Phase 'router-smoke' -Status 'FAIL' -Detail $err | Out-Null
        Write-AITeamJsonFile -Value $usageObj -Path (Join-Path $runDir 'model-usage.json')
        if (-not $runCompleted) {
            Complete-AITeamRun -RunDir $runDir -Result 'FAIL' -Summary $err -PhaseMilliseconds $phaseMs -UsageTelemetry $usageObj -Extra ([pscustomobject][ordered]@{ targetMissionId=$TestId; smokeType='router-only' }) | Out-Null
            $runCompleted = $true
        }
    }
    catch {
        try { Set-AITeamRunEmergencyFailure -RunDir $runDir -ErrorMessage $err | Out-Null } catch { }
    }
    Write-Host "AI TEAM ROUTER SMOKE ${TestId}: FAIL"
    Write-Host "- error: $err"
    Write-Host "- Codex attempts: $($usageObj.modelAttempts)"
    Write-Host "- completed model calls: $($usageObj.modelCalls)"
    Write-Host "- pre-generation API rejects: $($usageObj.apiRejectedBeforeGeneration)"
    Write-Host "- tokens: input=$($usageObj.inputTokens) cached=$($usageObj.cachedInputTokens) output=$($usageObj.outputTokens) reasoning=$($usageObj.reasoningTokens)"
    Write-Host '- reviewers started: 0'
    Write-Host '- Lead started: False'
    Write-Host "- evidence: $runDir"
    exit 1
}
