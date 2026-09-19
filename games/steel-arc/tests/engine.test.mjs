import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_FUEL,PULSE_FUEL,SUPPLY_INTERVAL,SUPPLY_REACH_TURNS,FUEL_COST_PER_UNIT,SUPPLY_PICKUP_RADIUS,GRAVITY,HIVE_DAMAGE_CAP,WEAPONS,WEAPON_IDS,WORLD_WIDTH,TERRAIN_STEP,
  createMatch,generateTerrain,seededRandom,terrainHeightAt,moveTank,setAim,selectWeapon,
  createProjectile,stepProjectile,splitHiveProjectile,deformTerrain,calculateExplosionDamage,
  resolveExplosion,fireWeapon,finishTurn,chooseAiAction,validMatch,unlockWeaponsForRound,
  dropSupply,stepSupplyDrops,collectSupplies,consumeEvents,isWeaponAvailable,
  TEAM_TURN_ORDER,createTeamMatch,finishTeamTurn,resolveTeamShot,chooseTeamAiAction,validTeamMatch,
} from '../web/engine.js';

const completeTurns=(state,count)=>{for(let i=0;i<count;i++){state.phase='aim';finishTurn(state);}};

test('seeded terrain is deterministic, bounded and supports both spawn pads',()=>{
  const a=generateTerrain({},seededRandom(42)),b=generateTerrain({},seededRandom(42));
  assert.deepEqual(a,b);assert.ok(a.points.every(y=>y>250&&y<710));assert.equal(WORLD_WIDTH,2560);assert.equal(TERRAIN_STEP,2);
  for(const center of [WORLD_WIDTH*.18,WORLD_WIDTH*.82])assert.ok(Math.abs(terrainHeightAt(a,center)-terrainHeightAt(a,center-20))<15);
});

test('match starts on schema 2 with 2.5x fuel and only tier one available',()=>{
  const state=createMatch({seed:7}),player=state.tanks.player;
  assert.equal(validMatch(state),true);assert.equal('wind' in state,false);assert.equal(player.fuel,BASE_FUEL);assert.equal(BASE_FUEL,87.5);assert.deepEqual(player.unlockedTiers,[1]);
  assert.equal(player.weapon,'calibration');assert.equal(isWeaponAvailable(player,'calibration'),true);assert.equal(isWeaponAvailable(player,'armorPiercing'),false);
  assert.deepEqual(Object.values(player.ammo),[0,0,0,0,0,0]);
});

test('movement consumes the expanded fuel without leaving the world',()=>{
  const state=createMatch({seed:7}),before=state.tanks.player.fuel,moved=moveTank(state,'player',8);
  assert.ok(moved>=0);assert.ok(state.tanks.player.fuel<=before);moveTank(state,'player',-9999);assert.ok(state.tanks.player.x>=46);assert.ok(state.tanks.player.fuel>=0);
});

test('aim and weapon selection obey turn, unlock and ammunition',()=>{
  const state=createMatch({seed:9});assert.equal(setAim(state,'player',{angle:200,power:-1}),true);assert.equal(state.tanks.player.angle,85);assert.equal(state.tanks.player.power,20);
  assert.equal(setAim(state,'enemy',{angle:40,power:50}),false);assert.equal(selectWeapon(state,'player','armorPiercing'),false);
  completeTurns(state,2);assert.equal(state.round,2);assert.equal(selectWeapon(state,'player','armorPiercing'),false);state.tanks.player.ammo.meteor=1;assert.equal(selectWeapon(state,'player','meteor'),false);
  completeTurns(state,2);assert.equal(state.round,3);assert.equal(selectWeapon(state,'player','meteor'),true);assert.equal(selectWeapon(state,'player','armorPiercing'),true);state.tanks.player.ammo.armorPiercing=0;
  assert.equal(selectWeapon(state,'player','armorPiercing'),false);assert.equal(selectWeapon(state,'player','missing'),false);
});

