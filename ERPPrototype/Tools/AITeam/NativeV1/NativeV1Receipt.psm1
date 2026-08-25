Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:NativeV1ReceiptVersion = '1.2'
$script:NativeV1ReviewProtocolVersion = 'candidate-receipt-v1'
$script:NativeV1OfficialReviewProtocolVersion = 'native-reviewer-v1'
$script:NativeV1OfficialReviewerTransport = 'NATIVE_SUBAGENT'

function Get-NativeV1DataRoot {
    param([string]$DataRoot)
    if (-not [string]::IsNullOrWhiteSpace($DataRoot)) {
        return [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($DataRoot))
    }
    if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
        return (Join-Path $env:LOCALAPPDATA 'ERPPrototype\NativeV1')
    }
    return (Join-Path $env:TEMP 'ERPPrototype-NativeV1')
}

function Get-NativeV1Property {
    param(
        [AllowNull()]$InputObject,
        [Parameter(Mandatory)][string]$Name,
        $Default = $null
    )
    if ($null -eq $InputObject) { return $Default }
    if ($InputObject -is [System.Collections.IDictionary]) {
        if ($InputObject.Contains($Name)) { return $InputObject[$Name] }
        return $Default
    }
    $property = $InputObject.PSObject.Properties[$Name]
    if ($null -eq $property) { return $Default }
    return $property.Value
}

function Test-NativeV1Property {
    param([AllowNull()]$InputObject, [Parameter(Mandatory)][string]$Name)
    if ($null -eq $InputObject) { return $false }
    if ($InputObject -is [System.Collections.IDictionary]) { return $InputObject.Contains($Name) }
    return ($null -ne $InputObject.PSObject.Properties[$Name])
}

function Get-NativeV1UtcTimestamp {
    return [DateTime]::UtcNow.ToString('o', [Globalization.CultureInfo]::InvariantCulture)
}

function ConvertTo-NativeV1UtcTimestamp {
    param([AllowNull()]$Value)
    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) { return $null }
    return ([DateTimeOffset]::Parse([string]$Value, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind)).ToUniversalTime().ToString('o', [Globalization.CultureInfo]::InvariantCulture)
}

function Set-NativeV1Property {
    param([Parameter(Mandatory)]$InputObject, [Parameter(Mandatory)][string]$Name, $Value)
    if ($InputObject -is [System.Collections.IDictionary]) {
        $InputObject[$Name] = $Value
        return
    }
    if ($null -ne $InputObject.PSObject.Properties[$Name]) {
        $InputObject.$Name = $Value
        return
    }
    Add-Member -InputObject $InputObject -MemberType NoteProperty -Name $Name -Value $Value
}

function Get-NativeV1Sha256Text {
    param([Parameter(Mandatory)][AllowEmptyString()][string]$Text)
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text)))).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $sha.Dispose()
    }
}

function Invoke-NativeV1Git {
    param([Parameter(Mandatory)][string]$RepoRoot, [Parameter(Mandatory)][string[]]$Arguments)
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = @(& git -C $RepoRoot @Arguments 2>&1)
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($exitCode -ne 0) {
        throw "git $($Arguments -join ' ') failed: $($output -join [Environment]::NewLine)"
    }
    return ([string]($output -join "`n")).TrimEnd()
}

function Get-NativeV1GitVisibleStateFingerprint {
    param([Parameter(Mandatory)][string]$RepoRoot)
    $root = Invoke-NativeV1Git -RepoRoot $RepoRoot -Arguments @('rev-parse', '--show-toplevel')
    $headSha = Invoke-NativeV1Git -RepoRoot $root -Arguments @('rev-parse', 'HEAD')
    $visibleStatus = Invoke-NativeV1Git -RepoRoot $root -Arguments @('status', '--porcelain=v1', '--untracked-files=all')
    $payload = [ordered]@{
        headSha = $headSha
        visibleStatus = $visibleStatus
    } | ConvertTo-Json -Compress
    return [pscustomobject][ordered]@{
        repoRoot = [IO.Path]::GetFullPath($root)
        headSha = $headSha
        visibleStatus = $visibleStatus
        fingerprint = Get-NativeV1Sha256Text -Text $payload
    }
}

