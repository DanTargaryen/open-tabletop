import {ITEM_DEFS,MAX_HP} from './engine.js';
import {playModeBgm,stopModeBgm,isBgmEnabled,setBgmEnabled} from './audio.js';
import {bindTutorial} from './tutorial.js';

const $=id=>document.getElementById(id);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const SESSION='open-tabletop.buckshot.session.v1';
const PENDING='open-tabletop.buckshot.pending.v1';
const NAME_KEY='open-tabletop.buckshot.name';
const API='/api/buckshot';
const newKey=()=>[...crypto.getRandomValues(new Uint8Array(24))].map(b=>b.toString(16).padStart(2,'0')).join('');
const uuid=()=>crypto.randomUUID();
const read=(store,key)=>{try{return JSON.parse(store.getItem(key));}catch{return null;}};
const save=(store,key,value)=>store.setItem(key,JSON.stringify(value));

let table3d=null,session=null,room=null,state=null,pending=null;
let busy=false,sending=false,polling=false,armed=false,arming=false;
let pollTimer=null,clockTimer=null,shownRound=0,lastPlayedSeq=0,syncedAt=0,error='';
let displayHold=null,enteredTable=false,queuedPoll=null,itemHtml='';

import('./three-table.js').then(({createTable3D})=>{
  table3d=createTable3D($('tableCanvas'));
  if(!table3d)return;
  table3d.onPick=onPick;
  table3d.revealHp=revealHp;
  if(state){
    render();
    table3d.playReload(state).catch(err=>console.warn(err));
  }
}).catch(err=>console.warn('3D 牌桌无法启动',err));

const charge=(n,max=state?.maxHp??MAX_HP)=>'⚡'.repeat(n)+'·'.repeat(Math.max(0,max-n));
const animateShot=r=>table3d?table3d.playShoot(r):wait(260);
const animateItem=r=>table3d?table3d.playItem(r):wait(160);
const names=()=>({player:state?.names?.player||'你',ai:state?.names?.ai||'对手'});
function addLog(text){$('log').textContent=text}
function hideNotice(){$('notice').classList.add('hidden')}
function showNotice(reason,title='无法使用'){
  addLog(reason);
  $('noticeTitle').textContent=title;
  $('noticeText').textContent=reason;
  $('notice').classList.remove('hidden');
  $('noticeOk').focus();
}
function blockedNotice(id,reason){
  const name=ITEM_DEFS[id]?.name;
  showNotice(reason,name?`无法使用「${name}」`:'无法使用');
}
function setNetError(text){error=text||'';if($('netError'))$('netError').textContent=error;}

function itemPayload(r,hp){
  return {
    actor:r.actor,item:r.item,revealed:r.revealed,stolen:r.stolen,primed:r.primed,
    slot:r.slot,stealSlot:r.stealSlot,from:r.from||(r.stolen?'ai':r.actor),
    ejected:r.ejected,healed:r.healed,good:r.good,delta:r.delta,position:r.position,live:r.live,
    hp:hp||state?.hp,
  };
}

const stealing=()=>!!state?.stealing;
const myTurn=()=>state&&!state.over&&state.turn==='player'&&!state.cuffed.player;
const usableSlots=()=>state?(state.itemReasons||[]).map((reason,slot)=>reason?null:slot).filter(slot=>slot!==null):[];
const ownSlots=()=>state?state.items.player.map((_,slot)=>slot):[];
const stealSlots=()=>{
  const legal=state?.stealOptions||[];
  return state?state.items.ai.map((id,slot)=>({id,slot})).filter(({id})=>legal.includes(id)).map(({slot})=>slot):[];
};
const allAiSlots=()=>state?state.items.ai.map((_,slot)=>slot):[];

function onPick(pick){
  if(busy||!myTurn())return;
  if(stealing()){
    if(pick.type!=='item'||pick.side!=='ai')return;
    const steal=state.items.ai[pick.slot];
    if(!steal||(pick.id&&steal!==pick.id)||!(state.stealOptions||[]).includes(steal)){
      blockedNotice(steal||pick.id,'这件道具现在偷不了');return;
    }
    sendAction({type:'steal',item:steal,slot:pick.slot});
    return;
  }
  if(pick.type==='gun'){drawGun();return;}
  if(pick.type==='target'){armed=false;sendAction({type:'shoot',target:pick.side==='player'?'self':'opponent'});return;}
  if(pick.type==='item'&&pick.side==='player'){
    const id=state.items.player[pick.slot];
    const reason=(state.itemReasons||[])[pick.slot];
    if(reason){blockedNotice(id,reason);return;}
    usePlayerItem(id,pick.slot);
  }
}

