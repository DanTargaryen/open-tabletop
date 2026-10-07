import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {MAPS,createGame,stepGame,commandUnits,aiCommand,chooseCards,surrenderPlayer} from '../web/engine.js';

export const ROOM_TTL=24*60*60*1000;
export const TICK_MS=100;
export const MAX_CATCHUP_MS=5000;
export const CONNECTED_MS=15000;
export const HOST_MIGRATION_MS=30000;
export const RECENT_UNIT_MS=30000;
const MAX_RETIRED_UNITS=1024;
const storeQueues=new WeakMap();
const clone=structuredClone;
const active=room=>room.members.filter(member=>!member.left);
const token=()=>randomBytes(24).toString('hex');
const validToken=value=>typeof value==='string'&&/^[a-f0-9]{48}$/.test(value);
export const hashToken=value=>createHash('sha256').update(value).digest('hex');
export class InkWarRoomError extends Error{constructor(status,message){super(message);this.status=status;}}
const check=(ok,status,message)=>{if(!ok)throw new InkWarRoomError(status,message);};
function nickname(value){check(typeof value==='string'&&[...value.trim()].length>=1&&[...value.trim()].length<=16&&!/[\u0000-\u001f\u007f<>]/.test(value),400,'昵称长度必须为 1–16 个字符。');return value.trim();}
function settings(input){
  const playerCount=input.playerCount??2,aiCount=input.aiCount??0,mapId=input.mapId??'river';
  check(Number.isInteger(playerCount)&&playerCount>=2&&playerCount<=7,400,'对战人数必须为 2–7 人。');
  check(Number.isInteger(aiCount)&&aiCount>=0&&aiCount<playerCount,400,'AI 数量必须小于对战人数。');
  check(MAPS.some(map=>map.id===mapId),400,'请选择有效地图。');
  return {playerCount,aiCount,mapId};
}
const aiSeats=room=>Array.from({length:room.aiCount},(_,index)=>room.playerCount-room.aiCount+index);
const optionsFor=(room,seat)=>chooseCards((room.cardSeed^Math.imul(seat+1,2654435761))>>>0,3);
const chosenCard=(room,seat,id)=>typeof id==='string'&&optionsFor(room,seat).some(card=>card.id===id);
function nextCode(){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return [...randomBytes(6)].map(value=>alphabet[value%alphabet.length]).join('');}

function inRoomQueue(store,code,operation){
  let queues=storeQueues.get(store);
  if(!queues){queues=new Map();storeQueues.set(store,queues);}
  // API requests create separate service instances, so queues belong to their
  // shared store. Other room codes proceed independently. Keep CAS for changes
  // made by another store user, and release the queue even when validation fails.
  const previous=queues.get(code)||Promise.resolve(),task=previous.then(operation),tail=task.then(()=>{},()=>{});
  queues.set(code,tail);
  return task.finally(()=>{if(queues.get(code)===tail)queues.delete(code);});
}

function rememberCasualties(room,before,now){
  const living=new Set(room.engine.units.map(unit=>unit.id));
  room.retiredUnits=(room.retiredUnits||[]).filter(unit=>now-unit.at<=RECENT_UNIT_MS);
  for(const unit of before)if(!living.has(unit.id))room.retiredUnits.push({id:unit.id,owner:unit.owner,uncontrollable:Boolean(unit.uncontrollable),at:now});
  room.retiredUnits=room.retiredUnits.slice(-MAX_RETIRED_UNITS);
}

