import {createGame,clone,COLORS,FINISH,rollDice,movePiece,botStep,legalPieces,validSavedGame,moveRoute} from './engine.js';
import {createDicePresentation,DICE_ROLL_MS} from './dice-presentation.js';
import {drawBoard,updatePlanes,planeIcon} from './board.js';
import {isMuted,toggleSound,unlockSound,resetAudio,soundEvents} from './audio.js';

const $=id=>document.getElementById(id),escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const online=/\/online(?:\.html)?\/?$/.test(location.pathname),SAVE='aeroplane.local.v1',IDENTITY='aeroplane.room.v1',API='/api/aeroplane';
let state=createGame(),room=null,identity=null,busy=false,pollTimer=null,botTimer=null,boardKey='',dieFrameTimer=null,skipNextSnapshot=false;
const dicePresentation=createDicePresentation({onReveal:()=>render(),duration:()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches?100:DICE_ROLL_MS});
let networkBusy=false,disposed=false,pendingAction=null,joinAttempt=null,networkGeneration=0;
const read=key=>{try{return JSON.parse(localStorage.getItem(key));}catch{return null;}};
const save=(key,value)=>{try{value===null?localStorage.removeItem(key):localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}};
function error(message=''){$('error').textContent=message;$('error').hidden=!message;}
function persist(){if(!online&&!save(SAVE,state))error('浏览器未允许保存，本局可继续游玩，但刷新后无法恢复。');}
function ownTurn(){return !busy&&!dicePresentation.rolling&&(!online?!state.players[state.turn].isBot:room?.status==='playing'&&room.selfSeat===state.turn);}
function soundButton(){$('sound-button').textContent=isMuted()?'♩':'♫';$('sound-button').setAttribute('aria-label',isMuted()?'开启音效':'关闭音效');$('sound-button').setAttribute('aria-pressed',String(isMuted()));}

