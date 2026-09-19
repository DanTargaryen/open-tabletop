import {beginTrajectory,recordTrajectory,finishTrajectory} from './trajectory.js';
export const WORLD_WIDTH = 2560;
export const WORLD_HEIGHT = 720;
export const TERRAIN_STEP = 2;
export const GRAVITY = 310;
export const BASE_FUEL = 87.5;
export const PULSE_FUEL = 52.5;
export const SUPPLY_INTERVAL = 3;
export const SUPPLY_REACH_TURNS = 2;
export const FUEL_COST_PER_UNIT = .34;
export const SUPPLY_PICKUP_RADIUS = 44;
export const HIVE_DAMAGE_CAP = 96;
export const HOMING_LAUNCH_TIME = .18;
export const HOMING_SPEED = 680;
export const AI_LEVELS=Object.freeze({
  easy:Object.freeze({label:'简单',angleStep:10,powerStep:12,angleError:12,powerError:10}),
  normal:Object.freeze({label:'普通',angleStep:6,powerStep:8,angleError:5,powerError:4}),
  hard:Object.freeze({label:'困难',angleStep:3,powerStep:4,angleError:1,powerError:1}),
});
export const normalizeDifficulty=value=>Object.hasOwn(AI_LEVELS,value)?value:'normal';

export const WEAPONS = Object.freeze({
  calibration: Object.freeze({id:'calibration',key:1,tier:1,name:'校准弹',short:'校准',role:'稳定试射',damage:24,blast:40,crater:32,speed:1.05,ammo:Infinity,color:'#ffd35a'}),
  armorPiercing: Object.freeze({id:'armorPiercing',key:2,tier:2,name:'穿甲弹',short:'穿甲',role:'精确重击',damage:40,blast:58,crater:34,speed:1.12,ammo:2,color:'#ff7859'}),
  quake: Object.freeze({id:'quake',key:3,tier:2,name:'震地弹',short:'震地',role:'宽域破土',damage:44,blast:72,crater:82,craterDepth:36,speed:.92,ammo:2,color:'#f2a457'}),
  drill: Object.freeze({id:'drill',key:4,tier:3,name:'破障钻弹',short:'钻地',role:'深层爆破',damage:62,blast:88,crater:104,craterDepth:72,speed:.9,ammo:2,color:'#d75cff'}),
  hive: Object.freeze({id:'hive',key:5,tier:3,name:'蜂巢母弹',short:'分裂',role:'五弹覆盖',damage:58,blast:92,crater:38,speed:.98,ammo:2,color:'#8ef779'}),
  meteor: Object.freeze({id:'meteor',key:6,tier:4,name:'核爆弹',short:'核爆',role:'超广域毁灭',damage:115,blast:190,crater:170,craterDepth:115,speed:.86,ammo:0,color:'#ff4b32'}),
  pulse: Object.freeze({id:'pulse',key:7,tier:4,name:'追踪弹',short:'追踪',role:'锁定必中',damage:78,blast:120,crater:62,craterDepth:42,speed:1.08,ammo:0,color:'#66eaff'}),
});
export const WEAPON_IDS=Object.freeze(Object.keys(WEAPONS));

export function seededRandom(seed=Date.now()){
  let value=(Number(seed)>>>0)||0x9e3779b9;
  return ()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};
}

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const smoothstep=value=>value*value*(3-2*value);
const finiteAmmo=id=>Number.isFinite(WEAPONS[id].ammo);
function stateRandom(state){state.rngState=(Math.imul(state.rngState,1664525)+1013904223)>>>0;return state.rngState/4294967296;}
function pushEvent(state,event){state.events.push(event);return event;}
export function consumeEvents(state){return state.events.splice(0);}

export function generateTerrain({width=WORLD_WIDTH,height=WORLD_HEIGHT,step=TERRAIN_STEP}={},rng=Math.random){
  const count=Math.floor(width/step)+1;
  const anchors=Array.from({length:18},(_,index)=>{const t=index/17;return height*(.61+(rng()-.5)*.12+Math.sin(t*Math.PI*5.4)*.032);});
  const points=Array.from({length:count},(_,index)=>{
    const x=index*step,scaled=x/width*(anchors.length-1),left=Math.floor(scaled),local=smoothstep(scaled-left),a=anchors[left],b=anchors[Math.min(left+1,anchors.length-1)];
    return clamp(a+(b-a)*local+Math.sin(x*.012)*10+Math.sin(x*.031+1.4)*4+Math.sin(x*.071+.7)*1.5,height*.43,height*.76);
  });
  const flatten=(center,radius)=>{const centerY=terrainHeightAt({width,height,step,points},center);for(let i=0;i<points.length;i++){const distance=Math.abs(i*step-center);if(distance<radius){const blend=smoothstep(distance/radius);points[i]=centerY*(1-blend)+points[i]*blend;}}};
  flatten(width*.18,88);flatten(width*.82,88);return {width,height,step,points};
}

