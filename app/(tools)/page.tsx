import SiteHeader from '@/components/site-header';
import {getAppUser} from '@/lib/app-user';
import HomeCampaigns from '@/components/home-campaigns';
export const dynamic='force-dynamic';
export default async function Home(){const user=await getAppUser();return <main className="rpg-hub"><SiteHeader signedIn={!!user}/>
<section className="rpg-intro"><h1>Maps for the table.<br/><span>Memory for the world.</span></h1><p>Two tools for game masters, on one account. Run the encounter on a shared map, and keep the lore your players keep asking about.</p></section>
{user&&<HomeCampaigns/>}
<div className="rpg-tools-grid">
<section className="rpg-tool"><div className="rpg-preview rpg-preview-map" aria-hidden="true"><span className="rpg-token" style={{left:'22%',top:'30%'}}>G1</span><span className="rpg-token rpg-token-pc" style={{left:'42%',top:'56%'}}>PC</span><span className="rpg-token rpg-token-two" style={{left:'68%',top:'22%'}}>G2</span><span className="rpg-aura"/></div><div className="rpg-tool-body"><p className="rpg-eyebrow"><span>01</span>Maptable</p><h2>Set the scene</h2><p>Build maps, place tokens, track initiative, reveal fog and share the view with your players.</p><a className="rpg-open" href="/maptable">Open Maptable</a></div></section>
<section className="rpg-tool"><div className="rpg-preview rpg-preview-page" aria-hidden="true"><small>Place · Ashenwood</small><strong>Oakhurst</strong><p>A quiet farming village at the edge of the <span>Ashenwood</span>. Kerowyn Hucrele is offering a reward for her missing children.</p></div><div className="rpg-tool-body"><p className="rpg-eyebrow"><span>02</span>RPG Encyclopedia</p><h2>Give your world a memory</h2><p>Link places, people and session notes, with calendars, weather, travel and a read-only player view.</p><a className="rpg-open" href="/encyclopedia">Open Encyclopedia</a></div></section>
</div>
<p className="rpg-account-line">{user?`Signed in as ${user.displayName}.`:'Register or sign in with your email to keep your maps and encyclopedia private.'} Both tools share one login. The <a href="/campaigns">Campaigns page</a> pairs their campaigns.</p></main>;}
