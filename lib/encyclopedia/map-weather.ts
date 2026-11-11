import type {MapPin,MapData} from './map-model.ts';
import type {Calendar} from './calendar-model.ts';
import {weatherOn} from './weather-model.ts';

export function locationWeather(pin:MapPin, campaignId:string, calendars:Calendar[]) {
 const link=pin.weatherLinks?.find(l=>l.campaignId===campaignId);
 const calendar=link&&calendars.find(c=>c.id===link.calendarId);
 const region=calendar?.weather?.regions.find(r=>r.id===link?.regionId);
 return calendar&&region?{calendar,region,day:weatherOn(calendar,region.id,calendar.current)}:undefined;
}
// Standalone map packages do not carry the calendars or campaign identity they reference.
export function unlinkMapWeather(map:MapData):MapData {
 return {...map,pins:map.pins.map(({weatherLinks,...pin})=>pin)};
}
export function scopeMapWeather(map:MapData,campaignId:string):MapData {
 return {...map,pins:map.pins.map(pin=>({...pin,weatherLinks:pin.weatherLinks?.filter(l=>l.campaignId===campaignId)}))};
}
