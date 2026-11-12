import type { Metadata } from 'next';
import './appearance.css';
import {appearanceBootScript} from '@/lib/appearance';
export const metadata: Metadata = {title:'RPG Tools',description:'Maps, worlds, campaigns and interconnected lore.',icons:{icon:'/favicon.svg'},referrer:'no-referrer'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:appearanceBootScript}}/></head><body>{children}</body></html>;}
