import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createTabletopServer} from '../../../server/index.mjs';
import {handleInkWar} from '../server/api.mjs';
import {MemoryInkWarRoomStore} from '../server/rooms.mjs';

test('real HTTP guards identities and bodies, isolates persistence, and restores ongoing rooms',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'ink-war-http-'));let app,base;
  async function start(){app=await createTabletopServer({dataDir:dir});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${app.server.address().port}`;}
  await start();t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
  const post=(path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  const path='/api/ink-war/rooms',created=await post(path,{name:'房主',playerCount:7,aiCount:6});
  assert.equal(created.status,201);const host=await created.json(),route=path+'/'+host.room.code,headers={Authorization:`Bearer ${host.token}`};
  assert.equal((await fetch(base+route)).status,403);
  assert.equal((await post(route+'/ready',{ready:true,cardId:host.room.cardOptions[0].id},headers)).status,200);
  const started=await post(route+'/start',{},headers);assert.equal(started.status,200);const initial=await started.json();assert.equal(initial.room.status,'playing');assert.equal(initial.game.units.length,0);assert.ok(initial.game.players.every(player=>player.alive));
  // Move the stored authoritative clock back rather than sleeping in the test;
  // the next HTTP poll must perform ordinary city production before any order.
  const row=await app.stores.inkWar.get(host.room.code,Date.now());row.room.simulatedAt-=2000;
  await app.stores.inkWar.cas(host.room.code,row.revision,row.room,row.expiresAt);
  const produced=await fetch(base+route,{headers}),deployed=await produced.json(),soldier=deployed.game.units.find(unit=>unit.owner===0);
  assert.equal(produced.status,200);assert.ok(soldier,'the first marching order needs a naturally recruited soldier');
  const target={x:deployed.game.width-30,y:deployed.game.height-30};
  const march=await post(route+'/action',{requestId:'first_recruited_march',unitIds:[soldier.id],target},headers);assert.equal(march.status,200);assert.deepEqual((await march.json()).game.units.find(unit=>unit.id===soldier.id).target,target);
  assert.equal((await post(path,{name:'跨站'},{Origin:'https://other.example'})).status,403);
  assert.equal((await post(path,{name:'跨站'},{'Sec-Fetch-Site':'cross-site'})).status,403);
  assert.equal((await post(path,[])).status,400);
  assert.equal((await post(path,{name:'<script>'})).status,400);
  assert.equal((await post(path,{name:'x',padding:'x'.repeat(9000)})).status,413);
  assert.equal((await fetch(base+path,{method:'POST',body:'{}'})).status,415);
  assert.equal((await fetch(base+route+'/start',{headers})).status,405);
  assert.equal((await post(route+'/action',{requestId:'invalid_coords_1',unitIds:[1],target:{x:null,y:0}},headers)).status,400);
  for(const hidden of ['/games/ink-war/server/rooms.mjs','/.data/ink-war-rooms.json','/games/ink-war/%2f..%2fserver%2frooms.mjs'])assert.equal((await fetch(base+hidden)).status,404);
  const persisted=await readFile(join(dir,'ink-war-rooms.json'),'utf8');assert.ok(!persisted.includes(host.token));assert.equal(JSON.parse(persisted).length,1);
  assert.equal(app.stores.poker.rows.size,0);assert.equal(app.stores.monopoly.rows.size,0);
  await app.close();await start();
  const restored=await fetch(base+route,{headers});assert.equal(restored.status,200);const snapshot=await restored.json();assert.equal(snapshot.game.players[0].name,'房主');assert.equal(snapshot.game.players.length,7);assert.equal(snapshot.room.aiCount,6);assert.equal(snapshot.room.status,'playing');
  assert.equal(snapshot.game.seed,initial.game.seed);assert.equal(snapshot.game.width,initial.game.width);assert.equal(snapshot.game.height,initial.game.height);
  assert.deepEqual(snapshot.game.cities.map(({id,x,y})=>({id,x,y})),initial.game.cities.map(({id,x,y})=>({id,x,y})),'server restart must preserve the generated map');
  assert.equal((await fetch(base+'/api/ink-war/health')).status,200);
  const font=await fetch(base+'/games/ink-war/assets/ink-brush.woff2');assert.equal(font.status,200);assert.equal(font.headers.get('content-type'),'font/woff2');
  for(const asset of ['index.html','online.html','engine.js','renderer.js','ui.js','style.css','assets/brush.svg'])assert.equal((await fetch(base+'/games/ink-war/'+asset)).status,200,asset);
});

test('create/join rate limiter runs and authenticated snapshots enforce a bounded burst',async()=>{
  const store=new MemoryInkWarRoomStore();let limited=0;
  const request=()=>new Request('http://localhost/api/ink-war/rooms',{method:'POST',headers:{'Content-Type':'application/json','cf-connecting-ip':'rate-limit-test'},body:JSON.stringify({name:'限速测试'})});
  const created=await handleInkWar(request(),null,{store,limit:()=>{limited++;}});assert.equal(created.status,201);assert.equal(limited,1);
  const host=await created.json();
  const read=()=>new Request(`http://localhost/api/ink-war/rooms/${host.room.code}`,{headers:{Authorization:`Bearer ${host.token}`,'cf-connecting-ip':'rate-limit-test'}});
  let rateLimited=false;
  for(let index=0;index<121;index++){const response=await handleInkWar(read(),null,{store});if(response.status===429){rateLimited=true;break;}}
  assert.ok(rateLimited,'authenticated polling bursts must be limited');
});