function validateOrder(room,member,input,now){
  check(typeof input.requestId==='string'&&/^[a-zA-Z0-9_-]{8,80}$/.test(input.requestId),400,'行动编号无效。');
  check(Array.isArray(input.unitIds)&&input.unitIds.length>0&&input.unitIds.length<=700&&input.unitIds.every(id=>Number.isSafeInteger(id)&&id>=0)&&new Set(input.unitIds).size===input.unitIds.length,400,'请选择有效军队。');
  check(input.target&&Number.isFinite(input.target.x)&&Number.isFinite(input.target.y),400,'行军目的地无效。');
  check(input.cityId==null||Number.isSafeInteger(input.cityId),400,'送兵城池无效。');
  const fingerprint=hashToken(JSON.stringify({unitIds:input.unitIds,target:{x:input.target.x,y:input.target.y},...(input.cityId!=null?{cityId:input.cityId}:{})}));
  const duplicate=member.processed.find(item=>item.id===input.requestId);
  if(duplicate){check(duplicate.fingerprint===fingerprint,409,'同一行动编号不能用于不同命令。');return {fingerprint,duplicate:true};}
  check(room.status==='playing',409,'当前不能行军。');
  check(input.target.x>=0&&input.target.x<=room.engine.width&&input.target.y>=0&&input.target.y<=room.engine.height,400,'目的地超出地图。');
  check(input.cityId==null||room.engine.cities.some(city=>city.id===input.cityId&&city.owner===member.seat),400,'只能向己方城池送兵。');
  // Verify ownership before time advances, including recent casualties from an
  // older client snapshot. Unknown IDs and enemy IDs reject the entire order.
  const ownership=new Map((room.retiredUnits||[]).filter(unit=>now-unit.at<=RECENT_UNIT_MS).map(unit=>[unit.id,unit.owner]));
  for(const unit of room.engine.units)ownership.set(unit.id,unit.owner);
  check(input.unitIds.every(id=>ownership.get(id)===member.seat),400,'只能指挥己方的部队，请更新过期的选择。');
  const automatic=new Set([...(room.retiredUnits||[]),...room.engine.units].filter(u=>u.uncontrollable).map(u=>u.id));
  check(input.unitIds.every(id=>!automatic.has(id)),400,'突击兵自动作战，无法手动指挥或吞兵养城。');
  return {fingerprint,duplicate:false};
}

function view(room,member,now){
  const humans=active(room),bots=aiSeats(room);
  const roster=Array.from({length:room.playerCount},(_,seat)=>{
    const human=humans.find(item=>item.seat===seat),ai=bots.includes(seat);
    return {seat,name:human?.name||(ai?`墨将 ${seat+1}`:'等待加入'),ready:human?.ready??ai,connected:human?now-human.lastSeen<=CONNECTED_MS:ai,owner:Boolean(human&&human.id===room.ownerId),cardId:human?.cardId||(ai?optionsFor(room,seat)[0].id:null),ai,occupied:Boolean(human||ai)};
  });
  return {room:{schema:1,code:room.code,status:room.status,selfId:member.id,selfSeat:member.seat,isOwner:member.id===room.ownerId,selfReady:member.ready,playerCount:room.playerCount,mapId:room.mapId,aiCount:room.aiCount,roster,cardOptions:optionsFor(room,member.seat),serverNow:now,version:room.version,round:room.round},game:room.engine?clone(room.engine):null};
}

// Time is authoritative and quantized at 10 Hz. A sleeping or abandoned room
// resumes at most five seconds of simulation on its next authenticated request;
// excess wall time is discarded so an old room cannot monopolize the event loop.
function advance(room,now){
  if(room.status!=='playing')return false;
  const elapsed=Math.max(0,now-room.simulatedAt);
  if(elapsed<TICK_MS)return false;
  const duration=Math.min(elapsed,MAX_CATCHUP_MS),ticks=Math.floor(duration/TICK_MS);
  const bots=aiSeats(room);
  for(let index=0;index<ticks&&room.engine.status==='playing';index++){
    if(room.engine.tick%12===0)for(const seat of bots)if(room.engine.players[seat]?.alive)aiCommand(room.engine,seat);
    const before=room.engine.units.map(unit=>({id:unit.id,owner:unit.owner,uncontrollable:Boolean(unit.uncontrollable)}));
    stepGame(room.engine,TICK_MS/1000);
    rememberCasualties(room,before,now);
  }
  room.simulatedAt=elapsed>MAX_CATCHUP_MS?now:room.simulatedAt+ticks*TICK_MS;
  if(room.engine.status==='finished'){room.status='finished';active(room).forEach(item=>{item.ready=false;});}
  room.version++;
  return true;
}

function migrateOwner(room,now){
  const humans=active(room),owner=humans.find(item=>item.id===room.ownerId);
  if(owner&&now-owner.lastSeen<HOST_MIGRATION_MS)return false;
  const successor=humans.filter(item=>now-item.lastSeen<=CONNECTED_MS).sort((a,b)=>a.seat-b.seat)[0]||(!owner?humans[0]:null);
  if(!successor||successor.id===room.ownerId)return false;
  room.ownerId=successor.id;room.version++;return true;
}

