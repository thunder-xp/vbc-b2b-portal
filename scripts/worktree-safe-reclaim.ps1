#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Path,[string]$ExpectedHead='',[switch]$Execute,[string]$Confirmation='')
. (Join-Path $PSScriptRoot 'worktree-common.ps1')
$lock=$null;$backup=$null
try {
 if($Execute){
  if($Confirmation -cne 'RECLAIM-VERIFIED-WORKTREE'){throw 'Explicit confirmation is required'}
  $lock=Enter-ReclaimGovernanceLock
 }
 $check=Get-ReclaimCheck $Path
 if(-not $Execute){$check | ConvertTo-Json -Depth 12;return}
 if($ExpectedHead -cne $check.Head){throw 'EXACT_REVIEWED_HEAD_REQUIRED'}
 if(-not $check.Eligible){$check | ConvertTo-Json -Depth 12;throw 'Preserved: safety gates did not pass'}
 $backup=Join-Path $script:BackupParent ('reclaim-'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff')+'-'+[Guid]::NewGuid().ToString('N'))
 if([IO.DriveInfo]::new([IO.Path]::GetPathRoot($backup)).AvailableFreeSpace -lt 64MB){throw 'Insufficient reserve for bounded recovery evidence'}
 New-ProtectedDirectory $backup
 function Write-Action([string]$State){[pscustomobject]@{Timestamp=[DateTime]::UtcNow.ToString('o');Path=$check.Path;Head=$check.Head;Branch=$check.Branch;State=$State;Recovery=$backup} | ConvertTo-Json -Compress | Add-Content -LiteralPath (Join-Path $backup 'actions.jsonl')}
 Write-Action 'RECOVERY_STARTED'
 $manifest=New-MergedRecoveryManifest $check $backup
 $null=Assert-MergedRecoveryManifest $backup
 # A tiny local ref protects recovery even if remote refs move later.
 $ref=(Invoke-LocalGit $script:Canonical @('rev-parse','--verify','--quiet',$manifest.RecoveryRef) @(0,1)).Text.Trim()
 if($ref -and $ref -cne $check.Head){throw 'RECOVERY_REF_CONFLICT'}
 if(-not $ref){$null=Invoke-LocalGit $script:Canonical @('update-ref',$manifest.RecoveryRef,$check.Head,('0'*40))}
 Write-Action 'RECOVERY_VERIFIED'
 $fresh=Get-ReclaimCheck $check.Path
 if(-not $fresh.Eligible -or $fresh.Head -cne $check.Head -or $fresh.Branch -cne $check.Branch -or $fresh.OriginMain -cne $check.OriginMain){throw 'Candidate changed during recovery verification'}
 foreach($metadata in $fresh.IgnoredClassification.GeneratedMetadata){
  $live=Get-ReclaimCheck $check.Path
  if(-not $live.Eligible -or $live.Head -cne $check.Head -or $live.OriginMain -cne $check.OriginMain){throw 'Candidate changed before generated metadata cleanup'}
  Remove-ProvenGeneratedMetadata $check.Path $metadata
  Update-ReviewedDataAfterCleanup $check.Path $check.Head $live.IgnoredClassification $metadata.RelativePath
  Write-Action ('GENERATED_METADATA_REMOVED:'+ $metadata.RelativePath)
 }
 foreach($link in $fresh.IgnoredClassification.GeneratedLinks){
  $live=Get-ReclaimCheck $check.Path
  if(-not $live.Eligible -or $live.Head -cne $check.Head -or $live.OriginMain -cne $check.OriginMain){throw 'Candidate changed before link-object cleanup'}
  Remove-ProvenGeneratedLink $check.Path $link
  Update-ReviewedDataAfterCleanup $check.Path $check.Head $live.IgnoredClassification $link.RelativePath
  Write-Action ('GENERATED_LINK_UNLINKED_TARGET_RETAINED:'+ $link.RelativePath)
 }
 foreach($relative in $fresh.IgnoredClassification.GeneratedRoots){
  $live=Get-ReclaimCheck $check.Path
  if(-not $live.Eligible -or $live.Head -cne $check.Head -or $live.OriginMain -cne $check.OriginMain){throw 'Candidate changed before cache cleanup'}
  Write-Action ('CACHE_CLEANUP_STARTED:'+ $relative)
  Remove-ReviewedGeneratedRoot $check.Path $relative
  Write-Action ('CACHE_REMOVED:'+ $relative)
 }
 if($fresh.TaskMarker.State -eq 'STALE_LEGACY_TASK_MARKER'){
  $live=Get-ReclaimCheck $check.Path
  if(-not $live.Eligible -or $live.Head -cne $check.Head){throw 'Candidate changed before stale-marker archival'}
  $live.TaskMarker | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backup 'task-marker-metadata.json')
  $tracked=(Invoke-LocalGit $check.Path @('ls-files','--error-unmatch','.codex/CURRENT_TASK.md') @(0,1)).Code -eq 0
  if(-not $tracked){
   $marker=Join-Path $check.Path '.codex/CURRENT_TASK.md';Assert-NoLinks $marker
   if((Get-FileHash -LiteralPath $marker).Hash -cne $live.TaskMarker.Sha256){throw 'TASK_MARKER_CHANGED'}
   [IO.File]::Delete($marker)
   $markerFolder=Split-Path -Parent $marker
   if(-not @(Get-ChildItem -LiteralPath $markerFolder -Force).Count){[IO.Directory]::Delete($markerFolder,$false)}
   $records=@(Get-WorktreeLifecycleRecords)
   $record=@($records | Where-Object Path -ieq $check.Path)[0]
   $record.MarkerSha256='';$record | Add-Member MarkerArchive $backup -Force
   Save-ReclaimRecords $records
  }
 }
 $fresh=Get-ReclaimCheck $check.Path
 if(-not $fresh.Eligible -or $fresh.Head -cne $check.Head -or $fresh.Branch -cne $check.Branch -or $fresh.OriginMain -cne $check.OriginMain -or $fresh.IgnoredClassification.GeneratedRoots.Count -or $fresh.IgnoredClassification.GeneratedMetadata.Count -or $fresh.IgnoredClassification.GeneratedLinks.Count){throw 'Final safety check refused'}
 $null=Assert-MergedRecoveryManifest $backup
 Write-Action 'ORDINARY_GIT_REMOVAL_STARTED'
 $null=Invoke-LocalGit $script:Canonical @('worktree','remove',$check.Path)
 if((Test-Path -LiteralPath $check.Path) -or @(Get-WorktreeRegistry | Where-Object Path -ieq $check.Path).Count){throw 'REMOVAL_NOT_CONFIRMED'}
 Write-Action 'FILESYSTEM_REMOVAL_CONFIRMED'
 $records=@(Get-WorktreeLifecycleRecords)
 foreach($r in $records | Where-Object Path -ieq $check.Path){$r.State='RETIRED';$r | Add-Member RemovedAtUtc ([DateTime]::UtcNow.ToString('o')) -Force;$r | Add-Member RecoveryManifest (Join-Path $backup 'manifest.json') -Force}
 Save-ReclaimRecords $records
 Write-Action 'REMOVED_CONFIRMED'
 [pscustomobject]@{Path=$check.Path;Head=$check.Head;Removed=$true;Recovery=$backup} | ConvertTo-Json
}catch{
 if($backup -and (Test-Path -LiteralPath $backup)){[pscustomobject]@{Timestamp=[DateTime]::UtcNow.ToString('o');State='STOPPED_NO_FORCE_FALLBACK';SourceState='Inspect surviving path/registry; Git removal is not transactional. Verified merged recovery is retained.';Error=$_.Exception.Message} | ConvertTo-Json -Compress | Add-Content -LiteralPath (Join-Path $backup 'actions.jsonl')}
 throw
}finally{if($null -ne $lock){$lock.Dispose()}}
