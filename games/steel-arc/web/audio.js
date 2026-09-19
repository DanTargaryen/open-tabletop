import {BACKGROUND_TRACK,WEAPON_AUDIO} from './audio-assets.js';
let context=null,master=null,muted=false,battleActive=false,unlocked=false;
try{muted=localStorage.getItem('steelArcMuted')==='1';}catch{}
const buffers=new Map(),voices=new Set();
const assetUrl=file=>new URL(`./assets/audio/${file}`,import.meta.url).href;
const music=new Audio(assetUrl(BACKGROUND_TRACK));music.loop=true;music.volume=.16;music.preload='none';
function ensure(){
  if(!context){context=new (window.AudioContext||window.webkitAudioContext)();master=context.createGain();master.gain.value=muted?0:1;master.connect(context.destination);}
  return context;
}
function syncMusic(){
  if(unlocked&&battleActive&&!muted&&!document.hidden)music.play().catch(()=>{});else music.pause();
}
function load(file){
  if(!buffers.has(file))buffers.set(file,fetch(assetUrl(file)).then(response=>{if(!response.ok)throw Error('Audio unavailable');return response.arrayBuffer();}).then(bytes=>ensure().decodeAudioData(bytes)).catch(()=>null));
  return buffers.get(file);
}
async function unlock(){
  unlocked=true;
  try{await ensure().resume();for(const spec of Object.values(WEAPON_AUDIO))load(spec.file);syncMusic();}catch{}
}
window.addEventListener('pointerdown',unlock,{passive:true});
window.addEventListener('keydown',unlock);
document.addEventListener('visibilitychange',()=>{syncMusic();if(document.hidden)stopEffects();});
window.addEventListener('pagehide',()=>{music.pause();stopEffects();});
function stopEffects(){for(const voice of voices)try{voice.stop();}catch{}voices.clear();}
async function sample(weapon,impact=false){
  if(muted||document.hidden||!unlocked)return;
  const spec=WEAPON_AUDIO[weapon]||WEAPON_AUDIO.calibration,start=performance.now(),buffer=await load(spec.file);
  if(!buffer||muted||document.hidden||performance.now()-start>400)return;
  if(voices.size>=12){const oldest=voices.values().next().value;oldest.stop();voices.delete(oldest);}
  const ctx=ensure(),source=ctx.createBufferSource(),gain=ctx.createGain();
  source.buffer=buffer;source.playbackRate.value=spec.rate*(impact?.85:1.15);
  const duration=Math.min(buffer.duration/source.playbackRate.value,impact?3.5:1.3),now=ctx.currentTime;
  gain.gain.setValueAtTime(spec.volume*(impact?1:.65),now);gain.gain.setValueAtTime(spec.volume*(impact?1:.65),now+Math.max(0,duration-.12));gain.gain.linearRampToValueAtTime(0,now+duration);
  source.connect(gain).connect(master);voices.add(source);source.onended=()=>{voices.delete(source);source.disconnect();gain.disconnect();};source.start();source.stop(now+duration);
}
function tone({frequency=220,end=80,duration=.15,type='square',gain=.08,delay=0}){
  if(muted)return;const ctx=ensure(),start=ctx.currentTime+delay,osc=ctx.createOscillator(),amp=ctx.createGain();
  osc.type=type;osc.frequency.setValueAtTime(frequency,start);osc.frequency.exponentialRampToValueAtTime(Math.max(20,end),start+duration);
  amp.gain.setValueAtTime(.0001,start);amp.gain.exponentialRampToValueAtTime(gain,start+.008);amp.gain.exponentialRampToValueAtTime(.0001,start+duration);
  osc.connect(amp).connect(master);voices.add(osc);osc.onended=()=>{voices.delete(osc);osc.disconnect();amp.disconnect();};osc.start(start);osc.stop(start+duration+.02);
}
export const audio={
  get muted(){return muted;},
  setBattle(active){battleActive=active;if(!active){stopEffects();music.currentTime=0;}syncMusic();},
  toggle(){muted=!muted;try{localStorage.setItem('steelArcMuted',muted?'1':'0');}catch{}if(master)master.gain.value=muted?0:1;if(muted)stopEffects();syncMusic();if(!muted)tone({frequency:520,end:760,duration:.08,type:'sine',gain:.05});return muted;},
  navigate(){tone({frequency:310,end:350,duration:.045,type:'square',gain:.025});},
  confirm(){tone({frequency:420,end:720,duration:.09,type:'triangle',gain:.05});},
  move(){tone({frequency:66,end:52,duration:.055,type:'sawtooth',gain:.018});},
  fire(weapon='calibration'){sample(weapon);},
  explode(weapon='calibration'){sample(weapon,true);},
  split(){[720,610,520].forEach((f,i)=>tone({frequency:f,end:f*1.25,duration:.09,type:'triangle',gain:.035,delay:i*.035}));},
  drill(){tone({frequency:120,end:42,duration:.22,type:'sawtooth',gain:.07});tone({frequency:310,end:90,duration:.18,type:'square',gain:.025});},
  supplyDrop(){[520,690].forEach((f,i)=>tone({frequency:f,end:f,duration:.09,type:'sine',gain:.04,delay:i*.13}));},
  supplyLand(){tone({frequency:95,end:38,duration:.28,type:'square',gain:.075});},
  pickup(kind){const notes=kind==='health'?[440,554,659]:[523,784,1046];notes.forEach((f,i)=>tone({frequency:f,end:f*1.03,duration:.13,type:'triangle',gain:.04,delay:i*.08}));},
  supplyBreak(){tone({frequency:230,end:38,duration:.25,type:'square',gain:.055});},
  unlock(){[392,523,659].forEach((f,i)=>tone({frequency:f,end:f*1.02,duration:.15,type:'triangle',gain:.04,delay:i*.09}));},
  win(){[392,523,659,784].forEach((f,i)=>tone({frequency:f,end:f*1.01,duration:.18,type:'triangle',gain:.05,delay:i*.12}));},
  lose(){[330,247,196].forEach((f,i)=>tone({frequency:f,end:f*.75,duration:.25,type:'sawtooth',gain:.04,delay:i*.16}));},
};