export function terrainHeightAt(terrain,x){
  const safe=clamp(x,0,terrain.width),scaled=safe/terrain.step,left=Math.floor(scaled),right=Math.min(left+1,terrain.points.length-1),mix=scaled-left;
  return terrain.points[left]*(1-mix)+terrain.points[right]*mix;
}
export function terrainSlopeAt(terrain,x){const span=16;return Math.atan2(terrainHeightAt(terrain,x+span)-terrainHeightAt(terrain,x-span),span*2);}
export function settleTank(tank,terrain){tank.x=clamp(tank.x,36,terrain.width-36);tank.y=terrainHeightAt(terrain,tank.x)-15;tank.slope=terrainSlopeAt(terrain,tank.x);return tank;}

export function createMatch({seed=Date.now(),difficulty='normal'}={}){
  const rng=seededRandom(seed),terrain=generateTerrain({},rng);
  const makeTank=(id,x,direction)=>settleTank({
    id,difficulty:normalizeDifficulty(difficulty),x,y:0,direction,slope:0,hp:100,maxHp:100,angle:45,power:68,fuel:BASE_FUEL,maxFuel:BASE_FUEL,weapon:'calibration',unlockedTiers:[1],
    ammo:{armorPiercing:0,quake:0,drill:0,hive:0,meteor:0,pulse:0},status:{pulseTurns:0},shots:0,hits:0,damageDone:0,
  },terrain);
  return {schema:2,seed,rngState:(Number(seed)^0x73a4c19d)>>>0,terrain,turn:'player',phase:'aim',round:1,completedTurns:0,nextSupplyAt:SUPPLY_INTERVAL,winner:null,supplies:[],nextSupplyId:1,events:[],volleySerial:0,volleyDamage:{},tanks:{player:makeTank('player',WORLD_WIDTH*.18,1),enemy:makeTank('enemy',WORLD_WIDTH*.82,-1)}};
}

export function isWeaponAvailable(tank,weaponId,round=Infinity){
  const weapon=WEAPONS[weaponId];if(!weapon)return false;if(weapon.tier<4&&!tank.unlockedTiers.includes(weapon.tier))return false;if(weapon.tier===4&&round<3)return false;
  return !finiteAmmo(weaponId)||(tank.ammo[weaponId]??0)>0;
}

export function unlockWeaponsForRound(state,round=state.round){
  const tier=round>=5?3:round>=3?2:1;let changed=false;
  for(const tank of Object.values(state.tanks))for(let unlocked=2;unlocked<=tier;unlocked++){
    if(tank.unlockedTiers.includes(unlocked))continue;tank.unlockedTiers.push(unlocked);
    for(const weapon of Object.values(WEAPONS))if(weapon.tier===unlocked)tank.ammo[weapon.id]=2;changed=true;
  }
  if(changed)pushEvent(state,{type:'unlock',tier});return changed;
}

export function selectWeapon(state,tankId,weaponId){
  const tank=state.tanks[tankId];if(!tank||!WEAPONS[weaponId]||state.phase!=='aim'||state.turn!==tankId||!isWeaponAvailable(tank,weaponId,state.round))return false;
  tank.weapon=weaponId;return true;
}
export function setAim(state,tankId,{angle,power,heading}){const tank=state.tanks[tankId];if(!tank||state.phase!=='aim'||state.turn!==tankId)return false;if(Number.isFinite(angle))tank.angle=clamp(angle,10,85);if(Number.isFinite(heading))tank.heading=((heading%360)+360)%360;if(Number.isFinite(power))tank.power=clamp(power,20,100);return true;}

