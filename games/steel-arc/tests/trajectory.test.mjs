import test from 'node:test';
import assert from 'node:assert/strict';
import {createTeamMatch,resolveTeamShot,fireWeapon,stepProjectile,finishTeamTurn} from '../web/engine.js';
import {beginTrajectory,recordTrajectory,finishTrajectory} from '../web/trajectory.js';
test('previous trajectory persists while firing again and is isolated per tank',()=>{
  const state=createTeamMatch({seed:12});resolveTeamShot(state,'A1');
  const previous=structuredClone(state.lastTrajectories.A1);
  assert.ok(previous[0].length>2);assert.ok(previous[0].length<=512);
  resolveTeamShot(state,'B1');assert.deepEqual(state.lastTrajectories.A1,previous);
  state.turn='A1';state.phase='aim';
  const [shot]=fireWeapon(state,'A1');stepProjectile(shot,state,1/120);
  assert.deepEqual(state.lastTrajectories.A1,previous);
  finishTeamTurn(state);assert.notDeepEqual(state.lastTrajectories.A1,previous);
  assert.equal(createTeamMatch({seed:12}).lastTrajectories,undefined);
});
test('trajectory stays complete through long flights and remembers the most recent shooter',()=>{
  const state=createTeamMatch({seed:13});beginTrajectory(state,'A1');
  const projectile={owner:'A1',x:0,y:100,alive:true};
  for(let i=0;i<900;i++){projectile.x=i*20;recordTrajectory(state,projectile);}
  projectile.alive=false;projectile.x=18000;projectile.y=312;recordTrajectory(state,projectile);finishTrajectory(state);
  const path=state.lastTrajectories.A1[0];
  assert.ok(path.length<=512);assert.deepEqual(path[0],{x:0,y:100});
  assert.deepEqual(path.at(-1),{x:18000,y:312});assert.equal(state.latestTrajectoryOwner,'A1');
});
