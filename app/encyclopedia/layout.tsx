import './encyclopedia.css';
import {ThemeProvider} from '@/components/encyclopedia/theme';
export const metadata={title:'Wiki | RPG Tools'};
export default function EncyclopediaLayout({children}:{children:React.ReactNode}){return <ThemeProvider>{children}</ThemeProvider>;}
