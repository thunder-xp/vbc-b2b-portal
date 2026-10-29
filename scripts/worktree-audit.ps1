#requires -Version 7.0
[CmdletBinding()]
param([string]$ReportDirectory=(Join-Path $PWD ('worktree-audit-'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff'))))
. (Join-Path $PSScriptRoot 'worktree-common.ps1')
Assert-Canonical
$report=[IO.Path]::GetFullPath($ReportDirectory)
if($report.StartsWith($script:Canonical+'\',[StringComparison]::OrdinalIgnoreCase) -or $report -ieq $script:Canonical){throw 'Reports must be outside the canonical checkout'}
$run=Join-Path $script:BackupParent ('audit-'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff')+'-'+[Guid]::NewGuid().ToString('N'))
New-ProtectedDirectory $run
New-ProtectedDirectory $report
$raw=(Invoke-LocalGit $script:Canonical @('worktree','list','--porcelain')).Text
$rows=@(foreach($block in ($raw.Trim() -split '\r?\n\r?\n')){$o=@{};foreach($l in ($block -split '\r?\n')){$parts=$l.Split(' ',2);if($parts.Count -eq 2){$o[$parts[0]]=$parts[1]}else{$o[$parts[0]]=$true}};$o})
$rows | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $run 'registry-before.json') -Encoding utf8
[pscustomobject]@{Timestamp=[DateTime]::UtcNow.ToString('o');ActivityGate=Get-ActivityGate;FreeBytes=[IO.DriveInfo]::new('C:\').AvailableFreeSpace} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $run 'environment.json')
& (Join-Path $PSScriptRoot 'worktree-size-scan.ps1') -RunDirectory $run
if(-not $?) {throw 'Size inventory failed'}
& node (Join-Path $PSScriptRoot 'worktree-inventory.cjs') $run $report
if($LASTEXITCODE -ne 0){throw 'Audit incomplete; protected checkpoint retained'}
Write-Output "Protected evidence: $run"
Write-Output "Reports: $report"
