import {createGame,step,actorId,botAction,projectGame,CHARACTERS,clone,random} from '../web/engine.js';

export const TURN_MS=45000,AI_DELAY_MS=900,ROOM_TTL=86400000;
export class CampusRoomError extends Error{constructor(status,message){super(message);this.status=status;}}
const check=(ok,status,message)=>{if(!ok)throw new CampusRoomError(status,message);};
const active=r=>r.members.filter(m=>!m.left);
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),x=>x.toString(16).padStart(2,'0')).join('');
export async function hashToken(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');}
function nickname(x){check(typeof x==='string'&&[...x.trim()].length>=1&&[...x.trim()].length<=16&&!/[\u0000-\u001f\u007f<>]/.test(x),400,'昵称请使用 1–16 个正常字符。');return x.trim();}
function character(x,used=[]){check(CHARACTERS.some(c=>c.id===x),400,'角色不存在。');check(!used.includes(x),409,'这位角色已经被选择，请选择另一位伙伴。');return x;}
function deadline(r,now){r.deadline=r.status==='playing'?now+(r.engine.players[actorId(r.engine)].isBot?AI_DELAY_MS:TURN_MS):null;}
function sync(r){if(r.engine)for(const p of r.engine.players){const m=active(r).find(m=>m.seat===p.id);p.isBot=!m;p.name=m?.name??CHARACTERS.find(c=>c.id===p.character).name;}}
function settled(r,now){r.status=r.engine.phase==='finished'?'finished':'playing';if(r.status==='finished')r.members.forEach(m=>m.ready=false);r.version++;deadline(r,now);}
export function advanceCampusRoom(r,now){if(r.status!=='playing'||now<r.deadline)return false;sync(r);const actor=actorId(r.engine);r.engine=step(r.engine,actor,botAction(projectGame(r.engine,actor)),random);settled(r,now);return true;}
export function projectCampusRoom(r,m,now){return {room:{code:r.code,status:r.status,version:r.version,playerCount:r.playerCount,selfId:m.id,selfSeat:m.seat,selfReady:m.ready,isOwner:r.ownerId===m.id,aiCount:r.playerCount-active(r).length,deadline:r.deadline,serverNow:now,expiresAt:r.expiresAt,roster:active(r).map(q=>({id:q.id,seat:q.seat,name:q.name,character:q.character,ready:q.ready,owner:r.ownerId===q.id,connected:now-q.lastSeen<20000}))},game:r.engine?projectGame(r.engine,m.seat):null};}
export class CampusRoomService{
 constructor(store,clock=()=>Date.now()){this.store=store;this.clock=clock;}
 async create(input){
  const name=nickname(input.name),playerCount=input.playerCount??4,ch=character(input.character??'railgun');check(Number.isInteger(playerCount)&&playerCount>=2&&playerCount<=4,400,'请选择 2–4 个座位。');
  const key=token(),now=this.clock(),member={id:crypto.randomUUID(),seat:0,name,character:ch,tokenHash:await hashToken(key),ready:true,left:false,lastSeen:now,processed:[]};
  for(let i=0;i<8;i++){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',code=Array.from({length:6},()=>alphabet[Math.floor(random()*alphabet.length)]).join('');const room={schema:1,code,playerCount,version:1,status:'waiting',ownerId:member.id,members:[member],engine:null,deadline:null,expiresAt:now+ROOM_TTL};if(await this.store.create(code,room,room.expiresAt))return {...projectCampusRoom(room,member,now),token:key};}
  throw new CampusRoomError(503,'暂时无法创建房间，请稍后重试。');
 }
 async request(code,key,operation,input={}){
  check(/^[A-Z2-9]{6}$/.test(code),400,'请输入六位房间码。');const joining=operation==='join';
  if(joining)check(typeof input.seatKey==='string'&&/^[a-f0-9]{48}$/.test(input.seatKey),400,'加入身份无效，请重新打开页面。');
  const name=joining?nickname(input.name):null,hash=joining?await hashToken(input.seatKey):typeof key==='string'&&/^[a-f0-9]{48}$/.test(key)?await hashToken(key):null;
  for(let attempt=0;attempt<12;attempt++){
   const now=this.clock(),row=await this.store.get(code,now);check(row,404,'房间不存在或已过期。');const r=clone(row.room);let m=active(r).find(x=>x.tokenHash===hash),changed=false;
   if(joining){
    if(!m){check(r.status==='waiting',409,'本局已开始，请等待下一局。');check(active(r).length<r.playerCount,409,'房间已满。');check(!active(r).some(m=>m.name.toLowerCase()===name.toLowerCase()),409,'昵称已有人使用。');
     const seat=Array.from({length:r.playerCount},(_,i)=>i).find(i=>!active(r).some(m=>m.seat===i));m={id:crypto.randomUUID(),seat,name,character:character(input.character??'april',active(r).map(m=>m.character)),tokenHash:hash,ready:false,left:false,lastSeen:now,processed:[]};r.members.push(m);if(!r.ownerId){r.ownerId=m.id;m.ready=true;}r.version++;
    }m.lastSeen=now;changed=true;
   }else{
    check(m,403,'座位身份已失效，请重新加入。');
    if(operation==='action'&&m.processed.includes(input.requestId))return projectCampusRoom(r,m,now);
    if(now-m.lastSeen>=8000){m.lastSeen=now;changed=true;}
    changed=advanceCampusRoom(r,now)||changed;
    if(operation==='action'){
     check(typeof input.requestId==='string'&&/^[\w-]{8,80}$/.test(input.requestId),400,'行动编号无效。');check(input.version===r.version,409,'棋局已更新，请重试。');check(r.status==='playing'&&actorId(r.engine)===m.seat,409,'现在不是你的行动。');
     try{r.engine=step(r.engine,m.seat,{type:input.type,item:input.item,value:input.value,answer:input.answer},random);}catch(e){throw new CampusRoomError(400,e.message);}
     m.processed.push(input.requestId);m.processed=m.processed.slice(-64);m.lastSeen=now;settled(r,now);changed=true;
    }else if(operation==='ready'){
     check(['waiting','finished'].includes(r.status),409,'请在开局前准备。');check(typeof input.ready==='boolean',400,'准备状态无效。');m.ready=input.ready;m.lastSeen=now;r.version++;changed=true;
    }else if(operation==='start'){
     check(r.ownerId===m.id,403,'只有房主可以开始。');check(['waiting','finished'].includes(r.status),409,'本局尚未结束。');check(active(r).every(m=>m.ready&&now-m.lastSeen<20000),409,'请等待所有玩家在线并准备。');
     const used=active(r).map(m=>m.character),remaining=CHARACTERS.filter(c=>!used.includes(c.id)).map(c=>c.id);
     const players=Array.from({length:r.playerCount},(_,seat)=>{const q=active(r).find(m=>m.seat===seat);return q?{character:q.character,name:q.name,isBot:false}:{character:remaining.shift(),isBot:true};});
     r.engine=createGame({players,mode:'online'});r.members.forEach(q=>q.ready=false);settled(r,now);changed=true;
    }else if(operation==='leave'){
     m.left=true;m.ready=false;if(r.ownerId===m.id)r.ownerId=active(r)[0]?.id??null;sync(r);r.version++;deadline(r,now);changed=true;
    }else check(operation==='state',404,'操作不存在。');
   }
   if(changed){r.expiresAt=now+ROOM_TTL;if(!await this.store.cas(code,row.revision,r,r.expiresAt))continue;}
   return {...projectCampusRoom(r,m,now),...(joining?{token:input.seatKey}:{})};
  }
  throw new CampusRoomError(409,'房间正在更新，请稍后重试。');
 }
}
