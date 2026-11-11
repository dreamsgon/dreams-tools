import assert from 'node:assert/strict';
import {test} from 'node:test';
import {makeCalendar} from '../../lib/encyclopedia/calendar-templates.ts';
import {advanceDate,calendarSchema,publicCalendar} from '../../lib/encyclopedia/calendar-model.ts';
import {newWeatherRegion,generateWeather,manualWeather,previousWeather,defaultSeasonProfile,weatherMarkdown,fahrenheit} from '../../lib/encyclopedia/weather-model.ts';
import {weatherDaySchema} from '../../lib/encyclopedia/weather-schema.ts';
import {campaignExport,demoWorkspace,emptyWorkspace,importCopy,workspaceSchema} from '../../lib/encyclopedia/world-model.ts';
import {callReadTool} from '../../lib/encyclopedia/mcp.ts';
const setup=()=>{const c=makeCalendar('gregorian'),r=newWeatherRegion(c);r.name='Greyhaven';r.seed='weather-test';c.weather={regions:[r],days:[]};return {c,r};};
const stripId=({id,...rest}:ReturnType<typeof generateWeather>)=>rest;
test('weather generation is repeatable, region/date scoped, and never mutates history',()=>{
 const {c,r}=setup(),before=structuredClone(c),d=generateWeather(c,r,c.current);assert.deepEqual(stripId(d),stripId(generateWeather(c,r,c.current)));assert.notDeepEqual(stripId(d),stripId(generateWeather(c,r,c.current,1)));assert.notDeepEqual(stripId(d),stripId(generateWeather(c,{...r,seed:'another-region'},c.current)));assert.deepEqual(c,before);assert.equal(d.visibility,'gm');weatherDaySchema.parse(d);
});
test('season, climate, elevation, rain-shadow and magic controls affect generated weather',()=>{
 const {c,r}=setup(),date=c.current,winter=c.seasons!.find(s=>s.name==='Winter')!,profile=r.seasonProfiles.find(p=>p.seasonId===winter.id)!;
 const cold=generateWeather(c,r,date);profile.temperatureOffsetF+=30;const warm=generateWeather(c,r,date);assert(warm.highF>=cold.highF+29);
 const mountain=generateWeather(c,{...r,elevationM:3000},date);assert(mountain.highF<warm.highF-30);
 assert(generateWeather(c,{...r,temperatureAdjustF:15},date).highF>=warm.highF+14);
 profile.rainChance=50;let windward=0,leeward=0;for(let i=0;i<200;i++){if(generateWeather(c,{...r,exposure:'windward'},date,i).precipitation!=='None')windward++;if(generateWeather(c,{...r,exposure:'leeward'},date,i).precipitation!=='None')leeward++;}assert(windward>leeward+30);
 assert.equal(generateWeather(c,{...r,rainAdjust:-100},date).precipitation,'None');
 const hot=generateWeather(c,{...r,climate:'tropical'},date);assert(hot.highF>warm.highF+20);
});
test('generated precipitation, humidity, temperature range and wind stay consistent across climates',()=>{
 for(const climate of ['polar','cold','temperate','warm','tropical','arid'] as const)for(let variation=0;variation<40;variation++){
  const {c,r}=setup();r.climate=climate;r.seasonProfiles=c.seasons!.map(s=>defaultSeasonProfile(c,r,s.id));r.rainAdjust=variation%2?100:-100;
  const d=generateWeather(c,r,c.current,variation);weatherDaySchema.parse(d);assert(d.lowF<=d.highF);assert(d.gustMph>=d.windMph);if(d.precipitation==='None')assert(d.precipChance<=20);else assert(d.precipChance>=70);if(d.precipitation!=='None'){assert(d.humidityMorning>=78);assert(d.humidityEvening>=78);}if(d.precipitation==='Snow')assert(d.highF<=32);if(d.condition==='Thunderstorm')assert.equal(d.precipitation,'Rain');
 }
 const {c,r}=setup();r.rainAdjust=-100;const inland=generateWeather(c,{...r,terrain:'desert'},c.current),coast=generateWeather(c,{...r,terrain:'coast'},c.current);assert(inland.highF-inland.lowF>coast.highF-coast.lowF);
});
test('previous-day continuity uses exact region/date across festivals and leap days',()=>{
 const c=makeCalendar('harptos'),r=newWeatherRegion(c),previousDate={year:1492,periodId:'shieldmeet',day:1},date=advanceDate(c,previousDate,1),prior=manualWeather(c,r,previousDate);prior.lowF=58;prior.highF=70;prior.windMph=5;prior.gustMph=10;prior.precipitation='Rain';prior.humidityMorning=90;prior.humidityEvening=85;c.weather={regions:[r],days:[prior]};
 assert.equal(previousWeather(c,r.id,date),prior);assert.equal(previousWeather(c,'other',date),undefined);assert.equal(previousWeather(c,r.id,advanceDate(c,date,1)),undefined);
 const next=generateWeather(c,r,date);assert(!next.summary.includes('no previous day'));assert(Math.abs((next.lowF+next.highF)/2-64)<30);
 const {c:g,r:rg}=setup();const leap=manualWeather(g,rg,{year:2024,periodId:'february',day:29});g.weather!.days=[leap];assert.equal(previousWeather(g,rg.id,{year:2024,periodId:'march',day:1}),leap);
});
test('daylight handles polar bounds and forecasts support manual fantasy solar times',()=>{
 const {c,r}=setup(),profile=r.seasonProfiles.find(p=>p.seasonId===c.seasons!.find(s=>s.name==='Winter')!.id)!;profile.daylightHours=0;assert.equal(generateWeather(c,r,c.current).sunrise,'No sunrise');profile.daylightHours=24;assert.equal(generateWeather(c,r,c.current).sunset,'No sunset');
 const d=manualWeather(c,r,c.current);d.sunrise='First bell';d.sunset='Red sun: sixth bell; white sun: seventh bell';d.solarNotes='Two suns';weatherDaySchema.parse(d);assert.equal(fahrenheit(32),'32°F (0°C)');
});
test('weather validation protects recorded dates, duplicates, references and numeric consistency',()=>{
 const {c,r}=setup();c.weather!.days=[generateWeather(c,r,{year:2024,periodId:'february',day:29})];calendarSchema.parse(c);
 for(const mutate of [(x:typeof c)=>x.weather!.days[0].lowF=181,(x:typeof c)=>x.weather!.days[0].highF=-150,(x:typeof c)=>x.weather!.days[0].gustMph=-1,(x:typeof c)=>x.weather!.days[0].humidityMorning=101,(x:typeof c)=>x.weather!.days[0].regionId='missing',(x:typeof c)=>x.weather!.days.push({...x.weather!.days[0],id:'duplicate-date'}),(x:typeof c)=>x.weather!.regions.push(r),(x:typeof c)=>x.leap.every=0,(x:typeof c)=>x.weather!.regions[0].seasonProfiles.push(x.weather!.regions[0].seasonProfiles[0])]){const next=structuredClone(c);mutate(next);assert(!calendarSchema.safeParse(next).success);}
 const old=makeCalendar('gregorian');assert.equal(old.weather,undefined);calendarSchema.parse(old);
});
test('player weather requires visible calendar, region and day, excludes config and hidden lunar data',()=>{
 const {c,r}=setup();c.visibility='players';r.visibility='players';r.specialConditions='SECRET-REGION';r.seed='SECRET-SEED';const day=generateWeather(c,r,c.current);day.specialConditions='Shared shimmer';day.visibility='players';const hidden=generateWeather(c,r,advanceDate(c,c.current,1));hidden.summary='SECRET-FUTURE';const secretRegion={...structuredClone(r),id:'secret-region',name:'SECRET-PLACE',visibility:'gm' as const};const secretDay={...day,id:'secret-day',regionId:secretRegion.id,summary:'SECRET-OTHER'};c.weather={regions:[r,secretRegion],days:[day,hidden,secretDay]};c.moons!.push({...c.moons![0],id:'secret-moon',name:'SECRET-MOON',visibility:'gm'});
 const p=publicCalendar(c);assert.equal(p.weather!.regions.length,1);assert.equal(p.weather!.days.length,1);assert(!JSON.stringify(p).includes('SECRET-'));assert(!weatherMarkdown(p,p.weather!.days[0]).includes('SECRET-'));assert.equal(c.weather.regions[0].seed,'SECRET-SEED');
 r.archived=true;assert.equal(publicCalendar(c).weather!.days.length,0);
});
test('weather survives JSON imports, campaign exports, Markdown and authenticated MCP',()=>{
 const {c,r}=setup(),s=demoWorkspace();c.weather!.days=[generateWeather(c,r,c.current)];s.campaigns[0].calendars=[c];workspaceSchema.parse(s);const copy=importCopy(emptyWorkspace(),campaignExport(s,s.campaigns[0].id));assert.deepEqual(copy.campaigns[0].calendars![0].weather,c.weather);const mcp=callReadTool(s,'read_campaign',{campaign_id:s.campaigns[0].id}) as typeof s;assert.deepEqual(mcp.campaigns[0].calendars![0].weather,c.weather);const md=weatherMarkdown(c,c.weather!.days[0]);for(const field of ['Minimum:','Maximum:','Wind:','Precipitation:','Humidity:','Sunrise:','sunset:','Lunar activity:'])assert(md.includes(field));
});
