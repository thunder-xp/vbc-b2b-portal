#requires -Version 7.0
# Real temporary file trees + mocked process/Git metadata. No Git worktree creation.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'worktree-common.ps1')
$originalGitFunction=${function:Invoke-LocalGit}
$originalCanonical=$script:Canonical
$fixture=Join-Path $originalCanonical ('.git/worktree-governance/legacy-test-'+[Guid]::NewGuid().ToString('N'))
$null=[IO.Directory]::CreateDirectory($fixture)
$results=[Collections.Generic.List[object]]::new()
function Check([string]$Name,[bool]$Condition){if(-not $Condition){throw ('FAIL:'+ $Name)};$results.Add([pscustomobject]@{Test=$Name;Result='PASS'})}
function Refused([scriptblock]$Action){try{& $Action | Out-Null;$false}catch{$true}}
$candidate=Join-Path $fixture 'vbc-b2b-portal-fixture'
$script:Canonical=Join-Path $fixture 'main'
$admin=Join-Path $script:Canonical '.git/worktrees/fixture'
foreach($p in @($candidate,$admin)){$null=[IO.Directory]::CreateDirectory($p)}
[IO.File]::WriteAllText((Join-Path $candidate '.git'),('gitdir: '+$admin))
[IO.File]::WriteAllText((Join-Path $admin gitdir),(Join-Path $candidate '.git'))
$script:MockIgnored="node_modules/`0";$script:MockStatus='';$script:MockAncestor=$true;$script:MockRecords=@();$script:MockHead='a'*40
$script:MockProcesses=@([pscustomobject]@{ProcessId=900001;ParentProcessId=0;Name='Code.exe';CommandLine='Code.exe C:\unrelated'},[pscustomobject]@{ProcessId=900002;ParentProcessId=0;Name='node.exe';CommandLine=$null})
$script:MockTracked="source.txt`0"
function Invoke-LocalGit {
 param([string]$Directory,[string[]]$Arguments,[int[]]$Allowed=@(0),[string]$InputText)
 $code=0;$text=switch($Arguments[0]){
  'status' {$script:MockStatus}
  'rev-parse' {if($Arguments -contains '--absolute-git-dir'){$admin}elseif($Arguments -contains 'origin/main'){'b'*40}elseif($Arguments[-1] -like '*^{tree}'){'c'*40}else{$script:MockHead}}
  'merge-base' {if(-not $script:MockAncestor){$code=1};''}
  'reflog' {$script:MockHead}
  'ls-files' {if($Arguments -contains '--ignored'){(@($script:MockIgnored.Split([char]0,[StringSplitOptions]::RemoveEmptyEntries) | Where-Object {Test-Path -LiteralPath (Join-Path $candidate $_)}) -join [char]0)+[char]0}else{$script:MockTracked}}
  'cat-file' {''}
  'worktree' {$script:RemovalCalls++;$script:RemovalArguments=$Arguments;throw 'SYNTHETIC_ORDINARY_GIT_OPEN_HANDLE_REFUSAL'}
  default {throw ('Unexpected synthetic Git command: '+$Arguments[0])}
 }
 [pscustomobject]@{Code=$code;Text=[string]$text}
}
function Assert-Canonical {}
function Get-WorktreeRegistry {[pscustomobject]@{Path=$candidate;Head=$script:MockHead;Branch='refs/heads/fixture';Locked=$false;Prunable=$false}}
function Get-WorktreeLifecycleRecords {$script:MockRecords}
function Get-CimInstance {param($ClassName,$ErrorAction) $script:MockProcesses}
function Write-Fixture([string]$Relative,[string]$Content='fixture'){$p=Join-Path $candidate $Relative;$null=[IO.Directory]::CreateDirectory((Split-Path $p));[IO.File]::WriteAllText($p,$Content)}
Write-Fixture source.txt
Write-Fixture node_modules/package/index.js
Check 'Exact command-line path matches' (Test-CommandCandidatePath ('node.exe "'+$candidate+'\server.js"') $candidate)
Check 'Forward slash variant matches' (Test-CommandCandidatePath ('node '+$candidate.Replace('\','/')+'/server.js') $candidate)
Check 'File URI path matches' (Test-CommandCandidatePath ('Code --folder-uri file:///'+$candidate.Replace('\','/')) $candidate)
Check 'Sibling path does not match' (-not (Test-CommandCandidatePath ('node "'+$candidate+'-other\server.js"') $candidate))
Check 'Unrelated names and unreadable CWD do not imply activity' ((Get-CandidateActivity $candidate).State -eq 'NO_CANDIDATE_ACTIVITY_EVIDENCE')
Push-Location $candidate
try{Check 'Current shell inside candidate protects it' ((Get-CandidateActivity $candidate).State -eq 'ACTIVE_TASK_PROVEN')}finally{Pop-Location}
$script:MockProcesses+= [pscustomobject]@{ProcessId=900003;ParentProcessId=0;Name='cmd.exe';CommandLine=('cmd /c "'+$candidate+'\task.cmd"')}
Check 'Candidate-specific cmd protects' ((Get-CandidateActivity $candidate).State -eq 'ACTIVE_TASK_PROVEN')
$script:MockProcesses=$script:MockProcesses[0..1]
$script:MockRecords=@([pscustomobject]@{Path=$candidate;State='ACTIVE'})
Check 'Active lifecycle reservation protects' ((Get-CandidateActivity $candidate).State -eq 'ACTIVE_TASK_PROVEN')
$script:MockRecords=@()
$data=Get-IgnoredClassification $candidate
Check 'Known generated root is classified' ($data.GeneratedRoots.Count -eq 1 -and $data.Protected.Count -eq 0 -and $data.Unknown.Count -eq 0)
$fingerprint=$data.Fingerprint
Write-Fixture node_modules/.env.local 'SYNTHETIC_NOT_A_SECRET'
Check 'Secret inside cache overrides generated classification' ((Get-IgnoredClassification $candidate).Protected -contains 'node_modules/.env.local')
[IO.File]::Delete((Join-Path $candidate 'node_modules/.env.local'))
Write-Fixture unknown/payload.bin
$script:MockIgnored="node_modules/`0unknown/`0"
Check 'Unknown ignored directory protects' ((Get-IgnoredClassification $candidate).Unknown -contains 'unknown')
$script:MockIgnored="node_modules/`0"
Write-Fixture supabase/migrations/example.sql
$script:MockTracked+="supabase/migrations/example.sql`0"
Check 'Tracked Supabase source is not persistent ignored state' ((Get-IgnoredClassification $candidate).Protected.Count -eq 0)
Write-Fixture .env.tracked SYNTHETIC_ONLY
$script:MockTracked+=".env.tracked`0"
Check 'Tracked merged template is recoverable Git source, not ignored local data' ((Get-IgnoredClassification $candidate).Protected -notcontains '.env.tracked')
[IO.File]::Delete((Join-Path $candidate '.env.tracked'))
$script:MockTracked="source.txt`0supabase/migrations/example.sql`0"
Write-Fixture .env.local SYNTHETIC_ONLY
$script:MockIgnored="node_modules/`0.env.local`0"
Check 'Ignored env file blocks acceptance' (-not (Get-ReclaimCheck $candidate).EligibleForLegacyAcceptance)
[IO.File]::Delete((Join-Path $candidate '.env.local'))
Write-Fixture .next/cache/output.js
$script:MockIgnored=".next/`0"
Check 'Next cache alone does not block review' ((Get-ReclaimCheck $candidate).EligibleForLegacyAcceptance)
Remove-ReviewedGeneratedRoot $candidate .next
$script:MockIgnored="node_modules/`0"
Write-Fixture supabase/.temp/local.db
Check 'Local database protects' ((Get-IgnoredClassification $candidate).Protected -contains 'supabase/.temp/local.db')
Check 'Vercel local configuration remains protected' (Test-ProtectedLocalName '.vercel/project.json')
[IO.File]::Delete((Join-Path $candidate 'supabase/.temp/local.db'))
$hard=Join-Path $candidate 'node_modules/package/hard.js'
$null=New-Item -ItemType HardLink -Path $hard -Target (Join-Path $candidate 'source.txt')
Check 'NTFS hardlink protects' ((Get-IgnoredClassification $candidate).Links -contains 'node_modules/package/hard.js')
[IO.File]::Delete($hard)
$junction=Join-Path $candidate 'node_modules/linked'
$null=New-Item -ItemType Junction -Path $junction -Target (Join-Path $candidate unknown)
Check 'Junction protects without traversal' ((Get-IgnoredClassification $candidate).Links -contains 'node_modules/linked')
Check 'Cache deletion refuses junction' (Refused {Remove-ReviewedGeneratedRoot $candidate node_modules})
[IO.Directory]::Delete($junction,$false)
# Earlier failure may have removed pure cache leaves; recreate for the positive test.
Write-Fixture node_modules/package/index.js
$script:MockTracked+="node_modules/tracked.js`0"
Check 'Tracked entry below a cache prevents classification as removable' ((Get-IgnoredClassification $candidate).Unknown -contains 'node_modules:TRACKED_CONTENT')
$script:MockTracked="source.txt`0supabase/migrations/example.sql`0"
Check 'Clean merged cache-only legacy can be reviewed' ((Get-ReclaimCheck $candidate).EligibleForLegacyAcceptance)
Check 'Reviewability alone does not authorize reclamation' (-not (Get-ReclaimCheck $candidate).Eligible)
[IO.File]::WriteAllText((Join-Path $admin MERGE_HEAD),('a'*40))
Check 'Git operation is reported and blocks acceptance' ((Get-ReclaimCheck $candidate).GitOperation -contains 'MERGE_HEAD' -and -not (Get-ReclaimCheck $candidate).EligibleForLegacyAcceptance)
[IO.File]::Delete((Join-Path $admin MERGE_HEAD))
$script:MockStatus=' M source.txt'
Check 'Dirty refuses review' (-not (Get-ReclaimCheck $candidate).EligibleForLegacyAcceptance)
$script:MockStatus='';$script:MockAncestor=$false
Check 'Unmerged refuses review' (-not (Get-ReclaimCheck $candidate).EligibleForLegacyAcceptance)
$script:MockAncestor=$true
$record=[pscustomobject]@{Path=$candidate;State='LEGACY_RECLAIM_REVIEWED';Head=$script:MockHead;Branch='refs/heads/fixture';ReviewedAtUtc=[DateTime]::UtcNow.ToString('o');ReviewedBy='SYNTHETIC';AcceptanceTaskId='REVIEW-FIXTURE';AcceptanceEvidence='synthetic tests';ReclaimApproval='SYNTHETIC_ONLY';WorkingTreeClean=$true;HeadMergedIntoOriginMain=$true;IgnoredDataClassification=Get-IgnoredClassification $candidate;MarkerSha256=''}
$script:MockRecords=@($record)
Check 'Explicit exact-HEAD legacy acceptance authorizes otherwise-safe state' ((Get-ReclaimCheck $candidate).Eligible)
Check 'Changed HEAD invalidates legacy acceptance' (-not (Test-LegacyAcceptance $record ('d'*40) 'refs/heads/fixture'))
Check 'Changed branch invalidates legacy acceptance' (-not (Test-LegacyAcceptance $record $script:MockHead 'refs/heads/other'))
Write-Fixture .codex/CURRENT_TASK.md "TASK_ID: HISTORICAL-FIXTURE`nDo not copy arbitrary task prose."
$marker=Join-Path $candidate '.codex/CURRENT_TASK.md'
[IO.File]::SetLastWriteTimeUtc($marker,[DateTime]::UtcNow.AddDays(-10))
$m=Get-LegacyTaskMarker $candidate $true $true NO_CANDIDATE_ACTIVITY_EVIDENCE REVIEW-FIXTURE SYNTHETIC_ONLY
Check 'Old clean merged idle accepted marker can be stale' ($m.State -eq 'STALE_LEGACY_TASK_MARKER' -and $m.TaskId -eq 'HISTORICAL-FIXTURE')
Check 'Stale decision never archives arbitrary task contents' (-not ($m.PSObject.Properties.Name -contains 'Contents'))
Check 'Marker without owner approval remains protected' ((Get-LegacyTaskMarker $candidate $true $true NO_CANDIDATE_ACTIVITY_EVIDENCE REVIEW-FIXTURE '').State -eq 'UNFINISHED_TASK_NOT_DISPROVEN')
Check 'Positive activity prevents stale marker' ((Get-LegacyTaskMarker $candidate $true $true ACTIVE_TASK_PROVEN REVIEW-FIXTURE SYNTHETIC_ONLY).State -eq 'UNFINISHED_TASK_NOT_DISPROVEN')
Check 'Same task is never stale' ((Get-LegacyTaskMarker $candidate $true $true NO_CANDIDATE_ACTIVITY_EVIDENCE HISTORICAL-FIXTURE SYNTHETIC_ONLY).State -eq 'UNFINISHED_TASK_NOT_DISPROVEN')
$record.MarkerSha256='0'*64
Check 'Marker changed after review protects' ((Get-ReclaimCheck $candidate).Reasons -contains 'TASK_MARKER_CHANGED_SINCE_REVIEW')
Write-Fixture .codex/CURRENT_TASK.md 'TASK_ID: DIFFERENT-FIXTURE'
Check 'Recent marker remains protected' ((Get-LegacyTaskMarker $candidate $true $true NO_CANDIDATE_ACTIVITY_EVIDENCE REVIEW-FIXTURE SYNTHETIC_ONLY).State -eq 'UNFINISHED_TASK_NOT_DISPROVEN')
[IO.File]::Delete($marker)
$script:MockRecords=@()
 $normal=[pscustomobject]@{Path=$candidate;Head=$script:MockHead;State='RETIRED';ReclaimEligible=$true;ReclaimApproval='SYNTHETIC_ONLY';AcceptanceEvidence='synthetic normal acceptance';Owner='SYNTHETIC';TASK_ID='NORMAL-FIXTURE'}
 $script:MockRecords=@($normal)
 Check 'Normal RETIRED lifecycle remains accepted' ((Get-ReclaimCheck $candidate).Eligible -and -not (Get-ReclaimCheck $candidate).LegacyAccepted)
 $script:MockRecords=@()
Check 'Non-allowlisted deletion is refused' (Refused {Remove-ReviewedGeneratedRoot $candidate unknown})
Check 'Path escape deletion is refused' (Refused {Remove-ReviewedGeneratedRoot $candidate '../unknown'})
Check 'Canonical cache deletion is refused even through the helper' (Refused {Remove-ReviewedGeneratedRoot $script:Canonical node_modules})
Remove-ReviewedGeneratedRoot $candidate node_modules
$script:MockIgnored=''
Check 'Explicit cache root removed while source preserved' (-not (Test-Path (Join-Path $candidate node_modules)) -and (Test-Path (Join-Path $candidate source.txt)))
Check 'Removing regenerable roots leaves persistent classification identity stable' ((Get-IgnoredClassification $candidate).Fingerprint -eq $fingerprint)
# Exercise the actual review entrypoint with synthetic Git/process dependencies.
function Save-ReclaimRecords($Records){$script:MockRecords=@($Records);$script:SavedReview=$true}
$script:SavedReview=$false
$reviewText=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'worktree-legacy-review.ps1')).Replace(". (Join-Path `$PSScriptRoot 'worktree-common.ps1')",'')
$review=[scriptblock]::Create($reviewText)
& $review -Path $candidate | Out-Null
Check 'Review dry-run never persists acceptance' (-not $script:SavedReview)
Check 'Review execution rejects changed expected HEAD' (Refused {& $review -Path $candidate -ExpectedHead ('f'*40) -ReviewedBy SYNTHETIC -AcceptanceTaskId REVIEW-FIXTURE -AcceptanceEvidence 'synthetic acceptance' -ReclaimApproval SYNTHETIC_ONLY -Execute})
$script:MockIgnored="unknown/`0"
Check 'Owner approval cannot override unknown data' (Refused {& $review -Path $candidate -ExpectedHead $script:MockHead -ReviewedBy SYNTHETIC -AcceptanceTaskId REVIEW-FIXTURE -AcceptanceEvidence 'synthetic acceptance' -ReclaimApproval SYNTHETIC_ONLY -Execute})
$script:MockIgnored=''
& $review -Path $candidate -ExpectedHead $script:MockHead -ReviewedBy SYNTHETIC -AcceptanceTaskId REVIEW-FIXTURE -AcceptanceEvidence 'synthetic acceptance' -ReclaimApproval SYNTHETIC_ONLY -Execute | Out-Null
Check 'Execution persists explicit legacy review' ($script:SavedReview -and $script:MockRecords.Count -eq 1 -and $script:MockRecords[0].State -eq 'LEGACY_RECLAIM_REVIEWED')
Check 'Legacy review does not invent original TASK_ID or Owner' (-not $script:MockRecords[0].PSObject.Properties['TASK_ID'] -and -not $script:MockRecords[0].PSObject.Properties['Owner'])
# Run the real reclaimer control flow up to an ordinary Git refusal. File cache
# deletion is real in the disposable fixture; source/registry removal is mocked.
$originalIdentityFunction=${function:Get-MergedRecoveryIdentity}
function Get-MergedRecoveryIdentity([string]$Head){[pscustomobject]@{Tree=('c'*40);TrackedTreeIdentitySha256=('d'*64);TrackedEntries=1;VerifiedObjects=3}}
$script:BackupParent=Join-Path $fixture backups
$null=[IO.Directory]::CreateDirectory($script:BackupParent)
$script:RemovalCalls=0;$script:RemovalArguments=@()
Write-Fixture node_modules/package/index.js
$script:MockIgnored="node_modules/`0"
$reclaimerText=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'worktree-safe-reclaim.ps1')).Replace(". (Join-Path `$PSScriptRoot 'worktree-common.ps1')",'')
$reclaimer=[scriptblock]::Create($reclaimerText)
& $reclaimer -Path $candidate | Out-Null
Check 'Reclaimer dry-run leaves cache and registry intact' ((Test-Path (Join-Path $candidate node_modules)) -and $script:RemovalCalls -eq 0)
Check 'Reclaimer execution requires exact confirmation' (Refused {& $reclaimer -Path $candidate -ExpectedHead $script:MockHead -Execute})
Check 'Ordinary Git refusal propagates without fallback' (Refused {& $reclaimer -Path $candidate -ExpectedHead $script:MockHead -Execute -Confirmation RECLAIM-VERIFIED-WORKTREE})
Check 'Only ordinary non-force Git removal was attempted' ($script:RemovalCalls -eq 1 -and $script:RemovalArguments.Count -eq 3 -and $script:RemovalArguments[0] -eq 'worktree' -and $script:RemovalArguments[1] -eq 'remove')
Check 'Git refusal preserves source and does not mark RETIRED' ((Test-Path (Join-Path $candidate source.txt)) -and $script:MockRecords[0].State -eq 'LEGACY_RECLAIM_REVIEWED')
Check 'Accepted pure cache was removed before ordinary Git attempt' (-not (Test-Path (Join-Path $candidate node_modules)))
Set-Item Function:Get-MergedRecoveryIdentity $originalIdentityFunction
# Exercise batch stopping/checkpoint behavior with four planned synthetic failures.
$realCheck=${function:Get-ReclaimCheck}
function Get-ReclaimCheck {param($Path,$AcceptanceTaskId,$ReclaimApproval) throw 'SYNTHETIC_UNEXPECTED_FAILURE'}
$batchFile=Join-Path $fixture batch-plan.json
[pscustomobject]@{Candidates=@(1..4 | ForEach-Object {[pscustomobject]@{Path=(Join-Path $fixture ('vbc-b2b-portal-batch-'+$_));Head=('a'*40)}})} | ConvertTo-Json -Depth 4 | Set-Content $batchFile
$batchText=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'worktree-retire-backlog.ps1')).Replace(". (Join-Path `$PSScriptRoot 'worktree-common.ps1')",'')
$batch=[scriptblock]::Create($batchText)
Check 'Batch stops after three consecutive unexpected failures' (Refused {& $batch -PlanPath $batchFile -MaxCount 4 -Execute -Confirmation RETIRE-EXACT-REVIEWED-PLAN})
$lastBatch=Get-ChildItem -LiteralPath $script:BackupParent -Directory -Filter 'backlog-*' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$batchResult=Get-Content (Join-Path $lastBatch.FullName batch-result.json) -Raw | ConvertFrom-Json
Check 'Fourth candidate never runs after three failures' ($batchResult.StopReason -eq 'THREE_CONSECUTIVE_UNEXPECTED_FAILURES' -and $batchResult.Results.Count -eq 3)
Check 'Each failure has durable evidence and disk-space checkpoint' (@(Get-Content (Join-Path $lastBatch.FullName results.jsonl)).Count -eq 3 -and @($batchResult.Results | Where-Object {$_.FreeBytesAfter -gt 0}).Count -eq 3)
Check 'Failed unattempted candidates are never reported removed' ($batchResult.Removed -eq 0)
Set-Item Function:Get-ReclaimCheck $realCheck
$script:MockRecords=@($normal)
[pscustomobject]@{Candidates=@([pscustomobject]@{Path=$candidate;Head=$script:MockHead})} | ConvertTo-Json -Depth 4 | Set-Content $batchFile
$callsBefore=$script:RemovalCalls
$normalBatch=(& $batch -PlanPath $batchFile -Execute -Confirmation RETIRE-EXACT-REVIEWED-PLAN | Out-String) | ConvertFrom-Json
Check 'Legacy batch never removes a normal RETIRED lifecycle tree' ($normalBatch.Results[0].Outcome -eq 'PRESERVED_SAFETY_OR_ACCEPTANCE' -and $script:RemovalCalls -eq $callsBefore -and (Test-Path (Join-Path $candidate source.txt)))
# Verify bounded recovery against real canonical objects without creating a worktree.
Set-Item Function:Invoke-LocalGit $originalGitFunction
$script:Canonical=$originalCanonical
$realHead=(Invoke-LocalGit $script:Canonical @('rev-parse','origin/main')).Text.Trim()
$recovery=Join-Path $fixture recovery
New-ProtectedDirectory $recovery
$m=New-MergedRecoveryManifest ([pscustomobject]@{Path='C:\VibeCoding\Projects\B2B\vbc-b2b-portal-RECOVERY-PROOF-ONLY';Head=$realHead;Branch='';OriginMain=$realHead}) $recovery
$verified=Assert-MergedRecoveryManifest $recovery
Check 'Canonical commit/tree/blob objects support bounded recovery' ($verified.Head -eq $realHead -and $verified.VerifiedObjects -gt 0)
Check 'Recovery evidence is small and creates no bundle' ((Get-Item (Join-Path $recovery manifest.json)).Length -lt 64KB -and -not (Test-Path (Join-Path $recovery history.bundle)))
Add-Content -LiteralPath (Join-Path $recovery manifest.json) ' '
Check 'Manifest tampering is detected' (Refused {Assert-MergedRecoveryManifest $recovery})
$results | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $fixture results.json)
[pscustomobject]@{Passed=$results.Count;RealWorktreesCreated=0;RealWorktreesRemoved=0;EvidenceDirectory=$fixture} | ConvertTo-Json