test('tier two unlocks once on round 3 and tier three once on round 5',()=>{
  const state=createMatch({seed:10});completeTurns(state,2);
  for(const tank of Object.values(state.tanks)){assert.deepEqual(tank.unlockedTiers,[1]);assert.equal(tank.ammo.armorPiercing,0);assert.equal(tank.ammo.quake,0);}
  completeTurns(state,2);
  for(const tank of Object.values(state.tanks)){assert.deepEqual(tank.unlockedTiers,[1,2]);assert.equal(tank.ammo.armorPiercing,2);assert.equal(tank.ammo.quake,2);}
  state.tanks.player.ammo.quake=1;unlockWeaponsForRound(state,3);unlockWeaponsForRound(state,4);assert.equal(state.tanks.player.ammo.quake,1);
  completeTurns(state,4);assert.equal(state.round,5);
  for(const tank of Object.values(state.tanks)){assert.ok(tank.unlockedTiers.includes(3));assert.equal(tank.ammo.drill,2);assert.equal(tank.ammo.hive,2);}
  state.tanks.player.ammo.drill=1;unlockWeaponsForRound(state,8);assert.equal(state.tanks.player.ammo.drill,1);
});

test('projectile follows a reproducible ballistic arc and eventually collides',()=>{
  const state=createMatch({seed:11});setAim(state,'player',{angle:55,power:72});const projectile=createProjectile(state,'player'),startY=projectile.y,startVx=projectile.vx;let highest=startY,result;
  for(let i=0;i<1800;i++){result=stepProjectile(projectile,state,1/120);highest=Math.min(highest,projectile.y);if(result.type!=='none')break;}
  assert.ok(highest<startY-50);assert.equal(projectile.vx,startVx);assert.notEqual(result.type,'none');assert.equal(projectile.alive,false);
});

test('free heading can fire backward and downward without changing AI elevation rules',()=>{
  const state=createMatch({seed:111});
  setAim(state,'player',{heading:180,power:60});const backward=createProjectile(state,'player');assert.ok(backward.vx<0);assert.ok(Math.abs(backward.vy)<1e-8);
  setAim(state,'player',{heading:270,power:60});const downward=createProjectile(state,'player');assert.ok(Math.abs(downward.vx)<1e-8);assert.ok(downward.vy>0);
  setAim(state,'player',{heading:-45,power:60});assert.equal(state.tanks.player.heading,315);assert.equal(validMatch(state),true);
});

test('all seven weapons are defined with the requested 1+2+2+2 tiers',()=>{
  assert.equal(WEAPON_IDS.length,7);assert.deepEqual([1,2,3,4].map(tier=>WEAPON_IDS.filter(id=>WEAPONS[id].tier===tier).length),[1,2,2,2]);
  assert.equal(WEAPONS.calibration.ammo,Infinity);assert.equal(WEAPONS.meteor.tier,4);assert.equal(WEAPONS.pulse.tier,4);
});

test('weapon damage and blast radius rise clearly with every tier',()=>{
  const tiers=[1,2,3,4].map(tier=>WEAPON_IDS.filter(id=>WEAPONS[id].tier===tier).map(id=>WEAPONS[id]));
  for(let tier=1;tier<tiers.length;tier++){
    const previousMaxDamage=Math.max(...tiers[tier-1].map(weapon=>weapon.damage));
    const previousMaxBlast=Math.max(...tiers[tier-1].map(weapon=>weapon.blast));
    assert.ok(tiers[tier].every(weapon=>weapon.damage>previousMaxDamage),`tier ${tier+1} damage exceeds tier ${tier}`);
    assert.ok(tiers[tier].every(weapon=>weapon.blast>previousMaxBlast),`tier ${tier+1} blast exceeds tier ${tier}`);
  }
});

test('craters only push terrain downward and quake craters can remain shallow',()=>{
  const terrain=generateTerrain({},seededRandom(4)),before=[...terrain.points],x=640,y=terrainHeightAt(terrain,x);
  assert.ok(deformTerrain(terrain,{x,y,radius:76,depth:28})>0);for(let i=0;i<terrain.points.length;i++){assert.ok(terrain.points[i]>=before[i]);if(Math.abs(i*terrain.step-x)>78)assert.equal(terrain.points[i],before[i]);}
  assert.ok(terrainHeightAt(terrain,x)-y<=29);
});

test('explosion damage decreases with distance and stops at the edge',()=>{
  const explosion={x:100,y:100,radius:60,damage:40},tank=distance=>({x:100+distance,y:110});
  assert.ok(calculateExplosionDamage(tank(0),explosion)>calculateExplosionDamage(tank(35),explosion));assert.equal(calculateExplosionDamage(tank(80),explosion),0);
});

