import test from 'node:test';
import assert from 'node:assert/strict';
process.env.AI_KEY_SECRET='test-secret-for-members';
const M=await import('../lib/members.ts');
const {MemberStore,seenHash,requestIp}=await import('../lib/members-server.ts');
const {EncyclopediaStore}=await import('../lib/encyclopedia/store.ts');
const {demoWorkspace}=await import('../lib/encyclopedia/world-model.ts');

const C='demo-campaign',NOW=new Date('2026-11-14T10:00:00Z');
const H=c=>c.repeat(64);

test('three groups to start, Yes in any group and Never in none, and the owner can always',()=>{
 let l=M.emptyMemberList(C,'Dreams');
 assert.deepEqual(l.groups.map(g=>g.name),['Co-GMs','Players','Guests']);
 l={...l,members:[{userId:'mara',name:'Mara',groups:['players'],joinedAt:''},{userId:'wren',name:'Wren',groups:['players','guests'],joinedAt:''},{userId:'alder',name:'Alder',groups:['cogms'],joinedAt:''}]};
 assert.equal(M.can(l,'mara','editOwnCharacter'),true);assert.equal(M.can(l,'mara','addSubPages'),true);assert.equal(M.can(l,'mara','seeGm'),false);
 assert.equal(M.can(l,'wren','seePlayer'),true);
 l=M.setPermission(l,'players','editPages','yes');
 assert.equal(M.can(l,'mara','editPages'),true);assert.equal(M.can(l,'wren','editPages'),false,'Never in Guests wins over Yes in Players');
 assert.equal(M.can(l,'stranger','seePlayer'),false);assert.equal(M.can(l,'gm','manage','gm'),true);
 assert.equal(M.roleOf(l,'alder'),'Co-GM');assert.equal(M.roleOf(l,'mara'),'Player');
});

test('your own groups: add, rename, recolour and delete them; the three that come with a campaign stay',()=>{
 let l=M.addGroup(M.emptyMemberList(C),'  Party   B ','pink','g-b');
 const b=l.groups.find(g=>g.id==='g-b');
 assert.equal(b.name,'Party B');assert.ok(Object.values(b.perms).every(c=>c==='no'),'a new group says No to everything');
 assert.throws(()=>M.addGroup(l,'party b','teal','g-c'),/already a group called party b/);
 l={...l,members:[{userId:'mara',name:'Mara',groups:['players','g-b'],joinedAt:''}]};
 l=M.editGroup(l,'g-b',{name:'Split party',color:'teal'});
 assert.equal(l.groups.find(g=>g.id==='g-b').name,'Split party');
 assert.throws(()=>M.deleteGroup(l,'players'),/comes with every campaign/);
 l=M.deleteGroup(l,'g-b');assert.deepEqual(l.members[0].groups,['players']);
 assert.throws(()=>M.setMemberGroups(l,'mara',[]),/at least one group/);
});

const withLink=(approve,expiresAt=null)=>({...M.emptyMemberList(C),links:[{groupId:'players',hash:H('a'),createdAt:'',expiresAt,approve,uses:0}]});

test('joining by link: straight away, or waiting for the GM to let them in',()=>{
 let r=M.join(withLink(false),H('a'),{userId:'mara',name:' Mara ',email:H('e')},NOW);
 assert.equal(r.outcome,'joined');assert.deepEqual(r.list.members[0],{userId:'mara',name:'Mara',groups:['players'],joinedAt:NOW.toISOString(),email:H('e')});
 assert.equal(r.list.links[0].uses,1);
 assert.equal(M.join(r.list,H('a'),{userId:'mara',name:'Mara'},NOW).outcome,'already');
 r=M.join(withLink(true),H('a'),{userId:'sable',name:'Sable',ip:H('1')},NOW);
 assert.equal(r.outcome,'asked');assert.equal(r.list.members.length,0);assert.equal(r.list.requests[0].name,'Sable');
 assert.equal(M.join(r.list,H('a'),{userId:'sable',name:'Sable'},NOW).outcome,'waiting');
 const inside=M.letIn(r.list,'sable',NOW);
 assert.deepEqual(inside.members[0].groups,['players']);assert.equal(inside.members[0].ip,H('1'));assert.equal(inside.requests.length,0);
 assert.equal(M.decline(r.list,'sable').requests.length,0);
 assert.throws(()=>M.join(withLink(false,'2026-11-13T00:00:00Z'),H('a'),{userId:'x',name:'X'},NOW),/turned off or has expired/);
 assert.throws(()=>M.join(withLink(false),H('b'),{userId:'x',name:'X'},NOW),/turned off or has expired/);
 assert.throws(()=>M.join(withLink(false),H('a'),{userId:'x',name:'  '},NOW),/the name you go by/);
});

