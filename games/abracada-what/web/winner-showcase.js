import * as THREE from '/vendor/three.module.js';
import {GLTFLoader} from '/vendor/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from '/vendor/utils/SkeletonUtils.js';
import {characterForKey} from './characters.js';
import {createSeatAccent} from './seat-accent.js';

const MODEL_URL=name=>new URL(`./assets/3d/${name}`,import.meta.url).href;

export function createWinnerShowcase(canvas){
  if(!canvas)return null;
  const stage=canvas.parentElement;
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(34,1,.1,20);camera.position.set(0,1.62,4.25);camera.lookAt(0,1.12,0);
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.setClearColor(0x000000,0);
  const ambient=new THREE.HemisphereLight(0xe8dcff,0x21152c,2.4);
  const keyLight=new THREE.DirectionalLight(0xffd888,4.2);keyLight.position.set(-2.5,5,4);keyLight.castShadow=true;
  const rimLight=new THREE.PointLight(0x76d9d0,16,8,2);rimLight.position.set(2.6,2.2,-1.5);scene.add(ambient,keyLight,rimLight);
  const floor=new THREE.Mesh(new THREE.CircleGeometry(1.45,56),new THREE.MeshStandardMaterial({color:0x211a37,roughness:.58,metalness:.22,transparent:true,opacity:.88}));
  floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
  const ring=new THREE.Mesh(new THREE.RingGeometry(.88,1.12,56),new THREE.MeshBasicMaterial({color:0xf2cb78,transparent:true,opacity:.56,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}));
  ring.rotation.x=-Math.PI/2;ring.position.y=.015;scene.add(ring);
  const loader=new GLTFLoader();
  const modelCache=new Map();
  const animationPromise=loader.loadAsync(MODEL_URL('animations/general.glb'));
  let model=null,mixer=null,celebrationClip=null,currentKey='',generation=0,visible=false,disposed=false,frame=0,lastFrame=performance.now(),celebrationStartedAt=0;

  function cachedModel(character){
    if(!modelCache.has(character.key))modelCache.set(character.key,loader.loadAsync(MODEL_URL(`characters/${character.model}`)));
    return modelCache.get(character.key);
  }

  function startCelebration(){
    if(!model||!mixer||!celebrationClip)return;
    celebrationStartedAt=performance.now();
    mixer.stopAllAction();
    mixer.clipAction(celebrationClip).reset().setLoop(THREE.LoopRepeat,Infinity).fadeIn(.2).play();
  }

  async function show({characterKey,color='#f2cb78'}={}){
    const character=characterForKey(characterKey),wasVisible=visible;visible=true;stage.classList.remove('hidden');ring.material.color.set(color);rimLight.color.set(character.color);
    if(!wasVisible&&currentKey===character.key&&model){startCelebration();return;}
    if(currentKey===character.key&&model)return;
    const request=++generation;currentKey=character.key;
    try{
      const [asset,animations]=await Promise.all([cachedModel(character),animationPromise]);
      if(disposed||request!==generation)return;
      mixer?.stopAllAction();if(model)scene.remove(model);
      model=cloneSkeleton(asset.scene);model.scale.setScalar(.96);model.position.set(0,-.04,0);model.rotation.y=0;
      const tint=new THREE.Color(character.color);
      model.traverse(object=>{if(object.isMesh){object.castShadow=true;object.receiveShadow=true;const materials=Array.isArray(object.material)?object.material:[object.material];const cloned=materials.map(material=>{const next=material.clone();next.color?.lerp(tint,.38);return next;});object.material=Array.isArray(object.material)?cloned:cloned[0];}});model.add(createSeatAccent(character.key));scene.add(model);
      mixer=new THREE.AnimationMixer(model);
      celebrationClip=animations.animations.find(animation=>animation.name==='Cheering')||animations.animations.find(animation=>animation.name==='Idle_A');
      startCelebration();
      stage.classList.add('winner-loaded');
    }catch(error){console.warn('Winner character showcase could not load',error);stage.classList.add('winner-fallback');}
  }

  function hide(){visible=false;generation++;stage.classList.add('hidden');mixer?.stopAllAction();if(model){scene.remove(model);model=null;}mixer=null;celebrationClip=null;currentKey='';}
  function resize(){const width=Math.max(1,stage.clientWidth),height=Math.max(1,stage.clientHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(stage);resize();
  function animate(time){
    if(disposed)return;
    const delta=Math.min(.05,(time-lastFrame)/1000);lastFrame=time;if(visible)mixer?.update(delta);
    if(visible&&model&&celebrationStartedAt){
      const phase=((time-celebrationStartedAt)%1380)/1380*Math.PI*2;
      const hop=(1-Math.cos(phase*3))*.5;
      model.position.y=-.04+hop*.11;model.rotation.y=Math.sin(phase)*.12;model.rotation.z=Math.sin(phase*2)*.025;
      model.scale.setScalar(.96*(1+(1-Math.cos(phase))*.055));
    }
    ring.rotation.z+=delta*.28;ring.material.opacity=.48+Math.sin(time*.0025)*.12;rimLight.intensity=15+Math.sin(time*.0019)*2;
    if(visible)renderer.render(scene,camera);frame=requestAnimationFrame(animate);
  }
  frame=requestAnimationFrame(animate);
  return {show,hide,destroy(){disposed=true;cancelAnimationFrame(frame);resizeObserver.disconnect();mixer?.stopAllAction();renderer.dispose();}};
}
