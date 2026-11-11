import {z} from 'zod';
const id=z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const short=z.string().trim().min(1).max(100),percent=z.number().finite().min(0).max(100),temperature=z.number().finite().min(-150).max(180);
export const climates=['polar','cold','temperate','warm','tropical','arid'] as const;
export const terrains=['plains','coast','forest','mountains','wetlands','desert'] as const;
export const conditions=['Clear','Partly cloudy','Overcast','Fog','Rain','Snow','Sleet','Thunderstorm'] as const;
export const seasonWeatherSchema=z.object({seasonId:id,temperatureOffsetF:z.number().finite().min(-80).max(80),rainChance:percent,daylightHours:z.number().finite().min(0).max(24)});
export const weatherRegionSchema=z.object({
 id,name:short,climate:z.enum(climates),terrain:z.enum(terrains),elevationM:z.number().int().min(0).max(8000),exposure:z.enum(['normal','windward','leeward']),
 prevailingWind:z.string().max(100),specialConditions:z.string().max(1500),temperatureAdjustF:z.number().finite().min(-60).max(60),rainAdjust:z.number().finite().min(-100).max(100),windAdjustMph:z.number().finite().min(-30).max(80),
 seasonProfiles:z.array(seasonWeatherSchema).max(24),seed:short,visibility:z.enum(['gm','players']),archived:z.boolean(),
});
export const weatherDaySchema=z.object({
 id,regionId:id,date:z.object({year:z.number().int().min(1).max(99999),periodId:id,day:z.number().int().min(1).max(130)}),visibility:z.enum(['gm','players']),source:z.enum(['generated','manual']),
 seasonName:z.string().max(100),climate:z.enum(climates),terrain:z.enum(terrains),condition:z.enum(conditions),summary:z.string().max(3000),
 lowF:temperature,highF:temperature,windDirection:z.string().max(100),windMph:z.number().finite().min(0).max(200),gustMph:z.number().finite().min(0).max(250),
 precipitation:z.enum(['None','Rain','Snow','Sleet']),precipChance:percent,precipitationNotes:z.string().max(1000),humidityMorning:percent,humidityEvening:percent,
 sunrise:z.string().max(100),sunset:z.string().max(100),daylightHours:z.number().finite().min(0).max(24),solarNotes:z.string().max(500),specialConditions:z.string().max(1500),
}).superRefine((d,ctx)=>{if(d.lowF>d.highF)ctx.addIssue({code:'custom',message:'Minimum temperature must not exceed maximum temperature.'});if(d.gustMph<d.windMph)ctx.addIssue({code:'custom',message:'Wind gusts must be at least the sustained wind speed.'});});
export const weatherSchema=z.object({regions:z.array(weatherRegionSchema).max(12),days:z.array(weatherDaySchema).max(1000)}).superRefine((w,ctx)=>{
 const bad=(message:string)=>ctx.addIssue({code:'custom',message});
 if(new Set(w.regions.map(r=>r.id)).size!==w.regions.length)bad('Weather region IDs must be unique.');
 if(new Set(w.days.map(d=>d.id)).size!==w.days.length)bad('Weather record IDs must be unique.');
 if(new Set(w.days.map(d=>`${d.regionId}/${d.date.year}/${d.date.periodId}/${d.date.day}`)).size!==w.days.length)bad('Only one forecast per region and date is allowed.');
 for(const d of w.days)if(!w.regions.some(r=>r.id===d.regionId))bad('Every forecast must belong to an existing weather region.');
 for(const r of w.regions)if(new Set(r.seasonProfiles.map(p=>p.seasonId)).size!==r.seasonProfiles.length)bad('Each season can have only one weather profile per region.');
});
export type WeatherRegion=z.infer<typeof weatherRegionSchema>;
export type WeatherDay=z.infer<typeof weatherDaySchema>;
export type SeasonWeather=z.infer<typeof seasonWeatherSchema>;
export type CalendarWeather=z.infer<typeof weatherSchema>;
/** Config stays private; a shared region and a shared forecast are both required. */
export function publicWeather(w:CalendarWeather):CalendarWeather{
 const regions=w.regions.filter(r=>r.visibility==='players'&&!r.archived).map(r=>({...r,seed:'shared',specialConditions:'',seasonProfiles:[],temperatureAdjustF:0,rainAdjust:0,windAdjustMph:0}));
 const visible=new Set(regions.map(r=>r.id));
 return {regions,days:w.days.filter(d=>d.visibility==='players'&&visible.has(d.regionId)).map(d=>({...d}))};
}
