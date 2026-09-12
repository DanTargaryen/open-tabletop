import { PokerAudio, bindPokerAudio } from './audio.js';
import { PokerSoundEvents } from './audio-events.js';
import { PokerGame, evaluateHand, estimateEquity } from './engine.js';
import { CHARACTER_THEMES, BRAND_ORDER, themeFor, remapLegacyText, tableLineFor } from './characters.js';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = value => Number(value || 0).toLocaleString('zh-CN');
const signed = value => `${Number(value) >= 0 ? '+' : '−'}${num(Math.abs(value || 0))}`;
const SAVE_KEY = 'velvet-poker.save.v1', PROFILE_KEY = 'velvet-poker.profile.v1', SETTINGS_KEY = 'velvet-poker.settings.v1';
const SUITS = {s:'♠',h:'♥',d:'♦',c:'♣'};
const STREETS = {ready:'READY',preflop:'PRE-FLOP',flop:'FLOP · 翻牌',turn:'TURN · 转牌',river:'RIVER · 河牌',showdown:'SHOWDOWN · 摊牌',complete:'HAND COMPLETE'};
const RANK_GUIDE = [
 {name:'皇家同花顺',description:'同花色的 A K Q J 10',cards:['As','Ks','Qs','Js','Ts']},
 {name:'同花顺',description:'同花色，五张点数连续',cards:['9s','8s','7s','6s','5s']},
 {name:'四条',description:'四张相同点数，加一张单牌',cards:['9s','9h','9d','9c','2s']},
 {name:'葫芦',description:'三张相同点数，加一对',cards:['Ks','Kh','Kd','2c','2s']},
 {name:'同花',description:'五张同花色，点数不连续',cards:['As','Js','8s','6s','2s']},
 {name:'顺子',description:'五张点数连续，花色不全相同',cards:['9s','8h','7d','6c','5s']},
 {name:'三条',description:'三张相同点数，加两张单牌',cards:['7s','7h','7d','Kc','2s']},
 {name:'两对',description:'两组不同的对子，加一张单牌',cards:['Ks','Kh','4d','4c','2s']},
 {name:'一对',description:'一组对子，加三张单牌',cards:['As','Ah','9d','6c','2s']},
 {name:'高牌',description:'以上都没有，逐张比较点数',cards:['As','Jh','8d','6c','2s']},
];
const ACHIEVEMENTS = [
 {id:'first',icon:'♠',title:'初次落座',desc:'完成你的第一手牌',check:p=>p.hands>=1},
 {id:'winner',icon:'◇',title:'第一桶金',desc:'第一次赢得底池',check:p=>p.wins>=1},
 {id:'patient',icon:'◷',title:'长夜牌客',desc:'累计完成 25 手牌',check:p=>p.hands>=25},
 {id:'ten',icon:'♧',title:'渐入佳境',desc:'累计赢得 10 次底池',check:p=>p.wins>=10},
 {id:'big',icon:'✦',title:'大底池猎手',desc:'单手净赢至少 1,000 筹码',check:p=>p.biggestWin>=1000},
 {id:'champion',icon:'♛',title:'今夜的赢家',desc:'赢得一次单桌锦标赛',check:p=>p.titles>=1}
];
let game = null, view = null, mode = 'tournament', difficulty = 'normal', paused = false;
let busy = false, botTimer = null, toastTimer = null, resultTimer = null, lastBoardKey = '', lastHandNumber = 0;
let settings = {sound:true,speed:1,talk:true}, profile = {hands:0,wins:0,titles:0,biggestWin:0,unlocked:[]};
let run = null, activeTab = 'live', storageWarning = false, lastSave = null;
let restoredGame = null, restoredRun = null;
let banter={hand:0,count:0,seen:0,line:null,until:0};
let banterTimer=null;
const audio=new PokerAudio(),soundEvents=new PokerSoundEvents();

