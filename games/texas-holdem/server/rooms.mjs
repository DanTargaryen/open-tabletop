import {PokerGame,PERSONALITIES} from '../web/engine.js';

export const TURN_MS=45000,OFFLINE_MS=20000,ROOM_TTL=24*60*60*1000;
const ACTIVE=new Set(['preflop','flop','turn','river']);
const EMPTY={canFold:false,canCheck:false,canCall:false,canRaise:false,canAllIn:false,callAmount:0,minRaiseTo:0,maxRaiseTo:0,allInTo:0};
const clone=x=>JSON.parse(JSON.stringify(x));
export class RoomError extends Error{constructor(status,message){super(message);this.status=status;}}
const requireThat=(condition,status,message)=>{if(!condition)throw new RoomError(status,message);};
const secureRandom=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;
const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
export async function hashToken(token){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('');}
function nickname(value){requireThat(typeof value==='string',400,'请输入昵称。');const name=value.trim();requireThat([...name].length>=1&&[...name].length<=16&&!/[\u0000-\u001f\u007f<>]/.test(name),400,'昵称请使用 1–16 个正常字符。');return name;}
const memberByHash=(room,hash)=>room.members.find(m=>!m.left&&m.tokenHash===hash);
const activeMembers=room=>room.members.filter(m=>!m.left);
function namesFor(room){return Array.from({length:6},(_,seat)=>room.members.find(m=>m.seat===seat)?.name||(seat?PERSONALITIES[seat-1].name:'空位'));}
function hydrate(room){
 const g=Object.create(PokerGame.prototype);g._s=clone(room.engine);g._assertConservation();
 const previousRandom=g._random.bind(g);g._random=ai=>ai?previousRandom(true):secureRandom();
 const names=namesFor(room);g._s.players.forEach((p,i)=>p.name=names[i]);return g;
}
function setDeadline(room,g,now){
 if(!ACTIVE.has(g._s.phase)){room.deadline=null;return;}
 const member=room.members.find(m=>m.seat===g._s.currentPlayerIndex);
 room.deadline=now+(member&&!member.left?TURN_MS:650);
}
function settle(room,g,now){
 if(g._s.mode==='tournament'){
  const alive=g._s.players.filter(p=>p.stack>0);
  g._s.gameOver=g._s.phase==='complete'&&alive.length===1;
  g._s.winnerId=g._s.gameOver?alive[0].id:null;
 }
 if(g._s.phase==='complete'&&room.recordedHand!==g._s.handNumber){
  room.recordedHand=g._s.handNumber;
  for(const r of g._s.lastResult.playerResults){const score=room.scores[r.id];score.hands++;score.wins+=Number(r.won>0);score.net+=r.net;}
  room.history.unshift({result:clone(g._s.lastResult),holes:g._s.players.map(p=>[...p.hole])});room.history=room.history.slice(0,12);
  room.members.forEach(m=>m.ready=false);room.completeAt=now;
  if(g._s.gameOver)room.status='finished';
 }
 room.engine=clone(g._s);setDeadline(room,g,now);
}
function begin(room,now){
 let g;
 if(!room.engine){
  g=new PokerGame({mode:room.mode,difficulty:room.difficulty,playerName:namesFor(room)[0]});
  const rand=g._random.bind(g);g._random=ai=>ai?rand(true):secureRandom();
  g._s.players.forEach((p,i)=>p.name=namesFor(room)[i]);
 }else g=hydrate(room);
 g._s.gameOver=false;g.startHand();room.status='playing';room.members.forEach(m=>m.ready=false);settle(room,g,now);room.version++;
}
function rebalanceHost(room){
 const members=activeMembers(room);if(!members.length)return;
 if(!members.some(m=>m.id===room.ownerId))room.ownerId=members[0].id;
 if(room.status==='waiting'&&!members.some(m=>m.seat===0))members.find(m=>m.id===room.ownerId).seat=0;
}

export function advanceRoom(room,now){
 if(room.status!=='playing'||!room.engine)return false;
 if(room.engine.phase!=='complete'&&now<room.deadline)return false;
 const g=hydrate(room);
 if(g._s.phase==='complete'){
  const present=activeMembers(room).filter(m=>now-m.lastSeen<OFFLINE_MS);
  const participants=present.filter(m=>g._s.players[m.seat].stack>0||room.mode==='practice');
  if(present.length&&participants.every(m=>m.ready)&&now-room.completeAt>=1500){begin(room,now);return true;}
  return false;
 }
 if(now<room.deadline)return false;
 const actor=g._s.currentPlayerIndex,member=room.members.find(m=>m.seat===actor);
 if(member||actor===0){
  const action=g.legalActions().canCheck?'check':'fold';g._log(`${g._s.players[actor].name} ${member?.left?'已离开':'行动超时'}，自动${action==='check'?'过牌':'弃牌'}`,'timeout',actor);g.act(action);
 }else g.botAction();
 settle(room,g,now);room.version++;return true;
}

