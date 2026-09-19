import {createGame,publicState,shoot,useItem,chooseAi,skipIfCuffed,itemBlockReason,stealTargets,
  resolveSteal,ITEM_DEFS,ITEM_IDS,COMPENSATION_DEFS,MAX_HP,DIFFICULTIES} from './engine.js';
import {playModeBgm,stopModeBgm,isBgmEnabled,setBgmEnabled} from './audio.js';
import {bindTutorial} from './tutorial.js';
import {showAchievements} from './achievements.js';
const $=id=>document.getElementById(id);let game=null;let busy=false;let armed=false;let arming=false;let table3d=null;let shownRound=0;
/* 扎完针才进入偷取选择：针筒已消耗，不能取消。 */
let stealing=false;
let debugShowcase=false;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
/* 3D 牌桌是渐进增强：动态加载，失败或没有 WebGL 时页面自动留在 2D 备用桌面上（届时用底部的备用控件操作）。 */
import('./three-table.js').then(({createTable3D})=>{table3d=createTable3D($('tableCanvas'));if(!table3d)return;table3d.onPick=onPick;table3d.revealHp=revealHp;table3d.onCompensationHover=showCompensationTooltip;if(game){render();table3d.playReload(publicState(game))}}).catch(error=>{console.warn('3D 牌桌无法启动',error)});
const MODES={
  practice:{id:'practice',name:'常规模式',ready:true,hint:'灯亮着的完整牌桌'},
  night:{id:'night',name:'黑夜模式',ready:true,hint:'只看得见自己这一侧'},
  challenge:{id:'challenge',name:'挑战模式',ready:true,hint:'短弹仓，换弹后可能天黑'},
};
const DIFFS={
  casual:{id:'casual',name:'休闲 AI',hint:'会乱开枪'},
  standard:{id:'standard',name:'标准 AI',hint:'会用道具'},
  expert:{id:'expert',name:'专家 AI',hint:'不看弹序的最优'},
  pro:{id:'pro',name:'职业 AI',hint:'开挂看弹序'},
};
let gameMode='practice';
let aiDifficulty='standard';
let shownLighting='day';
const charge=(n,max=game?.maxHp??MAX_HP)=>'⚡'.repeat(n)+'·'.repeat(Math.max(0,max-n));
const animateShot=r=>table3d?table3d.playShoot(r):wait(260);
/* 引擎开枪当下就算完血量；画面先冻在开火前，等枪口闪光打完再揭。 */
let displayHold=null;
const animateItem=r=>table3d?table3d.playItem(r):wait(160);
/* 事件默认只播报给读屏；用不了的道具要额外弹窗，不然点了没反应会以为卡死。 */
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
function showCompensationTooltip(info){
  const tooltip=$('compensationTooltip');
  const def=info&&COMPENSATION_DEFS[info.id];
  if(!tooltip||!def){tooltip?.classList.add('hidden');return}
  tooltip.replaceChildren();
  const title=document.createElement('b'),help=document.createElement('small');
  title.textContent=def.name;help.textContent=def.help;tooltip.append(title,help);
  tooltip.classList.remove('hidden');
  const box=tooltip.getBoundingClientRect();
  tooltip.style.left=`${Math.max(8,Math.min(info.x+14,innerWidth-box.width-8))}px`;
  tooltip.style.top=`${Math.max(8,Math.min(info.y+14,innerHeight-box.height-8))}px`;
}
const NAMES={player:'你',ai:'庄家'};
const itemPayload=r=>({
  actor:r.actor,item:r.item,revealed:r.revealed,stolen:r.stolen,primed:r.primed,
  slot:r.slot,stealSlot:r.stealSlot,from:r.stolen?'ai'===r.actor?'player':'ai':r.actor,
  ejected:r.ejected,healed:r.healed,good:r.good,delta:r.delta,position:r.position,live:r.live,
  hp:{player:game.hp.player,ai:game.hp.ai},
});
/* 自己能用的道具槽位；同种道具可能有多件，按槽位逐个判断。 */
const usableSlots=()=>game?game.items.player
  .map((id,slot)=>({id,slot}))
  .filter(({id})=>itemBlockReason(game,'player',id)===null)
  .map(({slot})=>slot):[];
