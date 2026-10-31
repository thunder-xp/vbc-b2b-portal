#requires -Version 7.0
[CmdletBinding()]
param(
 [Parameter(Mandatory)][string]$Path,[string]$ExpectedHead='',
 [string]$ReviewedBy='',[string]$AcceptanceTaskId='',[string]$AcceptanceEvidence='',
 [string]$ReclaimApproval='',[switch]$Execute
)
. (Join-Path $PSScriptRoot 'worktree-common.ps1')
$lock=$null
try{
 if($Execute){$lock=Enter-ReclaimGovernanceLock}
 $check=Get-ReclaimCheck $Path -AcceptanceTaskId $AcceptanceTaskId -ReclaimApproval $ReclaimApproval
 if(-not $Execute){$check | ConvertTo-Json -Depth 12;return}
 foreach($v in @($ReviewedBy,$AcceptanceTaskId,$AcceptanceEvidence,$ReclaimApproval)){if([string]::IsNullOrWhiteSpace($v)){throw 'EXPLICIT_LEGACY_REVIEW_METADATA_REQUIRED'}}
 if($ExpectedHead -cne $check.Head){throw 'EXACT_REVIEWED_HEAD_REQUIRED'}
 if(-not $check.EligibleForLegacyAcceptance){$check | ConvertTo-Json -Depth 12;throw 'LEGACY_ACCEPTANCE_REFUSED_SAFETY_GATES'}
 $records=@(Get-WorktreeLifecycleRecords);$existing=@($records | Where-Object Path -ieq $check.Path)
 if($existing.Count -gt 1 -or ($existing.Count -and $existing[0].State -ne 'LEGACY_RECLAIM_REVIEWED')){throw 'EXISTING_LIFECYCLE_MUST_NOT_BE_REPLACED'}
 $record=[pscustomobject]@{Path=$check.Path;Head=$check.Head;Branch=$check.Branch;ReviewedAtUtc=[DateTime]::UtcNow.ToString('o');ReviewedBy=$ReviewedBy;AcceptanceTaskId=$AcceptanceTaskId;AcceptanceEvidence=$AcceptanceEvidence;HeadMergedIntoOriginMain=$true;OriginMainAtReview=$check.OriginMain;WorkingTreeClean=$true;IgnoredDataClassification=$check.IgnoredClassification;MarkerSha256=$check.TaskMarker.Sha256;ReviewedMarkerSha256=$check.TaskMarker.Sha256;TaskMarkerMetadata=$check.TaskMarker;ReclaimApproval=$ReclaimApproval;State='LEGACY_RECLAIM_REVIEWED';OriginalTaskMetadata='UNKNOWN_NOT_INVENTED'}
 Save-ReclaimRecords (@($records | Where-Object Path -ine $check.Path)+@($record))
 [pscustomobject]@{Path=$check.Path;Head=$check.Head;State=$record.State;LifecycleFile=Get-WorktreeLifecyclePath;WorktreeRemoved=$false} | ConvertTo-Json
}finally{if($null -ne $lock){$lock.Dispose()}}
