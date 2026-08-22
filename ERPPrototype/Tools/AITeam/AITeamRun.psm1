Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-AITeamJsonFile {
    param(
        [Parameter(Mandatory)]$Value,
        [Parameter(Mandatory)][string]$Path
    )
    $parent = Split-Path -Parent $Path
    if ($parent -and -not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }
    $Value | ConvertTo-Json -Depth 40 | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Get-AITeamUtcIso {
    return [DateTime]::UtcNow.ToString('o')
}

function Get-AITeamStateRoot {
    param([string]$ExplicitRoot)

    if (-not [string]::IsNullOrWhiteSpace($ExplicitRoot)) {
        $expanded = [Environment]::ExpandEnvironmentVariables($ExplicitRoot)
        return [System.IO.Path]::GetFullPath($expanded)
    }

    if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
        return (Join-Path $env:LOCALAPPDATA 'ERPPrototype\AI-Team')
    }

    return (Join-Path $env:TEMP 'ERPPrototype-AI-Team')
}

function Get-AITeamGitHead {
    param([Parameter(Mandatory)][string]$RepoRoot)
    $value = & git -C $RepoRoot rev-parse HEAD 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to resolve Git HEAD: $($value -join [Environment]::NewLine)"
    }
    return ([string]($value -join "`n")).Trim()
}

