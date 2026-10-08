import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {InkWarRoomService,MemoryInkWarRoomStore,MAX_CATCHUP_MS,HOST_MIGRATION_MS,ROOM_TTL,RECENT_UNIT_MS} from '../server/rooms.mjs';
import {surrenderPlayer,releaseComebackSkill} from '../web/engine.js';
const seatKey=()=>randomBytes(24).toString('hex');
const point=(game,x=.5,y=.5)=>({x:Math.round(game.width*x),y:Math.round(game.height*y)});
const geometry=game=>({seed:game.seed,mapId:game.mapId,width:game.width,height:game.height,cities:game.cities.map(({id,x,y,owner})=>({id,x,y,owner})),terrain:game.terrain});
async function setup(configuration={}){
  let now=100000;const store=new MemoryInkWarRoomStore(),service=new InkWarRoomService(store,()=>now);
  const host=await service.create({name:'青墨',...configuration});
  const key=seatKey(),guest=await service.request(host.room.code,'','join',{name:'赤墨',seatKey:key});
  const call=(who,operation,input={})=>service.request(host.room.code,who.token,operation,input);
  const ready=who=>call(who,'ready',{ready:true,cardId:who.room.cardOptions[0].id});
  async function start(){await ready(host);await ready(guest);return call(host,'start');}
  async function troops(seats=[0,1],minimum=1){
    let state=await call(host,'state');
    const count=seat=>state.game.units.filter(unit=>unit.owner===seat).length;
    for(let i=0;i<8&&seats.some(seat=>count(seat)<minimum);i++){now+=MAX_CATCHUP_MS;state=await call(host,'state');}
    for(const seat of seats)assert.ok(count(seat)>=minimum,`seat ${seat} must naturally produce at least ${minimum} soldiers before commanding them`);
    return state;
  }
  return {store,service,host,guest,key,call,ready,start,troops,code:host.room.code,tick:milliseconds=>now+=milliseconds,now:()=>now};
}

test('every human picks one seeded card and explicitly readies before owner starts',async()=>{
  const x=await setup();assert.equal(x.host.room.aiCount,0);assert.equal(x.host.room.selfSeat,0);assert.equal(x.guest.room.selfSeat,1);
  await assert.rejects(x.call(x.host,'start'),/准备/);
  await assert.rejects(x.call(x.guest,'start'),/房主/);
  await assert.rejects(x.call(x.host,'ready',{ready:true}),/卡牌/);
  await assert.rejects(x.call(x.guest,'ready',{ready:true,cardId:'unoffered_card'}),/候选/);
  const state=await x.start();assert.equal(state.room.status,'playing');assert.equal(state.game.players.length,2);
  assert.equal(state.game.units.length,0);assert.ok(state.game.players.every(player=>player.alive));
  assert.deepEqual(state.game.players.map(player=>player.name),['青墨','赤墨']);
  assert.ok(JSON.stringify(state.game.players[0].cards).includes(x.host.room.cardOptions[0].id));
  const serialized=JSON.stringify(await x.call(x.guest,'state'));
  for(const secret of ['tokenHash','processed','members'])assert.ok(!serialized.includes(`"${secret}":`));
  assert.ok(!serialized.includes(x.host.token));assert.ok(!serialized.includes(x.guest.token));
  await assert.rejects(x.service.request(x.code,seatKey(),'state'),/身份/);
});

