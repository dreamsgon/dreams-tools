#!/usr/bin/env node
// Explicit, local Git sync. Uses the user's existing Git authentication.
//
//   export  writes the campaign in the numbered RP layout (see lib/encyclopedia/rp-export.ts) into the repository root,
//           or into --dir <subfolder> when the repository holds more than the campaign. Files you changed in the repository
//           since the last export are kept and listed; files RPG Tools owns (README.md, AGENTS.md, folder READMEs, .rpg-tools/)
//           are always rewritten. --player-safe leaves out 6-GM-Only/ and the restore copy.
//   pull    reads the restore copy .rpg-tools/campaign.json (or, for repositories made by the older export,
//           world-manager/<campaign>/campaign.json) and writes it to a new file you can import as a new copy.
import {readFile,writeFile,mkdir,realpath,lstat,unlink,readdir,rmdir} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {workspaceSchema,campaignExport} from '../lib/encyclopedia/world-model.ts';
import {librarySchema} from '../lib/encyclopedia/tables.ts';
import {rpExportFiles,planWrite,textHash,FOLDERS_LIST} from '../lib/encyclopedia/rp-export.ts';
export function runGit(repo,args){const r=spawnSync('git',['-C',repo,...args],{encoding:'utf8',maxBuffer:4_000_000,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});if(r.status!==0)throw new Error(r.stderr?.trim()||'Git command failed');return r.stdout.trim();}
export function remoteMatches(remote,repository){return remote===`https://github.com/${repository}.git`||remote===`https://github.com/${repository}`||remote===`git@github.com:${repository}.git`||remote===`ssh://git@github.com/${repository}.git`;}
// A path inside the repository: no escape, and no symbolic link anywhere along it.
async function safePath(repo,relative){const target=path.resolve(repo,relative);if(!target.startsWith(repo+path.sep))throw new Error('Path escapes repository');let at=repo;for(const component of relative.split('/')){at=path.join(at,component);try{if((await lstat(at)).isSymbolicLink())throw new Error('Refusing a symbolic link in export path');}catch(e){if(e.code!=='ENOENT')throw e;}}return target;}
async function readIfExists(file){try{return await readFile(file,'utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}}
export function checkDir(dir){if(!dir)return '';if(!/^[a-zA-Z0-9_-]+(\/[a-zA-Z0-9_-]+)*$/.test(dir))throw new Error('--dir must be a relative folder such as campaign or notes/salt-road');return dir;}
// Every file of an earlier export that is in the repository (the numbered folders, .rpg-tools, the two root files) with the hash of its text.
async function listLayout(repo,prefix){
 const out=new Map();
 const walk=async rel=>{const full=await safePath(repo,prefix+rel);let st;try{st=await lstat(full);}catch(e){if(e.code==='ENOENT')return;throw e;}
  if(st.isSymbolicLink())throw new Error('Refusing a symbolic link in export path');
  if(st.isDirectory()){for(const n of (await readdir(full)).sort())await walk(rel+'/'+n);}else if(st.isFile())out.set(rel,textHash(await readFile(full,'utf8')));};
 for(const top of [...FOLDERS_LIST,'.rpg-tools','README.md','AGENTS.md'])await walk(top);
 return out;
}
async function pruneEmpty(repo,prefix,relative){
 const parts=relative.split('/').slice(0,-1);
 while(parts.length){const dir=await safePath(repo,prefix+parts.join('/'));try{if((await readdir(dir)).length)return;await rmdir(dir);}catch(e){if(e.code==='ENOENT'){parts.pop();continue;}return;}parts.pop();}
}
/**
 * Writes the RP layout. `input` is a one-campaign workspace (a campaign export). The decisions (write, skip, remove) come from
 * planWrite in lib/encyclopedia/rp-export.ts. Returns written, kept (files the user owns or edited, left alone), removed
 * (stale files, and with includeGm false the GM files) and warnings.
 */
export async function exportCampaign(input,repo,options={}){
 const state=workspaceSchema.parse(input);if(state.campaigns.length!==1)throw new Error('Use a single-campaign export from AI & GitHub.');
 const c=state.campaigns[0],dir=checkDir(options.dir),includeGm=options.includeGm!==false;repo=await realpath(repo);
 const prefix=dir?dir+'/':'';
 const existing=await listLayout(repo,prefix);
 const oldLog=await readIfExists(await safePath(repo,prefix+'8-Archive/Export-Log.md'));
 let previous=null;const oldMap=await readIfExists(await safePath(repo,prefix+'.rpg-tools/files.json'));
 if(oldMap){try{previous=JSON.parse(oldMap);}catch{previous=null;}}
 const files=rpExportFiles(campaignExport(state,c.id),c.id,{includeGm,exportedAt:options.exportedAt??new Date().toISOString(),tables:options.tables,exportLog:oldLog??undefined});
 const plan=planWrite(existing,previous,files,includeGm);
 const written=[],removed=[],warnings=[];
 for(const f of plan.write){
  const target=await safePath(repo,prefix+f.path);
  await mkdir(path.dirname(target),{recursive:true});await safePath(repo,prefix+f.path);
  if(existing.get(f.path)!==textHash(f.text))await writeFile(target,f.text);
  written.push(f.path);
 }
 for(const r of plan.remove){await unlink(await safePath(repo,prefix+r.path));removed.push(r.path);await pruneEmpty(repo,prefix,r.path);}
 const kept=plan.skip.map(x=>x.path);
 // The id map records the hash of each file as it was last written, so a file left alone still counts as edited next time.
 const idMap=files.find(f=>f.path==='.rpg-tools/files.json');
 if(idMap){const map=JSON.parse(idMap.text),old=previous&&typeof previous.hashes==='object'?previous.hashes:{};
  for(const x of plan.skip){if(typeof old[x.path]==='string')map.hashes[x.path]=old[x.path];else delete map.hashes[x.path];}
  await writeFile(await safePath(repo,prefix+'.rpg-tools/files.json'),JSON.stringify(map,null,2)+'\n');}
 if(!includeGm){const gm=removed.filter(p=>p.startsWith('6-GM-Only/')||p==='.rpg-tools/campaign.json');if(gm.length)warnings.push(`Player-safe export: removed ${gm.length} GM file(s) from an earlier export, edited or not (${gm.slice(0,3).join(', ')}${gm.length>3?', ...':''}). They are still in the repository's Git history.`);}
 try{await lstat(await safePath(repo,prefix+'world-manager'));warnings.push('The repository has a legacy world-manager/ folder from the old export. It may hold the full campaign, GM content included; remove it yourself if this repository is shared.');}catch(e){if(e.code!=='ENOENT')throw e;}
 return {relative:dir||'.',prefix,campaign:c,written,kept,removed,warnings,skipped:plan.skip,files};
}
// The restore copy of the RP layout, or the older world-manager/<id>/campaign.json, so old repositories still restore.
export async function restoreText(repo,prefix,campaign){
 let text=await readIfExists(await safePath(repo,prefix+'.rpg-tools/campaign.json'));
 if(text===null)text=await readIfExists(await safePath(repo,`${prefix}world-manager/${campaign}/campaign.json`));
 if(text===null)throw new Error('No restore copy found (.rpg-tools/campaign.json). A player-safe export has none.');
 return text;
}
const flags=['--push','--player-safe'],values=['--file','--repo','--campaign','--repository','--branch','--out','--dir','--tables'];
export async function main(argv){const command=argv.shift();const args={};while(argv.length){const key=argv.shift();if(flags.includes(key)){args[key.slice(2)]=true;continue;}if(!values.includes(key)||!argv.length)throw new Error('Unknown or missing argument: '+key);args[key.slice(2)]=argv.shift();}
 if(!args.repo||!['export','pull'].includes(command))throw new Error('Usage: export --file campaign.json --repo /clone [--dir subfolder] [--tables tables.json] [--player-safe] [--push] | pull --campaign ID --repository owner/repo --branch main --repo /clone [--dir subfolder] --out restored.json');
 const repo=await realpath(args.repo);if(path.resolve(runGit(repo,['rev-parse','--show-toplevel']))!==repo)throw new Error('--repo must be the Git repository root');
 const dir=checkDir(args.dir),prefix=dir?dir+'/':'';
 if(command==='export'){
  if(!args.file)throw new Error('--file is required');const raw=await readFile(args.file,'utf8');if(Buffer.byteLength(raw)>2_000_000)throw new Error('Backup too large');const input=workspaceSchema.parse(JSON.parse(raw));if(input.campaigns.length!==1)throw new Error('Export one campaign at a time');const c=input.campaigns[0];
  const tables=args.tables?librarySchema.parse(JSON.parse(await readFile(args.tables,'utf8'))):undefined;
  if(args.push){if(!c.github.repository)throw new Error('Configure this campaign’s GitHub repository first');if(runGit(repo,['status','--porcelain']))throw new Error('Commit or stash existing repository changes before sync');if(!remoteMatches(runGit(repo,['remote','get-url','origin']),c.github.repository))throw new Error('origin does not match this campaign’s configured GitHub repository');if(runGit(repo,['branch','--show-current'])!==c.github.branch)throw new Error('Check out the configured branch first');}
  const result=await exportCampaign(input,repo,{dir,tables,includeGm:!args['player-safe']});
  const note=(result.kept.length?` Kept ${result.kept.length} file(s) you own or edited since the last export: ${result.kept.slice(0,5).join(', ')}${result.kept.length>5?', ...':''}.`:'')+result.warnings.map(w=>' '+w).join('');
  if(args.push){runGit(repo,['add','-A','--',...(dir?[dir]:['.'])]);if(runGit(repo,['diff','--cached','--name-only']))runGit(repo,['commit','-m',`Back up campaign ${c.name}`]);runGit(repo,['push','origin',`HEAD:refs/heads/${c.github.branch}`]);console.log('Campaign exported, committed, and pushed.'+note);}else console.log(`Campaign exported (${result.written.length} files) into ${dir||'the repository root'}. Review the files, then commit and push when ready.`+note);
 }else{
  const {campaign,repository,branch='main',out}=args;if(!campaign||!repository||!out||!/^[a-zA-Z0-9_-]+$/.test(campaign)||!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository)||!/^[a-zA-Z0-9_/-]+$/.test(branch)||branch.startsWith('-'))throw new Error('Provide a valid campaign ID, repository, branch, and new output path');
  if(runGit(repo,['status','--porcelain']))throw new Error('Commit or stash repository changes before pull');if(!remoteMatches(runGit(repo,['remote','get-url','origin']),repository))throw new Error('origin does not match the requested GitHub repository');if(runGit(repo,['branch','--show-current'])!==branch)throw new Error('Check out the configured branch first');
  runGit(repo,['pull','--ff-only','origin',branch]);
  const text=await restoreText(repo,prefix,campaign);
  const restored=workspaceSchema.parse(JSON.parse(text));if(restored.campaigns.length!==1||restored.campaigns[0].id!==campaign)throw new Error('Repository file does not match this campaign');await writeFile(path.resolve(out),JSON.stringify(campaignExport(restored,campaign),null,2)+'\n',{flag:'wx'});console.log('Restore file written. Import it in the app as a new copy.');
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});
