Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-AITeamCodexCommand {
    $cmd = Get-Command codex -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $cmd) { return $null }
    if ($cmd.Path) { return [string]$cmd.Path }
    return [string]$cmd.Source
}

function Get-AITeamCodexLoginStatus {
    $codex = Get-AITeamCodexCommand
    if (-not $codex) {
        return [pscustomobject][ordered]@{ installed=$false; loggedIn=$false; command=$null; detail='Codex CLI is not installed or not on PATH.' }
    }
    $text = & $codex login status 2>&1
    $code = $LASTEXITCODE
    $joined = ([string]($text -join "`n")).Trim()
    $logged = ($code -eq 0 -and $joined -match '(?i)logged in|chatgpt')
    return [pscustomobject][ordered]@{ installed=$true; loggedIn=$logged; command=$codex; detail=$joined; exitCode=$code }
}

function Get-AITeamCodexUsageFromEvents {
    param([Parameter(Mandatory)][string]$EventsPath)

    $totals = [ordered]@{
        inputTokens = [int64]0
        cachedInputTokens = [int64]0
        outputTokens = [int64]0
        reasoningTokens = [int64]0
        turnCompletedCount = 0
    }
    if (-not (Test-Path -LiteralPath $EventsPath -PathType Leaf)) {
        return [pscustomobject]$totals
    }

    foreach ($line in @(Get-Content -LiteralPath $EventsPath -Encoding UTF8 -ErrorAction SilentlyContinue)) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        try { $event = $line | ConvertFrom-Json }
        catch { continue }
        if ([string]$event.type -ne 'turn.completed') { continue }
        $totals.turnCompletedCount++
        if ($null -eq $event.usage) { continue }
        $u = $event.usage
        foreach ($pair in @(
            @('inputTokens','input_tokens'),
            @('cachedInputTokens','cached_input_tokens'),
            @('outputTokens','output_tokens'),
            @('reasoningTokens','reasoning_tokens')
        )) {
            $target = $pair[0]
            $source = $pair[1]
            if ($null -ne $u.PSObject.Properties[$source] -and $null -ne $u.$source) {
                try { $totals[$target] = [int64]$totals[$target] + [int64]$u.$source } catch { }
            }
        }
    }
    return [pscustomobject]$totals
}

function Invoke-AITeamCodexExec {
    param(
        [Parameter(Mandatory)][string]$RepoRoot,
        [Parameter(Mandatory)][string]$PromptPath,
        [Parameter(Mandatory)][string]$SchemaPath,
        [Parameter(Mandatory)][string]$OutputPath,
        [Parameter(Mandatory)][string]$EventsPath,
        [Parameter(Mandatory)][string]$StderrPath,
        [ValidateSet('low','medium','high')][string]$ReasoningEffort = 'medium',
        [string]$Model = '',
        [bool]$WebAllowed = $false
    )

    $codex = Get-AITeamCodexCommand
    if (-not $codex) { throw 'Codex CLI is required for this model mission. Run: erp-ai-team setup-codex' }
    if (-not (Test-Path -LiteralPath $PromptPath -PathType Leaf)) { throw "Prompt file not found: $PromptPath" }
    if (-not (Test-Path -LiteralPath $SchemaPath -PathType Leaf)) { throw "Schema file not found: $SchemaPath" }

    $prompt = Get-Content -LiteralPath $PromptPath -Raw -Encoding UTF8
    $args = @(
        'exec',
        '--json',
        '--sandbox','read-only',
        '--ephemeral',
        '--ignore-user-config',
        '-C',$RepoRoot,
        '--output-schema',$SchemaPath,
        '--output-last-message',$OutputPath,
        '-c',('model_reasoning_effort="{0}"' -f $ReasoningEffort)
    )
    if (-not [string]::IsNullOrWhiteSpace($Model)) {
        $args += @('-m',$Model)
    }
    if (-not $WebAllowed) {
        $args += @('-c','web_search="disabled"')
    }
    $args += '-'

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $prompt | & $codex @args 1> $EventsPath 2> $StderrPath
    $code = $LASTEXITCODE
    $sw.Stop()
    $usage = Get-AITeamCodexUsageFromEvents -EventsPath $EventsPath

    return [pscustomobject][ordered]@{
        exitCode = $code
        elapsedMilliseconds = [int64]$sw.ElapsedMilliseconds
        outputPath = $OutputPath
        eventsPath = $EventsPath
        stderrPath = $StderrPath
        usage = $usage
    }
}

Export-ModuleMember -Function Get-AITeamCodexCommand, Get-AITeamCodexLoginStatus, Get-AITeamCodexUsageFromEvents, Invoke-AITeamCodexExec
