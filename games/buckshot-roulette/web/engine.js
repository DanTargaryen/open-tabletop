/* 规则依据 _ref/docs/buckshot-roulette-items.md：八种道具、每人最多 8 件、道具不交出行动权。 */
export const ITEM_DEFS={
  magnifier:{name:'放大镜',help:'私下查看当前弹药'},
  cigarette:{name:'香烟',help:'恢复 1 点生命'},
  beer:{name:'啤酒',help:'退出当前弹药'},
  cuffs:{name:'手铐',help:'跳过对手下一个回合'},
  saw:{name:'锯子',help:'下一发实弹伤害变 2'},
  adrenaline:{name:'肾上腺素',help:'偷取并立即使用对手的一件道具'},
  expiredMedicine:{name:'过期药物',help:'一半概率回 2 血，一半扣 1 血'},
  burnerPhone:{name:'一次性手机',help:'私下得知一颗后续弹药'},
};
export const ITEM_IDS=Object.keys(ITEM_DEFS);
export const DIFFICULTIES={
  /* 全部本地算法，不接模型、不需要 API Key。 */
  casual:{label:'休闲',noise:.55,think:[450,850],itemBias:.32,info:'coarse',optimal:false,omniscient:false},
  standard:{label:'标准',noise:.16,think:[700,1150],itemBias:.85,info:'ratio',optimal:false,omniscient:false},
  expert:{label:'专家',noise:0,think:[1100,1600],itemBias:1,info:'ratio',optimal:true,omniscient:false},
  pro:{label:'职业',noise:0,think:[520,900],itemBias:1,info:'ratio',optimal:true,omniscient:true},
};
export const MIN_HP=2,MAX_HP=6,CHALLENGE_MIN_HP=6,CHALLENGE_MAX_HP=10,ITEM_CAP=8,START_ITEMS=2;
const cap=g=>g.maxHp??MAX_HP;
const hpRange=g=>g.mode==='challenge'?[CHALLENGE_MIN_HP,CHALLENGE_MAX_HP]:[MIN_HP,MAX_HP];
const rollHp=g=>{const [lo,hi]=hpRange(g);return lo+Math.floor(g.rng()*(hi-lo+1));};
const SIDES=['player','ai'];
const clone=o=>JSON.parse(JSON.stringify(o));
export const opponent=side=>side==='player'?'ai':'player';

export function rngShuffle(list,rng=Math.random){
  const a=[...list];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}

/* 弹药带实例 ID：手机记的是“哪一颗”，前面的弹药被打掉后位置会前移，靠 ID 才不会串。 */
const makeAmmo=(flags,g)=>flags.map(live=>({id:g.nextAmmoId++,live}));
const forget=(g,id)=>{for(const side of SIDES)delete g.notes[side][id];};
/* 某一方是否已知第 index 发的类型。 */
const noteAt=(g,side,index)=>{
  const shell=g.ammo[index];
  return shell&&shell.id in g.notes[side]?g.notes[side][shell.id]:null;
};
/* 手机只挑“第 2 发及以后、且自己还不知道”的弹药。 */
const phoneTargets=(g,side)=>g.ammo.map((shell,index)=>index).filter(index=>index>=1&&noteAt(g,side,index)===null);

export function createGame({rng=Math.random,bannedItems=[],mode='practice',first='player'}={}){
  const lighting=mode==='night'?'night':'day';
  const g={round:1,turn:first==='ai'?'ai':'player',hp:{player:0,ai:0},maxHp:MAX_HP,
    cuffed:{player:false,ai:false},
    /* 同一段连续行动里只能成功上一次铐，避免无限锁对手。 */
    cuffLock:{player:false,ai:false},
    saw:{player:false,ai:false},notes:{player:{},ai:{}},
    adrenalineArmed:{player:false,ai:false},
    items:{player:[],ai:[]},ammo:[],spent:[],over:false,winner:null,nextAmmoId:1,rng,
    mode,lighting,bannedItems:[...bannedItems],itemPool:ITEM_IDS.slice()};
  syncItemPool(g);
  for(const side of SIDES)g.items[side]=drawItems(g,START_ITEMS);
  loadRound(g);
  /* 弹药洗完再掷生命，避免改血量范围时把弹仓测试的随机序列带偏。 */
  const maxHp=rollHp(g);
  g.maxHp=maxHp;
  g.hp={player:maxHp,ai:maxHp};
  return g;
}

