import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTabletopServer} from '../../../server/index.mjs';
import {actorId,botAction} from '../web/engine.js';
test('catalog, public game assets, API persistence and private-route isolation',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'campus-http-'));let app,base;
 async function start(){app=await createTabletopServer({dataDir:dir});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port;}
 await start();t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
 const catalog=await (await fetch(base+'/games.json')).json();assert.ok(catalog.some(g=>g.id==='anime-campus'));
 for(const file of ['index.html','online.html','engine.js','animation.js','data.js','ui.js','style.css','assets/board.svg','assets/avatar.svg','sources.html'])assert.equal((await fetch(base+'/games/anime-campus/'+file)).status,200,file);
 for(const path of ['/games/anime-campus/server/rooms.mjs','/games/anime-campus/tests/engine.test.mjs','/.data/anime-campus-rooms.json','/games/anime-campus/%2e%2e/server/rooms.mjs'])assert.equal((await fetch(base+path)).status,404,path);
 let response=await fetch(base+'/api/anime-campus/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Browser',character:'violet',playerCount:4})});assert.equal(response.status,201);const host=await response.json();const path='/api/anime-campus/rooms/'+host.room.code,headers={Authorization:'Bearer '+host.token};
 assert.equal((await fetch(base+path)).status,403);
 assert.equal((await fetch(base+'/api/anime-campus/rooms',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://outside.example'},body:'{}'})).status,403);
 assert.equal((await fetch(base+'/api/anime-campus/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(9000)})).status,413);
 await fetch(base+path+'/start',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'});
 await app.close();await start();response=await fetch(base+path,{headers});assert.equal(response.status,200);const recovered=await response.json();assert.equal(recovered.room.roster[0].name,'Browser');assert.equal(recovered.game.players[0].character,'violet');
});
test('two authenticated HTTP players finish a whole game with equal public state after every action',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'campus-full-http-')),app=await createTabletopServer({dataDir:dir});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port+'/api/anime-campus';
 t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
 async function call(path,body,token){const res=await fetch(base+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});assert.equal(res.status===200||res.status===201,true,await res.clone().text());return res.json();}
 const host=await call('/rooms',{name:'One',character:'railgun',playerCount:2}),path='/rooms/'+host.room.code,peer=await call(path+'/join',{name:'Two',character:'april',seatKey:'e'.repeat(48)}),keys=[host.token,peer.token];await call(path+'/ready',{ready:true},peer.token);let snap=await call(path+'/start',{},host.token),n=0;
 while(snap.game.phase!=='finished'&&n++<800){const actor=actorId(snap.game),own=await call(path,undefined,keys[actor]),action=botAction(own.game,()=>.5);snap=await call(path+'/action',{...action,requestId:'complete-game-'+n,version:own.room.version},keys[actor]);const other=await call(path,undefined,keys[1-actor]);assert.deepEqual(snap.game.players,other.game.players);assert.equal(snap.game.phase,other.game.phase);assert.equal(snap.room.version,other.room.version);}
 assert.equal(snap.game.phase,'finished');assert.ok(n<800);
});
