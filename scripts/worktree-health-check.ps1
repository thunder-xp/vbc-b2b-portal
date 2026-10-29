#requires -Version 7.0
[CmdletBinding()]
param()
. (Join-Path $PSScriptRoot 'worktree-common.ps1')
$registry=@(Get-WorktreeRegistry)
$missing=@($registry | Where-Object {-not (Test-Path -LiteralPath $_.Path)})
$invalid=@()
foreach($wt in $registry){try{$head=(Invoke-LocalGit $wt.Path @('rev-parse','HEAD')).Text.Trim();if($head -ne $wt.Head){$invalid+=$wt.Path}}catch{$invalid+=$wt.Path}}
$fsck=Invoke-LocalGit $script:Canonical @('fsck','--connectivity-only','--no-dangling')
[pscustomobject]@{Worktrees=$registry.Count;MissingPaths=$missing.Count;InvalidHeads=$invalid.Count;ConnectivityExit=$fsck.Code;ActivityGate=Get-ActivityGate;FreeBytes=[IO.DriveInfo]::new('C:\').AvailableFreeSpace;CanonicalStatus=(Invoke-LocalGit $script:Canonical @('status','--short')).Text} | ConvertTo-Json -Depth 5
if($missing.Count -or $invalid.Count){throw 'Worktree health check failed'}