export class InkWarRoomService{
  constructor(store,clock=()=>Date.now()){this.store=store;this.clock=clock;}
  async create(input={}){
    const name=nickname(input.name),configuration=settings(input),key=input.seatKey??token();
    check(validToken(key),400,'座位密钥无效，请重新进入。');
    const now=this.clock(),member={id:randomUUID(),seat:0,name,ready:false,cardId:null,lastSeen:now,left:false,tokenHash:hashToken(key),processed:[]};
    // A client-supplied key makes create retries recoverable without storing it.
    const cardSeed=randomBytes(4).readUInt32LE();
    for(let attempt=0;attempt<12;attempt++){
      const code=attempt===0?Array.from({length:6},(_,i)=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[parseInt(member.tokenHash.slice(i*2,i*2+2),16)%32]).join(''):nextCode();
      const previous=await this.store.get(code,now);
      if(previous){const owner=active(previous.room).find(item=>item.tokenHash===member.tokenHash);if(owner)return{...view(previous.room,owner,now),token:key};continue;}
      const room={schema:1,code,...configuration,cardSeed,round:0,status:'waiting',version:1,ownerId:member.id,members:[member],engine:null,simulatedAt:now,expiresAt:now+ROOM_TTL};
      if(await this.store.create(code,room,room.expiresAt))return {...view(room,member,now),token:key};
      const raced=await this.store.get(code,now),owner=raced&&active(raced.room).find(item=>item.tokenHash===member.tokenHash);
      if(owner)return {...view(raced.room,owner,now),token:key};
    }
    throw new InkWarRoomError(503,'暂时无法创建房间，请重试。');
  }

