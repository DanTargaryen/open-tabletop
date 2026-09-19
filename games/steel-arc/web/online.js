import {BattleCamera} from './camera.js';
import {createTutorial} from './tutorial.js';
import {AI_LEVELS,stepSupplyDrops,hasFallingSupply,moveTank} from './engine.js';
import {stepProjectile,splitHiveProjectile,resolveExplosion,settleSupplies} from './engine.js';
import {audio} from './audio.js';
import {createBattleRenderer} from './renderer.js';
import {stepTankControls} from './controls.js';
import {PredictedMovement} from './movement.js';
import {WORLD_WIDTH,WORLD_HEIGHT,BASE_FUEL,GRAVITY,WEAPONS,WEAPON_IDS,terrainHeightAt,createProjectile,isWeaponAvailable} from './engine.js';

const $=selector=>document.querySelector(selector),entry=$('#entry'),lobby=$('#lobby'),battle=$('#battle'),errorBox=$('#error');
const canvas=$('#battlefield'),ctx=canvas.getContext('2d',{alpha:false,desynchronized:true}),VIEW_WIDTH=1280,VIEW_HEIGHT=720,ZOOM=.88,VIEW_WORLD=VIEW_WIDTH/ZOOM;
const glyphs={calibration:'●',armorPiercing:'◆',quake:'◒',drill:'▶',hive:'✦',meteor:'☢',pulse:'◎'};
const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let roomCode='',token='',snapshot=null,pollTimer=null,busy=false,renderScale=1,cameraX=0,cameraTarget=0,lastFrame=performance.now(),introStart=0,introSeed=null;
let localHeading=45,localPower=68,selectedWeapon='calibration',shotQueue=[],shotAnimation=null,lastShotId=0;
const keys=new Set(),movement=new PredictedMovement();
const remotePositions=new Map(),battleCamera=new BattleCamera();
let moveRequest=null,lastMoveSent=0,moveSoundAt=0;
const tutorial=createTutorial({online:true,onOpen(){keys.clear();$('#aim-control').classList.remove('dragging');},onClose(){keys.clear();}});

function showError(value){errorBox.textContent=value?.message||String(value);clearTimeout(showError.timer);showError.timer=setTimeout(()=>errorBox.textContent='',3500);}
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