function projectResult(snapshot,viewer){
 if(!snapshot)return null;const r=snapshot.result,rot=id=>(id-viewer+6)%6;
 const visible=p=>p.id===viewer||(r.showdown&&!p.folded);
 const action=e=>({id:e.id,handNumber:e.handNumber,phase:e.phase,text:e.text,type:e.type,...(Number.isInteger(e.playerId)?{playerId:rot(e.playerId)}:{}),...(Number.isFinite(e.amount)?{amount:e.amount}:{})});
 return {handNumber:r.handNumber,totalPot:r.totalPot,summary:r.summary,showdown:r.showdown,board:[...r.board],winners:r.winners.map(w=>({id:rot(w.id),name:w.name,amount:w.amount,handName:w.handName})),pots:r.pots.map(p=>({amount:p.amount,eligibleIds:p.eligibleIds.map(rot),winnerIds:p.winnerIds.map(rot)})),playerResults:r.playerResults.map(p=>({id:rot(p.id),name:p.name,net:p.net,contribution:p.contribution,won:p.won,folded:p.folded,hole:visible(p)?[...snapshot.holes[p.id]]:[null,null],handName:visible(p)?p.handName:(p.folded?'已弃牌':'未摊牌'),bestCards:visible(p)?[...p.bestCards]:[]})),actions:r.actions.map(action)};
}
export function projectRoom(room,member,now,cursor){
 const seat=member.seat,rot=id=>(id-seat+6)%6;
 const roster=activeMembers(room).map(m=>({id:m.id,name:m.name,seat:rot(m.seat),owner:m.id===room.ownerId,ready:m.ready,connected:now-m.lastSeen<OFFLINE_MS}));
 const meta={code:room.code,status:room.status,version:room.version,mode:room.mode,difficulty:room.difficulty,isOwner:member.id===room.ownerId,selfId:member.id,roster,aiCount:6-activeMembers(room).length,serverNow:now,deadline:room.deadline,expiresAt:room.expiresAt,selfReady:member.ready,turnSeconds:TURN_MS/1000};
 const v2=cursor?.protocol===2;
 const scope=room.createdAt+':'+member.id,historyStamp=(room.round||0)+':'+room.recordedHand+':'+room.history.length;
 const sameScope=v2&&cursor.scope===scope;
 const sameHistory=sameScope&&cursor.history===historyStamp;
 const sync=v2?{protocol:2,scope,history:historyStamp,unchanged:sameScope&&sameHistory&&cursor.version===room.version}:null;
 if(sync?.unchanged)return {room:meta,sync};
 const envelope=sync?{sync}:{};
 if(!room.engine)return {room:meta,game:null,run:null,...envelope};
 const g=hydrate(room),s=g._s,reveal=s.phase==='complete'&&s.lastResult?.showdown;
 const result=projectResult(s.lastResult?{result:s.lastResult,holes:s.players.map(p=>p.hole)}:null,seat);
 const players=s.players.map(p=>{const occupant=room.members.find(m=>m.seat===p.id),self=p.id===seat;return {id:rot(p.id),name:p.name,personality:self?'你':occupant?(occupant.left?'已离开':now-occupant.lastSeen<OFFLINE_MS?'真人玩家':'暂时离线'):PERSONALITIES[p.id-1]?.label||'AI',brand:occupant?null:PERSONALITIES[p.id-1]?.brand||null,isHuman:self,isRemoteHuman:!!occupant&&!self,isBot:!occupant,connected:occupant?(!occupant.left&&now-occupant.lastSeen<OFFLINE_MS):true,stack:p.stack,startingStack:p.startingStack,bet:p.bet,contribution:p.contribution,folded:p.folded,allIn:p.allIn,eliminated:p.eliminated,rank:p.rank,isDealer:p.id===s.dealerIndex,isSmallBlind:p.id===s.smallBlindIndex,isBigBlind:p.id===s.bigBlindIndex,lastAction:p.lastAction,winnings:p.winnings,hole:p.hole.map(c=>self||(reveal&&!p.folded)?c:null)};}).sort((a,b)=>a.id-b.id);
 const score=room.scores[seat];
 const game={phase:s.phase,handNumber:s.handNumber,mode:s.mode,difficulty:s.difficulty,players,board:[...s.board],pot:g.pot,sidePots:[],blinds:{...s.blinds},dealerIndex:rot(s.dealerIndex),smallBlindIndex:rot(s.smallBlindIndex),bigBlindIndex:rot(s.bigBlindIndex),currentPlayerIndex:s.currentPlayerIndex<0?-1:rot(s.currentPlayerIndex),currentBet:s.currentBet,minRaise:s.minRaise,legalActions:s.currentPlayerIndex===seat?g.legalActions():{...EMPTY},history:s.history.map(e=>({id:e.id,handNumber:e.handNumber,phase:e.phase,text:e.text,type:e.type,...(Number.isInteger(e.playerId)?{playerId:rot(e.playerId)}:{})})),lastResult:result,gameOver:s.gameOver,winnerId:s.winnerId===null?null:rot(s.winnerId),humanRank:s.players[seat].rank,totalChips:s.totalChips,sessionStats:{handsPlayed:score.hands,handsWon:score.wins,netChips:score.net},handsUntilBlindIncrease:s.mode==='practice'?null:10-((s.handNumber-1)%10)};
 // Older actions remain available in run.history; the live log only displays this hand.
 if(v2)game.history=game.history.filter(e=>e.handNumber===s.handNumber);
 const history=sameHistory&&room.history.length?undefined:room.history.map(h=>{const r=projectResult(h,seat),own=r.playerResults.find(p=>p.id===0);return {hand:r.handNumber,net:own?.net||0,won:(own?.won||0)>0,board:r.board,hole:own?.hole.filter(Boolean)||[],summary:r.summary,handName:own?.handName||'',pot:r.totalPot,showdown:r.showdown?r.playerResults.filter(p=>!p.folded&&p.hole.every(Boolean)):[],actions:r.actions};});
 return {room:meta,game,run:{id:room.code+'-'+member.id,hands:score.hands,wins:score.wins,net:score.net,...(history?{history}:{}),recordedHand:s.handNumber,titleRecorded:false},...envelope};
}

