import './encyclopedia.css';
import {ThemeProvider} from '@/components/encyclopedia/theme';
export const metadata={title:'Wiki | RPG Tools'};
export default function EncyclopediaLayout({children}:{children:React.ReactNode}){return <ThemeProvider><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&display=swap" precedence="default"/>{children}</ThemeProvider>;}
