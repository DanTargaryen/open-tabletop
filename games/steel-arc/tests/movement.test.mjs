import test from 'node:test';
import assert from 'node:assert/strict';
import {createTeamMatch,moveTank} from '../web/engine.js';
import {stepTankControls,CONTROL_CONFIG} from '../web/controls.js';
import {PredictedMovement} from '../web/movement.js';
import {MemorySteelArcRoomStore,SteelArcRoomService} from '../server/rooms.mjs';
test('shared controls move at solo speed, independent of key repeat',()=>{
  const state=createTeamMatch({seed:1});state.terrain.points.fill(500);
  const x=state.tanks.A1.x;
  for(let i=0;i<60;i++)stepTankControls(state,'A1',new Set(['KeyD']),1/60);
  assert.ok(Math.abs(state.tanks.A1.x-x-CONTROL_CONFIG.moveSpeed)<1e-8);
});
test('delayed movement acknowledgement preserves later inputs without a position snap',()=>{
  const server=createTeamMatch({seed:1});server.terrain.points.fill(500);
  const prediction=new PredictedMovement();prediction.accept(server,'A1');
  for(let i=0;i<6;i++)prediction.record(stepTankControls(prediction.state,'A1',new Set(['KeyD']),1/60).steps);
  const batch=prediction.batch();
  for(let i=0;i<6;i++)prediction.record(stepTankControls(prediction.state,'A1',new Set(['KeyA']),1/60).steps);
  const before=prediction.state.tanks.A1.x;
  for(const input of batch)moveTank(server,'A1',input.distance);
  prediction.acknowledge(batch);prediction.accept(server,'A1');
  assert.ok(Math.abs(prediction.state.tanks.A1.x-before)<1e-8);
  assert.equal(prediction.pending.length,6);
  server.turn='B1';server.completedTurns++;
  prediction.accept(server,'A1');assert.equal(prediction.pending.length,0);
});
test('server replays frame steps exactly and rejects over-limit batches without moving',async()=>{
  const service=new SteelArcRoomService(new MemorySteelArcRoomStore());
  const owner=await service.create({name:'Host'}),code=owner.room.code;
  await service.request(code,owner.token,'ai',{slot:'B1',enabled:true});
  const started=await service.request(code,owner.token,'start');
  const expected=structuredClone(started.game),steps=[1.1,1.2,1.3,-1.1,-1.2];
  for(const distance of steps)moveTank(expected,'A1',distance);
  const result=await service.request(code,owner.token,'action',{type:'move',steps,version:started.room.version,requestId:'movement001'});
  assert.deepEqual(result.game.tanks.A1,expected.tanks.A1);
  await assert.rejects(()=>service.request(code,owner.token,'action',{type:'move',steps:[20,20],version:result.room.version,requestId:'movement002'}),{status:400});
  const after=await service.request(code,owner.token,'state');assert.deepEqual(after.game.tanks.A1,result.game.tanks.A1);
});
