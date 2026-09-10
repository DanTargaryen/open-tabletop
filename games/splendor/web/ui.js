import {createGame,applyAction,projectGame,legalActions,defaultPayment,price,affordable,total,emptyTokens,COLORS,TOKENS,assertConservation,CARDS} from './engine.js';
import {chooseAction,AI_STYLES} from './ai.js';
import {ARTWORK,artworkPath} from './artwork.js';
import {acquisitionEvents} from './feedback-events.js';
import {AcquisitionFeedback} from './feedback.js';
const app=document.querySelector('#app'),detail=document.querySelector('#detail');
const online=location.pathname.endsWith('online.html');
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={red:'精灵球',blue:'超级球',black:'高级球',pink:'治愈球',yellow:'先机球',master:'大师球'};
const short={red:'红',blue:'蓝',black:'黑',pink:'粉',yellow:'黄',master:'M'};
const SOLO='open-tabletop.pokemon.solo.v1',SESSION='open-tabletop.pokemon.room.v1',PENDING='open-tabletop.pokemon.pending.v1';
let state=null,room=null,session=null,busy=false,error='',selection=[],takeMode='different',botTimer=null,pollTimer=null,toastTimer=null,sound=false,audioCtx=null,pending=null,fillAI=true,polling=false,sending=false,moveOrigins=null;
const feedback=new AcquisitionFeedback({onSound:kind=>chime(kind)});
const read=(storage,key)=>{try{return JSON.parse(storage.getItem(key)||'null');}catch{return null;}};
const save=(storage,key,value)=>{try{storage.setItem(key,JSON.stringify(value));return true;}catch{toast('浏览器未允许保存，刷新恢复可能不可用。');return false;}};
const uuid=()=>crypto.randomUUID();
const newKey=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
const self=()=>online?room?.selfSeat:0;
const view=()=>online?state:state?projectGame(state,0):null;
const myTurn=()=>state && state.phase!=='complete' && state.current===self();
const ball=(color,count=short[color],title='')=>`<span class="ball ${color}" title="${escape(title||labels[color])}" aria-label="${escape(labels[color]+' '+count)}">${count}</span>`;
const costs=t=>TOKENS.filter(c=>t[c]>0).map(c=>ball(c,t[c])).join('');
function portrait(card) {
  return `<div class="portrait" role="img" aria-label="${escape(card.nameZh+'角色插画')}"><img src="${artworkPath(card)}" alt="" draggable="false" width="32" height="32"></div>`;
}

