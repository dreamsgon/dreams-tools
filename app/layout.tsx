import type { Metadata } from 'next';
export const metadata: Metadata = {title:'RPG Tools',description:'Maps, worlds, campaigns and interconnected lore.',icons:{icon:'/favicon.svg'},referrer:'no-referrer'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" suppressHydrationWarning><body>{children}</body></html>;}