const ownSlots=()=>game?game.items.player.map((_,slot)=>slot):[];
/* 偷取时高亮庄家手上合法的那几件。 */
const stealSlots=()=>{
  const legal=debugShowcase?debugStealTargets():(game?stealTargets(game,'player'):[]);
  return game?game.items.ai.map((id,slot)=>({id,slot})).filter(({id})=>legal.includes(id)).map(({slot})=>slot):[];
};
const allAiSlots=()=>game?game.items.ai.map((_,slot)=>slot):[];
const debugStealTargets=()=>stealTargets(game,'player').filter(id=>ITEM_DEFS[id]);

/* 桌面交互：点枪举枪，再点亮起的目标牌决定打谁；道具点本体直接使用。 */
function onPick(pick){
  if(busy||!game||game.over||game.turn!=='player'||game.cuffed.player)return;
  if(debugShowcase&&pick.type==='item'&&pick.side==='ai'&&COMPENSATION_DEFS[pick.id]){
    previewCompensation(pick.id,pick.slot);return;
  }
  if(stealing){
    if(pick.type!=='item'||pick.side!=='ai')return;
    const steal=game.items.ai[pick.slot];
    const legal=debugShowcase?debugStealTargets():stealTargets(game,'player');
    if(!steal||(pick.id&&steal!==pick.id)||!legal.includes(steal)){
      blockedNotice(steal||pick.id,'这件道具现在偷不了');return;
    }
    confirmSteal(steal,pick.slot);
    return;
  }
  if(pick.type==='gun'){drawGun();return}
  if(pick.type==='target'){armed=false;playerAction(()=>shoot(game,'player',pick.side));return}
  if(pick.type==='item'&&pick.side==='player'){
    const id=game.items.player[pick.slot];
    const reason=itemBlockReason(game,'player',id);
    if(reason){blockedNotice(id,reason);return}
    usePlayerItem(id,pick.slot);
  }
}

async function previewCompensation(item,slot){
  if(busy)return;
  showCompensationTooltip(null);
  busy=true;render();
  try{
    addLog(`调试陈列：${COMPENSATION_DEFS[item].name}`);
    const compensationState=publicState(game);
    if(item==='fruitKnife')compensationState.maxHp.ai=game.hp.ai;
    if(item==='boreFilm')compensationState.records.player=game.ammo.slice(0,2).map((shell,index)=>({position:index+1,live:shell.live}));
    if(table3d)await table3d.playItem({actor:'player',from:'ai',item,slot,debug:true,compensationState});
    game.items.ai.splice(slot,1);
    if(item==='lightRemote'){
      game.lighting='night';shownLighting='night';
      $('game').classList.add('night-mode');
      /* 调试陈列仍要能继续点庄家侧的其余模型，不套用黑夜的信息隐藏。 */
      if(table3d)for(const cell of table3d.itemSlots.ai)cell.hinge.visible=true;
      void playModeBgm(sceneBgm('night'),{fade:true});
      addLog('电灯遥控器：下一轮已锁定为黑夜（调试中立即展示）。');
    }else if(item==='fruitKnife'){
      game.maxHpBySide.ai=game.hp.ai;
      addLog(`折叠水果小刀：庄家生命上限已切到 ${game.hp.ai}。`);
    }else if(item==='spareFuse'){
      /* 调试陈列没有补偿后的换弹边界，直接挂到当前轮才能实测命中减伤。 */
      game.effects.fuse.player=game.round;
      addLog('备用保险丝：调试中已挂到当前弹仓；下一次枪械伤害会减少 1 点。');
    }else if(item==='boreFilm'){
      for(const shell of game.ammo.slice(0,2))game.notes.player[shell.id]=shell.live;
      addLog('透膛底片：前两发弹药顺序已写入你的私人记录。');
      if(table3d)await table3d.showBoreFilmInspection({state:publicState(game),actor:'player',duration:2600});
    }else if(item==='reverseCoin'){
      game.turn='player';
      addLog('反面硬币：行动灯已从庄家转回你；下一轮由弱势方先手。');
    }else if(item==='powerStrip'){
      game.randomDeath=true;game.hp={player:2,ai:2};game.maxHp=2;
      game.maxHpBySide={player:2,ai:2};game.items={player:[],ai:[]};
      game.ammo=[];
      game.cuffed={player:false,ai:false};game.cuffLock={player:false,ai:false};
      game.saw={player:false,ai:false};game.notes={player:{},ai:{}};
      game.effects={fuse:{player:null,ai:null},forceNextLighting:null,filmPending:{player:false,ai:false}};
      if(table3d)await table3d.setRandomDeathMode(true);
      showNotice('插电板已拔掉：双方重置为 2 条命，原弹仓停用；此后每一枪独立进行 50% 实弹、50% 空弹判定。','进入随机死亡模式');
    }
  }catch(error){console.warn(error);addLog('补偿道具预览中断')}
  finally{busy=false;render()}
}

