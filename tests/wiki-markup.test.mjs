import test from 'node:test';
import assert from 'node:assert/strict';
import {wikiBlocks,inlineParts,linkParts,sectionText,leadText,contents,styleOf,pageListOptions,infoRows,headingId,footnoteNumbers} from '../lib/encyclopedia/markup.ts';

const kinds=blocks=>blocks.map(b=>b.type==='block'?`block:${b.name}`:b.type);

test('Markdown blocks: headings with anchors, numbered lists, tables, rules, code and footnotes',()=>{
 const b=wikiBlocks('# History\n1. One\n1. Two\n\n| A | B |\n| :-: | --: |\n| x | [[P|q]] |\n---\n```\n::: secret\n```\nText[^a]\n[^a]: The note.');
 assert.deepEqual(kinds(b),['heading','number','number','gap','table','rule','code','paragraph','footnotes']);
 assert.equal(b[0].id,'h-history');
 assert.deepEqual(b.filter(x=>x.type==='number').map(x=>x.n),[1,2]);
 const t=b.find(x=>x.type==='table');
 assert.deepEqual(t.align,['center','right']);
 assert.deepEqual(t.rows,[['x','[[P|q]]']],'a | inside a link is not a column break');
 assert.equal(b.find(x=>x.type==='code').text,'::: secret','a block opener inside code stays code');
 assert.deepEqual(b.at(-1).notes,[{key:'a',n:1,text:'The note.'}]);
 assert.deepEqual([...footnoteNumbers('x[^b] y[^a] z[^b]')],[['b',1],['a',2]]);
});

test('::: blocks nest, columns split on +++, callouts and HTML are read',()=>{
 const b=wikiBlocks('::: note Heads up\nOuter\n::: secret\nInner\n:::\nAfter inner\n:::\n::: columns\nLeft\n+++\nRight\n:::\n> [!warning] Careful\n> Traps\n[dohtml]\n<b>hi</b>\n[/dohtml]\n::: html\n<i>x</i>\n:::');
 assert.deepEqual(kinds(b),['block:note','block:columns','block:warning','html','html']);
 assert.equal(b[0].arg,'Heads up');
 assert.deepEqual(kinds(b[0].children),['paragraph','block:secret','paragraph'],'the inner close does not end the outer block');
 assert.equal(b[1].columns.length,2);
 assert.equal(b[3].source,'<b>hi</b>');
 assert.equal(b[4].source,'<i>x</i>');
});

test('embeds, table lines and Maptable lines on their own line',()=>{
 const b=wikiBlocks('![[Ravenmoor#History|full]]\n[[table:Rumours]]\n[[maptable:abc_1|Bridge]]\nSee [[Ravenmoor]].');
 assert.deepEqual(b[0],{type:'embed',target:'Ravenmoor#History',options:['full']});
 assert.deepEqual(b[1],{type:'randomTable',inner:'table:Rumours'});
 assert.deepEqual(b[2],{type:'maptable',sceneId:'abc_1',label:'Bridge'});
 assert.equal(b[3].type,'paragraph');
});

test('inline parts: links, styled words with links inside, asides, notes, web links, footnotes',()=>{
 const p=inlineParts('A [[Keep|the keep]] and [the [[Duke]]]{color=crimson} %%secret%% {{Vessa|river}} [site](https://example.com) **b** *i* ~~s~~ ==m== x[^1]');
 const types=p.filter(x=>x.type!=='text').map(x=>x.type);
 assert.deepEqual(types,['link','styled','aside','note','web','bold','italic','strike','mark','footnote']);
 assert.deepEqual(p.find(x=>x.type==='styled'),{type:'styled',text:'the [[Duke]]',attrs:'color=crimson'});
 assert.deepEqual(inlineParts('[a](javascript:alert(1))').map(x=>x.type),['text'],'only http(s) addresses become links');
});

test('link parts, sections and a page lead',()=>{
 assert.deepEqual(linkParts('Ravenmoor#Old History|then'),{page:'Ravenmoor',section:'Old History',label:'then'});
 assert.deepEqual(linkParts('#Notes'),{page:'',section:'Notes',label:null});
 const body='::: infobox\nKind: Keep\n:::\nOpening words.\n## History\nOld.\n### Detail\nMore.\n## Later\nNew.';
 assert.equal(leadText(body),'Opening words.');
 assert.equal(sectionText(body,'history'),'Old.\n### Detail\nMore.');
 assert.equal(sectionText(body,'Missing'),null);
 assert.deepEqual(contents(wikiBlocks(body)).map(h=>h.text),['History','Detail','Later']);
 assert.equal(headingId('**The** [[Duke]]’s Hall'),'h-the-duke-s-hall');
});

test('styling reads only known words and values',()=>{
 assert.deepEqual(styleOf('size=big font=hand color=crimson bg=#3a7 caps'),{fontSize:'1.25em',fontFamily:'var(--wiki-font-hand)',color:'var(--wiki-crimson)',backgroundColor:'color-mix(in srgb, #3a7 22%, transparent)',fontVariant:'small-caps',letterSpacing:'0.04em'});
 assert.deepEqual(styleOf('color=url(x) size=9000 position=fixed font=comic'),{});
 assert.deepEqual(styleOf('align=centre'),{},'align is only for lines');
 assert.deepEqual(styleOf('align=centre',true),{textAlign:'center'});
});

test('page list options and info box rows',()=>{
 assert.deepEqual(pageListOptions(['kind: places, NPCs','inside: [[The North]]','sort: changed','limit: 500','show: cards']),{kinds:['place','character'],tag:null,inside:'The North',sort:'changed',limit:200,show:'cards'});
 assert.deepEqual(infoRows(['Kind: Keep','(gm) Secret: Tunnels','no colon','Image: x.png','Empty:']),[{label:'Kind',value:'Keep',gm:false},{label:'Secret',value:'Tunnels',gm:true}]);
});

test('excerpts (hover previews, page cards) read past wiki markup',async()=>{
 const {plainExcerpt}=await import('../lib/encyclopedia/inline.ts');
 assert.equal(plainExcerpt('::: infobox\nKind: Keep\n(gm) Secret: x\n:::\nThe [old [[Duke]]]{color=crimson} %%GM%% waits.[^1] ==Now==.\n[^1]: Note.'),'Kind: Keep The old Duke waits. Now.');
});