export function collectSupplies(state,tankId){
  const tank=state.tanks[tankId];if(!tank)return [];const collected=[];
  for(const supply of state.supplies){
    if(!supply.landed||supply.destroyed||supply.collected||Math.hypot(tank.x-supply.x,(tank.y-10)-supply.y)>SUPPLY_PICKUP_RADIUS)continue;supply.collected=true;
    if(supply.reward==='health'){const restored=Math.min(30,tank.maxHp-tank.hp);tank.hp+=restored;collected.push(pushEvent(state,{type:'pickup',tankId,reward:'health',amount:restored,supplyId:supply.id}));}
    else{tank.ammo[supply.weaponId]=(tank.ammo[supply.weaponId]??0)+1;collected.push(pushEvent(state,{type:'pickup',tankId,reward:'ammo',weaponId:supply.weaponId,amount:1,supplyId:supply.id}));}
  }
  state.supplies=state.supplies.filter(item=>!item.collected&&!item.destroyed);return collected;
}

export function moveTank(state,tankId,distance){
  const tank=state.tanks[tankId];if(!tank||state.phase!=='aim'||state.turn!==tankId||!Number.isFinite(distance)||distance===0)return 0;
  const requested=Math.abs(distance),allowed=Math.min(requested,tank.fuel/FUEL_COST_PER_UNIT),signed=Math.sign(distance)*allowed,nextX=clamp(tank.x+signed,46,state.terrain.width-46),currentY=terrainHeightAt(state.terrain,tank.x),nextY=terrainHeightAt(state.terrain,nextX);
  if(Math.abs(nextY-currentY)>Math.max(12,Math.abs(nextX-tank.x)*.8))return 0;
  const moved=Math.abs(nextX-tank.x);tank.x=nextX;tank.fuel=Math.max(0,tank.fuel-moved*FUEL_COST_PER_UNIT);settleTank(tank,state.terrain);collectSupplies(state,tankId);return moved*Math.sign(signed);
}

export function barrelTip(tank,angle=tank.angle,heading=tank.heading){
  const direction=Number.isFinite(heading)?heading:(tank.direction===1?angle:180-angle),radians=direction*Math.PI/180,baseX=tank.x-Math.sin(tank.slope)*12,baseY=tank.y-Math.cos(tank.slope)*12;
  return {x:baseX+Math.cos(radians)*39,y:baseY-Math.sin(radians)*39,rotation:-radians};
}

function homingTarget(state,ownerId,preferredId){
  const owner=state.tanks[ownerId],preferred=state.tanks[preferredId];
  const isEnemy=tank=>tank&&tank.id!==ownerId&&tank.hp>0&&(!owner?.team||tank.team!==owner.team);
  if(isEnemy(preferred))return preferred;
  return Object.values(state.tanks).filter(isEnemy).sort((a,b)=>Math.hypot(a.x-owner.x,a.y-owner.y)-Math.hypot(b.x-owner.x,b.y-owner.y))[0]??null;
}

export function createProjectile(state,tankId,{angle,power,weaponId,angleOffset=0}={}){
  const tank=state.tanks[tankId],weapon=WEAPONS[weaponId||tank.weapon];if(!tank||!weapon)throw Error('Invalid projectile');
  const freeHeading=angle==null&&Number.isFinite(tank.heading),shotAngle=clamp(angle??tank.angle,10,85),heading=freeHeading?tank.heading+angleOffset:(tank.direction===1?shotAngle+angleOffset:180-shotAngle-angleOffset),shotPower=clamp(power??tank.power,20,100),tip=barrelTip(tank,shotAngle,heading),speed=(300+shotPower*5)*weapon.speed,radians=heading*Math.PI/180;
  const target=weapon.id==='pulse'?homingTarget(state,tankId):null;
  return {x:tip.x,y:tip.y,previousX:tip.x,previousY:tip.y,vx:Math.cos(radians)*speed,vy:-Math.sin(radians)*speed,age:0,owner:tankId,weaponId:weapon.id,alive:true,mode:'flight',falling:false,volleyId:state.volleySerial,targetId:target?.id??null,homing:Boolean(target)};
}

export function splitHiveProjectile(projectile){
  return [-70,-35,0,35,70].map((offset,index)=>({...projectile,previousX:projectile.x,previousY:projectile.y,vx:projectile.vx*.42+offset,vy:Math.max(45,projectile.vy)+Math.abs(index-2)*6,age:.22,alive:true,mode:'flight',bomblet:true,splitIndex:index}));
}

