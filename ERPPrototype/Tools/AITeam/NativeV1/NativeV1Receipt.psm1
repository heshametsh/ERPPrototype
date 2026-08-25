Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:NativeV1ReceiptVersion = '1.1'
$script:NativeV1ReviewProtocolVersion = 'candidate-receipt-v1'

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

    $normalizedCandidateSha = if ([string]::IsNullOrWhiteSpace($CandidateSha)) { $null } else { $CandidateSha }
    $normalizedChangeType = if ([string]::IsNullOrWhiteSpace($ChangeType)) { $null } else { $ChangeType }

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

Export-ModuleMember -Function Get-NativeV1DataRoot, Get-NativeV1GitVisibleStateFingerprint, New-NativeV1Review, New-NativeV1Participant, New-NativeV1MissionReceipt, New-NativeV1CandidateReceipt, Get-NativeV1ReceiptPath, Write-NativeV1Receipt, Write-NativeV1CandidateReceipt, Read-NativeV1Receipt, Write-NativeV1LearningEvent
