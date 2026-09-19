import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {MemoryRoomStore} from '../../texas-holdem/server/rooms.mjs';
import {BuckshotRooms,TURN_MS,COMPENSATION_MS,ROOM_TTL} from '../server/rooms.mjs';

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

test('host can create a challenge room and both seats receive the selected mode',async()=>{
  const store=new MemoryRoomStore(),service=new BuckshotRooms(store),hostKey=key();
  const host=await service.create({name:'Host',seatKey:hostKey,mode:'challenge'});
  const guest=await service.request(host.room.code,'','join',{name:'Guest',seatKey:key()});
  assert.equal(host.room.mode,'challenge');assert.equal(guest.room.mode,'challenge');
  const f={store,service,players:[host,guest],code:host.room.code};
  const started=await start(f);
  assert.equal(started.game.mode,'challenge');
  assert.ok(started.game.maxHp>=6&&started.game.maxHp<=10);
  assert.ok(started.game.ammoCount>=2&&started.game.ammoCount<=4);
  await assert.rejects(service.create({name:'Bad',seatKey:key(),mode:'night'}),/模式无效/);
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

test('compensation is server-authoritative, survives polling, and only the weak seat may choose',async()=>{
  const f=await setup();await start(f);
  const stored=f.store.rows.get(f.code);
  stored.room.game.hp={player:2,ai:5};stored.room.game.turn='ai';stored.room.game.ammo=[];
  stored.room.game.pendingReload={beforeLighting:stored.room.game.lighting,pendingTurn:'ai'};
  stored.room.deadline=f.now()+TURN_MS;
  const opened=await f.service.request(f.code,f.players[0].token,'state');
  assert.equal(opened.game.phase,'compensation');assert.equal(opened.game.compensation.chooser,'player');
  assert.equal(opened.room.deadline,f.now()+COMPENSATION_MS);
  const other=await f.service.request(f.code,f.players[1].token,'state');
  assert.deepEqual(other.game.compensation.offers,opened.game.compensation.offers);
  await assert.rejects(request(f,1,'action',{action:{type:'compensation',slot:0}}),/弱势方/);
  const chosen=await request(f,0,'action',{action:{type:'compensation',slot:0}});
  assert.equal(chosen.game.phase,'playing');assert.equal(chosen.game.round,2);
});

test('compensation timeout never auto-selects the rare power strip',async()=>{
  const f=await setup();await start(f);
  const stored=f.store.rows.get(f.code);
  stored.room.game.hp={player:2,ai:5};stored.room.game.turn='ai';stored.room.game.ammo=[];
  stored.room.game.pendingReload={beforeLighting:stored.room.game.lighting,pendingTurn:'ai'};
  await f.service.request(f.code,f.players[0].token,'state');
  const opened=f.store.rows.get(f.code);
  opened.room.game.compensation.offers=['powerStrip','reverseCoin'];
  opened.room.game.compensation.rare=true;opened.room.game.compensation.timeoutChoice='reverseCoin';
  opened.room.deadline=f.now()+COMPENSATION_MS;
  f.advance(COMPENSATION_MS+1);
  const after=await f.service.request(f.code,f.players[0].token,'state');
  assert.equal(after.game.randomDeath,false);assert.equal(after.game.phase,'playing');
  assert.equal(after.game.lastEvent.item,'reverseCoin');
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

for(const seat of [0,1])for(const item of ['magnifier','burnerPhone']){
  test(`seat ${seat} keeps a stolen ${item} result private, including reconnects`,async()=>{
    const f=await setup();await start(f);
    const row=await f.store.get(f.code,f.now()),actor=seat===0?'player':'ai',other=seat===0?'ai':'player';
    row.room.game.turn=actor;
    row.room.game.items[actor]=['adrenaline'];
    row.room.game.items[other]=[item,item];
    row.room.game.ammo=[{id:100,live:true},{id:101,live:false},{id:102,live:true}];
    row.room.game.notes={player:{},ai:{}};
    await f.store.cas(f.code,row.revision,row.room,row.expiresAt);
    await request(f,seat,'action',{action:{type:'use',item:'adrenaline',slot:0}});
    const own=await request(f,seat,'action',{action:{type:'steal',item,slot:1}});
    assert.equal(own.game.lastEvent.stealSlot,1);
    assert.equal(own.game.lastEvent.stolen,item);
    assert.equal(own.game.records.player.length,1);
    assert.equal(typeof own.game.lastEvent[item==='magnifier'?'revealed':'live'],'boolean');
    if(item==='burnerPhone')assert.ok(own.game.lastEvent.position>=2);
    for(let poll=0;poll<2;poll++){
      const otherView=await f.service.request(f.code,f.players[1-seat].token,'state');
      for(const field of ['revealed','position','live'])assert.equal(field in otherView.game.lastEvent,false,field);
      for(const event of otherView.game.events||[]){
        if(event.stolen!==item&&event.item!==item)continue;
        for(const field of ['revealed','position','live'])assert.equal(field in event,false,field);
      }
      assert.deepEqual(otherView.game.records.ai,[]);
      assert.equal(otherView.game.known.ai,null);
    }
  });
}

test('state polls keep a heartbeat without rewriting the room',async()=>{
  const f=await setup();
  const s=await start(f);
  const before=(await f.store.get(f.code,f.now())).revision;
  await f.service.request(f.code,f.players[0].token,'state');
  f.advance(15000);
  const after=await f.service.request(f.code,f.players[0].token,'state');
  assert.equal(after.room.version,s.room.version);
  assert.equal((await f.store.get(f.code,f.now())).revision,before);
  assert.equal(after.room.members[0].connected,true);
});

test('shared stores keep presence visible across separate worker instances',async()=>{
  const f=await setup();
  f.store.persistHeartbeats=true;
  const {BuckshotRooms:OtherWorker}=await import('../server/rooms.mjs?presence-worker');
  const other=new OtherWorker(f.store,f.now);
  f.advance(25000);
  const before=(await f.store.get(f.code,f.now())).revision;
  await f.service.request(f.code,f.players[0].token,'state');
  const guest=await other.request(f.code,f.players[1].token,'state');
  assert.equal(guest.room.members[0].connected,true);
  const host=await f.service.request(f.code,f.players[0].token,'state');
  assert.equal(host.room.members[1].connected,true);
  assert.equal(host.room.version,guest.room.version);
  const refreshed=(await f.store.get(f.code,f.now())).revision;
  assert.equal(refreshed,before+2);
  f.advance(1000);
  await f.service.request(f.code,f.players[0].token,'state');
  assert.equal((await f.store.get(f.code,f.now())).revision,refreshed);
});

test('a late poll still receives every action in order',async()=>{
  const f=await setup();await start(f);
  const row=await f.store.get(f.code,f.now());
  const actor=row.room.game.turn,seat=actor==='player'?0:1;
  row.room.game.items[actor]=['cigarette','beer'];
  row.room.game.hp[actor]=1;
  row.room.game.ammo=[{id:1,live:false},{id:2,live:true}];
  await f.store.cas(f.code,row.revision,row.room,row.expiresAt);
  await request(f,seat,'action',{action:{type:'use',item:'cigarette',slot:0}});
  await request(f,seat,'action',{action:{type:'use',item:'beer',slot:0}});
  const late=await f.service.request(f.code,f.players[1-seat].token,'state');
  const kinds=(late.game.events||[]).filter(event=>event.kind==='item').map(event=>event.item);
  assert.deepEqual(kinds.slice(-2),['cigarette','beer']);
  assert.equal(late.game.lastEvent.item,'beer');
});
