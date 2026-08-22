param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('AIT-04','AIT-10')]
    [string]$TestId,
    [string]$RepoRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'AITeamGates.psm1') -Force

if (-not $RepoRoot) {
    $RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
}
else {
    $RepoRoot = [System.IO.Path]::GetFullPath($RepoRoot)
}

function Write-JsonFile {
    param([Parameter(Mandatory)]$Value, [Parameter(Mandatory)][string]$Path)
    $parent = Split-Path -Parent $Path
    if ($parent -and -not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    $Value | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Get-UtcIso { return [DateTime]::UtcNow.ToString('o') }
function New-PhaseTimer { return [System.Diagnostics.Stopwatch]::StartNew() }

$overall = [System.Diagnostics.Stopwatch]::StartNew()
$phaseMs = [ordered]@{}
$startedUtc = Get-UtcIso

$suitePath = Join-Path $RepoRoot '.ai\test-missions\test-suite-v2.yaml'
$oraclePath = Join-Path $RepoRoot '.ai\test-missions\oracles-v2.yaml'

$t = New-PhaseTimer
$suiteResult = Test-AITeamSuite -SuitePath $suitePath -OraclePath $oraclePath
$t.Stop(); $phaseMs.suiteValidation = $t.ElapsedMilliseconds
if (-not $suiteResult.pass) { throw 'AIT deterministic fast path blocked: suite validation failed.' }

$suite = Get-Content -LiteralPath $suitePath -Raw -Encoding UTF8 | ConvertFrom-Json
$mission = @($suite.missions | Where-Object { $_.id -eq $TestId })
if ($mission.Count -ne 1) { throw "Mission $TestId not found exactly once." }
$mission = $mission[0]
if ([string]$mission.mode -ne 'deterministic') { throw "$TestId is not a deterministic mission." }

$head = (& git -C $RepoRoot rev-parse HEAD).Trim()
$short = $head.Substring(0, [Math]::Min(8,$head.Length))
$stamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff')
$runDir = Join-Path $env:TEMP "erp-ai-team-$($TestId.ToLowerInvariant())-$short-$stamp"
New-Item -ItemType Directory -Force -Path $runDir | Out-Null

Write-JsonFile -Path (Join-Path $runDir 'mission.json') -Value ([pscustomobject][ordered]@{
    schemaVersion = 1
    id = $TestId
    name = [string]$mission.name
    mode = [string]$mission.mode
    objective = [string]$mission.objective
    commitSha = $head
    startedUtc = $startedUtc
})

Write-JsonFile -Path (Join-Path $runDir 'routing.json') -Value ([pscustomobject][ordered]@{
    selectedReviewers = @()
    reviewerCount = 0
    reason = 'Deterministic-only qualification mission; no model reviewer is permitted.'
})

$t = New-PhaseTimer
$before = Get-AITeamRepoState -RepoRoot $RepoRoot
Write-JsonFile -Value $before -Path (Join-Path $runDir 'repo-before.json')
$t.Stop(); $phaseMs.repoCaptureBefore = $t.ElapsedMilliseconds

$gatePass = $false
$gateType = ''
$gateDetail = $null
$leadStarted = $false

$t = New-PhaseTimer
if ($TestId -eq 'AIT-04') {
    $gateType = 'FindingGateNegativeTest'
    $malformedPath = Join-Path $runDir 'malformed-reviewer.json'
    $malformed = [pscustomobject][ordered]@{
        schemaVersion = 1
        agentRole = 'deterministic-test-reviewer'
        mission = [string]$mission.name
        commitSha = $head
        summary = 'Deliberately malformed report for AIT-04.'
        findings = @(
            [pscustomobject][ordered]@{
                id = 'TEST-01'
                claim = 'This finding intentionally omits evidence.'
                impact = 'The gate must reject the report before Lead context.'
                verification = 'The deterministic Finding Gate must return rejection.'
            }
        )
        confidenceTelemetry = 'high'
    }
    Write-JsonFile -Value $malformed -Path $malformedPath
    $gateDetail = Test-AITeamFindingReport -ReportPath $malformedPath -RepoRoot $RepoRoot -ExpectedSha $head -ExpectedMission ([string]$mission.name)
    $evidenceErrors = @($gateDetail.errors | Where-Object { $_ -match 'evidence' })
    $gatePass = (-not $gateDetail.pass) -and ($evidenceErrors.Count -gt 0)
    Write-JsonFile -Value ([pscustomobject][ordered]@{
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
    Write-JsonFile -Value ([pscustomobject][ordered]@{
        expected = 'REJECT_MISSING_REQUIRED_REVIEWER'
        gate = $gateDetail
        rejectedAsExpected = $gatePass
    }) -Path (Join-Path $runDir 'completion-gate.json')
}
$t.Stop(); $phaseMs.deterministicGate = $t.ElapsedMilliseconds

Write-JsonFile -Path (Join-Path $runDir 'lead-state.json') -Value ([pscustomobject][ordered]@{
    started = $leadStarted
    expected = $false
    reason = 'Negative deterministic gate test must block Lead.'
})

$t = New-PhaseTimer
$after = Get-AITeamRepoState -RepoRoot $RepoRoot
Write-JsonFile -Value $after -Path (Join-Path $runDir 'repo-after.json')
$clean = Compare-AITeamRepoState -Baseline $before -Current $after
Write-JsonFile -Value $clean -Path (Join-Path $runDir 'cleanliness-result.json')
$t.Stop(); $phaseMs.repoCaptureAndCompareAfter = $t.ElapsedMilliseconds

$oracle = Get-Content -LiteralPath $oraclePath -Raw -Encoding UTF8 | ConvertFrom-Json
$oracleEntry = @($oracle.oracles | Where-Object { $_.id -eq $TestId })
$oracleRoutingMatch = $false
if ($oracleEntry.Count -eq 1) {
    $expectedRoles = @($oracleEntry[0].routingExpectation)
    $oracleRoutingMatch = ($expectedRoles.Count -eq 0)
}

$overall.Stop()
$phaseMs.total = $overall.ElapsedMilliseconds
$passedOverall = $gatePass -and (-not $leadStarted) -and $clean.pass -and $oracleRoutingMatch

$resultValue = if ($passedOverall) { 'PASS' } else { 'FAIL' }
$result = [pscustomobject][ordered]@{
    schemaVersion = 1
    testId = $TestId
    mission = [string]$mission.name
    commitSha = $head
    result = $resultValue
    gateType = $gateType
    gateRejectedAsExpected = $gatePass
    leadStarted = $leadStarted
    cleanlinessPass = $clean.pass
    routingOracleMatch = $oracleRoutingMatch
    selectedReviewers = @()
    usageTelemetry = 'unavailable'
    startedUtc = $startedUtc
    endedUtc = Get-UtcIso
    phaseMilliseconds = $phaseMs
    evidenceDirectory = $runDir
}
Write-JsonFile -Value $result -Path (Join-Path $runDir 'result.json')

Write-Host "AI TEAM FAST TEST ${TestId}: $($result.result)"
Write-Host "- gate rejected as expected: $gatePass"
Write-Host "- lead started: $leadStarted"
Write-Host "- cleanliness: $($clean.pass)"
Write-Host "- total ms: $($phaseMs.total)"
Write-Host "- evidence: $runDir"

if (-not $passedOverall) { throw "AI Team deterministic test $TestId failed." }