async function drawGun(){
  if(busy||armed||arming||stealing())return;
  arming=true;busy=true;render();
  try{if(table3d)await table3d.drawGun('player');armed=true;}
  finally{arming=false;busy=false;render();}
}

async function holsterThen(fn){
  if(armed||table3d?.gunDrawn){
    armed=false;busy=true;render();
    try{if(table3d)await table3d.holsterGun('player');}
    finally{busy=false;}
  }
  return fn();
}

function usePlayerItem(id,slot){
  const go=()=>sendAction({type:'use',item:id,slot});
  if(armed||table3d?.gunDrawn)holsterThen(go);
  else go();
}

function banner(s){
  if(s.over)return s.winner==='player'?'对局结束 · 你获胜':'对局结束 · 对手获胜';
  if(s.turn!=='player')return `等待 ${s.names?.ai||'对手'} 行动`;
  if(s.cuffed.player)return '你被手铐束缚 · 本回合跳过';
  if(s.stealing)return '肾上腺素 · 点击对手桌上要偷的道具';
  if(arming)return '正在举枪';
  if(armed)return '已举枪 · 点击桌上的身份铭牌';
  return '轮到你 · 点击桌上的枪，或点道具使用';
}

function phoneNotes(s){
  return (s.records.player||[]).map(entry=>`第 ${entry.position} 发是${entry.live?'实弹':'空弹'}`).join('\n');
}

function snapshotHold(s){return {hp:{player:s.hp.player,ai:s.hp.ai},turn:s.turn}}
function revealHp(side,charges){
  if(displayHold)displayHold={...displayHold,hp:{...displayHold.hp,[side]:charges}};
  const el=side==='ai'?$('aiHp'):$('youHp');
  el.textContent=charge(charges,state?.maxHp??MAX_HP);
  el.classList.remove('hp-drop');
  void el.offsetWidth;
  el.classList.add('hp-drop');
}

async function playShotResult(r,hold,after){
  displayHold={hp:{...hold.hp},turn:hold.turn};
  render();
  logShot(r);
  await animateShot({...r,hpAfter:after.hp});
  displayHold=null;
  if(table3d)await table3d.flipShellDown(r.live);
}

function logShot(r){
  const n=names();
  const actor=n[r.actor],target=r.target===r.actor?'自己':n[r.target];
  if(r.live)addLog(`${actor}对${target}打出实弹，${n[r.target]}受到 ${r.damage} 点伤害`);
  else addLog(`${actor}对${target}打出空弹，${r.target===r.actor?`${actor}继续行动`:`行动权交给${n[r.actor==='player'?'ai':'player']}`}`);
}

function render(){
  if(!state)return;
  const raw=state;
  const s=displayHold?{...raw,hp:{...displayHold.hp},over:false,winner:null,turn:displayHold.turn}:raw;
  const active=!busy&&!s.over&&s.turn==='player'&&!s.cuffed.player;
  $('dealerName').textContent=s.names?.ai||'对手';
  $('playerName').textContent=s.names?.player||'你';
  $('turnBanner').textContent=banner(s);
  $('round').textContent=`第 ${s.round} 轮`;
  $('aiHp').textContent=charge(s.hp.ai,s.maxHp);
  $('youHp').textContent=charge(s.hp.player,s.maxHp);
  const list=ids=>ids.map(id=>ITEM_DEFS[id].name).join('、')||'无';
  $('aiInfo').textContent=`手铐：${s.cuffed.ai?'束缚中':'无'} · 道具 ${s.items.ai.length}/${s.capacity}：${list(s.items.ai)}`;
  $('youInfo').textContent=`手铐：${s.cuffed.player?'束缚中':'无'}${s.saw.player?' · 锯子已装上':''} · 道具 ${s.items.player.length}/${s.capacity}`;
  $('ammoCount').textContent=`${s.ammoCount} 发`;
  $('ammoMix').textContent=`实弹 ${s.liveCount} · 空弹 ${s.ammoCount-s.liveCount}`;
  const notes=phoneNotes(s);
  $('phoneNotes').textContent=notes;
  $('phoneNotes').classList.toggle('on',!!notes);
  $('itemHint').textContent='';
  $('game').classList.toggle('stealing',!!s.stealing);
  $('shootEnemy').disabled=!active||s.stealing;
  $('shootSelf').disabled=!active||s.stealing;
  const owner=s.stealing?'ai':'player';
  const html=s.items[owner].map((id,slot)=>{
    const reason=s.stealing?(stealSlots().includes(slot)?null:'现在偷不了这件'):(s.itemReasons||[])[slot];
    return `<button class="item${reason?' blocked':''}" data-slot="${slot}" ${!active?'disabled':''} title="${reason||ITEM_DEFS[id].help}"><b>${ITEM_DEFS[id].name}</b><small>${reason||ITEM_DEFS[id].help}</small></button>`;
  }).join('');
  if(html!==itemHtml){itemHtml=html;$('items').innerHTML=html;}
  table3d?.sync(s);
  table3d?.setPickable({
    gun:active&&!armed&&!s.stealing,
    items:{side:s.stealing?'ai':'player',slots:active?(s.stealing?stealSlots():usableSlots()):[],
      pick:active?(s.stealing?allAiSlots():ownSlots()):[]},
    targets:active&&armed&&!s.stealing,
  });
  updateCountdown();
}

