#requires -Version 7.0
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'worktree-common.ps1')
. (Join-Path $PSScriptRoot 'worktree-data-common.ps1')
$realCanonical=$script:Canonical
$fixture=Join-Path $script:BackupParent ('data-fixture-'+[Guid]::NewGuid().ToString('N'))
New-ProtectedDirectory $fixture
$results=[Collections.Generic.List[object]]::new()
function Check([string]$Name,[bool]$Condition){if(-not $Condition){throw ('FAIL:'+ $Name)};$results.Add([pscustomobject]@{Test=$Name;Result='PASS'})}
function Refused([scriptblock]$Action){try{& $Action | Out-Null;$false}catch{$true}}
$target=Join-Path $fixture target;$generated=Join-Path $fixture generated
foreach($p in @($target,$generated)){$null=[IO.Directory]::CreateDirectory($p)}
$sentinel=Join-Path $target sentinel.txt;[IO.File]::WriteAllText($sentinel,'SYNTHETIC TARGET CONTENT - NOT A SECRET')
$before=(Get-FileHash -LiteralPath $sentinel).Hash
Initialize-DataLinkNative
$junction=Join-Path $fixture junction
$null=New-Item -ItemType Junction -Path $junction -Target $target
Check 'Directory junction is recognized as a reparse point' ([bool]((Get-Item -LiteralPath $junction -Force).Attributes -band [IO.FileAttributes]::ReparsePoint))
[VbcDataUnlink]::DirectoryLink($junction)
Check 'RemoveDirectoryW unlinks junction without deleting nonempty target' (-not(Test-Path -LiteralPath $junction) -and (Get-FileHash -LiteralPath $sentinel).Hash -ceq $before)
$nested=Join-Path $generated linked
$null=New-Item -ItemType Junction -Path $nested -Target $target
[VbcDataUnlink]::DirectoryLink($nested)
[IO.Directory]::Delete($generated,$false)
Check 'Generated root with junction can be removed after unlink without target traversal' ((Test-Path -LiteralPath $target) -and (Get-FileHash -LiteralPath $sentinel).Hash -ceq $before)
$sym=Join-Path $fixture symbolic
try{$null=New-Item -ItemType SymbolicLink -Path $sym -Target $target -ErrorAction Stop;$symbolicCreated=$true}catch{$symbolicCreated=$false;$results.Add([pscustomobject]@{Test='Directory symbolic link';Result='SKIP_NOT_PERMITTED'})}
if($symbolicCreated){[VbcDataUnlink]::DirectoryLink($sym);Check 'Directory symbolic unlink preserves target bytes' ((Get-FileHash -LiteralPath $sentinel).Hash -ceq $before -and -not(Test-Path -LiteralPath $sym))}
$hard=Join-Path $fixture hard.txt
$null=New-Item -ItemType HardLink -Path $hard -Target $sentinel
Initialize-ReclaimFileIdentity
Check 'Synthetic file hardlink count is two' ([VbcReclaimFileIdentity]::Links($hard) -eq 2)
[IO.File]::Delete($hard)
Check 'Deleting one hardlink retains target with identical bytes' ([VbcReclaimFileIdentity]::Links($sentinel) -eq 1 -and (Get-FileHash -LiteralPath $sentinel).Hash -ceq $before)
$originalGit=${function:Invoke-LocalGit};$originalRegistry=${function:Get-WorktreeRegistry};$originalAssert=${function:Assert-Canonical};$originalCacheRoots=${function:Get-ProvenPackageCacheRoots}
$originalProfile=$env:USERPROFILE
$realRegistry=(Invoke-LocalGit $realCanonical @('worktree','list','--porcelain')).Text
$script:Canonical=Join-Path $fixture main
$script:DataCandidate=Join-Path $fixture vbc-b2b-portal-data
$other=Join-Path $fixture vbc-b2b-portal-other
$packageCache=Join-Path $fixture package-cache
$admin=Join-Path $script:Canonical '.git/worktrees/data'
foreach($p in @($script:DataCandidate,$other,$packageCache,$admin)){$null=[IO.Directory]::CreateDirectory($p)}
[IO.File]::WriteAllText((Join-Path $script:DataCandidate '.git'),('gitdir: '+$admin))
[IO.File]::WriteAllText((Join-Path $admin gitdir),(Join-Path $script:DataCandidate '.git'))
$script:DataIgnored=@();$script:DataStatus='';$script:DataMerged=$true;$script:DataRecords=@();$script:DataHead='a'*40
function Assert-Canonical {}
function Get-WorktreeRegistry {foreach($p in @($script:Canonical,$script:DataCandidate,$other)){[pscustomobject]@{Path=$p;Head=$script:DataHead;Branch='refs/heads/data';Locked=$false;Prunable=$false}}}
function Get-WorktreeLifecycleRecords {$script:DataRecords}
function Save-ReclaimRecords($Records){$script:DataRecords=@($Records)}
function Get-ProvenPackageCacheRoots {$packageCache}
function Get-CimInstance {param($ClassName,$ErrorAction) [pscustomobject]@{ProcessId=900001;ParentProcessId=0;Name='Code.exe';CommandLine='Code C:\unrelated'}}
function Invoke-LocalGit {
 param([string]$Directory,[string[]]$Arguments,[int[]]$Allowed=@(0),[string]$InputText)
 $code=0;$text=switch($Arguments[0]){
  'status' {$script:DataStatus}
  'rev-parse' {if($Arguments -contains '--absolute-git-dir'){$admin}else{$script:DataHead}}
  'merge-base' {if(-not $script:DataMerged){$code=1};''}
  'reflog' {$script:DataHead}
  'ls-files' {if($Arguments -contains '--ignored'){(@($script:DataIgnored | Where-Object {Test-Path -LiteralPath (Join-Path $script:DataCandidate $_)}) -join [char]0)+[char]0}else{"source.txt`0tsconfig.json`0package.json`0"}}
  default {throw ('Unexpected synthetic Git action '+$Arguments[0])}
 }
 [pscustomobject]@{Code=$code;Text=[string]$text}
}
function Write-DataFile([string]$Relative,[string]$Content='SYNTHETIC_ONLY'){$p=Join-Path $script:DataCandidate $Relative;$null=[IO.Directory]::CreateDirectory((Split-Path $p));[IO.File]::WriteAllText($p,$Content)}
function Accept-DataFixture {
 $data=Get-IgnoredClassification $script:DataCandidate
 $script:DataRecords=@([pscustomobject]@{Path=$script:DataCandidate;Head=$script:DataHead;Branch='refs/heads/data';State='LEGACY_RECLAIM_REVIEWED';ReviewedAtUtc=[DateTime]::UtcNow.ToString('o');ReviewedBy='SYNTHETIC_TEST';AcceptanceTaskId='SYNTHETIC-DATA-REVIEW';AcceptanceEvidence='SYNTHETIC ONLY';ReclaimApproval='SYNTHETIC ONLY';WorkingTreeClean=$true;HeadMergedIntoOriginMain=$true;IgnoredDataClassification=$data;MarkerSha256=''})
}
Write-DataFile source.txt
Write-DataFile tsconfig.json '{"compilerOptions":{"incremental":true},"include":["next-env.d.ts","**/*.ts"]}'
Write-DataFile package.json '{"dependencies":{"next":"16.3.0"}}'
Check 'Tracked-only clean merged legacy remains reviewable' ((Get-ReclaimCheck $script:DataCandidate).EligibleForLegacyAcceptance)
Write-DataFile unknown/payload.bin;$script:DataIgnored=@('unknown/')
Check 'Unknown ignored root remains blocked' (-not (Get-ReclaimCheck $script:DataCandidate).EligibleForLegacyAcceptance)
[IO.File]::Delete((Join-Path $script:DataCandidate unknown/payload.bin));[IO.Directory]::Delete((Join-Path $script:DataCandidate unknown),$false)
$script:DataIgnored=@('.env.local');Write-DataFile .env.local 'SYNTHETIC FIRST'
$first=(Get-IgnoredClassification $script:DataCandidate).Fingerprint
Check 'Protected env remains blocked' (-not (Get-ReclaimCheck $script:DataCandidate).EligibleForLegacyAcceptance)
Check 'Vercel production.env is recognized as secret/config, not project metadata' ((Get-LocalPersistentType '.vercel/production.env') -eq 'ENV_CONFIG')
Write-DataFile .env.local 'SYNTHETIC SECOND'
Check 'Protected byte change changes classification fingerprint' ((Get-IgnoredClassification $script:DataCandidate).Fingerprint -cne $first)
[IO.File]::Delete((Join-Path $script:DataCandidate '.env.local'))
$script:DataIgnored=@();Accept-DataFixture
$script:DataIgnored=@('.env.local');Write-DataFile .env.local
Check 'Exact HEAD acceptance invalidates on local classification change' ((Get-ReclaimCheck $script:DataCandidate).Reasons -contains 'IGNORED_CLASSIFICATION_CHANGED_SINCE_REVIEW')
[IO.File]::Delete((Join-Path $script:DataCandidate '.env.local'))
$script:DataIgnored=@('local.sqlite');Write-DataFile local.sqlite
Check 'Persistent database remains protected' (-not (Get-ReclaimCheck $script:DataCandidate).EligibleForLegacyAcceptance)
[IO.File]::Delete((Join-Path $script:DataCandidate local.sqlite))
$script:DataIgnored=@('next-env.d.ts','tsconfig.tsbuildinfo')
Write-DataFile next-env.d.ts '/// <reference types="next" />'
Write-DataFile tsconfig.tsbuildinfo '{"fileNames":[],"fileInfos":[],"version":"5.9.3"}'
Check 'Proven compiler metadata has explicit generated categories' ((Get-IgnoredClassification $script:DataCandidate).GeneratedMetadata.Count -eq 2)
Write-DataFile tsconfig.tsbuildinfo '{"fileNames":"SYNTHETIC_NON_CACHE_DATA","fileInfos":[],"version":"5.9.3"}'
Check 'Malformed compiler metadata shape remains unknown' ((Get-IgnoredClassification $script:DataCandidate).Unknown -contains 'tsconfig.tsbuildinfo')
Write-DataFile tsconfig.tsbuildinfo '{"fileNames":[],"fileInfos":[],"version":"5.9.3"}'
Write-DataFile next-env.d.ts '// SYNTHETIC custom user note'
Check 'Custom next-env declaration remains unknown' ((Get-IgnoredClassification $script:DataCandidate).Unknown -contains 'next-env.d.ts')
Write-DataFile next-env.d.ts '/// <reference types="next" />'
Write-DataFile tsconfig.tsbuildinfo '{"fileNames":[],"fileInfos":[],"options":{"secret":"SYNTHETIC"},"version":"5.9.3"}'
Check 'Secret-like compiler metadata field is not allowlisted' ((Get-IgnoredClassification $script:DataCandidate).Unknown -contains 'tsconfig.tsbuildinfo')
Write-DataFile tsconfig.tsbuildinfo '{"fileNames":[],"fileInfos":[],"version":"5.9.3"}'
Accept-DataFixture
$beforeData=Get-IgnoredClassification $script:DataCandidate
$meta=@($beforeData.GeneratedMetadata | Where-Object RelativePath -eq 'next-env.d.ts')[0]
Remove-ProvenGeneratedMetadata $script:DataCandidate $meta
Update-ReviewedDataAfterCleanup $script:DataCandidate $script:DataHead $beforeData next-env.d.ts
Check 'Approved metadata cleanup advances only the exact authorized fingerprint delta' ((Get-ReclaimCheck $script:DataCandidate).Eligible)
[IO.File]::Delete((Join-Path $script:DataCandidate tsconfig.tsbuildinfo));$script:DataIgnored=@('.vercel/')
Write-DataFile .vercel/project.json '{"projectId":"prj_fixture","orgId":"team_fixture","projectName":"fixture"}'
$script:DataRecords=@()
Check 'Vercel remains protected without a verified recovery reference' ((Get-IgnoredClassification $script:DataCandidate).Protected -contains '.vercel')
$recovery=Join-Path $fixture metadata-recovery;New-ProtectedDirectory $recovery
[IO.File]::Copy((Join-Path $script:DataCandidate .vercel/project.json),(Join-Path $recovery project.json))
$projectHash=(Get-FileHash (Join-Path $recovery project.json)).Hash
$ref=[pscustomobject]@{Kind='VERCEL_LINK_METADATA_REGENERABLE';Directory=$recovery;TaskId='SYNTHETIC';ReplicationProof=@([pscustomobject]@{Path=$script:DataCandidate;ProjectSha256=$projectHash},[pscustomobject]@{Path=$other;ProjectSha256=$projectHash});Files=@([pscustomobject]@{RelativePath='.vercel/project.json';Sha256=$projectHash})}
$references=Get-MetadataRecoveryFile;$null=[IO.Directory]::CreateDirectory((Split-Path $references))
function Save-TestReference {$ref | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $references}
Save-TestReference
Check 'Exact shared project-link shape with verified recovery is regenerable' ((Get-IgnoredClassification $script:DataCandidate).GeneratedMetadata.Kind -contains 'VERCEL_LINK_METADATA_REGENERABLE')
Write-DataFile .vercel/extra.bin
Check 'Unsafe Vercel extra file protects the whole root' ((Get-IgnoredClassification $script:DataCandidate).Protected -contains '.vercel')
[IO.File]::Delete((Join-Path $script:DataCandidate .vercel/extra.bin))
$null=[IO.Directory]::CreateDirectory((Join-Path $script:DataCandidate .vercel/empty))
Check 'Unknown empty Vercel subdirectory protects the root' ((Get-IgnoredClassification $script:DataCandidate).Protected -contains '.vercel')
[IO.Directory]::Delete((Join-Path $script:DataCandidate .vercel/empty),$false)
Write-DataFile .vercel/.env.local
Check 'Protected filename inside metadata keeps the root protected' ((Get-IgnoredClassification $script:DataCandidate).Protected -contains '.vercel/.env.local')
[IO.File]::Delete((Join-Path $script:DataCandidate .vercel/.env.local))
[IO.File]::AppendAllText((Join-Path $recovery project.json),' ')
Check 'Changed external recovery bytes invalidate generated Vercel classification' ((Get-IgnoredClassification $script:DataCandidate).Protected -contains '.vercel')
[IO.File]::Copy((Join-Path $script:DataCandidate .vercel/project.json),(Join-Path $recovery project.json),$true)
$proof=$ref.ReplicationProof;$ref.ReplicationProof=@($proof[0]);Save-TestReference
Check 'Unique project metadata never qualifies through one-source evidence' ((Get-IgnoredClassification $script:DataCandidate).Protected -contains '.vercel')
$ref.ReplicationProof=$proof;Save-TestReference
Accept-DataFixture;$beforeData=Get-IgnoredClassification $script:DataCandidate;$meta=@($beforeData.GeneratedMetadata | Where-Object RelativePath -eq '.vercel')[0]
Remove-ProvenGeneratedMetadata $script:DataCandidate $meta
Update-ReviewedDataAfterCleanup $script:DataCandidate $script:DataHead $beforeData .vercel
Check 'Vercel cleanup retains identical external recovery bytes' (-not(Test-Path (Join-Path $script:DataCandidate '.vercel')) -and (Get-FileHash (Join-Path $recovery project.json)).Hash -ceq $projectHash)
$script:DataIgnored=@('node_modules/')
$cacheRoot=Join-Path $script:DataCandidate node_modules;$null=[IO.Directory]::CreateDirectory($cacheRoot)
$cacheSentinel=Join-Path $packageCache sentinel.txt;[IO.File]::WriteAllText($cacheSentinel,'SYNTHETIC PACKAGE TARGET')
$cacheHash=(Get-FileHash $cacheSentinel).Hash
$link=Join-Path $cacheRoot pkg;$null=New-Item -ItemType Junction -Path $link -Target $packageCache
Check 'Package-cache junction inside a generated root is distinguished as safe' ((Get-IgnoredClassification $script:DataCandidate).GeneratedLinks.Count -eq 1)
Write-DataFile node_modules/private.key
Check 'Protected filename in generated cache still blocks candidate' (-not (Get-ReclaimCheck $script:DataCandidate).EligibleForLegacyAcceptance)
[IO.File]::Delete((Join-Path $cacheRoot private.key))
Accept-DataFixture;$beforeData=Get-IgnoredClassification $script:DataCandidate
Remove-ProvenGeneratedLink $script:DataCandidate $beforeData.GeneratedLinks[0]
Update-ReviewedDataAfterCleanup $script:DataCandidate $script:DataHead $beforeData 'node_modules/pkg'
Remove-ReviewedGeneratedRoot $script:DataCandidate node_modules
Check 'Safe generated link cleanup preserves target bytes and leaves no root' ((Get-FileHash $cacheSentinel).Hash -ceq $cacheHash -and -not(Test-Path -LiteralPath $cacheRoot))
foreach($pair in @(@('canonical',$script:Canonical),@('other',$other))){
 $null=[IO.Directory]::CreateDirectory($cacheRoot);$link=Join-Path $cacheRoot $pair[0];$null=New-Item -ItemType Junction -Path $link -Target $pair[1]
 Check ('Junction to '+$pair[0]+' remains protected') ((Get-IgnoredClassification $script:DataCandidate).LinksProtected.Count -eq 1)
 Check ('Cleanup refuses protected '+$pair[0]+' junction') (Refused {Remove-ProvenGeneratedLink $script:DataCandidate (Get-LocalLinkMetadata $script:DataCandidate ('node_modules/'+$pair[0]) @(Get-WorktreeRegistry))})
 [VbcDataUnlink]::DirectoryLink($link)
}
$env:USERPROFILE=Join-Path $fixture profile;$documents=Join-Path $env:USERPROFILE Documents;$null=[IO.Directory]::CreateDirectory($documents)
$link=Join-Path $cacheRoot docs;$null=New-Item -ItemType Junction -Path $link -Target $documents
Check 'Junction to user Documents remains protected' ((Get-IgnoredClassification $script:DataCandidate).LinksProtected[0].TargetClass -eq 'USER_PROFILE')
[VbcDataUnlink]::DirectoryLink($link);$env:USERPROFILE=$originalProfile
$hard=Join-Path $cacheRoot hard.txt;$null=New-Item -ItemType HardLink -Path $hard -Target $cacheSentinel
Check 'File hardlink remains protected despite safe unlink experiment' ((Get-IgnoredClassification $script:DataCandidate).LinksProtected[0].Classification -eq 'HARDLINK_REQUIRES_REVIEW')
[IO.File]::Delete($hard);[IO.Directory]::Delete($cacheRoot,$false);$script:DataIgnored=@();$script:DataRecords=@()
$script:DataStatus=' M source.txt';Check 'DIRTY remains protected' (-not (Get-ReclaimCheck $script:DataCandidate).EligibleForLegacyAcceptance);$script:DataStatus=''
$script:DataMerged=$false;Check 'CLEAN_UNMERGED remains protected' (-not (Get-ReclaimCheck $script:DataCandidate).EligibleForLegacyAcceptance);$script:DataMerged=$true
Check 'Canonical remains protected through metadata cleanup entrypoint' (Refused {Remove-ProvenGeneratedMetadata $script:Canonical ([pscustomobject]@{RelativePath='.vercel';Files=@()})})
$batchText=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'worktree-retire-backlog.ps1')).Replace(". (Join-Path `$PSScriptRoot 'worktree-common.ps1')",'')
$batch=[scriptblock]::Create($batchText);$plan=Join-Path $fixture plan.json
[pscustomobject]@{Candidates=@([pscustomobject]@{Path=$script:DataCandidate;Head=$script:DataHead})} | ConvertTo-Json -Depth 4 | Set-Content $plan
$out=(& $batch -PlanPath $plan -Execute -Confirmation RETIRE-EXACT-REVIEWED-PLAN | Out-String) | ConvertFrom-Json
Check 'Batch still refuses unreviewed candidates' ($out.Removed -eq 0 -and $out.Results[0].Outcome -eq 'PRESERVED_SAFETY_OR_ACCEPTANCE')
Set-Item Function:Invoke-LocalGit $originalGit;Set-Item Function:Get-WorktreeRegistry $originalRegistry;Set-Item Function:Assert-Canonical $originalAssert;Set-Item Function:Get-ProvenPackageCacheRoots $originalCacheRoots;$script:Canonical=$realCanonical
Check 'Synthetic fixtures never create or remove a real Git worktree' ((Invoke-LocalGit $realCanonical @('worktree','list','--porcelain')).Text -ceq $realRegistry)
$results | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $fixture results.json)
[pscustomobject]@{Passed=@($results | Where-Object Result -eq PASS).Count;Skipped=@($results | Where-Object Result -like SKIP*).Count;Fixture=$fixture;RealWorktreesCreated=0;RealWorktreesRemoved=0;ExternalTargetChanged=$false} | ConvertTo-Json
