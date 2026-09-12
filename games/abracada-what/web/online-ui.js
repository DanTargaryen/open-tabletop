import {AI_PROFILES,SPELLS} from './engine.js';
import {renderTowerProgress,showTowerProgress} from './tower-progress.js';
import {createCharacterPreview} from './character-preview.js';
import {characterForSeat} from './characters.js';
import {createWinnerShowcase} from './winner-showcase.js';
import {bindAudioControls,gameAudio} from './audio.js';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>'"]/g,character=>({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' })[character]);
const SESSION_KEY='abracada.room.v1';
const NAME_KEY='abracada.name.v1';
const API_ROOT='/api/abracada';
const INFORMATION_HOLD_MS=1000;
const wait=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');

let session=readSession();
let room=null;
let view=null;
let receivedAt=0;
let pollTimer=null;
let countdownTimer=null;
let toastTimer=null;
let commandBusy=false;
let pollGeneration=0;
let transientDie=null;
let revealHolding=false;
let dieRolling=false;
let lastRevealId=0;
let openingTowerShown=false;
const climbedRounds=new Set();
const animatedOutcomes=new Set();
const pendingOutcomeAnimations=new Set();
let payloadQueue=Promise.resolve();
let payloadGeneration=0;
let resultScoreTransition=null;
let magicTable3d=null;
const characterPreview=createCharacterPreview($('waitingCharacterCanvas'),{
  selected:characterForSeat(0).key,
  onSelect:async seat=>{if(room?.status==='waiting')await roomCommand('seat',{seat});},
  onBlocked:message=>toast(message),
});
const winnerShowcase3d=createWinnerShowcase($('winnerCanvas'));
const magicTableReady=import('./three-table.js').then(({createMagicTable3D})=>{
  magicTable3d=createMagicTable3D($('magicTableCanvas'));
  if(magicTable3d&&view)magicTable3d.sync(view);
  return magicTable3d;
}).catch(error=>{console.warn('3D magic table could not start',error);return null;});
bindAudioControls();

function setLogOpen(open){
  const panel=$('logPanel'),backdrop=$('logBackdrop'),toggle=$('logToggleBtn');
  panel.classList.toggle('open',open);backdrop.classList.toggle('open',open);panel.inert=!open;
  panel.setAttribute('aria-hidden',String(!open));toggle.setAttribute('aria-expanded',String(open));
  if(open){$('eventLog').scrollTop=$('eventLog').scrollHeight;setTimeout(()=>{if(panel.classList.contains('open'))$('logCloseBtn').focus();},320);}
  else if(document.activeElement===$('logCloseBtn'))toggle.focus();
}

function setSpellbookOpen(open){
  const panel=$('spellbookPanel'),backdrop=$('spellbookBackdrop'),toggle=$('spellbookToggle');
  const changed=panel.classList.contains('open')!==open;
  panel.classList.toggle('open',open);backdrop.classList.toggle('open',open);panel.inert=!open;
  panel.setAttribute('aria-hidden',String(!open));toggle.setAttribute('aria-expanded',String(open));
  if(changed)gameAudio.playBook(open);
  if(open)setTimeout(()=>{if(panel.classList.contains('open'))$('spellbookCloseBtn').focus({preventScroll:true});},480);
  else if(document.activeElement===$('spellbookCloseBtn'))toggle.focus({preventScroll:true});
}

function readSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null');}catch{return null;}}
function saveSession(next){session=next;if(next)localStorage.setItem(SESSION_KEY,JSON.stringify(next));else localStorage.removeItem(SESSION_KEY);}
function randomHex(){return Array.from(crypto.getRandomValues(new Uint8Array(24)),byte=>byte.toString(16).padStart(2,'0')).join('');}
function requestId(){return `${Date.now().toString(36)}-${randomHex().slice(0,18)}`;}
function normalizeCode(value){return String(value||'').toUpperCase().replace(/[^A-Z2-9]/g,'').slice(0,6);}

async function roomApi(path,{method='GET',body,token=session?.token}={}){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),9000);
  try{
    const headers={...(body?{'Content-Type':'application/json'}:{})};
    if(token)headers.Authorization=`Bearer ${token}`;
    const response=await fetch(API_ROOT+path,{method,cache:'no-store',headers,body:body?JSON.stringify(body):undefined,signal:controller.signal});
    const payload=await response.json().catch(()=>({error:'服务器返回了无法识别的内容。'}));
    if(!response.ok)throw new Error(payload.error||'法师塔没有回应。');
    return payload;
  }catch(error){
    if(error.name==='AbortError')throw new Error('连接法师塔超时，请重试。');
    throw error;
  }finally{clearTimeout(timeout);}
}

function showOnly(section){
  for(const id of ['onlineLobby','roomWaiting','game'])$(id).classList.toggle('hidden',id!==section);
  document.body.classList.toggle('game-active',section==='game');
  if(section!=='game'){setLogOpen(false);setSpellbookOpen(false);}
}

function portalTab(name){
  document.querySelectorAll('[data-portal-tab]').forEach(button=>button.classList.toggle('active',button.dataset.portalTab===name));
  $('createPanel').classList.toggle('hidden',name!=='create');
  $('joinPanel').classList.toggle('hidden',name!=='join');
}

function setNetworkStatus(label,error=false){
  $('connectionBadge').textContent=label;
  $('connectionBadge').classList.toggle('network-error',error);
  if($('connectionLabel'))$('connectionLabel').textContent=label;
}