async function presentRefill(event,next){
  if(!event?.itemRefill||next.over||!table3d)return;
  if(next.round!==shownRound)return;
  await table3d.playReload(next,{shells:false});
}

async function settle(next){
  if(next.round!==shownRound){
    shownRound=next.round;
    if(!next.over&&table3d)await table3d.playReload(next);
  }
}

function eventSeq(event){return event?.followUp?eventSeq(event.followUp):event?.seq||0;}
function queuedEvents(next){
  const list=next?.events?.length?next.events:(next?.lastEvent?[next.lastEvent]:[]);
  return list.filter(event=>event&&event.kind!=='start'&&event.seq>lastPlayedSeq);
}
function pollDelay(){
  if(document.hidden)return 4000;
  if(!room||room.status!=='playing'||!state||state.over)return 1600;
  if(busy||state.turn!=='player')return 380;
  return 900;
}

async function playRemoteEvent(event,before,after){
  if(!event||event.kind==='start'||event.kind==='leave')return;
  if(armed||table3d?.gunDrawn){
    armed=false;
    try{if(table3d)await table3d.holsterGun('player');}catch{/* 对手行动时收枪失败不阻断结算 */}
  }
  if(event.skip||event.kind==='skip'){
    if(table3d)await table3d.releaseCuffs(event.actor||'player');
  }  else if(event.item){
    if(event.stolen&&table3d)await table3d.clearStealFocus();
    await animateItem(itemPayload(event,after.hp));
    await presentRefill(event,after);
  }else if(event.live!==undefined){
    await playShotResult(event,snapshotHold(before),after);
    await presentRefill(event,after);
  }
  if(event.followUp)await playRemoteEvent(event.followUp,after,after);
}

function showLobby(){
  enteredTable=false;state=null;room=null;armed=false;
  $('lobbyView').classList.remove('hidden');
  $('onlineSetup').classList.remove('hidden');
  $('roomWaiting').classList.add('hidden');
  $('game').classList.add('hidden');
  $('result').classList.add('hidden');
  document.title='暗膛协议 · 好友房';
  const pendingSeat=read(sessionStorage,'open-tabletop.buckshot.entry.create')||read(sessionStorage,SESSION);
  $('resumeRoomBtn').classList.toggle('hidden',!session);
}

function renderWaiting(){
  if(!room)return;
  enteredTable=false;
  $('lobbyView').classList.add('hidden');
  $('game').classList.add('hidden');
  $('result').classList.add('hidden');
  $('roomWaiting').classList.remove('hidden');
  document.title=`好友房 ${room.code} · 暗膛协议`;
  $('waitingCode').textContent=room.code;
  const seats=[0,1].map(seat=>room.members.find(m=>m.seat===seat)||null);
  $('waitingDescription').textContent=seats.every(Boolean)?'两位玩家都在桌上。准备后由房主开局。':'把房间码或邀请链接发给朋友，凑齐两人才能开始。';
  $('roomRoster').innerHTML=[0,1].map(seat=>{
    const m=seats[seat];
    if(!m)return `<div class="roster-seat empty"><span class="roster-avatar">${seat+1}</span><span><b>空位</b><small>等待入座</small></span></div>`;
    return `<div class="roster-seat"><span class="roster-avatar">${seat+1}</span><span><b>${escapeHtml(m.name)}${m.owner?' · 房主':''}${m.id===room.selfId?' · 你':''}</b><small>${m.connected?'在线':'暂时离开'}</small></span><em class="roster-ready${m.ready?' on':''}">${m.ready?'已准备':'未准备'}</em></div>`;
  }).join('');
  const self=room.members.find(m=>m.id===room.selfId);
  const allReady=room.members.length===2&&room.members.every(m=>m.ready);
  $('readyRoomBtn').textContent=self?.ready?'取消准备':'准备好了';
  $('readyRoomBtn').disabled=busy;
  $('startRoomBtn').disabled=busy||!room.isOwner||!allReady;
  $('startRoomBtn').classList.toggle('hidden',!room.isOwner);
  $('waitingHint').textContent=room.isOwner?(allReady?'双方已准备，可以开始对局。':room.members.length<2?'等待朋友入座。':'等待对方准备。'):(self?.ready?'你已准备，等待房主开局。':'准备后，房主即可开始。');
  if(error)$('waitingHint').textContent=error;
}