function New-NativeV1Review {
    param([AllowNull()]$Review)
    $findingIds = Get-NativeV1Property -InputObject $Review -Name 'findingIds'
    return [ordered]@{
        reviewId = Get-NativeV1Property -InputObject $Review -Name 'reviewId'
        protocolVersion = Get-NativeV1Property -InputObject $Review -Name 'protocolVersion' -Default $script:NativeV1ReviewProtocolVersion
        reviewerTransport = Get-NativeV1Property -InputObject $Review -Name 'reviewerTransport'
        requestedReviewerModel = Get-NativeV1Property -InputObject $Review -Name 'requestedReviewerModel'
        actualReviewerModel = Get-NativeV1Property -InputObject $Review -Name 'actualReviewerModel'
        reviewerResult = Get-NativeV1Property -InputObject $Review -Name 'reviewerResult'
        findingCount = Get-NativeV1Property -InputObject $Review -Name 'findingCount'
        findingIds = if ($null -eq $findingIds) { $null } else { @($findingIds) }
        tokens = Get-NativeV1Property -InputObject $Review -Name 'tokens'
        cachedTokens = Get-NativeV1Property -InputObject $Review -Name 'cachedTokens'
        toolCalls = Get-NativeV1Property -InputObject $Review -Name 'toolCalls'
        time = Get-NativeV1Property -InputObject $Review -Name 'time'
        'reviewerThread/session' = Get-NativeV1Property -InputObject $Review -Name 'reviewerThread/session'
    }
}

function New-NativeV1DecisionTraceEntry {
    param(
        [Parameter(Mandatory)][string]$Phase,
        [Parameter(Mandatory)][string]$Observed,
        [Parameter(Mandatory)][string]$Decision,
        [Parameter(Mandatory)][string]$Reason,
        [Parameter(Mandatory)][string]$Action,
        [Parameter(Mandatory)][string]$Result,
        [AllowNull()][string]$Timestamp = $null
    )
    return [ordered]@{
        timestamp = if ([string]::IsNullOrWhiteSpace($Timestamp)) { Get-NativeV1UtcTimestamp } else { ConvertTo-NativeV1UtcTimestamp $Timestamp }
        phase = $Phase
        observed = $Observed
        decision = $Decision
        reason = $Reason
        action = $Action
        result = $Result
    }
}

function New-NativeV1Participant {
    param([AllowNull()]$Participant)
    $role = [string](Get-NativeV1Property -InputObject $Participant -Name 'role')
    if ($role -notin @('MAIN', 'REVIEWER', 'SPECIALIST')) {
        throw 'Participant role must be MAIN, REVIEWER, or SPECIALIST.'
    }

    return [ordered]@{
        role = $role
        purpose = Get-NativeV1Property -InputObject $Participant -Name 'purpose'
        requestedModel = Get-NativeV1Property -InputObject $Participant -Name 'requestedModel'
        actualModel = Get-NativeV1Property -InputObject $Participant -Name 'actualModel'
        sessionOrThread = Get-NativeV1Property -InputObject $Participant -Name 'sessionOrThread'
        tokens = Get-NativeV1Property -InputObject $Participant -Name 'tokens'
        cachedTokens = Get-NativeV1Property -InputObject $Participant -Name 'cachedTokens'
        toolCalls = Get-NativeV1Property -InputObject $Participant -Name 'toolCalls'
        elapsedTime = Get-NativeV1Property -InputObject $Participant -Name 'elapsedTime'
    }
}

