Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$script:Canonical='C:\VibeCoding\Projects\B2B\vbc-b2b-portal'
$script:BackupParent='C:\VibeCoding\Projects\B2B\_environment-backups'
function Invoke-LocalGit {
 param([string]$Directory,[string[]]$Arguments,[int[]]$Allowed=@(0),[string]$InputText)
 $old=$env:GIT_OPTIONAL_LOCKS; $env:GIT_OPTIONAL_LOCKS='0'
 try {
  $psi=[Diagnostics.ProcessStartInfo]::new('git'); $psi.UseShellExecute=$false; $psi.CreateNoWindow=$true
  $psi.RedirectStandardOutput=$true; $psi.RedirectStandardError=$true
  $psi.RedirectStandardInput=$PSBoundParameters.ContainsKey('InputText')
  foreach($arg in @('-C',$Directory)+$Arguments){$psi.ArgumentList.Add($arg)}
  $p=[Diagnostics.Process]::Start($psi);$stdout=$p.StandardOutput.ReadToEndAsync();$stderr=$p.StandardError.ReadToEndAsync()
  if($psi.RedirectStandardInput){$write=$p.StandardInput.WriteAsync($InputText);$null=$write.GetAwaiter().GetResult();$p.StandardInput.Close()}
  if(-not $p.WaitForExit(120000)){$p.Kill();throw 'Git command timeout'}
  $value=$stdout.GetAwaiter().GetResult();$null=$stderr.GetAwaiter().GetResult()
  if($p.ExitCode -notin $Allowed){throw "Git check failed: $($Arguments[0]); exit $($p.ExitCode)"}
  [pscustomobject]@{Code=$p.ExitCode;Text=$value}
 }finally{$env:GIT_OPTIONAL_LOCKS=$old}
}
function Assert-NoLinks {
 param([string]$Path)
 $cursor=[IO.Path]::GetFullPath($Path)
 while($cursor){if(Test-Path -LiteralPath $cursor){$item=Get-Item -LiteralPath $cursor -Force;if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Reparse point in path; preserve object'}};$parent=[IO.Path]::GetDirectoryName($cursor);if($parent -eq $cursor){break};$cursor=$parent}
}
function Assert-Canonical {
 Assert-NoLinks $script:Canonical
 Assert-NoLinks (Join-Path $script:Canonical '.git')
 $top=(Invoke-LocalGit $script:Canonical @('rev-parse','--show-toplevel')).Text.Trim().Replace('/','\')
 if($top -ine $script:Canonical){throw 'Canonical path mismatch'}
 if(-not (Test-Path -LiteralPath (Join-Path $script:Canonical '.git') -PathType Container)){throw 'Canonical .git must be a directory'}
}
function Get-WorktreeRegistry {
 Assert-Canonical
 $text=(Invoke-LocalGit $script:Canonical @('worktree','list','--porcelain')).Text
 foreach($block in ($text.Trim() -split '\r?\n\r?\n')){
  $row=[ordered]@{Path='';Head='';Branch='';Locked=$false;Prunable=$false}
  foreach($line in ($block -split '\r?\n')){
   if($line.StartsWith('worktree ')){$row.Path=$line.Substring(9).Replace('/','\')}
   elseif($line.StartsWith('HEAD ')){$row.Head=$line.Substring(5)}
   elseif($line.StartsWith('branch ')){$row.Branch=$line.Substring(7)}
   elseif($line -match '^locked(?: |$)'){$row.Locked=$true}
   elseif($line -match '^prunable(?: |$)'){$row.Prunable=$true}
  }
  [pscustomobject]$row
 }
}
function Get-WorktreeLifecyclePath {
 Join-Path $script:Canonical '.git/worktree-governance/lifecycle.json'
}
function Get-WorktreeLifecycleRecords {
 $local=Get-WorktreeLifecyclePath
 $legacy=Join-Path $script:BackupParent 'lifecycle.json'
 $file=if(Test-Path -LiteralPath $local){$local}elseif(Test-Path -LiteralPath $legacy){$legacy}else{$null}
 if($file){Assert-NoLinks $file;@(Get-Content -LiteralPath $file -Raw | ConvertFrom-Json)}
}
function New-ProtectedDirectory {
 param([string]$Path)
 Assert-NoLinks $Path
 if(Test-Path -LiteralPath $Path){throw 'Evidence destination already exists; use a new run directory'}
 $null=New-Item -ItemType Directory -Path $Path
 $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
 $acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false)
 foreach($s in @($sid,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'),[Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($s,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}
 Set-Acl -LiteralPath $Path -AclObject $acl
 $actual=Get-Acl -LiteralPath $Path
 if(-not $actual.AreAccessRulesProtected){throw 'Backup ACL verification failed'}
 $allowed=@($sid.Value,'S-1-5-18','S-1-5-32-544')
 foreach($rule in $actual.Access){if($rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin $allowed -or $rule.AccessControlType -ne 'Allow'){throw 'Unexpected backup ACL entry'}}
}
function Get-ActivityGate {
 param([string]$Path='')
 if(-not $Path){return 'CANDIDATE_SCOPED_CHECK_REQUIRED'}
 (Get-CandidateActivity $Path).State
}
function Get-ReclaimCheck {
 param([string]$Path,[string]$AcceptanceTaskId='',[string]$ReclaimApproval='')
 $resolved=[IO.Path]::GetFullPath($Path).TrimEnd('\')
 $parent=[IO.Path]::GetDirectoryName($script:Canonical)
 $current=[IO.Path]::GetFullPath((Get-Location).Path).TrimEnd('\')
 if($resolved -ieq $script:Canonical -or $resolved -ieq $current -or $current.StartsWith($resolved+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Main/current checkout protected'}
 if([IO.Path]::GetDirectoryName($resolved) -ine $parent -or -not [IO.Path]::GetFileName($resolved).StartsWith('vbc-b2b-portal-')){throw 'Candidate outside explicit B2B worktree scope'}
 Assert-NoLinks $resolved
 $entry=@(Get-WorktreeRegistry | Where-Object Path -ieq $resolved)
 if($entry.Count -ne 1){throw 'Candidate not uniquely registered'}
 $entry=$entry[0];$reasons=[Collections.Generic.List[string]]::new()
 if((Invoke-LocalGit $resolved @('rev-parse','HEAD')).Text.Trim() -cne $entry.Head){$reasons.Add('REGISTRY_HEAD_MISMATCH')}
 Initialize-ReclaimFileIdentity
 $pointer=Join-Path $resolved '.git';Assert-NoLinks $pointer
 if([VbcReclaimFileIdentity]::Links($pointer) -gt 1){$reasons.Add('NTFS_GIT_POINTER_HARDLINK')}
 if($entry.Locked -or $entry.Prunable){$reasons.Add('LOCKED_OR_PRUNABLE')}
 $status=(Invoke-LocalGit $resolved @('status','--porcelain=v1','-z','--untracked-files=all')).Text
 if($status){$reasons.Add('DIRTY_OR_UNTRACKED')}
 $origin=(Invoke-LocalGit $script:Canonical @('rev-parse','origin/main')).Text.Trim()
 if((Invoke-LocalGit $script:Canonical @('merge-base','--is-ancestor',$entry.Head,$origin) @(0,1)).Code -ne 0){$reasons.Add('UNMERGED_OR_HISTORY_NOT_PROVEN')}
 $admin=(Invoke-LocalGit $resolved @('rev-parse','--absolute-git-dir')).Text.Trim().Replace('/','\')
 Assert-NoLinks $admin
 if(-not $admin.StartsWith((Join-Path $script:Canonical '.git\worktrees\'),[StringComparison]::OrdinalIgnoreCase)){throw 'Unexpected per-worktree Git metadata location'}
 if(-not (Test-Path -LiteralPath (Join-Path $admin gitdir)) -or (Get-Content -LiteralPath (Join-Path $admin gitdir) -Raw).Trim().Replace('/','\') -ine $pointer){$reasons.Add('WORKTREE_METADATA_PATH_MISMATCH')}
 foreach($item in Get-ChildItem -LiteralPath $admin -Recurse -Force){if($item.Attributes -band [IO.FileAttributes]::ReparsePoint -or $item.LinkType -eq 'HardLink'){$reasons.Add('NTFS_METADATA_LINK_REQUIRES_REVIEW');break}}
 $gitOperations=@(foreach($name in @('rebase-merge','rebase-apply','sequencer','MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','BISECT_LOG','config.worktree')){if(Test-Path -LiteralPath (Join-Path $admin $name)){$name}})
 if($gitOperations.Count){$reasons.Add('LOCAL_GIT_OPERATION_OR_METADATA_REQUIRES_REVIEW')}
 if(@(Get-ChildItem -LiteralPath (Join-Path $admin 'refs') -Recurse -Force -File -ErrorAction SilentlyContinue).Count){$reasons.Add('LOCAL_GIT_REFS_REQUIRE_REVIEW')}
 if(@(Get-ChildItem -LiteralPath $admin -Recurse -Force -Filter '*.lock').Count){$reasons.Add('GIT_METADATA_LOCK')}
 $history=@((Invoke-LocalGit $resolved @('reflog','show','--format=%H','HEAD')).Text -split '\r?\n' | Where-Object {$_} | Sort-Object -Unique)
 $orig=Join-Path $admin 'ORIG_HEAD';if(Test-Path -LiteralPath $orig){$history+= (Get-Content -LiteralPath $orig -Raw).Trim()}
 foreach($commit in $history){if($commit -notmatch '^[0-9a-f]{40}$' -or (Invoke-LocalGit $script:Canonical @('merge-base','--is-ancestor',$commit,$origin) @(0,1)).Code -ne 0){$reasons.Add('REFLOG_OR_ORIG_HEAD_HISTORY_REQUIRES_REVIEW');break}}
 $data=Get-IgnoredClassification $resolved
 if($data.Protected.Count -or $data.Unknown.Count){$reasons.Add('PROTECTED_OR_UNKNOWN_IGNORED_DATA')}
 if($data.Links.Count){$reasons.Add('NTFS_LINK_REQUIRES_REVIEW')}
 $activity=Get-CandidateActivity $resolved
 if($activity.State -ne 'NO_CANDIDATE_ACTIVITY_EVIDENCE'){$reasons.Add($activity.State)}
 # Explicit lifecycle acceptance is mandatory; process idleness alone is insufficient.
 $accepted=$false
 $matchingRecords=@(Get-WorktreeLifecycleRecords | Where-Object {[IO.Path]::GetFullPath($_.Path).TrimEnd('\') -ieq $resolved})
 foreach($r in $matchingRecords){
  $retired=($r.State -eq 'RETIRED' -and (Get-RecordValue $r ReclaimEligible $false) -eq $true -and (Get-RecordValue $r ReclaimApproval ''))
  $old=($r.State -eq 'RECLAIM_ELIGIBLE')
  $legacy=Test-LegacyAcceptance $r $entry.Head $entry.Branch
  if($matchingRecords.Count -eq 1 -and $r.Head -eq $entry.Head -and ($legacy -or (($retired -or $old) -and (Get-RecordValue $r AcceptanceEvidence '') -and (Get-RecordValue $r Owner '') -and (Get-RecordValue $r TASK_ID '')))){$accepted=$true}
 }
 $legacyRecord=if($matchingRecords.Count -eq 1 -and (Test-LegacyAcceptance $matchingRecords[0] $entry.Head $entry.Branch)){$matchingRecords[0]}else{$null}
 $reviewTask=if($legacyRecord){$legacyRecord.AcceptanceTaskId}else{$AcceptanceTaskId}
 $approval=if($legacyRecord){$legacyRecord.ReclaimApproval}else{$ReclaimApproval}
 $marker=Get-LegacyTaskMarker $resolved (-not [bool]$status) (-not $reasons.Contains('UNMERGED_OR_HISTORY_NOT_PROVEN')) $activity.State $reviewTask $approval
 if($marker.State -notin @('ABSENT','STALE_LEGACY_TASK_MARKER')){$reasons.Add($marker.State)}
 if($legacyRecord -and ((Get-RecordValue $legacyRecord MarkerSha256 '') -cne $marker.Sha256)){$reasons.Add('TASK_MARKER_CHANGED_SINCE_REVIEW')}
 if($legacyRecord -and $legacyRecord.IgnoredDataClassification.Fingerprint -cne $data.Fingerprint){$reasons.Add('IGNORED_CLASSIFICATION_CHANGED_SINCE_REVIEW')}
 $nonOwner=@($reasons)
 if(-not $accepted){$reasons.Add('TASK_ACCEPTANCE_AND_OWNER_REQUIRED')}
 [pscustomobject]@{Path=$resolved;Head=$entry.Head;Branch=$entry.Branch;OriginMain=$origin;Clean=(-not [bool]$status);MergedIntoOriginMain=(-not $reasons.Contains('UNMERGED_OR_HISTORY_NOT_PROVEN'));Activity=$activity;IgnoredClassification=$data;ProtectedData=@($data.Protected)+@($data.Unknown);TaskMarker=$marker;GitOperation=$gitOperations;NonOwnerReasons=$nonOwner;LegacyAccepted=($null -ne $legacyRecord);EligibleForLegacyAcceptance=($nonOwner.Count -eq 0);ExpectedLogicalReclaimBytes=if($nonOwner.Count -eq 0){$data.TotalLogicalBytes}else{0};Reasons=@($reasons);Eligible=($reasons.Count -eq 0)}
}
. (Join-Path $PSScriptRoot 'worktree-legacy-common.ps1')
