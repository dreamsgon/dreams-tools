import {advanceDate,formatDate,moonPhase,sameDate,seasonOn,type Calendar,type CalendarDate} from './calendar-model.ts';
import {type WeatherRegion,type WeatherDay,type SeasonWeather} from './weather-schema.ts';
export const climateDefaults={polar:{mean:12,wet:20},cold:{mean:40,wet:35},temperate:{mean:58,wet:40},warm:{mean:73,wet:30},tropical:{mean:83,wet:65},arid:{mean:78,wet:8}};
const clamp=(x:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,x));
export const fahrenheit=(n:number)=>`${Math.round(n)}°F (${Math.round((n-32)*5/9)}°C)`;
export function defaultSeasonProfile(c:Calendar,r:Pick<WeatherRegion,'climate'>,seasonId:string):SeasonWeather{
 const name=c.seasons?.find(s=>s.id===seasonId)?.name.toLowerCase()??'';
 const winter=/winter|cold|frost/.test(name),summer=/summer|hot/.test(name),spring=/spring/.test(name),autumn=/autumn|fall/.test(name),wet=/wet|rain|monsoon|storm/.test(name),dry=/dry/.test(name);
 const mild=r.climate==='tropical',base=climateDefaults[r.climate];
 return {seasonId,temperatureOffsetF:winter?(mild?-3:-22):summer?(mild?3:18):spring?-2:autumn?-5:0,rainChance:clamp(base.wet+(wet?30:dry?-25:spring?10:0),0,100),daylightHours:mild?12:winter?9:summer?15:12};
}
export function newWeatherRegion(c:Calendar):WeatherRegion{
 const r:WeatherRegion={id:crypto.randomUUID(),name:'New region',climate:'temperate',terrain:'plains',elevationM:0,exposure:'normal',prevailingWind:'from the west',specialConditions:'',temperatureAdjustF:0,rainAdjust:0,windAdjustMph:0,seasonProfiles:[],seed:crypto.randomUUID(),visibility:'gm',archived:false};
 r.seasonProfiles=(c.seasons??[]).map(s=>defaultSeasonProfile(c,r,s.id));return r;
}
export function weatherOn(c:Calendar,regionId:string,date:CalendarDate){return c.weather?.days.find(d=>d.regionId===regionId&&sameDate(d.date,date));}
export function previousWeather(c:Calendar,regionId:string,date:CalendarDate){try{return weatherOn(c,regionId,advanceDate(c,date,-1));}catch{return undefined;}}
function randomFor(text:string){let state=2166136261;for(const ch of text)state=Math.imul(state^ch.charCodeAt(0),16777619);return ()=>{state+=0x6D2B79F5;let t=Math.imul(state^state>>>15,1|state);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296;};}
function solar(hours:number){
 if(hours===0)return {sunrise:'No sunrise',sunset:'Polar night'};
 if(hours===24)return {sunrise:'Continuous daylight',sunset:'No sunset'};
 const clock=(h:number)=>{const minutes=Math.round(h*60/15)*15;return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;};
 return {sunrise:clock(12-hours/2),sunset:clock(12+hours/2)};
}
/** Seeded story-weather model, not an astronomical or physical forecasting service. */
export function generateWeather(c:Calendar,r:WeatherRegion,date:CalendarDate,variation=0):WeatherDay{
 const random=randomFor(`${r.seed}/${date.year}/${date.periodId}/${date.day}/${variation}`),season=seasonOn(c,date),base=climateDefaults[r.climate];
 const profile=r.seasonProfiles.find(s=>s.seasonId===season?.id)??(season?defaultSeasonProfile(c,r,season.id):{temperatureOffsetF:0,rainChance:base.wet,daylightHours:12});
 const previous=previousWeather(c,r.id,date),front=random()<.18;
 const humid=['coast','wetlands','forest'].includes(r.terrain),dry=r.terrain==='desert'||r.climate==='arid';
 const target=base.mean+profile.temperatureOffsetF+r.temperatureAdjustF-r.elevationM*.0065*1.8+(r.terrain==='mountains'?-5:0)+(random()-.5)*10;
 const mean=previous?clamp((previous.lowF+previous.highF)/2+(target-(previous.lowF+previous.highF)/2)*(front?.55:.22)+(random()-.5)*4,-130,155):clamp(target,-130,155);
 const chance=clamp(profile.rainChance+r.rainAdjust+(r.exposure==='windward'?15:r.exposure==='leeward'?-20:0)+(r.terrain==='wetlands'?15:r.terrain==='forest'?5:r.terrain==='desert'?-15:0)+(previous&&!front?(previous.precipitation==='None'?-8:15):0),0,100);
 const wet=random()*100<chance,storm=wet&&mean>45&&random()<(front?.35:.12);
 const cloudy=wet||random()<.4;
 const span=(humid?10:dry?28:18)*(cloudy?.65:1)+(random()*4);
 const lowF=Math.round(clamp(mean-span/2,-150,180)),highF=Math.round(clamp(mean+span/2,-150,180));
 const precipitation=wet?(highF<=32?'Snow':lowF<30&&highF<42?'Sleet':'Rain'):'None';
 const targetWind=4+random()*12+(r.terrain==='coast'?4:r.terrain==='mountains'?7:0)+(front?8:0)+(storm?12:0)+r.windAdjustMph;
 const windMph=Math.round(clamp(previous&&!front?previous.windMph*.6+targetWind*.4:targetWind,0,140)),gustMph=Math.round(clamp(windMph+(windMph>0?random()*9+(storm?15:0):0),windMph,200));
 const humidityBase=wet?86:humid?72:dry?30:55;
 const previousHumidity=previous?(previous.humidityMorning+previous.humidityEvening)/2:humidityBase;
 const humidityMorning=Math.round(clamp(wet?humidityBase+random()*12:humidityBase*.75+previousHumidity*.25+random()*10,10,100));
 const humidityEvening=Math.round(clamp(humidityMorning-(wet?random()*5:5+random()*12),wet?78:5,100));
 const fog=!wet&&humid&&humidityMorning>78&&windMph<10;
 const condition=storm?'Thunderstorm':precipitation!=='None'?precipitation:fog?'Fog':cloudy?'Overcast':random()<.5?'Partly cloudy':'Clear';
 const progression=previous?(front?'A changing front brings a noticeable shift.':`The air mass ${wet===(previous.precipitation!=='None')?'holds from yesterday':'slowly changes from yesterday'}.`):'A new air mass settles over the region.';
 const detail=wet?(precipitation==='Snow'?'Snow softens the tracks and gathers along sheltered paths.':storm?'Thunder rolls beyond the horizon as rain darkens the roads.':'Rain beads on leaves and leaves the roads slick.'):fog?'Mist hangs low over sheltered ground before thinning.':condition==='Clear'?'Clear light sharpens distant ridgelines; exposed ground cools after dusk.':'Cloud shadows drift over the land, with quieter stretches between gusts.';
 const times=solar(profile.daylightHours);
 return {id:crypto.randomUUID(),regionId:r.id,date:{...date},visibility:'gm',source:'generated',seasonName:season?.name??'Unspecified season',climate:r.climate,terrain:r.terrain,condition,summary:`${progression} ${detail}`,lowF,highF,windDirection:!front&&previous?previous.windDirection:r.prevailingWind||'variable',windMph,gustMph,precipitation,precipChance:Math.round(wet?70+chance*.3:chance*.2),precipitationNotes:wet?(storm?'Heavy showers and thunder from afternoon into evening.':precipitation==='Snow'?'Intermittent snow through the day; drifting in exposed places.':'Showers from midday into evening, with breaks between them.'):'A mostly dry day; no sustained precipitation expected.',humidityMorning,humidityEvening,...times,daylightHours:profile.daylightHours,solarNotes:'Estimated on a 24-hour day with noon at 12:00. Edit for your latitude or cosmology.',specialConditions:r.specialConditions};
}
export function manualWeather(c:Calendar,r:WeatherRegion,date:CalendarDate):WeatherDay{
 const profile=r.seasonProfiles.find(s=>s.seasonId===seasonOn(c,date)?.id),daylightHours=profile?.daylightHours??12;
 return {id:crypto.randomUUID(),regionId:r.id,date:{...date},visibility:'gm',source:'manual',seasonName:seasonOn(c,date)?.name??'Unspecified season',climate:r.climate,terrain:r.terrain,condition:'Clear',summary:'',lowF:50,highF:65,windDirection:r.prevailingWind,windMph:5,gustMph:8,precipitation:'None',precipChance:0,precipitationNotes:'',humidityMorning:60,humidityEvening:50,...solar(daylightHours),daylightHours,solarNotes:'Set these values for your world. Initial solar times are estimates on a 24-hour day.',specialConditions:r.specialConditions};
}
export function lunarWeatherText(c:Calendar,date:CalendarDate){return c.moons?.length?c.moons.map(m=>`${m.name}: ${moonPhase(c,m,date).name}${m.mode==='manual'?' (current manual setting)':''}`).join('; '):'None configured; no lunar light is assumed.';}
export function weatherMarkdown(c:Calendar,d:WeatherDay){const r=c.weather?.regions.find(r=>r.id===d.regionId);return `### ${formatDate(c,d.date)} — ${r?.name??'Region'} [${d.visibility}]\n\n${d.summary}\n\nSeason: ${d.seasonName}; climate: ${d.climate}; terrain: ${d.terrain}.\n\n- Minimum: ${fahrenheit(d.lowF)}\n- Maximum: ${fahrenheit(d.highF)}\n- Wind: ${d.windDirection}, ${d.windMph} mph; gusts ${d.gustMph} mph\n- Precipitation: ${d.precipitation}, ${d.precipChance}% chance. ${d.precipitationNotes}\n- Humidity: morning ${d.humidityMorning}%; evening ${d.humidityEvening}%\n- Sunrise: ${d.sunrise}; daylight ${d.daylightHours} hours; sunset: ${d.sunset}. ${d.solarNotes}\n- Lunar activity: ${lunarWeatherText(c,d.date)}\n- Special conditions: ${d.specialConditions||'None'}\n`;}
