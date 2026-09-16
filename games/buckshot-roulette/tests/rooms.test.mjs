import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {MemoryRoomStore} from '../../texas-holdem/server/rooms.mjs';
import {BuckshotRooms,TURN_MS,ROOM_TTL} from '../server/rooms.mjs';

const key=()=>randomBytes(24).toString('hex');
const id=()=>randomUUID();
async function setup(){
  let now=100000;
  const store=new MemoryRoomStore(),service=new BuckshotRooms(store,()=>now),players=[];
  const host=await service.create({name:'Host',seatKey:key()});
  players.push(host);
  players.push(await service.request(host.room.code,'','join',{name:'Guest',seatKey:key()}));
  return {store,service,players,code:host.room.code,advance:n=>now+=n,now:()=>now};
}
async function request(f,seat,op,input={}){
  const state=await f.service.request(f.code,f.players[seat].token,'state');
  return f.service.request(f.code,f.players[seat].token,op,{version:state.room.version,requestId:id(),...input});
}
async function start(f){
  await request(f,1,'ready',{ready:true});
  return request(f,0,'start');
}

test('create retries recover the same seat and never expose token hashes',async()=>{
  const store=new MemoryRoomStore(),service=new BuckshotRooms(store),seatKey=key();
  const a=await service.create({name:'A',seatKey}),b=await service.create({name:'A',seatKey});
  assert.equal(a.room.code,b.room.code);assert.equal(store.rows.size,1);
  const guestKey=key(),g=await service.request(a.room.code,'','join',{name:'B',seatKey:guestKey});
  const again=await service.request(a.room.code,'','join',{name:'B',seatKey:guestKey});
  assert.equal(g.room.selfId,again.room.selfId);assert.equal(again.room.members.length,2);
  assert.doesNotMatch(JSON.stringify(again),/tokenHash|processed|"ammo":|"notes":|"rng":/);
});

test('friend rooms are two seats only and reject a third player',async()=>{
  const f=await setup();
  await assert.rejects(f.service.request(f.code,'','join',{name:'Late',seatKey:key()}),/已满/);
  await assert.rejects(f.service.create({name:'<script>',seatKey:key()}));
  await assert.rejects(f.service.request(f.code,key(),'state'),/恢复/);
});

test('host cannot start until both humans are seated and ready',async()=>{
  const store=new MemoryRoomStore(),service=new BuckshotRooms(store);
  const host=await service.create({name:'Host',seatKey:key()});
  await assert.rejects(service.request(host.room.code,host.token,'start',{version:0,requestId:id()}),/两位/);
  const f=await setup();
  await assert.rejects(request(f,1,'start'),/房主/);
  await assert.rejects(request(f,0,'start'),/准备/);
  const s=await start(f);
  assert.equal(s.room.status,'playing');
  assert.equal(s.game.names.player,'Host');
  assert.ok(s.game.turn==='player'||s.game.turn==='ai');
  await assert.rejects(f.service.request(f.code,'','join',{name:'Late',seatKey:key()}),/已开始/);
});

test('each seat sees itself as the near side and cannot read the chamber order',async()=>{
  const f=await setup(),s=await start(f);
  const guest=await f.service.request(f.code,f.players[1].token,'state');
  assert.equal(s.game.names.player,'Host');assert.equal(s.game.names.ai,'Guest');
  assert.equal(guest.game.names.player,'Guest');assert.equal(guest.game.names.ai,'Host');
  assert.ok(s.game.turn==='player'||s.game.turn==='ai');
  assert.equal(guest.game.turn,s.game.turn==='player'?'ai':'player');
  assert.deepEqual(guest.game.records.ai,[]);assert.equal(guest.game.known.ai,null);
  const leaked=JSON.stringify(guest);
  for(const key of ['tokenHash','processed','rng','notes','"ammo":'])assert.ok(!leaked.includes(key),key);
});

test('duplicate action IDs apply only once and the other seat cannot shoot out of turn',async()=>{
  const f=await setup(),s=await start(f);
  const actor=s.game.turn==='player'?0:1,other=1-actor;
  await assert.rejects(f.service.request(f.code,f.players[other].token,'action',{version:s.room.version,requestId:id(),action:{type:'shoot',target:'opponent'}}),/轮到/);
  const body={version:s.room.version,requestId:id(),action:{type:'shoot',target:'opponent'}};
  const first=await f.service.request(f.code,f.players[actor].token,'action',body);
  const second=await f.service.request(f.code,f.players[actor].token,'action',body);
  assert.equal(first.room.version,second.room.version);
});

test('timeout forces a shot at the opponent and unauthenticated polls cannot advance',async()=>{
  const f=await setup(),s=await start(f);
  f.advance(TURN_MS+1);
  await assert.rejects(f.service.request(f.code,f.players[0].token,'action',{version:s.room.version,requestId:id(),action:{type:'shoot',target:'self'}}),/更新/);
  const after=await f.service.request(f.code,f.players[0].token,'state');
  assert.ok(after.game.lastEvent.kind==='timeout'||after.game.spent.length>=1);
  assert.ok(after.room.version>s.room.version);
  const stuck=await f.store.get(f.code,f.now());
  await assert.rejects(f.service.request(f.code,key(),'state'));
  assert.equal((await f.store.get(f.code,f.now())).room.version,stuck.room.version);
});

test('leave during a match awards the win to the remaining player',async()=>{
  const f=await setup();await start(f);
  await request(f,0,'leave');
  const guest=await f.service.request(f.code,f.players[1].token,'state');
  assert.equal(guest.room.isOwner,true);
  assert.equal(guest.game.over,true);
  assert.equal(guest.game.winner,'player');
  await assert.rejects(f.service.request(f.code,f.players[0].token,'state'));
});

test('finished rematch clears the table; TTL expires idle rooms',async()=>{
  const f=await setup();await start(f);
  const row=await f.store.get(f.code,f.now());
  row.room.status='finished';row.room.game.over=true;row.room.game.winner='player';
  await f.store.cas(f.code,row.revision,row.room,row.expiresAt);
  await assert.rejects(request(f,1,'rematch'),/房主/);
  const out=await request(f,0,'rematch');
  assert.equal(out.game,null);assert.equal(out.room.status,'waiting');assert.equal(out.room.members[1].ready,false);
  f.advance(ROOM_TTL+1);
  await assert.rejects(f.service.request(f.code,f.players[0].token,'state'),/过期/);
});

test('lost leave response can be retried with the same request id',async()=>{
  const f=await setup();
  const s=await f.service.request(f.code,f.players[0].token,'state');
  const body={version:s.room.version,requestId:id()};
  assert.deepEqual(await f.service.request(f.code,f.players[0].token,'leave',body),{left:true});
  assert.deepEqual(await f.service.request(f.code,f.players[0].token,'leave',body),{left:true});
  await assert.rejects(f.service.request(f.code,f.players[0].token,'state'));
});

test('opening turn is randomly either seat',async()=>{
  const seen=new Set();
  for(let i=0;i<40&&seen.size<2;i++){
    const f=await setup();
    seen.add((await start(f)).game.turn);
  }
  assert.equal(seen.has('player'),true);
  assert.equal(seen.has('ai'),true);
});
