import * as THREE from '/vendor/three.module.js';
import { GLTFLoader } from '/vendor/loaders/GLTFLoader.js';
import { createDealerSculpt, sculptArmBone } from './dealer-model.js';
import { findVisibleItemSlot } from './item-slots.js';

/* 全部几何与贴图都是程序生成的原创资产：没有任何原作模型、贴图或采样。 */
const TABLE={size:2.6,top:.08,floor:-1.15};
/* 每人两排四位、共 8 个槽位，靠自己那一排先填。格子连成一块，边长等于间距。 */
const SLOT_CELL=.30;
const SLOT_X=[-1.02,-.72,-.42,-.12];
const slotRows=(near,far)=>[...SLOT_X.map(x=>[x,near]),...SLOT_X.map(x=>[x,far])];
const SLOTS={player:slotRows(.88,.58),ai:slotRows(-.88,-.58)};
const SHELL_CAP=8;
const SHELL_CELL={w:.108,d:.168};
const SHELL_ORIGIN={x:.42,z:-.06};
const shellCell=index=>({x:SHELL_ORIGIN.x+index*SHELL_CELL.w,z:SHELL_ORIGIN.z});
const LID_THICK=.012;
const LID_OPEN=1.92;
/* 长度回到能填满格子的那档；直径比那一档瘦一圈，别再做成矮胖子。 */
const SHELL_RADIUS=.022;
const SHELL_HULL=.108;
const SHELL_BRASS=.046;
/* 身份铭牌常驻桌面：A 庄家侧，B 玩家侧。举枪后点铭牌射击。 */
const PLAQUE={
  ai:{model:'identity-plaque-a',x:.08,z:-1.15,yaw:0},
  player:{model:'identity-plaque-b',x:.08,z:1.15,yaw:0},
};
const LIVE_COLOR=0x9c332d,BLANK_COLOR=0x2f4f6d,BRASS_COLOR=0x74602f;
const BONE_UP=new THREE.Vector3(0,1,0);
/* 庄家坐得离桌沿近一点，手臂才够得着桌心的枪。 */
const DEALER_Z=-1.62;
/* 道具与枪是按 _ref/docs/item-model-references-v1 的参考图在 Blender 里重建的，见 tools/build_item_models.py。 */
const MODEL_URL=name=>`/games/buckshot-roulette/models/${name}.glb`;
const MODEL_NAMES=['magnifier','cigarette','beer','cuffs','saw','adrenaline',
  'expiredMedicine','burnerPhone','shotgun',
  'identity-plaque-a','identity-plaque-b'];
/* 模型按桌面单位导出，摆到槽位里还要再收一点，免得三个道具挤在一起。 */
const ITEM_SCALE=.82;
/* 手机屏幕贴图：按机身玻璃 0.064×0.042 的比例。 */
const PHONE_TEX_W=2048,PHONE_TEX_H=1344;
/* 枪在桌上的实际长度：模型本身 .92，放进已经缩过的枪组里要按这个值折算。
   再长就会压到右侧的弹药陈列列。 */
const GUN_LENGTH=1.08;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const easeOut=value=>1-(1-value)**3;
const easeIn=value=>value*value*value;
const easeInOut=value=>value<.5?4*value*value*value:1-(-2*value+2)**3/2;
const texAt=(value,pixels)=>(value+TABLE.size/2)/TABLE.size*pixels;
const extraIds=(have,want)=>{
  const leftover=new Map();
  for(const id of have)leftover.set(id,(leftover.get(id)||0)+1);
  const extra=[];
  for(const id of want){
    const count=leftover.get(id)||0;
    if(count)leftover.set(id,count-1);
    else extra.push(id);
  }
  return extra;
};

function canvasTexture(width,height,paint){
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  paint(canvas.getContext('2d'),width,height);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}

/* 方桌桌布：霉绿底 + 少量大块污渍 + 白色印刷分区线，槽位与三维坐标一一对应。 */
function feltTexture(){
  return canvasTexture(1024,1024,(context,size)=>{
    context.fillStyle='#5c6b44';context.fillRect(0,0,size,size);
    for(let i=0;i<70;i++){
      const radius=44+Math.random()*140;
      context.fillStyle=['rgba(38,48,28,.26)','rgba(108,120,78,.2)','rgba(62,46,30,.16)'][i%3];
      context.beginPath();context.arc(Math.random()*size,Math.random()*size,radius,0,Math.PI*2);context.fill();
    }
    for(let i=0;i<24;i++){
      context.fillStyle=`rgba(${56+Math.random()*40|0},18,15,${.07+Math.random()*.12})`;
      context.beginPath();context.arc(Math.random()*size,Math.random()*size,12+Math.random()*44,0,Math.PI*2);context.fill();
    }
    for(let i=0;i<16;i++){
      context.strokeStyle=`rgba(24,20,16,${.06+Math.random()*.1})`;context.lineWidth=5+Math.random()*10;
      const x=Math.random()*size;
      context.beginPath();context.moveTo(x,Math.random()*size);context.lineTo(x+(Math.random()-.5)*90,Math.random()*size);context.stroke();
    }
    const px=value=>texAt(value,size);
    const grid=(xs,zs,cellW,cellD,fill=null)=>{
      const left=xs[0]-cellW/2,top=zs[0]-cellD/2;
      const width=xs.length*cellW,depth=zs.length*cellD;
      if(fill){
        context.fillStyle=fill;
        context.fillRect(px(left),px(top),width/TABLE.size*size,depth/TABLE.size*size);
      }
      context.strokeRect(px(left),px(top),width/TABLE.size*size,depth/TABLE.size*size);
      context.beginPath();
      for(let i=1;i<xs.length;i++){
        const x=px(left+i*cellW);
        context.moveTo(x,px(top));context.lineTo(x,px(top+depth));
      }
      for(let j=1;j<zs.length;j++){
        const z=px(top+j*cellD);
        context.moveTo(px(left),z);context.lineTo(px(left+width),z);
      }
      context.stroke();
    };
    context.strokeStyle='rgba(240,236,216,.82)';context.lineWidth=5;context.lineJoin='miter';
    context.strokeRect(22,22,size-44,size-44);
    context.beginPath();context.arc(size/2,size/2,size*.35,0,Math.PI*2);context.stroke();
    context.lineWidth=3.5;context.strokeStyle='rgba(240,236,216,.9)';
    const playerZ=[SLOTS.player[4][1],SLOTS.player[0][1]];
    const dealerZ=[SLOTS.ai[0][1],SLOTS.ai[4][1]];
    /* 白线画在活动盖上。毡面只留凹槽，盖板翻下去后露出空位。 */
    grid(SLOT_X,playerZ,SLOT_CELL,SLOT_CELL,'rgba(12,16,10,.38)');
    grid(SLOT_X,dealerZ,SLOT_CELL,SLOT_CELL,'rgba(12,16,10,.38)');
    const shellXs=Array.from({length:SHELL_CAP},(_,index)=>shellCell(index).x);
    context.lineWidth=2.5;context.strokeStyle='rgba(18,22,14,.55)';
    grid(shellXs,[SHELL_ORIGIN.z],SHELL_CELL.w,SHELL_CELL.d,'rgba(10,14,8,.5)');
    /* 暗角直接烤进贴图，桌沿自然沉进黑暗。 */
    const edge=context.createRadialGradient(size/2,size/2,size*.26,size/2,size/2,size*.76);
    edge.addColorStop(0,'rgba(0,0,0,0)');edge.addColorStop(1,'rgba(4,5,4,.6)');
    context.fillStyle=edge;context.fillRect(0,0,size,size);
  });
}

function floorTexture(){
  const texture=canvasTexture(256,256,(context,size)=>{
    context.fillStyle='#1d1819';context.fillRect(0,0,size,size);
    context.strokeStyle='rgba(96,84,78,.55)';context.lineWidth=5;
    context.strokeRect(2,2,size-4,size-4);
    for(let i=0;i<40;i++){
      context.fillStyle=`rgba(${34+Math.random()*44|0},${26+Math.random()*26|0},24,.32)`;
      context.beginPath();context.arc(Math.random()*size,Math.random()*size,6+Math.random()*30,0,Math.PI*2);context.fill();
    }
  });
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.repeat.set(8,8);
  return texture;
}

/* 活动盖板顶面：毡绿底 + 白漆边，翻下去后毡面上只剩凹槽。 */
function lidTexture(){
  return canvasTexture(128,128,(context,size)=>{
    context.fillStyle='#61704a';context.fillRect(0,0,size,size);
    context.fillStyle='#4e5a3c';
    context.fillRect(8,8,size-16,size-16);
    context.strokeStyle='rgba(244,240,220,.95)';
    context.lineWidth=7;
    context.strokeRect(3,3,size-6,size-6);
  });
}

/* 电流机面板：绿色闪电的数量就是生命值，这是画面里唯一的冷色高光。 */
function machineTexture(charges,max){
  return canvasTexture(256,128,(context,width,height)=>{
    context.fillStyle='#131512';context.fillRect(0,0,width,height);
    context.strokeStyle='#3d4038';context.lineWidth=6;context.strokeRect(3,3,width-6,height-6);
    context.fillStyle='#0a0c09';context.fillRect(16,34,width-32,60);
    const slot=Math.max(12,(width-60)/Math.max(max,1));
    const scale=Math.min(1,slot/20);
    for(let i=0;i<max;i++){
      const x=30+i*slot,lit=i<charges;
      context.fillStyle=lit?'#7dffa8':'#1d251c';
      context.shadowColor='#7dffa8';context.shadowBlur=lit?18*scale:0;
      context.beginPath();
      context.moveTo(x+14*scale,42);context.lineTo(x+2*scale,70);context.lineTo(x+11*scale,70);context.lineTo(x+4*scale,88);
      context.lineTo(x+22*scale,60);context.lineTo(x+12*scale,60);context.lineTo(x+20*scale,42);
      context.closePath();context.fill();
    }
    context.shadowBlur=0;
    context.fillStyle='#5c6157';context.font='700 17px "Arial Narrow",Arial,sans-serif';
    context.fillText('CHARGE',18,26);context.fillText(`${charges}/${max}`,width-58,26);
  });
}

function glowTexture(){
  return canvasTexture(128,128,(context,width)=>{
    const gradient=context.createRadialGradient(64,64,0,64,64,64);
    gradient.addColorStop(0,'rgba(255,236,190,1)');gradient.addColorStop(.35,'rgba(255,170,80,.62)');gradient.addColorStop(1,'rgba(255,120,40,0)');
    context.fillStyle=gradient;context.fillRect(0,0,width,width);
  });
}

