import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import {D1SplendorRoomStore,limitSplendorRequests} from '../server/d1-store.mjs';
import {SplendorRooms} from '../server/rooms.mjs';
import worker from '../../../deploy/cloudflare/worker.mjs';
const key=()=>randomBytes(24).toString('hex');
function database(t) {
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  for(const file of ['0001_rooms.sql','0002_splendor.sql'])sql.exec(readFileSync(new URL('../../../deploy/cloudflare/migrations/'+file,import.meta.url),'utf8'));
  const db={prepare(query){const statement=sql.prepare(query);let params=[];return {bind(...values){params=values;return this;},async first(){return statement.get(...params)||null;},async run(){return {meta:{changes:statement.run(...params).changes}};}};},async batch(statements){return Promise.all(statements.map(s=>s.run()));}};
  return {sql,db};
}
async function request(db,path,{token,body,origin='https://tabletop.example'}={}) {
  return worker.fetch(new Request('https://tabletop.example/api/splendor'+path,{method:body?'POST':'GET',headers:{Origin:origin,'cf-connecting-ip':'192.0.2.10',...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})}),{DB:db});
}

test('D1 CAS is atomic and Pokemon storage and expiry never touch poker rows',async t=>{
 const {sql,db}=database(t),store=new D1SplendorRoomStore(db);
 sql.prepare('INSERT INTO poker_rooms VALUES(?,?,?,?)').run('ABC234',0,'{"poker":true}',1);
 assert.equal(await store.create('ABC234',{pokemon:true},1000),true);
 assert.equal((await new D1SplendorRoomStore(db).get('ABC234',1)).room.pokemon,true);
 const races=await Promise.all([1,2].map(n=>store.cas('ABC234',0,{winner:n},1000)));
 assert.equal(races.filter(Boolean).length,1);
 assert.equal(await store.get('ABC234',1000),null);
 await limitSplendorRequests(db,new Request('https://tabletop.example'),2000);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM splendor_rooms').get().n,0);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM poker_rooms').get().n,1);
});

test('concurrent create retries with the same identity converge to one D1 room',async t=>{
 const {sql,db}=database(t),input={name:'Host',capacity:2,seatKey:key()};
 const output=await Promise.all(Array.from({length:4},()=>new SplendorRooms(new D1SplendorRoomStore(db)).create(input)));
 assert.equal(new Set(output.map(r=>r.room.code)).size,1);
 assert.equal(new Set(output.map(r=>r.room.selfId)).size,1);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM splendor_rooms').get().n,1);
});

test('Worker D1 rooms survive request contexts, isolate private cards and deduplicate moves',async t=>{
 const {db}=database(t);
 assert.equal((await request(db,'/health')).status,200);
 const created=await request(db,'/rooms',{body:{name:'Host',capacity:2,seatKey:key()}});assert.equal(created.status,201);const host=await created.json(),path='/rooms/'+host.room.code;
 const guest=await (await request(db,path+'/join',{body:{name:'Guest',seatKey:key()}})).json();
 const ready=await (await request(db,path+'/ready',{token:guest.token,body:{version:guest.room.version,requestId:randomUUID(),ready:true}})).json();
 const started=await (await request(db,path+'/start',{token:host.token,body:{version:ready.room.version,requestId:randomUUID()}})).json();
 const seat=started.game.current,actor=[host,guest][seat],other=[host,guest][1-seat];
 const body={version:started.room.version,requestId:randomUUID(),action:{type:'reserve',tier:1}};
 const results=await Promise.all([1,2].map(()=>request(db,path+'/action',{token:actor.token,body})));
 for(const r of results){assert.equal(r.status,200);assert.equal((await r.json()).game.players[seat].reserved.length,1);}
 const recoveredResponse=await request(db,path,{token:other.token}),recovered=await recoveredResponse.json();
 assert.equal(recovered.game.version,1);assert.equal(recovered.game.players[seat].reserved[0].hidden,true);assert.equal(recovered.game.decks,undefined);
 assert.doesNotMatch(JSON.stringify(recovered),/tokenHash|processed/);assert.match(recoveredResponse.headers.get('Cache-Control'),/private, no-store/);
 assert.equal((await request(db,path)).status,403);
 assert.equal((await request(db,path,{token:other.token,origin:'https://unrelated.example'})).status,403);
});

test('Worker health fails closed without migrated storage and create/join share a D1 rate limit',async t=>{
 const {sql,db}=database(t),requestForLimit=new Request('https://tabletop.example',{headers:{'cf-connecting-ip':'192.0.2.20'}});
 for(let i=0;i<40;i++)await limitSplendorRequests(db,requestForLimit,100000);
 await assert.rejects(limitSplendorRequests(db,requestForLimit,100000),e=>e.status===429);
 const stored=sql.prepare('SELECT key FROM splendor_limits').get().key;assert.match(stored,/^[a-f0-9]{64}$/);assert.ok(!stored.includes('192.0.2.20'));
 sql.exec('DROP TABLE splendor_rooms');
 assert.equal((await request(db,'/health')).status,503);
 assert.equal((await worker.fetch(new Request('https://tabletop.example/api/splendor/health'),{})).status,503);
});