export function stepProjectile(projectile,state,dt){
  if(state.activeTrajectory&&projectile.alive)recordTrajectory(state,projectile);
  const result=advanceProjectile(projectile,state,dt);
  if(state.activeTrajectory)recordTrajectory(state,projectile);
  return result;
}
function advanceProjectile(projectile,state,dt){
  if(!projectile.alive)return {type:'none'};projectile.previousX=projectile.x;projectile.previousY=projectile.y;
  if(projectile.mode==='drilling'){
    projectile.drillElapsed+=dt;const progress=Math.min(1,projectile.drillElapsed/.18);projectile.x=projectile.drillStartX+projectile.drillDX*36*progress;projectile.y=projectile.drillStartY+projectile.drillDY*36*progress;
    if(progress>=1){projectile.alive=false;return {type:'terrain',x:projectile.x,y:projectile.y,drilled:true};}return {type:'none'};
  }
  if(projectile.weaponId==='pulse'&&projectile.homing){
    const target=homingTarget(state,projectile.owner,projectile.targetId);
    if(!target){projectile.alive=false;return {type:'out',x:projectile.x,y:projectile.y};}
    projectile.targetId=target.id;projectile.age+=dt;
    if(projectile.age>HOMING_LAUNCH_TIME){
      const targetX=target.x,targetY=target.y-10,dx=targetX-projectile.x,dy=targetY-projectile.y,distance=Math.hypot(dx,dy),travel=HOMING_SPEED*dt;
      if(distance<=Math.max(25,travel)){
        projectile.x=targetX;projectile.y=targetY;projectile.alive=false;
        return {type:'tank',x:targetX,y:targetY,tankId:target.id};
      }
      projectile.vx=dx/distance*HOMING_SPEED;projectile.vy=dy/distance*HOMING_SPEED;
    }
    projectile.x+=projectile.vx*dt;projectile.y+=projectile.vy*dt;
    return {type:'none'};
  }
  const oldVy=projectile.vy;if(projectile.weaponId==='meteor'&&oldVy>=0)projectile.falling=true;
  const gravity=projectile.weaponId==='meteor'&&projectile.falling?GRAVITY*1.9:GRAVITY;
  projectile.vy+=gravity*dt;projectile.x+=projectile.vx*dt;projectile.y+=projectile.vy*dt;projectile.age+=dt;
  if(projectile.weaponId==='hive'&&!projectile.bomblet&&oldVy<0&&projectile.vy>=0){projectile.alive=false;return {type:'split',x:projectile.x,y:projectile.y};}
  if(projectile.x<-30||projectile.x>WORLD_WIDTH+30||projectile.y>WORLD_HEIGHT+30){projectile.alive=false;return {type:'out',x:projectile.x,y:Math.min(projectile.y,WORLD_HEIGHT)};}
  const distance=Math.hypot(projectile.x-projectile.previousX,projectile.y-projectile.previousY),samples=Math.max(1,Math.ceil(distance/3));
  for(let i=1;i<=samples;i++){
    const mix=i/samples,x=projectile.previousX+(projectile.x-projectile.previousX)*mix,y=projectile.previousY+(projectile.y-projectile.previousY)*mix;
    for(const tank of Object.values(state.tanks)){
      if(tank.id===projectile.owner&&projectile.age<.2)continue;
      if(Math.hypot(x-tank.x,y-(tank.y-12))<25){projectile.alive=false;projectile.x=x;projectile.y=y;return {type:'tank',x,y,tankId:tank.id};}
    }
    if(x>=0&&x<=WORLD_WIDTH&&y>=terrainHeightAt(state.terrain,x)){
      projectile.x=x;projectile.y=y;
      if(projectile.weaponId==='drill'){
        const magnitude=Math.max(1,Math.hypot(projectile.vx,projectile.vy));projectile.mode='drilling';projectile.drillElapsed=0;projectile.drillStartX=x;projectile.drillStartY=y;projectile.drillDX=projectile.vx/magnitude;projectile.drillDY=Math.max(.35,projectile.vy/magnitude);return {type:'drill',x,y};
      }
      projectile.alive=false;return {type:'terrain',x,y};
    }
  }
  return {type:'none'};
}

