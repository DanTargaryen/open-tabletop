import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stepGame,commandUnits,releaseComebackSkill,COMEBACK_SKILLS,productionPower,MAX_UNITS} from '../web/engine.js';
import {comebackPressure} from '../web/balance.js';
const advance=(s,seconds)=>{for(let i=0;i<seconds*10;i++)stepGame(s);return s;};
function fixture(n,own=2,others=3){
  const s=createGame({playerCount:n,seed:170+n,mapId:'plains'}),neutral=s.cities.filter(c=>c.owner===-1);let index=0;
  for(let id=0;id<n;id++)for(let k=1;k<(id===0?own:others);k++)neutral[index++].owner=id;
  for(const c of s.cities)c.spawnProgress=-10000;
  return s;
}
function army(s,owner,count,x=12,y=12){
  for(let i=0;i<count;i++)s.units.push({id:s.nextUnitId++,owner,type:'blade',glyph:'刀',x,y,hp:100000,maxHp:100000,target:null,attackCooldown:10,facing:0,attacking:false});
}
test('all 2–7 faction counts progress through each counterattack tier before losing their last city',()=>{
  for(let n=2;n<=7;n++){
    const s=fixture(n);assert.equal(s.cities.filter(c=>c.owner===0).length,2);
    // Hold territory constant: successful tier-two raids otherwise erase the
    // deficit, correctly preventing a subsequent emergency skill.
    for(const city of s.cities)city.hp=city.maxHp=1e9;
    advance(s,6);assert.deepEqual(s.players[0].comeback.used,[true,false,false],`${n}: first tier at initial sustained expansion deficit`);
    advance(s,20);assert.deepEqual(s.players[0].comeback.used,[true,true,false],`${n}: second tier after cooldown`);
    const neutrals=s.cities.filter(c=>c.owner===-1);for(let id=1;id<n;id++){const c=neutrals.shift();c.owner=id;c.spawnProgress=-10000;}
    army(s,1,120);advance(s,20);assert.deepEqual(s.players[0].comeback.used,[true,true,true],`${n}: third tier when both economy and army lag`);
    const casts=s.events.filter(e=>e.type==='skill'&&e.playerId===0);assert.deepEqual(casts.map(e=>e.tier),[1,2,3]);
    assert.ok(casts[1].tick-casts[0].tick>=200&&casts[2].tick-casts[1].tick>=200);
    advance(s,30);assert.equal(s.events.filter(e=>e.type==='skill'&&e.playerId===0).length,3);assert.ok(s.units.length<=MAX_UNITS);
  }
});
test('opening zero armies and one isolated multiplayer capture do not hand skills to every other faction',()=>{
  for(let n=2;n<=7;n++){
    const s=fixture(n,1,1);advance(s,20);assert.ok(s.players.every(p=>p.comeback.used.every(v=>!v)));
    if(n>=3){s.cities.find(c=>c.owner===-1).owner=1;advance(s,10);assert.ok(s.players.every(p=>p.comeback.used.every(v=>!v)));}
  }
  const s=fixture(4,2,2);army(s,1,100);assert.deepEqual(comebackPressure(s,0),[false,false,false],'low army from feeding alone never qualifies');
});
test('recapturing territory clears emergency pressure rather than awarding an unnecessary third skill',()=>{
  const s=fixture(6);advance(s,26);
  assert.equal(s.players[0].lastSkill.id,'deception');
  const neutrals=s.cities.filter(c=>c.owner===-1);for(let id=1;id<6;id++)neutrals.shift().owner=id;
  army(s,1,120);advance(s,20);
  assert.equal(s.cities.filter(c=>c.owner===0).length,3,'the automatic raid recovers a city');
  assert.deepEqual(s.players[0].comeback.used,[true,true,false]);
  assert.equal(s.players[0].comeback.pressure[2],0);
});
test('resolve, walls and thunder change health immediately and timed bonuses expire',()=>{
  const s=fixture(2,1,1),home=s.cities.find(c=>c.owner===0);army(s,0,1);army(s,1,1,home.x+50,home.y);
  const own=s.units[0],enemy=s.units[1];own.hp=10;home.hp=home.maxHp*.2;
  releaseComebackSkill(s,0,'resolve');assert.equal(own.hp,own.maxHp);assert.equal(s.players[0].battleBuffs.valorUntil,12);
  releaseComebackSkill(s,0,'walls');assert.equal(home.hp,home.maxHp*.5);assert.equal(s.players[0].battleBuffs.wallsUntil,12);
  releaseComebackSkill(s,0,'thunder');assert.equal(enemy.hp,45000);assert.equal(enemy.slowUntil,8);
  releaseComebackSkill(s,0,'lightMarch');releaseComebackSkill(s,0,'muster');releaseComebackSkill(s,0,'firstStrike');
  advance(s,13);assert.ok(Object.values(s.players[0].battleBuffs).every(until=>until<s.time));
});
test('economy grows sublinearly for every map city count and newly conquered cities need five seconds to recruit',()=>{
  assert.deepEqual([1,2,3,4].map(productionPower),[1,1.6,2.1,2.5]);
  for(let n=2;n<=28;n++){assert.ok(productionPower(n)>productionPower(n-1));assert.ok(productionPower(n)<n);}
  const s=fixture(2,1,1),city=s.cities.find(c=>c.owner===-1),home=s.cities.find(c=>c.owner===0);home.spawnProgress=0;
  city.owner=0;city.readyAt=5;city.spawnProgress=0;advance(s,4.9);assert.equal(city.spawnCount,0);assert.equal(city.spawnProgress,0);
  advance(s,2.3);assert.ok(city.spawnCount>=1);
});
test('all twelve skill effects execute deterministically and reinforcements respect total soldier budget',()=>{
  assert.deepEqual(COMEBACK_SKILLS.map(s=>s.tier),[1,1,1,1,2,2,2,2,2,3,3,3]);
  for(const skill of COMEBACK_SKILLS){
    const a=fixture(3,1,1);army(a,0,10);army(a,1,20);const b=structuredClone(a);
    releaseComebackSkill(a,0,skill.id);releaseComebackSkill(b,0,skill.id);advance(a,2);advance(b,2);assert.deepEqual(a,b,skill.id);assert.equal(a.players[0].lastSkill.id,skill.id);assert.ok(a.units.length<=MAX_UNITS);
  }
});
test('ghosts remove sixty percent from every army including the caster and temporary assault troops',()=>{
  const s=fixture(7,1,1);for(let id=0;id<7;id++)army(s,id,10,20+id*200,20);
  s.units[0].uncontrollable=true;releaseComebackSkill(s,0,'ghosts');
  for(let id=0;id<7;id++)assert.equal(s.units.filter(u=>u.owner===id).length,4);
  assert.ok(s.cities.every(c=>c.hp===c.maxHp));
});
test('rush reserves 120 fast uncontrollable soldiers, attacks at most two enemy cities and expires after twenty seconds',()=>{
  const s=fixture(4,1,1);releaseComebackSkill(s,0,'rush');advance(s,1.2);
  const troops=s.units.filter(u=>u.uncontrollable);assert.equal(troops.length,120);assert.ok(troops.every(u=>u.speedMultiplier===3.5));
  assert.equal(new Set(troops.map(u=>u.assaultCityId)).size,2);assert.ok(troops.every(u=>s.cities.find(c=>c.id===u.assaultCityId).owner!==-1));
  const before=structuredClone(s);assert.throws(()=>commandUnits(s,0,[troops[0].id],s.cities[0],{cityId:s.cities[0].id}),/突击兵/);assert.deepEqual(s,before);
  advance(s,20);assert.ok(!s.units.some(u=>u.uncontrollable));
});
test('celestial armies are permanent, controllable and can feed a friendly city; full battlefields queue instead of overflow',()=>{
  const s=fixture(3,1,1);releaseComebackSkill(s,0,'celestial');advance(s,1.2);const troops=s.units.filter(u=>u.owner===0);assert.equal(troops.length,100);assert.ok(troops.every(u=>!u.uncontrollable&&u.expiresAt===undefined));
  const city=s.cities.find(c=>c.owner===0);city.hp-=25;const u=troops[0];u.x=city.x;u.y=city.y;commandUnits(s,0,[u.id],city,{cityId:city.id});stepGame(s);assert.ok(!s.units.some(v=>v.id===u.id));assert.ok(city.hp>city.maxHp-25);
  const dense=fixture(7,1,1);for(let id=0;id<7;id++)army(dense,id,100);releaseComebackSkill(dense,0,'celestial');assert.equal(dense.units.length,700);assert.equal(dense.reinforcements[0].remaining,100);
  dense.units.splice(0,100);stepGame(dense);assert.equal(dense.units.length,610);assert.ok(dense.reinforcements[0].remaining<100);
});