function renderWaiting(){
  showOnly('roomWaiting');
  $('resultLayer').classList.add('hidden');
  $('waitingCode').textContent=room.code;
  const mode=room.mode==='score'?'积分模式':'单局模式';
  $('waitingDescription').textContent=`${room.playerCount} 人法师塔 · ${mode}。真人不足时，${room.aiCount} 个空位将在开局时由塔灵补齐。`;
  const bySeat=new Map(room.roster.map(member=>[member.towerSeat,member]));
  characterPreview?.setSeats({count:room.playerCount,members:room.roster,currentMemberId:room.selfId});
  $('roomRoster').innerHTML=Array.from({length:room.playerCount},(_,seat)=>{
    const member=bySeat.get(seat);
    if(!member){
      const profile=AI_PROFILES[(seat+AI_PROFILES.length-1)%AI_PROFILES.length];
      return `<article class="roster-seat bot"><span class="roster-avatar" style="--seat-color:${profile.color}">✦</span><b>塔灵候补</b><small>开局后 AI 入席</small></article>`;
    }
    const ownSeat=member.id===room.selfId;
    const character=characterForSeat(seat);
    return `<article class="roster-seat${ownSeat?' self':''}"><span class="roster-avatar" style="--seat-color:${character.color}">${esc(member.name[0])}</span><b>${esc(member.name)}${member.owner?' · 房主':''}</b><em>${seat+1} 号座</em><small class="${member.ready?'ready':''}">${member.connected?(member.ready?'准备完成':'尚未准备'):'暂时离线'}</small>${room.isOwner&&!ownSeat?`<button class="kick-seat" data-kick="${esc(member.id)}" type="button">移出席位</button>`:''}</article>`;
  }).join('');
  document.querySelectorAll('[data-kick]').forEach(button=>button.addEventListener('click',()=>roomCommand('kick',{memberId:button.dataset.kick})));
  $('readyRoomBtn').classList.toggle('active',room.selfReady);
  $('readyRoomBtn').textContent=room.selfReady?'已准备 · 点击取消':'准备完成';
  const allReady=room.roster.every(member=>member.ready&&member.connected);
  $('startRoomBtn').classList.toggle('hidden',!room.isOwner);
  $('startRoomBtn').disabled=!allReady||commandBusy;
  $('waitingHint').textContent=room.isOwner?(allReady?'召集法阵已经稳定，可以开始试炼。':'等待所有真人玩家准备；空位无需等待。'):(room.selfReady?'你已准备，等待房主启动法阵。':'准备后，房主即可开始试炼。');
  setNetworkStatus('ROOM CONNECTED');
}

function lifePips(life){return `<span class="life-meter" aria-label="${life} 点生命"><span class="life-pips">${Array.from({length:6},(_,index)=>`<i class="${index<life?'live':''}"></i>`).join('')}</span><b>${life}/6</b></span>`;}
function sceneLifePips(life){return `<span class="table-life-pips" aria-label="${life} 点生命">${Array.from({length:6},(_,index)=>`<i class="${index<life?'live':''}"></i>`).join('')}</span>`;}
function spellArt(spell,className=''){return `<img class="spell-art${className?` ${className}`:''}" src="./assets/spells/spell-${spell}.svg" alt="" aria-hidden="true">`;}
function stone(spell,{back=false}={}){const info=spell?SPELLS[spell-1]:null;return `<span class="magic-stone${back?' back':''}"${info?` title="${esc(info.name)}"`:''}>${!back&&info?spellArt(info.id):''}<b>${back?'?':info?.id||'?'}</b>${!back&&info?`<small>${esc(info.icon)}</small>`:''}</span>`;}
function discardPiles(values){
  const counts=Array.from({length:8},(_,index)=>values.filter(value=>value===index+1).length);
  const piles=counts.flatMap((count,index)=>count?[{spell:index+1,count}]:[]);
  return piles.length?piles.map(({spell,count})=>`<span class="discard-group" title="${esc(SPELLS[spell-1].name)}，共 ${count} 张"><span class="discard-stack">${Array.from({length:Math.min(count,3)},(_,stackIndex)=>`<img src="./assets/spells/spell-${spell}.svg" alt="" aria-hidden="true" style="--stack-index:${stackIndex};--stack-angle:${stackIndex-1}deg">`).join('')}</span><b>×${count}</b></span>`).join(''):'<span class="empty-label">暂无弃牌</span>';
}
function sceneHand(player){const middle=(player.rack.length-1)/2;return `<div class="table-hand-3d">${player.rack.map((spell,index)=>`<span class="table-card-3d${spell?' face':' back'}" style="--card-offset:${index-middle}">${spell?spellArt(spell):'<b>?</b>'}</span>`).join('')}</div>`;}
function animateTopHandChanges(before,after){
  if(!before||!after||before.round!==after.round)return;
  for(const player of after.players){
    const previous=before.players.find(candidate=>candidate.id===player.id);
    if(!previous||JSON.stringify(previous.rack)===JSON.stringify(player.rack))continue;
    const seat=playerSeat(player.id);
    seat?.classList.add('hand-updated');
    setTimeout(()=>seat?.classList.remove('hand-updated'),320);
  }
}

function renderOpponents(){
  $('opponents').innerHTML=view.players.slice(1).map(player=>{
    const active=view.phase==='casting'&&view.activeIndex===player.id;
    const role=player.isRemoteHuman?(player.connected?'真人':'离线'):player.isBot?'塔灵 AI':player.title;
    return `<article class="player-seat${active?' active':''}${player.life===0?' defeated':''}${player.isRemoteHuman&&!player.connected?' offline':''}" data-player-id="${player.id}" style="--seat-color:${player.color}"><div class="seat-top"><span class="avatar" style="--avatar:${player.color}">${esc(player.name[0])}</span><span class="seat-name"><b>${esc(player.name)}</b><small>${esc(player.title)}</small></span>${view.mode==='score'?`<span class="score-badge">${player.score} 分</span>`:''}<span class="remote-label${player.isBot?' bot':''}">${esc(role)}</span><span class="seat-vitals">${lifePips(player.life)}</span></div><div class="seat-stones">${player.rack.map(value=>stone(value)).join('')||'<span class="empty-label">法术石已清空</span>'}</div><span class="secret-badge">◇ 秘密石 ${player.secrets.length}</span></article>`;
  }).join('');
}

function renderHuman(){
  const player=view.players[0];
  const active=view.phase==='casting'&&view.activeIndex===0&&!revealHolding;
  const secrets=player.secrets.length?player.secrets.map(value=>`${value} · ${SPELLS[value-1].name}`).join(' / '):'暂无秘密石';
  $('humanSeat').className=`human-seat${active?' active':''}${player.life===0?' defeated':''}`;
  $('humanSeat').dataset.playerId='0';
  $('humanSeat').innerHTML=`<div class="seat-top"><span class="avatar" style="--avatar:${player.color}">你</span><span class="seat-name"><b>${esc(player.name)}</b><small>${active?'轮到你施法':'等待其他法师'}</small></span>${view.mode==='score'?`<span class="score-badge">${player.score} 分</span>`:''}<span class="seat-vitals">${lifePips(player.life)}</span></div><div class="seat-stones human-rack">${player.rack.map(()=>stone(null,{back:true})).join('')||'<span class="empty-label">法术石已清空</span>'}</div><span class="secret-badge">◇ ${esc(secrets)}</span>`;
  $('turnProgress').classList.toggle('hidden',!active);
}