const drawItems=(g,count)=>{
  const pool=g.itemPool?.length?g.itemPool:ITEM_IDS;
  return Array.from({length:count},()=>pool[Math.floor(g.rng()*pool.length)]);
};

function syncItemPool(g){
  const banned=new Set(g.bannedItems||[]);
  if(g.lighting==='night')banned.add('adrenaline');
  g.itemPool=ITEM_IDS.filter(id=>!banned.has(id));
  if(!g.itemPool.length)g.itemPool=ITEM_IDS.slice();
}

function discardAdrenaline(g){
  for(const side of SIDES)g.items[side]=g.items[side].filter(id=>id!=='adrenaline');
  g.adrenalineArmed={player:false,ai:false};
}

/* 装填补货：先定一个 1～3 的批次数量，双方共用，各自按空位截断。 */
function refillItems(g){
  const batch=1+Math.floor(g.rng()*3);
  for(const side of SIDES){
    const room=Math.max(0,Math.min(batch,ITEM_CAP-g.items[side].length));
    g.items[side].push(...drawItems(g,room));
  }
}
function refillIfEmpty(g){
  if(g.over||g.items.player.length||g.items.ai.length)return false;
  refillItems(g);
  return true;
}

export function loadRound(g){
  if(g.round>1&&g.mode==='challenge'){
    g.lighting=g.rng()<.6?'day':'night';
    syncItemPool(g);
    if(g.lighting==='night')discardAdrenaline(g);
  }
  const n=g.mode==='challenge'?2+Math.floor(g.rng()*3):2+Math.floor(g.rng()*7);
  const live=1+Math.floor(g.rng()*(n-1));
  g.ammo=makeAmmo(rngShuffle([...Array(live).fill(true),...Array(n-live).fill(false)],g.rng),g);
  /* 换弹仓：旧的弹药记录和锯短状态一律作废，手铐束缚保留。 */
  g.notes={player:{},ai:{}};
  g.saw={player:false,ai:false};
  if(g.round>1)refillItems(g);
  return g;
}

/* 自己的弹药记录：位置是从 1 开始的“第几发”，会随着弹药消耗自动前移。 */
const records=(g,side)=>g.ammo
  .map((shell,index)=>({position:index+1,live:g.notes[side][shell.id]}))
  .filter(entry=>entry.live!==undefined);

export function publicState(g){
  return {round:g.round,turn:g.turn,hp:clone(g.hp),cuffed:clone(g.cuffed),cuffLock:clone(g.cuffLock),
    saw:clone(g.saw),
    /* known 只是记录里“第 1 发”那一条的快捷方式，保留给界面用。 */
    known:{player:noteAt(g,'player',0),ai:noteAt(g,'ai',0)},
    records:{player:records(g,'player'),ai:records(g,'ai')},
    /* 道具是公开信息：双方摆在桌上，谁都看得见。只有弹药顺序和私有记录是暗的。 */
    items:{player:[...g.items.player],ai:[...g.items.ai],aiCount:g.items.ai.length},
    maxHp:g.maxHp,capacity:ITEM_CAP,ammoCount:g.ammo.length,liveCount:g.ammo.filter(shell=>shell.live).length,
    spent:[...g.spent],over:g.over,winner:g.winner,mode:g.mode,lighting:g.lighting};
}

/* 交出行动权。对手真正拿到一个能操作的回合后，自己的上铐限制才解除。 */
function handTurn(g,next){
  g.turn=next;
  if(!g.cuffed[next])g.cuffLock[opponent(next)]=false;
}

function finish(g){
  if(g.hp.player<=0||g.hp.ai<=0){g.over=true;g.winner=g.hp.player>0?'player':'ai';}
  if(!g.over&&!g.ammo.length){g.round++;loadRound(g);}
}

