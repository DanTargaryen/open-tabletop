import {createGame,applyOnlineAction,viewState,eventForViewer,freezeGame,thawGame,
  skipIfCuffed,timeoutAct,sideOfSeat,opponent} from '../web/engine.js';

export const ROOM_TTL=86400000,TURN_MS=90000;
export class BuckshotError extends Error { constructor(status,message){ super(message); this.status=status; } }
const requireThat=(ok,status,message)=>{ if(!ok) throw new BuckshotError(status,message); };
const clone=value=>structuredClone(value);

export async function hashToken(token){
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('');
}

function nameOf(value){
  requireThat(typeof value==='string'&&[...value.trim()].length>=1&&[...value.trim()].length<=16&&!/[\u0000-\u001f\u007f<>]/.test(value),400,'昵称请使用 1–16 个正常字符。');
  return value.trim();
}
function keyOf(value){ requireThat(typeof value==='string'&&/^[a-f0-9]{48}$/.test(value),403,'身份已失效，请重新进入房间。'); return value; }
const active=room=>room.members.filter(m=>!m.left);
const secureRandom=()=>{ const buf=new Uint32Array(1); crypto.getRandomValues(buf); return buf[0]/2**32; };

function setDeadline(room,now){
  room.deadline=!room.game||room.game.over?null:now+TURN_MS;
}

function packEvent(room,result,{chain=false}={}){
  room.eventSeq=(room.eventSeq||0)+1;
  const event={seq:room.eventSeq,...result};
  if(result?.stolen&&!event.from)event.from=opponent(result.actor);
  if(chain&&room.lastEvent)room.lastEvent.followUp=event;
  else room.lastEvent=event;
  return event;
}

function applyDue(room,now){
  if(room.status!=='playing'||!room.game||room.game.over)return false;
  const g=thawGame(room.game,secureRandom);
  let changed=false;
  while(!g.over&&g.cuffed[g.turn]){
    packEvent(room,{kind:'skip',...skipIfCuffed(g)});
    changed=true;
  }
  if(changed){
    room.game=freezeGame(g);
    room.status=g.over?'finished':'playing';
    setDeadline(room,now);
    room.version++;
    return true;
  }
  if(room.deadline!=null&&now>=room.deadline){
    packEvent(room,timeoutAct(g));
    room.game=freezeGame(g);
    room.status=g.over?'finished':'playing';
    setDeadline(room,now);
    room.version++;
    return true;
  }
  return false;
}

export function projectRoom(room,member,now){
  const side=sideOfSeat(member.seat);
  return {room:{code:room.code,version:room.version,status:room.status,capacity:2,
    selfId:member.id,selfSeat:member.seat,isOwner:member.id===room.ownerId,
    members:active(room).map(m=>({id:m.id,name:m.name,seat:m.seat,ready:m.ready,owner:m.id===room.ownerId,connected:now-m.lastSeen<20000})),
    deadline:room.deadline,serverNow:now,expiresAt:room.expiresAt},
    game:room.game?{...viewState(room.game,side),lastEvent:eventForViewer(room.lastEvent,side)}:null};
}

export class BuckshotRooms{
  constructor(store,clock=()=>Date.now()){ this.store=store; this.clock=clock; }

  async create(input){
    const name=nameOf(input.name),token=keyOf(input.seatKey),tokenHash=await hashToken(token);
    const now=this.clock(),alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for(let attempt=0;attempt<8;attempt++){
      const code=Array.from({length:6},(_,i)=>alphabet[parseInt(tokenHash.slice((attempt*6+i)%32*2,(attempt*6+i)%32*2+2),16)%32]).join('');
      const existing=await this.store.get(code,now);
      if(existing){
        const member=active(existing.room).find(m=>m.tokenHash===tokenHash);
        if(member)return {...projectRoom(existing.room,member,now),token};
        continue;
      }
      const owner={id:crypto.randomUUID(),name,tokenHash,seat:0,ready:true,lastSeen:now,left:false,processed:[]};
      const room={schema:1,code,version:0,capacity:2,status:'waiting',ownerId:owner.id,members:[owner],game:null,deadline:null,eventSeq:0,lastEvent:null,expiresAt:now+ROOM_TTL};
      if(await this.store.create(code,room,room.expiresAt))return {...projectRoom(room,owner,now),token};
      const raced=await this.store.get(code,now);
      const creator=raced&&active(raced.room).find(m=>m.tokenHash===tokenHash);
      if(creator)return {...projectRoom(raced.room,creator,now),token};
    }
    throw new BuckshotError(503,'暂时无法创建房间，请稍后重试。');
  }