async function drawGun(){
  if(busy||armed||arming)return;
  arming=true;busy=true;render();
  try{
    if(table3d)await table3d.drawGun('player');
    armed=true;
  }finally{
    arming=false;busy=false;render();
  }
}

async function holsterThen(fn){
  if(armed||table3d?.gunDrawn){
    armed=false;busy=true;render();
    try{if(table3d)await table3d.holsterGun('player')}
    finally{busy=false}
  }
  return fn();
}

function usePlayerItem(id,slot){
  const go=()=>playerAction(()=>useItem(game,'player',id,{slot}));
  if(armed||table3d?.gunDrawn)holsterThen(go);
  else go();
}

function banner(s){
  if(debugShowcase&&!s.over)return '调试陈列 · 点击桌面上的任意道具查看动画';
  if(s.over)return s.winner==='player'?'对局结束 · 你获胜':'对局结束 · 庄家获胜';
  if(s.turn!=='player')return '庄家正在判断';
  if(s.cuffed.player)return '你被手铐束缚 · 本回合跳过';
  if(stealing)return '肾上腺素 · 点击庄家桌上要偷的道具';
  if(arming)return '正在举枪';
  if(armed)return '已举枪 · 点击桌上的身份铭牌';
  return '轮到你 · 点击桌上的枪，或点道具使用';
}

function phoneNotes(s){
  return (s.records.player||[])
    .map(entry=>`第 ${entry.position} 发是${entry.live?'实弹':'空弹'}`)
    .join('\n');
}

function hint(s){
  if(s.hp.player===1&&game.items.player.includes('expiredMedicine'))return '过期药物：失败会失去最后 1 点生命';
  return '';
}

function snapshotHold(){return {hp:{player:game.hp.player,ai:game.hp.ai},turn:game.turn}}
function revealHp(side,charges){
  if(displayHold)displayHold={...displayHold,hp:{...displayHold.hp,[side]:charges}};
  const el=side==='ai'?$('aiHp'):$('youHp');
  el.textContent=charge(charges,game.maxHp);
  el.classList.remove('hp-drop');
  void el.offsetWidth;
  el.classList.add('hp-drop');
}
async function playShotResult(r,hold){
  displayHold={hp:{...hold.hp},turn:hold.turn};
  render();
  logShot(r);
  await animateShot({...r,hpAfter:{player:game.hp.player,ai:game.hp.ai}});
  displayHold=null;
  if(table3d)await table3d.flipShellDown(r.live);
}

function render(){
  if(!game)return;
  const raw=publicState(game);
  const s=displayHold?{...raw,hp:{...displayHold.hp},over:false,winner:null,turn:displayHold.turn}:raw;
  const active=!busy&&!s.over&&s.turn==='player'&&!s.cuffed.player;
  $('turnBanner').textContent=banner(s);
  $('round').textContent=`第 ${s.round} 轮`;
  $('aiHp').textContent=charge(s.hp.ai,s.maxHp);$('youHp').textContent=charge(s.hp.player,s.maxHp);
  const def=id=>ITEM_DEFS[id]||COMPENSATION_DEFS[id]||{name:id,help:'调试道具'};
  const names=list=>list.map(id=>def(id).name).join('、')||'无';
  $('aiInfo').textContent=`手铐：${s.cuffed.ai?'束缚中':'无'} · 道具 ${s.items.ai.length}/${s.capacity}：${names(s.items.ai)}`;
  $('youInfo').textContent=`手铐：${s.cuffed.player?'束缚中':'无'}${s.saw.player?' · 锯子已装上':''} · 道具 ${s.items.player.length}/${s.capacity}`;
  $('ammoCount').textContent=s.ammoCount==null?'':`${s.ammoCount} 发`;
  $('ammoMix').textContent=s.ammoCount==null?'':`实弹 ${s.liveCount} · 空弹 ${s.ammoCount-s.liveCount}`;
  const notes=phoneNotes(s);
  $('phoneNotes').textContent=notes;
  $('phoneNotes').classList.toggle('on',!!notes);
  $('itemHint').textContent=hint(s);
  $('game').classList.toggle('has-clues',!!(notes||hint(s)));
  $('game').classList.toggle('stealing',stealing);
  $('game').classList.toggle('random-death-mode',!!s.randomDeath);
  $('shootEnemy').disabled=!active||stealing;$('shootSelf').disabled=!active||stealing;
  const slots=stealing?stealSlots():usableSlots();
  const owner=stealing?'ai':'player';
  $('items').innerHTML=s.items[owner].map((id,slot)=>{
    const reason=stealing?(slots.includes(slot)?null:'现在偷不了这件'):itemBlockReason(game,'player',id);
    return `<button class="item${reason?' blocked':''}" data-slot="${slot}" ${!active?'disabled':''} title="${reason||ITEM_DEFS[id].help}"><b>${ITEM_DEFS[id].name}</b><small>${reason||ITEM_DEFS[id].help}</small></button>`;
  }).join('');
  table3d?.sync(s);
  table3d?.setPickable({
    gun:active&&!armed&&!stealing,
    items:{side:stealing?'ai':'player',slots:active?(stealing?stealSlots():usableSlots()):[],
      pick:active?(stealing?allAiSlots():ownSlots()):[]},
    targets:active&&armed&&!stealing,
    debugItems:debugShowcase&&active&&!stealing,
  });
}

