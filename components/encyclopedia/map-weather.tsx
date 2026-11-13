"use client";
import {useState} from 'react';
import {CloudSun} from 'lucide-react';
import {locationWeather} from '@/lib/encyclopedia/map-weather';
import {formatDate,type Calendar} from '@/lib/encyclopedia/calendar-model';
import {fahrenheit,lunarWeatherText} from '@/lib/encyclopedia/weather-model';
import type {MapPin} from '@/lib/encyclopedia/map-model';
import {ToolDialog} from './tool-dialog';
import {WeatherPanel} from './weather-panel';

export function MapWeather({pin,campaignId,calendars,onChange}:{pin?:MapPin;campaignId?:string;calendars:Calendar[];onChange?:(c:Calendar)=>boolean}) {
 const [managing,setManaging]=useState(false);
 const local=pin&&campaignId?locationWeather(pin,campaignId,calendars):undefined;
 return <aside className="map-local-weather" aria-label="Local weather" aria-live="polite">
  <span className="eyebrow"><CloudSun size={16}/> LOCAL WEATHER</span>
  <h3>{pin?.title??'Choose a location'}</h3>
  {!pin?<p>Select a pin on the map to see its local forecast.</p>:!local?<p>{onChange?(campaignId?'Edit this pin to link a weather region from this campaign.':'Choose a campaign to link its regional weather.'):'No shared weather is linked to this location.'}</p>:<>
   <p className="map-weather-region">{local.region.name} · {local.calendar.name}</p>
   <p>{formatDate(local.calendar,local.calendar.current)} · campaign date</p>
   {local.region.archived?<p>Region archived. Its saved history is available in the calendar.</p>:local.day?<>
    <strong className="map-weather-condition">{local.day.condition}</strong>
    <p>{fahrenheit(local.day.lowF)} – {fahrenheit(local.day.highF)}</p>
    <p>{local.day.summary}</p>
    <dl><div><dt>Wind</dt><dd>{local.day.windDirection} · {local.day.windMph} mph · gusts {local.day.gustMph}</dd></div><div><dt>Precipitation</dt><dd>{local.day.precipitation} · {local.day.precipChance}%</dd></div></dl>
    <details><summary>Forecast details</summary><p>{local.day.precipitationNotes}</p><p>Humidity: {local.day.humidityMorning}% morning · {local.day.humidityEvening}% evening</p><p>Sunrise: {local.day.sunrise} · sunset: {local.day.sunset} · {local.day.daylightHours} hours of daylight</p><p>{local.day.solarNotes}</p><p>{lunarWeatherText(local.calendar,local.calendar.current)}</p>{local.day.specialConditions&&<p>{local.day.specialConditions}</p>}</details>
    {onChange&&<small>{local.calendar.visibility==='gm'||local.region.visibility==='gm'||local.day.visibility==='gm'?'GM-only weather':'Player-visible weather (map, pin, and fog still apply)'}</small>}
   </>:<p>{onChange?'No forecast recorded for the current date. Generate one or set it manually.':'No shared forecast for the current date.'}</p>}
   {onChange&&<button className="button" onClick={()=>setManaging(true)}>Manage local weather</button>}
  </>}
  {managing&&local&&onChange&&<ToolDialog title={'Weather · '+local.region.name} wide onClose={()=>setManaging(false)}><LocationWeatherEditor key={local.calendar.id+local.region.id} calendar={local.calendar} regionId={local.region.id} onChange={onChange}/></ToolDialog>}
 </aside>;
}
function LocationWeatherEditor({calendar,regionId,onChange}:{calendar:Calendar;regionId:string;onChange:(c:Calendar)=>boolean}){
 const [date,setDate]=useState(calendar.current);
 return <WeatherPanel calendar={calendar} date={date} initialRegionId={regionId} onChange={onChange} onBrowse={setDate}/>;
}
