import './globals.css';
import StandardDiceTray from '@/components/standard-dice-tray';
export default function ToolsLayout({children}:{children:React.ReactNode}){return <>{children}<StandardDiceTray/></>;}
