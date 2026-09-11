import * as THREE from '/vendor/three.module.js';
import {GLTFLoader} from '/vendor/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from '/vendor/utils/SkeletonUtils.js';
import {CHARACTERS,characterForKey,characterForSeat} from './characters.js';
import {createCharacterBeam,createSeatAccent,updateCharacterBeam} from './seat-accent.js';

const SPELL_COLORS=['#d65369','#d58a51','#d5b854','#5cbaa8','#6f9ed8','#8d78d2','#bb6fa8','#78c8cb'];
const SPELL_URL=spell=>new URL(`./assets/spells/spell-${spell}.svg`,import.meta.url).href;
const MODEL_URL=name=>new URL(`./assets/3d/${name}`,import.meta.url).href;
const PARTICLE_FILES={fire:'fire_01.png',flare:'flare_01.png',magic:'magic_01.png',rune:'magic_04.png',smoke:'smoke_03.png',spark:'spark_01.png',star:'star_02.png'};
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const mix=(from,to,amount)=>from+(to-from)*amount;
const easeOut=value=>1-(1-value)**3;
const wait=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));

function roundedRect(context,x,y,width,height,radius){
  context.beginPath();
  context.roundRect(x,y,width,height,radius);
  context.closePath();
}

function canvasTexture(width,height,paint){
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d');
  paint(context,width,height);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=4;
  return texture;
}

function backTexture(secret=false){
  return canvasTexture(256,384,(context,width,height)=>{
    const gradient=context.createLinearGradient(0,0,width,height);
    gradient.addColorStop(0,secret?'#287e82':'#59458c');
    gradient.addColorStop(.52,secret?'#163f55':'#342554');
    gradient.addColorStop(1,'#17142b');
    context.fillStyle=gradient;roundedRect(context,3,3,width-6,height-6,38);context.fill();
    context.strokeStyle=secret?'rgba(153,255,245,.62)':'rgba(246,220,157,.46)';context.lineWidth=8;roundedRect(context,13,13,width-26,height-26,30);context.stroke();
    context.strokeStyle=secret?'rgba(153,255,245,.2)':'rgba(201,184,255,.2)';context.lineWidth=3;
    for(let offset=-height;offset<width+height;offset+=36){context.beginPath();context.moveTo(offset,0);context.lineTo(offset-height,height);context.stroke();}
    context.translate(width/2,height/2);context.rotate(Math.PI/4);
    context.strokeStyle=secret?'#a6fff5':'#e9d894';context.lineWidth=7;context.strokeRect(-53,-53,106,106);
    context.rotate(-Math.PI/4);context.fillStyle=secret?'#d7fffb':'#fff0b5';context.font='700 112px Georgia';context.textAlign='center';context.textBaseline='middle';context.fillText(secret?'◇':'?',0,6);
  });
}

function labelTexture(text,accent='#f0cb78',compact=false){
  return canvasTexture(compact?256:512,128,(context,width,height)=>{
    context.clearRect(0,0,width,height);
    context.fillStyle='rgba(8,8,20,.84)';roundedRect(context,3,10,width-6,height-20,28);context.fill();
    context.strokeStyle=accent;context.globalAlpha=.7;context.lineWidth=4;roundedRect(context,5,12,width-10,height-24,26);context.stroke();context.globalAlpha=1;
    context.fillStyle='#fff8ed';context.font=`700 ${compact?48:42}px "Microsoft YaHei",sans-serif`;context.textAlign='center';context.textBaseline='middle';context.fillText(text,width/2,height/2+2);
  });
}

function makeSprite(text,accent,scaleX=1.8,compact=false){
  const material=new THREE.SpriteMaterial({map:labelTexture(text,accent,compact),transparent:true,depthWrite:false});
  const sprite=new THREE.Sprite(material);
  sprite.scale.set(scaleX,.45,1);
  sprite.userData.disposable=true;
  return sprite;
}

function pileLabelTexture(title,count,accent){
  return canvasTexture(384,192,(context,width,height)=>{
    context.clearRect(0,0,width,height);
    context.textAlign='center';context.textBaseline='middle';context.lineJoin='round';
    context.shadowColor='rgba(3,3,12,.95)';context.shadowBlur=18;context.shadowOffsetY=6;
    context.strokeStyle='rgba(6,5,18,.92)';context.lineWidth=11;
    context.font='700 39px "Microsoft YaHei",sans-serif';context.strokeText(title,width/2,54);
    context.fillStyle='#fff8ed';context.fillText(title,width/2,54);
    context.font='800 60px Georgia,serif';context.strokeText(String(count),width/2,130);
    context.fillStyle=accent;context.fillText(String(count),width/2,130);
  });
}

function makePileSprite(title,accent){
  const material=new THREE.SpriteMaterial({map:pileLabelTexture(title,0,accent),transparent:true,depthWrite:false,depthTest:false});
  const sprite=new THREE.Sprite(material);
  sprite.scale.set(1.58,.79,1);
  sprite.renderOrder=20;
  sprite.userData={disposable:true,title,accent,count:0};
  return sprite;
}

function setOpacity(root,opacity){
  root.traverse(object=>{
    if(!object.material)return;
    const materials=Array.isArray(object.material)?object.material:[object.material];
    for(const material of materials){material.transparent=true;material.opacity=opacity;material.depthWrite=opacity>.55;}
  });
}

