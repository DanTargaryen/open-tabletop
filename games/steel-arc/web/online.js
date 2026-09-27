import {MIN_POWER,MAX_POWER,POWER_SPAN} from './aim-limits.js';
import {randomNickname} from './nicknames.js';
import {BIOMES,BIOME_IDS,biomeFor,materialAt} from './biomes.js';
import {renderSize} from './render-budget.js';
import {BattleCamera} from './camera.js';
import {createTutorial} from './tutorial.js';
import {AI_LEVELS,stepSupplyDrops,hasFallingSupply,moveTank,applyRecoil,resolveCalibrationShot} from './engine.js';
import {stepProjectile,splitHiveProjectile,resolveExplosion,resolveDirectHit,settleSupplies} from './engine.js';
import {audio} from './audio.js';
import {createBattleRenderer} from './renderer.js';
import {stepTankControls} from './controls.js';
import {PredictedMovement} from './movement.js';
import {MAX_FIRE_MOVE_STEPS,MAX_FIRE_MOVE_DISTANCE} from './motion-config.js';
import {mapAimPointer} from './aim-control.js';
import {screenHeading} from './aim-angle.js';
import {createFineAimControls} from './aim-fine-controls.js';
import {WORLD_WIDTH,WORLD_HEIGHT,BASE_FUEL,GRAVITY,WEAPONS,WEAPON_IDS,terrainHeightAt,createProjectile,isWeaponAvailable} from './engine.js';

const $=selector=>document.querySelector(selector),setText=(selector,value)=>{const node=$(selector);if(node)node.textContent=value;return node;},entry=$('#entry'),lobby=$('#lobby'),battle=$('#battle'),errorBox=$('#error');
// Keep a stale or partially cached room shell from crashing the render loop.
for(const id of ['team-a-status','team-b-status','round','turn','countdown','turn-order','fuel-value','fuel-bar','aim-control','fire','fire-state','weapon-rack','result','winner','aim-knob','pull-vector','shot-vector','angle-value','power-value','intro-label'])if(!document.getElementById(id)){const node=document.createElement(id==='fuel-bar'?'i':'span');node.id=id;node.hidden=true;document.body.append(node);}
const canvas=$('#battlefield'),ctx=canvas.getContext('2d',{alpha:false,desynchronized:true}),VIEW_WIDTH=1280,VIEW_HEIGHT=720,ZOOM=.88,VIEW_WORLD=VIEW_WIDTH/ZOOM;
const glyphs={calibration:'●',armorPiercing:'◆',quake:'◒',drill:'▶',hive:'✦',meteor:'☢',pulse:'◎'};
const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const mapOptions=`<option value="random">随机战场 · 六张地图轮换</option>${BIOME_IDS.map(id=>`<option value="${id}">${BIOMES[id].name}</option>`).join('')}`;
for(const selector of ['#map-choice','#result-map-choice'])$(selector).innerHTML=mapOptions;
function syncMapChoice(room){
  const choice=BIOME_IDS.includes(room.mapChoice)?room.mapChoice:'random';
  for(const selector of ['#map-choice','#result-map-choice']){$(selector).value=choice;$(selector).disabled=!room.isOwner;}
  const description=choice==='random'?'每局从六张地图中随机抽取；试射场不参与决斗抽取。':BIOMES[choice].description;
  $('#map-description').textContent=description;
  $('#result-map-description').textContent=description;
}
let roomCode='',token='',snapshot=null,pollTimer=null,busy=false,renderScale=1,cameraX=0,cameraTarget=0,lastFrame=performance.now(),introStart=0,introSeed=null;
const seenPickups=new Set(),seenFireContacts=new Set();
let localHeading=45,localPower=68,selectedWeapon='calibration',shotQueue=[],shotAnimation=null,lastShotId=0;
let optimisticShot=null;
const calibrationReplays=[],seenCalibrationShots=new Set();let pendingDuelDialog=false,calibrationResultAt=0,scoreRevealTimer=0;
let modeDialogOpen=false,lastModePhase=null,calibrationScene=null;
const modeDialog=document.createElement('div');modeDialog.id='mode-dialog';modeDialog.hidden=true;modeDialog.innerHTML='<span>多人流程</span><strong id="mode-title"></strong><p id="mode-copy"></p><button id="mode-confirm" type="button">开始</button>';Object.assign(modeDialog.style,{position:'fixed',inset:'0',zIndex:30,display:'grid',placeContent:'center',justifyItems:'center',gap:'10px',background:'#061722cc',backdropFilter:'blur(6px)',color:'#fff0bd',textAlign:'center',fontFamily:'Bahnschrift,sans-serif'});document.body.append(modeDialog);
function showModeDialog(phase){const title=modeDialog.querySelector('#mode-title'),copy=modeDialog.querySelector('#mode-copy'),confirm=modeDialog.querySelector('#mode-confirm');if(!title||!copy||!confirm)return;modeDialogOpen=true;modeDialog.hidden=false;modeDialog.style.display='grid';title.textContent=phase==='calibration'?'打靶模式':'决斗模式';const scores=snapshot?.game?.calibration?.scores||{};if(phase==='calibration'){copy.textContent='双方按顺序发射校准弹，炮弹落地后计算精确分数。';}else{const a=Number(scores.A||0),b=Number(scores.B||0),winner=snapshot?.game?.calibration?.winner||'A';copy.textContent='校准完成，正在结算精确落点……';clearInterval(scoreRevealTimer);let started=performance.now();scoreRevealTimer=setInterval(()=>{const t=Math.min(1,(performance.now()-started)/1100),ease=1-Math.pow(1-t,3);copy.textContent=`校准结算：A 队 ${(a*ease).toFixed(1)} 分，B 队 ${(b*ease).toFixed(1)} 分。`;if(t>=1){clearInterval(scoreRevealTimer);copy.textContent=`校准结束：A 队 ${a.toFixed(1)} 分，B 队 ${b.toFixed(1)} 分。${a===b?'平分，A 队先手。':`${winner} 队获得先手。`}`;}},32);}confirm.textContent=phase==='calibration'?'开始打靶':'开始决斗';}
modeDialog.addEventListener('click',async event=>{if(event.target.id!=='mode-confirm'||busy)return;if(snapshot?.game?.phase==='aim'&&snapshot.room.duelWaiting){await roomCommand('duel-ready',{seed:snapshot.game.seed});if(snapshot?.room.duelWaiting&&!snapshot.room.selfDuelReady)return;}modeDialogOpen=false;modeDialog.hidden=true;modeDialog.style.display='none';if(snapshot?.game?.phase!=='calibration'){calibrationScene=null;battleCamera.reset();syncAimUi();}if(snapshot?.game?.phase==='calibration')introStart=performance.now()-3600;});
const keys=new Set(),movement=new PredictedMovement();
$('#name').value=randomNickname();
const exitMenu=document.createElement('dialog');exitMenu.className='exit-menu';exitMenu.innerHTML='<h2>战斗菜单</h2><p id="surrender-copy">全队真人确认投降后，本队认输。比赛计时不会暂停。</p><div><button id="surrender" type="button">确认投降</button><button id="exit-cancel" type="button">继续战斗</button></div>';document.body.append(exitMenu);
const restartButton=document.createElement('button');restartButton.id='result-start';restartButton.textContent='再来一局';restartButton.className='primary';$('#result-rematch').after(restartButton);
const rematchStatus=document.createElement('p');rematchStatus.id='rematch-status';$('#result').append(rematchStatus);
const remotePositions=new Map(),battleCamera=new BattleCamera();
let moveRequest=null,lastMoveSent=0,moveSoundAt=0;
const tutorial=createTutorial({online:true,onOpen(){keys.clear();$('#aim-control').classList.remove('dragging');},onClose(){keys.clear();}});