function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

function unlockUi(){
  busy=false;
  sending=false;
  drainPoll();
  if(state)render();
  else if(room)renderWaiting();
}

async function enterTable(s){
  $('lobbyView').classList.add('hidden');
  $('roomWaiting').classList.add('hidden');
  $('result').classList.add('hidden');
  $('game').classList.remove('hidden');
  shownRound=s.round;
  enteredTable=true;
  $('game').classList.toggle('night-mode',false);
  table3d?.setNightMode(false);
  void playModeBgm('practice');
  table3d?.resetLayout();
  table3d?.sync(s);
  addLog(s.turn==='player'?`由你先手。`:`由${s.names?.ai||'对手'}先手。`);
  render();
  try{if(table3d)await table3d.playReload(s);}
  catch(err){console.warn(err);}
}

function showResult(s){
  $('result').classList.remove('hidden');
  const win=s.winner==='player';
  $('result').innerHTML=`<div class="result-box"><h2>${win?'你赢了':'你输了'}</h2><p>你完成了 ${s.round} 轮，剩余生命 ${s.hp.player} · ${escapeHtml(s.names?.ai||'对手')} ${s.hp.ai}。</p>${room?.isOwner?'<button id="again" class="primary">再来一局</button>':'<p>等待房主发起下一局</p>'} <button id="leaveEnd" class="quiet">离开房间</button></div>`;
  $('again')?.addEventListener('click',()=>mutate('rematch'));
  $('leaveEnd').onclick=leaveRoom;
}

function updateCountdown(){
  const el=$('turnCountdown');
  if(!el||!room?.deadline||!state||state.over){if(el)el.textContent='';return;}
  const skew=Date.now()-syncedAt;
  el.textContent=Math.max(0,Math.ceil((room.deadline-(room.serverNow+skew))/1000))+'s';
}

async function api(path,{body,token}={}){
  const response=await fetch(API+path,{
    method:body?'POST':'GET',
    headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},
    body:body?JSON.stringify(body):undefined,
  });
  let data;try{data=await response.json();}catch{throw Error('联机服务不可用，请通过 Node 服务打开页面。');}
  if(!response.ok){const e=Error(data.error||'同步失败');e.status=response.status;throw e;}
  return data;
}

async function accept(data,{silent=false}={}){
  if(room?.code===data.room.code&&data.room.version<room.version)return;
  const before=state;
  const starting=!silent&&room?.status==='waiting'&&data.room.status==='playing';
  room=data.room;error='';syncedAt=Date.now();
  const next=data.game;
  const events=silent?[]:queuedEvents(next);
  if(data.room.status==='waiting'||!next){
    lastPlayedSeq=0;enteredTable=false;state=null;armed=false;itemHtml='';
    stopModeBgm();
    $('result').classList.add('hidden');
    renderWaiting();
    return;
  }
  if(!silent&&events.length&&before){
    busy=true;
    try{
      if(events.length>3||(before.round!=null&&next.round>before.round+1)){
        lastPlayedSeq=eventSeq(events[events.length-1]);
        state=next;
        shownRound=next.round;
        table3d?.resetLayout();
        table3d?.sync(next);
        if(table3d)await table3d.playReload(next);
      }else{
        for(const event of events){
          await playRemoteEvent(event,before,next);
          lastPlayedSeq=eventSeq(event);
        }
        state=next;
        await settle(next);
      }
    }catch(err){console.warn(err);lastPlayedSeq=Math.max(lastPlayedSeq,eventSeq(events[events.length-1]));state=next;}
  }else{
    const event=next.lastEvent;
    if(event)lastPlayedSeq=Math.max(lastPlayedSeq,eventSeq(event));
    state=next;
    if(starting||!enteredTable)await enterTable(next);
  }
  try{
    if(table3d){
      if(state?.stealing&&state.turn==='player'&&!state.over){
        busy=true;
        await table3d.focusStealItems();
      }else await table3d.clearStealFocus();
    }
  }catch(err){console.warn(err);}
  busy=false;
  if(state?.over)showResult(state);
  else $('result').classList.add('hidden');
  render();
  await drainPoll();
}

