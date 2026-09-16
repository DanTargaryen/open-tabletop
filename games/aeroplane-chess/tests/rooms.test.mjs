import test from 'node:test';
import assert from 'node:assert/strict';
import {AeroplaneRoomService,MemoryAeroplaneRoomStore,TURN_MS,AI_DELAY_MS,ROOM_TTL} from '../server/rooms.mjs';
import {randomBytes} from 'node:crypto';
const seatKey=()=>randomBytes(24).toString('hex');
async function setup(count=4){
  let now=100000;const store=new MemoryAeroplaneRoomStore(),service=new AeroplaneRoomService(store,()=>now),host=await service.create({name:'Host',playerCount:count});
  const code=host.room.code,key=seatKey(),guest=await service.request(code,'','join',{name:'Guest',seatKey:key});
  const call=(who,op,body)=>service.request(code,who.token,op,body);
  return {store,service,host,guest,call,code,key,tick:ms=>now+=ms,now:()=>now};
}
test('ready gate, owner authority, AI fill and safe per-member views',async()=>{
  const x=await setup();
  await assert.rejects(x.call(x.host,'start'),/准备/);await assert.rejects(x.call(x.guest,'start'),/房主/);
  await x.call(x.guest,'ready',{ready:true});const s=await x.call(x.host,'start');
  assert.equal(s.room.aiCount,2);assert.deepEqual(s.game.players.map(p=>p.isBot),[false,false,true,true]);
  assert.equal((await x.call(x.guest,'state')).room.selfSeat,1);
  const serialized=JSON.stringify(await x.call(x.guest,'state'));
  for(const hidden of ['tokenHash','processed','members','seed','rng'])assert.ok(!serialized.includes(`"${hidden}":`));
  await assert.rejects(x.service.request(x.code,seatKey(),'state'),/身份/);
});
test('join retries recover the same seat, including after the match starts',async()=>{
  const x=await setup();const again=await x.service.request(x.code,'','join',{name:'Guest',seatKey:x.key});
  assert.equal(again.room.selfId,x.guest.room.selfId);assert.equal(again.room.roster.length,2);
  await x.call(x.guest,'ready',{ready:true});await x.call(x.host,'start');
  const restored=await x.service.request(x.code,'','join',{name:'Guest',seatKey:x.key});assert.equal(restored.room.selfId,x.guest.room.selfId);
  await assert.rejects(x.service.request(x.code,'','join',{name:'Late',seatKey:seatKey()}),/开始/);
});
test('service owns dice, validates turn/version, and deduplicates identical actions',async()=>{
  const x=await setup();await x.call(x.guest,'ready',{ready:true});const started=await x.call(x.host,'start');
  const body={type:'roll',die:100,version:started.room.version,requestId:'same_roll_12345'};
  await assert.rejects(x.call(x.guest,'action',body),/轮到你/);
  const result=await x.call(x.host,'action',body);assert.ok(result.game.die>=1&&result.game.die<=6);assert.equal(result.game.rolls,1);
  const duplicate=await x.call(x.host,'action',body);assert.equal(duplicate.room.version,result.room.version);assert.equal(duplicate.game.rolls,1);
  await assert.rejects(x.call(x.host,'action',{...body,requestId:'different_request'}),/更新/);
});
test('concurrent identical actions commit exactly one roll through CAS',async()=>{
  const x=await setup();await x.call(x.guest,'ready',{ready:true});const started=await x.call(x.host,'start');
  const body={type:'roll',version:started.room.version,requestId:'concurrent_roll_1'};
  const results=await Promise.all([x.call(x.host,'action',body),x.call(x.host,'action',body)]);
  assert.deepEqual(results[0].game,results[1].game);assert.equal(results[0].game.rolls,1);
});
test('timeout advances one action, leaving transfers ownership and hands the plane team to AI',async()=>{
  const x=await setup();await x.call(x.guest,'ready',{ready:true});await x.call(x.host,'start');
  x.tick(TURN_MS+1);let s=await x.call(x.guest,'state');assert.equal(s.game.rolls,1);
  await x.call(x.host,'leave');s=await x.call(x.guest,'state');assert.equal(s.room.isOwner,true);assert.equal(s.game.players[0].isBot,true);
  assert.equal(s.room.aiCount,3);await assert.rejects(x.call(x.host,'state'),/身份/);
  x.tick(AI_DELAY_MS+1);await x.call(x.guest,'state');
});
test('finished rooms restart only after ready and expired rooms cannot restore',async()=>{
  const x=await setup();await x.call(x.guest,'ready',{ready:true});await x.call(x.host,'start');
  const row=await x.store.get(x.code,x.now());row.room.engine.players[0].planes=[56,57,57,57];row.room.engine.phase='move';row.room.engine.die=1;
  await x.store.cas(x.code,row.revision,row.room,row.expiresAt);
  const finished=await x.call(x.host,'action',{type:'move',piece:0,version:row.room.version,requestId:'finish_the_match'});
  assert.equal(finished.room.status,'finished');await assert.rejects(x.call(x.host,'start'),/准备/);
  await x.call(x.host,'ready',{ready:true});await x.call(x.guest,'ready',{ready:true});const restart=await x.call(x.host,'start');
  assert.equal(restart.game.phase,'roll');assert.equal(restart.game.rolls,0);
  x.tick(ROOM_TTL+1);await assert.rejects(x.call(x.guest,'state'),/过期/);
});
test('an empty waiting room can be rejoined with a new owner and start normally',async()=>{
  const x=await setup();await x.call(x.host,'leave');await x.call(x.guest,'leave');
  const fresh=await x.service.request(x.code,'','join',{name:'New pilot',seatKey:seatKey()});
  assert.equal(fresh.room.isOwner,true);assert.equal(fresh.room.roster.length,1);
  assert.equal((await x.call(fresh,'start')).room.status,'playing');
});
