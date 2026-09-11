import {AbracadaGame,AI_PROFILES} from '../web/engine.js';
import {characterForSeat} from '../web/characters.js';

export const TURN_MS=45000;
export const AI_DELAY_MS=1000;
export const ACTION_HOLD_MS=1000;
export const OFFLINE_MS=20000;
export const ROOM_TTL=24*60*60*1000;

const CAST_PRESENTATION_MS=1700;
const DIE_PRESENTATION_MS=2000;
const LIFE_PRESENTATION_MS=700;
const DRAW_PRESENTATION_MS=900;
const SPELL_PRESENTATION_MS={1:3600,2:2500,3:1300,4:2400,5:1500,6:2300,7:1700,8:2100};

const clone=value=>JSON.parse(JSON.stringify(value));
const activeMembers=room=>room.members.filter(member=>!member.left);
const secureRandom=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;
const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),byte=>byte.toString(16).padStart(2,'0')).join('');
const requireThat=(condition,status,message)=>{if(!condition)throw new AbracadaRoomError(status,message);};

export class AbracadaRoomError extends Error{
  constructor(status,message){super(message);this.status=status;}
}

export async function hashToken(token){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
}

function nickname(value){
  requireThat(typeof value==='string',400,'请输入昵称。');
  const name=value.trim();
  requireThat([...name].length>=1&&[...name].length<=16&&!/[\u0000-\u001f\u007f<>]/.test(name),400,'昵称请使用 1–16 个正常字符。');
  return name;
}

function profileForSeat(seat){
  return AI_PROFILES[(seat+AI_PROFILES.length-1)%AI_PROFILES.length];
}

function memberByHash(room,hash){
  return room.members.find(member=>!member.left&&member.tokenHash===hash);
}

function rebalanceOwner(room){
  const members=activeMembers(room);
  if(!members.length)return;
  if(!members.some(member=>member.id===room.ownerId))room.ownerId=members[0].id;
}

function syncPlayers(room,game){
  for(const player of game._s.players){
    const member=activeMembers(room).find(candidate=>candidate.seat===player.id);
    const profile=profileForSeat(player.id);
    player.name=member?member.name:profile.name;
    player.title=member?(member.id===room.ownerId?'试炼发起人':'远程魔法师'):profile.title;
    player.color=member?(player.id===0?'#f5e4ad':'#b9e7df'):profile.color;
    player.characterKey=characterForSeat(player.id).key;
    player.isHuman=!!member;
    player.aiProfile=clone(profile);
  }
}

function hydrate(room){
  const game=Object.create(AbracadaGame.prototype);
  game._s=clone(room.engine);
  syncPlayers(room,game);
  return game;
}

function setDeadline(room,game,now){
  if(game._s.phase!=='casting'){
    room.deadline=null;
    return;
  }
  const member=activeMembers(room).find(candidate=>candidate.seat===game._s.activeIndex);
  const connected=member&&now-member.lastSeen<OFFLINE_MS;
  room.deadline=Math.max(now,room.actionAvailableAt||0)+(connected?TURN_MS:AI_DELAY_MS);
}

export function actionPresentationMs(action){
  if(action?.type==='stop')return DRAW_PRESENTATION_MS;
  if(action?.type!=='cast')return 0;
  let duration=CAST_PRESENTATION_MS;
  if(action.roll!==null&&action.roll!==undefined)duration+=DIE_PRESENTATION_MS;
  if(action.success)duration+=SPELL_PRESENTATION_MS[action.spell]||0;
  const hasLifeChange=action.lifeChanges?.some(change=>change.amount!==0);
  if(hasLifeChange)duration+=LIFE_PRESENTATION_MS;
  const splitDragonFailure=!action.success&&action.spell===1&&action.roll!==null&&action.roll!==undefined&&hasLifeChange;
  if(splitDragonFailure)duration+=ACTION_HOLD_MS+LIFE_PRESENTATION_MS;
  if(!action.success||action.spell===4)duration+=DRAW_PRESENTATION_MS;
  return duration;
}

function holdForAction(room,action,now){
  room.actionAvailableAt=now+actionPresentationMs(action);
  if(action?.type==='cast'){
    room.actionSequence=(room.actionSequence||0)+1;
    room.reveal={...clone(action),id:room.actionSequence,at:now,until:room.actionAvailableAt};
  }else room.reveal=null;
}

