import test from 'node:test';
import assert from 'node:assert/strict';
import {demoWorkspace,defaultCharacter,playerCampaign} from '../lib/encyclopedia/world-model.ts';
import {defaultOrg} from '../lib/encyclopedia/org-profile.ts';
import {playersWebTies,webTies} from '../lib/encyclopedia/tie-web.ts';
import {BOX_H,BOX_W,familyChoices,familyGraph,familyLinks,familyMembers,familyOrgsOf,familyRoles,familyTree,generations,isFamilyOrgType,relativesOf} from '../lib/encyclopedia/family-tree.ts';

const C='demo-campaign',W='demo-world',T='2026-11-14T10:00:00.000Z';
const page=(id,title,kind,extra={})=>({id,worldId:W,campaignId:C,parentId:null,title,kind,body:'',updatedAt:T,overviewVisibility:'players',...extra});
const char=(id,title,ties=[],extra={})=>page(id,title,'character',{character:defaultCharacter(),...(ties.length?{ties}:{}),...extra});
const tie=(id,toId,typeId,extra={})=>({id,toId,typeId,...extra});
const house=(id,title,members,type='Noble house')=>{const org={...defaultOrg(),type};org.blocks=org.blocks.map(b=>b.kind==='members'?{...b,members:members.map(([entryId,role,gm],i)=>({id:`${id}-m${i}`,entryId,...(role?{role}:{}),...(gm?{gm:true}:{})}))}:b);return page(id,title,'faction',{org});};

/*
 * Aldric = Isolde
 *   ├ Corwin = Maelis (of House Quell; her father Bran Quell)
 *   │   ├ Rhosyn
 *   │   ├ Pell
 *   │   └ Jory (ward of Corwin)
 *   ├ Edda
 *   └ Tamsin ── Wren (secret child, GM only, cover: ward)
 */
function world(){
 const s=demoWorkspace();
 s.entries.push(
  char('aldric','Aldric Varrow',[tie('a1','isolde','partner'),tie('a2','corwin','parent'),tie('a3','edda','parent'),tie('a4','tamsin','parent')]),
  char('isolde','Isolde Varrow',[tie('i1','corwin','parent'),tie('i2','edda','parent'),tie('i3','tamsin','parent')]),
  char('corwin','Corwin Varrow',[tie('c1','maelis','partner'),tie('c2','rhosyn','parent'),tie('c3','pell','parent'),tie('c4','jory','ward')]),
  char('maelis','Maelis Varrow',[tie('m1','rhosyn','parent'),tie('m2','pell','parent')]),
  char('bran','Bran Quell',[tie('b1','maelis','parent'),tie('b2','oswin','parent')]),
  char('oswin','Oswin Quell'),
  char('edda','Edda Varrow'),
  char('tamsin','Tamsin Varrow',[tie('t1','wren','parent',{gm:true,cover:{typeId:'ward'}})]),
  char('rhosyn','Rhosyn Varrow'),char('pell','Pell Varrow'),char('jory','Jory Quell'),
  char('wren','Wren',[],{overviewVisibility:'players'}),
  char('lone1','Hale Brook',[tie('h1','lone2','sibling')]),char('lone2','Ivy Brook'),
  house('varrow','House Varrow',[['corwin','Lord of Harrowmere'],['rhosyn','Heir'],['edda','Abbess',true]]),
  house('quell','House Quell',[['bran'],['maelis']]),
  house('guild','The Tide Guild',[['pell']],'Guild'),
 );
 return s;
}
const graphOf=(s,players=false)=>{
 const people=new Set(s.entries.filter(e=>e.kind==='character').map(e=>e.id));
 let ties=webTies(s,W,C);
 if(players){const read=new Set(playerCampaign(s,C).entries.map(e=>e.id));ties=playersWebTies(ties,id=>read.has(id),()=>false);}
 return familyGraph(familyLinks(ties,id=>people.has(id)));
};

test('family links come only from kinds that draw on a tree, between characters', () => {
 const g=graphOf(world());
 assert.equal(g.links.filter(l=>l.role==='parent').length,13);
 assert.equal(g.links.filter(l=>l.role==='partner').length,2);
 assert.equal(g.links.filter(l=>l.role==='ward').length,1);
 assert.equal(g.links.filter(l=>l.role==='sibling').length,1);
 assert.deepEqual([...g.parents.get('corwin')].sort(),['aldric','isolde']);
 assert.ok(g.partners.get('maelis').has('corwin'));
});