async function applyPoll(data){
  const versionChanged=data.room.version!==room?.version||data.room.status!==room?.status||!!error;
  if(versionChanged)await accept(data);
  else{
    room=data.room;syncedAt=Date.now();
    if(room.status==='waiting')renderWaiting();
    else updateCountdown();
  }
}

async function drainPoll(){
  const data=queuedPoll;queuedPoll=null;
  if(data&&session)await applyPoll(data);
}

async function poll(){
  if(polling)return;
  clearTimeout(pollTimer);
  if(!session)return;
  polling=true;
  const identity=session;
  try{
    if(!busy&&pending){busy=true;await sendPending();}
    if(session===identity&&!pending){
      const data=await api('/rooms/'+identity.code,{token:identity.token});
      if(session!==identity)return;
      if(busy)queuedPoll=data;
      else await applyPoll(data);
    }
  }catch(e){
    if(session===identity){
      error=e.message||'连接中断，重连后可继续。';
      if(room?.status==='waiting')renderWaiting();
      else if(state)addLog(error);
      else setNetError(error);
    }
  }finally{
    polling=false;
    if(session)pollTimer=setTimeout(poll,pollDelay());
  }
}

async function mutate(op,input={}){
  if(busy||pending||!session)return;
  busy=true;
  pending={code:session.code,op,input:{...input,version:room.version,requestId:uuid()}};
  save(sessionStorage,PENDING,pending);
  if(room?.status==='waiting')renderWaiting();
  await sendPending();
}

async function sendPending(){
  if(sending)return;
  if(!pending||!session){unlockUi();return;}
  if(pending.code!==session.code){pending=null;sessionStorage.removeItem(PENDING);unlockUi();return;}
  const request=pending,identity=session;
  sending=true;
  try{
    const data=await api('/rooms/'+identity.code+'/'+request.op,{body:request.input,token:identity.token});
    if(session!==identity||pending!==request)return;
    const left=data.left;pending=null;sessionStorage.removeItem(PENDING);
    if(left){clearSession();showLobby();return;}
    await accept(data);
  }catch(e){
    if(session!==identity||pending!==request)return;
    if(e.status&&e.status<500){
      pending=null;sessionStorage.removeItem(PENDING);
      if(e.status===409){try{await accept(await api('/rooms/'+session.code,{token:session.token}));}catch{/* 以最新房间状态为准 */}}
      else showNotice(e.message);
    }else{
      error=e.message||'网络未确认这次行动。';
      showNotice(error,'同步失败');
    }
  }finally{unlockUi();}
}

function sendAction(action){
  if(busy||!myTurn())return;
  armed=false;
  mutate('action',{action});
}

function clearSession(){
  if(session){
    sessionStorage.removeItem(SESSION);
    localStorage.removeItem('open-tabletop.buckshot.identity.'+session.code);
  }
  session=null;room=null;state=null;pending=null;lastPlayedSeq=0;enteredTable=false;queuedPoll=null;itemHtml='';
  sessionStorage.removeItem(PENDING);
  clearTimeout(pollTimer);
  stopModeBgm();
  history.replaceState(null,'',location.pathname);
}

async function enterRoom(joining){
  if(busy){setNetError('正在连接，请稍等。');return;}
  const name=$('onlineName').value.trim(),code=$('joinCode').value.trim().toUpperCase();
  if(!name){setNetError('先输入你的昵称。');$('onlineName').focus();return;}
  if(joining&&!/^[A-Z2-9]{6}$/.test(code)){setNetError('请输入六位房间码。');return;}
  save(localStorage,NAME_KEY,name);busy=true;setNetError('');
  const keyName='open-tabletop.buckshot.entry.'+(joining?code:'create');
  const key=read(sessionStorage,keyName)||newKey();save(sessionStorage,keyName,key);
  try{
    const data=await api(joining?'/rooms/'+code+'/join':'/rooms',{body:{name,seatKey:key},token:null});
    session={code:data.room.code,token:data.token};
    save(sessionStorage,SESSION,session);
    save(localStorage,'open-tabletop.buckshot.identity.'+session.code,session);
    sessionStorage.removeItem(keyName);
    history.replaceState(null,'','?room='+session.code);
    busy=false;await accept(data,{silent:true});poll();
  }catch(e){busy=false;setNetError(e.message);}
}

