import * as THREE from '/vendor/three.module.js';
import {GLTFLoader} from '/vendor/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from '/vendor/utils/SkeletonUtils.js';
import {CHARACTERS,characterForKey,characterForSeat,normalizeCharacterKey} from './characters.js';
import {createCharacterBeam,createSeatAccent,updateCharacterBeam} from './seat-accent.js';

const MODEL_URL=name=>new URL(`./assets/3d/${name}`,import.meta.url).href;

function seatLabel(text,color){
  const canvas=document.createElement('canvas');canvas.width=384;canvas.height=96;
  const context=canvas.getContext('2d');context.clearRect(0,0,384,96);context.fillStyle='rgba(8,7,18,.86)';context.beginPath();context.roundRect(8,8,368,80,28);context.fill();context.strokeStyle=color;context.lineWidth=3;context.stroke();
  context.fillStyle='#f6f0fb';context.font='600 27px "Microsoft YaHei", sans-serif';context.textAlign='center';context.textBaseline='middle';context.fillText(text,192,48,340);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false});const sprite=new THREE.Sprite(material);sprite.scale.set(1.42,.355,1);sprite.position.set(0,2.58,0);sprite.renderOrder=8;sprite.userData.labelText=text;return sprite;
}

export function createCharacterPreview(canvas,{selected,onSelect,onBlocked}={}){
  if(!canvas)return null;
  const host=canvas.parentElement;
  const scene=new THREE.Scene();
  scene.fog=new THREE.FogExp2(0x0c0b18,.055);
  const camera=new THREE.PerspectiveCamera(38,1,.1,40);camera.position.set(0,3.15,10.8);camera.lookAt(0,1.15,0);
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.setClearColor(0x080713,0);
  const ambient=new THREE.HemisphereLight(0xc9c2ff,0x25152b,2.15);
  const keyLight=new THREE.DirectionalLight(0xffe0a0,3.5);keyLight.position.set(-3,6,5);keyLight.castShadow=true;
  const portalLight=new THREE.PointLight(0x76d9d0,18,12,2);portalLight.position.set(0,2.4,-1.3);scene.add(ambient,keyLight,portalLight);
  const floor=new THREE.Mesh(new THREE.CircleGeometry(5.2,64),new THREE.MeshStandardMaterial({color:0x211b38,roughness:.72,metalness:.12,transparent:true,opacity:.94}));
  floor.rotation.x=-Math.PI/2;floor.position.y=-.03;floor.receiveShadow=true;scene.add(floor);
  const ritual=new THREE.Mesh(new THREE.RingGeometry(2.8,4.15,64),new THREE.MeshBasicMaterial({color:0x76d9d0,transparent:true,opacity:.12,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}));
  ritual.rotation.x=-Math.PI/2;ritual.position.y=.015;scene.add(ritual);

  const loader=new GLTFLoader(),roots=new Map(),mixers=[];
  const positions=[[-2.85,0,.18],[-1.43,0,-.24],[0,0,-.4],[1.43,0,-.24],[2.85,0,.18]];
  let clips=new Map(),selectedKey=normalizeCharacterKey(selected),playerCount=5,roster=[],selfId=null,frame=0,lastFrame=performance.now(),disposed=false;

  for(const [index,character] of CHARACTERS.entries()){
    const root=new THREE.Group();root.position.set(...positions[index]);root.userData.characterKey=character.key;
    const beam=createCharacterBeam(character.color);root.add(beam);root.userData.beam=beam;
    const ring=new THREE.Mesh(new THREE.RingGeometry(.5,.65,40),new THREE.MeshBasicMaterial({color:character.color,transparent:true,opacity:.22,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}));
    ring.rotation.x=-Math.PI/2;ring.position.y=.025;root.add(ring);root.userData.ring=ring;
    const hitArea=new THREE.Mesh(new THREE.BoxGeometry(1.12,2.75,.86),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));
    hitArea.position.y=1.34;hitArea.userData.characterKey=character.key;hitArea.userData.hitArea=true;root.add(hitArea);
    scene.add(root);roots.set(character.key,root);
  }

  function play(root,name,{once=false}={}){
    const mixer=root?.userData.mixer,clip=clips.get(name);if(!mixer||!clip)return;
    const previous=root.userData.action,action=mixer.clipAction(clip);
    if(previous!==action){previous?.fadeOut(.18);action.reset().fadeIn(.18).play();root.userData.action=action;}else action.reset().play();
    action.setLoop(once?THREE.LoopOnce:THREE.LoopRepeat,once?1:Infinity);action.clampWhenFinished=false;
    if(once)setTimeout(()=>{if(!disposed&&root.userData.action===action)play(root,'Idle_A');},clip.duration*1000);
  }

  function updateMaterialOpacity(root,opacity){
    for(const material of root.userData.modelMaterials||[]){material.transparent=opacity<1;material.opacity=opacity;material.depthWrite=opacity>=1;material.depthTest=true;material.needsUpdate=true;}
  }

  function updateSeats(){
    for(const character of CHARACTERS){
      const root=roots.get(character.key),shown=character.seat<playerCount;
      const occupant=roster.find(member=>member.towerSeat===character.seat);
      const own=occupant?.id===selfId,blocked=Boolean(occupant&&!own);
      root.visible=shown;root.userData.blocked=blocked;root.userData.occupied=Boolean(occupant);
      root.userData.beam.visible=own;
      root.userData.ring.material.opacity=own ? .84 : blocked ? .46 : .2;
      root.userData.ring.scale.setScalar(own?1.24:blocked?1.08:1);
      root.userData.targetZ=own ? .38 : 0;root.userData.targetScale=own?1.09:1;
      updateMaterialOpacity(root,own?1:blocked ? .9 : .62);
      const status=occupant?`${occupant.name}${own?' · 你':occupant.ready?' · 已准备':''}`:'空位 · 点击入席';
      if(root.userData.label?.userData.labelText!==status){
        if(root.userData.label){root.remove(root.userData.label);root.userData.label.material.map.dispose();root.userData.label.material.dispose();}
        root.userData.label=seatLabel(status,own?'#f2cb78':character.color);root.add(root.userData.label);
      }
    }
    const selected=characterForKey(selectedKey);host.dataset.seat=String(selected.seat);
    host.style.setProperty('--selected-character-color',selected.color);
    host.querySelector('[data-seat-name]')?.replaceChildren(document.createTextNode(`当前位于 ${selected.seat+1} 号座`));
  }

  function choose(key,notify=false){
    const next=normalizeCharacterKey(key),root=roots.get(next);if(!root?.visible)return;
    if(root.userData.blocked){if(notify)onBlocked?.('这个座位已经有玩家了。');return;}
    if(next===selectedKey){if(notify)play(root,'Cheering',{once:true});return;}
    selectedKey=next;updateSeats();play(root,'Cheering',{once:true});
    if(notify){const character=characterForKey(next);onSelect?.(character.seat,character);}
  }

  async function loadAssets(){
    try{
      const modelFiles=[...new Set(CHARACTERS.map(character=>character.model))];
      const [general,...models]=await Promise.all([loader.loadAsync(MODEL_URL('animations/general.glb')),...modelFiles.map(file=>loader.loadAsync(MODEL_URL(`characters/${file}`)))]);
      if(disposed)return;
      clips=new Map(general.animations.map(clip=>[clip.name,clip]));
      const modelByFile=new Map(modelFiles.map((file,index)=>[file,models[index].scene]));
      for(const character of CHARACTERS){
        const root=roots.get(character.key),model=cloneSkeleton(modelByFile.get(character.model)),tint=new THREE.Color(character.color),materials=[];
        model.scale.setScalar(.82);model.position.y=-.04;
        model.traverse(object=>{
          if(!object.isMesh)return;
          object.castShadow=true;object.receiveShadow=true;
          const source=Array.isArray(object.material)?object.material:[object.material];
          const cloned=source.map(material=>{const next=material.clone();next.color?.lerp(tint,.38);materials.push(next);return next;});
          object.material=Array.isArray(object.material)?cloned:cloned[0];
        });
        root.add(model,createSeatAccent(character.key));root.userData.model=model;root.userData.modelMaterials=materials;
        const mixer=new THREE.AnimationMixer(model);root.userData.mixer=mixer;mixers.push(mixer);play(root,'Idle_A');
      }
      updateSeats();host.classList.add('loaded');
    }catch(error){console.warn('3D seat preview could not load',error);host.classList.add('preview-fallback');}
  }

  function loadDecoration(name,placements){
    loader.load(MODEL_URL(`dungeon/${name}.gltf`),asset=>{if(!disposed)placements.forEach(({position,rotation=[0,0,0],scale=1})=>{const model=asset.scene.clone(true);model.position.set(...position);model.rotation.set(...rotation);model.scale.setScalar(scale);model.traverse(object=>{if(object.isMesh){object.castShadow=true;object.receiveShadow=true;}});scene.add(model);});},undefined,()=>{});
  }
  loadDecoration('wall_shelves',[{position:[0,-.2,-2.7],scale:.8}]);
  loadDecoration('column',[{position:[-4.4,-.2,-2.4],scale:.82},{position:[4.4,-.2,-2.4],scale:.82}]);
  loadDecoration('torch_lit',[{position:[-3.65,1.35,-2.32],scale:.72},{position:[3.65,1.35,-2.32],scale:.72}]);

  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  function pick(event){
    const bounds=canvas.getBoundingClientRect();if(!bounds.width||!bounds.height)return;
    pointer.set((event.clientX-bounds.left)/bounds.width*2-1,-((event.clientY-bounds.top)/bounds.height)*2+1);raycaster.setFromCamera(pointer,camera);
    const hit=raycaster.intersectObjects([...roots.values()].filter(root=>root.visible),true)[0];let object=hit?.object;
    while(object&&!object.userData.characterKey)object=object.parent;
    if(object?.userData.characterKey)choose(object.userData.characterKey,true);
  }
  canvas.addEventListener('pointerup',pick);

  function resize(){
    const width=Math.max(1,host.clientWidth),height=Math.max(1,host.clientHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,width<620?1.15:1.6));renderer.setSize(width,height,false);
    camera.aspect=width/height;camera.fov=width<620?44:38;camera.position.z=Math.max(9.8,8.8/Math.max(.52,camera.aspect));camera.lookAt(0,1.15,0);camera.updateProjectionMatrix();
  }
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);resize();
  function animate(time){
    if(disposed)return;
    const delta=Math.min(.05,(time-lastFrame)/1000);lastFrame=time;mixers.forEach(mixer=>mixer.update(delta));ritual.rotation.z+=delta*.07;portalLight.intensity=17+Math.sin(time*.0017)*3;
    for(const root of roots.values()){
      root.position.z+=(root.userData.targetZ-root.position.z)*.08;const scale=root.scale.x+(root.userData.targetScale-root.scale.x)*.08;root.scale.setScalar(scale);
      updateCharacterBeam(root.userData.beam,time);
    }
    renderer.render(scene,camera);frame=requestAnimationFrame(animate);
  }

  updateSeats();loadAssets();frame=requestAnimationFrame(animate);
  return {
    get selectedSeat(){return characterForKey(selectedKey).seat;},
    setSeats({count=5,members=[],currentMemberId=null}={}){playerCount=Math.min(5,Math.max(2,Number(count)||5));roster=members;selfId=currentMemberId;const self=roster.find(member=>member.id===selfId);if(self)selectedKey=characterForSeat(self.towerSeat).key;updateSeats();},
    setSelectedSeat:seat=>choose(characterForSeat(seat).key,false),
    destroy(){disposed=true;cancelAnimationFrame(frame);resizeObserver.disconnect();canvas.removeEventListener('pointerup',pick);mixers.forEach(mixer=>mixer.stopAllAction());renderer.dispose();},
  };
}
