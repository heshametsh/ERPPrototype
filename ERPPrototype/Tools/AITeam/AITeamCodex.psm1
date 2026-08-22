Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-AITeamCodexKnownPaths {
    $paths = New-Object System.Collections.Generic.List[string]

    if (-not [string]::IsNullOrWhiteSpace($env:CODEX_INSTALL_DIR)) {
        $paths.Add((Join-Path $env:CODEX_INSTALL_DIR 'codex.exe'))
    }

    if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
        $paths.Add((Join-Path $env:LOCALAPPDATA 'Programs\OpenAI\Codex\bin\codex.exe'))
    }

    $codexHome = $null
    if (-not [string]::IsNullOrWhiteSpace($env:CODEX_HOME)) {
        $codexHome = $env:CODEX_HOME
    }
    elseif (-not [string]::IsNullOrWhiteSpace($env:USERPROFILE)) {
        $codexHome = Join-Path $env:USERPROFILE '.codex'
    }

    if (-not [string]::IsNullOrWhiteSpace($codexHome)) {
        $paths.Add((Join-Path $codexHome 'packages\standalone\current\bin\codex.exe'))
        $paths.Add((Join-Path $codexHome 'packages\standalone\current\codex.exe'))
    }

    return @($paths | Select-Object -Unique)
}

function Get-AITeamCodexCommand {
    $cmd = Get-Command codex -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $cmd) {
        if ($cmd.Path) { return [string]$cmd.Path }
        if ($cmd.Source) { return [string]$cmd.Source }
    }

    # The official Windows installer persists PATH for future shells, but the
    # current parent shell can still have a stale PATH. Resolve the official
    # standalone locations directly so setup/doctor work immediately.
    foreach ($candidate in @(Get-AITeamCodexKnownPaths)) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return [System.IO.Path]::GetFullPath($candidate)
        }
    }

    return $null
}


function Invoke-AITeamNativeCapture {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [string[]]$Arguments = @()
    )

    # Windows PowerShell 5.1 can wrap native STDERR as NativeCommandError.
    # With the harness-wide ErrorActionPreference=Stop, perfectly successful
    # native commands such as `codex login status` can otherwise terminate the
    # caller merely because Codex writes its status text to STDERR.
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $items = @(& $FilePath @Arguments 2>&1)
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }

    $lines = New-Object System.Collections.Generic.List[string]
    foreach ($item in @($items)) {
        if ($item -is [System.Management.Automation.ErrorRecord]) {
            if ($null -ne $item.Exception -and -not [string]::IsNullOrWhiteSpace([string]$item.Exception.Message)) {
                $lines.Add([string]$item.Exception.Message)
            }
            else {
                $lines.Add([string]$item)
            }
        }
        else {
            $lines.Add([string]$item)
        }
    }

    $text = ([string](@($lines) -join "`n")).Trim()
    return [pscustomobject][ordered]@{
        exitCode = [int]$exitCode
        lines = @($lines)
        text = $text
    }
}

