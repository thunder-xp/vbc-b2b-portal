# Shared legacy-reclamation helpers. Loaded by worktree-common.ps1; no entrypoint.
function Get-RecordValue($Record,[string]$Name,$Default){if($Record -and $Record.PSObject.Properties[$Name]){$Record.$Name}else{$Default}}
function Get-TextSha256([string]$Text){[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($Text)))}
function Test-CommandCandidatePath([string]$Command,[string]$Path){
 # Require a complete path boundary, including slash variants; sibling prefixes do not match.
 $p=$Path.Replace('/','\').TrimEnd('\')
 $c=$Command.Replace('/','\')
 [regex]::IsMatch($c,'(?i)(?<![\w.-])'+[regex]::Escape($p)+'(?=$|[\\\s"'';,?#)\]}])')
}
function Get-CandidateActivity([string]$Path){
 $p=[IO.Path]::GetFullPath($Path).TrimEnd('\');$signals=[Collections.Generic.List[string]]::new()
 $cwd=[IO.Path]::GetFullPath((Get-Location).Path).TrimEnd('\')
 if($cwd -ieq $p -or $cwd.StartsWith($p+'\',[StringComparison]::OrdinalIgnoreCase)){$signals.Add('CURRENT_LOCATION_INSIDE_CANDIDATE')}
 foreach($r in @(Get-WorktreeLifecycleRecords)){
  if($r.Path -ieq $p -and $r.State -in @('ACTIVE','CREATED','REVIEW')){$signals.Add('ACTIVE_TASK_RESERVATION')}
 }
 try{
  $processes=@(Get-CimInstance Win32_Process -ErrorAction Stop)
  # The reviewing command necessarily names the candidate. Exclude only its own
  # invocation lineage, not arbitrary PowerShell/Git/IDE processes.
  $lineage=[Collections.Generic.HashSet[int]]::new();$ancestor=$PID
  while($ancestor -gt 0 -and $lineage.Add($ancestor)){$row=@($processes | Where-Object ProcessId -eq $ancestor);if($row.Count -ne 1){break};$parent=@($processes | Where-Object ProcessId -eq $row[0].ParentProcessId);if($parent.Count -ne 1 -or $parent[0].Name -notmatch '^(pwsh|powershell|cmd)\.exe$'){break};$ancestor=[int]$parent[0].ProcessId}
  $unknown=0
  foreach($proc in $processes){
   if($lineage.Contains([int]$proc.ProcessId)){continue}
   if(-not $proc.CommandLine){$unknown++;continue}
   if(Test-CommandCandidatePath $proc.CommandLine $p){$signals.Add('COMMAND_LINE_PATH_PID_'+$proc.ProcessId)}
  }
  [pscustomobject]@{State=if($signals.Count){'ACTIVE_TASK_PROVEN'}else{'NO_CANDIDATE_ACTIVITY_EVIDENCE'};Signals=@($signals);UnobservableCommandLines=$unknown;OtherProcessCwd='NOT_OBSERVED';OpenHandles='NOT_ENUMERATED';Boundary='Ordinary non-force Git removal; no global process-name inference'}
 }catch{[pscustomobject]@{State='UNKNOWN_PROCESS_ACCESS';Signals=@($signals);Boundary='Process enumeration failed; preserve'}}
}
function Test-PersistentLocalFileName([string]$Relative){$Relative -match '(?i)(^|/)(\.env[^/]*|credentials[^/]*|secrets?[^/]*)(/|$)|(^|/)([^/]+-)?(access-token|refresh-token|service-role|token)(\.(txt|json))?$|\.env$|\.(pem|key|pfx|p12|db|sqlite|sqlite3)$'}
function Test-ProtectedLocalName([string]$Relative){(Test-PersistentLocalFileName $Relative) -or $Relative -match '(?i)^supabase/|^\.vercel(/|$)'}
function Initialize-ReclaimFileIdentity {
 if('VbcReclaimFileIdentity' -as [type]){return}
 Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class VbcReclaimFileIdentity {
 [StructLayout(LayoutKind.Sequential)] struct Info {public uint Attributes;public System.Runtime.InteropServices.ComTypes.FILETIME Creation,Access,Write;public uint Volume,High,Low,Links,IndexHigh,IndexLow;}
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle h,out Info info);
 public static uint Links(string p){using(var f=File.OpenHandle(p,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete)){Info i;if(!GetFileInformationByHandle(f,out i))throw new IOException("File identity unavailable");return i.Links;}}
}
'@
}
function Get-IgnoredClassification([string]$Path){
 Initialize-ReclaimFileIdentity
 $allowed=@('node_modules','.next','.turbo','coverage')
 $ignored=@((Invoke-LocalGit $Path @('ls-files','--others','--ignored','--exclude-standard','--directory','-z')).Text.Split([char]0,[StringSplitOptions]::RemoveEmptyEntries))
 $tracked=@((Invoke-LocalGit $Path @('ls-files','-z')).Text.Split([char]0,[StringSplitOptions]::RemoveEmptyEntries))
 $trackedSet=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase);foreach($name in $tracked){$null=$trackedSet.Add($name)}
 $generated=[Collections.Generic.List[string]]::new();$unknown=[Collections.Generic.List[string]]::new();$protected=[Collections.Generic.List[string]]::new();$links=[Collections.Generic.List[string]]::new();$metadata=[Collections.Generic.List[string]]::new()
 $logicalBytes=[long]0;$generatedBytes=[long]0
 # Inspect the complete candidate without following links, including generated data.
 # Protected names inside cache roots still block; a cache name never overrides a secret.
 $stack=[Collections.Generic.Stack[string]]::new();$stack.Push('')
 while($stack.Count){$relative=$stack.Pop();$directory=if($relative){Join-Path $Path $relative}else{$Path}
  foreach($item in Get-ChildItem -LiteralPath $directory -Force -ErrorAction Stop){
   $rel=if($relative){$relative+'/'+$item.Name}else{$item.Name};if($rel -eq '.git'){continue}
   if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){$links.Add($rel);continue}
   if($item.PSIsContainer){$stack.Push($rel);continue}
   $logicalBytes+=$item.Length;if($rel.Split('/')[0] -in $allowed){$generatedBytes+=$item.Length}
   if([VbcReclaimFileIdentity]::Links($item.FullName) -gt 1){$links.Add($rel)}
   if(-not $trackedSet.Contains($rel) -and (Test-ProtectedLocalName $rel)){$protected.Add($rel)}
  }
 }
 foreach($entry in $ignored){
  $rel=$entry.Replace('\','/').TrimEnd('/');$first=$rel.Split('/')[0]
  if($first -in $allowed){if(-not $generated.Contains($first)){$generated.Add($first)};continue}
  if(Test-ProtectedLocalName $rel){if(-not $protected.Contains($rel)){$protected.Add($rel)};continue}
  if($rel -eq '.codex' -and (Test-Path -LiteralPath (Join-Path $Path '.codex') -PathType Container)){
   $items=@(Get-ChildItem -LiteralPath (Join-Path $Path '.codex') -Force)
   if($items.Count -eq 1 -and $items[0].Name -ceq 'CURRENT_TASK.md' -and -not $items[0].PSIsContainer){$metadata.Add('.codex/CURRENT_TASK.md');continue}
  }
  if($rel -ceq '.codex/CURRENT_TASK.md'){$metadata.Add($rel);continue}
  $unknown.Add($rel)
 }
 # Never delete a root containing a tracked entry, including ignored tracked files.
 foreach($g in $generated){if(@($tracked | Where-Object {$_ -ieq $g -or $_.StartsWith($g+'/',[StringComparison]::OrdinalIgnoreCase)}).Count){$unknown.Add($g+':TRACKED_CONTENT')}}
 Get-ExpandedDataClassification -Candidate $Path -Generated @($generated | Sort-Object) -Protected @($protected | Sort-Object -Unique) -Unknown @($unknown | Sort-Object -Unique) -OldLinks @($links | Sort-Object -Unique) -TaskMetadata @($metadata) -TotalBytes $logicalBytes -GeneratedBytes $generatedBytes
}
. (Join-Path $PSScriptRoot 'worktree-data-common.ps1')
function Get-LegacyTaskMarker([string]$Path,[bool]$Clean,[bool]$Merged,[string]$Activity,[string]$TaskId,[string]$Approval){
 $file=Join-Path $Path '.codex/CURRENT_TASK.md'
 if(-not (Test-Path -LiteralPath $file)){return [pscustomobject]@{State='ABSENT';Sha256='';TaskId='';LastWriteUtc=''}}
 $item=Get-Item -LiteralPath $file -Force
 if($item.PSIsContainer -or $item.Length -gt 128KB -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){return [pscustomobject]@{State='UNKNOWN_TASK_MARKER';Sha256='';TaskId='';LastWriteUtc=''}}
 # Read only the bounded identity line; never archive or print arbitrary task prose.
 $id='';$reader=[IO.File]::OpenText($file)
 try{while($null -ne ($line=$reader.ReadLine())){if($line -cmatch '^TASK_ID:\s*([A-Za-z0-9][A-Za-z0-9_.-]{2,160})\s*$'){$id=$Matches[1];break}}}finally{$reader.Dispose()}
 $stale=$Clean -and $Merged -and $Activity -eq 'NO_CANDIDATE_ACTIVITY_EVIDENCE' -and $TaskId -and $Approval -and $id -and $id -cne $TaskId -and $item.LastWriteTimeUtc -lt [DateTime]::UtcNow.AddDays(-1)
 [pscustomobject]@{State=if($stale){'STALE_LEGACY_TASK_MARKER'}else{'UNFINISHED_TASK_NOT_DISPROVEN'};Sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash;TaskId=$id;LastWriteUtc=$item.LastWriteTimeUtc.ToString('o')}
}
function Test-LegacyAcceptance($Record,[string]$Head,[string]$Branch){
 if(-not $Record -or $Record.State -ne 'LEGACY_RECLAIM_REVIEWED'){return $false}
 foreach($field in @('ReviewedAtUtc','ReviewedBy','AcceptanceTaskId','AcceptanceEvidence','ReclaimApproval','IgnoredDataClassification','MarkerSha256')){if(-not $Record.PSObject.Properties[$field]){return $false}}
 $Record.Head -ceq $Head -and $Record.Branch -ceq $Branch -and $Record.ReviewedBy -and $Record.AcceptanceTaskId -and $Record.AcceptanceEvidence -and $Record.ReclaimApproval -and (Get-RecordValue $Record WorkingTreeClean $false) -eq $true -and (Get-RecordValue $Record HeadMergedIntoOriginMain $false) -eq $true
}
function Enter-ReclaimGovernanceLock {
 Assert-Canonical
 foreach($name in @('GIT_DIR','GIT_WORK_TREE','GIT_COMMON_DIR','GIT_INDEX_FILE','GIT_OBJECT_DIRECTORY','GIT_CONFIG_COUNT')){if([Environment]::GetEnvironmentVariable($name)){throw 'AMBIENT_GIT_OVERRIDE_PROTECTED'}}
 $folder=Split-Path (Get-WorktreeLifecyclePath);Assert-NoLinks $folder;$null=[IO.Directory]::CreateDirectory($folder)
 try{[IO.File]::Open((Join-Path $folder 'governance.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)}catch{throw 'GOVERNANCE_BUSY_RETRY'}
}
function Save-ReclaimRecords($Records){
 $file=Get-WorktreeLifecyclePath;$temporary=$file+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
 [IO.File]::WriteAllText($temporary,(ConvertTo-Json -InputObject @($Records) -Depth 20),[Text.UTF8Encoding]::new($false));[IO.File]::Move($temporary,$file,$true)
}
function Assert-RecoveryObjectBytes([string[]]$Objects){
 if(-not ('VbcRecoveryObjects' -as [type])){
  Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Threading.Tasks;
public static class VbcRecoveryObjects {
 public static void Verify(string root,string[] ids) {
  var psi=new ProcessStartInfo("git"){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true};
  foreach(var a in new[]{"-C",root,"cat-file","--batch"})psi.ArgumentList.Add(a);
  using(var p=Process.Start(psi)) {
   var errors=p.StandardError.ReadToEndAsync();
   var input=Task.Run(async()=>{await p.StandardInput.WriteAsync(String.Join("\n",ids)+"\n");p.StandardInput.Close();});
   var read=Task.Run(()=>{
    var s=p.StandardOutput.BaseStream;var buffer=new byte[65536];
    foreach(var id in ids) {
     var header=new StringBuilder();int b;
     while((b=s.ReadByte())!=10){if(b<0||header.Length>255)throw new IOException("Invalid Git object stream header");header.Append((char)b);}
     var fields=header.ToString().Split(' ');long size;
     if(fields.Length!=3||fields[0]!=id||!Int64.TryParse(fields[2],out size)||size<0||(fields[1]!="commit"&&fields[1]!="tree"&&fields[1]!="blob"))throw new IOException("Unreadable canonical recovery object");
     using(var hash=IncrementalHash.CreateHash(HashAlgorithmName.SHA1)) {
      hash.AppendData(Encoding.ASCII.GetBytes(fields[1]+" "+size+"\0"));
      long remaining=size;
      while(remaining>0){int n=s.Read(buffer,0,(int)Math.Min(buffer.Length,remaining));if(n<=0)throw new IOException("Truncated Git object stream");hash.AppendData(buffer,0,n);remaining-=n;}
      if(Convert.ToHexString(hash.GetHashAndReset()).ToLowerInvariant()!=id)throw new IOException("Canonical object digest mismatch");
     }
     if(s.ReadByte()!=10)throw new IOException("Invalid Git object stream boundary");
    }
   });
   try {
    if(!read.Wait(120000))throw new IOException("Recovery object verification timeout");
    input.GetAwaiter().GetResult();
    if(!p.WaitForExit(10000)||p.ExitCode!=0)throw new IOException("Git recovery object stream failed");
    errors.GetAwaiter().GetResult();
   } finally {if(!p.HasExited)p.Kill(true);}
  }
 }
}
'@
 }
 [VbcRecoveryObjects]::Verify($script:Canonical,$Objects)
}
function Get-MergedRecoveryIdentity([string]$Head){
 $head=$Head
 $null=Invoke-LocalGit $script:Canonical @('cat-file','-e',($head+'^{commit}'))
 $tree=(Invoke-LocalGit $script:Canonical @('rev-parse',($head+'^{tree}'))).Text.Trim()
 $listing=(Invoke-LocalGit $script:Canonical @('ls-tree','-r','-t','-z','--full-tree',$head)).Text
 $entries=@($listing.Split([char]0,[StringSplitOptions]::RemoveEmptyEntries));$objects=[Collections.Generic.HashSet[string]]::new();$null=$objects.Add($head);$null=$objects.Add($tree)
 foreach($entry in $entries){if($entry -notmatch '^(100644|100755|040000) (blob|tree) ([0-9a-f]{40})\t'){throw 'UNSUPPORTED_TRACKED_MODE_PRESERVE'};$null=$objects.Add($Matches[3])}
 $batch=(Invoke-LocalGit $script:Canonical @('cat-file','--batch-check') -InputText (($objects -join "`n")+"`n")).Text
 if(@($batch.Trim() -split '\r?\n').Count -ne $objects.Count -or $batch -match 'missing|ambiguous' -or @($batch.Trim() -split '\r?\n' | Where-Object {$_ -notmatch '^[0-9a-f]{40} (commit|tree|blob) [0-9]+$'}).Count){throw 'CANONICAL_RECOVERY_OBJECTS_UNREADABLE'}
 # Stream and hash every referenced object's actual bytes, without copies or contents in logs.
 Assert-RecoveryObjectBytes @($objects)
 [pscustomobject]@{Tree=$tree;TrackedTreeIdentitySha256=Get-TextSha256 $listing;TrackedEntries=$entries.Count;VerifiedObjects=$objects.Count}
}
function New-MergedRecoveryManifest($Check,[string]$Directory){
 $null=Invoke-LocalGit $script:Canonical @('merge-base','--is-ancestor',$Check.Head,$Check.OriginMain)
 $identity=Get-MergedRecoveryIdentity $Check.Head
 $manifest=[pscustomobject]@{Schema='MERGED_CANONICAL_RECOVERY_V1';Path=$Check.Path;Head=$Check.Head;Tree=$identity.Tree;Branch=$Check.Branch;OriginMain=$Check.OriginMain;CreatedAtUtc=[DateTime]::UtcNow.ToString('o');TrackedTreeIdentitySha256=$identity.TrackedTreeIdentitySha256;TrackedEntries=$identity.TrackedEntries;VerifiedObjects=$identity.VerifiedObjects;RecoverySource='Canonical merged objects; RecoveryRef is pinned only during approved removal';RecoveryRef=('refs/worktree-recovery/'+$Check.Head)}
 $file=Join-Path $Directory manifest.json;$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $file -Encoding utf8
 (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash | Set-Content -LiteralPath ($file+'.sha256')
 $manifest
}
function Assert-MergedRecoveryManifest([string]$Directory){
 Assert-NoLinks $Directory
 $file=Join-Path $Directory manifest.json
 Assert-ProtectedRecoveryEvidence $Directory
 if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -cne (Get-Content -LiteralPath ($file+'.sha256') -Raw).Trim()){throw 'RECOVERY_MANIFEST_DIGEST_MISMATCH'}
 $m=Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
 if($m.Schema -cne 'MERGED_CANONICAL_RECOVERY_V1' -or $m.Head -notmatch '^[0-9a-f]{40}$' -or $m.Tree -notmatch '^[0-9a-f]{40}$'){throw 'INVALID_RECOVERY_MANIFEST'}
 $identity=Get-MergedRecoveryIdentity $m.Head
 if($identity.Tree -cne $m.Tree){throw 'RECOVERY_TREE_MISMATCH'}
 if($identity.TrackedTreeIdentitySha256 -cne $m.TrackedTreeIdentitySha256){throw 'RECOVERY_TRACKED_IDENTITY_MISMATCH'}
 $m
}
function Assert-ProtectedRecoveryEvidence([string]$Directory){
 $allowed=@([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18','S-1-5-32-544')
 foreach($path in @($Directory,(Join-Path $Directory manifest.json),(Join-Path $Directory manifest.json.sha256))){
  Assert-NoLinks $path
  $acl=Get-Acl -LiteralPath $path
  if($path -eq $Directory -and -not $acl.AreAccessRulesProtected){throw 'RECOVERY_ACL_INHERITANCE_CHANGED'}
  foreach($rule in $acl.Access){if($rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin $allowed -or $rule.AccessControlType -ne 'Allow'){throw 'RECOVERY_ACL_UNEXPECTED_ENTRY'}}
 }
}
function Remove-ReviewedGeneratedRoot([string]$Candidate,[string]$Relative){
 if($Relative -cnotin @('node_modules','.next','.turbo','coverage')){throw 'CACHE_ROOT_NOT_ALLOWLISTED'}
 $base=[IO.Path]::GetFullPath($Candidate).TrimEnd('\');$root=[IO.Path]::GetFullPath((Join-Path $base $Relative))
 if($base -ieq $script:Canonical -or [IO.Path]::GetDirectoryName($base) -ine [IO.Path]::GetDirectoryName($script:Canonical) -or -not [IO.Path]::GetFileName($base).StartsWith('vbc-b2b-portal-') -or @(Get-WorktreeRegistry | Where-Object Path -ieq $base).Count -ne 1){throw 'CACHE_CANDIDATE_OUTSIDE_REGISTERED_ADDITIONAL_SCOPE'}
 if([IO.Path]::GetDirectoryName($root) -ine $base){throw 'CACHE_PATH_ESCAPE'}
 Assert-NoLinks $root
 # No recursive filesystem deletion primitive: inspect each item, delete leaves,
 # then empty directories only. A conflict stops; no forced deletion or fallback.
 function Remove-CacheDirectory([string]$Directory){
  Assert-NoLinks $Directory
  foreach($item in Get-ChildItem -LiteralPath $Directory -Force -ErrorAction Stop){
   $rel=[IO.Path]::GetRelativePath($base,$item.FullName).Replace('\','/')
   if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'CACHE_LINK_APPEARED'}
   if(Test-ProtectedLocalName $rel){throw 'PROTECTED_CACHE_CONTENT_APPEARED'}
   if($item.PSIsContainer){Remove-CacheDirectory $item.FullName}else{
    if([VbcReclaimFileIdentity]::Links($item.FullName) -gt 1){throw 'CACHE_HARDLINK_APPEARED'}
    [IO.File]::Delete($item.FullName)
   }
  }
  [IO.Directory]::Delete($Directory,$false)
 }
 if(Test-Path -LiteralPath $root){Remove-CacheDirectory $root}
}
