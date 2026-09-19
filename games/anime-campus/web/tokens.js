export const SEAT_COLORS=['#459C91','#D27E98','#8583C5','#D49A52'];
const FANS={1:[[0,-20]],2:[[-30,-20],[30,-20]],3:[[-58,-16],[0,-32],[58,-16]],4:[[-87,-14],[-29,-30],[29,-30],[87,-14]]};

// The center of each portrait remains clear when several visitors share a tile.
export function tokenOffset(players,id){
 const player=players.find(p=>p.id===id),group=players.filter(p=>p.pos===player.pos).sort((a,b)=>a.id-b.id),index=group.findIndex(p=>p.id===id);
 const [x,y]=FANS[group.length][index];return {x,y};
}
export function tokenPosition(players,id,point){const p=players.find(p=>p.id===id),base=point(p.pos),offset=tokenOffset(players,id);return {x:base.x+offset.x,y:base.y+offset.y};}

export function drawCharacterTokens(layer,state,{point,characters,avatar,fallback,activeId}){
 layer.replaceChildren();if(!state)return;
 const ns='http://www.w3.org/2000/svg';
 // Paint the current actor last so the active rim stays visible above neighbors.
 const players=[...state.players].sort((a,b)=>Number(a.id===activeId)-Number(b.id===activeId));
 for(const p of players){
  const c=characters.get(p.character),color=SEAT_COLORS[p.id],offset=tokenOffset(state.players,p.id),pos=tokenPosition(state.players,p.id,point),active=state.phase!=='finished'&&p.id===activeId,winner=state.phase==='finished'&&state.winners.includes(p.id),answering=active&&p.id!==state.turn,clip=`playing-portrait-${p.id}`;
  const g=document.createElementNS(ns,'g');g.id=`token-${p.id}`;g.setAttribute('class',`player-token${active?' player-token--active':''}${winner?' player-token--winner':''}`);g.setAttribute('transform',`translate(${pos.x} ${pos.y})`);g.setAttribute('role','img');g.setAttribute('aria-label',`${p.name} · ${c.name} · 第 ${p.pos} 格${active?answering?' · 等待回应':' · 当前行动':''}${winner?' · 已获胜':''}`);g.dataset.character=p.character;g.dataset.position=String(p.pos);
  g.innerHTML=`<line class="token-tether" x1="${-offset.x}" y1="${-offset.y}" x2="0" y2="29" stroke="${color}"/>
   <g class="token-standee">
    <ellipse cx="1" cy="48" rx="27" ry="8" fill="#355143" opacity=".14"/>
    <ellipse cy="42" rx="26" ry="8" fill="${color}"/>
    <ellipse cy="39" rx="24" ry="7" fill="#fff9e7" stroke="${color}" stroke-width="2"/>
    <path d="M-7 24H7L10 39Q0 43-10 39Z" fill="${color}"/>
    ${active?'<circle class="token-halo" r="38" fill="none" stroke="'+color+'" stroke-width="3"/>':''}
    <circle r="32" fill="#FFFEF5" stroke="${color}" stroke-width="4"/>
    <circle r="28.5" fill="#fff9eb"/>
    <clipPath id="${clip}"><circle r="27.5"/></clipPath>
    <image class="token-portrait" x="-29" y="-29" width="58" height="58" clip-path="url(#${clip})" preserveAspectRatio="xMidYMid slice" href="${avatar(p.character)}"/>
    <circle r="28.5" fill="none" stroke="#fffef8" stroke-width="2"/>
    <path d="M-24-20A31 31 0 0 1 14-28" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="2" stroke-linecap="round"/>
    ${active?'<g class="token-actor-tag"><rect x="20" y="-43" width="47" height="21" rx="10.5" fill="'+color+'" stroke="#fffdf4" stroke-width="2"/><text x="43.5" y="-28" text-anchor="middle" font-family="system-ui" font-size="12" font-weight="750" fill="#fff">'+(answering?'回应':'行动')+'</text></g>':''}
    ${winner?'<path d="M-13-41-18-54-6-48 0-59 6-48 18-54 13-41Z" fill="#E5BD62" stroke="#AA8C48" stroke-width="1.5"/>':''}
   </g>`;
  const title=document.createElementNS(ns,'title');title.textContent=g.getAttribute('aria-label');g.prepend(title);
  const image=g.querySelector('image');image.addEventListener('error',()=>image.setAttribute('href',fallback),{once:true});layer.append(g);
 }
}