export function deformTerrain(terrain,{x,y,radius,depth=radius}){
  const start=Math.max(0,Math.floor((x-radius)/terrain.step)),end=Math.min(terrain.points.length-1,Math.ceil((x+radius)/terrain.step));let changed=0;
  for(let index=start;index<=end;index++){const px=index*terrain.step,dx=px-x;if(Math.abs(dx)>radius)continue;const curve=Math.sqrt(Math.max(0,1-(dx*dx)/(radius*radius))),bottom=y+depth*curve,next=clamp(Math.max(terrain.points[index],bottom),0,terrain.height-8);if(next!==terrain.points[index]){terrain.points[index]=next;changed++;}}
  return changed;
}
export function calculateExplosionDamage(tank,{x,y,radius,damage}){const distance=Math.hypot(tank.x-x,(tank.y-10)-y);if(distance>=radius)return 0;const factor=1-distance/radius;return Math.max(1,Math.round(damage*(.25+.75*factor)));}

export function resolveExplosion(state,projectile){
  const weapon=WEAPONS[projectile.weaponId],explosion={x:projectile.x,y:projectile.y,radius:weapon.blast,damage:weapon.damage,crater:weapon.crater},damages={};
  for(const tank of Object.values(state.tanks)){
    let amount=calculateExplosionDamage(tank,explosion);
    if(projectile.weaponId==='hive'){const key=`${projectile.volleyId}:${tank.id}`,used=state.volleyDamage[key]??0;amount=Math.min(amount,Math.max(0,HIVE_DAMAGE_CAP-used));state.volleyDamage[key]=used+amount;}
    damages[tank.id]=amount;tank.hp=Math.max(0,tank.hp-amount);
    if(amount>0&&tank.id!==projectile.owner){const owner=state.tanks[projectile.owner];owner.hits++;owner.damageDone+=amount;if(projectile.weaponId==='pulse')tank.status.pulseTurns=1;}
  }
  deformTerrain(state.terrain,{x:explosion.x,y:explosion.y,radius:weapon.crater,depth:weapon.craterDepth??weapon.crater});for(const tank of Object.values(state.tanks))settleTank(tank,state.terrain);
  for(const supply of state.supplies)if(!supply.destroyed&&!supply.collected&&Math.hypot(supply.x-explosion.x,supply.y-explosion.y)<weapon.blast+18){supply.destroyed=true;pushEvent(state,{type:'supplyDestroyed',supplyId:supply.id,x:supply.x,y:supply.y});}
  state.supplies=state.supplies.filter(item=>!item.destroyed&&!item.collected);return {...explosion,damages,weaponId:weapon.id};
}

export function fireWeapon(state,tankId){
  const tank=state.tanks[tankId];if(!tank||state.phase!=='aim'||state.turn!==tankId||!isWeaponAvailable(tank,tank.weapon,state.round))return [];
  if(finiteAmmo(tank.weapon))tank.ammo[tank.weapon]--;tank.shots++;state.phase='flight';state.volleySerial++;
  beginTrajectory(state,tankId);
  const projectile=createProjectile(state,tankId);projectile.volleyId=state.volleySerial;return [projectile];
}

function simulateSingle(state,tankId,angle,power,weaponId){
  const projectile=createProjectile(state,tankId,{angle,power,weaponId}),active=[projectile],impacts=[];
  for(let frame=0;frame<1800&&active.some(item=>item.alive);frame++)for(const shot of [...active]){if(!shot.alive)continue;const result=stepProjectile(shot,state,1/120);if(result.type==='split')active.push(...splitHiveProjectile(shot));else if(['tank','terrain','out'].includes(result.type))impacts.push({x:result.x,y:result.y,type:result.type});}
  return impacts.length?impacts:[{x:projectile.x,y:projectile.y,type:'out'}];
}

export function chooseAiAction(state,rng=Math.random){
  return chooseTankAiAction(state,'enemy',rng);
}