function Get-AITeamHarnessManifest {
    param([Parameter(Mandatory)][string]$RepoRoot)

    $root = [System.IO.Path]::GetFullPath($RepoRoot)
    $relativeFiles = New-Object System.Collections.Generic.List[string]
    foreach ($rel in @(
        '.agents\skills\erp-ai-team\SKILL.md',
        'AGENTS.md',
        '.ai\team-config.json',
        '.ai\test-missions\test-suite-v3.yaml',
        '.ai\test-missions\oracles-v3.yaml'
    )) { $relativeFiles.Add($rel) }

    foreach ($pattern in @(
        '.ai\prompts\*',
        '.ai\schemas\*',
        'ERPPrototype\Tools\AITeam\*.ps1',
        'ERPPrototype\Tools\AITeam\*.psm1',
        'ERPPrototype\Tools\AITeam\*.py',
        'ERPPrototype\Tools\ProjectBrain\*.py'
    )) {
        foreach ($file in @(Get-ChildItem -LiteralPath (Join-Path $root (Split-Path $pattern -Parent)) -Filter (Split-Path $pattern -Leaf) -File -ErrorAction SilentlyContinue)) {
            $rel = [System.IO.Path]::GetRelativePath($root, $file.FullName)
            if (-not $relativeFiles.Contains($rel)) { $relativeFiles.Add($rel) }
        }
    }

    $relativeFiles = @($relativeFiles | Sort-Object -Unique)

    $files = @()
    foreach ($rel in $relativeFiles) {
        $full = Join-Path $root $rel
        if (Test-Path -LiteralPath $full -PathType Leaf) {
            $hash = (Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash.ToLowerInvariant()
            $files += [pscustomobject][ordered]@{
                path = ($rel -replace '\\','/')
                sha256 = $hash
            }
        }
    }

    $configPath = Join-Path $root '.ai\team-config.json'
    $teamVersion = 'unknown'
    if (Test-Path -LiteralPath $configPath -PathType Leaf) {
        try {
            $config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($config.teamVersion) { $teamVersion = [string]$config.teamVersion }
        }
        catch { }
    }

    return [pscustomobject][ordered]@{
        schemaVersion = 1
        teamVersion = $teamVersion
        capturedUtc = Get-AITeamUtcIso
        files = $files
    }
}

function Add-AITeamTrace {
    param(
        [Parameter(Mandatory)][string]$RunDir,
        [Parameter(Mandatory)][string]$Event,
        [string]$Phase = '',
        [string]$Role = '',
        [string]$Status = '',
        [string]$Detail = ''
    )

    $tracePath = Join-Path $RunDir 'trace.jsonl'
    $record = [pscustomobject][ordered]@{
        utc = Get-AITeamUtcIso
        event = $Event
        phase = $Phase
        role = $Role
        status = $Status
        detail = $Detail
    }
    $line = $record | ConvertTo-Json -Compress -Depth 10
    Add-Content -LiteralPath $tracePath -Value $line -Encoding UTF8

    # Keep latest.json useful while a run is still executing.
    $runPath = Join-Path $RunDir 'run.json'
    if (Test-Path -LiteralPath $runPath -PathType Leaf) {
        try {
            $run = Get-Content -LiteralPath $runPath -Raw -Encoding UTF8 | ConvertFrom-Json
            $state = [string]$run.stateRoot
            if (-not [string]::IsNullOrWhiteSpace($state)) {
                $latestPath = Join-Path $state 'latest.json'
                $latest = [pscustomobject][ordered]@{
                    schemaVersion = 1
                    runId = [string]$run.runId
                    missionId = [string]$run.missionId
                    mission = [string]$run.mission
                    result = [string]$run.result
                    runDirectory = [string]$run.runDirectory
                    startedUtc = [string]$run.startedUtc
                    updatedUtc = [string]$record.utc
                    lastEvent = [string]$record.event
                    phase = [string]$record.phase
                    role = [string]$record.role
                    status = [string]$record.status
                }
                Write-AITeamJsonFile -Value $latest -Path $latestPath
            }
        }
        catch { }
    }

    return $record
}

function New-AITeamRun {
    param(
        [Parameter(Mandatory)][string]$RepoRoot,
        [Parameter(Mandatory)][string]$MissionId,
        [Parameter(Mandatory)][string]$MissionName,
        [Parameter(Mandatory)][ValidateSet('review','product','deterministic')][string]$Mode,
        [string]$StateRoot
    )

    $repo = [System.IO.Path]::GetFullPath($RepoRoot)
    if ([string]::IsNullOrWhiteSpace($StateRoot)) {
        $configPath = Join-Path $repo '.ai\team-config.json'
        if (Test-Path -LiteralPath $configPath -PathType Leaf) {
            try {
                $config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
                if ($config.runState.root) { $StateRoot = [string]$config.runState.root }
            }
            catch { }
        }
    }
    $state = Get-AITeamStateRoot -ExplicitRoot $StateRoot
    $runsRoot = Join-Path $state 'Runs'
    New-Item -ItemType Directory -Force -Path $runsRoot | Out-Null

    $head = Get-AITeamGitHead -RepoRoot $repo
    $short = $head.Substring(0, [Math]::Min(8, $head.Length))
    $stamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff')
    $safeMission = ($MissionId -replace '[^A-Za-z0-9_.-]','_')
    $runId = "${stamp}_${safeMission}_${short}"
    $runDir = Join-Path $runsRoot $runId
    New-Item -ItemType Directory -Force -Path $runDir | Out-Null

    $manifest = Get-AITeamHarnessManifest -RepoRoot $repo
    Write-AITeamJsonFile -Value $manifest -Path (Join-Path $runDir 'harness-manifest.json')

    $startedUtc = Get-AITeamUtcIso
    $run = [pscustomobject][ordered]@{
        schemaVersion = 1
        runId = $runId
        missionId = $MissionId
        mission = $MissionName
        mode = $Mode
        commitSha = $head
        repoRoot = $repo
        stateRoot = $state
        runDirectory = $runDir
        teamVersion = $manifest.teamVersion
        startedUtc = $startedUtc
        endedUtc = $null
        result = 'RUNNING'
        elapsedMilliseconds = $null
    }
    Write-AITeamJsonFile -Value $run -Path (Join-Path $runDir 'run.json')

    $latest = [pscustomobject][ordered]@{
        schemaVersion = 1
        runId = $runId
        missionId = $MissionId
        mission = $MissionName
        result = 'RUNNING'
        runDirectory = $runDir
        startedUtc = $startedUtc
        updatedUtc = $startedUtc
    }
    Write-AITeamJsonFile -Value $latest -Path (Join-Path $state 'latest.json')
    Add-AITeamTrace -RunDir $runDir -Event 'RUN_START' -Phase 'orchestration' -Status 'RUNNING' -Detail "$MissionId @ $head" | Out-Null

    return $run
}

function Get-AITeamPreviousRun {
    param(
        [Parameter(Mandatory)][string]$StateRoot,
        [Parameter(Mandatory)][string]$MissionId
    )

    $indexPath = Join-Path $StateRoot 'runs-index.jsonl'
    if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) { return $null }

    $lines = @(Get-Content -LiteralPath $indexPath -Encoding UTF8)
    [array]::Reverse($lines)
    foreach ($line in $lines) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        try { $item = $line | ConvertFrom-Json }
        catch { continue }
        if ([string]$item.missionId -eq $MissionId) { return $item }
    }
    return $null
}

