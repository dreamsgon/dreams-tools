import {weatherSchema,publicWeather} from './weather-schema.ts';
import {z} from 'zod';
const id=z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),name=z.string().trim().min(1).max(100);
export const MAX_YEAR=99999;
export const calendarDateSchema=z.object({year:z.number().int().min(1).max(MAX_YEAR),periodId:id,day:z.number().int().min(1).max(130)});
export const calendarPeriodSchema=z.object({id,name,days:z.number().int().min(0).max(100),kind:z.enum(['month','festival']),outsideWeek:z.boolean()});
export const calendarEventSchema=z.object({id,title:name,notes:z.string().max(10000),date:calendarDateSchema,annual:z.boolean(),visibility:z.enum(['gm','players'])});
const color=z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const calendarMoonSchema=z.object({id,name,color,mode:z.enum(['cycle','manual']),cycleDays:z.number().finite().min(1).max(10000),anchor:calendarDateSchema,phase:z.number().finite().min(0).lt(1),visibility:z.enum(['gm','players']),notes:z.string().max(1500)});
export const calendarSeasonSchema=z.object({id,name,color,periodId:id,day:z.number().int().min(1).max(100)});
export const calendarBaseSchema=z.object({
 id,name,era:z.string().trim().max(40),yearPrefix:z.string().max(20),template:z.string().max(100),notes:z.string().max(3000),
 periods:z.array(calendarPeriodSchema).min(1).max(48),weekdays:z.array(name).min(1).max(20),
 firstWeekday:z.number().int().min(0).max(19),
 leap:z.object({every:z.number().int().min(0).max(1000),exceptEvery:z.number().int().min(0).max(10000),includeEvery:z.number().int().min(0).max(10000),offset:z.number().int().min(0).max(999),periodId:z.string().max(100),extraDays:z.number().int().min(1).max(30)}),
 current:calendarDateSchema,visibility:z.enum(['gm','players']),events:z.array(calendarEventSchema).max(1000),
 weather:weatherSchema.optional(),
 moons:z.array(calendarMoonSchema).max(20).optional(),seasons:z.array(calendarSeasonSchema).max(24).optional(),almanacNotes:z.string().max(3000).optional(),
});
export type Calendar=z.infer<typeof calendarBaseSchema>;
export type CalendarDate=z.infer<typeof calendarDateSchema>;
export type CalendarEvent=z.infer<typeof calendarEventSchema>;
export type CalendarPeriod=z.infer<typeof calendarPeriodSchema>;
export type CalendarMoon=z.infer<typeof calendarMoonSchema>;
export type CalendarSeason=z.infer<typeof calendarSeasonSchema>;
export function isLeap(c:Calendar,year:number){const l=c.leap,y=year-l.offset;return l.every>0&&y%l.every===0&&(!l.exceptEvery||y%l.exceptEvery!==0||!!l.includeEvery&&y%l.includeEvery===0);}
export function periodDays(c:Calendar,p:CalendarPeriod,year:number){return p.days+(p.id===c.leap.periodId&&isLeap(c,year)?c.leap.extraDays:0);}
export function validDate(c:Calendar,d:CalendarDate,annual=false){const p=c.periods.find(p=>p.id===d.periodId);return !!p&&d.day>=1&&d.day<=(annual?p.days+(c.leap.every&&p.id===c.leap.periodId?c.leap.extraDays:0):periodDays(c,p,d.year));}
export const calendarSchema=calendarBaseSchema.superRefine((c,ctx)=>{
 const bad=(message:string)=>ctx.addIssue({code:'custom',message});
 if(new Set(c.periods.map(p=>p.id)).size!==c.periods.length)bad('Month and festival IDs must be unique.');
 if(new Set(c.weekdays).size!==c.weekdays.length)bad('Weekday names must be unique.');
 if(c.firstWeekday>=c.weekdays.length)bad('Choose a valid first weekday.');
 if(!c.periods.some(p=>p.days>0))bad('A calendar needs at least one regular day.');
 for(const d of c.weather?.days??[])if(!validDate(c,d.date))bad(`Weather on year ${d.date.year}, day ${d.date.day} has an invalid date. Move or remove that forecast before changing the calendar.`);
 const l=c.leap;
 if(l.every){
  if(!c.periods.some(p=>p.id===l.periodId))bad('Choose a month or festival for the leap days.');
  if(l.offset>=l.every)bad('Leap-year offset must be smaller than its interval.');
  if(l.exceptEvery&&(l.exceptEvery<=l.every||l.exceptEvery%l.every))bad('Leap exceptions must be a larger multiple of the leap interval.');
  if(l.includeEvery&&(!l.exceptEvery||l.includeEvery<=l.exceptEvery||l.includeEvery%l.exceptEvery))bad('Leap restoration must be a larger multiple of the exception interval.');
 }
 if(c.periods.some(p=>p.days===0&&(!l.every||p.id!==l.periodId)))bad('A zero-day period must receive leap days.');
 if(!validDate(c,c.current))bad('Current date no longer exists. Adjust the date or calendar rules.');
 if(new Set(c.events.map(e=>e.id)).size!==c.events.length)bad('Event IDs must be unique.');
 for(const e of c.events)if(!validDate(c,e.date,e.annual))bad(`The date for “${e.title}” no longer exists. Edit that event before changing these rules.`);
 if(new Set((c.moons??[]).map(m=>m.id)).size!==(c.moons??[]).length)bad('Moon IDs must be unique.');
 for(const m of c.moons??[])if(!validDate(c,m.anchor))bad(`The reference date for “${m.name}” no longer exists. Edit that moon first.`);
 if(new Set((c.seasons??[]).map(s=>s.id)).size!==(c.seasons??[]).length)bad('Season IDs must be unique.');
 if(new Set((c.seasons??[]).map(s=>`${s.periodId}/${s.day}`)).size!==(c.seasons??[]).length)bad('Seasons must start on different dates.');
 for(const s of c.seasons??[])if(!c.periods.some(p=>p.id===s.periodId&&s.day<=p.days))bad(`“${s.name}” must start on a date that exists every year (not a leap-only day).`);
});
const mod=(a:number,b:number)=>((a%b)+b)%b;
function leapCount(c:Calendar,years:number){const l=c.leap;if(!l.every)return 0;const count=(n:number)=>n?Math.floor((years-l.offset)/n)-Math.floor(-l.offset/n):0;return count(l.every)-count(l.exceptEvery)+count(l.includeEvery);}
export function yearDays(c:Calendar,year:number){return c.periods.reduce((n,p)=>n+periodDays(c,p,year),0);}
function beforeYear(c:Calendar,year:number,weekOnly=false){const base=c.periods.filter(p=>!weekOnly||!p.outsideWeek).reduce((n,p)=>n+p.days,0);const leap=c.periods.find(p=>p.id===c.leap.periodId);return (year-1)*base+(leap&&(!weekOnly||!leap.outsideWeek)?leapCount(c,year-1)*c.leap.extraDays:0);}
export function dateOrdinal(c:Calendar,d:CalendarDate){let n=beforeYear(c,d.year);for(const p of c.periods){if(p.id===d.periodId)return n+d.day-1;n+=periodDays(c,p,d.year);}throw Error('Unknown calendar period.');}
export function dateFromOrdinal(c:Calendar,n:number):CalendarDate{
 if(!Number.isSafeInteger(n)||n<0||n>=beforeYear(c,MAX_YEAR+1))throw Error(`Choose a date between year 1 and ${MAX_YEAR}.`);
 let lo=1,hi=MAX_YEAR;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(beforeYear(c,mid)<=n)lo=mid;else hi=mid-1;}
 let rest=n-beforeYear(c,lo);for(const p of c.periods){const days=periodDays(c,p,lo);if(rest<days)return {year:lo,periodId:p.id,day:rest+1};rest-=days;}throw Error('Invalid calendar date.');
}
export function advanceDate(c:Calendar,d:CalendarDate,days:number){return dateFromOrdinal(c,dateOrdinal(c,d)+days);}
export function weekdayIndex(c:Calendar,d:CalendarDate){let n=beforeYear(c,d.year,true);for(const p of c.periods){if(p.id===d.periodId)return p.outsideWeek?null:mod(c.firstWeekday+n+d.day-1,c.weekdays.length);if(!p.outsideWeek)n+=periodDays(c,p,d.year);}return null;}
export function formatDate(c:Calendar,d:CalendarDate){const p=c.periods.find(p=>p.id===d.periodId);return `${p?.kind==='festival'&&periodDays(c,p,d.year)===1?'':d.day+' '}${p?.name??'Unknown month'}, ${c.yearPrefix}${d.year}${c.era?' '+c.era:''}`;}
export function sameDate(a:CalendarDate,b:CalendarDate){return a.year===b.year&&a.periodId===b.periodId&&a.day===b.day;}
export function eventsOn(c:Calendar,d:CalendarDate){return c.events.filter(e=>e.date.periodId===d.periodId&&e.date.day===d.day&&(e.annual||e.date.year===d.year));}
export function adjacentPeriod(c:Calendar,d:CalendarDate,direction:number){const p=c.periods.find(p=>p.id===d.periodId)!;return direction>0?advanceDate(c,{...d,day:periodDays(c,p,d.year)},1):advanceDate(c,{...d,day:1},-1);}
export function publicCalendar(c:Calendar):Calendar{return {...c,notes:'',weather:c.weather?publicWeather(c.weather):undefined,moons:c.moons?.filter(m=>m.visibility==='players').map(m=>({...m})),events:c.events.filter(e=>e.visibility==='players').map(e=>({...e}))};}
export const phaseNames=['New moon','Waxing crescent','First quarter','Waxing gibbous','Full moon','Waning gibbous','Last quarter','Waning crescent'];
/** Sample at the beginning of the day; elapsed days include festivals and leap days. */
export function moonPhase(c:Calendar,m:CalendarMoon,d:CalendarDate){
 const phase=mod(m.phase+(m.mode==='cycle'&&Number.isFinite(m.cycleDays)&&m.cycleDays>0?(dateOrdinal(c,d)-dateOrdinal(c,m.anchor))/m.cycleDays:0),1);
 const index=Math.floor(phase*8+0.5)%8;
 return {phase,index,name:phaseNames[index],illumination:(1-Math.cos(2*Math.PI*phase))/2};
}
/** Annual boundaries use calendar order; the final season wraps into the next year. */
export function seasonOn(c:Calendar,d:CalendarDate){
 const position=(periodId:string,day:number)=>c.periods.findIndex(p=>p.id===periodId)*131+day;
 const seasons=[...(c.seasons??[])].sort((a,b)=>position(a.periodId,a.day)-position(b.periodId,b.day));
 return seasons.filter(s=>position(s.periodId,s.day)<=position(d.periodId,d.day)).at(-1)??seasons.at(-1);
}