export function chooseTankAiAction(state,tankId,rng=Math.random){
  const tank=state.tanks[tankId];
  const targets=Object.values(state.tanks).filter(t=>t.id!==tankId&&t.hp>0&&(!tank.team||t.team!==tank.team));
  const target=targets.sort((a,b)=>Math.abs(a.x-tank.x)-Math.abs(b.x-tank.x))[0];
  if(!target)return {angle:45,heading:45,power:55,weaponId:'calibration',move:0};
  const level=AI_LEVELS[normalizeDifficulty(tank.difficulty)],direction=target.x>=tank.x?1:-1;
  const simulation={...state,activeTrajectory:null,tanks:{...state.tanks,[tankId]:{...tank,direction}}};
  let move=0;
  const supply=state.supplies.filter(s=>s.landed&&!s.destroyed&&!s.collected).sort((a,b)=>Math.abs(a.x-tank.x)-Math.abs(b.x-tank.x))[0];
  if(supply&&Math.abs(supply.x-tank.x)<=Math.min(220,tank.fuel/FUEL_COST_PER_UNIT))move=supply.x-tank.x;
  let best={score:Infinity,angle:45,power:68,weaponId:'calibration',move};
  for(const weaponId of WEAPON_IDS.filter(id=>isWeaponAvailable(tank,id,state.round))){
    for(let angle=18;angle<=84;angle+=level.angleStep)for(let power=36;power<=100;power+=level.powerStep){
      const impacts=simulateSingle(simulation,tankId,angle,power,weaponId),weapon=WEAPONS[weaponId];
      const miss=Math.min(...impacts.map(p=>Math.hypot(p.x-target.x,(p.y-target.y)*.55)));
      const allies=Object.values(state.tanks).filter(t=>t.id===tankId||(tank.team&&t.team===tank.team));
      const risk=impacts.some(p=>allies.some(t=>t.hp>0&&Math.hypot(p.x-t.x,p.y-t.y)<weapon.blast))?500:0;
      const score=miss+risk+(weapon.tier===1?0:miss>weapon.blast*1.4?55:-8);
      if(score<best.score)best={score,angle,power,weaponId,move};
    }
  }
  const angle=clamp(best.angle+(rng()-.5)*level.angleError,10,85);
  return {...best,angle,heading:direction===1?angle:180-angle,power:clamp(best.power+(rng()-.5)*level.powerError,20,100)};
}

function findSupplyX(state){
  const tanks=Object.values(state.tanks).filter(tank=>tank.hp>0),target=tanks[Math.floor(stateRandom(state)*tanks.length)],fullMove=BASE_FUEL/FUEL_COST_PER_UNIT,maxTravel=fullMove*SUPPLY_REACH_TURNS+SUPPLY_PICKUP_RADIUS-4;
  const valid=x=>x>=120&&x<=state.terrain.width-120&&Math.abs(x-target.x)<=maxTravel&&!tanks.some(tank=>tank.id!==target.id&&Math.abs(tank.x-x)<90)&&!state.supplies.some(item=>Math.abs(item.x-x)<120)&&Math.abs(terrainHeightAt(state.terrain,x-24)-terrainHeightAt(state.terrain,x+24))<=18;
  for(let attempt=0;attempt<48;attempt++){
    const distance=36+stateRandom(state)*(maxTravel-36),direction=stateRandom(state)<.5?-1:1,x=clamp(target.x+direction*distance,120,state.terrain.width-120);
    if(valid(x))return {x,targetTankId:target.id,maxTravel};
  }
  let best=null;const left=Math.max(120,target.x-maxTravel),right=Math.min(state.terrain.width-120,target.x+maxTravel);
  for(let x=left;x<=right;x+=10){if(!valid(x))continue;const slope=Math.abs(terrainHeightAt(state.terrain,x-24)-terrainHeightAt(state.terrain,x+24)),spacing=state.supplies.reduce((minimum,item)=>Math.min(minimum,Math.abs(item.x-x)),Infinity),score=slope-spacing*.002;if(!best||score<best.score)best={x,score};}
  return {x:best?.x??clamp(target.x,120,state.terrain.width-120),targetTankId:target.id,maxTravel};
}