class MagicTable3D{
  constructor(canvas){
    this.canvas=canvas;
    this.host=canvas.closest('.magic-table');
    this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
    this.renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
    this.renderer.setClearColor(0x080714,0);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.2;
    this.renderer.shadowMap.type=THREE.PCFShadowMap;
    this.scene=new THREE.Scene();
    this.scene.fog=new THREE.FogExp2(0x0d1021,.035);
    this.camera=new THREE.PerspectiveCamera(39,1,.1,60);
    this.camera.position.set(0,8.5,10.4);
    this.cameraTarget=new THREE.Vector3(0,1.35,0);
    this.cameraHome=this.camera.position.clone();
    this.cameraHomeTarget=this.cameraTarget.clone();
    this.camera.lookAt(this.cameraTarget);
    this.cinematic=false;
    this.players=new Map();
    this.tweens=new Set();
    this.effects=new THREE.Group();
    this.decorLayer=new THREE.Group();
    this.playerLayer=new THREE.Group();
    this.discardLayer=new THREE.Group();
    this.textureLoader=new THREE.TextureLoader();
    this.gltfLoader=new GLTFLoader();
    this.textureCache=new Map();
    this.particleTextures={};
    this.characterAssets=null;
    this.back=backTexture(false);
    this.secretBack=backTexture(true);
    this.stoneBodyGeometry=new THREE.BoxGeometry(.58,.86,.055,1,1,1);
    this.stoneFaceGeometry=new THREE.PlaneGeometry(.535,.815);
    this.healthGeometry=new THREE.SphereGeometry(.078,16,12);
    this.lastFrame=performance.now();
    this.dieRolling=false;
    this.discardKey='';
    this.generation=0;
    this.setupLights();
    this.setupFloor();
    this.setupTable();
    this.setupPiles();
    this.setupDie();
    this.scene.add(this.decorLayer,this.playerLayer,this.discardLayer,this.effects);
    this.loadParticleTextures();
    this.loadCharacterAssets();
    this.setupDungeonDecor();
    this.resizeObserver=new ResizeObserver(()=>this.resize());
    this.resizeObserver.observe(this.host);
    this.canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.host.classList.remove('webgl-ready');});
    this.canvas.addEventListener('webglcontextrestored',()=>this.host.classList.add('webgl-ready'));
    this.resize();
    this.renderer.render(this.scene,this.camera);
    this.host.classList.add('webgl-ready');
    this.frame=requestAnimationFrame(time=>this.animate(time));
  }

  loadParticleTextures(){
    for(const [name,file] of Object.entries(PARTICLE_FILES)){
      const texture=this.textureLoader.load(MODEL_URL(`particles/${file}`));
      texture.colorSpace=THREE.SRGBColorSpace;
      this.particleTextures[name]=texture;
    }
  }

  particleMaterial(MaterialType,name,parameters={}){
    const material=new MaterialType({map:this.particleTextures[name],transparent:true,depthWrite:false,...parameters});
    material.userData.sharedMap=true;
    return material;
  }

  async loadCharacterAssets(){
    try{
      const modelFiles=[...new Set(CHARACTERS.map(character=>character.model))];
      const [loadedModels,general,ranged,simulation]=await Promise.all([
        Promise.all(modelFiles.map(async file=>[file,(await this.gltfLoader.loadAsync(MODEL_URL(`characters/${file}`))).scene])),
        this.gltfLoader.loadAsync(MODEL_URL('animations/general.glb')),
        this.gltfLoader.loadAsync(MODEL_URL('animations/combat-ranged.glb')),
        this.gltfLoader.loadAsync(MODEL_URL('animations/simulation.glb')),
      ]);
      const byFile=new Map(loadedModels);
      this.characterAssets={models:new Map(CHARACTERS.map(character=>[character.key,byFile.get(character.model)])),clips:new Map([...general.animations,...ranged.animations,...simulation.animations].map(clip=>[clip.name,clip]))};
      for(const visual of this.players.values())this.attachCharacterModel(visual);
    }catch(error){
      console.warn('KayKit character assets unavailable; using procedural wizards',error);
    }
  }

  attachCharacterModel(visual){
    if(!this.characterAssets||visual.model)return;
    const character=characterForKey(visual.characterKey);
    const model=cloneSkeleton(this.characterAssets.models.get(character.key)||this.characterAssets.models.get('mage'));
    model.position.set(0,-.04,-.08);model.scale.setScalar(.72);
    model.traverse(object=>{
      if(!object.isMesh)return;
      object.castShadow=true;object.receiveShadow=true;
      const materials=Array.isArray(object.material)?object.material:[object.material];
      const cloned=materials.map(material=>{const next=material.clone();if(next.color)next.color.lerp(new THREE.Color(character.color),.38);next.userData.disposable=true;return next;});
      object.material=Array.isArray(object.material)?cloned:cloned[0];object.userData.disposable=true;
    });
    visual.figure.visible=false;visual.model=model;visual.root.add(model,createSeatAccent(character.key));
    visual.mixer=new THREE.AnimationMixer(model);visual.actions=new Map();
    this.playCharacterAction(visual,'Idle_A');
  }

  playCharacterAction(visual,name,{once=false,clamp=false,lock=false}={}){
    if(!visual?.mixer||!this.characterAssets)return null;
    const clip=this.characterAssets.clips.get(name);if(!clip)return null;
    let action=visual.actions.get(name);
    if(!action){action=visual.mixer.clipAction(clip);visual.actions.set(name,action);}
    if(visual.currentAction!==action){visual.currentAction?.fadeOut(.16);action.reset().fadeIn(.16).play();visual.currentAction=action;}
    else action.reset().play();
    action.enabled=true;action.clampWhenFinished=clamp;action.setLoop(once?THREE.LoopOnce:THREE.LoopRepeat,once?1:Infinity);
    visual.actionLocked=lock;visual.actionUntil=once&&!clamp?performance.now()+clip.duration*1000:0;
    return action;
  }

  loadDecoration(name,placements){
    this.gltfLoader.load(MODEL_URL(`dungeon/${name}.gltf`),asset=>{
      placements.forEach(({position,rotation=[0,0,0],scale=1})=>{
        const model=asset.scene.clone(true);model.position.set(...position);model.rotation.set(...rotation);model.scale.setScalar(scale);
        model.traverse(object=>{if(object.isMesh){object.castShadow=true;object.receiveShadow=true;}});
        this.decorLayer.add(model);
      });
    },undefined,error=>console.warn(`Dungeon decoration unavailable: ${name}`,error));
  }

  setupDungeonDecor(){
    this.loadDecoration('wall_shelves',[
      {position:[0,-.38,-5.35],scale:.9},
    ]);
    this.loadDecoration('column',[
      {position:[-5.35,-.38,-4.65],scale:1.05},
      {position:[5.35,-.38,-4.65],scale:1.05},
    ]);
    this.loadDecoration('banner_patternA_blue',[
      {position:[-3.25,.25,-5.12],scale:.82},
    ]);
    this.loadDecoration('banner_patternA_red',[
      {position:[3.25,.25,-5.12],scale:.82},
    ]);
    this.loadDecoration('torch_lit',[
      {position:[-1.55,.22,-5.02],scale:.9},
      {position:[1.55,.22,-5.02],scale:.9},
    ]);
    const leftTorch=new THREE.PointLight(0xff9b45,7,4.2,2);leftTorch.position.set(-1.55,2,-4.7);
    const rightTorch=leftTorch.clone();rightTorch.position.x=1.55;this.decorLayer.add(leftTorch,rightTorch);
  }

  setupLights(){
    this.scene.add(new THREE.HemisphereLight(0x9fb8ff,0x1b1020,1.65));
    const key=new THREE.DirectionalLight(0xffdfac,4.1);
    key.position.set(-4,8,6);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-8;key.shadow.camera.right=8;key.shadow.camera.top=7;key.shadow.camera.bottom=-7;key.shadow.bias=-.0004;
    this.scene.add(key);
    const cyan=new THREE.PointLight(0x65d9d2,8,10,2.1);cyan.position.set(-3,2,-2);this.scene.add(cyan);
    const violet=new THREE.PointLight(0x9d72e3,11,11,2);violet.position.set(3,2.4,2);this.scene.add(violet);
  }

  setupFloor(){
    const floor=new THREE.Mesh(new THREE.CircleGeometry(8.8,64),new THREE.MeshStandardMaterial({color:0x0b0b17,roughness:.96,metalness:0}));
    floor.rotation.x=-Math.PI/2;floor.position.y=-.38;floor.receiveShadow=true;this.scene.add(floor);
    const halo=new THREE.Mesh(new THREE.RingGeometry(5.4,7.8,72),new THREE.MeshBasicMaterial({color:0x463274,transparent:true,opacity:.14,side:THREE.DoubleSide,depthWrite:false}));
    halo.rotation.x=-Math.PI/2;halo.position.y=-.36;this.scene.add(halo);
  }

  setupTable(){
    const wood=new THREE.MeshStandardMaterial({color:0x4b2d35,roughness:.56,metalness:.08});
    const edge=new THREE.MeshStandardMaterial({color:0xb08c5b,roughness:.4,metalness:.28});
    const felt=new THREE.MeshStandardMaterial({color:0x203f4b,roughness:.9,metalness:.02,emissive:0x091821,emissiveIntensity:.42});
    const base=new THREE.Mesh(new THREE.CylinderGeometry(4.25,4.38,.42,72),wood);base.scale.set(1.33,1,.8);base.position.y=.05;base.castShadow=true;base.receiveShadow=true;this.scene.add(base);
    const top=new THREE.Mesh(new THREE.CylinderGeometry(4.01,4.05,.15,72),felt);top.scale.set(1.31,1,.78);top.position.y=.32;top.castShadow=true;top.receiveShadow=true;this.scene.add(top);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(4.12,.13,16,112),edge);rim.rotation.x=Math.PI/2;rim.scale.set(1.32,1,.79);rim.position.y=.45;rim.castShadow=true;this.scene.add(rim);
    const innerRing=new THREE.Mesh(new THREE.TorusGeometry(2.35,.025,8,96),new THREE.MeshStandardMaterial({color:0xd7bd79,roughness:.32,metalness:.46,emissive:0x5d4920,emissiveIntensity:.8}));innerRing.rotation.x=Math.PI/2;innerRing.scale.set(1.45,1,.76);innerRing.position.y=.43;this.scene.add(innerRing);
    const runeMaterial=new THREE.MeshBasicMaterial({color:0x75d9d0,transparent:true,opacity:.18,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending});
    for(const radius of [1.15,1.72]){const ring=new THREE.Mesh(new THREE.RingGeometry(radius,radius+.018,64),runeMaterial);ring.rotation.x=-Math.PI/2;ring.scale.set(1.42,1,.76);ring.position.y=.438;this.scene.add(ring);}
    const centerDisc=new THREE.Mesh(new THREE.CircleGeometry(.62,48),new THREE.MeshBasicMaterial({color:0x8066c8,transparent:true,opacity:.13,side:THREE.DoubleSide,depthWrite:false}));centerDisc.rotation.x=-Math.PI/2;centerDisc.position.y=.445;this.scene.add(centerDisc);
    this.castPulse=new THREE.Mesh(new THREE.RingGeometry(.43,.49,48),new THREE.MeshBasicMaterial({color:0xf2cb78,transparent:true,opacity:.46,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
    this.castPulse.rotation.x=-Math.PI/2;this.castPulse.position.y=.47;this.scene.add(this.castPulse);
  }

  setupPiles(){
    this.drawPile=new THREE.Group();this.secretPile=new THREE.Group();
    this.drawPile.position.set(3.22,.54,.15);this.secretPile.position.set(-3.22,.54,.15);
    for(let index=0;index<7;index++){
      const draw=this.createStone(null,{back:true});draw.rotation.x=-Math.PI/2;draw.rotation.z=.08;draw.position.y=index*.025;draw.scale.setScalar(.82);this.drawPile.add(draw);
      const secret=this.createStone(null,{back:true,secret:true});secret.rotation.x=-Math.PI/2;secret.rotation.z=-.08;secret.position.y=index*.025;secret.scale.setScalar(.82);this.secretPile.add(secret);
    }
    const drawGlow=new THREE.PointLight(0x9a78e0,5,3,2);drawGlow.position.y=.5;this.drawPile.add(drawGlow);
    const secretGlow=new THREE.PointLight(0x65d9d2,5,3,2);secretGlow.position.y=.5;this.secretPile.add(secretGlow);
    this.drawPileLabel=makePileSprite('补充牌堆','#cdb8ff');this.drawPileLabel.position.set(-1.08,.46,.04);this.drawPile.add(this.drawPileLabel);
    this.secretPileLabel=makePileSprite('秘密石','#9ff8ee');this.secretPileLabel.position.set(1.08,.46,.04);this.secretPile.add(this.secretPileLabel);
    this.scene.add(this.drawPile,this.secretPile);
  }

  updatePileLabel(sprite,count){
    if(sprite.userData.count===count)return;
    const previous=sprite.material.map;
    sprite.material.map=pileLabelTexture(sprite.userData.title,count,sprite.userData.accent);
    sprite.material.needsUpdate=true;sprite.userData.count=count;previous.dispose();
  }

  setupDie(){
    const values=[1,3,1,2,1,2];
    const materials=values.map(value=>new THREE.MeshStandardMaterial({map:this.dieTexture(value),color:0xffffff,roughness:.43,metalness:.04}));
    this.die=new THREE.Mesh(new THREE.BoxGeometry(.7,.7,.7,2,2,2),materials);
    this.die.castShadow=true;this.die.receiveShadow=true;this.die.position.set(0,1.02,.05);this.die.visible=false;this.scene.add(this.die);
  }

  dieTexture(value){
    return canvasTexture(192,192,(context,width,height)=>{
      const gradient=context.createLinearGradient(0,0,width,height);gradient.addColorStop(0,'#fffdf1');gradient.addColorStop(1,'#d7d0e8');context.fillStyle=gradient;roundedRect(context,5,5,width-10,height-10,34);context.fill();
      context.strokeStyle='rgba(59,42,82,.35)';context.lineWidth=8;roundedRect(context,8,8,width-16,height-16,31);context.stroke();
      context.fillStyle=value===3?'#a73d59':'#2c2340';context.font='700 108px Georgia';context.textAlign='center';context.textBaseline='middle';context.fillText(String(value),width/2,height/2+7);
    });
  }

  spellTexture(spell){
    if(this.textureCache.has(spell))return this.textureCache.get(spell);
    const texture=this.textureLoader.load(SPELL_URL(spell),loaded=>{loaded.colorSpace=THREE.SRGBColorSpace;loaded.anisotropy=this.renderer.capabilities.getMaxAnisotropy();});
    texture.colorSpace=THREE.SRGBColorSpace;this.textureCache.set(spell,texture);return texture;
  }

  createStone(spell,{back=false,secret=false,ghost=false}={}){
    const group=new THREE.Group();
    const color=spell?new THREE.Color(SPELL_COLORS[spell-1]):new THREE.Color(secret?0x287e82:0x4d3b78);
    const bodyMaterial=new THREE.MeshStandardMaterial({color,roughness:.46,metalness:.13,transparent:ghost,opacity:ghost ? .42 : 1});
    const body=new THREE.Mesh(this.stoneBodyGeometry,bodyMaterial);body.castShadow=!ghost;body.receiveShadow=true;body.userData.disposable=true;group.add(body);
    const frontMap=back?(secret?this.secretBack:this.back):this.spellTexture(spell);
    const frontMaterial=new THREE.MeshBasicMaterial({map:frontMap,transparent:true,opacity:ghost ? .52 : 1,side:THREE.FrontSide,depthWrite:!ghost});
    const front=new THREE.Mesh(this.stoneFaceGeometry,frontMaterial);front.position.z=.029;front.userData.disposable=true;group.add(front);
    const backMaterial=new THREE.MeshBasicMaterial({map:secret?this.secretBack:this.back,transparent:true,opacity:ghost ? .42 : 1,side:THREE.FrontSide,depthWrite:!ghost});
    const rear=new THREE.Mesh(this.stoneFaceGeometry,backMaterial);rear.position.z=-.029;rear.rotation.y=Math.PI;rear.userData.disposable=true;group.add(rear);
    group.userData.spell=spell;return group;
  }

  createWizard(player,index,count){
    const root=new THREE.Group();
    const angle=Math.PI/2+index*Math.PI*2/count;
    const x=Math.cos(angle)*5.02,z=Math.sin(angle)*3.3;
    const baseScale=1.2,baseRotationY=Math.atan2(-x,-z);
    root.position.set(x,.18,z);root.rotation.y=baseRotationY;root.scale.setScalar(baseScale);
    const color=new THREE.Color(player.color||'#9b7fd6');
    const beam=createCharacterBeam(color);beam.scale.setScalar(1/baseScale);root.add(beam);
    const robeMaterial=new THREE.MeshStandardMaterial({color,roughness:.7,metalness:.03,emissive:color.clone().multiplyScalar(.13)});
    const dark=color.clone().multiplyScalar(.48);
    const figure=new THREE.Group();root.add(figure);
    const body=new THREE.Mesh(new THREE.ConeGeometry(.44,.88,24),robeMaterial);body.position.set(0,.48,-.1);body.castShadow=true;figure.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.25,24,18),new THREE.MeshStandardMaterial({color:0xf0d1ae,roughness:.76}));head.position.set(0,1.03,-.08);head.castShadow=true;figure.add(head);
    const brim=new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,.09,28),new THREE.MeshStandardMaterial({color:dark,roughness:.6,metalness:.08}));brim.position.set(0,1.28,-.08);brim.castShadow=true;figure.add(brim);
    const hat=new THREE.Mesh(new THREE.ConeGeometry(.32,.74,28),robeMaterial);hat.position.set(.04,1.62,-.08);hat.rotation.z=-.09;hat.castShadow=true;figure.add(hat);
    const aura=new THREE.Mesh(new THREE.RingGeometry(.58,.68,40),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.18,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));aura.rotation.x=-Math.PI/2;aura.position.y=.02;root.add(aura);
    const rack=new THREE.Group();rack.position.set(0,1.02,.64);root.add(rack);
    const health=new THREE.Group();health.position.set(0,1.91,-.01);health.rotation.y=-baseRotationY;root.add(health);
    const label=makeSprite(index===0?'你':player.name,player.color||'#9b7fd6',1.5);label.position.set(0,2.22,-.02);root.add(label);
    this.playerLayer.add(root);
    const visual={root,figure,rack,health,aura,beam,label,hat,rackKey:'',life:null,index,characterKey:player.characterKey||characterForSeat(index).key,base:new THREE.Vector3(x,.18,z),baseScale,baseRotationY,color,cinematic:false,defeatSettled:false,model:null,mixer:null,actions:null,currentAction:null,actionUntil:0,actionLocked:false};
    this.attachCharacterModel(visual);
    return visual;
  }

  updatePlayerLabel(visual,player){
    visual.root.remove(visual.label);visual.label.material.map.dispose();visual.label.material.dispose();
    visual.label=makeSprite(visual.index===0?'你':player.name,`#${visual.color.getHexString()}`,1.5);
    visual.label.position.set(0,2.22,-.02);visual.root.add(visual.label);
  }

  updateRack(visual,player){
    const key=JSON.stringify(player.rack);
    if(key===visual.rackKey)return;
    this.clearGroup(visual.rack);visual.rackKey=key;
    const middle=(player.rack.length-1)/2;
    player.rack.forEach((spell,index)=>{
      const card=this.createStone(Number.isInteger(spell)?spell:null,{back:!Number.isInteger(spell)});
      const offset=index-middle;card.position.set(offset*.35,Math.abs(offset)*-.025,Math.abs(offset)*-.018);card.rotation.z=offset*-.075;card.rotation.y=offset*-.035;card.scale.setScalar(.86);visual.rack.add(card);
    });
  }

  updateHealth(visual,player){
    if(visual.life===player.life)return;
    const previousLife=visual.life;
    if(player.life>0){visual.defeatSettled=false;if(previousLife===0)this.playCharacterAction(visual,'Idle_A');}
    this.clearGroup(visual.health);visual.life=player.life;
    for(let index=0;index<6;index++){
      const live=index<player.life;
      const material=new THREE.MeshStandardMaterial({color:live?0xff6678:0x211a2e,roughness:.35,metalness:.12,emissive:live?0x8f182d:0x000000,emissiveIntensity:live?1.4:0});
      const pip=new THREE.Mesh(this.healthGeometry,material);pip.position.set((index-2.5)*.185,0,0);pip.userData.disposable=true;visual.health.add(pip);
    }
    this.updatePlayerLabel(visual,player);
  }

  syncPlayers(state){
    const ids=state.players.map((player,index)=>`${player.id}:${player.characterKey||characterForSeat(index).key}`).join('|');
    if(ids!==this.playerKey){this.playerKey=ids;this.clearPlayers();state.players.forEach((player,index)=>this.players.set(player.id,this.createWizard(player,index,state.players.length)));}
    for(const player of state.players){
      const visual=this.players.get(player.id);if(!visual)continue;
      this.updateRack(visual,player);this.updateHealth(visual,player);
      if(!visual.cinematic)this.applyPlayerPose(visual);
      const active=state.phase==='casting'&&state.activeIndex===player.id;
      visual.beam.visible=active;
      visual.aura.material.opacity=active ? .72 : .18;visual.aura.scale.setScalar(active?1.22:1);
      visual.aura.material.color.set(active?0xf3cc78:visual.color);
      visual.root.visible=true;visual.root.userData.active=active;
    }
  }

  applyPlayerPose(visual){
    const defeated=visual.life<=0&&visual.defeatSettled;
    const proceduralDefeat=defeated&&!visual.model;
    visual.root.position.copy(visual.base);
    visual.root.rotation.set(0,visual.baseRotationY,proceduralDefeat?(visual.index%2 ? -.96 : .96):0);
    visual.root.scale.setScalar(visual.baseScale*(proceduralDefeat?.9:1));
    visual.hat.rotation.z=proceduralDefeat?(visual.index%2 ? -.62 : .48):-.09;
    visual.rack.rotation.z=proceduralDefeat?(visual.index%2 ? -.28 : .28):0;
    if(proceduralDefeat)visual.root.position.y-=.27;
  }

  syncDiscardPiles(values=[]){
    const counts=Array.from({length:8},(_,index)=>values.filter(value=>value===index+1).length);
    const key=counts.join(',');if(key===this.discardKey)return;this.discardKey=key;this.clearGroup(this.discardLayer);
    const piles=counts.flatMap((count,index)=>count?[{spell:index+1,count}]:[]);
    piles.forEach(({spell,count},index)=>{
      const row=Math.floor(index/4),column=index%4,rowCount=Math.min(4,piles.length-row*4);
      const pile=new THREE.Group();pile.position.set((column-(rowCount-1)/2)*.78,.49,-1.08+row*.62);
      for(let stackIndex=0;stackIndex<Math.min(count,3);stackIndex++){
        const card=this.createStone(spell);card.position.set(stackIndex*.035,stackIndex*.022,stackIndex*.025);card.rotation.x=-Math.PI/2;card.rotation.z=(stackIndex-1)*.025;card.scale.setScalar(.36);pile.add(card);
      }
      const countLabel=makeSprite(`×${count}`,SPELL_COLORS[spell-1],.52,true);countLabel.position.set(.28,.38,.03);countLabel.scale.y=.16;pile.add(countLabel);
      this.discardLayer.add(pile);
    });
  }

  sync(state){
    if(!state)return;
    this.syncPlayers(state);this.syncDiscardPiles([...(state.publicRemoved||[]),...(state.castStones||[])]);
    this.updatePileLabel(this.drawPileLabel,state.drawPileCount);
    this.updatePileLabel(this.secretPileLabel,state.secretPoolCount);
    this.drawPile.visible=state.drawPileCount>0;this.secretPile.visible=state.secretPoolCount>0;
    if(!this.dieRolling)this.setDie(null);
  }

  setDie(value){
    if(![1,2,3].includes(value)){this.die.visible=false;return;}
    const target=this.dieRotation(value);this.die.visible=true;this.die.position.set(0,1.02,.05);this.die.rotation.set(target.x,target.y,target.z);
  }

  dieRotation(value){
    if(value===2)return new THREE.Euler(Math.PI/2,0,0);
    if(value===3)return new THREE.Euler(0,0,-Math.PI/2);
    return new THREE.Euler(0,0,0);
  }

  playerSource(playerId){
    const visual=this.players.get(playerId);if(!visual)return new THREE.Vector3(0,1.4,3);
    return visual.rack.localToWorld(new THREE.Vector3(0,.08,.05));
  }

  run(duration,update,{delay=0,cleanup}={}){
    const adjusted=this.reducedMotion.matches?0:duration;
    if(adjusted===0){update(1,1);cleanup?.();return Promise.resolve();}
    return new Promise(resolve=>this.tweens.add({start:performance.now()+delay,duration:adjusted,update,cleanup,resolve}));
  }

  flight(card,from,to,{duration=620,delay=0,arc=1.45,landX=-.12}={}){
    card.position.copy(from);card.visible=delay===0;this.effects.add(card);
    return this.run(duration,(eased,raw)=>{
      card.visible=true;card.position.lerpVectors(from,to,eased);card.position.y+=Math.sin(raw*Math.PI)*arc;
      card.rotation.x=mix(.12,landX,eased)+Math.sin(raw*Math.PI)*.2;
      card.rotation.y=(1-eased)*Math.PI*2.2;
      card.rotation.z=Math.sin(raw*Math.PI*2)*.16;
      const scale=.72+Math.sin(raw*Math.PI)*.22;card.scale.setScalar(scale);
    },{delay});
  }

  async cast({playerId,spell,success,hold=1000}){
    if(!Number.isInteger(spell))return;
    const generation=this.generation;
    const player=this.players.get(playerId);
    this.playCharacterAction(player,success?'Ranged_Magic_Spellcasting':'Ranged_Magic_Raise',{once:true});
    const from=this.playerSource(playerId),to=new THREE.Vector3(0,1.36,.15);
    const card=this.createStone(spell,{ghost:!success});
    if(!success)setOpacity(card,.5);
    await this.flight(card,from,to,{duration:success?620:540,arc:success?1.6:1.1});
    if(generation!==this.generation){this.effects.remove(card);this.disposeObject(card);return;}
    const color=success?0xf2cb78:0xff4f76;
    if(player&&!success)this.shakePlayer(player,color);
    const burst=this.burst(to,color,success?28:42);
    this.pulseCenter(color);
    await Promise.all([burst,wait(hold)]);
    this.effects.remove(card);this.disposeObject(card);
  }

  async draw({playerId,secret=false,delay=0}){
    const generation=this.generation;
    const from=(secret?this.secretPile:this.drawPile).localToWorld(new THREE.Vector3(0,.34,0));
    const to=this.playerSource(playerId);to.y+=.05;
    const card=this.createStone(null,{back:true,secret});
    await this.flight(card,from,to,{duration:620,delay,arc:1.35,landX:0});
    if(generation!==this.generation){this.effects.remove(card);this.disposeObject(card);return;}
    this.effects.remove(card);this.disposeObject(card);
  }

  async rollDie(value,{hold=1000}={}){
    if(![1,2,3].includes(value))return;
    const generation=this.generation;
    this.dieRolling=true;this.die.visible=true;
    const from=new THREE.Vector3(0,3.8,.3),to=new THREE.Vector3(0,1.02,.05),target=this.dieRotation(value);
    await this.run(980,(eased,raw)=>{
      this.die.position.lerpVectors(from,to,eased);this.die.position.y+=Math.sin(raw*Math.PI)*.54+Math.sin(raw*Math.PI*4)*.12*(1-raw);
      this.die.rotation.set(target.x+(1-eased)*Math.PI*6.5,target.y+(1-eased)*Math.PI*7.2,target.z+(1-eased)*Math.PI*5.4);
    });
    if(generation!==this.generation)return;
    this.die.position.copy(to);this.die.rotation.copy(target);this.pulseCenter(0x76d9d0);await wait(hold);this.die.visible=false;this.dieRolling=false;
  }

  async lifeChange({playerId,amount}){
    if(!amount)return;
    const visual=this.players.get(playerId);if(!visual)return;
    const generation=this.generation;
    const healing=amount>0,color=healing?0x76d9d0:0xff6175;
    this.playCharacterAction(visual,healing?'Use_Item':'Hit_A',{once:true});
    const label=makeSprite(`${healing?'+':''}${amount}`,healing?'#76d9d0':'#ff6175',.92,true);
    const origin=visual.root.localToWorld(new THREE.Vector3(0,1.35,.05));label.position.copy(origin);this.effects.add(label);
    this.burst(origin,color,healing?22:34);
    await this.run(680,(eased,raw)=>{
      label.position.y=origin.y+eased*1.05;label.material.opacity=raw<.72?1:(1-raw)/.28;
      if(healing)visual.root.position.y=visual.base.y+Math.sin(raw*Math.PI)*.16;
      else visual.root.position.x=visual.base.x+Math.sin(raw*Math.PI*8)*(1-raw)*.14;
    });
    if(generation!==this.generation)return;
    visual.root.position.copy(visual.base);this.effects.remove(label);label.material.map.dispose();label.material.dispose();
  }

  moveCamera(position,target,duration){
    const fromPosition=this.camera.position.clone(),fromTarget=this.cameraTarget.clone();
    return this.run(duration,(eased)=>{
      this.camera.position.lerpVectors(fromPosition,position,eased);
      this.cameraTarget.lerpVectors(fromTarget,target,eased);
      this.camera.lookAt(this.cameraTarget);
    });
  }

  async roundOutcome(result){
    const playerId=result?.kind==='empty-rack'?result.winnerIds?.[0]:result?.loserIds?.[0];
    const visual=this.players.get(playerId);
    if(!visual)return;
    const generation=this.generation;
    visual.cinematic=true;visual.root.visible=true;
    visual.root.position.copy(visual.base);visual.root.rotation.set(0,visual.baseRotationY,0);visual.root.scale.setScalar(visual.baseScale);visual.hat.rotation.z=-.09;visual.rack.rotation.z=0;
    const target=visual.base.clone().add(new THREE.Vector3(0,1.15,0));
    const celebrating=result.kind==='empty-rack';
    this.playCharacterAction(visual,celebrating?'Cheering':'Death_A',{once:!celebrating,clamp:!celebrating,lock:true});
    const actorMotion=celebrating
      ? this.run(1380,(eased,raw)=>{
        visual.root.position.y=visual.base.y+Math.abs(Math.sin(raw*Math.PI*3))* .34;
        visual.root.rotation.y=visual.baseRotationY+(visual.model?Math.sin(raw*Math.PI*2)*.12:eased*Math.PI*2);
        visual.root.scale.setScalar(visual.baseScale*(1+Math.sin(raw*Math.PI)*.13));
        visual.hat.rotation.z=-.09+Math.sin(raw*Math.PI*6)*.16;
        visual.rack.rotation.z=Math.sin(raw*Math.PI*4)*.15;
        visual.aura.scale.setScalar(1.15+Math.sin(raw*Math.PI*3)*.22);
        visual.aura.material.opacity=.5+Math.sin(raw*Math.PI)*.35;
      })
      : this.run(1120,(eased,raw)=>{
        const direction=visual.index%2 ? -1:1;
        visual.root.rotation.z=visual.model?0:direction*eased*1.04;
        visual.root.position.y=visual.base.y-(visual.model?0:eased*.27)+Math.sin(raw*Math.PI*3)*(1-raw)*.045;
        visual.root.scale.setScalar(visual.baseScale*(1-eased*(visual.model ? .025 : .1)));
        visual.hat.rotation.z=-.09-direction*eased*.62;
        visual.rack.rotation.z=direction*eased*.28;
        visual.aura.material.opacity=.72*(1-eased);
      });
    if(celebrating)this.burst(target.clone().add(new THREE.Vector3(0,.35,0)),0xf2cb78,64);
    else this.burst(target.clone(),0xff526e,46);
    await actorMotion;
    if(generation!==this.generation)return;
    await wait(500);
    if(generation!==this.generation)return;
    visual.defeatSettled=!celebrating&&visual.life<=0;
    if(celebrating)this.playCharacterAction(visual,'Idle_A');
    visual.cinematic=false;this.applyPlayerPose(visual);
  }

  effectPosition(playerId,height=1.15){
    const visual=this.players.get(playerId);if(!visual)return new THREE.Vector3(0,height,0);
    this.scene.updateMatrixWorld(true);return visual.root.localToWorld(new THREE.Vector3(0,height,0));
  }

  disposeEffect(root){
    const geometries=new Set(),materials=new Set(),textures=new Set();
    root.traverse(object=>{
      if(object.geometry)geometries.add(object.geometry);
      if(object.material){
        const list=Array.isArray(object.material)?object.material:[object.material];
        list.forEach(material=>{materials.add(material);if(material.map&&!material.userData.sharedMap)textures.add(material.map);});
      }
    });
    textures.forEach(texture=>texture.dispose());materials.forEach(material=>material.dispose());geometries.forEach(geometry=>geometry.dispose());
  }

  removeEffect(root){
    this.effects.remove(root);this.disposeEffect(root);
  }

  effectTargets(spell,playerId,lifeChanges=[]){
    const count=this.players.size;
    if(spell===1||spell===2)return [...this.players.keys()].filter(id=>id!==playerId);
    if(spell===5)return [...new Set([(playerId+1)%count,(playerId-1+count)%count])];
    if(spell===6)return [(playerId+1)%count];
    if(spell===7)return [(playerId-1+count)%count];
    const damaged=lifeChanges.filter(change=>change.amount<0).map(change=>change.playerId);
    return damaged;
  }

  async projectile(from,to,color,{duration=620,delay=0,arc=.7,size=.15,impact=24,trail=false}={}){
    const generation=this.generation;
    const root=new THREE.Group();root.position.copy(from);root.visible=delay===0;
    const material=new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:2.6,roughness:.22,transparent:true});
    const orb=new THREE.Mesh(new THREE.SphereGeometry(size,18,12),material);root.add(orb);
    const glowMaterial=this.particleMaterial(THREE.SpriteMaterial,trail?'fire':'magic',{color,opacity:.92,blending:THREE.AdditiveBlending});
    const glow=new THREE.Sprite(glowMaterial);glow.scale.setScalar(size*5.2);root.add(glow);
    const ringMaterial=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.78,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending});
    const ring=new THREE.Mesh(new THREE.TorusGeometry(size*1.55,size*.12,8,28),ringMaterial);ring.rotation.x=Math.PI/2;root.add(ring);
    const trailDirection=new THREE.Vector3().subVectors(to,from).normalize(),trailOrbs=[];
    if(trail)for(let index=1;index<=6;index++){
      const trailMaterial=new THREE.MeshBasicMaterial({color:index%2?color:0xffd36b,transparent:true,opacity:.7-index*.075,depthWrite:false,blending:THREE.AdditiveBlending});
      const trailOrb=new THREE.Mesh(new THREE.SphereGeometry(size*(.72-index*.065),10,7),trailMaterial);trailOrb.position.copy(trailDirection).multiplyScalar(-index*size*.72);root.add(trailOrb);trailOrbs.push(trailOrb);
    }
    const light=new THREE.PointLight(color,8,3.2,2);root.add(light);this.effects.add(root);
    await this.run(duration,(eased,raw)=>{
      root.visible=true;root.position.lerpVectors(from,to,eased);root.position.y+=Math.sin(raw*Math.PI)*arc;
      ring.rotation.z=raw*Math.PI*5;ring.scale.setScalar(.7+Math.sin(raw*Math.PI*4)*.18);glow.material.rotation=raw*Math.PI*2.4;glow.scale.setScalar(size*(4.6+Math.sin(raw*Math.PI*5)*1.2));material.opacity=raw>.86?(1-raw)/.14:1;glow.material.opacity=material.opacity*.92;trailOrbs.forEach((trailOrb,index)=>{trailOrb.scale.setScalar(.72+Math.sin(raw*Math.PI*9+index)*.28);trailOrb.material.opacity=(1-raw*.72)*(.62-index*.065);});
    },{delay,cleanup:()=>this.removeEffect(root)});
    if(generation!==this.generation)return;
    this.pulseAt(to,color,.32,2.5);await this.burst(to,color,impact);
  }

  async lightning(from,to,color=0x89dfff,{delay=0,branches=2}={}){
    const generation=this.generation;
    const root=new THREE.Group();root.visible=delay===0;this.effects.add(root);
    const direction=new THREE.Vector3().subVectors(to,from);
    for(let branch=0;branch<branches;branch++){
      const points=[];
      for(let index=0;index<=12;index++){
        const amount=index/12,point=new THREE.Vector3().lerpVectors(from,to,amount);
        if(index>0&&index<12){const jitter=(1-Math.abs(amount-.5))*2;point.x+=(Math.random()-.5)*.22*jitter;point.y+=(Math.random()-.5)*.14+jitter*.12;point.z+=(Math.random()-.5)*.22*jitter;}
        points.push(point);
      }
      const material=new THREE.LineBasicMaterial({color:branch?0xc6f5ff:color,transparent:true,opacity:branch?.5:1,depthWrite:false,blending:THREE.AdditiveBlending});
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),material);line.userData.length=points.length;root.add(line);
    }
    const light=new THREE.PointLight(color,15,4,2);light.position.copy(to);root.add(light);
    await this.run(580,(eased,raw)=>{
      root.visible=true;root.children.forEach(child=>{if(child.isLine){child.geometry.setDrawRange(0,Math.max(2,Math.ceil(eased*child.userData.length)));child.material.opacity=(1-raw)*(.58+Math.random()*.42);}});light.intensity=(1-raw)*18;
    },{delay,cleanup:()=>this.removeEffect(root)});
    if(generation!==this.generation)return;
    this.pulseAt(to,color,.25,2.1);await this.burst(to,color,30);
  }

  pulseAt(position,color,start=.3,end=2.4){
    const ring=new THREE.Mesh(new THREE.RingGeometry(.34,.42,40),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.82,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
    ring.rotation.x=-Math.PI/2;ring.position.copy(position);ring.position.y=.53;this.effects.add(ring);
    const flareMaterial=this.particleMaterial(THREE.SpriteMaterial,'flare',{color,opacity:.72,blending:THREE.AdditiveBlending});
    const flare=new THREE.Sprite(flareMaterial);flare.position.copy(position);flare.scale.setScalar(.45);this.effects.add(flare);
    this.run(720,(eased,raw)=>{ring.scale.setScalar(start+eased*end);ring.material.opacity=(1-raw)*.82;},{cleanup:()=>{this.effects.remove(ring);ring.geometry.dispose();ring.material.dispose();}});
    this.run(620,(eased,raw)=>{flare.scale.setScalar(.45+eased*1.35);flare.material.rotation=raw*Math.PI;flare.material.opacity=(1-raw)*.72;},{cleanup:()=>{this.effects.remove(flare);flare.material.dispose();}});
  }

  async healingAura(playerId,color=0x76e7b8,{duration=980,bubbles=18}={}){
    const origin=this.effectPosition(playerId,.25),root=new THREE.Group();root.position.copy(origin);this.effects.add(root);
    const ringMaterial=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending});
    const rings=[];
    for(let index=0;index<3;index++){const ring=new THREE.Mesh(new THREE.TorusGeometry(.42+index*.09,.035,8,40),ringMaterial.clone());ring.rotation.x=Math.PI/2;ring.position.y=index*.2;root.add(ring);rings.push(ring);}
    const bubbleData=[];
    for(let index=0;index<bubbles;index++){
      const bubble=new THREE.Sprite(this.particleMaterial(THREE.SpriteMaterial,index%3?'magic':'star',{color,opacity:.82,blending:THREE.AdditiveBlending}));
      const size=.07+Math.random()*.1;bubble.scale.setScalar(size);
      const angle=Math.random()*Math.PI*2,radius=.12+Math.random()*.55;const base=new THREE.Vector3(Math.cos(angle)*radius,Math.random()*.32,Math.sin(angle)*radius);bubble.position.copy(base);root.add(bubble);bubbleData.push({bubble,base,speed:.7+Math.random()*.8});
    }
    const light=new THREE.PointLight(color,8,3,2);light.position.y=.8;root.add(light);
    await this.run(duration,(eased,raw)=>{
      rings.forEach((ring,index)=>{ring.rotation.z=raw*Math.PI*(index%2?3:-3);ring.position.y=index*.18+raw*.9;ring.scale.setScalar(.75+Math.sin(raw*Math.PI)*.55);ring.material.opacity=(1-raw)*.8;});
      bubbleData.forEach(({bubble,base,speed},index)=>{bubble.position.x=base.x+Math.sin(raw*Math.PI*4+index)*.08;bubble.position.z=base.z+Math.cos(raw*Math.PI*3+index)*.08;bubble.position.y=base.y+raw*speed;bubble.material.opacity=1-raw;});
      light.intensity=(1-raw)*10;
    },{cleanup:()=>this.removeEffect(root)});
  }

  createDragon(){
    const root=new THREE.Group();
    const scales=new THREE.MeshStandardMaterial({color:0x9f253d,roughness:.42,metalness:.18,emissive:0x3b0712,emissiveIntensity:1.3,flatShading:true});
    const dark=new THREE.MeshStandardMaterial({color:0x3f1326,roughness:.5,metalness:.14,flatShading:true});
    const gold=new THREE.MeshBasicMaterial({color:0xffd36d});
    const body=new THREE.Mesh(new THREE.SphereGeometry(.62,12,8),scales);body.scale.set(1.55,.62,.72);root.add(body);
    const chest=new THREE.Mesh(new THREE.CylinderGeometry(.27,.42,.72,10),scales);chest.rotation.z=Math.PI/2;chest.position.x=.56;root.add(chest);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.34,10,7),scales);head.scale.set(1.2,.8,.82);head.position.set(1.02,.16,0);root.add(head);
    const snout=new THREE.Mesh(new THREE.ConeGeometry(.22,.46,8),dark);snout.rotation.z=-Math.PI/2;snout.position.set(1.39,.09,0);root.add(snout);
    const tail=new THREE.Mesh(new THREE.ConeGeometry(.3,1.4,9),scales);tail.rotation.z=Math.PI/2;tail.position.set(-1.18,-.05,0);root.add(tail);
    for(const side of [-1,1]){
      const horn=new THREE.Mesh(new THREE.ConeGeometry(.065,.38,7),gold);horn.rotation.z=-Math.PI/2;horn.position.set(1.12,.46,side*.18);root.add(horn);
      const eye=new THREE.Mesh(new THREE.SphereGeometry(.045,8,6),gold);eye.position.set(1.28,.24,side*.27);root.add(eye);
    }
    const wingMaterial=new THREE.MeshStandardMaterial({color:0x641932,emissive:0x280613,emissiveIntensity:.8,roughness:.55,side:THREE.DoubleSide,flatShading:true});
    const makeWing=side=>{
      const vertices=new Float32Array([-.35,.12,side*.08,-.62,.08,side*1.55,.66,.06,side*.62,-.18,.08,side*.08,.66,.06,side*.62,.78,.02,side*1.32]);
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(vertices,3));geometry.computeVertexNormals();
      const wing=new THREE.Mesh(geometry,wingMaterial);wing.userData.side=side;root.add(wing);return wing;
    };
    const wings=[makeWing(-1),makeWing(1)];
    const light=new THREE.PointLight(0xff4e30,14,5,2);light.position.set(.8,.2,0);root.add(light);
    root.scale.setScalar(.78);return {root,wings,light};
  }

  async dragonEffect(action){
    const generation=this.generation,{root,wings,light}=this.createDragon();this.effects.add(root);
    const targets=this.effectTargets(1,action.playerId,action.lifeChanges).map(id=>this.effectPosition(id,1.05));
    const enterFrom=new THREE.Vector3(-7,3.2,-2.4),hoverAt=new THREE.Vector3(-.65,2.7,.35),exitTo=new THREE.Vector3(7,4.2,1.6);
    root.position.copy(enterFrom);
    const flap=(raw,speed=7)=>wings.forEach(wing=>wing.rotation.x=wing.userData.side*Math.sin(raw*Math.PI*speed)*.42);
    await this.run(1180,(eased,raw)=>{root.position.lerpVectors(enterFrom,hoverAt,eased);root.position.y+=Math.sin(raw*Math.PI)*1.05;root.rotation.y=Math.sin(raw*Math.PI)*.16;root.rotation.z=Math.sin(raw*Math.PI*2)*.06;flap(raw);light.intensity=9+Math.sin(raw*Math.PI*8)*4;});
    if(generation!==this.generation){this.removeEffect(root);return;}
    this.pulseCenter(0xff532f);
    const mouth=root.localToWorld(new THREE.Vector3(1.35,.08,0));
    await Promise.all([
      ...targets.map((target,index)=>this.projectile(mouth,target,0xff5a27,{duration:720,delay:index*90,arc:.4,size:.2,impact:42,trail:true})),
      this.run(900,(_,raw)=>{root.position.y=hoverAt.y+Math.sin(raw*Math.PI*3)*.16;root.rotation.y=Math.sin(raw*Math.PI*2)*.12;flap(raw,9);light.intensity=12+Math.sin(raw*Math.PI*10)*5;}),
    ]);
    if(generation!==this.generation){this.removeEffect(root);return;}
    const leaveFrom=root.position.clone();
    await this.run(650,(eased,raw)=>{root.position.lerpVectors(leaveFrom,exitTo,eased);root.position.y+=Math.sin(raw*Math.PI)*.65;root.rotation.z=-eased*.12;flap(raw,6);setOpacity(root,1-raw*.85);},{cleanup:()=>this.removeEffect(root)});
  }

  async shadowEffect(action){
    const from=this.effectPosition(action.playerId,.8),targets=this.effectTargets(2,action.playerId,action.lifeChanges).map(id=>this.effectPosition(id,.85));
    this.pulseAt(from,0x7436b8,.2,2.2);
    await Promise.all(targets.map((target,index)=>this.projectile(from,target,0x6f2ca6,{duration:650,delay:index*70,arc:.35,size:.12,impact:22})));
    await this.healingAura(action.playerId,0x8ce3c5,{duration:760,bubbles:12});
  }

  async dreamEffect(action){
    const origin=this.effectPosition(action.playerId,.3),root=new THREE.Group();root.position.copy(origin);this.effects.add(root);
    const clouds=[];
    for(let index=0;index<9;index++){const cloud=new THREE.Sprite(this.particleMaterial(THREE.SpriteMaterial,'smoke',{color:0xb99aff,opacity:.58,blending:THREE.AdditiveBlending}));const angle=index/9*Math.PI*2,size=.32+Math.random()*.28;cloud.position.set(Math.cos(angle)*(.35+Math.random()*.2),.35+Math.random()*.55,Math.sin(angle)*(.3+Math.random()*.18));cloud.scale.set(size,size*.58,1);root.add(cloud);clouds.push(cloud);}
    const starMaterial=this.particleMaterial(THREE.PointsMaterial,'star',{color:0xffefac,size:.13,opacity:1,alphaTest:.02,blending:THREE.AdditiveBlending});
    const positions=new Float32Array(45);for(let index=0;index<15;index++){const angle=Math.random()*Math.PI*2,radius=.25+Math.random()*.65;positions[index*3]=Math.cos(angle)*radius;positions[index*3+1]=.25+Math.random()*1.25;positions[index*3+2]=Math.sin(angle)*radius;}
    const stars=new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(positions,3)),starMaterial);root.add(stars);
    const light=new THREE.PointLight(0xb99aff,9,3.5,2);light.position.y=.8;root.add(light);
    await this.run(1250,(eased,raw)=>{root.rotation.y=raw*Math.PI*1.5;clouds.forEach((cloud,index)=>{cloud.position.y+=Math.sin(raw*Math.PI*3+index)*.002;cloud.material.opacity=(1-raw*.72)*.58;});stars.rotation.y=-raw*Math.PI*3;stars.position.y=raw*.55;starMaterial.opacity=1-raw;light.intensity=(1-raw)*10;},{cleanup:()=>this.removeEffect(root)});
  }

  async moonEffect(action){
    const generation=this.generation,root=new THREE.Group();root.position.set(0,1.7,.05);this.effects.add(root);
    const moon=new THREE.Mesh(new THREE.TorusGeometry(.31,.075,12,48,Math.PI*1.48),new THREE.MeshStandardMaterial({color:0xb8fff4,emissive:0x3de0d5,emissiveIntensity:2.4,roughness:.22}));moon.rotation.z=-.8;root.add(moon);
    const light=new THREE.PointLight(0x76e9df,10,4,2);root.add(light);
    const from=this.secretPile.localToWorld(new THREE.Vector3(0,.5,0)),to=this.effectPosition(action.playerId,.95);
    await Promise.all([
      this.run(1100,(eased,raw)=>{root.rotation.y=raw*Math.PI*2;root.position.y=1.55+Math.sin(raw*Math.PI)*.7;root.scale.setScalar(.7+Math.sin(raw*Math.PI)*.55);light.intensity=(1-raw*.7)*11;},{cleanup:()=>this.removeEffect(root)}),
      this.projectile(from,to,0x74f1e4,{duration:760,delay:260,arc:1.25,size:.13,impact:18}),
    ]);
    if(generation===this.generation)await this.healingAura(action.playerId,0x67ddd4,{duration:600,bubbles:8});
  }

  async stormEffect(action){
    const from=new THREE.Vector3(0,2.15,.05),targets=this.effectTargets(5,action.playerId,action.lifeChanges).map(id=>this.effectPosition(id,1.05));
    this.pulseCenter(0x88dfff);await Promise.all(targets.map((target,index)=>this.lightning(from,target,0x78caff,{delay:index*100,branches:3})));
  }

  async blizzardEffect(action){
    const generation=this.generation,targetId=this.effectTargets(6,action.playerId,action.lifeChanges)[0];if(targetId===undefined)return;
    const from=new THREE.Vector3(0,1.45,.05),to=this.effectPosition(targetId,1),root=new THREE.Group();this.effects.add(root);
    const count=72,positions=new Float32Array(count*3),phases=[];
    for(let index=0;index<count;index++){positions[index*3]=from.x;positions[index*3+1]=from.y;positions[index*3+2]=from.z;phases.push(Math.random()*Math.PI*2);}
    const material=this.particleMaterial(THREE.PointsMaterial,'star',{color:0xc9f6ff,size:.14,opacity:.95,alphaTest:.02,blending:THREE.AdditiveBlending});
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));const snow=new THREE.Points(geometry,material);root.add(snow);
    await this.run(920,(eased,raw)=>{const attribute=geometry.attributes.position;for(let index=0;index<count;index++){const stagger=index/count*.28,amount=clamp((raw-stagger)/(1-stagger),0,1),phase=phases[index];const point=new THREE.Vector3().lerpVectors(from,to,easeOut(amount));point.x+=Math.sin(phase+amount*Math.PI*5)*.42*(1-amount*.55);point.y+=Math.cos(phase*1.7+amount*Math.PI*6)*.3+Math.sin(amount*Math.PI)*.5;point.z+=Math.cos(phase+amount*Math.PI*4)*.4*(1-amount*.55);attribute.setXYZ(index,point.x,point.y,point.z);}attribute.needsUpdate=true;material.opacity=raw>.78?(1-raw)/.22:1;},{cleanup:()=>this.removeEffect(root)});
    if(generation!==this.generation)return;
    const shardPromises=[];for(let index=0;index<10;index++){const shardTo=to.clone().add(new THREE.Vector3((Math.random()-.5)*.65,Math.random()*.7,(Math.random()-.5)*.65));shardPromises.push(this.projectile(to,shardTo,0xa6eeff,{duration:340,delay:index*28,arc:.16,size:.055,impact:4}));}await Promise.all(shardPromises);
  }

  async fireballEffect(action){
    const targetId=this.effectTargets(7,action.playerId,action.lifeChanges)[0];if(targetId===undefined)return;
    const from=this.effectPosition(action.playerId,1.28),to=this.effectPosition(targetId,1.05);
    this.pulseAt(from,0xff6a2c,.18,1.5);await this.projectile(from,to,0xff4c20,{duration:850,arc:1.05,size:.25,impact:54,trail:true});this.pulseAt(to,0xffb02e,.4,3.2);
  }

  async potionEffect(action){
    const origin=this.effectPosition(action.playerId,.45),root=new THREE.Group();root.position.copy(origin);this.effects.add(root);
    const glass=new THREE.MeshStandardMaterial({color:0xbfffee,transparent:true,opacity:.45,roughness:.08,metalness:.05,depthWrite:false});
    const liquid=new THREE.MeshStandardMaterial({color:0x46e596,emissive:0x1d8c63,emissiveIntensity:2.5,roughness:.25,transparent:true,opacity:.9});
    const bottle=new THREE.Mesh(new THREE.SphereGeometry(.28,18,14),glass);bottle.scale.y=1.15;root.add(bottle);
    const fill=new THREE.Mesh(new THREE.SphereGeometry(.22,16,12),liquid);fill.position.y=-.035;fill.scale.y=.82;root.add(fill);
    const neck=new THREE.Mesh(new THREE.CylinderGeometry(.11,.14,.34,14),glass);neck.position.y=.35;root.add(neck);
    const cork=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,.12,12),new THREE.MeshStandardMaterial({color:0xb98254,roughness:.9}));cork.position.y=.58;root.add(cork);
    const light=new THREE.PointLight(0x55efaa,10,3.5,2);root.add(light);
    await this.run(980,(eased,raw)=>{root.position.y=origin.y+Math.sin(raw*Math.PI)*1.2;root.rotation.y=raw*Math.PI*3;root.rotation.z=Math.sin(raw*Math.PI*2)*.22;root.scale.setScalar(.55+Math.sin(raw*Math.PI)*.65);light.intensity=(1-raw*.55)*12;},{cleanup:()=>this.removeEffect(root)});
    await this.healingAura(action.playerId,0x62efad,{duration:1050,bubbles:24});
  }

  async spellEffect(action){
    if(!action?.success||!Number.isInteger(action.spell))return;
    if(action.spell===1)return this.dragonEffect(action);
    if(action.spell===2)return this.shadowEffect(action);
    if(action.spell===3)return this.dreamEffect(action);
    if(action.spell===4)return this.moonEffect(action);
    if(action.spell===5)return this.stormEffect(action);
    if(action.spell===6)return this.blizzardEffect(action);
    if(action.spell===7)return this.fireballEffect(action);
    if(action.spell===8)return this.potionEffect(action);
  }

  shakePlayer(visual,color){
    const light=new THREE.PointLight(color,10,3,2);light.position.copy(visual.root.position).add(new THREE.Vector3(0,1,0));this.effects.add(light);
    this.run(520,(eased,raw)=>{visual.root.position.x=visual.base.x+Math.sin(raw*Math.PI*9)*(1-raw)*.16;light.intensity=(1-raw)*10;},{cleanup:()=>{visual.root.position.copy(visual.base);this.effects.remove(light);}});
  }

  pulseCenter(color){
    const ring=new THREE.Mesh(new THREE.RingGeometry(.42,.49,48),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.78,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
    ring.rotation.x=-Math.PI/2;ring.position.set(0,.52,.15);this.effects.add(ring);
    this.run(820,(eased,raw)=>{ring.scale.setScalar(.4+eased*3.2);ring.material.opacity=(1-raw)*.78;},{cleanup:()=>{this.effects.remove(ring);ring.geometry.dispose();ring.material.dispose();}});
  }

  burst(position,color,count){
    const points=new Float32Array(count*3),velocities=[];
    for(let index=0;index<count;index++){
      const angle=Math.random()*Math.PI*2,speed=.45+Math.random()*1.15;
      velocities.push(new THREE.Vector3(Math.cos(angle)*speed,.35+Math.random()*1.35,Math.sin(angle)*speed));
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(points,3));
    const material=this.particleMaterial(THREE.PointsMaterial,'spark',{color,size:.18,opacity:.95,alphaTest:.02,blending:THREE.AdditiveBlending});
    const particles=new THREE.Points(geometry,material);particles.position.copy(position);this.effects.add(particles);
    return this.run(760,(eased,raw)=>{
      const attribute=geometry.attributes.position;
      velocities.forEach((velocity,index)=>{attribute.setXYZ(index,velocity.x*eased,velocity.y*eased-eased*eased*.65,velocity.z*eased);});
      attribute.needsUpdate=true;material.opacity=1-raw;
    },{cleanup:()=>{this.effects.remove(particles);geometry.dispose();material.dispose();}});
  }

  clearPlayers(){
    for(const visual of this.players.values()){visual.mixer?.stopAllAction();this.playerLayer.remove(visual.root);this.disposeObject(visual.root);}
    this.players.clear();
  }

  clearGroup(group){
    for(const child of [...group.children]){group.remove(child);this.disposeObject(child);}
  }

  disposeObject(root){
    root.traverse(object=>{
      if(object.userData.disposable&&object.material){const materials=Array.isArray(object.material)?object.material:[object.material];materials.forEach(material=>{if(object.isSprite)material.map?.dispose();material.dispose();});}
    });
  }

  cancelAnimations(){
    this.generation++;
    for(const tween of this.tweens){tween.cleanup?.();tween.resolve();}
    this.tweens.clear();this.clearGroup(this.effects);this.dieRolling=false;this.die.visible=false;this.cinematic=false;
    this.camera.position.copy(this.cameraHome);this.cameraTarget.copy(this.cameraHomeTarget);this.camera.lookAt(this.cameraTarget);
    for(const visual of this.players.values()){visual.cinematic=false;this.applyPlayerPose(visual);}
  }

  resize(){
    const width=Math.max(1,this.host.clientWidth),height=Math.max(1,this.host.clientHeight);
    const mobile=width<620;this.renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1.2:1.65));this.renderer.setSize(width,height,false);this.renderer.shadowMap.enabled=!mobile;
    this.camera.aspect=width/height;this.camera.fov=mobile?43:39;this.cameraHome.set(0,mobile?9.7:8.5,mobile?12.5:10.4);this.cameraHomeTarget.set(0,mobile?1:1.35,mobile?-.15:0);
    if(!this.cinematic){this.camera.position.copy(this.cameraHome);this.cameraTarget.copy(this.cameraHomeTarget);this.camera.lookAt(this.cameraTarget);}
    this.camera.updateProjectionMatrix();
  }

  animate(time){
    const delta=clamp((time-this.lastFrame)/1000,0,.05);this.lastFrame=time;
    for(const tween of [...this.tweens]){
      if(time<tween.start)continue;
      const raw=clamp((time-tween.start)/tween.duration,0,1);tween.update(easeOut(raw),raw);
      if(raw===1){this.tweens.delete(tween);tween.cleanup?.();tween.resolve();}
    }
    const pulse=.82+Math.sin(time*.0024)*.18;this.castPulse.material.opacity=.28+pulse*.18;this.castPulse.scale.setScalar(.92+pulse*.12);
    for(const visual of this.players.values()){
      visual.mixer?.update(delta);
      if(visual.actionUntil&&time>=visual.actionUntil&&!visual.actionLocked){visual.actionUntil=0;this.playCharacterAction(visual,'Idle_A');}
      if(visual.root.userData.active){visual.aura.rotation.z+=delta*.65;visual.hatPulse=(visual.hatPulse||0)+delta;}
      updateCharacterBeam(visual.beam,time);
    }
    if(this.canvas.offsetParent)this.renderer.render(this.scene,this.camera);
    this.frame=requestAnimationFrame(next=>this.animate(next));
  }
}

export function createMagicTable3D(canvas){
  if(!canvas||!window.WebGLRenderingContext)return null;
  try{return new MagicTable3D(canvas);}catch(error){canvas.closest('.magic-table')?.classList.add('webgl-fallback');console.warn('3D magic table unavailable',error);return null;}
}
