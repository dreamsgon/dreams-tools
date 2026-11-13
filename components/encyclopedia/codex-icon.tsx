import {Skull,Gem,ScrollText,Mail,MapPin,CircleDot} from 'lucide-react';
import {isCreatureCategory} from '@/lib/encyclopedia/codex';

/** An icon that fits a codex category's name, for entries without a picture. */
export function CategoryIcon({name,size=15}:{name:string;size?:number}){
 const n=name.toLowerCase();
 const Icon=isCreatureCategory(n)?Skull:/item|relic|treasure|gear/.test(n)?Gem:/letter|note|document/.test(n)?Mail:/place|location/.test(n)?MapPin:/lore|legend|histor/.test(n)?ScrollText:CircleDot;
 return <Icon size={size} aria-hidden="true"/>;
}
