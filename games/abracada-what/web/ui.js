import {AbracadaGame,AI_PROFILES,SPELLS} from './engine.js';
import {showTowerProgress} from './tower-progress.js';

const $=id=>document.getElementById(id);
const esc=value=>String(value).replace(/[&<>'"]/g,character=>({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' })[character]);
const AI_THINK_DELAY=1000;
const INFORMATION_HOLD_MS=1000;
const wait=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
let setup={mode:'score',playerCount:4};
let game=null;
let view=null;
let botTimer=null;
let toastTimer=null;
let resultTimer=null;
let busy=false;
let actionEpoch=0;
let dieRolling=false;

function lifePips(life){return `<span class="life-pips" aria-label="${life} 点生命">${Array.from({length:6},(_,index)=>`<i class="${index<life?'live':''}"></i>`).join('')}</span>`;}
function stone(spell,{back=false,small=false}={}){const info=spell?SPELLS[spell-1]:null;return `<span class="magic-stone${back?' back':''}${small?' small':''}"${info?` title="${esc(info.name)}"`:''}><b>${back?'?':info?.id||'?'}</b>${!back&&info?`<small>${esc(info.icon)}</small>`:''}</span>`;}
function miniStones(values){return values.length?values.map(value=>`<span class="mini-stone" title="${esc(SPELLS[value-1].name)}">${value}</span>`).join(''):'<span class="empty-label">暂无</span>';}

function renderLineup(){
  const bots=AI_PROFILES.slice(0,setup.playerCount-1);
  $('botCount').textContent=String(bots.length);
  $('lineupPreview').innerHTML=`<span class="preview-avatar" style="--avatar:#f5e4ad">你</span>${bots.map(bot=>`<span class="preview-avatar" style="--avatar:${bot.color}" title="${esc(bot.name)} · ${esc(bot.title)}">${esc(bot.name[0])}</span>`).join('')}<span class="preview-copy"><b>${setup.playerCount} 人试炼阵容</b>你与 ${bots.map(bot=>bot.name).join('、')}</span>`;
}

function chooseMode(mode){
  setup.mode=mode;
  document.querySelectorAll('[data-mode]').forEach(button=>button.classList.toggle('active',button.dataset.mode===mode));
}

function choosePlayers(playerCount){
  setup.playerCount=playerCount;
  document.querySelectorAll('[data-players]').forEach(button=>button.classList.toggle('active',Number(button.dataset.players)===playerCount));
  renderLineup();
}

async function startGame(){
  cancelVisuals();
  clearTimeout(botTimer);
  clearTimeout(resultTimer);
  game=new AbracadaGame({playerCount:setup.playerCount,mode:setup.mode});
  game.startGame();
  $('lobby').classList.add('hidden');
  $('game').classList.remove('hidden');
  $('resultLayer').classList.add('hidden');
  const showingTower=setup.mode==='score';
  busy=showingTower;
  refresh({schedule:!showingTower});
  if(showingTower){
    const scores=view.players.map(player=>player.score);
    await showTowerProgress({players:view.players,fromScores:scores,toScores:scores,title:'试炼开始',subtitle:'所有法师从塔底出发，率先取得 8 分者登顶'});
    if(!game)return;
    busy=false;
    refresh();
  }
}

function returnToLobby(){
  cancelVisuals();
  clearTimeout(botTimer);
  clearTimeout(resultTimer);
  game=null;
  view=null;
  busy=false;
  $('resultLayer').classList.add('hidden');
  $('game').classList.add('hidden');
  $('lobby').classList.remove('hidden');
}

function renderOpponents(){
  $('opponents').innerHTML=view.players.slice(1).map(player=>{
    const active=view.phase==='casting'&&view.activeIndex===player.id;
    return `<article class="player-seat${active?' active':''}${player.life===0?' defeated':''}" data-player-id="${player.id}" style="--seat-color:${player.color}"><div class="seat-top"><span class="avatar" style="--avatar:${player.color}">${esc(player.name[0])}</span><span class="seat-name"><b>${esc(player.name)}</b><small>${esc(player.title)}</small></span>${view.mode==='score'?`<span class="score-badge">${player.score} 分</span>`:''}</div><div class="life-row"><span>生命 ${player.life}/6</span>${lifePips(player.life)}</div><div class="seat-stones">${player.rack.map(value=>stone(value)).join('')||'<span class="empty-label">法术石已清空</span>'}</div><span class="secret-badge">◇ 秘密石 ${player.secrets.length}</span></article>`;
  }).join('');
}