export function dropSupply(state){
  if(state.supplies.length>=2){const oldest=state.supplies.shift();pushEvent(state,{type:'supplyExpired',supplyId:oldest.id,x:oldest.x,y:oldest.y});}
  const placement=findSupplyX(state),x=placement.x,reward=stateRandom(state)<.5?'health':'ammo',weaponId=reward==='ammo'?(stateRandom(state)<.5?'meteor':'pulse'):null,supply={id:state.nextSupplyId++,x,y:-70,targetY:terrainHeightAt(state.terrain,x)-13,dropProgress:0,landed:false,collected:false,destroyed:false,reward,weaponId,createdTurn:state.completedTurns,targetTankId:placement.targetTankId};
  state.supplies.push(supply);pushEvent(state,{type:'supplyDrop',supplyId:supply.id,x});return supply;
}
export function hasFallingSupply(state){return state.supplies.some(item=>!item.landed&&!item.destroyed&&!item.collected);}
export function stepSupplyDrops(state,dt){
  const landed=[];for(const supply of state.supplies){if(supply.landed||supply.destroyed||supply.collected)continue;supply.targetY=terrainHeightAt(state.terrain,supply.x)-13;supply.dropProgress=Math.min(1,supply.dropProgress+dt/.95);const eased=1-Math.pow(1-supply.dropProgress,2);supply.y=-70+(supply.targetY+70)*eased;if(supply.dropProgress>=1){supply.landed=true;supply.y=supply.targetY;landed.push(pushEvent(state,{type:'supplyLanded',supplyId:supply.id,x:supply.x,y:supply.y}));}}
  if(landed.length)for(const tank of Object.values(state.tanks))collectSupplies(state,tank.id);return landed;
}
export function settleSupplies(state){for(const supply of state.supplies)if(supply.landed){supply.y=terrainHeightAt(state.terrain,supply.x)-13;if(supply.y>WORLD_HEIGHT-12)supply.destroyed=true;}state.supplies=state.supplies.filter(item=>!item.destroyed);}

export function finishTurn(state){
  finishTrajectory(state);
  const playerDead=state.tanks.player.hp<=0,enemyDead=state.tanks.enemy.hp<=0;if(playerDead||enemyDead){state.phase='ended';state.winner=playerDead&&enemyDead?'draw':playerDead?'enemy':'player';return state.winner;}
  state.completedTurns++;if(state.completedTurns>=state.nextSupplyAt){dropSupply(state);state.nextSupplyAt+=SUPPLY_INTERVAL;}
  state.turn=state.turn==='player'?'enemy':'player';state.phase='aim';if(state.turn==='player'){state.round++;unlockWeaponsForRound(state,state.round);}
  const active=state.tanks[state.turn],interfered=active.status.pulseTurns>0;active.fuel=interfered?PULSE_FUEL:active.maxFuel;if(interfered)active.status.pulseTurns--;if(!isWeaponAvailable(active,active.weapon,state.round))active.weapon='calibration';return null;
}

export function validMatch(state){return Boolean(state&&state.schema===2&&state.terrain?.points?.length>100&&Array.isArray(state.supplies)&&Number.isInteger(state.completedTurns)&&['player','enemy'].includes(state.turn)&&['aim','flight','ended'].includes(state.phase)&&Object.values(state.tanks||{}).every(t=>Number.isFinite(t.x)&&Number.isFinite(t.hp)&&t.hp>=0&&t.hp<=100&&t.angle>=10&&t.angle<=85&&(!Number.isFinite(t.heading)||(t.heading>=0&&t.heading<360))&&t.power>=20&&t.power<=100&&t.maxFuel===BASE_FUEL&&Array.isArray(t.unlockedTiers)));}

// Friend-room rules use the same ballistics, weapons, supplies and terrain as the
// solo match. The multiplayer helpers are deliberately data-only so the Node
// room service can remain authoritative while browsers render the shared state.
export const TEAM_TURN_ORDER=Object.freeze(['A1','B1','A2','B2']);

function createTank(id,team,x,direction,terrain,name=id,ai=false){
  return settleTank({
    id,team,name,ai,x,y:0,direction,slope:0,hp:100,maxHp:100,angle:45,
    heading:direction===1?45:135,power:68,fuel:BASE_FUEL,maxFuel:BASE_FUEL,
    weapon:'calibration',unlockedTiers:[1],
    ammo:{armorPiercing:0,quake:0,drill:0,hive:0,meteor:0,pulse:0},
    status:{pulseTurns:0},shots:0,hits:0,damageDone:0,
  },terrain);
}