function renderTablePlayers(){
  const count=view.players.length;
  $('playerHands').style.setProperty('--player-count',String(count));
  $('tablePlayers').innerHTML=view.players.map((player,index)=>{
    const angle=Math.PI/2+index*Math.PI*2/count;
    const x=50+Math.cos(angle)*39;
    const y=47+Math.sin(angle)*30;
    const scale=.72+y*.0045;
    const active=view.phase==='casting'&&view.activeIndex===player.id;
    return `<div class="table-player-3d${index===0?' self':''}${active?' active':''}${player.life===0?' defeated':''}" data-scene-player-id="${player.id}" style="--seat-x:${x.toFixed(2)}%;--seat-y:${y.toFixed(2)}%;--seat-scale:${scale.toFixed(3)};--seat-depth:${Math.round(y)};--seat-color:${player.color}">${sceneHand(player)}<span class="table-avatar" style="--avatar:${player.color}">${index===0?'你':esc(player.name[0])}</span><small>${esc(player.name)}</small>${sceneLifePips(player.life)}</div>`;
  }).join('');
}

function setDie(value){
  const transforms={1:'rotateX(0deg) rotateY(0deg)',2:'rotateX(0deg) rotateY(180deg)',3:'rotateX(0deg) rotateY(90deg)'};
  magicTable3d?.setDie(value);
  $('die').classList.toggle('hidden',value===null);
  if(value!==null){$('die').setAttribute('aria-label',`魔法骰掷出 ${value}`);$('dieCube').style.transform=transforms[value];}
}

function elementCenter(element){
  if(!element)return null;
  const bounds=element.getBoundingClientRect();
  return {x:bounds.left+bounds.width/2,y:bounds.top+bounds.height/2};
}

function playerSeat(playerId){return document.querySelector(`[data-player-id="${playerId}"]`);}
function scenePlayer(playerId){return document.querySelector(`[data-scene-player-id="${playerId}"]`);}
function sceneHandFor(playerId){return scenePlayer(playerId)?.querySelector('.table-hand-3d');}

async function animateFailedCast(action){
  const source=scenePlayer(action.playerId)||playerSeat(action.playerId);
  const core=document.querySelector('.tower-core');
  const center=elementCenter(core);
  if(!source||!core||!center||reducedMotion.matches){await wait(INFORMATION_HOLD_MS);return;}
  source.classList.add('spell-failed');
  core.classList.add('spell-fizzle');
  const burst=document.createElement('span');
  burst.className='failed-spell-burst';
  burst.innerHTML=`<b>✕</b><small>${action.spell} 号咒语落空</small>`;
  burst.style.left=`${center.x-58}px`;
  burst.style.top=`${center.y-58}px`;
  document.body.append(burst);
  const animation=burst.animate([
    {transform:'scale(.28) rotate(-24deg)',opacity:0,filter:'blur(5px)'},
    {transform:'scale(1.16) rotate(7deg)',opacity:1,filter:'blur(0)',offset:.38},
    {transform:'scale(.92) rotate(-3deg)',opacity:1,offset:.68},
    {transform:'scale(1) rotate(0)',opacity:1},
  ],{duration:620,easing:'cubic-bezier(.2,.78,.2,1)',fill:'forwards'});
  await animation.finished.catch(()=>{});
  await wait(INFORMATION_HOLD_MS);
  burst.remove();
  source.classList.remove('spell-failed');
  core.classList.remove('spell-fizzle');
}

async function flyCastStone(action){
  gameAudio.playCast(action);
  const table=await magicTableReady;
  if(table)return table.cast({...action,hold:INFORMATION_HOLD_MS});
  if(!action.success)return animateFailedCast(action);
  const origin=elementCenter(sceneHandFor(action.playerId)||scenePlayer(action.playerId));
  const target=$('castFocus');
  const destination=elementCenter(target);
  if(!origin||!destination||reducedMotion.matches){await wait(INFORMATION_HOLD_MS);return;}
  const token=document.createElement('span');
  token.className='motion-stone';
  token.innerHTML=`${spellArt(action.spell)}<b>${action.spell}</b><small>${esc(SPELLS[action.spell-1]?.icon||'✧')}</small>`;
  token.style.left=`${origin.x-17}px`;
  token.style.top=`${origin.y-24.5}px`;
  document.body.append(token);
  const deltaX=destination.x-origin.x;
  const deltaY=destination.y-origin.y;
  const animation=token.animate([
    {transform:'perspective(420px) translate3d(0,0,0) rotateX(68deg) rotateY(-34deg) rotateZ(-10deg) scale(.65)',opacity:0},
    {transform:'perspective(420px) translate3d(0,-9px,34px) rotateX(22deg) rotateY(-18deg) rotateZ(-6deg) scale(1)',opacity:1,offset:.18},
    {transform:`perspective(420px) translate3d(${deltaX*.56}px,${deltaY*.46-42}px,58px) rotateX(-18deg) rotateY(28deg) rotateZ(-2deg) scale(1.12)`,opacity:1,offset:.64},
    {transform:`perspective(420px) translate3d(${deltaX}px,${deltaY}px,0) rotateX(4deg) rotateY(-8deg) rotateZ(8deg) scale(.82)`,opacity:1},
  ],{duration:480,easing:'cubic-bezier(.2,.76,.2,1)',fill:'forwards'});
  await animation.finished.catch(()=>{});
  target.classList.add('cast-arriving');
  await wait(INFORMATION_HOLD_MS);
  target.classList.remove('cast-arriving');
  token.remove();
}

async function animateSpellEffect(action){
  if(!action?.success)return;
  gameAudio.playSpell(action.spell);
  const table=await magicTableReady;
  await table?.spellEffect(action);
}

