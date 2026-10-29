#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$BackupDirectory,[switch]$Execute,[string]$Confirmation='',
 [string]$TaskId='', [string]$Owner='',
 [ValidateSet('None','ParallelCanonicalTask','DangerousExperiment','ReleaseVerification','PerformanceMigrationVerification')][string]$IsolationReason='None',
 [string]$IsolationEvidence='', [string]$ParallelTaskId='', [string]$OwnerLimitApproval='')
. (Join-Path $PSScriptRoot 'worktree-common.ps1')
Assert-Canonical
$backup=[IO.Path]::GetFullPath($BackupDirectory).TrimEnd('\')
if(-not $backup.StartsWith($script:BackupParent+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Backup outside protected root'}
Assert-NoLinks $backup
$m=Get-Content -LiteralPath (Join-Path $backup 'manifest.json') -Raw | ConvertFrom-Json
$bundle=Join-Path $backup 'history.bundle'
if((Get-FileHash -LiteralPath $bundle -Algorithm SHA256).Hash -ne $m.BundleSha256){throw 'Bundle digest mismatch'}
$null=Invoke-LocalGit $script:Canonical @('bundle','verify',$bundle)
$target=[IO.Path]::GetFullPath($m.Path).TrimEnd('\');Assert-NoLinks $target
if($target -ieq $script:Canonical -or [IO.Path]::GetDirectoryName($target) -ine [IO.Path]::GetDirectoryName($script:Canonical) -or -not [IO.Path]::GetFileName($target).StartsWith('vbc-b2b-portal-')){throw 'Invalid restore target'}
if(Test-Path -LiteralPath $target){throw 'Restore target exists; preserve it'}
if(-not $Execute){[pscustomobject]@{Mode='DRY_RUN';Target=$target;Head=$m.Head;OriginalBranch=$m.Branch;RestoresAs='detached';BundleVerified=$true}|ConvertTo-Json;exit 0}
if($Confirmation -cne 'RESTORE-VERIFIED-WORKTREE'){throw 'Explicit restore confirmation required'}
$null=Invoke-LocalGit $script:Canonical @('cat-file','-e',($m.Head+'^{commit}'))
# Local branches are never overwritten. The original branch identity is in the manifest.
# Recovery also consumes an active slot; use the same locked creation guard.
& (Join-Path $PSScriptRoot 'worktree-governance.ps1') -Action Create -Path $target -Detach -BaseRef $m.Head -TaskId $TaskId -Owner $Owner -IsolationReason $IsolationReason -IsolationEvidence $IsolationEvidence -ParallelTaskId $ParallelTaskId -OwnerLimitApproval $OwnerLimitApproval -CompletionCriteria 'Restore exact manifest HEAD and verify every source SHA-256' -Execute | Out-Null

foreach($f in $m.Files){$full=[IO.Path]::GetFullPath((Join-Path $target $f.Path));if(-not $full.StartsWith($target+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid manifest path'};if((Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash -ne $f.Sha256){throw 'Restore source hash mismatch; preserve for inspection'}}
[pscustomobject]@{Restored=$target;Head=$m.Head;VerifiedFiles=$m.Files.Count;OriginalBranch=$m.Branch;State='ACTIVE'} | ConvertTo-Json