export function createTeamMatch({seed=Date.now(),roster={}}={}){
  const rng=seededRandom(seed),terrain=generateTerrain({},rng);
  const positions={A1:WORLD_WIDTH*.13,B1:WORLD_WIDTH*.87,A2:WORLD_WIDTH*.29,B2:WORLD_WIDTH*.71};
  const tanks={};
  for(const slot of TEAM_TURN_ORDER){
    const team=slot[0],entry=roster[slot]||{};
    tanks[slot]=createTank(slot,team,positions[slot],team==='A'?1:-1,terrain,entry.name||`AI-${slot}`,Boolean(entry.ai));
    tanks[slot].difficulty=normalizeDifficulty(entry.difficulty);
  }
  const hasExplicitRoster=Object.keys(roster).length>0;
  const turnOrder=TEAM_TURN_ORDER.filter(slot=>!hasExplicitRoster||roster[slot]?.active!==false||roster[slot]?.ai);
  for(const slot of TEAM_TURN_ORDER)if(!turnOrder.includes(slot))delete tanks[slot];
  return {schema:3,mode:'teams',seed,rngState:(Number(seed)^0x73a4c19d)>>>0,terrain,
    turn:turnOrder[0],turnIndex:0,turnOrder,order:[...turnOrder],phase:'aim',round:1,
    completedTurns:0,nextSupplyAt:SUPPLY_INTERVAL,winner:null,supplies:[],nextSupplyId:1,
    events:[],volleySerial:0,volleyDamage:{},lastShot:null,shotHistory:[],tanks};
}

export function livingTeamSlots(state,team){
  return state.turnOrder.filter(slot=>state.tanks[slot]?.team===team&&state.tanks[slot].hp>0);
}

export function finishTeamTurn(state){
  finishTrajectory(state);
  const aliveA=livingTeamSlots(state,'A'),aliveB=livingTeamSlots(state,'B');
  if(!aliveA.length||!aliveB.length){
    state.phase='ended';state.winner=!aliveA.length&&!aliveB.length?'draw':aliveA.length?'A':'B';return state.winner;
  }
  state.completedTurns++;
  if(state.completedTurns>=state.nextSupplyAt){dropSupply(state);state.nextSupplyAt+=SUPPLY_INTERVAL;}
  const previous=state.turnIndex;let next=previous;
  for(let i=0;i<state.turnOrder.length;i++){next=(next+1)%state.turnOrder.length;if(state.tanks[state.turnOrder[next]]?.hp>0)break;}
  state.turnIndex=next;state.turn=state.turnOrder[next];state.phase='aim';
  if(next<=previous){state.round++;unlockWeaponsForRound(state,state.round);}
  const active=state.tanks[state.turn],interfered=active.status.pulseTurns>0;
  active.fuel=interfered?PULSE_FUEL:active.maxFuel;if(interfered)active.status.pulseTurns--;
  if(!isWeaponAvailable(active,active.weapon,state.round))active.weapon='calibration';
  return null;
}

export function resolveTeamShot(state,tankId){
  const replayState=structuredClone({...state,shotHistory:[],lastShot:null,events:[]});
  const shots=fireWeapon(state,tankId);if(!shots.length)return null;
  const replayProjectiles=structuredClone(shots);
  const active=shots.map(shot=>({...shot})),points=[],impacts=[];
  for(let frame=0;frame<2400&&active.some(shot=>shot.alive);frame++){
    for(const shot of [...active]){
      if(!shot.alive)continue;
      const result=stepProjectile(shot,state,1/120);
      if(frame%8===0)points.push({x:Math.round(shot.x),y:Math.round(shot.y),weaponId:shot.weaponId});
      if(result.type==='split')active.push(...splitHiveProjectile(shot));
      else if(['tank','terrain'].includes(result.type)){
        const explosion=resolveExplosion(state,shot);impacts.push({x:shot.x,y:shot.y,weaponId:shot.weaponId,damages:explosion.damages});
      }
    }
  }
  settleSupplies(state);finishTeamTurn(state);
  const postSupplies=structuredClone(state.supplies);
  stepSupplyDrops(state,.95);
  state.lastShot={id:state.volleySerial,owner:tankId,weaponId:shots[0].weaponId,points:points.slice(-360),impacts,replayState,replayProjectiles,postSupplies};
  state.shotHistory=[...(state.shotHistory||[]),state.lastShot].slice(-8);
  return state.lastShot;
}

export function chooseTeamAiAction(state,tankId,rng=Math.random){
  return chooseTankAiAction(state,tankId,rng);
}

export function validTeamMatch(state){
  return Boolean(state&&state.schema===3&&state.mode==='teams'&&state.terrain?.points?.length>100&&
    Array.isArray(state.turnOrder)&&state.turnOrder.every(slot=>state.tanks?.[slot]?.id===slot)&&state.turnOrder.length>=2&&
    state.turnOrder.every(slot=>TEAM_TURN_ORDER.includes(slot))&&state.turnOrder.includes(state.turn)&&['aim','flight','ended'].includes(state.phase));
}
