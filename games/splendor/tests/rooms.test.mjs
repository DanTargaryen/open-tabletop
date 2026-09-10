import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {MemoryRoomStore} from '../../texas-holdem/server/rooms.mjs';
import {SplendorRooms,TURN_MS,BOT_MS,ROOM_TTL} from '../server/rooms.mjs';
import {legalActions} from '../web/engine.js';
const key=()=>randomBytes(24).toString('hex');
const id=()=>randomUUID();
async function setup(n=2){let now=100000;const store=new MemoryRoomStore(),service=new SplendorRooms(store,()=>now),players=[];const host=await service.create({name:'Host',capacity:n,seatKey:key()});players.push(host);for(let i=1;i<n;i++)players.push(await service.request(host.room.code,'','join',{name:'Guest '+i,seatKey:key()}));return {store,service,players,code:host.room.code,advance:n=>now+=n,now:()=>now};}
async function request(f,seat,op,input={}){const state=await f.service.request(f.code,f.players[seat].token,'state');return f.service.request(f.code,f.players[seat].token,op,{version:state.room.version,requestId:id(),...input});}
async function start(f){for(let i=1;i<f.players.length;i++)await request(f,i,'ready',{ready:true});return request(f,0,'start');}

test('create and join retries recover the same seat and never expose token hashes',async()=>{const store=new MemoryRoomStore(),service=new SplendorRooms(store),seatKey=key(),a=await service.create({name:'A',capacity:4,seatKey}),b=await service.create({name:'A',capacity:4,seatKey});assert.equal(a.room.code,b.room.code);assert.equal(store.rows.size,1);const guestKey=key(),g=await service.request(a.room.code,'','join',{name:'B',seatKey:guestKey}),again=await service.request(a.room.code,'','join',{name:'B',seatKey:guestKey});assert.equal(g.room.selfId,again.room.selfId);assert.equal(again.room.members.length,2);assert.doesNotMatch(JSON.stringify(again),/tokenHash|processed|decks/);});
test('capacity, identity and nickname validation reject invalid inputs',async()=>{const f=await setup();await assert.rejects(f.service.create({name:'x',capacity:6,seatKey:key()}),/2–4/);await assert.rejects(f.service.request(f.code,key(),'state'),/恢复/);await assert.rejects(f.service.request(f.code,'','join',{name:'third',seatKey:key()}),/已满/);await assert.rejects(f.service.create({name:'<script>',capacity:2,seatKey:key()}));});
test('only host can start, all humans must be ready, and start locks new joins',async()=>{const f=await setup();await assert.rejects(request(f,1,'start'),/房主/);await assert.rejects(request(f,0,'start'),/准备/);const s=await start(f);assert.equal(s.room.status,'playing');assert.equal(s.game.players.length,2);await assert.rejects(f.service.request(f.code,'','join',{name:'Late',seatKey:key()}),/已开始/);});
test('partially filled multi-human rooms still require explicit AI fill',async()=>{
 const f=await setup(4),h=f.players[0];
 for(const seat of [3,2])await request(f,seat,'leave');
 await request(f,1,'ready',{ready:true});
 await assert.rejects(request(f,0,'start'),/空位/);
 const out=await request(f,0,'start',{fillAI:true});assert.equal(out.game.players.length,4);assert.equal(out.room.members.length,2);
});
test('duplicate action IDs apply only once, stale and out-of-turn actions fail',async()=>{const f=await setup(),s=await start(f),seat=s.game.current,token=f.players[seat].token;const player=await f.service.request(f.code,token,'state'),body={version:player.room.version,requestId:id(),action:{type:'reserve',tier:1}};const first=await f.service.request(f.code,token,'action',body),second=await f.service.request(f.code,token,'action',body);assert.equal(first.game.version,second.game.version);assert.equal(second.game.players[seat].reserved.length,1);await assert.rejects(f.service.request(f.code,token,'action',{...body,requestId:id()}),/更新/);await assert.rejects(f.service.request(f.code,token,'action',{...body,version:second.room.version,requestId:id()}),/轮到/);});
test('racing actions with one version accept exactly one update',async()=>{const f=await setup(),s=await start(f),seat=s.game.current,token=f.players[seat].token;const out=await Promise.allSettled([1,2].map(()=>f.service.request(f.code,token,'action',{version:s.room.version,requestId:id(),action:{type:'reserve',tier:1}})));assert.equal(out.filter(x=>x.status==='fulfilled').length,1);assert.equal((await f.service.request(f.code,token,'state')).game.version,1);});
test('private reservation cannot be purchased by the other player or read via projections',async()=>{const f=await setup(),s=await start(f),seat=s.game.current;const reserved=await request(f,seat,'action',{action:{type:'reserve',tier:1}}),card=reserved.game.players[seat].reserved[0];const other=await f.service.request(f.code,f.players[1-seat].token,'state');assert.equal(other.game.players[seat].reserved[0].id,undefined);assert.equal(other.game.players[seat].reserved[0].name,undefined);assert.equal(other.game.decks,undefined);await assert.rejects(request(f,1-seat,'action',{action:{type:'buy',cardId:card.id}}));});
test('timeout advances one legal decision on an authenticated request and persists against stale race',async()=>{const f=await setup(),s=await start(f);f.advance(TURN_MS+1);await assert.rejects(f.service.request(f.code,f.players[s.game.current].token,'action',{version:s.room.version,requestId:id(),action:{type:'reserve',tier:1}}),/更新/);const after=await f.service.request(f.code,f.players[0].token,'state');assert.equal(after.game.version,1);assert.ok(after.game.log.some(e=>e.text.includes('超时')));});
test('unauthenticated polling cannot advance an overdue game',async()=>{const f=await setup(),s=await start(f);f.advance(TURN_MS+1);await assert.rejects(f.service.request(f.code,key(),'state'));assert.equal((await f.store.get(f.code,f.now())).room.game.version,s.game.version);});
test('leave transfers host, revokes identity, and AI takes over a departed seat',async()=>{const f=await setup(),s=await start(f);await request(f,0,'leave');const guest=await f.service.request(f.code,f.players[1].token,'state');assert.equal(guest.room.isOwner,true);await assert.rejects(f.service.request(f.code,f.players[0].token,'state'));const row=await f.store.get(f.code,f.now());row.room.game.current=0;row.room.deadline=f.now()+BOT_MS;await f.store.cas(f.code,row.revision,row.room,row.expiresAt);f.advance(BOT_MS+1);const after=await f.service.request(f.code,f.players[1].token,'state');assert.equal(after.game.version,s.game.version+1);});
test('room TTL expires without activity; rematch requires host and a finished game',async()=>{const f=await setup();await assert.rejects(request(f,0,'rematch'));f.advance(ROOM_TTL+1);await assert.rejects(f.service.request(f.code,f.players[0].token,'state'),/过期/);});
test('finished rematch clears game and asks guests to prepare again',async()=>{const f=await setup();await start(f);const row=await f.store.get(f.code,f.now());row.room.status='finished';row.room.game.phase='complete';await f.store.cas(f.code,row.revision,row.room,row.expiresAt);await assert.rejects(request(f,1,'rematch'),/房主/);const out=await request(f,0,'rematch');assert.equal(out.game,null);assert.equal(out.room.status,'waiting');assert.equal(out.room.members[1].ready,false);});
test('lost leave response can be retried with the revoked seat token and same request id',async()=>{const f=await setup(),s=await f.service.request(f.code,f.players[0].token,'state');const body={version:s.room.version,requestId:id()};assert.deepEqual(await f.service.request(f.code,f.players[0].token,'leave',body),{left:true});assert.deepEqual(await f.service.request(f.code,f.players[0].token,'leave',body),{left:true});await assert.rejects(f.service.request(f.code,f.players[0].token,'state'));});


