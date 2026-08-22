param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('ValidateSuite','ValidateBrain','CaptureRepo','CompareRepo','ValidateReport','ValidateCompletion','ScoreRouting','ValidateMission','ValidateLead','ValidateProduct')]
    [string]$Command,

    [string]$RepoRoot,
    [string]$Suite,
    [string]$Oracles,
    [string]$Output,
    [string]$Baseline,
    [string]$Report,
    [string]$ExpectedSha,
    [string]$ExpectedMission,
    [string]$LeadView,
    [string]$ExpectedRole,
    [string]$TestId,
    [string[]]$Selected = @(),
    [string[]]$Required = @(),
    [string[]]$Passed = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'AITeamGates.psm1') -Force

function Write-JsonFile {
    param([Parameter(Mandatory)]$Value, [Parameter(Mandatory)][string]$Path)
    $parent = Split-Path -Parent $Path
    if ($parent -and -not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    $Value | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Fail-Result {
    param([string]$Label, $Result)
    if ($Output) { Write-JsonFile -Value $Result -Path $Output }
    Write-Host "${Label}: FAIL"
    foreach ($e in @($Result.errors)) { Write-Host "- $e" }
    throw "$Label failed"
}

switch ($Command) {
    'ValidateSuite' {
        $result = Test-AITeamSuite -SuitePath $Suite -OraclePath $Oracles
        if (-not $result.pass) { Fail-Result -Label 'AI TEST SUITE' -Result $result }
        if ($Output) { Write-JsonFile -Value $result -Path $Output }
        Write-Host "AI TEST SUITE: PASS ($($result.missionCount) missions)"
        break
    }
    'ValidateBrain' {
        $result = Test-AITeamProjectBrain -RepoRoot $RepoRoot
        if (-not $result.pass) { Fail-Result -Label 'PROJECT BRAIN VALIDATION' -Result $result }
        if ($Output) { Write-JsonFile -Value $result -Path $Output }
        Write-Host 'PROJECT BRAIN VALIDATION: PASS'
        Write-Host "- indexed decisions: $($result.indexedDecisionCount)/$($result.decisionLogCount)"
        Write-Host "- field aliases: $($result.fieldAliasCount)"
        break
    }
    'CaptureRepo' {
        $state = Get-AITeamRepoState -RepoRoot $RepoRoot
        if (-not $Output) { throw 'CaptureRepo requires -Output' }
        Write-JsonFile -Value $state -Path $Output
        Write-Host "AI CLEANLINESS GATE: BASELINE $($state.fingerprint) @ $($state.head.Substring(0, [Math]::Min(12,$state.head.Length)))"
        break
    }
    'CompareRepo' {
        if (-not $Baseline) { throw 'CompareRepo requires -Baseline' }
        $before = Get-Content -LiteralPath $Baseline -Raw -Encoding UTF8 | ConvertFrom-Json
        $current = Get-AITeamRepoState -RepoRoot $RepoRoot
        $result = Compare-AITeamRepoState -Baseline $before -Current $current
        if ($Output) {
            Write-JsonFile -Value ([pscustomobject][ordered]@{ comparison=$result; current=$current }) -Path $Output
        }
        if (-not $result.pass) {
            Write-Host 'AI CLEANLINESS GATE: FAIL'
            foreach ($d in @($result.differences)) { Write-Host "- $d" }
            throw 'Repository state changed during review.'
        }
        Write-Host "AI CLEANLINESS GATE: PASS $($current.fingerprint) @ $($current.head.Substring(0, [Math]::Min(12,$current.head.Length)))"
        break
    }
    'ValidateReport' {
        $result = Test-AITeamFindingReport -ReportPath $Report -RepoRoot $RepoRoot -ExpectedSha $ExpectedSha -ExpectedMission $ExpectedMission -ExpectedRole $ExpectedRole
        if ($Output) { Write-JsonFile -Value ([pscustomobject][ordered]@{ pass=$result.pass; errors=$result.errors; agentRole=$result.agentRole; findingCount=$result.findingCount; evidenceDigests=$result.evidenceDigests }) -Path $Output }
        if (-not $result.pass) {
            Write-Host 'AI FINDING GATE: FAIL'
            foreach ($e in @($result.errors)) { Write-Host "- $e" }
            throw 'Finding Gate rejected report.'
        }
        if ($LeadView) { Write-JsonFile -Value $result.leadView -Path $LeadView }
        Write-Host "AI FINDING GATE: PASS ($($result.agentRole), $($result.findingCount) findings)"
        break
    }
    'ValidateCompletion' {
        $result = Test-AITeamReviewerCompletion -Required $Required -Passed $Passed
        if ($Output) { Write-JsonFile -Value $result -Path $Output }
        if (-not $result.pass) {
            Write-Host "AI REVIEWER COMPLETION GATE: FAIL: missing required reviewer(s): $($result.missing -join ', ')"
            throw 'Reviewer completion gate failed.'
        }
        Write-Host "AI REVIEWER COMPLETION GATE: PASS: $($result.required -join ', ')"
        break
    }
    'ScoreRouting' {
        if (-not $Oracles -or -not $TestId) { throw 'ScoreRouting requires -Oracles and -TestId.' }
        $result = Test-AITeamRoutingOracle -OraclePath $Oracles -TestId $TestId -Selected $Selected
        if ($Output) { Write-JsonFile -Value $result -Path $Output }
        if (-not $result.pass) {
            Write-Host 'AI ROUTING ORACLE: FAIL'
            foreach ($e in @($result.errors)) { Write-Host "- $e" }
            throw 'Routing oracle failed.'
        }
        Write-Host "AI ROUTING ORACLE: PASS ($(@($result.selected).Count) reviewer(s))"
        break
    }
    'ValidateMission' {
        $result = Test-AITeamMissionPacket -PacketPath $Report -ExpectedSha $ExpectedSha
        if ($Output) { Write-JsonFile -Value $result -Path $Output }
        if (-not $result.pass) { Fail-Result -Label 'AI MISSION PACKET GATE' -Result $result }
        Write-Host "AI MISSION PACKET GATE: PASS ($($result.requiredBehaviorCount) required behavior(s))"
        break
    }
    'ValidateLead' {
        $result = Test-AITeamLeadReport -ReportPath $Report -RepoRoot $RepoRoot -ExpectedSha $ExpectedSha -ExpectedMission $ExpectedMission
        if ($Output) { Write-JsonFile -Value $result -Path $Output }
        if (-not $result.pass) { Fail-Result -Label 'AI LEAD GATE' -Result $result }
        Write-Host "AI LEAD GATE: PASS ($($result.verdict))"
        break
    }
    'ValidateProduct' {
        $result = Test-AITeamProductReport -ReportPath $Report -RepoRoot $RepoRoot -ExpectedSha $ExpectedSha -ExpectedMission $ExpectedMission
        if ($Output) { Write-JsonFile -Value $result -Path $Output }
        if (-not $result.pass) { Fail-Result -Label 'AI PRODUCT GATE' -Result $result }
        Write-Host "AI PRODUCT GATE: PASS ($($result.opportunityCount) opportunity/ies)"
        break
    }
}