async function flyDrawStone(source,target,{secret=false,delay=0}={}){
  const origin=elementCenter(source);
  const destination=elementCenter(target);
  if(!origin||!destination||reducedMotion.matches)return;
  const token=document.createElement('span');
  token.className=`motion-stone back${secret?' secret':''}`;
  token.innerHTML='<b>?</b>';
  token.style.left=`${origin.x-17}px`;
  token.style.top=`${origin.y-24.5}px`;
  document.body.append(token);
  const deltaX=destination.x-origin.x;
  const deltaY=destination.y-origin.y;
  const animation=token.animate([
    {transform:'perspective(420px) translate3d(0,0,0) rotateX(76deg) rotateY(18deg) rotateZ(8deg) scale(.7)',opacity:0},
    {transform:'perspective(420px) translate3d(0,-10px,30px) rotateX(32deg) rotateY(96deg) rotateZ(4deg) scale(1)',opacity:1,offset:.2},
    {transform:`perspective(420px) translate3d(${deltaX*.55}px,${deltaY*.45-38}px,54px) rotateX(-12deg) rotateY(214deg) rotateZ(-4deg) scale(1.08)`,opacity:1,offset:.64},
    {transform:`perspective(420px) translate3d(${deltaX}px,${deltaY}px,0) rotateX(5deg) rotateY(360deg) rotateZ(-8deg) scale(.78)`,opacity:0},
  ],{duration:520,delay,easing:'cubic-bezier(.2,.76,.2,1)',fill:'forwards'});
  await animation.finished.catch(()=>{});
  token.remove();
}

async function animateDie(value){
  if(![1,2,3].includes(value))return;
  gameAudio.playDie();
  const table=await magicTableReady;
  if(table){
    transientDie=value;
    dieRolling=true;
    await table.rollDie(value,{hold:INFORMATION_HOLD_MS});
    dieRolling=false;
    transientDie='hidden';
    table.setDie(null);
    return;
  }
  const die=$('die');
  const cube=$('dieCube');
  transientDie=value;
  dieRolling=true;
  die.classList.remove('hidden');
  die.setAttribute('aria-label','魔法骰正在投掷');
  if(reducedMotion.matches){
    setDie(value);
    await wait(INFORMATION_HOLD_MS);
    setDie(null);
    transientDie='hidden';
    dieRolling=false;
    return;
  }
  const finalTransforms={1:'rotateX(720deg) rotateY(720deg) rotateZ(0deg)',2:'rotateX(720deg) rotateY(900deg) rotateZ(0deg)',3:'rotateX(720deg) rotateY(810deg) rotateZ(0deg)'};
  const animation=cube.animate([
    {transform:'rotateX(-18deg) rotateY(24deg) rotateZ(0deg)',offset:0},
    {transform:'rotateX(235deg) rotateY(175deg) rotateZ(28deg)',offset:.34},
    {transform:'rotateX(515deg) rotateY(492deg) rotateZ(-16deg)',offset:.72},
    {transform:finalTransforms[value],offset:1},
  ],{duration:920,easing:'cubic-bezier(.18,.72,.18,1)',fill:'forwards'});
  await animation.finished.catch(()=>{});
  animation.cancel();
  setDie(value);
  await wait(INFORMATION_HOLD_MS);
  setDie(null);
  transientDie='hidden';
  dieRolling=false;
}

function renderTable(){
  renderTablePlayers();
  $('drawCount').textContent=String(view.drawPileCount);
  $('secretCount').textContent=String(view.secretPoolCount);
  $('drawPileCount').textContent=String(view.drawPileCount);
  $('secretPileCount').textContent=String(view.secretPoolCount);
  $('discardPiles').innerHTML=discardPiles([...view.publicRemoved,...view.castStones]);
  magicTable3d?.sync(view);
  if(!dieRolling)setDie(null);
  if(view.phase!=='casting'){$('turnGlyph').textContent='✦';$('turnHeadline').textContent='本轮已经结束';$('turnDetail').textContent=view.roundResult?.summary||'等待结算';return;}
  const actor=view.players[view.activeIndex];
  if(actor.id===0){$('turnGlyph').textContent=view.turnCastCount?'✧':'?';$('turnHeadline').textContent=view.turnCastCount?'法术奏效，继续吗？':'轮到你施法';$('turnDetail').textContent=view.turnCastCount?`可选择 ${view.minimumSpell}–8 号，或及时收手`:'观察公开信息，猜测自己的法术石';}
  else{$('turnGlyph').textContent=actor.isBot?'✦':'◇';$('turnHeadline').textContent=`${actor.name} ${actor.isBot?'正在推演':'正在思考'}`;$('turnDetail').textContent=actor.isBot?`${actor.title} · 只依据公开信息行动`:'等待远方的法师作出选择';}
}

function renderSpells(){
  const ownTurn=view.phase==='casting'&&view.activeIndex===0&&!commandBusy&&!revealHolding;
  $('castRule').textContent=view.lastSuccessfulSpell===null?'首次施法可选择任意编号':`连咏限制：只能选择 ${view.minimumSpell}–8 号`;
  const buttons=SPELLS.map(spell=>{
    const illegal=spell.id<view.minimumSpell;
    return `<button class="spell-button${illegal?' illegal':''}" data-spell="${spell.id}" type="button" ${!ownTurn||illegal?'disabled':''} title="${esc(spell.description)}"><span class="spell-symbol">${spellArt(spell.id)}</span><span class="spell-copy"><span class="spell-title"><span class="spell-number">${spell.id}</span><b>${esc(spell.name)}</b></span><small>${esc(spell.tag)} · ${esc(spell.description)}</small></span></button>`;
  });
  $('spellListLeft').innerHTML=buttons.slice(0,4).join('');
  $('spellListRight').innerHTML=buttons.slice(4).join('');
  $('spellbookToggle').classList.toggle('ready',ownTurn);
  document.querySelectorAll('[data-spell]').forEach(button=>button.addEventListener('click',()=>{setSpellbookOpen(false);sendAction('cast',Number(button.dataset.spell));}));
  $('stopBtn').classList.toggle('hidden',!view.canStop||commandBusy);
}

