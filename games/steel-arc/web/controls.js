import {moveTank,setAim,hasFallingSupply} from './engine.js';

export const CONTROL_CONFIG=Object.freeze({moveSpeed:74,headingSpeed:80,powerSpeed:46,maxFrame:.033});
export function stepTankControls(state,id,keys,dt){
  const steps=[];
  if(state.turn!==id||state.phase!=='aim'||hasFallingSupply(state))return {steps,changed:false};
  dt=Math.min(CONTROL_CONFIG.maxFrame,Math.max(0,dt));
  const tank=state.tanks[id];let changed=false;
  for(const [key,direction] of [['KeyA',-1],['KeyD',1]])if(keys.has(key)){
    const distance=direction*CONTROL_CONFIG.moveSpeed*dt;
    if(moveTank(state,id,distance)){steps.push(distance);changed=true;}
  }
  const angle=Number(keys.has('KeyW'))-Number(keys.has('KeyS'));
  const power=Number(keys.has('KeyE'))-Number(keys.has('KeyQ'));
  if(angle||power){
    const heading=Number.isFinite(tank.heading)?tank.heading:tank.direction===1?tank.angle:180-tank.angle;
    setAim(state,id,{heading:heading+angle*CONTROL_CONFIG.headingSpeed*dt,power:tank.power+power*CONTROL_CONFIG.powerSpeed*dt});changed=true;
  }
  return {steps,changed};
}