function settle(room,game,now){
  room.engine=clone(game._s);
  if(game._s.phase==='round-complete'){
    room.status='round-complete';
    room.members.forEach(member=>member.ready=false);
    room.deadline=null;
    return;
  }
  if(game._s.phase==='game-complete'){
    room.status='finished';
    room.members.forEach(member=>member.ready=false);
    room.deadline=null;
    return;
  }
  room.status='playing';
  setDeadline(room,game,now);
}

function beginGame(room,now){
  const game=new AbracadaGame({playerCount:room.playerCount,mode:room.mode,seed:`${room.code}-${room.round}-${now}-${secureRandom()}`});
  syncPlayers(room,game);
  game.startGame();
  room.actionAvailableAt=null;
  room.reveal=null;
  room.members.forEach(member=>member.ready=false);
  settle(room,game,now);
  room.version++;
}

function continueGame(room,now){
  const game=hydrate(room);
  game.nextRound();
  room.actionAvailableAt=null;
  room.reveal=null;
  room.members.forEach(member=>member.ready=false);
  settle(room,game,now);
  room.version++;
}

export function advanceAbracadaRoom(room,now){
  if(room.status!=='playing'||!room.engine||room.engine.phase!=='casting'||now<room.deadline||now<(room.actionAvailableAt||0))return false;
  const game=hydrate(room);
  const actor=game._s.players[game._s.activeIndex];
  const member=activeMembers(room).find(candidate=>candidate.seat===actor.id);
  if(member)game._log(`${member.name}${now-member.lastSeen<OFFLINE_MS?'行动超时':'暂时离线'}，由塔灵代为行动。`,'timeout',actor.id);
  const wasHuman=actor.isHuman;
  actor.isHuman=false;
  const action=game.botAction();
  actor.isHuman=wasHuman;
  holdForAction(room,action,now);
  settle(room,game,now);
  room.version++;
  return true;
}

function rotateResult(result,seat,count){
  if(!result)return null;
  const rotate=id=>(id-seat+count)%count;
  const points=Array(count).fill(0);
  const life=Array(count).fill(0);
  result.points.forEach((value,id)=>points[rotate(id)]=value);
  result.life.forEach((value,id)=>life[rotate(id)]=value);
  return {...clone(result),winnerIds:result.winnerIds.map(rotate),loserIds:result.loserIds.map(rotate),survivors:result.survivors.map(rotate),points,life};
}

function rotateAction(action,seat,count){
  if(!action)return null;
  const rotate=id=>(id-seat+count)%count;
  return {...clone(action),playerId:rotate(action.playerId),...(action.lifeChanges?{lifeChanges:action.lifeChanges.map(change=>({...change,playerId:rotate(change.playerId)}))}:{})};
}

export function projectAbracadaRoom(room,member,now){
  const count=room.playerCount;
  const seat=member.seat;
  const rotate=id=>(id-seat+count)%count;
  const roster=activeMembers(room).map(candidate=>({
    id:candidate.id,
    name:candidate.name,
    seat:rotate(candidate.seat),
    towerSeat:candidate.seat,
    owner:candidate.id===room.ownerId,
    ready:candidate.ready,
    connected:now-candidate.lastSeen<OFFLINE_MS,
    characterKey:characterForSeat(candidate.seat).key,
  })).sort((left,right)=>left.seat-right.seat);
  const meta={
    code:room.code,
    status:room.status,
    version:room.version,
    mode:room.mode,
    playerCount:room.playerCount,
    isOwner:member.id===room.ownerId,
    selfId:member.id,
    selfReady:member.ready,
    roster,
    aiCount:room.playerCount-roster.length,
    serverNow:now,
    deadline:room.deadline,
    actionAvailableAt:room.actionAvailableAt||null,
    reveal:rotateAction(room.reveal,seat,count),
    turnSeconds:TURN_MS/1000,
    expiresAt:room.expiresAt,
  };
  if(!room.engine)return {room:meta,game:null};
  const game=hydrate(room);
  const view=game.getPublicState(seat);
  const players=view.players.map(player=>{
    const occupant=activeMembers(room).find(candidate=>candidate.seat===player.id);
    const self=player.id===seat;
    return {...player,id:rotate(player.id),isHuman:self,isRemoteHuman:!!occupant&&!self,isBot:!occupant,connected:occupant?now-occupant.lastSeen<OFFLINE_MS:true};
  }).sort((left,right)=>left.id-right.id);
  const events=view.events.map(event=>({...event,...(Number.isInteger(event.playerId)?{playerId:rotate(event.playerId)}:{})}));
  return {room:meta,game:{...view,activeIndex:rotate(view.activeIndex),nextStarter:rotate(view.nextStarter),players,events,roundResult:rotateResult(view.roundResult,seat,count),gameWinnerIds:view.gameWinnerIds.map(rotate)}};
}