/* 每次行动后同步画面；跨轮时把新弹和新道具从格子里翻上来。双方空手补货只翻道具格，别把弹仓重装一遍。 */
async function presentRefill(r){
  if(!r?.itemRefill||game.over||!table3d)return;
  if(game.round!==shownRound)return;
  await Promise.race([table3d.playReload(publicState(game),{shells:false}),wait(4000)]);
}
async function settle(){
  render();
  if(game.round!==shownRound){
    shownRound=game.round;
    if(!game.over){
      await Promise.race([presentLighting(),wait(4500)]);
      if(table3d)await Promise.race([table3d.playReload(publicState(game)),wait(5000)]);
    }
  }
}

function sceneBgm(lighting){return lighting==='night'?'night':'practice'}
function thinkMs(id){
  const [min,max]=DIFFICULTIES[id]?.think||[700,1100];
  return min+Math.random()*Math.max(0,max-min);
}

async function presentLighting(){
  const next=game.lighting||(gameMode==='night'?'night':'day');
  const prev=shownLighting;
  shownLighting=next;
  $('game').classList.toggle('night-mode',next==='night');
  if(gameMode!=='challenge'||prev===next){
    table3d?.setNightMode(next==='night');
    return;
  }
  stealing=false;
  if(table3d)await table3d.clearStealFocus();
  if(next==='night'){
    addLog('灯光熄灭。');
    if(table3d)await table3d.dumpItems(['adrenaline']);
  }else addLog('天亮了。');
  /* 换曲不能挡住换灯：第二晚 wav 若 play() 挂住，对局会整段锁死。 */
  void playModeBgm(sceneBgm(next),{fade:true});
  if(table3d)await table3d.transitionLighting(next==='night');
}

function logShot(r){const actor=NAMES[r.actor],target=r.target===r.actor?'自己':NAMES[r.target];if(r.live){addLog(`${actor}对${target}打出实弹，${NAMES[r.target]}受到 ${r.damage} 点伤害`)}else{addLog(`${actor}对${target}打出空弹，${r.target===r.actor?`${actor}继续行动`:`行动权交给${NAMES[r.actor==='player'?'ai':'player']}`}`)}}

async function playSkip(actor){
  if(table3d)await table3d.releaseCuffs(actor);
  skipIfCuffed(game);
}

/* 推进所有非玩家操作的状态：庄家行动，以及玩家被手铐束缚时的跳过。手铐会让对手连打两轮，所以这里不设步数上限，只靠“每步都会消耗弹药、道具或解除手铐”来收敛。 */
async function advance(){
  while(!game.over&&(game.turn==='ai'||game.cuffed.player)){
    if(game.turn==='player'){await playSkip('player');render();continue;}
    await wait(thinkMs(aiDifficulty));
    const hold=snapshotHold();
    let r=chooseAi(game,aiDifficulty);
    if(r?.skip){if(table3d)await table3d.releaseCuffs('ai')}
    else if(r?.item){
      await animateItem({...itemPayload({...r,actor:'ai'}),from:r.stolen?'player':'ai'});
      await presentRefill(r);
    }
    else if(r?.live!==undefined){await playShotResult(r,hold)}
    else if(game.ammo.length){/* 决策异常时强制射击，行动权不能停在庄家。 */r=shoot(game,'ai','player');await playShotResult(r,hold)}
    await settle();
    await showAchievements(r?.achievements,{player:'你',ai:'庄家'});
  }
  if(game.over)end();
}