test('friendly city feeding is authoritative, shared, deduplicated and cannot target another player',async()=>{
  const x=await setup();await x.start();const state=await x.troops(),home=state.game.cities.find(c=>c.owner===0),enemy=state.game.cities.find(c=>c.owner===1),soldier=state.game.units.find(u=>u.owner===0);
  const input={requestId:'feed_home_city_once',unitIds:[soldier.id],target:{x:home.x,y:home.y},cityId:home.id};
  const row=await x.store.get(x.code,x.now()),city=row.room.engine.cities.find(c=>c.id===home.id);
  city.maxLevel=3;city.hp=city.maxHp-30;
  await x.store.cas(x.code,row.revision,row.room,row.expiresAt);
  await assert.rejects(x.call(x.host,'action',{...input,cityId:enemy.id}),/己方城池/);
  await assert.rejects(x.call(x.host,'action',{...input,cityId:'0'}),/城池/);
  const [first,retry]=await Promise.all([x.call(x.host,'action',input),x.call(x.host,'action',input)]);
  assert.equal(first.game.units.find(u=>u.id===soldier.id).cityOrder,home.id);
  assert.deepEqual(first.game,retry.game);
  await assert.rejects(x.call(x.host,'action',{...input,cityId:undefined}),/不同命令/);
  x.tick(2000);const updated=await x.call(x.host,'state'),shared=await x.call(x.guest,'state');
  assert.ok(!updated.game.units.some(u=>u.id===soldier.id));
  assert.equal(updated.game.cities.find(c=>c.id===home.id).upgradeUnits,0,'wounded city heals before upgrading');
  assert.ok(updated.game.cities.find(c=>c.id===home.id).hp>city.hp);
  assert.deepEqual(updated.game,shared.game);
  const after=await x.call(x.host,'action',input);assert.deepEqual(after.game,updated.game,'replaying the same action after consumption never feeds twice');
  const living=updated.game.units.filter(u=>u.owner===0),feed={requestId:'feed_home_upgrade',unitIds:living.map(u=>u.id),target:input.target,cityId:home.id};
  const nextRow=await x.store.get(x.code,x.now()),nextCity=nextRow.room.engine.cities.find(c=>c.id===home.id);nextCity.hp=nextCity.maxHp;
  await x.store.cas(x.code,nextRow.revision,nextRow.room,nextRow.expiresAt);
  await x.call(x.host,'action',feed);x.tick(2000);const grown=await x.call(x.guest,'state'),grownCity=grown.game.cities.find(c=>c.id===home.id);
  assert.equal(grownCity.upgradeUnits,living.length);assert.ok(grownCity.radius>home.radius);assert.ok(grownCity.maxHp>home.maxHp);
  const restored=new InkWarRoomService(x.store,x.now);assert.deepEqual((await restored.request(x.code,x.host.token,'state')).game,grown.game);
});

test('automatic counterattacks are shared and persisted; assault soldiers reject manual commands atomically',async()=>{
  const x=await setup();await x.start();
  const row=await x.store.get(x.code,x.now()),game=row.room.engine;
  game.cities.find(c=>c.owner===-1).owner=1;
  game.players[0].comeback.pressure[0]=5.9;
  await x.store.cas(x.code,row.revision,row.room,row.expiresAt);
  x.tick(100);const triggered=await x.call(x.host,'state'),shared=await x.call(x.guest,'state');
  assert.deepEqual(triggered.game,shared.game);assert.equal(triggered.game.players[0].comeback.used[0],true);
  assert.equal(triggered.game.events.filter(e=>e.type==='skill').length,1);
  const next=await x.store.get(x.code,x.now());releaseComebackSkill(next.room.engine,0,'rush');
  await x.store.cas(x.code,next.revision,next.room,next.expiresAt);
  const state=await x.call(x.host,'state'),troop=state.game.units.find(u=>u.uncontrollable);
  assert.ok(troop);await assert.rejects(x.call(x.host,'action',{requestId:'cannot_control_assault',unitIds:[troop.id],target:point(state.game)}),/突击兵/);
  const restored=new InkWarRoomService(x.store,x.now);
  assert.deepEqual((await restored.request(x.code,x.guest.token,'state')).game,state.game);
});

test('losing the penultimate city summons 200 divine troops once, shared by both viewers and restored with command deduplication',async()=>{
  const x=await setup();await x.start();const row=await x.store.get(x.code,x.now()),s=row.room.engine,city=s.cities.find(c=>c.owner===-1);
  city.owner=0;city.country='秦';city.hp=.1;for(const c of s.cities)c.spawnProgress=-10000;
  s.players[0].comeback.used=[true,true,true];s.players[0].comeback.lastAt=0;
  s.units.push({id:s.nextUnitId++,owner:1,type:'blade',glyph:'刀',x:city.x+10,y:city.y,hp:100000,maxHp:100000,target:null,attackCooldown:0,facing:0,attacking:false});
  await x.store.cas(x.code,row.revision,row.room,row.expiresAt);x.tick(100);
  const state=await x.call(x.host,'state'),shared=await x.call(x.guest,'state');assert.deepEqual(state.game,shared.game);
  const troops=state.game.units.filter(u=>u.owner===0);assert.equal(troops.length,200);assert.equal(state.game.players[0].lastSkill.id,'divine');
  const input={requestId:'divine_reinforcement_order',unitIds:troops.map(u=>u.id),target:point(state.game)};
  const first=await x.call(x.host,'action',input),retry=await x.call(x.host,'action',input);assert.deepEqual(first.game,retry.game);
  const restored=new InkWarRoomService(x.store,x.now),again=await restored.request(x.code,x.guest.token,'state');assert.deepEqual(first.game,again.game);
  assert.equal(again.game.events.filter(e=>e.skillId==='divine').length,1);assert.equal(again.game.players[0].comeback.rescueUsed,true);
});

