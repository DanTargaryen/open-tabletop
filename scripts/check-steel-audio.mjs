import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir} from 'node:fs/promises';
import {createTabletopServer} from '../server/index.mjs';
const require=createRequire(process.env.PLAYWRIGHT_MODULE_PATH||import.meta.url);
const {chromium}=require('playwright');
await mkdir('_qa/steel-audio',{recursive:true});
const app=await createTabletopServer({dataDir:await mkdtemp('_qa/steel-audio/data-')});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${app.server.address().port}`;
let browser;
try{
  browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true});
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    window.musicElements=[];const OriginalAudio=window.Audio;
    window.Audio=class extends OriginalAudio{constructor(...args){super(...args);window.musicElements.push(this);}};
    window.sampleStarts=0;const create=AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource=function(){const source=create.call(this),start=source.start;source.start=function(...args){window.sampleStarts++;return start.apply(this,args);};return source;};
  });
  await page.goto(base+'/games/steel-arc/index.html');
  await page.locator('[data-action="start"]').click();
  const decoded=await page.evaluate(async()=>{
    const {BACKGROUND_TRACK,WEAPON_AUDIO}=await import('/games/steel-arc/audio-assets.js');
    const context=new AudioContext(),result=[];
    for(const file of [BACKGROUND_TRACK,...Object.values(WEAPON_AUDIO).map(spec=>spec.file)]){
      const response=await fetch('/games/steel-arc/assets/audio/'+file);if(!response.ok)throw Error(file);
      const buffer=await context.decodeAudioData(await response.arrayBuffer());
      result.push({file,duration:buffer.duration,channels:buffer.numberOfChannels});
    }
    await context.close();return result;
  });
  assert.equal(decoded.length,8);assert.equal(new Set(decoded.map(item=>item.file)).size,8);
  for(const item of decoded)assert.ok(item.duration>0&&item.channels>0);
  await page.waitForFunction(()=>window.musicElements[0]?.currentTime>0&&!window.musicElements[0].paused);
  await page.evaluate(async()=>{
    const {audio}=await import('/games/steel-arc/audio.js');const {WEAPON_AUDIO}=await import('/games/steel-arc/audio-assets.js');
    for(const weapon of Object.keys(WEAPON_AUDIO)){audio.fire(weapon);audio.explode(weapon);await new Promise(resolve=>setTimeout(resolve,50));}
  });
  assert.equal(await page.evaluate(()=>window.sampleStarts),14);
  assert.equal(await page.evaluate(async()=>{const {audio}=await import('/games/steel-arc/audio.js');audio.toggle();return window.musicElements[0].paused;}),true);
  await page.evaluate(async()=>{const {audio}=await import('/games/steel-arc/audio.js');audio.toggle();});
  await page.waitForFunction(()=>!window.musicElements[0].paused);
  assert.equal(await page.evaluate(async()=>{const {audio}=await import('/games/steel-arc/audio.js');audio.setBattle(false);return window.musicElements[0].paused;}),true);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({decoded,sampleStarts:14,muteAndStop:'passed'},null,2));
}finally{await browser?.close();await app.close();}