function renderEvents(){
  const events=view.events.slice(-42);
  $('eventLog').innerHTML=events.map(event=>`<div class="event ${esc(event.type)}"><time>R${event.round}.${String(event.id).padStart(2,'0')}</time><i></i><span>${event.playerId===0?'<strong>你</strong> · ':''}${esc(event.text)}</span></div>`).join('');
  $('eventLog').scrollTop=$('eventLog').scrollHeight;
}

function renderResult(){
  const complete=room.status==='round-complete'||room.status==='finished';
  const outcomePlaying=pendingOutcomeAnimations.size>0||document.body.classList.contains('round-outcome-playing');
  $('resultLayer').classList.toggle('hidden',!complete||revealHolding||outcomePlaying);
  if(!complete||!view.roundResult){winnerShowcase3d?.hide();return;}
  if(revealHolding||outcomePlaying)return;
  if($('logPanel').classList.contains('open'))setLogOpen(false);
  if($('spellbookPanel').classList.contains('open'))setSpellbookOpen(false);
  const finished=room.status==='finished';
  const winners=finished?view.gameWinnerIds:view.roundResult.winnerIds;
  const humanWon=winners.includes(0);
  $('resultEyebrow').textContent=finished?'TRIAL COMPLETE':'ROUND COMPLETE';
  $('resultGlyph').textContent=humanWon?'✦':'◇';
  $('resultTitle').textContent=finished?(humanWon?'你完成了试炼':'试炼已有胜者'):(humanWon?'你赢得本轮':'本轮结束');
  $('resultSummary').textContent=view.roundResult.summary;
  $('scoreTable').innerHTML=view.players.map(player=>view.mode==='score'?`<div class="score-row"><span>${esc(player.name)} · 生命 ${player.life}</span><strong>${view.roundResult.points[player.id]?`+${view.roundResult.points[player.id]}`:'—'}</strong><b>${player.score} 分</b></div>`:`<div class="score-row"><span>${esc(player.name)} · 生命 ${player.life}</span><strong>${view.gameWinnerIds.includes(player.id)?'胜出':'—'}</strong><b>${player.secrets.length?'◇'.repeat(player.secrets.length):''}</b></div>`).join('');
  const resultCard=$('resultLayer').querySelector('.result-card');
  const scoreMode=view.mode==='score';resultCard.classList.toggle('score-result',scoreMode);
  const highestScore=Math.max(...view.players.map(player=>player.score));
  const champions=finished&&scoreMode&&highestScore>=8?view.players.filter(player=>player.score===highestScore):[];
  const champion=champions.length===1?champions[0]:null;
  resultCard.classList.toggle('game-result',Boolean(champion));
  $('winnerShowcase').classList.toggle('hidden',!champion);
  if(champion){$('winnerName').textContent=`${champion.name} · ${champion.score} 分`;winnerShowcase3d?.show(champion);}
  else winnerShowcase3d?.hide();
  if(scoreMode){
    const transition=resultScoreTransition?.round===view.round?resultScoreTransition:null;
    const afterScores=transition?.afterScores||view.players.map(player=>player.score);
    const beforeScores=transition?.beforeScores||afterScores.map((score,id)=>score-(view.roundResult.points[id]||0));
    const animate=!climbedRounds.has(view.round);
    renderTowerProgress($('resultTower'),{players:view.players,fromScores:beforeScores,toScores:afterScores,animate});
    climbedRounds.add(view.round);
  }else{$('resultTower').replaceChildren();delete $('resultTower').dataset.towerKey;}
  const allReady=room.roster.every(member=>member.ready&&member.connected);
  const button=$('resultBtn');
  button.disabled=commandBusy||(!room.isOwner&&room.selfReady)||(room.isOwner&&room.selfReady&&!allReady);
  button.querySelector('span').textContent=!room.selfReady?'准备继续':room.isOwner&&allReady?(finished?'再开一场':'开始下一轮'):'等待房主';
}

function hasStateAnimations(previous,next){
  if(!previous||!next||previous.round!==next.round)return false;
  return next.players.some(player=>{
    const before=previous.players.find(candidate=>candidate.id===player.id);
    return before&&(before.life!==player.life||before.rack.length!==player.rack.length||before.secrets.length!==player.secrets.length);
  });
}

function dragonFailureStages(action,before,after){
  if(action?.type!=='cast'||action.success||action.spell!==1||!action.roll||!before||!after)return null;
  const beforePlayer=before.players.find(player=>player.id===action.playerId);
  const afterPlayer=after.players.find(player=>player.id===action.playerId);
  if(!beforePlayer||!afterPlayer)return null;
  const totalDamage=beforePlayer.life-afterPlayer.life;
  const rolledDamage=Math.min(action.roll,totalDamage);
  const normalDamage=totalDamage-rolledDamage;
  if(!rolledDamage||!normalDamage)return null;
  return {
    rolledDamage,
    normalDamage,
    intermediatePlayers:after.players.map(player=>player.id===action.playerId?{...player,life:beforePlayer.life-rolledDamage}:player),
  };
}

function actionLifeView(previous,next,players=next?.players){
  if(!previous||!next||previous.round!==next.round||previous.phase!=='casting')return next;
  return {...next,phase:previous.phase,activeIndex:previous.activeIndex,players};
}

function syncOutcomeAnimationLock(){
  document.body.classList.toggle('round-outcome-playing',pendingOutcomeAnimations.size>0);
}

async function animateLifeChangeBatch(changes,{sound=true}={}){
  if(sound)gameAudio.playLifeChanges(changes);
  const table=await magicTableReady;
  if(table){await Promise.all(changes.filter(change=>change.amount!==0).map(change=>table.lifeChange(change)));return;}
  if(reducedMotion.matches)return;
  const animations=changes.map(async change=>{
      const seat=scenePlayer(change.playerId)||playerSeat(change.playerId);
      const center=elementCenter(seat);
      if(!seat||!center)return;
      const healing=change.amount>0;
      const className=healing?'receiving-heal':'taking-damage';
      seat.classList.add(className);
      const label=document.createElement('span');
      label.className=`life-change ${healing?'heal':'damage'}`;
      label.textContent=healing?`+${change.amount}`:String(change.amount);
      label.style.left=`${center.x-21}px`;
      label.style.top=`${center.y-18}px`;
      document.body.append(label);
      const animation=label.animate([
        {transform:'translateY(8px) scale(.7)',opacity:0},
        {transform:'translateY(-4px) scale(1.08)',opacity:1,offset:.25},
        {transform:'translateY(-48px) scale(.95)',opacity:0},
      ],{duration:620,easing:'ease-out',fill:'forwards'});
      await animation.finished.catch(()=>{});
      label.remove();
      seat.classList.remove(className);
  });
  await Promise.all(animations);
}

