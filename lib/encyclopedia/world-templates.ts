import {calendarTemplates,makeCalendar} from './calendar-templates.ts';
import {emptyWorkspace,importCopy,newId,workspaceSchema,type Workspace,type Entry} from './world-model.ts';
export const worldStarters=[{id:'blank',title:'Blank world',description:'An empty world for your own structure.',calendarId:null},...calendarTemplates.map(t=>({id:t.id,title:t.id==='custom'?'Homebrew world':t.title,description:t.id==='custom'?'Editable folders and a custom calendar.':t.subtitle,calendarId:t.id}))];
function checked(s:Workspace){const result=workspaceSchema.parse(s);if(new TextEncoder().encode(JSON.stringify(result)).length>2000000)throw Error('The combined workspace exceeds 2 MB. Export and free space before creating a copy.');return result;}
export function createStarter(s:Workspace,starterId:string,name:string,campaignName:string){
 const starter=worldStarters.find(t=>t.id===starterId);if(!starter)throw Error('Choose a world starter.');
 const worldId=newId(),campaignId=starter.calendarId?newId():null;
 const world={id:worldId,name:name.trim(),description:starter.calendarId?`${starter.title} campaign workspace`:'',archived:false};
 const entries:Entry[]=starter.calendarId?['Places','People','Factions','Lore'].map((title,order)=>({id:newId(),worldId,campaignId:null,parentId:null,title,kind:'folder',body:'',order,updatedAt:new Date().toISOString()})):[];
 const campaign=starter.calendarId?{id:campaignId!,worldId,name:campaignName.trim(),description:'',github:{repository:'',branch:'main'},calendars:[makeCalendar(starter.calendarId)]}:null;
 return {data:checked({...s,worlds:[...s.worlds,world],campaigns:campaign?[...s.campaigns,campaign]:s.campaigns,entries:[...s.entries,...entries]}),worldId,campaignId};
}
/** Independent snapshot; image bytes remain in this owner's storage and player links are never copied. */
export function copyWorld(s:Workspace,sourceId:string,name:string,asTemplate:boolean){
 const world=s.worlds.find(w=>w.id===sourceId);if(!world)throw Error('Choose an existing world.');
 const source=structuredClone({schemaVersion:1,worlds:[world],campaigns:s.campaigns.filter(c=>c.worldId===sourceId),entries:s.entries.filter(e=>e.worldId===sourceId)});
 const copy=importCopy(emptyWorkspace(),source),newWorld=copy.worlds[0];newWorld.name=name.trim();newWorld.isTemplate=asTemplate;newWorld.archived=false;
 // Repository targets and active share links do not belong in reusable copies.
 copy.campaigns=copy.campaigns.map(c=>({...c,github:{repository:'',branch:'main'}}));
 return {data:checked({...s,worlds:[...s.worlds,...copy.worlds],campaigns:[...s.campaigns,...copy.campaigns],entries:[...s.entries,...copy.entries]}),worldId:newWorld.id,campaignId:copy.campaigns[0]?.id??null};
}
