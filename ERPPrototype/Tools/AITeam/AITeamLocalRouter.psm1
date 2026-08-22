Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-AITeamMissionRoutingText {
    param([Parameter(Mandatory)]$MissionPacket)
    $parts = New-Object System.Collections.Generic.List[string]
    foreach ($name in @('mission','objective')) {
        $prop = $MissionPacket.PSObject.Properties[$name]
        if ($null -ne $prop -and -not [string]::IsNullOrWhiteSpace([string]$prop.Value)) {
            $parts.Add([string]$prop.Value)
        }
    }
    foreach ($name in @('requiredBehaviors','decisionRefs')) {
        $prop = $MissionPacket.PSObject.Properties[$name]
        if ($null -eq $prop) { continue }
        foreach ($item in @($prop.Value)) {
            if (-not [string]::IsNullOrWhiteSpace([string]$item)) { $parts.Add([string]$item) }
        }
    }
    return ((@($parts) -join ' ') -replace '\s+',' ').Trim()
}

function Test-AITeamLocalRouterRules {
    param([Parameter(Mandatory)][string]$RulesPath)
    $errors = New-Object System.Collections.Generic.List[string]
    if (-not (Test-Path -LiteralPath $RulesPath -PathType Leaf)) {
        $errors.Add("Routing rules file not found: $RulesPath")
        return [pscustomobject][ordered]@{ pass=$false; errors=@($errors) }
    }
    try { $rules = Get-Content -LiteralPath $RulesPath -Raw -Encoding UTF8 | ConvertFrom-Json }
    catch {
        $errors.Add("Routing rules JSON parse failed: $($_.Exception.Message)")
        return [pscustomobject][ordered]@{ pass=$false; errors=@($errors) }
    }
    if ([int]$rules.schemaVersion -ne 1) { $errors.Add('Routing rules schemaVersion must be 1.') }
    if ([int]$rules.minimumScore -le 0) { $errors.Add('minimumScore must be positive.') }
    if ([int]$rules.decisiveScore -lt [int]$rules.minimumScore) { $errors.Add('decisiveScore must be >= minimumScore.') }
    foreach ($pattern in @($rules.trivialNoReviewPatterns)) {
        if ([string]::IsNullOrWhiteSpace([string]$pattern)) { $errors.Add('Trivial no-review rule has an empty regex pattern.'); continue }
        try { [regex]::new([string]$pattern,[System.Text.RegularExpressions.RegexOptions]::IgnoreCase) | Out-Null }
        catch { $errors.Add("Invalid trivial no-review regex '$pattern': $($_.Exception.Message)") }
    }
    $seen = @{}
    foreach ($roleRule in @($rules.roles)) {
        $role = [string]$roleRule.role
        if ([string]::IsNullOrWhiteSpace($role)) { $errors.Add('Role rule has empty role.'); continue }
        if ($seen.ContainsKey($role)) { $errors.Add("Duplicate local routing role: $role") } else { $seen[$role] = $true }
        if (@($roleRule.signals).Count -eq 0) { $errors.Add("Role $role has no signals.") }
        foreach ($signal in @($roleRule.signals)) {
            if ([string]::IsNullOrWhiteSpace([string]$signal.pattern)) { $errors.Add("Role $role has an empty regex pattern."); continue }
            if ([int]$signal.score -le 0) { $errors.Add("Role $role has a non-positive signal score.") }
            try { [regex]::new([string]$signal.pattern,[System.Text.RegularExpressions.RegexOptions]::IgnoreCase) | Out-Null }
            catch { $errors.Add("Role $role has invalid regex '$($signal.pattern)': $($_.Exception.Message)") }
        }
    }
    foreach ($synergy in @($rules.synergies)) {
        if (@($synergy.whenRoles).Count -eq 0) { $errors.Add('Synergy has no whenRoles.') }
        foreach ($sourceRole in @($synergy.whenRoles)) {
            if (-not $seen.ContainsKey([string]$sourceRole)) { $errors.Add("Synergy references unknown source role: $sourceRole") }
        }
        if ([string]::IsNullOrWhiteSpace([string]$synergy.boostRole)) { $errors.Add('Synergy has empty boostRole.') }
        elseif (-not $seen.ContainsKey([string]$synergy.boostRole)) { $errors.Add("Synergy references unknown boost role: $($synergy.boostRole)") }
        if ([int]$synergy.score -le 0) { $errors.Add('Synergy has a non-positive score.') }
    }
    return [pscustomobject][ordered]@{ pass=($errors.Count -eq 0); errors=@($errors) }
}

