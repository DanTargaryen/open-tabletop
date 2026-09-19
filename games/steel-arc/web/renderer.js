import {WORLD_WIDTH,WORLD_HEIGHT,GRAVITY,WEAPONS,terrainHeightAt,createProjectile} from './engine.js';
export function createBattleRenderer(ctx){
const VIEW_WIDTH=1280,VIEW_HEIGHT=720;
const rng=Math.random;let shake=0;
let state,cameraX=0,projectiles=[],particles=[],shockwaves=[],damageLabels=[];
function setFrame(frame){({state,cameraX=0,projectiles=[],particles=particles,shockwaves=shockwaves,damageLabels=damageLabels}=frame);}
function roundedRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function polygon(points){ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);ctx.closePath();}
function terrainPath(){
  const terrain=state.terrain;ctx.beginPath();ctx.moveTo(-WORLD_WIDTH,WORLD_HEIGHT*4);ctx.lineTo(-WORLD_WIDTH,terrain.points[0]);ctx.lineTo(0,terrain.points[0]);
  for(let i=1;i<terrain.points.length;i++)ctx.lineTo(i*terrain.step,terrain.points[i]);
  ctx.lineTo(WORLD_WIDTH*2,terrain.points.at(-1));ctx.lineTo(WORLD_WIDTH*2,WORLD_HEIGHT*4);ctx.closePath();
}
function surfaceStroke(offset=0){
  const terrain=state.terrain;ctx.beginPath();ctx.moveTo(-WORLD_WIDTH,terrain.points[0]+offset);
  for(let i=0;i<terrain.points.length;i++){const x=i*terrain.step,y=terrain.points[i]+offset;ctx.lineTo(x,y);}ctx.lineTo(WORLD_WIDTH*2,terrain.points.at(-1)+offset);
}
function detailNoise(index,salt=0){let n=Math.imul((index+1)^(state.seed+salt),2654435761);n^=n>>>15;return(n>>>0)/4294967295;}
function drawSky(){
  const gradient=ctx.createLinearGradient(0,0,0,560);gradient.addColorStop(0,'#07354e');gradient.addColorStop(.42,'#0f666a');gradient.addColorStop(.72,'#779078');gradient.addColorStop(1,'#ef9b59');ctx.fillStyle=gradient;ctx.fillRect(0,0,VIEW_WIDTH,VIEW_HEIGHT);
  const sunX=962-cameraX*.025,sunY=148;
  const glow=ctx.createRadialGradient(sunX,sunY,16,sunX,sunY,285);glow.addColorStop(0,'#fff5c9e6');glow.addColorStop(.22,'#ffd89373');glow.addColorStop(.58,'#eda96420');glow.addColorStop(1,'#ff9c5200');ctx.fillStyle=glow;ctx.fillRect(0,0,VIEW_WIDTH,470);
  ctx.fillStyle='#f5cd7bc7';ctx.beginPath();ctx.arc(sunX,sunY,53,0,Math.PI*2);ctx.fill();
  drawMesa(21,350,.64,'#6b7c73',.08);drawMesa(133,400,.88,'#396b64',.16);drawMesa(287,452,1.12,'#205650',.27);
  const haze=ctx.createLinearGradient(0,300,0,535);haze.addColorStop(0,'#f7cf8d00');haze.addColorStop(1,'#f0b36b32');ctx.fillStyle=haze;ctx.fillRect(0,280,VIEW_WIDTH,270);
  ctx.globalAlpha=.12;ctx.fillStyle='#f2ead0';for(const cloud of [[160,165,128],[640,116,174],[1120,255,150],[1530,190,120]]){let x=((cloud[0]-cameraX*.065+180)%1640+1640)%1640-180;ctx.beginPath();ctx.ellipse(x,cloud[1],cloud[2],17,0,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
  ctx.fillStyle='#d9eadb99';for(let i=0;i<18;i++){let x=((detailNoise(i,707)*1800-cameraX*.12)%1800+1800)%1800-100,y=110+detailNoise(i,719)*230,r=1+detailNoise(i,733)*1.5;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
}
function drawMesa(offset,base,scale,color,parallax){
  ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,base+100);
  for(let x=-48;x<=VIEW_WIDTH+48;x+=32){const sample=x+cameraX*parallax+offset,broad=Math.max(0,Math.sin(sample*.0085))*58*scale,step=Math.round(Math.max(0,Math.sin((sample+190)*.019))*5)*5*scale;ctx.lineTo(x,base-broad-step);}ctx.lineTo(VIEW_WIDTH,570);ctx.lineTo(0,570);ctx.closePath();ctx.fill();
}
function drawTerrain(){
  const terrain=state.terrain;terrainPath();
  const ground=ctx.createLinearGradient(0,380,0,720);ground.addColorStop(0,'#a65350');ground.addColorStop(.22,'#713d49');ground.addColorStop(.63,'#46303d');ground.addColorStop(1,'#282638');ctx.fillStyle=ground;ctx.fill();
  ctx.save();terrainPath();ctx.clip();
  const strata=['#d97859','#713b49','#b85c51','#4b3040','#8d4748','#302838'];
  for(let layer=0;layer<strata.length;layer++){
    const top=28+layer*47;ctx.fillStyle=strata[layer];ctx.globalAlpha=layer===0?.78:.64;ctx.beginPath();ctx.moveTo(-WORLD_WIDTH,terrain.points[0]+top+Math.sin(layer*1.7)*6+Math.sin(layer)*3);
    for(let i=0;i<terrain.points.length;i++){const x=i*terrain.step,y=terrain.points[i]+top+Math.sin(x*.014+layer*1.7)*6+Math.sin(x*.037+layer)*3;ctx.lineTo(x,y);}ctx.lineTo(WORLD_WIDTH*2,terrain.points.at(-1)+top+Math.sin(WORLD_WIDTH*.014+layer*1.7)*6+Math.sin(WORLD_WIDTH*.037+layer)*3);ctx.lineTo(WORLD_WIDTH*2,terrain.points.at(-1)+top+22+Math.sin(WORLD_WIDTH*.012+layer)*7);
    for(let i=terrain.points.length-1;i>=0;i--){const x=i*terrain.step,y=terrain.points[i]+top+22+Math.sin(x*.012+layer)*7;ctx.lineTo(x,y);}ctx.lineTo(-WORLD_WIDTH,terrain.points[0]+top+22+Math.sin(layer)*7);ctx.closePath();ctx.fill();
  }
  ctx.globalAlpha=.22;for(let i=0;i<184;i++){const x=detailNoise(i,19)*WORLD_WIDTH,y=438+detailNoise(i,73)*310,w=4+detailNoise(i,41)*22;ctx.fillStyle=i%3===0?'#f09a68':'#171f2c';polygon([[x-w,y],[x+w*.7,y-4],[x+w,y+4],[x-w*.4,y+7]]);ctx.fill();}
  ctx.globalAlpha=.16;ctx.strokeStyle='#ffb071';ctx.lineWidth=2;for(let x=36;x<WORLD_WIDTH;x+=74){const y=terrainHeightAt(terrain,x)+58+detailNoise(x|0,3)*190;ctx.beginPath();ctx.moveTo(x-12,y);ctx.lineTo(x,y-5);ctx.lineTo(x+17,y+2);ctx.stroke();}
  ctx.restore();ctx.globalAlpha=1;
  ctx.lineJoin='round';surfaceStroke(5);ctx.strokeStyle='#642f3c';ctx.lineWidth=15;ctx.stroke();surfaceStroke(0);ctx.strokeStyle='#d77258';ctx.lineWidth=9;ctx.stroke();surfaceStroke(-2);ctx.strokeStyle='#f5b16f';ctx.lineWidth=3;ctx.stroke();
  // Steep crater walls expose a bright, freshly broken edge.
  ctx.strokeStyle='#ffc080';ctx.lineWidth=2;for(let i=2;i<terrain.points.length-2;i++){const left=terrain.points[i]-terrain.points[i-2],right=terrain.points[i+2]-terrain.points[i];if(Math.abs(left-right)>7||Math.abs(left)>8){const x=i*terrain.step,y=terrain.points[i];ctx.beginPath();ctx.moveTo(x-4,y+2);ctx.lineTo(x+5,y+9);ctx.stroke();}}
  ctx.fillStyle='#402d39';for(let i=8;i<terrain.points.length-8;i+=17){if(detailNoise(i,211)>.58){const x=i*terrain.step,y=terrain.points[i]-4,s=2+detailNoise(i,91)*4;polygon([[x-s,y],[x-1,y-s],[x+s,y-1],[x+s*.5,y+2]]);ctx.fill();}}
  ctx.strokeStyle='#efb17a99';ctx.lineWidth=1.2;for(let x=24;x<WORLD_WIDTH;x+=31){if(detailNoise(x,451)>.54){const y=terrainHeightAt(terrain,x)-4,h=3+detailNoise(x,463)*7;ctx.beginPath();ctx.moveTo(x-3,y);ctx.quadraticCurveTo(x,y-h,x+4,y-1);ctx.stroke();}}
  drawProps();
}
function drawProps(){
  const props=[{x:295,type:'cactus'},{x:685,type:'relay'},{x:1015,type:'cactus'},{x:1325,type:'relay'},{x:1580,type:'cactus'},{x:1900,type:'relay'},{x:2310,type:'cactus'}];
  for(const prop of props){const y=terrainHeightAt(state.terrain,prop.x);ctx.save();ctx.translate(prop.x,y);ctx.strokeStyle='#143d42';ctx.fillStyle='#245b4d';ctx.lineCap='square';
    if(prop.type==='cactus'){ctx.lineWidth=13;ctx.beginPath();ctx.moveTo(0,1);ctx.lineTo(0,-53);ctx.moveTo(0,-26);ctx.lineTo(-17,-34);ctx.lineTo(-17,-46);ctx.moveTo(0,-38);ctx.lineTo(16,-45);ctx.lineTo(16,-56);ctx.stroke();ctx.strokeStyle='#4b8a68';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-3,-4);ctx.lineTo(-3,-49);ctx.stroke();}
    else{ctx.fillStyle='#173f47';polygon([[-6,0],[-3,-70],[4,-70],[7,0]]);ctx.fill();ctx.fillStyle='#274f54';ctx.fillRect(-26,-73,52,7);ctx.fillStyle='#f0a75a';for(let x=-22;x<=20;x+=14){polygon([[x,-77],[x+7,-77],[x+5,-69],[x+1,-69]]);ctx.fill();}ctx.strokeStyle='#173f47';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(1,-70);ctx.lineTo(15,-91);ctx.stroke();ctx.fillStyle='#6bd2ca';ctx.beginPath();ctx.arc(16,-92,4,0,Math.PI*2);ctx.fill();}
    ctx.restore();
  }
}
function drawTrackAssembly(accent){
  ctx.fillStyle='#14232d';ctx.strokeStyle='#09151d';ctx.lineWidth=3;polygon([[-42,-8],[-34,-15],[31,-15],[42,-6],[37,11],[-34,12],[-43,5]]);ctx.fill();ctx.stroke();
  const trackLight=ctx.createLinearGradient(0,-12,0,10);trackLight.addColorStop(0,'#65747a');trackLight.addColorStop(.44,'#3c4e57');trackLight.addColorStop(1,'#263943');ctx.fillStyle=trackLight;ctx.strokeStyle='#829096';ctx.lineWidth=1.5;polygon([[-36,-7],[-29,-11],[29,-11],[36,-5],[32,7],[-31,8],[-37,3]]);ctx.fill();ctx.stroke();
  ctx.strokeStyle='#182a34';ctx.lineWidth=2;for(const x of [-27,-13,1,15,29]){ctx.beginPath();ctx.moveTo(x-4,-5);ctx.lineTo(x+4,5);ctx.stroke();ctx.fillStyle='#1e303a';ctx.beginPath();ctx.arc(x,0,7.5,0,Math.PI*2);ctx.fill();ctx.strokeStyle=accent;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#8f9997';ctx.beginPath();ctx.arc(x,0,2.5,0,Math.PI*2);ctx.fill();}
  ctx.strokeStyle='#101d25';ctx.lineWidth=3;for(let x=-32;x<=32;x+=8){ctx.beginPath();ctx.moveTo(x,-10);ctx.lineTo(x+3,-13);ctx.moveTo(x,8);ctx.lineTo(x+4,10);ctx.stroke();}
  ctx.strokeStyle='#b8c0b7';ctx.globalAlpha=.38;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-28,-11);ctx.lineTo(28,-11);ctx.stroke();ctx.globalAlpha=1;
}
function drawTankBarrel(tank,palette){
  const slopeDegrees=tank.slope*180/Math.PI,localHeading=Number.isFinite(tank.heading)?(tank.direction===1?tank.heading+slopeDegrees:-tank.heading-slopeDegrees-180):tank.angle;
  ctx.save();ctx.translate(7,-25);ctx.rotate(-localHeading*Math.PI/180);ctx.fillStyle='#162a35';roundedRect(-2,-5,49,10,3);ctx.fill();ctx.strokeStyle='#0a1720';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle=palette.dark;ctx.fillRect(1,-7,13,14);ctx.fillStyle=palette.light;ctx.fillRect(14,-3,27,3);ctx.fillStyle='#12232c';polygon([[42,-7],[52,-7],[55,-3],[55,3],[52,7],[42,7]]);ctx.fill();ctx.fillStyle=palette.main;ctx.fillRect(44,-5,4,10);ctx.restore();
}
function drawTankHull(isPlayer,palette){
  ctx.strokeStyle='#10222d';ctx.lineWidth=3;ctx.fillStyle=palette.main;
  polygon(isPlayer?[[-37,-12],[-27,-31],[20,-31],[37,-14],[31,-7],[-34,-7]]:[[-38,-11],[-30,-31],[18,-34],[38,-18],[34,-8],[-34,-7]]);ctx.fill();ctx.stroke();
  ctx.fillStyle=palette.shadow;polygon([[-33,-13],[-26,-24],[-17,-24],[-12,-9],[-33,-8]]);ctx.fill();ctx.fillStyle=palette.light;polygon([[-24,-29],[17,-29],[26,-21],[-18,-22]]);ctx.fill();
  ctx.strokeStyle=palette.dark;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-6,-29);ctx.lineTo(-2,-9);ctx.moveTo(17,-28);ctx.lineTo(21,-12);ctx.stroke();ctx.fillStyle='#152934';roundedRect(-31,-20,12,8,2);ctx.fill();ctx.fillStyle='#ffe09a';ctx.fillRect(-28,-18,4,4);
  ctx.fillStyle='#162a34';ctx.fillRect(25,-22,4,10);ctx.strokeStyle='#9ba6a0';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(27,-22);ctx.lineTo(27,-29);ctx.stroke();
  ctx.fillStyle='#f7d890';if(isPlayer){polygon([[3,-19],[8,-24],[13,-19],[10,-19],[10,-14],[6,-14],[6,-19]]);ctx.fill();}else{ctx.fillRect(3,-22,3,8);ctx.fillRect(8,-22,3,8);ctx.fillRect(13,-22,3,8);}
  ctx.fillStyle='#e7d8ad';for(const [x,y] of [[-19,-26],[-9,-11],[29,-15]]){ctx.beginPath();ctx.arc(x,y,1.3,0,Math.PI*2);ctx.fill();}
}
function drawTankTurret(isPlayer,palette){
  ctx.fillStyle=palette.shadow;ctx.strokeStyle='#10222d';ctx.lineWidth=3;
  if(isPlayer){polygon([[-14,-31],[-8,-43],[13,-46],[25,-37],[21,-29],[-11,-29]]);}else{polygon([[-16,-32],[-11,-47],[9,-50],[24,-40],[23,-30],[-12,-29]]);}ctx.fill();ctx.stroke();
  ctx.fillStyle=palette.main;if(isPlayer)polygon([[-8,-40],[11,-43],[18,-37],[-7,-36]]);else polygon([[-7,-45],[9,-47],[17,-40],[-8,-39]]);ctx.fill();
  ctx.fillStyle=palette.light;ctx.fillRect(-4,isPlayer?-45:-49,12,3);ctx.fillStyle='#102530';roundedRect(isPlayer?16:15,-39,8,7,2);ctx.fill();ctx.fillStyle='#8de8dd';ctx.fillRect(isPlayer?18:17,-37,3,3);
  ctx.strokeStyle='#172832';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(-2,isPlayer?-43:-47,7,Math.PI,0);ctx.stroke();ctx.strokeStyle='#aab7ad';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-8,isPlayer?-45:-49);ctx.lineTo(-12,isPlayer?-61:-65);ctx.stroke();ctx.fillStyle=palette.light;ctx.beginPath();ctx.arc(-12,isPlayer?-62:-66,1.8,0,Math.PI*2);ctx.fill();
}
function drawTank(tank,isPlayer){
  const palette=isPlayer?{main:'#e87932',light:'#ffc24d',dark:'#93412f',shadow:'#6d3433',track:'#d57843'}:{main:'#39aeb8',light:'#82e0d9',dark:'#24667b',shadow:'#235367',track:'#4bb8b7'};
  ctx.save();ctx.translate(tank.x,tank.y);ctx.rotate(tank.slope);ctx.scale(tank.direction,1);ctx.lineJoin='round';
  ctx.globalAlpha=.25;ctx.fillStyle='#06131b';ctx.beginPath();ctx.ellipse(0,14,45,8,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
  drawTrackAssembly(palette.track);drawTankBarrel(tank,palette);drawTankHull(isPlayer,palette);drawTankTurret(isPlayer,palette);
  ctx.fillStyle='#dce5d4';for(const [x,y] of [[-23,-16],[26,-16],[-7,-37]]){ctx.beginPath();ctx.arc(x,y,1.6,0,Math.PI*2);ctx.fill();}
  if(tank.hp<45){const pulse=(performance.now()*.002)%1;ctx.globalAlpha=.26*(1-pulse);ctx.fillStyle='#29343a';ctx.beginPath();ctx.arc(-6,-58-pulse*18,8+pulse*10,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
  ctx.restore();
  if((state.turn===tank.id)&&state.phase==='aim'){const bob=Math.sin(performance.now()*.006)*3;ctx.fillStyle=isPlayer?'#ffe59b':'#87eee7';polygon([[tank.x,tank.y-79+bob],[tank.x-8,tank.y-92+bob],[tank.x+8,tank.y-92+bob]]);ctx.fill();ctx.fillStyle='#102a34cc';roundedRect(tank.x-26,tank.y-112+bob,52,17,5);ctx.fill();ctx.fillStyle='#fff4c2';ctx.font='800 10px Bahnschrift';ctx.textAlign='center';ctx.fillText(tank.name||(isPlayer?'先锋号':'守垒者'),tank.x,tank.y-100+bob);}
}
function drawAimDots(tank){
  if(state.phase!=='aim')return;const p=createProjectile(state,tank.id),isPlayer=tank.id==='player';ctx.fillStyle=isPlayer?'#ffe48a':'#83eff0';
  for(let i=1;i<=7;i++){const t=i*.13,x=p.x+p.vx*t,y=p.y+p.vy*t+.5*GRAVITY*t*t;ctx.globalAlpha=1-i*.1;ctx.beginPath();ctx.arc(x,y,5-i*.42,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
}
function drawSupplies(){
  for(const supply of state.supplies){
    ctx.save();ctx.translate(supply.x,supply.y);const sway=supply.landed?0:Math.sin(performance.now()*.004+supply.id)*8;ctx.translate(sway,0);
    if(!supply.landed){
      ctx.strokeStyle='#e8e0c7';ctx.lineWidth=1.5;for(const anchor of [-14,14]){ctx.beginPath();ctx.moveTo(anchor,-8);ctx.lineTo(anchor*2.2,-52);ctx.stroke();}
      ctx.fillStyle='#eee5cb';ctx.strokeStyle='#6f7e79';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-34,-50);ctx.quadraticCurveTo(0,-80,34,-50);ctx.quadraticCurveTo(18,-38,0,-48);ctx.quadraticCurveTo(-18,-38,-34,-50);ctx.fill();ctx.stroke();
      ctx.fillStyle='#fff6d7aa';ctx.beginPath();ctx.ellipse(0,10,26,5,0,0,Math.PI*2);ctx.fill();
    }else{
      const pulse=.5+Math.sin(performance.now()*.006+supply.id)*.3;ctx.globalAlpha=pulse*.34;ctx.fillStyle='#fff0a6';ctx.fillRect(-2,-62,4,50);ctx.globalAlpha=1;
    }
    ctx.fillStyle='#c9683d';ctx.strokeStyle='#192d37';ctx.lineWidth=3;roundedRect(-22,-13,44,26,4);ctx.fill();ctx.stroke();
    ctx.fillStyle='#e99c54';ctx.fillRect(-18,-9,36,7);ctx.fillStyle='#293e46';ctx.fillRect(-5,-12,10,24);ctx.fillStyle='#ffe59b';ctx.fillRect(-3,-5,6,10);
    ctx.restore();
  }
}
function drawProjectiles(){
  drawPreviousTrajectory();
  for(const p of projectiles){if(!p.alive)continue;
    if(p.trail.length>1){ctx.lineCap='round';for(let i=1;i<p.trail.length;i++){ctx.globalAlpha=(i/p.trail.length)*(p.weaponId==='pulse'?.72:.38);ctx.strokeStyle=WEAPONS[p.weaponId].color;ctx.lineWidth=(p.weaponId==='pulse'?2:1)+i/p.trail.length*(p.weaponId==='pulse'?7:4);ctx.beginPath();ctx.moveTo(p.trail[i-1].x,p.trail[i-1].y);ctx.lineTo(p.trail[i].x,p.trail[i].y);ctx.stroke();}}
    ctx.globalAlpha=1;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.atan2(p.vy,p.vx));ctx.shadowBlur=16;ctx.shadowColor=WEAPONS[p.weaponId].color;ctx.strokeStyle='#172936';ctx.lineWidth=2;
    if(p.weaponId==='armorPiercing'){ctx.fillStyle='#ff7859';polygon([[13,0],[2,-5],[-11,-4],[-14,0],[-11,4],[2,5]]);ctx.fill();ctx.stroke();ctx.fillStyle='#ffe3a1';ctx.fillRect(-8,-3,4,6);}
    else if(p.weaponId==='quake'){ctx.fillStyle='#e89b4b';polygon([[10,0],[4,-8],[-6,-9],[-13,-4],[-13,4],[-6,9],[4,8]]);ctx.fill();ctx.stroke();ctx.fillStyle='#ffe192';ctx.beginPath();ctx.arc(-2,0,3,0,Math.PI*2);ctx.fill();}
    else if(p.weaponId==='drill'){ctx.fillStyle='#cc62eb';polygon([[15,0],[5,-7],[-8,-6],[-14,-2],[-14,2],[-8,6],[5,7]]);ctx.fill();ctx.stroke();ctx.strokeStyle='#ffe8ff';ctx.beginPath();ctx.moveTo(-7,-5);ctx.lineTo(2,5);ctx.moveTo(0,-6);ctx.lineTo(8,3);ctx.stroke();}
    else if(p.weaponId==='hive'){ctx.fillStyle='#83e96f';if(p.bomblet){ctx.beginPath();ctx.arc(0,0,5,0,Math.PI*2);ctx.fill();ctx.stroke();}else{polygon([[10,0],[3,-8],[-7,-7],[-12,0],[-7,7],[3,8]]);ctx.fill();ctx.stroke();ctx.fillStyle='#eaff9d';for(const y of [-4,0,4])ctx.fillRect(-6,y-1,9,2);}}
    else if(p.weaponId==='meteor'){ctx.fillStyle='#ff5138';polygon([[17,0],[5,-10],[-11,-8],[-16,0],[-11,8],[5,10]]);ctx.fill();ctx.stroke();ctx.fillStyle='#ffe169';polygon([[-12,-6],[-32,0],[-12,6]]);ctx.fill();ctx.fillStyle='#2c2027';ctx.font='900 11px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('☢',0,0);}
    else if(p.weaponId==='pulse'){ctx.fillStyle='#e9ffff';ctx.beginPath();ctx.arc(0,0,7,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.strokeStyle='#5fe9ff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,12+Math.sin(performance.now()*.012)*2,0,Math.PI*2);ctx.stroke();}
    else{ctx.fillStyle='#ffd35a';ctx.beginPath();ctx.ellipse(0,0,9,5,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#fff2b0';ctx.beginPath();ctx.arc(4,-1,2,0,Math.PI*2);ctx.fill();}
    ctx.restore();
  }
}
function drawPreviousTrajectory(){
  const paths=state.lastTrajectories?.[state.turn];if(!paths)return;
  ctx.save();ctx.fillStyle='#fff4cf';ctx.globalAlpha=.38;
  for(const points of paths){
    for(const point of points){if(point.x<cameraX-10||point.x>cameraX+VIEW_WIDTH/.88+10)continue;ctx.beginPath();ctx.arc(point.x,point.y,2.4,0,Math.PI*2);ctx.fill();}
    const end=points.at(-1);if(end){ctx.strokeStyle='#fff4cf';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(end.x,end.y,6,0,Math.PI*2);ctx.stroke();}
  }
  ctx.restore();
}
function drawEffects(){
  for(const ring of shockwaves){const alpha=Math.max(0,ring.life);ctx.globalAlpha=alpha;const flash=ctx.createRadialGradient(ring.x,ring.y,0,ring.x,ring.y,Math.max(1,ring.radius));flash.addColorStop(0,ring.pulse?'#edffff':'#fff6cf');flash.addColorStop(.24,ring.pulse?'#5eeaffcc':'#ffbf47cc');flash.addColorStop(1,ring.pulse?'#315dff00':'#f0522600');ctx.fillStyle=flash;ctx.beginPath();ctx.arc(ring.x,ring.y,ring.radius,0,Math.PI*2);ctx.fill();ctx.strokeStyle=ring.color||'#ffe9a8';ctx.lineWidth=5*alpha;ctx.stroke();polygon(Array.from({length:16},(_,i)=>{const a=i*Math.PI/8,r=(i%2?ring.radius*.35:ring.radius*.72);return[ring.x+Math.cos(a)*r,ring.y+Math.sin(a)*r];}));ctx.globalAlpha=alpha*.38;ctx.fillStyle=ring.pulse?'#b9faff':'#fff2b4';ctx.fill();}
  for(const p of particles){const alpha=Math.max(0,p.life/p.max);ctx.globalAlpha=p.kind==='smoke'?alpha*.46:alpha;ctx.fillStyle=p.color;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rotation||0);if(p.kind==='smoke'){ctx.beginPath();ctx.arc(0,0,p.size*(1.35-alpha*.35),0,Math.PI*2);ctx.fill();}else if(p.kind==='chunk'){polygon([[-p.size,-p.size*.5],[p.size*.8,-p.size*.35],[p.size,p.size*.35],[-p.size*.5,p.size*.7]]);ctx.fill();}else{ctx.fillRect(-p.size*.25,-p.size*1.5,p.size*.5,p.size*3);}ctx.restore();}
  ctx.textAlign='center';ctx.font='900 26px Bahnschrift';for(const label of damageLabels){ctx.globalAlpha=Math.min(1,label.life*2);ctx.fillStyle='#fff3b2';ctx.strokeStyle='#732c2d';ctx.lineWidth=6;ctx.strokeText(label.text,label.x,label.y);ctx.fillText(label.text,label.x,label.y);}ctx.globalAlpha=1;
}
function drawVignette(){
  const v=ctx.createRadialGradient(VIEW_WIDTH*.5,VIEW_HEIGHT*.45,260,VIEW_WIDTH*.5,VIEW_HEIGHT*.45,790);v.addColorStop(0,'#0000');v.addColorStop(.72,'#06121d0d');v.addColorStop(1,'#04131f82');ctx.fillStyle=v;ctx.fillRect(0,0,VIEW_WIDTH,VIEW_HEIGHT);
  const grade=ctx.createLinearGradient(0,0,0,VIEW_HEIGHT);grade.addColorStop(0,'#03131f18');grade.addColorStop(.55,'#0000');grade.addColorStop(1,'#160f1d25');ctx.fillStyle=grade;ctx.fillRect(0,0,VIEW_WIDTH,VIEW_HEIGHT);
}

function spawnExplosion(explosion){
  const weapon=WEAPONS[explosion.weaponId],heavy=['quake','drill','meteor'].includes(explosion.weaponId);
  const nuclear=explosion.weaponId==='meteor',homing=explosion.weaponId==='pulse';
  shake=Math.max(shake,nuclear?30:heavy?15:homing?13:10);
  shockwaves.push({x:explosion.x,y:explosion.y,radius:4,max:Math.max(explosion.radius,explosion.crater*1.2),life:1,color:weapon.color,pulse:homing});
  if(nuclear){
    shockwaves.push({x:explosion.x,y:explosion.y,radius:2,max:explosion.radius*.72,life:.88,color:'#fff3b0',pulse:false});
    shockwaves.push({x:explosion.x,y:explosion.y,radius:8,max:explosion.radius*1.18,life:1.12,color:'#ff5a32',pulse:false});
  }
  const colors=explosion.weaponId==='pulse'?['#eaffff','#75edff','#407aff','#193b73']:explosion.weaponId==='hive'?['#f4ffb0','#8ef779','#3ba95d','#273f3c']:['#fff4bd','#ffc24d','#f16a3d','#873c34','#2d3d43'];
  const count=nuclear?104:heavy?52:explosion.weaponId==='hive'?24:homing?54:38;
  for(let i=0;i<count;i++){
    const a=rng()*Math.PI*2,speed=45+rng()*230,life=.45+rng()*.75;
    particles.push({x:explosion.x,y:explosion.y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed-70,life,max:life,size:2+rng()*7,color:colors[Math.floor(rng()*colors.length)],kind:i%5===0?'chunk':'spark',rotation:rng()*Math.PI,spin:(rng()-.5)*12});
  }
  const smokeCount=nuclear?28:heavy?14:homing?7:9;
  for(let i=0;i<smokeCount;i++){
    const life=.8+rng()*.75;
    particles.push({x:explosion.x+(rng()-.5)*18,y:explosion.y-rng()*10,vx:(rng()-.5)*42,vy:-35-rng()*72,life,max:life,size:14+rng()*18,color:i%3===0?'#533b45':'#263843',kind:'smoke',rotation:0,spin:0});
  }
  for(const [tankId,amount] of Object.entries(explosion.damages))if(amount>0){const tank=state.tanks[tankId];damageLabels.push({x:tank.x,y:tank.y-58,text:`-${amount}`,life:1.2});}
}

function updateEffects(dt){
  for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=(p.kind==='smoke'?-22:260)*dt;p.vx*=Math.pow(p.kind==='smoke'?.72:.3,dt);p.rotation=(p.rotation||0)+(p.spin||0)*dt;p.life-=dt;}
  particles=particles.filter(p=>p.life>0);
  for(const ring of shockwaves){ring.radius+=(ring.max-ring.radius)*Math.min(1,dt*9);ring.life-=dt*1.7;}shockwaves=shockwaves.filter(r=>r.life>0);
  for(const label of damageLabels){label.y-=35*dt;label.life-=dt;}damageLabels=damageLabels.filter(l=>l.life>0);
  shake*=Math.pow(.04,dt);if(shake<.1)shake=0;
}


function resetEffects(){particles=[];shockwaves=[];damageLabels=[];}
function effectState(){return {particles,shockwaves,damageLabels,shake};}
return {effectState,resetEffects,spawnExplosion,updateEffects,setFrame,drawSky,drawTerrain,drawTank,drawSupplies,drawAimDots,drawProjectiles,drawEffects,drawVignette,roundedRect,polygon};
}
