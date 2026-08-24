[CmdletBinding()]
param(
    [ValidateSet('Create','Smoke')][string]$Action = 'Smoke',
    [Parameter(Mandatory)][string]$RepoRoot,
    [Parameter(Mandatory)][string]$MissionId,
    [string]$BaseSha = 'HEAD', [string]$CandidateSha = 'HEAD', [string]$DataRoot,
    [string[]]$AcceptanceCriteria = @('PR-SMOKE-01: The reviewer can inspect the specified repository snapshot and return a valid structured disposition.'),
    [string[]]$Exclusions = @('No candidate certification; smoke verifies transport and record mechanics only.'),
    [string]$LogicalReviewerProfile = 'targeted-general', [Alias('ActualModel')][string]$RequestedModel = '', [ValidateSet('low','medium','high')][string]$ReasoningEffort = 'low'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$productionModule = Join-Path $PSScriptRoot 'ProductionReview.psm1'
$codexModule = Join-Path (Split-Path -Parent $PSScriptRoot) 'AITeamCodex.psm1'
Import-Module $productionModule -Force
Import-Module $codexModule -Force

$created = New-ProductionReviewRecord -MissionId $MissionId -RepoRoot $RepoRoot -BaseSha $BaseSha -CandidateSha $CandidateSha -AcceptanceCriteria $AcceptanceCriteria -Exclusions $Exclusions -RiskLevel 'MEDIUM' -RiskCategories @('tooling','security','least-privilege') -Subsystem 'AI engineering production review' -ChangeType 'smoke' -TechnologyTags @('PowerShell','Codex CLI') -DataRoot $DataRoot
if ($Action -eq 'Create') { $created | ConvertTo-Json -Depth 50; exit 0 }

$record = $created.record; $reviewId = [string]$record.identity.reviewId; $attemptId = [Guid]::NewGuid().ToString(); $root = Get-ProductionReviewDataRoot $DataRoot
$rawDir = Join-Path (Join-Path $root 'Raw') $reviewId; New-Item -ItemType Directory -Force -Path $rawDir | Out-Null
$protocol = Join-Path $RepoRoot '.ai\protocols\reviewer-optimized-v1.md'; $schema = Join-Path $RepoRoot '.ai\schemas\production-review-result.schema.json'
$transport = Get-ProductionReviewerTransport
$marker = "production-review:${reviewId}:$attemptId"
$promptPath = Join-Path $rawDir "$attemptId.prompt.md"
@"
# Production review smoke

Invocation marker: $marker

Review only the repository at `$($record.identity.repoRoot)` for the stated candidate `$($record.identity.candidateSha)`. This is a narrow transport smoke, not a broad review and not a certification.

Perform only these read-only checks: resolve the repository root; verify `HEAD` equals the supplied candidate SHA; read `.gitignore`; and use one focused `rg` search for `ProductionReview`. Report their direct static evidence in criterionCoverage. Do not modify files.

Acceptance criterion:
$($AcceptanceCriteria -join "`n")

Return only the structured result. Use `NO_FINDINGS_EVIDENCE_SUFFICIENT` unless the requested transport proof itself cannot be established. Do not modify files. Set reviewId, attemptId, candidateSha and repositoryCwd exactly as supplied.

reviewId: $reviewId
attemptId: $attemptId
candidateSha: $($record.identity.candidateSha)
repositoryCwd: $($record.identity.repoRoot)
"@ | Set-Content -LiteralPath $promptPath -Encoding UTF8
$output = Join-Path $rawDir "$attemptId.result.json"; $events = Join-Path $rawDir "$attemptId.events.jsonl"; $stderr = Join-Path $rawDir "$attemptId.stderr.txt"
$started = [DateTime]::UtcNow
$execution = Invoke-AITeamCodexExec -RepoRoot $record.identity.repoRoot -PromptPath $promptPath -SchemaPath $schema -OutputPath $output -EventsPath $events -StderrPath $stderr -ReasoningEffort $ReasoningEffort -Model $RequestedModel -WebAllowed $false -SandboxMode $transport.sandboxMode -SandboxPermissions $transport.sandboxPermissions
$validation = if ($execution.exitCode -eq 0) { Test-ProductionReviewerResult -ResultPath $output -RepoRoot $record.identity.repoRoot -ReviewId $reviewId -AttemptId $attemptId -CandidateSha $record.identity.candidateSha } else { [pscustomobject]@{ pass=$false; errors=@("Codex exit code: $($execution.exitCode)"); result=$null } }
$correlation = Get-ProductionReviewSessionCorrelation -EventsPath $events -ExpectedCwd $record.identity.repoRoot -InvocationCwd $record.identity.repoRoot -CandidateSha $record.identity.candidateSha -AttemptMarker $marker
$usage = $execution.usage
$telemetry = Get-ProductionReviewTelemetry -EventsPath $events -StderrPath $stderr -CodexUsage $usage -Execution $execution -RequestedModel $RequestedModel
$telemetry.startedAt = $started.ToString('o'); $telemetry.completedAt = [DateTime]::UtcNow.ToString('o')
$after = Resolve-ProductionReviewRepository -RepoRoot $record.identity.repoRoot -BaseSha $record.identity.baseSha -CandidateSha $record.identity.candidateSha
$postflight = [pscustomobject]@{ pass=($after.actualHeadSha -eq $record.identity.candidateSha -and $after.trackedStatus -eq $record.preflight.trackedStatus); actualHeadSha=$after.actualHeadSha; trackedStatusUnchanged=($after.trackedStatus -eq $record.preflight.trackedStatus); workspaceFingerprint=$after.workspaceFingerprint }
$protocolHash = (Get-FileHash -LiteralPath $protocol -Algorithm SHA256).Hash.ToLowerInvariant()
$configPath = Join-Path $RepoRoot '.ai\team-config.json'
$configHash = if (Test-Path -LiteralPath $configPath) { (Get-FileHash -LiteralPath $configPath -Algorithm SHA256).Hash.ToLowerInvariant() } else { $null }
$attempt = [ordered]@{ attemptId=$attemptId; logicalReviewerProfile=$LogicalReviewerProfile; requestedModel=$telemetry.requestedModel; actualModel=$telemetry.actualModel; modelRevision=$null; configHash=$configHash; protocolVersion='reviewer-optimized-v1'; protocolHash=$protocolHash; role='independent'; selectionReason='One cheapest appropriate native reviewer smoke requested by V1.'; escalationReason=$null; transport=$transport; disposition=if ($validation.result) { $validation.result.disposition } else { $null }; criterionCoverage=if ($validation.result) { @($validation.result.criterionCoverage) } else { @() }; findings=if ($validation.result) { @($validation.result.findings) } else { @() }; evidenceReferences=if ($validation.result) { @($validation.result.evidenceReferences) } else { @() }; sessionCorrelation=$correlation; telemetry=$telemetry; postflight=$postflight; raw=[ordered]@{ resultPath=$output; eventsPath=$events; stderrPath=$stderr; rawEventSha256=$correlation.rawEventSha256 } }
$smoke = Test-ProductionSmokeInfrastructure -Preflight $record.preflight -Validation $validation -Correlation $correlation -Telemetry $telemetry -Postflight $postflight -ReviewerResult $validation.result
$updated = Add-ProductionReviewAttempt -ReviewId $reviewId -ExpectedRevision 1 -Attempt $attempt -ReviewerProtocolHash $protocolHash -DataRoot $DataRoot
$outcome = [ordered]@{ status=if ($smoke.pass) { 'SMOKE_PASSED' } else { 'SMOKE_FAILED' }; failureClass=$smoke.failureClass; modelQualityEligible=$false; mainDecision='SMOKE_ONLY_NOT_A_CANDIDATE_CERTIFICATION'; evidenceStrength='UNKNOWN'; confirmedFindings=@(); rejectedFindings=@(); unresolvedFindings=@($smoke.reasons); fixedFindings=@(); acceptedRisks=@('SECURITY_UNRESOLVED: disk-full-read-access is a host-specific reviewer transport exception for this smoke, not an approved Production policy.'); candidateAccepted=$false; decisionTimestamp=[DateTime]::UtcNow.ToString('o'); evidenceReferences=@($attempt.raw) }
$final = Set-ProductionReviewOutcome -ReviewId $reviewId -ExpectedRevision ([int]$updated.identity.recordRevision) -Outcome $outcome -DataRoot $DataRoot
[pscustomobject]@{ reviewId=$reviewId; recordPath=(Get-ProductionReviewRecordPath -ReviewId $reviewId -DataRoot $DataRoot); recordRevision=$final.identity.recordRevision; candidateSha=$final.identity.candidateSha; disposition=$attempt.disposition; validationPass=$validation.pass; correlation=$correlation; telemetry=$telemetry; smoke=$smoke; raw=$attempt.raw; outcome=$outcome } | ConvertTo-Json -Depth 50
