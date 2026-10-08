import {CITY_UPGRADE_COSTS} from './engine.js';
const FONT='"InkBrush","STXingkai","STKaiti","KaiTi",serif';
const GLYPHS={blade:'刀',spear:'枪',sword:'剑',shield:'盾',bow:'弓'};
const COUNTRIES=['秦','齐','楚','赵','韩','燕','魏'];
const COLORS=['#050505','#dc1717','#184fdb','#e87504','#00a9b5','#a10cc6','#cd00a8'];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const noise=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
function surface(w,h){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;return canvas;}
// The ink edge is identical for every faction. Calculate it once, then tint it.
const RAW_SPRITES=new Map();
let CITY_TEXTURE=null;
function cityTexture(){
  if(CITY_TEXTURE)return CITY_TEXTURE;
  const alpha=new Uint8ClampedArray(256*256),variation=new Float32Array(256*256),edge=new Uint8Array(256*256),core=new Uint8Array(256*256);
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    const dx=(x-128)/95,dy=(y-124)/95,angle=Math.atan2(dy,dx),distance=Math.hypot(dx,dy),i=y*256+x;
    const wave=Math.sin(angle*13+.5)*.025+Math.sin(angle*23)*.021+Math.sin(angle*41)*.011,cloud=(noise(Math.floor(x/5)*83+Math.floor(y/5)*131)-.5)*.06;
    let opacity=clamp((1.17+wave+cloud-distance)/.27,0,1);opacity*=clamp(.88+(noise(y*257+x)-.5)*.45,0,1);if(distance<.7)opacity=1;
    alpha[i]=opacity*255;variation[i]=(noise(y*311+x)-.5)*18;edge[i]=distance>.8?30:3;core[i]=distance<.38?22:0;
  }
  return CITY_TEXTURE={alpha,variation,edge,core};
}
function paperTexture(){
  const tile=surface(256,256),ctx=tile.getContext('2d'),pixels=ctx.createImageData(256,256),grain=new Float32Array(1024);
  for(let i=0;i<grain.length;i++)grain[i]=noise(i*7)*2-1;
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    const gx=x/8,gy=y/8,xx=Math.floor(gx),yy=Math.floor(gy),fx=gx-xx,fy=gy-yy;
    const a=grain[(yy%32)*32+xx%32],b=grain[(yy%32)*32+(xx+1)%32],c=grain[((yy+1)%32)*32+xx%32],d=grain[((yy+1)%32)*32+(xx+1)%32];
    const soft=(a*(1-fx)+b*fx)*(1-fy)+(c*(1-fx)+d*fx)*fy;
    const value=clamp(190+soft*5+(noise(y*257+x)-.5)*17,0,255),offset=(y*256+x)*4;
    pixels.data[offset]=value;pixels.data[offset+1]=value;pixels.data[offset+2]=value;pixels.data[offset+3]=255;
  }
  ctx.putImageData(pixels,0,0);return tile;
}
const PAPER=paperTexture();
function mountain(ctx,w,y,height,seed,color){
  ctx.beginPath();ctx.moveTo(-40,y+height);
  for(let i=0;i<=18;i++){const x=i/18*(w+80)-40,yy=y+height*(.3+noise(seed+i)*.7);ctx.quadraticCurveTo(x-20,yy-height*.16,x,yy);}
  ctx.lineTo(w+40,y+height*1.5);ctx.lineTo(-40,y+height*1.5);ctx.closePath();ctx.fillStyle=color;ctx.fill();
}
function drawWall(ctx,w,h){
  const height=clamp(h*.15,76,132),sky=ctx.createLinearGradient(0,0,0,height);
  sky.addColorStop(0,'#8c8c8c');sky.addColorStop(.4,'#eeeeee');sky.addColorStop(.7,'#f6f6f6');sky.addColorStop(1,'#a7a7a7');ctx.fillStyle=sky;ctx.fillRect(0,0,w,height);
  ctx.save();ctx.filter='blur(3px)';mountain(ctx,w,height*.28,height*.43,31,'#9a9a9a66');mountain(ctx,w,height*.40,height*.36,131,'#77777766');ctx.filter='none';mountain(ctx,w,height*.56,height*.3,11,'#3d3d3d77');ctx.restore();
  const wallY=x=>height*(.8+.08*Math.sin(x/w*10)+.07*Math.sin(x/w*4));
  ctx.beginPath();ctx.moveTo(0,wallY(0)+11);for(let x=0;x<=w;x+=6)ctx.lineTo(x,wallY(x)+11);ctx.lineTo(w,height+4);ctx.lineTo(0,height+4);ctx.closePath();ctx.fillStyle='#606060';ctx.fill();
  ctx.beginPath();ctx.moveTo(0,wallY(0));for(let x=0;x<=w;x+=6)ctx.lineTo(x,wallY(x));ctx.strokeStyle='#181818';ctx.lineWidth=4;ctx.stroke();
  for(let x=0;x<w;x+=13){const y=wallY(x);ctx.fillStyle='#292929';ctx.fillRect(x,y-5,7,6);ctx.fillStyle='#aaaaaa55';ctx.fillRect(x+1,y-4,4,1);}
  for(const [relative,scale] of [[.28,1],[.69,.55],[.97,.92]]){
    const x=w*relative,y=wallY(x),tw=height*.36*scale,th=height*.36*scale;
    ctx.save();ctx.translate(x,y);ctx.rotate(relative>.8?-.17:.04);const gradient=ctx.createLinearGradient(-tw/2,0,tw/2,0);gradient.addColorStop(0,'#262626');gradient.addColorStop(.6,'#515151');gradient.addColorStop(1,'#161616');ctx.fillStyle=gradient;ctx.beginPath();ctx.moveTo(-tw*.55,3);ctx.lineTo(-tw*.47,-th);ctx.lineTo(tw*.47,-th);ctx.lineTo(tw*.55,3);ctx.closePath();ctx.fill();ctx.strokeStyle='#0c0c0c';ctx.lineWidth=2;ctx.stroke();
    for(let k=0;k<5;k++){ctx.fillStyle='#161616';ctx.fillRect(-tw*.5+k*tw/5,-th-5,tw/7,7);}
    ctx.strokeStyle='#99999944';ctx.lineWidth=.6;for(let yy=-th+7;yy<0;yy+=6){ctx.beginPath();ctx.moveTo(-tw*.44,yy);ctx.lineTo(tw*.44,yy);ctx.stroke();for(let xx=-tw*.4;xx<tw*.5;xx+=8){ctx.beginPath();ctx.moveTo(xx+(yy%12?3:0),yy);ctx.lineTo(xx+(yy%12?3:0),yy-5);ctx.stroke();}}
    ctx.fillStyle='#151515';ctx.fillRect(-tw*.09,-th*.38,tw*.18,th*.37);ctx.restore();
  }
  const fog=ctx.createLinearGradient(0,height*.85,0,height*1.2);fog.addColorStop(0,'#b5b5b500');fog.addColorStop(1,'#c6c6c6');ctx.fillStyle=fog;ctx.fillRect(0,height*.85,w,height*.4);
}
function citySprite(color,country){
  const canvas=surface(256,256),ctx=canvas.getContext('2d'),data=ctx.createImageData(256,256),base=rgb(color),black=base.every(c=>c<35);
  const texture=cityTexture();
  for(let pixel=0;pixel<256*256;pixel++){
    const v=texture.variation[pixel],light=black?texture.edge[pixel]:texture.core[pixel],offset=pixel*4;
    for(let i=0;i<3;i++)data.data[offset+i]=clamp(base[i]+v+light,0,255);data.data[offset+3]=texture.alpha[pixel];
  }
  ctx.putImageData(data,0,0);ctx.font=`76px ${FONT}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.shadowColor='#fff';ctx.shadowBlur=black?2:9;ctx.fillStyle='#fff';ctx.fillText(country,128,128);ctx.shadowBlur=0;return canvas;
}
function soldierSprite(type,color){
  const canvas=surface(128,144),ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.font=`89px ${FONT}`;ctx.textAlign='center';ctx.textBaseline='alphabetic';
  if(type==='blade'){ctx.save();ctx.translate(66,111);ctx.transform(1,-.15,-.22,.72,0,0);ctx.fillText('刀',0,0);ctx.restore();}
  else if(type==='spear'||type==='sword'){
    ctx.beginPath();ctx.moveTo(26,18);ctx.lineTo(19,42);ctx.lineTo(25,49);ctx.lineTo(22,121);ctx.lineTo(29,121);ctx.lineTo(30,49);ctx.lineTo(35,42);ctx.closePath();ctx.fill();
    if(type==='sword'){ctx.fillRect(15,66,27,5);ctx.font=`79px ${FONT}`;ctx.fillText('剑',76,120);}else{ctx.font=`86px ${FONT}`;ctx.fillText('枪',74,117);}
  }else ctx.fillText(GLYPHS[type]||'刀',65,116);
  return canvas;
}
export class BattlefieldRenderer{
  constructor(canvas,{preview=false,onInvalidate}={}){
    this.onInvalidate=onInvalidate;this.canvas=canvas;this.ctx=canvas.getContext('2d');this.preview=preview;this.selection=new Set();this.drag=null;this.marker=null;this.previous=new Map();this.positions=new Map();this.cityGrowth=new Map();this.receivedAt=0;this.effects=[];this.lastEvent=0;this.sprites=new Map();this.unitPoints=new Float32Array(0);this.unitVisible=new Uint8Array(0);this.camera={zoom:1,panX:0,panY:0};this.view={scale:1,left:0,top:0,portrait:false};this.dirty=true;this.resize();this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);
    document.fonts.ready.then(()=>{RAW_SPRITES.clear();this.sprites.clear();this.unitSpriteKey=null;this.bgKey=null;this.invalidate();});
  }
  resize(){const box=this.canvas.getBoundingClientRect(),w=box.width||600,h=box.height||740,ratio=Math.min(devicePixelRatio||1,2);if(this.w===w&&this.h===h&&this.ratio===ratio)return;this.w=w;this.h=h;this.ratio=ratio;this.canvas.width=Math.round(w*ratio);this.canvas.height=Math.round(h*ratio);this.ctx.setTransform(ratio,0,0,ratio,0,0);this.background=null;this.paperBackground=null;this.bgKey=null;this.sprites.clear();this.unitSpriteKey=null;this.invalidate();}
  configure(state){
    const portrait=this.preview||this.h>this.w*1.12,ww=portrait?state.height:state.width,hh=portrait?state.width:state.height,pad=this.preview?7:12,top=this.preview?clamp(this.h*.13,65,110):clamp(this.h*.17,80,140),availableW=Math.max(1,this.w-pad*2),availableH=Math.max(1,this.h-top-pad),fitScale=Math.min(availableW/ww,availableH/hh),zoom=this.preview?1:this.camera.zoom,scale=fitScale*zoom;
    const maxX=Math.max(0,(ww*scale-availableW)/2),maxY=Math.max(0,(hh*scale-availableH)/2);this.camera.panX=clamp(this.camera.panX,-maxX,maxX);this.camera.panY=clamp(this.camera.panY,-maxY,maxY);
    this.viewport={x:pad,y:top,width:availableW,height:availableH};this.view={portrait,scale,fitScale,zoom,left:(this.w-ww*scale)/2+this.camera.panX,top:top+(availableH-hh*scale)/2+this.camera.panY,width:state.width,height:state.height};
  }
  get zoom(){return this.camera.zoom;}
  setZoom(zoom,clientX,clientY){
    const next=clamp(Number(zoom)||1,1,4),state=this.state||this.drawnState;if(next===this.camera.zoom)return this.camera.zoom;if(!state){this.camera.zoom=next;this.invalidate();return next;}
    this.configure(state);const box=this.canvas.getBoundingClientRect(),vx=clientX??box.left+this.w/2,vy=clientY??box.top+this.viewport.y+this.viewport.height/2,anchor=this.world(vx,vy);this.camera.zoom=next;this.configure(state);const after=this.point(anchor.x,anchor.y);this.camera.panX+=vx-box.left-after.x;this.camera.panY+=vy-box.top-after.y;this.configure(state);this.sprites.clear();this.unitSpriteKey=null;this.bgKey=null;this.invalidate();return next;
  }
  pan(dx,dy){const state=this.state||this.drawnState;if(!state||this.camera.zoom===1)return;const x=this.camera.panX,y=this.camera.panY;this.camera.panX+=Number(dx)||0;this.camera.panY+=Number(dy)||0;this.configure(state);if(x===this.camera.panX&&y===this.camera.panY)return;this.bgKey=null;this.invalidate();}
  resetView(){this.camera={zoom:1,panX:0,panY:0};const state=this.state||this.drawnState;if(state)this.configure(state);this.bgKey=null;this.sprites.clear();this.unitSpriteKey=null;this.invalidate();}
  centerOn(x,y,{zoom=this.camera.zoom}={}){const state=this.state||this.drawnState;if(!state)return;this.camera={zoom:clamp(Number(zoom)||1,1,4),panX:0,panY:0};this.configure(state);const p=this.point(x,y);this.camera.panX=this.w/2-p.x;this.camera.panY=this.viewport.y+this.viewport.height/2-p.y;this.configure(state);this.sprites.clear();this.unitSpriteKey=null;this.bgKey=null;this.invalidate();}
  visible(x,y,padding=0){const v=this.viewport;return x+padding>=v.x&&x-padding<=v.x+v.width&&y+padding>=v.y&&y-padding<=v.y+v.height;}
  cityRadius(city,now=this.cityDrawTime??performance.now()){const growth=this.cityGrowth.get(city.id);if(!growth)return city.radius||32;const amount=clamp((now-growth.born)/450,0,1),eased=amount*amount*(3-2*amount);return growth.from+(growth.target-growth.from)*eased;}
  hasCityGrowth(now){for(const growth of this.cityGrowth.values())if(growth.from!==growth.target&&now-growth.born<450)return true;return false;}
  citySize(city){return this.preview?Math.max(34,(city.owner===0?210:140)*this.view.scale):Math.max(34,124*this.view.scale)*this.cityRadius(city)/32;}
  cityGrowthRings(city){
    if(this.preview)return [];
    const rings=[];let investment=0;
    for(let level=2;level<=(city.maxLevel||1);level++){investment+=CITY_UPGRADE_COSTS[level-2];rings.push(this.citySize({radius:32+investment*.3})*.44);}
    return rings;
  }
  point(x,y){const v=this.view;return v.portrait?{x:v.left+y*v.scale,y:v.top+(v.width-x)*v.scale}:{x:v.left+x*v.scale,y:v.top+y*v.scale};}
  world(clientX,clientY){const box=this.canvas.getBoundingClientRect(),v=this.view,x=(clientX-box.left-v.left)/v.scale,y=(clientY-box.top-v.top)/v.scale;return v.portrait?{x:v.width-y,y:x}:{x,y};}
  get selection(){return this._selection;}
  set selection(value){const previous=this.selectionSnapshot,changed=!previous||previous.size!==value.size||[...value].some(id=>!previous.has(id));this._selection=value;if(changed){this.selectionSnapshot=new Set(value);this.invalidate();}}
  get drag(){return this._drag;}
  set drag(value){if(value!==this._drag){this._drag=value;this.invalidate();}}
  receive(state,{interval=160,reset=false}={}){const now=performance.now(),gameKey=`${state.seed}:${state.mapId}:${state.width}:${state.height}`;if(reset||this.gameKey!==gameKey||state.tick<this.receivedTick){this.positions=new Map();this.cityGrowth.clear();this.effects=[];this.lastEvent=0;this.marker=null;this.camera={zoom:1,panX:0,panY:0};this.bgKey=null;}this.gameKey=gameKey;this.receivedTick=state.tick;this.previous=this.positions;this.positions=new Map();for(const u of state.units)this.positions.set(u.id,{x:u.x,y:u.y});for(const city of state.cities){const target=city.radius||32,growth=this.cityGrowth.get(city.id);if(!growth||growth.target!==target)this.cityGrowth.set(city.id,{from:growth?this.cityRadius(city,now):target,target,born:now});}this.state=state;this.receivedAt=now;this.interval=Math.max(1,interval);this.invalidate();for(const e of state.events||[])if(e.id>this.lastEvent){const city=state.cities.find(c=>c.id===e.cityId);if(city)this.effects.push({x:city.x,y:city.y,born:now,divine:e.skillId==='divine',duration:e.skillId==='divine'?1500:850,color:state.players[e.playerId]?.color||'#050505'});this.lastEvent=e.id;}}
  setMarker(target,color){this.marker={...target,born:performance.now(),color};this.invalidate();}
  invalidate(){this.dirty=true;this.onInvalidate?.();}
  needsRedraw(now=performance.now()){return this.dirty||this.hadTransient||this.hasCityGrowth(now)||Boolean(this.drag)||(this.marker&&now-this.marker.born<2000)||this.effects.some(e=>now-e.born<(e.duration||850))||this.drawnState?.tick!==this.drawnTick;}
  sprite(key,factory){if(!RAW_SPRITES.has(key))RAW_SPRITES.set(key,factory());return RAW_SPRITES.get(key);}
  scaledSprite(key,image,w,h){const width=Math.max(1,Math.round(w*this.ratio)),height=Math.max(1,Math.round(h*this.ratio)),cacheKey=`${key}:${width}:${height}`;let result=this.sprites.get(cacheKey);if(!result){const scaled=surface(width,height);scaled.getContext('2d').drawImage(image,0,0,width,height);result={image:scaled,width:width/this.ratio,height:height/this.ratio};this.sprites.set(cacheKey,result);}return result;}
  unitSprites(state,size){const key=`${size}:${this.ratio}:${state.players.map(p=>p.color).join(',')}`;if(this.unitSpriteKey===key)return this.unitImages;this.unitSpriteKey=key;this.unitImages=state.players.map(()=>Object.create(null));return this.unitImages;}
  shadow(key,width,height,color){const cacheKey=`shadow:${key}:${width}:${height}:${this.ratio}`;let result=this.sprites.get(cacheKey);if(!result){const pad=1/this.ratio,w=Math.ceil((width+pad*2)*this.ratio),h=Math.ceil((height+pad*2)*this.ratio),image=surface(w,h),ctx=image.getContext('2d');ctx.setTransform(this.ratio,0,0,this.ratio,0,0);ctx.beginPath();ctx.ellipse(w/this.ratio/2,h/this.ratio/2,width/2,height/2,0,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();result={image,width:w/this.ratio,height:h/this.ratio};this.sprites.set(cacheKey,result);}return result;}
  terrain(state){
    const c=this.ctx,w=this.w,h=this.h;
    if(this.paperBackground)c.drawImage(this.paperBackground,0,0,w,h);else{
      c.fillStyle=c.createPattern(PAPER,'repeat');c.fillRect(0,0,w,h);
      const wash=c.createLinearGradient(0,0,w*.3,h);wash.addColorStop(0,'#ffffff00');wash.addColorStop(.4,'#ffffff20');wash.addColorStop(1,'#ffffff90');c.fillStyle=wash;c.fillRect(0,0,w,h);
      const vignette=c.createRadialGradient(w*.5,h*.52,h*.12,w*.5,h*.5,Math.max(w,h)*.67);vignette.addColorStop(0,'#00000000');vignette.addColorStop(1,'#00000025');c.fillStyle=vignette;c.fillRect(0,0,w,h);drawWall(c,w,h);
      this.paperBackground=surface(this.canvas.width,this.canvas.height);this.paperBackground.getContext('2d').drawImage(this.canvas,0,0);
    }
    const v=this.viewport;c.save();c.beginPath();c.rect(v.x,v.y,v.width,v.height);c.clip();
    for(const terrain of state.terrain||[]){if(terrain.type==='river'){
      for(let layer=0;layer<5;layer++){c.beginPath();terrain.points.forEach(([x,y],i)=>{const p=this.point(x+layer*2-4,y);i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y);});c.strokeStyle=layer===0?'#33333315':'#7777770a';c.lineJoin='round';c.lineWidth=(terrain.width+layer*7)*this.view.scale;c.stroke();}
      for(const y of terrain.bridges||[]){let x=state.width/2,nearest=Infinity;for(const [px,py] of terrain.points){const distance=Math.abs(py-y);if(distance<nearest){nearest=distance;x=px;}}for(let i=1;i<terrain.points.length;i++){const [ax,ay]=terrain.points[i-1],[bx,by]=terrain.points[i];if(y>=Math.min(ay,by)&&y<=Math.max(ay,by)){x=ay===by?(ax+bx)/2:ax+(bx-ax)*(y-ay)/(by-ay);break;}}const a=this.point(x-terrain.width,y),b=this.point(x+terrain.width,y);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.strokeStyle='#bdbdbd';c.lineWidth=22*this.view.scale;c.stroke();c.strokeStyle='#48484880';c.lineWidth=1.2;c.stroke();}
    }else if(terrain.type==='ridge'){
      const a=this.point(terrain.x,terrain.y),b=this.point(terrain.x+terrain.width,terrain.y+terrain.height);c.save();c.translate(Math.min(a.x,b.x),Math.min(a.y,b.y));c.beginPath();c.rect(0,0,Math.abs(b.x-a.x),Math.abs(b.y-a.y));c.clip();mountain(c,Math.abs(b.x-a.x),0,Math.abs(b.y-a.y)*.6,83,'#4444442a');c.restore();
    }}c.restore();
  }
  draw(state,now=performance.now(),{interpolate=false,selfId=0}={}){
    if(!state||!this.w)return;this.cityDrawTime=now;this.configure(state);const c=this.ctx;c.setTransform(this.ratio,0,0,this.ratio,0,0);
    const key=`${this.w}:${this.h}:${state.seed}:${state.mapId}:${state.width}:${state.height}:${this.view.scale}:${this.view.left}:${this.view.top}`;if(this.bgKey!==key){this.terrain(state);this.background??=surface(this.canvas.width,this.canvas.height);this.background.getContext('2d').drawImage(this.canvas,0,0);this.bgKey=key;}else if(this.background)c.drawImage(this.background,0,0,this.w,this.h);
    const viewport=this.viewport;c.save();c.beginPath();c.rect(viewport.x,viewport.y,viewport.width,viewport.height);c.clip();
    const s=this.view.scale,alpha=interpolate?clamp((now-this.receivedAt)/(this.interval||160),0,1):1,units=state.units,size=Math.max(13,36*s),unitImages=this.unitSprites(state,size),shadow=this.shadow('unit',size*.64,size*.18,'#11111148'),points=this.unitPoints.length>=units.length*2?this.unitPoints:(this.unitPoints=new Float32Array(Math.max(units.length*2,this.unitPoints.length*2,256))),visible=this.unitVisible.length>=units.length?this.unitVisible:(this.unitVisible=new Uint8Array(Math.max(units.length,this.unitVisible.length*2,128))),view=this.view;
    for(const city of state.cities){const p=this.point(city.x,city.y),size=this.citySize(city),rings=this.cityGrowthRings(city);if(!this.visible(p.x,p.y,Math.max(size,...rings)))continue;if(rings.length){c.setLineDash([3,5]);c.lineWidth=.8;c.strokeStyle='#08080888';for(const radius of rings){c.beginPath();c.arc(p.x,p.y,radius,0,Math.PI*2);c.stroke();}c.setLineDash([]);}c.beginPath();c.ellipse(p.x+size*.05,p.y+size*.38,size*.38,size*.12,0,0,Math.PI*2);c.fillStyle='#17171735';c.fill();}
    for(let i=0;i<units.length;i++){const u=units[i],old=interpolate?this.previous.get(u.id):null,x=old?old.x+(u.x-old.x)*alpha:u.x,y=old?old.y+(u.y-old.y)*alpha:u.y,px=view.left+(view.portrait?y:x)*s,py=view.top+(view.portrait?view.width-x:y)*s;points[i*2]=px;points[i*2+1]=py;visible[i]=this.visible(px,py,size)?1:0;if(visible[i])c.drawImage(shadow.image,px+2*s-shadow.width/2,py+size*.43-shadow.height/2,shadow.width,shadow.height);}
    for(const city of state.cities){
      const p=this.point(city.x,city.y),color=city.owner>=0?state.players[city.owner]?.color||COLORS[city.owner]:'#767676',country=city.country||COUNTRIES[city.owner]||'城',size=this.citySize(city);
      if(!this.visible(p.x,p.y,size))continue;
      const name='city:'+color+country,raw=this.sprite(name,()=>citySprite(color,country)),growth=this.cityGrowth.get(city.id);if(growth&&growth.from!==growth.target&&now-growth.born<450)c.drawImage(raw,p.x-size*.5,p.y-size*.5,size,size);else{const image=this.scaledSprite(name,raw,size,size);c.drawImage(image.image,p.x-image.width*.5,p.y-image.height*.5,image.width,image.height);}
      const barW=size*.52;if(city.hp<city.maxHp||!this.preview){c.fillStyle='#f1f1f1bb';c.fillRect(p.x-barW/2,p.y-size*.52,barW,3);c.fillStyle='#6faf65';c.fillRect(p.x-barW/2,p.y-size*.52,barW*clamp(city.hp/city.maxHp,0,1),3);}
      c.textAlign='center';c.textBaseline='middle';
      const cards=state.players[city.owner]?.cards||[];if(cards.length){const glyph={levy:'令',swift:'疾',fierce:'火',bastion:'盾',arrows:'弓',renewal:'养',siege:'攻',veteran:'勇'}[cards[0]],radius=Math.max(8,14*s),bx=p.x+size*.28,by=p.y-size*.43;c.fillStyle='#ffffffaa';c.beginPath();c.arc(bx,by,radius,0,Math.PI*2);c.fill();c.strokeStyle=color;c.lineWidth=2*s;c.stroke();c.fillStyle=color;c.font=`${Math.max(10,21*s)}px ${FONT}`;c.fillText(glyph||'策',bx,by);}
    }
    for(let i=0;i<units.length;i++){
      if(!visible[i])continue;
      const u=units[i],x=points[i*2],y=points[i*2+1],color=state.players[u.owner]?.color||COLORS[u.owner]||COLORS[0],images=unitImages[u.owner]||(unitImages[u.owner]=Object.create(null));let image=images[u.type];if(!image){const name='unit:'+u.type+color;image=images[u.type]=this.scaledSprite(name,this.sprite(name,()=>soldierSprite(u.type,color)),size,size*1.125);}c.drawImage(image.image,x-size*.48,y-size*.57,image.width,image.height);
      if(u.attacking&&noise(u.id+state.tick*19)>.5){c.strokeStyle=color+'88';c.lineWidth=Math.max(1,s*2);c.beginPath();c.moveTo(x,y);c.lineTo(x+Math.cos(u.facing||0)*size*.8,y+Math.sin(u.facing||0)*size*.8);c.stroke();}
      if(u.hp<u.maxHp*.5){c.fillStyle='#20202066';c.fillRect(x-size*.3,y+size*.51,size*.6*clamp(u.hp/u.maxHp,0,1),1);}
    }
    if(this.selection.size){c.beginPath();const radius=size*.58;for(let i=0;i<units.length;i++)if(visible[i]&&this.selection.has(units[i].id)){const x=points[i*2],y=points[i*2+1];c.moveTo(x+radius,y);c.arc(x,y,radius,0,Math.PI*2);}c.strokeStyle='#1274deaa';c.lineWidth=.9;c.setLineDash([3,3]);c.stroke();c.setLineDash([]);}
    this.effects=this.effects.filter(e=>now-e.born<(e.duration||850));for(const e of this.effects){const p=this.point(e.x,e.y),age=(now-e.born)/(e.duration||850);if(e.divine){c.strokeStyle='#b48939';c.globalAlpha=(1-age)*.75;c.lineWidth=Math.max(1,2*s);c.beginPath();for(let i=0;i<18;i++){const angle=i*Math.PI*2/18,radius=(75+i%3*28)*s,x=p.x+Math.cos(angle)*radius,y=p.y+Math.sin(angle)*radius-(1-age)*95*s;c.moveTo(x,y-50*s);c.lineTo(x,y);}c.stroke();}c.beginPath();c.arc(p.x,p.y,(25+age*62)*s,0,Math.PI*2);c.strokeStyle=e.color;c.globalAlpha=(1-age)*.45;c.lineWidth=4*(1-age)+.5;c.stroke();c.globalAlpha=1;}
    if(this.marker&&now-this.marker.born<2000){const m=this.marker,p=this.point(m.x,m.y),age=(now-m.born)/2000;c.strokeStyle=m.color||COLORS[selfId];c.globalAlpha=1-age;c.lineWidth=2.5;c.beginPath();c.arc(p.x,p.y,10+age*15,0,Math.PI*2);c.stroke();const army=state.units.filter(u=>this.selection.has(u.id));if(army.length){const start=this.point(army.reduce((sum,u)=>sum+u.x,0)/army.length,army.reduce((sum,u)=>sum+u.y,0)/army.length);c.beginPath();c.moveTo(start.x,start.y);c.lineTo(p.x,p.y);c.stroke();const a=Math.atan2(p.y-start.y,p.x-start.x);c.beginPath();c.moveTo(p.x,p.y);c.lineTo(p.x-Math.cos(a-.5)*14,p.y-Math.sin(a-.5)*14);c.lineTo(p.x-Math.cos(a+.5)*14,p.y-Math.sin(a+.5)*14);c.closePath();c.fillStyle=m.color||COLORS[selfId];c.fill();}c.globalAlpha=1;}
    if(this.drag){const a=this.point(this.drag.start.x,this.drag.start.y),b=this.point(this.drag.end.x,this.drag.end.y);c.strokeStyle='#0878d7';c.fillStyle='#0878d718';c.lineWidth=1;c.setLineDash([5,3]);c.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y);c.fillRect(a.x,a.y,b.x-a.x,b.y-a.y);c.setLineDash([]);}
    c.restore();this.dirty=false;this.drawnState=state;this.drawnTick=state.tick;this.hadTransient=Boolean(this.drag)||(this.marker&&now-this.marker.born<2000)||this.effects.length>0||this.hasCityGrowth(now);
  }
}
