const AUDIO_BASE=new URL('./assets/audio/',import.meta.url);
const AUDIO_URL=(dir,file)=>new URL(`${dir}${encodeURIComponent(file)}`,AUDIO_BASE).href;
const BGM_VOL=.42;
const FADE_MS=1800;
const PLAY_WAIT_MS=800;
const PRACTICE_TRACKS=[
  'Before Every Load.wav',
  'General Release.wav',
  'Socket Calibration.wav',
];
const NIGHT_TRACKS=[
  'Surrounded.wav',
  "Twice or it's Luck.wav",
];
const BGM={
  practice:{dir:'practice/',files:PRACTICE_TRACKS},
  night:{dir:'night/',files:NIGHT_TRACKS},
};

let music=null;
let fading=null;
let currentMode=null;
let lastTrack=null;
let enabled=true;
let fadeGen=0;

function nodes(){return [music,fading].filter(Boolean)}

function restart(node){
  if(!node||(node!==music&&node!==fading))return;
  if(!enabled||document.hidden||!currentMode)return;
  try{node.currentTime=0;}catch{/* 部分 wav 在 ended 时已经不能再定位 */}
  node.loop=true;
  void node.play().catch(()=>{});
}

function wireNode(node){
  if(!node||node.dataset.wired)return node;
  node.dataset.wired='1';
  node.loop=true;
  node.preload='auto';
  node.addEventListener('ended',()=>restart(node));
  node.addEventListener('timeupdate',()=>{
    if(node!==music||!enabled||document.hidden)return;
    const duration=node.duration;
    if(!duration||!Number.isFinite(duration)||duration<1)return;
    if(node.currentTime>1&&duration-node.currentTime<0.18)restart(node);
  });
  return node;
}

function ensureMusic(){
  if(music)return music;
  music=wireNode(new Audio());
  music.volume=BGM_VOL;
  document.addEventListener('visibilitychange',()=>{
    if(!currentMode)return;
    for(const node of nodes()){
      if(document.hidden||!enabled)node.pause();
      else void playNode(node);
    }
  });
  return music;
}

function playNode(node){
  if(!node||!enabled||document.hidden)return Promise.resolve();
  node.loop=true;
  return Promise.race([
    node.play().then(()=>{},()=>{}),
    new Promise(resolve=>setTimeout(resolve,PLAY_WAIT_MS)),
  ]);
}

function pickTrack(list,mode){
  if(!list.length)return null;
  if(list.length===1)return list[0];
  const choices=list.filter(name=>`${mode}:${name}`!==lastTrack);
  const pick=(choices.length?choices:list)[Math.floor(Math.random()*(choices.length?choices.length:list.length))];
  lastTrack=`${mode}:${pick}`;
  return pick;
}

async function loadTracks(mode){
  const pack=BGM[mode];
  if(!pack)return [];
  if(Array.isArray(pack.files))return pack.files;
  try{
    const res=await fetch(new URL(`${pack.dir}tracks.json`,AUDIO_BASE),{cache:'no-store'});
    if(!res.ok)return [];
    const list=await res.json();
    return Array.isArray(list)?list.filter(name=>/\.(wav|mp3|ogg)$/i.test(name)):[];
  }catch{
    return [];
  }
}

function fadeVolume(node,to,ms){
  if(!node)return Promise.resolve();
  const from=Number.isFinite(node.volume)?node.volume:0;
  if(!ms){node.volume=to;return Promise.resolve();}
  return new Promise(resolve=>{
    const start=performance.now();
    let settled=false;
    const finish=()=>{
      if(settled)return;
      settled=true;
      try{node.volume=to;}catch{/* 节点可能已被卸掉 */}
      resolve();
    };
    const tick=now=>{
      if(settled)return;
      const progress=Math.min(1,(now-start)/ms);
      try{node.volume=from+(to-from)*progress;}catch{finish();return;}
      if(progress<1)requestAnimationFrame(tick);
      else finish();
    };
    requestAnimationFrame(tick);
    setTimeout(finish,ms+150);
  });
}

function disposeNode(node){
  if(!node)return;
  try{
    node.pause();
    node.removeAttribute('src');
    node.load();
  }catch{/* 卸掉失败也不要卡住换曲 */}
}

export function isBgmEnabled(){return enabled}

export function setBgmEnabled(on){
  enabled=!!on;
  if(!currentMode)return;
  for(const node of nodes()){
    if(enabled&&!document.hidden){
      node.volume=node===music?BGM_VOL:node.volume;
      void playNode(node);
    }else node.pause();
  }
}

async function crossfadeTo(url,mode){
  const gen=++fadeGen;
  ensureMusic();
  const incoming=wireNode(new Audio());
  incoming.volume=0;
  incoming.src=url;
  fading=incoming;
  currentMode=mode;
  void playNode(incoming);
  const outgoing=music;
  music=incoming;
  await Promise.all([
    fadeVolume(incoming,enabled&&!document.hidden?BGM_VOL:0,FADE_MS),
    fadeVolume(outgoing&&outgoing!==incoming?outgoing:null,0,FADE_MS),
  ]);
  if(gen!==fadeGen){
    if(incoming!==music)disposeNode(incoming);
    return;
  }
  if(outgoing&&outgoing!==music)disposeNode(outgoing);
  if(fading===incoming)fading=null;
}

export async function playModeBgm(mode,{fade=false}={}){
  const pack=BGM[mode];
  const file=pickTrack(await loadTracks(mode),mode);
  if(!pack||!file){stopModeBgm();return;}
  const url=AUDIO_URL(pack.dir,file);
  if(fade&&music?.getAttribute('src'))return crossfadeTo(url,mode);
  fadeGen+=1;
  disposeNode(fading);fading=null;
  const node=ensureMusic();
  currentMode=mode;
  node.loop=true;
  node.src=url;
  node.volume=BGM_VOL;
  return playNode(node);
}

export function stopModeBgm(){
  fadeGen+=1;
  currentMode=null;
  disposeNode(fading);fading=null;
  if(!music)return;
  music.pause();
  music.removeAttribute('src');
  music.load();
  music.volume=BGM_VOL;
}