function showError(value){if(!errorBox)return;errorBox.textContent=value?.message||String(value);clearTimeout(showError.timer);showError.timer=setTimeout(()=>{if(errorBox)errorBox.textContent='';},3500);}
async function api(path,method='GET',body){
  if(snapshot?.game)path+=`${path.includes('?')?'&':'?'}afterShot=${lastShotId}`;
  const response=await fetch(`/api/steel-arc${path}`,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();if(!response.ok){const error=Error(data.error||'请求失败。');error.status=response.status;throw error;}return data;
}
const requestId=()=>crypto.randomUUID().replaceAll('-','');
let generation=0,polling=false,savedRoom=null;
function saveRoom(){savedRoom={code:roomCode,token};sessionStorage.setItem('steelArcFriend',JSON.stringify(savedRoom));}
function showEntry(){audio.setBattle(false);entry.hidden=false;lobby.hidden=true;battle.hidden=true;keys.clear();movement.reset();$('#resume-room').hidden=!savedRoom;}
function clearRoom(){generation++;sessionStorage.removeItem('steelArcFriend');savedRoom=null;roomCode='';token='';snapshot=null;introSeed=null;clearTimeout(pollTimer);pollTimer=null;showEntry();}

function resizeCanvas(){if(!canvas)return;const {width,height,scale}=renderSize(canvas.getBoundingClientRect().width,window.devicePixelRatio);renderScale=scale;if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';}}
window.addEventListener('resize',resizeCanvas);

function slotCard(seat,room){
  const mine=seat.id===room.selfId,empty=seat.id.startsWith('empty-'),occupied=!seat.ai&&!empty,canChoose=empty||mine,canAi=room.isOwner&&empty;
  return `<article class="member ${mine?'current':''} ${seat.ai?'ai':occupied?'occupied':'empty'}" data-team="${seat.team}"><span class="slot">${seat.slot} · ${seat.team==='A'?'第一阵线':'第二阵线'}</span><strong>${escapeHtml(seat.name)}${seat.owner?' · 房主':''}</strong><small>${seat.ai?`${AI_LEVELS[seat.difficulty||'normal'].label} AI`:seat.ready?'已准备':empty?'空位':'等待准备'}</small>${canChoose?`<button class="choose" type="button" data-slot="${seat.slot}">${mine?'当前位置':'坐这个位置'}</button>`:''}${canAi?`<button class="add-ai" type="button" data-ai-slot="${seat.slot}">添加 AI</button>`:''}${seat.ai&&room.isOwner?`<label class="ai-level">难度 <select aria-label="${seat.slot} AI 难度" data-ai-difficulty="${seat.slot}">${Object.entries(AI_LEVELS).map(([id,level])=>`<option value="${id}" ${id===(seat.difficulty||'normal')?'selected':''}>${level.label}</option>`).join('')}</select></label><button class="add-ai" type="button" data-ai-slot="${seat.slot}" data-ai-enabled="false">移除 AI</button>`:''}</article>`;
}
function renderLobby(room){
  $('#room-code').textContent=room.code;$('#roster').innerHTML=room.seats.map(seat=>slotCard(seat,room)).join('');
  syncMapChoice(room);
  $('#ready').textContent=room.selfReady?'取消准备':'准备';
  const enabled=room.seats.filter(seat=>seat.ai||!seat.id.startsWith('empty-'));
  const hasA=enabled.some(seat=>seat.team==='A'),hasB=enabled.some(seat=>seat.team==='B');
  $('#start').disabled=!room.isOwner||enabled.length<2||!hasA||!hasB||!room.roster.every(item=>item.ready);
  $('#start').hidden=!room.isOwner;
  $('#hint').textContent=!hasA||!hasB?'双方都需要至少一个真人或 AI。':!room.roster.every(item=>item.ready)?'等待所有真人准备。':room.isOwner?'双方已就位，可以开始战斗。':'等待房主开始战斗。';
}
function healthCard(tank){return `<article class="tank-stat ${tank.hp<=0?'dead':''}"><header><b>${tank.id}</b><span>${escapeHtml(tank.name)} · ${Math.ceil(tank.hp)}</span></header><div class="hp"><i style="width:${tank.hp}%"></i></div></article>`;}
function queueShots(game){
  const history=game.shotHistory||game.lastShot?[...(game.shotHistory||[]),...(!game.shotHistory?.length&&game.lastShot?[game.lastShot]:[])]:[];
  for(const shot of history)if(shot.id>lastShotId){if(optimisticShot?.seed===game.seed&&optimisticShot.id===shot.id&&optimisticShot.owner===shot.owner)optimisticShot=null;else shotQueue.push(shot);lastShotId=Math.max(lastShotId,shot.id);}
}
function renderBattle(room,game){
  queueShots(game);const authoritativeGame=game;game=shotAnimation?.state||game;
  $('#team-a-status').innerHTML=authoritativeGame.turnOrder.filter(slot=>slot[0]==='A').map(slot=>healthCard(authoritativeGame.tanks[slot])).join('');$('#team-b-status').innerHTML=authoritativeGame.turnOrder.filter(slot=>slot[0]==='B').map(slot=>healthCard(authoritativeGame.tanks[slot])).join('');
  const calibrationTurn=game.phase==='calibration'?(game.calibration?.turn||'—'):game.turn;
  battle.classList.toggle('calibrating',game.phase==='calibration');setText('#round',game.phase==='calibration'?'先手争夺':`第 ${game.round} 轮`);setText('#turn',game.phase==='ended'?'—':calibrationTurn);
  const order=$('#turn-order');if(order)order.innerHTML=game.turnOrder.map(slot=>`<b class="${slot===calibrationTurn?'active':''} ${game.tanks[slot].hp<=0?'dead':''}">${slot}</b>`).join('');
  setText('#log',`${biomeFor(authoritativeGame.terrain)?.name||'经典战场'} · ${biomeFor(authoritativeGame.terrain)?.time||''}\n${(snapshot.log||[]).slice(-3).join('\n')}`);
  const mine=movement.state?.tanks[room.selfSlot]||authoritativeGame.tanks[room.selfSlot],calibrating=room.status==='playing'&&game.phase==='calibration'&&game.calibration?.turn===room.selfSlot&&!game.calibration?.shots?.[room.selfSlot]&&!isIntro()&&!shotAnimation&&!shotQueue.length,canAct=!room.duelWaiting&&room.status==='playing'&&game.turn===room.selfSlot&&game.phase==='aim'&&!isIntro()&&!shotAnimation&&!shotQueue.length;
  setText('#fuel-value',Math.ceil(mine.fuel));const fuelBar=$('#fuel-bar');if(fuelBar)fuelBar.style.width=`${mine.fuel/BASE_FUEL*100}%`;const aimControl=$('#aim-control'),fire=$('#fire');if(aimControl)aimControl.disabled=!(canAct||calibrating);if(fire){fire.disabled=!(canAct||calibrating);fire.textContent=calibrating?'锁定校准射击':'开火';}
  setText('#fire-state',room.duelWaiting?'等待双方确认决斗':shotAnimation?.dropping?'补给投放中':shotAnimation?'行动回放中':calibrating?'调整地面靶落点后锁定':canAct?'准备就绪':game.phase==='calibration'?`等待 ${game.calibration?.turn||'其他玩家'} 完成校准`:isIntro()?'战场扫描中':`等待 ${game.turn}`);
  $('#weapon-rack').innerHTML=(game.phase==='calibration'?['calibration']:WEAPON_IDS).map(id=>{const weapon=WEAPONS[id],available=isWeaponAvailable(mine,id,game.round),ammo=Number.isFinite(weapon.ammo)?mine.ammo[id]??0:'∞';return `<button type="button" class="weapon ${id===selectedWeapon?'active':''} ${available?'':ammo===0?'empty':'locked'}" style="--weapon:${weapon.color}" data-weapon="${id}" ${canAct&&available?'':'disabled'}><b>${glyphs[id]}</b><span>${weapon.short}</span><small>${ammo==='∞'?'∞':`×${ammo}`}</small></button>`;}).join('');
  if(!isWeaponAvailable(mine,selectedWeapon,game.round))selectedWeapon='calibration';
  const result=$('#result');if(result)result.hidden=room.status!=='finished'||Boolean(shotAnimation)||shotQueue.length>0;if(room.status==='finished')setText('#winner',game.winner==='draw'?'双方平局':`${game.winner} 队胜利`);
}
function render(data){
  if(snapshot?.room.code===data.room.code&&snapshot.room.version>data.room.version)return;
  if(snapshot?.room.status!==data.room.status)audio.setBattle(data.room.status==='playing');
  const lobbyChanged=snapshot?.room.code!==data.room.code||snapshot?.room.version!==data.room.version;
  snapshot=data;if(data.game)audio.setEnvironment((data.game.battleTerrain||data.game.terrain).themeId);const room=data.room;movement.accept(data.game,room.selfSlot);
  if(room.status==='finished'){
    exitMenu.close();modeDialogOpen=false;modeDialog.hidden=true;modeDialog.style.display='none';clearInterval(scoreRevealTimer);
    calibrationScene=null;calibrationReplays.length=0;pendingDuelDialog=false;
  }
  $('#result-rematch').textContent=room.selfReady?'已确认再次决斗':'再次决斗';$('#result-rematch').disabled=room.selfReady;
  if(room.status==='finished')syncMapChoice(room);
  $('#result-leave').textContent='退出';restartButton.hidden=!room.isOwner;
  restartButton.disabled=room.status!=='finished'||!room.roster.every(item=>item.ready);
  rematchStatus.textContent=room.roster.map(item=>`${item.name}：${item.ready?'已确认':'等待确认'}`).join(' · ');
  if(data.game&&introSeed!==data.game.seed){
    seenFireContacts.clear();seenCalibrationShots.clear();calibrationReplays.length=0;calibrationScene=null;optimisticShot=null;
    pendingDuelDialog=false;calibrationResultAt=0;lastModePhase=null;
    clearInterval(scoreRevealTimer);remotePositions.clear();
  }
  if(data.game?.phase==='calibration')calibrationScene=structuredClone(data.game);
  else if(calibrationScene&&data.game?.calibration)calibrationScene.calibration=structuredClone(data.game.calibration);
  for(const shot of Object.values(data.game?.calibration?.shots||{})){if(!seenCalibrationShots.has(shot.tankId)){seenCalibrationShots.add(shot.tankId);calibrationReplays.push({shot,at:performance.now(),duration:Math.max(1.2,(shot.points?.length||1)/120),impactShown:false});}}
  if(data.game&&data.game.phase!==lastModePhase){if(data.game.phase==='calibration')showModeDialog(data.game.phase);if(data.game.phase==='aim'&&(lastModePhase==='calibration'||(room.duelWaiting&&!room.selfDuelReady))){pendingDuelDialog=true;calibrationResultAt=0;}lastModePhase=data.game.phase;}
  for(const event of data.game?.events||[])if(event.type==='fireContact'&&!seenFireContacts.has(event.id)){seenFireContacts.add(event.id);renderer.effectState().damageLabels.push({x:event.x,y:event.y-50,text:`-${event.amount}`,life:1.2});audio.burn();}
  for(const event of data.game?.events||[])if(event.type==='pickup'&&event.tankId===room.selfSlot){const key=`${data.game.seed}:${event.supplyId}:${event.tankId}`;if(!seenPickups.has(key)){seenPickups.add(key);const label=event.reward==='health'?`生命 +${event.amount}`:`获得 ${WEAPONS[event.weaponId]?.name||'稀有炮弹'} ×1`;showError(`补给已生效：${label}`);audio.pickup(event.reward);}}
  entry.hidden=true;lobby.hidden=room.status!=='waiting';battle.hidden=!['playing','finished'].includes(room.status);
  if(room.status==='waiting'){if(lobbyChanged)renderLobby(room);}
  else if(data.game){
    if(introSeed!==data.game.seed){introSeed=data.game.seed;battleCamera.reset();introStart=performance.now();lastShotId=0;shotQueue=[];shotAnimation=null;localHeading=data.game.tanks[room.selfSlot].heading;localPower=data.game.tanks[room.selfSlot].power;selectedWeapon='calibration';renderer.resetEffects();resizeCanvas();syncAimUi();}
    renderBattle(room,data.game);
  }
}
function handleFailure(error){if([403,404].includes(error.status))clearRoom();showError(error);}
async function refresh(){if(!roomCode||busy||polling||moveRequest)return;const current=generation;polling=true;try{const data=await api(`/rooms/${roomCode}`);if(current===generation&&!moveRequest)render(data);}catch(error){if(current===generation)handleFailure(error);}finally{polling=false;}}
function beginPolling(){clearTimeout(pollTimer);if(roomCode)pollTimer=setTimeout(async()=>{await refresh();beginPolling();},snapshot?.room.status==='playing'?100:1000);}
async function action(payload){
  if(busy||!snapshot)return;busy=true;
  let provisional=null,failed=false;
  try{
    provisional=previewShot(payload);
    if(payload.type==='fire'){
      if(moveRequest)await moveRequest;
      const steps=movement.pending.map(input=>input.distance),distance=steps.reduce((sum,value)=>sum+Math.abs(value),0);
      if(steps.length>MAX_FIRE_MOVE_STEPS||distance>MAX_FIRE_MOVE_DISTANCE)await flushMovement();
      else payload={...payload,steps};
    }else await flushMovement();
    render(await api(`/rooms/${roomCode}/action`,'POST',{...payload,version:snapshot.room.version,requestId:requestId()}));
  }catch(error){
    failed=true;
    if(provisional?.type==='fire'&&shotAnimation?.optimistic)shotAnimation=null;
    if(provisional?.type==='calibration'){seenCalibrationShots.delete(provisional.tankId);const index=calibrationReplays.findIndex(replay=>replay===provisional.replay);if(index>=0)calibrationReplays.splice(index,1);}
    optimisticShot=null;handleFailure(error);
  }finally{busy=false;if(failed&&roomCode)void refresh();}
}

function previewShot(payload){
  const id=snapshot?.room.selfSlot;if(!id||!snapshot?.game)return null;
  if(payload.type==='calibration'){
    const state=structuredClone(snapshot.game),shot=resolveCalibrationShot(state,id,payload);
    if(!shot)return null;
    const replay={shot,at:performance.now(),duration:Math.max(1.2,(shot.points?.length||1)/120),impactShown:false};
    calibrationReplays.push(replay);seenCalibrationShots.add(id);audio.fire('calibration');
    return {type:'calibration',tankId:id,replay};
  }
  if(payload.type!=='fire')return null;
  const state=structuredClone(movement.state||snapshot.game),tank=state.tanks[id];if(!tank)return null;
  tank.heading=payload.heading;tank.power=payload.power;tank.weapon=payload.weaponId;
  const nextId=state.volleySerial+1;state.volleySerial=nextId;state.phase='flight';
  const projectile={...createProjectile(state,id),trail:[]};
  shotAnimation={state,projectiles:[projectile],accumulator:0,settle:0,postSupplies:structuredClone(state.supplies||[]),dropping:false,aimDelay:0,launched:false,pendingProjectiles:[projectile],optimistic:true};
  shotAnimation.projectiles=[];optimisticShot={seed:state.seed,id:nextId,owner:id};
  return {type:'fire'};
}

function sendMovement(){
  if(moveRequest)return moveRequest;
  const batch=movement.batch();if(!batch.length||!snapshot)return Promise.resolve();
  const current=++generation;lastMoveSent=performance.now();
  moveRequest=(async()=>{
    try{
      const data=await api(`/rooms/${roomCode}/action`,'POST',{type:'move',steps:batch.map(input=>input.distance),version:snapshot.room.version,requestId:requestId()});
      if(current===generation){movement.acknowledge(batch);render(data);}
    }catch(error){
      if(current===generation){movement.reset();keys.clear();handleFailure(error);if(roomCode)render(await api(`/rooms/${roomCode}`));}
      throw error;
    }finally{moveRequest=null;}
  })();return moveRequest;
}
async function flushMovement(){if(moveRequest)await moveRequest;while(movement.pending.length)await sendMovement();}
function updateControls(dt,now){
  if(canAct()&&movement.state){
    const id=snapshot.room.selfSlot,tank=movement.state.tanks[id];
    tank.heading=localHeading;tank.power=localPower;
    const result=stepTankControls(movement.state,id,keys,dt,{mirrored:mirroredAim()});movement.record(result.steps);
    localHeading=tank.heading;localPower=tank.power;
    if(result.changed){const r=(localPower-MIN_POWER)/POWER_SPAN,displayHeading=snapshot.room.selfSlot?.[0]==='B'?(180-localHeading+360)%360:localHeading,a=displayHeading*Math.PI/180;updateAimUi(-Math.cos(a)*r,Math.sin(a)*r);setText('#fuel-value',Math.ceil(tank.fuel));const fuelBar=$('#fuel-bar');if(fuelBar)fuelBar.style.width=`${tank.fuel/BASE_FUEL*100}%`;}
    if(result.steps.length&&now>moveSoundAt){audio.move(materialAt(movement.state.terrain,tank.x));moveSoundAt=now+105;}
  }
  if(movement.pending.length&&!moveRequest&&!busy&&now-lastMoveSent>=80)sendMovement().catch(()=>{});
}

async function enterRoom(joining){
  if(busy)return;
  const code=$('#code').value.trim().toUpperCase(),name=$('#name').value.trim();
  if(!name)return showError('请输入昵称。');
  if(joining&&!/^[A-Z2-9]{6}$/.test(code))return showError('请输入六位房间码。');
  busy=true;$('#create').disabled=true;$('#join').disabled=true;
  try{
    const keyName='steelArcEntry.'+(joining?code:'create');
    const key=sessionStorage.getItem(keyName)||crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','').slice(0,16);
    sessionStorage.setItem(keyName,key);
    const data=await api(joining?`/rooms/${code}/join`:'/rooms','POST',{name,seatKey:key});
    generation++;roomCode=data.room.code;token=data.token;snapshot=null;saveRoom();render(data);beginPolling();
    sessionStorage.removeItem(keyName);
  }catch(error){showError(error);}finally{busy=false;$('#create').disabled=false;$('#join').disabled=false;}
}
async function roomCommand(operation,body={}){
  if(busy||!snapshot)return;busy=true;
  try{await flushMovement();generation++;const data=await api(`/rooms/${roomCode}/${operation}`,'POST',body);if(operation==='leave')clearRoom();else render(data);}
  catch(error){handleFailure(error);}finally{busy=false;beginPolling();}
}
$('#create').onclick=()=>enterRoom(false);$('#join').onclick=()=>enterRoom(true);
$('#ready').onclick=()=>roomCommand('ready',{ready:!snapshot.room.selfReady});
$('#start').onclick=()=>roomCommand('start');
for(const selector of ['#map-choice','#result-map-choice'])$(selector).onchange=event=>roomCommand('map',{mapChoice:event.target.value});
async function leave(){await roomCommand('leave');}
$('#leave').onclick=leave;$('#result-leave').onclick=leave;$('#result-rematch').onclick=()=>roomCommand('rematch');
restartButton.onclick=()=>roomCommand('start');
$('#battle-leave').onclick=()=>{keys.clear();if(snapshot?.room.status==='finished')return;$('#surrender').disabled=Boolean(snapshot?.room.selfSurrendered);$('#surrender').textContent=snapshot?.room.selfSurrendered?'已投降，等待队友':'确认投降';exitMenu.showModal();};
$('#exit-cancel').onclick=()=>exitMenu.close();
$('#surrender').onclick=async()=>{await roomCommand('surrender');exitMenu.close();};
$('#copy').onclick=async()=>{const link=`${location.origin}/games/steel-arc/online.html?room=${roomCode}`;try{await navigator.clipboard.writeText(link);$('#copy').textContent='已复制';setTimeout(()=>$('#copy').textContent='复制邀请',1300);}catch{showError('复制失败，请手动复制房间码。');}};
document.addEventListener('change',event=>{const select=event.target.closest('[data-ai-difficulty]');if(select)roomCommand('ai',{slot:select.dataset.aiDifficulty,enabled:true,difficulty:select.value});});
document.addEventListener('click',async event=>{const ai=event.target.closest('[data-ai-slot]');if(ai)await roomCommand('ai',{slot:ai.dataset.aiSlot,enabled:ai.dataset.aiEnabled!=='false'});const slot=event.target.closest('[data-slot]');if(slot)await roomCommand('team',{slot:slot.dataset.slot});const weapon=event.target.closest('[data-weapon]');if(weapon&&!weapon.disabled){selectedWeapon=weapon.dataset.weapon;renderBattle(snapshot.room,snapshot.game);}});

function isIntro(){return introStart&&performance.now()-introStart<3600;}
function canAct(){return !snapshot?.room.duelWaiting&&!exitMenu.open&&!calibrationScene&&!tutorial.isOpen&&!modeDialogOpen&&snapshot?.room.status==='playing'&&snapshot.game?.phase==='aim'&&snapshot.game.turn===snapshot.room.selfSlot&&!isIntro()&&!busy&&!shotAnimation&&!shotQueue.length;}
function canCalibrate(){return !exitMenu.open&&!tutorial.isOpen&&!modeDialogOpen&&snapshot?.room.status==='playing'&&snapshot.game?.phase==='calibration'&&snapshot.game.calibration?.turn===snapshot.room.selfSlot&&!snapshot.game.calibration?.shots?.[snapshot.room.selfSlot]&&!isIntro()&&!busy&&!shotAnimation&&!shotQueue.length;}
function mirroredAim(){return !calibrationScene&&snapshot?.room.selfSlot?.[0]==='B';}
function aimHeading(){return screenHeading(localHeading,mirroredAim());}
function syncAimUi(){const a=aimHeading()*Math.PI/180,r=(localPower-MIN_POWER)/POWER_SPAN;updateAimUi(-Math.cos(a)*r,Math.sin(a)*r);}
function updateAim(event){
  if(!(canAct()||canCalibrate()))return;const rect=$('#aim-control').getBoundingClientRect(),cx=rect.left+rect.width/2,cy=rect.top+rect.height/2,max=rect.width*.42,mapped=mapAimPointer(event.clientX-cx,event.clientY-cy,max,{heading:aimHeading(),power:localPower,precision:event.shiftKey});
  localHeading=screenHeading(mapped.heading,mirroredAim());localPower=mapped.power;updateAimUi(mapped.nx,mapped.ny);
}
function updateAimUi(nx,ny){
  const length=Math.min(1,Math.hypot(nx,ny)),angle=Math.atan2(ny,nx)*180/Math.PI;const knob=$('#aim-knob'),pull=$('#pull-vector'),shot=$('#shot-vector');if(knob){knob.style.left=`${50+nx*39}%`;knob.style.top=`${50+ny*39}%`;}if(pull){pull.style.width=`${length*39}%`;pull.style.transform=`rotate(${angle}deg)`;}if(shot){shot.style.width=`${18+length*25}%`;shot.style.transform=`rotate(${angle+180}deg)`;}setText('#angle-value',`${Math.round(aimHeading())}°`);setText('#power-value',localPower);if(typeof fineAim!=='undefined')fineAim.update({heading:aimHeading(),power:localPower});
}
const aim=$('#aim-control');aim.querySelector('.aim-hint').textContent='Shift 精确调整';aim.addEventListener('pointerdown',event=>{if(!(canAct()||canCalibrate()))return;aim.setPointerCapture(event.pointerId);aim.classList.add('dragging');updateAim(event);});aim.addEventListener('pointermove',event=>{if(aim.hasPointerCapture(event.pointerId))updateAim(event);});aim.addEventListener('pointerup',event=>{if(aim.hasPointerCapture(event.pointerId))aim.releasePointerCapture(event.pointerId);aim.classList.remove('dragging');});
const fineAim=createFineAimControls({container:$('#aim-panel'),getValues:()=>({heading:aimHeading(),power:localPower}),onChange:values=>{if(!(canAct()||canCalibrate()))return false;if(Number.isFinite(values.heading))localHeading=screenHeading(values.heading,mirroredAim());if(Number.isFinite(values.power))localPower=values.power;const displayHeading=snapshot?.game?.phase!=='calibration'&&snapshot?.room.selfSlot?.[0]==='B'?(180-localHeading+360)%360:localHeading,r=(localPower-MIN_POWER)/POWER_SPAN,a=displayHeading*Math.PI/180;updateAimUi(-Math.cos(a)*r,Math.sin(a)*r);return true;}});
$('#fire').onclick=()=>{if(canCalibrate())action({type:'calibration',heading:localHeading,power:localPower});else if(canAct())action({type:'fire',heading:localHeading,power:localPower,weaponId:selectedWeapon});};
window.addEventListener('keydown',event=>{
  if(['INPUT','SELECT'].includes(document.activeElement?.tagName))return;
  if(['KeyA','KeyD','KeyW','KeyS','KeyQ','KeyE'].includes(event.code)){event.preventDefault();keys.add(event.code);}
  if(event.code==='Space'){event.preventDefault();if(canAct())$('#fire').click();return;}
  const number=Number(event.key);if(number>=1&&number<=7&&canAct()){const id=WEAPON_IDS[number-1],tank=snapshot.game.tanks[snapshot.room.selfSlot];if(isWeaponAvailable(tank,id,snapshot.game.round)){selectedWeapon=id;renderBattle(snapshot.room,snapshot.game);}return;}
});
window.addEventListener('keyup',event=>keys.delete(event.code));
window.addEventListener('blur',()=>keys.clear());
document.addEventListener('visibilitychange',()=>{if(document.hidden)keys.clear();});

const renderer=createBattleRenderer(ctx);
function drawAim(game){
    if(!(canAct()||canCalibrate()))return;
    const id=snapshot.room.selfSlot,tank={...game.tanks[id],heading:localHeading,power:localPower,weapon:selectedWeapon};
    // drawAimDots creates its projectile from this tank. Do not call setFrame
    // here: doing so clears the live projectile list before drawProjectiles.
    renderer.drawAimDots(tank);
  }
  function advanceReplay(dt){
  if(!shotAnimation&&shotQueue.length){
    const shot=shotQueue.shift();
    if(!shot.replayState)return;
    shotAnimation={state:structuredClone(shot.replayState),projectiles:structuredClone(shot.replayProjectiles).map(p=>({...p,trail:[]})),accumulator:0,settle:0,postSupplies:structuredClone(shot.postSupplies||[]),dropping:false,aimDelay:.65,launched:false};
    if(shot.replayMoveState){shotAnimation.fireState=shotAnimation.state;shotAnimation.state=structuredClone(shot.replayMoveState);}
    shotAnimation.pendingProjectiles=shotAnimation.projectiles;shotAnimation.projectiles=[];
  }
  if(!shotAnimation)return;
  const replay=shotAnimation;
  if(replay.fireState){
    const id=replay.state.turn,tank=replay.state.tanks[id],delta=replay.fireState.tanks[id].x-tank.x;
    if(Math.abs(delta)>1){const moved=moveTank(replay.state,id,Math.sign(delta)*Math.min(Math.abs(delta),74*dt));if(moved)return;}
    replay.state=replay.fireState;replay.fireState=null;
  }
  if(!replay.launched){replay.aimDelay-=dt;if(replay.aimDelay>0)return;replay.launched=true;replay.projectiles=replay.pendingProjectiles;applyRecoil(replay.state,replay.projectiles[0].owner,replay.projectiles[0]);audio.fire(replay.projectiles[0].weaponId);}
  replay.accumulator+=dt;
  renderer.setFrame({state:replay.state,cameraX,projectiles:replay.projectiles});
  while(replay.accumulator>=1/120){
    for(const p of [...replay.projectiles]){
      if(!p.alive)continue;
      p.trail.push({x:p.x,y:p.y});if(p.trail.length>18)p.trail.shift();
      const impact=stepProjectile(p,replay.state,1/120);
      if(impact.type==='split'){replay.projectiles.push(...splitHiveProjectile(p).map(child=>({...child,trail:[]})));audio.split();}
      else if(impact.type==='bounce')audio.bounce();
      else if(impact.type==='drill')audio.fissure();
      else if(impact.type==='tank'&&impact.pierce){const hit=resolveDirectHit(replay.state,p,impact.tankId);renderer.spawnExplosion(hit);audio.explode(p.weaponId);}
      else if(impact.type==='terrain'||impact.type==='tank'){const explosion=resolveExplosion(replay.state,p);renderer.spawnExplosion(explosion);audio.explode(p.weaponId,explosion.material);settleSupplies(replay.state);}
    }
    replay.accumulator-=1/120;
  }
  const flying=replay.projectiles.filter(p=>p.alive);
  if(!flying.length){
    replay.settle+=dt;
    if(replay.settle>.9){
      if(!replay.dropping){replay.dropping=true;replay.state.supplies=replay.postSupplies;if(hasFallingSupply(replay.state))audio.supplyDrop();}
      const falling=hasFallingSupply(replay.state);stepSupplyDrops(replay.state,dt);
      if(!hasFallingSupply(replay.state)){if(falling)audio.supplyLand();shotAnimation=null;}
    }
  }
}
 function calibrationProjectiles(now){const projectiles=[];for(let i=calibrationReplays.length-1;i>=0;i--){const replay=calibrationReplays[i],points=Array.isArray(replay.shot?.points)?replay.shot.points:[],duration=Number.isFinite(replay.duration)&&replay.duration>0?replay.duration:1,progress=Math.min(1,Math.max(0,(now-replay.at)/1000/duration));if(!points.length||progress>=1){if(progress>=1&&!replay.impactShown){replay.impactShown=true;renderer.spawnExplosion({x:Number(replay.shot.x)||0,y:Number(replay.shot.y)||0,radius:WEAPONS.calibration.blast,crater:WEAPONS.calibration.crater,weaponId:'calibration',damages:{}});audio.explode('calibration');}if(progress>=1||!points.length)calibrationReplays.splice(i,1);continue;}const index=Math.max(0,Math.min(points.length-1,Math.floor(progress*(points.length-1)))),point=points[index]||points[0];if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y)){calibrationReplays.splice(i,1);continue;}const previous=points[Math.max(0,index-1)]||point,next=points[Math.min(points.length-1,index+1)]||point;projectiles.push({x:point.x,y:point.y,previousX:Number.isFinite(previous.x)?previous.x:point.x,previousY:Number.isFinite(previous.y)?previous.y:point.y,vx:(Number.isFinite(next.x)?next.x:point.x)-(Number.isFinite(previous.x)?previous.x:point.x),vy:(Number.isFinite(next.y)?next.y:point.y)-(Number.isFinite(previous.y)?previous.y:point.y),trail:points.slice(Math.max(0,index-18),index).filter(item=>item&&Number.isFinite(item.x)&&Number.isFinite(item.y)),weaponId:'calibration',alive:true,age:progress,owner:replay.shot.tankId});}return projectiles;}