export class RoomService{
 constructor(store,clock=()=>Date.now()){this.store=store;this.clock=clock;}
 async create(input){
  const name=nickname(input.name),mode=input.mode||'practice',difficulty=input.difficulty||'standard';
  requireThat(['practice','tournament'].includes(mode)&&['casual','standard','expert'].includes(difficulty),400,'房间设置无效。');
  const token=randomToken(),tokenHash=await hashToken(token),now=this.clock(),owner={id:crypto.randomUUID(),seat:0,name,tokenHash,lastSeen:now,ready:true,left:false,processed:[]};
  for(let attempt=0;attempt<8;attempt++){
   const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',code=Array.from({length:6},()=>alphabet[Math.floor(secureRandom()*alphabet.length)]).join('');
   const room={schema:1,code,version:1,mode,difficulty,status:'waiting',ownerId:owner.id,members:[owner],scores:Array.from({length:6},()=>({hands:0,wins:0,net:0})),engine:null,history:[],recordedHand:0,deadline:null,completeAt:null,createdAt:now,expiresAt:now+ROOM_TTL};
   if(await this.store.create(code,room,room.expiresAt))return {...projectRoom(room,owner,now,input._sync),token};
  }throw new RoomError(503,'暂时无法创建房间，请稍后重试。');
 }
 async request(code,token,operation,input={}){
  requireThat(/^[A-Z2-9]{6}$/.test(code),400,'请输入正确的六位房间码。');
  const tokenHash=typeof token==='string'&&/^[a-f0-9]{48}$/.test(token)?await hashToken(token):null;
  const joining=operation==='join';
  if(joining)requireThat(typeof input.seatKey==='string'&&/^[a-f0-9]{48}$/.test(input.seatKey),400,'请重新打开加入页面。');
  const joinToken=joining?input.seatKey:null,joinHash=joinToken?await hashToken(joinToken):null;
  const joinName=joining?nickname(input.name):null;
  for(let attempt=0;attempt<12;attempt++){
   const now=this.clock(),stored=await this.store.get(code,now);requireThat(stored,404,'房间不存在或已经过期。');
   const room=clone(stored.room);let member=memberByHash(room,tokenHash),changed=false;
   if(joining){
    const existing=memberByHash(room,joinHash);
    if(existing){member=existing;member.lastSeen=now;changed=true;}
    else{
    requireThat(room.status==='waiting',409,'牌局已经开始。已有玩家可恢复座位，新玩家请等待房主新开一场。');
    requireThat(activeMembers(room).length<6,409,'房间已满，最多六位真人。');
    requireThat(!activeMembers(room).some(m=>m.name.toLowerCase()===joinName.toLowerCase()),409,'这个昵称已有人使用，请换一个。');
    const seat=Array.from({length:6},(_,i)=>i).find(i=>!activeMembers(room).some(m=>m.seat===i));
    member={id:crypto.randomUUID(),seat,name:joinName,tokenHash:joinHash,lastSeen:now,ready:false,left:false,processed:[]};room.members.push(member);rebalanceHost(room);room.version++;changed=true;
    }
   }else{
    requireThat(member,403,'座位身份已失效，请重新加入房间。');
    if(operation==='action'&&member.processed.includes(input.requestId))return projectRoom(room,member,now,input._sync);
    if(now-member.lastSeen>=8000){member.lastSeen=now;changed=true;}
    changed=advanceRoom(room,now)||changed;
    if(operation==='action'){
     requireThat(typeof input.requestId==='string'&&/^[a-zA-Z0-9_-]{8,80}$/.test(input.requestId),400,'行动编号无效。');
     requireThat(Number.isInteger(input.version)&&input.version===room.version,409,'牌局已更新，请查看最新状态后重新选择。');
     requireThat(room.status==='playing'&&ACTIVE.has(room.engine?.phase),409,'当前没有等待中的下注。');
     const g=hydrate(room);requireThat(g._s.currentPlayerIndex===member.seat,409,'还没有轮到你。');
     requireThat(['fold','check','call','raise','all-in'].includes(input.type),400,'行动类型无效。');
     if(input.type==='raise')requireThat(Number.isSafeInteger(input.amount)&&input.amount>=0,400,'下注金额必须是整数。');
     try{g.act(input.type,input.amount);}catch(error){throw new RoomError(400,error.message);}
     member.processed.push(input.requestId);member.processed=member.processed.slice(-24);member.lastSeen=now;settle(room,g,now);room.version++;changed=true;
    }else if(operation==='ready'){
     requireThat(room.status==='waiting'||(room.status==='playing'&&room.engine?.phase==='complete'),409,'请等这一手结束后准备。');
     member.ready=!!input.ready;member.lastSeen=now;room.version++;changed=true;
    }else if(operation==='start'){
     requireThat(member.id===room.ownerId,403,'只有房主能开始。');requireThat(room.status==='waiting',409,'牌局已经开始。');
     requireThat(activeMembers(room).every(m=>m.ready&&now-m.lastSeen<OFFLINE_MS),409,'请等待所有玩家在线并准备。');
     begin(room,now);changed=true;
    }else if(operation==='new-round'){
     requireThat(member.id===room.ownerId,403,'只有房主能新开一场。');requireThat(room.status==='finished',409,'请先完成当前比赛。');
     room.members=activeMembers(room);room.round=(room.round||0)+1;room.engine=null;room.history=[];room.recordedHand=0;room.deadline=null;room.status='waiting';room.scores=Array.from({length:6},()=>({hands:0,wins:0,net:0}));rebalanceHost(room);room.members.forEach(m=>m.ready=m.id===room.ownerId);room.version++;changed=true;
    }else if(operation==='kick'){
     requireThat(room.status==='waiting'&&member.id===room.ownerId,403,'只有房主能在开局前移出玩家。');
     const target=room.members.find(m=>m.id===input.memberId&&!m.left);requireThat(target&&target.id!==member.id,400,'请选择其他玩家。');
     target.left=true;room.members=activeMembers(room);room.version++;changed=true;
    }else if(operation==='leave'){
     member.left=true;member.ready=false;
     if(room.status==='waiting')room.members=activeMembers(room);
     rebalanceHost(room);if(room.engine?.currentPlayerIndex===member.seat)room.deadline=now;
     room.version++;changed=true;
    }else requireThat(operation==='state',404,'操作不存在。');
   }
   if(changed){room.expiresAt=now+ROOM_TTL;if(!await this.store.cas(code,stored.revision,room,room.expiresAt))continue;}
   if(operation==='leave')return {left:true};
   return {...projectRoom(room,member,now,input._sync),...(joinToken?{token:joinToken}:{})};
  }throw new RoomError(409,'房间正忙，请刷新状态后重试。');
 }
}

export class MemoryRoomStore{
 constructor(){this.rows=new Map();}
 async get(code,now){const value=this.rows.get(code);return value&&value.expiresAt>now?clone(value):null;}
 async create(code,room,expiresAt){if(this.rows.has(code))return false;this.rows.set(code,{revision:0,room:clone(room),expiresAt});return true;}
 async cas(code,revision,room,expiresAt){const old=this.rows.get(code);if(!old||old.revision!==revision)return false;this.rows.set(code,{revision:revision+1,room:clone(room),expiresAt});return true;}
}