test('limited weapons spend one round and a turn cannot fire twice',()=>{
  const state=createMatch({seed:13});completeTurns(state,4);selectWeapon(state,'player','quake');const shots=fireWeapon(state,'player');
  assert.equal(shots.length,1);assert.equal(state.tanks.player.ammo.quake,1);assert.deepEqual(fireWeapon(state,'player'),[]);
});

test('hive shell splits at its apex into exactly five independently moving bomblets',()=>{
  const state=createMatch({seed:14});const projectile=createProjectile(state,'player',{weaponId:'hive',angle:60,power:65});let result;
  for(let i=0;i<600;i++){result=stepProjectile(projectile,state,1/120);if(result.type==='split')break;}
  assert.equal(result.type,'split');const children=splitHiveProjectile(projectile);assert.equal(children.length,5);assert.ok(children.every(item=>item.bomblet&&item.alive));assert.equal(new Set(children.map(item=>item.vx)).size,5);
});

test('hive volley damage against one tank is capped at its tier-three limit',()=>{
  const state=createMatch({seed:15}),enemy=state.tanks.enemy;enemy.x=1000;enemy.y=400;
  for(let i=0;i<5;i++)resolveExplosion(state,{x:enemy.x,y:enemy.y-10,owner:'player',weaponId:'hive',volleyId:77,bomblet:true});
  assert.equal(enemy.hp,100-HIVE_DAMAGE_CAP);assert.equal(state.tanks.player.damageDone,HIVE_DAMAGE_CAP);
});

test('drill enters terrain before exploding and meteor gains extra falling gravity',()=>{
  const state=createMatch({seed:16});state.terrain.points.fill(500);for(const tank of Object.values(state.tanks)){tank.y=485;tank.slope=0;}
  const drill=createProjectile(state,'player',{weaponId:'drill',angle:45,power:45});let drilled=false,result;
  for(let i=0;i<1800;i++){result=stepProjectile(drill,state,1/120);if(result.type==='drill')drilled=true;if(['terrain','tank','out'].includes(result.type))break;}
  assert.equal(drilled,true);assert.equal(result.type,'terrain');assert.ok(result.drilled);
  const meteor=createProjectile(state,'player',{weaponId:'meteor',angle:70,power:45});meteor.vy=10;const before=meteor.vy;stepProjectile(meteor,state,.1);assert.ok(meteor.vy-before>GRAVITY*.18);
});

test('homing round hit limits only the target next turn fuel to 52.5',()=>{
  const state=createMatch({seed:17}),enemy=state.tanks.enemy;
  resolveExplosion(state,{x:enemy.x,y:enemy.y-10,owner:'player',weaponId:'pulse',volleyId:1});assert.equal(enemy.status.pulseTurns,1);
  finishTurn(state);assert.equal(state.turn,'enemy');assert.equal(enemy.fuel,PULSE_FUEL);assert.equal(enemy.status.pulseTurns,0);
  finishTurn(state);finishTurn(state);assert.equal(enemy.fuel,BASE_FUEL);
});

test('homing round guarantees a hit even when fired backward or into the ground',()=>{
  for(const seed of [17,117,217])for(const heading of [180,270]){
    const state=createMatch({seed});setAim(state,'player',{heading,power:20});
    const projectile=createProjectile(state,'player',{weaponId:'pulse'});let result={type:'none'};
    assert.equal(projectile.targetId,'enemy');assert.equal(projectile.homing,true);
    for(let frame=0;frame<1200&&result.type==='none';frame++)result=stepProjectile(projectile,state,1/120);
    assert.equal(result.type,'tank',`seed ${seed}, heading ${heading}`);assert.equal(result.tankId,'enemy');
  }
});

test('nuclear round has the greatest damage, blast and terrain destruction',()=>{
  const nuclear=WEAPONS.meteor,others=WEAPON_IDS.filter(id=>id!=='meteor').map(id=>WEAPONS[id]);
  assert.ok(nuclear.damage>Math.max(...others.map(weapon=>weapon.damage)));
  assert.ok(nuclear.blast>Math.max(...others.map(weapon=>weapon.blast)));
  assert.ok(nuclear.crater>Math.max(...others.map(weapon=>weapon.crater)));
  const state=createMatch({seed:18}),enemy=state.tanks.enemy;enemy.x=1200;enemy.y=400;
  const terrainBefore=[...state.terrain.points];
  const explosion=resolveExplosion(state,{x:enemy.x-150,y:enemy.y-10,owner:'player',weaponId:'meteor',volleyId:1});
  assert.ok(explosion.damages.enemy>=40);assert.ok(state.terrain.points.filter((height,index)=>height!==terrainBefore[index]).length>100);
});

