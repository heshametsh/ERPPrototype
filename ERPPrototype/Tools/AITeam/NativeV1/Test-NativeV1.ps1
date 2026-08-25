[CmdletBinding()]
param(
    [string]$RepoRoot = '',
    [string]$DataRoot = ''
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($RepoRoot)) { $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path }
if ([string]::IsNullOrWhiteSpace($DataRoot)) { $DataRoot = Join-Path $env:TEMP ('ERPPrototype-NativeV1-Test-' + [Guid]::NewGuid().ToString('N')) }
Import-Module (Join-Path $PSScriptRoot 'NativeV1Receipt.psm1') -Force

$checks = New-Object Collections.Generic.List[object]
function Assert-Check {
    param([string]$Name, [scriptblock]$Action)
    try {
        & $Action
        [void]$checks.Add([pscustomobject]@{ name = $Name; pass = $true; detail = $null })
    }
    catch {
        [void]$checks.Add([pscustomobject]@{ name = $Name; pass = $false; detail = $_.Exception.Message })
    }
}

try {
    $head = (& git -C $RepoRoot rev-parse HEAD).Trim()
    $fingerprint = Get-NativeV1GitVisibleStateFingerprint -RepoRoot $RepoRoot
    Assert-Check 'Git-visible fingerprint is deterministic and bound to HEAD' {
        if ($fingerprint.headSha -ne $head -or $fingerprint.fingerprint -notmatch '^[0-9a-f]{64}$') { throw 'Fingerprint contract failed.' }
    }
    $review = [pscustomobject]@{
        reviewId = 'review-1'
        reviewerResult = 'NO_FINDINGS_EVIDENCE_SUFFICIENT'
        findingCount = 0
        findingIds = @()
        tokens = $null
        cachedTokens = $null
        toolCalls = $null
        time = $null
        'reviewerThread/session' = $null
    }
    $main = [pscustomobject]@{
        role = 'MAIN'
        purpose = 'implement the requested Native V1 change'
        requestedModel = $null
        actualModel = $null
        sessionOrThread = $null
        tokens = $null
        cachedTokens = $null
        toolCalls = $null
        elapsedTime = $null
    }
    $specialist = [pscustomobject]@{
        role = 'SPECIALIST'
        purpose = 'provide an optional domain observation'
        requestedModel = 'specialist-model'
        actualModel = 'specialist-model'
        sessionOrThread = 'specialist-session'
        tokens = 12
        cachedTokens = 3
        toolCalls = 1
        elapsedTime = 250
    }
    $receipt = New-NativeV1CandidateReceipt -Mission 'native-v1-cleanup' -BaseSha $head -CandidateSha $head -ChangeType 'cleanup' -Risk 'low' -MainDecision 'archive-v3' -Reviews @($review) -Participants @($main) -ReceiptId 'receipt-test'
    $receiptPath = Write-NativeV1CandidateReceipt -Receipt $receipt -DataRoot $DataRoot
    Assert-Check 'Candidate Receipt round-trips with missing telemetry as null' {
        $loaded = Read-NativeV1Receipt -ReceiptId 'receipt-test' -DataRoot $DataRoot
        if ($loaded.receiptVersion -ne '1.1' -or $loaded.missionType -ne 'IMPLEMENTATION' -or $loaded.finalSha -ne $head -or $loaded.receiptId -ne 'receipt-test' -or $loaded.reviews[0].tokens -ne $null -or $loaded.reviews[0].cachedTokens -ne $null -or $loaded.reviews[0].toolCalls -ne $null -or $loaded.reviews[0].time -ne $null -or $loaded.reviews[0].'reviewerThread/session' -ne $null) { throw 'Candidate Receipt did not preserve the v1.1 contract.' }
    }
    Assert-Check 'Diagnostic mission with Main only creates one receipt without Candidate or Reviewer' {
        $diagnostic = New-NativeV1MissionReceipt -MissionId 'diagnosis-1' -Mission 'verify current behavior' -MissionType 'DIAGNOSTIC' -BaseSha $head -FinalSha $head -Risk 'medium' -MainDecision 'diagnosis-complete' -Result 'FAIL' -Participants @($main) -ReceiptId 'diagnosis-receipt'
        [void](Write-NativeV1Receipt -Receipt $diagnostic -DataRoot $DataRoot)
        $loaded = Read-NativeV1Receipt -ReceiptId 'diagnosis-receipt' -DataRoot $DataRoot
        $roles = @($loaded.participants | ForEach-Object { $_.role })
        if ($loaded.receiptVersion -ne '1.1' -or $loaded.missionId -ne 'diagnosis-1' -or $loaded.candidateSha -ne $null -or $loaded.changeType -ne $null -or $roles.Count -ne 1 -or $roles[0] -ne 'MAIN' -or ($roles -contains 'REVIEWER')) { throw 'Diagnostic Receipt did not record Main-only participation.' }
    }
    Assert-Check 'Optional specialist is recorded without inventing a reviewer' {
        $specialistReceipt = New-NativeV1MissionReceipt -MissionId 'diagnosis-2' -Mission 'specialist-assisted diagnosis' -MissionType 'DIAGNOSTIC' -BaseSha $head -FinalSha $head -Risk 'medium' -MainDecision 'diagnosis-complete' -Result 'PASS' -Participants @($main, $specialist) -ReceiptId 'specialist-receipt'
        [void](Write-NativeV1Receipt -Receipt $specialistReceipt -DataRoot $DataRoot)
        $loaded = Read-NativeV1Receipt -ReceiptId 'specialist-receipt' -DataRoot $DataRoot
        $roles = @($loaded.participants | ForEach-Object { $_.role })
        if ($roles.Count -ne 2 -or $roles[0] -ne 'MAIN' -or $roles[1] -ne 'SPECIALIST' -or ($roles -contains 'REVIEWER') -or $loaded.participants[1].tokens -ne 12 -or $loaded.participants[1].elapsedTime -ne 250) { throw 'Participant list was not recorded exactly.' }
    }
    Assert-Check 'Unavailable participant telemetry remains null' {
        $loaded = Read-NativeV1Receipt -ReceiptId 'diagnosis-receipt' -DataRoot $DataRoot
        $participant = $loaded.participants[0]
        if ($participant.requestedModel -ne $null -or $participant.actualModel -ne $null -or $participant.sessionOrThread -ne $null -or $participant.tokens -ne $null -or $participant.cachedTokens -ne $null -or $participant.toolCalls -ne $null -or $participant.elapsedTime -ne $null) { throw 'Unavailable participant telemetry was fabricated.' }
    }
    Assert-Check 'Existing V1 receipts remain readable' {
        $legacyPath = Get-NativeV1ReceiptPath -ReceiptId 'legacy-receipt' -DataRoot $DataRoot
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $legacyPath) | Out-Null
        ([ordered]@{ receiptId = 'legacy-receipt'; mission = 'legacy'; baseSha = $head; candidateSha = $head; changeType = 'legacy'; risk = 'low'; mainDecision = 'kept'; reviews = @() } | ConvertTo-Json -Depth 10) | Set-Content -LiteralPath $legacyPath -Encoding UTF8
        $loaded = Read-NativeV1Receipt -ReceiptId 'legacy-receipt' -DataRoot $DataRoot
        if ($loaded.receiptId -ne 'legacy-receipt' -or $loaded.mission -ne 'legacy' -or $loaded.candidateSha -ne $head) { throw 'Legacy V1 receipt could not be read.' }
    }
    $eventPath = Write-NativeV1LearningEvent -EventType 'KNOWN_DEFECT' -ReceiptId 'receipt-test' -DataRoot $DataRoot
    Assert-Check 'Later learning events are append-only factual records' {
        $event = Get-Content -LiteralPath $eventPath -Encoding UTF8 | Select-Object -Last 1 | ConvertFrom-Json
        if ($event.event -ne 'KNOWN_DEFECT' -or $event.receiptId -ne 'receipt-test' -or $event.diagnosisId -ne $null) { throw 'Learning event contract failed.' }
    }
    $diagnosisEventPath = Write-NativeV1LearningEvent -EventType 'CONFIRMED_DIAGNOSIS' -ReceiptId 'diagnosis-receipt' -DiagnosisId 'diagnosis-1' -DataRoot $DataRoot
    $rejectedDiagnosisEventPath = Write-NativeV1LearningEvent -EventType 'REJECTED_DIAGNOSIS' -ReceiptId 'diagnosis-receipt' -DiagnosisId 'diagnosis-1' -DataRoot $DataRoot
    Assert-Check 'Factual diagnosis events append without automatic classification' {
        $events = @(Get-Content -LiteralPath $diagnosisEventPath -Encoding UTF8 | ForEach-Object { $_ | ConvertFrom-Json })
        $lastTwo = @($events | Select-Object -Last 2)
        if ($lastTwo.Count -ne 2 -or $lastTwo[0].event -ne 'CONFIRMED_DIAGNOSIS' -or $lastTwo[1].event -ne 'REJECTED_DIAGNOSIS' -or $lastTwo[0].diagnosisId -ne 'diagnosis-1' -or $lastTwo[1].diagnosisId -ne 'diagnosis-1') { throw 'Diagnosis events were not appended as factual records.' }
    }
    Assert-Check 'Active Native V1 module has no CLI transport surface' {
        $text = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'NativeV1Receipt.psm1') -Raw -Encoding UTF8
        if ($text -match 'Invoke-AITeamCodexExec|SandboxMode|Transport|Router|Lead|Collector|Learning Engine') { throw 'Forbidden orchestration surface found.' }
    }
}
finally {
    if (Test-Path -LiteralPath $DataRoot) { Remove-Item -LiteralPath $DataRoot -Recurse -Force }
}

$failed = @($checks | Where-Object { -not $_.pass }).Count
$result = [pscustomobject]@{ pass = ($failed -eq 0); checks = $checks.ToArray() }
$result | ConvertTo-Json -Depth 10
if (-not $result.pass) { exit 1 }
