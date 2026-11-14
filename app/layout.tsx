import type { Metadata } from 'next';
import './appearance.css';
import {appearanceBootScript,DEFAULT_FONTS_URL} from '@/lib/appearance';
import GlobalDice from '@/components/global-dice';
export const metadata: Metadata = {title:'RPG Tools',description:'Maps, worlds, campaigns and interconnected lore.',icons:{icon:'/favicon.svg'},referrer:'no-referrer'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" suppressHydrationWarning><head><link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin=""/><link rel="stylesheet" href={DEFAULT_FONTS_URL}/><script dangerouslySetInnerHTML={{__html:appearanceBootScript}}/></head><body>{children}<GlobalDice/></body></html>;}
