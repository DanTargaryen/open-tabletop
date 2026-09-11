const clampScore=score=>Math.min(8,Math.max(0,Number(score)||0));
const wait=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));

function towerMarkup(){
  return '<div class="tower-climb-stage"><div class="tower-roof">✦</div><div class="tower-building"><i></i><i></i><i></i><i></i></div><div class="tower-scale"><span style="--floor:8">8</span><span style="--floor:6">6</span><span style="--floor:4">4</span><span style="--floor:2">2</span><span style="--floor:0">0</span></div><div class="tower-climbers"></div></div><p class="tower-climb-foot">0 分 · 塔底　　率先抵达 8 分 · 塔顶</p>';
}

export function renderTowerProgress(container,{players,fromScores,toScores,animate=true}){
  if(!container)return;
  const key=JSON.stringify({players:players.map(player=>[player.id,player.name,player.color]),fromScores,toScores});
  if(container.dataset.towerKey===key)return;
  container.dataset.towerKey=key;
  container.innerHTML=towerMarkup();
  const climbers=container.querySelector('.tower-climbers');
  const entries=players.map((player,index)=>{
    const climber=document.createElement('div');
    const from=clampScore(fromScores[player.id]??player.score);
    const to=clampScore(toScores[player.id]??player.score);
    climber.className='tower-climber';
    climber.style.left=`${(index+1)/(players.length+1)*100}%`;
    climber.style.setProperty('--score',String(animate?from:to));
    climber.style.setProperty('--climber-color',player.color);
    climber.innerHTML='<b></b><span></span><small></small>';
    climber.querySelector('b').textContent=player.name[0]||'?';
    climber.querySelector('span').textContent=player.name;
    climber.querySelector('small').textContent=`${toScores[player.id]??player.score} 分`;
    climbers.append(climber);
    return {climber,to};
  });
  if(animate)requestAnimationFrame(()=>requestAnimationFrame(()=>entries.forEach(({climber,to})=>climber.style.setProperty('--score',String(to)))));
}

export async function showTowerProgress({players,fromScores,toScores,title,subtitle}){
  document.querySelector('.tower-climb-layer')?.remove();
  const layer=document.createElement('div');
  layer.className='tower-climb-layer';
  layer.setAttribute('role','status');
  layer.setAttribute('aria-live','polite');
  layer.innerHTML='<section class="tower-climb-card"><header class="tower-climb-heading"><p>ARCANE ASCENT</p><h2></h2><span></span></header><div class="tower-standalone"></div></section>';
  layer.querySelector('h2').textContent=title;
  layer.querySelector('.tower-climb-heading span').textContent=subtitle;
  renderTowerProgress(layer.querySelector('.tower-standalone'),{players,fromScores,toScores});
  document.body.append(layer);
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  layer.classList.add('active');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  await wait(reduced?900:2500);
  layer.classList.add('leaving');
  await wait(reduced?0:360);
  layer.remove();
}