test('a family is its blood relatives, plus those they married, but not the in-laws’ own parents', () => {
 const g=graphOf(world()),{blood,inLaws}=familyMembers(g,['rhosyn']);
 assert.deepEqual([...blood].sort(),['aldric','corwin','edda','isolde','jory','pell','rhosyn','tamsin','wren','bran','maelis','oswin'].sort());
 // Starting from Corwin, Maelis married in, and her father and brother stay out.
 const from=familyMembers(g,['corwin']);
 assert.ok(from.inLaws.has('maelis'));
 assert.ok(!from.blood.has('bran')&&!from.inLaws.has('bran')&&!from.blood.has('oswin'));
 assert.equal(inLaws.size,0);
});

test('a house follows its own line: a member’s in-law parent’s family stays out', () => {
 const g=graphOf(world());
 // Rhosyn and Corwin are House Varrow; Rhosyn's mother Maelis married in, so her father Bran is not in the house's tree.
 const house=familyMembers(g,['corwin','rhosyn'],200,true);
 assert.ok(house.blood.has('aldric')&&house.blood.has('rhosyn'));
 assert.ok(house.inLaws.has('maelis'));
 assert.ok(!house.blood.has('bran')&&!house.inLaws.has('bran'));
 // When no parent is in the house, both are followed.
 assert.ok(familyMembers(g,['rhosyn'],200,true).blood.has('bran'));
 const t=familyTree(g,['corwin','rhosyn'],200,true);
 assert.ok(!t.at.has('bran')&&!t.at.has('oswin'));
});

test('generations: parents above children, partners level, eldest at 0', () => {
 const g=graphOf(world()),{blood,inLaws}=familyMembers(g,['corwin']),m=new Set([...blood,...inLaws]);
 const gen=generations(g,m,['corwin']);
 assert.equal(gen.get('aldric'),0);assert.equal(gen.get('isolde'),0);
 assert.equal(gen.get('corwin'),1);assert.equal(gen.get('maelis'),1);assert.equal(gen.get('tamsin'),1);
 assert.equal(gen.get('rhosyn'),2);assert.equal(gen.get('jory'),2);assert.equal(gen.get('wren'),2);
});

test('generations settle when ties disagree, and a loop does not hang', () => {
 const links=[{key:'1',role:'parent',fromId:'a',toId:'b',gm:false,name:'Parent of',reverse:'Child of',index:0},{key:'2',role:'parent',fromId:'b',toId:'a',gm:false,name:'Parent of',reverse:'Child of',index:1},{key:'3',role:'partner',fromId:'a',toId:'c',gm:false,name:'Married to',reverse:'Married to',index:2}];
 const g=familyGraph(links),gen=generations(g,new Set(['a','b','c']),['a']);
 assert.equal(gen.size,3);
 assert.equal(gen.get('a'),gen.get('c'));
 const t=familyTree(g,['a']);
 assert.equal(t.at.size,3);
});

test('the tree puts couples side by side and children under them, without overlaps', () => {
 const t=familyTree(graphOf(world()),['corwin']);
 const unit=id=>t.units.find(u=>u.people.includes(id));
 assert.deepEqual(unit('corwin').people,['corwin','maelis']);
 assert.deepEqual(unit('aldric').people.sort(),['aldric','isolde']);
 assert.equal(t.roots.length,1);
 // Couples sit next to each other on one row.
 const c=t.at.get('corwin'),m=t.at.get('maelis');
 assert.equal(c.y,m.y);assert.ok(Math.abs(c.x-m.x)<BOX_W+40);
 // Children are a row down, and the parents sit over their children.
 const kids=['rhosyn','pell'].map(id=>t.at.get(id));
 assert.ok(kids.every(k=>k.y>c.y));
 // Nobody overlaps on a row.
 const rows=new Map();for(const [id,p] of t.at){(rows.get(p.y)??rows.set(p.y,[]).get(p.y)).push([id,p.x]);}
 for(const list of rows.values()){list.sort((a,b)=>a[1]-b[1]);for(let i=1;i<list.length;i++)assert.ok(list[i][1]-list[i-1][1]>=BOX_W,`${list[i-1][0]} and ${list[i][0]} overlap`);}
 // A married line between Corwin and Maelis, a line to each child, a dashed ward line to Jory.
 assert.ok(t.lines.some(l=>l.kind==='partner'&&l.ids.includes('corwin')&&l.ids.includes('maelis')));
 assert.ok(t.lines.some(l=>l.kind==='child'&&l.ids.includes('rhosyn')&&l.ids.includes('maelis')));
 assert.ok(t.lines.some(l=>l.kind==='ward'&&l.ids.at(-1)==='jory'));
 const wren=t.lines.find(l=>l.kind==='child'&&l.ids.at(-1)==='wren');
 assert.ok(wren.gm);
 assert.ok(t.width>0&&t.height===2*128+BOX_H);
});

