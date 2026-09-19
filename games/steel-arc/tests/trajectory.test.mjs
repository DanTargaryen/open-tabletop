import test from 'node:test';
import assert from 'node:assert/strict';
import {createTeamMatch,resolveTeamShot,fireWeapon,stepProjectile,finishTeamTurn} from '../web/engine.js';
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