async function confirmSteal(steal,slot=null){
  if(busy||!game||game.over)return;
  busy=true;
  const r=resolveSteal(game,'player',steal,{slot});
  if(r.error){showNotice(r.error,'这件道具现在偷不了');busy=false;render();return}
  stealing=false;
  try{
    if(table3d)await table3d.clearStealFocus();
    await animateItem({...itemPayload({...r,actor:'player'}),from:'ai'});
    render();
    await presentRefill(r);
    await settle();
    await showAchievements(r.achievements,{player:'你',ai:'庄家'});
    await advance();
  }catch(error){console.warn(error);addLog('动作中断')}
  finally{busy=false;render()}
}

async function playerAction(fn){
  if(busy||!game||game.over)return;
  busy=true;armed=false;
  const hold=snapshotHold();
  const r=fn();
  if(r.error){showNotice(r.error);busy=false;render();return}
  try{
    /* 道具动画必须跑在 render 之前：render 会按新状态重排桌上的道具，先重排就找不到刚用掉的那一个了。 */
    if(r.item){
      await animateItem({...itemPayload({...r,actor:'player'}),from:r.stolen?'ai':'player'});
      if(r.primed&&!r.stolen){
        stealing=true;
        render();
        if(table3d)await table3d.focusStealItems();
        return;
      }
    }
    stealing=false;
    if(r.live!==undefined&&!r.item)await playShotResult(r,hold);
    else render();
    await presentRefill(r);
    await settle();
    await showAchievements(r.achievements,{player:'你',ai:'庄家'});
    await advance();
  }catch(error){console.warn(error);addLog('动作中断')}
  finally{busy=false;render()}
}

function setModeMenu(open){
  $('modeMenu').classList.toggle('hidden',!open);
  $('modeBtn').setAttribute('aria-expanded',open?'true':'false');
  if(open)setDiffMenu(false);
}
function setDiffMenu(open){
  $('diffMenu').classList.toggle('hidden',!open);
  $('diffBtn').setAttribute('aria-expanded',open?'true':'false');
  if(open)setModeMenu(false);
}
function syncModeUi(){
  const mode=MODES[gameMode];
  $('modeLabel').textContent=mode.name;
  for(const button of $('modeMenu').querySelectorAll('[data-mode]')){
    button.setAttribute('aria-selected',button.dataset.mode===gameMode?'true':'false');
  }
}
function syncDiffUi(){
  const diff=DIFFS[aiDifficulty]||DIFFS.standard;
  $('diffLabel').textContent=diff.name;
  for(const button of $('diffMenu').querySelectorAll('[data-diff]')){
    button.setAttribute('aria-selected',button.dataset.diff===aiDifficulty?'true':'false');
  }
}
function pickMode(id){
  if(!MODES[id])return;
  gameMode=id;
  syncModeUi();
  setModeMenu(false);
}
function pickDiff(id){
  if(!DIFFS[id])return;
  aiDifficulty=id;
  syncDiffUi();
  setDiffMenu(false);
}
function syncBgmBtn(){
  const on=isBgmEnabled();
  $('bgmBtn').setAttribute('aria-pressed',on?'true':'false');
  $('bgmBtn').textContent=on?'背景音乐':'背景音乐 · 关';
}
function end(){$('result').classList.remove('hidden');$('result').innerHTML=`<div class="result-box"><h2>${game.winner==='player'?'你赢了':'你输了'}</h2><p>你完成了 ${game.round} 轮，剩余生命 ${game.hp.player} · 庄家 ${game.hp.ai}。${game.winner==='player'?'你的判断和道具管理更胜一筹。':'庄家在关键回合抓住了机会。'}</p><button id="again" class="primary">再来一局</button> <a href="/" class="button">回到大厅</a></div>`;$('again').onclick=()=>start(debugShowcase)}
async function start(debug=false){
  const mode=MODES[gameMode]||MODES.practice;
  if(!mode.ready){
    showNotice(`${mode.name}尚未开放，先用常规模式。`,'模式未开放');
    return;
  }
  $('result').classList.add('hidden');$('lobbyView').classList.add('hidden');$('game').classList.remove('hidden');
  game=createGame({
    mode:mode.id,
    aiDifficulty,
    bannedItems:mode.id==='night'?['adrenaline']:[],
  });
  debugShowcase=!!debug;
  if(debugShowcase){
    /* 调试陈列固定使用白天，避免黑夜规则把庄家侧的补偿模型隐藏。 */
    game.lighting='day';
    game.maxHp=6;game.maxHpBySide={player:6,ai:6};game.hp={player:5,ai:4};game.turn='player';
    game.randomDeath=false;
    game.effects={fuse:{player:null,ai:null},forceNextLighting:null,filmPending:{player:false,ai:false}};
    game.items.player=[...ITEM_IDS];
    game.items.ai=[...Object.keys(COMPENSATION_DEFS),'cigarette'];
  }
  /* ?kit=1 把当前模式能用的道具一次摆满，方便对照参考图检查模型，不影响正常开局。 */
  if(!debugShowcase&&new URLSearchParams(location.search).has('kit')){
    const kit=game.itemPool?.length?game.itemPool:ITEM_IDS;
    game.items.player=[...kit];
    game.items.ai=[...kit];
  }
  shownLighting=game.lighting||(mode.id==='night'?'night':'day');
  $('game').classList.toggle('night-mode',shownLighting==='night');
  shownRound=game.round;busy=true;armed=false;arming=false;stealing=false;displayHold=null;hideNotice();
  addLog(debugShowcase?'调试陈列已展开。点击桌上的任意道具查看交互。':'装填完成。实弹与空弹的顺序未知。');
  table3d?.setNightMode(shownLighting==='night');
  void playModeBgm(sceneBgm(shownLighting));
  table3d?.resetLayout();render();
  if(table3d)await table3d.playReload(publicState(game));
  busy=false;render()}