function New-NativeV1MissionReceipt {
    param(
        [Parameter(Mandatory)][string]$MissionId,
        [Parameter(Mandatory)][string]$Mission,
        [Parameter(Mandatory)][string]$MissionType,
        [Parameter(Mandatory)][string]$BaseSha,
        [Parameter(Mandatory)][string]$FinalSha,
        [Parameter(Mandatory)][string]$Risk,
        [Parameter(Mandatory)][string]$MainDecision,
        [Parameter(Mandatory)][string]$Result,
        [AllowNull()][string]$CandidateSha = $null,
        [AllowNull()][string]$ChangeType = $null,
        [AllowNull()][object[]]$Participants = @(),
        [AllowNull()][object[]]$Reviews = @(),
        [AllowNull()][object[]]$DecisionTrace = @(),
        [bool]$ReviewRequired = $false,
        [bool]$ManualAcceptanceRequired = $false,
        [AllowNull()][object]$PushRequired = $null,
        [ValidateSet('PRODUCT_DEFECT','TEST_HARNESS_DEFECT','ENVIRONMENT_FAILURE','REVIEWER_FAILURE','PROCESS_LIFECYCLE_FAILURE','EXPECTED_USER_ACCEPTANCE_WAIT')]
        [AllowNull()][string]$FailureClass = $null,
        [AllowNull()][string]$FailureContext = $null,
        [AllowNull()][string]$StartedAt = $null,
        [AllowNull()][string]$CompletedAt = $null,
        [AllowNull()][object]$DurationSeconds = $null,
        [string]$ReceiptId = ([Guid]::NewGuid().ToString())
    )
    if ($ReceiptId -notmatch '^[A-Za-z0-9._-]+$') { throw 'ReceiptId contains unsupported path characters.' }
    if ([string]::IsNullOrWhiteSpace($MissionId)) { throw 'MissionId is required.' }

    $normalizedParticipants = @()
    foreach ($participant in @($Participants)) {
        $normalizedParticipants += ,(New-NativeV1Participant -Participant $participant)
    }

    $normalizedReviews = @()
    foreach ($review in @($Reviews)) {
        $normalizedReviews += ,(New-NativeV1Review -Review $review)
    }

    $normalizedDecisionTrace = @()
    foreach ($entry in @($DecisionTrace)) {
        $normalizedDecisionTrace += ,(New-NativeV1DecisionTraceEntry `
            -Phase ([string](Get-NativeV1Property -InputObject $entry -Name 'phase')) `
            -Observed ([string](Get-NativeV1Property -InputObject $entry -Name 'observed')) `
            -Decision ([string](Get-NativeV1Property -InputObject $entry -Name 'decision')) `
            -Reason ([string](Get-NativeV1Property -InputObject $entry -Name 'reason')) `
            -Action ([string](Get-NativeV1Property -InputObject $entry -Name 'action')) `
            -Result ([string](Get-NativeV1Property -InputObject $entry -Name 'result')) `
            -Timestamp (Get-NativeV1Property -InputObject $entry -Name 'timestamp'))
    }

    $normalizedCandidateSha = if ([string]::IsNullOrWhiteSpace($CandidateSha)) { $null } else { $CandidateSha }
    $normalizedChangeType = if ([string]::IsNullOrWhiteSpace($ChangeType)) { $null } else { $ChangeType }
    $normalizedStartedAt = if ([string]::IsNullOrWhiteSpace($StartedAt)) { Get-NativeV1UtcTimestamp } else { ConvertTo-NativeV1UtcTimestamp $StartedAt }
    $normalizedCompletedAt = if ([string]::IsNullOrWhiteSpace($CompletedAt)) { $null } else { ConvertTo-NativeV1UtcTimestamp $CompletedAt }
    $normalizedDurationSeconds = if ($null -eq $DurationSeconds) { $null } else { [double]$DurationSeconds }
    $normalizedPushRequired = if ($null -eq $PushRequired) { $null -ne $normalizedCandidateSha } else { [bool]$PushRequired }
    $normalizedFailureClass = if ([string]::IsNullOrWhiteSpace($FailureClass)) { $null } else { $FailureClass }
    $normalizedFailureContext = if ([string]::IsNullOrWhiteSpace($FailureContext)) { $null } else { $FailureContext }
    $initialLifecycleState = if ($ManualAcceptanceRequired) {
        'MANUAL_ACCEPTANCE_PENDING'
    }
    elseif ($normalizedPushRequired) {
        'PUSH_PENDING'
    }
    else {
        'COMPLETION_PENDING'
    }

    return [ordered]@{
        receiptVersion = $script:NativeV1ReceiptVersion
        receiptId = $ReceiptId
        missionId = $MissionId
        mission = $Mission
        missionType = $MissionType
        baseSha = $BaseSha
        finalSha = $FinalSha
        candidateSha = $normalizedCandidateSha
        changeType = $normalizedChangeType
        risk = $Risk
        mainDecision = $MainDecision
        result = $Result
        participants = @($normalizedParticipants)
        reviews = @($normalizedReviews)
        decisionTrace = @($normalizedDecisionTrace)
        reviewRequired = $ReviewRequired
        manualAcceptanceRequired = $ManualAcceptanceRequired
        pushRequired = $normalizedPushRequired
        userAcceptedAt = $null
        pushCompletedAt = $null
        pushedSha = $null
        lifecycleState = $initialLifecycleState
        startedAt = $normalizedStartedAt
        completedAt = $normalizedCompletedAt
        durationSeconds = $normalizedDurationSeconds
        failureClass = $normalizedFailureClass
        failureContext = $normalizedFailureContext
    }
}

function New-NativeV1CandidateReceipt {
    param(
        [Parameter(Mandatory)][string]$Mission,
        [Parameter(Mandatory)][string]$BaseSha,
        [Parameter(Mandatory)][string]$CandidateSha,
        [Parameter(Mandatory)][string]$ChangeType,
        [Parameter(Mandatory)][string]$Risk,
        [Parameter(Mandatory)][string]$MainDecision,
        [AllowNull()][object[]]$Reviews = @(),
        [AllowNull()][object[]]$Participants = @(),
        [bool]$ReviewRequired = $false,
        [bool]$ManualAcceptanceRequired = $false,
        [string]$MissionId = '',
        [string]$Result = 'CANDIDATE_CREATED',
        [string]$ReceiptId = ([Guid]::NewGuid().ToString())
    )
    if ([string]::IsNullOrWhiteSpace($MissionId)) { $MissionId = $ReceiptId }
    return New-NativeV1MissionReceipt `
        -MissionId $MissionId `
        -Mission $Mission `
        -MissionType 'IMPLEMENTATION' `
        -BaseSha $BaseSha `
        -FinalSha $CandidateSha `
        -Risk $Risk `
        -MainDecision $MainDecision `
        -Result $Result `
        -CandidateSha $CandidateSha `
        -ChangeType $ChangeType `
        -Participants $Participants `
        -Reviews $Reviews `
        -ReviewRequired:$ReviewRequired `
        -ManualAcceptanceRequired:$ManualAcceptanceRequired `
        -PushRequired:$true `
        -ReceiptId $ReceiptId
}

function Get-NativeV1ReceiptPath {
    param([Parameter(Mandatory)][string]$ReceiptId, [string]$DataRoot)
    if ($ReceiptId -notmatch '^[A-Za-z0-9._-]+$') { throw 'ReceiptId contains unsupported path characters.' }
    return (Join-Path (Join-Path (Get-NativeV1DataRoot $DataRoot) 'receipts') ($ReceiptId + '.json'))
}

function Write-NativeV1JsonAtomic {
    param([Parameter(Mandatory)]$Value, [Parameter(Mandatory)][string]$Path, [switch]$Overwrite)
    $parent = Split-Path -Parent $Path
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    if ((Test-Path -LiteralPath $Path -PathType Leaf) -and -not $Overwrite) {
        throw "Receipt already exists: $Path"
    }
    $temporary = "$Path.$([Guid]::NewGuid().ToString('N')).tmp"
    try {
        $Value | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $temporary -Encoding UTF8
        Move-Item -LiteralPath $temporary -Destination $Path -Force
    }
    finally {
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
    }
    return $Path
}

function Write-NativeV1Receipt {
    param(
        [Parameter(Mandatory)]$Receipt,
        [string]$DataRoot,
        [switch]$Overwrite
    )
    foreach ($name in @('receiptId','mission','baseSha','candidateSha','changeType','risk','mainDecision','reviews')) {
        if (-not (Test-NativeV1Property -InputObject $Receipt -Name $name)) { throw "Candidate Receipt is missing '$name'." }
    }
    $version = Get-NativeV1Property -InputObject $Receipt -Name 'receiptVersion'
    if ($null -ne $version -and [string]$version -eq '1.1') {
        foreach ($name in @('missionId','missionType','finalSha','result','participants')) {
            if (-not (Test-NativeV1Property -InputObject $Receipt -Name $name)) { throw "Native V1.1 Receipt is missing '$name'." }
        }
    }
    foreach ($review in @((Get-NativeV1Property -InputObject $Receipt -Name 'reviews'))) {
        $transport = Get-NativeV1Property -InputObject $review -Name 'reviewerTransport'
        if (-not [string]::IsNullOrWhiteSpace([string]$transport) -and [string]$transport -ne $script:NativeV1OfficialReviewerTransport) {
            throw "Excluded reviewer transport cannot be recorded as an official Native review: $transport"
        }
    }
    $path = Get-NativeV1ReceiptPath -ReceiptId ([string]$Receipt.receiptId) -DataRoot $DataRoot
    return Write-NativeV1JsonAtomic -Value $Receipt -Path $path -Overwrite:$Overwrite
}

function Write-NativeV1CandidateReceipt {
    param(
        [Parameter(Mandatory)]$Receipt,
        [string]$DataRoot,
        [switch]$Overwrite
    )
    return Write-NativeV1Receipt -Receipt $Receipt -DataRoot $DataRoot -Overwrite:$Overwrite
}

function Read-NativeV1Receipt {
    param(
        [Parameter(Mandatory)][string]$ReceiptId,
        [string]$DataRoot
    )
    $path = Get-NativeV1ReceiptPath -ReceiptId $ReceiptId -DataRoot $DataRoot
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Receipt not found: $ReceiptId" }
    return Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Test-NativeV1MissionCompletion {
    param([Parameter(Mandatory)]$Receipt)
    $reasons = New-Object Collections.Generic.List[string]
    $reviews = @((Get-NativeV1Property -InputObject $Receipt -Name 'reviews'))
    $reviewRequired = [bool](Get-NativeV1Property -InputObject $Receipt -Name 'reviewRequired' -Default $false)
    $manualAcceptanceRequired = [bool](Get-NativeV1Property -InputObject $Receipt -Name 'manualAcceptanceRequired' -Default $false)
    $pushRequired = [bool](Get-NativeV1Property -InputObject $Receipt -Name 'pushRequired' -Default $false)
    $validReviewCount = 0

    foreach ($review in $reviews) {
        $transport = [string](Get-NativeV1Property -InputObject $review -Name 'reviewerTransport')
        if (-not [string]::IsNullOrWhiteSpace($transport) -and $transport -ne $script:NativeV1OfficialReviewerTransport) {
            [void]$reasons.Add("Excluded reviewer transport cannot satisfy the official review gate: $transport")
            continue
        }
        $protocol = [string](Get-NativeV1Property -InputObject $review -Name 'protocolVersion')
        $reviewerResult = [string](Get-NativeV1Property -InputObject $review -Name 'reviewerResult')
        $findingCount = Get-NativeV1Property -InputObject $review -Name 'findingCount'
        $findingIds = Get-NativeV1Property -InputObject $review -Name 'findingIds'
        if ($transport -eq $script:NativeV1OfficialReviewerTransport -and
            $protocol -eq $script:NativeV1OfficialReviewProtocolVersion -and
            $reviewerResult -eq 'NO_FINDINGS_EVIDENCE_SUFFICIENT' -and
            $null -ne $findingCount -and [int]$findingCount -eq 0 -and
            (($null -eq $findingIds) -or @($findingIds).Count -eq 0)) {
            $validReviewCount++
        }
    }

    if ($reviewRequired -and $validReviewCount -eq 0) { [void]$reasons.Add('A required mission has no valid Native reviewer result.') }
    if ($manualAcceptanceRequired -and $null -eq (Get-NativeV1Property -InputObject $Receipt -Name 'userAcceptedAt')) {
        [void]$reasons.Add('Explicit USER_ACCEPTED is required.')
    }
    if ($pushRequired -and $null -eq (Get-NativeV1Property -InputObject $Receipt -Name 'pushCompletedAt')) {
        [void]$reasons.Add('Explicit PUSH_COMPLETED is required.')
    }

    return [pscustomobject][ordered]@{
        pass = ($reasons.Count -eq 0)
        reasons = @($reasons)
        validNativeReviewCount = $validReviewCount
    }
}

function Write-NativeV1DecisionTrace {
    param(
        [Parameter(Mandatory)][string]$ReceiptId,
        [Parameter(Mandatory)][string]$Phase,
        [Parameter(Mandatory)][string]$Observed,
        [Parameter(Mandatory)][string]$Decision,
        [Parameter(Mandatory)][string]$Reason,
        [Parameter(Mandatory)][string]$Action,
        [Parameter(Mandatory)][string]$Result,
        [AllowNull()][string]$Timestamp = $null,
        [string]$DataRoot
    )
    $receipt = Read-NativeV1Receipt -ReceiptId $ReceiptId -DataRoot $DataRoot
    $trace = @((Get-NativeV1Property -InputObject $receipt -Name 'decisionTrace'))
    $trace += ,(New-NativeV1DecisionTraceEntry -Phase $Phase -Observed $Observed -Decision $Decision -Reason $Reason -Action $Action -Result $Result -Timestamp $Timestamp)
    Set-NativeV1Property -InputObject $receipt -Name 'decisionTrace' -Value @($trace)
    return Write-NativeV1Receipt -Receipt $receipt -DataRoot $DataRoot -Overwrite
}

function Write-NativeV1LifecycleEvent {
    param(
        [Parameter(Mandatory)][ValidateSet('USER_ACCEPTED','PUSH_COMPLETED','MISSION_COMPLETED')][string]$EventType,
        [Parameter(Mandatory)][string]$ReceiptId,
        [string]$DataRoot,
        [string]$RepoRoot = ''
    )
    $receipt = Read-NativeV1Receipt -ReceiptId $ReceiptId -DataRoot $DataRoot
    $occurredAt = Get-NativeV1UtcTimestamp
    $observedFinalSha = $null

    switch ($EventType) {
        'USER_ACCEPTED' {
            Set-NativeV1Property -InputObject $receipt -Name 'userAcceptedAt' -Value $occurredAt
            $pushRequired = [bool](Get-NativeV1Property -InputObject $receipt -Name 'pushRequired' -Default $false)
            $pushCompleted = $null -ne (Get-NativeV1Property -InputObject $receipt -Name 'pushCompletedAt')
            $nextState = if ($pushRequired -and -not $pushCompleted) { 'PUSH_PENDING' } else { 'COMPLETION_PENDING' }
            Set-NativeV1Property -InputObject $receipt -Name 'lifecycleState' -Value $nextState
        }
        'PUSH_COMPLETED' {
            $candidateSha = [string](Get-NativeV1Property -InputObject $receipt -Name 'candidateSha')
            if ([string]::IsNullOrWhiteSpace($candidateSha)) { throw 'PUSH_COMPLETED requires a Candidate SHA.' }
            if ([string]::IsNullOrWhiteSpace($RepoRoot)) { throw 'PUSH_COMPLETED requires RepoRoot for factual Git evidence.' }
            $observedFinalSha = Invoke-NativeV1Git -RepoRoot $RepoRoot -Arguments @('rev-parse', 'HEAD')
            if ($observedFinalSha -ne $candidateSha) { throw "PUSH_COMPLETED Git evidence does not match candidateSha: $observedFinalSha" }
            Set-NativeV1Property -InputObject $receipt -Name 'pushCompletedAt' -Value $occurredAt
            Set-NativeV1Property -InputObject $receipt -Name 'pushedSha' -Value $observedFinalSha
            $manualAcceptanceRequired = [bool](Get-NativeV1Property -InputObject $receipt -Name 'manualAcceptanceRequired' -Default $false)
            $userAccepted = $null -ne (Get-NativeV1Property -InputObject $receipt -Name 'userAcceptedAt')
            $nextState = if ($manualAcceptanceRequired -and -not $userAccepted) { 'MANUAL_ACCEPTANCE_PENDING' } else { 'COMPLETION_PENDING' }
            Set-NativeV1Property -InputObject $receipt -Name 'lifecycleState' -Value $nextState
        }
        'MISSION_COMPLETED' {
            $gate = Test-NativeV1MissionCompletion -Receipt $receipt
            if (-not $gate.pass) { throw "Mission cannot complete: $($gate.reasons -join '; ')" }
            Set-NativeV1Property -InputObject $receipt -Name 'completedAt' -Value $occurredAt
            $startedAt = Get-NativeV1Property -InputObject $receipt -Name 'startedAt'
            if ($null -ne $startedAt) {
                $duration = ([DateTimeOffset]::Parse($occurredAt) - [DateTimeOffset]::Parse([string]$startedAt)).TotalSeconds
                Set-NativeV1Property -InputObject $receipt -Name 'durationSeconds' -Value ([Math]::Max(0, [Math]::Round($duration, 3)))
            }
            Set-NativeV1Property -InputObject $receipt -Name 'lifecycleState' -Value 'COMPLETED'
        }
    }

    $root = Get-NativeV1DataRoot $DataRoot
    $path = Join-Path $root 'events.jsonl'
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $path) | Out-Null
    $event = [ordered]@{
        event = $EventType
        receiptId = $ReceiptId
        occurredAt = $occurredAt
        observedFinalSha = $observedFinalSha
    }
    ($event | ConvertTo-Json -Compress) | Add-Content -LiteralPath $path -Encoding UTF8
    [void](Write-NativeV1Receipt -Receipt $receipt -DataRoot $DataRoot -Overwrite)
    return $path
}

function Write-NativeV1LearningEvent {
    param(
        [Parameter(Mandatory)][ValidateSet('CONFIRMED_FINDING','REJECTED_FINDING','KNOWN_DEFECT','REQUIREMENT_CHANGED','CONFIRMED_DIAGNOSIS','REJECTED_DIAGNOSIS')][string]$EventType,
        [Parameter(Mandatory)][string]$ReceiptId,
        [string]$ReviewId,
        [string]$FindingId,
        [string]$DiagnosisId,
        [string]$DataRoot
    )
    if ($EventType -in @('CONFIRMED_FINDING','REJECTED_FINDING') -and ([string]::IsNullOrWhiteSpace($ReviewId) -or [string]::IsNullOrWhiteSpace($FindingId))) {
        throw "$EventType requires ReviewId and FindingId."
    }
    if ($EventType -in @('CONFIRMED_DIAGNOSIS','REJECTED_DIAGNOSIS') -and [string]::IsNullOrWhiteSpace($DiagnosisId)) {
        throw "$EventType requires DiagnosisId."
    }
    $root = Get-NativeV1DataRoot $DataRoot
    $path = Join-Path $root 'events.jsonl'
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $path) | Out-Null
    $event = [ordered]@{
        event = $EventType
        receiptId = $ReceiptId
        reviewId = if ([string]::IsNullOrWhiteSpace($ReviewId)) { $null } else { $ReviewId }
        findingId = if ([string]::IsNullOrWhiteSpace($FindingId)) { $null } else { $FindingId }
        diagnosisId = if ([string]::IsNullOrWhiteSpace($DiagnosisId)) { $null } else { $DiagnosisId }
        occurredAt = [DateTime]::UtcNow.ToString('o', [Globalization.CultureInfo]::InvariantCulture)
    }
    ($event | ConvertTo-Json -Compress) | Add-Content -LiteralPath $path -Encoding UTF8
    return $path
}

Export-ModuleMember -Function Get-NativeV1DataRoot, Get-NativeV1GitVisibleStateFingerprint, New-NativeV1Review, New-NativeV1Participant, New-NativeV1DecisionTraceEntry, New-NativeV1MissionReceipt, New-NativeV1CandidateReceipt, Get-NativeV1ReceiptPath, Write-NativeV1Receipt, Write-NativeV1CandidateReceipt, Read-NativeV1Receipt, Test-NativeV1MissionCompletion, Write-NativeV1DecisionTrace, Write-NativeV1LifecycleEvent, Write-NativeV1LearningEvent
