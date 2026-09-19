const tracks=new WeakMap();
export function beginTrajectory(state,owner){state.activeTrajectory={owner,paths:[]};}
export function recordTrajectory(state,projectile){
  const active=state.activeTrajectory;if(!active||projectile.owner!==active.owner)return;
  let track=tracks.get(projectile);
  if(!track||track.active!==active){track={active,points:[]};tracks.set(projectile,track);active.paths.push(track.points);}
  const previous=track.points.at(-1);
  if(!previous||Math.hypot(projectile.x-previous.x,projectile.y-previous.y)>=16||!projectile.alive){
    if(track.points.length<512)track.points.push({x:projectile.x,y:projectile.y});
  }
}
export function finishTrajectory(state){
  if(!state.activeTrajectory)return;
  state.lastTrajectories??={};
  state.lastTrajectories[state.activeTrajectory.owner]=state.activeTrajectory.paths;
  delete state.activeTrajectory;
}
