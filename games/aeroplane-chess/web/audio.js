const KEY='aeroplane.sound.v1';
let muted=false,context,cursor=null;
try{muted=localStorage.getItem(KEY)==='off';}catch{}
export const isMuted=()=>muted;
export function toggleSound(){muted=!muted;try{localStorage.setItem(KEY,muted?'off':'on');}catch{}return muted;}
export function unlockSound(){
  try{if(!context)context=new (window.AudioContext||window.webkitAudioContext)();if(context.state==='suspended')context.resume().catch(()=>{});}catch{}
}
export function resetAudio(s){cursor=s?.eventId??null;}
export function soundEvents(s){
  if(cursor===null){cursor=s.eventId;return;}
  const events=s.events.filter(e=>e.id>cursor);cursor=s.eventId;
  if(muted||document.hidden||!context||context.state!=='running'||!events.length)return;
  const type=events.some(e=>e.type==='win')?'win':events.some(e=>e.type==='finish')?'finish':events.some(e=>e.type==='capture')?'capture':events.some(e=>e.type==='roll')?'roll':'move';
  const notes={roll:[240,330,420],move:[520,660],capture:[300,180],finish:[523,659,784],win:[523,659,784,1047]}[type];
  notes.forEach((frequency,i)=>{const oscillator=context.createOscillator(),gain=context.createGain(),time=context.currentTime+i*.085;oscillator.type='sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(.055,time+.01);gain.gain.exponentialRampToValueAtTime(.001,time+.17);oscillator.connect(gain);gain.connect(context.destination);oscillator.start(time);oscillator.stop(time+.18);});
}