  async request(code,key,operation,input={}){
    check(typeof code==='string'&&/^[A-Z2-9]{6}$/.test(code),400,'房间码无效。');
    return inRoomQueue(this.store,code,()=>this.#requestQueued(code,key,operation,input));
  }

  async #requestQueued(code,key,operation,input={}){
    const joining=operation==='join',joinName=joining?nickname(input.name):null;
    if(joining)check(validToken(input.seatKey),400,'座位密钥无效，请重新进入。');
    const hash=joining?hashToken(input.seatKey):validToken(key)?hashToken(key):null;
    for(let retry=0;retry<32;retry++){
      const now=this.clock(),stored=await this.store.get(code,now);check(stored,404,'房间不存在或已过期。');
      const room=clone(stored.room);let member=active(room).find(item=>item.tokenHash===hash),changed=false;
      if(joining){
        if(!member){
          check(room.status==='waiting',409,'本局已经开始，请等待下一局。');
          check(!active(room).some(item=>item.name.toLowerCase()===joinName.toLowerCase()),409,'这个昵称已被使用。');
          const seat=Array.from({length:room.playerCount-room.aiCount},(_,i)=>i).find(value=>!active(room).some(item=>item.seat===value));
          check(seat!==undefined,409,'真人座位已满。');
          member={id:randomUUID(),seat,name:joinName,ready:false,cardId:null,lastSeen:now,left:false,tokenHash:hash,processed:[]};room.members.push(member);room.version++;changed=true;
        }
        if(!room.ownerId)room.ownerId=member.id;
        member.lastSeen=now;changed=true;
      }else{
        check(member,403,'座位身份已失效，请重新加入。');
        if(now-member.lastSeen>=5000){member.lastSeen=now;changed=true;}
      }
      const order=!joining&&operation==='action'?validateOrder(room,member,input,now):null;
      changed=migrateOwner(room,now)||changed;
      changed=advance(room,now)||changed;
      if(!joining&&operation!=='state'){
        if(operation==='ready'){
          check(['waiting','finished'].includes(room.status),409,'只能在开局前准备。');
          check(typeof input.ready==='boolean',400,'准备状态无效。');
          if(input.cardId!==undefined){check(chosenCard(room,member.seat,input.cardId),400,'请选择候选卡牌中的一张。');member.cardId=input.cardId;}
          check(!input.ready||chosenCard(room,member.seat,member.cardId),400,'准备前请先选择一张卡牌。');
          member.ready=input.ready;room.version++;changed=true;
        }else if(operation==='configure'){
          check(member.id===room.ownerId,403,'只有房主可以设置房间。');
          check(['waiting','finished'].includes(room.status),409,'战斗中不能更改房间设置。');
          const configuration=settings({...room,...input});
          check(active(room).every(item=>item.seat<configuration.playerCount-configuration.aiCount),409,'请先腾出需要设置为 AI 或删除的真人座位。');
          Object.assign(room,configuration);active(room).forEach(item=>{item.ready=false;});room.version++;changed=true;
        }else if(operation==='rematch'){
          check(member.id===room.ownerId,403,'只有房主可以重开大厅。');
          check(room.status==='finished',409,'本局尚未结束。');
          room.status='waiting';room.engine=null;room.retiredUnits=[];active(room).forEach(item=>{item.ready=false;});room.version++;changed=true;
        }else if(operation==='start'){
          check(member.id===room.ownerId,403,'只有房主可以开始。');
          check(['waiting','finished'].includes(room.status),409,'本局已经开始。');
          const humans=active(room);check(humans.length+room.aiCount===room.playerCount,409,'真人座位还没坐满，请邀请好友或明确设置 AI。');
          check(humans.every(item=>item.ready&&chosenCard(room,item.seat,item.cardId)&&now-item.lastSeen<=CONNECTED_MS),409,'所有真人玩家必须选卡、在线并准备。');
          const names=Array.from({length:room.playerCount},(_,seat)=>humans.find(item=>item.seat===seat)?.name||`墨将 ${seat+1}`);
          const cards=Array.from({length:room.playerCount},(_,seat)=>[humans.find(item=>item.seat===seat)?.cardId||optionsFor(room,seat)[0].id]);
          room.round++;room.engine=createGame({seed:(room.cardSeed^Math.imul(room.round,1597334677))>>>0,playerCount:room.playerCount,mapId:room.mapId,names,cards});room.status='playing';room.simulatedAt=now;
          room.retiredUnits=[];
          humans.forEach(item=>{item.ready=false;item.processed=[];});room.version++;changed=true;
        }else if(operation==='action'){
          if(!order.duplicate){
            check(room.status==='playing',409,'当前不能行军。');
            const living=new Set(room.engine.units.filter(unit=>unit.owner===member.seat&&unit.hp>0).map(unit=>unit.id)),survivors=input.unitIds.filter(id=>living.has(id));
            // A valid selected group can lose soldiers between snapshot and
            // commit. Command its survivors; an entirely fallen group is a no-op.
            if(survivors.length)try{commandUnits(room.engine,member.seat,survivors,input.target,{cityId:input.cityId??null});}catch(error){throw new InkWarRoomError(400,error.message||'行军命令无效。');}
            member.processed.push({id:input.requestId,fingerprint:order.fingerprint});member.processed=member.processed.slice(-128);member.lastSeen=now;room.version++;changed=true;
          }
        }else if(operation==='leave'){
          member.left=true;member.ready=false;
          if(member.id===room.ownerId)room.ownerId=active(room).sort((a,b)=>a.seat-b.seat)[0]?.id??null;
          if(room.status==='playing'){
            if(room.engine.players[member.seat]?.alive){const before=room.engine.units;surrenderPlayer(room.engine,member.seat);rememberCasualties(room,before,now);}
            if(room.engine.status==='finished'){room.status='finished';active(room).forEach(item=>{item.ready=false;});}
          }
          room.version++;changed=true;
        }else throw new InkWarRoomError(404,'接口不存在。');
      }
      if(changed){room.expiresAt=now+ROOM_TTL;if(!await this.store.cas(code,stored.revision,room,room.expiresAt))continue;}
      if(operation==='leave')return {left:true};
      return {...view(room,member,now),...(joining?{token:input.seatKey}:{})};
    }
    throw new InkWarRoomError(409,'房间正在处理其他操作，请重试。');
  }
}

export class MemoryInkWarRoomStore{
  constructor(){this.rows=new Map();}
  async get(code,now){const row=this.rows.get(code);return row&&row.expiresAt>now?clone(row):null;}
  async create(code,room,expiresAt){if(this.rows.has(code))return false;this.rows.set(code,{revision:0,room:clone(room),expiresAt});return true;}
  async cas(code,revision,room,expiresAt){const row=this.rows.get(code);if(!row||row.revision!==revision)return false;this.rows.set(code,{revision:revision+1,room:clone(room),expiresAt});return true;}
}
