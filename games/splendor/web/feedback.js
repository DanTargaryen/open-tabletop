import {artworkPath} from './artwork.js';

const colors={red:'#df6b62',blue:'#389cca',black:'#66728d',pink:'#db82b2',yellow:'#e0b83f',master:'#9674bb'};
const names={red:'红色',blue:'蓝色',black:'黑色',pink:'粉色',yellow:'黄色',master:'大师球'};
const make=(tag,className,text)=>{const node=document.createElement(tag);node.className=className;if(text!==undefined)node.textContent=text;return node;};
const usable=rect=>rect && rect.width>0 && rect.height>0 && rect.right>0 && rect.bottom>0 && rect.left<innerWidth && rect.top<innerHeight;
const point=rect=>({x:rect.left+rect.width/2,y:rect.top+rect.height/2});
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const clips=value=>['auto','scroll','hidden','clip','overlay'].includes(value);
function visibleRect(node) {
  if(!node)return null;
  const rect=node.getBoundingClientRect();if(!usable(rect))return null;
  let left=Math.max(0,rect.left),top=Math.max(0,rect.top),right=Math.min(innerWidth,rect.right),bottom=Math.min(innerHeight,rect.bottom);
  // A card may be within the viewport yet outside an ancestor's scrollport.
  // Keep only the visible portion so even a partially clipped card has a visible anchor.
  for(let parent=node.parentElement;parent;parent=parent.parentElement) {
    const style=getComputedStyle(parent),clipX=clips(style.overflowX),clipY=clips(style.overflowY);
    if(!clipX&&!clipY)continue;
    const box=parent.getBoundingClientRect();
    const sx=parent.offsetWidth?box.width/parent.offsetWidth:1,sy=parent.offsetHeight?box.height/parent.offsetHeight:1;
    const x=box.left+parent.clientLeft*sx,y=box.top+parent.clientTop*sy;
    if(clipX){left=Math.max(left,x);right=Math.min(right,x+parent.clientWidth*sx);}
    if(clipY){top=Math.max(top,y);bottom=Math.min(bottom,y+parent.clientHeight*sy);}
    if(right<=left||bottom<=top)return null;
  }
  return {left,top,right,bottom,width:right-left,height:bottom-top};
}

