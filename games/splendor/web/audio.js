// Original, synthesized effects only. No music, downloads, game RNG or private cards.
export const SOUND_KEY='open-tabletop.pokemon.sound.v1';
const storageDefault=()=>{try{return globalThis.localStorage;}catch{return null;}};
const rate=(state,seat)=>state.players.find(player=>player.seat===seat);
function summary(state) {
  if(!state)return null;
  return {version:state.version,turn:state.turn,current:state.current,first:state.first,phase:state.phase,
    players:state.players.map(player=>({seat:player.seat,name:player.name,
      tokens:Object.values(player.tokens||{}).reduce((sum,n)=>sum+n,0),reserved:player.reserved.length}))};
}

// A watermark belongs to one accepted snapshot stream. A gap is a resync, never
// a backlog to play. Only public counts are used; reservation identities are not.
export class SplendorSoundEvents {
  constructor(){this.scope=null;this.previous=null;this.initialized=false;this.quietNext=false;this.epoch=0;}
  resync(){this.quietNext=true;}
  observe(state,{scope='solo',viewer=0,silent=false,start=false,acquisitions=[]}={}) {
    const result={immediate:[],acquisitions:[]},next=summary(state);
    if(scope!==this.scope){this.scope=scope;this.previous=null;this.initialized=false;this.epoch++;}
    const before=this.previous,quiet=silent||this.quietNext;
    if(next&&before&&next.version<before.version&&before.phase!=='complete')return result;
    this.quietNext=false;
    this.previous=next;
    const initialized=this.initialized;this.initialized=true;
    if(!next){if(before)this.epoch++;return result;}
    const cue=(kind,seat=viewer,key=kind)=>({kind,seat,viewer,key:`${scope}:${this.epoch}:${next.version}:${key}`});
    if(!before){
      if(!quiet&&start&&next.version===0&&next.phase!=='complete')result.immediate.push(cue('start'));
      return result;
    }
    if(quiet||!initialized||next.version!==before.version+1||next.turn<before.turn||next.first!==before.first||
      next.players.length!==before.players.length||next.players.some((p,i)=>p.seat!==before.players[i].seat||p.name!==before.players[i].name)||before.phase==='complete')return result;
    if(next.phase==='complete'){
      result.immediate.push(cue(state.winners?.includes(viewer)?'win':'end'));
      return result;
    }
    // Capture/evolution sound is deferred to the animation callback, never also
    // emitted from a token payment or a generic turn notification.
    if(acquisitions.length){
      result.acquisitions=acquisitions.map(event=>({...cue(event.kind,event.seat,event.key),eventKey:event.key}));
      return result;
    }
    if(next.current===viewer&&before.current!==viewer){result.immediate.push(cue('turn'));return result;}
    const prior=rate(before,before.current),player=rate(next,before.current);
    if(!prior||!player)return result;
    if(player.reserved>prior.reserved)result.immediate.push(cue('reserve',player.seat));
    else if(before.phase==='return'&&player.tokens<prior.tokens)result.immediate.push(cue('return',player.seat));
    else if(player.tokens>prior.tokens)result.immediate.push(cue('take',player.seat));
    return result;
  }
}

// Frequencies, offsets and envelopes are deliberately short and quiet. The
// action-to-pattern mapping is independent of all game state and randomness.
const PATTERNS={
  take:[[880,0,.10],[1174.66,.065,.12],[1567.98,.13,.14]],
  return:[[1046.5,0,.11],[783.99,.065,.12],[523.25,.13,.14]],
  reserve:[[392,0,.12],[587.33,.09,.15]],
  capture:[[523.25,0,.15],[659.25,.10,.15],[783.99,.20,.23]],
  evolve:[[392,0,.15],[587.33,.10,.15],[783.99,.20,.15],[1174.66,.30,.28]],
  start:[[392,0,.17],[523.25,.13,.23],[659.25,.13,.23]],
  turn:[[783.99,0,.10],[1046.5,.13,.16]],
  win:[[523.25,0,.16],[659.25,.12,.16],[783.99,.24,.16],[1046.5,.36,.30]],
  end:[[523.25,0,.20],[392,.18,.28]],
};
const PRIORITY={take:1,return:1,reserve:1,turn:2,start:3,capture:4,evolve:4,win:5,end:5};