function readStorage(key) { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : null; } catch { return null; } }
function writeStorage(key,value) {
 try { localStorage.setItem(key,JSON.stringify(value)); return true; }
 catch { if(!storageWarning) { storageWarning=true; toast('此浏览器无法自动保存。请在暂停菜单导出存档。'); } return false; }
}
function loadSettings() {
 const s = readStorage(SETTINGS_KEY); if(s) settings={sound:s.sound!==false,speed:s.speed===2?2:1,talk:s.talk!==false};
 const p = readStorage(PROFILE_KEY); if(p && typeof p==='object') profile={hands:Math.max(0,+p.hands||0),wins:Math.max(0,+p.wins||0),titles:Math.max(0,+p.titles||0),biggestWin:Math.max(0,+p.biggestWin||0),unlocked:Array.isArray(p.unlocked)?p.unlocked.filter(v=>ACHIEVEMENTS.some(a=>a.id===v)):[]};
 audio.setEnabled(settings.sound);updateSoundButton(); $('speedBtn').innerHTML=`${settings.speed}× <span>节奏</span>`;
}
function validateSave(envelope) {
 if(!envelope || envelope.version!==1 || !envelope.game) throw new Error('这不是有效的丝绒牌局存档');
 const restored = PokerGame.restore(typeof envelope.game==='string'?envelope.game:JSON.stringify(envelope.game));
 const s = restored.getPublicState();
 if(!Array.isArray(s.players)||s.players.length!==6||!['practice','tournament'].includes(s.mode)) throw new Error('存档牌桌结构不正确');
 if(!s.players.every(p=>Number.isFinite(p.stack)&&p.stack>=0&&typeof p.name==='string'&&p.name.length<=40)) throw new Error('存档玩家数据不正确');
 const r=envelope.run;
 if(!r || !Number.isSafeInteger(r.hands) || r.hands<0 || !Number.isFinite(r.net) || !Array.isArray(r.history)) throw new Error('存档记录不完整');
 const cards=(list,max)=>Array.isArray(list)?list.filter(c=>typeof c==='string'&&/^[2-9TJQKA][cdhs]$/.test(c)).slice(0,max):[];
 const history=r.history.slice(0,50).filter(h=>h&&Number.isSafeInteger(h.hand)&&h.hand>0).map(h=>({hand:h.hand,net:Number.isFinite(h.net)?h.net:0,won:!!h.won,board:cards(h.board,5),hole:cards(h.hole,2),summary:String(h.summary||'').slice(0,1000),handName:String(h.handName||'').slice(0,40),pot:Number.isFinite(h.pot)?h.pot:0,actions:Array.isArray(h.actions)?h.actions.slice(0,200).map(e=>({text:String(e?.text||'').slice(0,500),type:String(e?.type||''),playerId:e?.playerId})):[],showdown:Array.isArray(h.showdown)?h.showdown.filter(p=>p&&Number.isInteger(p.id)&&p.id>=0&&p.id<6).slice(0,6).map(p=>({id:p.id,name:String(p.name||'').slice(0,40),hole:cards(p.hole,2),bestCards:cards(p.bestCards,5),handName:String(p.handName||'').slice(0,40),won:Number.isFinite(p.won)?p.won:0})):[]}));
 return {game:restored,run:{id:typeof r.id==='string'?r.id.slice(0,80):Date.now().toString(36),hands:r.hands,wins:Number.isSafeInteger(r.wins)?Math.max(0,r.wins):0,net:r.net,history,recordedHand:Number.isSafeInteger(r.recordedHand)?r.recordedHand:0,titleRecorded:!!r.titleRecorded,startedAt:String(r.startedAt||'').slice(0,60)}};
}
function detectSave() {
 const saved=readStorage(SAVE_KEY); if(!saved) return;
 try { const r=validateSave(saved);restoredGame=r.game;restoredRun=r.run;lastSave=saved;$('continueBtn').classList.remove('hidden');const s=r.game.getPublicState();$('continueBtn').innerHTML=`继续上次${s.mode==='practice'?'练习':'锦标赛'} · 第 ${num(s.handNumber)} 手 <span>→</span>`; }
 catch { toast('之前的存档未能读取，可以开始一场新牌局。'); }
}
function persist() {
 if(!game||!run) return;
 try { lastSave={version:1,savedAt:new Date().toISOString(),game:game.serialize(),run};writeStorage(SAVE_KEY,lastSave); }
 catch(e) { toast(`存档失败：${e.message}`); }
}
function toast(message) { clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.remove('hidden');toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),4300); }
function updateLobby() { $('lobbyHands').textContent=num(profile.hands);$('lobbyWins').textContent=num(profile.wins);$('lobbyTitles').textContent=num(profile.titles); }
function updateSoundButton() { $('soundBtn').classList.toggle('sound-on',settings.sound);$('soundBtn').title=settings.sound?'关闭音效':'开启音效';$('soundBtn').setAttribute('aria-label',$('soundBtn').title);$('soundBtn').setAttribute('aria-pressed',String(settings.sound)); }
function playSnapshot(state,options={}) {
 for(const {kind,delay} of soundEvents.observe(state,options))audio.play(kind,{delay});
}
function resetAudio(){audio.stop();soundEvents.reset();}
function cardHTML(code,{mini=false,empty=false,winning=false}={}) {
 if(empty) return '<span class="card empty" aria-hidden="true"></span>';
 if(!code) return `<span class="card back${mini?' mini':''}" aria-label="对手暗牌"><span class="card-back-pattern">VP</span></span>`;
 const rank=code[0]==='T'?'10':code[0],suit=SUITS[code[1]]||'♠',red=code[1]==='h'||code[1]==='d';
 return `<span class="card${red?' red':''}${mini?' mini':''}${winning?' winning':''}" aria-label="${esc(rank+suit)}"><span class="card-corner">${esc(rank)}<i>${suit}</i></span><span class="card-pip">${suit}</span></span>`;
}
function isComplete(s=view) { return !!s && (s.phase==='complete'||s.phase==='showdown'||s.gameOver) && !!s.lastResult; }
function playerName(id) { return view?.players.find(p=>p.id===id)?.name || `玩家 ${id+1}`; }
function currentPlayer() { return view?.players[view.currentPlayerIndex]; }
function isHumanTurn() { return game && !paused && !busy && !isComplete() && currentPlayer()?.isHuman; }
function difficultyValue(){return {easy:'casual',normal:'standard',hard:'expert'}[difficulty]||'standard';}
function createGame() {
 clearTimeout(botTimer);clearTimeout(resultTimer);closeModal(false);paused=false;busy=false;lastBoardKey='';lastHandNumber=0;
 resetBanter();resetAudio();
 game=new PokerGame({mode,difficulty:difficultyValue(),playerName:'你'});
 run={id:`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`,hands:0,wins:0,net:0,history:[],recordedHand:0,titleRecorded:false,startedAt:new Date().toISOString()};
 game.startHand();showGame();refresh({announce:true});
}
function showGame() { $('lobby').classList.add('hidden');$('game').classList.remove('hidden');document.title='丝绒牌局 · 正在牌桌';window.scrollTo({top:0,behavior:'instant'}); }
function goLobby() {
 audio.stop();
 clearTimeout(botTimer);clearTimeout(resultTimer);paused=true;persist();closeModal(false);$('game').classList.add('hidden');$('lobby').classList.remove('hidden');document.title='VELVET POKER · 丝绒牌局';updateLobby();detectSave();window.scrollTo({top:0,behavior:'instant'});
}
function continueGame() { if(!restoredGame) return;game=restoredGame;run=restoredRun;paused=false;busy=false;lastBoardKey='';lastHandNumber=0;resetBanter(game.getPublicState());resetAudio();showGame();refresh({bootstrap:true}); }
function recordHand() {
 if(!isComplete()||run.recordedHand===view.handNumber)return;
 run.recordedHand=view.handNumber;run.hands++;profile.hands++;
 const own=view.lastResult.playerResults?.find(p=>p.id===0);
 const net=Number(own?.net||0),won=(view.lastResult.winners||[]).some(w=>w.id===0&&w.amount>0);
 if(won){run.wins++;profile.wins++;}
 run.net+=net;profile.biggestWin=Math.max(profile.biggestWin,net);
 const showdown=view.lastResult.showdown?(view.lastResult.playerResults||[]).filter(p=>!p.folded&&p.hole?.every(Boolean)&&p.bestCards?.length===5).map(p=>({id:p.id,name:p.name,hole:[...p.hole],bestCards:[...p.bestCards],handName:p.handName,won:p.won})):[];
 run.history.unshift({hand:view.handNumber,net,won,board:[...(view.lastResult.board||view.board)],hole:[...(view.players[0].hole||[])],summary:view.lastResult.summary||'',handName:own?.handName||'',pot:view.lastResult.totalPot||0,showdown,actions:(view.lastResult.actions||view.history.filter(x=>x.handNumber===view.handNumber)).map(x=>({text:x.text,type:x.type,playerId:x.playerId}))});run.history=run.history.slice(0,50);
 if(view.gameOver&&view.winnerId===0&&!run.titleRecorded&&view.mode==='tournament'){run.titleRecorded=true;profile.titles++;}
 const newAchievements=ACHIEVEMENTS.filter(a=>a.check(profile)&&!profile.unlocked.includes(a.id));newAchievements.forEach(a=>profile.unlocked.push(a.id));
 writeStorage(PROFILE_KEY,profile);if(newAchievements.length)setTimeout(()=>toast(`解锁成就 · ${newAchievements.map(a=>a.title).join(' / ')}`),600);
 if(view.gameOver) {clearTimeout(resultTimer);resultTimer=setTimeout(()=>{if(!paused&&!$('game').classList.contains('hidden'))showEnd();},1100);}
}
function refresh({schedule=true,bootstrap=false,announce=false}={}) {
 view=game.getPublicState();playSnapshot(view,{bootstrap,announce});recordHand();updateBanter();renderGame();persist();if(schedule) scheduleAI();
}
function renderGame() {
 const s=view,finished=isComplete(),human=s.players[0];
 $('modeLabel').textContent=s.mode==='practice'?'OPEN PRACTICE TABLE':'SINGLE TABLE TOURNAMENT';
 $('handCounter').textContent=`/ 第 ${s.handNumber} 手`;
 $('blindsLabel').textContent=`${num(s.blinds.small)} / ${num(s.blinds.big)}`;
 $('levelCaption').textContent=s.mode==='practice'?'练习规则':`LEVEL ${s.blinds.level||1} · 下次升盲`;
 $('levelLabel').textContent=s.mode==='practice'?'每手重置 2,000':`${s.handsUntilBlindIncrease||10} 手后`;
 $('playersLabel').textContent=`${s.players.filter(p=>!p.eliminated).length} / 6`;
 $('logHandNumber').textContent=`#${String(s.handNumber).padStart(3,'0')}`;
 const visiblePot=finished?(s.lastResult.totalPot||s.lastResult.pots?.reduce((v,p)=>v+p.amount,0)||0):s.pot;
 $('potAmount').textContent=num(visiblePot);$('potChips').classList.toggle('hidden',!visiblePot);
 $('streetLabel').textContent=STREETS[s.phase]||s.phase.toUpperCase();
 const boardKey=s.board.join(',');if(boardKey!==lastBoardKey||s.handNumber!==lastHandNumber){$('board').innerHTML=Array.from({length:5},(_,i)=>cardHTML(s.board[i],{empty:!s.board[i]})).join('');lastBoardKey=boardKey;}
 lastHandNumber=s.handNumber;
 const pots=finished?s.lastResult.pots:[];
 $('sidePots').textContent=pots&&pots.length>1?pots.map((p,i)=>`${i===0?'主池':`边池 ${i}`} ${num(p.amount)}`).join(' · '):'';
 const winnerIds=finished?(s.lastResult.winners||[]).map(w=>w.id):[];
 const current=currentPlayer();
 $('seats').innerHTML=s.players.map((p,i)=>{
  const active=!finished&&s.currentPlayerIndex===i;
  const theme=themeFor(p);
  const classes=`seat seat-${i}${theme?` brand-${p.brand||BRAND_ORDER[p.id-1]}`:''}${active?' active':''}${p.folded?' folded':''}${p.eliminated?' eliminated':''}${winnerIds.includes(p.id)?' winner':''}${finished&&s.lastResult.showdown?' showdown':''}${finished?' settled':''}`;
  const initial=theme?`<img class="brand-icon" src="${theme.icon}" alt="${esc(p.name)} 图标" draggable="false">`:'Y';
  let label=p.eliminated?'已离桌':p.lastAction||'';
  if(active&&!p.isHuman)label=`思考中 <span class="thinking-dots"><i></i><i></i><i></i></span>`;else label=esc(label);
  if(active&&p.isHuman)label='轮到你了';
  if(finished){
   const result=s.lastResult.playerResults?.find(r=>r.id===p.id);
   const handLabel=result?.handName||(!p.hole?.length?'未参与':p.folded?'已弃牌':'未摊牌');
   const won=winnerIds.includes(p.id)?(p.winnings||s.lastResult.winners.filter(w=>w.id===p.id).reduce((n,w)=>n+w.amount,0)):0;
   label=`<b class="seat-result-type">${esc(handLabel)}</b>${won?`<small class="seat-result-note">赢得 ${num(won)}</small>`:''}`;
  }
  const hole=p.hole?.length?p.hole:[];
  const badge=p.isDealer?'D':p.isSmallBlind?'SB':p.isBigBlind?'BB':'';
  return `<div class="${classes}" data-seat="${i}" aria-label="${esc(p.name)}，筹码 ${num(p.stack)}${p.folded?'，已弃牌':''}${p.allIn?'，已全下':''}"><div class="avatar" title="${esc(theme?.strategy||p.personality||"")}">${initial}</div>${label?`<div class="seat-action">${label}</div>`:''}${badge?`<span class="seat-badge${badge!=='D'?' blind-badge':''}" title="${badge==='D'?'庄家':badge==='SB'?'小盲位':'大盲位'}">${badge}</span>`:''}<div class="seat-cards">${hole.map(c=>cardHTML(c,{mini:!p.isHuman})).join('')}</div><div class="seat-name">${esc(p.name)}${p.personality?`<span class="seat-personality">${esc(p.personality)}</span>`:''}</div><div class="seat-stack">${num(p.stack)}${p.allIn&&!finished?' · ALL IN':''}</div>${p.bet>0&&!finished?`<div class="seat-bet">${num(p.bet)}</div>`:''}</div>`;
 }).join('');
 $('winningGlow').classList.toggle('hidden',!winnerIds.includes(0));
 $('tableStatus').textContent=finished?(winnerIds.includes(0)?'THE POT IS YOURS':'这一手，已有答案。'):'';
 updateHandStrength();renderActions();renderLogs();renderHistory();
 $('sessionHands').textContent=num(run.hands);$('sessionWins').textContent=num(run.wins);$('sessionDelta').textContent=signed(run.net);
 $('sessionDelta').style.color=run.net>=0?'var(--gold)':'#bf8b77';
 renderTableNote();
}
function resetBanter(state=null){clearTimeout(banterTimer);banter={hand:state?.handNumber||0,count:0,seen:state?.history?.at(-1)?.id||0,line:null,until:0};}
function updateBanter(){
 const entries=(view.history||[]).filter(e=>e.handNumber===view.handNumber);
 if(banter.hand!==view.handNumber)banter={hand:view.handNumber,count:0,seen:0,line:null,until:0};
 const unseen=entries.filter(e=>e.id>banter.seen);banter.seen=entries.at(-1)?.id||banter.seen;
 if(!settings.talk||banter.count>=2||Date.now()<banter.until)return;
 let event=[...unseen].reverse().find(e=>e.playerId>0&&['check','call','raise','all-in','fold'].includes(e.type)&&(e.type==='raise'||e.type==='all-in'||(e.id+view.handNumber)%4===0));
 let player=event&&view.players[event.playerId],action=event?.type;
 if(!event&&isComplete()&&unseen.some(e=>e.type==='win')){const winner=view.lastResult.winners.find(w=>w.id>0);if(winner){player=view.players[winner.id];action='win';event=unseen.find(e=>e.type==='win');}}
 if(!player||!event)return;
 const brand=player.brand||BRAND_ORDER[player.id-1],line=tableLineFor(brand,action,event.id);
 if(!line)return;
 banter.count++;banter.line={brand,text:line};banter.until=Date.now()+4800;
 clearTimeout(banterTimer);banterTimer=setTimeout(()=>{banter.line=null;if(view)renderTableNote();},4800);
}
function renderTableNote(){
 const root=$('tableNote'),line=settings.talk&&banter.line&&Date.now()<banter.until?banter.line:null;
 root.classList.toggle('table-talk-active',!!line);
 const compact=$('compactTalk');compact.closest('.table-footer').classList.toggle('has-table-talk',!!line);
 compact.innerHTML=line?`<b>${esc(CHARACTER_THEMES[line.brand].name)}</b> · ${esc(line.text)}`:'';
 if(line){const theme=CHARACTER_THEMES[line.brand];root.innerHTML=`<span class="table-talk-speaker"><img src="${theme.icon}" alt="" draggable="false">${esc(theme.name)}<small>桌边短句</small></span><span class="table-talk-line">“${esc(line.text)}”</span>`;}
 else root.innerHTML=view?.mode==='practice'?'练习桌每手恢复 2,000 筹码。<br>右下记录累计净得分。':'位置是无声的优势。<br>越晚行动，看到的信息越多。';
}
function updateHandStrength() {
 const human=view.players[0],cards=[...(human.hole||[]),...view.board].filter(Boolean);
 let text='等待发牌';
 if(cards.length>=5){try{text=`${human.folded?'已弃牌 · 事后牌型':'当前牌型'} · ${evaluateHand(cards).name}`;}catch{text='观察公共牌';}}
 else if(cards.length===2){const ranks='23456789TJQKA';const sorted=[...cards].sort((a,b)=>ranks.indexOf(b[0])-ranks.indexOf(a[0]));text=cards[0][0]===cards[1][0]?`口袋对子 · ${cards[0][0]==='T'?'10':cards[0][0]}`:`${sorted.map(c=>c[0]==='T'?'10':c[0]).join(' / ')} · ${cards[0][1]===cards[1][1]?'同花色':'不同花色'}`;}
 $('handStrength').textContent=text;
 $('handTip').innerHTML='<button class="coach-btn" id="tableRanksBtn">牌型大小</button><button class="coach-btn" id="coachBtn">◇ 牌桌教练</button>';
 $('tableRanksBtn').onclick=showRankGuide;
 $('coachBtn').onclick=showCoach;
}
function renderActions() {
 const done=isComplete(),humanTurn=isHumanTurn(),legal=view.legalActions||game.legalActions();
 $('raiseBuilder').classList.toggle('hidden',done);document.querySelector('.action-buttons').classList.toggle('hidden',done);$('nextControls').classList.toggle('hidden',!done);
 if(done){const own=view.lastResult.playerResults?.find(p=>p.id===0);const amount=Number(own?.net||0),winner=view.lastResult.playerResults?.find(p=>p.id===view.lastResult.winners?.[0]?.id);const kickerNote=view.lastResult.showdown&&!own?.folded&&winner?.id!==0&&winner?.handName===own?.handName?'<small>牌型相同时，依次比较五张牌的点数与踢脚牌。展开历史牌局可查看摊牌对比。</small>':'';$('turnMessage').textContent=view.mode==='practice'?'自由练习 · 下一手恢复 2,000 筹码':'本手结束 · 按空格继续';$('turnMessage').classList.remove('your-turn');$('handResult').innerHTML=`<strong>${amount>0?`漂亮。净赢 ${num(amount)} 筹码`:amount<0?`本手净亏 ${num(-amount)} 筹码`:'本手筹码持平'}</strong><small>${esc(view.lastResult.summary||'牌局已完成')}</small>${kickerNote}`;$('nextBtn').innerHTML=view.gameOver?'本场结算 <span>→</span>':'下一手 <span>→</span>';return;}
 $('turnMessage').classList.toggle('your-turn',!!humanTurn);
 const cur=currentPlayer();
 $('turnMessage').textContent=paused?'牌局已暂停':humanTurn?(legal.canCheck?'轮到你了 · 可以免费过牌':`轮到你了 · 跟注需要 ${num(legal.callAmount)} 筹码`):`${cur?.name||'对手'} 正在思考${view.players[0].folded?' · 你已弃牌，等待本手结束':''}`;
 $('foldBtn').disabled=!humanTurn||!legal.canFold;$('callBtn').disabled=!humanTurn||(!legal.canCheck&&!legal.canCall);$('raiseBtn').disabled=!humanTurn||(!legal.canRaise&&!legal.canAllIn);
 $('callBtn').querySelector('span').innerHTML=legal.canCheck?'过牌':`跟注 <b>${num(legal.callAmount)}</b>`;
 const min=Number(legal.minRaiseTo||0),max=Number(legal.maxRaiseTo||legal.allInTo||0),canFullRaise=!!legal.canRaise;
 const slider=$('raiseSlider');let value=Number(slider.value);if(!humanTurn||value<min||value>max)value=canFullRaise?Math.min(min,max):max;
 slider.min=String(canFullRaise?Math.min(min,max):max);slider.max=String(max);slider.step='1';slider.value=String(value);slider.disabled=!humanTurn||!canFullRaise;
 document.querySelectorAll('[data-preset]').forEach(b=>b.disabled=!humanTurn||(!legal.canRaise&&!legal.canAllIn));
 updateRaiseValue();
}
function updateRaiseValue() {const v=+$('raiseSlider').value,legal=view?.legalActions||{};const isAll=!!view&&v>=legal.allInTo;$('raiseValue').textContent=num(v);$('raiseBtn').querySelector('span').innerHTML=`${isAll?'全下':'加注至'} <b>${num(v)}</b>`;}
function renderLogs() {
 const entries=(view.history||[]).filter(e=>e.handNumber===view.handNumber);
 $('actionLog').innerHTML=entries.map(e=>{const street=['street','phase','deal'].includes(e.type);return `<div class="log-item${e.playerId===0?' human':''}${street?' street':''}">${street?'':'<span class="log-dot"></span>'}<span>${esc(e.text)}</span></div>`;}).join('');
 if(activeTab==='live')$('liveTab').scrollTop=$('liveTab').scrollHeight;
}
function renderHistory() {
 if(!run.history.length){$('historyList').innerHTML='<p class="empty-history">第一手故事，正在发生。<br>完成后可以在这里回看。</p>';return;}
 const openHands=[...$('historyList').querySelectorAll('details[open]')].map(d=>d.dataset.hand);
 $('historyList').innerHTML=run.history.map(h=>`<details class="history-card" data-hand="${h.hand}"${openHands.includes(String(h.hand))?' open':''}><summary>第 ${num(h.hand)} 手 <span>${signed(h.net)}</span></summary><p>${esc(remapLegacyText(h.summary))}</p><div>${(h.hole||[]).map(c=>cardHTML(c,{mini:true})).join('')} <span style="color:var(--muted);font-size:9px">${esc(h.handName||'')}</span></div><p>公共牌</p><div>${h.board.length?h.board.map(c=>cardHTML(c,{mini:true})).join(''):'<span style="font-size:10px;color:var(--muted)">翻牌前结束</span>'}</div>${h.showdown?.length?`<div class="showdown-comparison"><p>摊牌对比 · 由最强五张决定</p>${h.showdown.map(p=>`<div class="showdown-row"><b>${esc(p.id===0?p.name:CHARACTER_THEMES[BRAND_ORDER[p.id-1]]?.name||p.name)} <span>${p.won>0?'胜出 · ':''}${esc(p.handName)}</span></b><div class="showdown-holes">${p.hole.map(c=>cardHTML(c,{mini:true})).join('')}<small>底牌</small></div><small>最佳五张</small><div class="best-five">${p.bestCards.map(c=>cardHTML(c,{mini:true})).join('')}</div></div>`).join('')}</div>`:''}<p>${(h.actions||[]).map(e=>esc(e.playerId===0?e.text:remapLegacyText(e.text))).join('<br>')}</p></details>`).join('');
}
function scheduleAI() {
 clearTimeout(botTimer);if(!game||paused||busy||isComplete()||!currentPlayer()||currentPlayer().isHuman)return;
 const delay=settings.speed===2?250:850+Math.random()*650;
 botTimer=setTimeout(()=>{
  if(paused||busy||!game||isComplete()||currentPlayer()?.isHuman)return;
  busy=true;
  try{game.botAction();}
  catch(e){paused=true;toast(`牌局已安全暂停：${e.message}`);}
  finally{busy=false;refresh();}
 },delay);
}
function humanAction(type) {
 if(!isHumanTurn())return;const legal=view.legalActions||game.legalActions();
 if(type==='fold'&&!legal.canFold)return;
 if(type==='call')type=legal.canCheck?'check':'call';
 let amount;if(type==='raise'){amount=Number($('raiseSlider').value);if(amount>=legal.allInTo)type='all-in';if(!legal.canRaise&&!legal.canAllIn)return;}
 busy=true;clearTimeout(botTimer);
 try{game.act(type,amount);}
 catch(e){toast(`未执行：${e.message}`);}
 finally{busy=false;refresh();}
}
function nextHand() {
 if(!game||busy||paused||!isComplete())return;if(view.gameOver){showEnd();return;}
 clearTimeout(botTimer);clearTimeout(resultTimer);lastBoardKey='';busy=true;
 try{game.nextHand();}
 catch(e){toast(`无法开始下一手：${e.message}`);}
 finally{busy=false;refresh();}
}
function preset(kind) {
 if(!isHumanTurn())return;const legal=view.legalActions||game.legalActions();let amount=legal.minRaiseTo;
 if(kind==='half')amount=view.currentBet+Math.round((view.pot+legal.callAmount)/2);
 if(kind==='pot')amount=view.currentBet+view.pot+legal.callAmount;
 if(kind==='all')amount=legal.allInTo;
 amount=Math.max(Number($('raiseSlider').min),Math.min(Number($('raiseSlider').max),amount));$('raiseSlider').value=String(amount);updateRaiseValue();
}
function openModal(html,{eyebrow='VELVET POKER',pause=true}={}) {
 $('modal').classList.remove('rank-guide-open');
 if(game&&pause&&!$('game').classList.contains('hidden')){paused=true;clearTimeout(botTimer);renderActions();}
 $('modalEyebrow').textContent=eyebrow;$('modalContent').innerHTML=html;if(!$('modal').open)$('modal').showModal();
}
function closeModal(resume=true) { if($('modal').open)$('modal').close();if(resume&&game&&!$('game').classList.contains('hidden')){paused=false;renderActions();scheduleAI();} }
function showPause() {
 if(!game)return;
 openModal(`<h2 class="modal-title">休息一下，牌局还在。</h2><p class="modal-copy">第 ${num(view.handNumber)} 手 · ${view.mode==='practice'?'自由练习':'单桌锦标赛'}<br>你的进度会保存在此设备。导出一份存档，也可以换个浏览器接着打。</p><div class="modal-actions"><button class="primary-btn" data-command="resume">继续牌局 <span>→</span></button><button class="secondary-btn" data-command="lobby">保存并返回开局页</button></div><div class="save-actions"><button data-command="export">↓ 导出存档</button><button data-command="import">↑ 导入存档</button><button data-command="coach">◇ 牌桌教练</button><button data-command="talk" aria-pressed="${settings.talk}">桌边短句：${settings.talk?'开':'关'}</button></div><p class="role-theme-note">五位对手是品牌主题角色，采用本地 AI 策略与游戏台词，不是各家模型的实时对战。短句每手最多两条，不会播放语音。</p>`,{eyebrow:'TAKE YOUR TIME'});
}
function showHelp() {
 openModal(`<h2 class="modal-title">学会规则，读懂牌桌。</h2><p class="modal-copy">每人 2 张底牌，牌桌最多 5 张公共牌。从 7 张牌中选出最强的 5 张。赢到摊牌，或让所有对手弃牌，都能拿下底池。</p><div class="rules-grid"><div class="rule-box"><b>四轮下注</b><p>底牌 → 翻牌（3 张）→ 转牌（1 张）→ 河牌（1 张）。每轮依次行动。</p></div><div class="rule-box"><b>你的选择</b><p>过牌不追加；跟注补齐差额；加注提高总额；弃牌退出当前这一手。</p></div><div class="rule-box"><b>单桌锦标赛</b><p>6 人各 2,000 筹码，盲注逐级增长。筹码归零离桌，最后的玩家赢得冠军。</p></div><div class="rule-box"><b>自由练习</b><p>固定 10 / 20 盲注，每手重新获得 2,000 筹码。累计净得分衡量长期表现。</p></div></div><p class="modal-copy">牌型由强到弱</p><div class="hand-ranks">${['皇家同花顺','同花顺','四条','葫芦','同花','顺子','三条','两对','一对','高牌'].map((n,i)=>`<div><span>${String(i+1).padStart(2,'0')}</span>${n}</div>`).join('')}</div><p class="modal-copy" style="font-size:10px;margin-top:21px">全下筹码不足时会建立边池；平手按底池分配。牌桌教练只根据你的底牌和公共牌估算。你也可以让 Codex 解释当前局面或复盘，暗牌仍保持隐藏。<br><br>仅虚拟筹码，无充值或提现。所有游戏和数据在你的设备中运行。</p><div class="modal-actions"><button class="primary-btn" data-command="resume">知道了，回到牌桌 <span>→</span></button></div>`,{eyebrow:'THE BASICS'});
}
function showRankGuide() {
 const human=view?.players?.[0];
 const known=[...(human?.hole||[]),...(view?.board||[])].filter(Boolean);
 let current=null;
 if(known.length>=5){try{current=evaluateHand(known);}catch{}}
 const status=current?`<p class="rank-current-summary">${human.folded?'你已弃牌，事后形成的牌型为':'你当前的牌型是'} <strong>${esc(current.name)}</strong>${human.folded?'。弃牌后不能再争夺本手底池。':'。'}</p>`:'';
 openModal(`<h2 class="modal-title">牌型大小，一眼看懂。</h2><p class="modal-copy">由强到弱，01 最强。始终从你的底牌与公共牌中，选出最强的五张；可以用 0、1 或 2 张底牌。</p>${status}<ol class="rank-ladder">${RANK_GUIDE.map((r,i)=>`<li class="rank-item${current?.name===r.name?' rank-current':''}"><span class="rank-number">${String(i+1).padStart(2,'0')}</span><div class="rank-copy"><b>${r.name}${current?.name===r.name?`<small>${human.folded?'事后牌型':'当前牌型'}</small>`:''}</b><p>${r.description}</p></div><div class="rank-demo" aria-label="${r.name}示例">${r.cards.map(c=>cardHTML(c,{mini:true})).join('')}</div></li>`).join('')}</ol><div class="rank-notes"><h3>同牌型，怎么分胜负？</h3><p>先比主要组合的点数：四条、三条比成组牌的点数，葫芦先比三条再比对子，两对先比大对子再比小对子，一对先比对子；仍相同，再依次比剩余单牌（踢脚牌）。</p><p>顺子、同花顺比较最大一张；同花、高牌从大到小逐张比。最强五张完全等值时，平分有资格争夺的底池。</p><h3>三个容易记错的地方</h3><p><b>点数：</b>A &gt; K &gt; Q &gt; J &gt; 10 &gt; 9 &gt; 8 &gt; 7 &gt; 6 &gt; 5 &gt; 4 &gt; 3 &gt; 2。A 也能放在 A 2 3 4 5 中，这时是最小的顺子；Q K A 2 3 不算顺子。</p><p><b>花色：</b>♠ ♥ ♦ ♣ 不分大小。同花比顺子大；两张底牌同花色，还不算五张牌的同花。</p><p><b>皇家同花顺：</b>是 A 为顶张的最高同花顺，单独列在第一行方便记忆。</p></div><div class="modal-actions"><button class="primary-btn" data-command="resume">记住了，回到牌桌 <span>→</span></button></div>`,{eyebrow:'HAND RANKINGS · STRONGEST FIRST'});
 $('modal').classList.add('rank-guide-open');
}
function showAchievements() {openModal(`<h2 class="modal-title">每个夜晚，都有收获。</h2><p class="modal-copy">已解锁 ${ACHIEVEMENTS.filter(a=>a.check(profile)).length} / ${ACHIEVEMENTS.length} 项成就 · 记录保存在此设备</p><div class="achievement-grid">${ACHIEVEMENTS.map(a=>`<div class="achievement${a.check(profile)?' unlocked':''}"><span>${a.icon}</span><b>${a.title}</b><p>${a.desc}${a.check(profile)?' · 已解锁':''}</p></div>`).join('')}</div><div class="save-actions"><button data-command="import">↑ 导入牌局存档</button>${lastSave?'<button data-command="export">↓ 导出牌局存档</button>':''}</div>`,{eyebrow:'YOUR COLLECTION'});}
function showEnd() {
 if(!game)return;const win=view.winnerId===0;openModal(`<div class="end-trophy">${win?'♛':'♠'}</div><h2 class="modal-title end-title">${win?'今夜，你是赢家。':'好故事，下次继续。'}</h2><p class="modal-copy" style="text-align:center">${win?'你收下了整张牌桌的筹码。':'你的锦标赛已经结束。每一次落座，都是新的开始。'}</p><div class="end-stats"><div><b>${num(run.hands)}</b><span>完成手数</span></div><div><b>${num(run.wins)}</b><span>赢得底池</span></div><div><b>${signed(run.net)}</b><span>净筹码</span></div></div><div class="modal-actions"><button class="primary-btn" data-command="new">再来一场 <span>→</span></button><button class="secondary-btn" data-command="resume">回看最后一手</button></div><div class="save-actions"><button data-command="lobby">返回开局页</button></div>`,{eyebrow:win?'TOURNAMENT CHAMPION':'UNTIL NEXT TIME'});
}
function showCoach() {
 if(!game||!view)return;const cards=view.players[0].hole.filter(Boolean);
 if(cards.length!==2){toast('发出底牌后，教练就可以分析。');return;}
 const opponents=Math.max(1,view.players.filter(p=>p.id!==0&&!p.folded&&!p.eliminated).length);
 openModal('<h2 class="modal-title">读一读这手牌。</h2><p class="modal-copy">正在用你的底牌与公共牌进行抽样估算…</p>',{eyebrow:'YOUR TABLE COACH'});
 setTimeout(()=>{
  try {
   const result=estimateEquity(cards,view.board,opponents,160);
   const equity=typeof result==='number'?result:(result.equity??result.winRate??result.winProbability??0);
   const human=view.players[0],call=isComplete()||human.folded?0:Math.min(human.stack,Math.max(0,view.currentBet-human.bet)),threshold=call>0?call/(view.pot+call):0;
   const all=[...cards,...view.board],name=all.length>=5?evaluateHand(all).name:$('handStrength').textContent;
   $('modalContent').innerHTML=`<h2 class="modal-title">读一读这手牌。</h2><div style="display:flex;gap:6px;margin:21px 0">${cards.map(c=>cardHTML(c)).join('')}</div><div class="coach-stats"><div><b>${(equity*100).toFixed(1)}<span>%</span></b><small>预计底池权益</small></div><div><b>${(threshold*100).toFixed(1)}<span>%</span></b><small>跟注所需权益</small></div></div><p class="modal-copy">当前牌型：<span style="color:var(--gold)">${esc(name)}</span><br>仍在竞争的对手：${opponents} 人${call>0?` · 跟注成本 ${num(call)}`:' · 当前无需补齐下注'}</p><div class="rule-box"><b>${threshold>0?(equity>=threshold?'从底池赔率看，可以进一步考虑跟注。':'单看底池赔率，跟注需要谨慎。'):'可以先观察位置与对手的下注。'}</b><p>这是对未知手牌与后续公共牌的随机抽样（160 次），包含平分底池的权益。对手被视为随机手牌，未建模其下注范围、未来下注或弃牌概率。抽样会波动，不能保证结果。</p></div><p class="modal-copy" style="font-size:10px">分析仅使用你的底牌与公共牌，完全不读取暗牌。跟注所需权益 = 跟注金额 ÷（现有底池 + 跟注金额）；复杂边池时仅供参考。</p><div class="modal-actions"><button class="primary-btn" data-command="resume">继续牌局 <span>→</span></button></div>`;
  }catch(e){$('modalContent').innerHTML=`<h2 class="modal-title">这一手，交给你的判断。</h2><p class="modal-copy">暂时无法完成估算：${esc(e.message)}</p><div class="modal-actions"><button class="primary-btn" data-command="resume">回到牌桌</button></div>`;}
 },50);
}
function exportSave() {
 if(game)persist();if(!lastSave){toast('开始牌局后即可导出存档。');return;}
 const blob=new Blob([JSON.stringify(lastSave,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`velvet-poker-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('存档已导出，保存好这份牌桌记忆。');
}
function importSave() {
 const input=document.createElement('input');input.type='file';input.accept='.json,application/json';
 input.onchange=async()=>{const file=input.files?.[0];if(!file)return;if(file.size>2*1024*1024){toast('存档过大，请选择 2 MB 以内的 JSON 文件。');return;}
  try{const envelope=JSON.parse(await file.text()),r=validateSave(envelope);const s=r.game.getPublicState();openModal(`<h2 class="modal-title">接着这手牌打。</h2><p class="modal-copy">${s.mode==='practice'?'自由练习':'单桌锦标赛'} · 第 ${num(s.handNumber)} 手<br>你的筹码：${num(s.players[0].stack)}<br>导入会替换此设备当前的牌局存档。已有成就仍然保留。</p><div class="modal-actions"><button class="primary-btn" id="confirmImport">确认导入 <span>→</span></button><button class="secondary-btn" data-command="resume">取消</button></div>`);$('confirmImport').onclick=()=>{clearTimeout(botTimer);clearTimeout(resultTimer);game=r.game;run=r.run;paused=false;busy=false;lastBoardKey='';lastHandNumber=0;closeModal(false);resetBanter(game.getPublicState());resetAudio();showGame();refresh({bootstrap:true});toast('存档已导入，欢迎回到牌桌。');};}
  catch(e){toast(`导入失败：${e.message}`);}
 };input.click();
}

loadSettings();bindPokerAudio(audio);
// The next accepted state after returning to this tab establishes a silent baseline.
document.addEventListener('visibilitychange',()=>{soundEvents.reset();});
window.addEventListener('pagehide',resetAudio);
updateLobby();detectSave();
$('opponentLineup').innerHTML=BRAND_ORDER.map(brand=>{const t=CHARACTER_THEMES[brand];return `<span class="lineup-player"><img src="${t.icon}" alt="" draggable="false"><span>${t.name}</span></span>`;}).join('');
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('active',x===b));});
document.querySelectorAll('[data-difficulty]').forEach(b=>b.onclick=()=>{difficulty=b.dataset.difficulty;document.querySelectorAll('[data-difficulty]').forEach(x=>x.classList.toggle('active',x===b));});
$('startBtn').onclick=()=>{
 if(restoredGame&&!restoredGame.getPublicState().gameOver){openModal('<h2 class="modal-title">新一桌，新的可能。</h2><p class="modal-copy">开始新牌局会替换当前的自动存档。需要保留上次进度，可以先导出存档。</p><div class="modal-actions"><button class="primary-btn" data-command="new">开始新牌局 <span>→</span></button><button class="secondary-btn" data-command="export">先导出存档</button></div>');return;}
 createGame();
};
$('continueBtn').onclick=continueGame;$('helpBtn').onclick=showHelp;$('ranksBtn').onclick=showRankGuide;$('achievementsBtn').onclick=showAchievements;$('pauseBtn').onclick=showPause;
$('brandBtn').onclick=()=>{if(game&&!$('game').classList.contains('hidden'))showPause();else window.scrollTo({top:0,behavior:'smooth'});};
$('soundBtn').onclick=async()=>{settings.sound=!settings.sound;writeStorage(SETTINGS_KEY,settings);audio.setEnabled(settings.sound);updateSoundButton();if(settings.sound&&await audio.unlock())audio.play('check');};
$('speedBtn').onclick=()=>{settings.speed=settings.speed===1?2:1;writeStorage(SETTINGS_KEY,settings);$('speedBtn').innerHTML=`${settings.speed}× <span>节奏</span>`;scheduleAI();};
$('foldBtn').onclick=()=>humanAction('fold');$('callBtn').onclick=()=>humanAction('call');$('raiseBtn').onclick=()=>humanAction('raise');$('nextBtn').onclick=nextHand;$('raiseSlider').oninput=updateRaiseValue;
document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>preset(b.dataset.preset));
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{activeTab=b.dataset.tab;document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));$('liveTab').classList.toggle('hidden',activeTab!=='live');$('historyTab').classList.toggle('hidden',activeTab!=='history');});
$('modalClose').onclick=()=>closeModal();$('modal').addEventListener('cancel',e=>{e.preventDefault();closeModal();});
$('modal').addEventListener('click',e=>{const button=e.target.closest('[data-command]');if(!button)return;const command=button.dataset.command;if(command==='resume')closeModal();if(command==='lobby')goLobby();if(command==='new')createGame();if(command==='export')exportSave();if(command==='import')importSave();if(command==='coach')showCoach();if(command==='talk'){settings.talk=!settings.talk;writeStorage(SETTINGS_KEY,settings);if(!settings.talk){clearTimeout(banterTimer);banter.line=null;}renderTableNote();showPause();}});
document.addEventListener('keydown',e=>{if(e.repeat||e.metaKey||e.ctrlKey||e.altKey||$('modal').open||!game||$('game').classList.contains('hidden')||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;const key=e.key.toLowerCase();if(['f','c','r',' '].includes(key)){e.preventDefault();if(key==='f')humanAction('fold');if(key==='c')humanAction('call');if(key==='r')humanAction('raise');if(key===' ')nextHand();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(botTimer);if(game)persist();}else if(game&&!paused&&!$('game').classList.contains('hidden'))scheduleAI();});
window.addEventListener('beforeunload',()=>{if(game)persist();});
window.velvetDebug=Object.freeze({version:'1.0.0',getPublicState:()=>game?game.getPublicState():null,getView:()=>({screen:$('game').classList.contains('hidden')?'lobby':'game',paused,hand:run?.hands||0,sessionNet:run?.net||0})});

$('tabletopHome')?.addEventListener('click',()=>{if(game)persist();});
