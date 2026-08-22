param(
    [Parameter(Mandatory=$true)][string]$TestId,
    [Parameter(Mandatory=$true)][string]$Role,
    [string]$RepoRoot,
    [string]$StateRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'AITeamGates.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'AITeamRun.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'AITeamCodex.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'AITeamLocalRouter.psm1') -Force

if (-not $RepoRoot) { $RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..')) }
else { $RepoRoot = [System.IO.Path]::GetFullPath($RepoRoot) }

function New-SmokePromptFile {
    param([string]$Path,[string]$Text)
    $Text | Set-Content -LiteralPath $Path -Encoding UTF8
    return $Path
}

$config = Get-Content -LiteralPath (Join-Path $RepoRoot '.ai\team-config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$suitePath = Join-Path $RepoRoot ([string]$config.qualification.suite)
$oraclePath = Join-Path $RepoRoot ([string]$config.qualification.oracles)
$suite = Get-Content -LiteralPath $suitePath -Raw -Encoding UTF8 | ConvertFrom-Json
$rows = @($suite.missions | Where-Object { [string]$_.id -eq $TestId })
if ($rows.Count -ne 1) { throw "Mission $TestId not found exactly once." }
$mission = $rows[0]
if ([string]$mission.mode -ne 'review') { throw "Reviewer smoke requires a review mission; $TestId mode is $($mission.mode)." }
if ($null -eq $config.roles.PSObject.Properties[$Role]) { throw "Unknown reviewer role: $Role" }
$roleConfig = $config.roles.PSObject.Properties[$Role].Value
if ([string]$roleConfig.class -ne 'engineering') { throw "Reviewer smoke requires an engineering reviewer role; got $Role." }

$run = New-AITeamRun -RepoRoot $RepoRoot -MissionId "$TestId-RSMK-$Role" -MissionName "Reviewer smoke: $TestId / $Role" -Mode 'reviewer-smoke' -StateRoot $StateRoot
$runDir = [string]$run.runDirectory
$phaseMs = [ordered]@{}
$runCompleted = $false
$usageObj = [pscustomobject][ordered]@{
    status='direct-codex-cli-json-events'; estimated=$false; modelAttempts=0; modelCalls=0; apiRejectedBeforeGeneration=0;
    inputTokens=[int64]0; cachedInputTokens=[int64]0; outputTokens=[int64]0; reasoningTokens=[int64]0;
    weeklyAllowancePercent=$null; note='Single-reviewer smoke telemetry.'
}

try {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    Add-AITeamTrace -RunDir $runDir -Event 'PHASE_START' -Phase 'preflight' -Status 'RUNNING' | Out-Null
    $suiteCheck = Test-AITeamSuite -SuitePath $suitePath -OraclePath $oraclePath
    if (-not $suiteCheck.pass) { throw 'AI Team suite validation failed.' }
    $brain = Test-AITeamProjectBrain -RepoRoot $RepoRoot
    Write-AITeamJsonFile -Value $brain -Path (Join-Path $runDir 'brain-gate.json')
    if (-not $brain.pass) { throw 'Project Brain validation failed.' }
    $before = Get-AITeamRepoState -RepoRoot $RepoRoot
    Write-AITeamJsonFile -Value $before -Path (Join-Path $runDir 'repo-before.json')
    if ([bool]$config.qualification.requireCleanStart -and -not [bool]$before.isClean) { throw 'Qualification run requires a clean working tree.' }
    $sw.Stop(); $phaseMs.preflight = [int64]$sw.ElapsedMilliseconds
    Add-AITeamTrace -RunDir $runDir -Event 'PHASE_END' -Phase 'preflight' -Status 'PASS' -Detail "ms=$($phaseMs.preflight)" | Out-Null

    $packet = [pscustomobject][ordered]@{
        schemaVersion=1; runId=[string]$run.runId; missionId=$TestId; mission=[string]$mission.name; mode=[string]$mission.mode;
        commitSha=[string]$run.commitSha; workspaceFingerprint=[string]$before.fingerprint; objective=[string]$mission.objective;
        requiredBehaviors=@(); decisionRefs=@($mission.requiredDecisionRefs);
        exclusions=@('Reviewer smoke only: do not modify runtime code.','Do not read sibling reports, prior AI-team reports, or qualification oracles.');
        webPolicy='forbidden'
    }
    $missionPath = Join-Path $runDir 'mission.json'
    Write-AITeamJsonFile -Value $packet -Path $missionPath
    $missionGate = Test-AITeamMissionPacket -PacketPath $missionPath -ExpectedSha ([string]$run.commitSha)
    Write-AITeamJsonFile -Value $missionGate -Path (Join-Path $runDir 'mission-gate.json')
    if (-not $missionGate.pass) { throw 'Mission Packet Gate failed.' }

    # Prove the requested reviewer belongs to the local route, without any model router call.
    $rulesPath = Join-Path $RepoRoot ([string]$config.routing.rulesPath)
    $rulesCheck = Test-AITeamLocalRouterRules -RulesPath $rulesPath
    if (-not $rulesCheck.pass) { throw "Local router rules failed: $(@($rulesCheck.errors) -join ' | ')" }
    $localRoute = Get-AITeamLocalRoute -MissionPacket $packet -Config $config -RulesPath $rulesPath
    Write-AITeamJsonFile -Value $localRoute -Path (Join-Path $runDir 'local-routing-debug.json')
    if ([bool]$localRoute.needsAiFallback) { throw 'Reviewer smoke refuses AI router fallback; choose a qualification mission with a decisive local route.' }
    $selected = @($localRoute.routingPlan.selectedRoles | ForEach-Object { [string]$_ })
    if ($selected -notcontains $Role) { throw "Role $Role is not selected by the local route for $TestId. Selected: $($selected -join ', ')" }
    Add-AITeamTrace -RunDir $runDir -Event 'ROUTING_FINAL' -Phase 'routing' -Role 'local-router' -Status 'PASS' -Detail "smokeRole=$Role; fullRoute=$($selected -join ',')" | Out-Null

    $login = Get-AITeamCodexLoginStatus
    if (-not $login.installed -or -not $login.loggedIn) { throw 'Codex CLI is not installed/logged in.' }

    $packetJson = $packet | ConvertTo-Json -Depth 20
    $rolePrompt = [string]$roleConfig.prompt
    $promptText = @"
You are the $Role independent reviewer for ERP Prototype.
This is a SINGLE-REVIEWER SMOKE RUN. No sibling reviewer and no Lead will run.
Read AGENTS.md, .ai/prompts/_reviewer-common.md, and $rolePrompt. Obey them exactly.
Work read-only. Do not spawn subagents. Do not read prior AI-team reports, qualification oracles, or sibling outputs.
Use current repository code as implementation truth. Start narrow and expand only for a concrete evidence gap.

Your JSON MUST use:
- agentRole: "$Role"
- mission: "$([string]$mission.name)"
- commitSha: "$([string]$run.commitSha)"

Mission packet:
$packetJson

Return only JSON matching .ai/schemas/reviewer-findings.schema.json.
"@
    $promptPath = New-SmokePromptFile -Path (Join-Path $runDir "$Role-prompt.txt") -Text $promptText
    $raw = Join-Path $runDir "$Role.raw.json"
    $events = Join-Path $runDir "$Role.events.jsonl"
    $err = Join-Path $runDir "$Role.stderr.txt"

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    Add-AITeamTrace -RunDir $runDir -Event 'REVIEWER_START' -Phase 'reviewer-smoke' -Role $Role -Status 'RUNNING' | Out-Null
    $res = Invoke-AITeamCodexExec -RepoRoot $RepoRoot -PromptPath $promptPath -SchemaPath (Join-Path $RepoRoot ([string]$config.schemas.reviewer)) -OutputPath $raw -EventsPath $events -StderrPath $err -ReasoningEffort ([string]$config.codex.reviewerReasoningEffort) -Model ([string]$config.codex.model) -WebAllowed $false
    $sw.Stop(); $phaseMs.reviewer = [int64]$sw.ElapsedMilliseconds
    Write-AITeamJsonFile -Value $res -Path (Join-Path $runDir "$Role-execution.json")

    if ($null -ne $res.PSObject.Properties['usage']) {
        $u = $res.usage
        if ($null -ne $u.PSObject.Properties['modelAttempted'] -and [bool]$u.modelAttempted) { $usageObj.modelAttempts = 1 }
        if ($null -ne $u.PSObject.Properties['completedModelCalls']) { $usageObj.modelCalls = [int]$u.completedModelCalls }
        elseif ($null -ne $u.PSObject.Properties['turnCompletedCount']) { $usageObj.modelCalls = [int]$u.turnCompletedCount }
        if ($null -ne $u.PSObject.Properties['apiRejectedBeforeGeneration']) { $usageObj.apiRejectedBeforeGeneration = [int]$u.apiRejectedBeforeGeneration }
        foreach ($k in @('inputTokens','cachedInputTokens','outputTokens','reasoningTokens')) {
            if ($null -ne $u.PSObject.Properties[$k]) { $usageObj.$k = [int64]$u.$k }
        }
    }
    Write-AITeamJsonFile -Value $usageObj -Path (Join-Path $runDir 'model-usage.json')

    if ($null -ne $res.PSObject.Properties['schemaPreflightPass'] -and -not [bool]$res.schemaPreflightPass) {
        throw "Reviewer schema preflight blocked before Codex: $(@($res.schemaPreflightErrors) -join ' | ')"
    }
    if ([int]$res.exitCode -ne 0 -or -not (Test-Path -LiteralPath $raw -PathType Leaf)) { throw "Reviewer Codex call failed with exit code $($res.exitCode)." }

    $gate = Test-AITeamFindingReport -ReportPath $raw -RepoRoot $RepoRoot -ExpectedSha ([string]$run.commitSha) -ExpectedMission ([string]$mission.name) -ExpectedRole $Role
    Write-AITeamJsonFile -Value ([pscustomobject][ordered]@{ pass=$gate.pass; errors=$gate.errors; agentRole=$gate.agentRole; findingCount=$gate.findingCount; evidenceDigests=$gate.evidenceDigests }) -Path (Join-Path $runDir "finding-gate-$Role.json")
    if (-not $gate.pass) {
        Add-AITeamTrace -RunDir $runDir -Event 'REVIEWER_END' -Phase 'reviewer-smoke' -Role $Role -Status 'FAIL' -Detail 'Finding Gate rejected report.' | Out-Null
        throw "Finding Gate rejected $Role smoke report: $(@($gate.errors) -join ' | ')"
    }
    Write-AITeamJsonFile -Value $gate.leadView -Path (Join-Path $runDir "$Role.lead.json")
    Add-AITeamTrace -RunDir $runDir -Event 'REVIEWER_END' -Phase 'reviewer-smoke' -Role $Role -Status 'PASS' -Detail "ms=$($phaseMs.reviewer); findings=$($gate.findingCount)" | Out-Null

    Write-AITeamJsonFile -Value ([pscustomobject][ordered]@{ started=$false; expected=$false; reason='Single-reviewer smoke deliberately stops before Lead.' }) -Path (Join-Path $runDir 'lead-state.json')
    Add-AITeamTrace -RunDir $runDir -Event 'LEAD_SKIPPED' -Phase 'lead' -Status 'PASS' -Detail 'Reviewer smoke deliberately stops before Lead.' | Out-Null

    $after = Get-AITeamRepoState -RepoRoot $RepoRoot
    Write-AITeamJsonFile -Value $after -Path (Join-Path $runDir 'repo-after.json')
    $clean = Compare-AITeamRepoState -Baseline $before -Current $after
    Write-AITeamJsonFile -Value $clean -Path (Join-Path $runDir 'cleanliness-result.json')
    if (-not $clean.pass) { throw 'Cleanliness Gate failed.' }

    $result = [pscustomobject][ordered]@{
        schemaVersion=1; testId=$TestId; smokeRole=$Role; commitSha=[string]$run.commitSha; teamVersion=[string]$run.teamVersion;
        result='PASS'; localFullRoute=$selected; reviewerStartedCount=1; leadStarted=$false; findingCount=[int]$gate.findingCount;
        cleanlinessPass=$true; usageTelemetry=$usageObj; evidenceDirectory=$runDir; traceFile=(Join-Path $runDir 'trace.jsonl')
    }
    Write-AITeamJsonFile -Value $result -Path (Join-Path $runDir 'result.json')
    $final = Complete-AITeamRun -RunDir $runDir -Result 'PASS' -Summary "reviewer=$Role; gate=True; leadStarted=False; attempts=$($usageObj.modelAttempts); completedCalls=$($usageObj.modelCalls)" -PhaseMilliseconds $phaseMs -UsageTelemetry $usageObj
    $runCompleted = $true

    Write-Host ''
    Write-Host "AI TEAM REVIEWER SMOKE ${TestId} / ${Role}: PASS"
    Write-Host '- reviewers started: 1'
    Write-Host '- Lead started: False'
    Write-Host "- Finding Gate: PASS; findings=$($gate.findingCount)"
    Write-Host "- Codex attempts: $($usageObj.modelAttempts)"
    Write-Host "- completed model calls: $($usageObj.modelCalls)"
    Write-Host "- pre-generation API rejects: $($usageObj.apiRejectedBeforeGeneration)"
    Write-Host "- tokens: input=$($usageObj.inputTokens) cached=$($usageObj.cachedInputTokens) output=$($usageObj.outputTokens) reasoning=$($usageObj.reasoningTokens)"
    Write-Host "- reviewer ms: $($phaseMs.reviewer)"
    Write-Host "- total ms: $($final.elapsedMilliseconds)"
    Write-Host "- evidence: $runDir"
    Write-Host "- trace: $(Join-Path $runDir 'trace.jsonl')"
}
catch {
    $errMessage = $_.Exception.Message
    try {
        Add-AITeamTrace -RunDir $runDir -Event 'RUN_ERROR' -Phase 'reviewer-smoke' -Status 'FAIL' -Detail $errMessage | Out-Null
        Write-AITeamJsonFile -Value $usageObj -Path (Join-Path $runDir 'model-usage.json')
        if (-not $runCompleted) {
            Complete-AITeamRun -RunDir $runDir -Result 'FAIL' -Summary $errMessage -PhaseMilliseconds $phaseMs -UsageTelemetry $usageObj | Out-Null
            $runCompleted = $true
        }
    } catch {
        try { Set-AITeamRunEmergencyFailure -RunDir $runDir -ErrorMessage $errMessage | Out-Null } catch { }
    }
    Write-Host "AI TEAM REVIEWER SMOKE ${TestId} / ${Role}: FAIL"
    Write-Host "- error: $errMessage"
    Write-Host "- evidence: $runDir"
    throw $errMessage
}
