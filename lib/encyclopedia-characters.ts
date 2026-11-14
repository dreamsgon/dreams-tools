import type {Picture} from "./encyclopedia/world-model.ts";

export type EncyclopediaCharacter={id:string;name:string;role:"pc"|"companion"|"npc"|"creature";detail:string;world:string;worldId:string;campaignId:string|null;/** Set only when a campaign is paired: where a character in that campaign's world comes from. */origin?:string;hasStatblock:boolean;picture?:Picture};
export type EncyclopediaRaw={worlds?:{id:string;name:string;isTemplate?:boolean}[];campaigns?:{id:string;name:string;worldId?:string;maptableCampaignId?:string}[];entries?:{id:string;title:string;kind:string;worldId:string;campaignId:string|null;character?:{role?:string;location?:string;faction?:string;status?:string;statblock?:string;statblockRolls?:boolean};picture?:Picture}[]};

const roleName={pc:"Player character",companion:"Companion",npc:"NPC",creature:"Creature"} as const;

/** Characters from the signed-in user's Encyclopedia (read-only). Templates are left out. */
export function encyclopediaCharacters(raw:EncyclopediaRaw):EncyclopediaCharacter[]{
 const worlds=new Map((raw.worlds??[]).filter(w=>!w.isTemplate).map(w=>[w.id,w.name])),campaigns=new Map((raw.campaigns??[]).map(c=>[c.id,c.name]));
 return (raw.entries??[]).filter(e=>e.kind==="character"&&worlds.has(e.worldId)).map(e=>{
  const role:EncyclopediaCharacter["role"]=e.character?.role==="pc"||e.character?.role==="companion"||e.character?.role==="creature"?e.character.role:"npc";
  const detail=[roleName[role],e.character?.faction||e.character?.location,e.campaignId?campaigns.get(e.campaignId):"",e.character?.status&&e.character.status!=="active"?e.character.status:""].filter(Boolean).join(" · ");
  const hasStatblock=!!e.character?.statblock?.trim();
  return {id:e.id,name:e.title.slice(0,120),role,detail:hasStatblock?`${detail} · Statblock`:detail,world:worlds.get(e.worldId)!,worldId:e.worldId,campaignId:e.campaignId,hasStatblock,picture:e.picture};
 }).sort((a,b)=>a.world.localeCompare(b.world)||a.name.localeCompare(b.name));
}

/** The Encyclopedia campaign paired with a Maptable campaign, if any. */
export function pairedCampaign(raw:EncyclopediaRaw,maptableCampaignId:string|null|undefined){
 return maptableCampaignId?(raw.campaigns??[]).find(c=>c.maptableCampaignId===maptableCampaignId):undefined;
}

/**
 * Characters for the token picker. With a paired campaign and `all` false, only what that campaign can see: its own pages plus its world's shared pages.
 * With `all` true, every character grouped by world, each one in the paired campaign's world marked with where it comes from.
 * Without a paired campaign, every character as before.
 */
export function campaignCharacters(raw:EncyclopediaRaw,maptableCampaignId:string|null|undefined,all:boolean):EncyclopediaCharacter[]{
 const list=encyclopediaCharacters(raw),paired=pairedCampaign(raw,maptableCampaignId);
 if(!paired)return list;
 const names=new Map((raw.campaigns??[]).map(c=>[c.id,c.name]));
 const mark=(c:EncyclopediaCharacter)=>({...c,origin:c.campaignId===paired.id?"This campaign":c.campaignId===null?"Shared lore":names.get(c.campaignId)??"Another campaign"});
 const here=list.filter(c=>c.worldId===paired.worldId);
 if(!all)return here.filter(c=>c.campaignId===null||c.campaignId===paired.id).map(mark);
 return list.map(c=>c.worldId===paired.worldId?mark(c):c);
}
