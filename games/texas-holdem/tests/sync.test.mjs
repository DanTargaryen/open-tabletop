import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomService,MemoryRoomStore,projectRoom,TURN_MS} from '../server/rooms.mjs';
import {syncCursor,mergeRoomSnapshot,pollDelay} from '../web/room-sync.js';
import {handlePoker} from '../server/api.mjs';

const clone=x=>structuredClone(x);
test('v2 waiting-room clients start a hand directly without requesting a recovery snapshot',async()=>{
 const service=new RoomService(new MemoryRoomStore());
 const host=await service.create({name:'房主',_sync:syncCursor(null)}),code=host.room.code;
 const guest=await service.request(code,null,'join',{name:'朋友',seatKey:'b'.repeat(48),_sync:syncCursor(null)});
 await service.request(code,guest.token,'ready',{ready:true,_sync:syncCursor(guest)});
 const started=await service.request(code,host.token,'start',{_sync:syncCursor(host)});
 const merged=mergeRoomSnapshot(host,started);assert.ok(merged.data.game);assert.deepEqual(merged.data.run.history,[]);
});
async function setup(count=6,initialNow=100000){
 let now=initialNow;
 const store=new MemoryRoomStore(),service=new RoomService(store,()=>now);
 const host=await service.create({name:'房主'}),code=host.room.code,people=[host];
 for(let i=1;i<count;i++)people.push(await service.request(code,null,'join',{name:'朋友'+i,seatKey:String(i).repeat(48)}));
 for(const p of people)await service.request(code,p.token,'ready',{ready:true});
 await service.request(code,host.token,'start');
 return {store,service,code,people,cache:Array(count).fill(null),times:Array(count).fill(-Infinity),get now(){return now;},tick(ms){now+=ms;},room(){return store.rows.get(code).room;}};
}
async function update(t,i,operation='state',input={}){
 const payload=await t.service.request(t.code,t.people[i].token,operation,{...input,_sync:syncCursor(t.cache[i])});
 const merged=mergeRoomSnapshot(t.cache[i],payload,t.times[i]);
 assert.ok(merged.data);t.cache[i]=merged.data;t.times[i]=payload.room.serverNow;
 return payload;
}
function equivalent(t,i){
 const room=t.room(),reference=projectRoom(room,room.members[i],t.now);
 if(reference.game)reference.game.history=reference.game.history.filter(e=>e.handNumber===reference.game.handNumber);
 const cached=t.cache[i];assert.deepEqual({room:cached.room,game:cached.game,run:cached.run},reference);
 const text=JSON.stringify(cached);
 for(const key of ['deck','burns','seed','rng','aiRng','tokenHash','processed','engine'])assert.ok(!text.includes('"'+key+'":'),key);
}

test('idle replies omit the game, keep presence and timeout progression, and rehydrate on refresh',async()=>{
 const t=await setup(2);await update(t,0);
 // Both state protocols see exactly the same remaining private/public cards.
 const idle=await update(t,0);assert.equal(idle.sync.unchanged,true);assert.equal(Object.hasOwn(idle,'game'),false);equivalent(t,0);
 // Put the turn on a human so this interval tests presence, not an AI move.
 t.room().engine.currentPlayerIndex=0;t.room().deadline=t.now+TURN_MS;
 t.tick(21000);const offline=await update(t,0);assert.equal(offline.sync.unchanged,true);
 assert.equal(t.cache[0].game.players[1].connected,false);assert.equal(t.cache[0].game.players[1].personality,'暂时离线');
 await update(t,1);await update(t,0);assert.equal(t.cache[0].game.players[1].connected,true);
 const fresh=await t.service.request(t.code,t.people[0].token,'state',{_sync:syncCursor(null)});
 assert.ok(fresh.game&&Array.isArray(fresh.run.history));assert.deepEqual(fresh.game.players[0].hole,t.cache[0].game.players[0].hole);
 t.tick(TURN_MS);const timeout=await update(t,0);assert.equal(timeout.sync.unchanged,false);assert.ok(timeout.game.history.some(e=>e.type==='timeout'));
});