export function shoot(g,actor,target){
  if(g.over||g.turn!==actor||!g.ammo.length)return {error:'当前不能射击'};
  const shell=g.ammo.shift();
  forget(g,shell.id);
  const damage=shell.live?(g.saw[actor]?2:1):0;
  g.saw[actor]=false;
  if(damage)g.hp[target]=Math.max(0,g.hp[target]-damage);
  g.spent.push(shell.live?'实弹':'空弹');
  /* 只有对自己打空弹才能留住行动权。 */
  if(shell.live||target!==actor)handTurn(g,opponent(actor));
  finish(g);
  return {live:shell.live,damage,target,actor};
}

/* 能不能用这件道具。返回 null 表示可用，否则是给玩家看的原因。界面、引擎和 AI 共用这一份判断。 */
export function itemBlockReason(g,actor,item){
  if(g.over||g.turn!==actor)return '现在不能使用道具';
  const other=opponent(actor);
  if(item==='cigarette'||item==='expiredMedicine')return g.hp[actor]>=cap(g)?'生命值已满':null;
  if(item==='beer')return g.ammo.length?null:'弹仓为空';
  if(item==='magnifier'){
    if(!g.ammo.length)return '弹仓为空';
    return noteAt(g,actor,0)===null?null:'已知当前弹药';
  }
  if(item==='cuffs'){
    if(g.cuffed[other])return '对手已经被手铐束缚';
    return g.cuffLock[actor]?'本段行动已经用过手铐':null;
  }
  if(item==='saw')return g.saw[actor]?'枪管已经锯短':null;
  if(item==='burnerPhone'){
    if(g.ammo.length<2)return '后续弹药不足';
    return phoneTargets(g,actor).length?null:'后续弹药均已知';
  }
  if(item==='adrenaline'){
    if(g.lighting==='night'||(g.itemPool&&!g.itemPool.includes('adrenaline')))return '黑夜没有肾上腺素';
    return stealTargets(g,actor).length?null:'对手没有可偷的道具';
  }
  return null;
}

/* 肾上腺素能偷的目标：对手手上、不是肾上腺素、且此刻对自己有效的道具。 */
export function stealTargets(g,actor){
  const other=opponent(actor);
  return [...new Set(g.items[other])].filter(item=>item!=='adrenaline'&&itemBlockReason(g,actor,item)===null);
}

/* 只结算效果，不管消耗与合法性：肾上腺素偷来的道具也走这里。 */
function applyItem(g,actor,item){
  const other=opponent(actor);
  if(item==='magnifier'){const shell=g.ammo[0];g.notes[actor][shell.id]=shell.live;return {revealed:shell.live};}
  if(item==='cigarette'){const before=g.hp[actor];g.hp[actor]=Math.min(cap(g),before+1);return {healed:g.hp[actor]-before};}
  if(item==='beer'){
    const shell=g.ammo.shift();
    forget(g,shell.id);
    g.spent.push(shell.live?'退出实弹':'退出空弹');
    return {ejected:shell.live};
  }
  if(item==='cuffs'){g.cuffed[other]=true;g.cuffLock[actor]=true;return {};}
  if(item==='saw'){g.saw[actor]=true;return {};}
  if(item==='expiredMedicine'){
    const good=g.rng()<.5;
    const before=g.hp[actor];
    g.hp[actor]=good?Math.min(cap(g),before+2):Math.max(0,before-1);
    return {good,delta:g.hp[actor]-before};
  }
  if(item==='burnerPhone'){
    const pool=phoneTargets(g,actor);
    const index=pool[Math.floor(g.rng()*pool.length)];
    const shell=g.ammo[index];
    g.notes[actor][shell.id]=shell.live;
    return {position:index+1,live:shell.live};
  }
  return {};
}

function primeAdrenaline(g,actor,index){
  g.items[actor].splice(index,1);
  g.adrenalineArmed[actor]=true;
  finish(g);
  return {item:'adrenaline',slot:index,primed:true};
}

function stealSlotOf(g,victim,steal,slot){
  if(Number.isInteger(slot))return g.items[victim][slot]===steal?slot:-1;
  return g.items[victim].indexOf(steal);
}