async function animateActionLifeChanges(previous,next,{sound=true}={}){
  if(!previous||!next||previous.round!==next.round)return;
  const changes=next.players.flatMap(player=>{
    const before=previous.players.find(candidate=>candidate.id===player.id);
    return !before||before.life===player.life?[]:[{playerId:player.id,amount:player.life-before.life}];
  });
  await animateLifeChangeBatch(changes,{sound});
}

async function animateDraws(previous,next){
  if(!previous||!next||previous.round!==next.round)return;
  const totalDraws=next.players.reduce((total,player)=>{
    const before=previous.players.find(candidate=>candidate.id===player.id);
    if(!before)return total;
    return total+Math.max(0,player.rack.length-before.rack.length)+Math.max(0,player.secrets.length-before.secrets.length);
  },0);
  gameAudio.playDraw(totalDraws);
  const table=await magicTableReady;
  if(table){
    const animations=[];
    let drawIndex=0,secretIndex=0;
    for(const player of next.players){
      const before=previous.players.find(candidate=>candidate.id===player.id);
      if(!before)continue;
      const drawn=Math.max(0,player.rack.length-before.rack.length);
      const secrets=Math.max(0,player.secrets.length-before.secrets.length);
      for(let index=0;index<drawn;index++)animations.push(table.draw({playerId:player.id,delay:drawIndex++*90}));
      for(let index=0;index<secrets;index++)animations.push(table.draw({playerId:player.id,secret:true,delay:secretIndex++*90}));
    }
    await Promise.all(animations);
    return;
  }
  const drawSource=document.querySelector('.draw-pile .pile-stone');
  const secretSource=document.querySelector('.secret-pile .pile-stone');
  const drawAnimations=[];
  const secretAnimations=[];
  let drawIndex=0;
  let secretIndex=0;
  for(const player of next.players){
    const before=previous.players.find(candidate=>candidate.id===player.id);
    const target=sceneHandFor(player.id)||scenePlayer(player.id);
    if(!before||!target)continue;
    const drawn=Math.max(0,player.rack.length-before.rack.length);
    const secrets=Math.max(0,player.secrets.length-before.secrets.length);
    for(let index=0;index<drawn;index++)drawAnimations.push(flyDrawStone(drawSource,target,{delay:drawIndex++*90}));
    for(let index=0;index<secrets;index++)secretAnimations.push(flyDrawStone(secretSource,target,{secret:true,delay:secretIndex++*90}));
  }
  if(drawAnimations.length)drawSource?.classList.add('drawing');
  if(secretAnimations.length)secretSource?.classList.add('drawing');
  await Promise.all([...drawAnimations,...secretAnimations]);
  drawSource?.classList.remove('drawing');
  secretSource?.classList.remove('drawing');
}

function renderGame(){
  showOnly('game');
  $('modeEyebrow').textContent=view.mode==='score'?'SCORE ASCENT · 积分模式':'ONE ROUND DUEL · 单局模式';
  $('roundTitle').textContent=`法师塔 · 第 ${view.round} 轮`;
  $('goalLabel').textContent=view.mode==='score'?'8 分':'本轮定胜负';
  $('copyGameInvite').textContent=`房间 ${room.code} · 复制邀请`;
  renderOpponents();renderTable();renderHuman();renderSpells();renderEvents();renderResult();
  updateTurnCountdown();
  setNetworkStatus('TOWER ONLINE');
}

function applyPayload(payload){
  const generation=payloadGeneration;
  const task=payloadQueue.then(()=>generation===payloadGeneration?applyPayloadNow(payload):undefined);
  payloadQueue=task.catch(()=>{});
  return task;
}

