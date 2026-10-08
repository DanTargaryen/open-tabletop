import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const require=createRequire(process.env.PLAYWRIGHT_MODULE_PATH||import.meta.url);
const {chromium}=require('playwright');
const before=process.argv.includes('--before');
const base=process.env.INK_WAR_URL||'http://127.0.0.1:18773';
const browser=await chromium.launch({channel:'msedge',headless:true});
const results=[];
const errors=[];
try {
  for(const throttle of [1,4]){
    const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:2});
    const page=await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    for(const file of ['ui.js','engine.js','renderer.js']){
      await page.route('**/games/ink-war/'+file,async route=>{
        let source=await readFile(before?'_qa/ink-war/perf-before/'+file:'games/ink-war/web/'+file,'utf8');
        if(file==='renderer.js')source+=`\nconst rawDraw=BattlefieldRenderer.prototype.draw;BattlefieldRenderer.prototype.draw=function(...args){const start=performance.now();try{return rawDraw.apply(this,args);}finally{window.__inkPerf.draw.push(performance.now()-start);}};`;
        await route.fulfill({contentType:'text/javascript',body:source});
      });
    }
    await page.addInitScript(()=>{
      window.__inkPerf={draw:[],frames:[],gaps:[],long:[]};
      const raf=window.requestAnimationFrame.bind(window);let previous;
      window.requestAnimationFrame=callback=>raf(now=>{
        const start=performance.now();if(previous)window.__inkPerf.gaps.push(now-previous);previous=now;
        callback(now);window.__inkPerf.frames.push(performance.now()-start);
      });
      new PerformanceObserver(list=>{window.__inkPerf.long.push(...list.getEntries().map(e=>e.duration));}).observe({type:'longtask',buffered:true});
    });
    const cdp=await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:throttle});
    await page.goto(base+'/games/ink-war/index.html');
    await page.evaluate(()=>document.fonts.load('24px InkBrush'));
    await page.waitForTimeout(900);
    async function sample(label){
      await page.evaluate(()=>{for(const v of Object.values(window.__inkPerf))v.length=0;});
      await page.waitForTimeout(3000);
      const data=await page.evaluate(()=>window.__inkPerf);
      const summary=values=>{values.sort((a,b)=>a-b);return {count:values.length,meanMs:+(values.reduce((a,b)=>a+b,0)/(values.length||1)).toFixed(2),p95Ms:+(values[Math.floor(values.length*.95)]||0).toFixed(2),maxMs:+(values.at(-1)||0).toFixed(2)};};
      const row={mode:before?'before':'after',throttle,label,draw:summary(data.draw),frame:summary(data.frames),frameGap:summary(data.gaps),longTasks:data.long.length};
      results.push(row);console.log(JSON.stringify(row));
      if(!before&&label==='home-idle'){assert.equal(data.draw.length,0,'idle home must not repaint');assert.equal(data.frames.length,0,'idle home must stop its animation loop');}
      if(!before&&label==='seven-country-battle'){assert.ok(data.draw.length<=375,'battle drawing stays within 120 Hz');if(throttle===1&&data.frames.length>300)assert.ok(data.draw.length>270,'a fast display is no longer capped at 60 Hz');}
    }
    await sample('home-idle');
    await page.locator('#solo-start').click();
    await page.waitForFunction(()=>Number(document.querySelector('#army-total').textContent.replace(/\D/g,''))>0);
    await page.locator('#select-all').click();
    await page.waitForTimeout(500);
    await sample('seven-country-battle');
    const dense=await page.evaluate(async()=>{
      const {createGame,UNIT_TYPES}=await import('./engine.js');
      const {BattlefieldRenderer}=await import('./renderer.js');
      const canvas=document.createElement('canvas');canvas.style.cssText='width:1400px;height:700px';document.body.append(canvas);
      const state=createGame({seed:19,playerCount:7});
      state.units=[];const types=Object.keys(UNIT_TYPES);
      for(let i=0;i<700;i++){const type=types[i%types.length],stats=UNIT_TYPES[type];state.units.push({id:state.nextUnitId++,owner:i%7,type,glyph:stats.glyph,hp:stats.maxHp,maxHp:stats.maxHp,x:12+(i*53)%1176,y:12+(i*71)%736,attacking:false});}
      const renderer=new BattlefieldRenderer(canvas);renderer.selection=new Set(state.units.filter(u=>u.owner===0).map(u=>u.id));
      const cold=performance.now();renderer.receive(state);renderer.draw(state);const coldMs=performance.now()-cold;
      const times=[];for(let i=0;i<45;i++){const start=performance.now();renderer.draw(state,performance.now()+i*16,{selfId:0});times.push(performance.now()-start);}
      times.sort((a,b)=>a-b);
      const startX=state.units[0].x,startY=state.units[0].y;state.units[0].x+=20;state.tick++;
      renderer.receive(state,{interval:100});renderer.draw(state,renderer.receivedAt+50,{interpolate:true});
      const midpoint=renderer.point(startX+10,startY),midpointError=Math.hypot(renderer.unitPoints?.[0]-midpoint.x,renderer.unitPoints?.[1]-midpoint.y);
      renderer.receive(state,{reset:true});const resetCleared=renderer.previous.size===0;
      renderer.observer.disconnect();canvas.remove();
      return {coldMs:+coldMs.toFixed(2),meanMs:+(times.reduce((a,b)=>a+b,0)/times.length).toFixed(2),p95Ms:+times[Math.floor(times.length*.95)].toFixed(2),maxMs:+times.at(-1).toFixed(2),midpointError:Number.isFinite(midpointError)?midpointError:null,resetCleared};
    });
    results.push({mode:before?'before':'after',throttle,label:'700-unit-render',...dense});console.log(JSON.stringify(results.at(-1)));
    if(!before){assert.ok(dense.midpointError<.001,'mutable solo state must interpolate through the midpoint rather than jump');assert.equal(dense.resetCleared,true,'a new battle must not interpolate from a previous battle');}
    await context.close();
  }
  assert.deepEqual(errors,[]);
  await mkdir('_qa/ink-war',{recursive:true});
  await writeFile('_qa/ink-war/performance-'+(before?'before':'after')+'.json',JSON.stringify(results,null,2));
}finally{await browser.close();}