async function copyInvite(){
  if(!session)return;
  const url=new URL(location.href);url.search='?room='+session.code;
  try{await navigator.clipboard.writeText(url.toString());showNotice('邀请链接已复制，发给要对坐的朋友。','已复制');}
  catch{showNotice(url.toString(),'复制邀请链接');}
}

async function leaveRoom(){
  if(!session)return;
  if(room?.status==='playing'&&!state?.over&&!confirm('离开后本局将判负。确定离开吗？'))return;
  await mutate('leave');
}

function syncBgmBtn(){
  const on=isBgmEnabled();
  $('bgmBtn').setAttribute('aria-pressed',on?'true':'false');
  $('bgmBtn').textContent=on?'背景音乐':'背景音乐 · 关';
}

$('createRoomBtn').onclick=()=>enterRoom(false);
$('joinRoomBtn').onclick=()=>enterRoom(true);
$('resumeRoomBtn').onclick=()=>{if(session)poll();};
$('copyInviteBtn').onclick=copyInvite;
$('copyGameInvite').onclick=copyInvite;
$('readyRoomBtn').onclick=()=>{
  const self=room?.members.find(m=>m.id===room.selfId);
  mutate('ready',{ready:!self?.ready});
};
$('startRoomBtn').onclick=()=>mutate('start');
$('leaveWaitingBtn').onclick=leaveRoom;
$('leaveGameBtn').onclick=leaveRoom;
bindTutorial();
$('bgmBtn').onclick=()=>{setBgmEnabled(!isBgmEnabled());syncBgmBtn();};
$('shootEnemy').onclick=()=>sendAction({type:'shoot',target:'opponent'});
$('shootSelf').onclick=()=>sendAction({type:'shoot',target:'self'});
$('items').onclick=e=>{
  if(!state||busy||!myTurn())return;
  const button=e.target.closest('[data-slot]');
  if(!button)return;
  const slot=Number(button.dataset.slot);
  if(stealing()){
    const steal=state.items.ai[slot];
    if(!(state.stealOptions||[]).includes(steal)){blockedNotice(steal,'这件道具现在偷不了');return;}
    sendAction({type:'steal',item:steal,slot});
    return;
  }
  const id=state.items.player[slot];
  const reason=(state.itemReasons||[])[slot];
  if(reason){blockedNotice(id,reason);return;}
  usePlayerItem(id,slot);
};
$('noticeOk').onclick=hideNotice;
$('notice').onclick=e=>{if(e.target.id==='notice')hideNotice();};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('notice').classList.contains('hidden'))hideNotice();});
$('tabletopHome')?.addEventListener('click',event=>{
  if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  if(session&&room?.status!=='finished'&&!confirm('返回大厅后房间会继续运行。确定返回吗？'))event.preventDefault();
});
window.addEventListener('pagehide',stopModeBgm);
document.addEventListener('visibilitychange',()=>{if(session&&!document.hidden)poll();});
clockTimer=setInterval(updateCountdown,500);
syncBgmBtn();

$('onlineName').value=read(localStorage,NAME_KEY)||'';
const invited=new URLSearchParams(location.search).get('room');
if(invited)$('joinCode').value=invited.toUpperCase();
session=read(sessionStorage,SESSION);
if(invited&&session?.code!==invited)session=read(localStorage,'open-tabletop.buckshot.identity.'+invited);
pending=read(sessionStorage,PENDING);
if(session){
  save(sessionStorage,SESSION,session);
  $('resumeRoomBtn').classList.remove('hidden');
  (async()=>{
    try{
      lastPlayedSeq=Infinity;
      await accept(await api('/rooms/'+session.code,{token:session.token}),{silent:true});
      lastPlayedSeq=eventSeq(state?.lastEvent);
      if(pending){busy=true;await sendPending();}
      poll();
    }catch(e){session=null;setNetError(e.message);showLobby();}
  })();
}