// Presentation only: never calls the engine or the room API.
export class AcquisitionFeedback {
  constructor({onSound=()=>{}}={}) {
    this.onSound=onSound;this.queue=[];this.seen=new Set();this.animations=new Set();this.waits=new Set();this.highlights=new Map();this.generation=0;this.running=false;this.active=null;
    this.layer=make('div','feedback-layer');this.layer.setAttribute('aria-hidden','true');document.body.append(this.layer);
    this.status=make('div','feedback-sr');this.status.setAttribute('role','status');this.status.setAttribute('aria-live','polite');this.status.setAttribute('aria-atomic','true');document.body.append(this.status);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.reset(false);});
  }
  captureOrigins() {
    const origins=new Map();
    for(const el of document.querySelectorAll('#app button[data-card]')) {
      const rect=visibleRect(el);if(rect)origins.set(el.dataset.card,rect);
    }
    const dialog=document.querySelector('#detail[open]');
    if(dialog?.dataset.selectedCard) {
      const rect=visibleRect(dialog.querySelector('.portrait'));
      if(rect)origins.set(dialog.dataset.selectedCard,rect);
    }
    return origins;
  }
  play(events,{viewer,players,origins=new Map(),replay=false}={}) {
    const fresh=events.filter(event=>replay || !this.seen.has(event.key));
    if(!fresh.length)return;
    for(const event of fresh) {this.seen.add(event.key);if(this.seen.size>160)this.seen.delete(this.seen.values().next().value);}
    if(document.hidden)return;
    // Reconnects can contain several changes; favor the viewer's latest reward.
    const own=fresh.filter(e=>e.seat===viewer),chosen=own.length?own.slice(-1):fresh.slice(-1);
    if(own.length)this.reset(false);
    else this.queue=this.queue.filter(job=>job.seat===job.viewer);
    for(const event of chosen)this.queue.push({...event,viewer,name:players?.find(p=>p.seat===event.seat)?.name||'训练师',origin:origins.get(event.card.id),replay});
    this.queue=this.queue.slice(-4);
    if(!this.running)void this.drain();
  }
  reset(clearSeen=true) {
    this.generation++;this.queue=[];
    for(const animation of this.animations)animation.cancel();this.animations.clear();
    for(const finish of [...this.waits])finish();
    for(const [node,timer] of this.highlights){clearTimeout(timer);node.classList.remove('acquisition-highlight');}this.highlights.clear();
    this.layer.replaceChildren();this.status.textContent='';if(clearSeen)this.seen.clear();
    document.querySelectorAll('.acquisition-highlight').forEach(el=>el.classList.remove('acquisition-highlight'));
  }
  pause(ms) {
    return new Promise(resolve=>{
      const finish=()=>{clearTimeout(timer);this.waits.delete(finish);resolve();};
      const timer=setTimeout(finish,ms);this.waits.add(finish);
    });
  }
  async animate(node,frames,options) {
    if(typeof node.animate!=='function')return;
    const animation=node.animate(frames,options);this.animations.add(animation);
    try{await animation.finished;}catch{}finally{this.animations.delete(animation);animation.cancel();}
  }
  async drain() {
    this.running=true;
    try {
      while(this.queue.length) {
        const event=this.queue.shift(),generation=this.generation;this.active=event;
        try{await this.show(event,generation);}catch{this.layer.replaceChildren();}finally{this.active=null;}
      }
    } finally {this.running=false;}
  }
  rewardText(event) {
    const bonuses=Object.entries(event.bonusChanges||{}).map(([c,n])=>`${names[c]||c}永久加成 ${n>0?'+':''}${n}`);
    if(event.pointsDelta)bonuses.push(`奖杯 ${event.pointsDelta>0?'+':''}${event.pointsDelta}`);
    return bonuses.join(' · ')||'队伍完成一次进化';
  }
  portrait(card) {
    const image=make('img','feedback-portrait');image.src=artworkPath(card);image.alt='';image.draggable=false;return image;
  }
  pulse(event) {
    const targets=[];
    for(const c of Object.keys(event.bonusChanges||{})) {
      const node=document.querySelector(`.player[data-seat="${event.seat}"] [data-resource="${c}"]`);if(node)targets.push(node);
      if(event.seat===event.viewer){const personal=document.querySelector(`.your-team [data-bonus="${c}"]`);if(personal)targets.push(personal);}
    }
    if(event.pointsDelta){const score=document.querySelector(`.player[data-seat="${event.seat}"] .score`);if(score)targets.push(score);}
    const chip=document.querySelector(`.team-list button[data-card="${event.card.id}"]`);if(chip && event.seat===event.viewer)targets.push(chip);
    for(const node of targets){clearTimeout(this.highlights.get(node));node.classList.add('acquisition-highlight');this.highlights.set(node,setTimeout(()=>{node.classList.remove('acquisition-highlight');this.highlights.delete(node);},1250));}
  }
  async show(event,generation) {
    const own=event.seat===event.viewer,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches || innerHeight<460;
    const current=()=>generation===this.generation && !document.hidden;
    if(!current())return;
    const scene=make('div','acquisition-scene');scene.dataset.effect=event.kind;scene.dataset.cardId=event.card.id;scene.dataset.replay=String(event.replay);scene.dataset.phase='reveal';scene.dataset.motion=reduced?'reduced':'full';
    scene.style.setProperty('--reward-color',colors[event.card.bonus]||colors.blue);
    this.layer.append(scene);
    const heading=event.kind==='evolve'?'进化成功！':'捕捉成功！';
    const receipt=make('div','acquisition-receipt');receipt.append(this.portrait(event.card));
    const copy=make('div','acquisition-receipt-copy');copy.append(make('strong','',own?`${event.card.nameZh}加入队伍`:`${event.name}获得${event.card.nameZh}`),make('span','',this.rewardText(event)));receipt.append(copy);scene.append(receipt);
    this.status.textContent=`${event.replay?'动效回放。':''}${own?'':event.name+'，'}${heading}${event.card.nameZh}，${this.rewardText(event)}`;
    try{this.onSound(event.kind,event);}catch{}
    if(reduced) {
      receipt.classList.add('receipt-arrived');scene.dataset.phase='settle';this.pulse(event);
      if(event.replay)copy.prepend(make('small','feedback-replay-label','动效回放'));
      await this.pause(1500);scene.remove();return;
    }
    if(!own) {
      scene.dataset.phase='settle';receipt.classList.add('receipt-arrived');this.pulse(event);
      await this.animate(receipt,[{opacity:0,transform:'translateY(14px)'},{opacity:1,transform:'translateY(0)'}],{duration:220,easing:'ease-out'});
      await this.pause(550);if(current())await this.animate(receipt,[{opacity:1},{opacity:0}],{duration:180});scene.remove();return;
    }
    const cx=innerWidth/2,cy=clamp(innerHeight*.42,160,innerHeight-210),width=140,height=166;
    const source=usable(event.origin)?point(event.origin):{x:cx,y:cy+48};
    const ghost=make('div','acquisition-card');ghost.append(this.portrait(event.card),make('strong','',event.card.nameZh));
    const badge=make('span','acquisition-card-badge',event.kind==='evolve'?'EVOLVED':'CAUGHT');ghost.append(badge);scene.append(ghost);
    const title=make('div','acquisition-title');title.style.left=cx+'px';title.style.top=(cy+height/2+20)+'px';
    title.append(make('small','',event.replay?'动效回放':event.kind==='evolve'?'伙伴变得更强了':'新的伙伴，新的可能'),make('strong','',heading));scene.append(title);
    const rings=make('div','acquisition-rings');rings.style.left=cx+'px';rings.style.top=cy+'px';scene.append(rings);
    for(let i=0;i<2;i++) {
      const ring=make('i','acquisition-ring');rings.append(ring);
      void this.animate(ring,[{opacity:.55,transform:'translate(-50%,-50%) scale(.4)'},{opacity:0,transform:'translate(-50%,-50%) scale(1.8)'}],{duration:650,delay:i*100,easing:'ease-out'});
    }
    for(let i=0;i<10;i++) {
      const particle=make('i','acquisition-spark');const angle=Math.PI*2*i/10,reach=105+(i%3)*15;
      particle.style.left=cx+'px';particle.style.top=cy+'px';scene.append(particle);
      void this.animate(particle,[{opacity:0,transform:'translate(-50%,-50%) scale(.2)'},{opacity:1,offset:.2},{opacity:0,transform:`translate(${Math.cos(angle)*reach}px,${Math.sin(angle)*reach}px) scale(.5) rotate(100deg)`}],{duration:650,delay:50+i*12,easing:'ease-out'});
    }
    const transform=(x,y,scale=1,angle=0)=>`translate(${x-width/2}px,${y-height/2}px) scale(${scale}) rotate(${angle}deg)`;
    ghost.style.transform=transform(cx,cy);
    await this.animate(ghost,[{opacity:0,transform:transform(source.x,source.y,.55,-10)},{opacity:1,transform:transform(cx,cy,1.08,3),offset:.75},{opacity:1,transform:transform(cx,cy)}],{duration:370,easing:'cubic-bezier(.2,.8,.2,1)'});
    if(!current()){scene.remove();return;}
    await this.pause(160);if(!current()){scene.remove();return;}
    scene.dataset.phase='fly';
    const team=document.querySelector(`.team-list button[data-card="${event.card.id}"]`),teamRect=visibleRect(team);
    const destination=teamRect?point(teamRect):point(receipt.getBoundingClientRect());
    const dx=clamp(destination.x,32,innerWidth-32),dy=clamp(destination.y,32,innerHeight-32);
    const bendY=clamp(Math.min(cy,dy)-55,70,innerHeight-90);
    void this.animate(title,[{opacity:1},{opacity:0,transform:'translate(-50%,8px)'}],{duration:240});
    title.style.opacity='0';
    await this.animate(ghost,[{opacity:1,transform:transform(cx,cy)},{opacity:1,transform:transform((cx+dx)/2,bendY,.7,8),offset:.48},{opacity:0,transform:transform(dx,dy,.15,-4)}],{duration:510,easing:'cubic-bezier(.45,0,.2,1)'});
    ghost.remove();title.remove();rings.remove();scene.querySelectorAll('.acquisition-spark').forEach(el=>el.remove());
    if(!current()){scene.remove();return;}
    scene.dataset.phase='settle';receipt.classList.add('receipt-arrived');if(event.replay)copy.prepend(make('small','feedback-replay-label','动效回放'));this.pulse(event);
    await this.animate(receipt,[{opacity:0,transform:'translateY(12px) scale(.97)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:210,easing:'ease-out'});
    await this.pause(700);
    if(current())await this.animate(receipt,[{opacity:1},{opacity:0,transform:'translateY(7px)'}],{duration:220});scene.remove();
  }
}