test('bans: always the account, the email when chosen, the internet address for 30 days; the browser never sees hashes',()=>{
 let l=M.join(withLink(false),H('a'),{userId:'vex',name:'Vex',email:H('e'),ip:H('1')},NOW).list;
 l=M.ban(l,'vex',{email:true,ip:true},'Spammed the forum','b1',NOW);
 assert.equal(l.members.length,0);assert.equal(l.bans[0].email,H('e'));assert.equal(l.bans[0].ipUntil,'2026-12-14T10:00:00.000Z');
 assert.throws(()=>M.join(l,H('a'),{userId:'vex',name:'Vex'},NOW),/can't join/);
 assert.throws(()=>M.join(l,H('a'),{userId:'vex2',name:'V',email:H('e')},NOW),/can't join/,'a new account with the same email');
 assert.throws(()=>M.join(l,H('a'),{userId:'vex3',name:'V',ip:H('1')},NOW),/can't join/,'the same internet address');
 assert.equal(M.join(l,H('a'),{userId:'vex3',name:'V',ip:H('1')},new Date('2026-12-15T00:00:00Z')).outcome,'joined','an address ban ends after 30 days');
 const shown=M.publicMembers(l,NOW);
 assert.deepEqual(shown.bans[0],{id:'b1',userId:'vex',name:'Vex',note:'Spammed the forum',at:NOW.toISOString(),byEmail:true,byIp:true});
 assert.equal('hash' in shown.links[0],false);assert.doesNotMatch(JSON.stringify(shown),new RegExp(H('e')));
 let only=M.join(withLink(false),H('a'),{userId:'vex',name:'Vex',email:H('e'),ip:H('1')},NOW).list;
 only=M.ban(only,'vex',{email:false,ip:false},'','b2',NOW);
 assert.equal(only.bans[0].email,undefined);assert.equal(M.join(only,H('a'),{userId:'other',name:'O',email:H('e')},NOW).outcome,'joined');
 assert.equal(M.unban(l,'b1').bans.length,0);
});

test('emails and addresses are hashed with the server key, and only plain addresses are read from the request',()=>{
 assert.equal(seenHash('email',' Mara@Example.com '),seenHash('email','mara@example.com'));
 assert.notEqual(seenHash('email','mara@example.com'),seenHash('ip','mara@example.com'));
 assert.notEqual(seenHash('email','x',{AI_KEY_SECRET:'a'}),seenHash('email','x',{AI_KEY_SECRET:'b'}));
 assert.equal(requestIp(new Request('https://x',{headers:{'x-forwarded-for':'203.0.113.7, 10.0.0.1'}})),'203.0.113.7');
 assert.equal(requestIp(new Request('https://x',{headers:{'x-forwarded-for':'<script>'}})),'');
});

function bucket(){
 const data=new Map();let n=0;
 return {data,
  async get(k){const v=data.get(k);return v?{etag:v.etag,json:async()=>JSON.parse(v.text)}:null;},
  async head(k){const v=data.get(k);return v?{etag:v.etag}:null;},
  async put(k,text,o={}){const v=data.get(k);if(o.onlyIf?.etagMatches&&v?.etag!==o.onlyIf.etagMatches)return null;if(o.onlyIf?.etagDoesNotMatch==='*'&&v)return null;data.set(k,{text:String(text),etag:String(++n)});return {etag:String(n)};},
  async delete(k){data.delete(k);},
 };
}
const gm={userId:'supabase:gm',displayName:'Dreams',email:'gm@example.com',ip:'203.0.113.1'};
const mara={userId:'supabase:mara',displayName:'mara',email:'mara@example.com',ip:'203.0.113.7'};

test('end to end: a link, the join page, asking, the bell, letting in, Campaigns you\'re in and a ban',async()=>{
 const b=bucket(),store=new MemberStore(b);
 await new EncyclopediaStore(b).save(gm.userId,demoWorkspace(),0);
 await store.change(gm.userId,C,l=>({...l,ownerName:'Dreams'}));
 const token=await store.newLink(gm.userId,C,'players',{approve:true,expiresAt:null},NOW);
 assert.match(token,/^[a-f0-9]{64}$/);
 assert.equal([...b.data.keys()].some(k=>k.includes(token)),false,'the link itself is never a storage key');
 const page=await store.describe(token,mara,NOW);
 assert.equal(page.campaign,'The Salt Road');assert.equal(page.ownerName,'Dreams');assert.equal(page.group.name,'Players');assert.equal(page.status,'invited');assert.equal(page.approve,true);
 assert.ok(page.can.includes('Edit their own character page'));assert.ok(page.can.includes('Read and post in the forum, when it arrives'));
 assert.equal((await store.describe(token,null,NOW)).status,'signedOut');assert.equal((await store.describe(token,gm,NOW)).status,'owner');
 assert.equal(await store.describe('f'.repeat(64),mara,NOW),null);
 assert.deepEqual(await store.join(token,mara,'Mara',NOW),{outcome:'asked',campaign:'The Salt Road'});
 assert.equal((await store.describe(token,mara,NOW)).status,'waiting');
 let bell=await store.notifications(gm.userId);
 assert.equal(bell.unread,1);assert.equal(bell.items[0].kind,'ask');assert.equal(bell.items[0].name,'Mara');assert.equal(bell.items[0].waiting,true);
 assert.deepEqual((await store.memberships(mara.userId)).map(x=>[x.campaign,x.role,x.asking]),[['The Salt Road','Asking to join',true]]);
 await store.change(gm.userId,C,l=>M.letIn(l,mara.userId,NOW));await store.syncMembership(gm.userId,C,mara.userId);
 const mine=await store.memberships(mara.userId);
 assert.deepEqual(mine.map(x=>[x.campaign,x.world,x.ownerName,x.role,x.groups]),[['The Salt Road','The Lantern Coast','Dreams','Player',['Players']]]);
 assert.equal('owner' in mine[0],false,'the owner\'s account id stays on the server');
 assert.equal((await store.notifications(gm.userId)).items[0].waiting,false,'answered asks show as handled');
 await store.markRead(gm.userId);assert.equal((await store.notifications(gm.userId)).unread,0);
 const view=await store.forOwner(gm.userId,C,'https://rpg.example',NOW);
 assert.equal(view.links[0].url,`https://rpg.example/join/${token}`);assert.equal(view.members[0].name,'Mara');assert.equal('email' in view.members[0],false);
 // A new link stops the old one.
 const next=await store.newLink(gm.userId,C,'players',{approve:false,expiresAt:null},NOW);
 assert.equal(await store.describe(token,mara,NOW),null);
 await store.change(gm.userId,C,l=>M.ban(l,mara.userId,{email:true,ip:false},'','b1',NOW));await store.syncMembership(gm.userId,C,mara.userId);
 assert.deepEqual(await store.memberships(mara.userId),[]);
 assert.equal((await store.describe(next,mara,NOW)).status,'banned');
 await assert.rejects(store.join(next,{...mara,userId:'supabase:mara2'},'Mara',NOW),/can't join/,'a new account with the banned email');
 await assert.rejects(store.join(next,gm,'Me',NOW),/your own campaign/);
 await store.linkOff(gm.userId,C,'players');assert.equal(await store.describe(next,mara,NOW),null);
});
