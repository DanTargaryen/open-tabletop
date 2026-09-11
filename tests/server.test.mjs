import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createTabletopServer} from '../server/index.mjs';
import {syncCursor,mergeRoomSnapshot} from '../games/texas-holdem/web/room-sync.js';
import worker from '../deploy/cloudflare/worker.mjs';

async function start(dataDir,options={}){
 const app=await createTabletopServer({dataDir,...options});
 await new Promise((resolve,reject)=>{app.server.once('error',reject);app.server.listen(0,'127.0.0.1',resolve);});
 return {...app,url:'http://127.0.0.1:'+app.server.address().port};
}
async function call(app,path,{body,token,cursor,origin}={}){
 const url=new URL(path,app.url);if(cursor)for(const[key,value]of Object.entries(cursor))url.searchParams.set(key==='protocol'?'sync':key,String(value));
 const response=await fetch(url,{method:body?'POST':'GET',headers:{Origin:origin||app.url,...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
 return {response,data:await response.json()};
}

test('collection serves catalog, both game entries and assets without exposing source or runtime files',async t=>{
 const dataDir=await mkdtemp(join(tmpdir(),'open-tabletop-web-')),app=await start(dataDir);
 t.after(async()=>{await app.close();await rm(dataDir,{recursive:true,force:true});});
 const home=await fetch(app.url);assert.equal(home.status,200);assert.match(await home.text(),/<title>开桌 · Open Tabletop<\/title>/);
 const {data:catalog}=await call(app,'/games.json');assert.deepEqual(catalog.map(game=>game.id),['texas-holdem','splendor','abracada-what']);
 for(const path of [...catalog.flatMap(game=>[game.solo,game.online]),'/vendor/three.module.js','/vendor/three.core.js','/vendor/loaders/GLTFLoader.js','/vendor/utils/BufferGeometryUtils.js','/vendor/utils/SkeletonUtils.js','/games/texas-holdem/online-ui.js','/games/texas-holdem/room-sync.js','/games/texas-holdem/style.css','/games/texas-holdem/assets/brands/doubao.png','/games/abracada-what/engine.js','/games/abracada-what/ui.js','/games/abracada-what/online-ui.js','/games/abracada-what/audio.js','/games/abracada-what/three-table.js','/games/abracada-what/tower-progress.js','/games/abracada-what/online.css','/games/abracada-what/style.css','/games/abracada-what/assets/audio/tower-ambient-loop.ogg','/games/abracada-what/assets/audio/dice-roll.ogg','/games/abracada-what/assets/audio/spell-thunder.ogg','/games/abracada-what/assets/audio/spell-fireball.ogg','/games/abracada-what/assets/3d/characters/mage.glb','/games/abracada-what/assets/3d/animations/general.glb','/games/abracada-what/assets/3d/dungeon/wall_shelves.gltf','/games/abracada-what/assets/3d/dungeon/wall_shelves.bin','/games/abracada-what/assets/3d/particles/spark_01.png',...Array.from({length:8},(_,index)=>`/games/abracada-what/assets/spells/spell-${index+1}.svg`),'/app.js','/style.css','/favicon.svg'])assert.equal((await fetch(app.url+path)).status,200,path);
 for(const path of ['/server/index.mjs','/.data/poker-rooms.json','/.data/abracada-rooms.json','/.git/config','/games/texas-holdem/%2e%2e/server/rooms.mjs','/games/texas-holdem/%2f..%2fserver%2frooms.mjs','/games/texas-holdem/%5c..%5cserver%5crooms.mjs','/games/abracada-what/%2e%2e/tests/engine.test.mjs','/games/abracada-what/%2e%2e/server/rooms.mjs'])assert.equal((await fetch(app.url+path)).status,404,path);
 const head=await fetch(app.url+'/style.css',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
 assert.equal((await fetch(app.url+'/games.json',{method:'POST'})).status,405);
});

test('real HTTP friend room, private views, lightweight sync and restart persistence work in the new layout',async t=>{
 const dataDir=await mkdtemp(join(tmpdir(),'open-tabletop-room-'));let app=await start(dataDir);
 t.after(async()=>{await app.close();await rm(dataDir,{recursive:true,force:true});});
 const {response:created,data:host}=await call(app,'/api/poker/rooms',{body:{name:'房主',_sync:syncCursor(null)}});assert.equal(created.status,201);
 const path='/api/poker/rooms/'+host.room.code;
 const {data:guest}=await call(app,path+'/join',{body:{name:'朋友',seatKey:randomBytes(24).toString('hex'),_sync:syncCursor(null)}});
 await call(app,path+'/ready',{token:guest.token,body:{ready:true,_sync:syncCursor(guest)}});
 const {data:started}=await call(app,path+'/start',{token:host.token,body:{_sync:syncCursor(host)}});assert.ok(mergeRoomSnapshot(host,started).data.game);
 const {data:light}=await call(app,path,{token:host.token,cursor:syncCursor(started)});assert.equal(light.sync.unchanged,true);assert.equal(Object.hasOwn(light,'game'),false);
 const {data:friend}=await call(app,path,{token:guest.token,cursor:syncCursor(null)});assert.equal(friend.game.players[0].name,'朋友');assert.ok(friend.game.players.slice(1).every(player=>player.hole.every(card=>card===null)));
 const {response:denied}=await call(app,path);assert.equal(denied.status,403);
 const {response:wrongOrigin}=await call(app,path,{token:host.token,origin:'https://unrelated.example'});assert.equal(wrongOrigin.status,403);
 const persisted=JSON.parse(await readFile(join(dataDir,'poker-rooms.json'),'utf8'));assert.equal(persisted.length,1);
 await app.close();app=await start(dataDir);
 const {data:restored}=await call(app,path,{token:host.token,cursor:syncCursor(null)});assert.equal(restored.room.code,host.room.code);assert.deepEqual(restored.game.players[0].hole,started.game.players[0].hole);
});

test('real HTTP magic room fills AI seats, keeps private views, and survives restart',async t=>{
 const dataDir=await mkdtemp(join(tmpdir(),'open-tabletop-magic-room-'));let app=await start(dataDir);
 t.after(async()=>{await app.close();await rm(dataDir,{recursive:true,force:true});});
 const {response:created,data:host}=await call(app,'/api/abracada/rooms',{body:{name:'Host',mode:'score',playerCount:4}});assert.equal(created.status,201);assert.equal(host.room.roster[0].towerSeat,0);
 const path='/api/abracada/rooms/'+host.room.code;
 const {data:guest}=await call(app,path+'/join',{body:{name:'Guest',seatKey:randomBytes(24).toString('hex')}});assert.equal(guest.room.roster.find(member=>member.id===guest.room.selfId).towerSeat,1);
 const {data:changed}=await call(app,path+'/seat',{token:guest.token,body:{seat:2}});assert.equal(changed.room.roster.find(member=>member.id===changed.room.selfId).towerSeat,2);
 const {response:occupied}=await call(app,path+'/seat',{token:host.token,body:{seat:2}});assert.equal(occupied.status,409);
 await call(app,path+'/ready',{token:guest.token,body:{ready:true}});
 const {data:started}=await call(app,path+'/start',{token:host.token,body:{}});assert.equal(started.room.aiCount,2);assert.ok(started.game.players[0].rack.every(stone=>stone===null));
 const {data:friend}=await call(app,path,{token:guest.token});assert.equal(friend.game.players[0].name,'Guest');assert.equal(friend.game.players[0].characterKey,'tower-seat-3');assert.ok(friend.game.players[0].rack.every(stone=>stone===null));assert.ok(friend.game.players.slice(1).every(player=>player.rack.every(Number.isInteger)));
 const serialized=JSON.stringify(friend);for(const key of ['engine','tokenHash','rng','seed','drawPile','secretPool'])assert.ok(!serialized.includes('"'+key+'":'),key);
 const {response:denied}=await call(app,path);assert.equal(denied.status,403);
 const persisted=JSON.parse(await readFile(join(dataDir,'abracada-rooms.json'),'utf8'));assert.equal(persisted.length,1);
 await app.close();app=await start(dataDir);
 const {data:restored}=await call(app,path,{token:host.token});assert.equal(restored.room.code,host.room.code);assert.deepEqual(restored.game.players[0].rack,started.game.players[0].rack);
});

test('explicit public origin supports HTTPS reverse proxies and rejects unrelated origins',async t=>{
 const dataDir=await mkdtemp(join(tmpdir(),'open-tabletop-origin-')),app=await start(dataDir,{publicOrigin:'https://tabletop.example'});
 t.after(async()=>{await app.close();await rm(dataDir,{recursive:true,force:true});});
 const {response}=await call(app,'/api/poker/health',{origin:'https://tabletop.example'});assert.equal(response.status,200);
 const {response:bad}=await call(app,'/api/poker/health',{origin:'https://other.example'});assert.equal(bad.status,403);
 await assert.rejects(createTabletopServer({dataDir,publicOrigin:'https://example.com/nested'}),/origin/);
});

test('Cloudflare adapter delegates API calls to the D1-backed game and static requests to assets',async()=>{
 let queries=0,assets=0;
 const env={DB:{prepare(){queries++;return {async first(){return null;}};}},ASSETS:{async fetch(){assets++;return new Response('static-page');}}};
 const api=await worker.fetch(new Request('https://example.com/api/poker/health'),env);assert.equal(api.status,200);assert.equal((await api.json()).ok,true);assert.equal(queries,1);
 const magic=await worker.fetch(new Request('https://example.com/api/abracada/health'),env);assert.equal(magic.status,200);assert.equal((await magic.json()).ok,true);assert.equal(queries,2);
 const page=await worker.fetch(new Request('https://example.com/'),env);assert.equal(await page.text(),'static-page');assert.equal(assets,1);
});