function renderHuman(){
  const player=view.players[0];
  const active=view.phase==='casting'&&view.activeIndex===0;
  const secrets=player.secrets.length?player.secrets.map(value=>`${value} · ${SPELLS[value-1].name}`).join(' / '):'暂无秘密石';
  $('humanSeat').className=`human-seat${active?' active':''}${player.life===0?' defeated':''}`;
  $('humanSeat').dataset.playerId='0';
  $('humanSeat').innerHTML=`<div class="seat-top"><span class="avatar" style="--avatar:${player.color}">你</span><span class="human-details"><b>${esc(player.name)}</b><small>${active?'正在施法':'等待回合'}</small></span></div><div class="human-rack">${player.rack.map(()=>stone(null,{back:true})).join('')||'<span class="empty-label">法术石已清空</span>'}</div><div class="human-meta">生命 <b>${player.life}/6</b>${lifePips(player.life)}${view.mode==='score'?`<span class="human-secrets">${player.score} 分 · ${esc(secrets)}</span>`:`<span class="human-secrets">${esc(secrets)}</span>`}</div>`;
}

function renderTable(){
  $('drawCount').textContent=String(view.drawPileCount);
  $('secretCount').textContent=String(view.secretPoolCount);
  $('drawPileCount').textContent=String(view.drawPileCount);
  $('secretPileCount').textContent=String(view.secretPoolCount);
  $('removedStones').innerHTML=miniStones(view.publicRemoved);
  $('castStones').innerHTML=miniStones([...view.castStones].sort((left,right)=>left-right));
  if(!dieRolling)setDie(view.die);
  if(view.phase!=='casting'){
    $('turnGlyph').textContent='✦';
    $('turnHeadline').textContent='本轮已经结束';
    $('turnDetail').textContent=view.roundResult?.summary||'查看本轮结算';
    return;
  }
  const actor=view.players[view.activeIndex];
  if(actor.id===0){
    $('turnGlyph').textContent=view.turnCastCount?'✧':'?';
    $('turnHeadline').textContent=view.turnCastCount?'法术奏效，继续吗？':'轮到你施法';
    $('turnDetail').textContent=view.turnCastCount?`可选择 ${view.minimumSpell}–8 号，或及时收手`:'观察公开信息，猜测自己的法术石';
  }else{
    $('turnGlyph').textContent='✦';
    $('turnHeadline').textContent=`${actor.name} 正在推演`;
    $('turnDetail').textContent=`${actor.title} · 只依据公开信息行动`;
  }
}

function setDie(value){
  const die=$('die');
  const cube=$('dieCube');
  if(value===null||value===undefined){
    die.classList.add('hidden');
    die.removeAttribute('data-value');
    cube.style.transform='';
    return;
  }
  const transforms={1:'rotateX(0deg) rotateY(0deg)',2:'rotateX(0deg) rotateY(180deg)',3:'rotateX(0deg) rotateY(90deg)'};
  die.classList.remove('hidden');
  die.dataset.value=String(value);
  die.setAttribute('aria-label',`魔法骰掷出 ${value}`);
  cube.style.transform=transforms[value];
}

function cancelVisuals(){
  actionEpoch++;
  busy=false;
  dieRolling=false;
  document.body.classList.remove('action-running');
  document.querySelectorAll('.motion-stone,.failed-spell-burst,.life-change').forEach(element=>element.remove());
  document.querySelectorAll('.spell-failed,.spell-fizzle').forEach(element=>element.classList.remove('spell-failed','spell-fizzle'));
  $('dieCube')?.getAnimations().forEach(animation=>animation.cancel());
  if($('die'))setDie(null);
}