export class SplendorAudio extends EventTarget {
  constructor({storage=storageDefault(),contextFactory=()=>new (globalThis.AudioContext||globalThis.webkitAudioContext)(),
    document=globalThis.document,now=()=>globalThis.performance?.now?.()??Date.now()}={}) {
    super();this.storage=storage;this.contextFactory=contextFactory;this.document=document;this.now=now;
    let saved;try{saved=storage?.getItem(SOUND_KEY);}catch{}
    this.enabled=saved!=='false'&&saved!=='0'&&saved!=='off';
    this.context=null;this.master=null;this.activated=false;this.resuming=null;this.hidden=Boolean(document?.hidden);
    this.generation=0;this.voices=new Set();this.busyUntil=0;this.priority=0;this.played=new Set();this.noise=null;this.disposed=false;
  }
  async unlock() {
    this.activated=true;
    if(!this.enabled||this.hidden||this.disposed)return false;
    try {
      if(!this.context){this.context=this.contextFactory();this.master=this.context.createGain();this.master.gain.value=.16;this.master.connect(this.context.destination);}
      if(this.context.state!=='running'){
        this.resuming??=Promise.resolve(this.context.resume()).catch(()=>{}).finally(()=>{this.resuming=null;});
        await this.resuming;
      }
      // No buffered cues are replayed when resume finishes.
      return this.available();
    } catch{return false;}
  }
  available(){return this.enabled&&!this.hidden&&!this.disposed&&this.context?.state==='running';}
  setEnabled(enabled,{persist=true}={}) {
    this.enabled=Boolean(enabled);
    if(persist)try{this.storage?.setItem(SOUND_KEY,String(this.enabled));}catch{}
    if(!this.enabled)this.stop();
    else if(this.activated)void this.unlock();
    this.dispatchEvent(new Event('change'));
  }
  setHidden(hidden){this.hidden=Boolean(hidden);if(this.hidden)this.stop();}
  stop() {
    this.generation++;this.busyUntil=0;this.priority=0;
    for(const voice of [...this.voices]){
      try{voice.source.stop();}catch{}
      try{voice.source.disconnect();voice.gain.disconnect();}catch{}
    }
    this.voices.clear();
  }
  ticket(cue) {
    // A muted/locked/background event is consumed, not saved until a later click.
    return cue&&this.available()?{...cue,generation:this.generation,created:this.now()}:null;
  }
  playTicket(ticket) {
    if(!ticket||ticket.generation!==this.generation||this.now()-ticket.created>2400)return false;
    return this.play(ticket.kind,{key:ticket.key,quiet:ticket.seat!==ticket.viewer});
  }
  noiseBuffer() {
    if(this.noise)return this.noise;
    const buffer=this.context.createBuffer(1,Math.ceil(this.context.sampleRate*.065),this.context.sampleRate),data=buffer.getChannelData(0);
    let seed=0x51f15e;
    for(let i=0;i<data.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;data[i]=((seed>>>0)/4294967296*2-1)*Math.exp(-i/data.length*5);}
    this.noise=buffer;return buffer;
  }
  voice(source,t,duration,level) {
    const gain=this.context.createGain(),voice={source,gain};this.voices.add(voice);
    source.connect(gain);gain.connect(this.master);
    gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(level,t+.007);
    gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
    source.onended=()=>{this.voices.delete(voice);try{source.disconnect();gain.disconnect();}catch{}};
    source.start(t);source.stop(t+duration+.012);
  }
  play(kind,{key,quiet=false}={}) {
    if(!PATTERNS[kind]||!this.available())return false;
    if(key&&this.played.has(key))return false;
    if(key){this.played.add(key);if(this.played.size>192)this.played.delete(this.played.values().next().value);}
    const now=this.context.currentTime;
    if(now<this.busyUntil){if(PRIORITY[kind]<=this.priority)return false;this.stop();}
    try {
      this.priority=PRIORITY[kind];const volume=quiet?.36:1;
      for(const [frequency,offset,duration] of PATTERNS[kind]){
        const source=this.context.createOscillator();source.type=kind==='reserve'?'triangle':'sine';
        source.frequency.setValueAtTime(frequency,now+offset);
        this.voice(source,now+offset,duration,.13*volume);
      }
      if(['take','return','reserve','capture'].includes(kind)){
        const source=this.context.createBufferSource();source.buffer=this.noiseBuffer();this.voice(source,now,.06,.025*volume);
      }
      this.busyUntil=now+Math.max(...PATTERNS[kind].map(([,offset,duration])=>offset+duration))+.04;
      return true;
    } catch{this.stop();return false;}
  }
  dispose(){this.stop();this.disposed=true;try{void this.context?.close()?.catch(()=>{});}catch{}}
}

export function bindSplendorAudio(audio,button,{document=globalThis.document,window=globalThis.window,onResync=()=>{}}={}) {
  const render=()=>{if(!button)return;button.textContent='音效：'+(audio.enabled?'开':'关');button.setAttribute('aria-pressed',String(audio.enabled));
    button.title=audio.enabled?'关闭音效':'开启音效';button.setAttribute('aria-label',button.title);};
  const unlock=event=>{if(event.isTrusted)void audio.unlock();};
  const toggle=()=>audio.setEnabled(!audio.enabled);
  const visibility=()=>{audio.setHidden(document.hidden);onResync();};
  const leave=()=>{audio.setHidden(true);onResync();};
  const back=event=>{audio.setHidden(document.hidden);if(event.persisted)onResync();};
  const storage=event=>{if(event.key===SOUND_KEY)audio.setEnabled(event.newValue!=='false'&&event.newValue!=='0'&&event.newValue!=='off',{persist:false});};
  for(const type of ['pointerdown','keydown','click'])document?.addEventListener(type,unlock,true);
  document?.addEventListener('visibilitychange',visibility);window?.addEventListener('pagehide',leave);window?.addEventListener('pageshow',back);window?.addEventListener('storage',storage);
  button?.addEventListener('click',toggle);audio.addEventListener('change',render);render();
  return ()=>{for(const type of ['pointerdown','keydown','click'])document?.removeEventListener(type,unlock,true);
    document?.removeEventListener('visibilitychange',visibility);window?.removeEventListener('pagehide',leave);window?.removeEventListener('pageshow',back);window?.removeEventListener('storage',storage);
    button?.removeEventListener('click',toggle);audio.removeEventListener('change',render);audio.dispose();};
}
