# Metadata-only local-data inspection. Never prints values or follows link trees.
function Initialize-DataLinkNative {
 if('VbcDataUnlink' -as [type]){return}
 Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public static class VbcDataUnlink {
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool RemoveDirectoryW(string path);
 public static void DirectoryLink(string path){if(!RemoveDirectoryW(path))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());}
}
'@
}
function Get-DataTargetClass([string]$Target,[string]$Candidate,[object[]]$Registry){
 if(-not $Target){return 'UNKNOWN_EXTERNAL'}
 $targetPath=[IO.Path]::GetFullPath($Target).TrimEnd('\')
 function Inside([string]$Root){$r=[IO.Path]::GetFullPath($Root).TrimEnd('\');$targetPath -ieq $r -or $targetPath.StartsWith($r+'\',[StringComparison]::OrdinalIgnoreCase)}
 if(Inside $script:Canonical){return 'CANONICAL_REPO'}
 if(Inside $Candidate){return 'INSIDE_SAME_WORKTREE'}
 foreach($wt in $Registry){if(Inside $wt.Path){return 'ANOTHER_WORKTREE'}}
 if($targetPath.Replace('\','/') -match '(?i)(^|/)supabase/(\.temp|\.branches|\.volumes|data|db)(/|$)'){return 'UNKNOWN_EXTERNAL'}
 foreach($name in @('Documents','Desktop','Downloads')){if($env:USERPROFILE -and (Inside (Join-Path $env:USERPROFILE $name))){return 'USER_PROFILE'}}
 foreach($cache in @(Get-ProvenPackageCacheRoots)){if(Inside $cache){return 'PACKAGE_CACHE'}}
 if($env:USERPROFILE -and (Inside $env:USERPROFILE)){return 'USER_PROFILE'}
 'UNKNOWN_EXTERNAL'
}
function Get-ProvenPackageCacheRoots {
 # Only npm's fixed content-addressed cache, never arbitrary user-configured stores.
 if($env:LOCALAPPDATA){$p=Join-Path $env:LOCALAPPDATA 'npm-cache/_cacache';if(Test-Path -LiteralPath $p){try{Assert-NoLinks $p;$p}catch{}}}
}
function Get-LocalLinkMetadata([string]$Candidate,[string]$Relative,[object[]]$Registry){
 Initialize-ReclaimFileIdentity
 $full=Join-Path $Candidate $Relative;$item=Get-Item -LiteralPath $full -Force -ErrorAction Stop
 $reparse=[bool]($item.Attributes -band [IO.FileAttributes]::ReparsePoint)
 $type=[string]$item.LinkType;$target='';$resolution='';$hardlinks=0
 if($reparse){try{$resolved=$item.ResolveLinkTarget($true);if($resolved){$target=$resolved.FullName;$resolution='RESOLVED_NO_CONTENT_ENUMERATION'}else{$resolution='UNRESOLVED'}}catch{$resolution='UNRESOLVED'}}
 elseif(-not $item.PSIsContainer){$hardlinks=[VbcReclaimFileIdentity]::Links($full);if($hardlinks -gt 1){$type='HardLink';$resolution='NO_SINGLE_TARGET'}}
 $class=Get-DataTargetClass $target $Candidate $Registry
 $insideGenerated=$Relative.Replace('\','/').Split('/')[0] -cin @('node_modules','.next','.turbo','coverage')
 $safe=$false
 if($insideGenerated -and $type -eq 'Junction' -and $class -eq 'PACKAGE_CACHE' -and (Test-Path -LiteralPath $target -PathType Container)){try{Assert-NoLinks $target;$safe=$true}catch{}}
 [pscustomobject]@{RelativePath=$Relative.Replace('\','/');FileAttributes=[string]$item.Attributes;AttributesValue=[long]$item.Attributes;LinkType=$type;Reparse=$reparse;IsDirectory=$item.PSIsContainer;ResolvedTarget=$target;Resolution=$resolution;TargetClass=$class;HardlinkCount=$hardlinks;InsideGeneratedRoot=$insideGenerated;Classification=if($type -eq 'HardLink'){'HARDLINK_REQUIRES_REVIEW'}elseif($safe){'SAFE_GENERATED_LINK'}elseif($reparse -and $class -ne 'UNKNOWN_EXTERNAL'){'PROTECTED_EXTERNAL_LINK'}else{'UNKNOWN_LINK'}}
}
function Get-LocalPersistentType([string]$Relative){
 if($Relative -match '(?i)(^|/)\.env[^/]*$|\.env$'){return 'ENV_CONFIG'}
 if($Relative -match '(?i)(^|/)(credentials[^/]*|secrets?[^/]*)(/|$)|(^|/)([^/]+-)?(access-token|refresh-token|service-role|token)(\.(txt|json))?$|\.(pem|key|pfx|p12)$'){return 'CREDENTIAL_OR_SECRET'}
 if($Relative -match '(?i)\.(db|sqlite|sqlite3)$'){return 'PERSISTENT_DATABASE'}
 if($Relative -match '(?i)^supabase/|(^|/)supabase/(\.temp|\.branches|\.volumes|data|config\.toml)(/|$)'){return 'LOCAL_SUPABASE_STATE'}
 if($Relative -match '(?i)^\.vercel/'){return 'VERCEL_METADATA'}
 'OTHER_LOCAL_DATA'
}
function Get-BoundedVercelIdentity([string]$File){
 $item=Get-Item -LiteralPath $File -Force
 if($item.Length -gt 64KB -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){return [pscustomobject]@{OnlyProjectLinkIdentifiers=$false;KnownKeyNames=@();OtherKeyCount=-1}}
 try{
  $document=[Text.Json.JsonDocument]::Parse([IO.File]::ReadAllText($File))
  try{if($document.RootElement.ValueKind -ne [Text.Json.JsonValueKind]::Object){throw 'NOT_PROJECT_OBJECT'};$propertyNames=@($document.RootElement.EnumerateObject() | ForEach-Object Name);if(@($propertyNames | Sort-Object -Unique).Count -ne $propertyNames.Count){throw 'DUPLICATE_PROJECT_METADATA_KEYS'}}finally{$document.Dispose()}
  $json=Get-Content -LiteralPath $File -Raw | ConvertFrom-Json -AsHashtable
  $allowed=@('projectId','orgId','projectName');$names=@($json.Keys);$extra=@($names | Where-Object {$_ -cnotin $allowed})
  $shape=$json.ContainsKey('projectId') -and $json.ContainsKey('orgId') -and $extra.Count -eq 0
  foreach($key in @($names | Where-Object {$_ -cin $allowed})){if($json[$key] -isnot [string] -or [string]::IsNullOrWhiteSpace($json[$key])){$shape=$false}}
  if($shape -and ($json.projectId -notmatch '^prj_[A-Za-z0-9]+$' -or $json.orgId -notmatch '^(team_|user_)[A-Za-z0-9]+$')){$shape=$false}
  [pscustomobject]@{OnlyProjectLinkIdentifiers=[bool]$shape;KnownKeyNames=@($names | Where-Object {$_ -cin $allowed} | Sort-Object);OtherKeyCount=$extra.Count}
 }catch{[pscustomobject]@{OnlyProjectLinkIdentifiers=$false;KnownKeyNames=@();OtherKeyCount=-1}}
}
function Get-LocalDataSnapshot([string]$Candidate,[object[]]$Registry,[string[]]$AdditionalLinkPaths=@(),[string]$RootFilter=''){
 Initialize-ReclaimFileIdentity
 $ignored=@((Invoke-LocalGit $Candidate @('ls-files','--others','--ignored','--exclude-standard','--directory','-z')).Text.Split([char]0,[StringSplitOptions]::RemoveEmptyEntries))
 $files=[Collections.Generic.List[object]]::new();$links=[Collections.Generic.List[object]]::new();$directories=[Collections.Generic.List[string]]::new();$seen=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
 $stack=[Collections.Generic.Stack[string]]::new();foreach($p in $ignored){$rel=$p.Replace('\','/').TrimEnd('/');if(-not $RootFilter -or $rel -ceq $RootFilter -or $rel.StartsWith($RootFilter+'/')){$stack.Push($rel)}};foreach($p in $AdditionalLinkPaths){$stack.Push($p)}
 while($stack.Count){$relative=$stack.Pop();if(-not $seen.Add($relative)){continue};$full=Join-Path $Candidate $relative
  $item=Get-Item -LiteralPath $full -Force -ErrorAction Stop
  if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){$links.Add((Get-LocalLinkMetadata $Candidate $relative $Registry));continue}
  if($item.PSIsContainer){$directories.Add($relative);foreach($child in Get-ChildItem -LiteralPath $full -Force -ErrorAction Stop){$stack.Push($relative+'/'+$child.Name)};continue}
  $count=[VbcReclaimFileIdentity]::Links($full)
  if($count -gt 1){$links.Add((Get-LocalLinkMetadata $Candidate $relative $Registry))}
  if($relative.Split('/')[0] -cin @('node_modules','.next','.turbo','coverage') -and -not(Test-PersistentLocalFileName $relative) -and $count -eq 1){continue}
  $hash=(Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash
  $canonical=Join-Path $script:Canonical $relative;$canonicalHash='';$comparison='CANONICAL_FILE_ABSENT'
  if(Test-Path -LiteralPath $canonical -PathType Leaf){try{Assert-NoLinks $canonical;$canonicalHash=(Get-FileHash -LiteralPath $canonical -Algorithm SHA256).Hash;$comparison=if($hash -ceq $canonicalHash){'BYTE_IDENTICAL_TO_CANONICAL'}else{'DIFFERENT_FROM_CANONICAL'}}catch{$comparison='CANONICAL_COMPARISON_UNPROVEN'}}
  $identity=if($relative -ceq '.vercel/project.json'){Get-BoundedVercelIdentity $full}else{$null}
  $files.Add([pscustomobject]@{RelativePath=$relative;Size=$item.Length;Sha256=$hash;Classification=Get-LocalPersistentType $relative;CanonicalComparison=$comparison;CanonicalSha256=$canonicalHash;HardlinkCount=$count;VercelIdentity=$identity})
 }
 [pscustomobject]@{IgnoredRoots=@($ignored | ForEach-Object {$_.TrimEnd('/')} | Sort-Object);Directories=@($directories | Sort-Object);Files=@($files | Sort-Object RelativePath);Links=@($links | Sort-Object RelativePath)}
}
function Test-GeneratedCompilerMetadata([string]$Candidate,[string]$Relative){
 if($Relative -cnotin @('next-env.d.ts','tsconfig.tsbuildinfo')){return $false}
 $file=Join-Path $Candidate $Relative;Assert-NoLinks $file
 if((Get-Item -LiteralPath $file).Length -gt 32MB){return $false}
 try{
  $config=Get-Content -LiteralPath (Join-Path $Candidate tsconfig.json) -Raw | ConvertFrom-Json -AsHashtable
  if($Relative -ceq 'tsconfig.tsbuildinfo'){
   if(-not $config.ContainsKey('compilerOptions') -or $config.compilerOptions['incremental'] -isnot [bool] -or $config.compilerOptions['incremental'] -ne $true){return $false}
   $json=Get-Content -LiteralPath $file -Raw | ConvertFrom-Json -AsHashtable
   $keys=@('fileNames','fileIdsList','fileInfos','root','options','referencedMap','semanticDiagnosticsPerFile','affectedFilesPendingEmit','version','latestChangedDtsFile','errors','checkPending','emitDiagnosticsPerFile','pendingEmit','resolvedRoot','changeFileSet','outSignature','size')
   if(@($json.Keys | Where-Object {$_ -cnotin $keys}).Count -or -not $json.ContainsKey('version') -or $json.version -notmatch '^\d+\.\d+\.\d+([-.][A-Za-z0-9.-]+)?$' -or -not $json.ContainsKey('fileNames') -or -not $json.ContainsKey('fileInfos') -or $json.fileNames -isnot [array] -or $json.fileInfos -isnot [array] -or -not(Test-CompilerJsonSafety $json)){return $false}
   return $true
  }
  if((Get-Item -LiteralPath $file).Length -gt 16KB -or -not (@($config.include) -contains 'next-env.d.ts')){return $false}
  $package=Get-Content -LiteralPath (Join-Path $Candidate package.json) -Raw | ConvertFrom-Json -AsHashtable
  if(-not $package.ContainsKey('dependencies') -or -not $package.dependencies.ContainsKey('next')){return $false}
  $lines=@([IO.File]::ReadAllLines($file));$hasCore=$false
  foreach($line in $lines){
   if($line -ceq '/// <reference types="next" />'){$hasCore=$true;continue}
   if($line -cmatch '^/// <reference types="next/(image-types/global|navigation-types/compat/navigation)" />$' -or $line -cmatch '^import "\./\.next/(dev/)?types/(routes\.d\.ts|root-params\.d\.ts|cache-life\.d\.ts|validator\.ts|link\.d\.ts)";$' -or $line -ceq '' -or $line -ceq '// NOTE: This file should not be edited' -or $line -cmatch '^// see https://nextjs\.org/docs/(app|pages)/api-reference/config/typescript for more information\.$'){continue}
   return $false
  }
  $hasCore
 }catch{$false}
}
function Test-CompilerJsonSafety($Node,[int]$Depth=0){
 if($Depth -gt 32){return $false}
 if($Node -is [Collections.IDictionary]){foreach($key in $Node.Keys){if($key -match '(?i)credential|secret|password|token|private.?key|database'){return $false};if(-not(Test-CompilerJsonSafety $Node[$key] ($Depth+1))){return $false}}}
 elseif($Node -is [array]){foreach($item in $Node){if(-not(Test-CompilerJsonSafety $item ($Depth+1))){return $false}}}
 $true
}
function Test-VercelFlatShape($Snapshot){
 $files=@($Snapshot.Files | Where-Object {$_.RelativePath.StartsWith('.vercel/',[StringComparison]::Ordinal)})
 if(@($Snapshot.Links | Where-Object {$_.RelativePath -eq '.vercel' -or $_.RelativePath.StartsWith('.vercel/')}).Count -or @($Snapshot.Directories | Where-Object {$_.StartsWith('.vercel/')}).Count){return $false}
 if(@($files | Where-Object {$_.RelativePath -cnotin @('.vercel/project.json','.vercel/README.txt') -or $_.HardlinkCount -gt 1}).Count){return $false}
 $project=@($files | Where-Object RelativePath -CEQ '.vercel/project.json')
 if($project.Count -ne 1 -or -not $project[0].VercelIdentity.OnlyProjectLinkIdentifiers){return $false}
 $readme=@($files | Where-Object RelativePath -CEQ '.vercel/README.txt')
 if($readme.Count -and $readme[0].Sha256 -cne 'F5D1ED0F5032AE128931F46459B5FAA1AF6319FC2DFB3E7A5FE54A84BF93DBD6'){return $false}
 $true
}
function Get-MetadataRecoveryFile {Join-Path $script:Canonical '.git/worktree-governance/data-recovery.json'}
function Assert-DataRecoveryDirectory([string]$Directory){
 Assert-NoLinks $Directory
 if(-not ([IO.Path]::GetFullPath($Directory)).StartsWith($script:BackupParent+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'METADATA_RECOVERY_OUTSIDE_PROTECTED_ROOT'}
 $acl=Get-Acl -LiteralPath $Directory
 if(-not $acl.AreAccessRulesProtected){throw 'METADATA_RECOVERY_ACL_CHANGED'}
 $allowed=@([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18','S-1-5-32-544')
 foreach($rule in $acl.Access){if($rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin $allowed -or $rule.AccessControlType -ne 'Allow'){throw 'METADATA_RECOVERY_ACL_UNEXPECTED'}}
 foreach($f in Get-ChildItem -LiteralPath $Directory -Force){Assert-NoLinks $f.FullName;if($f.PSIsContainer){throw 'METADATA_RECOVERY_UNEXPECTED_DIRECTORY'};foreach($rule in (Get-Acl -LiteralPath $f.FullName).Access){if($rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin $allowed -or $rule.AccessControlType -ne 'Allow'){throw 'METADATA_FILE_ACL_UNEXPECTED'}}}
}
function Get-ProvenVercelMetadata($Snapshot){
 if(-not (Test-VercelFlatShape $Snapshot)){return $null}
 $file=Get-MetadataRecoveryFile
 if(-not(Test-Path -LiteralPath $file)){return $null};Assert-NoLinks $file
 $records=@(Get-Content -LiteralPath $file -Raw | ConvertFrom-Json)
 $files=@($Snapshot.Files | Where-Object {$_.RelativePath.StartsWith('.vercel/')})
 foreach($ref in $records){
  if($ref.Kind -ne 'VERCEL_LINK_METADATA_REGENERABLE'){continue}
  $proof=@(Get-RecordValue $ref ReplicationProof @())
  if(@($proof | Select-Object -ExpandProperty Path -Unique).Count -lt 2){continue}
  $project=@($files | Where-Object RelativePath -CEQ '.vercel/project.json')[0]
  if(@($proof | Where-Object {$_.ProjectSha256 -cne $project.Sha256}).Count){continue}
  try{
   Assert-DataRecoveryDirectory $ref.Directory
   $valid=$true
   foreach($f in $files){$match=@($ref.Files | Where-Object {$_.RelativePath -ceq $f.RelativePath -and $_.Sha256 -ceq $f.Sha256});if($match.Count -ne 1){$valid=$false;break};$source=Join-Path $ref.Directory ([IO.Path]::GetFileName($f.RelativePath));Assert-NoLinks $source;if((Get-FileHash -LiteralPath $source).Hash -cne $f.Sha256){$valid=$false;break}}
   if($valid){return [pscustomobject]@{RelativePath='.vercel';Kind='VERCEL_LINK_METADATA_REGENERABLE';Files=$files;RecoveryDirectory=$ref.Directory;RecoveryTaskId=$ref.TaskId}}
  }catch{continue}
 }
 $null
}
function Remove-ProvenGeneratedLink([string]$Candidate,$ReviewedLink){
 $check=Assert-AdditionalDataCleanupTarget $Candidate
 $reviewed=@($check.IgnoredClassification.GeneratedLinks | Where-Object RelativePath -CEQ $ReviewedLink.RelativePath)
 if($reviewed.Count -ne 1 -or $reviewed[0].ResolvedTarget -cne $ReviewedLink.ResolvedTarget){throw 'LINK_NOT_IN_CURRENT_ACCEPTED_CLASSIFICATION'}
 $live=Get-LocalLinkMetadata $Candidate $ReviewedLink.RelativePath @(Get-WorktreeRegistry)
 if($live.Classification -cne 'SAFE_GENERATED_LINK' -or $live.ResolvedTarget -cne $ReviewedLink.ResolvedTarget -or $live.LinkType -cne 'Junction'){throw 'GENERATED_LINK_CHANGED_OR_PROTECTED'}
 $link=Join-Path $Candidate $live.RelativePath
 if(-not ([IO.Path]::GetFullPath($link)).StartsWith([IO.Path]::GetFullPath($Candidate).TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'LINK_PATH_ESCAPE'}
 Assert-NoLinks ([IO.Path]::GetDirectoryName($link))
 Initialize-DataLinkNative
 [VbcDataUnlink]::DirectoryLink($link)
 if(Test-Path -LiteralPath $link){throw 'LINK_UNLINK_NOT_CONFIRMED'}
 if(-not(Test-Path -LiteralPath $live.ResolvedTarget -PathType Container)){throw 'LINK_TARGET_DISAPPEARED_STOP'}
}
function Get-ExpandedDataClassification([string]$Candidate,[string[]]$Generated,[string[]]$Protected,[string[]]$Unknown,[string[]]$OldLinks,[string[]]$TaskMetadata,[long]$TotalBytes,[long]$GeneratedBytes){
 $Generated=@($Generated | Where-Object {$_});$Protected=@($Protected | Where-Object {$_});$Unknown=@($Unknown | Where-Object {$_});$OldLinks=@($OldLinks | Where-Object {$_});$TaskMetadata=@($TaskMetadata | Where-Object {$_})
 $snapshot=Get-LocalDataSnapshot $Candidate @(Get-WorktreeRegistry) @($OldLinks+$Protected | Sort-Object -Unique)
 $metadata=[Collections.Generic.List[object]]::new()
 $protectedPaths=[Collections.Generic.List[string]]::new();foreach($p in $Protected){$protectedPaths.Add($p)}
 $unknownPaths=[Collections.Generic.List[string]]::new();foreach($p in $Unknown){$unknownPaths.Add($p)}
 foreach($relative in @('next-env.d.ts','tsconfig.tsbuildinfo')){
  if($unknownPaths.Contains($relative) -and (Test-GeneratedCompilerMetadata $Candidate $relative)){
   $file=@($snapshot.Files | Where-Object RelativePath -CEQ $relative)
   if($file.Count -eq 1 -and $file[0].HardlinkCount -eq 1){$null=$unknownPaths.Remove($relative);$metadata.Add([pscustomobject]@{RelativePath=$relative;Kind=if($relative -eq 'next-env.d.ts'){'NEXT_GENERATED_TYPES'}else{'TSC_INCREMENTAL_CACHE'};Files=$file;RecoveryDirectory='REGENERATE_FROM_TRACKED_SOURCE'})}
  }
 }
 $vercel=Get-ProvenVercelMetadata $snapshot
 if($vercel){foreach($p in @($protectedPaths.ToArray())){if($p -ceq '.vercel' -or $p.StartsWith('.vercel/')){$null=$protectedPaths.Remove($p)}};$null=$unknownPaths.Remove('.vercel');$metadata.Add($vercel)}
 $safeLinks=@($snapshot.Links | Where-Object Classification -EQ SAFE_GENERATED_LINK)
 $unsafeLinks=@($snapshot.Links | Where-Object Classification -NE SAFE_GENERATED_LINK)
 $identities=[Collections.Generic.List[object]]::new()
 foreach($f in $snapshot.Files){
  if($f.RelativePath -ceq '.codex/CURRENT_TASK.md' -and $TaskMetadata.Count){continue}
  $identities.Add([pscustomobject]@{RelativePath=$f.RelativePath;Identity=('FILE|'+$f.RelativePath+'|'+$f.Size+'|'+$f.Sha256)})
 }
 foreach($link in $snapshot.Links){$identities.Add([pscustomobject]@{RelativePath=$link.RelativePath;Identity=('LINK|'+$link.RelativePath+'|'+$link.LinkType+'|'+$link.ResolvedTarget+'|'+$link.TargetClass+'|'+$link.Classification+'|'+$link.HardlinkCount)})}
 foreach($p in @($protectedPaths | Sort-Object -Unique)){$identities.Add([pscustomobject]@{RelativePath=$p;Identity=('PROTECTED|'+$p)})}
 foreach($p in @($unknownPaths | Sort-Object -Unique)){$identities.Add([pscustomobject]@{RelativePath=$p;Identity=('UNKNOWN|'+$p)})}
 foreach($m in $metadata){$identities.Add([pscustomobject]@{RelativePath=$m.RelativePath;Identity=('GENERATED_METADATA|'+$m.RelativePath+'|'+$m.Kind)})}
 foreach($directory in $snapshot.Directories){if($directory.Split('/')[0] -cin @('node_modules','.next','.turbo','coverage') -or ($directory -eq '.codex' -and $TaskMetadata.Count)){continue};$identities.Add([pscustomobject]@{RelativePath=$directory;Identity=('DIRECTORY|'+$directory)})}
 $ordered=@($identities | Sort-Object Identity -Unique)
 [pscustomobject]@{GeneratedRoots=$Generated;GeneratedMetadata=@($metadata);GeneratedLinks=$safeLinks;Protected=@($protectedPaths | Sort-Object -Unique);Unknown=@($unknownPaths | Sort-Object -Unique);Links=@($unsafeLinks | ForEach-Object RelativePath);LinksProtected=$unsafeLinks;TaskMetadata=$TaskMetadata;LocalFiles=$snapshot.Files;Identities=$ordered;Snapshot=$snapshot;TotalLogicalBytes=$TotalBytes;GeneratedLogicalBytes=$GeneratedBytes;Fingerprint=Get-TextSha256 ('DATA_POLICY_V2'+"`n"+(($ordered | ForEach-Object Identity) -join "`n"));Policy='Exact generated roots; proven compiler metadata; independently recoverable exact project-link metadata; package-cache junction objects only; unresolved data protected'}
}
function Update-ReviewedDataAfterCleanup([string]$Candidate,[string]$Head,$Before,[string]$RemovedRelative){
 $after=Get-IgnoredClassification $Candidate
 $expected=@($Before.Identities | Where-Object {$_.RelativePath -cne $RemovedRelative -and -not $_.RelativePath.StartsWith($RemovedRelative+'/',[StringComparison]::Ordinal)} | ForEach-Object Identity | Sort-Object -Unique)
 $actual=@($after.Identities | ForEach-Object Identity | Sort-Object -Unique)
 if(($expected -join "`n") -cne ($actual -join "`n") -or $after.Protected.Count -or $after.Unknown.Count -or $after.Links.Count){throw 'UNEXPECTED_LOCAL_DATA_CHANGE_AFTER_GENERATED_CLEANUP'}
 $records=@(Get-WorktreeLifecycleRecords);$matching=@($records | Where-Object Path -ieq $Candidate)
 if($matching.Count -eq 1 -and $matching[0].State -eq 'LEGACY_RECLAIM_REVIEWED'){
  $r=$matching[0]
  if($r.Head -cne $Head -or $r.IgnoredDataClassification.Fingerprint -cne $Before.Fingerprint){throw 'REVIEW_RECORD_CHANGED_DURING_CLEANUP'}
  $r.IgnoredDataClassification=$after;Save-ReclaimRecords $records
 }
}
function Remove-ProvenGeneratedMetadata([string]$Candidate,$Metadata){
 $check=Assert-AdditionalDataCleanupTarget $Candidate
 $relative=$Metadata.RelativePath
 if($relative -cnotin @('.vercel','next-env.d.ts','tsconfig.tsbuildinfo')){throw 'METADATA_ROOT_NOT_ALLOWLISTED'}
 $live=@($check.IgnoredClassification.GeneratedMetadata | Where-Object RelativePath -CEQ $relative)
 if($live.Count -ne 1){throw 'METADATA_NOT_IN_CURRENT_ACCEPTED_CLASSIFICATION'}
 $reviewedIdentity=Get-TextSha256 (($Metadata.Files | ForEach-Object {$_.RelativePath+':'+$_.Sha256}) -join "`n")
 $liveIdentity=Get-TextSha256 (($live[0].Files | ForEach-Object {$_.RelativePath+':'+$_.Sha256}) -join "`n")
 if($reviewedIdentity -cne $liveIdentity){throw 'METADATA_REVIEWED_IDENTITIES_CHANGED'}
 $Metadata=$live[0]
 foreach($file in $Metadata.Files){$full=Join-Path $Candidate $file.RelativePath;Assert-NoLinks $full;if((Get-FileHash -LiteralPath $full).Hash -cne $file.Sha256){throw 'GENERATED_METADATA_CHANGED_BEFORE_DELETE'}}
 if($relative -ceq '.vercel'){
  $fresh=Get-LocalDataSnapshot $Candidate @(Get-WorktreeRegistry) -RootFilter '.vercel'
  if(-not (Get-ProvenVercelMetadata $fresh)){throw 'VERCEL_RECOVERY_NO_LONGER_PROVEN'}
 }elseif(-not (Test-GeneratedCompilerMetadata $Candidate $relative)){throw 'COMPILER_METADATA_NO_LONGER_PROVEN'}
 foreach($file in $Metadata.Files){[IO.File]::Delete((Join-Path $Candidate $file.RelativePath))}
 if($relative -ceq '.vercel'){[IO.Directory]::Delete((Join-Path $Candidate '.vercel'),$false)}
}
function Assert-AdditionalDataCleanupTarget([string]$Candidate){
 $p=[IO.Path]::GetFullPath($Candidate).TrimEnd('\')
 if($p -ieq $script:Canonical -or [IO.Path]::GetDirectoryName($p) -ine [IO.Path]::GetDirectoryName($script:Canonical) -or -not [IO.Path]::GetFileName($p).StartsWith('vbc-b2b-portal-')){throw 'CANONICAL_OR_OUTSIDE_SCOPE_DATA_CLEANUP_REFUSED'}
 $check=Get-ReclaimCheck $p
 if(-not $check.Eligible){throw 'CURRENT_RECLAIM_ACCEPTANCE_AND_ALL_SAFETY_GATES_REQUIRED'}
 $check
}