function presentation(dt){
  const game=movement.state||snapshot.game,tanks={...game.tanks};
  for(const [id,tank] of Object.entries(tanks)){
    const key=`${game.seed}:${id}`,last=remotePositions.get(key);
    if(last&&id!==snapshot.room.selfSlot&&Math.abs(last.x-tank.x)<100){
      const t=1-Math.exp(-dt*20);tanks[id]={...tank,x:last.x+(tank.x-last.x)*t,y:last.y+(tank.y-last.y)*t,slope:last.slope+(tank.slope-last.slope)*t};
    }
    remotePositions.set(key,tanks[id]);
  }
  return {...game,tanks};
}
function renderCanvas(now){
  const dt=Math.min(.033,(now-lastFrame)/1000||0);lastFrame=now;updateControls(dt,now);advanceReplay(dt);renderer.updateEffects(dt);ctx.setTransform(renderScale,0,0,renderScale,0,0);ctx.clearRect(0,0,VIEW_WIDTH,VIEW_HEIGHT);if(snapshot?.game){renderer.setFrame({state:snapshot.game,cameraX});renderer.drawSky();}
  if(snapshot?.game){const game=calibrationScene||shotAnimation?.state||presentation(dt),elapsed=performance.now()-introStart,maxCamera=Math.max(0,game.terrain.width-VIEW_WORLD),remaining=Math.max(0,Math.ceil((snapshot.room.deadline-Date.now())/1000));$('#countdown').textContent=snapshot.room.status==='finished'?'已结束':snapshot.room.duelWaiting?'等待确认':`${remaining}s`;if(isIntro()){const p=Math.min(1,elapsed/3600);cameraTarget=p<.72?maxCamera*Math.min(1,p/.72):maxCamera*(1-(p-.72)/.28);$('#intro-label').hidden=false;}else{$('#intro-label').hidden=true;battleCamera.update(game,shotAnimation?.projectiles||[],dt);cameraTarget=battleCamera.x;}if(isIntro())cameraX+=(cameraTarget-cameraX)*Math.min(1,dt*3.5);else cameraX=battleCamera.x;
    const calibrationView=game.phase==='calibration',frameGame=game;setText('#countdown',snapshot.room.status==='finished'?'已结束':snapshot.room.duelWaiting?'等待确认':`${remaining}s`);ctx.save();const zoom=isIntro()?ZOOM:calibrationView?Math.min(.58,VIEW_WIDTH/(game.terrain.width+120)):battleCamera.zoom,flip=!calibrationView&&snapshot.room.selfSlot?.[0]==='B',drawCamera=calibrationView?(game.terrain.width-VIEW_WIDTH/zoom)/2:(cameraX);const calibrationVisible=new Set(Object.keys(frameGame.calibration?.shots||{}).filter(id=>!calibrationReplays.some(replay=>replay.shot.tankId===id)));if(flip){ctx.translate(VIEW_WIDTH,0);ctx.scale(-1,1);}ctx.scale(zoom,zoom);ctx.translate(-drawCamera,-(isIntro()?WORLD_HEIGHT-VIEW_HEIGHT/ZOOM:calibrationView?520-500/zoom:battleCamera.y));renderer.setFrame({state:frameGame,cameraX:drawCamera,projectiles:[...(shotAnimation?.projectiles||[]),...calibrationProjectiles(now)],visibleCalibrationShots:calibrationVisible});renderer.drawTerrain();renderer.drawCalibrationTarget();renderer.drawFireZones();renderer.drawSupplies();drawAim(frameGame);for(const slot of frameGame.turnOrder)renderer.drawTank((canAct()||canCalibrate())&&slot===snapshot.room.selfSlot?{...frameGame.tanks[slot],heading:localHeading}:frameGame.tanks[slot],slot[0]==='A');renderer.drawProjectiles();renderer.drawEffects();ctx.restore();renderer.drawVignette();
    if(pendingDuelDialog&&!calibrationReplays.length){if(!calibrationResultAt)calibrationResultAt=now;if(now-calibrationResultAt>=3000){pendingDuelDialog=false;showModeDialog('aim');}}
  }
  requestAnimationFrame(renderCanvas);
}

