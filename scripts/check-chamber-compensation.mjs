import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {createTabletopServer} from '../server/index.mjs';
import {createGame,freezeGame,settleOnlineBoundary} from '../games/buckshot-roulette/web/engine.js';
const require=createRequire(process.env.PLAYWRIGHT_MODULE_PATH||import.meta.url);
const {chromium}=require('playwright');
await mkdir('_qa/chamber-compensation',{recursive:true});
const app=await createTabletopServer({dataDir:await mkdtemp('_qa/chamber-compensation/data-')});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${app.server.address().port}`,errors=[];
let browser;
try{
  browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true});
  for(const webgl of [false,true]){
    const hostContext=await browser.newContext({viewport:{width:1280,height:900}}),guestContext=await browser.newContext({viewport:{width:1280,height:900}});
    const host=await hostContext.newPage(),guest=await guestContext.newPage();
    for(const page of [host,guest]){
      page.on('pageerror',error=>errors.push(error.message));
      if(!webgl)await page.route('**/three-table.js',route=>route.abort());
    }
    const key=()=>randomBytes(24).toString('hex');
    const call=async(path,body,token)=>{const r=await fetch(base+'/api/buckshot'+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});assert.ok(r.ok,await r.clone().text());return r.json();};
    const a=await call('/rooms',{name:'Host',seatKey:key(),mode:'challenge'}),code=a.room.code;
    const b=await call('/rooms/'+code+'/join',{name:'Guest',seatKey:key()});
    for(const [page,player]of [[host,a],[guest,b]]){
      await page.addInitScript(session=>sessionStorage.setItem('open-tabletop.buckshot.session.v1',JSON.stringify(session)),{code,token:player.token});
      await page.goto(base+'/games/buckshot-roulette/online.html');
      await page.locator('#roomWaiting').waitFor({state:'visible'});
    }
    const cases=webgl?['boreFilm','powerStrip']:['lightRemote','fruitKnife','spareFuse','boreFilm','reverseCoin','powerStrip'];
    for(const item of cases){
      const row=await app.stores.buckshot.get(code,Date.now());
      const g=createGame({rng:()=>.2,mode:'challenge',compensationEnabled:true});
      g.names={player:'Host',ai:'Guest'};g.hp={player:2,ai:6};g.maxHp=8;g.maxHpBySide={player:8,ai:8};g.ammo=[];g.turn='ai';g.pendingReload={beforeLighting:'day',pendingTurn:'ai'};
      const event=settleOnlineBoundary(g);g.compensation.offers=[item,item==='reverseCoin'?'spareFuse':'reverseCoin'];g.compensation.timeoutChoice=g.compensation.offers[1];event.offers=[...g.compensation.offers];
      row.room.status='playing';row.room.game=freezeGame(g);row.room.version++;row.room.deadline=Date.now()+120000;row.room.eventSeq++;row.room.lastEvent={...event,seq:row.room.eventSeq};row.room.events=[row.room.lastEvent];
      await app.stores.buckshot.cas(code,row.revision,row.room,row.expiresAt);
      await host.locator('#compensationChoices button:enabled').first().waitFor({timeout:45000});
      await guest.waitForFunction(()=>document.querySelector('#turnBanner').textContent.includes('等待 Host'));
      assert.equal(await guest.locator('#compensationChoices').isVisible(),false);
      if(webgl)assert.equal(await host.locator('#game').evaluate(el=>el.classList.contains('webgl-ready')),true);
      await host.screenshot({path:`_qa/chamber-compensation/${webgl?'3d':'fallback'}-${item}.png`});
      await host.locator('#compensationChoices button').first().focus();await host.keyboard.press('Enter');
      await host.locator('#compensationChoices').waitFor({state:'hidden',timeout:45000});
      const state=await call('/rooms/'+code,null,a.token),other=await call('/rooms/'+code,null,b.token);
      assert.equal(state.game.phase,'playing');assert.equal(state.game.lastEvent.item,item);
      if(item==='boreFilm'){assert.equal(state.game.records.player.length,2);assert.equal(other.game.records.player.length,0);assert.deepEqual(other.game.records.ai,[]);}
      if(item==='powerStrip'){assert.equal(state.game.randomDeath,true);assert.equal(state.game.hp.player,null);await host.locator('#noticeOk').click();}
      console.log('PASS',webgl?'3D':'fallback',item,'keyboard choice and private projections');
    }
    await hostContext.close();await guestContext.close();
  }
  assert.deepEqual(errors,[]);console.log('PASS: compensation choices with and without WebGL, keyboard use, privacy, and 3D film/power-strip animations; no page errors.');
}finally{await browser?.close();await app.close();}
