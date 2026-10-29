#requires -Version 7.0
# Synthetic registrations only: no real git worktree add or npm.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'worktree-governance.ps1')
$results=[Collections.Generic.List[object]]::new()
function Check([string]$Name,[bool]$Condition){if(-not $Condition){throw ('FAIL:'+ $Name)};$results.Add([pscustomobject]@{Test=$Name;Result='PASS'})}
function Rows([int]$Active,[int]$Created=0){@(for($i=0;$i -lt $Active;$i++){[pscustomobject]@{Path=('C:\VibeCoding\Projects\B2B\vbc-b2b-portal-active-'+$i);State='ACTIVE'}};for($i=0;$i -lt $Created;$i++){[pscustomobject]@{Path=('C:\VibeCoding\Projects\B2B\vbc-b2b-portal-created-'+$i);State='CREATED'}})}
Check 'Ordinary new task defaults LOCAL' (-not (Get-LocalFirstDecision (Rows 0)).Allowed)
Check 'Justified third active slot allowed' ((Get-LocalFirstDecision (Rows 2) ReleaseVerification 'actual need').Allowed)
Check 'Fourth refused without owner exception' (-not (Get-LocalFirstDecision (Rows 3) ReleaseVerification 'actual need').Allowed)
Check 'Fourth requires supplied owner evidence' ((Get-LocalFirstDecision (Rows 3) ReleaseVerification 'need' 'SYNTHETIC_ONLY').Allowed)
Check 'CREATED reserves a slot' (-not (Get-LocalFirstDecision (Rows 2 1) DangerousExperiment 'unsafe experiment').Allowed)
Check 'Reason without isolation evidence refused' (-not (Get-LocalFirstDecision @() ReleaseVerification '').Allowed)
Check 'Parallel task must match canonical' (-not (Get-LocalFirstDecision @() ParallelCanonicalTask 'need' '' WRONG ACTUAL NEW).Allowed)
Check 'Parallel task must be independent' (-not (Get-LocalFirstDecision @() ParallelCanonicalTask 'need' '' SAME SAME SAME).Allowed)
Check 'Independent matching canonical task allowed' ((Get-LocalFirstDecision @() ParallelCanonicalTask 'need' '' OTHER OTHER NEW).Allowed)
$retired=@(1..201 | ForEach-Object {[pscustomobject]@{Path=('C:\legacy-'+$_);State='RETIRED'}})
Check '201 dormant records consume no slots' ((Get-LocalFirstDecision $retired ReleaseVerification 'need').UsedSlots -eq 0)
foreach($k in @('None','Analysis','Documentation','GitInspection','SqlReview','Architecture')){Check ('No dependencies for '+$k) (-not (Get-DependencyDecision $k $false $true).Allowed)}
foreach($k in @('Build','Tests','DevServer','ExecutableVerification')){Check ('Dependencies justified by '+$k) ((Get-DependencyDecision $k $false $true).InstallNeeded)}
Check 'Existing node_modules reused' ((Get-DependencyDecision Tests $true $true).ReuseExisting -and -not (Get-DependencyDecision Tests $true $true).InstallNeeded)
Check 'Missing lockfile cannot authorize installation' (-not (Get-DependencyDecision Tests $false $false).Allowed)
$blocked=$false;try{$null=Assert-AdditionalPath $script:Canonical}catch{$blocked=$_.Exception.Message -eq 'CANONICAL_OR_OUTSIDE_SCOPE_PROTECTED'}
Check 'Canonical is protected' $blocked
$root=Split-Path -Parent $PSScriptRoot
$fixture=Join-Path $root ('.git/worktree-governance/test-'+[Guid]::NewGuid().ToString('N'));$null=[IO.Directory]::CreateDirectory($fixture)
$script:TestRegistry=Join-Path $fixture 'lifecycle.json';$script:FakeTarget='C:\VibeCoding\Projects\B2B\vbc-b2b-portal-GOVERNANCE-TEST-NOT-CREATED'
$script:FakeRegistered=$false;$script:FakeAdds=0;$script:FakeDirty='';$script:FakeCaches=$false
$mock=@'
$script:Canonical='C:\VibeCoding\Projects\B2B\vbc-b2b-portal'
function Assert-Canonical {}
function Assert-NoLinks([string]$Path) {}
function Get-WorktreeLifecyclePath {$script:TestRegistry}
function Get-WorktreeLifecycleRecords {if(Microsoft.PowerShell.Management\Test-Path -LiteralPath $script:TestRegistry){@(Get-Content -LiteralPath $script:TestRegistry -Raw | ConvertFrom-Json)}}
function Test-Path {param([string]$LiteralPath,[string]$Path) $p=if($LiteralPath){$LiteralPath}else{$Path};if($p -ieq (Join-Path $script:FakeTarget 'node_modules')){return $script:FakeCaches};Microsoft.PowerShell.Management\Test-Path -LiteralPath $p}
function Get-WorktreeRegistry {
 [pscustomobject]@{Path=$script:Canonical;Head=('a'*40);Branch='refs/heads/main'}
 foreach($n in 1..201){[pscustomobject]@{Path=('C:\legacy-'+$n);Head=('a'*40);Branch='refs/heads/legacy'}}
 if($script:FakeRegistered){[pscustomobject]@{Path=$script:FakeTarget;Head=('a'*40);Branch='refs/heads/fixture-task'}}
}
function Invoke-LocalGit {
 param([string]$Directory,[string[]]$Arguments,[int[]]$Allowed=@(0))
 if($Arguments[0] -eq 'worktree' -and $Arguments[1] -eq 'add'){$script:FakeAdds++;$script:FakeRegistered=$true;return [pscustomobject]@{Code=0;Text=''}}
 if($Arguments[0] -eq 'rev-parse'){return [pscustomobject]@{Code=0;Text=('a'*40)}}
 if($Arguments[0] -eq 'show-ref'){return [pscustomobject]@{Code=1;Text=''}}
 if($Arguments[0] -eq 'check-ref-format' -or $Arguments[0] -eq 'merge-base'){return [pscustomobject]@{Code=0;Text=''}}
 if($Arguments[0] -eq 'status'){return [pscustomobject]@{Code=0;Text=$script:FakeDirty}}
 if($Arguments[0] -eq 'for-each-ref'){return [pscustomobject]@{Code=0;Text='refs/heads/retained'}}
 throw ('UNEXPECTED_MOCK_GIT:'+($Arguments -join ','))
}
'@
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'worktree-governance.ps1'))
$source=$source.Replace('. (Join-Path $PSScriptRoot ''worktree-common.ps1'')',$mock)
$command=[ScriptBlock]::Create($source)
'[]' | Set-Content -LiteralPath $script:TestRegistry -Encoding utf8
$status=& $command -Action Status | ConvertFrom-Json
Check '201 unclassified trees do not block LOCAL' ($status.LegacyUnclassified -eq 201 -and $status.ActiveAdditional -eq 0)
$blocked=$false;try{$null=& $command -Action Create -Path $script:FakeTarget -TaskId FIXTURE -Owner TEST -CompletionCriteria fixture -Execute}catch{$blocked=$_.Exception.Message -eq 'LOCAL_FIRST_CREATION_OR_ACTIVATION_REFUSED'}
Check 'Execute refuses unjustified creation' ($blocked -and $script:FakeAdds -eq 0)
Rows 2 | ConvertTo-Json -AsArray | Set-Content -LiteralPath $script:TestRegistry -Encoding utf8
$created=& $command -Action Create -Path $script:FakeTarget -TaskId FIXTURE -Owner TEST -CompletionCriteria fixture -IsolationReason ReleaseVerification -IsolationEvidence SYNTHETIC_ONLY -BranchName fixture-task -Execute | ConvertFrom-Json
$stored=@(Get-Content -LiteralPath $script:TestRegistry -Raw | ConvertFrom-Json)
Check 'Creation reserves then activates third slot' ($script:FakeAdds -eq 1 -and $created.State -eq 'ACTIVE' -and @($stored | Where-Object State -eq 'ACTIVE').Count -eq 3 -and $stored[-1].History[0].State -eq 'CREATED')
Check 'Creation never installs dependencies' (-not $created.DependenciesInstalled)
$script:FakeDirty=' M file';$blocked=$false;try{$null=& $command -Action Complete -Path $script:FakeTarget -TaskId FIXTURE -Evidence fixture -BranchDisposition BRANCH_RETAINED -Execute}catch{$blocked=$_.Exception.Message -eq 'SAVE_DIRTY_OR_UNTRACKED_WORK_BEFORE_COMPLETION'}
Check 'Dirty work prevents completion' $blocked
$script:FakeDirty=''
$done=& $command -Action Complete -Path $script:FakeTarget -TaskId FIXTURE -Evidence SYNTHETIC_ONLY -BranchDisposition BRANCH_RETAINED -Execute | ConvertFrom-Json
Check 'Completion checks saved work and branch proof' ($done.State -eq 'COMPLETED')
$script:FakeCaches=$true;$blocked=$false;try{$null=& $command -Action Retire -Path $script:FakeTarget -TaskId FIXTURE -Evidence SYNTHETIC_ONLY -Execute}catch{$blocked=$_.Exception.Message -like 'RETIREMENT_PENDING_REVIEWED_CACHE_CLEANUP:*'}
Check 'Remaining caches block retirement' $blocked
$script:FakeCaches=$false
$end=& $command -Action Retire -Path $script:FakeTarget -TaskId FIXTURE -Evidence SYNTHETIC_ONLY -Execute | ConvertFrom-Json
$stored=@(Get-Content -LiteralPath $script:TestRegistry -Raw | ConvertFrom-Json)
Check 'Retirement recorded without deletion' ($end.State -eq 'RETIRED' -and -not $end.SourceDeleted)
Check 'Retirement is not reclaim permission' (-not $stored[-1].ReclaimEligible)
$script:FakeRegistered=$false
$reservation=[pscustomobject]@{TASK_ID='FAILED-CREATE';Owner='TEST';Path=$script:FakeTarget;Branch='refs/heads/retained';Head='';State='CREATED';Purpose='fixture';History=@([pscustomobject]@{State='CREATED'})}
ConvertTo-Json -InputObject @($reservation) -Depth 8 | Set-Content -LiteralPath $script:TestRegistry -Encoding utf8
$abandon=& $command -Action Abandon -Path $script:FakeTarget -TaskId FAILED-CREATE -Evidence SYNTHETIC_ONLY -Execute | ConvertFrom-Json
Check 'Owner can abandon an unused failed reservation without deletion' ($abandon.State -eq 'ABANDONED' -and -not $abandon.SourceDeleted)
$retireReservation=& $command -Action Retire -Path $script:FakeTarget -TaskId FAILED-CREATE -Evidence SYNTHETIC_ONLY -Execute | ConvertFrom-Json
Check 'Unused reservation can reach terminal retirement safely' ($retireReservation.State -eq 'RETIRED' -and -not $retireReservation.BranchDeleted)
$file=Join-Path $fixture 'slots.txt';[IO.File]::WriteAllText($file,'2')
$fn=(Get-Command Get-LocalFirstDecision).Definition
$worker=@'
param($file,$definition)
$script:Canonical='C:\canonical-fixture'
Set-Item Function:Get-LocalFirstDecision ([ScriptBlock]::Create($definition))
$lock=$null
try{
 try{$lock=[IO.File]::Open(($file+'.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)}catch{return 'BUSY'}
 $n=[int][IO.File]::ReadAllText($file);$r=@(for($i=0;$i -lt $n;$i++){[pscustomobject]@{Path=('C:\fake-'+$i);State='ACTIVE'}})
 $d=Get-LocalFirstDecision $r ReleaseVerification fixture
 if(-not $d.Allowed){return 'DENIED'}
 [Threading.Thread]::Sleep(100);[IO.File]::WriteAllText($file,[string]($n+1));'ALLOCATED'
}finally{if($null -ne $lock){$lock.Dispose()}}
'@
$a=[PowerShell]::Create();$b=[PowerShell]::Create()
try{$null=$a.AddScript($worker).AddArgument($file).AddArgument($fn);$null=$b.AddScript($worker).AddArgument($file).AddArgument($fn);$x=$a.BeginInvoke();$y=$b.BeginInvoke();$v=@($a.EndInvoke($x))+@($b.EndInvoke($y));if($a.HadErrors -or $b.HadErrors){throw 'CONCURRENT_WORKER_FAILED'};Check 'Concurrent callers cannot both take last slot' (@($v | Where-Object {$_ -eq 'ALLOCATED'}).Count -eq 1 -and [IO.File]::ReadAllText($file) -eq '3')}finally{$a.Dispose();$b.Dispose()}
$restore=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'worktree-restore.ps1'))
Check 'Restore delegates creation to shared guard' ($restore.Contains('worktree-governance.ps1') -and -not $restore.Contains('@(''worktree'',''add'''))
Check 'Real lifecycle registry untouched by tests' (-not (Microsoft.PowerShell.Management\Test-Path -LiteralPath (Join-Path $root '.git/worktree-governance/lifecycle.json')))
$report=[pscustomobject]@{TaskId='VBC-LOCAL-FIRST-DEVELOPMENT-GOVERNANCE-FINAL';Tests=$results;SyntheticGitCallsOnly=$true;RealWorktreesCreated=0;NpmExecuted=$false;EvidenceDirectory=$fixture}
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $root '.git/worktree-governance/validation.json') -Encoding utf8
[pscustomobject]@{Passed=$results.Count;RealWorktreesCreated=0;NpmExecuted=$false}|ConvertTo-Json
