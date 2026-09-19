import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {createServer as createNetServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createTabletopServer} from '../server/index.mjs';

const edgePaths=[
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const delay=milliseconds=>new Promise(resolveDelay=>setTimeout(resolveDelay,milliseconds));
const freePort=()=>new Promise((resolvePort,reject)=>{
  const listener=createNetServer();
  listener.once('error',reject);
  listener.listen(0,'127.0.0.1',()=>{
    const {port}=listener.address();
    listener.close(error=>error?reject(error):resolvePort(port));
  });
});

async function findEdge(){
  const {access}=await import('node:fs/promises');
  for(const path of edgePaths){
    try{await access(path);return path;}catch{}
  }
  throw new Error('Microsoft Edge executable was not found');
}

async function waitForJson(url,timeout=10000){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){
    try{
      const response=await fetch(url);
      if(response.ok)return response.json();
    }catch{}
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function connectCdp(url){
  const socket=new WebSocket(url);
  await new Promise((resolveSocket,reject)=>{
    socket.addEventListener('open',resolveSocket,{once:true});
    socket.addEventListener('error',()=>reject(new Error('CDP WebSocket failed to open')),{once:true});
  });
  let nextId=0;
  const pending=new Map(),events=[];
  socket.addEventListener('message',message=>{
    const packet=JSON.parse(message.data);
    if(packet.id){
      const request=pending.get(packet.id);
      if(!request)return;
      pending.delete(packet.id);
      if(packet.error)request.reject(new Error(`${request.method}: ${packet.error.message}`));
      else request.resolve(packet.result);
      return;
    }
    events.push(packet);
  });
  const send=(method,params={})=>new Promise((resolveRequest,reject)=>{
    const id=++nextId;
    const timer=setTimeout(()=>{
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    },15000);
    pending.set(id,{method,resolve:value=>{clearTimeout(timer);resolveRequest(value);},reject:error=>{clearTimeout(timer);reject(error);}});
    socket.send(JSON.stringify({id,method,params}));
  });
  return {socket,send,events};
}

async function main(){
  const checks=[];
  const record=(name,details={})=>{checks.push({name,status:'PASS',...details});console.log('PASS',name);};
  const edge=await findEdge();
  const dataDir=await mkdtemp(join(tmpdir(),'steel-expedition-e2e-data-'));
  const profileDir=await mkdtemp(join(tmpdir(),'steel-expedition-e2e-edge-'));
  const evidenceDir=resolve('.data/browser-qa');
  await mkdir(evidenceDir,{recursive:true});
  const app=await createTabletopServer({dataDir});
  await new Promise((resolveListen,reject)=>{
    app.server.once('error',reject);
    app.server.listen(0,'127.0.0.1',resolveListen);
  });
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const debugPort=await freePort();
  const browser=spawn(edge,[
    '--headless=new','--disable-gpu','--hide-scrollbars','--no-first-run',
    `--remote-debugging-port=${debugPort}`,`--user-data-dir=${profileDir}`,'about:blank',
  ],{stdio:'ignore',windowsHide:true});
  let cdp;
  try{
    const pages=await waitForJson(`http://127.0.0.1:${debugPort}/json/list`);
    const page=pages.find(candidate=>candidate.type==='page');
    assert.ok(page?.webSocketDebuggerUrl,'Edge did not expose a page target');
    cdp=await connectCdp(page.webSocketDebuggerUrl);
    await Promise.all([
      cdp.send('Page.enable'),cdp.send('Runtime.enable'),cdp.send('Log.enable'),cdp.send('Network.enable'),
      cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false}),
    ]);
    const evaluate=async expression=>{
      const result=await cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
      if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
      return result.result.value;
    };
    const waitFor=async(expression,timeout=15000)=>{
      const deadline=Date.now()+timeout;
      while(Date.now()<deadline){
        if(await evaluate(`Boolean(${expression})`))return;
        await delay(80);
      }
      throw new Error(`Timed out waiting for: ${expression}`);
    };
    const navigate=async url=>{
      await cdp.send('Page.navigate',{url});
      await waitFor(`document.readyState === 'complete' && location.href === ${JSON.stringify(url)}`);
    };
    const clickSelector=async selector=>{
      const point=await evaluate(`(async()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!element)return null;element.scrollIntoView({block:'center',inline:'center'});await new Promise(resolveFrame=>requestAnimationFrame(()=>requestAnimationFrame(resolveFrame)));const rect=element.getBoundingClientRect();return {x:rect.x+rect.width/2,y:rect.y+rect.height/2};})()`);
      assert.ok(point,`Clickable element was not found: ${selector}`);
      await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',buttons:1,clickCount:1});
      await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',buttons:0,clickCount:1});
    };

    await navigate(base+'/');
    await waitFor(`document.querySelectorAll('.game-card').length === 6`);
    await waitFor(`document.querySelector('.steel-arc-art img')?.complete && document.querySelector('.steel-arc-art img')?.naturalWidth > 0`);
    const lobby=await evaluate(`(()=>{const card=document.querySelector('.game-card--steel-arc');const image=card.querySelector('img');return {cards:document.querySelectorAll('.game-card').length,title:card.querySelector('h3').textContent.trim(),subtitle:card.querySelector('.eyebrow').textContent.trim(),cover:[image.naturalWidth,image.naturalHeight],href:card.querySelector('.primary').getAttribute('href')};})()`);
    assert.deepEqual(lobby,{cards:6,title:'钢铁远征',subtitle:'STEEL EXPEDITION',cover:[1672,941],href:'/games/steel-arc/index.html'});
    record('大厅显示六款游戏、钢铁远征新名称与 1672×941 正式封面',lobby);

    await clickSelector('.game-card--steel-arc .primary');
    await waitFor(`location.pathname === '/games/steel-arc/index.html' && document.querySelector('#overlay-title') && document.querySelector('#menu button[data-action="start"]')`);
    const titleState=await evaluate(`({title:document.title,heading:document.querySelector('#overlay-title').textContent.trim(),subtitle:document.querySelector('.title-lockup>p').textContent.trim(),menu:[...document.querySelectorAll('#menu button')].map(button=>button.textContent.trim()),canvas:[document.querySelector('#game').width,document.querySelector('#game').height]})`);
    assert.equal(titleState.title,'钢铁远征 · Steel Expedition');
    assert.equal(titleState.heading,'钢铁远征');
    assert.equal(titleState.subtitle,'STEEL EXPEDITION');
    assert.ok(titleState.menu.includes('开始对战'));
    assert.ok(titleState.canvas[0]>=1280&&titleState.canvas[1]>=720);
    record('从大厅进入游戏，标题、菜单和高分辨率 Canvas 正确',titleState);

    await clickSelector('#menu button[data-action="start"]');
    await waitFor(`document.querySelector('#overlay').classList.contains('hidden') && !document.querySelector('#battle-hud').classList.contains('hidden')`);
    const introState=await evaluate(`({turn:document.querySelector('#turn-label').textContent.trim(),fire:document.querySelector('#fire-state').textContent.trim()})`);
    assert.deepEqual(introState,{turn:'战场侦察',fire:'扫描战场'});
    record('新对局先播放从左向右的战场侦察镜头并锁定操作',introState);
    await waitFor(`document.querySelector('#fire-state').textContent.trim() === '准备就绪'`,6000);
    const battle=await evaluate(`({turn:document.querySelector('#turn-label').textContent.trim(),fuel:document.querySelector('#fuel-value').textContent.trim(),weapons:document.querySelectorAll('.weapon-card').length,weaponNames:[...document.querySelectorAll('.weapon-card span')].map(item=>item.textContent.trim()),available:document.querySelectorAll('.weapon-card:not(.locked)').length,aimHidden:document.querySelector('#aim-panel').classList.contains('hidden'),deckHidden:document.querySelector('#command-deck').classList.contains('hidden')})`);
    assert.equal(battle.turn,'你的回合');
    assert.equal(battle.fuel,'88');
    assert.equal(battle.weapons,7);
    assert.ok(battle.weaponNames.includes('核爆弹'));assert.ok(battle.weaponNames.includes('追踪弹'));
    assert.equal(battle.available,1);
    assert.equal(battle.aimHidden,false);
    assert.equal(battle.deckHidden,false);
    record('开始新对局，HUD、87.5 燃料、核爆/追踪等七种弹药与首回合锁定规则正确',battle);

    await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'d',code:'KeyD',windowsVirtualKeyCode:68});
    await delay(500);
    await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'d',code:'KeyD',windowsVirtualKeyCode:68});
    await waitFor(`Number(document.querySelector('#fuel-value').textContent) < 88`);
    const fuelAfterMove=Number(await evaluate(`document.querySelector('#fuel-value').textContent`));
    assert.ok(fuelAfterMove<88&&fuelAfterMove>=0);
    record('A/D 键盘移动会消耗燃料',{fuelAfterMove});

    const aimBefore=await evaluate(`({angle:document.querySelector('#angle-value').textContent,power:document.querySelector('#power-value').textContent,rect:(()=>{const r=document.querySelector('#aim-control').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()})`);
    const centerX=aimBefore.rect.x+aimBefore.rect.width/2,centerY=aimBefore.rect.y+aimBefore.rect.height/2;
    await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:centerX,y:centerY,button:'left',buttons:1,clickCount:1});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:centerX-72,y:centerY+28,button:'left',buttons:1});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:centerX-72,y:centerY+28,button:'left',buttons:0,clickCount:1});
    await waitFor(`document.querySelector('#angle-value').textContent !== ${JSON.stringify(aimBefore.angle)} || document.querySelector('#power-value').textContent !== ${JSON.stringify(aimBefore.power)}`);
    const aimAfter=await evaluate(`({angle:document.querySelector('#angle-value').textContent,power:document.querySelector('#power-value').textContent})`);
    record('鼠标弹弓盘可丝滑调整自由角度与力度',{before:{angle:aimBefore.angle,power:aimBefore.power},after:aimAfter});

    await clickSelector('#pause-button');
    await waitFor(`!document.querySelector('#overlay').classList.contains('hidden') && document.querySelector('#overlay-kicker').textContent.includes('暂停')`);
    assert.equal(await evaluate(`document.querySelector('#overlay-kicker').textContent.trim()`),'战斗暂停');
    await clickSelector('#menu button[data-action="resume"]');
    await waitFor(`document.querySelector('#overlay').classList.contains('hidden')`);
    record('鼠标暂停与继续战斗流程正常');

    await clickSelector('#fire-button');
    await waitFor(`document.querySelector('#fire-state').textContent !== '准备就绪'`,3000);
    await waitFor(`document.querySelector('#turn-label').textContent === '敌方回合'`,12000);
    const enemyTurn=await evaluate(`({turn:document.querySelector('#turn-label').textContent.trim(),fire:document.querySelector('#fire-state').textContent.trim(),round:document.querySelector('#round-label').textContent.trim()})`);
    assert.equal(enemyTurn.turn,'敌方回合');
    record('鼠标开火完成弹道结算并切换到本地 AI 回合',enemyTurn);

    await navigate(base+'/games/steel-arc/online.html');
    await waitFor(`document.querySelector('#create') && !document.querySelector('#entry').hidden`);
    await clickSelector('#create');
    await waitFor(`!document.querySelector('#lobby').hidden && document.querySelector('#room-code').textContent.length === 6`);
    const friendCode=await evaluate(`document.querySelector('#room-code').textContent.trim()`);
    const seatKey='b'.repeat(48);
    const joined=await fetch(`${base}/api/steel-arc/rooms/${friendCode}/join`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'远征队友',seatKey})});
    assert.equal(joined.status,200);
    const prepared=await fetch(`${base}/api/steel-arc/rooms/${friendCode}/ready`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${seatKey}`},body:JSON.stringify({ready:true})});
    assert.equal(prepared.status,200);
    await waitFor(`document.querySelector('#roster').textContent.includes('远征队友') && !document.querySelector('#start').disabled`,5000);
    const lobbyState=await evaluate(`({seats:document.querySelectorAll('#roster .member').length,order:document.querySelector('.turn-rail').textContent.replace(/\\s+/g,' ').trim(),hint:document.querySelector('#hint').textContent.trim()})`);
    assert.equal(lobbyState.seats,4);assert.match(lobbyState.order,/A1.*B1.*A2.*B2/);assert.match(lobbyState.hint,/2 名真人/);
    record('好友房支持两名真人加入并显示四个可选行动位与 AI 补位',lobbyState);

    await clickSelector('#start');
    await waitFor(`!document.querySelector('#battle').hidden && document.querySelector('#turn').textContent.trim() === 'A1'`,5000);
    assert.equal(await evaluate(`document.querySelector('#intro-label').hidden`),false);
    await waitFor(`!document.querySelector('#fire').disabled`,6000);
    const onlineBattle=await evaluate(`({weapons:document.querySelectorAll('#weapon-rack .weapon').length,weaponNames:[...document.querySelectorAll('#weapon-rack .weapon span')].map(item=>item.textContent.trim()),tanks:document.querySelectorAll('.tank-stat').length,turn:document.querySelector('#turn').textContent.trim(),canvas:[document.querySelector('#battlefield').width,document.querySelector('#battlefield').height]})`);
    assert.deepEqual({weapons:onlineBattle.weapons,tanks:onlineBattle.tanks,turn:onlineBattle.turn},{weapons:7,tanks:4,turn:'A1'});assert.ok(onlineBattle.weaponNames.includes('核爆'));assert.ok(onlineBattle.weaponNames.includes('追踪'));assert.ok(onlineBattle.canvas[0]>=1280&&onlineBattle.canvas[1]>=720);
    record('好友房开局显示四辆坦克、含核爆/追踪的七种炮弹和高分辨率共享战场',onlineBattle);

    await clickSelector('#fire');
    await waitFor(`document.querySelector('#turn').textContent.trim() === 'B1'`,8000);
    const afterOnlineShot=await evaluate(`({turn:document.querySelector('#turn').textContent.trim(),log:document.querySelector('#log').textContent.trim(),active:[...document.querySelectorAll('#turn-order b')].find(item=>item.classList.contains('active'))?.textContent})`);
    assert.equal(afterOnlineShot.turn,'B1');assert.equal(afterOnlineShot.active,'B1');assert.match(afterOnlineShot.log,/发射/);
    record('A1 真实弹道结算后严格切换到 B1，服务端战况同步到画面',afterOnlineShot);

    const screenshot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    const screenshotPath=join(evidenceDir,'steel-expedition-e2e.png');
    await writeFile(screenshotPath,Buffer.from(screenshot.data,'base64'));
    const unexpected=cdp.events.filter(event=>
      event.method==='Runtime.exceptionThrown'||
      event.method==='Log.entryAdded'&&['error','warning'].includes(event.params.entry.level)||
      event.method==='Network.loadingFailed'&&!event.params.canceled
    );
    assert.deepEqual(unexpected,[]);
    record('浏览器运行期间无未捕获异常、错误日志或资源加载失败');

    const report={browser:'Microsoft Edge',base,checks,unexpected,screenshot:screenshotPath};
    await writeFile(join(evidenceDir,'steel-expedition-e2e-result.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
  }finally{
    cdp?.socket.close();
    if(browser.exitCode===null){
      browser.kill();
      await Promise.race([
        new Promise(resolveExit=>browser.once('exit',resolveExit)),
        delay(3000),
      ]);
    }
    await app.close();
    await rm(dataDir,{recursive:true,force:true,maxRetries:5,retryDelay:150});
    await rm(profileDir,{recursive:true,force:true,maxRetries:5,retryDelay:150});
  }
}

await main();