window.__buckshot={get game(){return game},get table3d(){return table3d},get mode(){return gameMode},get debug(){return debugShowcase}};

bindTutorial();
$('start').onclick=()=>start(false);$('restart').onclick=()=>start(debugShowcase);$('debugShowcase').onclick=()=>start(true);
$('bgmBtn').onclick=()=>{setBgmEnabled(!isBgmEnabled());syncBgmBtn()};
$('modeBtn').onclick=e=>{e.stopPropagation();setModeMenu($('modeMenu').classList.contains('hidden'))};
$('modeMenu').onclick=e=>{
  e.stopPropagation();
  const button=e.target.closest('[data-mode]');
  if(button)pickMode(button.dataset.mode);
};
$('diffBtn').onclick=e=>{e.stopPropagation();setDiffMenu($('diffMenu').classList.contains('hidden'))};
$('diffMenu').onclick=e=>{
  e.stopPropagation();
  const button=e.target.closest('[data-diff]');
  if(button)pickDiff(button.dataset.diff);
};
document.addEventListener('click',()=>{setModeMenu(false);setDiffMenu(false)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){setModeMenu(false);setDiffMenu(false)}});
$('shootEnemy').onclick=()=>playerAction(()=>shoot(game,'player','ai'));
$('shootSelf').onclick=()=>playerAction(()=>shoot(game,'player','player'));
$('items').onclick=e=>{
  if(!game||busy)return;
  const button=e.target.closest('[data-slot]');
  if(!button)return;
  const slot=Number(button.dataset.slot);
  if(stealing){
    const steal=game.items.ai[slot];
    const legal=debugShowcase?debugStealTargets():stealTargets(game,'player');
    if(!legal.includes(steal)){blockedNotice(steal,'这件道具现在偷不了');return}
    confirmSteal(steal,slot);
    return;
  }
  const id=game.items.player[slot];
  const reason=itemBlockReason(game,'player',id);
  if(reason){blockedNotice(id,reason);return}
  usePlayerItem(id,slot);
};
$('noticeOk').onclick=hideNotice;
$('notice').onclick=e=>{if(e.target.id==='notice')hideNotice()};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('notice').classList.contains('hidden'))hideNotice()});
window.addEventListener('pagehide',stopModeBgm);
render();