test('six merged views match legacy privacy through 15 hands and history rolling past twelve',async()=>{
 const t=await setup();let unchanged=0,withHistory=0,withoutHistory=0;
 for(let h=0;h<15;h++){
  while(t.room().engine.phase!=='complete'){
   for(let i=0;i<6;i++){const payload=await update(t,i);equivalent(t,i);if(payload.sync.unchanged)unchanged++;else if(Object.hasOwn(payload.run,'history'))withHistory++;else withoutHistory++;}
   const actor=t.room().engine.currentPlayerIndex;
   const view=t.cache[actor];await update(t,actor,'action',{requestId:crypto.randomUUID(),version:view.room.version,type:view.game.legalActions.canCheck?'check':'call'});
   t.tick(1000);
  }
  for(let i=0;i<6;i++){await update(t,i);equivalent(t,i);}
  if(h<14){for(let i=0;i<6;i++)await update(t,i,'ready',{ready:true});t.tick(1600);await update(t,0);}
 }
 assert.ok(unchanged>0&&withHistory>0&&withoutHistory>0);assert.equal(t.cache[0].run.history.length,12);assert.equal(t.cache[0].run.history[0].hand,15);
 const reference=t.cache[0].run.history;
 const payload=await update(t,0);assert.equal(payload.sync.unchanged,true);assert.equal(t.cache[0].run.history,reference);
});

test('cached histories never expose folded hands or an uncontested winner, including the next hand',async()=>{
 const t=await setup();for(let i=0;i<6;i++)await update(t,i);
 while(t.room().engine.phase!=='complete'){
  const actor=t.room().engine.currentPlayerIndex;await update(t,actor);
  await update(t,actor,'action',{requestId:crypto.randomUUID(),version:t.cache[actor].room.version,type:'fold'});
 }
 for(let i=0;i<6;i++){
  await update(t,i);equivalent(t,i);
  assert.equal(t.cache[i].game.lastResult.showdown,false);
  assert.deepEqual(t.cache[i].run.history[0].showdown,[]);
  assert.ok(t.cache[i].game.players.slice(1).every(p=>p.hole.every(c=>c===null)));
 }
 for(let i=0;i<6;i++)await update(t,i,'ready',{ready:true});t.tick(1600);
 for(let i=0;i<6;i++){await update(t,i);equivalent(t,i);assert.equal(t.cache[i].game.handNumber,2);}
});

test('new-round stamps prevent reusing history with matching hand numbers, including legacy rooms',async()=>{
 const t=await setup();await update(t,0);
 const room=t.room();delete room.round;room.status='finished';room.recordedHand=4;room.history=[];
 const old=projectRoom(room,room.members[0],t.now,syncCursor(null));
 const reset=await t.service.request(t.code,t.people[0].token,'new-round',{_sync:syncCursor(old)});
 assert.equal(reset.game,null);assert.equal(reset.run,null);assert.notEqual(reset.sync.history,old.sync.history);
 const merged=mergeRoomSnapshot(old,reset);assert.equal(merged.data.game,null);
 const current=clone(t.room());current.recordedHand=4;
 const later=projectRoom(current,current.members[0],t.now,syncCursor(old));assert.notEqual(later.sync.history,old.sync.history);
 for(const p of t.people)await t.service.request(t.code,p.token,'ready',{ready:true});
 const restarted=await t.service.request(t.code,t.people[0].token,'start',{_sync:syncCursor(reset)});
 const reopened=mergeRoomSnapshot(reset,restarted);assert.ok(reopened.data.game);assert.deepEqual(reopened.data.run.history,[]);
});

