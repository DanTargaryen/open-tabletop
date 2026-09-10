import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomService,MemoryRoomStore,TURN_MS,projectRoom,advanceRoom} from '../server/rooms.mjs';
import {PokerGame} from '../web/engine.js';

async function table(count=2,mode='practice'){
 let now=100000;const store=new MemoryRoomStore(),service=new RoomService(store,()=>now);
 const host=await service.create({name:'房主',mode}),code=host.room.code,people=[host];
 for(let i=1;i<count;i++)people.push(await service.request(code,null,'join',{name:'朋友'+i,seatKey:crypto.randomUUID().replaceAll('-','')+'0123456789abcdef'}));
 for(const p of people)await service.request(code,p.token,'ready',{ready:true});
 const start=await service.request(code,host.token,'start');
 return {store,service,host,code,people,start,get now(){return now;},time(n){now=n;},tick(n=1000){now+=n;},room(){return store.rows.get(code).room;}};
}
async function ownTurn(t,seat=0){for(let i=0;i<30;i++){const r=t.room();if(r.engine.phase==='complete')return;if(r.engine.currentPlayerIndex===seat)return;const p=t.people.find(p=>p.room.selfId===r.members.find(m=>m.seat===r.engine.currentPlayerIndex)?.id);if(p){const v=await t.service.request(t.code,p.token,'state');await t.service.request(t.code,p.token,'action',{requestId:crypto.randomUUID(),version:v.room.version,type:v.game.legalActions.canCheck?'check':'call'});}else{t.time(r.deadline+1);await t.service.request(t.code,t.host.token,'state');}}throw Error('turn not reached');}
function assertPrivate(payload){const text=JSON.stringify(payload);for(const key of ['deck','burns','seed','rng','aiRng','tokenHash','processed','engine'])assert.ok(!text.includes('"'+key+'":'),key);}

test('room membership, readiness, unique seats, full table and host permissions',async()=>{
 const store=new MemoryRoomStore(),s=new RoomService(store);const h=await s.create({name:'主人'}),c=h.room.code;
 await s.request(c,h.token,'ready',{ready:false});
 await assert.rejects(s.request(c,h.token,'start'),/准备/);
 await s.request(c,h.token,'ready',{ready:true});
 const p=await s.request(c,null,'join',{seatKey:crypto.randomUUID().replaceAll('-','')+'0123456789abcdef',name:'访客'});
 await assert.rejects(s.request(c,p.token,'start'),/房主/);
 await assert.rejects(s.request(c,h.token,'start'),/准备/);
 for(let i=2;i<6;i++)await s.request(c,null,'join',{seatKey:crypto.randomUUID().replaceAll('-','')+'0123456789abcdef',name:'访客'+i});
 await assert.rejects(s.request(c,null,'join',{seatKey:crypto.randomUUID().replaceAll('-','')+'0123456789abcdef',name:'第七位'}),/已满/);
 assert.equal(store.rows.get(c).room.members.length,6);assert.equal(new Set(store.rows.get(c).room.members.map(m=>m.seat)).size,6);
 await assert.rejects(s.request(c,null,'state'),/身份/);
 const other=await s.create({name:'另一个'});await assert.rejects(s.request(c,other.token,'state'),/身份/);
});

test('each of six viewers gets only its own hole cards and viewer-relative positions',async()=>{
 const t=await table(6),raw=t.room();
 for(let seat=0;seat<6;seat++){
  const payload=await t.service.request(t.code,t.people[seat].token,'state');assertPrivate(payload);
  assert.equal(payload.game.players[0].name,raw.members.find(m=>m.seat===seat).name);
  assert.deepEqual(payload.game.players[0].hole,raw.engine.players[seat].hole);
  for(let id=1;id<6;id++)assert.deepEqual(payload.game.players[id].hole,[null,null]);
  assert.equal(payload.game.currentPlayerIndex,(raw.engine.currentPlayerIndex-seat+6)%6);
 }
 await assert.rejects(t.service.request(t.code,null,'join',{seatKey:crypto.randomUUID().replaceAll('-','')+'0123456789abcdef',name:'迟到'}),/已经开始/);
});

test('repeated and concurrent actions apply once, outsiders and wrong-seat actions fail',async()=>{
 const t=await table();await ownTurn(t);const a=await t.service.request(t.code,t.host.token,'state');
 const request={requestId:'same-action-123',version:a.room.version,type:a.game.legalActions.canCheck?'check':'call'};
 await assert.rejects(t.service.request(t.code,t.people[1].token,'action',request),/还没有轮到/);
 const [x,y]=await Promise.all([t.service.request(t.code,t.host.token,'action',request),t.service.request(t.code,t.host.token,'action',request)]);
 assert.equal(x.room.version,y.room.version);assert.equal(t.room().engine.handHistory.filter(e=>e.playerId===0&&!['blind','hand'].includes(e.type)).length,1);
 await assert.rejects(t.service.request(t.code,t.host.token,'action',{...request,requestId:'different-action-123'}),/已更新/);
 assertPrivate(await t.service.request(t.code,t.host.token,'state'));
});