/* 针已经扎过：只结算偷来的那一件。非法目标不消耗对方道具，继续停在选目标。 */
export function resolveSteal(g,actor,steal,{slot=null}={}){
  if(g.over||g.turn!==actor)return {error:'当前不能使用道具'};
  if(!g.adrenalineArmed[actor])return {error:'当前不能使用道具'};
  if(!steal||!stealTargets(g,actor).includes(steal))return {error:'这件道具现在偷不了'};
  const victim=opponent(actor);
  const stealSlot=stealSlotOf(g,victim,steal,slot);
  if(stealSlot<0)return {error:'这件道具现在偷不了'};
  g.items[victim].splice(stealSlot,1);
  g.adrenalineArmed[actor]=false;
  const effect=applyItem(g,actor,steal);
  finish(g);
  return {item:'adrenaline',stolen:steal,stealSlot,...effect,itemRefill:refillIfEmpty(g)};
}

export function useItem(g,actor,item,{steal=null,slot=null,stealSlot=null}={}){
  if(g.over||g.turn!==actor)return {error:'当前不能使用道具'};
  const index=Number.isInteger(slot)?slot:g.items[actor].indexOf(item);
  if(index<0||g.items[actor][index]!==item)return {error:'没有这个道具'};
  const blocked=itemBlockReason(g,actor,item);
  if(blocked)return {error:blocked};
  if(item==='adrenaline'){
    /* 先扎再选：不带目标就只消耗针筒。带目标时给 AI 一次结算完。 */
    if(!steal)return primeAdrenaline(g,actor,index);
    if(!stealTargets(g,actor).includes(steal))return {error:'这件道具现在偷不了'};
    const primed=primeAdrenaline(g,actor,index);
    return {slot:primed.slot,primed:true,...resolveSteal(g,actor,steal,{slot:stealSlot})};
  }
  g.items[actor].splice(index,1);
  const effect=applyItem(g,actor,item);
  /* 道具不结束回合；当前玩家可以继续使用道具或射击。 */
  finish(g);
  return {item,slot:index,...effect,itemRefill:refillIfEmpty(g)};
}

export function skipIfCuffed(g){
  if(g.over||!g.cuffed[g.turn])return null;
  const actor=g.turn;
  g.cuffed[actor]=false;
  handTurn(g,opponent(actor));
  return {skip:true,actor};
}

export const sideOfSeat=seat=>seat===0?'player':'ai';

export function freezeGame(g){
  const copy=clone(g);
  delete copy.rng;
  return copy;
}

export function thawGame(data,rng=Math.random){
  const g=clone(data);
  g.rng=rng;
  return g;
}

/* 联机投影：观看者永远坐在近侧 player。对手的弹药记录、弹序和 RNG 一律不发。 */
export function viewState(g,side='player'){
  const mine=side,theirs=opponent(side);
  const map=value=>value===mine?'player':value===theirs?'ai':value;
  return {
    round:g.round,turn:map(g.turn),
    hp:{player:g.hp[mine],ai:g.hp[theirs]},
    cuffed:{player:g.cuffed[mine],ai:g.cuffed[theirs]},
    cuffLock:{player:g.cuffLock[mine],ai:g.cuffLock[theirs]},
    saw:{player:g.saw[mine],ai:g.saw[theirs]},
    known:{player:noteAt(g,mine,0),ai:null},
    records:{player:records(g,mine),ai:[]},
    items:{player:[...g.items[mine]],ai:[...g.items[theirs]],aiCount:g.items[theirs].length},
    itemReasons:g.items[mine].map(id=>itemBlockReason(g,mine,id)),
    maxHp:g.maxHp,capacity:ITEM_CAP,ammoCount:g.ammo.length,
    liveCount:g.ammo.filter(shell=>shell.live).length,
    spent:[...g.spent],over:g.over,winner:map(g.winner),
    mode:g.mode||'practice',lighting:g.lighting||'day',
    names:{player:g.names?.[mine]||'你',ai:g.names?.[theirs]||'对手'},
    stealing:!!g.adrenalineArmed[mine],
    stealOptions:stealTargets(g,mine),
  };
}

export function eventForViewer(event,side){
  if(!event)return null;
  const map=value=>value===side?'player':value===opponent(side)?'ai':value;
  const out={...event,actor:map(event.actor),target:event.target!==undefined?map(event.target):event.target,
    from:event.from!==undefined?map(event.from):event.from};
  if(event.actor!==side&&(event.item==='magnifier'||event.item==='burnerPhone')){
    delete out.revealed;delete out.position;delete out.live;
  }
  if(event.followUp)out.followUp=eventForViewer(event.followUp,side);
  return out;
}

