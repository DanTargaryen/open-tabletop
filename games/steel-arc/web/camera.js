import {WORLD_WIDTH,WORLD_HEIGHT} from './engine.js';

export const CAMERA_CONFIG=Object.freeze({width:1280,height:720,closeZoom:.88,settleDelay:.3,impactHold:.9});
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

export class BattleCamera{
  constructor(){this.reset();}
  reset(){this.x=0;this.y=WORLD_HEIGHT-720/.88;this.zoom=.88;this.turn=null;this.positions=new Map();this.idle=0;this.aim=null;this.flight=false;this.hold=0;}
  update(state,projectiles,dt){
    const actor=state.tanks[state.turn];if(!actor)return this;
    const key=`${state.seed}:${state.turn}:${state.completedTurns}`;
    const previous=this.positions.get(actor.id),moving=previous!==undefined&&Math.abs(previous-actor.x)>.015;
    this.positions.set(actor.id,actor.x);
    const flying=projectiles.filter(p=>p.alive);
    if(this.flight&&!flying.length){this.hold=CAMERA_CONFIG.impactHold;this.flight=false;}
    if(this.hold>0){this.hold=Math.max(0,this.hold-dt);return this;}
    if(key!==this.turn){this.turn=key;this.aim=null;this.idle=CAMERA_CONFIG.settleDelay;}
    let zoom=this.zoom,x=this.x,y=this.y;
    if(flying.length){
      this.flight=true;
      // Keep the aiming frame until a shell approaches its safe screen boundary.
      const p=flying[0],px=p.x+p.vx*.12,py=p.y+p.vy*.12,w=1280/zoom;
      const left=x+w*.14,right=x+w*.86,top=y+140/zoom,bottom=y+550/zoom;
      if(px<left)x-=left-px;else if(px>right)x+=px-right;
      if(py<top)y-=top-py;else if(py>bottom)y+=py-bottom;
    }else{
      this.idle=moving?0:this.idle+dt;
      if(moving||this.idle<CAMERA_CONFIG.settleDelay){
        this.aim=null;zoom=CAMERA_CONFIG.closeZoom;x=actor.x-640/zoom;y=WORLD_HEIGHT-720/zoom;
      }else{
        if(!this.aim){
          const enemies=Object.values(state.tanks).filter(t=>t.hp>0&&t.id!==actor.id&&(!actor.team||t.team!==actor.team));
          const target=enemies.sort((a,b)=>Math.abs(a.x-actor.x)-Math.abs(b.x-actor.x))[0]||actor;
          // Reserve horizontal room for the aim control and vertical room for the HUD.
          zoom=Math.min(.88,820/(Math.abs(actor.x-target.x)+120));
          zoom=Math.max(.32,zoom);x=(actor.x+target.x)/2-735/zoom;
          y=(actor.y+target.y)/2-425/zoom;
          this.aim={zoom,x,y};
        }
        ({zoom,x,y}=this.aim);
      }
    }
    x=clamp(x,-120/zoom,Math.max(-120/zoom,WORLD_WIDTH-1160/zoom));
    const blend=1-Math.exp(-dt*(flying.length?7:4));
    this.zoom+=(zoom-this.zoom)*blend;this.x+=(x-this.x)*blend;this.y+=(y-this.y)*blend;
    return this;
  }
}
