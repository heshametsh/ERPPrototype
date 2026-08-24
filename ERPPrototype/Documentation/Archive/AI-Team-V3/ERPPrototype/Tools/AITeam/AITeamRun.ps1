param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('Start','Trace','Finish','Latest')]
    [string]$Command,

    [string]$RepoRoot,
    [string]$MissionId,
    [string]$MissionName,
    [ValidateSet('review','product','deterministic')]
    [string]$Mode = 'review',
    [string]$RunDir,
    [string]$Event,
    [string]$Phase = '',
    [string]$Role = '',
    [string]$Status = '',
    [string]$Detail = '',
    [ValidateSet('PASS','PASS_WITH_GAPS','DEGRADED','FAIL','BLOCKED')]
    [string]$Result = 'PASS',
    [string]$Summary = '',
    [string]$StateRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'AITeamRun.psm1') -Force

switch ($Command) {
    'Start' {
        if (-not $RepoRoot -or -not $MissionId -or -not $MissionName) {
            throw 'Start requires -RepoRoot, -MissionId, and -MissionName.'
        }
        $run = New-AITeamRun -RepoRoot $RepoRoot -MissionId $MissionId -MissionName $MissionName -Mode $Mode -StateRoot $StateRoot
        Write-Host "AI_RUN_ID=$($run.runId)"
        Write-Host "AI_RUN_DIR=$($run.runDirectory)"
        Write-Host "AI_TRACE=$(Join-Path $run.runDirectory 'trace.jsonl')"
        break
    }
    'Trace' {
        if (-not $RunDir -or -not $Event) { throw 'Trace requires -RunDir and -Event.' }
        Add-AITeamTrace -RunDir $RunDir -Event $Event -Phase $Phase -Role $Role -Status $Status -Detail $Detail | Out-Null
        Write-Host "AI TRACE: $Event $Phase $Role $Status"
        break
    }
    'Finish' {
        if (-not $RunDir) { throw 'Finish requires -RunDir.' }
        $final = Complete-AITeamRun -RunDir $RunDir -Result $Result -Summary $Summary
        Write-Host "AI TEAM RUN: $($final.result)"
        Write-Host "- elapsed ms: $($final.elapsedMilliseconds)"
        Write-Host "- evidence: $RunDir"
        Write-Host "- trace: $(Join-Path $RunDir 'trace.jsonl')"
        break
    }
    'Latest' {
        $state = Get-AITeamStateRoot -ExplicitRoot $StateRoot
        $latestPath = Join-Path $state 'latest.json'
        if (-not (Test-Path -LiteralPath $latestPath -PathType Leaf)) {
            Write-Host "No AI Team run has been recorded at $state"
            exit 1
        }
        Get-Content -LiteralPath $latestPath -Raw -Encoding UTF8
        break
    }
}
