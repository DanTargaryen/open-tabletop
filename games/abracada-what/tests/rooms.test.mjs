import test from 'node:test';
import assert from 'node:assert/strict';
import {AbracadaRoomService,AI_DELAY_MS,MemoryAbracadaRoomStore,actionPresentationMs} from '../server/rooms.mjs';
import {handleAbracada} from '../server/api.mjs';

const seatKey=value=>String(value).padStart(48,String(value)).slice(0,48).replace(/[^a-f0-9]/g,'a');

async function table({people=2,playerCount=4,mode='score'}={}){
  let now=100000;
  const store=new MemoryAbracadaRoomStore();
  const service=new AbracadaRoomService(store,()=>now);
  const host=await service.create({name:'Host',playerCount,mode});
  const players=[host];
  for(let index=1;index<people;index++)players.push(await service.request(host.room.code,null,'join',{name:`Guest${index}`,seatKey:seatKey(index)}));
  for(const player of players.slice(1))await service.request(host.room.code,player.token,'ready',{ready:true});
  const started=await service.request(host.room.code,host.token,'start');
  return {store,service,host,players,started,code:host.room.code,get now(){return now;},tick(milliseconds){now+=milliseconds;},room(){return store.rows.get(host.room.code).room;}};
}

function assertPrivate(payload){
  const serialized=JSON.stringify(payload);
  for(const key of ['engine','tokenHash','processed','rng','seed','drawPile','secretPool'])assert.ok(!serialized.includes(`"${key}":`),key);
}

test('host can start alone and every empty seat becomes an AI player',async()=>{
  const current=await table({people:1,playerCount:5,mode:'single'});
  assert.equal(current.started.room.status,'playing');
  assert.equal(current.started.room.aiCount,4);
  assert.equal(current.started.game.players.length,5);
  assert.equal(current.started.game.players[0].isHuman,true);
  assert.ok(current.started.game.players.slice(1).every(player=>player.isBot));
  assertPrivate(current.started);
});

test('joining, readiness, relative seats, and hidden information stay viewer-specific',async()=>{
  const store=new MemoryAbracadaRoomStore();
  const service=new AbracadaRoomService(store);
  const host=await service.create({name:'Host',playerCount:3,mode:'score'});
  const guest=await service.request(host.room.code,null,'join',{name:'Guest',seatKey:seatKey(1)});
  await assert.rejects(service.request(host.room.code,host.token,'start'),/准备/);
  await assert.rejects(service.request(host.room.code,guest.token,'start'),/房主/);
  await service.request(host.room.code,guest.token,'ready',{ready:true});
  const hostView=await service.request(host.room.code,host.token,'start');
  const guestView=await service.request(host.room.code,guest.token,'state');
  assert.ok(hostView.game.players[0].rack.every(value=>value===null));
  assert.ok(guestView.game.players[0].rack.every(value=>value===null));
  assert.ok(hostView.game.players.slice(1).every(player=>player.rack.every(Number.isInteger)));
  assert.ok(guestView.game.players.slice(1).every(player=>player.rack.every(Number.isInteger)));
  assert.equal(hostView.game.players.find(player=>player.isRemoteHuman).id,1);
  assert.equal(guestView.game.players.find(player=>player.isRemoteHuman).id,2);
  assert.equal(guestView.game.activeIndex,(hostView.game.activeIndex+2)%3);
  assertPrivate(hostView);
  assertPrivate(guestView);
});

test('a spell four caster sees the secret number without revealing it to opponents',async()=>{
  const current=await table({people:2,playerCount:2});
  const raw=current.room();
  raw.engine.players[0].rack=[4,8];
  const secret=raw.engine.secretPool[0];
  const before=await current.service.request(current.code,current.host.token,'state');
  const cast=await current.service.request(current.code,current.host.token,'action',{requestId:'private-secret-reveal',version:before.room.version,type:'cast',spell:4});
  assert.equal(cast.game.players[0].secrets.at(-1),secret);
  assert.equal(Object.hasOwn(cast.action,'secret'),false);
  const guest=await current.service.request(current.code,current.players[1].token,'state');
  assert.deepEqual(guest.game.players[1].secrets,[null]);
});

test('actions require the current seat and version and duplicate requests apply once',async()=>{
  const current=await table({people:2,playerCount:2});
  const before=await current.service.request(current.code,current.host.token,'state');
  await assert.rejects(current.service.request(current.code,current.players[1].token,'action',{requestId:'wrong-seat-action',version:before.room.version,type:'cast',spell:8}),/轮到/);
  const raw=current.room();
  const absent=[1,2,3,4,5,6,7,8].find(spell=>!raw.engine.players[0].rack.includes(spell));
  const action={requestId:'same-magic-action',version:before.room.version,type:'cast',spell:absent};
  const [first,second]=await Promise.all([current.service.request(current.code,current.host.token,'action',action),current.service.request(current.code,current.host.token,'action',action)]);
  assert.equal(first.room.version,second.room.version);
  assert.equal(current.room().engine.events.filter(event=>event.type==='cast'&&event.playerId===0).length,1);
  await assert.rejects(current.service.request(current.code,current.host.token,'action',{...action,requestId:'stale-magic-action'}),/已更新/);
});