test('out-of-order replies and wrong identities cannot rewind the cache or its clock',async()=>{
 const t=await setup();await update(t,0);const cache=t.cache[0],older=clone(cache);
 const next=clone(cache);next.room.version++;next.room.serverNow+=10;
 assert.equal(mergeRoomSnapshot(next,older,next.room.serverNow).ignored,true);
 const same=clone(cache);same.room.serverNow-=1;assert.equal(mergeRoomSnapshot(cache,same,cache.room.serverNow).ignored,true);
 const other=clone(cache);other.room.selfId='other-seat';assert.equal(mergeRoomSnapshot(cache,other).ignored,true);
 const wrongRoom=clone(cache);wrongRoom.room.code='ABCDEF';assert.equal(mergeRoomSnapshot(cache,wrongRoom).ignored,true);
 const idle=await update(t,0);assert.equal(mergeRoomSnapshot(null,idle).resync,true);
 const missing=clone(cache);delete missing.run.history;missing.sync.history='not-in-cache';assert.equal(mergeRoomSnapshot(cache,missing).resync,true);
 // UI timer extrapolation must not be mistaken for a newer response from the server.
 const clock=clone(cache);clock.room.serverNow+=1000;
 const response=clone(idle);response.room.serverNow+=100;
 assert.ok(mergeRoomSnapshot(clock,response,cache.room.serverNow).data);
});

test('lightweight cursors never replace action authorization or idempotency',async()=>{
 const t=await setup();for(let i=0;i<6;i++)await update(t,i);
 const actor=t.room().engine.currentPlayerIndex,p=t.people[actor],before=t.cache[actor];
 const action={requestId:'idempotent-sync-action',version:before.room.version,type:before.game.legalActions.canCheck?'check':'call',_sync:syncCursor(before)};
 const first=await t.service.request(t.code,p.token,'action',action);
 const merged=mergeRoomSnapshot(before,first).data;
 const duplicate=await t.service.request(t.code,p.token,'action',{...action,_sync:syncCursor(merged)});
 assert.equal(duplicate.sync.unchanged,true);assert.equal(duplicate.room.version,first.room.version);
 await assert.rejects(t.service.request(t.code,null,'state',{_sync:syncCursor(merged)}),/身份/);
 await assert.rejects(t.service.request(t.code,t.people[(actor+1)%6].token,'action',{...action,requestId:'stale-action-other',_sync:syncCursor(merged)}),/已更新/);
});

test('HTTP parser explicitly opts in and legacy clients still receive complete snapshots',async()=>{
 const t=await setup(6,Date.now());const options={store:t.store,limit:async()=>{}};
 const api=new URL('https://poker.test/api/poker/rooms/'+t.code);
 const headers={Authorization:'Bearer '+t.people[0].token};
 let response=await handlePoker(new Request(api,{headers}),null,options);
 const legacy=await response.json();assert.equal(response.status,200);assert.ok(Array.isArray(legacy.run.history));assert.equal(legacy.sync,undefined);
 api.searchParams.set('sync','2');response=await handlePoker(new Request(api,{headers}),null,options);
 const full=await response.json();assert.equal(full.sync.protocol,2);
 for(const [key,value] of Object.entries(syncCursor(full)))if(key!=='protocol')api.searchParams.set(key,String(value));
 response=await handlePoker(new Request(api,{headers}),null,options);const light=await response.json();assert.equal(light.sync.unchanged,true);assert.equal(Object.hasOwn(light,'game'),false);
 assert.match(response.headers.get('cache-control'),/no-store/);
});

test('poll pacing preserves active foreground cadence, reduces idle/background requests and bounds retries',()=>{
 const active={room:{status:'playing'},game:{phase:'preflop'}};
 assert.equal(pollDelay(active),1000);assert.equal(pollDelay({room:{status:'waiting'}}),2000);
 assert.equal(pollDelay({room:{status:'playing'},game:{phase:'complete'}}),2000);
 assert.equal(pollDelay(active,{hidden:true}),5000);assert.equal(pollDelay(active,{failures:1}),2000);assert.equal(pollDelay(active,{failures:99}),10000);
});