function Get-AITeamCodexLoginStatus {
    $codex = Get-AITeamCodexCommand
    if (-not $codex) {
        return [pscustomobject][ordered]@{ installed=$false; loggedIn=$false; command=$null; detail='Codex CLI is not installed or discoverable.' }
    }
    $status = Invoke-AITeamNativeCapture -FilePath $codex -Arguments @('login','status')
    $logged = ($status.exitCode -eq 0 -and $status.text -match '(?i)logged in|chatgpt')
    return [pscustomobject][ordered]@{ installed=$true; loggedIn=$logged; command=$codex; detail=$status.text; exitCode=$status.exitCode }
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


function Test-AITeamCodexOutputSchemaNode {
    param(
        [Parameter(Mandatory)]$Node,
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][AllowEmptyCollection()][System.Collections.Generic.List[string]]$Errors,
        [bool]$IsRoot = $false
    )

    if ($null -eq $Node) {
        $Errors.Add("$Path is null.")
        return
    }

    $properties = $Node.PSObject.Properties
    if ($null -ne $properties['$ref']) {
        # References are supported. The referenced definition is validated separately.
        return
    }

    foreach ($keyword in @('oneOf','allOf','not','dependentRequired','dependentSchemas','if','then','else','uniqueItems','patternProperties')) {
        if ($null -ne $properties[$keyword]) {
            $Errors.Add("$Path uses unsupported Structured Outputs keyword '$keyword'.")
        }
    }

    $types = @()
    if ($null -ne $properties['type']) {
        $types = @($Node.type | ForEach-Object { [string]$_ })
        foreach ($t in $types) {
            if (@('string','number','boolean','integer','object','array','null') -notcontains $t) {
                $Errors.Add("$Path has unsupported type '$t'.")
            }
        }
    }

    if ($null -ne $properties['const'] -and $types.Count -eq 0) {
        $Errors.Add("$Path uses const without an explicit type.")
    }
    if ($null -ne $properties['enum'] -and $types.Count -eq 0) {
        $Errors.Add("$Path uses enum without an explicit type.")
    }

    if ($null -ne $properties['format']) {
        $format = [string]$Node.format
        if (@('date-time','time','date','duration','email','hostname','ipv4','ipv6','uuid') -notcontains $format) {
            $Errors.Add("$Path uses unsupported Structured Outputs format '$format'.")
        }
    }

    if ($IsRoot) {
        if ($types.Count -ne 1 -or $types[0] -ne 'object') {
            $Errors.Add('Root Structured Outputs schema must have type object.')
        }
        if ($null -ne $properties['anyOf']) {
            $Errors.Add('Root Structured Outputs schema must not use anyOf.')
        }
    }

    $isObject = ($types -contains 'object') -or ($null -ne $properties['properties'])
    if ($isObject) {
        if ($null -eq $properties['additionalProperties'] -or [bool]$Node.additionalProperties -ne $false) {
            $Errors.Add("$Path object must set additionalProperties=false.")
        }
        if ($null -eq $properties['properties']) {
            $Errors.Add("$Path object must declare properties.")
        }
        else {
            $propertyNames = @($Node.properties.PSObject.Properties | ForEach-Object { [string]$_.Name })
            $requiredNames = @()
            if ($null -ne $properties['required']) {
                $requiredNames = @($Node.required | ForEach-Object { [string]$_ })
            }
            foreach ($name in $propertyNames) {
                if ($requiredNames -notcontains $name) {
                    $Errors.Add("$Path property '$name' is not listed in required.")
                }
                $child = $Node.properties.PSObject.Properties[$name].Value
                Test-AITeamCodexOutputSchemaNode -Node $child -Path "$Path.properties.$name" -Errors $Errors
            }
            foreach ($name in $requiredNames) {
                if ($propertyNames -notcontains $name) {
                    $Errors.Add("$Path required entry '$name' has no matching property.")
                }
            }
        }
    }

    if ($null -ne $properties['items']) {
        Test-AITeamCodexOutputSchemaNode -Node $Node.items -Path "$Path.items" -Errors $Errors
    }
    if ($null -ne $properties['anyOf']) {
        $i = 0
        foreach ($child in @($Node.anyOf)) {
            Test-AITeamCodexOutputSchemaNode -Node $child -Path "$Path.anyOf[$i]" -Errors $Errors
            $i++
        }
    }
    if ($null -ne $properties['$defs']) {
        foreach ($definition in @($Node.'$defs'.PSObject.Properties)) {
            Test-AITeamCodexOutputSchemaNode -Node $definition.Value -Path "$Path.`$defs.$($definition.Name)" -Errors $Errors
        }
    }
}

