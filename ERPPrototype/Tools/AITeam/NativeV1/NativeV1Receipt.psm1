Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:NativeV1ReceiptVersion = 'candidate-receipt-v1'

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
        protocolVersion = Get-NativeV1Property -InputObject $Review -Name 'protocolVersion' -Default $script:NativeV1ReceiptVersion
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

function New-NativeV1CandidateReceipt {
    param(
        [Parameter(Mandatory)][string]$Mission,
        [Parameter(Mandatory)][string]$BaseSha,
        [Parameter(Mandatory)][string]$CandidateSha,
        [Parameter(Mandatory)][string]$ChangeType,
        [Parameter(Mandatory)][string]$Risk,
        [Parameter(Mandatory)][string]$MainDecision,
        [AllowNull()][object[]]$Reviews = @(),
        [string]$ReceiptId = ([Guid]::NewGuid().ToString())
    )
    if ($ReceiptId -notmatch '^[A-Za-z0-9._-]+$') { throw 'ReceiptId contains unsupported path characters.' }
    $normalizedReviews = @()
    foreach ($review in @($Reviews)) {
        $normalizedReviews += ,(New-NativeV1Review -Review $review)
    }
    return [ordered]@{
        receiptId = $ReceiptId
        mission = $Mission
        baseSha = $BaseSha
        candidateSha = $CandidateSha
        changeType = $ChangeType
        risk = $Risk
        mainDecision = $MainDecision
        reviews = @($normalizedReviews)
    }
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

function Write-NativeV1CandidateReceipt {
    param(
        [Parameter(Mandatory)]$Receipt,
        [string]$DataRoot,
        [switch]$Overwrite
    )
    foreach ($name in @('receiptId','mission','baseSha','candidateSha','changeType','risk','mainDecision','reviews')) {
        if (-not (Test-NativeV1Property -InputObject $Receipt -Name $name)) { throw "Candidate Receipt is missing '$name'." }
    }
    $path = Get-NativeV1ReceiptPath -ReceiptId ([string]$Receipt.receiptId) -DataRoot $DataRoot
    return Write-NativeV1JsonAtomic -Value $Receipt -Path $path -Overwrite:$Overwrite
}

function Write-NativeV1LearningEvent {
    param(
        [Parameter(Mandatory)][ValidateSet('CONFIRMED_FINDING','REJECTED_FINDING','KNOWN_DEFECT','REQUIREMENT_CHANGED')][string]$EventType,
        [Parameter(Mandatory)][string]$ReceiptId,
        [string]$ReviewId,
        [string]$FindingId,
        [string]$DataRoot
    )
    if ($EventType -in @('CONFIRMED_FINDING','REJECTED_FINDING') -and ([string]::IsNullOrWhiteSpace($ReviewId) -or [string]::IsNullOrWhiteSpace($FindingId))) {
        throw "$EventType requires ReviewId and FindingId."
    }
    $root = Get-NativeV1DataRoot $DataRoot
    $path = Join-Path $root 'events.jsonl'
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $path) | Out-Null
    $event = [ordered]@{
        event = $EventType
        receiptId = $ReceiptId
        reviewId = if ([string]::IsNullOrWhiteSpace($ReviewId)) { $null } else { $ReviewId }
        findingId = if ([string]::IsNullOrWhiteSpace($FindingId)) { $null } else { $FindingId }
        occurredAt = [DateTime]::UtcNow.ToString('o', [Globalization.CultureInfo]::InvariantCulture)
    }
    ($event | ConvertTo-Json -Compress) | Add-Content -LiteralPath $path -Encoding UTF8
    return $path
}

Export-ModuleMember -Function Get-NativeV1DataRoot, Get-NativeV1GitVisibleStateFingerprint, New-NativeV1Review, New-NativeV1CandidateReceipt, Get-NativeV1ReceiptPath, Write-NativeV1CandidateReceipt, Write-NativeV1LearningEvent