test('one trainer automatically fills 2/3/4 seats with AI, resumes and can rematch',async()=>{
 for(const capacity of [2,3,4])for(const fill of [{},{fillAI:false}]){
  let now=100000;const store=new MemoryRoomStore(),service=new SplendorRooms(store,()=>now);
  const h=await service.create({name:'Solo',capacity,seatKey:key()}),code=h.room.code;
  let s=await service.request(code,h.token,'start',{version:0,requestId:id(),...fill});
  assert.equal(s.room.members.length,1);assert.equal(s.game.players.length,capacity);assert.equal(s.game.players[0].name,'Solo');assert.ok(s.game.players.slice(1).every(p=>p.name.endsWith(' · AI')));
  await assert.rejects(service.request(code,'','join',{name:'Late',seatKey:key()}),/已开始/);
  if(s.game.current===0)s=await service.request(code,h.token,'action',{version:s.room.version,requestId:id(),action:legalActions(s.game).find(a=>a.type==='take')});
  const before=s.game.version;let steps=0;
  while(s.game.current!==0&&steps++<20){now=s.room.deadline+1;s=await service.request(code,h.token,'state');}
  assert.equal(s.game.current,0);assert.ok(s.game.version>before);assert.equal(s.room.deadline-now,TURN_MS);
  const restored=await new SplendorRooms(store,()=>now).request(code,h.token,'state');assert.equal(restored.game.version,s.game.version);
  const row=await store.get(code,now);row.room.status='finished';row.room.game.phase='complete';await store.cas(code,row.revision,row.room,row.expiresAt);
  s=await service.request(code,h.token,'rematch',{version:row.room.version,requestId:id()});
  s=await service.request(code,h.token,'start',{version:s.room.version,requestId:id()});assert.equal(s.room.members.length,1);assert.equal(s.game.players.length,capacity);
 }
});

test('a lone trainer must still be ready before starting',async()=>{
 const service=new SplendorRooms(new MemoryRoomStore()),h=await service.create({name:'Solo',capacity:2,seatKey:key()});
 const s=await service.request(h.room.code,h.token,'ready',{version:0,requestId:id(),ready:false});
 await assert.rejects(service.request(h.room.code,h.token,'start',{version:s.room.version,requestId:id()}),/准备/);
});
