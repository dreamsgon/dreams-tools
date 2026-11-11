import {calendarSchema,type Calendar,type CalendarMoon,type CalendarSeason} from './calendar-model.ts';
export const almanacSources:Record<string,{title:string;url:string}[]>={
 harptos:[{title:'Selûne: phase period and epoch',url:'https://www.realmshelps.net/faerun/beyond.shtml'}],
 gregorian:[{title:'NASA: Moon phases',url:'https://science.nasa.gov/moon/moon-phases/'},{title:'New moon ephemeris',url:'https://astropixels.com/ephemeris/moon/newapogee1901.html'},{title:'NOAA: meteorological seasons',url:'https://www.ncei.noaa.gov/news/meteorological-versus-astronomical-seasons'}],
 krynn:[{title:'Dragonlance Nexus: lunar cycles',url:'https://dragonlancenexus.com/wp-content/uploads/CnC_DL_Players_Adaptation_Book_Rigon.pdf'}],
 tamriel:[{title:'Oblivion Construction Set: moon phases',url:'https://cs.uesp.net/wiki/Climates'}],
 thedas:[{title:'Thedas astronomy',url:'https://dragonage.fandom.com/wiki/Astronomy'},{title:'Thedas calendar',url:'https://dragonage.fandom.com/wiki/Calendar'}],
 eberron:[{title:'Keith Baker: moons and ascendance',url:'https://keith-baker.com/dm-stars/'},{title:'Moon descriptions',url:'https://www.worldanvil.com/w/eberron-m6marsh/a/moons-of-eberron-law'}],
 greyhawk:[{title:'Greyhawk calendar and moons',url:'https://www.greyhawkonline.com/greyhawkwiki/Calendar'},{title:'Guide to the World of Greyhawk preview',url:'https://d1vzi28wh99zvq.cloudfront.net/pdf_previews/17392-sample.pdf'}],
 exandria:[{title:'Tal’Dorei Reborn: seasons',url:'https://d1vzi28wh99zvq.cloudfront.net/pdf_previews/420050-sample.pdf'},{title:'D&D Beyond: Catha and Ruidus',url:'https://www.dndbeyond.com/posts/1191-monster-preview-illuminate-the-mysteries-of-ruidus'}],
};
/** Explicit action for existing calendars; new templates call this once. Never migrates saved data implicitly. */
export function withAlmanacDefaults(c:Calendar):Calendar{
 const moons:CalendarMoon[]=[],seasons:CalendarSeason[]=[];
 let notes='Season boundaries and moon colors are editable regional campaign choices. Phase icons sample the start of each day; they do not model rise/set times, eclipses, or weather.';
 const period=(name:string)=>{const p=c.periods.find(p=>p.id===name.toLowerCase().replace(/[^a-z0-9]+/g,'-')||p.name===name);if(!p)throw Error(`Template defaults need the period “${name}”. Add moons and seasons individually for this customized calendar.`);return p.id;};
 const moon=(name:string,color:string,cycleDays:number|null,phase=.5,anchor=c.current,description='Reference date is an editable campaign convention.')=>moons.push({id:crypto.randomUUID(),name,color,mode:cycleDays===null?'manual':'cycle',cycleDays:cycleDays??28,anchor:{...anchor},phase,visibility:'players',notes:description});
 const season=(name:string,p:string,day:number,color:string)=>seasons.push({id:crypto.randomUUID(),name,periodId:period(p),day,color});
 const four=(p:string[],days=[1,1,1,1])=>p.forEach((p,i)=>season(['Spring','Summer','Autumn','Winter'][i],p,days[i],['#78a981','#dab96f','#c98b67','#8daabf'][i]));
 switch(c.template){
 case 'harptos':
  moon('Selûne','#d8e1e8',30.4375,.5,{year:1372,periodId:period('Hammer'),day:1},'30 days, 10 hours, 30 minutes per phase cycle; full on Hammer 1, 1372 DR.');
  four(['Greengrass','Midsummer','Highharvestide','Midwinter']);notes+=' Harptos uses a festival-based 5E campaign convention, beginning spring at Greengrass. Seasonal dates vary by era; these are not universal astronomical equinoxes.';break;
 case 'gregorian':
  moon('Moon','#d6d9df',29.53059,1-(18+14/60)/24/29.53059,{year:2000,periodId:period('January'),day:6},'Mean synodic month, anchored to the January 6, 2000 new moon at approximately 18:14 UTC. Daily approximation, not an astronomical ephemeris.');four(['March','June','September','December']);notes+=' Northern Hemisphere meteorological seasons. Reverse or rename them for another region.';break;
 case 'krynn':
  moon('Solinari','#e5e5de',36);moon('Lunitari','#d77970',28);moon('Nuitari','#514e64',8,.5,c.current,'Black moon; visibility depends on the observer. Its reference date is a campaign convention.');moons[2].visibility='gm';four(['Brookgreen','Holmswelt','Reapember','Frostkolt']);notes+=' Lunar cycles use 36/28/8-day game conventions; the three full-moon anchors and day-one season starts are editable assumptions. Nuitari starts GM only.';break;
 case 'tamriel':
  moon('Masser','#c77e6f',24);moon('Secunda','#deded5',24);four(['First Seed','Midyear','Hearthfire','Evening Star']);notes+=' Uses Oblivion’s 24-day phase cycles for both moons, not their rise/set cycles. Full on the reference date and Gregorian-style season boundaries are campaign conventions, not universal lore dates.';break;
 case 'thedas':
  moon('Moon','#d6d7d9',null,0,c.current,'Primary moon; no verified proper name or numeric phase period. Manual phase is a GM-selected placeholder.');moon('Satina','#c6bfd1',null,0,c.current,'Secondary moon; numeric phase period and color are unspecified. Manual phase and color are illustrative.');four(['Wintersend','Summerday','August','Firstfall']);notes+=' Wintersend and Summerday mark spring and summer. Autumn and winter day-one starts are editorial defaults. Both moons are manual because no dependable numeric phase cycles were verified.';break;
 case 'eberron':{
  const names=['Zarantyr','Olarune','Therendor','Eyre','Dravago','Nymm','Lharvion','Barrakas','Rhaan','Sypheros','Aryth','Vult'];
  const colors=['#e9e5dc','#eac297','#c5c9cf','#bbc2cc','#c6b4da','#e4d290','#d4d4cb','#e3e5e9','#a7c8e6','#8e929c','#d78965','#a0a2ac'];
  names.forEach((n,i)=>moon(n,colors[i],null,0,c.current,'Manual phase placeholder. A 28-day ascendant month describes brightness, not a documented lunar phase cycle. Set a campaign cycle if desired.'));
  four(['Therendor','Nymm','Rhaan','Vult']);notes+=' Twelve visible moons; lost Crya is omitted. Moon phases are manual until you choose campaign cycles. Colors are illustrative. Seasons start on day one as a Khorvaire-oriented convention.';break;}
 case 'greyhawk':
  moon('Luna','#e0e1e5',28,.5,{year:c.current.year,periodId:period('Richfest'),day:4});moon('Celene','#86c8c6',91,.5,{year:c.current.year,periodId:period('Richfest'),day:4});
  ['Readying','Planting','Reaping','Patchwall','Sunsebb'].forEach((p,i)=>season(['Spring','Low summer','High summer','Autumn','Winter'][i],p,1,['#78a981','#b9bc77','#dab96f','#c98b67','#8daabf'][i]));notes+=' Both moons are full on Richfest 4. Five seasons follow the Guide’s month groups; intervening festivals retain the preceding season as an app convention.';break;
 case 'exandria':
  moon('Catha','#e3dfd6',30,.5,c.current,'Uses D&D Beyond’s 30-day cycle; other references use 33 days. Reference date is a campaign convention.');moon('Ruidus','#ba655b',null,0,c.current,'Irregular supernatural flare; manual phase is selected by the GM and applies to all browsed dates until changed. An orbital period is not a dependable phase cycle.');four(['Dualahei','Unndilar','Fessuran','Duscar'],[13,26,3,2]);notes+=' Season starts follow Tal’Dorei Reborn. Ruidus is manual; Catha follows the 30-day published convention.';break;
 default:
  moon('Moon','#d6d9df',28,0,c.current,'An editable example: 28-day cycle, new on the reference date.');
  if(c.periods.length>=12)four([2,5,8,11].map(i=>c.periods[i].name));notes+=' Generic example moons and seasons; customize them for your world.';
 }
 return calendarSchema.parse({...c,moons,seasons,almanacNotes:notes});
}
