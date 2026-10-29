[CmdletBinding()]
param([Parameter(Mandatory)][string]$RunDirectory)
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class VbcSizeScan {
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct FindData {
  public uint Attributes; public System.Runtime.InteropServices.ComTypes.FILETIME Creation,Access,Write;
  public uint High,Low,Reserved0,Reserved1;
  [MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)] public string Name;
  [MarshalAs(UnmanagedType.ByValTStr,SizeConst=14)] public string Alt;
 }
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr FindFirstFileW(string pattern,out FindData data);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool FindNextFileW(IntPtr handle,out FindData data);
 [DllImport("kernel32.dll")] static extern bool FindClose(IntPtr handle);
 public class Result {public string Path;public long Bytes,Files,DependencyBytes,DependencyFiles;public List<string> Links=new List<string>();public List<string> Errors=new List<string>();}
 public static Result Scan(string path){var r=new Result{Path=path};try{if((File.GetAttributes(path)&FileAttributes.ReparsePoint)!=0){r.Links.Add(".");r.Errors.Add("ROOT_REPARSE_POINT");return r;}Walk(path,"",r);}catch(Exception e){r.Errors.Add(e.GetType().Name);}return r;}
 static void Walk(string root,string rel,Result r){
  string p=System.IO.Path.Combine(root,rel.Replace('/','\\'));FindData d;
  var h=FindFirstFileW(@"\\?\"+p+@"\*",out d);
  if(h==new IntPtr(-1)){r.Errors.Add(rel+":"+Marshal.GetLastWin32Error());return;}
  try {do {if(d.Name=="."||d.Name==".."||(rel==""&&d.Name==".git"))continue;
   string name=rel==""?d.Name:rel+"/"+d.Name;
   if((d.Attributes&0x400)!=0){r.Links.Add(name);continue;}
   if((d.Attributes&0x10)!=0){Walk(root,name,r);continue;}
   long size=((long)d.High<<32)+d.Low;r.Bytes+=size;r.Files++;
   if(name.StartsWith("node_modules/",StringComparison.OrdinalIgnoreCase)){r.DependencyBytes+=size;r.DependencyFiles++;}
  }while(FindNextFileW(h,out d));int error=Marshal.GetLastWin32Error();if(error!=18)r.Errors.Add(rel+":"+error);
  }finally{FindClose(h);}
 }
}
'@
$root=$RunDirectory
$registry=Get-Content -LiteralPath (Join-Path $root 'registry-before.json') -Raw | ConvertFrom-Json
$sizes=@();$i=0
foreach($wt in $registry){$sizes+=[VbcSizeScan]::Scan($wt.worktree.Replace('/','\'));$i++;if($i%20 -eq 0){Write-Output "Size scan $i / $($registry.Count)"}}
$sizes | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath (Join-Path $root 'sizes.json') -Encoding utf8
