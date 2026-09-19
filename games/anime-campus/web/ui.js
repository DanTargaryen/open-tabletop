import {isOnlinePage,loadIdentity,rememberIdentity,forgetIdentity,reconcilePending} from './room-sync.js';
import {animateRoute} from './animation.js';
import {drawCharacterTokens,tokenPosition,SEAT_COLORS} from './tokens.js';
import {DATA} from './data.js';
import {CHARACTERS,ITEMS,SKILLS,createGame,step,actorId,steps,legalActions,botAction,projectGame,validSavedGame} from './engine.js';

const $=id=>document.getElementById(id),escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const online=isOnlinePage(location.pathname),API='/api/anime-campus',SAVE='anime-campus.local.v1';
let game=null,room=null,identity=null,selected='railgun',busy=false,paused=false,botTimer,pollTimer,networkBusy=false,generation=0,pendingRequest=null,lastActor=null,memoryAnswer=[],lastPending='',zoom=1,follow=true,sound=false,audioContext=null,loaded=false,drag=null;
const chars=new Map(CHARACTERS.map(c=>[c.id,c])),avatar=id=>`assets/official/${id}.svg`,fallback='assets/avatar.svg';
function read(storage,key){try{return JSON.parse(storage.getItem(key));}catch{return null;}}
function save(storage,key,value){try{value===null?storage.removeItem(key):storage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
function message(text=''){$('error').textContent=text;$('error').hidden=!text;}
function persist(){if(!online&&game&&!save(localStorage,SAVE,game))message('本局可继续，但浏览器没有允许保存；刷新后可能无法恢复。');}
function duration(){return matchMedia('(prefers-reduced-motion: reduce)').matches||$('speed').value==='instant'?30:$('speed').value==='fast'?140:600;}
function tone(type){if(!sound||!audioContext)return;const o=audioContext.createOscillator(),v=audioContext.createGain();o.connect(v);v.connect(audioContext.destination);o.frequency.setValueAtTime(type==='finish'?523:330,audioContext.currentTime);o.frequency.exponentialRampToValueAtTime(type==='finish'?1046:440,audioContext.currentTime+.14);v.gain.setValueAtTime(.04,audioContext.currentTime);v.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.2);o.start();o.stop(audioContext.currentTime+.21);}
function unlock(){if(sound){audioContext??=new AudioContext();audioContext.resume().catch(()=>{});}}
function currentView(){return online?game:game?projectGame(game,actorId(game)):null;}
function myAction(){return game&&game.phase!=='finished'&&!busy&&!paused&&!$('rules-dialog').open&&!$('handoff').open&&(online?room?.status==='playing'&&room.selfSeat===actorId(game):!game.players[actorId(game)].isBot);}
function iconImage(id,name){return `<img src="${avatar(id)}" alt="${escape(name)}">`;}
function renderSelection(){
 $('characters').innerHTML=CHARACTERS.map(c=>`<button class="character ${selected===c.id?'selected':''}" data-character="${c.id}" aria-pressed="${selected===c.id}" aria-label="选择${c.name}">${iconImage(c.id,c.name)}${c.name}</button>`).join('');
 $('selected-skill').textContent=SKILLS[selected];
}
function point(pos){return pos===0?{x:192,y:1230}:DATA.points[pos-1];}
function drawTokens(state){
 const layer=document.querySelector('#game-tokens');if(!layer)return;
 drawCharacterTokens(layer,state,{point,characters:chars,avatar,fallback,activeId:state?actorId(state):null});
}
function fit(){const v=$('board-viewport');const base=Math.max(600,Math.min(v.clientWidth,v.clientHeight*1800/1420));$('board-canvas').style.width=`${base*zoom}px`;}
function camera(id){if(!follow||!game)return;const p=point(game.players[id].pos),v=$('board-viewport'),scale=$('board-canvas').clientWidth/1800;v.scrollTo({left:p.x*scale-v.clientWidth/2,top:p.y*scale-v.clientHeight/2,behavior:duration()>50?'smooth':'instant'});}
async function animateChanges(before,after){
 if(!before||!after)return;
 const changes=after.moves.filter(m=>!before.moves.some(q=>q.id===m.id));if(!changes.length)return;
 const ms=duration(),visual=structuredClone(before);drawTokens(visual);
 for(const move of changes){
  const element=document.querySelector(`#token-${move.player}`);if(!element)continue;
  const start=tokenPosition(visual.players,move.player,point);visual.players[move.player].pos=move.to;
  const end=tokenPosition(visual.players,move.player,point),route=[start];
  if(move.kind==='walk'&&move.to!==move.from){const d=move.to>=move.from?1:-1;for(let n=move.from+d;n!==move.to;n+=d){const pt=point(n);route.push({x:pt.x,y:pt.y-20});}}
  route.push(end);element.classList.add('player-token--moving');
  await animateRoute(element,route,ms,{offsetY:0});drawTokens(visual);
 }
 drawTokens(after);camera(after.turn);
}
const patterns={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
function paintDie(n){$('die').querySelectorAll('i').forEach((el,i)=>el.style.opacity=patterns[n||6].includes(i)?'1':'0');$('die').setAttribute('aria-label',n?`骰子 ${n} 点`:'尚未掷骰');}
function render(){
 const view=currentView(),playing=!!view&&(!online||room?.status!=='waiting');
 if(!online&&!view){const saved=read(localStorage,SAVE);$('resume-local').hidden=!validSavedGame(saved)||saved.phase==='finished';}
 $('entry').hidden=playing||!!room;$('lobby').hidden=!online||!room||room.status==='playing';$('turn-panel').hidden=!playing||view.phase==='finished';$('result').hidden=!playing||view.phase!=='finished';
 $('new-game').disabled=busy;
 $('new-game').textContent=online?'离开房间':'新旅程';$('pause').hidden=online||!playing;$('pause').textContent=paused?'继续':'暂停';
 $('mode-label').textContent=online?room?`好友房 · ${room.code}`:'好友房':!view?'校园祭 · 60 格':view.mode==='local'?'同屏 · 轮流操作':view.mode==='demo'?'AI 演示':'我与 AI 伙伴';
 if(!view){$('players').innerHTML='';$('event-panel').hidden=true;drawTokens(null);renderRoom();return;}
 const active=actorId(view),p=view.players[active],c=chars.get(p.character),mine=myAction();
 $('round-label').textContent=`ROUND ${Math.min(view.round,30)} / 30 · 第 ${view.turnCount+1} 次行动`;
 $('turn-name').textContent=p.name;$('turn-avatar').src=avatar(p.character);$('turn-avatar').alt=c.name;
 $('turn-status').textContent=`${c.name} · ♥ ${p.hp} · 零花钱 ${p.coins}${view.pending&&active!==view.turn?' · 等待你的回应':''}`;
 $('die-caption').textContent=busy?'旅程进行中…':view.die?`${view.dieSource==='fixed'?'固定':'骰子'} ${view.die} 点`:'轮到你出发';
 $('die-hint').textContent=paused?'已暂停':view.phase==='move'?`最终步数 ${steps(view)} · 可在出发前重掷或使用技能`:p.isBot?'AI 伙伴正在考虑…':mine?'现在可以行动':online?'等待好友行动':'交接屏幕后继续';
 paintDie(view.die);
 const actions=legalActions(view,active);
 $('actions').innerHTML=!view.pending?actions.map((a,i)=>`<button data-action-index="${i}" ${!mine?'disabled':''}>${escape(a.label)}</button>`).join(''):'';
 const openItems=$('bag').dataset.owner===String(active)?new Set([...$('bag').querySelectorAll('details[open]')].map(el=>el.dataset.item)):new Set();$('bag').dataset.owner=String(active);
 $('bag').innerHTML=p.bag.length?p.bag.map(x=>`<details data-item="${x}" ${openItems.has(x)?'open':''}><summary>${ITEMS[x].name}</summary><p>${escape(ITEMS[x].description)}</p></details>`).join(''):'<span>背包空空，去活动摊看看</span>';
 $('skill-status').textContent=SKILLS[p.character]+(p.skillUsed?'（本局已使用）':'（本局可用）');
 $('letter-status').textContent=p.letter?`✉ 任务信：正常前进经过第 ${p.letter} 格即可送达，奖励 3 零花钱；不占背包。`:'✉ 暂无任务信，可在邮局或部分事件领取。';
 $('event-panel').hidden=!view.event||view.phase==='finished';
 if(view.event){$('event-title').textContent=view.event.name;$('event-zone').textContent=`${view.event.id} · ${DATA.map[view.players[view.turn].pos-1]?.zone??'校园祭'}`;$('event-scene').textContent=view.event.scene??'';$('event-rule').textContent=view.event.rule??'';}
 renderPending(view,mine);
 $('players').innerHTML=view.players.map(q=>{const ch=chars.get(q.character);return `<article style="--seat:${SEAT_COLORS[q.id]}" class="player-card ${view.turn===q.id?'current':''}">${iconImage(q.character,ch.name)}<div><strong>${q.id+1} · ${escape(q.name)}</strong><small>第 ${q.pos} 格 · ♥ ${q.hp} · ¥ ${q.coins}</small><br><small>${q.isBot?'AI':online?q.id===room.selfSeat?'你':'好友':'真人'}${q.slow?` · 减速 ${q.slow}`:''}${q.boost?` · 加速 ${q.boost}`:''}${q.letter?' · 携信':''}</small></div></article>`;}).join('');
 $('log').innerHTML=[...view.log].reverse().slice(0,18).map(e=>`<li>${escape(e.text)}</li>`).join('');
 if(view.phase==='finished'){$('winner').textContent=`${view.winners.map(id=>view.players[id].name).join('、')} ${view.winners.length>1?'并列获胜':'赢得校园祭'}`;$('result-text').textContent=`共 ${Math.min(30,view.round)} 轮 · ${view.actionNumber} 次操作。今天的旅途，收进手账。`;$('again').textContent=online?(room.selfReady?'已准备 · 等待房主开局':'准备下一局'):'再来一局';}
 if(!busy)drawTokens(view);renderRoom();scheduleBot();
}
function renderPending(view,mine){
 const p=view.pending,controls=$('event-controls');if(!p){controls.innerHTML='';lastPending='';return;}
 const key=`${p.kind}:${p.actor}:${view.event?.id}`;if(key!==lastPending){memoryAnswer=[];lastPending=key;}
 if(!mine){controls.innerHTML=`<p class="subtle">等待 ${escape(view.players[p.actor].name)}${view.players[p.actor].isBot?' · AI':''} 处理。</p>`;return;}
 let extra=`<p><strong>${escape(p.title)}</strong></p>`;const symbols=['','●','▲','◆','★'];
 if(p.kind==='memoryShow')extra+=`<div class="memory-pattern" aria-label="需要记住的符号">${p.sequence.map(n=>symbols[n]).join(' ')}</div>`;
 if(p.kind==='proof')extra+=p.lines.map(a=>`<div class="memory-pattern">${a.map(n=>symbols[n]).join(' ')}</div>`).join('');
 if(p.kind==='memoryAnswer')extra+=`<div class="memory-answer" aria-live="polite">${memoryAnswer.map(n=>symbols[n]).join('')}</div><div class="memory-input">${[1,2,3,4].map(n=>`<button data-symbol="${n}" aria-label="输入符号${n}">${symbols[n]}</button>`).join('')}<button id="clear-memory" aria-label="清空答案">⌫</button></div>`;
 controls.innerHTML=extra+legalActions(view,p.actor).map((a,i)=>`<button data-action-index="${i}" ${p.kind==='memoryAnswer'&&a.value==='answer'&&memoryAnswer.length!==4?'disabled':''}>${escape(a.label)}</button>`).join('');
}
function handoff(){
 if(!game||online||game.mode!=='local'||game.phase==='finished')return;
 const actor=actorId(game);if(lastActor===actor)return;
 $('handoff-name').textContent=`现在交给 ${game.players[actor].name}`;if(!$('handoff').open)$('handoff').showModal();
}
async function dispatch(action,auto=false){
 if(busy||!game||paused||(!auto&&!myAction()))return;
 const before=game,actor=actorId(game);busy=true;clearTimeout(botTimer);message();unlock();
 try{
  if(online){pendingRequest??={...action,requestId:Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join(''),version:room.version};const result=await api(`/rooms/${identity.code}/action`,pendingRequest,identity.token);pendingRequest=null;roomSnapshot(result);}
  else{game=step(game,actor,action);persist();}
  const rolled=['roll','fixed'].includes(action.type)||action.type==='item'&&action.item==='reroll'||action.type==='skill'&&game.die!==before.die;
  render();if(rolled){$('die').classList.add('rolling');await new Promise(r=>setTimeout(r,duration()));$('die').classList.remove('rolling');tone('roll');}
  await animateChanges(before,game);if(game.phase==='finished')tone('finish');
 }catch(e){if(e.status===409){pendingRequest=null;await poll();}if([400,403,404].includes(e.status))pendingRequest=null;message(e.message);}
 finally{busy=false;handoff();render();schedulePoll();}
}
function scheduleBot(){
 clearTimeout(botTimer);if(online||!game||busy||paused||document.hidden||$('rules-dialog').open||$('handoff').open||game.phase==='finished'||!game.players[actorId(game)].isBot)return;
 botTimer=setTimeout(()=>dispatch(botAction(projectGame(game,actorId(game))),true),$('speed').value==='instant'?45:$('speed').value==='fast'?220:750);
}
function startLocal(){
 const count=Number($('count').value),mode=$('mode').value,others=CHARACTERS.map(c=>c.id).filter(id=>id!==selected);
 for(let i=others.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[others[i],others[j]]=[others[j],others[i]];}
 const ids=[selected,...others].slice(0,count);
 game=createGame({mode,players:ids.map((id,i)=>({character:id,name:i===0?$('nickname').value.trim()||chars.get(id).name:chars.get(id).name,isBot:mode==='demo'||mode==='solo'&&i>0}))});paused=false;lastActor=null;persist();handoff();render();camera(game.turn);
}
async function api(path,body,token){
 let r;try{r=await fetch(API+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});}catch{throw Error('网络暂时中断，座位已保留。请重试。');}
 let data;try{data=await r.json();}catch{throw Error('服务暂时没有响应，座位已保留，请稍后重试。');}if(!r.ok){const e=Error(data.error||'请求失败');e.status=r.status;throw e;}return data;
}
function roomSnapshot(data){if(room&&data.room.code===room.code&&data.room.version<room.version)return;pendingRequest=reconcilePending(pendingRequest,data.room.version);room=data.room;game=data.game;rememberIdentity(sessionStorage,identity);$('connection').textContent='已连接';render();}
function schedulePoll(){clearTimeout(pollTimer);if(online&&identity)pollTimer=setTimeout(poll,document.hidden?4000:900);}
async function poll(){
 if(!identity||networkBusy){schedulePoll();return;}networkBusy=true;const epoch=generation;
 try{const data=await api(`/rooms/${identity.code}`,undefined,identity.token);if(epoch===generation){roomSnapshot(data);$('connection').textContent='已连接';}}
 catch(e){if(epoch===generation){$('connection').textContent='重连中';if([403,404].includes(e.status)){forgetIdentity(sessionStorage,identity);identity=null;room=null;game=null;pendingRequest=null;}message(e.message);render();}}
 finally{networkBusy=false;schedulePoll();}
}
async function roomCommand(op,body={}){
 if(busy||!identity)return;busy=true;clearTimeout(pollTimer);render();
 try{const data=await api(`/rooms/${identity.code}/${op}`,body,identity.token);if(op==='leave'){generation++;forgetIdentity(sessionStorage,identity);identity=null;room=null;game=null;pendingRequest=null;save(sessionStorage,'anime-campus.joinKey',null);message('已离开房间。你的座位由 AI 接管。');}else roomSnapshot(data);}
 catch(e){message(e.message);}finally{busy=false;render();schedulePoll();}
}
async function enter(joining){
 if(busy||identity)return;busy=true;message();const name=$('nickname').value.trim()||chars.get(selected).name,code=$('join-code').value.trim().toUpperCase();
 try{
  let seatKey=read(sessionStorage,'anime-campus.joinKey');if(!seatKey){seatKey=Array.from(crypto.getRandomValues(new Uint8Array(24)),n=>n.toString(16).padStart(2,'0')).join('');save(sessionStorage,'anime-campus.joinKey',seatKey);}
  const data=await api(joining?`/rooms/${code}/join`:'/rooms',joining?{name,seatKey,character:selected}:{name,character:selected,playerCount:Number($('count').value)});
  identity={code:data.room.code,token:data.token};generation++;roomSnapshot(data);const u=new URL(location.href);u.searchParams.set('room',identity.code);history.replaceState(null,'',u);
 }catch(e){if(joining&&e.status===403)save(sessionStorage,'anime-campus.joinKey',null);message(e.message);}finally{busy=false;render();schedulePoll();}
}
function renderRoom(){
 if(!online||!room)return;
 $('room-code').textContent=room.code;$('room-info').textContent=`${room.roster.length} 位好友 · ${room.aiCount} 个 AI 空位`;
 $('room-roster').innerHTML=room.roster.map(m=>`<div class="room-person">${escape(m.name)} · ${chars.get(m.character)?.name} ${m.owner?'♔':''}<small> · ${m.ready?'已准备':'未准备'}${m.connected?'':' · 暂离'}</small></div>`).join('');
 $('ready-room').textContent=room.selfReady?'取消准备':'我准备好了';$('ready-room').disabled=busy;$('start-room').hidden=!room.isOwner;$('start-room').disabled=busy||!room.roster.every(m=>m.ready&&m.connected);$('leave-room').disabled=busy;
}
document.addEventListener('click',event=>{
 const ch=event.target.closest('[data-character]');if(ch){selected=ch.dataset.character;renderSelection();return;}
 const action=event.target.closest('[data-action-index]');if(action&&game){const a=legalActions(currentView(),actorId(game))[Number(action.dataset.actionIndex)];if(a){if(game.pending?.kind==='memoryAnswer'&&a.value==='answer')a.answer=[...memoryAnswer];dispatch(a);}return;}
 const sym=event.target.closest('[data-symbol]');if(sym&&memoryAnswer.length<4){memoryAnswer.push(Number(sym.dataset.symbol));renderPending(currentView(),myAction());}
 if(event.target.id==='clear-memory'){memoryAnswer=[];renderPending(currentView(),myAction());}
});
document.addEventListener('error',e=>{if(e.target instanceof HTMLImageElement&&!e.target.src.endsWith('/avatar.svg'))e.target.src=fallback;},true);
$('start-local').onclick=startLocal;$('resume-local').onclick=()=>{const saved=read(localStorage,SAVE);if(validSavedGame(saved)){game=saved;paused=false;lastActor=null;handoff();render();}else message('存档无法读取，请开始新的旅程。');};
$('new-game').onclick=()=>{if(online){if(identity)roomCommand('leave');return;}paused=true;game=null;$('resume-local').hidden=!validSavedGame(read(localStorage,SAVE));render();};
$('again').onclick=()=>{if(online){roomCommand('ready',{ready:true});$('lobby').scrollIntoView({behavior:'smooth'});}else{game=null;paused=false;render();}};
$('rules').onclick=()=>{$('rules-dialog').showModal();clearTimeout(botTimer);render();};$('close-rules').onclick=()=>{$('rules-dialog').close();render();};$('rules-dialog').addEventListener('close',()=>render());
$('handoff-confirm').onclick=()=>{lastActor=actorId(game);$('handoff').close();render();};$('handoff').addEventListener('cancel',e=>e.preventDefault());
$('speed').onchange=()=>{save(localStorage,'anime-campus.speed',$('speed').value);render();};$('pause').onclick=()=>{paused=!paused;render();};
$('sound').onclick=()=>{sound=!sound;save(localStorage,'anime-campus.sound',sound);$('sound').textContent=sound?'♫ 音效开':'♫ 静音';$('sound').setAttribute('aria-label',sound?'关闭音效':'开启音效');unlock();};
$('zoom-in').onclick=()=>{zoom=Math.min(3,zoom*1.25);fit();};$('zoom-out').onclick=()=>{zoom=Math.max(.6,zoom/1.25);fit();};$('zoom-fit').onclick=()=>{zoom=1;fit();$('board-viewport').scrollTo(0,0);};$('follow').onclick=()=>{follow=!follow;$('follow').textContent=follow?'跟随棋子':'自由查看';if(game&&follow)camera(actorId(game));};
$('create-room').onclick=()=>enter(false);$('join-room').onclick=()=>enter(true);$('ready-room').onclick=()=>roomCommand('ready',{ready:!room.selfReady});$('start-room').onclick=()=>roomCommand('start');$('leave-room').onclick=()=>roomCommand('leave');$('copy-room').onclick=async()=>{try{const u=new URL('online.html',location.href);u.searchParams.set('room',room.code);await navigator.clipboard.writeText(u.href);message('邀请链接已复制。');}catch{message(`房间码：${room.code}`);}};
$('board-viewport').addEventListener('pointerdown',e=>{if(e.pointerType==='touch')return;drag={x:e.clientX,y:e.clientY,left:e.currentTarget.scrollLeft,top:e.currentTarget.scrollTop};});
window.addEventListener('pointermove',e=>{if(!drag)return;const v=$('board-viewport');v.scrollLeft=drag.left+drag.x-e.clientX;v.scrollTop=drag.top+drag.y-e.clientY;});window.addEventListener('pointerup',()=>drag=null);
window.addEventListener('resize',fit);document.addEventListener('visibilitychange',()=>{if(!document.hidden)online?poll():render();else clearTimeout(botTimer);});
try{
 const response=await fetch('assets/board.svg');if(!response.ok)throw Error('地图暂时无法加载。');$('board-canvas').innerHTML=await response.text();const svg=$('board-canvas').querySelector('svg');const layer=document.createElementNS('http://www.w3.org/2000/svg','g');layer.id='game-tokens';svg.append(layer);
 svg.querySelectorAll('.campus-tile').forEach(tile=>{tile.setAttribute('tabindex','0');tile.setAttribute('role','button');const n=Number(tile.dataset.position),m=DATA.map[n-1];tile.setAttribute('aria-label',`查看第 ${n} 格 ${m.name}`);const inspect=()=>{$('tile-inspect').textContent=`${n} · ${m.name} — ${m.rule}`;};tile.addEventListener('click',inspect);tile.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();inspect();}});});
 svg.querySelectorAll('[data-character-image]').forEach(im=>im.addEventListener('error',()=>{im.setAttribute('href',fallback);},{once:true}));loaded=true;fit();
}catch(e){message(e.message);}
$('local-entry').hidden=online;$('online-entry').hidden=!online;$('resume-local').hidden=online||!validSavedGame(read(localStorage,SAVE));
sound=read(localStorage,'anime-campus.sound')===true;$('sound').textContent=sound?'♫ 音效开':'♫ 静音';$('speed').value=read(localStorage,'anime-campus.speed')||'normal';
if(online){$('join-code').value=new URL(location.href).searchParams.get('room')||'';identity=loadIdentity(sessionStorage,$('join-code').value);if(identity?.code&&identity?.token)poll();else identity=null;}
renderSelection();render();