export class AbracadaRoomService{
  constructor(store,clock=()=>Date.now()){this.store=store;this.clock=clock;}

  async create(input){
    const name=nickname(input.name);
    const mode=input.mode||'score';
    const playerCount=Number(input.playerCount||4);
    requireThat(['score','single'].includes(mode)&&Number.isInteger(playerCount)&&playerCount>=2&&playerCount<=5,400,'房间设置无效。');
    const token=randomToken();
    const tokenHash=await hashToken(token);
    const now=this.clock();
    const owner={id:crypto.randomUUID(),seat:0,name,tokenHash,lastSeen:now,ready:true,left:false,processed:[]};
    for(let attempt=0;attempt<8;attempt++){
      const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const code=Array.from({length:6},()=>alphabet[Math.floor(secureRandom()*alphabet.length)]).join('');
      const room={schema:1,code,version:1,round:0,actionSequence:0,mode,playerCount,status:'waiting',ownerId:owner.id,members:[owner],engine:null,deadline:null,actionAvailableAt:null,reveal:null,createdAt:now,expiresAt:now+ROOM_TTL};
      if(await this.store.create(code,room,room.expiresAt))return {...projectAbracadaRoom(room,owner,now),token};
    }
    throw new AbracadaRoomError(503,'暂时无法创建房间，请稍后重试。');
  }

