import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stepGame,commandUnits,releaseComebackSkill,MAX_UNITS} from '../web/engine.js';
function soldier(s,owner,x,y){const u={id:s.nextUnitId++,owner,type:'blade',glyph:'刀',x,y,hp:100000,maxHp:100000,target:null,attackCooldown:10,facing:0,attacking:false};s.units.push(u);return u;}
function losePenultimateCity(n){const s=createGame({playerCount:n,seed:211,mapId:'plains'});for(const c of s.cities)c.spawnProgress=-10000;const city=s.cities.find(c=>c.owner===-1);city.owner=0;city.country='秦';city.hp=.1;const enemy=soldier(s,1,city.x+10,city.y);enemy.attackCooldown=0;return s;}
test('actual penultimate-city capture guarantees 200 controllable permanent soldiers immediately for all 2–7 factions, regardless of tiers and cooldown',()=>{
 for(let n=2;n<=7;n++){
 const s=losePenultimateCity(n);s.players[0].comeback.used=[true,true,true];s.players[0].comeback.lastAt=0;stepGame(s);
 assert.equal(s.cities.filter(c=>c.owner===0).length,1);assert.equal(s.players[0].lastSkill.id,'divine');assert.equal(s.players[0].comeback.rescueUsed,true);
 const troops=s.units.filter(u=>u.owner===0);assert.equal(troops.length,200);assert.ok(troops.every(u=>!u.uncontrollable&&u.expiresAt===undefined));assert.equal(s.reinforcements.length,0);
 const restored=structuredClone(s);stepGame(s);stepGame(restored);assert.deepEqual(s,restored);assert.equal(s.events.filter(e=>e.skillId==='divine').length,1);
 }
});
test('one-city opening and total elimination never summon divine soldiers; rescue does not repeat after recovery and another loss',()=>{
 const fresh=createGame();for(let i=0;i<200;i++)stepGame(fresh);assert.ok(fresh.players.every(p=>!p.comeback.rescueUsed));
 const doomed=losePenultimateCity(2);doomed.cities.find(c=>c.owner===0&&c.hp>.1).owner=-1;stepGame(doomed);assert.equal(doomed.players[0].alive,false);assert.ok(!doomed.events.some(e=>e.skillId==='divine'));
 const s=losePenultimateCity(2);stepGame(s);const regained=s.cities.find(c=>c.owner===-1);regained.owner=0;stepGame(s);regained.owner=1;s.players[0].comeback.losses.push(s.time);stepGame(s);assert.equal(s.events.filter(e=>e.skillId==='divine').length,1);
});
test('divine armies feed cities and prioritize a full-field reinforcement queue without exceeding the soldier budget',()=>{
 const s=losePenultimateCity(2);stepGame(s);const city=s.cities.find(c=>c.owner===0),unit=s.units.find(u=>u.owner===0);unit.x=city.x;unit.y=city.y;city.hp=city.maxHp-30;commandUnits(s,0,[unit.id],city,{cityId:city.id});stepGame(s);assert.ok(!s.units.some(u=>u.id===unit.id));assert.ok(city.hp>city.maxHp-30);
 const dense=createGame({playerCount:7});for(const c of dense.cities)c.spawnProgress=-10000;for(let owner=0;owner<7;owner++)for(let i=0;i<100;i++)soldier(dense,owner,12,12);
 releaseComebackSkill(dense,0,'celestial');dense.players[0].comeback.losses.push(0);stepGame(dense);
 const divine=dense.reinforcements[0];assert.ok(divine.emergency);assert.equal(divine.remaining,200);assert.equal(dense.units.length,MAX_UNITS);
 dense.units=dense.units.filter(u=>u.owner!==1&&u.owner!==2);stepGame(dense);assert.equal(divine.remaining,0);assert.equal(divine.created,200);assert.equal(dense.units.length,MAX_UNITS);assert.ok(dense.reinforcements.some(w=>w.remaining===100&&!w.emergency));
});
