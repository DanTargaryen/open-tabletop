import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stepGame,aiCommand,AI_DIFFICULTIES} from '../web/engine.js';
function advance(s,seconds,bot){for(let i=0;i<seconds*10;i++){stepGame(s);if(bot!==undefined)aiCommand(s,bot);}}
test('beginner and normal AI give an opening window for every 2–7 faction count with identical economic and combat rules',()=>{
 for(let n=2;n<=7;n++)for(const profile of AI_DIFFICULTIES.filter(d=>d.id!=='hard')){
  const s=createGame({playerCount:n,seed:123,aiDifficulty:profile.id}),plain=createGame({playerCount:n,seed:123});
  advance(s,profile.opening-.1,1);advance(plain,profile.opening-.1);
  assert.deepEqual(s.cities,plain.cities);assert.deepEqual(s.units,plain.units);assert.ok(!s.players[1].aiLastOrder);
 }
 assert.throws(()=>createGame({aiDifficulty:'unknown'}),/难度/);
});
test('beginner AI launches a readable group, leaves defenders, limits reaction cadence and retains orders through save/restore',()=>{
 const s=createGame({seed:25,mapId:'plains',aiDifficulty:'beginner'});advance(s,18);aiCommand(s,1);
 const owner=s.units.filter(u=>u.owner===1),marchers=owner.filter(u=>u.target);assert.ok(marchers.length>=6);assert.ok(owner.filter(u=>!u.target).length>=3);
 const last=s.players[1].aiLastOrder,targets=owner.map(u=>[u.id,u.target]);stepGame(s);aiCommand(s,1);
 assert.equal(s.players[1].aiLastOrder,last);assert.deepEqual(owner.map(u=>[u.id,u.target]),targets);
 const restored=structuredClone(s);advance(s,12,1);advance(restored,12,1);assert.deepEqual(s,restored);
});
test('challenge AI retains the original fast response and lower modes never change human orders',()=>{
 const a=createGame({seed:25}),b=createGame({seed:25,aiDifficulty:'hard'});advance(a,2);advance(b,2);aiCommand(a,1);aiCommand(b,1);assert.deepEqual(a,b);assert.ok(a.units.find(u=>u.owner===1).target);
 const easy=createGame({seed:25,aiDifficulty:'beginner'});advance(easy,24);const human=structuredClone(easy.units.filter(u=>u.owner===0));aiCommand(easy,1);assert.deepEqual(easy.units.filter(u=>u.owner===0),human);
});