test('AI slots are explicit and human seats must be occupied',async()=>{
  let now=100000;const service=new InkWarRoomService(new MemoryInkWarRoomStore(),()=>now);
  const empty=await service.create({name:'房主',playerCount:4});
  await service.request(empty.room.code,empty.token,'ready',{ready:true,cardId:empty.room.cardOptions[0].id});
  await assert.rejects(service.request(empty.room.code,empty.token,'start'),/坐满/);
  const room=await service.create({name:'单人联机测试',playerCount:4,aiCount:3,mapId:'river'});
  assert.equal(room.room.roster.filter(player=>player.ai).length,3);
  await service.request(room.room.code,room.token,'ready',{ready:true,cardId:room.room.cardOptions[0].id});
  assert.equal((await service.request(room.room.code,room.token,'start')).game.players.length,4);
  await assert.rejects(service.request(room.room.code,'','join',{name:'迟到',seatKey:seatKey()}),/开始/);
  await assert.rejects(service.create({name:'错误配置',playerCount:8}),/2–7/);
  await assert.rejects(service.create({name:'错误配置',playerCount:2,aiCount:2}),/AI/);
});

test('retries recover a seat during battle and host migration preserves reconnect credentials',async()=>{
  const x=await setup();await x.start();
  const rejoined=await x.service.request(x.code,'','join',{name:'赤墨',seatKey:x.key});
  assert.equal(rejoined.room.selfId,x.guest.room.selfId);assert.equal(rejoined.room.roster.length,2);
  x.tick(HOST_MIGRATION_MS+1);const state=await x.call(x.guest,'state');
  assert.equal(state.room.isOwner,true);assert.equal(state.room.roster[0].connected,false);
  assert.equal((await x.call(x.host,'state')).room.isOwner,false);
});

test('10 Hz wall time drives production and moves troops; inactive catch-up is bounded',async()=>{
  const x=await setup();const started=await x.start();
  assert.equal(started.game.units.length,0);
  x.tick(50);assert.equal((await x.call(x.host,'state')).game.tick,started.game.tick);
  x.tick(50);let state=await x.call(x.host,'state');assert.equal(state.game.tick,started.game.tick+1);
  x.tick(60000);state=await x.call(x.host,'state');assert.equal(state.game.tick,started.game.tick+1+MAX_CATCHUP_MS/100);
  assert.ok(state.game.units.length>0,'cities must produce the first troops after time advances');
  assert.equal((await x.call(x.host,'state')).game.tick,state.game.tick);
  state=await x.troops();const unit=state.game.units.find(item=>item.owner===0),initial={x:unit.x,y:unit.y};
  await x.call(x.host,'action',{requestId:'march_clock_test',unitIds:[unit.id],target:point(state.game)});
  x.tick(500);const moved=(await x.call(x.host,'state')).game.units.find(item=>item.id===unit.id);
  assert.ok(!moved||Math.hypot(moved.x-initial.x,moved.y-initial.y)>0);
});

test('simultaneous orders survive CAS without requiring stale snapshot versions',async()=>{
  const x=await setup();await x.start();const before=await x.troops();
  const mine=before.game.units.find(item=>item.owner===0),theirs=before.game.units.find(item=>item.owner===1);
  const targetA=point(before.game,.35,.35),targetB=point(before.game,.65,.65);
  await Promise.all([
    x.call(x.host,'action',{version:-99,requestId:'simultaneous_host',unitIds:[mine.id],target:targetA}),
    x.call(x.guest,'action',{version:-99,requestId:'simultaneous_guest',unitIds:[theirs.id],target:targetB}),
  ]);
  const state=await x.call(x.host,'state');
  assert.deepEqual(state.game.units.find(item=>item.id===mine.id).target,targetA);
  assert.deepEqual(state.game.units.find(item=>item.id===theirs.id).target,targetB);
  await assert.rejects(x.call(x.host,'action',{requestId:'steal_enemy_unit',unitIds:[theirs.id],target:targetA}),/军队|指挥|所属|玩家|自己|敌/);
});

