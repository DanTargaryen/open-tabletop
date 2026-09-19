import {moveTank} from './engine.js';

// Keep unacknowledged frame inputs in order, including direction changes.
export class PredictedMovement{
  constructor(){this.reset();}
  reset(){this.state=null;this.pending=[];this.nextId=0;this.key=null;}
  accept(game,id){
    const key=game?`${game.seed}:${game.completedTurns}:${game.turn}:${id}`:null;
    if(key!==this.key)this.pending=[];
    this.key=key;
    if(!game){this.state=null;return;}
    const {shotHistory,lastShot,...simulation}=game;
    this.state=structuredClone(simulation);
    for(const input of this.pending)moveTank(this.state,id,input.distance);
  }
  record(steps){for(const distance of steps)this.pending.push({id:++this.nextId,distance});}
  batch(){
    const inputs=[];let total=0;
    for(const input of this.pending){if(inputs.length===120||total+Math.abs(input.distance)>28)break;inputs.push(input);total+=Math.abs(input.distance);}
    return inputs;
  }
  acknowledge(batch){const ids=new Set(batch.map(input=>input.id));this.pending=this.pending.filter(input=>!ids.has(input.id));}
}
