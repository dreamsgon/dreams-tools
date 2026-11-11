import assert from 'node:assert/strict';
import {test} from 'node:test';
import {demoWorkspace,workspaceSchema,playerCampaign,campaignExport,importCopy,emptyWorkspace,type Entry} from '../../lib/encyclopedia/world-model.ts';
import {makeCalendar} from '../../lib/encyclopedia/calendar-templates.ts';
import {advanceDate} from '../../lib/encyclopedia/calendar-model.ts';
import {newWeatherRegion,generateWeather} from '../../lib/encyclopedia/weather-model.ts';
import {newMap} from '../../lib/encyclopedia/map-model.ts';
import {locationWeather,unlinkMapWeather} from '../../lib/encyclopedia/map-weather.ts';
import {callReadTool} from '../../lib/encyclopedia/mcp.ts';
function fixture(){
 const s=demoWorkspace(),[one,two]=s.campaigns,c=makeCalendar('gregorian'),r=newWeatherRegion(c);c.visibility='players';r.visibility='players';r.name='Coast';r.seed='PRIVATE-SEED';r.specialConditions='PRIVATE-CONFIG';
 const d=generateWeather(c,r,c.current);d.visibility='players';d.specialConditions='Shared sea mist';d.summary='Coastal rain';c.weather={regions:[r],days:[d]};one.calendars=[c];
 const other=structuredClone(c);other.weather!.regions[0].name='OTHER-CAMPAIGN-REGION';other.weather!.days[0].summary='OTHER-CAMPAIGN-FORECAST';two.calendars=[other];
 const map=newMap();map.visibility='players';map.pins=[{id:'harbor',title:'Harbor',x:.5,y:.5,notes:'Port',entryId:null,visibility:'players',weatherLinks:[{campaignId:one.id,calendarId:c.id,regionId:r.id},{campaignId:two.id,calendarId:c.id,regionId:r.id}]}];
 const e:Entry={id:'weather-map',worldId:one.worldId,campaignId:null,parentId:null,title:'Weather map',kind:'map',body:'',updatedAt:new Date().toISOString(),mapData:map};s.entries.push(e);return {s,one,two,c,r,d,map,e};
}
test('map weather follows the linked calendar current date and campaign, including identical calendar IDs',()=>{
 const {one,two,c,d,map}=fixture();assert.equal(locationWeather(map.pins[0],one.id,one.calendars!)?.day?.summary,'Coastal rain');assert.equal(locationWeather(map.pins[0],two.id,two.calendars!)?.day?.summary,'OTHER-CAMPAIGN-FORECAST');
 c.current=advanceDate(c,c.current,1);assert.equal(locationWeather(map.pins[0],one.id,[c])?.day,undefined);c.weather!.days.push({...d,id:'tomorrow',date:c.current,summary:'Morning fog'});assert.equal(locationWeather(map.pins[0],one.id,[c])?.day?.summary,'Morning fog');assert.equal(locationWeather(map.pins[0],'missing',[c]),undefined);
});
test('player map weather strips other campaigns, private configuration, and each hidden visibility layer',()=>{
 for(const layer of ['calendar','region','day','archived','pin','fog','map']){
  const {s,one,c,r,d,map}=fixture();
  if(layer==='calendar')c.visibility='gm';if(layer==='region')r.visibility='gm';if(layer==='day')d.visibility='gm';if(layer==='archived')r.archived=true;if(layer==='pin')map.pins[0].visibility='gm';if(layer==='fog')map.fog={enabled:true,revealed:[]};if(layer==='map')map.visibility='gm';
  const view=playerCampaign(s,one.id),text=JSON.stringify(view);assert(!text.includes('OTHER-CAMPAIGN'));assert(!text.includes('PRIVATE-'));
  const pin=view.entries.find(e=>e.id==='weather-map')?.mapData?.pins[0];
  if(['pin','fog','map'].includes(layer))assert.equal(pin,undefined);
  else if(['calendar','region','archived'].includes(layer))assert.deepEqual(pin?.weatherLinks,[]);
  else {assert.equal(pin?.weatherLinks?.length,1);assert.equal(locationWeather(pin!,one.id,view.calendars)?.day,undefined);}
 }
 const {s,one}=fixture(),v=playerCampaign(s,one.id),pin=v.entries.find(e=>e.id==='weather-map')!.mapData!.pins[0];assert.equal(locationWeather(pin,one.id,v.calendars)?.day?.summary,'Coastal rain');
});
test('map weather validation rejects cross-world, cross-campaign, missing and duplicate region links',()=>{
 for(const field of ['campaignId','calendarId','regionId'] as const){const {s,map}=fixture();map.pins[0].weatherLinks![0][field]='missing';assert.equal(workspaceSchema.safeParse(s).success,false);}
 {const {s,map}=fixture();map.pins[0].weatherLinks!.push(map.pins[0].weatherLinks![0]);assert.equal(workspaceSchema.safeParse(s).success,false);}
 {const {s,e,one}=fixture();e.campaignId=one.id;assert.equal(workspaceSchema.safeParse(s).success,false);}
 {const {s,two}=fixture();s.worlds.push({id:'elsewhere',name:'Other world',description:'',archived:false});two.worldId='elsewhere';assert.equal(workspaceSchema.safeParse(s).success,false);}
});
test('full backups remap campaign weather links and keep calendar/region identities scoped',()=>{
 const {s}=fixture(),copy=importCopy(emptyWorkspace(),s),map=copy.entries.find(e=>e.kind==='map')!.mapData!;workspaceSchema.parse(copy);
 for(const campaign of copy.campaigns){assert(!s.campaigns.some(c=>c.id===campaign.id));assert(locationWeather(map.pins[0],campaign.id,campaign.calendars!)?.day);}
});
test('campaign exports and MCP article reads exclude other campaign weather links',()=>{
 const {s,one,two}=fixture();const exported=campaignExport(s,one.id);workspaceSchema.parse(exported);assert(!JSON.stringify(exported).includes(two.id));
 const result=callReadTool(s,'read_article',{campaign_id:one.id,article_id:'weather-map'}) as Entry;assert.equal(result.mapData!.pins[0].weatherLinks!.length,1);assert.equal(result.mapData!.pins[0].weatherLinks![0].campaignId,one.id);
 const copy=importCopy(emptyWorkspace(),exported);assert(locationWeather(copy.entries.find(e=>e.kind==='map')!.mapData!.pins[0],copy.campaigns[0].id,copy.campaigns[0].calendars!)?.day);
});
test('standalone maps detach weather without changing the original pins, notes or terrain',()=>{
 const {map}=fixture(),clean=unlinkMapWeather(map);assert.equal(clean.pins[0].weatherLinks,undefined);assert.equal(map.pins[0].weatherLinks!.length,2);assert.equal(clean.pins[0].notes,'Port');assert.deepEqual(clean.tiles,map.tiles);
});