async function applyPayloadNow(payload){
  if(room?.code===payload.room.code&&payload.room.version<room.version){schedulePoll();return;}
  const previousView=view;
  const reveal=payload.room.reveal;
  const shouldReveal=reveal?.type==='cast'&&reveal.id!==lastRevealId&&payload.room.serverNow<=reveal.until;
  const finalView=payload.game;
  const dragonStages=shouldReveal?dragonFailureStages(reveal,previousView,finalView):null;
  const startsGame=payload.room.status==='playing'&&payload.game?.round===1&&(!previousView||previousView.phase==='game-complete');
  const startsScoreGame=startsGame&&payload.game.mode==='score';
  if(startsGame){animatedOutcomes.clear();pendingOutcomeAnimations.clear();syncOutcomeAnimationLock();}
  if(startsScoreGame){openingTowerShown=false;resultScoreTransition=null;climbedRounds.clear();}
  const showOpeningTower=startsScoreGame&&!openingTowerShown;
  const showRoundTower=payload.game?.mode==='score'&&['round-complete','finished'].includes(payload.room.status)&&!climbedRounds.has(payload.game.round);
  if(showRoundTower){
    const afterScores=payload.game.players.map(player=>player.score);
    const beforeScores=previousView?.round===payload.game.round?previousView.players.map(player=>player.score):afterScores.map((score,id)=>score-(payload.game.roundResult?.points[id]||0));
    resultScoreTransition={round:payload.game.round,beforeScores,afterScores};
  }
  const outcomeKey=payload.game?.roundResult?`${payload.game.round}:${payload.game.roundResult.kind}:${(payload.game.roundResult.winnerIds||[]).join(',')}:${(payload.game.roundResult.loserIds||[]).join(',')}`:null;
  const showRoundOutcome=Boolean(outcomeKey)&&(!previousView?.roundResult||previousView.round!==payload.game.round)&&!animatedOutcomes.has(outcomeKey);
  if(showRoundOutcome){
    animatedOutcomes.add(outcomeKey);
    pendingOutcomeAnimations.add(outcomeKey);
    syncOutcomeAnimationLock();
  }
  const shouldAnimate=shouldReveal||hasStateAnimations(previousView,payload.game)||showOpeningTower||showRoundTower||showRoundOutcome;
  if(reveal?.id)lastRevealId=reveal.id;
  if(shouldAnimate){
    revealHolding=true;
    if(shouldReveal&&reveal.roll!==null&&reveal.roll!==undefined)transientDie='hidden';
    document.body.classList.add('action-running');
  }
  room=payload.room;
  view=shouldReveal&&previousView?previousView:finalView;
  receivedAt=Date.now();
  if(payload.token)saveSession({code:room.code,token:payload.token,name:$('onlineName').value.trim()});
  history.replaceState(null,'',`${location.pathname}?room=${room.code}`);
  if(room.status==='waiting')renderWaiting();else renderGame();
  if(shouldAnimate){
    try{
      if(shouldReveal){
        toast(reveal.success?`${reveal.spell} 号法术成功！`:`${reveal.spell} 号法术失败。`);
        await flyCastStone(reveal);
        if(reveal.roll!==null&&reveal.roll!==undefined)await animateDie(reveal.roll);
        await animateSpellEffect(reveal);
      }
      if(dragonStages){
        view=actionLifeView(previousView,finalView,dragonStages.intermediatePlayers);
        renderGame();
        await animateLifeChangeBatch([{playerId:reveal.playerId,amount:-dragonStages.rolledDamage}]);
        await wait(INFORMATION_HOLD_MS);
        view=actionLifeView(previousView,finalView);
        renderGame();
        await animateLifeChangeBatch([{playerId:reveal.playerId,amount:-dragonStages.normalDamage}]);
      }else{
        view=actionLifeView(previousView,finalView);
        renderGame();
        await animateActionLifeChanges(previousView,finalView,{sound:reveal?.spell!==8});
      }
      view=finalView;
      renderGame();
      await animateDraws(previousView,finalView);
      if(showRoundOutcome){
        const table=await magicTableReady;
        await table?.roundOutcome(finalView.roundResult);
      }
      if(shouldReveal&&reveal.success&&reveal.spell===4&&reveal.playerId===0){
        const previousCount=previousView?.players[0].secrets.length??0;
        const secret=view.players[0].secrets.slice(previousCount).find(Number.isInteger);
        if(secret!==undefined)toast(`你获得的秘密石是 ${secret} 号。`);
      }
      if(showOpeningTower){
        openingTowerShown=true;
        const scores=view.players.map(player=>player.score);
        await showTowerProgress({players:view.players,fromScores:scores,toScores:scores,title:'试炼开始',subtitle:'所有法师从塔底出发，率先取得 8 分者登顶'});
      }
      if(showRoundTower){
        resultScoreTransition={...resultScoreTransition,round:view.round};
      }
    }finally{
      view=finalView;
      revealHolding=false;
      transientDie=null;
      dieRolling=false;
      if(showRoundOutcome){pendingOutcomeAnimations.delete(outcomeKey);syncOutcomeAnimationLock();}
      document.body.classList.remove('action-running');
      document.querySelectorAll('.motion-stone,.failed-spell-burst,.life-change').forEach(element=>element.remove());
      document.querySelectorAll('.spell-failed,.spell-fizzle,.taking-damage,.receiving-heal,.drawing').forEach(element=>element.classList.remove('spell-failed','spell-fizzle','taking-damage','receiving-heal','drawing'));
      if(view){renderGame();animateTopHandChanges(previousView,finalView);}
    }
  }
  schedulePoll();
}

function pollDelay(){
  if(document.hidden)return 4000;
  if(room?.status==='playing')return 650;
  return 1400;
}

function schedulePoll(delay=pollDelay()){
  clearTimeout(pollTimer);
  const generation=++pollGeneration;
  pollTimer=setTimeout(async()=>{
    if(!session||generation!==pollGeneration)return;
    try{await applyPayload(await roomApi(`/rooms/${session.code}`));}
    catch(error){setNetworkStatus('RECONNECTING',true);$('netError').textContent=error.message;schedulePoll(Math.min(6000,delay*2));}
  },delay);
}

async function enterRoom(joining){
  if(commandBusy)return;
  const name=$('onlineName').value.trim();
  if(!name){$('netError').textContent='请先留下昵称。';$('onlineName').focus();return;}
  localStorage.setItem(NAME_KEY,name);
  const code=normalizeCode($('joinCode').value);
  if(joining&&code.length!==6){$('netError').textContent='请输入六位房间码。';return;}
  commandBusy=true;$('netError').textContent='';
  try{
    const payload=joining
      ?await roomApi(`/rooms/${code}/join`,{method:'POST',token:null,body:{name,seatKey:randomHex()}})
      :await roomApi('/rooms',{method:'POST',token:null,body:{name,mode:$('roomMode').value,playerCount:Number($('roomPlayers').value)}});
    saveSession({code:payload.room.code,token:payload.token,name});
    await applyPayload(payload);
  }catch(error){$('netError').textContent=error.message;}
  finally{commandBusy=false;}
}

async function resumeRoom(){
  if(!session||commandBusy)return;
  commandBusy=true;$('netError').textContent='';
  try{await applyPayload(await roomApi(`/rooms/${session.code}`));}
  catch(error){saveSession(null);$('netError').textContent=error.message;showOnly('onlineLobby');}
  finally{commandBusy=false;}
}

async function roomCommand(operation,body={}){
  if(!session||commandBusy)return;
  commandBusy=true;
  try{
    const payload=await roomApi(`/rooms/${session.code}/${operation}`,{method:'POST',body});
    await applyPayload(payload);
  }
  catch(error){toast(error.message);if(/已更新|轮到/.test(error.message))schedulePoll(0);}
  finally{commandBusy=false;if(room?.status==='waiting')renderWaiting();else if(view)renderGame();}
}

async function sendAction(type,spell){
  if(!view||commandBusy||view.phase!=='casting'||view.activeIndex!==0)return;
  await roomCommand('action',{requestId:requestId(),version:room.version,type,...(type==='cast'?{spell}:{})});
}

