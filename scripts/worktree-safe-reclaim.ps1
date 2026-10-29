#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Path,[switch]$Execute,[string]$Confirmation='')
. (Join-Path $PSScriptRoot 'worktree-common.ps1')
$check=Get-ReclaimCheck $Path
if(-not $Execute){$check | ConvertTo-Json -Depth 6;exit 0}
if($Confirmation -cne 'RECLAIM-VERIFIED-WORKTREE'){throw 'Explicit confirmation is required'}
if(-not $check.Eligible){$check | ConvertTo-Json -Depth 6;throw 'Preserved: safety gates did not pass'}
$backup=Join-Path $script:BackupParent ('reclaim-'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff')+'-'+[Guid]::NewGuid().ToString('N'))
$disk=[IO.DriveInfo]::new([IO.Path]::GetPathRoot($backup))
$size=(Get-ChildItem -LiteralPath (Join-Path $script:Canonical '.git') -Recurse -Force -File | Measure-Object Length -Sum).Sum
if($disk.AvailableFreeSpace -lt ($size+1GB)){throw 'Insufficient reserve for verified Git backup'}
New-ProtectedDirectory $backup
function Write-Action([string]$State){[pscustomobject]@{Timestamp=[DateTime]::UtcNow.ToString('o');Path=$check.Path;Head=$check.Head;Branch=$check.Branch;State=$State;Backup=$backup} | ConvertTo-Json -Compress | Add-Content -LiteralPath (Join-Path $backup 'actions.jsonl')}
try {
 Write-Action 'BACKUP_STARTED'
 $bundle=Join-Path $backup 'history.bundle'
 $null=Invoke-LocalGit $check.Path @('bundle','create',$bundle,'HEAD')
 $null=Invoke-LocalGit $script:Canonical @('bundle','verify',$bundle)
 $manifest=[pscustomobject]@{Path=$check.Path;Head=$check.Head;Branch=$check.Branch;Classification='SAFE_TO_RECLAIM';Reason='Exact ancestor, accepted task, idle host, no ignored/untracked data';BundleSha256=(Get-FileHash -LiteralPath $bundle -Algorithm SHA256).Hash;Files=@()}
 # Preserve a verified per-file digest. Tracked bytes are recoverable from the bundle.
 $tracked=(Invoke-LocalGit $check.Path @('ls-files','-z')).Text.Split([char]0,[StringSplitOptions]::RemoveEmptyEntries)
 foreach($relative in $tracked){$full=Join-Path $check.Path $relative;if(-not (Test-Path -LiteralPath $full -PathType Leaf)){throw 'Non-file tracked entry; preserve candidate'};$manifest.Files+= [pscustomobject]@{Path=$relative;Sha256=(Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash}}
 $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $backup 'manifest.json') -Encoding utf8
 # Prove the full snapshot can be recovered before removing its source.
 $restore=Join-Path $backup 'restore-test'
 $psi=[Diagnostics.ProcessStartInfo]::new('git');$psi.UseShellExecute=$false;$psi.CreateNoWindow=$true;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
 foreach($a in @('clone','--no-hardlinks','--no-checkout',$bundle,$restore)){$psi.ArgumentList.Add($a)}
 $proc=[Diagnostics.Process]::Start($psi);$outTask=$proc.StandardOutput.ReadToEndAsync();$errTask=$proc.StandardError.ReadToEndAsync();$proc.WaitForExit();$null=$outTask.Result;$null=$errTask.Result;if($proc.ExitCode -ne 0){throw 'Restore clone failed'}
 $null=Invoke-LocalGit $restore @('checkout','--detach',$check.Head)
 foreach($f in $manifest.Files){if((Get-FileHash -LiteralPath (Join-Path $restore $f.Path) -Algorithm SHA256).Hash -ne $f.Sha256){throw 'Restored source SHA-256 mismatch'}}
 $fresh=Get-ReclaimCheck $check.Path
 if(-not $fresh.Eligible -or $fresh.Head -ne $check.Head -or $fresh.Branch -ne $check.Branch -or $fresh.OriginMain -ne $check.OriginMain){throw 'Candidate changed during backup'}
 foreach($f in $manifest.Files){if((Get-FileHash -LiteralPath (Join-Path $check.Path $f.Path) -Algorithm SHA256).Hash -ne $f.Sha256){throw 'Source changed during backup'}}
 if((Get-FileHash -LiteralPath $bundle -Algorithm SHA256).Hash -ne $manifest.BundleSha256){throw 'Bundle digest changed'}
 Write-Action 'BACKUP_VERIFIED'
 $null=Invoke-LocalGit $script:Canonical @('worktree','remove',$check.Path)
 Write-Action 'REMOVED'
 & (Join-Path $PSScriptRoot 'worktree-health-check.ps1')
}catch{Write-Action 'ERROR_PRESERVED_OR_CHECK_LOG';throw}
