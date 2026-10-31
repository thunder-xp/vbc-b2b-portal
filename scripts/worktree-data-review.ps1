#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Path,[string]$ExpectedHead='',[string]$TaskId='',[switch]$Execute)
. (Join-Path $PSScriptRoot 'worktree-common.ps1')
. (Join-Path $PSScriptRoot 'worktree-data-common.ps1')
$lock=$null
try{
 if($Execute){$lock=Enter-ReclaimGovernanceLock}
 $registry=@(Get-WorktreeRegistry);$entry=@($registry | Where-Object Path -ieq ([IO.Path]::GetFullPath($Path).TrimEnd('\')))
 if($entry.Count -ne 1 -or $entry[0].Path -ieq $script:Canonical){throw 'REGISTERED_ADDITIONAL_WORKTREE_REQUIRED'}
 $check=Get-ReclaimCheck $entry[0].Path
 if(-not $check.Clean -or -not $check.MergedIntoOriginMain){throw 'CLEAN_MERGED_REVIEW_REQUIRED'}
 $snapshot=Get-LocalDataSnapshot $check.Path $registry -RootFilter '.vercel'
 if(-not(Test-VercelFlatShape $snapshot)){throw 'VERCEL_ROOT_HAS_UNPROVEN_OR_ADDITIONAL_DATA'}
 $files=@($snapshot.Files | Where-Object {$_.RelativePath.StartsWith('.vercel/')})
 if(-not $Execute){[pscustomobject]@{Mode='DRY_RUN';Path=$check.Path;Head=$check.Head;Kind='PROJECT_LINK_IDENTIFIERS_ONLY';Files=$files;SourceChanged=$false;ApprovalPersisted=$false} | ConvertTo-Json -Depth 9;return}
 if($ExpectedHead -cne $check.Head -or [string]::IsNullOrWhiteSpace($TaskId)){throw 'EXACT_HEAD_AND_CURRENT_REVIEW_TASK_REQUIRED'}
 $project=@($files | Where-Object RelativePath -CEQ '.vercel/project.json')[0]
 $replicas=[Collections.Generic.List[object]]::new()
 foreach($wt in $registry){
  if($wt.Path -ieq $script:Canonical){continue}
  $p=Join-Path $wt.Path '.vercel/project.json'
  if(-not(Test-Path -LiteralPath $p -PathType Leaf)){continue}
  try{Assert-NoLinks $p;if((Get-Item -LiteralPath $p).Length -gt 64KB -or (Get-FileHash -LiteralPath $p).Hash -cne $project.Sha256){continue};if((Invoke-LocalGit $script:Canonical @('merge-base','--is-ancestor',$wt.Head,'origin/main') @(0,1)).Code -ne 0 -or (Invoke-LocalGit $wt.Path @('status','--porcelain=v1','--untracked-files=all')).Text){continue};$replicas.Add([pscustomobject]@{Path=$wt.Path;Head=$wt.Head;ProjectSha256=$project.Sha256});if($replicas.Count -ge 2){break}}catch{continue}
 }
 if($replicas.Count -lt 2){throw 'UNIQUE_PROJECT_LINK_METADATA_REMAINS_PROTECTED'}
 $directory=Join-Path $script:BackupParent ('metadata-'+[Guid]::NewGuid().ToString('N'))
 New-ProtectedDirectory $directory
 foreach($f in $files){$source=Join-Path $check.Path $f.RelativePath;Assert-NoLinks $source;$destination=Join-Path $directory ([IO.Path]::GetFileName($f.RelativePath));[IO.File]::Copy($source,$destination);if((Get-FileHash -LiteralPath $destination).Hash -cne $f.Sha256 -or (Get-FileHash -LiteralPath $source).Hash -cne $f.Sha256){throw 'METADATA_COPY_HASH_MISMATCH'}}
 $fresh=Get-LocalDataSnapshot $check.Path $registry -RootFilter '.vercel'
 $freshIdentity=Get-TextSha256 ((@($fresh.Files | Where-Object {$_.RelativePath.StartsWith('.vercel/')} | ForEach-Object {$_.RelativePath+':'+$_.Sha256}) -join "`n"))
 $oldIdentity=Get-TextSha256 (($files | ForEach-Object {$_.RelativePath+':'+$_.Sha256}) -join "`n")
 if(-not(Test-VercelFlatShape $fresh) -or $freshIdentity -cne $oldIdentity){throw 'METADATA_CHANGED_DURING_REVIEW'}
 Assert-DataRecoveryDirectory $directory
 $ref=[pscustomobject]@{Kind='VERCEL_LINK_METADATA_REGENERABLE';TaskId=$TaskId;ReviewedAtUtc=[DateTime]::UtcNow.ToString('o');SourcePath=$check.Path;SourceHead=$check.Head;ReplicationProof=@($replicas);Directory=$directory;Files=@($files | Select-Object RelativePath,Size,Sha256)}
 $file=Get-MetadataRecoveryFile;$refs=@(if(Test-Path -LiteralPath $file){Get-Content -LiteralPath $file -Raw | ConvertFrom-Json})
 $temp=$file+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
 ConvertTo-Json -InputObject @($refs+@($ref)) -Depth 10 | Set-Content -LiteralPath $temp
 [IO.File]::Move($temp,$file,$true)
 [pscustomobject]@{Kind=$ref.Kind;RecoveryDirectory=$directory;Files=$ref.Files;SourceChanged=$false;ReclaimApprovalGranted=$false} | ConvertTo-Json -Depth 7
}finally{if($null -ne $lock){$lock.Dispose()}}