function Get-AITeamTraceSummary {
    param([Parameter(Mandatory)][string]$RunDir)

    $tracePath = Join-Path $RunDir 'trace.jsonl'
    $records = @()
    if (Test-Path -LiteralPath $tracePath -PathType Leaf) {
        foreach ($line in @(Get-Content -LiteralPath $tracePath -Encoding UTF8)) {
            if ([string]::IsNullOrWhiteSpace($line)) { continue }
            try { $records += ($line | ConvertFrom-Json) }
            catch { }
        }
    }

    $warnings = @()
    if ($records.Count -eq 0) { $warnings += 'Trace has no readable events.' }
    elseif (@($records | Where-Object { [string]$_.event -eq 'RUN_START' }).Count -eq 0) { $warnings += 'Trace is missing RUN_START.' }

    $roleStarts = @{}
    $roleDurations = @()
    foreach ($record in $records) {
        $event = [string]$record.event
        $role = [string]$record.role
        if ($event -eq 'REVIEWER_START' -and -not [string]::IsNullOrWhiteSpace($role)) {
            $roleStarts[$role] = [DateTime]::Parse([string]$record.utc).ToUniversalTime()
        }
        elseif ($event -eq 'REVIEWER_END' -and -not [string]::IsNullOrWhiteSpace($role)) {
            if ($roleStarts.ContainsKey($role)) {
                $ended = [DateTime]::Parse([string]$record.utc).ToUniversalTime()
                $roleDurations += [pscustomobject][ordered]@{
                    role = $role
                    elapsedMilliseconds = [int64][Math]::Round(($ended - $roleStarts[$role]).TotalMilliseconds)
                    status = [string]$record.status
                }
                $roleStarts.Remove($role)
            }
            else {
                $warnings += "Reviewer $role ended without a recorded start."
            }
        }
    }
    foreach ($role in $roleStarts.Keys) { $warnings += "Reviewer $role started without a recorded end." }

    $leadElapsed = $null
    $leadStartRows = @($records | Where-Object { [string]$_.event -eq 'LEAD_START' })
    $leadEndRows = @($records | Where-Object { [string]$_.event -eq 'LEAD_END' })
    if ($leadStartRows.Count -gt 0 -and $leadEndRows.Count -gt 0) {
        $leadStart = [DateTime]::Parse([string]$leadStartRows[0].utc).ToUniversalTime()
        $leadEnd = [DateTime]::Parse([string]$leadEndRows[$leadEndRows.Count - 1].utc).ToUniversalTime()
        $leadElapsed = [int64][Math]::Round(($leadEnd - $leadStart).TotalMilliseconds)
    }
    elseif ($leadStartRows.Count -ne $leadEndRows.Count) {
        $warnings += 'Lead trace has unmatched START/END.'
    }

    $firstUtc = if ($records.Count -gt 0) { [string]$records[0].utc } else { $null }
    $lastUtc = if ($records.Count -gt 0) { [string]$records[$records.Count - 1].utc } else { $null }

    $summary = [pscustomobject][ordered]@{
        schemaVersion = 1
        eventCount = $records.Count
        firstUtc = $firstUtc
        lastUtc = $lastUtc
        reviewerDurations = $roleDurations
        leadElapsedMilliseconds = $leadElapsed
        warnings = $warnings
    }
    Write-AITeamJsonFile -Value $summary -Path (Join-Path $RunDir 'trace-summary.json')
    return $summary
}

