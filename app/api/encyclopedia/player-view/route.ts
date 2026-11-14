import {json} from '@/lib/encyclopedia/workspace-server';
import {memberRights,playerGrant,playerTokenPattern,readMemberView,readPlayerView} from '@/lib/encyclopedia/player-links-server';
export const dynamic='force-dynamic';
// A player link, or a campaign the signed-in person is a member of (`m-<ref>`, see lib/members-server.ts).
export async function POST(request:Request){
 try{const raw=await request.text();if(raw.length>1000)return json({error:'Invalid link'},400);const body=JSON.parse(raw);if(typeof body?.token!=='string'||!playerTokenPattern.test(body.token))return json({error:'Invalid player link'},404);
  const member=body.token.startsWith('m-');
  // A signed-in member also gets the pages they may edit (each page's Who can edit).
  const found=member?await memberRights(body.token.slice(2)):null,{grant,signedOut}=member?{grant:null,signedOut:found!.signedOut}:await playerGrant(body.token);
  if(signedOut)return json({error:'Sign in to open this campaign.'},401);
  const data=found?.rights?await readMemberView(found.rights):grant?await readPlayerView(grant):null;
  return data?json(data):json({error:member?'You can no longer open this campaign. You may have left it, or the GM changed what your group can see.':'This player link is unavailable or has been revoked.'},404);}
 catch{return json({error:'Player view is unavailable.'},500);}
}
