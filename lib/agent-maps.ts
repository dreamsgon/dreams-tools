import {syncConditionRounds} from "./initiative-tracker";
import { applyWorkspaceHpStates } from "./token-hp-state";
import { z } from "zod";
import { newScene, sceneSchema, workspaceSchema, type Workspace, type Scene } from "./model";
import { sceneCampaign, requireCampaign } from "./campaign-settings";
import { syncTokenAttachments } from "./token-attachments";

export function campaignScenes(workspace:Workspace, campaignId:string) {
  requireCampaign(workspace,campaignId);
  return workspace.scenes.filter(scene=>{try{return sceneCampaign(workspace,scene.id)===campaignId;}catch{return false;}});
}
export function campaignAssets(workspace:Workspace,campaignId:string) {
  const scenes=campaignScenes(workspace,campaignId);
  const roster=workspace.tokenLibrary.filter(t=>workspace.libraryCampaigns[t.id]===campaignId && t.rosterRole!=="library");
  const used=new Set([...scenes.flatMap(s=>[s.mapId,...s.tokens.flatMap(t=>[t.assetId,t.borderAssetId])]),...roster.flatMap(t=>[t.assetId,t.borderAssetId])]);
  return workspace.assets.filter(a=>workspace.assetCampaigns[a.id]===campaignId || used.has(a.id));
}
const changes=sceneSchema.omit({id:true,containerId:true,folder:true}).partial().strict();
export const agentBatchSchema=z.object({revision:z.string().min(1),operations:z.array(z.discriminatedUnion("action",[
  z.object({action:z.literal("createScene"),changes}).strict(),
  z.object({action:z.literal("updateScene"),sceneId:z.string().min(1),changes}).strict(),
])).min(1).max(30)}).strict();
export function applyAgentOperations(workspace:Workspace,campaignId:string,input:unknown) {
  const batch=agentBatchSchema.parse(input);
  const next=structuredClone(workspace), allowed=new Set(campaignScenes(workspace,campaignId).map(s=>s.id));
  const assetIds=new Set(campaignAssets(workspace,campaignId).map(a=>a.id));
  const conditionIds=new Set(campaignScenes(workspace,campaignId).flatMap(s=>s.tokens.flatMap(t=>t.conditions)));
  const touched:string[]=[];
  for(const operation of batch.operations){
    let previous:Scene;
    if(operation.action==='createScene'){
      previous=newScene();previous.containerId=campaignId;next.scenes.push(previous);allowed.add(previous.id);
    } else {
      if(!allowed.has(operation.sceneId))throw new Error("Scene is outside this campaign.");
      previous=next.scenes.find(s=>s.id===operation.sceneId)!;
    }
    const updated=sceneSchema.parse({...previous,...operation.changes});
    if(updated.tokens.some(t=>t.conditions.some(id=>!conditionIds.has(id))))throw new Error("Use conditions already used in this campaign.");
    const references=[updated.mapId,...updated.tokens.flatMap(t=>[t.assetId,t.borderAssetId])].filter(Boolean);
    if(references.some(id=>!assetIds.has(id!)))throw new Error("Use assets already assigned to or used in this campaign.");
    if(updated.pointsOfInterest.some(p=>p.targetSceneId&&!allowed.has(p.targetSceneId)))throw new Error("Linked maps must belong to this campaign.");
    for(const items of [updated.tokens,updated.effects,updated.measurements,updated.pointsOfInterest,updated.poiFolders]) {
      if(new Set(items.map(i=>i.id)).size!==items.length)throw new Error("Element IDs must be unique within each list.");
    }
    const folders=new Map(updated.poiFolders.map(f=>[f.id,f]));
    for(const folder of updated.poiFolders){let id:string|null=folder.id;const seen=new Set<string>();while(id){if(seen.has(id)||!folders.has(id))throw new Error("Invalid POI folder hierarchy.");seen.add(id);id=folders.get(id)!.parentId;}}
    if(updated.pointsOfInterest.some(p=>p.folderId&&!folders.has(p.folderId)))throw new Error("POI folder does not exist.");
    syncConditionRounds(updated,previous);
    const synced=syncTokenAttachments(previous,updated);
    for(const effect of synced.effects){if(!effect.tokenId)continue;const token=synced.tokens.find(t=>t.id===effect.tokenId);const origin=token??previous.tokens.find(t=>t.id===effect.tokenId);if(origin){effect.x=origin.x;effect.y=origin.y;}if(!token)effect.tokenId=null;}
    next.scenes[next.scenes.findIndex(s=>s.id===previous.id)]=synced;touched.push(synced.id);
  }
  applyWorkspaceHpStates(workspace,next);
  const result=workspaceSchema.parse(next);
  return {workspace:result,sceneIds:touched};
}

/** Describe the same validated scene format to external clients. */
export function agentJsonSchema(schema:z.ZodTypeAny):Record<string,unknown>{
 if(schema instanceof z.ZodOptional)return agentJsonSchema(schema.unwrap());
 if(schema instanceof z.ZodDefault)return agentJsonSchema(schema.removeDefault());
 if(schema instanceof z.ZodNullable)return {anyOf:[agentJsonSchema(schema.unwrap()),{type:"null"}]};
 if(schema instanceof z.ZodEffects)return agentJsonSchema(schema.innerType());
 if(schema instanceof z.ZodObject){const shape=schema.shape;return {type:"object",properties:Object.fromEntries(Object.entries(shape).map(([key,value])=>[key,agentJsonSchema(value as z.ZodTypeAny)])),required:Object.entries(shape).filter(([,value])=>!(value as z.ZodTypeAny).isOptional()).map(([key])=>key),additionalProperties:false};}
 if(schema instanceof z.ZodArray)return {type:"array",items:agentJsonSchema(schema.element),...(schema._def.minLength?{minItems:schema._def.minLength.value}:{}),...(schema._def.maxLength?{maxItems:schema._def.maxLength.value}:{})};
 if(schema instanceof z.ZodDiscriminatedUnion)return {oneOf:schema.options.map((item:z.ZodTypeAny)=>agentJsonSchema(item))};
 if(schema instanceof z.ZodEnum)return {type:"string",enum:schema.options};
 if(schema instanceof z.ZodLiteral)return {const:schema.value};
 if(schema instanceof z.ZodUnion)return {anyOf:schema.options.map((item:z.ZodTypeAny)=>agentJsonSchema(item))};
 if(schema instanceof z.ZodBoolean)return {type:"boolean"};
 if(schema instanceof z.ZodString){const result:Record<string,unknown>={type:"string"};for(const check of schema._def.checks){if(check.kind==="min")result.minLength=check.value;if(check.kind==="max")result.maxLength=check.value;if(check.kind==="regex")result.pattern=check.regex.source;}return result;}
 if(schema instanceof z.ZodNumber){const result:Record<string,unknown>={type:"number"};for(const check of schema._def.checks){if(check.kind==="min")result.minimum=check.value;if(check.kind==="max")result.maximum=check.value;if(check.kind==="int")result.type="integer";}return result;}
 return {};
}
