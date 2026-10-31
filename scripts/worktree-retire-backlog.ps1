#requires -Version 7.0
[CmdletBinding()]
param(
 [Parameter(Mandatory)][string]$PlanPath,
 [ValidateRange(1,118)][int]$MaxCount=3,
 [string]$AcceptanceTaskId='',[string]$ReclaimApproval='',
 [switch]$Execute,[string]$Confirmation=''
)
. (Join-Path $PSScriptRoot 'worktree-common.ps1')
Assert-Canonical
Assert-NoLinks $PlanPath
$plan=Get-Content -LiteralPath $PlanPath -Raw | ConvertFrom-Json
if(-not $plan.PSObject.Properties['Candidates']){throw 'EXPLICIT_CANDIDATE_PLAN_REQUIRED'}
$items=@($plan.Candidates)
if(-not $items.Count -or $items.Count -gt $MaxCount){throw 'PLAN_EXCEEDS_EXPLICIT_BATCH_BOUND'}
$seen=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach($item in $items){if(-not $item.Path -or $item.Head -notmatch '^[0-9a-f]{40}$' -or -not $seen.Add([IO.Path]::GetFullPath($item.Path))){throw 'INVALID_OR_DUPLICATE_PLAN_ENTRY'}}
if($Execute -and $Confirmation -cne 'RETIRE-EXACT-REVIEWED-PLAN'){throw 'EXPLICIT_BATCH_CONFIRMATION_REQUIRED'}
$beforeStatus=(Invoke-LocalGit $script:Canonical @('status','--porcelain=v1','-z','--untracked-files=all')).Text
$beforeCount=@(Get-WorktreeRegistry).Count;$beforeFree=[IO.DriveInfo]::new('C:\').AvailableFreeSpace
$run=Join-Path $script:BackupParent ('backlog-'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff')+'-'+[Guid]::NewGuid().ToString('N'))
New-ProtectedDirectory $run
$planHash=(Get-FileHash -LiteralPath $PlanPath -Algorithm SHA256).Hash
$results=[Collections.Generic.List[object]]::new();$consecutiveUnexpected=0;$stopReason=''
function Save-BatchCheckpoint {
 $status=(Invoke-LocalGit $script:Canonical @('status','--porcelain=v1','-z','--untracked-files=all')).Text
 $free=[IO.DriveInfo]::new('C:\').AvailableFreeSpace
 $report=[pscustomobject]@{Mode=if($Execute){'EXECUTE'}else{'DRY_RUN'};PlanSha256=$planHash;Stopped=[bool]$stopReason;StopReason=$stopReason;ConsecutiveUnexpected=$consecutiveUnexpected;WorktreesBefore=$beforeCount;WorktreesAfter=@(Get-WorktreeRegistry).Count;FreeBytesBefore=$beforeFree;FreeBytesAfter=$free;ObservedFreeDeltaGiB=($free-$beforeFree)/1GB;Removed=@($results | Where-Object Removed).Count;CanonicalStatusUnchanged=($beforeStatus -ceq $status);Results=@($results);Evidence=$run}
 $temp=Join-Path $run batch-result.tmp
 $report | ConvertTo-Json -Depth 14 | Set-Content -LiteralPath $temp
 [IO.File]::Move($temp,(Join-Path $run batch-result.json),$true)
}
foreach($item in $items){
 $row=[pscustomobject]@{Path=$item.Path;PlannedHead=$item.Head;ActualHead='';Eligible=$false;LegacyReviewable=$false;ExpectedLogicalReclaimBytes=0;Reasons=@();Outcome='';Error='';RemovalAttempted=$false;Removed=$false;FreeBytesAfter=0}
 try{
  if((Get-FileHash -LiteralPath $PlanPath -Algorithm SHA256).Hash -cne $planHash){$stopReason='PLAN_CHANGED_DURING_BATCH';throw $stopReason}
  $check=Get-ReclaimCheck $item.Path -AcceptanceTaskId $AcceptanceTaskId -ReclaimApproval $ReclaimApproval
  $row.ActualHead=$check.Head;$row.Reasons=$check.Reasons
  $row.LegacyReviewable=$check.EligibleForLegacyAcceptance
  $row.ExpectedLogicalReclaimBytes=$check.ExpectedLogicalReclaimBytes
  $row.Eligible=$check.Eligible -and $check.LegacyAccepted -and $check.Clean -and $check.MergedIntoOriginMain -and $check.Head -ceq $item.Head
  if($check.Head -cne $item.Head){$row.Reasons+= 'PLANNED_HEAD_CHANGED'}
  if(-not $row.Eligible){$row.Outcome='PRESERVED_SAFETY_OR_ACCEPTANCE';$consecutiveUnexpected=0}
  elseif(-not $Execute){$row.Outcome='ELIGIBLE_DRY_RUN';$consecutiveUnexpected=0}
  else{
   $row.RemovalAttempted=$true
   & (Join-Path $PSScriptRoot 'worktree-safe-reclaim.ps1') -Path $item.Path -ExpectedHead $item.Head -Execute -Confirmation 'RECLAIM-VERIFIED-WORKTREE' | Out-Null
   if(-not $?){throw 'RECLAIMER_REFUSED_OR_FAILED'}
   if(@(Get-WorktreeRegistry | Where-Object Path -ieq $check.Path).Count -or (Test-Path -LiteralPath $check.Path)){throw 'REMOVAL_NOT_CONFIRMED'}
   $row.Removed=$true;$row.Outcome='REMOVED_CONFIRMED';$consecutiveUnexpected=0
  }
 }catch{
  $row.Outcome='PRESERVED_UNEXPECTED_FAILURE';$row.Error=$_.Exception.Message;$consecutiveUnexpected++
  if($consecutiveUnexpected -ge 3){$stopReason='THREE_CONSECUTIVE_UNEXPECTED_FAILURES'}
 }finally{
  if($Execute -and $row.RemovalAttempted){$row.Removed=(-not (Test-Path -LiteralPath $row.Path) -and -not @(Get-WorktreeRegistry | Where-Object Path -ieq $row.Path).Count)}
  $row.FreeBytesAfter=[IO.DriveInfo]::new('C:\').AvailableFreeSpace
  $results.Add($row)
  $row | ConvertTo-Json -Depth 12 -Compress | Add-Content -LiteralPath (Join-Path $run results.jsonl)
  if((Invoke-LocalGit $script:Canonical @('status','--porcelain=v1','-z','--untracked-files=all')).Text -cne $beforeStatus){$stopReason='CANONICAL_STATUS_CHANGED'}
  Save-BatchCheckpoint
 }
 if($stopReason){break}
}
Get-Content -LiteralPath (Join-Path $run batch-result.json) -Raw
if($stopReason){throw $stopReason}
