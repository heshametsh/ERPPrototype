param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('AIT-04','AIT-10')]
    [string]$TestId,
    [string]$RepoRoot,
    [string]$StateRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'AITeamGates.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'AITeamRun.psm1') -Force

if (-not $RepoRoot) {
    $RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
}
else {
    $RepoRoot = [System.IO.Path]::GetFullPath($RepoRoot)
}

function Get-UtcIso { return [DateTime]::UtcNow.ToString('o', [System.Globalization.CultureInfo]::InvariantCulture) }
function New-PhaseTimer { return [System.Diagnostics.Stopwatch]::StartNew() }

$configPath = Join-Path $RepoRoot '.ai\team-config.json'
$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$suitePath = Join-Path $RepoRoot ([string]$config.qualification.suite)
$oraclePath = Join-Path $RepoRoot ([string]$config.qualification.oracles)

$suite = Get-Content -LiteralPath $suitePath -Raw -Encoding UTF8 | ConvertFrom-Json
$missionRows = @($suite.missions | Where-Object { $_.id -eq $TestId })
if ($missionRows.Count -ne 1) { throw "Mission $TestId not found exactly once." }
$mission = $missionRows[0]
if ([string]$mission.mode -ne 'deterministic') { throw "$TestId is not a deterministic mission." }

$run = New-AITeamRun -RepoRoot $RepoRoot -MissionId $TestId -MissionName ([string]$mission.name) -Mode 'deterministic' -StateRoot $StateRoot
$runDir = [string]$run.runDirectory
$overall = [System.Diagnostics.Stopwatch]::StartNew()
$phaseMs = [ordered]@{}
$previous = Get-AITeamPreviousRun -StateRoot ([string]$run.stateRoot) -MissionId $TestId
$runCompleted = $false

