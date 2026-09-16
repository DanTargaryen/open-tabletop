import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createTabletopServer} from '../../../server/index.mjs';
test('real Node HTTP validates requests, isolates storage, and preserves rooms across restart',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'aeroplane-http-'));let app,base;
  async function start(){app=await createTabletopServer({dataDir:dir});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}`;}
  await start();t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
  const post=(path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  const path='/api/aeroplane/rooms';
  const created=await post(path,{name:'Pilot',playerCount:4});assert.equal(created.status,201);const host=await created.json();
  const route=path+'/'+host.room.code,headers={Authorization:`Bearer ${host.token}`};
  const started=await post(route+'/start',{},headers);assert.equal(started.status,200);
  assert.equal((await fetch(base+route)).status,403);
  assert.equal((await post(route+'/action',{type:'move',piece:9,version:3,requestId:'invalid_plane_id'},headers)).status,409);
  assert.equal((await post(path,{name:'Cross'},{Origin:'https://other.example'})).status,403);
  assert.equal((await post(path,[])).status,400);
  assert.equal((await post(path,{name:'<script>'})).status,400);
  assert.equal((await post(path,{name:'x',text:'x'.repeat(9000)})).status,413);
  assert.equal((await fetch(base+path,{method:'POST',body:'{}'})).status,415);
  for(const file of ['index.html','online.html','ui.js','engine.js','board.js','audio.js','style.css'])assert.equal((await fetch(base+'/games/aeroplane-chess/'+file)).status,200);
  for(const file of ['/games/aeroplane-chess/server/rooms.mjs','/.data/aeroplane-rooms.json','/games/aeroplane-chess/%2f..%2fserver%2frooms.mjs'])assert.equal((await fetch(base+file)).status,404);
  const stored=JSON.parse(await readFile(join(dir,'aeroplane-rooms.json'),'utf8'));assert.equal(stored.length,1);
  assert.ok(!JSON.stringify(stored).includes(host.token));
  await app.close();await start();const restored=await fetch(base+route,{headers});assert.equal(restored.status,200);assert.equal((await restored.json()).game.players[0].name,'Pilot');
});