test('siblings with no parents in the tree get a bracket, and stand on one row', () => {
 const t=familyTree(graphOf(world()),['lone1']);
 assert.equal(t.at.get('lone1').y,t.at.get('lone2').y);
 assert.ok(t.lines.some(l=>l.kind==='sibling'));
});

test('two parents with a child but no marriage still sit together', () => {
 const s=world();
 s.entries.push(char('x','Xan',[tie('x1','kid','parent')]),char('y','Yara',[tie('y1','kid','parent')]),char('kid','Kit'));
 const t=familyTree(graphOf(s),['kid']);
 assert.equal(t.units.find(u=>u.people.includes('x')).people.length,2);
 assert.ok(t.lines.some(l=>l.kind==='coparent'));
});

test('players see shared family ties, and a GM-only tie only as its cover story', () => {
 const g=graphOf(world(),true);
 // The secret parent tie is a ward tie for players.
 assert.ok(!g.parents.get('wren'));
 assert.ok(g.guardians.get('wren').has('tamsin'));
});

test('relatives are named from the person, with siblings worked out from shared parents', () => {
 const g=graphOf(world()),r=relativesOf(g,'corwin');
 const say=r.map(x=>`${x.label} ${x.id}`);
 assert.equal(say[0],'Married to maelis');
 assert.ok(say.includes('Parent of rhosyn')&&say.includes('Child of aldric')&&say.includes('Guardian of jory'));
 assert.ok(say.includes('Sibling of edda')&&say.includes('Sibling of tamsin'));
 const m=relativesOf(g,'maelis');
 assert.ok(m.some(x=>x.label==='Half-sibling of'||x.label==='Sibling of'));
});

test('families to pick from: family organizations, then groups no organization covers', () => {
 const s=world(),g=graphOf(s);
 const pages=s.entries.filter(e=>e.worldId===W&&(e.campaignId===null||e.campaignId===C));
 const choices=familyChoices(pages,g);
 // The biggest family first.
 assert.deepEqual(choices.map(c=>c.label),['House Varrow','House Quell','Family of Hale Brook']);
 const varrow=choices.find(c=>c.orgId==='varrow');
 assert.deepEqual(varrow.seeds,['corwin','rhosyn','edda']);
 // Players don't see GM-only members.
 const shown=familyChoices(pages,g,(_org,m)=>!m.gm);
 assert.deepEqual(shown.find(c=>c.orgId==='varrow').seeds,['corwin','rhosyn']);
 const roles=familyRoles(s.entries.find(e=>e.id==='varrow'));
 assert.equal(roles.get('rhosyn'),'Heir');
 assert.equal(familyOrgsOf(pages).get('maelis')[0].title,'House Quell');
});

test('which organizations count as families', () => {
 for(const t of ['Noble house','House','Royal house','Clan','Family','Dynasty','Merchant family'])assert.ok(isFamilyOrgType(t),t);
 for(const t of ['Guild','Opera house','Trading house','Council',undefined,''])assert.ok(!isFamilyOrgType(t),String(t));
});

test('a very big family is cut to the limit', () => {
 const links=[];for(let i=0;i<30;i++)links.push({key:`k${i}`,role:'parent',fromId:'root',toId:`c${i}`,gm:false,name:'Parent of',reverse:'Child of',index:i});
 const t=familyTree(familyGraph(links),['root'],10);
 assert.ok(t.cut);
 assert.ok(t.at.size<=10);
});

test('boxes sit on whole rows', () => {
 const t=familyTree(graphOf(world()),['corwin']);
 for(const p of t.at.values())assert.equal(p.y%128,0);
 assert.ok(BOX_H<128);
});
