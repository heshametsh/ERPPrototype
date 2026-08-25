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
$baselineGitVisibleStatus = (& git -C $RepoRoot status --porcelain=v1 --untracked-files=all | Out-String).TrimEnd()
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
    Assert-Check 'V1.2 Receipt round-trips with timing and missing telemetry as null' {
        $loaded = Read-NativeV1Receipt -ReceiptId 'receipt-test' -DataRoot $DataRoot
        if ($loaded.receiptVersion -ne '1.2' -or $loaded.missionType -ne 'IMPLEMENTATION' -or $loaded.finalSha -ne $head -or $loaded.receiptId -ne 'receipt-test' -or [string]::IsNullOrWhiteSpace($loaded.startedAt) -or $null -ne $loaded.completedAt -or $null -ne $loaded.durationSeconds -or $loaded.reviews[0].tokens -ne $null -or $loaded.reviews[0].cachedTokens -ne $null -or $loaded.reviews[0].toolCalls -ne $null -or $loaded.reviews[0].time -ne $null -or $loaded.reviews[0].'reviewerThread/session' -ne $null) { throw 'Candidate Receipt did not preserve the v1.2/timing contract.' }
    }
    Assert-Check 'Decision Trace records material decisions and stays empty when none are supplied' {
        [void](Write-NativeV1DecisionTrace -ReceiptId 'receipt-test' -Phase 'SCOPE' -Observed 'Native module is the active workflow owner' -Decision 'Keep scope local' -Reason 'No product runtime is involved' -Action 'Change only Native V1 files' -Result 'Scope confirmed' -DataRoot $DataRoot)
        $loaded = Read-NativeV1Receipt -ReceiptId 'receipt-test' -DataRoot $DataRoot
        if (@($loaded.decisionTrace).Count -ne 1 -or [string]::IsNullOrWhiteSpace($loaded.decisionTrace[0].timestamp) -or $loaded.decisionTrace[0].decision -ne 'Keep scope local') { throw 'Material Decision Trace was not recorded.' }
        $trivial = New-NativeV1MissionReceipt -MissionId 'trivial-receipt' -Mission 'trivial' -MissionType 'DIAGNOSTIC' -BaseSha $head -FinalSha $head -Risk 'low' -MainDecision 'no-material-decision' -Result 'PASS' -Participants @($main) -ReceiptId 'trivial-receipt'
        [void](Write-NativeV1Receipt -Receipt $trivial -DataRoot $DataRoot)
        if (@((Read-NativeV1Receipt -ReceiptId 'trivial-receipt' -DataRoot $DataRoot).decisionTrace).Count -ne 0) { throw 'Trivial mission unexpectedly received a Decision Trace entry.' }
    }
    Assert-Check 'Diagnostic mission with Main only creates one receipt without Candidate or Reviewer' {
        $diagnostic = New-NativeV1MissionReceipt -MissionId 'diagnosis-1' -Mission 'verify current behavior' -MissionType 'DIAGNOSTIC' -BaseSha $head -FinalSha $head -Risk 'medium' -MainDecision 'diagnosis-complete' -Result 'FAIL' -Participants @($main) -ReceiptId 'diagnosis-receipt'
        [void](Write-NativeV1Receipt -Receipt $diagnostic -DataRoot $DataRoot)
        $loaded = Read-NativeV1Receipt -ReceiptId 'diagnosis-receipt' -DataRoot $DataRoot
        $roles = @($loaded.participants | ForEach-Object { $_.role })
        if ($loaded.receiptVersion -ne '1.2' -or $loaded.missionId -ne 'diagnosis-1' -or $loaded.candidateSha -ne $null -or $loaded.changeType -ne $null -or $roles.Count -ne 1 -or $roles[0] -ne 'MAIN' -or ($roles -contains 'REVIEWER')) { throw 'Diagnostic Receipt did not record Main-only participation.' }
    }
    Assert-Check 'Main-only diagnostic mission completes with factual timing' {
        [void](Write-NativeV1LifecycleEvent -EventType 'MISSION_COMPLETED' -ReceiptId 'diagnosis-receipt' -DataRoot $DataRoot)
        $loaded = Read-NativeV1Receipt -ReceiptId 'diagnosis-receipt' -DataRoot $DataRoot
        if ($loaded.lifecycleState -ne 'COMPLETED' -or [string]::IsNullOrWhiteSpace($loaded.completedAt) -or $null -eq $loaded.durationSeconds -or $loaded.durationSeconds -lt 0) { throw 'Diagnostic mission did not complete with wall-clock timing.' }
    }
    Assert-Check 'Timing survives a DateTime JSON round-trip without locale-dependent parsing' {
        $localeReceipt = New-NativeV1MissionReceipt -MissionId 'locale-timing' -Mission 'locale timing' -MissionType 'DIAGNOSTIC' -BaseSha $head -FinalSha $head -Risk 'low' -MainDecision 'timing-check' -Result 'PASS' -Participants @($main) -ReceiptId 'locale-timing-receipt'
        [void](Write-NativeV1Receipt -Receipt $localeReceipt -DataRoot $DataRoot)
        $localeLoaded = Read-NativeV1Receipt -ReceiptId 'locale-timing-receipt' -DataRoot $DataRoot
        $localeLoaded.startedAt = [DateTime]::UtcNow.AddSeconds(-1)
        [void](Write-NativeV1Receipt -Receipt $localeLoaded -DataRoot $DataRoot -Overwrite)
        [void](Write-NativeV1LifecycleEvent -EventType 'MISSION_COMPLETED' -ReceiptId 'locale-timing-receipt' -DataRoot $DataRoot)
        $completed = Read-NativeV1Receipt -ReceiptId 'locale-timing-receipt' -DataRoot $DataRoot
        if ($null -eq $completed.durationSeconds -or $completed.durationSeconds -lt 0) { throw 'DateTime round-trip timing was locale-dependent.' }
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
    Assert-Check 'Explicit acceptance and push facts are required and are never inferred' {
        $pending = New-NativeV1CandidateReceipt -Mission 'acceptance-gate' -BaseSha $head -CandidateSha $head -ChangeType 'workflow' -Risk 'medium' -MainDecision 'requires-review' -ReviewRequired:$true -ManualAcceptanceRequired:$true -Participants @($main) -ReceiptId 'pending-receipt'
        [void](Write-NativeV1Receipt -Receipt $pending -DataRoot $DataRoot)
        $before = Read-NativeV1Receipt -ReceiptId 'pending-receipt' -DataRoot $DataRoot
        if ($null -ne $before.userAcceptedAt -or $null -ne $before.pushCompletedAt) { throw 'Acceptance or push was inferred.' }
        if ((Test-NativeV1MissionCompletion -Receipt $before).pass) { throw 'Pending mission incorrectly passed completion gate.' }
        [void](Write-NativeV1LifecycleEvent -EventType 'USER_ACCEPTED' -ReceiptId 'pending-receipt' -DataRoot $DataRoot)
        [void](Write-NativeV1LifecycleEvent -EventType 'PUSH_COMPLETED' -ReceiptId 'pending-receipt' -DataRoot $DataRoot -RepoRoot $RepoRoot)
        $afterFacts = Read-NativeV1Receipt -ReceiptId 'pending-receipt' -DataRoot $DataRoot
        if ([string]::IsNullOrWhiteSpace($afterFacts.userAcceptedAt) -or [string]::IsNullOrWhiteSpace($afterFacts.pushCompletedAt) -or $afterFacts.pushedSha -ne $head) { throw 'Explicit lifecycle facts were not recorded.' }
        if ((Test-NativeV1MissionCompletion -Receipt $afterFacts).pass) { throw 'Mission completed without a valid required reviewer.' }
    }
    $validReview = [pscustomobject]@{
        reviewId = 'native-review-1'
        protocolVersion = 'native-reviewer-v1'
        reviewerTransport = 'NATIVE_SUBAGENT'
        reviewerResult = 'NO_FINDINGS_EVIDENCE_SUFFICIENT'
        findingCount = 0
        findingIds = @()
        tokens = $null
        cachedTokens = $null
        toolCalls = $null
        time = $null
        'reviewerThread/session' = $null
    }
    Assert-Check 'Required review rejects excluded CLI transport and accepts one Native reviewer' {
        $invalid = New-NativeV1CandidateReceipt -Mission 'invalid-review-transport' -BaseSha $head -CandidateSha $head -ChangeType 'workflow' -Risk 'high' -MainDecision 'requires-review' -ReviewRequired:$true -Reviews @([pscustomobject]@{ protocolVersion = 'native-reviewer-v1'; reviewerTransport = 'CLI_EXEC'; reviewerResult = 'NO_FINDINGS_EVIDENCE_SUFFICIENT'; findingCount = 0; findingIds = @() }) -ReceiptId 'invalid-transport-receipt'
        $invalidGate = Test-NativeV1MissionCompletion -Receipt $invalid
        if ($invalidGate.pass -or @($invalidGate.reasons | Where-Object { $_ -match 'Excluded reviewer transport' }).Count -eq 0) { throw 'Excluded reviewer transport satisfied the gate.' }
        try { [void](Write-NativeV1Receipt -Receipt $invalid -DataRoot $DataRoot); throw 'Invalid transport was written as official review.' } catch { if ($_.Exception.Message -notmatch 'Excluded reviewer transport') { throw } }
        $valid = New-NativeV1CandidateReceipt -Mission 'valid-review' -BaseSha $head -CandidateSha $head -ChangeType 'workflow' -Risk 'high' -MainDecision 'requires-review' -ReviewRequired:$true -Reviews @($validReview) -ReceiptId 'valid-review-receipt'
        [void](Write-NativeV1Receipt -Receipt $valid -DataRoot $DataRoot)
        $validGate = Test-NativeV1MissionCompletion -Receipt (Read-NativeV1Receipt -ReceiptId 'valid-review-receipt' -DataRoot $DataRoot)
        if ($validGate.validNativeReviewCount -ne 1) { throw 'Valid Native reviewer did not satisfy the review gate.' }
    }
    Assert-Check 'Second focused review remains representable without automatic repetition' {
        $oneReview = New-NativeV1CandidateReceipt -Mission 'one-review-is-enough' -BaseSha $head -CandidateSha $head -ChangeType 'workflow' -Risk 'high' -MainDecision 'one-review' -ReviewRequired:$true -Reviews @($validReview) -ReceiptId 'one-review-receipt'
        $oneReviewGate = Test-NativeV1MissionCompletion -Receipt $oneReview
        if ($oneReviewGate.validNativeReviewCount -ne 1) { throw 'NO_FINDINGS result incorrectly required an automatic second reviewer.' }
        $focused = New-NativeV1CandidateReceipt -Mission 'focused-review' -BaseSha $head -CandidateSha $head -ChangeType 'workflow' -Risk 'high' -MainDecision 'focused-rereview' -ReviewRequired:$true -Reviews @($validReview, $validReview) -ReceiptId 'focused-review-receipt'
        [void](Write-NativeV1Receipt -Receipt $focused -DataRoot $DataRoot)
        $loaded = Read-NativeV1Receipt -ReceiptId 'focused-review-receipt' -DataRoot $DataRoot
        if (@($loaded.reviews).Count -ne 2 -or (Test-NativeV1MissionCompletion -Receipt $loaded).validNativeReviewCount -ne 2) { throw 'Focused second review was not representable.' }
    }
    Assert-Check 'Completion requires all factual gates and records completion timing' {
        $completeReceipt = New-NativeV1CandidateReceipt -Mission 'fully-gated' -BaseSha $head -CandidateSha $head -ChangeType 'workflow' -Risk 'high' -MainDecision 'complete-after-gates' -ReviewRequired:$true -ManualAcceptanceRequired:$true -Reviews @($validReview) -ReceiptId 'complete-receipt'
        [void](Write-NativeV1Receipt -Receipt $completeReceipt -DataRoot $DataRoot)
        [void](Write-NativeV1LifecycleEvent -EventType 'USER_ACCEPTED' -ReceiptId 'complete-receipt' -DataRoot $DataRoot)
        [void](Write-NativeV1LifecycleEvent -EventType 'PUSH_COMPLETED' -ReceiptId 'complete-receipt' -DataRoot $DataRoot -RepoRoot $RepoRoot)
        [void](Write-NativeV1LifecycleEvent -EventType 'MISSION_COMPLETED' -ReceiptId 'complete-receipt' -DataRoot $DataRoot)
        $loaded = Read-NativeV1Receipt -ReceiptId 'complete-receipt' -DataRoot $DataRoot
        if ($loaded.lifecycleState -ne 'COMPLETED' -or [string]::IsNullOrWhiteSpace($loaded.completedAt) -or $null -eq $loaded.durationSeconds) { throw 'Completion did not require or record all factual gates.' }
    }
    Assert-Check 'Failure classification stores supplied facts without a classifier' {
        $failure = New-NativeV1MissionReceipt -MissionId 'failure-receipt' -Mission 'environment check' -MissionType 'DIAGNOSTIC' -BaseSha $head -FinalSha $head -Risk 'low' -MainDecision 'wait' -Result 'WAITING' -FailureClass 'ENVIRONMENT_FAILURE' -FailureContext 'Independent browser process crashed outside the Native workflow' -ReceiptId 'failure-receipt'
        [void](Write-NativeV1Receipt -Receipt $failure -DataRoot $DataRoot)
        $loaded = Read-NativeV1Receipt -ReceiptId 'failure-receipt' -DataRoot $DataRoot
        if ($loaded.failureClass -ne 'ENVIRONMENT_FAILURE' -or $loaded.failureContext -notmatch 'outside') { throw 'Failure facts were not preserved.' }
    }
    Assert-Check 'Existing V1 receipts remain readable' {
        $legacyPath = Get-NativeV1ReceiptPath -ReceiptId 'legacy-receipt' -DataRoot $DataRoot
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $legacyPath) | Out-Null
        ([ordered]@{ receiptId = 'legacy-receipt'; mission = 'legacy'; baseSha = $head; candidateSha = $head; changeType = 'legacy'; risk = 'low'; mainDecision = 'kept'; reviews = @() } | ConvertTo-Json -Depth 10) | Set-Content -LiteralPath $legacyPath -Encoding UTF8
        $loaded = Read-NativeV1Receipt -ReceiptId 'legacy-receipt' -DataRoot $DataRoot
        if ($loaded.receiptId -ne 'legacy-receipt' -or $loaded.mission -ne 'legacy' -or $loaded.candidateSha -ne $head) { throw 'Legacy V1 receipt could not be read.' }
        $legacyV11Path = Get-NativeV1ReceiptPath -ReceiptId 'legacy-v11-receipt' -DataRoot $DataRoot
        ([ordered]@{ receiptVersion = '1.1'; receiptId = 'legacy-v11-receipt'; missionId = 'legacy-v11'; mission = 'legacy v1.1'; missionType = 'IMPLEMENTATION'; baseSha = $head; finalSha = $head; candidateSha = $head; changeType = 'legacy'; risk = 'low'; mainDecision = 'kept'; result = 'CANDIDATE_CREATED'; participants = @(); reviews = @() } | ConvertTo-Json -Depth 10) | Set-Content -LiteralPath $legacyV11Path -Encoding UTF8
        $loadedV11 = Read-NativeV1Receipt -ReceiptId 'legacy-v11-receipt' -DataRoot $DataRoot
        if ($loadedV11.receiptVersion -ne '1.1' -or $loadedV11.missionId -ne 'legacy-v11') { throw 'Legacy V1.1 receipt could not be read.' }
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
        if ($text -match 'Invoke-AITeamCodexExec|SandboxMode|Router|Lead|Collector|Evidence Pack|Learning Engine') { throw 'Forbidden orchestration surface found.' }
    }
    Assert-Check 'Pre-existing unusual untracked artifact remains untouched' {
        $currentStatus = (& git -C $RepoRoot status --porcelain=v1 --untracked-files=all | Out-String).TrimEnd()
        if ($currentStatus -ne $baselineGitVisibleStatus) { throw "Git-visible status changed during deterministic checks: $currentStatus" }
    }
}
finally {
    if (Test-Path -LiteralPath $DataRoot) { Remove-Item -LiteralPath $DataRoot -Recurse -Force }
}

$failed = @($checks | Where-Object { -not $_.pass }).Count
$result = [pscustomobject]@{ pass = ($failed -eq 0); checks = $checks.ToArray() }
$result | ConvertTo-Json -Depth 10
if (-not $result.pass) { exit 1 }
