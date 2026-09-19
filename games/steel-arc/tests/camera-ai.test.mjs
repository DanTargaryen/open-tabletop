import test from 'node:test';
import assert from 'node:assert/strict';
import {BattleCamera} from '../web/camera.js';
import {AI_LEVELS,createMatch,createTeamMatch,chooseAiAction,chooseTeamAiAction,chooseTankAiAction,seededRandom,finishTurn,finishTeamTurn,stepSupplyDrops,resolveTeamShot} from '../web/engine.js';
import {SteelArcRoomService,MemorySteelArcRoomStore} from '../server/rooms.mjs';

const tick=(camera,state,n=180,shots=[])=>{for(let i=0;i<n;i++)camera.update(state,shots,1/60);};
test('camera frames both tanks, stays stable during aim and returns to close movement',()=>{
  const state=createMatch({seed:12}),camera=new BattleCamera();tick(camera,state);
  for(const tank of Object.values(state.tanks)){
    const x=(tank.x-camera.x)*camera.zoom,y=(tank.y-camera.y)*camera.zoom;
    assert.ok(x>220&&x<1200,`tank x ${x}`);assert.ok(y>150&&y<560);
  }
  const frame={x:camera.x,y:camera.y,zoom:camera.zoom};
  state.tanks.player.heading=300;state.tanks.player.power=20;tick(camera,state);
  assert.ok(Math.abs(camera.x-frame.x)<.02);assert.ok(Math.abs(camera.zoom-frame.zoom)<.001);
  for(let i=0;i<120;i++){state.tanks.player.x+=.7;camera.update(state,[],1/60);}
  assert.ok(camera.zoom>.87);tick(camera,state);assert.ok(camera.zoom<.7);
});
test('shot holds the overview until its boundary, follows vertically and holds after impact',()=>{
  const state=createMatch(),camera=new BattleCamera();tick(camera,state);
  const before={x:camera.x,y:camera.y,zoom:camera.zoom};
  const p={x:1300,y:350,vx:20,vy:0,alive:true};tick(camera,state,30,[p]);
  assert.ok(Math.abs(camera.x-before.x)<.02);assert.equal(camera.zoom,before.zoom);
  p.y=-600;p.vy=-150;tick(camera,state,45,[p]);assert.ok(camera.y<before.y-100);
  p.alive=false;camera.update(state,[p],1/60);const hold={x:camera.x,y:camera.y};
  state.turn='enemy';state.completedTurns++;tick(camera,state,30,[]);assert.equal(camera.x,hold.x);assert.equal(camera.y,hold.y);
  tick(camera,state,120);assert.ok(camera.y>hold.y+100);
});
test('both AI entry points use the same planner at all three difficulties',()=>{
  for(const difficulty of Object.keys(AI_LEVELS)){
    const state=createMatch({seed:42,difficulty});state.turn='enemy';
    const plan=chooseAiAction(state,seededRandom(123));
    assert.deepEqual(plan,chooseTeamAiAction(state,'enemy',seededRandom(123)));
    assert.deepEqual(plan,chooseTankAiAction(state,'enemy',seededRandom(123)));
    assert.ok(plan.power>=20&&plan.power<=100&&plan.angle>=10&&plan.angle<=85);
  }
  assert.ok(AI_LEVELS.easy.angleError>AI_LEVELS.normal.angleError&&AI_LEVELS.normal.angleError>AI_LEVELS.hard.angleError);
});
test('team and solo supplies start airborne, use identical descent and reward rules',()=>{
  const solo=createMatch({seed:17}),team=createTeamMatch({seed:17});
  for(const state of [solo,team]){state.completedTurns=2;state.nextSupplyAt=3;}
  finishTurn(solo);finishTeamTurn(team);
  for(const state of [solo,team]){
    const supply=state.supplies[0];assert.equal(supply.landed,false);assert.equal(supply.dropProgress,0);
    stepSupplyDrops(state,.475);assert.equal(supply.dropProgress,.5);assert.equal(supply.landed,false);
    stepSupplyDrops(state,.475);assert.equal(supply.landed,true);assert.equal(supply.y,supply.targetY);
  }
  const state=createTeamMatch({seed:17});state.completedTurns=2;state.nextSupplyAt=3;
  const shot=resolveTeamShot(state,state.turn);assert.equal(shot.postSupplies[0].landed,false);assert.equal(state.supplies[0].landed,true);
});
test('room owner can set each AI difficulty, persisted into battle; guests cannot',async()=>{
  const service=new SteelArcRoomService(new MemorySteelArcRoomStore());const host=await service.create({name:'Host'}),code=host.room.code;
  const guest=await service.request(code,'','join',{name:'Guest',seatKey:'a'.repeat(48)});
  await assert.rejects(()=>service.request(code,guest.token,'ai',{slot:'B2',difficulty:'hard'}),{status:403});
  await assert.rejects(()=>service.request(code,host.token,'ai',{slot:'B2',difficulty:'invalid'}),{status:400});
  await service.request(code,host.token,'ai',{slot:'A2',difficulty:'easy'});
  const room=await service.request(code,host.token,'ai',{slot:'B2',difficulty:'hard'});
  assert.equal(room.room.seats.find(s=>s.slot==='B2').difficulty,'hard');
  await service.request(code,guest.token,'ready',{ready:true});const started=await service.request(code,host.token,'start');
  assert.equal(started.game.tanks.A2.difficulty,'easy');assert.equal(started.game.tanks.B2.difficulty,'hard');
});