function Test-AITeamCodexOutputSchema {
    param([Parameter(Mandatory)][string]$SchemaPath)

    $errors = New-Object System.Collections.Generic.List[string]
    if (-not (Test-Path -LiteralPath $SchemaPath -PathType Leaf)) {
        $errors.Add("Schema file not found: $SchemaPath")
        return [pscustomobject][ordered]@{ pass=$false; schemaPath=$SchemaPath; errors=@($errors) }
    }

    try {
        $schema = Get-Content -LiteralPath $SchemaPath -Raw -Encoding UTF8 | ConvertFrom-Json
    }
    catch {
        $errors.Add("Schema JSON parse failed: $($_.Exception.Message)")
        return [pscustomobject][ordered]@{ pass=$false; schemaPath=$SchemaPath; errors=@($errors) }
    }

    Test-AITeamCodexOutputSchemaNode -Node $schema -Path '$' -Errors $errors -IsRoot $true
    return [pscustomobject][ordered]@{
        pass = ($errors.Count -eq 0)
        schemaPath = [System.IO.Path]::GetFullPath($SchemaPath)
        errors = @($errors)
    }
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

    if (-not (Test-Path -LiteralPath $PromptPath -PathType Leaf)) { throw "Prompt file not found: $PromptPath" }
    if (-not (Test-Path -LiteralPath $SchemaPath -PathType Leaf)) { throw "Schema file not found: $SchemaPath" }

    # Reject known-incompatible Structured Outputs schemas locally before Codex is
    # launched. This is deliberately deterministic so schema mistakes consume no
    # model allowance and leave a precise evidence trail.
    $schemaPreflight = Test-AITeamCodexOutputSchema -SchemaPath $SchemaPath
    if (-not $schemaPreflight.pass) {
        $message = 'CODEX_SCHEMA_PREFLIGHT_BLOCKED: ' + (@($schemaPreflight.errors) -join ' | ')
        $message | Set-Content -LiteralPath $StderrPath -Encoding UTF8
        return [pscustomobject][ordered]@{
            exitCode = 65
            elapsedMilliseconds = [int64]0
            outputPath = $OutputPath
            eventsPath = $EventsPath
            stderrPath = $StderrPath
            schemaPreflightPass = $false
            schemaPreflightErrors = @($schemaPreflight.errors)
            modelAttempted = $false
            usage = [pscustomobject][ordered]@{
                inputTokens=[int64]0; cachedInputTokens=[int64]0; outputTokens=[int64]0; reasoningTokens=[int64]0;
                turnCompletedCount=0; modelAttempted=$false; completedModelCalls=0; apiRejectedBeforeGeneration=0
            }
        }
    }

    $codex = Get-AITeamCodexCommand
    if (-not $codex) { throw 'Codex CLI is required for this model mission. Run: erp-ai-team setup-codex' }

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
    $previousPreference = $ErrorActionPreference
    try {
        # Codex may legitimately emit diagnostics/status text to STDERR even
        # when the process succeeds. Do not let Windows PowerShell 5.1 convert
        # that stream into a terminating NativeCommandError.
        $ErrorActionPreference = 'Continue'
        $prompt | & $codex @args 1> $EventsPath 2> $StderrPath
        $code = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousPreference
        $sw.Stop()
    }
    $usage = Get-AITeamCodexUsageFromEvents -EventsPath $EventsPath
    $completedCalls = [int]$usage.turnCompletedCount
    $apiRejected = 0
    if ($code -ne 0 -and $completedCalls -eq 0) { $apiRejected = 1 }
    $usage | Add-Member -NotePropertyName modelAttempted -NotePropertyValue $true -Force
    $usage | Add-Member -NotePropertyName completedModelCalls -NotePropertyValue $completedCalls -Force
    $usage | Add-Member -NotePropertyName apiRejectedBeforeGeneration -NotePropertyValue $apiRejected -Force

    return [pscustomobject][ordered]@{
        exitCode = $code
        elapsedMilliseconds = [int64]$sw.ElapsedMilliseconds
        outputPath = $OutputPath
        eventsPath = $EventsPath
        stderrPath = $StderrPath
        schemaPreflightPass = $true
        schemaPreflightErrors = @()
        modelAttempted = $true
        usage = $usage
    }
}

Export-ModuleMember -Function Get-AITeamCodexKnownPaths, Get-AITeamCodexCommand, Invoke-AITeamNativeCapture, Get-AITeamCodexLoginStatus, Get-AITeamCodexUsageFromEvents, Test-AITeamCodexOutputSchema, Invoke-AITeamCodexExec