function toast(message) {const el=document.querySelector('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),4500);}
function chime(kind='turn') {
  if(!sound)return;
  try{audioCtx??=new AudioContext();void audioCtx.resume().catch(()=>{});
    const notes=kind==='capture'?[523.25,659.25,783.99]:kind==='evolve'?[587.33,739.99,880,1174.66]:[620];
    notes.forEach((frequency,i)=>{const o=audioCtx.createOscillator(),g=audioCtx.createGain(),t=audioCtx.currentTime+i*.09;o.type='sine';o.connect(g);g.connect(audioCtx.destination);o.frequency.setValueAtTime(frequency,t);g.gain.setValueAtTime(.001,t);g.gain.exponentialRampToValueAtTime(.04,t+.015);g.gain.exponentialRampToValueAtTime(.001,t+.25);o.start(t);o.stop(t+.27);});
  }catch{}
}
function cardHTML(card,{interactive=true,owned=false}={}) {
  if(!card) return '<div class="empty-slot">牌库已空</div>';
  const p=owned?null:view()?.players[self()],can=p && affordable(p,card);
  return `<button class="pokemon-card ${can?'affordable':''} ${owned?'owned-card':''}" data-card="${card.id}" aria-label="${escape((owned?'已捕捉，':'')+card.nameZh+'，'+card.points+' 分，'+labels[card.bonus]+'加成 '+card.bonusAmount)}" ${interactive?'':'disabled'}><div class="card-top"><span class="card-points">${card.points}<small>奖杯</small></span><span class="bonus">${ball(card.bonus)}<small>+${card.bonusAmount}</small></span></div>${portrait(card)}${card.evolveCost?`<div class="evo-cost">进化 ${costs(card.evolveCost)}</div>`:''}<div class="card-bottom"><div class="card-name">${escape(card.nameZh)}${owned?'<span class="owned-marker">已捕捉</span>':`<span class="card-id">#${String(card.dexId).padStart(3,'0')}</span>`}</div><div class="costs">${costs(card.cost)}</div></div></button>`;
}
function personalAreaHTML(player) {
  const held=total(player.tokens),excess=Math.max(0,held-10);
  return `<section id="personal-area" class="your-team" aria-label="你的精灵球与宝可梦">
    <div class="team-head hand-heading"><h2>你的精灵球</h2><span class="hand-total ${excess?'over-limit':''}"><b>${held}</b> / 10 枚${excess?` · 需归还 ${excess} 枚`:''}</span></div>
    <div class="hand-tokens" role="group" aria-label="手中可支付的精灵球">
      ${TOKENS.map(c=>`<div class="held-token ${player.tokens[c]?'':'empty'}" data-held-color="${c}" aria-label="${labels[c]}，持有 ${player.tokens[c]} 枚">${ball(c)}<div class="held-token-copy"><span>${labels[c]}</span><strong data-held-count>${player.tokens[c]}<small> 枚</small></strong></div></div>`).join('')}
    </div>
    <div class="permanent-bonuses" role="group" aria-label="永久加成，不计入持球上限"><span class="bonus-label">永久加成</span>${COLORS.map(c=>`<span class="inventory-bonus ${player.bonuses[c]?'':'empty'}" data-bonus="${c}" title="${labels[c]}永久加成 ${player.bonuses[c]}">${ball(c)}<b>+${player.bonuses[c]}</b></span>`).join('')}<small>不计入 10 枚持球上限</small></div>
    <div class="team-head"><h2>你的宝可梦</h2><span>${player.cards.length} 只在场 · 训练师板 ${player.evolved.length} 张</span></div>
    <div class="team-list">${player.cards.length?player.cards.map(c=>cardHTML(c,{owned:true})).join(''):'<p class="fine team-empty">捕捉第一只伙伴，从这里开始建立你的队伍。</p>'}</div>
    <div class="team-head"><h2>预留卡</h2><span>${player.reserved.length} / 3 · 仅你可见</span></div>
    <div class="reserved-row">${player.reserved.length?player.reserved.map(c=>cardHTML(c)).join(''):'<div class="empty-slot">预留获得大师球</div>'}</div>
  </section>`;
}
function lobby() {
  const name=escape(read(localStorage,'open-tabletop.pokemon.name')||'训练师');
  const queryCode=escape(new URLSearchParams(location.search).get('room')||'');
  app.innerHTML=`<section class="lobby"><div class="lobby-story"><span class="eyebrow">OPEN TABLETOP / 02</span><h1>下一只伙伴，<br>会是谁？</h1><p>收集精灵球，捕捉你的宝可梦。<br>让一次进化，改变整场对局。</p><div class="lobby-art">${[30,31,32].map(i=>portrait(CARDS.find(c=>c.artIndex===i))).join('')}</div><span class="label">2–4 位训练师 · 18 分开启最终轮</span></div><div class="lobby-controls"><span class="eyebrow">${online?'FRIENDS AT THE TABLE':'YOUR NEXT ADVENTURE'}</span><h2>${online?'邀请朋友开一桌':'出发吧，训练师'}</h2><label class="field">你的昵称<input id="name" maxlength="16" value="${name}" autocomplete="nickname"></label><label class="field">牌桌人数<select id="capacity"><option value="2">2 人 · ${online?'一对一':'你与一位 AI'}</option><option value="3">3 人 · ${online?'三人对局':'你与两位 AI'}</option><option value="4" selected>4 人 · ${online?'四人对局':'你与三位 AI'}</option></select></label><button class="primary" id="create" ${busy?'disabled':''}>${online?'创建好友房':'开始冒险'} <span aria-hidden="true">→</span></button>${online?`<div class="divider">已有房间码</div><label class="field">六位房间码<div class="inline"><input id="room-code" maxlength="6" placeholder="例如 ABC234" value="${queryCode}" autocomplete="off" autocapitalize="characters"><button id="join" ${busy?'disabled':''}>加入</button></div></label>`:'<p class="fine">青岚、赤砚与月白会用不同的本地策略应战。对局自动保存在这个浏览器。</p>'}<p class="fine">${online?'好友需要访问同一个 Node 服务；房间链接只包含房间码。':'也可以切换到右上角的好友联机。'}</p>${error?`<div class="notice">${escape(error)}</div>`:''}</div></section>`;
}
function waiting() {
  app.innerHTML=`<section class="wait-room"><span class="eyebrow">YOUR TABLE IS READY</span><h1>训练师集合</h1><div class="inline"><span class="room-code">${room.code}</span><button id="share" class="small">复制邀请</button></div><p class="fine">发给朋友房间码或邀请链接，准备好后由房主开始。</p>${errorHTML()}<div class="roster">${Array.from({length:room.capacity},(_,seat)=>{const m=room.members.find(m=>m.seat===seat);return `<div class="roster-row"><span>${seat+1}. ${m?escape(m.name)+(m.owner?' · 房主':''):'等待训练师'}</span><em>${m?m.ready?'已准备':'未准备':'空位'}</em></div>`;}).join('')}</div>${room.isOwner?`<label class="check"><input type="checkbox" id="fill-ai" ${fillAI?'checked':''}>开始时用 AI 补齐空位</label>`:''}<div class="wait-actions"><button class="sun" id="ready" ${busy?'disabled':''}>${room.members.find(m=>m.id===room.selfId)?.ready?'取消准备':'我准备好了'}</button>${room.isOwner?`<button class="primary" id="start-room" ${busy?'disabled':''}>开始对局</button>`:''}<button id="leave-room" class="ghost">离开房间</button></div><p class="fine">先手会随机选出，所有真人需要准备。主动离开进行中的对局后，原座位由 AI 接手。</p></section>`;
}
function errorHTML() {return error?`<div class="notice connection-error"><span>${escape(error)}</span><button id="reconnect" class="small">重新同步</button></div>`:'';}
function playerHTML(p,s) {
  return `<article data-seat="${p.seat}" class="player ${s.current===p.seat && s.phase!=='complete'?'active':''}"><div class="player-head"><button class="avatar" data-player="${p.seat}" aria-label="查看${escape(p.name)}的公开队伍">${escape(p.name.slice(0,1))}</button><span class="player-name">${escape(p.name)}${p.seat===self()?' · 你':''}<small>${p.seat===s.first?'先手 · ':''}${p.cards.length} 只伙伴 · ${p.evolved.length} 次进化 · 预留 ${p.reserved.length}</small></span><span class="score">${p.points}<small> / 18</small></span></div><div class="player-resources" aria-label="持球数 / 永久加成">${TOKENS.map(c=>`<span class="tiny-resource" data-resource="${c}">${ball(c)}<b>${p.tokens[c]}</b>${c==='master'?'':`<small>/ ${p.bonuses[c]}</small>`}</span>`).join('')}</div></article>`;
}
function render() {
  if(!state) {feedback.reset();moveOrigins=null;if(online&&room)waiting();else lobby();return;}
  const s=view(),p=s.players[self()],turn=myTurn(),active=s.players[s.current];
  const phaseText=s.phase==='complete'?'对局结束':turn?s.phase==='return'?'归还多余的球':s.phase==='evolve'?'选择一次进化':'轮到你了':`${active.name} 的回合`;
  const options=turn?legalActions(s):[];
  const selectionTokens=emptyTokens();selection.forEach(c=>selectionTokens[c]++);
  let canTake=false;
  if(s.phase==='return')canTake=selection.length===total(p.tokens)-10 && TOKENS.every(c=>selectionTokens[c]<=p.tokens[c]);
  else canTake=options.some(a=>a.type==='take' && [...a.colors].sort().join(',')===[...selection].sort().join(','));
  app.innerHTML=`<div class="game-meta"><div><h1>${online?'好友房 '+room.code:'训练师的牌桌'}</h1><small>第 ${Math.floor(s.turn/s.players.length)+1} 轮 · ${s.finalRound?'最终轮':'每人轮流行动'} · 持球 / 永久加成</small></div><div class="inline">${online?'<button id="share" class="small">邀请链接</button>':''}<button id="${online?'leave-room':'new-solo'}" class="small">${online?'离开':'重新开局'}</button></div></div>${errorHTML()}${s.phase==='complete'?`<section class="finished"><span class="eyebrow">ADVENTURE COMPLETE</span><h2>${s.winners.map(i=>escape(s.players[i].name)).join('、')} ${s.winners.length>1?'共享胜利':'赢得本局'}</h2><p>最高 ${Math.max(...s.players.map(p=>p.points))} 分 · 同分依次比较进化次数与场上宝可梦数量。</p>${online?(room.isOwner?'<button id="rematch" class="primary">再来一局</button>':'<span>等待房主发起下一局</span>'):'<button id="new-solo" class="primary">再来一局</button>'}</section>`:''}<section class="players" style="--players:${s.players.length}">${s.players.map(p=>playerHTML(p,s)).join('')}</section><div class="game-layout"><section class="market" aria-label="宝可梦展示区"><div class="specials">${[3,4].map(i=>`<div class="special-box"><div class="special-label">${i===3?'稀有':'传说 / 幻'}<small>剩 ${s.deckCounts[i]} 张</small><small>加成 ×2</small></div>${cardHTML(s.market[i][0])}</div>`).join('')}</div>${[2,1,0].map(i=>`<div class="tier-row"><button class="deck" data-deck="${i+1}" aria-label="盲预留 ${i+1} 级卡" ${!turn||s.phase!=='action'||busy||!s.deckCounts[i]||p.reserved.length>=3?'disabled':''}><span>LEVEL</span><strong>${['I','II','III'][i]}</strong><small>${s.deckCounts[i]} 张</small><span>预留</span></button>${s.market[i].map(c=>cardHTML(c)).join('')}</div>`).join('')}${personalAreaHTML(p)}</section><aside class="console"><div class="turn-banner"><div><span class="eyebrow">${turn?'MAKE YOUR MOVE':'AT THE TABLE'}</span><h2>${escape(phaseText)}</h2></div><p>${online && room.deadline?`<span id="countdown"></span> · 超时自动操作`:s.phase==='complete'?'感谢一起冒险':turn?'主动作后可以进化一次':'本地策略思考中…'}</p></div><div class="console-body"><div class="section-label">${s.phase==='return'&&turn?'选择要归还的球':'精灵球供应'}<small>${s.phase==='return'&&turn?'你持有的数量':'公共区域'}</small></div><div class="supply">${TOKENS.map(c=>`<button data-token="${c}" class="${selectionTokens[c]?'selected':''}" aria-label="${s.phase==='return'&&turn?'归还':'选择'}${labels[c]}" ${!turn||busy||!['action','return'].includes(s.phase)||(s.phase==='action'&&(c==='master'||!s.bank[c]))||(s.phase==='return'&&!p.tokens[c])?'disabled':''}>${ball(c,s.phase==='return'&&turn?p.tokens[c]:s.bank[c])}<span>${labels[c]}</span>${selectionTokens[c]?`<em>+${selectionTokens[c]}</em>`:''}</button>`).join('')}</div>${s.phase==='evolve'&&turn?`<p class="action-help">使用永久加成进化，不花球。旧卡将移入训练师板。</p>${options.filter(a=>a.type==='evolve').map(a=>{const from=p.cards.find(c=>c.id===a.fromId),to=[...s.market.flat().filter(Boolean),...p.reserved].find(c=>c.id===a.cardId);return `<button class="evolution-option" data-evolve="${a.fromId}" data-target="${a.cardId}" ${busy?'disabled':''}>${escape(from.nameZh)} → ${escape(to.nameZh)}<br><small>奖杯 ${from.points} → ${to.points}</small></button>`;}).join('')}<button id="finish-turn" class="wide primary" ${busy?'disabled':''}>本回合不进化</button>`:`${s.phase==='return'&&turn?'':`<div class="take-mode"><button id="different" class="${takeMode==='different'?'chosen':''}" ${!turn||busy?'disabled':''}>三种不同色</button><button id="same" class="${takeMode==='same'?'chosen':''}" ${!turn||busy?'disabled':''}>两枚同色</button></div>`}<button id="take" class="wide sun" ${!turn||!canTake||busy?'disabled':''}>${s.phase==='return'?'归还所选精灵球':selection.length?`拿取 ${selection.length} 枚精灵球`:'选择精灵球'}</button><p class="action-help">${s.phase==='return'&&turn?`需要归还 ${total(p.tokens)-10} 枚，已选 ${selection.length} 枚。可归还刚拿到的球。`:'点击卡牌查看费用、捕捉或预留。点击牌库可盲预留普通卡。'}</p>${selection.length?'<button id="clear-tokens" class="hint-button">清空所选</button>':''}${options.some(a=>a.type==='pass')?'<button id="pass" class="wide">无合法动作，跳过</button>':''}`}${turn&&s.phase!=='complete'?'<button id="hint" class="hint-button">给我一个策略提示</button>':''}<hr><div class="section-label history-label">最近的冒险</div><div class="history">${s.log.slice(0,6).map(e=>`<p><b>${escape(s.players[e.seat].name)}</b> ${escape(e.text)}</p>`).join('')||'<p>精灵球已就位。</p>'}</div></div></aside></div><p class="footer-note">角色美术：<a href="https://theartificial.github.io/pokemon-icons/" target="_blank" rel="noreferrer">The Artificial</a> · 署名分享 · 非官方同人作品</p>`;
  updateCountdown();
}
function showCard(id) {
  const s=view(),p=s.players[self()],card=[...s.market.flat().filter(Boolean),...s.players.flatMap(p=>[...p.cards,...p.reserved.filter(c=>!c.hidden)])].find(c=>c.id===id);
  if(!card)return;
  const owned=p.cards.some(c=>c.id===id);
  const actions=myTurn()?legalActions(s):[],buy=actions.some(a=>a.type==='buy'&&a.cardId===id),reserve=actions.some(a=>a.type==='reserve'&&a.cardId===id),due=price(p,card),payment=defaultPayment(p,card);
  const actionButtons=owned ? '<button id="replay-acquisition" class="primary">回放加入队伍动效</button>' : `<button id="buy-card" class="sun" ${!buy||busy?'disabled':''}>${buy?'捕捉':'暂不可捕捉'}</button>${card.kind==='normal'?`<button id="reserve-card" ${!reserve||busy?'disabled':''}>预留${s.bank.master?' + 大师球':''}</button>`:''}`;
  detail.dataset.selectedCard=id;
  document.querySelector('#detail-body').innerHTML=`<div class="detail-card">${portrait(card)}<div><span class="eyebrow">NO. ${String(card.dexId).padStart(3,'0')} · ${card.kind==='normal'?'LEVEL '+card.tier:card.kind==='rare'?'RARE':'LEGENDARY'}</span><h2>${escape(card.nameZh)}</h2><p>${escape(card.name)} · ${card.points} 奖杯</p><p>永久加成 ${ball(card.bonus)} × ${card.bonusAmount}</p></div></div><div class="section-label">捕捉费用 <small>卡牌原价</small></div><div class="costs">${costs(card.cost)}</div><p class="action-help">你的永久加成抵扣后：${TOKENS.every(c=>!due[c])?'免费捕捉':costs(due)}</p>${card.evolveCost?`<p class="action-help">进化条件：${costs(card.evolveCost)} 永久加成<br>进化为 ${escape(CARDS.find(c=>c.speciesId===card.evolvesToSpeciesId)?.nameZh||'下一阶')}，需要对应卡在展示区或你的预留中。</p>`:'<p class="action-help">这张卡在本游戏中不能进化。</p>'}${buy?`<details><summary>调整支付方式</summary><p class="fine">减少彩色球的支付数量，会用大师球补足差额。</p><div class="payment-grid">${COLORS.map(c=>`<label>${ball(c)}<input aria-label="支付${labels[c]}" data-payment="${c}" type="number" min="0" max="${Math.min(due[c],p.tokens[c])}" value="${payment[c]}"></label>`).join('')}</div><p class="fine" id="master-cost">需要 ${payment.master} 枚大师球（你有 ${p.tokens.master} 枚）</p></details>`:''}<div class="detail-actions">${actionButtons}</div>${!myTurn()?'<p class="fine">你可以查看卡牌，轮到你时再行动。</p>':''}`;
  if(!detail.open)detail.showModal();
}
function showPlayer(seat) {
  const p=view().players[seat];
  document.querySelector('#detail-body').innerHTML=`<span class="eyebrow">PUBLIC TEAM</span><h2>${escape(p.name)}的队伍</h2><p class="fine">${p.points} 奖杯 · ${p.evolved.length} 次进化 · 预留 ${p.reserved.length} 张（内容仅本人可见）</p><div class="public-team">${p.cards.map(c=>cardHTML(c,{owned:true})).join('')||'<p>还没有捕捉到宝可梦。</p>'}</div>`;
  detail.showModal();
}
function paymentFromDialog() {
  const s=view(),p=s.players[self()],card=CARDS.find(c=>c.id===detail.dataset.selectedCard),due=price(p,card),payment=emptyTokens();
  payment.master=due.master;
  for(const c of COLORS){payment[c]=Number(detail.querySelector(`[data-payment="${c}"]`)?.value??Math.min(due[c],p.tokens[c]));payment.master+=due[c]-payment[c];}
  return payment;
}
async function api(path,{body,token=session?.token}={}) {
  const response=await fetch('/api/splendor'+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});
  let data;try{data=await response.json();}catch{throw Error('联机服务不可用，请通过 Node 服务打开页面。');}
  if(!response.ok){const e=Error(data.error||'同步失败');e.status=response.status;throw e;}return data;
}
function accept(data) {
  if(room?.code===data.room.code && data.room.version<room.version)return;
  const before=state,origins=moveOrigins||feedback.captureOrigins();
  const old=state?.version;room=data.room;state=data.game;error='';
  const events=acquisitionEvents(before,state);
  if(old!==state?.version){selection=[];if(state?.current===self()&&!events.some(e=>e.seat===self()))chime();}
  render();
  feedback.play(events,{viewer:self(),players:state?.players,origins});
  if(events.some(e=>e.seat===self()))moveOrigins=null;
}
async function poll() {
  if(polling)return;
  clearTimeout(pollTimer);
  if(!session)return;
  polling=true;
  const identity=session;
  try {
    if(!busy && pending){busy=true;await sendPending();}
    if(!busy && !pending && session===identity){
      const data=await api('/rooms/'+identity.code,{token:identity.token});
      if(session!==identity)return;
      const changed=JSON.stringify(data.room.members)!==JSON.stringify(room?.members)||data.room.version!==room?.version||!!error;
      if(changed)accept(data);else{room=data.room;updateCountdown();}
    }
  } catch(e) {if(session===identity){error=e.message||'连接中断，重连后可继续。';render();}}
  finally {polling=false;if(session)pollTimer=setTimeout(poll,document.hidden?4000:1200);}
}
async function mutate(op,input={}) {
  if(busy||!session)return;
  if(pending){toast('上次行动尚未确认，请先点击重新同步。');return;}
  busy=true;pending={code:session.code,op,input:{...input,version:room.version,requestId:uuid()}};save(sessionStorage,PENDING,pending);render();
  await sendPending();
}
async function sendPending() {
  if(sending)return;
  if(!pending||!session){busy=false;return;}
  if(pending.code!==session.code){pending=null;sessionStorage.removeItem(PENDING);busy=false;return;}
  const request=pending,identity=session;
  sending=true;
  try {
    const data=await api('/rooms/'+identity.code+'/'+request.op,{body:request.input,token:identity.token});
    if(session!==identity||pending!==request)return;
    const left=data.left;pending=null;sessionStorage.removeItem(PENDING);busy=false;
    if(left){sessionStorage.removeItem(SESSION);localStorage.removeItem('open-tabletop.pokemon.identity.'+session.code);session=null;room=null;state=null;history.replaceState(null,'',location.pathname);render();return;}
    accept(data);
  } catch(e) {
    if(session!==identity||pending!==request)return;
    busy=false;
    if(e.status && e.status<500){moveOrigins=null;pending=null;sessionStorage.removeItem(PENDING);if(e.status===409){try{accept(await api('/rooms/'+session.code));}catch{}}}
    error=e.message||'网络未确认这次行动。点击重新同步，将用相同请求编号重试。';toast(error);render();
  } finally {sending=false;busy=false;}
}
async function move(action) {
  if(busy||!myTurn())return;
  const before=state,origins=feedback.captureOrigins();detail.close();
  if(online){moveOrigins=origins;await mutate('action',{action});return;}
  try{state=applyAction(state,0,action);save(localStorage,SOLO,state);selection=[];render();const events=acquisitionEvents(before,state);feedback.play(events,{viewer:0,players:state.players,origins});if(!events.length)chime();scheduleBot();}catch(e){toast(e.message);}
}
function scheduleBot() {
  clearTimeout(botTimer);
  if(online||!state||state.current===0||state.phase==='complete')return;
  botTimer=setTimeout(()=>{
    try{const seat=state.current,before=state,origins=feedback.captureOrigins();state=applyAction(state,seat,chooseAction(projectGame(state,seat),AI_STYLES[(seat-1)%3].id));save(localStorage,SOLO,state);render();feedback.play(acquisitionEvents(before,state),{viewer:0,players:state.players,origins});scheduleBot();}catch(e){error='AI 暂停：'+e.message;render();}
  },800);
}
function updateCountdown(){const el=document.querySelector('#countdown');if(el&&room?.deadline)el.textContent=Math.max(0,Math.ceil((room.deadline-room.serverNow)/1000))+' 秒';}
async function enterRoom(joining) {
  if(busy)return;
  const name=document.querySelector('#name').value.trim(),capacity=Number(document.querySelector('#capacity').value),code=document.querySelector('#room-code')?.value.trim().toUpperCase();
  save(localStorage,'open-tabletop.pokemon.name',name);busy=true;error='';
  const keyName='open-tabletop.pokemon.entry.'+(joining?code:'create');
  const key=read(sessionStorage,keyName)||newKey();save(sessionStorage,keyName,key);
  try{const data=await api(joining?'/rooms/'+code+'/join':'/rooms',{body:{name,capacity,seatKey:key},token:null});
    session={code:data.room.code,token:data.token};save(sessionStorage,SESSION,session);save(localStorage,'open-tabletop.pokemon.identity.'+session.code,session);
    sessionStorage.removeItem(keyName);history.replaceState(null,'','?room='+session.code);busy=false;accept(data);poll();
  }catch(e){busy=false;error=e.message;toast(error);lobby();}
}
app.addEventListener('change',e=>{if(e.target.id==='fill-ai')fillAI=e.target.checked;});
app.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b||b.disabled)return;
  if(b.dataset.player!==undefined){showPlayer(Number(b.dataset.player));return;}
  if(b.dataset.card){showCard(b.dataset.card);return;}
  if(b.dataset.deck){await move({type:'reserve',tier:Number(b.dataset.deck)});return;}
  if(b.dataset.evolve){await move({type:'evolve',fromId:b.dataset.evolve,cardId:b.dataset.target});return;}
  if(b.dataset.token){const c=b.dataset.token;if(state.phase==='return'){const n=selection.filter(v=>v===c).length;if(n<state.players[self()].tokens[c])selection.push(c);else selection=selection.filter(v=>v!==c);}else if(takeMode==='same')selection=state.bank[c]>=4?[c,c]:[];else if(selection.includes(c))selection=selection.filter(v=>v!==c);else if(selection.length<3)selection.push(c);render();return;}
  switch(b.id){
    case 'create': if(online)await enterRoom(false);else {const n=Number(document.querySelector('#capacity').value),name=document.querySelector('#name').value.trim()||'训练师';save(localStorage,'open-tabletop.pokemon.name',name);state=createGame([name,...AI_STYLES.slice(0,n-1).map(a=>a.name+' · AI')],{first:Math.floor(Math.random()*n)});save(localStorage,SOLO,state);error='';render();scheduleBot();}break;
    case 'join':await enterRoom(true);break;
    case 'different':case 'same':takeMode=b.id;selection=[];render();break;
    case 'clear-tokens':selection=[];render();break;
    case 'take':if(state.phase==='return'){const tokens=emptyTokens();selection.forEach(c=>tokens[c]++);await move({type:'return',tokens});}else await move({type:'take',colors:[...selection]});break;
    case 'finish-turn':await move({type:'finish'});break;
    case 'pass':await move({type:'pass'});break;
    case 'new-solo': if(state.phase!=='complete'&&!confirm('结束当前本地对局，重新选择人数？'))return;clearTimeout(botTimer);state=null;error='';selection=[];localStorage.removeItem(SOLO);render();break;
    case 'ready':await mutate('ready',{ready:!room.members.find(m=>m.id===room.selfId)?.ready});break;
    case 'start-room':await mutate('start',{fillAI:document.querySelector('#fill-ai')?.checked});break;
    case 'rematch':await mutate('rematch');break;
    case 'leave-room':if(!confirm('离开房间？进行中的座位将由 AI 接手。'))return;await mutate('leave');break;
    case 'share':try{await navigator.clipboard.writeText(location.origin+location.pathname+'?room='+room.code);toast('邀请链接已复制（只含房间码）');}catch{toast('房间码：'+room.code);}break;
    case 'reconnect':if(pending){busy=true;await sendPending();}else await poll();break;
    case 'hint':{const a=chooseAction(view());if(a.type==='buy'||a.type==='reserve')toast((a.type==='buy'?'可以捕捉 ':'可以预留 ')+CARDS.find(c=>c.id===a.cardId)?.nameZh);else if(a.type==='take')toast('可以拿取 '+a.colors.map(c=>labels[c]).join('、'));else if(a.type==='evolve')toast('可以进化为 '+CARDS.find(c=>c.id===a.cardId)?.nameZh);else toast('先完成当前回合的归还或进化选择。');}break;
  }
});
detail.addEventListener('input',()=>{const payment=paymentFromDialog(),p=state.players[self()];document.querySelector('#master-cost').textContent=`需要 ${payment.master} 枚大师球（你有 ${p.tokens.master} 枚）`;document.querySelector('#buy-card').disabled=payment.master>p.tokens.master||COLORS.some(c=>!Number.isInteger(payment[c])||payment[c]<0);});
detail.addEventListener('click',async e=>{
  // Selection state belongs to data-selected-card; only actual card buttons
  // inside the public-team view should open another detail view.
  const button=e.target.closest('button');if(!button||button.disabled)return;
  if(button.matches('[data-card]')){showCard(button.dataset.card);return;}
  if(button.id==='replay-acquisition'){
    const s=view(),card=s.players[self()].cards.find(c=>c.id===detail.dataset.selectedCard);if(!card)return;
    const origins=feedback.captureOrigins();detail.close();
    feedback.play([{key:'replay:'+card.id,kind:'capture',seat:self(),card,bonusChanges:{[card.bonus]:card.bonusAmount},pointsDelta:card.points}],{viewer:self(),players:s.players,origins,replay:true});return;
  }
  if(button.id==='buy-card')await move({type:'buy',cardId:detail.dataset.selectedCard,payment:paymentFromDialog()});
  if(button.id==='reserve-card')await move({type:'reserve',cardId:detail.dataset.selectedCard});
});
document.querySelectorAll('.close-dialog').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
document.querySelector('#help').addEventListener('click',()=>document.querySelector('#rules').showModal());
document.querySelector('#sound').addEventListener('click',e=>{sound=!sound;e.target.textContent='音效：'+(sound?'开':'关');e.target.setAttribute('aria-pressed',String(sound));chime();});
document.querySelector('#mode-link').href=online?'./index.html':'./online.html';document.querySelector('#mode-link').textContent=online?'单人冒险 ↗':'好友联机 ↗';
document.addEventListener('visibilitychange',()=>{if(online&&session&&!document.hidden)poll();});
async function ensureArtwork() {
  const files=[...new Set(Object.values(ARTWORK).map(a=>'./assets/pokemon/'+a.file))];
  await Promise.all(files.map(src=>new Promise((resolve,reject)=>{
    const image=new Image();image.onload=resolve;image.onerror=()=>reject(new Error('角色图片加载失败，请检查服务后重试。'));image.src=src;
  })));
}
async function boot(){
  try {await ensureArtwork();} catch(e){
    app.innerHTML=`<section class="wait-room"><h1>图片资源尚未准备好</h1><p>${escape(e.message)}</p><button id="retry-artwork" class="primary">重新加载图片</button></section>`;
    document.querySelector('#retry-artwork').addEventListener('click',boot);return;
  }
  if(online){const code=new URLSearchParams(location.search).get('room');session=read(sessionStorage,SESSION);if(code&&session?.code!==code)session=read(localStorage,'open-tabletop.pokemon.identity.'+code);pending=read(sessionStorage,PENDING);if(session){save(sessionStorage,SESSION,session);try{accept(await api('/rooms/'+session.code));if(pending){busy=true;await sendPending();}poll();return;}catch(e){error=e.message;session=null;room=null;state=null;}}}
  else {const saved=read(localStorage,SOLO);if(saved)try{assertConservation(saved);state=saved;}catch{error='旧的本地记录无法恢复，可以重新开始。';}}
  render();scheduleBot();
}
boot();
