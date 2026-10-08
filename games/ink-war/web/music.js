export class BattleMusic{
  constructor(button){
    this.button=button;this.enabled=true;this.paused=false;
    try{this.enabled=localStorage.getItem('ink-war-music')!=='false';}catch{}
    this.audio=new Audio(new URL('./assets/ink-battle.wav',import.meta.url).href);this.audio.loop=true;this.audio.volume=.24;this.audio.preload='none';
    button.onclick=()=>{this.enabled=!this.enabled;try{localStorage.setItem('ink-war-music',String(this.enabled));}catch{}this.update();};
    this.unlock=()=>this.update();document.addEventListener('pointerdown',this.unlock,{once:true});document.addEventListener('keydown',this.unlock,{once:true});
    document.addEventListener('visibilitychange',()=>this.update());this.label();
  }
  label(){this.button.textContent=`音乐：${this.enabled?'开':'关'}`;this.button.setAttribute('aria-pressed',String(this.enabled));}
  update(){this.label();if(this.enabled&&!this.paused&&!document.hidden)this.audio.play().catch(()=>{});else this.audio.pause();}
  setPaused(value){this.paused=value;this.update();}
}