function resizeCanvas(){if(!canvas)return;const rect=canvas.getBoundingClientRect(),ratio=Math.min(3,Math.max(1,window.devicePixelRatio||1));renderScale=Math.min(3,Math.max(1,rect.width/VIEW_WIDTH*ratio));canvas.width=Math.round(VIEW_WIDTH*renderScale);canvas.height=Math.round(VIEW_HEIGHT*renderScale);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';}
window.addEventListener('resize',resizeCanvas);

function slotCard(seat,room){
  const mine=seat.id===room.selfId,empty=seat.id.startsWith('empty-'),occupied=!seat.ai&&!empty,canChoose=empty||mine,canAi=room.isOwner&&empty;
  return `<article class="member ${mine?'current':''} ${seat.ai?'ai':occupied?'occupied':'empty'}" data-team="${seat.team}"><span class="slot">${seat.slot} · ${seat.team==='A'?'第一阵线':'第二阵线'}</span><strong>${escapeHtml(seat.name)}${seat.owner?' · 房主':''}</strong><small>${seat.ai?`${AI_LEVELS[seat.difficulty||'normal'].label} AI`:seat.ready?'已准备':empty?'空位':'等待准备'}</small>${canChoose?`<button class="choose" type="button" data-slot="${seat.slot}">${mine?'当前位置':'坐这个位置'}</button>`:''}${canAi?`<button class="add-ai" type="button" data-ai-slot="${seat.slot}">添加 AI</button>`:''}${seat.ai&&room.isOwner?`<label class="ai-level">难度 <select aria-label="${seat.slot} AI 难度" data-ai-difficulty="${seat.slot}">${Object.entries(AI_LEVELS).map(([id,level])=>`<option value="${id}" ${id===(seat.difficulty||'normal')?'selected':''}>${level.label}</option>`).join('')}</select></label><button class="add-ai" type="button" data-ai-slot="${seat.slot}" data-ai-enabled="false">移除 AI</button>`:''}</article>`;
}
function renderLobby(room){
  $('#room-code').textContent=room.code;$('#roster').innerHTML=room.seats.map(seat=>slotCard(seat,room)).join('');
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
  for(const shot of history)if(shot.id>lastShotId){shotQueue.push(shot);lastShotId=Math.max(lastShotId,shot.id);}
}
function renderBattle(room,game){
  queueShots(game);game=shotAnimation?.state||game;
  $('#team-a-status').innerHTML=game.turnOrder.filter(slot=>slot[0]==='A').map(slot=>healthCard(game.tanks[slot])).join('');$('#team-b-status').innerHTML=game.turnOrder.filter(slot=>slot[0]==='B').map(slot=>healthCard(game.tanks[slot])).join('');
  $('#round').textContent=`第 ${game.round} 轮`;$('#turn').textContent=game.phase==='ended'?'—':game.turn;
  $('#turn-order').innerHTML=game.turnOrder.map(slot=>`<b class="${slot===game.turn?'active':''} ${game.tanks[slot].hp<=0?'dead':''}">${slot}</b>`).join('');
  $('#log').textContent=(snapshot.log||[]).slice(-4).join('\n');
  const mine=movement.state?.tanks[room.selfSlot]||game.tanks[room.selfSlot],canAct=room.status==='playing'&&game.turn===room.selfSlot&&game.phase==='aim'&&!isIntro()&&!shotAnimation&&!shotQueue.length;
  $('#fuel-value').textContent=Math.ceil(mine.fuel);$('#fuel-bar').style.width=`${mine.fuel/BASE_FUEL*100}%`;$('#aim-control').disabled=!canAct;$('#fire').disabled=!canAct;
  $('#fire-state').textContent=shotAnimation?.dropping?'补给投放中':shotAnimation?'行动回放中':canAct?'准备就绪':isIntro()?'战场扫描中':`等待 ${game.turn}`;
  $('#weapon-rack').innerHTML=WEAPON_IDS.map(id=>{const weapon=WEAPONS[id],available=isWeaponAvailable(mine,id,game.round),ammo=Number.isFinite(weapon.ammo)?mine.ammo[id]??0:'∞';return `<button type="button" class="weapon ${id===selectedWeapon?'active':''} ${available?'':ammo===0?'empty':'locked'}" style="--weapon:${weapon.color}" data-weapon="${id}" ${canAct&&available?'':'disabled'}><b>${glyphs[id]}</b><span>${weapon.short}</span><small>${ammo==='∞'?'∞':`×${ammo}`}</small></button>`;}).join('');
  if(!isWeaponAvailable(mine,selectedWeapon,game.round))selectedWeapon='calibration';
  $('#result').hidden=room.status!=='finished'||Boolean(shotAnimation)||shotQueue.length>0;if(room.status==='finished')$('#winner').textContent=game.winner==='draw'?'双方平局':`${game.winner} 队胜利`;
}
function render(data){
  if(snapshot?.room.code===data.room.code&&snapshot.room.version>data.room.version)return;
  if(snapshot?.room.status!==data.room.status)audio.setBattle(data.room.status==='playing');
  const lobbyChanged=snapshot?.room.code!==data.room.code||snapshot?.room.version!==data.room.version;
  snapshot=data;const room=data.room;movement.accept(data.game,room.selfSlot);entry.hidden=true;lobby.hidden=room.status!=='waiting';battle.hidden=!['playing','finished'].includes(room.status);
  if(room.status==='waiting'){if(lobbyChanged)renderLobby(room);}
  else if(data.game){
    if(introSeed!==data.game.seed){introSeed=data.game.seed;battleCamera.reset();introStart=performance.now();lastShotId=0;shotQueue=[];shotAnimation=null;localHeading=data.game.tanks[room.selfSlot].heading;localPower=data.game.tanks[room.selfSlot].power;selectedWeapon='calibration';renderer.resetEffects();resizeCanvas();}
    renderBattle(room,data.game);
  }
}
function handleFailure(error){if([403,404].includes(error.status))clearRoom();showError(error);}
async function refresh(){if(!roomCode||busy||polling||moveRequest)return;const current=generation;polling=true;try{const data=await api(`/rooms/${roomCode}`);if(current===generation&&!moveRequest)render(data);}catch(error){if(current===generation)handleFailure(error);}finally{polling=false;}}
function beginPolling(){clearTimeout(pollTimer);if(roomCode)pollTimer=setTimeout(async()=>{await refresh();beginPolling();},snapshot?.room.status==='playing'?100:1000);}
async function action(payload){
  if(busy||!snapshot)return;busy=true;
  try{await flushMovement();render(await api(`/rooms/${roomCode}/action`,'POST',{...payload,version:snapshot.room.version,requestId:requestId()}));}
  catch(error){handleFailure(error);}finally{busy=false;}
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
    const result=stepTankControls(movement.state,id,keys,dt);movement.record(result.steps);
    localHeading=tank.heading;localPower=tank.power;
    if(result.changed){const r=(localPower-20)/80,a=localHeading*Math.PI/180;updateAimUi(-Math.cos(a)*r,Math.sin(a)*r);$('#fuel-value').textContent=Math.ceil(tank.fuel);$('#fuel-bar').style.width=`${tank.fuel/BASE_FUEL*100}%`;}
    if(result.steps.length&&now>moveSoundAt){audio.move();moveSoundAt=now+105;}
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
    const key=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','').slice(0,16);
    const data=await api(joining?`/rooms/${code}/join`:'/rooms','POST',joining?{name,seatKey:key}:{name});
    generation++;roomCode=data.room.code;token=data.token;snapshot=null;saveRoom();render(data);beginPolling();
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
async function leave(){await roomCommand('leave');}
$('#leave').onclick=leave;$('#battle-leave').onclick=leave;$('#result-leave').onclick=leave;
$('#copy').onclick=async()=>{const link=`${location.origin}/games/steel-arc/online.html?room=${roomCode}`;try{await navigator.clipboard.writeText(link);$('#copy').textContent='已复制';setTimeout(()=>$('#copy').textContent='复制邀请',1300);}catch{showError('复制失败，请手动复制房间码。');}};
document.addEventListener('change',event=>{const select=event.target.closest('[data-ai-difficulty]');if(select)roomCommand('ai',{slot:select.dataset.aiDifficulty,enabled:true,difficulty:select.value});});
document.addEventListener('click',async event=>{const ai=event.target.closest('[data-ai-slot]');if(ai)await roomCommand('ai',{slot:ai.dataset.aiSlot,enabled:ai.dataset.aiEnabled!=='false'});const slot=event.target.closest('[data-slot]');if(slot)await roomCommand('team',{slot:slot.dataset.slot});const weapon=event.target.closest('[data-weapon]');if(weapon&&!weapon.disabled){selectedWeapon=weapon.dataset.weapon;renderBattle(snapshot.room,snapshot.game);}});

function isIntro(){return introStart&&performance.now()-introStart<3600;}
function canAct(){return !tutorial.isOpen&&snapshot?.room.status==='playing'&&snapshot.game?.phase==='aim'&&snapshot.game.turn===snapshot.room.selfSlot&&!isIntro()&&!busy&&!shotAnimation&&!shotQueue.length;}
function updateAim(event){
  if(!canAct())return;const rect=$('#aim-control').getBoundingClientRect(),cx=rect.left+rect.width/2,cy=rect.top+rect.height/2,dx=event.clientX-cx,dy=event.clientY-cy,max=rect.width*.39,length=Math.min(max,Math.hypot(dx,dy)),scale=length/(Math.hypot(dx,dy)||1),px=dx*scale,py=dy*scale;
  localHeading=((Math.atan2(py,-px)*180/Math.PI)%360+360)%360;localPower=Math.round(20+length/max*80);updateAimUi(px/max,py/max);
}
function updateAimUi(nx,ny){
  const length=Math.min(1,Math.hypot(nx,ny)),angle=Math.atan2(ny,nx)*180/Math.PI;$('#aim-knob').style.left=`${50+nx*39}%`;$('#aim-knob').style.top=`${50+ny*39}%`;$('#pull-vector').style.width=`${length*39}%`;$('#pull-vector').style.transform=`rotate(${angle}deg)`;$('#shot-vector').style.width=`${18+length*25}%`;$('#shot-vector').style.transform=`rotate(${angle+180}deg)`;$('#angle-value').textContent=`${Math.round(localHeading)}°`;$('#power-value').textContent=localPower;
}
const aim=$('#aim-control');aim.addEventListener('pointerdown',event=>{if(!canAct())return;aim.setPointerCapture(event.pointerId);aim.classList.add('dragging');updateAim(event);});aim.addEventListener('pointermove',event=>{if(aim.hasPointerCapture(event.pointerId))updateAim(event);});aim.addEventListener('pointerup',event=>{if(aim.hasPointerCapture(event.pointerId))aim.releasePointerCapture(event.pointerId);aim.classList.remove('dragging');});
$('#fire').onclick=()=>{if(canAct())action({type:'fire',heading:localHeading,power:localPower,weaponId:selectedWeapon});};
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
    if(!canAct())return;
    const id=snapshot.room.selfSlot,tank={...game.tanks[id],heading:localHeading,power:localPower,weapon:selectedWeapon};
    const preview={...game,tanks:{...game.tanks,[id]:tank}};
    renderer.setFrame({state:preview,cameraX});renderer.drawAimDots(tank);
    renderer.setFrame({state:game,cameraX});
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
  if(!replay.launched){replay.aimDelay-=dt;if(replay.aimDelay>0)return;replay.launched=true;replay.projectiles=replay.pendingProjectiles;audio.fire(replay.projectiles[0].weaponId);}
  replay.accumulator+=dt;
  renderer.setFrame({state:replay.state,cameraX,projectiles:replay.projectiles});
  while(replay.accumulator>=1/120){
    for(const p of [...replay.projectiles]){
      if(!p.alive)continue;
      p.trail.push({x:p.x,y:p.y});if(p.trail.length>18)p.trail.shift();
      const impact=stepProjectile(p,replay.state,1/120);
      if(impact.type==='split'){replay.projectiles.push(...splitHiveProjectile(p).map(child=>({...child,trail:[]})));audio.split();}
      else if(impact.type==='drill')audio.drill();
      else if(impact.type==='terrain'||impact.type==='tank'){const explosion=resolveExplosion(replay.state,p);renderer.spawnExplosion(explosion);audio.explode(p.weaponId);settleSupplies(replay.state);}
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
  if(snapshot?.game){const game=shotAnimation?.state||presentation(dt),elapsed=performance.now()-introStart,maxCamera=Math.max(0,WORLD_WIDTH-VIEW_WORLD),remaining=Math.max(0,Math.ceil((snapshot.room.deadline-Date.now())/1000));$('#countdown').textContent=snapshot.room.status==='finished'?'已结束':`${remaining}s`;if(isIntro()){const p=Math.min(1,elapsed/3600);cameraTarget=p<.72?maxCamera*Math.min(1,p/.72):maxCamera*(1-(p-.72)/.28);$('#intro-label').hidden=false;}else{$('#intro-label').hidden=true;battleCamera.update(game,shotAnimation?.projectiles||[],dt);cameraTarget=battleCamera.x;}if(isIntro())cameraX+=(cameraTarget-cameraX)*Math.min(1,dt*3.5);else cameraX=battleCamera.x;
    ctx.save();const zoom=isIntro()?ZOOM:battleCamera.zoom;ctx.scale(zoom,zoom);ctx.translate(-cameraX,-(isIntro()?WORLD_HEIGHT-VIEW_HEIGHT/ZOOM:battleCamera.y));renderer.setFrame({state:game,cameraX,projectiles:shotAnimation?.projectiles||[]});renderer.drawTerrain();renderer.drawSupplies();drawAim(game);for(const slot of game.turnOrder)renderer.drawTank(canAct()&&slot===snapshot.room.selfSlot?{...game.tanks[slot],heading:localHeading}:game.tanks[slot],slot[0]==='A');renderer.drawProjectiles();renderer.drawEffects();ctx.restore();renderer.drawVignette();
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
