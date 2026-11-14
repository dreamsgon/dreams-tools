import {workspaceSchema,type Workspace} from './model.ts';

import type { Bucket } from './storage-types';
type Ref={id:string;key:string};
type Manifest={format:'maptable-segments-v1';fields:Record<string,string>;scenes:Ref[];collections:Ref[];legacyBackup?:string};
type Snapshot={workspace:Workspace;revision:string;manifest:Manifest|null;legacyRaw?:unknown};
const rootKey=(prefix:string)=>prefix+'workspace.json';
async function mapLimited<T,U>(items:T[],fn:(item:T)=>Promise<U>):Promise<U[]>{const result=new Array<U>(items.length);let cursor=0;await Promise.all(Array.from({length:Math.min(8,items.length)},async()=>{while(cursor<items.length){const index=cursor++;result[index]=await fn(items[index]);}}));return result;}
const isManifest=(x:unknown):x is Manifest=>!!x&&typeof x==='object'&&(x as Manifest).format==='maptable-segments-v1'&&!!(x as Manifest).fields&&typeof (x as Manifest).fields==='object'&&Array.isArray((x as Manifest).scenes)&&Array.isArray((x as Manifest).collections);
function validate(workspace:unknown):Workspace {const result=workspaceSchema.safeParse(workspace);if(!result.success)throw new Error('Invalid scene data. Your previous cloud save is unchanged.');return result.data;}
/** Give legacy text folders stable IDs before the schema's random-ID migration runs. */
function normalizeLegacyFolders(raw:unknown):unknown {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return raw;
 const value=raw as Record<string,unknown>;if(!Array.isArray(value.scenes)||(value.collections!==undefined&&!Array.isArray(value.collections)))return raw;
 const collections=[...((value.collections??[]) as Record<string,unknown>[])];
 if(collections.some(row=>!row||typeof row!=='object'))return raw;
 const used=new Set(collections.map(row=>row.id).filter((id):id is string=>typeof id==='string'));
 const names=[...new Set(value.scenes.flatMap(scene=>scene&&typeof scene==='object'&&!scene.containerId&&typeof scene.folder==='string'&&scene.folder.trim()?[scene.folder.trim()]:[]))].sort();
 for(const name of names){if(collections.some(folder=>folder.parentId===null&&folder.kind==='folder'&&folder.name===name))continue;
  let a=2166136261,b=2246822519;for(let i=0;i<name.length;i++){a=Math.imul(a^name.charCodeAt(i),16777619);b=Math.imul(b^name.charCodeAt(i),3266489917);}const base=`legacy-folder-${(a>>>0).toString(16)}-${(b>>>0).toString(16)}`;let id=base,n=1;while(used.has(id))id=`${base}-${n++}`;used.add(id);collections.push({id,name,kind:'folder',parentId:null});
 }
 return {...value,collections};
}
async function readSegment(bucket:Bucket,key:string):Promise<unknown> {const item=await bucket.get(key);if(!item)throw new Error('A workspace segment is missing. Your cloud save was not changed.');return item.json();}
/** workspace.json remains the single CAS commit point, including during migration. */
export async function loadWorkspace(bucket:Bucket,prefix:string):Promise<Snapshot|null> {
 const root=await bucket.get(rootKey(prefix));if(!root)return null;
 const raw:unknown=await root.json();
 if(!isManifest(raw))return {workspace:validate(normalizeLegacyFolders(raw)),revision:root.etag,manifest:null,legacyRaw:raw};
 const keys=[...Object.values(raw.fields),...raw.scenes.map(s=>s.key),...raw.collections.map(s=>s.key)];
 if(keys.some(key=>typeof key!=='string'||!key.startsWith(prefix+'workspace-segments/'))||[...raw.scenes,...raw.collections].some(s=>typeof s.id!=='string'))throw new Error('Invalid workspace manifest.');
 const values=await mapLimited(keys,key=>readSegment(bucket,key));let index=0;
 const fields=Object.fromEntries(Object.keys(raw.fields).map(field=>[field,values[index++]]));
 const scenes=raw.scenes.map(()=>values[index++]),collections=raw.collections.map(()=>values[index++]);
 const workspace=validate({...fields,scenes,collections});
 if(workspace.scenes.some((s,i)=>s.id!==raw.scenes[i].id)||workspace.collections.some((s,i)=>s.id!==raw.collections[i].id))throw new Error('Invalid workspace manifest.');
 return {workspace,revision:root.etag,manifest:raw};
}
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
async function writeSegment(bucket:Bucket,prefix:string,value:unknown,previous?:unknown):Promise<string>{
 const text=JSON.stringify(value);const previousSize=previous===undefined?0:new TextEncoder().encode(JSON.stringify(previous)).length;if(new TextEncoder().encode(text).length>Math.max(5_000_000,previousSize))throw new Error('This scene or workspace segment exceeds its allowed size; reduce its content before saving.');
 const key=prefix+'workspace-segments/'+crypto.randomUUID()+'.json';await bucket.put(key,text,{httpMetadata:{contentType:'application/json'}});return key;
}
/** Write new immutable segments, then atomically publish their manifest if revision matches. */
export async function saveWorkspace(bucket:Bucket,prefix:string,workspace:Workspace,revision:string|null):Promise<{revision:string}|null>{
 const previous=await loadWorkspace(bucket,prefix);
 if((previous?.revision??null)!==revision)return null;
 return saveFromSnapshot(bucket,prefix,workspace,revision,previous);
}
async function saveFromSnapshot(bucket:Bucket,prefix:string,workspace:Workspace,revision:string|null,previous:Snapshot|null):Promise<{revision:string}|null>{
 const next=validate(workspace);
 const {scenes,collections,...fields}=next,old=previous?.workspace;
 const tasks:{kind:'field'|'scene'|'collection';id:string;value:unknown;oldValue:unknown;oldKey?:string}[]=[];
 for(const [id,value] of Object.entries(fields))tasks.push({kind:'field',id,value,oldValue:old?.[id as keyof Workspace],oldKey:previous?.manifest?.fields[id]});
 const queue=<T extends {id:string}>(kind:'scene'|'collection',items:T[],oldItems:T[],oldRefs:Ref[])=>{const values=new Map(oldItems.map(x=>[x.id,x])),keys=new Map(oldRefs.map(x=>[x.id,x.key]));for(const item of items)tasks.push({kind,id:item.id,value:item,oldValue:values.get(item.id),oldKey:keys.get(item.id)});};
 queue('scene',scenes,old?.scenes??[],previous?.manifest?.scenes??[]);queue('collection',collections,old?.collections??[],previous?.manifest?.collections??[]);
 const written=await mapLimited(tasks,async task=>({...task,key:task.oldKey&&equal(task.value,task.oldValue)?task.oldKey:await writeSegment(bucket,prefix,task.value,task.oldValue)}));
 const fieldRefs=Object.fromEntries(written.filter(x=>x.kind==='field').map(x=>[x.id,x.key]));
 const sceneRefs=written.filter(x=>x.kind==='scene').map(x=>({id:x.id,key:x.key})),collectionRefs=written.filter(x=>x.kind==='collection').map(x=>({id:x.id,key:x.key}));
 let legacyBackup=previous?.manifest?.legacyBackup;
 if(previous&&!previous.manifest){legacyBackup=prefix+'workspace-segments/legacy-'+crypto.randomUUID()+'.json';await bucket.put(legacyBackup,JSON.stringify(previous.legacyRaw),{httpMetadata:{contentType:'application/json'}});}
 const manifest:Manifest={format:'maptable-segments-v1',fields:fieldRefs,scenes:sceneRefs,collections:collectionRefs,...(legacyBackup?{legacyBackup}:{})};
 const saved=await bucket.put(rootKey(prefix),JSON.stringify(manifest),{onlyIf:revision?{etagMatches:revision}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
 return saved?{revision:saved.etag}:null;
}
export type WorkspacePatch=Partial<Omit<Workspace,'scenes'>>&{scenes?:{upsert?:Workspace['scenes'];remove?:string[];order?:string[]}};
export async function patchWorkspace(bucket:Bucket,prefix:string,revision:string|null,patch:WorkspacePatch):Promise<{revision:string}|null>{
 const current=await loadWorkspace(bucket,prefix);if(!current||current.revision!==revision)return null;
 return saveFromSnapshot(bucket,prefix,applyWorkspacePatch(current.workspace,patch),revision,current);
}
/** Saves `change(current)` when the cloud copy is still at `revision`. Null when it moved on, or when there is none. */
export async function updateWorkspace(bucket:Bucket,prefix:string,revision:string|null,change:(current:Workspace)=>Workspace):Promise<{revision:string}|null>{
 const current=await loadWorkspace(bucket,prefix);if(!current||current.revision!==revision)return null;
 return saveFromSnapshot(bucket,prefix,change(current.workspace),revision,current);
}
/** A save's changes (lib/workspace-save.ts workspacePatch) applied to the workspace they were made against. */
export function applyWorkspacePatch(workspace:Workspace,patch:WorkspacePatch):Workspace{
 const current={workspace};
 if(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(key=>!(key in current.workspace)))throw new Error('Invalid workspace changes.');
 const {scenes:change,...metadata}=patch;
 if(change!==undefined&&(!change||typeof change!=='object'||Array.isArray(change)||Object.keys(change).some(k=>!['upsert','remove','order'].includes(k))||!Array.isArray(change.upsert)||!Array.isArray(change.remove)||change.remove.some(id=>typeof id!=='string')||change.upsert.some(scene=>!scene||typeof scene!=='object'||typeof scene.id!=='string')))throw new Error('Invalid scene changes.');
 const remove=new Set(change?.remove??[]),updates=new Map((change?.upsert??[]).map(scene=>[scene.id,scene]));
 if(updates.size!==(change?.upsert?.length??0)||[...updates.keys()].some(id=>remove.has(id)))throw new Error('Duplicate scene changes.');
 const scenes=current.workspace.scenes.filter(scene=>!remove.has(scene.id)).map(scene=>{const updated=updates.get(scene.id);updates.delete(scene.id);return updated??scene;});scenes.push(...updates.values());
 if(change?.order){if(!Array.isArray(change.order)||change.order.length!==scenes.length||new Set(change.order).size!==scenes.length||change.order.some(id=>!scenes.some(scene=>scene.id===id)))throw new Error('Invalid scene order.');const byId=new Map(scenes.map(scene=>[scene.id,scene]));scenes.splice(0,scenes.length,...change.order.map(id=>byId.get(id)!));}
 return {...current.workspace,...metadata,scenes};
}