test('request IDs deduplicate simultaneous and later retries without replaying old commands',async()=>{
  const x=await setup();await x.start();const state=await x.troops(),unit=state.game.units.find(item=>item.owner===0);
  const body={requestId:'same_order_retry',unitIds:[unit.id],target:point(state.game,.35,.35)},newTarget=point(state.game,.45,.45);
  const results=await Promise.all([x.call(x.host,'action',body),x.call(x.host,'action',body)]);
  assert.equal(results[0].room.version,results[1].room.version);
  const newer=await x.call(x.host,'action',{...body,requestId:'new_order_retry',target:newTarget});
  const retry=await x.call(x.host,'action',body);assert.equal(retry.room.version,newer.room.version);
  assert.deepEqual(retry.game.units.find(item=>item.id===unit.id).target,newTarget);
  await assert.rejects(x.call(x.host,'action',{...body,target:point(state.game)}),/同一/);
});

test('voluntary departure surrenders, migrates host, and finished rooms can replay after card selection',async()=>{
  const x=await setup();const initial=await x.start();await x.call(x.host,'leave');
  const ended=await x.call(x.guest,'state');assert.equal(ended.room.isOwner,true);assert.equal(ended.game.winner,1);assert.equal(ended.room.status,'finished');
  assert.ok(!ended.game.units.some(item=>item.owner===0));assert.ok(!ended.game.cities.some(item=>item.owner===0));
  await assert.rejects(x.call(x.host,'state'),/身份/);
  await x.call(x.guest,'rematch');
  const newcomer=await x.service.request(x.code,'','join',{name:'新墨',seatKey:seatKey()});
  await x.ready(x.guest);await x.ready(newcomer);
  const restarted=await x.call(x.guest,'start');assert.equal(restarted.room.round,2);assert.equal(restarted.room.status,'playing');
  assert.equal(restarted.game.units.length,0,'a rematch must also begin without deployed soldiers');
  assert.notEqual(restarted.game.seed,initial.game.seed);
  assert.notDeepEqual(geometry(restarted.game).cities,geometry(initial.game).cities,'the next round must generate a fresh city layout');
  x.tick(ROOM_TTL+1);await assert.rejects(x.call(x.guest,'state'),/过期/);
});

test('configure is host-only, respects occupied seats, and cancels readiness',async()=>{
  const x=await setup({playerCount:3});await x.ready(x.host);await x.ready(x.guest);
  await assert.rejects(x.call(x.guest,'configure',{aiCount:1}),/房主/);
  await assert.rejects(x.call(x.host,'configure',{aiCount:2}),/真人/);
  const changed=await x.call(x.host,'configure',{aiCount:1});assert.equal(changed.room.aiCount,1);assert.ok(changed.room.roster.filter(item=>!item.ai).every(item=>!item.ready));
  await x.ready(x.host);await x.ready(x.guest);assert.equal((await x.call(x.host,'start')).game.players.length,3);
});

test('four real players use distinct authenticated armies and an eliminated player can leave',async()=>{
  const x=await setup({playerCount:4});
  const third=await x.service.request(x.code,'','join',{name:'赭墨',seatKey:seatKey()});
  const fourth=await x.service.request(x.code,'','join',{name:'紫墨',seatKey:seatKey()});
  await Promise.all([x.ready(x.host),x.ready(x.guest),x.ready(third),x.ready(fourth)]);
  const state=await x.call(x.host,'start');assert.equal(state.game.players.length,4);assert.equal(state.room.aiCount,0);
  const row=await x.store.get(x.code,x.now());surrenderPlayer(row.room.engine,0);
  assert.equal(row.room.engine.status,'playing');await x.store.cas(x.code,row.revision,row.room,row.expiresAt);
  assert.deepEqual(await x.call(x.host,'leave'),{left:true});
  assert.equal((await x.call(x.guest,'state')).room.isOwner,true);
});