export function applyOnlineAction(g,actor,action){
  if(!action||typeof action!=='object')throw Error('行动无效');
  if(g.over)throw Error('对局已经结束');
  if(g.turn!==actor)throw Error('还没轮到你。');
  if(g.cuffed[actor])throw Error('你被手铐束缚，本回合跳过');
  if(g.adrenalineArmed[actor]&&action.type!=='steal')throw Error('先选择要偷的道具');
  if(action.type==='shoot'){
    if(action.target!=='self'&&action.target!=='opponent')throw Error('射击目标无效');
    const r=shoot(g,actor,action.target==='self'?actor:opponent(actor));
    if(r.error)throw Error(r.error);
    return {kind:'shoot',...r};
  }
  if(action.type==='use'){
    if(typeof action.item!=='string')throw Error('行动无效');
    const r=useItem(g,actor,action.item,{slot:action.slot,steal:action.steal||null});
    if(r.error)throw Error(r.error);
    return {kind:'item',actor,...r};
  }
  if(action.type==='steal'){
    const steal=action.item||action.steal;
    const r=resolveSteal(g,actor,steal,{slot:Number.isInteger(action.slot)?action.slot:null});
    if(r.error)throw Error(r.error);
    return {kind:'item',actor,item:'adrenaline',stolen:steal,from:opponent(actor),...r};
  }
  throw Error('行动无效');
}

export function timeoutAct(g){
  const actor=g.turn;
  if(g.over)return {kind:'timeout',actor};
  if(g.cuffed[actor])return {kind:'skip',...skipIfCuffed(g)};
  if(g.adrenalineArmed[actor])g.adrenalineArmed[actor]=false;
  if(!g.ammo.length){finish(g);return {kind:'timeout',actor};}
  return {kind:'timeout',...shoot(g,actor,opponent(actor))};
}

/* AI 全是本地规则：休闲/标准靠启发式；专家在合法视野里逐步最优；职业开挂看真实弹序。 */
function remainingLive(g){return g.ammo.filter(shell=>shell.live).length}

function nextKnown(g,omniscient){
  if(!g.ammo.length)return null;
  if(omniscient)return g.ammo[0].live;
  const noted=noteAt(g,'ai',0);
  if(noted!==null)return noted;
  const live=remainingLive(g),n=g.ammo.length;
  if(!live)return false;
  if(live===n)return true;
  return null;
}

function nextProb(g,{omniscient=false,coarse=false}={}){
  const known=nextKnown(g,omniscient);
  if(known!==null)return known?1:0;
  const n=g.ammo.length||1;
  let p=remainingLive(g)/n;
  if(coarse){
    if(p<.34)p=.2;
    else if(p>.66)p=.8;
    else p=.5;
  }
  return p;
}

function usableItem(g,item){return g.items.ai.includes(item)&&itemBlockReason(g,'ai',item)===null}

function stealRank(g,item,known){
  if(item==='magnifier'&&known===null)return 10;
  if(item==='saw'&&known===true&&!g.saw.ai&&g.hp.player>1)return 9;
  if(item==='cigarette'&&g.hp.ai<cap(g))return 8;
  if(item==='cuffs'&&known===true&&(g.saw.ai?2:1)<g.hp.player)return 7;
  if(item==='beer'&&known===null&&g.hp.ai<=1)return 6;
  if(item==='burnerPhone'&&phoneTargets(g,'ai').length)return 5;
  if(item==='expiredMedicine'&&g.hp.ai>=2&&cap(g)-g.hp.ai>=2)return 4;
  return 0;
}

