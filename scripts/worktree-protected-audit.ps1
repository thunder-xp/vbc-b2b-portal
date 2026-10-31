#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$ReportDirectory,[string]$AcceptanceTaskId='',[string]$ReclaimApproval='')
. (Join-Path $PSScriptRoot 'worktree-common.ps1')
. (Join-Path $PSScriptRoot 'worktree-data-common.ps1')
Assert-Canonical
$out=[IO.Path]::GetFullPath($ReportDirectory);Assert-NoLinks $out
if($out -ieq $script:Canonical -or $out.StartsWith($script:Canonical+'\',[StringComparison]::OrdinalIgnoreCase)){
 if(-not $out.StartsWith((Join-Path $script:Canonical '.git/worktree-governance/').Replace('/','\'),[StringComparison]::OrdinalIgnoreCase)){throw 'REPORT_MUST_BE_OUTSIDE_VERSIONED_SOURCE'}
}
New-ProtectedDirectory $out
$registry=@(Get-WorktreeRegistry);$origin=(Invoke-LocalGit $script:Canonical @('rev-parse','origin/main')).Text.Trim()
$rows=[Collections.Generic.List[object]]::new();$i=0
foreach($wt in $registry){
 if($wt.Path -ieq $script:Canonical){continue}
 if((Invoke-LocalGit $script:Canonical @('merge-base','--is-ancestor',$wt.Head,$origin) @(0,1)).Code -ne 0){continue}
 if((Invoke-LocalGit $wt.Path @('status','--porcelain=v1','-z','--untracked-files=all')).Text){continue}
 try{
  $check=Get-ReclaimCheck $wt.Path -AcceptanceTaskId $AcceptanceTaskId -ReclaimApproval $ReclaimApproval
  $snapshot=if($check.IgnoredClassification.PSObject.Properties['Snapshot']){$check.IgnoredClassification.Snapshot}else{Get-LocalDataSnapshot $wt.Path $registry $check.IgnoredClassification.Links}
  $rows.Add([pscustomobject]@{Path=$wt.Path;Head=$wt.Head;OriginMain=$origin;Reasons=$check.NonOwnerReasons;Protected=$check.IgnoredClassification.Protected;Unknown=$check.IgnoredClassification.Unknown;TaskMarker=$check.TaskMarker;Reviewable=$check.EligibleForLegacyAcceptance;Data=$snapshot;Classifier=$check.IgnoredClassification})
 }catch{$rows.Add([pscustomobject]@{Path=$wt.Path;Head=$wt.Head;Error='METADATA_OR_CLASSIFIER_FAILED';Reviewable=$false})}
 $i++;$rows | ConvertTo-Json -Depth 18 | Set-Content -LiteralPath (Join-Path $out checkpoint.json)
 if($i%10 -eq 0){Write-Output "Classified $i CLEAN_MERGED trees"}
}
$rows | ConvertTo-Json -Depth 18 | Set-Content -LiteralPath (Join-Path $out exact-blockers.json)
[pscustomobject]@{OriginMain=$origin;Worktrees=$registry.Count;CleanMerged=$rows.Count;Errors=@($rows | Where-Object {$_.PSObject.Properties['Error']}).Count;Reviewable=@($rows | Where-Object Reviewable).Count;ReportDirectory=$out} | ConvertTo-Json | Set-Content (Join-Path $out audit-summary.json)
Get-Content (Join-Path $out audit-summary.json) -Raw