test('turns alternate, restore fuel and determine winners',()=>{
  const state=createMatch({seed:21});state.tanks.enemy.fuel=0;finishTurn(state);assert.equal(state.turn,'enemy');assert.equal(state.tanks.enemy.fuel,BASE_FUEL);
  state.tanks.player.hp=0;assert.equal(finishTurn(state),'enemy');assert.equal(state.phase,'ended');
});

test('a supply drops after every three completed turns and at most two remain',()=>{
  const state=createMatch({seed:22});assert.equal(SUPPLY_INTERVAL,3);completeTurns(state,2);assert.equal(state.supplies.length,0);completeTurns(state,1);assert.equal(state.supplies.length,1);assert.equal(state.completedTurns,3);
  completeTurns(state,6);assert.equal(state.completedTurns,9);assert.equal(state.supplies.length,2);assert.equal(state.nextSupplyAt,12);
});

test('every supply is assigned to a tank reachable within zero to two full fuel moves',()=>{
  const maxTravel=BASE_FUEL/FUEL_COST_PER_UNIT*SUPPLY_REACH_TURNS+SUPPLY_PICKUP_RADIUS;
  assert.equal(SUPPLY_REACH_TURNS,2);
  for(let seed=1;seed<=800;seed++){
    const state=createMatch({seed}),supply=dropSupply(state),target=state.tanks[supply.targetTankId];
    assert.ok(target,`seed ${seed} has a target tank`);
    assert.ok(Math.abs(supply.x-target.x)<=maxTravel,`seed ${seed} is reachable`);
    assert.ok(supply.x>=120&&supply.x<=state.terrain.width-120,`seed ${seed} stays in bounds`);
    assert.ok(Math.abs(terrainHeightAt(state.terrain,supply.x-24)-terrainHeightAt(state.terrain,supply.x+24))<=18,`seed ${seed} lands on usable ground`);
    stepSupplyDrops(state,1);
    let moves=0;
    while(state.supplies.some(item=>item.id===supply.id)&&moves<SUPPLY_REACH_TURNS){state.turn=target.id;state.phase='aim';target.fuel=BASE_FUEL;moveTank(state,target.id,supply.x-target.x);moves++;}
    assert.equal(state.supplies.some(item=>item.id===supply.id),false,`seed ${seed} can collect within ${SUPPLY_REACH_TURNS} moves`);
  }
});

test('supply rewards are deterministic and approach 50/25/25 over many seeds',()=>{
  const counts={health:0,meteor:0,pulse:0};
  for(let seed=1;seed<=1200;seed++){const supply=dropSupply(createMatch({seed}));counts[supply.reward==='health'?'health':supply.weaponId]++;}
  assert.ok(counts.health>520&&counts.health<680);assert.ok(counts.meteor>240&&counts.meteor<360);assert.ok(counts.pulse>240&&counts.pulse<360);
  const a=dropSupply(createMatch({seed:1234})),b=dropSupply(createMatch({seed:1234}));assert.deepEqual({x:a.x,reward:a.reward,weaponId:a.weaponId},{x:b.x,reward:b.reward,weaponId:b.weaponId});
});

test('landed supply heals at most 30 or grants exactly one tier-four round',()=>{
  const state=createMatch({seed:24}),tank=state.tanks.player;tank.hp=82;
  state.supplies=[{id:1,x:tank.x,y:tank.y-10,landed:true,reward:'health',collected:false,destroyed:false}];collectSupplies(state,'player');assert.equal(tank.hp,100);
  const healing=consumeEvents(state).find(event=>event.type==='pickup');assert.equal(healing.amount,18);
  state.supplies=[{id:2,x:tank.x,y:tank.y-10,landed:true,reward:'ammo',weaponId:'meteor',collected:false,destroyed:false}];collectSupplies(state,'player');assert.equal(tank.ammo.meteor,1);assert.equal(tank.ammo.pulse,0);
});

