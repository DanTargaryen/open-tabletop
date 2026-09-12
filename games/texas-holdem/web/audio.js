// Original short synthesized effects; no network, sampled recordings or game RNG.
export class PokerAudio {
  constructor({createContext=()=>new (globalThis.AudioContext||globalThis.webkitAudioContext)(),isHidden=()=>!!globalThis.document?.hidden}={}){
    this.createContext=createContext;this.isHidden=isHidden;this.enabled=true;this.context=null;this.master=null;
    this.noiseBuffer=null;this.voices=new Set();this.generation=0;this.recent=new Map();this.unlocked=false;
  }
  setEnabled(value){this.enabled=!!value;if(!this.enabled){this.generation++;this.unlocked=false;this.stop();}}
  async unlock(){
    if(!this.enabled||this.isHidden())return false;
    const generation=this.generation;
    try{
      if(!this.context){
        const context=this.createContext();this.context=context;this.master=context.createGain();this.master.gain.value=.30;
        this.master.connect(context.destination);
        this.noiseBuffer=context.createBuffer(1,Math.ceil(context.sampleRate*.3),context.sampleRate);
        const data=this.noiseBuffer.getChannelData(0);let seed=0x7a19d43;
        for(let i=0;i<data.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;data[i]=(seed>>>0)/2147483648-1;}
      }
      if(this.context.state==='suspended')await this.context.resume();
      if(generation!==this.generation)return false;
      this.unlocked=this.context.state==='running'&&this.enabled&&!this.isHidden();return this.unlocked;
    }catch{return false;}
  }
  stop(){
    this.recent.clear();
    for(const voice of [...this.voices])this.release(voice,true);
  }
  visibilityChanged(){
    this.stop();
    if(this.isHidden()){this.generation++;this.unlocked=false;this.context?.suspend?.().catch(()=>{});}
    else if(this.context&&this.enabled)void this.unlock();
  }
  release(voice,stop=false){
    this.voices.delete(voice);voice.source.onended=null;
    if(stop)try{voice.source.stop();}catch{}
    for(const node of voice.nodes)try{node.disconnect();}catch{}
  }
  track(source,nodes){
    while(this.voices.size>=18)this.release(this.voices.values().next().value,true);
    const voice={source,nodes};this.voices.add(voice);source.onended=()=>this.release(voice);return source;
  }
  tone(frequency,at,duration=.12,volume=.14,type='sine',endFrequency=frequency){
    const c=this.context,source=c.createOscillator(),gain=c.createGain();source.type=type;
    source.frequency.setValueAtTime(frequency,at);source.frequency.exponentialRampToValueAtTime(Math.max(20,endFrequency),at+duration);
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(volume,at+.005);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    source.connect(gain);gain.connect(this.master);this.track(source,[source,gain]);source.start(at);source.stop(at+duration+.015);
  }
  noise(at,duration=.065,volume=.20,frequency=2100){
    const c=this.context,source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();
    source.buffer=this.noiseBuffer;filter.type='bandpass';filter.Q.value=.65;
    filter.frequency.setValueAtTime(frequency,at);filter.frequency.exponentialRampToValueAtTime(frequency*.55,at+duration);
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(volume,at+.004);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    source.connect(filter);filter.connect(gain);gain.connect(this.master);this.track(source,[source,filter,gain]);source.start(at);source.stop(at+duration+.01);
  }
  play(kind,{delay=0}={}){
    if(!this.enabled||this.isHidden()||!this.unlocked||this.context?.state!=='running')return false;
    const c=this.context,at=c.currentTime+Math.max(0,Math.min(delay,.6));
    if(at-(this.recent.get(kind)??-Infinity)<.07)return false;this.recent.set(kind,at);
    try{
      switch(kind){
        case 'deal':for(let i=0;i<3;i++)this.noise(at+i*.09,.07,.24,2400-i*160);break;
        case 'reveal':this.noise(at,.06,.22,2800);this.noise(at+.07,.06,.18,1900);break;
        case 'fold':this.noise(at,.09,.16,1050);break;
        case 'check':this.tone(185,at,.06,.17,'sine',105);this.noise(at,.025,.08,550);break;
        case 'chips':case 'raise':case 'all-in':{
          const notes=kind==='chips'?[1150,1790,1370]:kind==='raise'?[1050,1670,1280,2060,1500]:[980,1440,1920,1220,2100,1700,1350];
          notes.forEach((frequency,i)=>this.tone(frequency,at+i*.035,.11,.15-i*.006));
          this.noise(at,.025,.15,1700);if(kind==='all-in')this.tone(115,at+.05,.16,.2,'sine',65);break;
        }
        case 'turn':this.tone(660,at,.12,.12,'triangle');this.tone(880,at+.12,.17,.10,'triangle');break;
        case 'win':[523.25,659.25,783.99,1046.5].forEach((f,i)=>this.tone(f,at+i*.09,.28,.12,'triangle'));break;
        case 'result':this.tone(392,at,.21,.10,'triangle');this.tone(523.25,at+.12,.24,.08,'triangle');break;
        default:return false;
      }
      return true;
    }catch{this.stop();return false;}
  }
}

export function bindPokerAudio(audio,target=globalThis.document){
  if(!target)return ()=>{};
  const unlock=()=>{void audio.unlock();},visibility=()=>audio.visibilityChanged();
  target.addEventListener('pointerdown',unlock,{capture:true});target.addEventListener('keydown',unlock,{capture:true});
  target.addEventListener('visibilitychange',visibility);
  return ()=>{target.removeEventListener('pointerdown',unlock,{capture:true});target.removeEventListener('keydown',unlock,{capture:true});target.removeEventListener('visibilitychange',visibility);audio.stop();};
}