  async request(code,token,operation,input={}){
    requireThat(/^[A-Z2-9]{6}$/.test(code),400,'房间码应为六位字母或数字。');
    const joining=operation==='join',rawKey=keyOf(joining?input.seatKey:token),hash=await hashToken(rawKey);
    const joinName=joining?nameOf(input.name):null;
    for(let attempt=0;attempt<12;attempt++){
      const now=this.clock(),row=await this.store.get(code,now);
      requireThat(row,404,'房间不存在或已过期。');
      const room=clone(row.room);
      let member=active(room).find(m=>m.tokenHash===hash),changed=false;
      if(operation==='leave'&&!member&&room.members.some(m=>m.left&&m.tokenHash===hash&&m.processed.includes(input.requestId)))return {left:true};
      if(joining&&!member){
        requireThat(room.status==='waiting',409,'对局已开始，新玩家请等待下一局。');
        requireThat(active(room).length<2,409,'房间已满。');
        requireThat(!active(room).some(m=>m.name.toLowerCase()===joinName.toLowerCase()),409,'这个昵称已有人使用。');
        const seat=active(room).some(m=>m.seat===0)?1:0;
        member={id:crypto.randomUUID(),name:joinName,tokenHash:hash,seat,ready:false,lastSeen:now,left:false,processed:[]};
        room.members.push(member);room.version++;changed=true;
      }
      requireThat(member,403,'无法恢复座位，请检查所用浏览器。');
      if(now-member.lastSeen>=10000){member.lastSeen=now;changed=true;}
      const mutation=!['state','join'].includes(operation);
      let duplicate=false;
      if(mutation){
        requireThat(typeof input.requestId==='string'&&/^[\w-]{8,80}$/.test(input.requestId),400,'缺少有效的请求编号。');
        duplicate=member.processed.includes(input.requestId);
      }
      if(!duplicate&&room.status==='playing'&&applyDue(room,now))changed=true;
      if(mutation&&!duplicate){
        if(input.version!==room.version){
          if(changed&&!await this.store.cas(code,row.revision,room,now+ROOM_TTL))continue;
          throw new BuckshotError(409,'牌桌已更新，请查看最新状态后再操作。');
        }
        if(operation==='ready'){
          requireThat(room.status==='waiting',409,'当前不在准备阶段。');
          requireThat(typeof input.ready==='boolean',400,'准备状态无效。');
          member.ready=input.ready;
        }else if(operation==='start'){
          requireThat(member.id===room.ownerId&&room.status==='waiting',403,'只有房主可以开始等待中的对局。');
          requireThat(active(room).length===2,409,'好友房需要两位玩家才能开始。');
          requireThat(active(room).every(m=>m.ready),409,'请等待双方准备。');
          const host=active(room).find(m=>m.seat===0),guest=active(room).find(m=>m.seat===1);
          const g=createGame({rng:secureRandom,mode:'practice',first:secureRandom()<.5?'ai':'player'});
          g.names={player:host.name,ai:guest.name};
          room.game=freezeGame(g);
          room.status='playing';
          room.eventSeq=0;
          packEvent(room,{kind:'start'});
          setDeadline(room,now);
        }else if(operation==='action'){
          requireThat(room.status==='playing',409,'对局尚未开始或已经结束。');
          const g=thawGame(room.game,secureRandom);
          let result;
          try{result=applyOnlineAction(g,sideOfSeat(member.seat),input.action);}
          catch(error){throw new BuckshotError(400,error.message);}
          packEvent(room,result);
          if(g.cuffed[g.turn]&&!g.over)packEvent(room,{kind:'skip',...skipIfCuffed(g)},{chain:true});
          room.game=freezeGame(g);
          room.status=g.over?'finished':'playing';
          setDeadline(room,now);
        }else if(operation==='rematch'){
          requireThat(member.id===room.ownerId&&room.status==='finished',403,'对局结束后由房主发起再来一局。');
          room.status='waiting';room.game=null;room.deadline=null;room.lastEvent=null;room.eventSeq=0;
          for(const m of active(room))m.ready=m.id===room.ownerId;
        }else if(operation==='leave'){
          member.left=true;
          if(member.id===room.ownerId)room.ownerId=active(room)[0]?.id||null;
          if(room.status==='playing'&&room.game&&!room.game.over){
            const g=thawGame(room.game,secureRandom);
            g.over=true;
            g.winner=opponent(sideOfSeat(member.seat));
            packEvent(room,{kind:'leave',actor:sideOfSeat(member.seat)});
            room.game=freezeGame(g);
            room.status='finished';
            room.deadline=null;
          }
        }else throw new BuckshotError(404,'操作不存在。');
        member.processed.push(input.requestId);member.processed=member.processed.slice(-64);
        room.version++;changed=true;
      }
      if(changed){
        room.expiresAt=active(room).length?now+ROOM_TTL:now;
        if(!await this.store.cas(code,row.revision,room,room.expiresAt))continue;
      }
      return operation==='leave'?{left:true}:{...projectRoom(room,member,now),...(joining?{token:rawKey}:{})};
    }
    throw new BuckshotError(409,'房间正在同步，请重试。');
  }
}
