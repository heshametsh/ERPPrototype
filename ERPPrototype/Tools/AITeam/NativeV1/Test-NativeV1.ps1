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
    $receipt = New-NativeV1CandidateReceipt -Mission 'native-v1-cleanup' -BaseSha $head -CandidateSha $head -ChangeType 'cleanup' -Risk 'low' -MainDecision 'archive-v3' -Reviews @($review) -ReceiptId 'receipt-test'
    $receiptPath = Write-NativeV1CandidateReceipt -Receipt $receipt -DataRoot $DataRoot
    Assert-Check 'Candidate Receipt round-trips with missing telemetry as null' {
        $loaded = Get-Content -LiteralPath $receiptPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($loaded.receiptId -ne 'receipt-test' -or $loaded.reviews[0].tokens -ne $null -or $loaded.reviews[0].cachedTokens -ne $null -or $loaded.reviews[0].toolCalls -ne $null -or $loaded.reviews[0].time -ne $null -or $loaded.reviews[0].'reviewerThread/session' -ne $null) { throw 'Receipt did not preserve null telemetry.' }
    }
    $eventPath = Write-NativeV1LearningEvent -EventType 'KNOWN_DEFECT' -ReceiptId 'receipt-test' -DataRoot $DataRoot
    Assert-Check 'Later learning events are append-only factual records' {
        $event = Get-Content -LiteralPath $eventPath -Encoding UTF8 | Select-Object -Last 1 | ConvertFrom-Json
        if ($event.event -ne 'KNOWN_DEFECT' -or $event.receiptId -ne 'receipt-test') { throw 'Learning event contract failed.' }
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