function Get-AITeamLocalRoute {
    param(
        [Parameter(Mandatory)]$MissionPacket,
        [Parameter(Mandatory)]$Config,
        [Parameter(Mandatory)][string]$RulesPath
    )

    $rulesCheck = Test-AITeamLocalRouterRules -RulesPath $RulesPath
    if (-not $rulesCheck.pass) { throw "Local routing rules are invalid: $(@($rulesCheck.errors) -join ' | ')" }
    $rules = Get-Content -LiteralPath $RulesPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $missionId = [string]$MissionPacket.missionId
    $mode = [string]$MissionPacket.mode

    if ($mode -eq 'product') {
        $plan = [pscustomobject][ordered]@{
            schemaVersion = 1
            missionId = $missionId
            selectedRoles = @('product-erp-partner')
            excludedRoles = @()
            reasoningSummary = 'Local rule: product-mode missions route directly to Product & ERP Partner.'
        }
        return [pscustomobject][ordered]@{
            routingPlan=$plan; source='local-rules'; confidence='high'; needsAiFallback=$false; trivial=$false;
            selectedScores=[pscustomobject]@{ 'product-erp-partner'=1000 }; matchedSignals=@('mode=product')
        }
    }

    $text = Get-AITeamMissionRoutingText -MissionPacket $MissionPacket
    foreach ($pattern in @($rules.trivialNoReviewPatterns)) {
        if ($text -match [string]$pattern) {
            $engineering = @($Config.roles.PSObject.Properties | Where-Object { [string]$_.Value.class -eq 'engineering' } | ForEach-Object { [string]$_.Name })
            $plan = [pscustomobject][ordered]@{
                schemaVersion = 1
                missionId = $missionId
                selectedRoles = @()
                excludedRoles = $engineering
                reasoningSummary = 'Local rule: explicitly cosmetic/non-functional request with no behavior or layout change; no specialist model review is required.'
            }
            return [pscustomobject][ordered]@{
                routingPlan=$plan; source='local-rules'; confidence='high'; needsAiFallback=$false; trivial=$true;
                selectedScores=[pscustomobject]@{}; matchedSignals=@("trivial:$pattern")
            }
        }
    }

    $scores = @{}
    $priorities = @{}
    $reasons = @{}
    $matched = New-Object System.Collections.Generic.List[string]
    foreach ($roleProp in @($Config.roles.PSObject.Properties)) {
        if ([string]$roleProp.Value.class -ne 'engineering') { continue }
        $role = [string]$roleProp.Name
        $scores[$role] = 0
        $priorities[$role] = 999
        $reasons[$role] = New-Object System.Collections.Generic.List[string]
    }

    foreach ($roleRule in @($rules.roles)) {
        $role = [string]$roleRule.role
        if (-not $scores.ContainsKey($role)) { continue }
        $priorities[$role] = [int]$roleRule.tiePriority
        foreach ($signal in @($roleRule.signals)) {
            if ($text -match [string]$signal.pattern) {
                $scores[$role] = [int]$scores[$role] + [int]$signal.score
                $reason = [string]$signal.reason
                $reasons[$role].Add($reason)
                $matched.Add("${role}:$reason")
            }
        }
    }

    foreach ($synergy in @($rules.synergies)) {
        $active = $true
        foreach ($r in @($synergy.whenRoles)) {
            if (-not $scores.ContainsKey([string]$r) -or [int]$scores[[string]$r] -le 0) { $active = $false; break }
        }
        if (-not $active) { continue }
        $target = [string]$synergy.boostRole
        if (-not $scores.ContainsKey($target)) { continue }
        $scores[$target] = [int]$scores[$target] + [int]$synergy.score
        $reason = [string]$synergy.reason
        $reasons[$target].Add($reason)
        $matched.Add("${target}:$reason")
    }

    $minimum = [int]$rules.minimumScore
    $candidates = @()
    foreach ($role in @($scores.Keys)) {
        if ([int]$scores[$role] -ge $minimum) {
            $candidates += [pscustomobject][ordered]@{ role=$role; score=[int]$scores[$role]; tiePriority=[int]$priorities[$role] }
        }
    }
    $candidates = @($candidates | Sort-Object @{Expression='score';Descending=$true}, @{Expression='tiePriority';Descending=$false}, @{Expression='role';Descending=$false})
    $max = [int]$Config.maxConcurrentReviewers
    $selectedRows = @($candidates | Select-Object -First $max)
    $selected = @($selectedRows | ForEach-Object { [string]$_.role })

    $needsFallback = $false
    $fallbackReasons = New-Object System.Collections.Generic.List[string]
    if ($selected.Count -eq 0) {
        $needsFallback = $true
        $fallbackReasons.Add('No local role reached the minimum evidence score.')
    }
    elseif ($selected.Count -eq 1 -and [int]$selectedRows[0].score -lt [int]$rules.decisiveScore) {
        $needsFallback = $true
        $fallbackReasons.Add('Only one weak local signal was found.')
    }
    if ($candidates.Count -gt $max -and $max -gt 0) {
        $lastSelected = [int]$candidates[$max-1].score
        $firstExcluded = [int]$candidates[$max].score
        if (($lastSelected - $firstExcluded) -le [int]$rules.ambiguityMargin) {
            $needsFallback = $true
            $fallbackReasons.Add("Cutoff ambiguity: score gap $($lastSelected-$firstExcluded) <= $([int]$rules.ambiguityMargin).")
        }
    }

    $engineering = @($Config.roles.PSObject.Properties | Where-Object { [string]$_.Value.class -eq 'engineering' } | ForEach-Object { [string]$_.Name })
    $excluded = @($engineering | Where-Object { $selected -notcontains $_ })
    $summaryParts = New-Object System.Collections.Generic.List[string]
    foreach ($row in $selectedRows) {
        $role = [string]$row.role
        $why = @($reasons[$role] | Select-Object -First 2) -join '; '
        $summaryParts.Add("$role=$($row.score) [$why]")
    }
    if ($needsFallback) { $summaryParts.Add('AI fallback recommended: ' + (@($fallbackReasons) -join '; ')) }
    else { $summaryParts.Add('Local route is decisive; no AI router call required.') }

    $scoreObject = [ordered]@{}
    foreach ($row in $candidates) { $scoreObject[[string]$row.role] = [int]$row.score }
    $confidence = if ($needsFallback) { 'low' } elseif ($selectedRows.Count -gt 0 -and [int]$selectedRows[0].score -ge [int]$rules.decisiveScore) { 'high' } else { 'medium' }
    $plan = [pscustomobject][ordered]@{
        schemaVersion = 1
        missionId = $missionId
        selectedRoles = $selected
        excludedRoles = $excluded
        reasoningSummary = (@($summaryParts) -join ' | ')
    }
    return [pscustomobject][ordered]@{
        routingPlan=$plan
        source='local-rules'
        confidence=$confidence
        needsAiFallback=[bool]$needsFallback
        trivial=$false
        selectedScores=[pscustomobject]$scoreObject
        matchedSignals=@($matched)
        fallbackReasons=@($fallbackReasons)
    }
}

Export-ModuleMember -Function Test-AITeamLocalRouterRules,Get-AITeamLocalRoute
