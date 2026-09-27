import assert from 'node:assert/strict';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createTabletopServer} from '../server/index.mjs';

const require=createRequire(process.env.PLAYWRIGHT_MODULE_PATH||import.meta.url);
const {chromium}=require('playwright');
await mkdir('_qa',{recursive:true});
const dataDir=await mkdtemp('_qa/steel-map-choice-');
const app=await createTabletopServer({dataDir});
const {server}=app;
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
  browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true});
  const host=await browser.newPage(),guest=await browser.newPage(),errors=[];
  for(const page of [host,guest])page.on('pageerror',error=>errors.push(error.message));
  await host.goto(`${base}/games/steel-arc/online.html`);
  await host.locator('#name').fill('MapHost');
  await host.locator('#create').click();
  await host.locator('#lobby').waitFor({state:'visible'});
  const code=await host.locator('#room-code').textContent();
  assert.deepEqual(await host.locator('#map-choice option').allTextContents(),[
    '随机战场 · 六张地图轮换','潮汐长滩','碧湾断岸','群峰砾谷','断峡鸣瀑','云顶雪原','蓝镜长湖',
  ]);
  await guest.goto(`${base}/games/steel-arc/online.html?room=${code}`);
  await guest.locator('#name').fill('MapGuest');
  await guest.locator('#join').click();
  await guest.locator('#lobby').waitFor({state:'visible'});
  assert.equal(await guest.locator('#map-choice').isDisabled(),true);
  await host.locator('#map-choice').selectOption('alpine');
  await guest.waitForFunction(()=>document.querySelector('#map-choice')?.value==='alpine');
  assert.match(await guest.locator('#map-description').textContent(),/高山雪原/);
  await guest.locator('#ready').click();
  await host.locator('#start').waitFor({state:'visible'});
  await host.waitForFunction(()=>!document.querySelector('#start').disabled);
  await host.locator('#start').click();
  await host.locator('#battle').waitFor({state:'visible'});
  await guest.locator('#battle').waitFor({state:'visible'});
  const stored=await app.stores.steelArc.get(code,Date.now());
  assert.equal(stored.room.engine.battleTerrain.themeId,'alpine');
  assert.deepEqual(errors,[]);
  console.log('Steel Expedition map choice: two-browser selection, sync and match terrain passed.');
}finally{
  await browser?.close();
  await app.close();
}
