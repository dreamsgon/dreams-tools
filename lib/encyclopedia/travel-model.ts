import {mapSize,routeSchema,type MapData,type MapRoute} from './map-model.ts';
import {advanceDate,calendarSchema,sameDate,type Calendar,type CalendarDate} from './calendar-model.ts';
import {generateWeather,weatherOn} from './weather-model.ts';
export function convertDistance(n:number,from:'mi'|'km',to:'mi'|'km'){return from===to?n:from==='mi'?n*1.609344:n/1.609344;}
export function measuredDistance(map:MapData,from:string,to:string,unit:'mi'|'km'){
 if(!map.scale)throw Error('Set a map scale before measuring distances.');
 const a=map.pins.find(p=>p.id===from),b=map.pins.find(p=>p.id===to);if(!a||!b)throw Error('Choose two map locations.');
 const size=mapSize(map);return convertDistance(Math.hypot(b.x-a.x,(b.y-a.y)*size.height/size.width)*map.scale.width,map.scale.unit,unit);
}
export function routeTotals(route:MapRoute){routeSchema.parse(route);const distance=route.distances.reduce((a,b)=>a+b,0),hours=distance/route.speed,days=Math.max(1,Math.ceil(hours/route.hoursPerDay-1e-10));return {distance,hours,days};}
export type TravelDay={date:CalendarDate;distance:number;pinIds:string[];arrival:boolean};
export function travelPlan(map:MapData,route:MapRoute,c:Calendar):{distance:number;hours:number;days:number;arrival:CalendarDate;itinerary:TravelDay[]}{
 const totals=routeTotals(route);if(totals.days>365)throw Error('Plan at most 365 travel days at a time. Increase pace or split this route.');
 if(route.stops.some(id=>!map.pins.some(p=>p.id===id)))throw Error('A route location no longer exists.');
 const arrival=advanceDate(c,c.current,totals.days),daily=route.speed*route.hoursPerDay;
 const ends=route.distances.reduce<number[]>((a,d)=>[...a,(a.at(-1)??0)+d],[]);
 const itinerary:TravelDay[]=Array.from({length:totals.days},(_,day)=>{const start=day*daily,end=Math.min(totals.distance,(day+1)*daily),pins=new Set<string>();route.distances.forEach((_,i)=>{if(ends[i]>start&&(ends[i-1]??0)<end){pins.add(route.stops[i]);pins.add(route.stops[i+1]);}});return {date:advanceDate(c,c.current,day),distance:end-start,pinIds:[...pins],arrival:false};});
 itinerary.push({date:arrival,distance:0,pinIds:[route.stops.at(-1)!],arrival:true});return {...totals,arrival,itinerary};
}
export function travelRegion(map:MapData,pinId:string,campaignId:string,c:Calendar){const link=map.pins.find(p=>p.id===pinId)?.weatherLinks?.find(l=>l.campaignId===campaignId&&l.calendarId===c.id);return c.weather?.regions.find(r=>r.id===link?.regionId&&!r.archived);}
export function draftTravelWeather(map:MapData,route:MapRoute,campaignId:string,c:Calendar):Calendar{
 const next=structuredClone(c),plan=travelPlan(map,route,next);if(!next.weather)return next;
 for(const day of plan.itinerary)for(const pinId of day.pinIds){const region=travelRegion(map,pinId,campaignId,next);if(region&&!weatherOn(next,region.id,day.date)){if(next.weather.days.length>=1000)throw Error('This calendar has reached 1,000 forecasts. Remove old forecasts or shorten the trip.');next.weather.days.push(generateWeather(next,region,day.date));}}
 return calendarSchema.parse(next);
}
/** Validate the preview against the latest calendar before applying one atomic update. */
export function completeTravel(map:MapData,route:MapRoute,current:Calendar,snapshot:Calendar,draft:Calendar):Calendar{
 if(JSON.stringify(current)!==JSON.stringify(snapshot)||!sameDate(current.current,draft.current))throw Error('The calendar changed. Close this preview and plan the trip again.');
 const plan=travelPlan(map,route,current);
 return calendarSchema.parse({...current,current:plan.arrival,weather:draft.weather});
}