test('presence heartbeats do not invalidate the game version or reset the turn deadline',async()=>{
 const t=await table();await ownTurn(t);const a=await t.service.request(t.code,t.host.token,'state'),deadline=t.room().deadline;
 t.tick(9000);const b=await t.service.request(t.code,t.host.token,'state');assert.equal(a.room.version,b.room.version);assert.equal(t.room().deadline,deadline);
 await t.service.request(t.code,t.host.token,'action',{requestId:'after-heartbeat-123',version:b.room.version,type:b.game.legalActions.canCheck?'check':'call'});
});

test('a timed-out human checks or folds once; it is never forced to call',async()=>{
 const t=await table();await ownTurn(t);const stack=t.room().engine.players[0].stack,deadline=t.room().deadline;
 t.time(deadline+1);await Promise.all([t.service.request(t.code,t.host.token,'state'),t.service.request(t.code,t.people[1].token,'state')]);
 const events=t.room().engine.handHistory.filter(e=>e.playerId===0&&e.type==='timeout');assert.equal(events.length,1);assert.equal(t.room().engine.players[0].stack,stack);assert.ok(t.room().engine.players[0].folded);
});

test('folded host and non-showdown winner holes are redacted in results and old history',async()=>{
 const t=await table();const room=t.room(),g=new PokerGame({mode:'practice'});g.startHand();
 for(const id of [3,4,5,0]){assert.equal(g._s.currentPlayerIndex,id);g.act('fold');}
 g.act('raise',40);g.act('fold');assert.equal(g._s.phase,'complete');assert.equal(g._s.lastResult.showdown,false);
 room.engine=JSON.parse(g.serialize());room.recordedHand=1;room.history=[{result:room.engine.lastResult,holes:room.engine.players.map(p=>p.hole)}];
 const viewer=room.members.find(m=>m.seat===1),state=projectRoom(room,viewer,t.now);assertPrivate(state);
 const hostRelative=5;assert.deepEqual(state.game.players[hostRelative].hole,[null,null]);assert.deepEqual(state.game.lastResult.playerResults.find(p=>p.id===hostRelative).hole,[null,null]);
 const hostView=projectRoom(room,room.members[0],t.now);assert.deepEqual(hostView.game.lastResult.playerResults.find(p=>p.id===1).hole,[null,null]);
 assert.deepEqual(state.run.history[0].hole,room.engine.players[1].hole);
});

test('host elimination does not end a multiplayer tournament or block the next hand',async()=>{
 const t=await table(2,'tournament'),room=t.room(),g=new PokerGame({mode:'tournament'});g.startHand();const s=g._s;
 s.phase='river';s.board=['As','Ad','Kc','Qc','Tc'];s.players[0].hole=['2h','3h'];s.players[1].hole=['Ah','Kh'];
 s.players.forEach(p=>{p.stack=2000;p.startingStack=2000;p.bet=0;p.contribution=0;p.allIn=false;p.actedAt=null;p.folded=p.id>1;});
 s.currentPlayerIndex=0;s.currentBet=0;s.minRaise=20;room.engine=JSON.parse(g.serialize());room.deadline=t.now+TURN_MS;
 let v=await t.service.request(t.code,t.host.token,'state');await t.service.request(t.code,t.host.token,'action',{requestId:'host-shove-123',version:v.room.version,type:'all-in'});
 v=await t.service.request(t.code,t.people[1].token,'state');await t.service.request(t.code,t.people[1].token,'action',{requestId:'guest-call-123',version:v.room.version,type:'call'});
 assert.equal(t.room().engine.players[0].stack,0);assert.equal(t.room().engine.gameOver,false);assert.equal(t.room().status,'playing');
 await t.service.request(t.code,t.people[1].token,'ready',{ready:true});t.tick(1600);await t.service.request(t.code,t.people[1].token,'state');assert.equal(t.room().engine.handNumber,2);
});

test('leaving transfers waiting-room ownership and never turns seat zero into an unsupported bot',async()=>{
 const store=new MemoryRoomStore(),s=new RoomService(store),h=await s.create({name:'主人'}),p=await s.request(h.room.code,null,'join',{seatKey:crypto.randomUUID().replaceAll('-','')+'0123456789abcdef',name:'好友'});
 await s.request(h.room.code,h.token,'leave');const state=await s.request(h.room.code,p.token,'state');assert.equal(state.room.isOwner,true);assert.equal(store.rows.get(h.room.code).room.members[0].seat,0);
 await assert.rejects(s.request(h.room.code,h.token,'state'),/身份/);
});