function Complete-AITeamRun {
    param(
        [Parameter(Mandatory)][string]$RunDir,
        [Parameter(Mandatory)][ValidateSet('PASS','PASS_WITH_GAPS','DEGRADED','FAIL','BLOCKED')][string]$Result,
        [string]$Summary = '',
        [AllowNull()][object]$PhaseMilliseconds = $null,
        [AllowNull()][object]$Extra = $null
    )

    $runPath = Join-Path $RunDir 'run.json'
    $run = Get-Content -LiteralPath $runPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $ended = [DateTime]::UtcNow
    $started = [DateTime]::Parse([string]$run.startedUtc).ToUniversalTime()
    $elapsed = [int64][Math]::Round(($ended - $started).TotalMilliseconds)
    Add-AITeamTrace -RunDir $RunDir -Event 'RUN_END' -Phase 'orchestration' -Status $Result -Detail "elapsedMs=$elapsed" | Out-Null
    $traceSummary = Get-AITeamTraceSummary -RunDir $RunDir

    $final = [ordered]@{
        schemaVersion = 1
        runId = [string]$run.runId
        missionId = [string]$run.missionId
        mission = [string]$run.mission
        mode = [string]$run.mode
        commitSha = [string]$run.commitSha
        repoRoot = [string]$run.repoRoot
        stateRoot = [string]$run.stateRoot
        runDirectory = [string]$run.runDirectory
        teamVersion = [string]$run.teamVersion
        startedUtc = [string]$run.startedUtc
        endedUtc = $ended.ToString('o')
        result = $Result
        elapsedMilliseconds = $elapsed
        summary = $Summary
        phaseMilliseconds = $PhaseMilliseconds
        observabilityWarnings = @($traceSummary.warnings)
        extra = $Extra
    }
    Write-AITeamJsonFile -Value ([pscustomobject]$final) -Path $runPath

    $state = [string]$run.stateRoot
    $indexRecord = [pscustomobject][ordered]@{
        schemaVersion = 1
        runId = [string]$run.runId
        missionId = [string]$run.missionId
        mission = [string]$run.mission
        mode = [string]$run.mode
        commitSha = [string]$run.commitSha
        teamVersion = [string]$run.teamVersion
        result = $Result
        elapsedMilliseconds = $elapsed
        startedUtc = [string]$run.startedUtc
        endedUtc = $ended.ToString('o')
        runDirectory = [string]$run.runDirectory
    }
    $indexLine = $indexRecord | ConvertTo-Json -Compress -Depth 12
    Add-Content -LiteralPath (Join-Path $state 'runs-index.jsonl') -Value $indexLine -Encoding UTF8

    $latest = [pscustomobject][ordered]@{
        schemaVersion = 1
        runId = [string]$run.runId
        missionId = [string]$run.missionId
        mission = [string]$run.mission
        result = $Result
        runDirectory = [string]$run.runDirectory
        startedUtc = [string]$run.startedUtc
        endedUtc = $ended.ToString('o')
        elapsedMilliseconds = $elapsed
        updatedUtc = $ended.ToString('o')
    }
    Write-AITeamJsonFile -Value $latest -Path (Join-Path $state 'latest.json')

    $summaryLines = @(
        "RESULT: $Result",
        "Mission: $($run.missionId) - $($run.mission)",
        "Commit: $($run.commitSha)",
        "Team version: $($run.teamVersion)",
        "Elapsed ms: $elapsed",
        "Evidence: $RunDir",
        "Trace: $(Join-Path $RunDir 'trace.jsonl')",
        "Trace summary: $(Join-Path $RunDir 'trace-summary.json')",
        "Observability warnings: $(@($traceSummary.warnings).Count)"
    )
    if (-not [string]::IsNullOrWhiteSpace($Summary)) {
        $summaryLines += "Summary: $Summary"
    }
    $summaryLines | Set-Content -LiteralPath (Join-Path $RunDir 'summary.txt') -Encoding UTF8

    return [pscustomobject]$final
}

Export-ModuleMember -Function Write-AITeamJsonFile, Get-AITeamStateRoot, Get-AITeamHarnessManifest, Add-AITeamTrace, New-AITeamRun, Get-AITeamPreviousRun, Get-AITeamTraceSummary, Complete-AITeamRun