function optimalPlan(g,omniscient){
  const known=nextKnown(g,omniscient);
  const p=nextProb(g,{omniscient});
  const usable=item=>usableItem(g,item);
  const dmg=g.saw.ai?2:1;
  const steal=stealTargets(g,'ai')
    .map(item=>({item,rank:stealRank(g,item,known)}))
    .filter(entry=>entry.rank>0)
    .sort((a,b)=>b.rank-a.rank)[0];
  if(usable('adrenaline')&&steal)return {type:'item',item:'adrenaline',steal:steal.item};
  if(usable('cigarette'))return {type:'item',item:'cigarette'};
  if(usable('expiredMedicine')&&g.hp.ai>=2&&cap(g)-g.hp.ai>=2)return {type:'item',item:'expiredMedicine'};
  if(known===false)return {type:'shoot',target:'ai'};
  if(known===true){
    if(usable('saw')&&!g.saw.ai&&g.hp.player>1)return {type:'item',item:'saw'};
    if(usable('cuffs')&&dmg<g.hp.player)return {type:'item',item:'cuffs'};
    return {type:'shoot',target:'player'};
  }
  if(usable('magnifier'))return {type:'item',item:'magnifier'};
  if(usable('burnerPhone'))return {type:'item',item:'burnerPhone'};
  if(usable('saw')&&p>=.62&&g.hp.player>1)return {type:'item',item:'saw'};
  if(usable('cuffs')&&g.hp.player<=2)return {type:'item',item:'cuffs'};
  if(usable('beer')&&g.hp.ai<=1&&p>.3)return {type:'item',item:'beer'};
  return {type:'shoot',target:p>=.5?'player':'ai'};
}

function heuristicPlan(g,diff){
  const known=nextKnown(g,false);
  const p=nextProb(g,{omniscient:false,coarse:diff.info==='coarse'});
  const dmg=g.saw.ai?2:1;
  const canKill=dmg>=g.hp.player;
  const hurt=cap(g)-g.hp.ai;
  const usable=item=>usableItem(g,item);
  let shootPlayer=p*1.2+(canKill&&p>=.5?1.8:0)+(known===true?2.2:0);
  let shootSelf=(1-p)*.9+(known===false?2.8:0)-(known===true?3.5:0)-(g.hp.ai<=1&&p>.4?2.4:0);
  if(known===true&&usable('saw')&&!g.saw.ai)shootPlayer-=1.6;
  const actions=[
    {type:'shoot',target:'player',score:shootPlayer},
    {type:'shoot',target:'ai',score:shootSelf},
  ];
  const score=item=>{
    if(item==='cigarette')return hurt?1.3+(g.hp.ai<=1?1:0):-1;
    if(item==='magnifier')return known===null?.7+(1-Math.abs(p-.5)*2):-.8;
    if(item==='cuffs')return g.hp.player<=2?2.2:g.hp.ai<=1?1.3:.6;
    if(item==='saw')return known===true?3.2:p<.32?-.4:p*1.6;
    if(item==='beer')return known!==null?-1:p<.42?.8:-.6;
    if(item==='burnerPhone')return .25+phoneTargets(g,'ai').length*.2;
    if(item==='expiredMedicine')return g.hp.ai<=1?.3:hurt>=2?1:.2;
    return .2;
  };
  for(const item of new Set(g.items.ai)){
    if(item==='adrenaline'||!usable(item))continue;
    actions.push({type:'item',item,score:score(item)*diff.itemBias});
  }
  if(usable('adrenaline')){
    const best=stealTargets(g,'ai').map(item=>({item,value:score(item)})).sort((a,b)=>b.value-a.value)[0];
    if(best&&best.value>0)actions.push({type:'item',item:'adrenaline',steal:best.item,score:(best.value-.2)*diff.itemBias});
  }
  return actions;
}

export function chooseAi(g,difficulty='standard'){
  if(g.over||g.turn!=='ai')return null;
  const skip=skipIfCuffed(g);
  if(skip)return skip;
  const diff=DIFFICULTIES[difficulty]||DIFFICULTIES.standard;
  const choice=diff.optimal
    ? optimalPlan(g,!!diff.omniscient)
    : heuristicPlan(g,diff)
      .map(action=>({...action,score:action.score+(g.rng()-.5)*diff.noise}))
      .sort((a,b)=>b.score-a.score)[0];
  if(!choice)return shoot(g,'ai','player');
  return choice.type==='item'
    ? useItem(g,'ai',choice.item,{steal:choice.steal})
    : shoot(g,'ai',choice.target);
}