test('lost join response can be retried with the same client seat key, without another seat',async()=>{
 const store=new MemoryRoomStore(),s=new RoomService(store),h=await s.create({name:'主人'}),seatKey='1234567890abcdef'.repeat(3),c=h.room.code;
 const first=await s.request(c,null,'join',{name:'好友',seatKey});
 const again=await s.request(c,null,'join',{name:'好友',seatKey});
 assert.equal(first.room.selfId,again.room.selfId);assert.equal(first.token,again.token);assert.equal(store.rows.get(c).room.members.length,2);
 await s.request(c,again.token,'ready',{ready:true});assert.equal((await s.request(c,h.token,'start')).room.status,'playing');
});

test('host can free an unready waiting seat, while guests cannot kick others',async()=>{
 const store=new MemoryRoomStore(),s=new RoomService(store),h=await s.create({name:'主人'}),c=h.room.code;
 const p=await s.request(c,null,'join',{name:'好友',seatKey:'a'.repeat(48)});
 await assert.rejects(s.request(c,p.token,'kick',{memberId:h.room.selfId}),/只有房主/);
 await s.request(c,h.token,'kick',{memberId:p.room.selfId});
 assert.equal(store.rows.get(c).room.members.length,1);await assert.rejects(s.request(c,p.token,'state'),/身份/);
});

test('twenty six-human hands finish with conserved chips and private history',async()=>{
 const t=await table(6);let actions=0;
 for(let h=0;h<20;h++){
  while(t.room().engine.phase!=='complete'){
   const actor=t.room().engine.currentPlayerIndex,p=t.people[actor];
   const v=await t.service.request(t.code,p.token,'state');assertPrivate(v);
   await t.service.request(t.code,p.token,'action',{requestId:crypto.randomUUID(),version:v.room.version,type:v.game.legalActions.canCheck?'check':'call'});actions++;
   const r=t.room();assert.equal(r.engine.players.reduce((sum,p)=>sum+p.stack+p.contribution,0),12000);
  }
  if(h<19){for(const p of t.people)await t.service.request(t.code,p.token,'ready',{ready:true});t.tick(1600);await t.service.request(t.code,t.host.token,'state');}
 }
 assert.equal(t.room().engine.handNumber,20);assert.equal(t.room().history.length,12);assert.ok(actions>=400);
});


test('one human starts with five private AI opponents and can play the next hand alone',async()=>{
 const t=await table(1);
 assert.equal(t.start.room.roster.length,1);assert.equal(t.start.room.aiCount,5);
 assert.equal(t.start.game.players.length,6);assert.equal(t.start.game.players.filter(p=>p.isBot).length,5);
 for(const p of t.start.game.players.slice(1))assert.deepEqual(p.hole,[null,null]);assertPrivate(t.start);
 await ownTurn(t);assert.equal(t.room().engine.currentPlayerIndex,0);
 assert.equal(t.room().deadline-t.now,TURN_MS);
 let decisions=0;
 while(t.room().engine.phase!=='complete'&&decisions++<150){
  if(t.room().engine.currentPlayerIndex===0){const v=await t.service.request(t.code,t.host.token,'state');await t.service.request(t.code,t.host.token,'action',{version:v.room.version,requestId:crypto.randomUUID(),type:v.game.legalActions.canCheck?'check':'call'});}
  else{t.time(t.room().deadline+1);await t.service.request(t.code,t.host.token,'state');}
 }
 assert.equal(t.room().engine.phase,'complete');assert.equal(t.room().engine.players.reduce((n,p)=>n+p.stack+p.contribution,0),12000);
 await t.service.request(t.code,t.host.token,'ready',{ready:true});t.tick(1600);
 const next=await t.service.request(t.code,t.host.token,'state');assert.equal(next.game.handNumber,2);assert.equal(next.room.roster.length,1);assert.equal(next.room.aiCount,5);
 const restored=await new RoomService(t.store,()=>t.now).request(t.code,t.host.token,'state');assert.equal(restored.game.handNumber,2);
 await assert.rejects(t.service.request(t.code,null,'join',{name:'迟到',seatKey:'d'.repeat(48)}),/已经开始/);
});

test('one-host support still rejects an offline or unready real guest',async()=>{
 let now=100000;const service=new RoomService(new MemoryRoomStore(),()=>now),host=await service.create({name:'Host'}),code=host.room.code;
 const guest=await service.request(code,null,'join',{name:'Guest',seatKey:'f'.repeat(48)});
 await assert.rejects(service.request(code,host.token,'start'),/准备/);
 await service.request(code,guest.token,'ready',{ready:true});now+=21000;
 await assert.rejects(service.request(code,host.token,'start'),/在线/);
 await service.request(code,guest.token,'state');assert.equal((await service.request(code,host.token,'start')).room.status,'playing');
});
