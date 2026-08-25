[CmdletBinding()]
param(
    [switch]$CleanupOnly,
    [switch]$SelfTest,
    [Parameter(Mandatory = $true)]
    [string]$RepositoryRoot,
    [int[]]$ExcludeProcessId = @()
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

function Test-CommandLineContainsRepositoryRoot {
    param(
        [Parameter(Mandatory = $true)]
        [string]$CommandLine,
        [Parameter(Mandatory = $true)]
        [string]$Root
    )

    $start = 0
    while (($index = $CommandLine.IndexOf($Root, $start, [System.StringComparison]::OrdinalIgnoreCase)) -ge 0) {
        $before =
            $index -eq 0 -or
            $CommandLine[$index - 1] -eq ' ' -or
            $CommandLine[$index - 1] -eq '"'
        $end = $index + $Root.Length
        $after =
            $end -eq $CommandLine.Length -or
            $CommandLine[$end] -eq '\' -or
            $CommandLine[$end] -eq ' ' -or
            $CommandLine[$end] -eq '"'

        if ($before -and $after) {
            return $true
        }

        $start = $end
    }

    return $false
}

function Test-RepositoryProcessMatch {
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$ProcessInfo,
        [Parameter(Mandatory = $true)]
        [string]$Root,
        [int[]]$ExcludedProcessId = @()
    )

    if ($ExcludedProcessId -contains [int]$ProcessInfo.ProcessId) {
        return $false
    }

    $rootText = (Normalize-PathText $Root).ToLowerInvariant()
    $name = ([string]$ProcessInfo.Name).ToLowerInvariant()
    $executablePath = (Normalize-PathText ([string]$ProcessInfo.ExecutablePath)).ToLowerInvariant()
    $commandLine = ([string]$ProcessInfo.CommandLine).Replace('/', '\').ToLowerInvariant()
    $hasRepositoryEvidence =
        (($executablePath -like "$rootText\*") -or
         (Test-CommandLineContainsRepositoryRoot -CommandLine $commandLine -Root $rootText))

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

function Invoke-RepositoryProcessCleanup {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Root
    )

    $snapshot = @(Get-ProcessSnapshot)
    $matches = @($snapshot | Where-Object {
        Test-RepositoryProcessMatch $_ $Root $ExcludeProcessId
    })
    if ($matches.Count -eq 0) {
        Write-Host 'E2E process cleanup: no repository-owned ERPPrototype processes found.'
        return
    }

    foreach ($match in ($matches | Sort-Object ProcessId -Descending)) {
        $processId = [int]$match.ProcessId
        if ($processId -eq $PID -or $ExcludeProcessId -contains $processId) {
            continue
        }

        try {
            $target = Get-Process -Id $processId -ErrorAction Stop
            Stop-Process -Id $target.Id -Force -ErrorAction Stop
            Write-Host "E2E process cleanup: stopped selected PID $processId ($($target.ProcessName))."
        }
        catch [System.Management.Automation.ItemNotFoundException] {
            # Idempotent: it exited between snapshot and cleanup.
        }
        catch {
            Write-Warning "Could not stop selected repository PID ${processId}: $($_.Exception.Message)"
        }
    }
}

function Invoke-SelfTest {
    $root = 'C:\src\ERPPrototype'
    $cases = @(
        [pscustomobject]@{ ProcessId = 1001; Name = 'ERPPrototype.exe'; ExecutablePath = 'C:\src\ERPPrototype\ERPPrototype\bin\Debug\net10.0\ERPPrototype.exe'; CommandLine = ''; Expected = $true }
        [pscustomobject]@{ ProcessId = 1002; Name = 'dotnet.exe'; ExecutablePath = 'C:\Program Files\dotnet\dotnet.exe'; CommandLine = 'dotnet C:\src\ERPPrototype\ERPPrototype\bin\Debug\net10.0\ERPPrototype.dll'; Expected = $true }
        [pscustomobject]@{ ProcessId = 1003; Name = 'dotnet.exe'; ExecutablePath = 'C:\Program Files\dotnet\dotnet.exe'; CommandLine = 'dotnet C:\other\ERPPrototype\ERPPrototype.dll'; Expected = $false }
        [pscustomobject]@{ ProcessId = 1004; Name = 'dotnet.exe'; ExecutablePath = 'C:\Program Files\dotnet\dotnet.exe'; CommandLine = 'dotnet C:\src\ERPPrototypeFork\ERPPrototype.dll'; Expected = $false }
        [pscustomobject]@{ ProcessId = 1005; Name = 'iisexpress.exe'; ExecutablePath = 'C:\src\ERPPrototype\iisexpress.exe'; CommandLine = ''; Expected = $false }
        [pscustomobject]@{ ProcessId = 1006; Name = 'dotnet.exe'; ExecutablePath = 'C:\Program Files\dotnet\dotnet.exe'; CommandLine = 'dotnet --urls http://localhost:5265'; Expected = $false }
        [pscustomobject]@{ ProcessId = 1007; Name = 'dotnet.exe'; ExecutablePath = 'C:\Program Files\dotnet\dotnet.exe'; CommandLine = 'dotnet C:\src\ERPPrototype\ERPPrototype.E2ETests.dll'; Expected = $false; Excluded = $true }
    )

    foreach ($case in $cases) {
        $excluded = if ($case.PSObject.Properties['Excluded'] -and $case.Excluded) {
            @(1007)
        }
        else {
            @()
        }
        $actual = Test-RepositoryProcessMatch $case $root $excluded
        if ($actual -ne $case.Expected) {
            throw "Process-selection self-test failed for $($case.Name): expected $($case.Expected), got $actual."
        }
    }

    $syntheticSnapshot = @(
        [pscustomobject]@{ ProcessId = 2001; ParentProcessId = 0; Name = 'dotnet.exe'; ExecutablePath = 'C:\Program Files\dotnet\dotnet.exe'; CommandLine = 'dotnet C:\src\ERPPrototype\ERPPrototype.dll' }
        [pscustomobject]@{ ProcessId = 2002; ParentProcessId = 2001; Name = 'unrelated.exe'; ExecutablePath = 'C:\other\unrelated.exe'; CommandLine = 'unrelated.exe' }
    )
    $syntheticMatches = @($syntheticSnapshot | Where-Object {
        Test-RepositoryProcessMatch $_ $root
    })
    if ($syntheticMatches.Count -ne 1 -or $syntheticMatches[0].ProcessId -ne 2001) {
        throw 'Process-selection self-test failed: unrelated descendant was selected.'
    }

    Write-Host "E2E process-selection self-test: PASS ($($cases.Count + 1) cases; no real process was terminated)."
}

if ($SelfTest) {
    Invoke-SelfTest
    exit 0
}

Invoke-RepositoryProcessCleanup -Root (Resolve-Path $RepositoryRoot).Path
if (-not $CleanupOnly) {
    throw 'Only -CleanupOnly is supported by RepositoryProcessCleanup.ps1.'
}