const queryRoom=new URLSearchParams(location.search).get('room');if(queryRoom){$('#code').value=queryRoom.toUpperCase();}
const soundButton=document.createElement('button');soundButton.type='button';soundButton.id='battle-sound';
const battleTools=document.createElement('div');battleTools.className='battle-tools';$('#battle-leave').before(battleTools);battleTools.append(soundButton,$('#battle-leave'));
const tutorialButton=document.createElement('button');tutorialButton.type='button';tutorialButton.id='battle-tutorial';tutorialButton.textContent='教程';tutorialButton.setAttribute('aria-label','打开作战教程');tutorialButton.onclick=()=>tutorial.open();battleTools.prepend(tutorialButton);
function syncSound(){soundButton.textContent=audio.muted?'🔇':'🔊';soundButton.title=audio.muted?'开启声音':'关闭声音';soundButton.setAttribute('aria-label',soundButton.title);soundButton.setAttribute('aria-pressed',String(!audio.muted));}
soundButton.onclick=()=>{audio.toggle();syncSound();};syncSound();
const resumeButton=document.createElement('button');resumeButton.id='resume-room';resumeButton.type='button';resumeButton.textContent='重新连接原房间';resumeButton.hidden=true;$('#create').after(resumeButton);
try{const saved=JSON.parse(sessionStorage.getItem('steelArcFriend')||'null');if(saved?.code&&saved?.token&&(!queryRoom||saved.code===queryRoom.toUpperCase()))savedRoom=saved;}catch{}
resumeButton.onclick=async()=>{if(busy||!savedRoom)return;roomCode=savedRoom.code;token=savedRoom.token;generation++;await refresh();if(snapshot)beginPolling();};
showEntry();
resizeCanvas();updateAimUi(-.45,.45);requestAnimationFrame(renderCanvas);