  async request(code,token,operation,input={}){
    requireThat(/^[A-Z2-9]{6}$/.test(code),400,'请输入正确的六位房间码。');
    const tokenHash=typeof token==='string'&&/^[a-f0-9]{48}$/.test(token)?await hashToken(token):null;
    const joining=operation==='join';
    if(joining)requireThat(typeof input.seatKey==='string'&&/^[a-f0-9]{48}$/.test(input.seatKey),400,'请重新打开加入页面。');
    const joinToken=joining?input.seatKey:null;
    const joinHash=joinToken?await hashToken(joinToken):null;
    const joinName=joining?nickname(input.name):null;
    for(let attempt=0;attempt<12;attempt++){
      const now=this.clock();
      const stored=await this.store.get(code,now);
      requireThat(stored,404,'房间不存在或已经过期。');
      const room=clone(stored.room);
      let member=memberByHash(room,tokenHash);
      let changed=false;
      let actionResult=null;
      if(joining){
        const existing=memberByHash(room,joinHash);
        if(existing){
          member=existing;
          member.lastSeen=now;
          changed=true;
        }else{
          requireThat(room.status==='waiting',409,'试炼已经开始，新玩家暂时不能加入。');
          requireThat(activeMembers(room).length<room.playerCount,409,'房间真人席位已满。');
          requireThat(!activeMembers(room).some(candidate=>candidate.name.toLowerCase()===joinName.toLowerCase()),409,'这个昵称已有人使用，请换一个。');
          const seat=Array.from({length:room.playerCount},(_,index)=>index).find(index=>!activeMembers(room).some(candidate=>candidate.seat===index));
          member={id:crypto.randomUUID(),seat,name:joinName,tokenHash:joinHash,lastSeen:now,ready:false,left:false,processed:[]};
          room.members.push(member);
          room.version++;
          changed=true;
        }
      }else{
        requireThat(member,403,'座位身份已失效，请重新加入房间。');
        if(operation==='action'&&member.processed.includes(input.requestId))return projectAbracadaRoom(room,member,now);
        if(now-member.lastSeen>=8000){member.lastSeen=now;changed=true;}
        changed=advanceAbracadaRoom(room,now)||changed;
        if(operation==='action'){
          requireThat(typeof input.requestId==='string'&&/^[a-zA-Z0-9_-]{8,80}$/.test(input.requestId),400,'行动编号无效。');
          requireThat(Number.isInteger(input.version)&&input.version===room.version,409,'牌局已更新，请查看最新状态后重新选择。');
          requireThat(room.status==='playing'&&room.engine?.phase==='casting',409,'当前没有等待中的行动。');
          requireThat(now>=(room.actionAvailableAt||0),409,'法术效果仍在展示，请稍候一秒。');
          const game=hydrate(room);
          requireThat(game._s.activeIndex===member.seat,409,'还没有轮到你。');
          try{
            if(input.type==='cast')actionResult={type:'cast',playerId:member.seat,...game.cast(Number(input.spell))};
            else if(input.type==='stop'){game.stop();actionResult={type:'stop',playerId:member.seat};}
            else throw new Error('行动类型无效。');
          }catch(error){throw new AbracadaRoomError(400,error.message);}
          member.processed.push(input.requestId);
          member.processed=member.processed.slice(-24);
          member.lastSeen=now;
          holdForAction(room,actionResult,now);
          settle(room,game,now);
          room.version++;
          changed=true;
        }else if(operation==='ready'){
          requireThat(['waiting','round-complete','finished'].includes(room.status),409,'请等待本轮结束后准备。');
          member.ready=!!input.ready;
          member.lastSeen=now;
          room.version++;
          changed=true;
        }else if(operation==='seat'){
          requireThat(room.status==='waiting',409,'只能在等待室中更换座位。');
          const nextSeat=Number(input.seat);
          requireThat(Number.isInteger(nextSeat)&&nextSeat>=0&&nextSeat<room.playerCount,400,'请选择有效的法师座位。');
          requireThat(!activeMembers(room).some(candidate=>candidate.id!==member.id&&candidate.seat===nextSeat),409,'这个座位已经有玩家了。');
          member.seat=nextSeat;
          member.lastSeen=now;
          room.version++;
          changed=true;
        }else if(operation==='start'){
          requireThat(member.id===room.ownerId,403,'只有房主能开始。');
          requireThat(['waiting','round-complete','finished'].includes(room.status),409,'当前不能开始新的试炼。');
          requireThat(activeMembers(room).every(candidate=>candidate.ready&&now-candidate.lastSeen<OFFLINE_MS),409,'请等待所有真人玩家在线并准备。');
          if(room.status==='round-complete')continueGame(room,now);
          else{
            room.round++;
            beginGame(room,now);
          }
          changed=true;
        }else if(operation==='kick'){
          requireThat(room.status==='waiting'&&member.id===room.ownerId,403,'只有房主能在开局前移出玩家。');
          const target=room.members.find(candidate=>candidate.id===input.memberId&&!candidate.left);
          requireThat(target&&target.id!==member.id,400,'请选择其他玩家。');
          target.left=true;
          room.members=activeMembers(room);
          room.version++;
          changed=true;
        }else if(operation==='leave'){
          member.left=true;
          member.ready=false;
          if(room.status==='waiting')room.members=activeMembers(room);
          rebalanceOwner(room);
          if(room.engine?.activeIndex===member.seat)room.deadline=now+AI_DELAY_MS;
          room.version++;
          changed=true;
        }else requireThat(operation==='state',404,'操作不存在。');
      }
      if(changed){
        room.expiresAt=now+ROOM_TTL;
        if(!await this.store.cas(code,stored.revision,room,room.expiresAt))continue;
      }
      if(operation==='leave')return {left:true};
      const response={...projectAbracadaRoom(room,member,now),...(joinToken?{token:joinToken}:{})};
      if(actionResult)response.action=rotateAction(actionResult,member.seat,room.playerCount);
      return response;
    }
    throw new AbracadaRoomError(409,'房间正忙，请刷新状态后重试。');
  }
}

export class MemoryAbracadaRoomStore{
  constructor(){this.rows=new Map();}
  async get(code,now){const value=this.rows.get(code);return value&&value.expiresAt>now?clone(value):null;}
  async create(code,room,expiresAt){if(this.rows.has(code))return false;this.rows.set(code,{revision:0,room:clone(room),expiresAt});return true;}
  async cas(code,revision,room,expiresAt){const previous=this.rows.get(code);if(!previous||previous.revision!==revision)return false;this.rows.set(code,{revision:revision+1,room:clone(room),expiresAt});return true;}
}