class BuckshotTable3D{
  constructor(canvas){
    this.canvas=canvas;
    this.host=canvas.parentElement;
    this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled=true;
    this.renderer.shadowMap.type=THREE.PCFShadowMap;
    this.renderer.setClearColor(0x040505,1);
    this.scene=new THREE.Scene();
    this.scene.background=new THREE.Color(0x040505);
    this.scene.fog=new THREE.Fog(0x040505,3.4,8.6);
    this.camera=new THREE.PerspectiveCamera(45,1,.1,40);
    /* 镜头退到桌外：牌桌只占画面中段，四周留出房间。 */
    this.cameraBase=new THREE.Vector3(0,1.78,3.15);
    this.cameraHome=this.cameraBase.clone();
    this.cameraTargetHome=new THREE.Vector3(0,.08,-.15);
    this.cameraTarget=this.cameraTargetHome.clone();
    this.stealFocus=false;
    this.stealCamGen=0;
    this.shake=0;
    this.tweens=new Set();
    this.shellGroup=new THREE.Group();
    this.itemGroup=new THREE.Group();
    this.shellSlots=Array.from({length:SHELL_CAP},()=>null);
    this.itemSlots={player:Array.from({length:8},()=>null),ai:Array.from({length:8},()=>null)};
    this.itemNodes={player:[],ai:[]};
    this.glow=glowTexture();
    /* 全部操作都在桌面上完成：onPick 把点到的枪/道具/目标牌交回 ui.js。 */
    this.onPick=null;
    this.pickState={gun:false,items:[],targets:false};
    this.hoverTarget=null;
    this.plaqueTurn=null;
    this.gunDrawn=false;
    this.night=false;
    this.dealerDead=false;
    this.revealHp=null;
    this.fxSprites=new Set();
    this.raycaster=new THREE.Raycaster();
    this.pointer=new THREE.Vector2();
    this.models=new Map();
    this.ready=false;
    this.lastState=null;
    this.cuffed={player:false,ai:false};
    this.wristCuffs={player:null,ai:null};
    this.sawed=false;
    this.gunModelBaseScale=1;
    this.phoneCanvas=document.createElement('canvas');
    this.phoneCanvas.width=PHONE_TEX_W;this.phoneCanvas.height=PHONE_TEX_H;
    this.phoneTexture=new THREE.CanvasTexture(this.phoneCanvas);
    this.phoneTexture.colorSpace=THREE.SRGBColorSpace;
    this.phoneTexture.minFilter=THREE.LinearMipmapLinearFilter;
    this.phoneTexture.magFilter=THREE.LinearFilter;
    this.phoneTexture.generateMipmaps=true;
    this.phoneTexture.anisotropy=this.renderer.capabilities.getMaxAnisotropy();
    this.paintPhone('',false);
    this.setupLights();
    this.setupRoom();
    this.setupTable();
    this.setupTrays();
    this.setupGun();
    this.setupTargets();
    this.setupMachines();
    this.setupDealer();
    this.scene.add(this.shellGroup,this.itemGroup);
    this.setupPicking();
    this.resizeObserver=new ResizeObserver(()=>this.resize());
    this.resizeObserver.observe(this.host);
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.host.classList.remove('webgl-ready');});
    canvas.addEventListener('webglcontextrestored',()=>this.host.classList.add('webgl-ready'));
    this.resize();
    this.renderer.render(this.scene,this.camera);
    this.host.classList.add('webgl-ready');
    this.lastFrame=performance.now();
    this.frame=requestAnimationFrame(time=>this.animate(time));
    this.modelsReady=this.loadModels();
  }

  /* 模型是后台加载的：没到之前先用程序化几何体顶着，到了再整体换掉。 */
  async loadModels(){
    const loader=new GLTFLoader();
    const loaded=await Promise.allSettled(MODEL_NAMES.map(async name=>{
      const gltf=await loader.loadAsync(MODEL_URL(name));
      gltf.scene.traverse(object=>{
        if(!object.isMesh)return;
        object.castShadow=true;object.receiveShadow=true;
        for(const material of Array.isArray(object.material)?object.material:[object.material]){
          material.envMapIntensity=.85;
        }
      });
      return [name,gltf.scene];
    }));
    for(const entry of loaded){
      if(entry.status==='fulfilled')this.models.set(entry.value[0],entry.value[1]);
      else console.warn('道具模型加载失败',entry.reason);
    }
    if(this.disposed)return;
    if(this.models.has('shotgun'))this.applyGunModel(this.models.get('shotgun'));
    for(const [side,config] of Object.entries(PLAQUE))
      if(this.models.has(config.model))this.applyPlaqueModel(side,this.models.get(config.model));
    this.ready=true;
    this.swapItemModels();
    if(this.lastState)this.bindItemPicks(this.lastState);
  }

  /* 把 GLB 装进现有的枪组里：握把和枪口读模型自带的定位节点，不再写死坐标。 */
  applyGunModel(source){
    if(this.gunModel)this.gun.remove(this.gunModel);
    const model=source.clone(true);
    const box=new THREE.Box3().setFromObject(model);
    const scale=GUN_LENGTH/((box.max.x-box.min.x)*this.gun.scale.x);
    model.scale.setScalar(scale);
    /* 枪组原点悬在桌面上方，模型底面要落回桌面。 */
    model.position.y=-(TABLE.top+.05-TABLE.top)/this.gun.scale.y;
    this.gun.add(model);
    this.gunModel=model;
    this.gunModelBaseScale=scale;
    this.gunFallback.visible=false;
    if(this.sawed)this.applySawedScale(true);
    model.traverse(object=>{
      if(!object.isMesh)return;
      for(const material of Array.isArray(object.material)?object.material:[object.material]){
        material.envMapIntensity=.32;
        material.needsUpdate=true;
      }
    });
    const local=name=>{
      const node=source.getObjectByName(name);
      if(!node)return null;
      return node.position.clone().multiplyScalar(scale).add(model.position);
    };
    const grip=local('grip'),muzzle=local('muzzle'),chamber=local('chamber');
    if(grip)this.gripLocal.copy(grip);
    if(muzzle){this.muzzleLocal.copy(muzzle);this.flash.position.copy(muzzle);}
    if(chamber){
      this.chamberLocal.copy(chamber);
      this.chamberLamp.position.copy(chamber);
      if(this.inspectShell)this.inspectShell.position.copy(chamber);
    }
    this.pump=model.getObjectByName('Pump');
    this.pumpHome=this.pump?this.pump.position.x:0;
  }

  applyPlaqueModel(side,source){
    const plaque=this.plaques[side];
    if(!plaque)return;
    if(plaque.model)plaque.group.remove(plaque.model);
    const model=source.clone(true);
    plaque.group.add(model);
    plaque.model=model;
    plaque.amber=null;
    plaque.brass=null;
    model.traverse(object=>{
      if(!object.isMesh)return;
      object.castShadow=true;object.receiveShadow=true;
      for(const material of Array.isArray(object.material)?object.material:[object.material]){
        material.envMapIntensity=.7;
        if(material.name?.startsWith('AmberLight'))plaque.amber=material;
        if(material.name?.startsWith('AgedBrass'))plaque.brass=material;
      }
    });
    plaque.brassRough=plaque.brass?.roughness??.4;
    if(plaque.amber){plaque.amber.fog=false;plaque.amber.toneMapped=false;}
    if(!plaque.glow){
      plaque.glow=new THREE.PointLight(0xff9a3a,0,.62,2);
      plaque.glow.position.set(0,.05,0);
      plaque.group.add(plaque.glow);
    }
    this.ensurePlaqueHalo(side);
    this.updatePlaqueLights();
  }

  setupLights(){
    this.setupEnvironment();
    this.ambientLight=new THREE.AmbientLight(0x38342c,.6);
    this.scene.add(this.ambientLight);
    const lamp=new THREE.SpotLight(0xffe2ba,3.1,7.5,.86,.42,0);
    lamp.position.set(0,2.5,.3);lamp.target.position.set(0,0,-.1);
    lamp.castShadow=true;lamp.shadow.mapSize.set(512,512);lamp.shadow.bias=-.0012;
    this.keyLight=lamp;
    this.scene.add(lamp,lamp.target);
    const fill=new THREE.PointLight(0xf0d9b0,.8,4.2,0);fill.position.set(0,1.5,1.1);
    const rim=new THREE.PointLight(0x9a2d28,1.3,7,0);rim.position.set(-2.2,1.1,-1.6);
    const bounce=new THREE.PointLight(0x5c7a44,.55,3.4,0);bounce.position.set(0,.6,.1);
    this.fillLight=fill;this.rimLight=rim;this.bounceLight=bounce;
    this.scene.add(fill,rim,bounce);
    /* 黑夜只照自己这一半：灯放在身前，距离够不到对面格子。 */
    this.nightFill=new THREE.PointLight(0xffb070,1.25,1.52,2);
    this.nightFill.position.set(.06,.56,1.12);
    this.nightFill.visible=false;
    this.scene.add(this.nightFill);
    this.muzzleLight=new THREE.PointLight(0xffd08a,0,3.4,2);
    this.muzzleLight.position.set(0,.3,0);
    this.scene.add(this.muzzleLight);
  }

  /* 金属和玻璃要有东西可反射才有质感。这里烘一张极小的环境贴图，不额外拉 HDRI 资源。 */
  setupEnvironment(){
    const pmrem=new THREE.PMREMGenerator(this.renderer);
    const room=new THREE.Scene();
    const panel=(color,intensity,width,height,position,lookAt)=>{
      const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
      material.color.setHex(color).multiplyScalar(intensity);
      const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),material);
      mesh.position.set(...position);
      mesh.lookAt(...lookAt);
      room.add(mesh);
    };
    panel(0x1a1512,1,14,14,[0,-3,0],[0,1,0]);      // 地面
    panel(0x080708,1,14,14,[0,4.2,0],[0,-1,0]);    // 顶棚
    panel(0xffdcb0,3.4,3.2,3.2,[0,3.6,-.2],[0,0,-.2]);  // 头顶灯箱：金属主要反的就是它
    panel(0x6d1f1c,.9,9,5,[-5.2,1,-2],[0,1,-2]);   // 左侧红墙
    panel(0x263140,.55,9,5,[5.2,1,1],[0,1,1]);     // 右侧冷反光
    this.environmentTarget=pmrem.fromScene(room,.04);
    this.scene.environment=this.environmentTarget.texture;
    this.scene.environmentIntensity=.55;
    pmrem.dispose();
    room.traverse(object=>{if(object.isMesh){object.geometry.dispose();object.material.dispose();}});
  }

  setupRoom(){
    const wall=new THREE.MeshStandardMaterial({color:0x150f10,roughness:1});
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(18,18),
      new THREE.MeshStandardMaterial({map:floorTexture(),roughness:1}));
    floor.rotation.x=-Math.PI/2;floor.position.y=TABLE.floor;floor.receiveShadow=true;
    const back=new THREE.Mesh(new THREE.PlaneGeometry(12,6),wall);back.position.set(0,1.4,-3.6);
    const left=new THREE.Mesh(new THREE.PlaneGeometry(9,6),wall);left.rotation.y=Math.PI/2;left.position.set(-3.7,1.4,-.4);
    const right=left.clone();right.rotation.y=-Math.PI/2;right.position.x=3.7;
    this.scene.add(floor,back,left,right);
    /* 背景只保留两侧机柜和一组吊灯，别的一概不要。 */
    const rack=new THREE.MeshStandardMaterial({color:0x322524,roughness:.82,metalness:.35});
    for(const [x,h] of [[-2.15,2.2],[2.15,1.95]]){
      const cabinet=new THREE.Mesh(new THREE.BoxGeometry(1.2,h,.75),rack);
      cabinet.position.set(x,h/2+TABLE.floor,-2.6);
      const led=new THREE.Mesh(new THREE.PlaneGeometry(.4,.05),
        new THREE.MeshBasicMaterial({color:0xc4433a,toneMapped:false}));
      led.position.set(x,h+TABLE.floor-.55,-2.22);
      this.scene.add(cabinet,led);
    }
    const beam=new THREE.Mesh(new THREE.BoxGeometry(7,.12,.12),
      new THREE.MeshStandardMaterial({color:0x1c1516,roughness:.9,metalness:.4}));
    beam.position.set(0,1.34,-1.2);
    this.scene.add(beam);
    this.lampBulbs=[];
    this.smallLampLights=[];
    for(const x of [-1.02,1.02]){
      const cord=new THREE.Mesh(new THREE.CylinderGeometry(.007,.007,.22,4),
        new THREE.MeshStandardMaterial({color:0x120e0e,roughness:1}));
      cord.position.set(x,1.22,-1.2);
      const shade=new THREE.Mesh(new THREE.ConeGeometry(.2,.18,10,1,true),
        new THREE.MeshStandardMaterial({color:0x2d2724,roughness:.6,metalness:.5,side:THREE.DoubleSide}));
      shade.position.set(x,1.03,-1.2);
      const bulb=new THREE.Mesh(new THREE.SphereGeometry(.05,8,6),
        new THREE.MeshBasicMaterial({color:0xffd2a0,toneMapped:false}));
      bulb.position.set(x,.97,-1.2);
      const small=new THREE.PointLight(0xffc090,.28,1.35,2);
      small.position.set(x,.9,-1.2);
      small.visible=false;
      this.lampBulbs.push(bulb);
      this.smallLampLights.push(small);
      this.scene.add(cord,shade,bulb,small);
    }
  }

  setupTable(){
    const woodMaterial=new THREE.MeshStandardMaterial({color:0x2c1c19,roughness:.82,metalness:.14});
    const rim=new THREE.Mesh(new THREE.BoxGeometry(TABLE.size+.14,.2,TABLE.size+.14),woodMaterial);
    rim.position.y=-.03;rim.receiveShadow=true;
    const felt=new THREE.Mesh(new THREE.PlaneGeometry(TABLE.size,TABLE.size),
      new THREE.MeshStandardMaterial({map:feltTexture(),roughness:.92}));
    felt.rotation.x=-Math.PI/2;felt.position.y=TABLE.top;felt.receiveShadow=true;
    this.scene.add(rim,felt);
    /* 四条桌腿：镜头拉远后能看到桌下，桌子必须真的站在地上。 */
    const legHeight=TABLE.floor*-1-.13;
    for(const x of [-1.16,1.16])for(const z of [-1.16,1.16]){
      const leg=new THREE.Mesh(new THREE.BoxGeometry(.14,legHeight,.14),woodMaterial);
      leg.position.set(x,-.13-legHeight/2,z);
      this.scene.add(leg);
    }
  }

  /* 每格一块能绕远边铰下去的盖板。子弹/道具焊在盖上，整格一起翻，不再从毡面中间穿模。 */
  makeLid(x,z,width,depth){
    const hinge=new THREE.Group();
    hinge.position.set(x,TABLE.top+.006,z-depth/2);
    hinge.rotation.x=LID_OPEN;
    const lid=new THREE.Group();
    lid.position.set(0,0,depth/2);
    const top=new THREE.MeshStandardMaterial({map:this.lidMap,roughness:.9,metalness:.04});
    const dark=new THREE.MeshStandardMaterial({color:0x2a241c,roughness:.86});
    const tile=new THREE.Mesh(new THREE.BoxGeometry(width*.94,LID_THICK,depth*.94),
      [dark,dark,top,dark,dark,dark]);
    tile.castShadow=true;tile.receiveShadow=true;
    lid.add(tile);
    hinge.add(lid);
    return {hinge,lid,tile,homeY:hinge.position.y,payload:null,live:null,faceUp:false};
  }

  setupTrays(){
    this.lidMap=lidTexture();
    this.shellSlots=[];
    for(let i=0;i<SHELL_CAP;i++){
      const {x,z}=shellCell(i);
      const cell=this.makeLid(x,z,SHELL_CELL.w,SHELL_CELL.d);
      cell.kind='shell';
      cell.pivot=cell.hinge;
      this.shellGroup.add(cell.hinge);
      this.shellSlots.push(cell);
    }
    this.itemSlots={player:[],ai:[]};
    for(const side of ['player','ai']){
      this.itemSlots[side]=SLOTS[side].map(([x,z],visual)=>{
        const cell=this.makeLid(x,z,SLOT_CELL,SLOT_CELL);
        cell.kind='item';
        cell.owner=side;
        cell.pivot=cell.hinge;
        cell.hinge.userData.visualSlot=visual;
        this.itemGroup.add(cell.hinge);
        return cell;
      });
    }
  }

  setupGun(){
    const steel=new THREE.MeshStandardMaterial({color:0x45423f,roughness:.42,metalness:.86});
    const dark=new THREE.MeshStandardMaterial({color:0x232120,roughness:.58,metalness:.7});
    const wood=new THREE.MeshStandardMaterial({color:0x53301f,roughness:.7,metalness:.1});
    const gun=new THREE.Group();
    /* 程序化的枪只作兜底：GLB 一加载好就整组隐藏。 */
    const fallback=new THREE.Group();
    gun.add(fallback);
    this.gunFallback=fallback;
    const add=(geometry,material,position,rotation={})=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.set(position.x,position.y,position.z);Object.assign(mesh.rotation,rotation);mesh.castShadow=true;mesh.receiveShadow=true;fallback.add(mesh);return mesh;};
    const barrel=add(new THREE.CylinderGeometry(.036,.04,.96,12),steel,{x:.38,y:.055,z:0},{z:Math.PI/2});
    add(new THREE.TorusGeometry(.047,.009,8,14),steel,{x:.86,y:.055,z:0},{y:Math.PI/2});
    const tube=add(new THREE.CylinderGeometry(.025,.028,.8,10),dark,{x:.31,y:-.028,z:0},{z:Math.PI/2});
    const pump=add(new THREE.CylinderGeometry(.052,.052,.22,10),wood,{x:.16,y:-.028,z:0},{z:Math.PI/2});
    this.pump=pump;
    this.pumpHome=pump.position.x;
    add(new THREE.BoxGeometry(.38,.13,.1),dark,{x:-.13,y:.035,z:0});
    add(new THREE.BoxGeometry(.27,.08,.115),steel,{x:-.02,y:.07,z:0});
    const stock=add(new THREE.BoxGeometry(.48,.15,.09),wood,{x:-.53,y:.01,z:0},{z:.06});
    add(new THREE.BoxGeometry(.2,.2,.095),wood,{x:-.76,y:-.015,z:0},{z:.06});
    const guard=add(new THREE.TorusGeometry(.065,.012,7,14),dark,{x:-.29,y:-.035,z:0},{x:Math.PI/2});
    guard.scale.set(1.35,.72,1);
    this.flash=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glow,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,toneMapped:false}));
    this.flash.scale.set(.9,.9,1);this.flash.position.set(.9,.04,0);
    gun.add(this.flash);
    /* 放大镜确认的弹药类型：在弹膛位置点一颗对应颜色的灯。 */
    this.chamberLamp=new THREE.Mesh(new THREE.SphereGeometry(.028,10,8),
      new THREE.MeshStandardMaterial({color:LIVE_COLOR,emissive:0x000000,roughness:.4}));
    this.chamberLamp.position.set(.02,.086,0);this.chamberLamp.visible=false;
    gun.add(this.chamberLamp);
    this.inspectShell=this.shellMesh(true);
    this.inspectShell.rotation.set(0,0,Math.PI/2);
    this.inspectShell.scale.setScalar(1.55);
    this.inspectShell.visible=false;
    gun.add(this.inspectShell);
    /* 方桌变小后枪要跟着收：横放在桌心。 */
    /* 枪在桌面上只占中间一小段，不能盖住右侧弹药展示区。 */
    gun.scale.setScalar(.44);
    gun.position.set(-.28,TABLE.top+.05,.08);
    /* YZX：先偏航再抬枪口，这样瞄准可以直接写成一对角度。 */
    gun.rotation.order='YZX';
    gun.rotation.y=.42;
    gun.userData.pick={type:'gun'};
    this.gun=gun;
    this.gunRest={position:gun.position.clone(),yaw:.42};
    /* 握把与枪口在枪本地坐标里的位置：手臂解算和枪焰都挂在这两点上，加载 GLB 后会被模型的定位节点覆盖。 */
    this.gripLocal=new THREE.Vector3(-.3,-.02,0);
    this.muzzleLocal=new THREE.Vector3(.92,.04,0);
    this.chamberLocal=new THREE.Vector3(.02,.086,0);
    this.inspectShell.position.copy(this.chamberLocal);
    /* 可以拿枪时在枪下点一圈呼吸光，告诉玩家这里能点。 */
    this.gunHint=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glow,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,color:0xffc98a}));
    this.gunHint.scale.set(1.5,1.5,1);
    this.gunHint.position.set(gun.position.x+.1,TABLE.top+.012,gun.position.z);
    this.scene.add(gun,this.gunHint);
  }

  /* 手臂是一条两段骨骼：肩固定在身体上，手每帧解算到目标点，所以枪永远是“被人伸手拿起来”的。 */
  armRig({color,shoulder,upperLength,foreLength,thickness,rest,bend,bony=false}){
    const skin=new THREE.MeshStandardMaterial({color,roughness:.82,flatShading:bony});
    const group=new THREE.Group();
    const bone=(radius,taper)=>{
      const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius*taper,radius,1,8),skin);
      mesh.castShadow=true;return mesh;
    };
    const upper=bony?sculptArmBone(thickness,skin):bone(thickness,.86),fore=bony?sculptArmBone(thickness*.86,skin,true):bone(thickness*.86,.86);
    const shoulderCap=new THREE.Mesh(new THREE.SphereGeometry(thickness*1.05,10,8),skin);
    const elbow=new THREE.Mesh(new THREE.SphereGeometry(thickness*.95,10,8),skin);
    const hand=new THREE.Group();
    /* 腕部补一颗球，免得小臂和手掌之间露出硬棱角。 */
    const wrist=new THREE.Mesh(new THREE.SphereGeometry(thickness*.9,10,8),skin);
    hand.add(wrist);
    const palm=new THREE.Mesh(new THREE.BoxGeometry(thickness*2.6,thickness*1.25,thickness*2.1),skin);
    const thumb=new THREE.Mesh(new THREE.BoxGeometry(thickness,thickness*.8,thickness*.7),skin);
    thumb.position.set(thickness*.9,thickness*.8,-thickness*.7);
    for(const part of [palm,thumb]){part.castShadow=true;hand.add(part);}
    /* 骨手多三根指骨：骷髅的手不能是一块方砖。 */
    if(bony)for(let i=0;i<3;i++){
      const finger=new THREE.Mesh(new THREE.BoxGeometry(thickness*1.5,thickness*.4,thickness*.4),skin);
      finger.position.set(-thickness*2,0,(i-1)*thickness*.75);
      finger.castShadow=true;hand.add(finger);
    }
    group.add(upper,fore,shoulderCap,elbow,hand);
    shoulderCap.position.copy(shoulder);
    this.scene.add(group);
    return {group,upper,fore,elbow,hand,
      shoulder:shoulder.clone(),rest:rest.clone(),target:rest.clone(),
      bend:bend.clone().normalize(),upperLength,foreLength};
  }

  /* 两段骨骼的解析解：手落在肩到目标的连线上，肘部朝 bend 指定的方向外撇。 */
  solveArm(rig){
    const {shoulder,target,upperLength:a,foreLength:b}=rig;
    const delta=target.clone().sub(shoulder);
    /* 留出肘部折角：目标再远也只伸到大约八成臂长，避免直臂长杆。 */
    const distance=clamp(delta.length(),Math.abs(a-b)+.04,a+b-.05);
    const forward=delta.normalize();
    const side=new THREE.Vector3().crossVectors(forward,rig.bend);
    if(side.lengthSq()<1e-6)side.set(1,0,0);
    const up=new THREE.Vector3().crossVectors(side.normalize(),forward).normalize();
    const angle=Math.acos(clamp((a*a+distance*distance-b*b)/(2*a*distance),-1,1));
    const elbow=shoulder.clone().addScaledVector(forward,a*Math.cos(angle)).addScaledVector(up,a*Math.sin(angle));
    const wrist=shoulder.clone().addScaledVector(forward,distance);
    this.placeBone(rig.upper,shoulder,elbow);
    this.placeBone(rig.fore,elbow,wrist);
    rig.elbow.position.copy(elbow);
    rig.hand.position.copy(wrist);
  }

  placeBone(mesh,from,to){
    const direction=to.clone().sub(from);
    const length=direction.length()||.001;
    mesh.position.copy(from).addScaledVector(direction,.5);
    mesh.scale.y=length;
    mesh.quaternion.setFromUnitVectors(BONE_UP,direction.normalize());
  }

  gripWorld(){
    this.gun.updateMatrixWorld();
    return this.gun.localToWorld(this.gripLocal.clone());
  }

  setupTargets(){
    this.plaques={};
    for(const [side,config] of Object.entries(PLAQUE)){
      const group=new THREE.Group();
      group.position.set(config.x,TABLE.top+.0008,config.z);
      group.rotation.y=config.yaw||0;
      group.userData.pick={type:'target',side};
      this.plaques[side]={group,config};
      this.scene.add(group);
    }
  }

  setupPicking(){
    const locate=event=>{
      const rect=this.canvas.getBoundingClientRect();
      this.pointer.set((event.clientX-rect.left)/rect.width*2-1,-((event.clientY-rect.top)/rect.height)*2+1);
      this.raycaster.setFromCamera(this.pointer,this.camera);
      const candidates=[];
      if(this.pickState.targets){
        candidates.push(...Object.values(this.plaques).map(plaque=>plaque.group));
        if(this.dealer)candidates.push(this.dealer);
        if(this.arms?.dealerLeft)candidates.push(this.arms.dealerLeft.group);
        if(this.arms?.dealerRight)candidates.push(this.arms.dealerRight.group);
      }
      if(this.pickState.gun)candidates.push(this.gun);
      /* 偷道具时可点的是庄家那一排，平时是自己那一排，两者互斥。 */
      const {side='player',slots=[],pick=slots}=this.pickState.picking||{};
      for(const mesh of this.itemNodes?.[side]||[])
        if(mesh.visible&&pick.includes(mesh.userData.pick?.slot))candidates.push(mesh);
      if(!candidates.length)return null;
      for(const hit of this.raycaster.intersectObjects(candidates,true)){
        for(let node=hit.object;node;node=node.parent)if(node.userData.pick)return node.userData.pick;
      }
      return null;
    };
    this.canvas.addEventListener('pointerdown',event=>{
      const pick=locate(event);
      if(pick)this.onPick?.(pick);
    });
    this.canvas.addEventListener('pointermove',event=>{
      const pick=locate(event);
      this.hoverTarget=this.pickState.targets&&pick?.type==='target'?pick.side:null;
      this.canvas.style.cursor=pick?'pointer':'default';
    });
  }

  setupMachines(){
    this.machines={};
    for(const side of ['player','ai']){
      const group=new THREE.Group();
      const shell=new THREE.Mesh(new THREE.BoxGeometry(.42,.2,.16),
        new THREE.MeshStandardMaterial({color:0x2a2c26,roughness:.7,metalness:.5}));
      shell.castShadow=true;
      const face=new THREE.Mesh(new THREE.PlaneGeometry(.38,.17),
        new THREE.MeshBasicMaterial({map:machineTexture(3,3),toneMapped:false}));
      face.position.z=.082;
      group.add(shell,face);
      /* 两台机器都朝向镜头：玩家必须能读出庄家的剩余生命。 */
      group.position.set(1.02,TABLE.top+.1,side==='player'?.88:-.88);
      group.rotation.y=side==='player'?-.32:-.18;
      group.rotation.x=-.24;
      this.machines[side]={group,face,charges:3,max:3};
      this.scene.add(group);
    }
  }

  setupDealer(){
    const sculpt=createDealerSculpt(this.glow);
    const skull=sculpt.head;
    skull.position.set(0,.72,.02);
    this.dealerHead=skull;
    this.dealerEyes=sculpt.eyes;
    this.dealerEyeLight=sculpt.eyeLight;
    this.dealer=new THREE.Group();
    this.dealer.add(skull,sculpt.torso);
    this.dealer.position.set(0,.02,DEALER_Z);
    this.dealer.userData.pick={type:'target',side:'ai'};
    this.dealer.traverse(object=>{if(object.isMesh)object.castShadow=true;});
    this.scene.add(this.dealer);
    this.boneRim=new THREE.PointLight(0x87bcea,.65,2.2,2);
    this.boneRim.position.set(.55,1.02,DEALER_Z-.32);this.scene.add(this.boneRim);
    /* 双方都是骨臂：右手持枪，左手拿道具。玩家是第一人称，闲置时手臂藏起来，只在动作里出现。 */
    const boneColor=0xc6aa78;
    this.arms={
      dealerLeft:this.armRig({color:boneColor,bony:true,shoulder:new THREE.Vector3(-.24,.5,DEALER_Z+.02),
        upperLength:.34,foreLength:.32,thickness:.046,bend:new THREE.Vector3(-1,.12,.25),
        rest:new THREE.Vector3(-.32,-.12,DEALER_Z+.02)}),
      dealerRight:this.armRig({color:boneColor,bony:true,shoulder:new THREE.Vector3(.24,.5,DEALER_Z+.02),
        upperLength:.34,foreLength:.32,thickness:.046,bend:new THREE.Vector3(1,.12,.25),
        rest:new THREE.Vector3(.32,-.12,DEALER_Z+.02)}),
      /* 玩家手臂从镜头两侧伸出，用道具时停在眼前，而不是伸到桌子中间。 */
      playerLeft:this.armRig({color:boneColor,bony:true,shoulder:this.viewPoint(-.22,-.16,.1),
        upperLength:.42,foreLength:.36,thickness:.05,bend:new THREE.Vector3(-1,.35,.2),
        rest:this.viewPoint(-.24,-.3,.16)}),
      playerRight:this.armRig({color:boneColor,bony:true,shoulder:this.viewPoint(.22,-.16,.1),
        upperLength:.42,foreLength:.36,thickness:.05,bend:new THREE.Vector3(1,.35,.2),
        rest:this.viewPoint(.24,-.3,.16)}),
    };
    for(const rig of Object.values(this.arms))rig.shoulderHome=rig.shoulder.clone();
    this.arms.dealerLeft.group.userData.pick={type:'target',side:'ai'};
    this.arms.dealerRight.group.userData.pick={type:'target',side:'ai'};
    this.arms.playerLeft.group.visible=false;
    this.arms.playerRight.group.visible=false;
  }

  gunArm(actor){return actor==='player'?this.arms.playerRight:this.arms.dealerRight;}
  itemArm(actor){return actor==='player'?this.arms.playerLeft:this.arms.dealerLeft;}
  isPlayerRig(rig){return rig===this.arms.playerLeft||rig===this.arms.playerRight;}
  /* 玩家骨臂默认不画，免得挡第一人称镜头；被铐住时例外，两只手必须留在近处桌沿。 */
  showArm(rig){
    if(this.night&&!this.isPlayerRig(rig)){rig.group.visible=false;return;}
    if(this.isPlayerRig(rig)){rig.group.visible=!!this.cuffed.player;return;}
    rig.group.visible=true;
  }

  /* 沿镜头视线摆点：x 右、y 上、dist 朝桌子。俯视时这样才落在画面里，而不是贴在镜头底下被裁掉。 */
  viewPoint(x=0,y=-.08,dist=.32){
    const origin=this.cameraHome;
    const forward=this.cameraTarget.clone().sub(origin).normalize();
    const right=new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0)).normalize();
    const up=new THREE.Vector3().crossVectors(right,forward).normalize();
    return origin.clone().addScaledVector(forward,dist).addScaledVector(right,x).addScaledVector(up,y);
  }
  nearView(x=0,y=-.08,dist=.32){return this.viewPoint(x,y,dist);}

  shellMesh(live){
    const group=new THREE.Group();
    const color=live?LIVE_COLOR:BLANK_COLOR;
    const hull=new THREE.Mesh(new THREE.CylinderGeometry(SHELL_RADIUS,SHELL_RADIUS,SHELL_HULL,14),
      new THREE.MeshStandardMaterial({color,roughness:.66,metalness:.12,fog:false}));
    hull.position.y=SHELL_BRASS/2-.004;
    const base=new THREE.Mesh(new THREE.CylinderGeometry(SHELL_RADIUS+.0018,SHELL_RADIUS+.0018,SHELL_BRASS,14),
      new THREE.MeshStandardMaterial({color:BRASS_COLOR,roughness:.4,metalness:.82,fog:false}));
    base.position.y=-(SHELL_HULL/2)+.002;
    for(const part of [hull,base]){part.castShadow=true;group.add(part);}
    group.rotation.x=Math.PI/2;
    return group;
  }

  /* 黑夜几乎没有环境光：看弹的那一颗必须自己发光，否则红蓝会糊成一团黑。 */
  lightInfoShell(root,live){
    if(!root)return;
    const hull=live?LIVE_COLOR:BLANK_COLOR;
    const glow=live?0xff3a22:0x4eb6ff;
    root.traverse(object=>{
      if(!object.isMesh||!object.material)return;
      const material=object.material;
      material.fog=false;
      material.toneMapped=false;
      material.transparent=false;
      material.opacity=1;
      material.depthWrite=true;
      if(object===root.children[0]){
        material.color.setHex(hull);
        material.emissive.setHex(this.night?glow:hull);
        material.emissiveIntensity=this.night?2.4:.12;
      }else{
        material.emissive.setHex(this.night?0x8a6a28:0x000000);
        material.emissiveIntensity=this.night?.7:0;
      }
    });
  }

  itemMesh(id){
    const model=this.models.get(id);
    if(model){
      const group=new THREE.Group();
      const clone=model.clone(true);
      /* 材质必须逐份复制：拿起道具时会改 opacity，共享材质会让同类道具一起变透明。 */
      clone.traverse(object=>{
        if(!object.isMesh)return;
        object.material=object.material.clone();
      });
      group.add(clone);
      return group;
    }
    const group=new THREE.Group();
    const metal=new THREE.MeshStandardMaterial({color:0x8b8b84,roughness:.3,metalness:.88,flatShading:true});
    const dark=new THREE.MeshStandardMaterial({color:0x272321,roughness:.58,metalness:.42,flatShading:true});
    const brass=new THREE.MeshStandardMaterial({color:0xb1843e,roughness:.32,metalness:.78,flatShading:true});
    const red=new THREE.MeshStandardMaterial({color:0xb83f35,roughness:.62});
    const cyan=new THREE.MeshStandardMaterial({color:0x43c7c0,roughness:.18,metalness:.15,transparent:true,opacity:.82});
    const add=(geometry,material,position,rotation={})=>{geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,material);mesh.position.set(position.x,position.y,position.z);Object.assign(mesh.rotation,rotation);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;};
    if(id==='magnifier'){
      add(new THREE.TorusGeometry(.068,.014,8,18),brass,{x:.035,y:.075,z:0},{x:Math.PI/2});
      add(new THREE.CylinderGeometry(.056,.056,.012,18),new THREE.MeshStandardMaterial({color:0x8eb7c0,roughness:.12,transparent:true,opacity:.6}),{x:.035,y:.075,z:0});
      add(new THREE.CylinderGeometry(.018,.024,.14,8),new THREE.MeshStandardMaterial({color:0x4b2b1e,roughness:.7}),{x:-.065,y:.035,z:0},{z:-.62});
    }else if(id==='cigarette'){
      add(new THREE.BoxGeometry(.105,.09,.072),red,{x:0,y:.045,z:0});
      add(new THREE.BoxGeometry(.105,.014,.072),new THREE.MeshStandardMaterial({color:0xe4dfd0,roughness:.7}),{x:0,y:.091,z:0});
      add(new THREE.BoxGeometry(.105,.012,.072),dark,{x:0,y:.105,z:.018},{x:-.22});
      add(new THREE.CylinderGeometry(.009,.009,.075,8),new THREE.MeshStandardMaterial({color:0xe7dfc9,roughness:.72}),{x:.015,y:.13,z:0});
      add(new THREE.CylinderGeometry(.009,.009,.018,8),red,{x:.015,y:.169,z:0});
    }else if(id==='beer'){
      add(new THREE.CylinderGeometry(.043,.043,.13,12),new THREE.MeshStandardMaterial({color:0x3f7146,roughness:.35,metalness:.5}),{x:0,y:.066,z:0});
      add(new THREE.CylinderGeometry(.044,.044,.026,12),new THREE.MeshStandardMaterial({color:0xd3c9a7,roughness:.5}),{x:0,y:.071,z:0});
      add(new THREE.CylinderGeometry(.044,.044,.008,12),metal,{x:0,y:.136,z:0});
      add(new THREE.TorusGeometry(.012,.003,6,10),metal,{x:.009,y:.142,z:0},{x:Math.PI/2});
    }else if(id==='cuffs'){
      for(const offset of [-.045,.045]){
        add(new THREE.TorusGeometry(.055,.014,8,16),metal,{x:offset,y:.065,z:offset*.55},{x:Math.PI/2});
        add(new THREE.BoxGeometry(.045,.035,.026),dark,{x:offset,y:.058,z:offset*.55});
      }
      for(const x of [-.018,0,.018])add(new THREE.TorusGeometry(.014,.004,6,10),metal,{x,y:.065,z:0},{x:Math.PI/2,z:Math.PI/2});
    }else if(id==='saw'){
      add(new THREE.BoxGeometry(.23,.018,.052),metal,{x:.025,y:.06,z:0});
      for(let i=0;i<6;i++)add(new THREE.ConeGeometry(.012,.026,4),metal,{x:-.07+i*.038,y:.035,z:.032},{x:Math.PI/2});
      add(new THREE.BoxGeometry(.065,.12,.055),red,{x:-.13,y:.07,z:0},{z:.18});
      add(new THREE.BoxGeometry(.045,.075,.07),dark,{x:-.13,y:.11,z:0},{z:.18});
    }else if(id==='adrenaline'){
      add(new THREE.CylinderGeometry(.026,.026,.16,10),new THREE.MeshStandardMaterial({color:0xd7d8ce,roughness:.45,metalness:.15}),{x:0,y:.08,z:0},{z:Math.PI/2});
      add(new THREE.CylinderGeometry(.021,.021,.115,10),cyan,{x:.015,y:.08,z:0},{z:Math.PI/2});
      add(new THREE.CylinderGeometry(.03,.03,.018,10),dark,{x:-.09,y:.08,z:0},{z:Math.PI/2});
      add(new THREE.CylinderGeometry(.006,.006,.06,8),metal,{x:.115,y:.08,z:0},{z:Math.PI/2});
      add(new THREE.BoxGeometry(.025,.018,.07),dark,{x:-.045,y:.08,z:0});
    }else if(id==='expiredMedicine'){
      add(new THREE.CylinderGeometry(.052,.058,.11,12),new THREE.MeshStandardMaterial({color:0x704d32,roughness:.62}),{x:0,y:.055,z:0});
      add(new THREE.CylinderGeometry(.038,.038,.025,12),new THREE.MeshStandardMaterial({color:0xe7e1d0,roughness:.6}),{x:0,y:.122,z:0});
      add(new THREE.CylinderGeometry(.054,.054,.045,12),new THREE.MeshStandardMaterial({color:0xe7e1d0,roughness:.6}),{x:0,y:.065,z:.052},{x:Math.PI/2});
      add(new THREE.BoxGeometry(.012,.045,.006),red,{x:-.014,y:.066,z:.081},{z:.7});add(new THREE.BoxGeometry(.012,.045,.006),red,{x:.014,y:.066,z:.081},{z:-.7});
      add(new THREE.SphereGeometry(.016,8,6),new THREE.MeshStandardMaterial({color:0xf1eee2,roughness:.7}),{x:.07,y:.018,z:.018});
      add(new THREE.SphereGeometry(.016,8,6),new THREE.MeshStandardMaterial({color:0xf1eee2,roughness:.7}),{x:.095,y:.018,z:.018});
    }else if(id==='burnerPhone'){
      add(new THREE.BoxGeometry(.13,.022,.22),dark,{x:0,y:.018,z:0});
      add(new THREE.BoxGeometry(.095,.006,.095),new THREE.MeshStandardMaterial({color:0x7ea58e,roughness:.3,metalness:.2}),{x:0,y:.033,z:-.035});
      for(let row=0;row<4;row++)for(let col=0;col<3;col++)add(new THREE.BoxGeometry(.018,.008,.018),metal,{x:(col-1)*.029,y:.035,z:.035+row*.03});
    }else{
      add(new THREE.BoxGeometry(.08,.05,.08),dark,{x:0,y:.025,z:0});
    }
    return group;
  }

  disposeNode(node,{dropGeometry=false}={}){
    if(!node)return;
    node.removeFromParent();
    node.traverse(object=>{
      if(!object.isMesh)return;
      if(dropGeometry)object.geometry.dispose();
      for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();
    });
  }

  detachPayload(cell){
    if(!cell?.payload)return;
    this.disposeNode(cell.payload,{dropGeometry:cell.kind==='shell'||cell.procedural});
    cell.payload=null;
    cell.mesh=null;
    cell.live=null;
    cell.id=null;
    cell.procedural=false;
  }

  resetLayout(){
    for(const side of ['player','ai'])this.clearWristCuffs(side);
    this.cuffed={player:false,ai:false};
    this.setSawed(false,{animate:false});
    this.hideInspect();
    this.gunDrawn=false;
    this.dealerDead=false;
    this.clearFx();
    this.stealFocus=false;
    this.stealCamGen=(this.stealCamGen||0)+1;
    this.cameraHome.copy(this.cameraBase);
    this.cameraTarget.copy(this.cameraTargetHome||new THREE.Vector3(0,.08,-.15));
    this.camera.fov=45;
    this.camera.updateProjectionMatrix();
    if(this.gun&&this.gunRest){
      this.gun.position.copy(this.gunRest.position);
      this.gun.rotation.y=this.gunRest.yaw;
      this.gun.rotation.z=0;
    }
    if(this.dealer){
      this.dealer.rotation.x=0;
      this.dealerHead.position.set(0,.72,.02);
      this.dealerHead.rotation.set(0,0,0);
      this.dealerEyeLight.intensity=.005;
      for(const part of this.dealerEyes)if(part.isSprite)part.material.opacity=.7;
      for(const rig of Object.values(this.arms||{})){
        if(rig.shoulderHome)rig.shoulder.copy(rig.shoulderHome);
        rig.target.copy(rig.rest);
      }
      this.arms.playerLeft.group.visible=false;
      this.arms.playerRight.group.visible=false;
    }
    for(const cell of this.shellSlots){
      this.detachPayload(cell);
      cell.hinge.rotation.x=LID_OPEN;
      cell.hinge.position.y=cell.homeY;
      cell.faceUp=false;
    }
    for(const side of ['player','ai']){
      for(const cell of this.itemSlots[side]){
        this.detachPayload(cell);
        cell.hinge.rotation.x=LID_OPEN;
        cell.hinge.position.y=cell.homeY;
        cell.faceUp=false;
        cell.hinge.userData.pick=null;
      }
      this.itemNodes[side]=[];
    }
    if(this.night)this.applyDealerNight();
  }

  /* 绕格子远边铰下去：先轻轻翘起，再加速落入凹槽。盖板挡住子弹，看起来是整格在翻。 */
  async flipLid(cell,{up}={}){
    const hinge=cell.hinge;
    const aiSlot=(this.itemSlots.ai||[]).includes(cell);
    hinge.visible=!(this.night&&aiSlot);
    if(up){
      const start=hinge.rotation.x;
      await this.tween({duration:460,update:progress=>{
        const e=easeOut(progress);
        hinge.rotation.x=start+(0-start)*e;
        hinge.position.y=cell.homeY+Math.sin(progress*Math.PI)*.012*(1-progress);
      }});
      hinge.rotation.x=0;
      hinge.position.y=cell.homeY;
      cell.faceUp=true;
      return;
    }
    cell.faceUp=false;
    await this.tween({duration:90,update:progress=>{
      hinge.rotation.x=-.14*easeOut(progress);
      hinge.position.y=cell.homeY+.01*easeOut(progress);
    }});
    const tilt=hinge.rotation.x,lift=hinge.position.y;
    await this.tween({duration:420,update:progress=>{
      const e=easeIn(progress);
      hinge.rotation.x=tilt+(LID_OPEN-tilt)*e;
      hinge.position.y=lift+(cell.homeY-lift)*e;
    }});
    hinge.rotation.x=LID_OPEN;
    hinge.position.y=cell.homeY;
    cell.faceUp=false;
  }

  attachShell(cell,live){
    this.detachPayload(cell);
    const mesh=this.shellMesh(live);
    mesh.position.y=LID_THICK/2+SHELL_RADIUS+.002;
    cell.lid.add(mesh);
    cell.payload=mesh;
    cell.mesh=mesh;
    cell.live=live;
    cell.kind='shell';
  }

  attachItem(cell,id,side='player'){
    this.detachPayload(cell);
    const mesh=this.itemMesh(id);
    mesh.scale.setScalar(ITEM_SCALE);
    mesh.position.y=LID_THICK/2+.018;
    mesh.rotation.y=side==='ai'?Math.PI:0;
    if(id==='burnerPhone')this.mountPhoneScreen(mesh);
    cell.lid.add(mesh);
    cell.payload=mesh;
    cell.mesh=mesh;
    cell.id=id;
    cell.owner=side;
    cell.procedural=!this.models.has(id);
    cell.kind='item';
    cell.hinge.userData.pick={type:'item',side,id,slot:cell.hinge.userData.visualSlot};
    cell.hinge.userData.itemId=id;
  }

  mountPhoneScreen(mesh){
    if(!mesh||mesh.getObjectByName('PhoneScreen'))return;
    const screen=new THREE.Mesh(new THREE.PlaneGeometry(1,1),
      new THREE.MeshBasicMaterial({
        map:this.phoneTexture,toneMapped:false,color:0xffffff,
        transparent:true,depthWrite:false,
      }));
    screen.name='PhoneScreen';
    screen.castShadow=false;
    screen.receiveShadow=false;
    screen.visible=false;
    const glass=mesh.getObjectByName('Glass');
    if(glass){
      glass.geometry.computeBoundingBox();
      const box=glass.geometry.boundingBox;
      const dim=new THREE.Vector3(box.max.x-box.min.x,box.max.y-box.min.y,box.max.z-box.min.z);
      const axes=[['x',dim.x],['y',dim.y],['z',dim.z]].sort((a,b)=>a[1]-b[1]);
      const thin=axes[0][0];
      screen.scale.set(axes[2][1]*.96,axes[1][1]*.96,1);
      if(thin==='x')screen.rotation.y=Math.PI/2;
      else if(thin==='y')screen.rotation.x=-Math.PI/2;
      screen.position.addVectors(box.min,box.max).multiplyScalar(.5);
      screen.position[thin]+=dim[thin]/2+.0008;
      glass.add(screen);
      return;
    }
    screen.scale.set(.09,.055,1);
    screen.rotation.x=-Math.PI/2;
    screen.position.set(0,.037,-.035);
    mesh.add(screen);
  }

  showPhoneScreen(payload,on){
    for(const side of ['player','ai'])for(const cell of this.itemSlots[side]){
      const screen=cell?.payload?.getObjectByName('PhoneScreen');
      if(screen)screen.visible=false;
    }
    const screen=payload?.getObjectByName('PhoneScreen');
    if(screen)screen.visible=!!on;
  }

  findItemSlot(side,{slot=null,id=null}={}){
    return findVisibleItemSlot(this.itemSlots[side]||[],{slot,id});
  }

  bindItemPicks(state){
    if(!state)return;
    for(const side of ['player','ai']){
      const seen=new Map();
      this.itemNodes[side]=[];
      for(const cell of this.itemSlots[side]){
        if(!cell?.faceUp||!cell.id)continue;
        const id=cell.id;
        const occ=seen.get(id)||0;
        seen.set(id,occ+1);
        let found=0;
        const engineSlot=state.items[side].findIndex(item=>{
          if(item!==id)return false;
          if(found===occ)return true;
          found+=1;
          return false;
        });
        cell.hinge.userData.pick={type:'item',side,id,slot:engineSlot<0?cell.hinge.userData.visualSlot:engineSlot};
        cell.hinge.userData.itemId=id;
        this.itemNodes[side].push(cell.hinge);
      }
    }
  }

  swapItemModels(){
    for(const side of ['player','ai'])for(const cell of this.itemSlots[side]){
      if(!cell||!cell.procedural||!cell.id||!this.models.has(cell.id))continue;
      if(cell.mesh&&cell.mesh.parent!==cell.lid)continue;
      const next=this.itemMesh(cell.id);
      next.scale.setScalar(ITEM_SCALE);
      next.position.copy(cell.mesh.position);
      next.rotation.copy(cell.mesh.rotation);
      cell.lid.remove(cell.mesh);
      this.disposeNode(cell.mesh,{dropGeometry:true});
      cell.lid.add(next);
      cell.mesh=next;
      cell.payload=next;
      cell.procedural=false;
      if(cell.id==='burnerPhone')this.mountPhoneScreen(next);
    }
  }

  async flipShellDown(live){
    const cells=this.shellSlots;
    const index=live
      ? cells.findIndex(cell=>cell?.faceUp&&cell.live)
      : cells.findLastIndex(cell=>cell?.faceUp&&!cell.live);
    if(index<0)return;
    const cell=cells[index];
    await this.flipLid(cell,{up:false});
    this.detachPayload(cell);
  }

  async flipItemDown(side,{slot=null,id=null}={}){
    const cell=this.findItemSlot(side,{slot,id});
    if(!cell)return;
    await this.flipLid(cell,{up:false});
    this.detachPayload(cell);
    this.itemNodes[side]=this.itemNodes[side].filter(node=>node!==cell.hinge);
  }

  /* 朝上红弹 = liveCount，朝上蓝弹 = 空弹数；新弹按左红右蓝占格，整格从凹槽里翻上来。 */
  async playReload(state=this.lastState,{shells=true}={}){
    if(!state)return;
    const rising=[];
    if(shells){
      const live=state.liveCount,blank=state.ammoCount-live;
      const wantAmmo=Array.from({length:SHELL_CAP},()=>null);
      for(let i=0;i<live;i++)wantAmmo[i]=true;
      for(let i=0;i<blank;i++)wantAmmo[SHELL_CAP-blank+i]=false;
      for(let i=0;i<SHELL_CAP;i++){
        const cell=this.shellSlots[i];
        this.detachPayload(cell);
        if(wantAmmo[i]!==null)this.attachShell(cell,wantAmmo[i]);
        if(!cell.faceUp)rising.push(cell);
      }
    }
    for(const side of ['player','ai']){
      const have=this.itemSlots[side].filter(cell=>cell?.faceUp&&cell.id).map(cell=>cell.id);
      const extra=extraIds(have,state.items[side]);
      for(const cell of this.itemSlots[side]){
        if(cell.faceUp)continue;
        this.detachPayload(cell);
      }
      let next=0;
      for(const id of extra){
        while(next<8&&(this.itemSlots[side][next].faceUp&&this.itemSlots[side][next].id))next+=1;
        if(next>=8)break;
        const cell=this.itemSlots[side][next];
        cell.hinge.userData.pick={type:'item',side,id,slot:next};
        this.attachItem(cell,id,side);
        if(!cell.faceUp)rising.push(cell);
        next+=1;
      }
      if(shells)for(const cell of this.itemSlots[side])if(!cell.faceUp&&!cell.id)rising.push(cell);
    }
    await Promise.all([
      shells?this.setSawed(false):Promise.resolve(),
      ...rising.map((cell,index)=>this.tween({duration:Math.max(16,Math.min(32*index,220)),update(){}}).then(()=>this.flipLid(cell,{up:true}))),
    ]);
    this.bindItemPicks(state);
  }

  sync(state){
    if(!state)return;
    this.lastState=state;
    this.bindItemPicks(state);
    for(const side of ['player','ai']){
      const machine=this.machines[side];
      const max=state.maxHp??machine.max??6;
      if(machine.charges===state.hp[side]&&machine.max===max)continue;
      machine.charges=state.hp[side];
      machine.max=max;
      machine.face.material.map.dispose();
      machine.face.material.map=machineTexture(state.hp[side],max);
      machine.face.material.needsUpdate=true;
    }
    this.gunRest.position.y=TABLE.top+.05;
    this.host.classList.toggle('dealer-turn',!state.over&&state.turn==='ai');
    this.plaqueTurn=state.over?null:state.turn;
    this.updatePlaqueLights();
  }

  /* ui.js 每次渲染都告知当前能点什么：枪、哪几个道具、以及是否已经举枪待选目标。 */
  setPickable({gun=false,items=[],targets=false}={}){
    this.pickState={gun,targets,picking:items};
    if(!targets)this.hoverTarget=null;
    if(!gun)this.gunHint.material.opacity=0;
    /* 可点的道具轻微抬高一点，告诉玩家这里能点；偷取时高亮的是庄家那一排。 */
    const {side='player',slots=[],pick=slots}=items||{};
    for(const owner of ['player','ai'])for(const cell of this.itemSlots[owner]){
      if(!cell.faceUp||!cell.id){cell.hinge.position.y=cell.homeY;continue;}
      const lifted=owner===side&&slots.includes(cell.hinge.userData.pick?.slot);
      cell.hinge.position.y=cell.homeY+(lifted?(side==='ai'?.028:.014):0);
    }
  }

  /* 黑夜：关掉顶灯和大补光，只留吊灯小火和身前一盏近灯。对面只剩眼火和铭牌。 */
  lightRecipe(night,blackout=false){
    if(blackout)return {
      key:0,fill:0,rim:0,bounce:0,ambient:0,env:0,nightFill:0,boneRim:0,smallLamp:0,
      fogNear:.4,fogFar:2.2,fog:0x000000,bg:0x000000,bulb:0x1a0c08,castShadow:false,
    };
    return night?{
      key:0,fill:0,rim:0,bounce:0,ambient:.006,env:.015,nightFill:1.25,boneRim:0,smallLamp:.05,
      fogNear:3.15,fogFar:4.7,fog:0x010101,bg:0x010101,bulb:0x5a2a16,castShadow:false,
    }:{
      key:3.1,fill:.8,rim:1.3,bounce:.55,ambient:.6,env:.55,nightFill:0,boneRim:.65,smallLamp:.28,
      fogNear:3.4,fogFar:8.6,fog:0x040505,bg:0x040505,bulb:0xffd2a0,castShadow:true,
    };
  }

  applyLightRecipe(recipe,night=this.night){
    if(this.keyLight){
      this.keyLight.intensity=recipe.key;
      this.keyLight.castShadow=!!recipe.castShadow;
    }
    if(this.fillLight)this.fillLight.intensity=recipe.fill;
    if(this.rimLight)this.rimLight.intensity=recipe.rim;
    if(this.bounceLight)this.bounceLight.intensity=recipe.bounce;
    if(this.ambientLight)this.ambientLight.intensity=recipe.ambient;
    if(this.nightFill){
      this.nightFill.visible=night||recipe.nightFill>0;
      this.nightFill.intensity=recipe.nightFill;
      this.nightFill.distance=night?1.52:2.7;
      this.nightFill.position.set(.06,.56,1.12);
    }
    if(this.boneRim)this.boneRim.intensity=recipe.boneRim;
    for(const bulb of this.lampBulbs||[]){
      if(bulb?.material)bulb.material.color.setHex(recipe.bulb);
    }
    this.scene.environmentIntensity=recipe.env;
    this.scene.fog=new THREE.Fog(recipe.fog,recipe.fogNear,recipe.fogFar);
    this.scene.background=new THREE.Color(recipe.bg);
    this.renderer.setClearColor(recipe.bg,1);
    for(const light of this.smallLampLights||[]){
      light.visible=night||recipe.smallLamp>0;
      light.intensity=night?recipe.smallLamp:0;
      light.distance=night?.42:1.35;
    }
  }

  applyNightVisibility(night){
    this.night=!!night;
    this.host.classList.toggle('night-mode',this.night);
    if(this.shellGroup)this.shellGroup.visible=!this.night;
    if(this.machines?.ai)this.machines.ai.group.visible=!this.night;
    for(const cell of this.itemSlots?.ai||[])if(cell?.hinge)cell.hinge.visible=!this.night;
    this.applyDealerNight();
    this.updatePlaqueLights();
  }

  captureLights(){
    const fog=this.scene.fog;
    const bg=this.scene.background;
    const bulb=this.lampBulbs?.[0]?.material?.color;
    return {
      key:this.keyLight?.intensity||0,
      fill:this.fillLight?.intensity||0,
      rim:this.rimLight?.intensity||0,
      bounce:this.bounceLight?.intensity||0,
      ambient:this.ambientLight?.intensity||0,
      env:this.scene.environmentIntensity||0,
      nightFill:this.nightFill?.intensity||0,
      boneRim:this.boneRim?.intensity||0,
      smallLamp:this.smallLampLights?.[0]?.intensity||0,
      fogNear:fog?.near??3.4,
      fogFar:fog?.far??8.6,
      fog:fog?.color.getHex()??0x040505,
      bg:bg?.getHex?.()??0x040505,
      bulb:bulb?.getHex()??0xffd2a0,
      castShadow:!!this.keyLight?.castShadow,
    };
  }

  lerpLights(from,to,progress,night){
    const mix=(a,b)=>a+(b-a)*progress;
    const fog=new THREE.Color(from.fog).lerp(new THREE.Color(to.fog),progress);
    const bg=new THREE.Color(from.bg).lerp(new THREE.Color(to.bg),progress);
    const bulb=new THREE.Color(from.bulb).lerp(new THREE.Color(to.bulb),progress);
    this.applyLightRecipe({
      key:mix(from.key,to.key),
      fill:mix(from.fill,to.fill),
      rim:mix(from.rim,to.rim),
      bounce:mix(from.bounce,to.bounce),
      ambient:mix(from.ambient,to.ambient),
      env:mix(from.env,to.env),
      nightFill:mix(from.nightFill,to.nightFill),
      boneRim:mix(from.boneRim,to.boneRim),
      smallLamp:mix(from.smallLamp,to.smallLamp),
      fogNear:mix(from.fogNear,to.fogNear),
      fogFar:mix(from.fogFar,to.fogFar),
      fog:fog.getHex(),
      bg:bg.getHex(),
      bulb:bulb.getHex(),
      castShadow:progress>.6?to.castShadow:false,
    },night);
  }

  setNightMode(on){
    this.applyNightVisibility(on);
    this.applyLightRecipe(this.lightRecipe(this.night),this.night);
  }

  async dumpItems(ids){
    const want=new Set(ids);
    const jobs=[];
    for(const side of ['player','ai']){
      for(const cell of this.itemSlots[side]||[]){
        if(!cell?.faceUp||!want.has(cell.id))continue;
        jobs.push((async()=>{
          await this.flipLid(cell,{up:false});
          this.detachPayload(cell);
        })());
      }
    }
    if(jobs.length)await Promise.all(jobs);
  }

  /* 骤灭，再缓慢亮到白天或黑夜。网格显隐趁全黑时切换，避免看见对面突然出现。 */
  async transitionLighting(night){
    this.applyLightRecipe(this.lightRecipe(false,true),this.night);
    await this.tween({duration:220,update(){}});
    this.applyNightVisibility(night);
    const from=this.captureLights();
    const to=this.lightRecipe(night);
    await this.tween({duration:2200,update:progress=>{
      this.lerpLights(from,to,easeIn(progress),night);
    }});
    this.applyLightRecipe(to,night);
  }

  applyDealerNight(){
    if(!this.dealer)return;
    const embers=new Set(this.dealerEyes||[]);
    this.dealer.traverse(object=>{
      if(object.isLight){object.visible=true;return;}
      if(object.isSprite){
        object.visible=true;
        if(!object.userData.eyeScale)object.userData.eyeScale=object.scale.clone();
        const home=object.userData.eyeScale;
        const grow=this.night?7.2:1;
        object.scale.set(home.x*grow,home.y*grow,1);
        if(object.material){
          object.material.fog=false;
          object.material.toneMapped=false;
          object.material.depthWrite=false;
        }
        return;
      }
      if(object.isMesh){
        const keep=embers.has(object);
        object.visible=!this.night||keep;
        if(keep&&object.material){
          object.material.fog=false;
          object.material.toneMapped=false;
        }
      }
    });
    if(this.dealerEyeLight){
      this.dealerEyeLight.visible=true;
      this.dealerEyeLight.color.setHex(0xff4a14);
      this.dealerEyeLight.decay=2;
      this.dealerEyeLight.intensity=this.night?.1:.06;
      this.dealerEyeLight.distance=this.night?.28:.32;
    }
    if(this.night&&this.arms){
      this.arms.dealerLeft.group.visible=false;
      this.arms.dealerRight.group.visible=false;
    }
  }

  ensurePlaqueHalo(side){
    const plaque=this.plaques?.[side];
    if(!plaque||side!=='ai')return;
    if(!plaque.halo){
      plaque.halo=new THREE.Sprite(new THREE.SpriteMaterial({
        map:this.glow,color:0xff8a28,transparent:true,opacity:.9,
        depthWrite:false,blending:THREE.AdditiveBlending,fog:false,toneMapped:false
      }));
      plaque.halo.position.set(0,.055,.04);
      plaque.group.add(plaque.halo);
    }
    plaque.halo.visible=!!this.night;
    plaque.halo.scale.set(.46,.16,1);
  }

  updatePlaqueLights(pulse=0){
    if(!this.plaques)return;
    for(const [side,plaque] of Object.entries(this.plaques)){
      const active=this.plaqueTurn===side;
      const hover=this.hoverTarget===side;
      this.ensurePlaqueHalo(side);
      if(plaque.model)plaque.model.traverse(object=>{
        if(!object.isMesh)return;
        for(const material of Array.isArray(object.material)?object.material:[object.material]){
          material.fog=!(this.night&&side==='ai');
        }
      });
      if(plaque.amber){
        plaque.amber.fog=false;
        const lit=active||hover||(this.night&&side==='ai');
        plaque.amber.emissive.setHex(lit?0xff9a32:0x5a2a0c);
        plaque.amber.color.setHex(lit?0xc46818:0x6a3810);
        const idleNight=this.night&&side==='ai'?(1.35+pulse*.55):.28;
        plaque.amber.emissiveIntensity=(active?1.65+pulse*.5:idleNight)*(hover?1.55:1);
      }
      if(plaque.brass){
        plaque.brass.roughness=hover?.26:plaque.brassRough;
        if(this.night&&side==='ai'){
          plaque.brass.emissive.setHex(0x3a220e);
          plaque.brass.emissiveIntensity=.4;
          plaque.brass.fog=false;
        }else{
          plaque.brass.emissive.setHex(0x000000);
          plaque.brass.emissiveIntensity=0;
        }
      }
      if(plaque.glow){
        if(this.night&&side==='ai'){
          plaque.glow.distance=.22;
          plaque.glow.intensity=.07+pulse*.03;
        }else{
          plaque.glow.distance=.62;
          plaque.glow.intensity=(active?.32+pulse*.1:0)*(hover?1.45:1);
        }
      }
      if(plaque.halo){
        plaque.halo.visible=!!this.night&&side==='ai';
        if(plaque.halo.visible)plaque.halo.material.opacity=.62+pulse*.28+(hover||active?.2:0);
      }
    }
  }

  tween({duration,update}){
    const ms=Math.max(1,Number(duration)||1);
    duration=this.reducedMotion.matches?Math.min(ms,90):ms;
    return new Promise(resolve=>{
      this.tweens.add({
        elapsed:0,
        duration,
        resolve,
        update:progress=>{
          try{update?.(progress);}catch(error){console.warn(error);}
        },
      });
    });
  }

  /* 伸手：手臂目标从静止位置移到给定点，同时手腕慢慢转到握枪的姿态。远处目标会收到臂长以内。 */
  async reach(rig,to,{duration=300,quaternion=null}={}){
    this.showArm(rig);
    const from=rig.target.clone();
    const goal=this.aimPoint(rig,to);
    const startQuaternion=rig.hand.quaternion.clone();
    await this.tween({duration,update:progress=>{
      const eased=easeOut(progress);
      rig.target.lerpVectors(from,goal,eased);
      if(quaternion)rig.hand.quaternion.slerpQuaternions(startQuaternion,quaternion,eased);
    }});
  }

  /* 手只伸到肩能自然弯肘的距离，道具自己飞过来会合。 */
  aimPoint(rig,world){
    const max=rig.upperLength+rig.foreLength-.14;
    const delta=world.clone().sub(rig.shoulder);
    const dist=delta.length();
    if(dist<=max||dist<1e-4)return world.clone();
    return rig.shoulder.clone().addScaledVector(delta.multiplyScalar(1/dist),max);
  }

  followHand(rig,world,quaternion=null){
    rig.target.copy(this.aimPoint(rig,world));
    if(quaternion)rig.hand.quaternion.copy(quaternion);
  }

  async retract(rig,{duration=340,hide=false}={}){
    const from=rig.target.clone();
    const startQuaternion=rig.hand.quaternion.clone();
    const flat=new THREE.Quaternion();
    await this.tween({duration,update:progress=>{
      const eased=easeOut(progress);
      rig.target.lerpVectors(from,rig.rest,eased);
      rig.hand.quaternion.slerpQuaternions(startQuaternion,flat,eased);
    }});
    if(hide)rig.group.visible=false;
  }

  /* 庄家出手时上半身前倾：肩膀跟着靠近桌面，手臂才够得自然。 */
  leanDealer(amount,duration=300){
    if(this.dealerDead)return Promise.resolve();
    const from=this.dealer.rotation.x;
    return this.tween({duration,update:progress=>{
      const lean=THREE.MathUtils.lerp(from,amount,easeOut(progress));
      this.dealer.rotation.x=lean;
      for(const rig of [this.arms.dealerLeft,this.arms.dealerRight]){
        rig.shoulder.z=rig.shoulderHome.z+lean*.45;
        rig.shoulder.y=rig.shoulderHome.y-lean*.05;
      }
    }});
  }

  gunWorkPose(actor,kind='use'){
    if(actor==='player'){
      /* 往左、往后：换弹口和锯口让到画面中间，不要贴着镜头被道具挡住。 */
      if(kind==='saw')return {position:this.nearView(-.16,-.14,.56),yaw:.7};
      return {position:this.nearView(-.1,-.12,.52),yaw:.78};
    }
    if(kind==='saw')return {position:new THREE.Vector3(.08,.34,-.7),yaw:.55};
    return {position:new THREE.Vector3(.1,.32,-.66),yaw:.6};
  }

  async bringGun(actor,right,pose=this.gunWorkPose(actor)){
    this.showArm(right);
    const from=this.gun.position.clone(),fromYaw=this.gun.rotation.y;
    await this.tween({duration:280,update:progress=>{
      const eased=easeOut(progress);
      this.gun.position.lerpVectors(from,pose.position,eased);
      this.gun.rotation.y=THREE.MathUtils.lerp(fromYaw,pose.yaw,eased);
      this.followHand(right,this.gripWorld(),this.gun.quaternion);
    }});
  }

  gunReadyPose(actor){
    if(actor==='player')return {position:this.nearView(.42,-.2,.72),yaw:.28};
    return {position:new THREE.Vector3(.22,.3,-.58),yaw:.55};
  }

  /* 点枪先把枪举到待瞄准位置，再让玩家选铭牌。 */
  async drawGun(actor='player'){
    if(this.gunDrawn)return;
    this.gunDrawn=true;
    const rig=this.gunArm(actor);
    this.showArm(rig);
    await this.reach(rig,this.gripWorld(),{duration:260,quaternion:this.gun.quaternion.clone()});
    const pose=this.gunReadyPose(actor);
    const from=this.gun.position.clone(),fromYaw=this.gun.rotation.y,fromPitch=this.gun.rotation.z;
    await this.tween({duration:340,update:progress=>{
      const eased=easeOut(progress);
      this.gun.position.lerpVectors(from,pose.position,eased);
      this.gun.rotation.y=THREE.MathUtils.lerp(fromYaw,pose.yaw,eased);
      this.gun.rotation.z=fromPitch*(1-eased);
      this.followHand(rig,this.gripWorld(),this.gun.quaternion);
    }});
  }

  async holsterGun(actor='player'){
    if(!this.gunDrawn)return;
    await this.putGunBack(actor,this.gunArm(actor));
    this.gunDrawn=false;
  }

  /* 一枪分几拍：抓枪 → 瞄准 → 开火闪光 → 受击扣血 / 死亡 → 放回桌面。血量等枪口亮完再揭。 */
  async playShoot({actor,target,live,damage,hpAfter}){
    const rig=this.gunArm(actor);
    const drawn=actor==='player'&&this.gunDrawn;
    if(!drawn){
      if(actor==='ai')this.leanDealer(.12,260);
      await this.reach(rig,this.gripWorld(),{duration:300,quaternion:this.gun.quaternion.clone()});
    }
    const self=actor===target;
    const hold=actor==='player'
      ?(self?this.nearView(.08,-.12,1.05):this.nearView(.1,-.1,.38))
      :new THREE.Vector3(self?.22:.28,.3,self?-.55:-.55);
    /* 打自己：枪拿远、枪口朝向自己。玩家对准镜头，庄家对准头骨。 */
    const muzzleTo=self
      ?(actor==='player'?this.viewPoint(0,-.02,.28):this.dealerHead.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,-.04,.12)))
      :(target==='ai'?new THREE.Vector3(0,.64,DEALER_Z+.04):new THREE.Vector3(0,.46,1.7));
    const aim=muzzleTo.clone().sub(hold);
    const yaw=Math.atan2(-aim.z,aim.x),pitch=Math.asin(aim.y/aim.length());
    const from=this.gun.position.clone(),fromYaw=this.gun.rotation.y;
    /* 举枪过程中手一直贴在握把上：枪怎么动，手臂就跟着解算。 */
    const followGrip=()=>this.followHand(rig,this.gripWorld(),this.gun.quaternion);
    await this.tween({duration:400,update:progress=>{
      const eased=easeOut(progress);
      this.gun.position.lerpVectors(from,hold,eased);
      this.gun.rotation.y=THREE.MathUtils.lerp(fromYaw,yaw,eased);
      this.gun.rotation.z=pitch*eased;
      followGrip();
    }});
    await this.tween({duration:220,update:followGrip});
    /* 空包弹只有干涩的一响：不出火光、不打灯，仅一点极轻的后坐。 */
    if(live){
      this.gun.updateMatrixWorld();
      const muzzle=this.gun.localToWorld(this.muzzleLocal.clone());
      this.muzzleLight.position.copy(muzzle);
      const boom=this.night?18:7;
      this.muzzleLight.intensity=boom;
      this.muzzleLight.distance=this.night?8.6:3.4;
      this.flash.scale.set(this.night?1.55:0.9,this.night?1.55:0.9,1);
      this.flash.material.opacity=1;
    }
    this.shake=live?.055:.008;
    await this.tween({duration:live?420:200,update:progress=>{
      if(live){
        this.flash.material.opacity=1-progress;
        this.muzzleLight.intensity=(1-progress)*(this.night?18:7);
      }
      const kick=Math.sin(progress*Math.PI)*(live?.16:.035);
      this.gun.rotation.z=pitch+kick;
      this.gun.position.copy(hold).addScaledVector(new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw)),-kick*.7);
      followGrip();
    }});
    const nextHp=hpAfter?.[target];
    const fatal=!!(live&&damage&&nextHp!==undefined&&nextHp<=0);
    if(live&&damage){
      if(nextHp!==undefined){
        this.setHp(target,nextHp);
        this.revealHp?.(target,nextHp);
      }
      await this.playHit(target,fatal);
      if(fatal)await this.playDeath(target);
    }
    if(!fatal)await this.rackPump();
    const restYaw=this.gunRest.yaw;
    const follow=!(this.dealerDead&&actor==='ai');
    await this.tween({duration:fatal?220:300,update:progress=>{
      const eased=easeOut(progress);
      this.gun.position.lerpVectors(hold,this.gunRest.position,eased);
      this.gun.rotation.y=THREE.MathUtils.lerp(yaw,restYaw,eased);
      this.gun.rotation.z=pitch*(1-eased);
      if(follow)followGrip();
    }});
    if(follow)await this.retract(rig,{hide:this.hidePlayer(actor)});
    this.gunDrawn=false;
    if(actor==='ai'&&!this.dealerDead)await this.leanDealer(0,240);
    /* 短管只保持到这一枪放回桌面，然后渐隐换成长管。 */
    if(this.sawed)await this.setSawed(false);
  }

  motionMs(full){return this.reducedMotion.matches?Math.min(140,Math.round(full*.28)):full}

  spawnBlood(origin,count){
    const sprites=[];
    for(let i=0;i<count;i++){
      const material=new THREE.SpriteMaterial({
        map:this.glow,color:0xc01410,transparent:true,depthWrite:false,
        blending:THREE.AdditiveBlending,opacity:.95,toneMapped:false,
      });
      const sprite=new THREE.Sprite(material);
      sprite.position.copy(origin);
      sprite.scale.setScalar(.05);
      sprite.userData.vel=new THREE.Vector3((Math.random()-.5)*.62,.1+Math.random()*.52,(Math.random()-.5)*.62);
      this.scene.add(sprite);
      this.fxSprites.add(sprite);
      sprites.push(sprite);
    }
    return sprites;
  }

  clearSprites(sprites){
    for(const sprite of sprites||[]){
      sprite.removeFromParent();
      sprite.material.dispose();
      this.fxSprites.delete(sprite);
    }
  }

  clearFx(){
    this.host.classList.remove('damage-flash','heal-flash','fail-flash');
    this.host.querySelector('#fxHit')?.classList.remove('on');
    this.host.querySelector('#fxDeath')?.classList.remove('on','dealer');
    this.clearSprites([...this.fxSprites]);
  }

  async playHit(target,fatal){
    const origin=target==='ai'
      ?new THREE.Vector3(0,.58,DEALER_Z+.1)
      :this.viewPoint(0,-.04,.28);
    const sprites=this.spawnBlood(origin,this.reducedMotion.matches?2:(fatal?9:6));
    this.shake=fatal?.16:.08;
    this.flashHost('damage-flash');
    this.host.querySelector('#fxHit')?.classList.add('on');
    const fromLean=this.dealer.rotation.x;
    const fromHeadX=this.dealerHead.rotation.x;
    await this.tween({duration:this.motionMs(fatal?480:280),update:progress=>{
      const kick=Math.sin(Math.min(1,progress*1.25)*Math.PI);
      if(target==='ai'){
        this.dealer.rotation.x=fromLean-kick*(fatal?.32:.16);
        this.dealerHead.rotation.x=fromHeadX-kick*(fatal?.45:.2);
        this.dealerEyeLight.intensity=.002+kick*.045;
      }
      for(const sprite of sprites){
        sprite.position.copy(origin).addScaledVector(sprite.userData.vel,progress);
        sprite.material.opacity=.95*(1-progress);
        sprite.scale.setScalar(.07+.22*progress*(fatal?1.35:1));
      }
    }});
    this.host.querySelector('#fxHit')?.classList.remove('on');
    this.clearSprites(sprites);
    if(target==='ai'&&!fatal){
      this.dealer.rotation.x=fromLean;
      this.dealerHead.rotation.x=fromHeadX;
    }
  }

  async playDeath(target){
    if(target==='ai'){
      this.dealerDead=true;
      this.host.querySelector('#fxDeath')?.classList.add('on','dealer');
      const fromX=this.dealer.rotation.x;
      const fromHeadY=this.dealerHead.position.y;
      const fromHeadRot=this.dealerHead.rotation.x;
      await this.tween({duration:this.motionMs(920),update:progress=>{
        const e=easeOut(progress);
        this.dealer.rotation.x=fromX+e*.82;
        this.dealerHead.position.y=fromHeadY-e*.2;
        this.dealerHead.rotation.x=fromHeadRot+e*.7;
        this.dealerEyeLight.intensity=.004*(1-e);
        for(const part of this.dealerEyes)if(part.isSprite)part.material.opacity=.55*(1-e);
        for(const rig of [this.arms.dealerLeft,this.arms.dealerRight]){
          rig.shoulder.z=rig.shoulderHome.z+this.dealer.rotation.x*.45;
          rig.shoulder.y=rig.shoulderHome.y-e*.22;
        }
      }});
      return;
    }
    this.host.querySelector('#fxDeath')?.classList.add('on');
    this.shake=.2;
    const from=this.cameraHome.clone();
    await this.tween({duration:this.motionMs(1000),update:progress=>{
      const e=easeIn(progress);
      this.cameraHome.y=from.y-e*.32;
      this.cameraHome.z=from.z+e*.18;
      this.camera.fov=45+e*8;
      this.camera.updateProjectionMatrix();
    }});
  }

  /* 泵动前托沿弹仓管后拉再推回：拉栓式霰弹枪的机械动作。 */
  async rackPump(){
    await this.pullPump(1);
    await this.closePump();
  }

  async pullPump(amount=1){
    const pump=this.pump;
    if(!pump)return this.tween({duration:120,update(){}});
    const home=this.pumpHome??pump.position.x;
    this.pumpHome=home;
    const pull=home-.09*amount;
    const from=pump.position.x;
    await this.tween({duration:160,update:progress=>{
      pump.position.x=THREE.MathUtils.lerp(from,pull,easeOut(progress));
    }});
  }

  async closePump(){
    const pump=this.pump;
    if(!pump)return;
    const home=this.pumpHome??pump.position.x;
    const from=pump.position.x;
    await this.tween({duration:140,update:progress=>{
      pump.position.x=THREE.MathUtils.lerp(from,home,easeOut(progress));
    }});
  }

  hidePlayer(actor){return actor==='player'}

  payloadRest(cell){
    return new THREE.Vector3(0,LID_THICK/2+(cell.kind==='shell'?SHELL_RADIUS+.002:.018),0);
  }

  liftPayload(cell){
    const payload=cell.payload;
    if(!payload)return null;
    this.itemGroup.attach(payload);
    if(this.night)payload.visible=cell.owner!=='ai';
    return payload;
  }

  async carryTo(payload,world,duration,rig){
    if(!payload)return;
    payload.updateMatrixWorld();
    const from=payload.getWorldPosition(new THREE.Vector3());
    await this.tween({duration,update:progress=>{
      const eased=easeOut(progress);
      const point=from.clone().lerp(world,eased);
      payload.parent.updateMatrixWorld();
      payload.position.copy(payload.parent.worldToLocal(point.clone()));
      if(rig){
        payload.updateMatrixWorld();
        this.followHand(rig,payload.getWorldPosition(new THREE.Vector3()));
      }
    }});
  }

  async seatPayload(cell,payload,duration,rig){
    if(!payload||!cell)return;
    cell.lid.updateMatrixWorld();
    const rest=this.payloadRest(cell);
    const world=cell.lid.localToWorld(rest.clone());
    await this.carryTo(payload,world,duration,rig);
    cell.lid.attach(payload);
    payload.scale.setScalar(ITEM_SCALE);
    payload.position.copy(rest);
    payload.rotation.set(0,cell.owner==='ai'?Math.PI:0,0);
    cell.payload=payload;
    cell.mesh=payload;
  }

  setHp(side,charges){
    const machine=this.machines[side];
    const max=this.lastState?.maxHp??machine?.max??6;
    if(!machine||(machine.charges===charges&&machine.max===max))return;
    machine.charges=charges;
    machine.max=max;
    machine.face.material.map.dispose();
    machine.face.material.map=machineTexture(charges,max);
    machine.face.material.needsUpdate=true;
  }

  flashHost(name){
    this.host.classList.remove('damage-flash','heal-flash','fail-flash');
    void this.host.offsetWidth;
    this.host.classList.add(name);
    setTimeout(()=>this.host.classList.remove(name),400);
  }

  setGunFade(opacity){
    for(const root of [this.gunModel,this.gunFallback]){
      if(!root)continue;
      root.traverse(object=>{
        if(!object.isMesh)return;
        for(const material of Array.isArray(object.material)?object.material:[object.material]){
          if(!material)continue;
          material.transparent=opacity<1;
          material.opacity=opacity;
          material.depthWrite=opacity>.92;
        }
      });
    }
  }

  applySawedScale(on){
    this.sawed=!!on;
    const trim=this.sawed?.68:1;
    if(this.gunModel)this.gunModel.scale.set(this.gunModelBaseScale*trim,this.gunModelBaseScale,this.gunModelBaseScale);
    if(this.gunFallback)this.gunFallback.scale.set(trim,1,1);
  }

  async setSawed(on,{animate=true}={}){
    const next=!!on;
    if(this.sawed===next&&animate){
      this.setGunFade(1);
      return;
    }
    if(!animate||this.reducedMotion.matches){
      this.applySawedScale(next);
      this.setGunFade(1);
      return;
    }
    await this.tween({duration:200,update:progress=>this.setGunFade(1-easeIn(progress))});
    this.applySawedScale(next);
    await this.tween({duration:200,update:progress=>this.setGunFade(easeOut(progress))});
    this.setGunFade(1);
  }

  hideInspect(){
    if(this.inspectShell)this.inspectShell.visible=false;
    if(this.chamberLamp)this.chamberLamp.visible=false;
    if(this.inspectLight)this.inspectLight.visible=false;
  }

  showInspect(live){
    if(!this.inspectShell)return;
    this.lightInfoShell(this.inspectShell,live);
    this.inspectShell.position.copy(this.chamberLocal);
    this.inspectShell.scale.setScalar(this.night?2.15:1.55);
    this.inspectShell.visible=true;
    if(!this.inspectLight){
      this.inspectLight=new THREE.PointLight(0xffe6c8,0,.9,2);
      this.gun.add(this.inspectLight);
    }
    this.inspectLight.position.copy(this.chamberLocal).add(new THREE.Vector3(.06,.05,.1));
    this.inspectLight.color.setHex(live?0xff6a42:0x7ec8ff);
    this.inspectLight.intensity=this.night?4.2:0;
    this.inspectLight.distance=this.night?1.15:.35;
    this.inspectLight.visible=!!this.night;
  }

  slideInspect(amount){
    if(!this.inspectShell)return;
    this.inspectShell.position.copy(this.chamberLocal);
    this.inspectShell.position.x+= (this.night?.11:.07)*amount;
  }

  useHold(actor,item){
    if(actor==='player'){
      if(item==='burnerPhone')return this.nearView(.08,-.04,.34);
      if(item==='magnifier')return this.nearView(-.1,-.08,.36);
      if(item==='adrenaline')return this.nearView(-.1,-.08,.24);
      if(item==='saw')return this.nearView(.1,-.1,.38);
      if(item==='cuffs')return this.nearView(-.02,-.1,.34);
      return this.nearView(-.08,-.06,.3);
    }
    /* 庄家持物停在胸前外侧，不要贴到脸和颅骨上。 */
    if(item==='burnerPhone')return new THREE.Vector3(.06,.52,DEALER_Z+.62);
    if(item==='magnifier')return new THREE.Vector3(-.12,.34,DEALER_Z+.62);
    if(item==='adrenaline')return new THREE.Vector3(-.14,.4,DEALER_Z+.5);
    if(item==='saw')return new THREE.Vector3(.16,.3,DEALER_Z+.64);
    if(item==='cuffs')return new THREE.Vector3(.06,.3,DEALER_Z+.58);
    return new THREE.Vector3(-.12,.36,DEALER_Z+.58);
  }

  mouthWorld(actor){
    if(actor==='ai'){
      this.dealerHead.updateMatrixWorld();
      /* 头骨局部：牙齿在前下方。烟只送到唇外，不进颅腔。 */
      return this.dealerHead.localToWorld(new THREE.Vector3(.02,-.16,.13));
    }
    return this.nearView(.04,-.05,.26);
  }

  sipWorld(actor){
    const lips=this.mouthWorld(actor);
    if(actor==='ai')lips.z+=.08;
    return lips;
  }

  chestWorld(actor){
    if(actor==='ai')return new THREE.Vector3(-.14,.4,DEALER_Z+.5);
    return this.nearView(-.1,-.08,.24);
  }

  makeWristCuff(){
    const metal=new THREE.MeshStandardMaterial({color:0xd4cfc2,metalness:.94,roughness:.22,flatShading:true,emissive:0x3a3428,emissiveIntensity:.2});
    const dark=new THREE.MeshStandardMaterial({color:0x2a2826,metalness:.8,roughness:.4,flatShading:true});
    const group=new THREE.Group();
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.055,.016,8,18),metal);
    ring.rotation.x=Math.PI/2;
    const ring2=ring.clone();
    ring2.position.y=.018;
    const lock=new THREE.Mesh(new THREE.BoxGeometry(.055,.032,.028),dark);
    lock.position.set(.058,0,0);
    for(const part of [ring,ring2,lock]){part.castShadow=true;group.add(part);}
    group.scale.setScalar(1.15);
    return group;
  }

  clearWristCuffs(side){
    const pair=this.wristCuffs[side];
    if(!pair)return;
    pair.left?.removeFromParent();
    pair.right?.removeFromParent();
    if(pair.link)this.disposeNode(pair.link,{dropGeometry:true});
    this.wristCuffs[side]=null;
  }

  attachWristCuffs(side){
    this.clearWristCuffs(side);
    const left=this.makeWristCuff(),right=this.makeWristCuff();
    /* 环套在腕骨上：手掌朝下时，孔朝向前臂。 */
    for(const cuff of [left,right]){
      cuff.rotation.set(0,0,Math.PI/2);
      cuff.position.set(-.02,0,0);
      cuff.scale.setScalar(1.45);
    }
    this.itemArm(side).hand.add(left);
    this.gunArm(side).hand.add(right);
    const link=new THREE.Mesh(new THREE.CylinderGeometry(.01,.01,1,8),
      new THREE.MeshStandardMaterial({color:0xd4cfc2,metalness:.94,roughness:.22,flatShading:true,emissive:0x3a3428,emissiveIntensity:.18}));
    link.castShadow=true;
    this.scene.add(link);
    this.wristCuffs[side]={left,right,link};
    this.layoutCuffLink(side);
  }

  layoutCuffLink(side){
    const pair=this.wristCuffs[side];
    if(!pair?.link)return;
    pair.left.updateMatrixWorld();
    pair.right.updateMatrixWorld();
    const a=pair.left.getWorldPosition(new THREE.Vector3());
    const b=pair.right.getWorldPosition(new THREE.Vector3());
    const delta=b.clone().sub(a);
    const length=delta.length()||.001;
    pair.link.position.copy(a).addScaledVector(delta,.5);
    pair.link.scale.set(1,length,1);
    pair.link.quaternion.setFromUnitVectors(BONE_UP,delta.normalize());
  }

  /* 铐住的手撑在身前桌沿，肘自然弯着，不要叉腰也不要垂到桌下。 */
  cuffHold(side){
    if(side==='ai')return {
      left:new THREE.Vector3(-.2,TABLE.top+.04,-1.08),
      right:new THREE.Vector3(.2,TABLE.top+.04,-1.08),
    };
    return {
      left:this.nearView(-.18,-.2,.48),
      right:this.nearView(.18,-.2,.48),
    };
  }

  async setCuffed(side,on){
    this.cuffed[side]=on;
    const left=this.itemArm(side),right=this.gunArm(side);
    if(on){
      this.showArm(left);
      this.showArm(right);
      const hold=this.cuffHold(side);
      const palm=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-.45);
      await Promise.all([
        this.reach(left,hold.left,{duration:320,quaternion:palm}),
        this.reach(right,hold.right,{duration:320,quaternion:palm.clone()}),
        side==='ai'?this.leanDealer(.16,320):Promise.resolve(),
      ]);
      this.attachWristCuffs(side);
      return;
    }
    this.clearWristCuffs(side);
    await Promise.all([
      this.retract(left,{hide:side==='player'}),
      this.retract(right,{hide:side==='player'}),
      side==='ai'?this.leanDealer(0,280):Promise.resolve(),
    ]);
  }

  async releaseCuffs(side){
    if(!this.cuffed[side]&&!this.wristCuffs[side])return;
    await this.setCuffed(side,false);
  }

  async puffSmoke(world,duration=420){
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glow,transparent:true,opacity:.7,depthWrite:false,blending:THREE.AdditiveBlending,color:0xffc08a,fog:false,toneMapped:false}));
    sprite.scale.set(.12,.12,1);
    sprite.position.copy(world);
    this.scene.add(sprite);
    const from=world.clone();
    await this.tween({duration,update:progress=>{
      sprite.position.copy(from).add(new THREE.Vector3(0,.12*progress,0));
      sprite.material.opacity=.7*(1-progress);
      sprite.scale.setScalar(.12+.18*progress);
    }});
    sprite.removeFromParent();
    sprite.material.dispose();
  }

  paintPhone(text,on){
    const canvas=this.phoneCanvas,w=canvas.width,h=canvas.height;
    const context=canvas.getContext('2d');
    context.setTransform(1,0,0,1,0,0);
    context.imageSmoothingEnabled=true;
    context.imageSmoothingQuality='high';
    context.clearRect(0,0,w,h);
    if(!on||!text){
      this.phoneTexture.needsUpdate=true;
      return;
    }
    context.fillStyle='#050806';
    context.fillRect(0,0,w,h);
    const match=String(text).match(/^(第.+发)(子弹是.+)$/);
    const lines=match?[match[1],match[2]]:[text];
    const size=Math.round(h*(lines.length>1?.28:.34));
    context.textAlign='center';
    context.textBaseline='middle';
    context.font=`700 ${size}px "Microsoft YaHei","Microsoft YaHei UI","Noto Sans SC",sans-serif`;
    context.fillStyle='#7dffb0';
    context.shadowColor='rgba(61,255,144,.35)';
    context.shadowBlur=Math.round(h*.02);
    lines.forEach((line,index)=>{
      const y=h*(.5+(index-(lines.length-1)/2)*.32);
      context.fillText(line,w/2,y);
    });
    context.shadowBlur=0;
    this.phoneTexture.needsUpdate=true;
  }

  facePhone(payload,actor){
    payload.quaternion.identity();
    payload.updateMatrixWorld();
    const origin=payload.getWorldPosition(new THREE.Vector3());
    const aim=actor==='player'?this.camera.position.clone():this.dealerHead.getWorldPosition(new THREE.Vector3());
    const dir=aim.sub(origin).normalize();
    const screen=payload.getObjectByName('PhoneScreen');
    if(!screen){
      payload.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir);
      return;
    }
    screen.updateMatrixWorld();
    const current=new THREE.Vector3(0,0,1).transformDirection(screen.matrixWorld).normalize();
    payload.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(current,dir));
    payload.updateMatrixWorld();
    const key=payload.getObjectByName('Key30')||payload.getObjectByName('Key00');
    if(!key)return;
    this.camera.updateMatrixWorld();
    const down=actor==='player'
      ?new THREE.Vector3(0,-1,0).transformDirection(this.camera.matrixWorld)
      :new THREE.Vector3(0,-1,0);
    const keyDir=key.getWorldPosition(new THREE.Vector3()).sub(origin);
    keyDir.addScaledVector(dir,-keyDir.dot(dir));
    down.addScaledVector(dir,-down.dot(dir));
    if(keyDir.lengthSq()<1e-6||down.lengthSq()<1e-6)return;
    payload.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(keyDir.normalize(),down.normalize()));
  }

  async putGunBack(actor,right){
    const from=this.gun.position.clone();
    const fromYaw=this.gun.rotation.y;
    const fromPitch=this.gun.rotation.z;
    await this.tween({duration:280,update:progress=>{
      const eased=easeOut(progress);
      this.gun.position.lerpVectors(from,this.gunRest.position,eased);
      this.gun.rotation.y=THREE.MathUtils.lerp(fromYaw,this.gunRest.yaw,eased);
      this.gun.rotation.z=fromPitch*(1-eased);
      this.followHand(right,this.gripWorld(),this.gun.quaternion);
    }});
    await this.retract(right,{hide:this.hidePlayer(actor)});
  }

  async ejectShell(live){
    const shell=this.shellMesh(live);
    shell.scale.setScalar(this.night?2.2:1.55);
    this.lightInfoShell(shell,live);
    this.scene.add(shell);
    this.gun.updateMatrixWorld();
    const start=this.gun.localToWorld(this.chamberLocal.clone().add(new THREE.Vector3(.04,.03,.07)));
    const land=this.night
      ? new THREE.Vector3(.1,TABLE.top+SHELL_RADIUS+.003,.62)
      : new THREE.Vector3(.28,TABLE.top+SHELL_RADIUS+.003,.18);
    shell.position.copy(start);
    const spin=2.4;
    const glow=this.night?new THREE.PointLight(live?0xff4a28:0x4aa8ff,6.2,1.8,2):null;
    if(glow){glow.position.copy(start);this.scene.add(glow);}
    const followGlow=()=>{if(glow)glow.position.copy(shell.position);};
    await this.tween({duration:560,update:progress=>{
      shell.position.x=start.x+(land.x-start.x)*progress;
      shell.position.z=start.z+(land.z-start.z)*progress;
      shell.position.y=start.y+(land.y-start.y)*easeIn(progress)+.32*4*progress*(1-progress);
      shell.rotation.x=Math.PI/2+progress*.6;
      shell.rotation.z=progress*spin*Math.PI;
      followGlow();
    }});
    shell.position.copy(land);
    shell.rotation.x=Math.PI/2;
    followGlow();
    await this.tween({duration:this.night?720:500,update(){}});
    const off=new THREE.Vector3(1.15,TABLE.top-0.35,.55);
    await this.tween({duration:560,update:progress=>{
      const e=easeIn(progress);
      shell.position.lerpVectors(land,off,e);
      shell.rotation.z+=.12;
      followGlow();
      if(glow)glow.intensity=6.2*(1-progress);
      const fade=progress>.4?(1-(progress-.4)/.6):1;
      shell.traverse(object=>{
        if(!object.isMesh)return;
        object.material.transparent=true;
        object.material.opacity=fade;
        object.material.depthWrite=fade>.9;
      });
    }});
    glow?.removeFromParent();
    this.disposeNode(shell,{dropGeometry:true});
  }

  layoutCamera(){
    const width=this.host.clientWidth||960,height=this.host.clientHeight||540;
    const aspect=width/height;
    const narrow=Math.max(0,1.45-aspect);
    const pull=Math.min(narrow*.65,.62);
    return {
      aspect,
      pos:new THREE.Vector3(this.cameraBase.x,this.cameraBase.y+pull*.45,this.cameraBase.z+pull),
      look:(this.cameraTargetHome||new THREE.Vector3(0,.08,-.15)).clone(),
      fov:45+narrow*20,
    };
  }

  stealCameraPose(){
    const rest=this.layoutCamera();
    return {
      pos:new THREE.Vector3(-.55,rest.pos.y-.68,Math.max(.42,rest.pos.z-2.52)),
      look:new THREE.Vector3(-.57,.11,-.72),
      fov:Math.max(34,rest.fov-8),
    };
  }

  tweenCamera(from,to,duration,gen){
    return this.tween({duration,update:progress=>{
      if(gen!==this.stealCamGen)return;
      const e=easeInOut(progress);
      this.cameraHome.lerpVectors(from.pos,to.pos,e);
      this.cameraTarget.lerpVectors(from.look,to.look,e);
      this.camera.fov=THREE.MathUtils.lerp(from.fov,to.fov,e);
      this.camera.updateProjectionMatrix();
    }});
  }

  async focusStealItems(){
    if(this.stealFocus)return;
    const gen=++this.stealCamGen;
    this.stealFocus=true;
    const from={pos:this.cameraHome.clone(),look:this.cameraTarget.clone(),fov:this.camera.fov};
    await this.tweenCamera(from,this.stealCameraPose(),this.motionMs(560),gen);
  }

  async clearStealFocus(){
    if(!this.stealFocus)return;
    const gen=++this.stealCamGen;
    this.stealFocus=false;
    const from={pos:this.cameraHome.clone(),look:this.cameraTarget.clone(),fov:this.camera.fov};
    const to=this.layoutCamera();
    await this.tweenCamera(from,to,this.motionMs(420),gen);
    if(gen!==this.stealCamGen)return;
    this.cameraHome.copy(to.pos);
    this.cameraTarget.copy(to.look);
    this.camera.fov=to.fov;
    this.camera.updateProjectionMatrix();
  }

  chamberWorld(){
    this.gun.updateMatrixWorld();
    return this.gun.localToWorld(this.chamberLocal.clone());
  }

  /* 拿起、使用、放回原格、盖板带着物件翻下去。只抓 payload，不带铰链盖板。 */
  async playItem(opts){
    const {actor,item,stolen}=opts;
    if(item==='adrenaline'&&stolen){
      /* 玩家已经扎过针：再播一次注射会把桌上剩下的那支肾上腺素也翻下去。 */
      if(opts.primed)await this.playUse({...opts,item:'adrenaline',from:actor,slot:opts.slot,stolen:undefined});
      await this.playUse({...opts,item:stolen,from:opts.from,slot:opts.stealSlot,stolen:undefined});
      return;
    }
    await this.playUse(opts);
  }

  async playUse({actor,item,from=actor,slot=null,revealed,ejected,healed,good,delta,position,live,hp}){
    const cell=this.findItemSlot(from,{slot,id:item});
    if(!cell)return;
    const left=this.itemArm(actor);
    const right=this.gunArm(actor);
    if(actor==='ai'&&!this.cuffed.ai)this.leanDealer(.1,200);
    const payload=this.liftPayload(cell);
    if(!payload)return;
    if(this.night)payload.visible=actor==='player';
    this.showArm(left);
    if(actor==='player')payload.scale.setScalar(ITEM_SCALE*.48);
    await this.carryTo(payload,this.useHold(actor,item),320,left);
    await this.playEffect(actor,item,payload,{revealed,ejected,healed,good,delta,position,live,hp},left,right);
    await this.seatPayload(cell,payload,240,left);
    await this.flipLid(cell,{up:false});
    this.detachPayload(cell);
    await this.retract(left,{hide:this.hidePlayer(actor)});
    if(actor==='ai')await this.leanDealer(0,200);
  }

  async playEffect(actor,item,payload,extra,left,right){
    if(item==='cigarette')return this.fxCigarette(actor,payload,extra,left);
    if(item==='expiredMedicine')return this.fxMedicine(actor,payload,extra,left);
    if(item==='beer')return this.fxBeer(actor,payload,extra,left,right);
    if(item==='cuffs')return this.fxCuffs(actor,payload,left);
    if(item==='saw')return this.fxSaw(actor,payload,left,right);
    if(item==='magnifier')return this.fxMagnifier(actor,payload,extra,left,right);
    if(item==='adrenaline')return this.fxAdrenaline(actor,payload,left);
    if(item==='burnerPhone')return this.fxPhone(actor,payload,extra,left);
  }

  async fxCigarette(actor,payload,extra,left){
    /* 抽一口的时钟固定：谁抽、白天黑夜都走同一套，不再叠第二段端盒或额外熄火等待。 */
    const stick=this.makeCigStick();
    payload.updateMatrixWorld();
    const from=payload.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.04,0));
    const lips=this.mouthWorld(actor);
    stick.position.copy(from);
    this.scene.add(stick);
    await this.tween({duration:280,update:progress=>{
      const eased=easeOut(progress);
      stick.position.lerpVectors(from,lips,eased);
      const ahead=lips.clone().add(lips.clone().sub(from).normalize());
      if(from.distanceTo(lips)>.001)stick.lookAt(ahead);
      this.followHand(left,payload.getWorldPosition(new THREE.Vector3()));
    }});
    await this.tween({duration:160,update:()=>{
      this.followHand(left,payload.getWorldPosition(new THREE.Vector3()));
    }});
    const power=this.night?(actor==='ai'?6.8:2.4):1.4;
    const reach=this.night?(actor==='ai'?4.4:.85):.35;
    const ember=new THREE.PointLight(0xff6a2a,power,reach,2);
    ember.position.copy(lips);
    this.scene.add(ember);
    await Promise.all([
      this.puffSmoke(lips.clone(),380),
      this.tween({duration:380,update:progress=>{
        ember.intensity=power*(1-progress);
        this.followHand(left,payload.getWorldPosition(new THREE.Vector3()));
      }}),
    ]);
    ember.removeFromParent();
    this.disposeNode(stick,{dropGeometry:true});
    if(extra.hp)this.setHp(actor,extra.hp[actor]);
  }

  makeCigStick(){
    const group=new THREE.Group();
    const paper=new THREE.Mesh(new THREE.CylinderGeometry(.008,.008,.11,8),
      new THREE.MeshStandardMaterial({color:0xe7dfc9,roughness:.72}));
    const tip=new THREE.Mesh(new THREE.CylinderGeometry(.008,.008,.02,8),
      new THREE.MeshStandardMaterial({color:0xb83f35,roughness:.6,emissive:0xff4a12,emissiveIntensity:this.night?2.6:.4,fog:false,toneMapped:false}));
    paper.rotation.x=Math.PI/2;tip.rotation.x=Math.PI/2;
    paper.position.z=-.01;tip.position.z=.055;
    paper.visible=!this.night;
    group.add(paper,tip);
    return group;
  }

  async fxMedicine(actor,payload,extra,left){
    await this.carryTo(payload,this.sipWorld(actor),300,left);
    await this.tween({duration:250,update(){}});
    if(extra.hp)this.setHp(actor,extra.hp[actor]);
    this.flashHost(extra.good?'heal-flash':'fail-flash');
  }

  async fxBeer(actor,payload,extra,left,right){
    await this.carryTo(payload,this.sipWorld(actor),280,left);
    await this.tween({duration:180,update:()=>{payload.updateMatrixWorld();this.followHand(left,payload.getWorldPosition(new THREE.Vector3()))}});
    /* 罐子让到左侧，别挡住抛壳口。 */
    await this.carryTo(payload,actor==='player'?this.nearView(-.2,-.06,.3):new THREE.Vector3(-.16,.36,DEALER_Z+.58),200,left);
    await this.bringGun(actor,right,this.gunWorkPose(actor,'use'));
    await this.rackPump();
    await Promise.all([
      this.ejectShell(!!extra.ejected),
      this.flipShellDown(!!extra.ejected),
    ]);
    await this.putGunBack(actor,right);
  }

  async fxCuffs(actor,payload,left){
    const victim=actor==='player'?'ai':'player';
    const hold=this.cuffHold(victim);
    const offer=hold.left.clone().lerp(hold.right,.5).add(new THREE.Vector3(0,.08,actor==='player'?-.06:.08));
    await this.carryTo(payload,offer,320,left);
    await this.setCuffed(victim,true);
    payload.updateMatrixWorld();
    await this.tween({duration:180,update:()=>{
      this.followHand(left,payload.getWorldPosition(new THREE.Vector3()));
    }});
  }

  async fxSaw(actor,payload,left,right){
    await this.bringGun(actor,right,this.gunWorkPose(actor,'saw'));
    this.gun.updateMatrixWorld();
    const barrel=this.gun.localToWorld(this.chamberLocal.clone().add(new THREE.Vector3(.22,0,0)));
    const a=barrel.clone().add(new THREE.Vector3(0,.05,.05));
    const b=barrel.clone().add(new THREE.Vector3(.1,.05,.05));
    await this.carryTo(payload,a,180,left);
    await this.carryTo(payload,b,140,left);
    await this.carryTo(payload,a,140,left);
    await this.carryTo(payload,b,140,left);
    await this.setSawed(true);
    await this.putGunBack(actor,right);
  }

  async fxMagnifier(actor,payload,extra,left,right){
    this.showArm(right);
    const pose=this.gunWorkPose(actor,'use');
    await this.bringGun(actor,right,pose);
    const inspect=pose.position.clone();
    inspect.y+=.05;
    const fromPos=this.gun.position.clone(),fromYaw=this.gun.rotation.y;
    const follow=()=>this.followHand(right,this.gripWorld(),this.gun.quaternion);
    await this.tween({duration:240,update:progress=>{
      const eased=easeOut(progress);
      this.gun.position.lerpVectors(fromPos,inspect,eased);
      this.gun.rotation.y=THREE.MathUtils.lerp(fromYaw,pose.yaw,eased);
      this.gun.rotation.z=THREE.MathUtils.lerp(0,-.16,eased);
      follow();
    }});
    if(actor==='player'&&extra.revealed!==undefined)this.showInspect(extra.revealed);
    await this.pullPump(.5);
    if(actor==='player')this.slideInspect(this.night?1.35:1);
    const chamber=this.chamberWorld();
    const forward=this.cameraTarget.clone().sub(this.cameraHome).normalize();
    const side=new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0)).normalize();
    /* 镜片停在换弹口外侧，不要盖住半颗子弹。 */
    const look=chamber.clone().addScaledVector(side,.12).add(new THREE.Vector3(0,.05,0));
    await this.carryTo(payload,look,280,left);
    await this.tween({duration:400,update:()=>{
      follow();
      payload.updateMatrixWorld();
      this.followHand(left,payload.getWorldPosition(new THREE.Vector3()));
    }});
    await this.closePump();
    this.hideInspect();
    await this.putGunBack(actor,right);
  }

  async fxAdrenaline(actor,payload,left){
    await this.carryTo(payload,this.chestWorld(actor),300,left);
    await this.tween({duration:300,update:()=>{
      payload.updateMatrixWorld();
      this.followHand(left,payload.getWorldPosition(new THREE.Vector3()));
    }});
  }

  async fxPhone(actor,payload,extra,left){
    if(actor==='player')payload.scale.setScalar(1.7);
    const hold=this.useHold(actor,'burnerPhone');
    await this.carryTo(payload,hold,200,left);
    this.facePhone(payload,actor);
    const text=Number.isInteger(extra.position)
      ? `第 ${extra.position} 发子弹是${extra.live?'实弹':'空弹'}`
      : '';
    this.paintPhone(text,true);
    this.showPhoneScreen(payload,true);
    const glow=this.night?new THREE.PointLight(0x6dffb8,actor==='ai'?4.4:1.7,actor==='ai'?4.2:1.5,2):null;
    if(glow){
      glow.position.copy(hold);
      this.scene.add(glow);
    }
    await this.tween({duration:1500,update:()=>{
      this.facePhone(payload,actor);
      payload.updateMatrixWorld();
      this.followHand(left,payload.getWorldPosition(new THREE.Vector3()));
      if(glow){
        glow.intensity=(actor==='ai'?3.6:1.5)+Math.sin(performance.now()/120)*1.2;
        if(payload.visible)glow.position.copy(payload.getWorldPosition(new THREE.Vector3()));
        else glow.position.copy(hold);
      }
    }});
    glow?.removeFromParent();
    this.paintPhone('',false);
    this.showPhoneScreen(payload,false);
    if(actor==='player')payload.scale.setScalar(ITEM_SCALE*.48);
    await this.carryTo(payload,hold,160,left);
  }

  resize(){
    const width=this.host.clientWidth||960,height=this.host.clientHeight||540;
    const layout=this.layoutCamera();
    const pose=this.stealFocus?this.stealCameraPose():layout;
    this.camera.aspect=layout.aspect;
    this.camera.fov=pose.fov;
    this.camera.updateProjectionMatrix();
    this.cameraHome.copy(pose.pos);
    this.cameraTarget.copy(pose.look);
    /* 全分辨率渲染：氛围交给灯光和配色。上限 1.25，好友房双开时少一点 GPU 负担。 */
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.25));
    this.renderer.setSize(width,height,false);
  }

  animate(time){
    try{
      if(typeof document!=='undefined'&&document.hidden){
        this.lastFrame=time;
        this.frame=requestAnimationFrame(next=>this.animate(next));
        return;
      }
      const delta=Math.min((time-(this.lastFrame||time))/1000,.05);
      this.lastFrame=time;
      for(const tween of [...this.tweens]){
        try{
          tween.elapsed+=delta*1000;
          const progress=clamp(tween.elapsed/Math.max(1,tween.duration),0,1);
          tween.update(progress);
          if(progress>=1){this.tweens.delete(tween);tween.resolve();}
        }catch(error){
          this.tweens.delete(tween);
          tween.resolve();
          console.warn(error);
        }
      }
      this.shake=Math.max(0,this.shake-delta*.22);
      const sway=Math.sin(time/2600)*.012;
      const jitter=this.shake? (Math.random()-.5)*this.shake:0;
      this.camera.position.set(
        this.cameraHome.x+sway+jitter,
        this.cameraHome.y+jitter,
        this.cameraHome.z);
      this.camera.lookAt(this.cameraTarget);
      if(this.night){
        this.arms.dealerLeft.group.visible=false;
        this.arms.dealerRight.group.visible=false;
        if(this.machines?.ai)this.machines.ai.group.visible=false;
        if(this.shellGroup)this.shellGroup.visible=false;
        for(const cell of this.itemSlots?.ai||[])if(cell?.hinge)cell.hinge.visible=false;
      }
      if(!this.cuffed.player){
        this.arms.playerLeft.group.visible=false;
        this.arms.playerRight.group.visible=false;
      }
      for(const rig of Object.values(this.arms))if(rig.group.visible)this.solveArm(rig);
      for(const side of ['player','ai'])this.layoutCuffLink(side);
      const pulse=.5+Math.sin(time/380)*.5;
      if(this.pickState.gun)this.gunHint.material.opacity=(this.night?.2:.12)+pulse*(this.night?.3:.2);
      this.updatePlaqueLights(pulse);
      /* 眼中的红火慢慢明暗，让骷髅看着还“活着”。举枪瞄准时再亮一点。 */
      const ember=.72+Math.sin(time/620)*.28;
      const aim=this.pickState.targets?1.8:1;
      if(this.dealerDead){
        this.dealerEyeLight.intensity=0;
        for(const part of this.dealerEyes)if(part.isSprite)part.material.opacity=.04;
      }else if(this.night){
        this.dealerEyeLight.intensity=(.08+ember*.07)*aim;
        this.dealerEyeLight.distance=.28;
        for(const part of this.dealerEyes)if(part.isSprite)part.material.opacity=(.9+ember*.1)*(this.pickState.targets?1.15:1);
        this.dealerHead.position.y=.72+Math.sin(time/1800)*.014;
        this.dealerHead.rotation.y=Math.sin(time/4200)*.09;
      }else{
        this.dealerEyeLight.intensity=(.002+ember*.003)*aim;
        this.dealerEyeLight.distance=.32;
        for(const part of this.dealerEyes)if(part.isSprite)part.material.opacity=(.5+ember*.4)*(this.pickState.targets?1.15:1);
        this.dealerHead.position.y=.72+Math.sin(time/1800)*.014;
        this.dealerHead.rotation.y=Math.sin(time/4200)*.09;
      }
      this.renderer.render(this.scene,this.camera);
    }catch(error){console.warn(error);}
    this.frame=requestAnimationFrame(next=>this.animate(next));
  }

  dispose(){
    this.disposed=true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.environmentTarget?.dispose();
    this.renderer.dispose();
  }
}

export function createTable3D(canvas){
  if(!canvas)return null;
  try{return new BuckshotTable3D(canvas);}
  catch(error){
    canvas.parentElement?.classList.add('webgl-fallback');
    console.warn('3D 牌桌不可用，回退到 2D 视图',error);
    return null;
  }
}
