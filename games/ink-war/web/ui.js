import {createGame,stepGame,aiCommand,commandUnits,chooseCards,CARDS,MAPS,COLORS,UNIT_TYPES,cityGarrisons,AI_DIFFICULTIES} from './engine.js';
import {BattlefieldRenderer} from './renderer.js';
import {BattleMusic} from './music.js';
const $=id=>document.getElementById(id);
const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const SYMBOLS=['秦','齐','楚','赵','韩','燕','魏'];
const SESSION_KEY='ink-war-seat-v1';
const RENDER_INTERVAL=1000/120;
const randomSeed=()=>crypto.getRandomValues(new Uint32Array(1))[0];
const newToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),n=>n.toString(16).padStart(2,'0')).join('');
const uid=()=>crypto.randomUUID();
let seed=randomSeed(),options=chooseCards(seed),soloCard=options[0].id;
let state=null,online=false,selfId=0,paused=false,screen='home',lastFrame=performance.now(),accumulator=0,aiTime=0;
let roomState=null,session=null,sessionEpoch=0,pendingEntry=null,pollTimer=null,pollBusy=false,roomCard=null,busy=false,pendingCommand=null,commandBusy=false,finalShown=false;
let selected=new Set(),pointer=null,noticeTimer,toastTimer,updateTime=0,lastDraw=0,factionMarkup='',frameRequest=null,mapPanning=false,lastSkillShown=0;
let sound=false,audio;
const music=new BattleMusic($('music-button'));
try{sound=localStorage.getItem('ink-war-sound')==='true';}catch{}
function requestFrame(){if(frameRequest===null&&!document.hidden)frameRequest=requestAnimationFrame(frame);}
const preview=new BattlefieldRenderer($('preview'),{preview:true,onInvalidate:requestFrame});
const renderer=new BattlefieldRenderer($('board'),{onInvalidate:requestFrame});
function makePreview(){
  const result=createGame({seed:7391,playerCount:7,mapId:'plains',cards:[['arrows'],['fierce'],['bastion'],['siege'],['swift'],['renewal'],['veteran']]});
  result.width=1200;result.height=760;
  const places=[[620,380],[1030,380],[900,125],[870,650],[310,100],[260,660],[145,380]];
  result.cities=result.cities.filter(c=>c.owner>=0);result.terrain=[];
  // The title illustration has its own staged army; live battles start empty.
  result.units=[];
  for(const city of result.cities){const [x,y]=places[city.owner];city.x=x;city.y=y;
    const count=city.owner===0?140:40,type=city.owner===0?'sword':city.owner===1||city.owner===4?'blade':city.owner===2||city.owner===5?'shield':'sword',stats=UNIT_TYPES[type];
    for(let i=0;i<count;i++){const perRing=city.owner===0?28:20,ring=Math.floor(i/perRing),radius=city.owner===0?85+ring*20:60+ring*19,angle=(i%perRing)/perRing*Math.PI*2;result.units.push({id:result.nextUnitId++,owner:city.owner,type,glyph:stats.glyph,x:x+Math.cos(angle)*radius,y:y+Math.sin(angle)*radius,hp:stats.maxHp,maxHp:stats.maxHp,facing:angle,attacking:false});}
  }
  return result;
}
let demo=makePreview();
const mapName=id=>MAPS.find(m=>m.id===id)?.name||'山河战场';
for(const element of [$('solo-map'),$('room-map')])element.innerHTML=MAPS.map(m=>`<option value="${escape(m.id)}">${escape(m.name)}</option>`).join('');
function show(which){if(which!=='battle')music.setPaused(false);const changed=screen!==which;screen=which;for(const id of ['home','lobby','battle'])$(id).hidden=id!==which;if(changed){if(which==='battle'){renderer.resize();$('board').focus({preventScroll:true});}else if(which==='home'){preview.resize();}window.scrollTo(0,0);lastFrame=performance.now();requestFrame();}}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3000);}
function error(where,message){$(where).textContent=message||'';$(where).hidden=!message;}
function notice(message){$('battle-notice').textContent=message;$('battle-notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('battle-notice').hidden=true,3500);}
function soundLabel(){$('sound-button').textContent=`音效：${sound?'开':'关'}`;$('sound-button').setAttribute('aria-pressed',String(sound));}
function ping(kind='command'){if(!sound)return;try{audio??=new AudioContext();audio.resume();const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.type='sine';oscillator.frequency.setValueAtTime(kind==='victory'?520:220,audio.currentTime);oscillator.frequency.exponentialRampToValueAtTime(kind==='victory'?780:140,audio.currentTime+.14);gain.gain.setValueAtTime(.065,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.22);oscillator.connect(gain);gain.connect(audio.destination);oscillator.start();oscillator.stop(audio.currentTime+.23);}catch{}}
$('sound-button').onclick=()=>{sound=!sound;soundLabel();try{localStorage.setItem('ink-war-sound',String(sound));}catch{}if(sound)ping();};soundLabel();
$('help-button').onclick=()=>$('help-dialog').showModal();
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
$('result-dialog').addEventListener('cancel',event=>{event.preventDefault();});
function cardMarkup(cards,selectedId){return cards.map(c=>`<button class="card-option ${c.id===selectedId?'selected':''}" type="button" data-card="${escape(c.id)}" aria-pressed="${c.id===selectedId}" title="${escape(c.description)}"><span class="card-glyph">${escape(c.glyph||'策')}</span><b>${escape(c.name)}</b><small>${escape(c.description)}</small></button>`).join('');}
function soloCards(){$('solo-cards').innerHTML=cardMarkup(options,soloCard);$('solo-cards').querySelectorAll('button').forEach(b=>b.onclick=()=>{soloCard=b.dataset.card;soloCards();});}soloCards();
$('reroll').onclick=()=>{seed=randomSeed();options=chooseCards(seed);soloCard=options[0].id;soloCards();};
function mode(isOnline){$('solo-form').hidden=isOnline;$('online-form').hidden=!isOnline;for(const [id,active] of [['solo-tab',!isOnline],['online-tab',isOnline]]){$(id).classList.toggle('active',active);$(id).setAttribute('aria-selected',String(active));}error('home-error','');}
$('solo-tab').onclick=()=>mode(false);$('online-tab').onclick=()=>mode(true);
function startSolo(){stopPolling();saveSession(null);online=false;selfId=0;paused=false;selected.clear();finalShown=false;seed=randomSeed();const count=Number($('solo-count').value);state=createGame({seed,playerCount:count,mapId:$('solo-map').value,aiDifficulty:$('solo-difficulty').value,cards:Array.from({length:count},(_,i)=>[i===0?soloCard:chooseCards(seed+i*71)[0].id]),names:SYMBOLS.map((country,i)=>i===0?'你 · 秦国':country+'国').slice(0,count)});renderer.receive(state,{interval:100,reset:true});accumulator=0;aiTime=0;lastFrame=performance.now();setupBattle();show('battle');renderer.draw(state,performance.now(),{selfId});renderStatus();ping();}
$('solo-form').onsubmit=event=>{event.preventDefault();startSolo();};
$('solo-difficulty').onchange=()=>{$('difficulty-note').textContent={beginner:'入门：AI 开局12秒后出征，至少6秒才下达一次调兵令，并保留较多守军。',normal:'标准：AI 开局8秒后出征，至少4秒才下达一次调兵令。',hard:'挑战：AI 快速扩张，频繁调兵，适合熟悉操作后挑战。'}[$('solo-difficulty').value];};
function setupBattle(){lastSkillShown=0;music.setPaused(false);$('battle-map').textContent=mapName(state.mapId);$('battle-mode').textContent=(online?'好友对战':`单人征战 · ${AI_DIFFICULTIES.find(d=>d.id===(state.aiDifficulty||'hard')).name}`)+` · ${state.cities.length} 座城`;$('pause-button').hidden=online;$('pause-button').textContent='暂停';$('paused-overlay').hidden=true;$('connection-status').textContent=online?'已连接 · 同时指挥':'战事进行中';mapPanning=false;pointer=null;renderer.drag=null;$('board').classList.remove('panning');$('pan-map').textContent='拖图';$('pan-map').setAttribute('aria-pressed','false');const cards=state.players[selfId]?.cards||[];$('active-card').textContent=cards.map(id=>CARDS.find(c=>c.id===id)?.name).filter(Boolean).join(' · ')||'未选择兵法';$('active-card').title=cards.map(id=>CARDS.find(c=>c.id===id)?.description).filter(Boolean).join(' / ');}
function togglePause(){if(online||state?.status!=='playing')return;paused=!paused;music.setPaused(paused);$('paused-overlay').hidden=!paused;$('pause-button').textContent=paused?'继续':'暂停';accumulator=0;lastFrame=performance.now();renderer.invalidate();}
$('pause-button').onclick=togglePause;$('resume-button').onclick=togglePause;
function setText(id,value){const element=$(id);if(element.textContent!==value)element.textContent=value;}
function selectionLabel(){const live=new Set((state?.units||[]).filter(u=>u.owner===selfId&&!u.uncontrollable).map(u=>u.id));for(const id of selected)if(!live.has(id))selected.delete(id);renderer.selection=selected;setText('selection-indicator',mapPanning?'拖动查看地图 · 点击「调兵」返回':selected.size?`已选 ${selected.size} 名士兵 · 点击位置出征`:'划选士兵 · 点击位置出征');}
function selectAll(){if(!state||state.status!=='playing')return;selected=new Set(state.units.filter(u=>u.owner===selfId&&!u.uncontrollable).map(u=>u.id));selectionLabel();if(!selected.size)notice('正在募兵，稍候再选。');}
$('select-all').onclick=selectAll;$('clear-selection').onclick=()=>{selected.clear();selectionLabel();};
function selectCity(city){if(!city)return;selected=new Set((cityGarrisons(state).get(city.id)||[]).filter(u=>u.owner===selfId&&!u.uncontrollable).map(u=>u.id));selectionLabel();if(!selected.size)notice('城中暂无驻军，等待城池产兵。');}
$('select-city').onclick=()=>{const city=state?.cities.filter(c=>c.owner===selfId).sort((a,b)=>state.units.filter(u=>u.owner===selfId&&Math.hypot(u.x-b.x,u.y-b.y)<130).length-state.units.filter(u=>u.owner===selfId&&Math.hypot(u.x-a.x,u.y-a.y)<130).length)[0];selectCity(city);};
async function order(target){if(!state||state.status!=='playing'||paused)return;if(!selected.size){notice('先划选己方士兵，再点击目的地。');return;}target={x:Math.max(0,Math.min(state.width,target.x)),y:Math.max(0,Math.min(state.height,target.y))};const city=state.cities.find(c=>c.owner===selfId&&Math.hypot(c.x-target.x,c.y-target.y)<Math.max((c.radius||32)+6,24/renderer.view.scale));if(city){target={x:city.x,y:city.y};notice(city.hp<city.maxHp?'送兵归城 · 优先吞兵回血':(city.level||1)<(city.maxLevel||1)?'送兵归城 · 吞兵扩建升级':'城池已达最高等级 · 归营驻守');}const unitIds=[...selected];if(online){pendingCommand={input:{requestId:uid(),unitIds,target,...(city?{cityId:city.id}:{})},guard:sessionGuard(),round:roomState?.room.round};flushCommand();}else{try{commandUnits(state,selfId,unitIds,target,{cityId:city?.id??null});}catch(e){notice(e.message);return;}}renderer.setMarker(target,state.players[selfId]?.color);ping();}
async function flushCommand(){if(commandBusy||!pendingCommand||!session)return;const {input,guard,round}=pendingCommand;pendingCommand=null;if(!guardValid(guard)||roomState?.room.round!==round)return;commandBusy=true;try{const data=await request(`/rooms/${guard.code}/action`,input,guard);if(guardValid(guard)&&roomState?.room.round===round)accept(data,guard);}catch(e){if(guardValid(guard)&&roomState?.room.round===round)notice(e.message);}finally{commandBusy=false;if(pendingCommand)flushCommand();}}
const board=$('board');
$('zoom-in').onclick=()=>renderer.setZoom(renderer.zoom*1.3);
$('zoom-out').onclick=()=>renderer.setZoom(renderer.zoom/1.3);
$('map-fit').onclick=()=>renderer.resetView();
$('home-city').onclick=()=>{const city=state?.cities.find(c=>c.owner===selfId);if(city)renderer.centerOn(city.x,city.y,{zoom:2});};
$('pan-map').onclick=()=>{mapPanning=!mapPanning;$('pan-map').textContent=mapPanning?'调兵':'拖图';$('pan-map').setAttribute('aria-pressed',String(mapPanning));board.classList.toggle('panning',mapPanning);selectionLabel();};
board.addEventListener('wheel',event=>{if(screen!=='battle'||!state)return;event.preventDefault();renderer.setZoom(renderer.zoom*Math.exp(-event.deltaY*.002),event.clientX,event.clientY);},{passive:false});
board.addEventListener('pointerdown',event=>{if(screen!=='battle'||!state||pointer)return;if(event.button===1||(event.button===0&&mapPanning)){pointer={id:event.pointerId,pan:true,clientX:event.clientX,clientY:event.clientY};board.setPointerCapture(event.pointerId);event.preventDefault();return;}if(paused||state.status!=='playing'||event.button!==0)return;board.focus({preventScroll:true});const start=renderer.world(event.clientX,event.clientY);pointer={id:event.pointerId,start,end:start,clientX:event.clientX,clientY:event.clientY,moved:false,shift:event.shiftKey};board.setPointerCapture(event.pointerId);event.preventDefault();});
board.addEventListener('pointermove',event=>{if(!pointer||event.pointerId!==pointer.id)return;if(pointer.pan){renderer.pan(event.clientX-pointer.clientX,event.clientY-pointer.clientY);pointer.clientX=event.clientX;pointer.clientY=event.clientY;return;}pointer.end=renderer.world(event.clientX,event.clientY);if(Math.hypot(event.clientX-pointer.clientX,event.clientY-pointer.clientY)>8)pointer.moved=true;if(pointer.moved)renderer.drag={start:pointer.start,end:pointer.end};});
function endPointer(event,cancelled=false){if(!pointer||pointer.id!==event.pointerId)return;const p=pointer;pointer=null;renderer.drag=null;if(cancelled||p.pan)return;if(p.moved){if(!p.shift)selected.clear();const x1=Math.min(p.start.x,p.end.x),x2=Math.max(p.start.x,p.end.x),y1=Math.min(p.start.y,p.end.y),y2=Math.max(p.start.y,p.end.y);state.units.filter(u=>u.owner===selfId&&!u.uncontrollable&&u.x>=x1&&u.x<=x2&&u.y>=y1&&u.y<=y2).forEach(u=>selected.add(u.id));selectionLabel();}else{const target=renderer.world(event.clientX,event.clientY);const radius=24/renderer.view.scale;const unit=state.units.filter(u=>u.owner===selfId&&!u.uncontrollable).find(u=>Math.hypot(u.x-target.x,u.y-target.y)<Math.min(radius,24));const city=state.cities.find(c=>c.owner===selfId&&Math.hypot(c.x-target.x,c.y-target.y)<Math.max(38,radius));if(city&&!selected.size)selectCity(city);else if(unit&&!selected.size){selected.add(unit.id);selectionLabel();}else if(selected.size)order(target);else if(city)selectCity(city);else notice('拖动框选士兵，或点击己方城池选择驻军。');}}
board.addEventListener('pointerup',e=>endPointer(e));board.addEventListener('pointercancel',e=>endPointer(e,true));board.addEventListener('contextmenu',event=>{event.preventDefault();if(selected.size)order(renderer.world(event.clientX,event.clientY));});
document.addEventListener('keydown',event=>{if(screen!=='battle'||event.target.matches('input,select,button')||$('help-dialog').open||$('result-dialog').open)return;if(event.key.toLowerCase()==='a'){event.preventDefault();selectAll();}else if(event.key==='Escape'){selected.clear();selectionLabel();}else if(event.code==='Space'){event.preventDefault();togglePause();}});
function renderStatus(){if(!state)return;const newSkills=(state.events||[]).filter(e=>e.type==='skill'&&e.id>lastSkillShown),skillEvent=newSkills.findLast(e=>e.playerId===selfId)||newSkills.at(-1);if(skillEvent){lastSkillShown=newSkills.at(-1).id;if(state.tick-skillEvent.tick<=40){notice(skillEvent.text);ping('skill');}}selectionLabel();const seconds=Math.floor(state.time||0);setText('battle-time',`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`);const units=Array(state.players.length).fill(0),cities=Array(state.players.length).fill(0);for(const u of state.units)units[u.owner]++;for(const c of state.cities)if(c.owner>=0)cities[c.owner]++;const markup=state.players.map(p=>{const n=units[p.id],city=cities[p.id];return `<div class="faction ${p.id===selfId?'self':''} ${p.alive===false?'dead':''}" style="--faction:${escape(p.color)}"><span class="faction-symbol" style="color:${escape(p.color)}">${SYMBOLS[p.id]}</span><span class="faction-name">${escape(p.name)}<small>${p.id===selfId?'你的阵营':online?(roomState?.room.roster.find(m=>m.seat===p.id)?.ai?'策略 AI':'真人城主'):'策略 AI'}</small></span><span class="count">${city}<small>城池</small></span><span class="count">${n}<small>士兵</small></span></div>`;}).join('');if(markup!==factionMarkup){$('factions').innerHTML=markup;factionMarkup=markup;}const e=state.events?.at(-1);if(e?.text)setText('last-event',e.text);setText('army-total',`战场兵力 ${state.units.length}`);
  if(state.players[selfId]?.alive===false&&state.status==='playing'){$('selection-indicator').textContent='城池已失守 · 正在观战';}
  if(state.status==='finished'&&!finalShown){finalShown=true;paused=false;$('paused-overlay').hidden=true;const won=state.winner===selfId,draw=state.winner==null;$('result-glyph').textContent=draw?'和':won?'胜':'败';$('result-glyph').style.color=won?'var(--jade)':'var(--red)';$('result-title').textContent=draw?'战事未分':won?'天下归一':'山河暂失';$('result-summary').textContent=`${draw?'各军同时失去城池':won?'你已占领战场全部城池':`${state.players[state.winner]?.name||'对手'}统一了战场`} · 用时 ${$('battle-time').textContent}`;$('play-again').textContent=online?'回房间 · 再战':'再战一局 ↗';$('result-dialog').showModal();ping('victory');}}
function frame(now){
  frameRequest=null;
  const dt=Math.max(0,Math.min((now-lastFrame)/1000,.25));lastFrame=now;
  if(!document.hidden){
    if(screen==='home'){if(preview.needsRedraw(now))preview.draw(demo,now);}
    else if(screen==='battle'&&state){
      if(!online&&!paused&&state.status==='playing'){
        accumulator+=dt;let stepped=false;
        while(accumulator>=.1){stepGame(state,.1);accumulator-=.1;stepped=true;}
        if(stepped)renderer.receive(state,{interval:100});
        aiTime+=dt;if(aiTime>=2){state.players.filter(p=>p.id!==selfId&&p.alive!==false).forEach(p=>aiCommand(state,p.id));aiTime=0;}
      }
      // Rules stay at 10 Hz; independent interpolation animates marching at up to 120 Hz.
      const moving=!paused&&state.status==='playing';
      if(now-lastDraw>=RENDER_INTERVAL-.15&&(moving||renderer.needsRedraw(now))){
        lastDraw=now-((now-lastDraw)%RENDER_INTERVAL);renderer.draw(state,now,{interpolate:moving,selfId});
      }
      if(now-updateTime>250){updateTime=now;renderStatus();}
    }
  }
  if(!document.hidden&&((screen==='battle'&&state&&((!paused&&state.status==='playing')||renderer.needsRedraw(now)))||(screen==='home'&&preview.needsRedraw(now))))requestFrame();
}
preview.draw(demo);requestFrame();
function sessionGuard(){return {epoch:sessionEpoch,code:session?.code,token:session?.token};}
function guardValid(guard){return guard.epoch===sessionEpoch&&guard.code===session?.code&&guard.token===session?.token;}
function saveSession(value){sessionEpoch++;pendingCommand=null;session=value;try{if(value)sessionStorage.setItem(SESSION_KEY,JSON.stringify(value));else sessionStorage.removeItem(SESSION_KEY);}catch{}}
function entryKey(kind,configuration){const signature=JSON.stringify({kind,...configuration});if(pendingEntry?.signature!==signature){pendingEntry={signature,seatKey:newToken()};try{sessionStorage.setItem(SESSION_KEY+'-pending',JSON.stringify(pendingEntry));}catch{}}return pendingEntry.seatKey;}
function clearEntry(){pendingEntry=null;try{sessionStorage.removeItem(SESSION_KEY+'-pending');}catch{}}
async function request(path,body,identity=session){const response=await fetch(`/api/ink-war${path}`,{method:body===undefined?'GET':'POST',headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(identity?.token?{'Authorization':`Bearer ${identity.token}`}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});let data;try{data=await response.json();}catch{throw Error('联机服务未能响应，请确认正在使用 Node 服务器。');}if(!response.ok){const e=Error(data.error||'请求未成功，请重试。');e.status=response.status;throw e;}return data;}
async function withBusy(button,fn){if(busy)return;busy=true;button.disabled=true;error(screen==='lobby'?'lobby-error':'home-error','');try{await fn();}catch(e){error(screen==='lobby'?'lobby-error':'home-error',e.message);}finally{busy=false;button.disabled=false;}}
function stopPolling(){clearTimeout(pollTimer);pollTimer=null;}
function schedulePoll(){stopPolling();if(session)pollTimer=setTimeout(poll,document.hidden?2000:screen==='battle'?200:1000);}
async function poll(){if(!session||pollBusy){schedulePoll();return;}const guard=sessionGuard();pollBusy=true;try{const data=await request(`/rooms/${guard.code}`,undefined,guard);if(!guardValid(guard))return;accept(data,guard);if(screen==='battle')$('connection-status').textContent='已连接 · 同时指挥';error('lobby-error','');}catch(e){if(!guardValid(guard))return;if(screen==='battle')$('connection-status').textContent='重连中…';else error('lobby-error',e.message);if([403,404].includes(e.status)){stopPolling();saveSession(null);show('home');mode(true);error('home-error',e.message);}}finally{pollBusy=false;if(guardValid(guard))schedulePoll();}}
function accept(data,guard=null){if(guard&&!guardValid(guard))return;if(!data.room||data.room.code!==session?.code)return;if(roomState&&roomState.room.code===data.room.code&&(data.room.version??0)<(roomState.room.version??0))return;roomState=data;selfId=data.room.selfSeat;online=true;if(data.game&&(data.room.status==='playing'||(data.room.status==='finished'&&screen!=='lobby'))){const wasBattle=screen==='battle';state=data.game;renderer.receive(state,{interval:200,reset:!wasBattle});if(!wasBattle){paused=false;selected.clear();finalShown=false;setupBattle();show('battle');}renderStatus();}else{if($('result-dialog').open)$('result-dialog').close();finalShown=false;showLobby(data);}schedulePoll();}
function showLobby(data){show('lobby');const r=data.room;$('invite-code').textContent=r.code;$('room-details').textContent=`${mapName(r.mapId)} · ${r.playerCount} 方对战 · ${r.aiCount||0} 个 AI 阵营`;$('roster').innerHTML=Array.from({length:r.playerCount},(_,i)=>{const m=r.roster.find(m=>m.seat===i),occupied=m?.occupied,ai=m?.ai;return `<div class="roster-row"><span class="faction-symbol" style="color:${COLORS[i]}">${SYMBOLS[i]}</span><span class="member-name">${escape(occupied?m.name:'等待城主入场')}<small>${ai?'明确添加的 AI 阵营':occupied?`${m.owner?'房主 · ':''}${m.seat===r.selfSeat?'你 · ':''}${m.cardId?CARDS.find(c=>c.id===m.cardId)?.name||'已选兵法':'尚未选择兵法'}`:'邀请朋友加入'}</small></span><span class="member-status ${m?.ready?'ready':''}">${ai?'已就位':!occupied?'空位':!m.connected?'暂时离线':m.ready?'已准备':'未准备'}</span></div>`;}).join('');const cards=r.cardOptions||chooseCards(1),self=r.roster.find(m=>m.seat===r.selfSeat);if(!cards.some(c=>c.id===roomCard))roomCard=self?.cardId||cards[0]?.id;$('lobby-cards').innerHTML=cardMarkup(cards,roomCard);$('lobby-cards').querySelectorAll('button').forEach(b=>{b.disabled=Boolean(self?.ready);b.onclick=()=>{roomCard=b.dataset.card;showLobby(roomState);};});$('ready-button').textContent=self?.ready?'取消准备':'选定兵法 · 准备';$('room-start').hidden=!r.isOwner;$('room-start').disabled=!r.roster.every(m=>m.occupied&&m.ready&&m.connected);$('room-start').textContent='开始对战 ↗';}
$('create-room').onclick=()=>withBusy($('create-room'),async()=>{const guard=sessionGuard(),configuration={name:$('nickname').value,playerCount:Number($('room-count').value),mapId:$('room-map').value,aiCount:Number($('room-ai').value)},seatKey=entryKey('create',configuration);const data=await request('/rooms',{...configuration,seatKey},guard);if(!guardValid(guard))return;saveSession({code:data.room.code,token:data.token});clearEntry();roomCard=null;roomState=null;accept(data);});
$('join-room').onclick=()=>withBusy($('join-room'),async()=>{const code=$('room-code').value.trim().toUpperCase();if(!/^[A-Z2-9]{6}$/.test(code))throw Error('请输入六位房间码。');const guard=sessionGuard(),name=$('nickname').value,seatKey=entryKey('join',{code,name});const data=await request(`/rooms/${code}/join`,{name,seatKey},guard);if(!guardValid(guard))return;saveSession({code,token:data.token||seatKey});clearEntry();roomCard=null;roomState=null;accept(data);});
$('room-count').onchange=()=>{const max=Number($('room-count').value)-1;[...$('room-ai').options].forEach(o=>o.disabled=Number(o.value)>max);if(Number($('room-ai').value)>max)$('room-ai').value='0';};$('room-count').onchange();
$('ready-button').onclick=()=>withBusy($('ready-button'),async()=>{const guard=sessionGuard(),self=roomState.room.roster.find(m=>m.seat===selfId);accept(await request(`/rooms/${guard.code}/ready`,{ready:!self?.ready,cardId:roomCard},guard),guard);});
$('room-start').onclick=()=>withBusy($('room-start'),async()=>{const guard=sessionGuard();accept(await request(`/rooms/${guard.code}/start`,{},guard),guard);});
$('copy-invite').onclick=async()=>{const url=new URL('./online.html',location.href);url.searchParams.set('room',session.code);try{await navigator.clipboard.writeText(url.href);toast('邀请链接已复制');}catch{toast(`房间码：${session.code}，请与朋友分享。`);}};
async function leaveOnline(){const guard=sessionGuard();if(session)try{await request(`/rooms/${guard.code}/leave`,{},guard);}catch(e){if(![403,404].includes(e.status)){throw e;}}if(!guardValid(guard))return;stopPolling();saveSession(null);roomState=null;state=null;selected.clear();online=false;show('home');mode(true);}
$('leave-lobby').onclick=()=>withBusy($('leave-lobby'),leaveOnline);
$('battle-exit').onclick=()=>{if(online){if(!confirm('退出会让你的阵营投降，确定退出这场对战？'))return;withBusy($('battle-exit'),leaveOnline);}else{state=null;selected.clear();paused=false;show('home');}};
$('play-again').onclick=async()=>{$('result-dialog').close();if(online){const guard=sessionGuard();showLobby(roomState);if(roomState.room.isOwner)try{accept(await request(`/rooms/${guard.code}/rematch`,{},guard),guard);}catch(e){if(guardValid(guard))error('lobby-error',e.message);}toast('选择兵法并准备，由房主开始下一局。');}else startSolo();};
$('result-home').onclick=async()=>{$('result-dialog').close();if(online){try{await leaveOnline();}catch(e){notice(e.message);}}else{state=null;show('home');}};
document.addEventListener('visibilitychange',()=>{lastFrame=performance.now();accumulator=0;if(!document.hidden){requestFrame();if(session){stopPolling();poll();}}});
const params=new URLSearchParams(location.search);if(location.pathname.endsWith('/online.html')||params.has('room')||params.get('mode')==='online')mode(true);if(params.get('room'))$('room-code').value=params.get('room').toUpperCase();
try{session=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');pendingEntry=JSON.parse(sessionStorage.getItem(SESSION_KEY+'-pending')||'null');}catch{}if(session?.code&&session?.token){mode(true);poll();}else session=null;