test('AI and timed-out human seats advance only after their deadline',async()=>{
  const current=await table({people:1,playerCount:3});
  const raw=current.room();
  const absent=[1,2,3,4,5,6,7,8].find(spell=>!raw.engine.players[0].rack.includes(spell));
  const before=await current.service.request(current.code,current.host.token,'state');
  await current.service.request(current.code,current.host.token,'action',{requestId:'hand-to-ai-action',version:before.room.version,type:'cast',spell:absent});
  const deadline=current.room().deadline;
  const version=current.room().version;
  assert.equal(deadline,current.room().actionAvailableAt+AI_DELAY_MS);
  current.tick(deadline-current.now-1);
  await current.service.request(current.code,current.host.token,'state');
  assert.equal(current.room().version,version);
  current.tick(2);
  await current.service.request(current.code,current.host.token,'state');
  assert.equal(current.room().version,version+1);
  assert.ok(current.room().deadline>=Math.max(current.now,current.room().actionAvailableAt||0)+AI_DELAY_MS||current.room().status!=='playing');
});

test('each action blocks the next turn until its complete presentation finishes',async()=>{
  const current=await table({people:2,playerCount:2});
  const raw=current.room();
  raw.engine.players[0].rack=[8,8,8];
  const before=await current.service.request(current.code,current.host.token,'state');
  const rolled=await current.service.request(current.code,current.host.token,'action',{requestId:'dice-reveal-action',version:before.room.version,type:'cast',spell:1});
  assert.ok([1,2,3].includes(rolled.action.roll));
  assert.equal(rolled.action.playerId,0);
  assert.equal(rolled.room.reveal.playerId,0);
  assert.equal(rolled.room.reveal.roll,rolled.action.roll);
  const presentationMs=actionPresentationMs(rolled.action);
  assert.equal(rolled.room.actionAvailableAt,current.now+presentationMs);
  const guestState=await current.service.request(current.code,current.players[1].token,'state');
  assert.equal(guestState.room.reveal.playerId,1);
  assert.equal(guestState.room.reveal.roll,rolled.action.roll);
  const guestRaw=current.room();
  guestRaw.engine.players[1].rack=[1,1,1];
  const guestAction={requestId:'after-reveal-action',version:guestState.room.version,type:'cast',spell:8};
  await assert.rejects(current.service.request(current.code,current.players[1].token,'action',guestAction),/展示/);
  current.tick(presentationMs-1);
  await assert.rejects(current.service.request(current.code,current.players[1].token,'action',guestAction),/展示/);
  current.tick(1);
  const next=await current.service.request(current.code,current.players[1].token,'action',guestAction);
  assert.equal(next.action.playerId,0);
  assert.equal(next.action.roll,null);
  assert.equal(next.room.actionAvailableAt,current.now+actionPresentationMs(next.action));
});

test('all human players ready before the host starts the next scoring round',async()=>{
  const current=await table({people:2,playerCount:3,mode:'score'});
  const raw=current.room();
  raw.status='round-complete';
  raw.engine.phase='round-complete';
  raw.deadline=null;
  raw.members.forEach(member=>member.ready=false);
  const previousRound=raw.engine.round;
  await current.service.request(current.code,current.players[1].token,'ready',{ready:true});
  await assert.rejects(current.service.request(current.code,current.host.token,'start'),/准备/);
  await current.service.request(current.code,current.host.token,'ready',{ready:true});
  const next=await current.service.request(current.code,current.host.token,'start');
  assert.equal(next.room.status,'playing');
  assert.equal(next.game.phase,'casting');
  assert.equal(next.game.round,previousRound+1);
  assert.ok(next.room.roster.every(player=>!player.ready));
});

test('leaving transfers ownership in the waiting room and frees the seat',async()=>{
  const store=new MemoryAbracadaRoomStore();
  const service=new AbracadaRoomService(store);
  const host=await service.create({name:'Host',playerCount:4});
  const guest=await service.request(host.room.code,null,'join',{name:'Guest',seatKey:seatKey(1)});
  await service.request(host.room.code,host.token,'leave');
  const state=await service.request(host.room.code,guest.token,'state');
  assert.equal(state.room.isOwner,true);
  assert.equal(state.room.roster[0].seat,0);
  assert.equal(state.room.aiCount,3);
  await assert.rejects(service.request(host.room.code,host.token,'state'),/身份/);
});

test('HTTP handler creates rooms and rejects cross-origin access',async()=>{
  const store=new MemoryAbracadaRoomStore();
  const options={store,limit:async()=>{}};
  const created=await handleAbracada(new Request('https://tower.test/api/abracada/rooms',{method:'POST',headers:{Origin:'https://tower.test','Content-Type':'application/json'},body:JSON.stringify({name:'Host',playerCount:2,mode:'score'})}),null,options);
  assert.equal(created.status,201);
  const host=await created.json();
  const state=await handleAbracada(new Request(`https://tower.test/api/abracada/rooms/${host.room.code}`,{headers:{Origin:'https://tower.test',Authorization:`Bearer ${host.token}`}}),null,options);
  assert.equal(state.status,200);
  const denied=await handleAbracada(new Request(`https://tower.test/api/abracada/rooms/${host.room.code}`,{headers:{Origin:'https://other.test',Authorization:`Bearer ${host.token}`}}),null,options);
  assert.equal(denied.status,403);
});