const diePatterns={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
const spinFaces=[2,5,3,1,6,4];
function paintDice(view,rolling){
  // Decorative faces cycle by time, without drawing from the game's RNG.
  const face=rolling?spinFaces[Math.floor(performance.now()/75)%spinFaces.length]:(view.die||6);
  $('die').querySelectorAll('i').forEach((el,i)=>{el.style.opacity=diePatterns[face].includes(i)?'1':'0';});
  $('die').setAttribute('aria-label',rolling?'骰子旋转中':view.die?`骰子 ${view.die} 点`:'尚未掷骰');
  $('die').setAttribute('aria-busy',String(rolling));
}

function render(){
  const view=dicePresentation.sync(state),rolling=dicePresentation.rolling;
  const actor=view.players[view.turn],color=COLORS[actor.color],key=view.players.map(p=>p.color).join(',');
  document.documentElement.style.setProperty('--team',color.ink);document.documentElement.style.setProperty('--light',color.light);
  if(boardKey!==key){drawBoard($('board'),view.players);boardKey=key;}
  const active=!online||room?.status==='playing'||rolling,mine=ownTurn();
  updatePlanes($('board'),view,active&&mine&&view.phase==='move');
  $('turn-panel').hidden=!active||view.phase==='finished';
  $('active-icon').innerHTML=planeIcon;$('active-color').textContent=`${color.name}机队 · ${actor.name}`;
  $('turn-title').textContent=rolling?'正在掷骰…':view.phase==='finished'?'全员抵达':mine?view.phase==='move'?'选择一架飞机':'轮到你了':actor.isBot?'正在思考…':'等待好友…';
  $('roll-button').disabled=!active||!mine||view.phase!=='roll';
  $('roll-button').textContent=rolling?'骰子旋转中…':busy?'正在同步…':view.phase==='move'?'点选飞机':mine?'掷骰子':'等待行动';
  const hint=view.phase==='move'?mine?`掷出 ${view.die} 点 · 点击高亮飞机或下方按钮`:`${actor.name} 正在选择飞机`:mine?'掷出 6 点即可起飞，也可前进 6 格':`${actor.name} 的回合${online?' · 超时将由 AI 代打':''}`;
  $('turn-hint').textContent=rolling?'稍等，骰子停下后揭晓点数':hint;
  paintDice(view,rolling);
  $('die').classList.toggle('rolling',rolling);
  if(rolling&&dieFrameTimer===null)dieFrameTimer=setInterval(()=>paintDice(view,true),75);
  if(!rolling&&dieFrameTimer!==null){clearInterval(dieFrameTimer);dieFrameTimer=null;}
  $('move-choices').innerHTML=active&&mine?legalPieces(view).map(piece=>{
    const from=actor.planes[piece],to=moveRoute(actor.color,from,view.die).stops.at(-1);
    return `<button data-move="${piece}">${piece+1} 号 · ${from===-1?'起飞':to===FINISH?'抵达':'前进'}</button>`;
  }).join(''):'';
  $('roster').hidden=online&&!room;
  $('roster').innerHTML=view.players.map(player=>{
    const count=player.planes.filter(p=>p===FINISH).length,c=COLORS[player.color];
    const label=online?(room?.roster.some(m=>m.seat===player.id)?(player.id===room.selfSeat?'你':'好友'):'本地 AI'):player.isBot?'本地 AI':view.mode==='local'?'同屏玩家':'你';
    return `<div class="roster-row ${view.turn===player.id?'current':''}" style="--team:${c.ink};--light:${c.light}"><span class="roster-plane">${planeIcon}</span><span class="roster-name">${escape(player.name)}<small>${c.name} · ${label}</small></span><span class="progress-count">${count} / 4</span><span class="progress-dots" aria-hidden="true">${Array.from({length:4},(_,i)=>`<i class="${i<count?'done':''}"></i>`).join('')}</span></div>`;
  }).join('');
  $('event-log').innerHTML=view.events.length?[...view.events].reverse().slice(0,6).map(e=>`<li>${escape(e.text)}</li>`).join(''):'<li>飞机就位，把快乐飞得更远。</li>';
  $('result').hidden=view.phase!=='finished';
  if(view.phase==='finished')$('winner-title').textContent=`${view.players[view.winner].name} 赢得本局`;
  $('play-again').hidden=online;
  $('mode-label').textContent=online?`好友房${room?' · '+room.code:''}`:view.mode==='local'?`${view.players.length} 人 · 同屏轮流操作`:'单人 · 本地 AI';
  if(!rolling)soundEvents(view);renderRoom();scheduleBot();
}

function scheduleBot(){
  clearTimeout(botTimer);
  if(online||disposed||busy||dicePresentation.rolling||document.hidden||$('setup-dialog').open||$('rules-dialog').open||state.phase==='finished'||!state.players[state.turn].isBot)return;
  botTimer=setTimeout(()=>{botStep(state);persist();render();},state.phase==='move'?950:1100);
}
async function action(type,piece){
  if(!ownTurn()||state.phase==='finished')return;
  unlockSound();error();
  if(type==='roll'){dicePresentation.begin();render();}
  if(online){
    const body=pendingAction||{type,...(type==='move'?{piece}:{}),version:room.version,requestId:crypto.randomUUID()};
    pendingAction=body;
    const result=await roomCommand('action',body);
    if(result)pendingAction=null;
  }else{
    try{type==='roll'?rollDice(state):movePiece(state,piece);persist();render();}catch(e){dicePresentation.reset(state);render();error(e.message);}
  }
}

async function api(path,{body,token}={}){
  let response;
  try{response=await fetch(API+path,{method:body===undefined?'GET':'POST',headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});}catch{throw Error('网络暂时中断，座位已保留。请重新连接。');}
  let data;try{data=await response.json();}catch{throw Error('服务器暂时未响应，座位已保留。请重试。');}
  if(!response.ok){const failure=Error(data.error||'请求失败，请重试。');failure.status=response.status;throw failure;}
  return data;
}
function applySnapshot(data,{initial=false}={}){
  if(!data.room||!Array.isArray(data.room.roster))throw Error('房间状态暂时不可用，请重试。');
  if(room&&room.code===data.room.code&&data.room.version<room.version)return;
  room=data.room;
  const previousEventId=state.eventId;
  if(data.game)state=data.game;
  else {state=createGame({playerCount:room.playerCount,mode:'online'});for(const p of state.players){const m=room.roster.find(m=>m.seat===p.id);p.name=m?.name??COLORS[p.color].bot;p.isBot=!m;}}
  if(initial||document.hidden||state.eventId<previousEventId){resetAudio(state);dicePresentation.reset(state);}
  if(pendingAction&&room.version>pendingAction.version)pendingAction=null;
  $('connection').textContent='已连接';error();render();
}
function clearIdentity(){identity=null;room=null;pendingAction=null;networkGeneration++;save(IDENTITY,null);state=createGame();resetAudio(state);dicePresentation.reset(state);render();}
function handleFailure(e){
  dicePresentation.reset(state);render();
  if([403,404].includes(e.status)&&identity)clearIdentity();
  if(e.status===409)pendingAction=null;
  error(e.message);$('connection').textContent='连接中断 · 正在重试';renderRoom();
}
function schedulePoll(){
  clearTimeout(pollTimer);
  if(!online||!identity||disposed)return;
  pollTimer=setTimeout(poll,document.hidden?5000:room?.status==='playing'?1000:2000);
}
async function poll(){
  if(networkBusy||busy){schedulePoll();return;}
  if(!identity)return;
  networkBusy=true;const generation=networkGeneration;
  try{const data=await api(`/rooms/${identity.code}`,{token:identity.token});if(generation===networkGeneration)applySnapshot(data,{initial:!room||skipNextSnapshot});skipNextSnapshot=false;}catch(e){if(generation===networkGeneration)handleFailure(e);}
  finally{networkBusy=false;schedulePoll();}
}
async function roomCommand(operation,body={}){
  if(busy||!identity)return false;
  busy=true;render();clearTimeout(pollTimer);
  try{
    const data=await api(`/rooms/${identity.code}/${operation}`,{body,token:identity.token});
    if(operation==='leave'){clearIdentity();error('已离开房间，你的机队由 AI 接管。');}
    else applySnapshot(data);
    return true;
  }catch(e){handleFailure(e);return false;}
  finally{busy=false;render();schedulePoll();}
}
async function enterRoom(joining=false){
  if(busy||identity)return;
  const name=$('nickname').value.trim(),code=$('room-code').value.trim().toUpperCase();
  if(!name){error('先给自己取一个名字。');return;}
  if(joining&&!/^[A-Z2-9]{6}$/.test(code)){error('请输入正确的六位房间码。');return;}
  busy=true;renderRoom();error();
  try{
    if(joining&&(!joinAttempt||joinAttempt.code!==code||joinAttempt.name!==name))joinAttempt={code,name,seatKey:Array.from(crypto.getRandomValues(new Uint8Array(24)),n=>n.toString(16).padStart(2,'0')).join('')};
    const data=await api(joining?`/rooms/${code}/join`:'/rooms',{body:joining?{name,seatKey:joinAttempt.seatKey}:{name,playerCount:Number($('room-count').value)}});
    identity={code:data.room.code,token:data.token};networkGeneration++;
    const stored=save(IDENTITY,identity);applySnapshot(data,{initial:true});
    if(!stored)error('浏览器未允许保存座位。请保持此页面打开。');
    const url=new URL(location.href);url.searchParams.set('room',identity.code);history.replaceState(null,'',url);
  }catch(e){handleFailure(e);}finally{busy=false;render();schedulePoll();}
}
function renderRoom(){
  if(!online)return;
  $('room-panel').hidden=false;
  $('room-entry').hidden=!!room;
  $('room-waiting').hidden=!room||room.status==='playing'||dicePresentation.rolling;
  $('room-tools').hidden=!room;
  $('resume-room').hidden=!identity||!!room;
  for(const id of ['create-room','join-room'])$(id).disabled=busy||!!identity;
  if(!room)return;
  $('waiting-code').textContent=room.code;
  const preview=createGame({playerCount:room.playerCount});
  $('waiting-roster').innerHTML=preview.players.map(p=>{const m=room.roster.find(m=>m.seat===p.id);return `<li><span>${COLORS[p.color].name} · ${escape(m?.name||COLORS[p.color].bot)}${m?.owner?'（房主）':''}</span><span>${!m?'AI 补位':m.ready?'已准备':'未准备'}</span></li>`;}).join('');
  $('ready-room').textContent=room.selfReady?'取消准备':'我准备好了';$('ready-room').disabled=busy;
  $('start-room').hidden=!room.isOwner;$('start-room').disabled=busy||!room.roster.every(m=>m.ready&&m.connected);
  $('start-room').textContent=room.status==='finished'?'开始下一局':'开始飞行';
  for(const id of ['leave-room','copy-invite'])$(id).disabled=busy;
}

$('roll-button').addEventListener('click',()=>action('roll'));
$('board').addEventListener('click',event=>{const b=event.target.closest('button[data-piece]');if(b&&!b.disabled&&Number(b.dataset.player)===state.turn)action('move',Number(b.dataset.piece));});
$('move-choices').addEventListener('click',event=>{const b=event.target.closest('[data-move]');if(b)action('move',Number(b.dataset.move));});
$('sound-button').addEventListener('click',()=>{unlockSound();toggleSound();soundButton();});
document.addEventListener('pointerdown',unlockSound,{once:true});
$('rules-button').addEventListener('click',()=>{clearTimeout(botTimer);$('rules-dialog').showModal();});
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>$(button.dataset.close).close()));
for(const id of ['rules-dialog','setup-dialog'])$(id).addEventListener('close',scheduleBot);
function setup(){clearTimeout(botTimer);$('local-mode').value=state.mode==='local'?'local':'solo';$('player-count').value=String(state.players.length);$('setup-dialog').showModal();}
$('new-game').addEventListener('click',setup);$('play-again').addEventListener('click',setup);
$('setup-form').addEventListener('submit',event=>{event.preventDefault();state=createGame({playerCount:Number($('player-count').value),mode:$('local-mode').value});resetAudio(state);dicePresentation.reset(state);error();persist();$('setup-dialog').close();render();});
$('create-room').addEventListener('click',()=>enterRoom());$('join-room').addEventListener('click',()=>enterRoom(true));
$('ready-room').addEventListener('click',()=>roomCommand('ready',{ready:!room.selfReady}));$('start-room').addEventListener('click',()=>roomCommand('start'));
$('leave-room').addEventListener('click',()=>roomCommand('leave'));$('resume-room').addEventListener('click',poll);
$('copy-invite').addEventListener('click',async()=>{
  const url=new URL('./online.html',location.href);url.searchParams.set('room',room.code);
  try{await navigator.clipboard.writeText(url.href);$('copy-invite').textContent='已复制';setTimeout(()=>{$('copy-invite').textContent='复制邀请';},1800);}catch{error(`请分享房间码 ${room.code}，或复制地址栏链接。`);}
});
document.addEventListener('visibilitychange',()=>{resetAudio(state);dicePresentation.reset(state);render();if(!document.hidden&&online){skipNextSnapshot=true;poll();}});
window.addEventListener('pagehide',()=>{disposed=true;dicePresentation.reset(state);clearInterval(dieFrameTimer);dieFrameTimer=null;clearTimeout(botTimer);clearTimeout(pollTimer);});
window.addEventListener('pageshow',()=>{disposed=false;if(online)schedulePoll();else scheduleBot();});

if(online){
  $('mode-link').href='./index.html';$('mode-link').textContent='单人 / 同屏';$('new-game').hidden=true;
  $('room-code').value=new URL(location.href).searchParams.get('room')?.toUpperCase().slice(0,6)||'';
  const stored=read(IDENTITY);
  if(stored&&/^[A-Z2-9]{6}$/.test(stored.code)&&/^[a-f0-9]{48}$/.test(stored.token))identity=stored;
}else{
  const stored=read(SAVE);if(validSavedGame(stored))state=clone(stored);else if(stored)save(SAVE,null);
}
resetAudio(state);dicePresentation.reset(state);soundButton();
for(const id of ['new-game','rules-button','sound-button'])$(id).disabled=false;
render();if(online&&identity)poll();