test('client-generated credentials recover create retries and empty lobbies elect a new host',async()=>{
  const service=new InkWarRoomService(new MemoryInkWarRoomStore(),()=>100000),key=seatKey();
  const original=await service.create({name:'原房主',seatKey:key}),retry=await service.create({name:'原房主',seatKey:key});
  assert.equal(original.room.code,retry.room.code);assert.equal(original.room.selfId,retry.room.selfId);
  await service.request(original.room.code,key,'leave');
  const replacement=await service.request(original.room.code,'','join',{name:'新房主',seatKey:seatKey()});
  assert.equal(replacement.room.isOwner,true);assert.equal(replacement.room.selfSeat,0);
});

async function casualtySetup(){
  const x=await setup();await x.start();await x.troops([0,1],2);
  const row=await x.store.get(x.code,x.now()),mine=row.room.engine.units.filter(unit=>unit.owner===0),enemy=row.room.engine.units.find(unit=>unit.owner===1);
  const fallen=mine[0],survivor=mine[1];
  const world={width:row.room.engine.width,height:row.room.engine.height};let fight=null;
  for(let y=60;y<world.height-60&&!fight;y+=80)for(let px=60;px<world.width-60;px+=80){
    const candidate={x:px,y};
    if(row.room.engine.cities.every(city=>Math.hypot(city.x-candidate.x,city.y-candidate.y)>160)&&row.room.engine.units.filter(unit=>unit.id!==fallen.id&&unit.id!==enemy.id).every(unit=>Math.hypot(unit.x-candidate.x,unit.y-candidate.y)>120)){fight=candidate;break;}
  }
  assert.ok(fight,'the casualty fixture needs open ground on the generated map');
  Object.assign(fallen,{...fight,hp:0.1,type:'blade',attackCooldown:100,target:null});
  Object.assign(enemy,{x:fight.x+5,y:fight.y,type:'blade',attackCooldown:0,target:null});
  await x.store.cas(x.code,row.revision,row.room,row.expiresAt);
  x.tick(200);
  return {...x,world,fallen:fallen.id,survivor:survivor.id,enemy:enemy.id};
}

test('a selected unit can die during advance while surviving troops still receive the whole order',async()=>{
  const x=await casualtySetup(),target=point(x.world,.45,.45),laterTarget=point(x.world,.35,.35);
  const result=await x.call(x.host,'action',{requestId:'casualty_during_order',unitIds:[x.fallen,x.survivor],target});
  assert.ok(!result.game.units.some(unit=>unit.id===x.fallen));
  assert.deepEqual(result.game.units.find(unit=>unit.id===x.survivor).target,target);
  assert.ok(!JSON.stringify(result).includes('retiredUnits'));
  const later=await x.call(x.host,'action',{requestId:'casualty_stale_order',unitIds:[x.fallen,x.survivor],target:laterTarget});
  assert.deepEqual(later.game.units.find(unit=>unit.id===x.survivor).target,laterTarget);
});

test('a racing poll can persist casualties before a stale order retries through CAS',async()=>{
  const x=await casualtySetup(),target=point(x.world,.45,.45);
  await Promise.all([
    x.call(x.guest,'state'),
    x.call(x.host,'action',{requestId:'poll_race_casualties',unitIds:[x.fallen,x.survivor],target}),
  ]);
  const result=await x.call(x.host,'state');
  assert.ok(!result.game.units.some(unit=>unit.id===x.fallen));
  assert.deepEqual(result.game.units.find(unit=>unit.id===x.survivor).target,target);
});

test('enemy, duplicate and forged IDs reject atomically even when mixed with own casualties',async()=>{
  const x=await casualtySetup();await x.call(x.host,'state');
  const request=unitIds=>x.call(x.host,'action',{requestId:'mixed_forged_order',unitIds,target:point(x.world,.45,.45)});
  await assert.rejects(request([x.fallen,x.survivor,x.enemy]),/己方/);
  await assert.rejects(request([x.fallen,x.survivor,0]),/己方/);
  await assert.rejects(request([x.survivor,x.survivor]),/有效/);
  const state=await x.call(x.host,'state');assert.equal(state.game.units.find(unit=>unit.id===x.survivor).target,null);
  const row=await x.store.get(x.code,x.now());row.room.engine.units.find(unit=>unit.id===x.enemy).hp=0;
  await x.store.cas(x.code,row.revision,row.room,row.expiresAt);x.tick(100);await x.call(x.host,'state');
  await assert.rejects(request([x.fallen,x.survivor,x.enemy]),/己方/);
});

