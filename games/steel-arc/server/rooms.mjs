import {
  TEAM_TURN_ORDER,WEAPONS,createTeamMatch,finishTeamTurn,moveTank,resolveTeamShot,advanceCalibrationTurn,
  selectWeapon,setAim,chooseTeamAiAction,isWeaponAvailable,AI_LEVELS,stepSupplyDrops,resolveCalibrationShot,completeCalibration,
} from '../web/engine.js';

import {MAX_POWER} from '../web/aim-limits.js';
import {BIOME_IDS} from '../web/biomes.js';
import {BASE_MOVE_SPEED,MAX_FIRE_MOVE_STEPS,MAX_FIRE_MOVE_DISTANCE} from '../web/motion-config.js';
export const ROOM_TTL=24*60*60*1000;
export const TURN_MS=40000;
export const DUEL_READY_MS=60000;
const SLOTS=[...TEAM_TURN_ORDER];
const active=room=>room.members.filter(member=>!member.left);
const clone=structuredClone;
const random=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),n=>n.toString(16).padStart(2,'0')).join('');

export class SteelArcRoomError extends Error{constructor(status,message){super(message);this.status=status;}}
const check=(ok,status,message)=>{if(!ok)throw new SteelArcRoomError(status,message);};
export async function hashToken(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');}
function nickname(value){check(typeof value==='string'&&[...value.trim()].length>=1&&[...value.trim()].length<=16&&!/[\u0000-\u001f\u007f<>]/.test(value),400,'昵称长度必须为 1-16 个字符。');return value.trim();}
function roomCode(hash,attempt){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from({length:6},(_,i)=>chars[parseInt(hash.slice(((attempt*6+i)%32)*2,((attempt*6+i)%32)*2+2),16)%32]).join('');}
function syncAi(room){const occupied=new Set(active(room).map(member=>member.slot));room.aiSlots=(room.aiSlots||[]).filter(slot=>!occupied.has(slot));if(room.engine)for(const slot of room.engine.turnOrder){const member=active(room).find(item=>item.slot===slot),ai=room.aiSlots.includes(slot);room.engine.tanks[slot].ai=ai;room.engine.tanks[slot].name=member?.name||`AI-${slot}`;}}
function deadline(room,now){room.deadline=room.status==='playing'&&!room.duelReadyUntil?now+TURN_MS:null;}
function seatView(room,slot){const member=active(room).find(item=>item.slot===slot);if(member)return{id:member.id,name:member.name,team:slot[0],slot,ready:member.ready,owner:member.id===room.ownerId,ai:false};const ai=(room.aiSlots||[]).includes(slot);return{id:ai?`ai-${slot}`:`empty-${slot}`,name:ai?`AI-${slot}`:'空位',team:slot[0],slot,ready:ai,owner:false,ai,difficulty:room.aiDifficulties?.[slot]||'normal'};}
function view(room,member,now){return{room:{schema:2,code:room.code,status:room.status,version:room.version,mapChoice:room.mapChoice||'random',maxPlayers:room.maxPlayers,humanCount:active(room).length,aiCount:room.aiSlots.length,selfId:member.id,selfSlot:member.slot,isOwner:room.ownerId===member.id,selfReady:member.ready,selfSurrendered:Boolean(member.surrendered),duelWaiting:Boolean(room.duelReadyUntil),selfDuelReady:Boolean(member.duelReady),duelReadyUntil:room.duelReadyUntil||null,serverNow:now,deadline:room.deadline,turnOrder:room.engine?[...room.engine.turnOrder]:SLOTS.filter(slot=>active(room).some(item=>item.slot===slot)||room.aiSlots.includes(slot)),roster:active(room).map(item=>({id:item.id,name:item.name,team:item.slot[0],slot:item.slot,ready:item.ready,surrendered:Boolean(item.surrendered),owner:item.id===room.ownerId,ai:false})),seats:SLOTS.map(slot=>seatView(room,slot))},game:room.engine?clone(room.engine):null,log:[...room.log]};}

function nextAiTurn(room,now){
  if(room.duelReadyUntil)return;
  if(room.engine?.phase==='calibration')return nextCalibration(room,now);
  syncAi(room);let guard=0;
  while(room.status==='playing'&&room.aiSlots.includes(room.engine.turn)&&guard++<SLOTS.length){
    const slot=room.engine.turn,tank=room.engine.tanks[slot];
    const moveState=clone({...room.engine,shotHistory:[],lastShot:null,events:[]});
    let plan=chooseWeakTeamAiAction(room.engine,slot);
    if(Math.abs(plan.move)>1){for(let left=plan.move,steps=0;Math.abs(left)>1&&steps++<400;){const moved=moveTank(room.engine,slot,Math.sign(left)*Math.min(Math.abs(left),BASE_MOVE_SPEED/60));if(!moved)break;left-=moved;}plan=chooseWeakTeamAiAction(room.engine,slot);}
    if(isWeaponAvailable(tank,plan.weaponId,room.engine.round))selectWeapon(room.engine,slot,plan.weaponId);
    setAim(room.engine,slot,{heading:plan.heading,power:plan.power});
    const shot=resolveTeamShot(room.engine,slot);
    if(shot&&Math.abs(moveState.tanks[slot].x-shot.replayState.tanks[slot].x)>1)shot.replayMoveState=moveState;
    room.log.push(`${tank.name} 发射${WEAPONS[tank.weapon].name}`);
    if(room.engine.phase==='ended'){room.status='finished';room.members.forEach(item=>item.ready=false);break;}
  }
  deadline(room,now);
}
// Aim at the enemy, then introduce symmetric aiming errors. Never reject a
// shot because it would hit, and never intentionally fire away from the enemy.
export function chooseWeakTeamAiAction(state,tankId,rng=Math.random){
  const tank=state.tanks[tankId];
  const simulation={...state,tanks:{...state.tanks,[tankId]:{...tank,difficulty:'hard',unlockedTiers:[1],ammo:{}}}};
  const plan=chooseTeamAiAction(simulation,tankId,()=>.5);
  const angle=Math.max(10,Math.min(85,plan.angle+(rng()-.5)*24));
  const power=Math.max(20,Math.min(MAX_POWER,plan.power+(rng()-.5)*32));
  return {move:0,heading:plan.heading<=90?angle:180-angle,power,weaponId:'calibration'};
}
function nextCalibration(room,now){
  syncAi(room);
  let guard=0;while(room.engine.calibration.turn&&room.aiSlots.includes(room.engine.calibration.turn)&&guard++<SLOTS.length){const slot=room.engine.calibration.turn;const plan=chooseTeamAiAction(room.engine,slot,random);resolveCalibrationShot(room.engine,slot,{heading:plan.heading,power:plan.power});advanceCalibrationTurn(room.engine);}
  if(completeCalibration(room.engine)!==null){
    room.duelReadyUntil=now+DUEL_READY_MS;
    room.members.forEach(member=>{member.duelReady=false;});
    room.log.push('校准完成，等待真人确认开始决斗。');
  }
  deadline(room,now);
}

function releaseDuel(room,now){
  room.duelReadyUntil=null;
  nextAiTurn(room,now);
}
function advanceExpiredTurn(room,now){
  if(room.status==='playing'&&room.duelReadyUntil){
    if(now<room.duelReadyUntil)return false;
    releaseDuel(room,now);room.version++;return true;
  }
  if(room.status!=='playing'||!room.deadline||now<room.deadline)return false;
  if(room.engine.phase==='calibration'){
    const slot=room.engine.calibration.turn;
    if(slot){const plan=chooseTeamAiAction(room.engine,slot,random);resolveCalibrationShot(room.engine,slot,{heading:plan.heading,power:plan.power});advanceCalibrationTurn(room.engine);}
    nextCalibration(room,now);room.version++;return true;
  }
  const tank=room.engine.tanks[room.engine.turn];room.log.push(`${tank.name} 行动超时，由 AI 代打`);
  const plan=chooseWeakTeamAiAction(room.engine,tank.id);selectWeapon(room.engine,tank.id,plan.weaponId);setAim(room.engine,tank.id,{heading:plan.heading,power:plan.power});resolveTeamShot(room.engine,tank.id);
  if(room.engine.phase==='ended'){room.status='finished';room.members.forEach(item=>item.ready=false);}else nextAiTurn(room,now);
  room.version++;return true;
}

export class SteelArcRoomService{
  constructor(store,clock=()=>Date.now()){this.store=store;this.clock=clock;}
  async create(input){
    const player=nickname(input.name),maxPlayers=4;
    const key=input.seatKey??token();
    check(typeof key==='string'&&/^[a-f0-9]{48}$/.test(key),400,'座位密钥无效，请重新进入。');
    const now=this.clock(),member={id:crypto.randomUUID(),name:player,slot:'A1',ready:true,left:false,lastSeen:now,tokenHash:await hashToken(key),processed:[]};
    for(let i=0;i<12;i++){
      const room={schema:2,code:roomCode(member.tokenHash,i),maxPlayers,version:1,status:'waiting',mapChoice:'random',ownerId:member.id,members:[member],aiSlots:[],deadline:null,engine:null,log:[],expiresAt:now+ROOM_TTL};
      const existing=await this.store.get(room.code,now);
      if(existing){
        const owner=active(existing.room).find(item=>item.tokenHash===member.tokenHash);
        if(owner)return {...view(existing.room,owner,now),token:key};
        continue;
      }
      if(await this.store.create(room.code,room,room.expiresAt))return{...view(room,member,now),token:key};
      const raced=await this.store.get(room.code,now),owner=raced&&active(raced.room).find(item=>item.tokenHash===member.tokenHash);
      if(owner)return {...view(raced.room,owner,now),token:key};
    }
    throw new SteelArcRoomError(503,'error');
  }

  async request(code,key,operation,input={}){
    check(/^[A-Z2-9]{6}$/.test(code),400,'error');
    const joining=operation==='join';
    if(joining)check(typeof input.seatKey==='string'&&/^[a-f0-9]{48}$/.test(input.seatKey),400,'error');
    const joinName=joining?nickname(input.name):null;
    const hash=joining?await hashToken(input.seatKey):typeof key==='string'&&/^[a-f0-9]{48}$/.test(key)?await hashToken(key):null;
    for(let retry=0;retry<12;retry++){
      const now=this.clock(),stored=await this.store.get(code,now);check(stored,404,'房间不存在或已过期。');
      const room=clone(stored.room);let member=active(room).find(item=>item.tokenHash===hash),changed=false;
      if(!active(room).some(item=>item.id===room.ownerId)&&active(room).length){room.ownerId=active(room)[0].id;room.version++;changed=true;}
      if(joining){
        if(!member){
          check(room.status==='waiting',409,'本局已经开始。');check(active(room).length<room.maxPlayers,409,'真人座位已满。');
          check(!active(room).some(item=>item.name.toLowerCase()===joinName.toLowerCase()),409,'error');
          const slot=SLOTS.find(value=>!active(room).some(item=>item.slot===value)&&!room.aiSlots.includes(value));
          check(slot,409,'没有空座位，请房主先移除一个 AI。');
          member={id:crypto.randomUUID(),name:joinName,slot,ready:false,left:false,lastSeen:now,tokenHash:hash,processed:[]};room.members.push(member);room.version++;changed=true;
        }
        member.lastSeen=now;syncAi(room);changed=true;
      }else{
        check(member,403,'座位身份已失效，请重新加入。');
        // A retry must describe persisted state, without simulating another timed-out shot.
        if(operation==='action'&&member.processed.includes(input.requestId))return view(room,member,now);
        if(now-member.lastSeen>=8000){member.lastSeen=now;changed=true;}
        const expired=advanceExpiredTurn(room,now);changed=expired||changed;
        if(operation==='action'&&expired){
          room.expiresAt=now+ROOM_TTL;
          if(!await this.store.cas(code,stored.revision,room,room.expiresAt))continue;
          throw new SteelArcRoomError(409,'行动已超时，请查看最新战局后继续。');
        }
        if(operation==='state'){if(room.status==='playing'&&room.aiSlots.includes(room.engine.phase==='calibration'?room.engine.calibration.turn:room.engine.turn)&&!room.duelReadyUntil){nextAiTurn(room,now);room.version++;changed=true;}}
        else if(operation==='team'){
          check(room.status==='waiting',409,'error');
          const wanted=typeof input.slot==='string'?input.slot:`${input.team}${input.number===2?'2':'1'}`;
          check(SLOTS.includes(wanted),400,'error');
          check(!active(room).some(item=>item.slot===wanted&&item.id!==member.id)&&!room.aiSlots.includes(wanted),409,'该位置已被占用。');
          if(member.slot!==wanted){member.slot=wanted;member.ready=member.id===room.ownerId;room.version++;changed=true;syncAi(room);}
        }else if(operation==='ai'){check(room.status==='waiting',409,'只能在等待阶段设置 AI。');check(member.id===room.ownerId,403,'只有房主可以设置 AI。');const wanted=typeof input.slot==='string'?input.slot:'';check(SLOTS.includes(wanted),400,'请选择有效位置。');check(!active(room).some(item=>item.slot===wanted),409,'该位置已被占用。');check(input.difficulty===undefined||Object.hasOwn(AI_LEVELS,input.difficulty),400,'AI 难度无效。');room.aiDifficulties??={};room.aiDifficulties[wanted]=input.difficulty||room.aiDifficulties[wanted]||'normal';const enabled=input.enabled!==false;room.aiSlots=room.aiSlots||[];room.aiSlots=enabled?[...new Set([...room.aiSlots,wanted])]:room.aiSlots.filter(slot=>slot!==wanted);room.version++;changed=true;syncAi(room);}else if(operation==='map'){
          check(['waiting','finished'].includes(room.status),409,'战斗中不能更换地图。');
          check(member.id===room.ownerId,403,'只有房主可以选择地图。');
          check(input.mapChoice==='random'||BIOME_IDS.includes(input.mapChoice),400,'请选择有效的战场地图。');
          room.mapChoice=input.mapChoice;room.version++;changed=true;
        }else if(operation==='ready'){
          check(room.status==='waiting',409,'只能在等待阶段准备。');check(typeof input.ready==='boolean',400,'准备状态无效。');member.ready=input.ready;room.version++;changed=true;
        }else if(operation==='duel-ready'){
          check(room.status==='playing'&&room.engine.phase==='aim',409,'校准尚未完成。');
          check(input.seed===room.engine.seed,409,'对局已更新，请刷新。');
          if(room.duelReadyUntil&&!member.duelReady){
            member.duelReady=true;room.version++;changed=true;
            if(active(room).every(item=>item.duelReady))releaseDuel(room,now);
          }
        }else if(operation==='rematch'){
          check(room.status==='finished',409,'本局尚未结束。');
          member.ready=true;
          room.version++;changed=true;
        }else if(operation==='surrender'){
          check(room.status==='playing',409,'本局已经结束。');
          member.surrendered=true;
          const teammates=active(room).filter(item=>item.slot[0]===member.slot[0]);
          room.log.push(`${member.name} 确认投降（${teammates.filter(item=>item.surrendered).length}/${teammates.length}）`);
          if(teammates.every(item=>item.surrendered)){
            room.engine.phase='ended';room.engine.winner=member.slot[0]==='A'?'B':'A';room.status='finished';room.deadline=null;room.duelReadyUntil=null;
            room.members.forEach(item=>item.ready=false);
          }
          room.version++;changed=true;
        }else if(operation==='start'){
          check(member.id===room.ownerId,403,'只有房主可以开始。');check(['waiting','finished'].includes(room.status),409,'本局已经开始。');
          check(active(room).every(item=>item.ready),409,'所有真人玩家必须准备');
          syncAi(room);const selected=new Set([...active(room).map(item=>item.slot),...room.aiSlots]);check(selected.size>=2,409,'至少需要启用 2 个行动位');check([...selected].some(slot=>slot[0]==='A')&&[...selected].some(slot=>slot[0]==='B'),409,'双方都需要至少一个行动位');const roster=Object.fromEntries(SLOTS.map(slot=>{const human=active(room).find(item=>item.slot===slot),ai=room.aiSlots.includes(slot);return[slot,{name:human?.name||`AI-${slot}`,ai,difficulty:room.aiDifficulties?.[slot]||'normal',active:Boolean(human||ai)}];}));
          room.engine=createTeamMatch({seed:(now^Math.floor(random()*0xffffffff))>>>0,roster,themeId:room.mapChoice==='random'?undefined:room.mapChoice,previousRangeDistance:room.engine?.calibration?.distance,previousBattleWidth:(room.engine?.battleTerrain||room.engine?.terrain)?.width});room.status='playing';room.duelReadyUntil=null;room.log=['战场已部署，请按顺序完成地面靶校准。'];room.members.forEach(item=>{item.ready=false;item.surrendered=false;item.processed=[];});room.version++;nextAiTurn(room,now);changed=true;
        }else if(operation==='action'){
          check(typeof input.requestId==='string'&&/^[a-zA-Z0-9_-]{8,80}$/.test(input.requestId),400,'行动编号无效。');
          if(member.processed.includes(input.requestId))return view(room,member,now);
          check(input.version===room.version,409,'战局已更新，请重试。');check(room.status==='playing',409,'当前不能行动。');
          if(room.engine.phase==='calibration'){
            check(!room.engine.calibration.shots[member.slot],409,'你已经完成校准。');check(input.type==='calibration',400,'校准阶段请提交校准射击。');check(Number.isFinite(input.heading)&&Number.isFinite(input.power),400,'瞄准参数无效。');
            check(room.engine.calibration.turn===member.slot,409,'还没有轮到你进行校准射击。');resolveCalibrationShot(room.engine,member.slot,{heading:input.heading,power:input.power});advanceCalibrationTurn(room.engine);nextCalibration(room,now);member.processed.push(input.requestId);member.processed=member.processed.slice(-64);member.lastSeen=now;room.version++;changed=true;deadline(room,now);
            room.expiresAt=now+ROOM_TTL;if(!await this.store.cas(code,stored.revision,room,room.expiresAt))continue;
            return view(room,member,now);
          }
          check(!room.duelReadyUntil,409,'等待玩家确认开始决斗。');
          check(room.engine.phase==='aim',409,'当前不能行动。');check(room.engine.turn===member.slot,409,'还没有轮到你。');
          const tank=room.engine.tanks[member.slot];
          if(input.type==='move'){
            const steps=input.steps??[input.distance];
            check(Array.isArray(steps)&&steps.length>0&&steps.length<=120&&steps.every(value=>Number.isFinite(value))&&steps.reduce((sum,value)=>sum+Math.abs(value),0)<=28,400,'移动距离无效。');
            for(const distance of steps)moveTank(room.engine,member.slot,distance);
            if(room.engine.phase==='ended'){room.status='finished';room.members.forEach(item=>item.ready=false);deadline(room,now);}
            else if(room.engine.turn!==member.slot)nextAiTurn(room,now);
          }else if(input.type==='aim'){
            check(Number.isFinite(input.heading)&&Number.isFinite(input.power),400,'瞄准参数无效。');setAim(room.engine,member.slot,{heading:input.heading,power:input.power});
          }else if(input.type==='select'){
            check(typeof input.weaponId==='string',400,'弹药类型无效。');check(selectWeapon(room.engine,member.slot,input.weaponId),409,'弹药尚未解锁或已用完。');
          }else if(input.type==='fire'){
            if(input.steps!==undefined){
              check(Array.isArray(input.steps)&&input.steps.length<=MAX_FIRE_MOVE_STEPS&&input.steps.every(Number.isFinite)&&input.steps.reduce((sum,value)=>sum+Math.abs(value),0)<=MAX_FIRE_MOVE_DISTANCE,400,'开火前移动距离无效。');
              for(const distance of input.steps)moveTank(room.engine,member.slot,distance);
              check(room.engine.phase==='aim'&&room.engine.turn===member.slot,409,'移动后已无法开火。');
            }
            if(typeof input.weaponId==='string')check(selectWeapon(room.engine,member.slot,input.weaponId),409,'弹药尚未解锁或已用完。');
            check(setAim(room.engine,member.slot,{heading:Number(input.heading),power:Number(input.power)}),400,'瞄准参数无效。');
            check(resolveTeamShot(room.engine,member.slot),409,'当前无法开火。');
            if(room.engine.phase==='ended'){room.status='finished';room.members.forEach(item=>item.ready=false);deadline(room,now);}else nextAiTurn(room,now);
          }else if(input.type==='pass'){
            finishTeamTurn(room.engine);stepSupplyDrops(room.engine,.95);room.log.push(`${tank.name} 结束行动`);nextAiTurn(room,now);
          }else throw new SteelArcRoomError(400,'行动类型无效。');
          member.processed.push(input.requestId);member.processed=member.processed.slice(-64);member.lastSeen=now;room.version++;changed=true;
        }else if(operation==='leave'){
          member.left=true;member.ready=false;if(room.ownerId===member.id)room.ownerId=active(room)[0]?.id??null;
          if(room.status==='playing')room.aiSlots.push(member.slot);
          syncAi(room);
          if(room.status==='playing'&&room.duelReadyUntil&&active(room).every(item=>item.duelReady))releaseDuel(room,now);
          if(room.status==='playing'&&(room.engine.phase==='calibration'?room.engine.calibration.turn:room.engine.turn)===member.slot)nextAiTurn(room,now);
          if(room.status==='playing'&&room.engine.phase!=='calibration'&&room.engine.turn===member.slot){const replacement=room.engine.turnOrder.find(slot=>slot!==member.slot&&room.engine.tanks[slot]?.hp>0);if(replacement){room.engine.turn=replacement;room.engine.turnIndex=room.engine.turnOrder.indexOf(replacement);}}
          room.version++;changed=true;
        }else check(operation==='state',404,'error');
      }
      if(changed){room.expiresAt=now+ROOM_TTL;if(!await this.store.cas(code,stored.revision,room,room.expiresAt))continue;}
      if(operation==='leave')return{left:true};return{...view(room,member,now),...(joining?{token:input.seatKey}:{})};
    }
    throw new SteelArcRoomError(409,'error');
  }
}

export class MemorySteelArcRoomStore{
  constructor(){this.rows=new Map();}
  async get(code,now){const row=this.rows.get(code);return row&&row.expiresAt>now?clone(row):null;}
  async create(code,room,expiresAt){if(this.rows.has(code))return false;this.rows.set(code,{revision:0,room:clone(room),expiresAt});return true;}
  async cas(code,revision,room,expiresAt){const row=this.rows.get(code);if(!row||row.revision!==revision)return false;this.rows.set(code,{revision:revision+1,room:clone(room),expiresAt});return true;}
}
