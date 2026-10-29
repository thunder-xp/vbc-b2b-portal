#requires -Version 7.0
[CmdletBinding()]
param(
 [ValidateSet('Status','Check','Create','Activate','Complete','Abandon','Retire','Dependencies')][string]$Action='Status',
 [string]$Path='', [string]$TaskId='', [string]$Owner='',
 [ValidateSet('None','ParallelCanonicalTask','DangerousExperiment','ReleaseVerification','PerformanceMigrationVerification')][string]$IsolationReason='None',
 [string]$IsolationEvidence='', [string]$ParallelTaskId='', [string]$OwnerLimitApproval='',
 [string]$BranchName='', [string]$BaseRef='main', [switch]$Detach,
 [string]$CompletionCriteria='', [string]$Evidence='',
 [ValidateSet('','MERGED_IN_MAIN','BRANCH_RETAINED')][string]$BranchDisposition='',
 [string]$ReclaimApproval='',
 [ValidateSet('None','Analysis','Documentation','GitInspection','SqlReview','Architecture','Build','Tests','DevServer','ExecutableVerification')][string]$Verification='None',
 [switch]$Execute
)
. (Join-Path $PSScriptRoot 'worktree-common.ps1')
function Get-LocalFirstDecision {
 param([object[]]$Records=@(),[string]$Reason='None',[string]$Justification='',[string]$LimitApproval='',[string]$OtherTask='', [string]$CanonicalTask='',[string]$NewTask='')
 $active=@($Records | Where-Object {$null -ne $_ -and $_.Path -ine $script:Canonical -and $_.State -in @('ACTIVE','REVIEW')}).Count
 $reserved=@($Records | Where-Object {$null -ne $_ -and $_.Path -ine $script:Canonical -and $_.State -eq 'CREATED'}).Count
 $why=if($Reason -eq 'None'){'LOCAL_DEFAULT_NO_ISOLATION_NEEDED'}elseif([string]::IsNullOrWhiteSpace($Justification)){'ISOLATION_EVIDENCE_REQUIRED'}elseif($Reason -notin @('ParallelCanonicalTask','DangerousExperiment','ReleaseVerification','PerformanceMigrationVerification')){'INVALID_ISOLATION_REASON'}elseif($Reason -eq 'ParallelCanonicalTask' -and ([string]::IsNullOrWhiteSpace($OtherTask) -or $OtherTask -cne $CanonicalTask -or $OtherTask -ceq $NewTask)){'INDEPENDENT_CANONICAL_TASK_REQUIRED'}elseif($active+$reserved -ge 3 -and [string]::IsNullOrWhiteSpace($LimitApproval)){'THREE_ACTIVE_SLOTS_OWNER_EXCEPTION_REQUIRED'}else{'JUSTIFIED_ISOLATION_ALLOWED'}
 [pscustomobject]@{Allowed=($why -eq 'JUSTIFIED_ISOLATION_ALLOWED');DefaultMode='LOCAL';Canonical=$script:Canonical;ActiveAdditional=$active;ReservedAdditional=$reserved;UsedSlots=$active+$reserved;Limit=3;Reason=$why;IsolationReason=$Reason;IsolationEvidence=$Justification;OwnerLimitApproval=$LimitApproval}
}
function Get-DependencyDecision {
 param([string]$Kind='None',[bool]$Installed=$false,[bool]$Lockfile=$true)
 $allowed=$Kind -in @('Build','Tests','DevServer','ExecutableVerification')
 [pscustomobject]@{Verification=$Kind;Allowed=($allowed -and ($Installed -or $Lockfile));InstallNeeded=($allowed -and -not $Installed -and $Lockfile);ReuseExisting=($allowed -and $Installed);Reason=if(-not $allowed){'NO_EXECUTABLE_NEED_NO_INSTALL'}elseif($Installed){'REUSE_CURRENT_INSTALLATION'}elseif(-not $Lockfile){'LOCKFILE_REQUIRED_REVIEW_BEFORE_INSTALL'}else{'EXPLICIT_RUNTIME_NEED'};SuggestedCommand=if($allowed -and -not $Installed -and $Lockfile){'npm ci --prefer-offline'}else{$null};NpmExecuted=$false}
}
function Get-CanonicalTaskId {
 $p=Join-Path $script:Canonical '.codex/CURRENT_TASK.md'
 if(Test-Path -LiteralPath $p){foreach($line in Get-Content -LiteralPath $p){if($line -match '^TASK_ID:\s*(.+?)\s*$'){return $Matches[1]}}};''
}
function Read-GovernanceRecords {
 $records=@(Get-WorktreeLifecycleRecords);$seen=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
 foreach($r in $records){if($r.Path){$r.Path=[IO.Path]::GetFullPath($r.Path).TrimEnd('\')};if(-not $r.Path -or -not $r.State -or -not $seen.Add([IO.Path]::GetFullPath($r.Path))){throw 'INVALID_OR_DUPLICATE_LIFECYCLE_RECORD'};if($r.State -notin @('CREATED','ACTIVE','COMPLETED','ABANDONED','RETIRED','REVIEW','ACCEPTED','RECLAIM_ELIGIBLE','REMOVED')){throw 'UNKNOWN_LIFECYCLE_STATE'}}
 $records
}
function Save-GovernanceRecords($Records){
 $file=Get-WorktreeLifecyclePath;$temporary=$file+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
 $json=ConvertTo-Json -InputObject @($Records) -Depth 16
 [IO.File]::WriteAllText($temporary,$json,[Text.UTF8Encoding]::new($false));[IO.File]::Move($temporary,$file,$true)
}
function Assert-AdditionalPath([string]$Target){
 $p=[IO.Path]::GetFullPath($Target).TrimEnd('\');Assert-NoLinks $p
 if($p -ieq $script:Canonical -or [IO.Path]::GetDirectoryName($p) -ine [IO.Path]::GetDirectoryName($script:Canonical) -or -not [IO.Path]::GetFileName($p).StartsWith('vbc-b2b-portal-')){throw 'CANONICAL_OR_OUTSIDE_SCOPE_PROTECTED'};$p
}
function Assert-BranchDisposition([string]$Target,[string]$Disposition){
 $head=(Invoke-LocalGit $Target @('rev-parse','HEAD')).Text.Trim()
 if($Disposition -eq 'MERGED_IN_MAIN'){
  if((Invoke-LocalGit $script:Canonical @('merge-base','--is-ancestor',$head,'main') @(0,1)).Code -ne 0){throw 'HEAD_NOT_REACHABLE_FROM_LOCAL_MAIN'}
 }elseif($Disposition -eq 'BRANCH_RETAINED'){
  if(-not (Invoke-LocalGit $script:Canonical @('for-each-ref','--format=%(refname)','--contains',$head,'refs/heads/')).Text.Trim()){throw 'NO_RETAINED_LOCAL_BRANCH_CONTAINS_HEAD'}
 }else{throw 'EXPLICIT_COMMIT_BRANCH_DISPOSITION_REQUIRED'}
 $head
}
function Set-GovernanceEvent($Record,[string]$State,[string]$Proof){
 $events=@(if($Record.PSObject.Properties['History']){$Record.History})
 $events+=[pscustomobject]@{AtUtc=[DateTime]::UtcNow.ToString('o');TASK_ID=$Record.TASK_ID;Owner=$Record.Owner;Branch=$Record.Branch;Purpose=$Record.Purpose;State=$State;Head=$Record.Head;Evidence=$Proof}
 $Record | Add-Member State $State -Force;$Record | Add-Member History $events -Force
}
# Dot-sourcing exposes pure decisions for focused tests without Git, npm or creation.
if($MyInvocation.InvocationName -eq '.'){return}
foreach($n in @('GIT_DIR','GIT_WORK_TREE','GIT_COMMON_DIR','GIT_INDEX_FILE','GIT_OBJECT_DIRECTORY','GIT_CONFIG_COUNT')){if([Environment]::GetEnvironmentVariable($n)){throw 'AMBIENT_GIT_OVERRIDE_PROTECTED'}}
Assert-Canonical
$target=if($Path){[IO.Path]::GetFullPath($Path).TrimEnd('\')}else{$script:Canonical}
$folder=Split-Path -Parent (Get-WorktreeLifecyclePath);$lock=$null
try {
 if($Execute){
  if($Action -in @('Status','Check','Dependencies')){throw 'READ_ONLY_ACTION_DOES_NOT_EXECUTE_GIT_OR_NPM'}
  Assert-NoLinks $folder;$null=[IO.Directory]::CreateDirectory($folder)
  try{$lock=[IO.File]::Open((Join-Path $folder 'governance.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)}catch{throw 'GOVERNANCE_BUSY_RETRY_NO_CREATION'}
 }
 $registered=@(Get-WorktreeRegistry);$records=@(Read-GovernanceRecords)
 $decision=Get-LocalFirstDecision $records $IsolationReason $IsolationEvidence $OwnerLimitApproval $ParallelTaskId (Get-CanonicalTaskId) $TaskId
 if($Action -eq 'Status'){
  $known=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase);foreach($r in $records){$null=$known.Add($r.Path)}
  [pscustomobject]@{Canonical=$script:Canonical;DefaultMode='LOCAL';ActiveAdditional=$decision.ActiveAdditional;ReservedAdditional=$decision.ReservedAdditional;Limit=3;LegacyUnclassified=@($registered | Where-Object {$_.Path -ine $script:Canonical -and -not $known.Contains($_.Path)}).Count;LegacyNote='Not counted automatically as ACTIVE or assumed safe to reclaim; activate explicitly before reuse';Records=$records;Dependencies='ON_DEMAND_ONLY'} | ConvertTo-Json -Depth 12;return
 }
 if($Action -eq 'Dependencies'){
  if(-not @($registered | Where-Object Path -ieq $target).Count){throw 'DEPENDENCY_TARGET_NOT_REGISTERED'}
  if($target -ine $script:Canonical -and -not @($records | Where-Object {$_.Path -ieq $target -and $_.State -eq 'ACTIVE'}).Count){throw 'ACTIVATE_EXCEPTION_BEFORE_INSTALLING_DEPENDENCIES'}
  Get-DependencyDecision $Verification (Test-Path -LiteralPath (Join-Path $target 'node_modules')) (Test-Path -LiteralPath (Join-Path $target 'package-lock.json')) | ConvertTo-Json;return
 }
 if($Action -eq 'Check'){$decision | ConvertTo-Json;if(-not $decision.Allowed){exit 2};return}
 $target=Assert-AdditionalPath $target
 if($Action -in @('Create','Activate')){
  # An already ACTIVE path uses its existing slot, rather than allocating another.
  $existing=@($records | Where-Object Path -ieq $target)
  $others=@($records | Where-Object Path -ine $target)
  $decision=Get-LocalFirstDecision $others $IsolationReason $IsolationEvidence $OwnerLimitApproval $ParallelTaskId (Get-CanonicalTaskId) $TaskId
  if(-not $decision.Allowed){$decision | ConvertTo-Json;throw 'LOCAL_FIRST_CREATION_OR_ACTIVATION_REFUSED'}
  foreach($value in @($TaskId,$Owner,$CompletionCriteria)){if([string]::IsNullOrWhiteSpace($value)){throw 'TASK_OWNER_COMPLETION_CRITERIA_REQUIRED'}}
  if($existing.Count -and $existing[0].State -in @('CREATED','ACTIVE','REVIEW') -and $existing[0].TASK_ID -cne $TaskId){throw 'PATH_ASSIGNED_TO_ANOTHER_TASK'}
  if($existing.Count -and $existing[0].State -in @('CREATED','ACTIVE','REVIEW') -and $existing[0].Owner -cne $Owner){throw 'PATH_ASSIGNED_TO_ANOTHER_OWNER'}
  if($existing.Count -and $existing[0].State -in @('COMPLETED','ABANDONED')){throw 'RETIRE_PREVIOUS_TASK_BEFORE_REUSE'}
  $baseHead=''
  if($Action -eq 'Create'){
   if(Test-Path -LiteralPath $target){throw 'CREATE_TARGET_EXISTS_USE_ACTIVATE_OR_CANONICAL'}
   if(@($registered | Where-Object Path -ieq $target).Count){throw 'CREATE_TARGET_ALREADY_REGISTERED'}
   $baseHead=(Invoke-LocalGit $script:Canonical @('rev-parse','--verify',($BaseRef+'^{commit}'))).Text.Trim()
   if(-not $Detach){if(-not $BranchName -or $BranchName.StartsWith('-')){throw 'NEW_BRANCH_NAME_REQUIRED'};$null=Invoke-LocalGit $script:Canonical @('check-ref-format','--branch',$BranchName);if((Invoke-LocalGit $script:Canonical @('show-ref','--verify','--quiet',('refs/heads/'+$BranchName)) @(0,1)).Code -eq 0){throw 'BRANCH_EXISTS_PRESERVE_IT'}}
  }elseif(@($registered | Where-Object Path -ieq $target).Count -ne 1){throw 'ACTIVATION_TARGET_NOT_REGISTERED'}
  if(-not $Execute){[pscustomobject]@{Mode='DRY_RUN';Action=$Action;Path=$target;Decision=$decision;DependenciesInstalled=$false} | ConvertTo-Json -Depth 8;return}
  $history=@(if($existing.Count -and $existing[0].PSObject.Properties['History']){$existing[0].History})
  $record=[pscustomobject]@{TASK_ID=$TaskId;Owner=$Owner;Path=$target;Branch=$BranchName;Head='';BaseRef=$BaseRef;BaseHead=$baseHead;CreatedAt=[DateTime]::UtcNow.ToString('o');Purpose=$IsolationEvidence;IsolationReason=$IsolationReason;OwnerLimitApproval=$OwnerLimitApproval;CompletionCriteria=$CompletionCriteria;CleanupPolicy='Remove only reviewed regenerable artifacts after activity checks; preserve protected ignored data; retire then propose ordinary removal';State='CREATED';AcceptanceEvidence='';ReclaimEligible=$false;ReclaimApproval='';History=$history}
  $records=@($others)+@($record);Set-GovernanceEvent $record 'CREATED' $IsolationEvidence;Save-GovernanceRecords $records
  # Keep reservation on interruption/failure. Never delete a branch or partial source.
  if($Action -eq 'Create'){
   $creationArguments=if($Detach){@('worktree','add','--detach',$target,$BaseRef)}else{@('worktree','add','-b',$BranchName,$target,$BaseRef)}
   $null=Invoke-LocalGit $script:Canonical $creationArguments
  }
  $row=@(Get-WorktreeRegistry | Where-Object Path -ieq $target);if($row.Count -ne 1){throw 'NEW_REGISTRATION_UNKNOWN_KEEP_RESERVATION'}
  $record.Head=$row[0].Head;$record.Branch=$row[0].Branch;Set-GovernanceEvent $record 'ACTIVE' $IsolationEvidence;Save-GovernanceRecords $records
 }else{
  $match=@($records | Where-Object Path -ieq $target);if($match.Count -ne 1){throw 'LIFECYCLE_RECORD_REQUIRED'};$record=$match[0]
  if(-not $TaskId -or $record.TASK_ID -cne $TaskId -or [string]::IsNullOrWhiteSpace($Evidence)){throw 'EXACT_TASK_AND_ACTUAL_EVIDENCE_REQUIRED'}
  if($Action -eq 'Abandon' -and $record.State -eq 'CREATED' -and -not (Test-Path -LiteralPath $target) -and -not @($registered | Where-Object Path -ieq $target).Count){
   if(-not $Execute){[pscustomobject]@{Mode='DRY_RUN';Action='AbandonUnusedReservation';Path=$target;NoDeletion=$true}|ConvertTo-Json;return}
   Set-GovernanceEvent $record 'ABANDONED' $Evidence;Save-GovernanceRecords $records
   [pscustomobject]@{Action='AbandonUnusedReservation';Path=$target;State='ABANDONED';BranchDeleted=$false;SourceDeleted=$false}|ConvertTo-Json;return
  }
  if($Action -eq 'Retire' -and $record.State -eq 'ABANDONED' -and -not (Test-Path -LiteralPath $target) -and -not @($registered | Where-Object Path -ieq $target).Count -and @($record.History | Where-Object State -eq 'ACTIVE').Count -eq 0){
   if(-not $Execute){[pscustomobject]@{Mode='DRY_RUN';Action='RetireUnusedReservation';Path=$target;NoDeletion=$true}|ConvertTo-Json;return}
   $record | Add-Member AcceptanceEvidence $Evidence -Force;$record | Add-Member ReclaimEligible $false -Force
   Set-GovernanceEvent $record 'RETIRED' $Evidence;Save-GovernanceRecords $records
   [pscustomobject]@{Action='RetireUnusedReservation';Path=$target;State='RETIRED';BranchDeleted=$false;SourceDeleted=$false}|ConvertTo-Json;return
  }
  $expected=if($Action -eq 'Retire'){@('COMPLETED','ABANDONED')}else{@('ACTIVE')}
  if($record.State -notin $expected){throw 'INVALID_LIFECYCLE_TRANSITION'}
  if((Invoke-LocalGit $target @('status','--porcelain=v1','--untracked-files=all')).Text){throw 'SAVE_DIRTY_OR_UNTRACKED_WORK_BEFORE_COMPLETION'}
  $disposition=if($BranchDisposition){$BranchDisposition}elseif($record.PSObject.Properties['BranchDisposition']){$record.BranchDisposition}else{''}
  $head=Assert-BranchDisposition $target $disposition
  if($Action -eq 'Retire'){
   if($head -cne $record.Head){throw 'HEAD_CHANGED_SINCE_COMPLETION'}
   $caches=@('node_modules','.next','.turbo','coverage' | Where-Object {Test-Path -LiteralPath (Join-Path $target $_)})
   if($caches.Count){throw ('RETIREMENT_PENDING_REVIEWED_CACHE_CLEANUP:'+($caches -join ','))}
   if(Test-Path -LiteralPath (Join-Path $target '.codex/CURRENT_TASK.md')){throw 'ARCHIVE_TASK_EVIDENCE_AND_CLOSE_OWN_TASK_MARKER_BEFORE_RETIREMENT'}
  }
  if(-not $Execute){[pscustomobject]@{Mode='DRY_RUN';Action=$Action;Path=$target;Head=$head;State=$record.State;NoDeletion=$true}|ConvertTo-Json;return}
  $record.Head=$head;$record | Add-Member BranchDisposition $disposition -Force
  $state=if($Action -eq 'Complete'){'COMPLETED'}elseif($Action -eq 'Abandon'){'ABANDONED'}else{'RETIRED'}
  if($Action -eq 'Retire'){$record | Add-Member AcceptanceEvidence $Evidence -Force;$record | Add-Member ReclaimApproval $ReclaimApproval -Force;$record | Add-Member ReclaimEligible (-not [string]::IsNullOrWhiteSpace($ReclaimApproval)) -Force}
  Set-GovernanceEvent $record $state $Evidence;Save-GovernanceRecords $records
 }
 [pscustomobject]@{Action=$Action;Path=$target;State=$record.State;Head=$record.Head;LifecycleFile=Get-WorktreeLifecyclePath;DependenciesInstalled=$false;SourceDeleted=$false;NextStep=if($record.State -eq 'RETIRED'){'Propose guarded worktree-safe-reclaim dry-run; owner approval never overrides safety gates'}else{'Keep lifecycle current; no automatic install or deletion'}} | ConvertTo-Json
}finally{if($null -ne $lock){$lock.Dispose()}}