test('falling supplies land on terrain and explosions can destroy them',()=>{
  const state=createMatch({seed:25}),supply=dropSupply(state);stepSupplyDrops(state,1);assert.equal(supply.landed,true);assert.equal(supply.y,terrainHeightAt(state.terrain,supply.x)-13);
  resolveExplosion(state,{x:supply.x,y:supply.y,owner:'player',weaponId:'calibration',volleyId:1});assert.equal(state.supplies.length,0);assert.ok(consumeEvents(state).some(event=>event.type==='supplyDestroyed'));
});

test('AI always returns a legal reproducible shot from currently available weapons',()=>{
  const a=createMatch({seed:33});a.turn='enemy';const plan=chooseAiAction(a,seededRandom(8));
  assert.ok(plan.angle>=10&&plan.angle<=85);assert.ok(plan.power>=20&&plan.power<=100);assert.equal(plan.weaponId,'calibration');assert.equal(validMatch(a),true);
  unlockWeaponsForRound(a,5);const advanced=chooseAiAction(a,seededRandom(9));assert.ok(WEAPONS[advanced.weaponId]);assert.equal(isWeaponAvailable(a.tanks.enemy,advanced.weaponId),true);
});

test('team match creates four independent tanks in fixed A1 B1 A2 B2 order',()=>{
  const state=createTeamMatch({seed:81,roster:{A1:{name:'甲',ai:false},B1:{name:'乙',ai:false},A2:{name:'AI-A2',ai:true},B2:{name:'AI-B2',ai:true}}});
  assert.equal(validTeamMatch(state),true);assert.deepEqual(state.turnOrder,TEAM_TURN_ORDER);assert.equal(state.turn,'A1');
  assert.equal(Object.keys(state.tanks).length,4);assert.equal(state.tanks.A1.team,'A');assert.equal(state.tanks.B2.team,'B');assert.equal(state.tanks.A2.ai,true);
});

test('team homing round locks the nearest living enemy and still hits from a wrong heading',()=>{
  const state=createTeamMatch({seed:811});setAim(state,'A1',{heading:270,power:20});
  const projectile=createProjectile(state,'A1',{weaponId:'pulse'});let result={type:'none'};
  assert.equal(projectile.targetId,'B2');
  for(let frame=0;frame<1200&&result.type==='none';frame++)result=stepProjectile(projectile,state,1/120);
  assert.equal(result.type,'tank');assert.equal(result.tankId,'B2');
});

test('authoritative team shot resolves homing damage and consumes its ammunition',()=>{
  const state=createTeamMatch({seed:812});state.round=3;state.tanks.A1.ammo.pulse=1;state.tanks.A1.weapon='pulse';setAim(state,'A1',{heading:270,power:20});
  const shot=resolveTeamShot(state,'A1');
  assert.equal(shot.weaponId,'pulse');assert.equal(state.tanks.A1.ammo.pulse,0);assert.equal(shot.impacts[0].damages.B2,WEAPONS.pulse.damage);
  assert.equal(state.tanks.B2.hp,100-WEAPONS.pulse.damage);assert.equal(state.turn,'B1');
});

test('team shot uses real ballistics, records a replay path and advances one slot',()=>{
  const state=createTeamMatch({seed:82});setAim(state,'A1',{heading:45,power:65});const terrainBefore=[...state.terrain.points],shot=resolveTeamShot(state,'A1');
  assert.ok(shot.points.length>3);assert.ok(shot.impacts.length>=1);assert.equal(state.turn,'B1');assert.equal(state.completedTurns,1);assert.equal(state.shotHistory.length,1);
  assert.ok(state.terrain.points.some((height,index)=>height!==terrainBefore[index]));
});

test('team turns skip destroyed tanks, unlock on complete cycles and AI chooses legal ammo',()=>{
  const state=createTeamMatch({seed:83});state.tanks.B1.hp=0;finishTeamTurn(state);assert.equal(state.turn,'A2');finishTeamTurn(state);assert.equal(state.turn,'B2');finishTeamTurn(state);assert.equal(state.turn,'A1');assert.equal(state.round,2);
  state.round=5;unlockWeaponsForRound(state,5);state.turn='B2';state.turnIndex=3;const plan=chooseTeamAiAction(state,'B2',seededRandom(4));assert.ok(isWeaponAvailable(state.tanks.B2,plan.weaponId,state.round));assert.ok(plan.power>=20&&plan.power<=100);
});
