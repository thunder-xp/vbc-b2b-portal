'use strict';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Standalone CommonJS audit entrypoint; Node built-ins only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const ROOT='C:/VibeCoding/Projects/B2B/vbc-b2b-portal';
const BACK=process.argv[2]; if(!BACK)throw Error('Use worktree-audit.ps1 to initialize protected evidence');
const OUT=path.resolve(process.argv[3]||'outputs');
const sizes=JSON.parse(fs.readFileSync(path.join(BACK,'sizes.json'),'utf8').replace(/^\ufeff/,''));
const env={...process.env,GIT_OPTIONAL_LOCKS:'0'};
function git(cwd,args,ok=[0]) { const r=cp.spawnSync('git',['-C',cwd,...args],{encoding:'utf8',env,maxBuffer:128*1024*1024,windowsHide:true,timeout:120000});if(r.error||!ok.includes(r.status))throw Error('GIT_CHECK_FAILED '+args[0]+' '+(r.error?.code||r.status));return {code:r.status,text:r.stdout}; }
function save(file,data){fs.writeFileSync(file,JSON.stringify(data,null,2));}
function hash(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}
function registry(){return git(ROOT,['worktree','list','--porcelain']).text.trim().split(/\r?\n\r?\n/).map(block=>{const o={};for(const l of block.split(/\r?\n/)){const n=l.indexOf(' ');o[n<0?l:l.slice(0,n)]=n<0?true:l.slice(n+1);}return o;});}
function scan(root){
 const v={files:0,bytes:0,dependencyBytes:0,dependencyFiles:0,links:[],hardlinks:0,errors:[],hashes:[],top:[],hasNodeModules:false,nodeModulesType:null,nextVersion:null};
 try {if(fs.lstatSync(root).isSymbolicLink()){v.errors.push({path:'.',code:'ROOT_LINK_PRESERVED'});return v;}}catch(e){v.errors.push({path:'.',code:e.code});return v;}
 function walk(p,rel,generated){
  let entries;try{entries=fs.readdirSync(p,{withFileTypes:true});}catch(e){v.errors.push({path:rel,code:e.code});return;}
  for(const ent of entries){const name=rel?rel+'/'+ent.name:ent.name;if(!rel&&ent.name==='.git')continue;const full=path.join(p,ent.name);let st;try{st=fs.lstatSync(full);}catch(e){v.errors.push({path:name,code:e.code});continue;}
   if(st.isSymbolicLink()){let target;try{target=fs.readlinkSync(full);}catch{target='UNKNOWN';}v.links.push({path:name,target});if(name==='node_modules'){v.hasNodeModules=true;v.nodeModulesType='link';}continue;}
   const gen=generated||['node_modules','.next','.cache','coverage'].includes(ent.name);
   if(st.isDirectory()){if(!rel)v.top.push(ent.name);if(name==='node_modules'){v.hasNodeModules=true;v.nodeModulesType='regular';}if(!gen)walk(full,name,gen);}
   else if(st.isFile()){v.files++;v.bytes+=st.size;if(name.startsWith('node_modules/')){v.dependencyBytes+=st.size;v.dependencyFiles++;}if(st.nlink>1)v.hardlinks++;if(!gen){try{v.hashes.push({path:name,bytes:st.size,sha256:hash(full)});}catch(e){v.errors.push({path:name,code:e.code});}}}
  }
 }
 walk(root,'',false);
 const fast=sizes.find(s=>s.Path.replaceAll('\\','/').toLowerCase()===root.replaceAll('\\','/').toLowerCase());
 if(fast){v.bytes=fast.Bytes;v.files=fast.Files;v.dependencyBytes=fast.DependencyBytes;v.dependencyFiles=fast.DependencyFiles;for(const l of fast.Links)if(!v.links.some(x=>x.path===l))v.links.push({path:l,target:'NOT_FOLLOWED'});for(const e of fast.Errors)v.errors.push({path:e,code:'NATIVE_ENUMERATION_ERROR'});}
 v.dependencyHardlinks='NOT_EXHAUSTIVELY_QUERIED; generated trees preserved';
 try{const p=path.join(root,'node_modules');if(!fs.lstatSync(p).isSymbolicLink())v.nextVersion=JSON.parse(fs.readFileSync(path.join(p,'next/package.json'),'utf8')).version;}catch{}
 return v;
}
const initial=registry();save(path.join(BACK,'registry-before.json'),initial);
const origin=git(ROOT,['rev-parse','origin/main']).text.trim();
const refs=git(ROOT,['for-each-ref','--format=%(refname) %(objectname)']).text;fs.writeFileSync(path.join(BACK,'refs-before.txt'),refs);
const status=git(ROOT,['status','--porcelain=v1','-z','--untracked-files=all']).text;fs.writeFileSync(path.join(BACK,'canonical-status-before.bin'),status);
save(path.join(BACK,'canonical-baseline.json'),scan(ROOT));
const rows=[];let idx=0;
for(const wt of initial){
 const row={path:wt.worktree,head:wt.HEAD,branch:wt.branch||'(detached)',locked:!!wt.locked,prunable:!!wt.prunable,originMain:origin,reasons:[],classifications:[]};
 try{
  row.status=git(wt.worktree,['status','--porcelain=v1','-z','--untracked-files=all']).text;
  row.ignored=git(wt.worktree,['ls-files','--others','--ignored','--exclude-standard','--directory','-z']).text.split('\0').filter(Boolean);
  row.ancestor=git(ROOT,['merge-base','--is-ancestor',wt.HEAD,origin],[0,1]).code===0;
  row.uniqueCommits=Number(git(ROOT,['rev-list','--count',origin+'..'+wt.HEAD]).text.trim());
  if(!row.ancestor){row.cherry=git(ROOT,['cherry',origin,wt.HEAD]).text;row.patchUnique=row.cherry.split(/\r?\n/).filter(l=>l.startsWith('+')).length;row.patchEquivalent=row.cherry.split(/\r?\n/).filter(l=>l.startsWith('-')).length;row.squashEquivalence='NOT_PROVEN; retained regardless of patch equivalence';}
  row.tree=scan(wt.worktree);
  if(wt.worktree.toLowerCase()===ROOT.toLowerCase())row.classifications.push('PROTECT_MAIN');
  if(row.status)row.classifications.push('PROTECT_DIRTY');
  if(row.locked)row.classifications.push('PROTECT_LOCKED');
  if(!row.ancestor)row.classifications.push('PROTECT_UNMERGED');
  if(row.tree.links.length||row.tree.hardlinks||row.tree.errors.length)row.classifications.push('PROTECT_LOCAL_DATA');
  const task=path.join(wt.worktree,'.codex/CURRENT_TASK.md');row.taskExists=fs.existsSync(task);
  if(row.taskExists){row.classifications.push('PROTECT_ACTIVE');row.reasons.push('CURRENT_TASK exists; no acceptance assumed');}
  row.classifications.push('REVIEW_REQUIRED');row.reasons.push('Audit does not establish complete process/task ownership or acceptance');
  if(row.ignored.length){row.classifications.push('PROTECT_LOCAL_DATA');row.reasons.push('Ignored data retained; no deletion authorization inferred from Git status');}
 }catch(e){row.error=e.message;row.classifications.push('REVIEW_REQUIRED');row.reasons.push('Incomplete inventory');}
 row.classifications=[...new Set(row.classifications)];rows.push(row);idx++;
 if(idx%10===0)console.log(JSON.stringify({progress:idx,total:initial.length}));
 if(idx%20===0)save(path.join(BACK,'inventory-checkpoint.json'),{origin,rows});
}
const summary={timestamp:new Date().toISOString(),originMain:origin,originMainFreshness:'LOCAL_CACHED_REF; remote not contacted',worktrees:rows.length,dirty:rows.filter(r=>r.status).length,ancestor:rows.filter(r=>r.ancestor).length,unmerged:rows.filter(r=>r.ancestor===false).length,withDependencies:rows.filter(r=>r.tree?.hasNodeModules).length,regularDependencies:rows.filter(r=>r.tree?.nodeModulesType==='regular').length,linkedDependencies:rows.filter(r=>r.tree?.nodeModulesType==='link').length,dependencyLogicalBytes:rows.reduce((s,r)=>s+(r.tree?.dependencyBytes||0),0),withIgnored:rows.filter(r=>r.ignored?.length).length,withTask:rows.filter(r=>r.taskExists).length,errors:rows.filter(r=>r.error||r.tree?.errors.length).length,removed:0,provenSafe:0,processVisibility:JSON.parse(fs.readFileSync(path.join(BACK,'environment.json'),'utf8').replace(/^\ufeff/,'' )).ActivityGate||'UNKNOWN_SANDBOX',categories:{}};
for(const r of rows)for(const c of r.classifications)summary.categories[c]=(summary.categories[c]||0)+1;
save(path.join(BACK,'inventory-before.json'),{summary,rows});save(path.join(OUT,'inventory-summary.json'),summary);
const cols=['path','head','branch','locked','prunable','ancestor','uniqueCommits','patchUnique','patchEquivalent','taskExists','classifications','reasons','nodeModulesType','dependencyLogicalBytes','ignoredEntries','errors'];
const csv=[cols,...rows.map(r=>[r.path,r.head,r.branch,r.locked,r.prunable,r.ancestor,r.uniqueCommits,r.patchUnique,r.patchEquivalent,r.taskExists,r.classifications.join(';'),r.reasons.join(';'),r.tree?.nodeModulesType,r.tree?.dependencyBytes,r.ignored?.length,r.error||r.tree?.errors.length||''])].map(a=>a.map(x=>'"'+String(x??'').replaceAll('"','""')+'"').join(',')).join('\r\n');
fs.writeFileSync(path.join(OUT,'worktree-inventory.csv'),'\ufeff'+csv);
console.log(JSON.stringify(summary));
