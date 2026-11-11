import './encyclopedia.css';
import {ThemeProvider} from '@/components/encyclopedia/theme';
export const metadata={title:'RPG Encyclopedia | RPG Tools'};
export default function EncyclopediaLayout({children}:{children:React.ReactNode}){return <ThemeProvider><nav className="rpg-tools-switcher" aria-label="RPG tools"><a href="/">RPG Tools</a><a href="/maptable">Maptable</a><a href="/encyclopedia" aria-current="page">Encyclopedia</a><a href="/account">Account</a></nav>{children}</ThemeProvider>;}