try {
    Write-AITeamJsonFile -Path (Join-Path $runDir 'mission.json') -Value ([pscustomobject][ordered]@{
        schemaVersion = 1
        id = $TestId
        name = [string]$mission.name
        mode = [string]$mission.mode
        objective = [string]$mission.objective
        commitSha = [string]$run.commitSha
        startedUtc = [string]$run.startedUtc
    })

    Write-AITeamJsonFile -Path (Join-Path $runDir 'routing.json') -Value ([pscustomobject][ordered]@{
        selectedReviewers = @()
        reviewerCount = 0
        excludedReviewers = @('change-mapper','behavior-legacy','revo','architecture','regression','data-integrity-security','performance-reliability','product-erp-partner')
        reason = 'Deterministic-only qualification mission; no model reviewer or Lead is permitted.'
    })

    Add-AITeamTrace -RunDir $runDir -Event 'PHASE_START' -Phase 'suite-validation' -Status 'RUNNING' | Out-Null
    $t = New-PhaseTimer
    $suiteResult = Test-AITeamSuite -SuitePath $suitePath -OraclePath $oraclePath
    $t.Stop(); $phaseMs.suiteValidation = $t.ElapsedMilliseconds
    if (-not $suiteResult.pass) { throw 'AIT deterministic fast path blocked: suite validation failed.' }
    Add-AITeamTrace -RunDir $runDir -Event 'PHASE_END' -Phase 'suite-validation' -Status 'PASS' -Detail "ms=$($phaseMs.suiteValidation)" | Out-Null

    Add-AITeamTrace -RunDir $runDir -Event 'PHASE_START' -Phase 'repo-before' -Status 'RUNNING' | Out-Null
    $t = New-PhaseTimer
    $before = Get-AITeamRepoState -RepoRoot $RepoRoot
    Write-AITeamJsonFile -Value $before -Path (Join-Path $runDir 'repo-before.json')
    if ([bool]$config.qualification.requireCleanStart -and -not [bool]$before.isClean) {
        throw 'Qualification run requires a clean working tree. Commit/stash the current changes before benchmarking the AI team.'
    }
    $t.Stop(); $phaseMs.repoCaptureBefore = $t.ElapsedMilliseconds
    Add-AITeamTrace -RunDir $runDir -Event 'PHASE_END' -Phase 'repo-before' -Status 'PASS' -Detail "ms=$($phaseMs.repoCaptureBefore)" | Out-Null

    $gatePass = $false
    $gateType = ''
    $gateDetail = $null
    $leadStarted = $false

    Add-AITeamTrace -RunDir $runDir -Event 'PHASE_START' -Phase 'deterministic-gate' -Status 'RUNNING' | Out-Null
    $t = New-PhaseTimer
    if ($TestId -eq 'AIT-04') {
        $gateType = 'FindingGateNegativeTest'
        $malformedPath = Join-Path $runDir 'malformed-reviewer.json'
        $malformed = [pscustomobject][ordered]@{
            schemaVersion = 2
            agentRole = 'deterministic-test-reviewer'
            mission = [string]$mission.name
            commitSha = [string]$run.commitSha
            summary = 'Deliberately malformed report for AIT-04.'
            coverage = [pscustomobject][ordered]@{
                inspectedAreas = @('Deterministic Finding Gate')
                evidenceAnchors = @('AGENTS.md:1')
                excludedAsIrrelevant = @()
                unresolved = @()
            }
            findings = @(
                [pscustomobject][ordered]@{
                    id = 'TEST-01'
                    claim = 'This finding intentionally omits evidence.'
                    impact = 'The gate must reject the report before Lead context.'
                    verification = 'The deterministic Finding Gate must return rejection.'
                    challenge = 'This is a deliberate negative-test payload, not a substantive reviewer claim.'
                }
            )
            confidenceTelemetry = 'high'
        }
        Write-AITeamJsonFile -Value $malformed -Path $malformedPath
        $gateDetail = Test-AITeamFindingReport -ReportPath $malformedPath -RepoRoot $RepoRoot -ExpectedSha ([string]$run.commitSha) -ExpectedMission ([string]$mission.name) -ExpectedRole 'deterministic-test-reviewer'
        $evidenceErrors = @($gateDetail.errors | Where-Object { $_ -match 'evidence' })
        $gatePass = (-not $gateDetail.pass) -and ($evidenceErrors.Count -gt 0)
        Write-AITeamJsonFile -Value ([pscustomobject][ordered]@{
            expected = 'REJECT'
            actualPass = $gateDetail.pass
            rejectedAsExpected = $gatePass
            errors = $gateDetail.errors
        }) -Path (Join-Path $runDir 'finding-gate.json')
    }
    elseif ($TestId -eq 'AIT-10') {
        $gateType = 'ReviewerCompletionNegativeTest'
        $required = @('change-mapper','architecture','regression')
        $passed = @('change-mapper','architecture')
        $gateDetail = Test-AITeamReviewerCompletion -Required $required -Passed $passed
        $gatePass = (-not $gateDetail.pass) -and (@($gateDetail.missing) -contains 'regression')
        Write-AITeamJsonFile -Value ([pscustomobject][ordered]@{
            expected = 'REJECT_MISSING_REQUIRED_REVIEWER'
            gate = $gateDetail
            rejectedAsExpected = $gatePass
        }) -Path (Join-Path $runDir 'completion-gate.json')
    }
    $t.Stop(); $phaseMs.deterministicGate = $t.ElapsedMilliseconds
    Add-AITeamTrace -RunDir $runDir -Event 'PHASE_END' -Phase 'deterministic-gate' -Status $(if ($gatePass) { 'PASS' } else { 'FAIL' }) -Detail "ms=$($phaseMs.deterministicGate)" | Out-Null

    Write-AITeamJsonFile -Path (Join-Path $runDir 'lead-state.json') -Value ([pscustomobject][ordered]@{
        started = $leadStarted
        expected = $false
        reason = 'Negative deterministic gate test must block Lead.'
    })
    Add-AITeamTrace -RunDir $runDir -Event 'LEAD_SKIPPED' -Phase 'lead' -Status 'PASS' -Detail 'Negative deterministic mission.' | Out-Null

    Add-AITeamTrace -RunDir $runDir -Event 'PHASE_START' -Phase 'repo-after-cleanliness' -Status 'RUNNING' | Out-Null
    $t = New-PhaseTimer
    $after = Get-AITeamRepoState -RepoRoot $RepoRoot
    Write-AITeamJsonFile -Value $after -Path (Join-Path $runDir 'repo-after.json')
    $clean = Compare-AITeamRepoState -Baseline $before -Current $after
    Write-AITeamJsonFile -Value $clean -Path (Join-Path $runDir 'cleanliness-result.json')
    $t.Stop(); $phaseMs.repoCaptureAndCompareAfter = $t.ElapsedMilliseconds
    Add-AITeamTrace -RunDir $runDir -Event 'PHASE_END' -Phase 'repo-after-cleanliness' -Status $(if ($clean.pass) { 'PASS' } else { 'FAIL' }) -Detail "ms=$($phaseMs.repoCaptureAndCompareAfter)" | Out-Null

    Add-AITeamTrace -RunDir $runDir -Event 'PHASE_START' -Phase 'routing-oracle' -Status 'RUNNING' | Out-Null
    $t = New-PhaseTimer
    $routingScore = Test-AITeamRoutingOracle -OraclePath $oraclePath -TestId $TestId -Selected @()
    Write-AITeamJsonFile -Value $routingScore -Path (Join-Path $runDir 'routing-oracle.json')
    $t.Stop(); $phaseMs.routingOracle = $t.ElapsedMilliseconds
    Add-AITeamTrace -RunDir $runDir -Event 'PHASE_END' -Phase 'routing-oracle' -Status $(if ($routingScore.pass) { 'PASS' } else { 'FAIL' }) -Detail "ms=$($phaseMs.routingOracle)" | Out-Null

    $overall.Stop()
    $phaseMs.harnessTotal = $overall.ElapsedMilliseconds
    $passedOverall = $gatePass -and (-not $leadStarted) -and $clean.pass -and $routingScore.pass
    $resultValue = if ($passedOverall) { 'PASS' } else { 'FAIL' }

    $noModelUsage = [pscustomobject][ordered]@{
        status = 'no-model-used'
        estimated = $false
        modelCalls = 0
        inputTokens = [int64]0
        cachedInputTokens = [int64]0
        outputTokens = [int64]0
        reasoningTokens = [int64]0
        weeklyAllowancePercent = $null
        note = 'Deterministic fast path. No Codex model process is started by the harness.'
    }
    Write-AITeamJsonFile -Value $noModelUsage -Path (Join-Path $runDir 'model-usage.json')

    $result = [pscustomobject][ordered]@{
        schemaVersion = 2
        testId = $TestId
        mission = [string]$mission.name
        commitSha = [string]$run.commitSha
        teamVersion = [string]$run.teamVersion
        result = $resultValue
        gateType = $gateType
        gateRejectedAsExpected = $gatePass
        leadStarted = $leadStarted
        cleanlinessPass = $clean.pass
        routingOracleMatch = $routingScore.pass
        selectedReviewers = @()
        usageTelemetry = $noModelUsage
        startedUtc = [string]$run.startedUtc
        endedUtc = Get-UtcIso
        phaseMilliseconds = $phaseMs
        evidenceDirectory = $runDir
        traceFile = (Join-Path $runDir 'trace.jsonl')
        orchestrationElapsedMilliseconds = $null
        comparisonToPrevious = $null
    }

    $final = Complete-AITeamRun -RunDir $runDir -Result $resultValue -UsageTelemetry $noModelUsage -Summary "gate=$gatePass; leadStarted=$leadStarted; cleanliness=$($clean.pass); routing=$($routingScore.pass)" -PhaseMilliseconds $phaseMs
    $runCompleted = $true
    $result.orchestrationElapsedMilliseconds = [int64]$final.elapsedMilliseconds

    $comparison = $null
    if ($null -ne $previous) {
        $comparison = [pscustomobject][ordered]@{
            previousRunId = [string]$previous.runId
            previousResult = [string]$previous.result
            previousElapsedMilliseconds = [int64]$previous.elapsedMilliseconds
            currentElapsedMilliseconds = [int64]$final.elapsedMilliseconds
            deltaMilliseconds = [int64]$final.elapsedMilliseconds - [int64]$previous.elapsedMilliseconds
        }
        $result.comparisonToPrevious = $comparison
    }

    Write-AITeamJsonFile -Value $result -Path (Join-Path $runDir 'result.json')
    Write-AITeamJsonFile -Value $phaseMs -Path (Join-Path $runDir 'phase-timing.json')

    Write-Host ""
    Write-Host "AI TEAM FAST TEST ${TestId}: $($result.result)"
    Write-Host "- harness ms: $($phaseMs.harnessTotal)"
    Write-Host "- orchestration ms: $($final.elapsedMilliseconds)"
    Write-Host "- Codex model calls: 0"
    Write-Host "- evidence: $runDir"
    Write-Host "- trace: $(Join-Path $runDir 'trace.jsonl')"
    if ($null -ne $comparison) {
        Write-Host "- previous indexed run: $($comparison.previousRunId) ($($comparison.previousElapsedMilliseconds) ms)"
        Write-Host "- delta vs previous indexed: $($comparison.deltaMilliseconds) ms"
    }

    if (-not $passedOverall) { exit 1 }
}
catch {
    $primaryError = $_.Exception
    $overall.Stop()
    try {
        Add-AITeamTrace -RunDir $runDir -Event 'RUN_ERROR' -Phase 'orchestration' -Status 'FAIL' -Detail $primaryError.Message | Out-Null
        Write-AITeamJsonFile -Value ([pscustomobject][ordered]@{
            schemaVersion = 1
            testId = $TestId
            result = 'FAIL'
            error = $primaryError.Message
            evidenceDirectory = $runDir
            traceFile = (Join-Path $runDir 'trace.jsonl')
        }) -Path (Join-Path $runDir 'result.json')
        if (-not $runCompleted) {
            try {
                Complete-AITeamRun -RunDir $runDir -Result 'FAIL' -Summary $primaryError.Message -PhaseMilliseconds $phaseMs | Out-Null
                $runCompleted = $true
            }
            catch {
                $closeError = $_.Exception.Message
                Set-AITeamRunEmergencyFailure -RunDir $runDir -ErrorMessage "Primary error: $($primaryError.Message) | Finalization error: $closeError" | Out-Null
                $runCompleted = $true
            }
        }
    }
    catch {
        $fallbackError = $_.Exception.Message
        try { Set-AITeamRunEmergencyFailure -RunDir $runDir -ErrorMessage "Primary error: $($primaryError.Message) | Error handler failure: $fallbackError" | Out-Null } catch { }
    }
    Write-Host "AI TEAM FAST TEST ${TestId}: FAIL"
    Write-Host "- evidence: $runDir"
    Write-Host "- trace: $(Join-Path $runDir 'trace.jsonl')"
    throw $primaryError
}