async function animateDie(value){
  if(![1,2,3].includes(value))return;
  const die=$('die');
  const cube=$('dieCube');
  dieRolling=true;
  die.classList.remove('hidden');
  die.dataset.value=String(value);
  die.setAttribute('aria-label','魔法骰正在投掷');
  if(reducedMotion.matches){
    setDie(value);
    dieRolling=false;
    await wait(INFORMATION_HOLD_MS);
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
  dieRolling=false;
  setDie(value);
  await wait(INFORMATION_HOLD_MS);
}

function elementCenter(element){
  if(!element)return null;
  const bounds=element.getBoundingClientRect();
  return {x:bounds.left+bounds.width/2,y:bounds.top+bounds.height/2};
}

function playerSeat(playerId){
  return document.querySelector(`[data-player-id="${playerId}"]`);
}

async function flyStone(source,target,{spell=null,back=false,secret=false,delay=0,hold=0}={}){
  const origin=elementCenter(source);
  const destination=elementCenter(target);
  if(!origin||!destination||reducedMotion.matches){
    if(hold)await wait(hold);
    return;
  }
  const token=document.createElement('span');
  token.className=`motion-stone${back?' back':''}${secret?' secret':''}`;
  token.innerHTML=back?'<b>?</b>':`<b>${spell}</b><small>${esc(SPELLS[spell-1]?.icon||'✧')}</small>`;
  token.style.left=`${origin.x-17}px`;
  token.style.top=`${origin.y-24.5}px`;
  document.body.append(token);
  const deltaX=destination.x-origin.x;
  const deltaY=destination.y-origin.y;
  const animation=token.animate([
    {transform:'translate3d(0,0,0) rotate(-10deg) scale(.65)',opacity:0},
    {transform:'translate3d(0,-8px,0) rotate(-6deg) scale(1)',opacity:1,offset:.18},
    {transform:`translate3d(${deltaX*.56}px,${deltaY*.46-38}px,0) rotate(-2deg) scale(1.08)`,opacity:1,offset:.64},
    {transform:`translate3d(${deltaX}px,${deltaY}px,0) rotate(8deg) scale(.82)`,opacity:1},
  ],{duration:480,delay,easing:'cubic-bezier(.2,.76,.2,1)',fill:'forwards'});
  await animation.finished.catch(()=>{});
  if(hold)await wait(hold);
  token.remove();
}

async function animateFailedCast(source,spell){
  const core=document.querySelector('.tower-core');
  const center=elementCenter(core);
  if(!source||!core||!center||reducedMotion.matches){await wait(INFORMATION_HOLD_MS);return;}
  source.classList.add('spell-failed');
  core.classList.add('spell-fizzle');
  const burst=document.createElement('span');
  burst.className='failed-spell-burst';
  burst.innerHTML=`<b>✕</b><small>${spell} 号咒语落空</small>`;
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

function animateCast(action){
  if(action.type!=='cast')return Promise.resolve();
  const source=playerSeat(action.playerId);
  if(!action.success)return animateFailedCast(source,action.spell);
  if(reducedMotion.matches)return wait(INFORMATION_HOLD_MS);
  return flyStone(source,$('castStones'),{spell:action.spell,hold:INFORMATION_HOLD_MS});
}

async function animateDraws(before,after,playerId){
  const target=playerSeat(playerId);
  const drawSource=document.querySelector('.draw-pile .pile-stone');
  const secretSource=document.querySelector('.secret-pile .pile-stone');
  const drawCount=Math.max(0,before.drawPileCount-after.drawPileCount);
  const secretCount=Math.max(0,before.secretPoolCount-after.secretPoolCount);
  const animations=[];
  if(drawCount)drawSource?.classList.add('drawing');
  if(secretCount)secretSource?.classList.add('drawing');
  for(let index=0;index<drawCount;index++)animations.push(flyStone(drawSource,target,{back:true,delay:index*90}));
  for(let index=0;index<secretCount;index++)animations.push(flyStone(secretSource,target,{back:true,secret:true,delay:index*90}));
  await Promise.all(animations);
  drawSource?.classList.remove('drawing');
  secretSource?.classList.remove('drawing');
}

async function animateLifeChanges(changes=[]){
  if(reducedMotion.matches)return;
  const animations=changes.filter(change=>change.amount!==0).map(async change=>{
    const seat=playerSeat(change.playerId);
    const center=elementCenter(seat);
    if(!seat||!center)return;
    const healing=change.amount>0;
    seat.classList.add(healing?'receiving-heal':'taking-damage');
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
    seat.classList.remove(healing?'receiving-heal':'taking-damage');
  });
  await Promise.all(animations);
}

function dragonFailureStages(action,before,after){
  if(action.type!=='cast'||action.success||action.spell!==1||!action.roll)return null;
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
    intermediate:{...before,players:before.players.map(player=>player.id===action.playerId?{...player,life:player.life-rolledDamage}:player)},
  };
}

function newlyRevealedSecret(before,after,playerId){
  if(playerId!==0)return null;
  const previousCount=before.players[0].secrets.length;
  return after.players[0].secrets.slice(previousCount).find(Number.isInteger)??null;
}

async function performAction(execute,messageForAction){
  if(!game||busy)return;
  const epoch=actionEpoch;
  const before=view;
  busy=true;
  document.body.classList.add('action-running');
  renderSpells();
  try{
    const action=execute();
    const after=game.getPublicState(0);
    if(messageForAction)toast(messageForAction(action));
    await animateCast(action);
    if(epoch!==actionEpoch||!game)return;
    if(action.roll!==null&&action.roll!==undefined)await animateDie(action.roll);
    if(epoch!==actionEpoch||!game)return;
    const dragonStages=dragonFailureStages(action,before,after);
    if(dragonStages){
      view=dragonStages.intermediate;
      render();
      await animateLifeChanges([{playerId:action.playerId,amount:-dragonStages.rolledDamage}]);
      await wait(INFORMATION_HOLD_MS);
      view=after;
      render();
      await animateLifeChanges([{playerId:action.playerId,amount:-dragonStages.normalDamage}]);
    }else{
      view=after;
      render();
      await animateLifeChanges(action.lifeChanges);
    }
    await animateDraws(before,after,action.playerId);
    const secret=newlyRevealedSecret(before,after,action.playerId);
    if(secret!==null)toast(`你获得的秘宝石是 ${secret} 号。`);
  }catch(error){
    toast(error.message);
  }finally{
    if(epoch===actionEpoch&&game){
      busy=false;
      document.body.classList.remove('action-running');
      refresh();
    }
  }
}

function renderSpells(){
  const humanTurn=view.phase==='casting'&&view.activeIndex===0&&!busy;
  const publicValues=[...view.publicRemoved,...view.castStones];
  $('castRule').textContent=view.lastSuccessfulSpell===null?'首次施法可选择任意编号':`连咏限制：只能选择 ${view.minimumSpell}–8 号`;
  $('spellList').innerHTML=SPELLS.map(spell=>{
    const illegal=spell.id<view.minimumSpell;
    const disabled=!humanTurn||illegal;
    const publicCount=publicValues.filter(value=>value===spell.id).length;
    return `<button class="spell-button${illegal?' illegal':''}" data-spell="${spell.id}" type="button" ${disabled?'disabled':''} title="${esc(spell.description)}"><span class="spell-symbol">${esc(spell.icon)}</span><span class="spell-copy"><b>${esc(spell.name)}</b><small>${esc(spell.tag)} · ${esc(spell.description)}</small></span><span class="spell-number">${spell.id}<small>公开 ${publicCount}/${spell.copies}</small></span></button>`;
  }).join('');
  document.querySelectorAll('[data-spell]').forEach(button=>button.addEventListener('click',()=>humanCast(Number(button.dataset.spell))));
  $('stopBtn').classList.toggle('hidden',!view.canStop||busy);
}

function renderEvents(){
  const events=view.events.slice(-42);
  $('eventLog').innerHTML=events.map(event=>`<div class="event ${esc(event.type)}"><time>R${event.round}.${String(event.id).padStart(2,'0')}</time><i></i><span>${event.playerId===0?'<strong>你</strong> · ':''}${esc(event.text)}</span></div>`).join('');
  $('eventLog').scrollTop=$('eventLog').scrollHeight;
}

function render(){
  $('modeEyebrow').textContent=view.mode==='score'?'SCORE ASCENT · 积分模式':'ONE ROUND DUEL · 单局模式';
  $('roundTitle').textContent=`法师塔 · 第 ${view.round} 轮`;
  $('goalLabel').textContent=view.mode==='score'?'8 分':'本轮定胜负';
  renderOpponents();
  renderTable();
  renderHuman();
  renderSpells();
  renderEvents();
}

function refresh({schedule=true}={}){
  if(!game)return;
  view=game.getPublicState(0);
  render();
  if(view.phase==='round-complete'||view.phase==='game-complete'){
    clearTimeout(botTimer);
    clearTimeout(resultTimer);
    resultTimer=setTimeout(showResult,650);
  }else if(schedule)scheduleBot();
}

async function humanCast(spell){
  if(!game||busy||view.phase!=='casting'||view.activeIndex!==0)return;
  clearTimeout(botTimer);
  const playerId=view.activeIndex;
  await performAction(()=>({type:'cast',playerId,...game.cast(spell)}),action=>action.success?`${spell} 号法术成功！`:`${spell} 号法术失败。`);
}

async function humanStop(){
  if(!game||busy||!view.canStop)return;
  const playerId=view.activeIndex;
  await performAction(()=>{game.stop();return {type:'stop',playerId};},()=> '你及时收手，并补充了法术石。');
}

function scheduleBot(){
  clearTimeout(botTimer);
  if(!game||busy||view.phase!=='casting'||view.activeIndex===0)return;
  const playerId=view.activeIndex;
  botTimer=setTimeout(async()=>{
    if(!game||busy)return;
    const current=game.getPublicState(0);
    if(current.phase!=='casting'||current.activeIndex!==playerId)return;
    await performAction(()=>game.botAction());
  },AI_THINK_DELAY);
}

async function showResult(){
  if(!game||!view.roundResult)return;
  if(view.mode==='score'){
    const round=view.round;
    const afterScores=view.players.map(player=>player.score);
    const beforeScores=afterScores.map((score,id)=>score-(view.roundResult.points[id]||0));
    await showTowerProgress({players:view.players,fromScores:beforeScores,toScores:afterScores,title:`第 ${round} 轮攀登结算`,subtitle:'本轮积分推动法师向塔顶前进'});
    if(!game||view.round!==round||!view.roundResult)return;
  }
  const finished=view.phase==='game-complete';
  const humanWon=(finished?view.gameWinnerIds:view.roundResult.winnerIds).includes(0);
  $('resultEyebrow').textContent=finished?'TRIAL COMPLETE':'ROUND COMPLETE';
  $('resultGlyph').textContent=humanWon?'✦':'◇';
  $('resultTitle').textContent=finished?(humanWon?'你完成了试炼':'试炼已有胜者'):(humanWon?'你赢得本轮':'本轮结束');
  $('resultSummary').textContent=view.roundResult.summary;
  $('scoreTable').innerHTML=view.players.map(player=>{
    if(view.mode==='score')return `<div class="score-row"><span>${esc(player.name)} · 生命 ${player.life}</span><strong>${view.roundResult.points[player.id]?`+${view.roundResult.points[player.id]}`:'—'}</strong><b>${player.score} 分</b></div>`;
    const winner=view.gameWinnerIds.includes(player.id);
    return `<div class="score-row"><span>${esc(player.name)} · 生命 ${player.life}</span><strong>${winner?'胜出':'—'}</strong><b>${player.secrets.length?'◇'.repeat(player.secrets.length):''}</b></div>`;
  }).join('');
  $('resultBtn').querySelector('span').textContent=finished?'再玩一局':'进入下一轮';
  $('resultLayer').classList.remove('hidden');
}

function resultAction(){
  if(!game)return;
  $('resultLayer').classList.add('hidden');
  if(view.phase==='round-complete'){
    game.nextRound();
    refresh();
  }else startGame();
}

function toast(message){
  clearTimeout(toastTimer);
  $('toast').textContent=message;
  $('toast').classList.add('show');
  toastTimer=setTimeout(()=>$('toast').classList.remove('show'),1900);
}

document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>chooseMode(button.dataset.mode)));
document.querySelectorAll('[data-players]').forEach(button=>button.addEventListener('click',()=>choosePlayers(Number(button.dataset.players))));
$('startBtn').addEventListener('click',startGame);
$('restartBtn').addEventListener('click',returnToLobby);
$('stopBtn').addEventListener('click',humanStop);
$('resultBtn').addEventListener('click',resultAction);
$('resultExitBtn').addEventListener('click',returnToLobby);
$('clearLogBtn').addEventListener('click',()=>$('eventLog').scrollTo({top:$('eventLog').scrollHeight,behavior:'smooth'}));
document.querySelectorAll('[data-help]').forEach(button=>button.addEventListener('click',()=>$('helpDialog').showModal()));
$('helpCloseBtn').addEventListener('click',()=>$('helpDialog').close());
$('helpDialog').addEventListener('click',event=>{if(event.target===$('helpDialog'))$('helpDialog').close();});
document.addEventListener('keydown',event=>{
  if($('helpDialog').open||!$('resultLayer').classList.contains('hidden'))return;
  if(event.key.toLowerCase()==='s'&&view?.canStop)humanStop();
  if(/^[1-8]$/.test(event.key)&&view?.activeIndex===0)humanCast(Number(event.key));
});

const directParams=new URLSearchParams(location.search);
if(['score','single'].includes(directParams.get('mode')))chooseMode(directParams.get('mode'));
if([2,3,4,5].includes(Number(directParams.get('players'))))choosePlayers(Number(directParams.get('players')));
renderLineup();
if(directParams.get('play')==='1')startGame();
