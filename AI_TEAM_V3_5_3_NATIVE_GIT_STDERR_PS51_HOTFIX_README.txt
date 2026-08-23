ERP AI Team V3.5.3 - Native Git STDERR / PowerShell 5.1 hotfix

Purpose
-------
Fix the V3.5.2 local compatibility failure where a successful Git command
(exit code 0) wrote an LF->CRLF warning to STDERR and Windows PowerShell 5.1
converted that warning into a terminating NativeCommandError because the
harness uses ErrorActionPreference=Stop.

Changes
-------
- AITeamGates Invoke-AITeamGit now captures native output under
  ErrorActionPreference=Continue.
- STDOUT and STDERR are separated logically: successful Git commands return
  STDOUT only, so warnings cannot corrupt rev-parse/status/diff payloads.
- STDERR is included in the exception only when Git actually returns non-zero.
- Runtime compatibility now exercises the public Git-backed repo-state path
  before any model-backed run and reports "Native Git STDERR capture".
- Team version: 3.5.3.

This patch is an overlay on the current uncommitted V3.5 + V3.5.1 + V3.5.2
working tree. It makes no ERP runtime changes and performs no AI/model call.
