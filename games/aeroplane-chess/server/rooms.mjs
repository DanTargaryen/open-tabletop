import {createGame,rollDice,movePiece,botStep,COLORS,clone} from '../web/engine.js';

export const TURN_MS=45000, AI_DELAY_MS=1100, ROOM_TTL=24*60*60*1000;
const active=room=>room.members.filter(m=>!m.left);
const random=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),n=>n.toString(16).padStart(2,'0')).join('');
export class AeroplaneRoomError extends Error {constructor(status,message){super(message);this.status=status;}}
const check=(condition,status,message)=>{if(!condition)throw new AeroplaneRoomError(status,message);};
export async function hashToken(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');}
function nickname(value){check(typeof value==='string'&&[...value.trim()].length>=1&&[...value.trim()].length<=16&&!/[\u0000-\u001f\u007f<>]/.test(value),400,'昵称请使用 1–16 个正常字符。');return value.trim();}
function syncPlayers(room){if(!room.engine)return;for(const p of room.engine.players){const m=active(room).find(m=>m.seat===p.id);p.isBot=!m;p.name=m?m.name:COLORS[p.color].bot;}}
function deadline(room,now){room.deadline=room.status==='playing'?now+(room.engine.players[room.engine.turn].isBot?AI_DELAY_MS:TURN_MS):null;}
function settle(room,now){room.status=room.engine.phase==='finished'?'finished':'playing';if(room.status==='finished')room.members.forEach(m=>m.ready=false);deadline(room,now);room.version++;}
export function advanceAeroplaneRoom(room,now){
  if(room.status!=='playing'||now<room.deadline)return false;
  syncPlayers(room);botStep(room.engine,random);settle(room,now);return true;
}
export function projectAeroplaneRoom(room,member,now){
  return {room:{code:room.code,status:room.status,version:room.version,playerCount:room.playerCount,
    selfId:member.id,selfSeat:member.seat,isOwner:room.ownerId===member.id,selfReady:member.ready,
    aiCount:room.playerCount-active(room).length,deadline:room.deadline,serverNow:now,expiresAt:room.expiresAt,
    roster:active(room).map(m=>({id:m.id,name:m.name,seat:m.seat,ready:m.ready,owner:m.id===room.ownerId,connected:now-m.lastSeen<20000}))},game:room.engine?clone(room.engine):null};
}
export class AeroplaneRoomService {
  constructor(store,clock=()=>Date.now()){this.store=store;this.clock=clock;}
  async create(input){
    const name=nickname(input.name),count=input.playerCount??4;
    check(Number.isInteger(count)&&count>=2&&count<=4,400,'请选择 2–4 支机队。');
    const key=token(),now=this.clock();
    const member={id:crypto.randomUUID(),seat:0,name,tokenHash:await hashToken(key),ready:true,lastSeen:now,left:false,processed:[]};
    for(let i=0;i<8;i++){
      const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const code=Array.from({length:6},()=>alphabet[Math.floor(random()*alphabet.length)]).join('');
      const room={schema:1,code,playerCount:count,version:1,status:'waiting',ownerId:member.id,members:[member],engine:null,deadline:null,expiresAt:now+ROOM_TTL};
      if(await this.store.create(code,room,room.expiresAt))return {...projectAeroplaneRoom(room,member,now),token:key};
    }
    throw new AeroplaneRoomError(503,'暂时无法创建房间，请稍后重试。');
  }
  async request(code,key,operation,input={}){
    check(/^[A-Z2-9]{6}$/.test(code),400,'请输入六位房间码。');
    const joining=operation==='join';
    if(joining)check(typeof input.seatKey==='string'&&/^[a-f0-9]{48}$/.test(input.seatKey),400,'请重新打开加入页面。');
    const joinName=joining?nickname(input.name):null;
    const hash=joining?await hashToken(input.seatKey):typeof key==='string'&&/^[a-f0-9]{48}$/.test(key)?await hashToken(key):null;
    for(let i=0;i<12;i++){
      const now=this.clock(),stored=await this.store.get(code,now);check(stored,404,'房间不存在或已过期。');
      const room=clone(stored.room);let m=active(room).find(m=>m.tokenHash===hash),changed=false;
      if(joining){
        if(!m){
          check(room.status==='waiting',409,'本局已经开始，请等待下一局。');
          check(active(room).length<room.playerCount,409,'房间已满。');
          check(!active(room).some(m=>m.name.toLowerCase()===joinName.toLowerCase()),409,'昵称已有人使用。');
          const seat=Array.from({length:room.playerCount},(_,i)=>i).find(i=>!active(room).some(m=>m.seat===i));
          m={id:crypto.randomUUID(),seat,name:joinName,tokenHash:hash,ready:false,lastSeen:now,left:false,processed:[]};
          room.members.push(m);
          if(!room.ownerId){room.ownerId=m.id;m.ready=true;}
          room.version++;
        }
        m.lastSeen=now;changed=true;
      }else{
        check(m,403,'座位身份已失效，请重新加入。');
        if(operation==='action'&&m.processed.includes(input.requestId))return projectAeroplaneRoom(room,m,now);
        if(now-m.lastSeen>=8000){m.lastSeen=now;changed=true;}
        changed=advanceAeroplaneRoom(room,now)||changed;
        if(operation==='action'){
          check(typeof input.requestId==='string'&&/^[a-zA-Z0-9_-]{8,80}$/.test(input.requestId),400,'行动编号无效。');
          check(input.version===room.version,409,'棋局已更新，请重试。');
          check(room.status==='playing'&&room.engine.turn===m.seat,409,'还没有轮到你。');
          try {
            if(input.type==='roll')rollDice(room.engine,random);
            else if(input.type==='move')movePiece(room.engine,input.piece);
            else throw Error('行动类型无效。');
          }catch(error){throw new AeroplaneRoomError(400,error.message);}
          m.processed.push(input.requestId);m.processed=m.processed.slice(-64);m.lastSeen=now;
          settle(room,now);changed=true;
        }else if(operation==='ready'){
          check(['waiting','finished'].includes(room.status),409,'请在开局前准备。');
          check(typeof input.ready==='boolean',400,'准备状态无效。');
          m.ready=input.ready;m.lastSeen=now;room.version++;changed=true;
        }else if(operation==='start'){
          check(m.id===room.ownerId,403,'只有房主能开始。');
          check(['waiting','finished'].includes(room.status),409,'请等待本局结束。');
          check(active(room).every(m=>m.ready&&now-m.lastSeen<20000),409,'请等待所有玩家在线并准备。');
          room.engine=createGame({playerCount:room.playerCount,mode:'online'});syncPlayers(room);
          room.members.forEach(m=>m.ready=false);settle(room,now);changed=true;
        }else if(operation==='leave'){
          m.left=true;m.ready=false;
          if(room.ownerId===m.id)room.ownerId=active(room)[0]?.id??null;
          if(room.status==='waiting')room.members=active(room);
          syncPlayers(room);
          if(room.engine?.turn===m.seat&&room.status==='playing')deadline(room,now);
          room.version++;changed=true;
        }else check(operation==='state',404,'操作不存在。');
      }
      if(changed){room.expiresAt=now+ROOM_TTL;if(!await this.store.cas(code,stored.revision,room,room.expiresAt))continue;}
      if(operation==='leave')return {left:true};
      return {...projectAeroplaneRoom(room,m,now),...(joining?{token:input.seatKey}:{})};
    }
    throw new AeroplaneRoomError(409,'房间正忙，请稍后重试。');
  }
}
export class MemoryAeroplaneRoomStore {
  constructor(){this.rows=new Map();}
  async get(code,now){const row=this.rows.get(code);return row&&row.expiresAt>now?clone(row):null;}
  async create(code,room,expiresAt){if(this.rows.has(code))return false;this.rows.set(code,{revision:0,room:clone(room),expiresAt});return true;}
  async cas(code,revision,room,expiresAt){const previous=this.rows.get(code);if(!previous||previous.revision!==revision)return false;this.rows.set(code,{revision:revision+1,room:clone(room),expiresAt});return true;}
}