async function toggleReady(){await roomCommand('ready',{ready:!room.selfReady});}
async function startTrial(){await roomCommand('start');}
async function resultAction(){if(!room.selfReady)await roomCommand('ready',{ready:true});else if(room.isOwner&&room.roster.every(member=>member.ready&&member.connected))await roomCommand('start');}

async function leaveRoom(){
  clearTimeout(pollTimer);clearInterval(countdownTimer);pollGeneration++;
  payloadGeneration++;
  magicTable3d?.cancelAnimations();
  winnerShowcase3d?.hide();
  try{if(session)await roomApi(`/rooms/${session.code}/leave`,{method:'POST',body:{}});}catch(error){toast(error.message);}
  saveSession(null);room=null;view=null;lastRevealId=0;openingTowerShown=false;resultScoreTransition=null;climbedRounds.clear();animatedOutcomes.clear();pendingOutcomeAnimations.clear();syncOutcomeAnimationLock();history.replaceState(null,'',location.pathname);$('resultLayer').classList.add('hidden');showOnly('onlineLobby');updateResume();
}

async function copyInvite(){
  if(!room)return;
  const link=`${location.origin}${location.pathname}?room=${room.code}`;
  try{await navigator.clipboard.writeText(link);toast('传送门链接已复制。');}
  catch{prompt('复制这个邀请链接：',link);}
}

function updateResume(){
  $('resumeRoomBtn').classList.toggle('hidden',!session);
  if(session)$('resumeRoomBtn').textContent=`恢复房间 ${session.code} 的法师席位`;
}

function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.add('show');toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2200);}

document.querySelectorAll('[data-portal-tab]').forEach(button=>button.addEventListener('click',()=>portalTab(button.dataset.portalTab)));
$('joinCode').addEventListener('input',event=>event.target.value=normalizeCode(event.target.value));
$('createRoomBtn').addEventListener('click',()=>enterRoom(false));
$('joinRoomBtn').addEventListener('click',()=>enterRoom(true));
$('resumeRoomBtn').addEventListener('click',resumeRoom);
$('copyInviteBtn').addEventListener('click',copyInvite);
$('copyGameInvite').addEventListener('click',copyInvite);
$('readyRoomBtn').addEventListener('click',toggleReady);
$('startRoomBtn').addEventListener('click',startTrial);
$('leaveWaitingBtn').addEventListener('click',leaveRoom);
$('restartBtn').addEventListener('click',leaveRoom);
$('stopBtn').addEventListener('click',()=>{setSpellbookOpen(false);sendAction('stop');});
$('resultBtn').addEventListener('click',resultAction);
$('resultExitBtn').addEventListener('click',leaveRoom);
$('logToggleBtn').addEventListener('click',()=>{setSpellbookOpen(false);setLogOpen(!$('logPanel').classList.contains('open'));});
$('logCloseBtn').addEventListener('click',()=>setLogOpen(false));
$('logBackdrop').addEventListener('click',()=>setLogOpen(false));
$('spellbookToggle').addEventListener('click',()=>{setLogOpen(false);setSpellbookOpen(!$('spellbookPanel').classList.contains('open'));});
$('spellbookCloseBtn').addEventListener('click',()=>setSpellbookOpen(false));
$('spellbookBackdrop').addEventListener('click',()=>setSpellbookOpen(false));
$('clearLogBtn').addEventListener('click',()=>$('eventLog').scrollTo({top:$('eventLog').scrollHeight,behavior:'smooth'}));
document.querySelectorAll('[data-help]').forEach(button=>button.addEventListener('click',()=>{setLogOpen(false);setSpellbookOpen(false);$('helpDialog').showModal();}));
$('helpCloseBtn').addEventListener('click',()=>$('helpDialog').close());
$('helpDialog').addEventListener('click',event=>{if(event.target===$('helpDialog'))$('helpDialog').close();});
document.addEventListener('visibilitychange',()=>{if(session)schedulePoll(0);});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('logPanel').classList.contains('open')){setLogOpen(false);return;}if(event.key==='Escape'&&$('spellbookPanel').classList.contains('open')){setSpellbookOpen(false);return;}if($('logPanel').classList.contains('open')||$('helpDialog').open||!$('resultLayer').classList.contains('hidden'))return;if(event.key.toLowerCase()==='s'&&view?.canStop)sendAction('stop');if(/^[1-8]$/.test(event.key)&&view?.activeIndex===0)sendAction('cast',Number(event.key));});

function updateTurnCountdown(){
  const progress=$('turnProgress');
  if(!room||room.status!=='playing'||!room.deadline||!view){$('turnCountdown').textContent='';return;}
  const serverNow=room.serverNow+(Date.now()-receivedAt);
  const actor=view.players[view.activeIndex];
  const assisted=actor?.isBot||actor?.connected===false;
  const durationMs=(assisted?1:room.turnSeconds)*1000;
  const remainingMs=Math.min(durationMs,Math.max(0,room.deadline-serverNow));
  const seconds=Math.ceil(remainingMs/1000);
  $('turnCountdown').textContent=view.activeIndex===0?`你的回合 · ${seconds}s`:actor?.isBot?'塔灵推演中':`等待对手 · ${seconds}s`;
  if(!progress)return;
  const percentage=durationMs?remainingMs/durationMs*100:0;
  progress.classList.toggle('urgent',percentage<=25);
  progress.setAttribute('aria-valuemax',String(durationMs/1000));
  progress.setAttribute('aria-valuenow',String(seconds));
  $('turnProgressSeconds').textContent=`${seconds}s`;
  $('turnProgressFill').style.width=`${percentage}%`;
}

countdownTimer=setInterval(updateTurnCountdown,250);

$('onlineName').value=session?.name||localStorage.getItem(NAME_KEY)||'';
const invitedCode=normalizeCode(new URLSearchParams(location.search).get('room'));
if(invitedCode){$('joinCode').value=invitedCode;portalTab('join');}
updateResume();
if(session&&(!invitedCode||session.code===invitedCode))resumeRoom();

$('tabletopHome')?.addEventListener('click',event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;if(session&&room?.status!=='finished'&&!confirm('返回大厅后，房间会继续运行，离线或超时将按房间规则自动处理。重新进入好友联机可尝试恢复座位。确定返回大厅吗？'))event.preventDefault();});
