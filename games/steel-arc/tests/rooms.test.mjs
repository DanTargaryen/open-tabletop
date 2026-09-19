import test from 'node:test';
import assert from 'node:assert/strict';
import {MemorySteelArcRoomStore,SteelArcRoomService,TURN_MS} from '../server/rooms.mjs';
const seatKey=n=>n.toString(16).padStart(48,'a').slice(-48);
const ready=(service,code,player)=>service.request(code,player.token,'ready',{ready:true});
test('two humans can switch to A and fight two manually added AI on B',async()=>{
  const service=new SteelArcRoomService(new MemorySteelArcRoomStore());
  const owner=await service.create({name:'Host'}),code=owner.room.code;
  const guest=await service.request(code,'','join',{name:'Guest',seatKey:seatKey(21)});
  await service.request(code,guest.token,'team',{slot:'A2'});
  await assert.rejects(()=>service.request(code,guest.token,'ai',{slot:'B1',enabled:true}),{status:403});
  await service.request(code,owner.token,'ai',{slot:'B1',enabled:true});
  await service.request(code,owner.token,'ai',{slot:'B2',enabled:true});
  await assert.rejects(()=>service.request(code,guest.token,'team',{slot:'B1'}),{status:409});
  await assert.rejects(()=>service.request(code,'','join',{name:'Third',seatKey:seatKey(22)}),{status:409});
  await ready(service,code,guest);
  const game=(await service.request(code,owner.token,'start')).game;
  assert.equal(game.tanks.A1.ai,false);assert.equal(game.tanks.A2.ai,false);
  assert.equal(game.tanks.B1.ai,true);assert.equal(game.tanks.B2.ai,true);
});
test('1v1 contains no phantom tanks and host transfers after leaving',async()=>{
  const service=new SteelArcRoomService(new MemorySteelArcRoomStore());
  const owner=await service.create({name:'Host'}),code=owner.room.code;
  const guest=await service.request(code,'','join',{name:'Guest',seatKey:seatKey(23)});
  await ready(service,code,guest);
  const started=await service.request(code,owner.token,'start');
  assert.deepEqual(Object.keys(started.game.tanks),['A1','B1']);
  await service.request(code,owner.token,'leave');
  const room=await service.request(code,guest.token,'state');
  assert.equal(room.room.isOwner,true);assert.equal(room.game.tanks.A1.ai,true);
  assert.notEqual(room.game.turn,'A1');
});
test('friend room starts with no AI and exposes four selectable seats',async()=>{
  const service=new SteelArcRoomService(new MemorySteelArcRoomStore(),()=>1000);const owner=await service.create({name:'Owner'}),code=owner.room.code;const guest=await service.request(code,'','join',{name:'Guest',seatKey:seatKey(1)});
  assert.equal(guest.room.aiCount,0);assert.deepEqual(guest.room.seats.map(seat=>seat.slot),['A1','B1','A2','B2']);await service.request(code,owner.token,'ai',{slot:'A2',enabled:true});const withAi=await service.request(code,owner.token,'ai',{slot:'B2',enabled:true});assert.equal(withAi.room.aiCount,2);await ready(service,code,guest);const started=await service.request(code,owner.token,'start',{});assert.deepEqual(started.game.turnOrder,['A1','B1','A2','B2']);
});
test('players choose exact slots and occupied slots are rejected',async()=>{const service=new SteelArcRoomService(new MemorySteelArcRoomStore(),()=>1500);const owner=await service.create({name:'One'}),code=owner.room.code;const guest=await service.request(code,'','join',{name:'Two',seatKey:seatKey(2)});await assert.rejects(()=>service.request(code,guest.token,'team',{slot:'A1'}));const moved=await service.request(code,guest.token,'team',{slot:'B2'});assert.equal(moved.room.selfSlot,'B2');});
test('AI seats participate in fixed A1 B1 A2 B2 order',async()=>{const service=new SteelArcRoomService(new MemorySteelArcRoomStore(),()=>2000);const owner=await service.create({name:'A1'}),code=owner.room.code;const b1=await service.request(code,'','join',{name:'B1',seatKey:seatKey(3)});await service.request(code,owner.token,'ai',{slot:'A2',enabled:true});await service.request(code,owner.token,'ai',{slot:'B2',enabled:true});await ready(service,code,b1);const started=await service.request(code,owner.token,'start',{});assert.deepEqual(started.game.turnOrder,['A1','B1','A2','B2']);});
test('one human can start against one AI',async()=>{const service=new SteelArcRoomService(new MemorySteelArcRoomStore(),()=>3000);const owner=await service.create({name:'Solo'}),code=owner.room.code;await service.request(code,owner.token,'ai',{slot:'B1',enabled:true});const started=await service.request(code,owner.token,'start',{});assert.deepEqual(started.game.turnOrder,['A1','B1']);assert.equal(started.game.tanks.B1.ai,true);});
test('a room needs both teams and at least two enabled seats',async()=>{const service=new SteelArcRoomService(new MemorySteelArcRoomStore(),()=>4000);const owner=await service.create({name:'Solo'}),code=owner.room.code;await assert.rejects(()=>service.request(code,owner.token,'start',{}),/至少需要启用/);await service.request(code,owner.token,'ai',{slot:'A2',enabled:true});await assert.rejects(()=>service.request(code,owner.token,'start',{}),/双方都需要/);});

test('lost and concurrent create responses recover one room with the same seat key',async()=>{
  const store=new MemorySteelArcRoomStore(),service=new SteelArcRoomService(store),input={name:'Host',seatKey:seatKey(50)};
  const [a,b]=await Promise.all([service.create(input),service.create(input)]);
  const retry=await service.create(input);
  assert.equal(a.room.code,b.room.code);assert.equal(retry.room.code,a.room.code);
  assert.equal(retry.room.selfId,a.room.selfId);assert.equal(retry.token,input.seatKey);
  assert.equal(store.rows.size,1);
  assert.ok(!JSON.stringify([...store.rows]).includes(input.seatKey));
  await assert.rejects(service.create({name:'Host',seatKey:'invalid'}),{status:400});
});

test('a duplicate action after its deadline cannot return an unpersisted timeout shot',async()=>{
  let now=1000;const store=new MemorySteelArcRoomStore(),service=new SteelArcRoomService(store,()=>now);
  const host=await service.create({name:'Host'}),code=host.room.code;
  const guest=await service.request(code,'','join',{name:'Guest',seatKey:seatKey(51)});
  await ready(service,code,guest);const started=await service.request(code,host.token,'start');
  const body={type:'aim',heading:45,power:60,version:started.room.version,requestId:'stable-aim-0001'};
  const first=await service.request(code,host.token,'action',body);
  now+=TURN_MS+1;
  const retried=await service.request(code,host.token,'action',body),stored=await store.get(code,now);
  assert.equal(retried.room.version,first.room.version);
  assert.equal(retried.room.version,stored.room.version);
  assert.equal(retried.game.shotHistory.length,stored.room.engine.shotHistory.length);
  const stale={...body,requestId:'late-fire-0001',type:'fire',version:first.room.version};
  await assert.rejects(service.request(code,host.token,'action',stale),{status:409});
  const after=await store.get(code,now);
  assert.equal(after.room.version,first.room.version+1);
  assert.equal(after.room.engine.shotHistory.length,1);
});
