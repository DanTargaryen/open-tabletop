export function routeAt(route,progress){
 const t=Math.max(0,Math.min(1,Number.isFinite(progress)?progress:0))*(route.length-1),i=Math.floor(t),a=route[i],b=route[Math.min(i+1,route.length-1)],f=t-i;
 return {x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f};
}
export function animateRoute(element,route,ms,{offsetY=26}={}){
 return new Promise(resolve=>{
  const start=performance.now();let done=false,frameId;
  const paint=p=>element.setAttribute('transform',`translate(${p.x} ${p.y+offsetY})`);
  const finish=()=>{if(done)return;done=true;cancelAnimationFrame(frameId);clearTimeout(fallback);paint(route.at(-1));resolve();};
  // A hidden/throttled tab must never leave the action promise unresolved.
  const fallback=setTimeout(finish,ms+180);
  const frame=now=>{if(done)return;const progress=Math.max(0,Math.min(1,(now-start)/Math.max(1,ms)));paint(routeAt(route,progress));if(progress<1)frameId=requestAnimationFrame(frame);else finish();};
  frameId=requestAnimationFrame(frame);
 });
}
