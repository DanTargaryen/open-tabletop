const STORAGE_KEY='abracada.audio.enabled.v1';
const AUDIO_URL=file=>new URL(`./assets/audio/${file}`,import.meta.url).href;
const CLIPS={
  bookClose:'book-close.ogg',
  bookOpen:'book-open.ogg',
  cardDraw:'card-draw.ogg',
  damage:'damage-impact.ogg',
  dice:'dice-roll.ogg',
  dragon:'dragon-growl.mp3',
  fireball:'spell-fireball.ogg',
  heal:'heal-chime.mp3',
  moon:'moon-chime.ogg',
  arcane:'spell-arcane.mp3',
  blast:'spell-blast.mp3',
  shadow:'spell-shadow.mp3',
  shimmer:'spell-shimmer.mp3',
  thunder:'spell-thunder.ogg',
  whisper:'spell-whisper.mp3',
};

function storedEnabled(){
  try{return localStorage.getItem(STORAGE_KEY)!=='false';}
  catch{return true;}
}

class AbracadaAudio extends EventTarget{
  constructor(){
    super();
    this.enabled=storedEnabled();
    this.unlocked=false;
    this.activeSounds=new Set();
    this.pendingSounds=new Set();
    this.preloads=[];
    this.music=new Audio(AUDIO_URL('tower-ambient-loop.ogg'));
    this.music.loop=true;
    this.music.preload='metadata';
    this.music.volume=.1;
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden)this.music.pause();
      else this.startMusic();
    });
  }

  unlock(){
    if(this.unlocked)return this.startMusic();
    this.unlocked=true;
    this.preloads=Object.values(CLIPS).map(file=>{
      const audio=new Audio(AUDIO_URL(file));
      audio.preload='auto';
      audio.load();
      return audio;
    });
    return this.startMusic();
  }

  startMusic(){
    if(!this.enabled||!this.unlocked||document.hidden)return Promise.resolve();
    return this.music.play().catch(()=>{});
  }

  setEnabled(enabled){
    this.enabled=Boolean(enabled);
    try{localStorage.setItem(STORAGE_KEY,String(this.enabled));}catch{}
    if(this.enabled)this.unlock();
    else{
      this.music.pause();
      for(const timeout of this.pendingSounds)clearTimeout(timeout);
      this.pendingSounds.clear();
      for(const audio of this.activeSounds){audio.pause();audio.removeAttribute('src');}
      this.activeSounds.clear();
    }
    this.dispatchEvent(new Event('change'));
  }

  toggle(){this.setEnabled(!this.enabled);}

  play(name,{volume=.5,rate=1,delay=0,duration=0}={}){
    if(!this.enabled||!this.unlocked||!CLIPS[name])return;
    let timeout=null;
    const begin=()=>{
      if(timeout!==null)this.pendingSounds.delete(timeout);
      if(!this.enabled||!this.unlocked)return;
      const audio=new Audio(AUDIO_URL(CLIPS[name]));
      audio.volume=Math.max(0,Math.min(1,volume));
      audio.playbackRate=Math.max(.5,Math.min(2,rate));
      this.activeSounds.add(audio);
      let cutoff=null;
      const cleanup=()=>{
        this.activeSounds.delete(audio);
        if(cutoff!==null){clearTimeout(cutoff);this.pendingSounds.delete(cutoff);cutoff=null;}
      };
      audio.addEventListener('ended',cleanup,{once:true});
      audio.addEventListener('error',cleanup,{once:true});
      audio.play().catch(cleanup);
      if(duration>0){
        cutoff=setTimeout(()=>{audio.pause();cleanup();},duration);
        this.pendingSounds.add(cutoff);
      }
    };
    if(delay<=0){begin();return;}
    timeout=setTimeout(begin,delay);
    this.pendingSounds.add(timeout);
  }

  playBook(open){this.play(open?'bookOpen':'bookClose',{volume:.32});}
  playCast(action){
    if(action?.success)this.play('cardDraw',{volume:.24,rate:1.16});
    else this.playFailure(action?.spell);
  }
  playFailure(spell){
    const rate=.82+Math.max(1,Math.min(8,Number(spell)||1))*.035;
    this.play('bookClose',{volume:.24,rate:.68+rate*.08});
    this.play('whisper',{volume:.16,rate:.58,delay:70,duration:520});
  }
  playSpell(spell){
    if(spell===1){this.play('dragon',{volume:.88});this.play('blast',{volume:.42,rate:.82,delay:430});return;}
    if(spell===2){this.play('shadow',{volume:.62,rate:.8});this.play('whisper',{volume:.22,rate:.68,delay:210});return;}
    if(spell===3){this.play('shimmer',{volume:.58,rate:.82});this.play('heal',{volume:.2,rate:.82,delay:520});return;}
    if(spell===4){this.play('moon',{volume:.36,rate:.9});this.play('arcane',{volume:.14,rate:1.24,delay:180});return;}
    if(spell===5){this.play('thunder',{volume:.7,rate:.94});return;}
    if(spell===6){this.play('whisper',{volume:.58,rate:1.42});this.play('shimmer',{volume:.22,rate:.68,delay:170});return;}
    if(spell===7){this.play('fireball',{volume:.64,rate:.98,duration:1000});return;}
    if(spell===8){this.play('heal',{volume:.2,rate:.92,duration:700});return;}
  }
  playDie(){this.play('dice',{volume:.31,rate:.94});}
  playDraw(count=1){
    const total=Math.min(3,Math.max(0,count));
    for(let index=0;index<total;index++)this.play('cardDraw',{volume:.2,rate:1.03+index*.04,delay:index*90});
  }
  playLifeChanges(changes=[]){
    if(changes.some(change=>change.amount<0))this.play('damage',{volume:.62,rate:.94});
    if(changes.some(change=>change.amount>0))this.play('heal',{volume:.48,rate:1.04});
  }
}

export const gameAudio=new AbracadaAudio();

export function bindAudioControls(buttons=document.querySelectorAll('[data-audio-toggle]')){
  const controls=[...buttons];
  const render=()=>controls.forEach(button=>{
    const muted=!gameAudio.enabled;
    button.classList.toggle('is-muted',muted);
    button.setAttribute('aria-pressed',String(muted));
    button.setAttribute('aria-label',muted?'开启音乐和音效':'关闭音乐和音效');
    button.title=muted?'开启音乐和音效':'关闭音乐和音效';
  });
  controls.forEach(button=>button.addEventListener('click',()=>gameAudio.toggle()));
  gameAudio.addEventListener('change',render);
  const unlock=()=>gameAudio.unlock();
  document.addEventListener('pointerdown',unlock,{capture:true,once:true});
  document.addEventListener('keydown',unlock,{capture:true,once:true});
  render();
}
