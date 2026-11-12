import SiteHeader from '@/components/site-header';
import {getAppUser} from '@/lib/app-user';
import HomeCampaigns from '@/components/home-campaigns';
import {BookOpen, Flag, Map as MapIcon} from 'lucide-react';
import '@/components/home.css';
export const dynamic='force-dynamic';

const doors=[
  {n:'01',label:'Campaigns',title:'Run your campaigns',text:'Every campaign with its maps and notes in one place, across both tools.',href:'/campaigns',open:'Open Campaigns',Icon:Flag,primary:true},
  {n:'02',label:'Maptable',title:'Set the scene',text:'Maps, tokens, initiative, fog and a live view for your players.',href:'/maptable',open:'Open Maptable',Icon:MapIcon},
  {n:'03',label:'RPG Encyclopedia',title:'Give your world a memory',text:'Places, people, sessions, calendars, random tables and a player view.',href:'/encyclopedia',open:'Open Encyclopedia',Icon:BookOpen},
];

export default async function Home(){
  const user=await getAppUser();
  const first=user?.displayName.split(/[\s@]/)[0]||'';
  return <main className="rpg-hub home-page"><SiteHeader signedIn={!!user}/>
    <section className="home-hello">
      {user?<><h1>Welcome back{first?`, ${first}`:''}.</h1><p>Pick up where you left off, or open a tool.</p></>
        :<><h1>Maps for the table. <span>Memory for the world.</span></h1><p>Tools for game masters, on one account. Run the encounter on a shared map, and keep the lore your players keep asking about.</p></>}
    </section>
    <nav className="home-doors" aria-label="Tools">
      {doors.map(({n,label,title,text,href,open,Icon,primary})=><section className="home-door" key={href}>
        <span className="home-door-icon" aria-hidden="true"><Icon size={20} strokeWidth={1.6}/></span>
        <div>
          <p className="home-door-label">{n} · {label}</p>
          <h2>{title}</h2>
          <p>{text}</p>
          <a className={primary?'home-button home-button-primary':'home-button'} href={href}>{open}</a>
        </div>
      </section>)}
    </nav>
    {user&&<HomeCampaigns/>}
    <p className="home-account-line">{user?`Signed in as ${user.displayName}.`:'Register or sign in with your email to keep your maps and encyclopedia private.'} Both tools share one login.</p>
  </main>;
}
