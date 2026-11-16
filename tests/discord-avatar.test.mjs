import test from 'node:test';
import assert from 'node:assert/strict';
import {avatarUrl,readAvatarLink,tokenAvatar,pictureAvatar,siteOrigin} from '../lib/discord/avatar.ts';
import {rollPost} from '../lib/discord/cards.ts';

const env={AI_KEY_SECRET:'test-secret',VERCEL_PROJECT_PRODUCTION_URL:'tools.example.com'};
const P='users/u1/',id='0b5e8f7a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const link=url=>new URL(url).searchParams.get('a');

test('an avatar link points at the production site and carries a source only this server can sign',()=>{
 const url=avatarUrl({b:'m',k:P+'images/'+id,p:P},env);
 assert.match(url,/^https:\/\/tools\.example\.com\/api\/discord\/avatar\?a=/);
 assert.deepEqual(readAvatarLink(link(url),env),{b:'m',k:P+'images/'+id,p:P});
 assert.equal(readAvatarLink(link(url),{...env,AI_KEY_SECRET:'other'}),null,'another secret');
 const [body,sig]=link(url).split('.'),forged=Buffer.from(JSON.stringify({b:'m',k:'users/u2/images/'+id,p:'users/u2/'})).toString('base64url');
 assert.equal(readAvatarLink(forged+'.'+sig,env),null,'a changed source');
 assert.equal(readAvatarLink(body,env),null);assert.equal(readAvatarLink(null,env),null);
});

test('a signed source still has to stay inside its own user folder',()=>{
 assert.equal(readAvatarLink(link(avatarUrl({b:'m',k:'users/u2/images/x',p:P},env)),env),null);
 assert.equal(readAvatarLink(link(avatarUrl({b:'m',k:'other/x',p:'other/'},env)),env),null);
});

test('no site address or no secret means no avatar link',()=>{
 assert.equal(avatarUrl({b:'m',k:P+'x',p:P},{AI_KEY_SECRET:'s'}),null);
 assert.equal(avatarUrl({b:'m',k:P+'x',p:P},{VERCEL_PROJECT_PRODUCTION_URL:'a.example'}),null);
 assert.equal(siteOrigin({APP_ORIGIN:'http://localhost:5173/',VERCEL_PROJECT_PRODUCTION_URL:'a.example'}),'http://localhost:5173');
});

test('tokens link to uploads or the GM\'s own S3 only, and pictures carry their token circle',()=>{
 const maps={assets:[{id:'a',src:'/api/assets?id='+id},{id:'b',src:'/api/s3?key=maps%2Fhag.png'},{id:'c',src:'https://elsewhere.example/x.png'}]};
 assert.deepEqual(readAvatarLink(link(tokenAvatar(P,maps,{assetId:'a'},env)),env),{b:'m',k:P+'images/'+id,p:P});
 assert.deepEqual(readAvatarLink(link(tokenAvatar(P,maps,{assetId:'b'},env)),env),{b:'s',k:'maps/hag.png',p:P});
 assert.equal(tokenAvatar(P,maps,{assetId:'c'},env),null);assert.equal(tokenAvatar(P,maps,{assetId:null},env),null);
 const s=readAvatarLink(link(pictureAvatar('u1',{imageId:id,width:800,height:600,x:0.5,y:0.4,size:0.6},env)),env);
 assert.deepEqual(s,{b:'m',k:'users/u1/encyclopedia/images/'+id,p:P,c:[0.5,0.4,0.6]});
});

test('a roll card shows the avatar link, or an attached avatar.png when given true',()=>{
 assert.equal(rollPost({title:'Claws',formula:'1d20',total:5,detail:'[5]',who:'Bog Hag',avatar:'https://tools.example.com/api/discord/avatar?a=x.y'}).embeds[0].author.icon_url,'https://tools.example.com/api/discord/avatar?a=x.y');
 assert.equal(rollPost({title:'Claws',formula:'1d20',total:5,detail:'[5]',who:'Bog Hag',avatar:null}).embeds[0].author.icon_url,undefined);
});
