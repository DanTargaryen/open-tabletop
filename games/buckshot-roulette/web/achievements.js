import {ACHIEVEMENT_DEFS} from './engine.js';

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let queue=Promise.resolve();

function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

async function present(entries,names){
  const root=document.getElementById('achievementPopup');
  const panel=document.getElementById('achievementPanel');
  if(!root||!panel||!entries?.length)return;
  const actors=[...new Set(entries.map(entry=>entry.actor))];
  const heading=actors.length>1
    ?'双方达成成就'
    :actors[0]==='player'?'成就触发':`${names?.[actors[0]]||'对手'}触发成就`;
  panel.innerHTML=`<div class="achievement-kicker">${escapeHtml(heading)}</div>${entries.map(entry=>{
    const def=ACHIEVEMENT_DEFS[entry.id];
    if(!def)return '';
    return `<section class="achievement-entry"><h2>${escapeHtml(def.name)}</h2><p>${escapeHtml(def.condition)}</p></section>`;
  }).join('')}`;
  root.classList.remove('hidden');
  root.classList.remove('on');
  void root.offsetWidth;
  root.classList.add('on');
  await Promise.race([wait(entries.length>1?4000:3000),new Promise(resolve=>{
    root.onclick=resolve;
  })]);
  root.onclick=null;
  root.classList.remove('on');
  await wait(240);
  root.classList.add('hidden');
}

export function showAchievements(entries,names={player:'你',ai:'对手'}){
  const valid=(entries||[]).filter(entry=>ACHIEVEMENT_DEFS[entry.id]);
  if(!valid.length)return Promise.resolve();
  queue=queue.then(()=>present(valid,names));
  return queue;
}
