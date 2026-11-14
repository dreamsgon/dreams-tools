/*
 * Simple top-down silhouettes for vehicle types, drawn in the current text colour. A vehicle without a picture shows its
 * type's silhouette, and the type picker uses them as icons.
 */
import type {VehicleArt} from '@/lib/encyclopedia/vehicles';

const fill={fill:'currentColor',fillOpacity:.22,stroke:'currentColor',strokeWidth:2.5,strokeLinejoin:'round' as const};

function Shapes({art}:{art:VehicleArt}){
 switch(art){
  case 'sail':return <><g {...fill}><path d="M60 6c20 26 30 60 30 110 0 50-6 86-14 112H44c-8-26-14-62-14-112 0-50 10-84 30-110z"/></g>
   <g stroke="currentColor" strokeWidth={5} strokeLinecap="round" opacity={.75}><path d="M28 70h64M22 120h76M26 172h68"/></g>
   <g fill="currentColor"><circle cx="60" cy="70" r="5"/><circle cx="60" cy="120" r="6"/><circle cx="60" cy="172" r="5"/><rect x="48" y="200" width="24" height="20" rx="3" opacity={.5}/></g></>;
  case 'airship':return <><g {...fill}><ellipse cx="60" cy="110" rx="38" ry="96"/><rect x="46" y="96" width="28" height="70" rx="6"/></g>
   <g stroke="currentColor" strokeWidth={2} opacity={.6}><path d="M30 60h60M24 110h72M30 160h60"/></g>
   <g fill="currentColor" opacity={.6}><path d="M50 206h20l8 22H42z"/><circle cx="18" cy="130" r="9"/><circle cx="102" cy="130" r="9"/></g></>;
  case 'carriage':return <><g {...fill}><rect x="34" y="120" width="52" height="84" rx="10"/><rect x="40" y="104" width="40" height="18" rx="4"/></g>
   <g fill="currentColor" opacity={.8}><rect x="22" y="128" width="9" height="24" rx="3"/><rect x="89" y="128" width="9" height="24" rx="3"/><rect x="22" y="176" width="9" height="24" rx="3"/><rect x="89" y="176" width="9" height="24" rx="3"/></g>
   <g stroke="currentColor" strokeWidth={2} fill="none"><path d="M54 104V70M66 104V70M46 70h28"/></g>
   <g fill="currentColor" opacity={.55}><ellipse cx="46" cy="52" rx="8" ry="20"/><ellipse cx="74" cy="52" rx="8" ry="20"/><ellipse cx="46" cy="16" rx="7" ry="13"/><ellipse cx="74" cy="16" rx="7" ry="13"/></g></>;
  case 'car':return <><g {...fill}><path d="M34 30c0-12 10-18 26-18s26 6 26 18v182c0 10-8 16-26 16s-26-6-26-16z"/></g>
   <g fill="currentColor"><path d="M40 78c8-6 32-6 40 0l-4 22H44z" opacity={.7}/><path d="M44 168h32l4 18c-8 5-32 5-40 0z" opacity={.55}/><rect x="26" y="50" width="8" height="28" rx="3"/><rect x="86" y="50" width="8" height="28" rx="3"/><rect x="26" y="168" width="8" height="28" rx="3"/><rect x="86" y="168" width="8" height="28" rx="3"/></g></>;
  case 'mech':return <g {...fill}><rect x="38" y="70" width="44" height="60" rx="8"/><rect x="48" y="44" width="24" height="24" rx="5"/><rect x="18" y="76" width="18" height="50" rx="5"/><rect x="84" y="76" width="18" height="50" rx="5"/><rect x="40" y="132" width="16" height="80" rx="5"/><rect x="64" y="132" width="16" height="80" rx="5"/></g>;
  default:return <><g {...fill}><path d="M60 8 74 30v60H46V30z"/><path d="M30 26h16v70H30zM74 26h16v70H74z"/><rect x="38" y="96" width="44" height="42" rx="4"/><rect x="26" y="102" width="12" height="30" rx="2"/><rect x="82" y="102" width="12" height="30" rx="2"/><rect x="44" y="138" width="32" height="30" rx="3"/><rect x="40" y="168" width="40" height="34" rx="4"/><rect x="46" y="202" width="28" height="24" rx="3"/></g>
   <g fill="currentColor" opacity={.6}><rect x="57" y="40" width="6" height="40" rx="3"/><rect x="35" y="40" width="6" height="40" rx="3"/><rect x="79" y="40" width="6" height="40" rx="3"/></g></>;
 }
}

/** The silhouette for a vehicle type. `size` is its height in pixels; it is half as wide. */
export function VehicleArtIcon({art,size=40,className}:{art:VehicleArt;size?:number;className?:string}){
 return <svg className={className} viewBox="0 0 120 240" width={size/2} height={size} aria-hidden="true" focusable="false"><Shapes art={art}/></svg>;
}
