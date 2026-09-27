import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattleRenderer} from '../web/renderer.js';
import {createTeamMatch} from '../web/engine.js';

test('full-screen grading gradients are baked once, not repainted every frame',()=>{
  const previous=globalThis.OffscreenCanvas;let gradients=0,blits=0;
  const c={createRadialGradient(){gradients++;return {addColorStop(){}};},createLinearGradient(){gradients++;return {addColorStop(){}};},fillRect(){}};
  globalThis.OffscreenCanvas=class {getContext(){return c;}transferToImageBitmap(){return {};}};
  try{
    const renderer=createBattleRenderer({drawImage(){blits++;}});
    for(let frame=0;frame<120;frame++)renderer.drawVignette();
    assert.equal(gradients,2);assert.equal(blits,120);
  }finally{if(previous===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=previous;}
});

function harness(){
  const calls=[];
  const ctx=new Proxy({}, {get(target,key){return target[key]??((...args)=>{calls.push([key,...args]);return {addColorStop(){}};});}});
  return {renderer:createBattleRenderer(ctx),calls};
}

test('calibration-only explosion without damages does not stop rendering',()=>{
  const {renderer}=harness();
  renderer.setFrame({state:createTeamMatch({seed:42})});
  assert.doesNotThrow(()=>renderer.spawnExplosion({x:1280,y:520,radius:40,crater:32,weaponId:'calibration'}));
  assert.doesNotThrow(()=>{renderer.updateEffects(1/60);renderer.drawEffects();});
});

test('drawing aim dots preserves the live projectile for the same frame',()=>{
  const {renderer,calls}=harness(),state=createTeamMatch({seed:42});
  renderer.setFrame({state,projectiles:[{alive:true,x:700,y:200,vx:100,vy:20,weaponId:'calibration',trail:[]}]});
  renderer.drawAimDots({...state.tanks.A1,heading:60,power:70});
  renderer.drawProjectiles();
  assert.ok(calls.some(([name,x,y])=>name==='translate'&&x===700&&y===200));
});
test('the previous complete shot remains visible after the turn changes',()=>{
  const {renderer,calls}=harness(),state=createTeamMatch({seed:42});
  state.turn='B1';state.latestTrajectoryOwner='A1';state.lastTrajectories={A1:[[{x:50,y:100},{x:400,y:280}]]};
  renderer.setFrame({state,projectiles:[]});renderer.drawProjectiles();
  assert.ok(calls.some(([method,x,y,r])=>method==='arc'&&x===400&&y===280&&r===5));
});

test('visual damage referencing a removed tank is safe',()=>{
  const {renderer}=harness();
  renderer.setFrame({state:createTeamMatch({seed:42})});
  assert.doesNotThrow(()=>renderer.spawnExplosion({x:1280,y:520,radius:40,crater:32,weaponId:'calibration',damages:{removed:24}}));
});

test('aim preview uses fourteen shrinking dots without connecting strokes',()=>{
  const {renderer,calls}=harness(),state=createTeamMatch({seed:42});
  renderer.setFrame({state});renderer.drawAimDots(state.tanks.A1);
  const dots=calls.filter(([name])=>name==='arc');
  assert.equal(dots.length,14);assert.ok(dots[0][3]>dots.at(-1)[3]);
  assert.ok(dots.every(dot=>Number.isFinite(dot[3])));
  assert.equal(calls.some(([name])=>['stroke','lineTo','setLineDash'].includes(name)),false);
});