test('orders for an entirely fallen group are deduplicated no-ops and very old missing IDs expire',async()=>{
  const x=await casualtySetup();await x.call(x.guest,'state');
  const input={requestId:'all_soldiers_fallen',unitIds:[x.fallen],target:point(x.world,.45,.45)};
  const result=await x.call(x.host,'action',input),retry=await x.call(x.host,'action',input);
  assert.equal(result.room.version,retry.room.version);
  assert.ok(!result.game.units.some(unit=>unit.id===x.fallen));
  await assert.rejects(x.call(x.host,'action',{...input,requestId:'fallen_bad_bounds',target:{x:-1,y:300}}),/地图/);
  x.tick(RECENT_UNIT_MS+1);
  await assert.rejects(x.call(x.host,'action',{...input,requestId:'old_fallen_command'}),/过期/);
  // A true network retry is still recognized after casualty metadata expires.
  assert.equal((await x.call(x.host,'action',input)).room.status,'playing');
});

test('seven authenticated human seats can prepare and issue simultaneous commands to separate armies',async()=>{
  const x=await setup({playerCount:7}),players=[x.host,x.guest];
  for(const name of ['楚将','赵将','韩将','燕将','魏将'])players.push(await x.service.request(x.code,'','join',{name,seatKey:seatKey()}));
  assert.deepEqual(players.map(player=>player.room.selfSeat),[0,1,2,3,4,5,6]);
  await assert.rejects(x.service.request(x.code,'','join',{name:'第八军',seatKey:seatKey()}),/已满/);
  await Promise.all(players.map(player=>x.ready(player)));
  const started=await x.call(x.host,'start');assert.equal(started.game.players.length,7);assert.equal(started.room.aiCount,0);
  assert.equal(started.game.units.length,0);
  assert.equal(new Set(started.game.players.map(player=>player.color)).size,7);
  const deployed=await x.troops(players.map(player=>player.room.selfSeat));
  const selected=players.map((player,seat)=>({player,unit:deployed.game.units.find(unit=>unit.owner===seat),target:point(deployed.game,.25+seat*.08,.3+seat*.06)}));
  await Promise.all(selected.map(({player,unit,target},seat)=>x.call(player,'action',{requestId:`seven_armies_order_${seat}`,unitIds:[unit.id],target})));
  const latest=await x.call(x.host,'state');
  for(const {unit,target}of selected)assert.deepEqual(latest.game.units.find(item=>item.id===unit.id).target,target);
  for(let seat=0;seat<7;seat++)await assert.rejects(x.call(players[seat],'action',{requestId:`seven_enemy_reject_${seat}`,unitIds:[selected[(seat+1)%7].unit.id],target:point(latest.game)}),/己方/);
});

test('seven-player rooms can explicitly reserve six AI seats while rejecting impossible configurations',async()=>{
  const service=new InkWarRoomService(new MemoryInkWarRoomStore(),()=>100000);
  const host=await service.create({name:'秦将',playerCount:7,aiCount:6});
  assert.equal(host.room.roster.filter(player=>player.ai).length,6);
  assert.deepEqual(host.room.roster.filter(player=>player.ai).map(player=>player.seat),[1,2,3,4,5,6]);
  await service.request(host.room.code,host.token,'ready',{ready:true,cardId:host.room.cardOptions[0].id});
  assert.equal((await service.request(host.room.code,host.token,'start')).game.players.length,7);
  await assert.rejects(service.create({name:'错误配置',playerCount:7,aiCount:7}),/AI/);
});

