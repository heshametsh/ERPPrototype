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
Import-Module (Join-Path $PSScriptRoot 'AITeamLocalRouter.psm1') -Force

if (-not $RepoRoot) { $RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..')) }
else { $RepoRoot = [System.IO.Path]::GetFullPath($RepoRoot) }

function Add-Usage {
    param([hashtable]$Total, $Usage)
    if ($null -eq $Usage) { return }
    foreach ($k in @('inputTokens','cachedInputTokens','outputTokens','reasoningTokens')) {
        if ($null -ne $Usage.PSObject.Properties[$k]) { $Total[$k] = [int64]$Total[$k] + [int64]$Usage.$k }
    }
    if ($null -ne $Usage.PSObject.Properties['modelAttempted'] -and [bool]$Usage.modelAttempted) {
        $Total.modelAttempts = [int]$Total.modelAttempts + 1
    }
    if ($null -ne $Usage.PSObject.Properties['completedModelCalls']) {
        $Total.modelCalls = [int]$Total.modelCalls + [int]$Usage.completedModelCalls
    }
    elseif ($null -ne $Usage.PSObject.Properties['turnCompletedCount']) {
        $Total.modelCalls = [int]$Total.modelCalls + [int]$Usage.turnCompletedCount
    }
    if ($null -ne $Usage.PSObject.Properties['apiRejectedBeforeGeneration']) {
        $Total.apiRejectedBeforeGeneration = [int]$Total.apiRejectedBeforeGeneration + [int]$Usage.apiRejectedBeforeGeneration
    }
}

function New-AgentPromptFile {
    param([string]$Path,[string]$Text)
    $Text | Set-Content -LiteralPath $Path -Encoding UTF8
    return $Path
}

function Assert-AITeamCodexReady {
    $status = Get-AITeamCodexLoginStatus
    if (-not $status.installed -or -not $status.loggedIn) {
        throw 'Codex CLI is required for this model step but is not installed/logged in. Run: erp-ai-team setup-codex'
    }
    return $status
}

$config = Get-Content -LiteralPath (Join-Path $RepoRoot '.ai\team-config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$suitePath = Join-Path $RepoRoot ([string]$config.qualification.suite)
$oraclePath = Join-Path $RepoRoot ([string]$config.qualification.oracles)
$suite = Get-Content -LiteralPath $suitePath -Raw -Encoding UTF8 | ConvertFrom-Json
$rows = @($suite.missions | Where-Object { [string]$_.id -eq $TestId })
if ($rows.Count -ne 1) { throw "Mission $TestId not found exactly once." }
$mission = $rows[0]
if ([string]$mission.mode -eq 'deterministic') { throw "$TestId is deterministic and must use the fast path." }

$run = New-AITeamRun -RepoRoot $RepoRoot -MissionId $TestId -MissionName ([string]$mission.name) -Mode ([string]$mission.mode) -StateRoot $StateRoot
$runDir = [string]$run.runDirectory
$phaseMs = [ordered]@{}
$usageTotal = @{ inputTokens=[int64]0; cachedInputTokens=[int64]0; outputTokens=[int64]0; reasoningTokens=[int64]0; modelAttempts=0; modelCalls=0; apiRejectedBeforeGeneration=0 }
$runCompleted = $false

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
    $sw.Stop(); $phaseMs.preflight = $sw.ElapsedMilliseconds
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
        exclusions = @('Review/test only: do not modify runtime code.','Do not use prior AI-team reports or old ChangeImpact as current evidence.')
        webPolicy = [string]$mission.webPolicy
    }
    $missionPath = Join-Path $runDir 'mission.json'
    Write-AITeamJsonFile -Value $packet -Path $missionPath
    $missionGate = Test-AITeamMissionPacket -PacketPath $missionPath -ExpectedSha ([string]$run.commitSha)
    Write-AITeamJsonFile -Value $missionGate -Path (Join-Path $runDir 'mission-gate.json')
    if (-not $missionGate.pass) { throw 'Mission Packet Gate failed.' }
    $packetJson = $packet | ConvertTo-Json -Depth 20

    $selected = @()
    $routingDetail = $null
    $routingSource = 'local-rules'
    $localRoute = $null

    $rulesPath = Join-Path $RepoRoot ([string]$config.routing.rulesPath)
    $localRulesCheck = Test-AITeamLocalRouterRules -RulesPath $rulesPath
    Write-AITeamJsonFile -Value $localRulesCheck -Path (Join-Path $runDir 'local-router-rules-gate.json')
    if (-not $localRulesCheck.pass) { throw "Local router rules failed validation: $(@($localRulesCheck.errors) -join ' | ')" }

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    Add-AITeamTrace -RunDir $runDir -Event 'LOCAL_ROUTER_START' -Phase 'routing' -Role 'local-router' -Status 'RUNNING' -Detail 'Local rules run before any model call.' | Out-Null
    $localRoute = Get-AITeamLocalRoute -MissionPacket $packet -Config $config -RulesPath $rulesPath
    $sw.Stop(); $phaseMs.localRouter = [int64]$sw.ElapsedMilliseconds
    Write-AITeamJsonFile -Value $localRoute -Path (Join-Path $runDir 'local-routing-debug.json')
    Add-AITeamTrace -RunDir $runDir -Event 'LOCAL_ROUTER_END' -Phase 'routing' -Role 'local-router' -Status $(if ($localRoute.needsAiFallback) { 'GAP' } else { 'PASS' }) -Detail "selected=$(@($localRoute.routingPlan.selectedRoles) -join ','); fallback=$($localRoute.needsAiFallback); ms=$($phaseMs.localRouter)" | Out-Null

    if (-not [bool]$localRoute.needsAiFallback) {
        $routingDetail = $localRoute.routingPlan
        $routingSource = 'local-rules'
    }
    elseif ([bool]$config.routing.aiFallbackEnabled) {
        Assert-AITeamCodexReady | Out-Null
        $routingSource = 'ai-fallback'
        Add-AITeamTrace -RunDir $runDir -Event 'ROUTER_FALLBACK_START' -Phase 'routing' -Role 'mission-router' -Status 'RUNNING' -Detail 'Local route was ambiguous; invoking one AI router fallback.' | Out-Null
        $routerPrompt = @"
You are the ERP AI Team Mission Router fallback.
Read $([string]$config.prompts.missionRouter) and obey it exactly.
The deterministic local router could not make a decisive choice. Independently route this mission from the mission packet only.
Do not inspect repository files, do not solve the mission, do not read oracles, and do not spawn subagents.

Mission packet:
$packetJson

Return only the routing JSON.
"@
        $routerPromptPath = New-AgentPromptFile -Path (Join-Path $runDir 'router-prompt.txt') -Text $routerPrompt
        $routerOutput = Join-Path $runDir 'routing.raw.json'
        $routerEvents = Join-Path $runDir 'router.events.jsonl'
        $routerErr = Join-Path $runDir 'router.stderr.txt'
        $routerResult = Invoke-AITeamCodexExec -RepoRoot $RepoRoot -PromptPath $routerPromptPath -SchemaPath (Join-Path $RepoRoot ([string]$config.schemas.routingPlan)) -OutputPath $routerOutput -EventsPath $routerEvents -StderrPath $routerErr -ReasoningEffort ([string]$config.codex.routerReasoningEffort) -Model ([string]$config.codex.model) -WebAllowed $false
        Add-Usage -Total $usageTotal -Usage $routerResult.usage
        Write-AITeamJsonFile -Value $routerResult -Path (Join-Path $runDir 'router-execution.json')
        if ($null -ne $routerResult.PSObject.Properties['schemaPreflightPass'] -and -not [bool]$routerResult.schemaPreflightPass) {
            throw "Mission Router schema preflight blocked before Codex: $(@($routerResult.schemaPreflightErrors) -join ' | ')"
        }
        if ($routerResult.exitCode -ne 0 -or -not (Test-Path -LiteralPath $routerOutput -PathType Leaf)) { throw 'Mission Router Codex fallback failed.' }
        $routingDetail = Get-Content -LiteralPath $routerOutput -Raw -Encoding UTF8 | ConvertFrom-Json
        Add-AITeamTrace -RunDir $runDir -Event 'ROUTER_FALLBACK_END' -Phase 'routing' -Role 'mission-router' -Status 'PASS' -Detail "ms=$($routerResult.elapsedMilliseconds)" | Out-Null
    }
    else {
        throw 'Local router was ambiguous and AI fallback is disabled.'
    }

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
        if ([string]$mission.mode -eq 'review' -and [string]$roleConfig.class -ne 'engineering') { throw "Router selected non-engineering role in review mission: $role" }
        if ([string]$mission.mode -eq 'product' -and $role -ne 'product-erp-partner') { throw "Product mission selected unexpected role: $role" }
    }
    foreach ($role in $excluded) {
        if ($null -eq $config.roles.PSObject.Properties[$role]) { throw "Router excluded unknown role: $role" }
    }
    Write-AITeamJsonFile -Value $routingDetail -Path (Join-Path $runDir 'routing.json')
    Add-AITeamTrace -RunDir $runDir -Event 'ROUTING_FINAL' -Phase 'routing' -Role $routingSource -Status 'PASS' -Detail "source=$routingSource selected=$($selected -join ',')" | Out-Null

    if ([string]$mission.mode -eq 'product') {
        Assert-AITeamCodexReady | Out-Null
        Add-AITeamTrace -RunDir $runDir -Event 'REVIEWER_START' -Phase 'product' -Role 'product-erp-partner' -Status 'RUNNING' | Out-Null
        $productPrompt = @"
You are the Product & ERP Partner for ERP Prototype.
Read AGENTS.md and .ai/prompts/product-erp-partner.md. Work read-only. Do not implement anything.
Mission packet:
$packetJson
Return only JSON matching .ai/schemas/product-report.schema.json.
"@
        $pp = New-AgentPromptFile -Path (Join-Path $runDir 'product-prompt.txt') -Text $productPrompt
        $raw = Join-Path $runDir 'product.raw.json'; $events = Join-Path $runDir 'product.events.jsonl'; $err = Join-Path $runDir 'product.stderr.txt'
        $pr = Invoke-AITeamCodexExec -RepoRoot $RepoRoot -PromptPath $pp -SchemaPath (Join-Path $RepoRoot ([string]$config.schemas.product)) -OutputPath $raw -EventsPath $events -StderrPath $err -ReasoningEffort ([string]$config.codex.productReasoningEffort) -Model ([string]$config.codex.model) -WebAllowed ([string]$mission.webPolicy -ne 'forbidden')
        Add-Usage -Total $usageTotal -Usage $pr.usage
        Write-AITeamJsonFile -Value $pr -Path (Join-Path $runDir 'product-execution.json')
        if ($null -ne $pr.PSObject.Properties['schemaPreflightPass'] -and -not [bool]$pr.schemaPreflightPass) { throw "Product schema preflight blocked before Codex: $(@($pr.schemaPreflightErrors) -join ' | ')" }
        if ($pr.exitCode -ne 0) { throw 'Product Partner Codex call failed.' }
        $pg = Test-AITeamProductReport -ReportPath $raw -RepoRoot $RepoRoot -ExpectedSha ([string]$run.commitSha) -ExpectedMission ([string]$mission.name)
        Write-AITeamJsonFile -Value $pg -Path (Join-Path $runDir 'product-gate.json')
        if (-not $pg.pass) { throw 'Product Gate rejected report.' }
        Add-AITeamTrace -RunDir $runDir -Event 'REVIEWER_END' -Phase 'product' -Role 'product-erp-partner' -Status 'PASS' -Detail "ms=$($pr.elapsedMilliseconds)" | Out-Null
    }
    else {
        if ($selected.Count -gt 0) { Assert-AITeamCodexReady | Out-Null }
        $jobs = @()
        $jobMeta = @{}
        foreach ($role in $selected) {
            $roleConfig = $config.roles.PSObject.Properties[$role].Value
            $rolePrompt = [string]$roleConfig.prompt
            $promptText = @"
You are the $role independent reviewer for ERP Prototype.
Read AGENTS.md, .ai/prompts/_reviewer-common.md, and $rolePrompt. Obey those files exactly.
You are read-only. Do not spawn subagents. Do not read sibling reports, prior AI-team reports, or qualification oracles.

Mission packet:
$packetJson

Return only JSON matching .ai/schemas/reviewer-findings.schema.json.
"@
            $promptPath = New-AgentPromptFile -Path (Join-Path $runDir "$role-prompt.txt") -Text $promptText
            $raw = Join-Path $runDir "$role.raw.json"; $events = Join-Path $runDir "$role.events.jsonl"; $err = Join-Path $runDir "$role.stderr.txt"
            Add-AITeamTrace -RunDir $runDir -Event 'REVIEWER_START' -Phase 'reviewers' -Role $role -Status 'RUNNING' | Out-Null
            $modulePath = Join-Path $PSScriptRoot 'AITeamCodex.psm1'
            $schema = Join-Path $RepoRoot ([string]$config.schemas.reviewer)
            $effort = [string]$config.codex.reviewerReasoningEffort
            $model = [string]$config.codex.model
            $webAllowed = ([string]$mission.webPolicy -ne 'forbidden')
            $job = Start-Job -ScriptBlock {
                param($ModulePath,$Repo,$Prompt,$Schema,$Output,$Events,$Err,$Effort,$Model,$WebAllowed)
                Import-Module $ModulePath -Force
                Invoke-AITeamCodexExec -RepoRoot $Repo -PromptPath $Prompt -SchemaPath $Schema -OutputPath $Output -EventsPath $Events -StderrPath $Err -ReasoningEffort $Effort -Model $Model -WebAllowed ([bool]$WebAllowed)
            } -ArgumentList $modulePath,$RepoRoot,$promptPath,$schema,$raw,$events,$err,$effort,$model,$webAllowed
            $jobs += $job
            $jobMeta[([string]$job.Id)] = [pscustomobject]@{ role=$role; raw=$raw; events=$events; err=$err }
        }

        if ($jobs.Count -gt 0) { Wait-Job -Job $jobs | Out-Null }
        $passedRoles = @()
        foreach ($job in $jobs) {
            $meta = $jobMeta[([string]$job.Id)]
            $role = [string]$meta.role
            $res = @(Receive-Job -Job $job -ErrorAction SilentlyContinue) | Select-Object -Last 1
            Remove-Job -Job $job -Force | Out-Null
            if ($null -eq $res) {
                Add-AITeamTrace -RunDir $runDir -Event 'REVIEWER_END' -Phase 'reviewers' -Role $role -Status 'FAIL' -Detail 'No execution result returned.' | Out-Null
                continue
            }
            Add-Usage -Total $usageTotal -Usage $res.usage
            Write-AITeamJsonFile -Value $res -Path (Join-Path $runDir "$role-execution.json")
            if ($null -ne $res.PSObject.Properties['schemaPreflightPass'] -and -not [bool]$res.schemaPreflightPass) {
                Add-AITeamTrace -RunDir $runDir -Event 'REVIEWER_END' -Phase 'reviewers' -Role $role -Status 'FAIL' -Detail "Schema preflight blocked before Codex: $(@($res.schemaPreflightErrors) -join ' | ')" | Out-Null
                continue
            }
            if ([int]$res.exitCode -ne 0 -or -not (Test-Path -LiteralPath ([string]$meta.raw) -PathType Leaf)) {
                Add-AITeamTrace -RunDir $runDir -Event 'REVIEWER_END' -Phase 'reviewers' -Role $role -Status 'FAIL' -Detail "Codex exit=$($res.exitCode)" | Out-Null
                continue
            }
            $gate = Test-AITeamFindingReport -ReportPath ([string]$meta.raw) -RepoRoot $RepoRoot -ExpectedSha ([string]$run.commitSha) -ExpectedMission ([string]$mission.name) -ExpectedRole $role
            Write-AITeamJsonFile -Value ([pscustomobject][ordered]@{ pass=$gate.pass; errors=$gate.errors; agentRole=$gate.agentRole; findingCount=$gate.findingCount; evidenceDigests=$gate.evidenceDigests }) -Path (Join-Path $runDir "finding-gate-$role.json")
            if ($gate.pass) {
                Write-AITeamJsonFile -Value $gate.leadView -Path (Join-Path $runDir "$role.lead.json")
                $passedRoles += $role
                Add-AITeamTrace -RunDir $runDir -Event 'REVIEWER_END' -Phase 'reviewers' -Role $role -Status 'PASS' -Detail "ms=$($res.elapsedMilliseconds); findings=$($gate.findingCount)" | Out-Null
            } else {
                Add-AITeamTrace -RunDir $runDir -Event 'REVIEWER_END' -Phase 'reviewers' -Role $role -Status 'FAIL' -Detail 'Finding Gate rejected report.' | Out-Null
            }
        }

        $completion = Test-AITeamReviewerCompletion -Required $selected -Passed $passedRoles
        Write-AITeamJsonFile -Value $completion -Path (Join-Path $runDir 'completion-gate.json')
        if (-not $completion.pass) { throw "Reviewer Completion Gate failed. Missing: $(@($completion.missing) -join ', ')" }

        if ($selected.Count -gt 0) {
            $leadViews = @()
            foreach ($role in $selected) {
                $leadViews += (Get-Content -LiteralPath (Join-Path $runDir "$role.lead.json") -Raw -Encoding UTF8)
            }
            $leadPrompt = @"
You are the Lead Integrator for ERP Prototype.
Read .ai/prompts/lead-integrator.md and obey it exactly. Work read-only. Do not spawn subagents.
Mission packet:
$packetJson

Validated reviewer reports follow. Confidence telemetry has already been removed:
$($leadViews -join "`n--- REVIEWER ---`n")

Return only JSON matching .ai/schemas/lead-report.schema.json.
"@
            $lp = New-AgentPromptFile -Path (Join-Path $runDir 'lead-prompt.txt') -Text $leadPrompt
            $leadRaw=Join-Path $runDir 'lead.raw.json'; $leadEvents=Join-Path $runDir 'lead.events.jsonl'; $leadErr=Join-Path $runDir 'lead.stderr.txt'
            Add-AITeamTrace -RunDir $runDir -Event 'LEAD_START' -Phase 'lead' -Role 'lead' -Status 'RUNNING' | Out-Null
            $lr = Invoke-AITeamCodexExec -RepoRoot $RepoRoot -PromptPath $lp -SchemaPath (Join-Path $RepoRoot ([string]$config.schemas.lead)) -OutputPath $leadRaw -EventsPath $leadEvents -StderrPath $leadErr -ReasoningEffort ([string]$config.codex.leadReasoningEffort) -Model ([string]$config.codex.model) -WebAllowed $false
            Add-Usage -Total $usageTotal -Usage $lr.usage
            Write-AITeamJsonFile -Value $lr -Path (Join-Path $runDir 'lead-execution.json')
            if ($null -ne $lr.PSObject.Properties['schemaPreflightPass'] -and -not [bool]$lr.schemaPreflightPass) { throw "Lead schema preflight blocked before Codex: $(@($lr.schemaPreflightErrors) -join ' | ')" }
            if ($lr.exitCode -ne 0) { throw 'Lead Codex call failed.' }
            $lg = Test-AITeamLeadReport -ReportPath $leadRaw -RepoRoot $RepoRoot -ExpectedSha ([string]$run.commitSha) -ExpectedMission ([string]$mission.name)
            Write-AITeamJsonFile -Value $lg -Path (Join-Path $runDir 'lead-gate.json')
            if (-not $lg.pass) { throw 'Lead Gate rejected report.' }
            Add-AITeamTrace -RunDir $runDir -Event 'LEAD_END' -Phase 'lead' -Role 'lead' -Status 'PASS' -Detail "ms=$($lr.elapsedMilliseconds); verdict=$($lg.verdict)" | Out-Null
        } else {
            Write-AITeamJsonFile -Value ([pscustomobject][ordered]@{ started=$false; reason='Router selected no substantive reviewer for this routing-only/trivial mission.' }) -Path (Join-Path $runDir 'lead-state.json')
            Add-AITeamTrace -RunDir $runDir -Event 'LEAD_SKIPPED' -Phase 'lead' -Status 'PASS' -Detail 'No selected reviewer.' | Out-Null
        }
    }

    $after = Get-AITeamRepoState -RepoRoot $RepoRoot
    Write-AITeamJsonFile -Value $after -Path (Join-Path $runDir 'repo-after.json')
    $clean = Compare-AITeamRepoState -Baseline $before -Current $after
    Write-AITeamJsonFile -Value $clean -Path (Join-Path $runDir 'cleanliness-result.json')
    if (-not $clean.pass) { throw 'Cleanliness Gate failed.' }

    $routingScore = Test-AITeamRoutingOracle -OraclePath $oraclePath -TestId $TestId -Selected $selected
    Write-AITeamJsonFile -Value $routingScore -Path (Join-Path $runDir 'routing-oracle.json')

    $usageObj = [pscustomobject][ordered]@{
        status = 'direct-codex-cli-json-events'
        estimated = $false
        modelAttempts = [int]$usageTotal.modelAttempts
        modelCalls = [int]$usageTotal.modelCalls
        apiRejectedBeforeGeneration = [int]$usageTotal.apiRejectedBeforeGeneration
        inputTokens = [int64]$usageTotal.inputTokens
        cachedInputTokens = [int64]$usageTotal.cachedInputTokens
        outputTokens = [int64]$usageTotal.outputTokens
        reasoningTokens = [int64]$usageTotal.reasoningTokens
        weeklyAllowancePercent = $null
        note = 'Token counts are parsed from Codex CLI turn.completed JSON events. Weekly allowance percentage is not inferred.'
    }
    Write-AITeamJsonFile -Value $usageObj -Path (Join-Path $runDir 'model-usage.json')

    $resultValue = if ($routingScore.pass) { 'PASS' } else { 'FAIL' }
    $result = [pscustomobject][ordered]@{
        schemaVersion = 3
        testId = $TestId
        mission = [string]$mission.name
        commitSha = [string]$run.commitSha
        teamVersion = [string]$run.teamVersion
        result = $resultValue
        selectedReviewers = $selected
        routingSource = $routingSource
        localRouterFallbackRecommended = [bool]$localRoute.needsAiFallback
        routingOracleMatch = [bool]$routingScore.pass
        cleanlinessPass = [bool]$clean.pass
        semanticOracleEvaluation = 'manual-after-run'
        usageTelemetry = $usageObj
        evidenceDirectory = $runDir
        traceFile = (Join-Path $runDir 'trace.jsonl')
    }
    Write-AITeamJsonFile -Value $result -Path (Join-Path $runDir 'result.json')
    $final = Complete-AITeamRun -RunDir $runDir -Result $resultValue -Summary "routing=$($routingScore.pass); cleanliness=$($clean.pass); attempts=$($usageObj.modelAttempts); completedCalls=$($usageObj.modelCalls)" -PhaseMilliseconds $phaseMs -UsageTelemetry $usageObj
    $runCompleted = $true

    Write-Host ''
    Write-Host "AI TEAM MODEL TEST ${TestId}: $resultValue"
    Write-Host "- routing source: $routingSource"
    Write-Host "- reviewers: $($selected -join ', ')"
    Write-Host "- Codex attempts: $($usageObj.modelAttempts)"
    Write-Host "- completed model calls: $($usageObj.modelCalls)"
    Write-Host "- pre-generation API rejects: $($usageObj.apiRejectedBeforeGeneration)"
    Write-Host "- tokens: input=$($usageObj.inputTokens) cached=$($usageObj.cachedInputTokens) output=$($usageObj.outputTokens)"
    Write-Host "- elapsed ms: $($final.elapsedMilliseconds)"
    Write-Host "- evidence: $runDir"
    Write-Host "- trace: $(Join-Path $runDir 'trace.jsonl')"
    if (-not $routingScore.pass) { exit 1 }
}
catch {
    $err = $_.Exception.Message
    try {
        Add-AITeamTrace -RunDir $runDir -Event 'RUN_ERROR' -Phase 'orchestration' -Status 'FAIL' -Detail $err | Out-Null
        $usageObj = [pscustomobject][ordered]@{
            status='direct-codex-cli-json-events'; estimated=$false; modelAttempts=[int]$usageTotal.modelAttempts; modelCalls=[int]$usageTotal.modelCalls; apiRejectedBeforeGeneration=[int]$usageTotal.apiRejectedBeforeGeneration;
            inputTokens=[int64]$usageTotal.inputTokens; cachedInputTokens=[int64]$usageTotal.cachedInputTokens;
            outputTokens=[int64]$usageTotal.outputTokens; reasoningTokens=[int64]$usageTotal.reasoningTokens;
            weeklyAllowancePercent=$null; note='Partial usage captured before failure.'
        }
        Write-AITeamJsonFile -Value $usageObj -Path (Join-Path $runDir 'model-usage.json')
        if (-not $runCompleted) { Complete-AITeamRun -RunDir $runDir -Result 'FAIL' -Summary $err -PhaseMilliseconds $phaseMs -UsageTelemetry $usageObj | Out-Null; $runCompleted=$true }
    } catch {
        try { Set-AITeamRunEmergencyFailure -RunDir $runDir -ErrorMessage $err | Out-Null } catch { }
    }
    Write-Host "AI TEAM MODEL TEST ${TestId}: FAIL"
    Write-Host "- error: $err"
    Write-Host "- evidence: $runDir"
    throw $err
}
