[CmdletBinding()]
param(
    [switch]$CleanupOnly,
    [switch]$SelfTest,
    [Parameter(Mandatory = $true)]
    [string]$RepositoryRoot,
    [int[]]$RelevantPort = @(5265, 5270)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Normalize-PathText {
    param([AllowNull()][string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return ''
    }

    return $Value.Replace('/', '\').TrimEnd('\')
}

function Test-RepositoryProcessMatch {
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$ProcessInfo,
        [Parameter(Mandatory = $true)]
        [string]$Root
    )

    $rootText = (Normalize-PathText $Root).ToLowerInvariant()
    $name = ([string]$ProcessInfo.Name).ToLowerInvariant()
    $executablePath = (Normalize-PathText ([string]$ProcessInfo.ExecutablePath)).ToLowerInvariant()
    $commandLine = ([string]$ProcessInfo.CommandLine).Replace('/', '\').ToLowerInvariant()
    $hasRepositoryEvidence =
        (($executablePath -like "$rootText\*") -or
         ($commandLine.Contains($rootText)))

    if (-not $hasRepositoryEvidence) {
        return $false
    }

    $isErpExecutable = $name -in @('erpprototype.exe', 'erpprototype')
    $isDotnetHost = $name -in @('dotnet.exe', 'dotnet')

    if ($isErpExecutable) {
        return $true
    }

    if ($isDotnetHost) {
        return ($commandLine.Contains('erpprototype.dll') -or
                $commandLine.Contains('erpprototype.csproj') -or
                $commandLine.Contains('revo-gate5b5') -or
                $commandLine.Contains('erpprototype.e2etests'))
    }

    return $false
}

function Get-ProcessSnapshot {
    try {
        return @(Get-CimInstance Win32_Process |
            Select-Object ProcessId, ParentProcessId, Name, ExecutablePath, CommandLine)
    }
    catch {
        Write-Warning "Win32_Process inspection was unavailable: $($_.Exception.Message)"

        # Safe fallback: only executable-path evidence is accepted here. A dotnet
        # host without command-line evidence is deliberately not selected.
        return @(Get-Process -Name 'ERPPrototype' -ErrorAction SilentlyContinue |
            ForEach-Object {
                $path = $null
                try { $path = $_.Path } catch { }
                [pscustomobject]@{
                    ProcessId = $_.Id
                    ParentProcessId = 0
                    Name = $_.ProcessName + '.exe'
                    ExecutablePath = $path
                    CommandLine = $null
                }
            })
    }
}

function Get-DescendantProcessIds {
    param(
        [Parameter(Mandatory = $true)]
        [object[]]$Snapshot,
        [Parameter(Mandatory = $true)]
        [int]$RootProcessId
    )

    $children = @{}
    foreach ($item in $Snapshot) {
        $parentId = 0
        if ($null -ne $item.ParentProcessId) {
            $parentId = [int]$item.ParentProcessId
        }
        if (-not $children.ContainsKey($parentId)) {
            $children[$parentId] = [System.Collections.Generic.List[int]]::new()
        }
        $children[$parentId].Add([int]$item.ProcessId)
    }

    $result = [System.Collections.Generic.List[int]]::new()
    $pending = [System.Collections.Generic.Queue[int]]::new()
    $pending.Enqueue($RootProcessId)
    while ($pending.Count -gt 0) {
        $current = $pending.Dequeue()
        if ($children.ContainsKey($current)) {
            foreach ($child in $children[$current]) {
                $result.Add($child)
                $pending.Enqueue($child)
            }
        }
    }

    return @($result)
}

function Invoke-RepositoryProcessCleanup {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Root
    )

    $snapshot = @(Get-ProcessSnapshot)
    $matches = @($snapshot | Where-Object { Test-RepositoryProcessMatch $_ $Root })
    if ($matches.Count -eq 0) {
        Write-Host 'E2E process cleanup: no repository-owned ERPPrototype processes found.'
        return
    }

    $matchIds = [System.Collections.Generic.HashSet[int]]::new()
    foreach ($match in $matches) {
        [void]$matchIds.Add([int]$match.ProcessId)
    }

    $roots = @($matches | Where-Object {
        -not $matchIds.Contains([int]$_.ParentProcessId)
    })

    foreach ($rootProcess in $roots) {
        $treeIds = @(
            @([int]$rootProcess.ProcessId) +
            @(Get-DescendantProcessIds -Snapshot $snapshot -RootProcessId ([int]$rootProcess.ProcessId))
        ) | Sort-Object -Unique -Descending

        foreach ($processId in $treeIds) {
            if ($processId -eq $PID -or $processId -eq $Host.InstanceId) {
                continue
            }

            try {
                $target = Get-Process -Id $processId -ErrorAction Stop
                Stop-Process -Id $target.Id -Force -ErrorAction Stop
                Write-Host "E2E process cleanup: stopped PID $processId ($($target.ProcessName))."
            }
            catch [System.Management.Automation.ItemNotFoundException] {
                # Idempotent: it exited between snapshot and cleanup.
            }
            catch {
                Write-Warning "Could not stop selected repository PID ${processId}: $($_.Exception.Message)"
            }
        }
    }
}

function Invoke-SelfTest {
    $root = 'C:\src\ERPPrototype'
    $cases = @(
        [pscustomobject]@{ Name = 'ERPPrototype.exe'; ExecutablePath = 'C:\src\ERPPrototype\ERPPrototype\bin\Debug\net10.0\ERPPrototype.exe'; CommandLine = ''; Expected = $true }
        [pscustomobject]@{ Name = 'dotnet.exe'; ExecutablePath = 'C:\Program Files\dotnet\dotnet.exe'; CommandLine = 'dotnet C:\src\ERPPrototype\ERPPrototype\bin\Debug\net10.0\ERPPrototype.dll'; Expected = $true }
        [pscustomobject]@{ Name = 'dotnet.exe'; ExecutablePath = 'C:\Program Files\dotnet\dotnet.exe'; CommandLine = 'dotnet C:\other\ERPPrototype\ERPPrototype.dll'; Expected = $false }
        [pscustomobject]@{ Name = 'iisexpress.exe'; ExecutablePath = 'C:\src\ERPPrototype\iisexpress.exe'; CommandLine = ''; Expected = $false }
        [pscustomobject]@{ Name = 'dotnet.exe'; ExecutablePath = 'C:\Program Files\dotnet\dotnet.exe'; CommandLine = 'dotnet --urls http://localhost:5265'; Expected = $false }
    )

    foreach ($case in $cases) {
        $actual = Test-RepositoryProcessMatch $case $root
        if ($actual -ne $case.Expected) {
            throw "Process-selection self-test failed for $($case.Name): expected $($case.Expected), got $actual."
        }
    }

    Write-Host "E2E process-selection self-test: PASS ($($cases.Count) cases; no real process was terminated)."
}

if ($SelfTest) {
    Invoke-SelfTest
    exit 0
}

Invoke-RepositoryProcessCleanup -Root (Resolve-Path $RepositoryRoot).Path
if (-not $CleanupOnly) {
    throw 'Only -CleanupOnly is supported by RepositoryProcessCleanup.ps1.'
}