test('concurrent service instances advance a seven-player room once without rejected CAS retries',async()=>{
  const x=await setup({playerCount:7}),players=[x.host,x.guest];
  for(let seat=2;seat<7;seat++)players.push(await x.service.request(x.code,'','join',{name:`城主${seat}`,seatKey:seatKey()}));
  await Promise.all(players.map(player=>x.ready(player)));await x.call(x.host,'start');
  let reads=0,commits=0,rejected=0;const get=x.store.get.bind(x.store),cas=x.store.cas.bind(x.store);
  x.store.get=async(...args)=>{reads++;return get(...args);};
  x.store.cas=async(...args)=>{commits++;const committed=await cas(...args);if(!committed)rejected++;return committed;};
  x.tick(200);
  const snapshots=await Promise.all(players.map(player=>new InkWarRoomService(x.store,x.now).request(x.code,player.token,'state')));
  assert.ok(snapshots.every(snapshot=>snapshot.game.tick===2&&snapshot.room.serverNow===x.now()));
  assert.ok(snapshots.every(snapshot=>JSON.stringify(geometry(snapshot.game))===JSON.stringify(geometry(snapshots[0].game))),'all seven clients must see identical seeded map geometry');
  assert.equal(new Set(snapshots.map(snapshot=>snapshot.room.version)).size,1);
  assert.equal(reads,7,'each independently created API service should read the room once');
  assert.equal(commits,1,'one wall-time advance should produce one persistence commit');
  assert.equal(rejected,0,'simultaneous polls must not compute and discard duplicate simulation');
  assert.ok(snapshots.every(snapshot=>snapshot.game.units.length===0),'the first 200 ms must not deploy a starting garrison');
  x.tick(1800);
  const produced=await Promise.all(players.map(player=>new InkWarRoomService(x.store,x.now).request(x.code,player.token,'state')));
  assert.ok(produced.every(snapshot=>snapshot.game.tick===20&&snapshot.game.players.every(player=>snapshot.game.units.some(unit=>unit.owner===player.id))), 'all seven cities must naturally produce soldiers on the same authoritative clock');
  assert.equal(reads,14);assert.equal(commits,2);assert.equal(rejected,0);
});

test('queues isolate room codes and a rejected request does not block following reads',async()=>{
  const store=new MemoryInkWarRoomStore(),service=new InkWarRoomService(store,()=>100000);
  const first=await service.create({name:'甲房'}),second=await service.create({name:'乙房'});
  let release,started;const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;}),get=store.get.bind(store);
  store.get=async(code,...args)=>{if(code===first.room.code){started();await gate;}return get(code,...args);};
  const blocked=service.request(first.room.code,first.token,'state');await entered;
  let timer;
  try{
    const result=await Promise.race([new InkWarRoomService(store,()=>100000).request(second.room.code,second.token,'state'),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('another room was incorrectly blocked')),1000);})]);
    assert.equal(result.room.code,second.room.code);
  }finally{clearTimeout(timer);release();await blocked;}
  const results=await Promise.allSettled([service.request(first.room.code,'invalid-key','state'),service.request(first.room.code,first.token,'state')]);
  assert.equal(results[0].status,'rejected');assert.equal(results[0].reason.status,403);assert.equal(results[1].status,'fulfilled');
});

test('room queues retain CAS retry protection for writers outside the request queue',async()=>{
  const x=await setup();await x.start();const cas=x.store.cas.bind(x.store);let attempts=0;
  x.store.cas=async(...args)=>{if(++attempts===1)return false;return cas(...args);};
  x.tick(200);const result=await x.call(x.host,'state');
  assert.equal(attempts,2);assert.equal(result.game.tick,2);assert.equal(result.game.time,0.2);
});

test('the next round generates a larger fresh map after increasing player count and honors its full bounds',async()=>{
  const x=await setup(),initial=await x.start();await x.call(x.guest,'leave');
  const finished=await x.call(x.host,'state');assert.equal(finished.room.status,'finished');
  await x.call(x.host,'configure',{playerCount:7,aiCount:6});await x.ready(x.host);
  const expanded=await x.call(x.host,'start');
  assert.equal(expanded.room.round,2);assert.equal(expanded.room.mapId,initial.room.mapId);
  assert.notEqual(expanded.game.seed,initial.game.seed);
  assert.ok(expanded.game.width>initial.game.width&&expanded.game.height>initial.game.height,'additional factions must expand both dimensions');
  assert.ok(expanded.game.cities.length>initial.game.cities.length,'the expanded battlefield must contain more cities');
  assert.ok(expanded.game.cities.every(city=>city.x>0&&city.x<expanded.game.width&&city.y>0&&city.y<expanded.game.height));
  const deployed=await x.troops([0]),unit=deployed.game.units.find(soldier=>soldier.owner===0),target={x:expanded.game.width-25,y:expanded.game.height-25};
  assert.ok(target.x>initial.game.width&&target.y>initial.game.height);
  const ordered=await x.call(x.host,'action',{requestId:'expanded_world_order',unitIds:[unit.id],target});
  assert.deepEqual(ordered.game.units.find(soldier=>soldier.id===unit.id).target,target);
  await assert.rejects(x.call(x.host,'action',{requestId:'outside_expanded_world',unitIds:[unit.id],target:{x:expanded.game.width+1,y:expanded.game.height/2}}),/地图/);
});
