'use client';
/* The icons a page can choose (Page › Icon), from lib/encyclopedia/page-text.ts PAGE_ICONS. Shown in the sidebar and page lists. */
import type {LucideIcon} from 'lucide-react';
import {Anchor,Axe,Beer,Bell,Bird,Bone,Book,Brain,Bug,Building,Castle,Church,Coins,Compass,Crown,Dices,Drama,Eye,Feather,Fish,Flag,FlaskConical,Flame,Footprints,Gavel,Gem,Ghost,Gift,Globe,Hammer,Heart,Hourglass,House,Key,Lamp,Landmark,Leaf,Lock,Map,MapPin,Moon,Mountain,Music,PawPrint,Pickaxe,Pyramid,Rocket,Sailboat,Scroll,Shield,Ship,Skull,Snowflake,Sparkles,Star,Sun,Swords,Tent,Trees,Users,VenetianMask,WandSparkles,Waves,Wheat,Zap} from 'lucide-react';
import type {PageIcon} from '@/lib/encyclopedia/page-text';

export const PAGE_ICON_GLYPHS:Record<PageIcon,LucideIcon>={
 castle:Castle,crown:Crown,swords:Swords,shield:Shield,skull:Skull,scroll:Scroll,book:Book,gem:Gem,coins:Coins,flame:Flame,mountain:Mountain,trees:Trees,
 anchor:Anchor,ship:Ship,sailboat:Sailboat,tent:Tent,house:House,church:Church,landmark:Landmark,pyramid:Pyramid,beer:Beer,key:Key,map:Map,compass:Compass,
 flag:Flag,pin:MapPin,star:Star,moon:Moon,sun:Sun,eye:Eye,heart:Heart,ghost:Ghost,mask:VenetianMask,drama:Drama,feather:Feather,wand:WandSparkles,sparkles:Sparkles,
 hammer:Hammer,axe:Axe,pickaxe:Pickaxe,flask:FlaskConical,brain:Brain,bone:Bone,bug:Bug,bird:Bird,fish:Fish,paw:PawPrint,leaf:Leaf,wheat:Wheat,snowflake:Snowflake,
 waves:Waves,zap:Zap,hourglass:Hourglass,bell:Bell,lamp:Lamp,music:Music,dices:Dices,gavel:Gavel,footprints:Footprints,gift:Gift,lock:Lock,users:Users,
 rocket:Rocket,globe:Globe,building:Building,
};
/** The page's own icon, when it chose one. */
export const pageIcon=(look?:{icon?:PageIcon}):LucideIcon|undefined=>look?.icon?PAGE_ICON_GLYPHS[look.icon]:undefined;
export function PageGlyph({look,size=16}:{look?:{icon?:PageIcon};size?:number}){const G=pageIcon(look);return G?<G size={size} aria-hidden="true"/>:null;}
